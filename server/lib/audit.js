/*
 * Append-only audit trail.
 *
 * Each row stores the hash of the previous row plus its own SHA-256 over the canonical
 * payload, so deleting or editing history breaks the chain and is detectable with
 * `verifyChain()`. Nothing here is ever updated or deleted through the API.
 */
import crypto from 'node:crypto';
import { db } from '../db.js';

const GENESIS = 'GENESIS';

const canonical = (row) => JSON.stringify([
  row.actor_id ?? null, row.actor_email ?? null, row.action, row.target_type ?? null,
  row.target_id ?? null, row.meta_json ?? '', row.prev_hash, row.created_at ?? '',
]);

function lastHash() {
  const row = db.prepare('SELECT hash FROM audit_log ORDER BY id DESC LIMIT 1').get();
  return row?.hash || GENESIS;
}

export function audit(action, {
  actor = null, targetType = null, targetId = null, meta = null, ip = null,
} = {}) {
  const prev = lastHash();
  const now = new Date().toISOString().replace('T', ' ').slice(0, 19);
  const payload = {
    actor_id: actor?.id ?? null,
    actor_email: actor?.email ?? null,
    action,
    target_type: targetType,
    target_id: targetId == null ? null : String(targetId),
    meta_json: meta ? JSON.stringify(meta) : '',
    prev_hash: prev,
    created_at: now,
  };
  const hash = crypto.createHash('sha256').update(canonical(payload)).digest('hex');
  db.prepare(`INSERT INTO audit_log(actor_id,actor_email,action,target_type,target_id,meta_json,prev_hash,hash,ip,created_at)
    VALUES(?,?,?,?,?,?,?,?,?,?)`).run(
    payload.actor_id, payload.actor_email, payload.action, payload.target_type,
    payload.target_id, payload.meta_json, prev, hash, ip, now,
  );
  return { hash, at: now };
}

/** Walk the chain and report the first broken link (null = intact). */
export function verifyChain(limit = 5000) {
  const rows = db.prepare('SELECT * FROM audit_log ORDER BY id ASC LIMIT ?').all(limit);
  let prev = GENESIS;
  for (const row of rows) {
    if (row.prev_hash !== prev) return { ok: false, broken_at: row.id, reason: 'previous hash mismatch' };
    const expect = crypto.createHash('sha256').update(canonical({
      actor_id: row.actor_id, actor_email: row.actor_email, action: row.action,
      target_type: row.target_type, target_id: row.target_id, meta_json: row.meta_json,
      prev_hash: row.prev_hash, created_at: row.created_at,
    })).digest('hex');
    if (expect !== row.hash) return { ok: false, broken_at: row.id, reason: 'payload hash mismatch' };
    prev = row.hash;
  }
  return { ok: true, entries: rows.length };
}

/** Record an explicit, versioned consent (never inferred). */
export function recordConsent(userId, kind, version, granted = true) {
  db.prepare('INSERT INTO user_consents(user_id,kind,version,granted) VALUES(?,?,?,?)')
    .run(userId, kind, version, granted ? 1 : 0);
}

export function hasConsent(userId, kind, version) {
  const row = db.prepare(`SELECT granted FROM user_consents WHERE user_id=? AND kind=? AND version=?
    ORDER BY id DESC LIMIT 1`).get(userId, kind, version);
  return row ? Boolean(row.granted) : false;
}

export function latestConsent(userId, kind) {
  const row = db.prepare('SELECT * FROM user_consents WHERE user_id=? AND kind=? ORDER BY id DESC LIMIT 1').get(userId, kind);
  return row || null;
}
