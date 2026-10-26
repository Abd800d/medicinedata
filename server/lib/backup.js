/*
 * Encrypted backups (AES-256-GCM + scrypt).
 *
 * Container layout (little text header, then raw ciphertext):
 *
 *   "MDA-BACKUP-1\n"                    9-byte magic + version
 *   <4-byte header length, big endian>
 *   <header JSON, UTF-8>                {kdf:'scrypt', n, r, p, salt, iv, tag, created_at, ...}
 *   <ciphertext>                        the SQLite snapshot
 *
 * Why not just a .db file? Because the database contains user e-mails and
 * pharmacy stock. A backup that lands in WhatsApp or Google Drive must be
 * unreadable without the passphrase.
 *
 * Restore never overwrites the live database blindly: it verifies the snapshot,
 * writes a safety copy of the current data, then copies tables inside a single
 * transaction (foreign keys off) — no server restart, no half-restored state.
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import Database from 'better-sqlite3';

const MAGIC = Buffer.from('MDA-BACKUP-1\n', 'utf8');
const KDF = { N: 16384, r: 8, p: 1 };

const b64 = (buf) => Buffer.from(buf).toString('base64');
const unb64 = (s) => Buffer.from(String(s), 'base64');

export const isBackupBuffer = (buf) => Buffer.isBuffer(buf) && buf.length > MAGIC.length && buf.subarray(0, MAGIC.length).equals(MAGIC);

export function readHeader(buf) {
  if (!isBackupBuffer(buf)) throw Object.assign(new Error('not an MDA backup'), { status: 400, publicMessage: 'الملف ليس نسخة احتياطية من MDA' });
  const len = buf.readUInt32BE(MAGIC.length);
  if (!len || len > 65535 || MAGIC.length + 4 + len > buf.length) {
    throw Object.assign(new Error('corrupt header'), { status: 400, publicMessage: 'رأس الملف تالف' });
  }
  const header = JSON.parse(buf.subarray(MAGIC.length + 4, MAGIC.length + 4 + len).toString('utf8'));
  return { header, payload: buf.subarray(MAGIC.length + 4 + len) };
}

function deriveKey(passphrase, salt) {
  return crypto.scryptSync(String(passphrase), salt, 32, { N: KDF.N, r: KDF.r, p: KDF.p, maxmem: 64 * 1024 * 1024 });
}

/** Snapshot the live database with VACUUM INTO (consistent even while writing). */
export function snapshotToTemp(db) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mda-snap-'));
  const file = path.join(dir, 'snapshot.db');
  db.prepare('VACUUM INTO ?').run(file);
  return file;
}

export function encryptFile(filePath, passphrase, meta = {}) {
  const salt = crypto.randomBytes(16);
  const iv = crypto.randomBytes(12);
  const key = deriveKey(passphrase, salt);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const plain = fs.readFileSync(filePath);
  const body = Buffer.concat([cipher.update(plain), cipher.final()]);
  const tag = cipher.getAuthTag();
  const header = {
    format: 'mda-backup', version: 1,
    kdf: 'scrypt', n: KDF.N, r: KDF.r, p: KDF.p,
    salt: b64(salt), iv: b64(iv), tag: b64(tag),
    created_at: new Date().toISOString(),
    plain_bytes: plain.length,
    sha256: crypto.createHash('sha256').update(plain).digest('hex'),
    ...meta,
  };
  const headerBuf = Buffer.from(JSON.stringify(header), 'utf8');
  const size = Buffer.alloc(4);
  size.writeUInt32BE(headerBuf.length, 0);
  return { buffer: Buffer.concat([MAGIC, size, headerBuf, body]), header };
}

export function decryptBuffer(buf, passphrase) {
  const { header, payload } = readHeader(buf);
  if (header.kdf !== 'scrypt') throw Object.assign(new Error('unsupported kdf'), { status: 400, publicMessage: 'نسخة احتياطية بإصدار غير مدعوم' });
  const key = deriveKey(passphrase, unb64(header.salt));
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, unb64(header.iv));
  decipher.setAuthTag(unb64(header.tag));
  let plain;
  try {
    plain = Buffer.concat([decipher.update(payload), decipher.final()]);
  } catch {
    /* GCM authentication failure — wrong passphrase or tampered file. */
    throw Object.assign(new Error('bad passphrase'), { status: 400, publicMessage: 'كلمة المرور غير صحيحة أو الملف تالف' });
  }
  if (header.sha256) {
    const digest = crypto.createHash('sha256').update(plain).digest('hex');
    if (digest !== header.sha256) throw Object.assign(new Error('sha mismatch'), { status: 400, publicMessage: 'الملف تالف (بصمة غير مطابقة)' });
  }
  return { plain, header };
}

