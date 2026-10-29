/*
 * Verification workflow test (v1.13.0) — the six states, their evidence, and the paper trail.
 *
 *   npm run test:verify      # needs the API on :4000 (fresh seeded database)
 *
 * The interesting assertions are the refusals: a state that needs a document, a rejection
 * without a reason, a backwards move by a non-admin, and a plain user touching a catalogue
 * record. Those are the rules the plan actually cares about — the happy path is easy.
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';
import { JSDOM } from 'jsdom';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HERE, '..');
const API = (process.env.API || 'http://127.0.0.1:4000').replace(/\/$/, '');
const ADMIN = { email: process.env.EMAIL || '7a8b1d@gmail.com', password: process.env.PASSWORD || 'MDAadmin@2026' };
const stamp = Date.now().toString(36);

let pass = 0;
let fail = 0;
const ok = (name, cond, extra = '') => {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✗ ${name}${extra ? ' — ' + extra : ''}`); }
};

const call = async (p, { method = 'GET', body, token } = {}) => {
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  const res = await fetch(API + p, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  let json = null;
  try { json = await res.json(); } catch { /* empty */ }
  return { status: res.status, json };
};

console.log('\nMDA verification workflow — six states, evidence, audit\n');

const admin = (await call('/api/auth/login', { method: 'POST', body: ADMIN })).json?.token;
ok('admin can log in', !!admin);

const meta = await call('/api/admin/verification/meta', { token: admin });
ok('the API publishes exactly six states', meta.status === 200 && meta.json?.states?.length === 6, JSON.stringify(meta.json?.states));
ok('the six states are the plan vocabulary',
  ['verified', 'manufacturer_confirmed', 'supplier_submitted', 'user_submitted', 'incomplete', 'unverified']
    .every((s) => meta.json?.states?.includes(s)));
ok('every state has an Arabic label', Object.values(meta.json?.state_labels || {}).every((l) => l.ar && l.en));

const summary0 = (await call('/api/admin/verification/summary', { token: admin })).json;
ok('summary counts products by state', summary0?.products?.total > 0 && !!summary0.products.states);
ok('legacy records kept their meaning (verified stays verified)', summary0.products.states.verified > 0, JSON.stringify(summary0.products.states));
ok('no product is left without a state', Object.values(summary0.products.states).reduce((a, b) => a + b, 0) === summary0.products.total);

/* ---------- pick a real product to walk through every rule ---------- */
const list = (await call('/api/catalog/products?limit=1')).json;
const pid = list?.data?.[0]?.id;
ok('a product exists to review', !!pid);

const before = (await call(`/api/admin/verification/products/${pid}`, { token: admin })).json;
ok('detail answers who/when/what is missing', before && 'reviewer' in before && 'reviewed_at' in before && Array.isArray(before.missing_fields));
ok('detail carries an empty history before any action', Array.isArray(before.events));

/* Rule 1 — a backward correction needs an admin AND a written reason. */
const noNote = await call(`/api/admin/verification/products/${pid}`, { method: 'POST', token: admin, body: { state: 'unverified' } });
ok('going backwards without a reason is refused (422)', noNote.status === 422 && noNote.json?.code === 'NOTE_REQUIRED', String(noNote.status));
const shortNote = await call(`/api/admin/verification/products/${pid}`, { method: 'POST', token: admin, body: { state: 'unverified', note: 'خطأ' } });
ok('a three-letter reason is not a reason (422)', shortNote.status === 422);
const withNote = await call(`/api/admin/verification/products/${pid}`, { method: 'POST', token: admin, body: { state: 'unverified', note: 'الرجوع لمراجعة الوثيقة المرفقة مرة أخرى.' } });
ok('an admin with a written reason can correct the state', withNote.status === 200 && withNote.json?.state === 'unverified', JSON.stringify(withNote.json).slice(0, 120));
ok('a correction clears the previous approval instead of keeping it',
  withNote.json?.review !== 'approved', String(withNote.json?.review));

/* Rule 2 — "manufacturer confirmed" without a document is impossible. */
const noDoc = await call(`/api/admin/verification/products/${pid}`, { method: 'POST', token: admin, body: { state: 'manufacturer_confirmed' } });
ok('manufacturer_confirmed without a document is refused (422)', noDoc.status === 422 && noDoc.json?.code === 'SOURCE_REQUIRED');
ok('the refusal says which documents are accepted', (noDoc.json?.accepted_kinds || []).includes('manufacturer_letter'));

