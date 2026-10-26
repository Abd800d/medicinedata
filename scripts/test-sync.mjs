/*
 * Offline-first integration test (v1.4.0).
 *
 *   npm run test:sync          # uses http://127.0.0.1:4000 and the admin account
 *
 * Server side : idempotent replay · client_uuid de-duplication · optimistic conflicts.
 * Client side : the real outbox module (compiled from TypeScript) against a stubbed
 *               localStorage and a scripted transport — no browser needed.
 */
import { execSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const API = (process.env.API || 'http://127.0.0.1:4000').replace(/\/$/, '');
const EMAIL = process.env.EMAIL || '7a8b1d@gmail.com';
const PASSWORD = process.env.PASSWORD || 'MDAadmin@2026';

let pass = 0; let fail = 0;
const ok = (name, cond, extra = '') => { if (cond) { pass++; console.log(`  ✓ ${name}`); } else { fail++; console.log(`  ✗ ${name} ${extra}`); } };

const req = async (p, { method = 'GET', token, body, key } = {}) => {
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  if (key) headers['X-Idempotency-Key'] = key;
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  const res = await fetch(API + p, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  let json = null; try { json = await res.json(); } catch { /* empty */ }
  return { status: res.status, json, headers: res.headers, replay: res.headers.get('X-Idempotent-Replay') };
};

console.log(`\nMDA offline-first test → ${API}\n`);
const login = await req('/api/auth/login', { method: 'POST', body: { email: EMAIL, password: PASSWORD } });
if (!login.json?.token) { console.error('cannot log in'); process.exit(1); }
const token = login.json.token;

/* ---------------- server: idempotency ---------------- */
console.log('server · idempotent writes');
const key = `test-${Date.now()}-${Math.random().toString(36).slice(2)}`;
const uuid = `uuid-${Date.now()}`;
const item = { name: 'صنف اختبار المزامنة', quantity: 3, unit: 'box', buy_price: 100, sell_price: 150, client_uuid: uuid };
const first = await req('/api/pharmacy', { method: 'POST', token, body: item, key });
ok('create returns 201', first.status === 201, `got ${first.status}`);
const second = await req('/api/pharmacy', { method: 'POST', token, body: item, key });
ok('same key replays, no new row', second.status === 201 && second.json?.id === first.json?.id && second.replay === '1', JSON.stringify(second.json)?.slice(0, 120));

console.log('server · client_uuid de-duplication');
const third = await req('/api/pharmacy', { method: 'POST', token, body: item });
ok('same client_uuid without key is deduplicated', third.json?.id === first.json?.id && third.json?.deduplicated === true);

console.log('server · optimistic concurrency');
const id = first.json.id;
const list = await req('/api/pharmacy', { token });
const row = (list.json?.items || []).find((r) => r.id === id);
ok('new row exposes updated_at + version', !!row?.updated_at && Number(row?.version) >= 1, JSON.stringify(row)?.slice(0, 120));
const stale = '2000-01-01 00:00:00';
const conflict = await req(`/api/pharmacy/${id}`, { method: 'PUT', token, body: { name: 'اسم معدل', expected_updated_at: stale } });
ok('stale updated_at → 409 CONFLICT', conflict.status === 409 && conflict.json?.code === 'CONFLICT', `got ${conflict.status}`);
ok('409 returns the server row', !!conflict.json?.server?.updated_at);
const forced = await req(`/api/pharmacy/${id}?force=1`, { method: 'PUT', token, body: { name: 'اسم معدل', expected_updated_at: stale } });
ok('force=1 bypasses the check', forced.status === 200 && forced.json?.name === 'اسم معدل');
ok('version incremented on write', Number(forced.json?.version) > Number(row?.version));
const delConflict = await req(`/api/pharmacy/${id}?expected_updated_at=${encodeURIComponent(stale)}`, { method: 'DELETE', token });
ok('delete with stale version → 409', delConflict.status === 409, `got ${delConflict.status}`);
const del = await req(`/api/pharmacy/${id}?force=1`, { method: 'DELETE', token });
ok('forced delete succeeds', del.status === 200);

/* ---------------- client: outbox module ---------------- */
console.log('client · outbox queue');
const OUT = path.join(HERE, '..', '.smoke', 'queue.mjs');
execSync(`npx esbuild src/lib/offlineQueue.ts --bundle --format=esm --platform=browser --outfile=${OUT} --log-level=error`, { cwd: path.join(HERE, '..'), stdio: 'inherit' });

const store = new Map();
globalThis.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: (k) => store.delete(k),
  clear: () => store.clear(),
};
Object.defineProperty(globalThis, 'navigator', { value: { onLine: true }, configurable: true });
const q = await import(`${OUT}?v=${Math.random()}`);

const a = q.enqueue({ method: 'POST', path: '/api/pharmacy', body: { name: 'أ' }, label: 'إضافة أ' });
const b = q.enqueue({ method: 'PUT', path: '/api/pharmacy/2', body: { name: 'ب' }, label: 'تعديل ب' });
ok('two operations queued with keys', q.readQueue().length === 2 && !!a.idempotencyKey && a.idempotencyKey !== b.idempotencyKey);

let calls = 0;
const res1 = await q.flushQueue(async (op) => {
  calls++;
  if (op.id === a.id) return { status: 201, body: { id: 99 } };
  return { status: 409, body: { code: 'CONFLICT', error: 'تعارض' } };
});
ok('successful op leaves the queue', q.readQueue().find((o) => o.id === a.id) === undefined);
ok('conflict is kept, not retried blindly', q.readQueue().find((o) => o.id === b.id)?.status === 'conflict');
ok('flush result counts', res1.sent === 1 && res1.conflicts === 1, JSON.stringify(res1));

const c = q.enqueue({ method: 'DELETE', path: '/api/pharmacy/3', label: 'حذف ج' });
const res2 = await q.flushQueue(async () => { throw new TypeError('Failed to fetch'); });
ok('transport failure keeps op pending', q.readQueue().find((o) => o.id === c.id)?.status === 'pending');
ok('transport failure stops the flush', res2.stillOffline === true);

const res3 = await q.flushQueue(async (op) => (op.id === c.id ? { status: 200, body: { ok: true } } : { status: 200, body: {} }));
/* the conflict stays until the user chooses — that is the point */
ok('pending work drains on reconnect', q.readQueue().every((o) => o.status === 'conflict'), JSON.stringify(q.readQueue().map((o) => o.status)));
ok('conflict survives until resolved', q.readQueue().length === 1);
ok('sent counter', res3.sent >= 1);
/* user chooses "server version" → op dropped */
q.removeOp(q.readQueue()[0].id);
ok('resolving a conflict clears it', q.readQueue().length === 0);

/* 4xx is a real answer: never queued forever */
const d = q.enqueue({ method: 'POST', path: '/api/x', label: 'طلب مرفوض' });
await q.flushQueue(async () => ({ status: 403, body: { error: 'ممنوع' } }));
ok('4xx marked failed, not pending', q.readQueue().find((o) => o.id === d.id)?.status === 'failed');
q.removeOp(d.id);
ok('discard works', q.readQueue().length === 0);

console.log(`\n${pass} passed · ${fail} failed\n`);
process.exit(fail ? 1 : 0);