/** Summary for the UI: is the file valid, when was it made, how big, encrypted? */
export function inspectBackup(buf) {
  const { header } = readHeader(buf);
  return {
    encrypted: true,
    created_at: header.created_at,
    plain_bytes: header.plain_bytes,
    app_version: header.app_version || null,
    note: header.note || null,
    counts: header.counts || null,
  };
}

/**
 * Restore a decrypted snapshot into the live database.
 * Returns per-table row counts, and the path of the safety copy that was made first.
 */
export function restoreSnapshot(db, plainBuffer, { safetyDir } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mda-restore-'));
  const file = path.join(dir, 'incoming.db');
  fs.writeFileSync(file, plainBuffer);

  const src = new Database(file, { readonly: true, fileMustExist: true });
  try {
    const integrity = src.pragma('integrity_check', { simple: true });
    if (integrity !== 'ok') {
      throw Object.assign(new Error(`integrity_check failed: ${integrity}`), { status: 400, publicMessage: 'قاعدة البيانات داخل النسخة تالفة' });
    }
    /*
     * Only real base tables are copied. FTS5 virtual tables and their shadow
     * tables (drugs_fts_data, products_fts_idx, …) are rebuilt at the end —
     * writing into a shadow table is rejected by SQLite ("may not be modified").
     */
    const srcMeta = src.prepare(`SELECT name, sql FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'`).all();
    const virtual = srcMeta.filter((r) => /^CREATE VIRTUAL TABLE/i.test(String(r.sql || ''))).map((r) => r.name);
    const shadowPrefixes = virtual.map((v) => `${v}_`);
    const isShadow = (name) => shadowPrefixes.some((p) => name.startsWith(p));
    const srcTables = srcMeta.map((r) => r.name).filter((n) => !isShadow(n) && !virtual.includes(n));
    if (!srcTables.includes('users') && !srcTables.includes('products')) {
      throw Object.assign(new Error('not an MDA database'), { status: 400, publicMessage: 'النسخة لا تحتوي جداول MDA المتوقعة' });
    }
    const liveTables = new Set(db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").all().map((r) => r.name));

    /* Safety copy of the current state before touching anything. */
    let safety = null;
    if (safetyDir) {
      fs.mkdirSync(safetyDir, { recursive: true });
      safety = path.join(safetyDir, `pre-restore-${new Date().toISOString().replace(/[:.]/g, '-')}.db`);
      db.prepare('VACUUM INTO ?').run(safety);
    }

    const counts = {};
    const skipped = [];
    const virtualTables = virtual.slice();
    db.pragma('foreign_keys = OFF');
    try {
      db.transaction(() => {
        for (const table of srcTables) {
          if (!liveTables.has(table)) { skipped.push(table); continue; }
          const srcCols = src.prepare(`PRAGMA table_info("${table}")`).all().map((c) => c.name);
          const liveCols = new Set(db.prepare(`PRAGMA table_info("${table}")`).all().map((c) => c.name));
          const shared = srcCols.filter((c) => liveCols.has(c));
          if (!shared.length) { skipped.push(table); continue; }
          const list = src.prepare(`SELECT ${shared.map((c) => `"${c}"`).join(',')} FROM "${table}"`).all();
          db.prepare(`DELETE FROM "${table}"`).run();
          if (list.length) {
            const stmt = db.prepare(`INSERT INTO "${table}"(${shared.map((c) => `"${c}"`).join(',')}) VALUES(${shared.map(() => '?').join(',')})`);
            for (const row of list) stmt.run(shared.map((c) => (row[c] === undefined ? null : row[c])));
          }
          counts[table] = list.length;
        }
      })();
    } finally {
      db.pragma('foreign_keys = ON');
    }

    /* Rebuild the full-text indexes from the restored base tables. */
    for (const vt of virtualTables) {
      try { db.prepare(`INSERT INTO ${vt}(${vt}) VALUES('rebuild')`).run(); } catch { /* older SQLite */ }
    }
    return { counts, skipped: [...skipped, ...virtualTables.map((v) => `${v} (rebuilt)`), ...shadowPrefixes.map((p) => `${p}* (rebuilt)`)], safety_copy: safety };
  } finally {
    src.close();
    try { fs.unlinkSync(file); } catch { /* ignore */ }
    try { fs.rmdirSync(dir); } catch { /* ignore */ }
  }
}

/** Table counts for the backup UI. */
export function databaseSummary(db, dbFile) {
  const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").all().map((r) => r.name);
  const counts = {};
  for (const t of tables) { try { counts[t] = db.prepare(`SELECT COUNT(*) n FROM "${t}"`).get().n; } catch { counts[t] = null; } }
  let bytes = 0;
  try { bytes = fs.statSync(dbFile).size; } catch { /* ignore */ }
  return { counts, bytes, tables: tables.length };
}
