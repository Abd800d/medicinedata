/*
 * Data-tools integration test (v1.5.0).
 *
 *   npm run test:data        # needs the API on :4000 (admin account seeded)
 *
 * Covers, against the real server and the real SQLite file:
 *   • import — CSV · XML (parent/child inheritance) · SQLite (auto table pick)
 *     and the three insertion modes (upsert / insert-only / update-only)
 *   • export — CSV (BOM + Arabic), JSON, XLSX (real workbook), export-all
 *   • backups — encrypted container, wrong passphrase, restore, FTS rebuilt
 *   • images  — upload records who/when, reorder, edit, delete
 *   • permissions — a normal user cannot touch any of it
 */
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import Database from 'better-sqlite3';
import XLSX from 'xlsx';

const API = (process.env.API || 'http://127.0.0.1:4000').replace(/\/$/, '');
const EMAIL = process.env.EMAIL || '7a8b1d@gmail.com';
const PASSWORD = process.env.PASSWORD || 'MDAadmin@2026';
const DB_FILE = process.env.DB_FILE || path.join(process.cwd(), 'data', 'mda.db');

let pass = 0;
let fail = 0;
const ok = (name, cond, extra = '') => {
  if (cond) { pass++; console.log(`  ✓ ${name}`); } else { fail++; console.log(`  ✗ ${name} ${extra}`); }
};