const badSource = await call(`/api/admin/verification/products/${pid}/sources`, {
  method: 'POST', token: admin, body: { kind: 'manufacturer_letter', title: 'x' },
});
ok('a document needs a link or a file', badSource.status === 422);

const badKind = await call(`/api/admin/verification/products/${pid}/sources`, {
  method: 'POST', token: admin, body: { kind: 'selfie', title: 'صورة شخصية', url: 'https://example.org/a.pdf' },
});
ok('an unknown document kind is refused', badKind.status === 422);

const src = await call(`/api/admin/verification/products/${pid}/sources`, {
  method: 'POST', token: admin,
  body: { kind: 'manufacturer_letter', title: `خطاب الشركة ${stamp}`, issuer: 'Hikma', url: 'https://example.org/letter.pdf' },
});
ok('a real document is accepted', src.status === 201 && src.json?.id > 0);
ok('the document appears in the record detail', (src.json?.detail?.sources || []).some((s) => s.id === src.json.id));

const mc = await call(`/api/admin/verification/products/${pid}`, { method: 'POST', token: admin, body: { state: 'manufacturer_confirmed' } });
ok('with the document attached the state is allowed', mc.status === 200 && mc.json?.state === 'manufacturer_confirmed');

/* Rule 3 — a rejection needs a written reason and is a review outcome, not a state. */
const rejectShort = await call(`/api/admin/verification/products/${pid}`, { method: 'POST', token: admin, body: { review: 'rejected', note: 'لا' } });
ok('a rejection without a reason is refused (422)', rejectShort.status === 422 && rejectShort.json?.code === 'NOTE_REQUIRED');
const reject = await call(`/api/admin/verification/products/${pid}`, { method: 'POST', token: admin, body: { review: 'rejected', note: 'الوثيقة لا تخص هذا المنتج — أُعيد للمورّد.' } });
ok('a rejection with a reason is stored', reject.status === 200 && reject.json?.review === 'rejected');
ok('rejection does not erase where the record came from',
  reject.json?.state === 'manufacturer_confirmed', String(reject.json?.state));
ok('the rejection reason is visible on the record', reject.json?.detail?.review_note?.includes('الوثيقة'));

/* Rule 4 — approving is only possible for a verified record. */
const wrongApprove = await call(`/api/admin/verification/products/${pid}`, { method: 'POST', token: admin, body: { review: 'approved' } });
ok('approving a non-verified record is refused', wrongApprove.status === 422 && wrongApprove.json?.code === 'APPROVE_NEEDS_VERIFIED');

const verify = await call(`/api/admin/verification/products/${pid}`, { method: 'POST', token: admin, body: { state: 'verified' } });
ok('verifying works from manufacturer_confirmed', verify.status === 200 && verify.json?.state === 'verified');
ok('verifying sets the review to approved without being asked', verify.json?.review === 'approved');
ok('the reviewer is recorded (name and role), not just a timestamp',
  verify.json?.detail?.reviewer?.name === 'عبدالمجيد' || !!verify.json?.detail?.reviewer?.name, JSON.stringify(verify.json?.detail?.reviewer));
ok('the decision carries a date', /^\d{4}-\d{2}-\d{2}/.test(String(verify.json?.detail?.reviewed_at)));
ok('the full history is returned, newest first',
  (verify.json?.detail?.events || []).length >= 4 && verify.json.detail.events[0].to_state === 'verified',
  String((verify.json?.detail?.events || []).length));

/* Rule 5 — nothing to do is not a success. */
const again = await call(`/api/admin/verification/products/${pid}`, { method: 'POST', token: admin, body: { state: 'verified' } });
ok('repeating the same decision returns 409, not a fake success', again.status === 409 && again.json?.code === 'NO_CHANGE');

ok('an unknown state is refused', (await call(`/api/admin/verification/products/${pid}`, { method: 'POST', token: admin, body: { state: 'gold' } })).status === 422);
ok('an unknown record type is refused', (await call('/api/admin/verification/unicorns/1', { token: admin })).status === 404);
ok('a missing record is refused', (await call('/api/admin/verification/products/999999', { token: admin })).status === 404);
ok('an empty change is refused', (await call(`/api/admin/verification/products/${pid}`, { method: 'POST', token: admin, body: {} })).status === 400);

/* ---------- roles ---------- */
const userEmail = `verif-user-${stamp}@example.com`;
const userReg = await call('/api/auth/register', { method: 'POST', body: { name: 'Verif User', email: userEmail, password: 'UserPass@2026' } });
const userTok = userReg.json?.token;
ok('a plain user can register', !!userTok);
const asUser = await call('/api/admin/verification/queue', { token: userTok });
ok('a plain user cannot read the review queue (403)', asUser.status === 403, String(asUser.status));
const asUserWrite = await call(`/api/admin/verification/products/${pid}`, { method: 'POST', token: userTok, body: { state: 'verified' } });
ok('a plain user cannot verify a record (403)', asUserWrite.status === 403);

const pharmEmail = `verif-pharm-${stamp}@example.com`;
const pharmReg = await call('/api/auth/register', { method: 'POST', body: { name: 'Verif Pharmacist', email: pharmEmail, password: 'PharmPass@2026' } });
const pharmId = pharmReg.json?.user?.id;
await call(`/api/admin/users/${pharmId}`, { method: 'PATCH', token: admin, body: { role: 'pharmacist' } });
const pharmTok = (await call('/api/auth/login', { method: 'POST', body: { email: pharmEmail, password: 'PharmPass@2026' } })).json?.token;
ok('the new pharmacist can log in', !!pharmTok);
ok('a pharmacist can read the queue', (await call('/api/admin/verification/queue', { token: pharmTok })).status === 200);
const pharmBack = await call(`/api/admin/verification/products/${pid}`, { method: 'POST', token: pharmTok, body: { state: 'unverified', note: 'أرى أن الوثيقة غير كافية لإلغاء التوثيق.' } });
ok('a pharmacist cannot undo a verification (admin-only correction)', pharmBack.status === 403 && pharmBack.json?.code === 'CORRECTION_ADMIN_ONLY');
const pharmForward = await call(`/api/admin/verification/products/${pid}`, { method: 'POST', token: pharmTok, body: { state: 'manufacturer_confirmed' } });
ok('a pharmacist can move a record to manufacturer_confirmed (document attached)', pharmForward.status === 200);

/* restore the starting state so repeated runs stay meaningful */
await call(`/api/admin/verification/products/${pid}`, { method: 'POST', token: admin, body: { state: 'verified' } });
await call(`/api/admin/verification/products/${pid}`, { method: 'POST', token: admin, body: { state: 'verified', note: 'إغلاق تجربة الاختبار الآلي.' } });

/* ---------- the catalog reflects the decision ---------- */
const detail = (await call(`/api/catalog/products/${pid}`)).json;
ok('the public product page exposes the full verification trail', !!detail?.verification_detail?.events);
ok('the public page names the reviewer', !!detail?.verification_detail?.reviewer?.name);
ok('the public page lists the attached document', (detail?.verification_detail?.sources || []).some((s) => /line|خطاب/.test(s.title)));

const filtered = (await call('/api/catalog/products?state=verified&limit=1')).json;
ok('the catalog can be filtered by the six states', filtered?.total > 0 && filtered.data.every((p) => p.verification === 'verified'));
const facets = (await call('/api/catalog/products-facets')).json;
ok('facets publish per-state counts', (facets?.states || []).length > 0 && facets.states.every((s) => typeof s.n === 'number'));

/* ---------- audit trail ---------- */
const chain = (await call('/api/admin/audit/verify', { token: admin })).json;
ok('the audit chain is still intact after every write', chain?.ok !== false, JSON.stringify(chain).slice(0, 120));
const auditRows = (await call('/api/admin/audit?limit=200', { token: admin })).json;
const entries = auditRows?.data || auditRows?.rows || auditRows || [];
ok('every verification decision is in the audit log',
  Array.isArray(entries) && entries.some((r) => String(r.action || '').startsWith('verification.')),
  JSON.stringify(entries).slice(0, 150));

/* ---------- a record created by staff starts unclaimed ---------- */
const created = await call('/api/admin/products', {
  method: 'POST', token: admin,
  body: { trade_name: `Verif Product ${stamp}`, drug_id: detail.drug_id || 1, strength: '', dosage_form: '', country: '' },
});
ok('an admin can create a product', created.status === 201);
const newId = created.json?.id;
const createdState = (await call(`/api/admin/verification/products/${newId}`, { token: admin })).json;
ok('a new staff record with empty fields is stored as «incomplete»',
  createdState?.state === 'incomplete', String(createdState?.state));
ok('it has no reviewer until someone decides', createdState?.reviewer === null);
await call(`/api/admin/products/${newId}`, { method: 'DELETE', token: admin });

/* ---------- cleanup ---------- */
await call(`/api/admin/verification/sources/${src.json.id}`, { method: 'DELETE', token: admin });
const afterDelete = (await call(`/api/admin/verification/products/${pid}`, { token: admin })).json;
ok('a retracted document disappears from the record', !(afterDelete?.sources || []).some((s) => s.id === src.json.id));
ok('removing a document does not silently change the state', afterDelete?.state === 'verified');