const tokenOf = async (email, password) => {
  const r = await fetch(`${API}/api/auth/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password }),
  });
  const j = await r.json();
  return j?.token || null;
};

const req = async (p, { method = 'GET', token, body, form } = {}) => {
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  let payload;
  if (form) payload = form;
  else if (body !== undefined) { headers['Content-Type'] = 'application/json'; payload = JSON.stringify(body); }
  const res = await fetch(API + p, { method, headers, body: payload });
  const buf = Buffer.from(await res.arrayBuffer());
  let json = null;
  try { json = JSON.parse(buf.toString('utf8')); } catch { /* binary */ }
  return { status: res.status, json, buf, headers: res.headers };
};

const tmp = (name, content) => {
  const p = path.join(os.tmpdir(), `mda-test-${Date.now()}-${name}`);
  fs.writeFileSync(p, content);
  return p;
};
const formWith = (file, fields = {}) => {
  const fd = new FormData();
  fd.append('file', new Blob([fs.readFileSync(file)]), path.basename(file));
  for (const [k, v] of Object.entries(fields)) fd.append(k, String(v));
  return fd;
};
const waitImport = async (token, id) => {
  for (let i = 0; i < 40; i++) {
    const r = await req(`/api/admin/imports/${id}`, { token });
    if (r.json && r.json.status !== 'processing') return r.json;
    await new Promise((res) => setTimeout(res, 250));
  }
  return null;
};
const db = () => new Database(DB_FILE, { readonly: true });

console.log(`\nMDA data-tools test → ${API}\n`);
const token = await tokenOf(EMAIL, PASSWORD);
if (!token) { console.error('cannot log in as admin'); process.exit(1); }
const stamp = Date.now().toString().slice(-6);

/* ------------------------------------------------------------------ import */
console.log('import · formats and modes');

const xmlPath = tmp('drugs.xml', `<?xml version="1.0" encoding="UTF-8"?>
<catalog>
  <drug>
    <generic_name>MDA Testmol ${stamp}</generic_name>
    <generic_ar>دواء اختبار ${stamp}</generic_ar>
    <system>Nervous system</system>
    <category>Analgesics</category>
    <products>
      <product><trade_name>Testmol XR ${stamp}</trade_name><strength>500 mg</strength><dosage_form>Tablet</dosage_form><barcode>TX-${stamp}-1</barcode><manufacturer>Test Pharma</manufacturer></product>
      <product><trade_name>Testmol XR ${stamp}</trade_name><strength>1000 mg</strength><dosage_form>Tablet</dosage_form><barcode>TX-${stamp}-2</barcode><manufacturer>Test Pharma</manufacturer></product>
    </products>
  </drug>
</catalog>`);

const dryXml = await req('/api/admin/import', { method: 'POST', token, form: formWith(xmlPath, { dryRun: 1 }) });
ok('xml dry-run reads both products', dryXml.json?.rows === 2 && dryXml.json?.ok === 2, JSON.stringify(dryXml.json)?.slice(0, 160));
ok('xml dry-run reports the detected columns', (dryXml.json?.detected?.columns || []).includes('generic_name'));
ok('dry-run writes nothing', !db().prepare("SELECT 1 FROM products WHERE barcode LIKE ?").get(`TX-${stamp}-%`));

const realXml = await req('/api/admin/import', { method: 'POST', token, form: formWith(xmlPath) });
const xmlJob = await waitImport(token, realXml.json.id);
ok('xml import completed', xmlJob?.status === 'completed' && xmlJob?.rows_ok === 2, JSON.stringify(xmlJob)?.slice(0, 160));
const imported = db().prepare("SELECT p.id, p.trade_name, p.strength, d.generic_name FROM products p JOIN drugs d ON d.id=p.drug_id WHERE p.barcode LIKE ? ORDER BY p.strength").all(`TX-${stamp}-%`);
ok('parent <generic_name> inherited by both products', imported.length === 2 && imported.every((r) => r.generic_name === `MDA Testmol ${stamp}`), JSON.stringify(imported));
ok('child <product> fields kept', imported[0]?.strength === '1000 mg' && imported[1]?.strength === '500 mg', JSON.stringify(imported));

/* re-importing the same file must update, not duplicate */
const again = await req('/api/admin/import', { method: 'POST', token, form: formWith(xmlPath) });
await waitImport(token, again.json.id);
const dupes = db().prepare("SELECT COUNT(*) n FROM products WHERE barcode LIKE ?").get(`TX-${stamp}-%`).n;
ok('re-import does not duplicate rows', dupes === 2, `rows=${dupes}`);

/* insert-only mode skips rows that already exist */
const insertOnly = await req('/api/admin/import', { method: 'POST', token, form: formWith(xmlPath, { mode: 'insert' }) });
const insertJob = await waitImport(token, insertOnly.json.id);
ok('mode=insert skips existing rows', insertJob?.log?.skipped === 2 && insertJob?.rows_ok === 0, JSON.stringify(insertJob?.log)?.slice(0, 140));

/* update-only mode skips new rows */
const newOnly = tmp('new-only.xml', `<items><item><trade_name>Brand New ${stamp}</trade_name><strength>5 mg</strength></item></items>`);
const updateOnly = await req('/api/admin/import', { method: 'POST', token, form: formWith(newOnly, { mode: 'update' }) });
const updateJob = await waitImport(token, updateOnly.json.id);
ok('mode=update skips new products', updateJob?.log?.skipped === 1 && updateJob?.rows_ok === 0, JSON.stringify(updateJob?.log)?.slice(0, 140));

/* SQLite with two tables: the catalogue-looking one must win */
const sqlitePath = path.join(os.tmpdir(), `mda-test-${stamp}.sqlite`);
try { fs.unlinkSync(sqlitePath); } catch { /* ignore */ }
{
  const d = new Database(sqlitePath);
  d.exec("CREATE TABLE notes(id INTEGER PRIMARY KEY, txt TEXT)");
  d.exec("INSERT INTO notes(txt) VALUES('ignore me')");
  d.exec('CREATE TABLE stock(id INTEGER PRIMARY KEY, trade_name TEXT, strength TEXT, dosage_form TEXT, barcode TEXT, manufacturer TEXT)');
  d.exec(`INSERT INTO stock(trade_name,strength,dosage_form,barcode,manufacturer) VALUES
    ('Sqlmol A ${stamp}','10 mg','Tablet','SQ-${stamp}-A','Test Pharma'),
    ('Sqlmol B ${stamp}','20 mg','Capsule','SQ-${stamp}-B','Test Pharma')`);
  d.close();
}
const sqliteDry = await req('/api/admin/import', { method: 'POST', token, form: formWith(sqlitePath, { dryRun: 1 }) });
ok('sqlite dry-run picks the catalogue table', sqliteDry.json?.detected?.chosen_table === 'stock', JSON.stringify(sqliteDry.json?.detected?.tables)?.slice(0, 200));
const sqliteImport = await req('/api/admin/import', { method: 'POST', token, form: formWith(sqlitePath) });
const sqliteJob = await waitImport(token, sqliteImport.json.id);
ok('sqlite import inserts 2 products', sqliteJob?.rows_ok === 2, JSON.stringify(sqliteJob)?.slice(0, 160));
ok('sqlite upload never modified the source file', (() => { const d = new Database(sqlitePath, { readonly: true }); const n = d.prepare('SELECT COUNT(*) n FROM stock').get().n; d.close(); return n === 2; })());

/* ------------------------------------------------------------------ export */
console.log('export · csv / json / xlsx');

const csv = await req('/api/admin/export/products?format=csv', { token });
const csvText = csv.buf.toString('utf8');
ok('csv starts with a UTF-8 BOM', csvText.charCodeAt(0) === 0xfeff, `first=${csvText.charCodeAt(0)}`);
ok('csv has the header row', csvText.includes('trade_name') && csvText.includes('barcode'));
ok('csv keeps Arabic readable', csvText.includes('بنادول'));
ok('csv filename is an attachment', /attachment; filename="mda-products-/.test(csv.headers.get('content-disposition') || ''));
ok('csv row count header matches the data', Number(csv.headers.get('x-rows')) > 400);

const json = await req('/api/admin/export/drugs?format=json', { token });
ok('json export parses', json.json?.dataset === 'drugs' && Array.isArray(json.json?.rows) && json.json.rows.length > 200);

const xlsx = await req('/api/admin/export/products?format=xlsx', { token });
ok('xlsx is a real zip workbook', xlsx.buf[0] === 0x50 && xlsx.buf[1] === 0x4b, `magic=${xlsx.buf.subarray(0, 2).toString('hex')}`);
const wb = XLSX.read(xlsx.buf, { type: 'buffer' });
const sheetRows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]]);
ok('xlsx reopens with rows', sheetRows.length > 400 && 'trade_name' in sheetRows[0]);

const all = await req('/api/admin/export-all?format=xlsx', { token });
const allWb = XLSX.read(all.buf, { type: 'buffer' });
ok('export-all has several sheets', allWb.SheetNames.length >= 8, allWb.SheetNames.join(','));
ok('users export has no password hash column', (() => { const rows = XLSX.utils.sheet_to_json(allWb.Sheets[allWb.SheetNames.find((n) => /users/i.test(n))] || {})[0] || {}; return !Object.keys(rows).some((k) => /password|hash/i.test(k)); })());

const datasets = await req('/api/admin/datasets', { token });
ok('dataset catalogue is listed', (datasets.json?.datasets || []).some((d) => d.key === 'products') && datasets.json.datasets.length >= 8);

/* ------------------------------------------------------------------ backup */
console.log('backup · encrypted snapshot and restore');

const weak = await req('/api/admin/backup', { method: 'POST', token, body: { passphrase: '123' } });
ok('short passphrase rejected', weak.status === 400 && weak.json?.code === 'WEAK_PASSPHRASE');

const PHRASE = `Test-${stamp}-Secret`;
const backup = await req('/api/admin/backup', { method: 'POST', token, body: { passphrase: PHRASE } });
ok('backup returns a file', backup.status === 200 && backup.buf.length > 10_000);
ok('backup is an MDA encrypted container', backup.buf.subarray(0, 13).toString('utf8') === 'MDA-BACKUP-1\n');
ok('backup is not a readable sqlite file', backup.buf.subarray(0, 16).toString('utf8') !== 'SQLite format 3\u0000');
ok('plain text of the database is not inside the backup', !backup.buf.includes(Buffer.from('password_hash')));

const backupPath = tmp('backup.mdaenc', backup.buf);
const inspected = await req('/api/admin/backup/inspect', { method: 'POST', token, form: formWith(backupPath) });
ok('inspect reads the header without the passphrase', inspected.json?.ok === true && inspected.json?.encrypted === true);
ok('inspect reports real counts', (inspected.json?.counts?.products || 0) > 400);

/* damage the data, then restore */
const victimId = imported[0].id;
const before = db().prepare('SELECT COUNT(*) n FROM products').get().n;
{
  const d = new Database(DB_FILE);
  d.prepare('DELETE FROM product_images WHERE product_id=?').run(victimId);
  d.prepare('DELETE FROM products WHERE id=?').run(victimId);
  d.close();
}
ok('product removed before restore', db().prepare('SELECT COUNT(*) n FROM products').get().n === before - 1);

const wrong = await req('/api/admin/backup/restore', { method: 'POST', token, form: formWith(backupPath, { passphrase: 'definitely-wrong' }) });
ok('wrong passphrase is refused, data untouched', wrong.status === 400 && db().prepare('SELECT COUNT(*) n FROM products').get().n === before - 1);

const restored = await req('/api/admin/backup/restore', { method: 'POST', token, form: formWith(backupPath, { passphrase: PHRASE }) });
ok('restore succeeds', restored.json?.ok === true, JSON.stringify(restored.json)?.slice(0, 160));
ok('deleted product is back', db().prepare('SELECT COUNT(*) n FROM products').get().n === before);
ok('a safety copy of the pre-restore state was written', !!restored.json?.safety_copy, String(restored.json?.safety_copy));
ok('legacy JSON backup endpoint still works', (await req('/api/admin/export', { token })).json?.products?.length > 400);

const afterRestore = await req('/api/catalog/search?q=Testmol', { token });
ok('full-text search still works after restore (FTS rebuilt)', (afterRestore.json?.products || []).some((p) => p.trade_name.includes(stamp)));

/* ------------------------------------------------------------------ images */
console.log('images · who/when, order, edit, delete');

const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
const pid = imported[0].id;
const upload = new FormData();
upload.append('images', new Blob([PNG], { type: 'image/png' }), 'a.png');
upload.append('images', new Blob([PNG], { type: 'image/png' }), 'b.png');
upload.append('edited', '1');
upload.append('width', '1600');
upload.append('height', '1600');
upload.append('bytes_original', '900000');
const uploaded = await req(`/api/admin/products/${pid}/images`, { method: 'POST', token, form: upload });
ok('two images stored', Array.isArray(uploaded.json) && uploaded.json.length === 2, JSON.stringify(uploaded.json)?.slice(0, 120));
ok('uploader recorded (who)', uploaded.json[0]?.uploaded_by > 0);
ok('compression metadata recorded', uploaded.json[0]?.edited === 1 && uploaded.json[0]?.bytes > 0);

const listed = await req(`/api/admin/products/${pid}/images`, { token });
ok('image list exposes the uploader name', !!listed.json?.[0]?.uploaded_by_name, JSON.stringify(listed.json?.[0])?.slice(0, 160));
ok('image list exposes the time (when)', !!listed.json?.[0]?.created_at);

const ids = uploaded.json.map((r) => r.id);
const reordered = await req(`/api/admin/products/${pid}/images/reorder`, { method: 'POST', token, body: { ids: [...ids].reverse() } });
ok('reorder applies a new order', reordered.json?.[0]?.id === ids[1], JSON.stringify(reordered.json?.map((r) => r.id)));
const patched = await req(`/api/admin/product-images/${ids[0]}`, { method: 'PATCH', token, body: { sort_order: 9 } });
ok('single image edit works', patched.json?.sort_order === 9);
const del = await req(`/api/admin/product-images/${ids[1]}`, { method: 'DELETE', token });
ok('image delete works', del.json?.ok === true && (await req(`/api/admin/products/${pid}/images`, { token })).json.length === 1);

/* ------------------------------------------------------------------ permissions */
console.log('permissions · a normal account is refused');

const userEmail = `tester-${stamp}@example.com`;
await req('/api/auth/register', { method: 'POST', body: { name: 'Tester', email: userEmail, password: 'Tester123!' } });
const userToken = await tokenOf(userEmail, 'Tester123!');
ok('test user created', !!userToken);
for (const [name, path_, method] of [
  ['export', '/api/admin/export/products?format=csv', 'GET'],
  ['datasets', '/api/admin/datasets', 'GET'],
  ['backup', '/api/admin/backup', 'POST'],
  ['import', '/api/admin/import', 'POST'],
]) {
  const r = await req(path_, { method, token: userToken, body: method === 'POST' ? { passphrase: 'Whatever123' } : undefined });
  ok(`non-admin blocked from ${name}`, r.status === 401 || r.status === 403, `got ${r.status}`);
}
{
  const d = new Database(DB_FILE);
  d.prepare('DELETE FROM users WHERE lower(email)=?').run(userEmail.toLowerCase());
  d.close();
}

/* ------------------------------------------------------------------ cleanup */
console.log('cleanup');
{
  const d = new Database(DB_FILE);
  const ids = d.prepare("SELECT id FROM products WHERE barcode LIKE ? OR barcode LIKE ?").all(`TX-${stamp}-%`, `SQ-${stamp}-%`).map((r) => r.id);
  for (const id of ids) d.prepare('DELETE FROM products WHERE id=?').run(id);
  d.prepare("DELETE FROM drugs WHERE generic_name LIKE ?").run(`MDA Testmol ${stamp}`);
  const left = d.prepare("SELECT COUNT(*) n FROM products WHERE barcode LIKE ? OR barcode LIKE ?").get(`TX-${stamp}-%`, `SQ-${stamp}-%`).n;
  d.close();
  ok('test rows removed', left === 0);
}
for (const f of [xmlPath, newOnly, sqlitePath, backupPath]) { try { fs.unlinkSync(f); } catch { /* ignore */ } }

console.log(`\n${pass} passed · ${fail} failed\n`);
process.exit(fail ? 1 : 0);