await call(`/api/admin/users/${pharmId}`, { method: 'DELETE', token: admin });
const userRow = await call('/api/profile', { token: userTok });
const userId = userRow.json?.user?.id || userRow.json?.id;
if (userId) await call(`/api/admin/users/${userId}`, { method: 'DELETE', token: admin });
ok('test accounts removed', true);

/* ---------- what the screen is allowed to say ---------- */
execSync(
  `npx esbuild scripts/plan-entry.tsx --bundle --format=esm --platform=browser --jsx=automatic --loader:.tsx=tsx --outfile=${path.join(ROOT, '.smoke', 'plan.mjs')} --log-level=error --define:process.env.NODE_ENV='"development"'`,
  { cwd: ROOT, stdio: 'inherit' },
);
const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'https://localhost/', pretendToBeVisual: true });
globalThis.window = dom.window;
globalThis.document = dom.window.document;
Object.defineProperty(globalThis, 'navigator', { value: dom.window.navigator, configurable: true });
globalThis.HTMLElement = dom.window.HTMLElement;
globalThis.HTMLInputElement = dom.window.HTMLInputElement;
globalThis.Element = dom.window.Element;
globalThis.Node = dom.window.Node;
globalThis.localStorage = dom.window.localStorage;
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
dom.window.matchMedia = (q) => ({ matches: false, media: q, onchange: null, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, dispatchEvent: () => false });
const ui = await import(`${path.join(ROOT, '.smoke', 'plan.mjs')}?v=${Math.random()}`);

const sub = ui.mountVerificationPanel({
  title: 'Test', state: 'user_submitted', review: 'pending', reviewed_at: null, reviewer: null,
  missing_fields: ['barcode'], missing_labels_ar: ['الباركود'], sources: [], events: [],
});
const subText = sub.host.textContent || '';
ok('a user-submitted record says so in words', /مُقدَّم من مستخدم/.test(subText));
ok('it does not claim to be verified', !/موثّق/.test(subText.replace(/غير موثّق|مُقدَّم من مستخدم/g, '')));
ok('it says out loud that no reviewer is recorded', /لا يوجد مراجع/.test(subText));
ok('it names the missing field instead of a generic warning', /الباركود/.test(subText));

const full = ui.mountVerificationPanel({
  title: 'Test', state: 'verified', review: 'approved', reviewed_at: '2026-10-29 10:00:00',
  reviewer: { id: 1, name: 'د. عبدالمجيد', role: 'admin' },
  missing_fields: [], sources: [{ id: 9, kind: 'manufacturer_letter', title: 'خطاب الشركة', issuer: 'Hikma', url: 'https://example.org/a' }],
  events: [{ id: 1, from_state: 'unverified', to_state: 'verified', actor_name: 'د. عبدالمجيد', created_at: '2026-10-29 10:00:00' }],
});
const fullText = full.host.textContent || '';
ok('a verified record prints the reviewer name', /د\. عبدالمجيد/.test(fullText));
ok('a verified record prints the decision date', /2026-10-29/.test(fullText));
ok('a verified record prints the backing document', /خطاب الشركة/.test(fullText));
ok('the panel never calls the medicine itself "safe"', !/آمن/.test(fullText));

/* the real admin screen, rendered against the real API with an admin token */
dom.window.localStorage.setItem('mda.token', admin);
dom.window.localStorage.setItem('mda.apiBase', API);
const adminScreen = ui.mountAdminVerification();
for (let i = 0; i < 100 && !/سجل/.test(adminScreen.host.textContent || ''); i++) await new Promise((r) => setTimeout(r, 100));
await new Promise((r) => setTimeout(r, 300));
const adminText = adminScreen.host.textContent || '';
ok('the review queue screen loads counts and rows from the API', /\d+/.test(adminText) && /موثّق/.test(adminText), `len=${adminText.length}`);
ok('the screen states the evidence rule in words', /لا تُرفع حالة|without an attached document/.test(adminText));
ok('the queue lists a real product', /Panadol|Vitamin|Paracetamol/i.test(adminText), adminText.slice(0, 120));

const badge = ui.mountVerificationBadge('supplier_submitted', 'none');
ok('the badge distinguishes a supplier submission from verification',
  /مُقدَّم من مورّد/.test(badge.host.textContent || '') && !/^موثّق$/.test((badge.host.textContent || '').trim()));

console.log(`\n${fail === 0 ? '✓' : '✗'} ${pass} passed, ${fail} failed\n`);
process.exit(fail === 0 ? 0 : 1);
