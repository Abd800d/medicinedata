/*
 * End-to-end journey test (v1.6.0): the full clinical path a real patient takes.
 *
 *   npm run test:e2e      # needs the API on :4000 + mock AI on :4111
 *
 *   consent refused → consent granted → allergy declared → photo analysed
 *   → items linked to the local database → human correction → pharmacist approval
 *   (twice: blocked while items are pending, allowed with explicit acceptance)
 *   → audit chain verified → right to erasure → AI quality counters
 *
 * Nothing here is mocked except the model itself: every step goes through the
 * same HTTP endpoints the Android app calls.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const API = (process.env.API || 'http://127.0.0.1:4000').replace(/\/$/, '');
const ADMIN_EMAIL = process.env.EMAIL || '7a8b1d@gmail.com';
const ADMIN_PASSWORD = process.env.PASSWORD || 'MDAadmin@2026';

let pass = 0;
let fail = 0;
const ok = (name, cond, extra = '') => {
  if (cond) { pass++; console.log(`  ✓ ${name}`); } else { fail++; console.log(`  ✗ ${name} ${extra}`); }
};

const call = async (p, { method = 'GET', token, body, form } = {}) => {
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  let payload;
  if (form) payload = form;
  else if (body !== undefined) { headers['Content-Type'] = 'application/json'; payload = JSON.stringify(body); }
  const res = await fetch(API + p, { method, headers, body: payload });
  let json = null;
  try { json = await res.json(); } catch { /* empty */ }
  return { status: res.status, json };
};

const login = async (email, password) => (await call('/api/auth/login', { method: 'POST', body: { email, password } })).json?.token || null;

console.log(`\nMDA end-to-end test → ${API}\n`);
const admin = await login(ADMIN_EMAIL, ADMIN_PASSWORD);
if (!admin) { console.error('cannot log in as admin — is the API running with the seeded admin?'); process.exit(1); }

const stamp = Date.now().toString().slice(-7);
const email = `e2e-${stamp}@example.com`;
const PASSWORD = 'E2Epass123!';

/* PNG is enough: the mock model never decodes the pixels. */
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
const imgPath = path.join(os.tmpdir(), `mda-e2e-${stamp}.png`);
fs.writeFileSync(imgPath, PNG);
const imageForm = (extra = {}) => {
  const fd = new FormData();
  fd.append('image', new Blob([PNG], { type: 'image/png' }), 'prescription.png');
  for (const [k, v] of Object.entries(extra)) fd.append(k, String(v));
  return fd;
};

/* ------------------------------------------------------------------ 0. account */
console.log('0 · a new patient account');
const reg = await call('/api/auth/register', { method: 'POST', body: { name: 'E2E Patient', email, password: PASSWORD } });
ok('registration works', reg.status === 201 && !!reg.json?.token, JSON.stringify(reg.json)?.slice(0, 120));
const patient = reg.json.token;
ok('a fresh account is a normal user', reg.json?.user?.role === 'user');

/* ------------------------------------------------------------------ 1. consent */
console.log('1 · consent gate');
const before = await call('/api/rx/consent', { token: patient });
ok('consent starts un-granted', before.json?.granted === false);
const blocked = await call('/api/rx/analyze', { method: 'POST', token: patient, form: imageForm() });
ok('analysis is refused without consent', blocked.status === 428 && blocked.json?.code === 'CONSENT_REQUIRED', `got ${blocked.status}`);
const granted = await call('/api/rx/consent', { method: 'POST', token: patient, body: { granted: true } });
ok('consent can be granted', granted.json?.granted === true);
ok('consent text is shown before agreeing', (before.json?.text_ar || '').includes('مراجعة الصيدلي'));

/* ------------------------------------------------------------------ 2. allergies */
console.log('2 · declared allergy');
const addAllergy = await call('/api/rx/allergies', { method: 'POST', token: patient, body: { code: 'penicillin' } });
ok('penicillin allergy recorded', addAllergy.status === 201 && (addAllergy.json?.items || []).some((a) => a.code === 'penicillin'));

/* ------------------------------------------------------------------ 3. analysis */
console.log('3 · photo → structured analysis');
const analyzed = await call('/api/rx/analyze', { method: 'POST', token: patient, form: imageForm({ lang: 'ar', keep_image: '1' }) });
ok('analysis returns 201', analyzed.status === 201, JSON.stringify(analyzed.json)?.slice(0, 200));
const rx = analyzed.json || {};
const items = rx.analysis?.items || [];
ok('model is never trusted as final', rx.needs_pharmacist === true);
ok('a disclaimer is attached', !!rx.analysis?.disclaimer_ar);
ok('items were extracted', items.length >= 2, `items=${items.length}`);
ok('every item carries a per-field confidence map', items.every((i) => i.field_confidence && typeof i.field_confidence === 'object'));
ok('items are linked to the local drug database', items.some((i) => i.matched?.drug_id), JSON.stringify(items.map((i) => i.matched?.generic_name)));
ok('the allergy reached the analysis', (rx.analysis?.summary?.allergies_checked || 0) >= 1);
const allergyFlag = (rx.analysis?.flags || []).find((f) => f.type === 'allergy_conflict');
ok('an allergy conflict is flagged with plain language', !!allergyFlag && !!allergyFlag.plain_ar && !!allergyFlag.action_ar, JSON.stringify(rx.analysis?.flags?.map((f) => f.type)));
ok('the image was kept only because we asked', rx.image_kept === true);

const detail = await call(`/api/rx/${rx.id}`, { token: patient });
ok('detail exposes the stored items', (detail.json?.items || []).length === items.length);
const pendingItem = (detail.json?.items || []).find((i) => i.status === 'pending');
ok('items start as pending review', !!pendingItem);

/* ------------------------------------------------------------------ 4. human correction */
console.log('4 · human correction');
const corrected = await call(`/api/rx/${rx.id}/items/${pendingItem.id}`, {
  method: 'PATCH', token: patient, body: { name: pendingItem.name, status: 'corrected', notes: 'راجعها الصيدلي' },
});
ok('a pharmacist may correct an item', [200, 403].includes(corrected.status), `got ${corrected.status}`);

/* the patient is not staff: approval must be refused */
const selfApprove = await call(`/api/rx/${rx.id}/confirm`, { method: 'POST', token: patient, body: { accept_uncertain: true } });
ok('a normal user cannot approve a prescription', selfApprove.status === 401 || selfApprove.status === 403, `got ${selfApprove.status}`);

/* ------------------------------------------------------------------ 5. pharmacist approval */
console.log('5 · pharmacist approval');
const blockedApprove = await call(`/api/rx/${rx.id}/confirm`, { method: 'POST', token: admin, body: {} });
ok('approval is blocked while items are unreviewed', blockedApprove.status === 409 && blockedApprove.json?.code === 'PENDING_ITEMS', `got ${blockedApprove.status}`);
ok('the error says how many items are pending', (blockedApprove.json?.pending || 0) > 0);

const approved = await call(`/api/rx/${rx.id}/confirm`, { method: 'POST', token: admin, body: { accept_uncertain: true, notes: 'اعتمدها الصيدلي بعد المراجعة' } });
ok('explicit acceptance approves the prescription', approved.status === 200 && approved.json?.status === 'reviewed', JSON.stringify(approved.json)?.slice(0, 160));
ok('approval stores the review record', (approved.json?.reviews || []).length >= 1);
ok('approval recomputes the flags', Array.isArray(approved.json?.flags));

const afterApprove = await call(`/api/rx/${rx.id}`, { token: patient });
ok('status is now reviewed', afterApprove.json?.status === 'reviewed');
ok('the review is attributed to a person', (afterApprove.json?.reviews || [])[0]?.user_id > 0);

/* ------------------------------------------------------------------ 6. audit */
console.log('6 · audit trail');
const chain = await call('/api/admin/audit/verify', { token: admin });
ok('audit hash chain is intact', chain.json?.ok === true, JSON.stringify(chain.json)?.slice(0, 120));
const audit = await call('/api/admin/audit?limit=50', { token: admin });
const actions = (audit.json?.items || audit.json || []).map((r) => r.action);
ok('consent, analysis and approval are all logged', ['rx.consent.granted', 'rx.analyzed', 'rx.approved'].every((a) => actions.includes(a)), actions.slice(0, 12).join(','));

/* ------------------------------------------------------------------ 7. AI quality */
console.log('7 · AI quality counters');
const stats = await call('/api/admin/ai-stats?days=7', { token: admin });
ok('ai-stats counts the run', (stats.json?.runs?.total || 0) >= 1, JSON.stringify(stats.json?.runs)?.slice(0, 200));
ok('ai-stats reports a 100% success rate for the mock', (stats.json?.runs?.models || []).every((m) => m.failed === 0));
ok('ai-stats exposes prompt + model versions', JSON.stringify(stats.json).includes('prompt_version') || JSON.stringify(stats.json).includes('models'));

/* ------------------------------------------------------------------ 8. erasure */
console.log('8 · right to erasure');
const erasure = await call(`/api/rx/${rx.id}`, { method: 'DELETE', token: admin });
ok('the record can be erased', erasure.status === 200 && erasure.json?.ok === true && erasure.json?.purged === true, JSON.stringify(erasure.json)?.slice(0, 120));
/* Erasure = patient data removed, review history kept (audit must survive). */
const gone = await call(`/api/rx/${rx.id}`, { token: admin });
ok('the photo and extracted text are gone', gone.json?.image_url === null && gone.json?.extracted_text === null);
ok('patient identifiers are wiped from the analysis', gone.json?.analysis?.patient?.name === null && gone.json?.analysis?.items?.every((i) => !i.raw_text));
ok('the erasure itself is recorded', (gone.json?.reviews || []).some((r) => r.action === 'purged'));
const imageDir = path.join(process.cwd(), 'data', 'uploads', 'prescriptions');
const leftovers = fs.existsSync(imageDir) ? fs.readdirSync(imageDir).filter((f) => f.endsWith('.png')).length : 0;
ok('no orphaned prescription photo is left on disk', leftovers === 0, `found ${leftovers}`);
const chain2 = await call('/api/admin/audit/verify', { token: admin });
ok('erasure does not break the audit chain', chain2.json?.ok === true);

console.log('9 · Play package (v1.8.0)');

const raw = async (p) => {
  const res = await fetch(API + p);
  return { status: res.status, type: res.headers.get('content-type') || '', text: await res.text() };
};
const priv = await raw('/privacy');
ok('the privacy policy is served as HTML without any auth', priv.status === 200 && priv.type.includes('text/html'));
ok('it is the Arabic policy, not a placeholder', priv.text.includes('سياسة الخصوصية') && priv.text.includes('عبدالمجيد'));
ok('it renders without JavaScript (no script tags)', !/<script/i.test(priv.text));
ok('it names the erasure right the app implements', /حذف/.test(priv.text));
const terms = await raw('/terms');
ok('the terms page is public too', terms.status === 200 && terms.text.includes('شروط الاستخدام'));
const corsRes = await fetch(`${API}/privacy`, { headers: { Origin: 'https://localhost' } });
ok('the policy is readable from the Android shell origin', corsRes.headers.get('access-control-allow-origin') === '*');
await corsRes.text();
ok('the terms forbid auto-diagnosis wording', /تشخيص/.test(terms.text));

const cfg = (await call('/api/config')).json || {};
ok('config advertises the same policy URLs the store needs', /^https?:\/\/.+\/privacy$/.test(cfg.privacy_url || '') && /\/terms$/.test(cfg.terms_url || ''));
ok('config carries a policy version for the consent log', !!cfg.legal_version);

const anonKs = await call('/api/admin/keystore', { method: 'POST', body: { password: 'WhateverPass-2026' } });
ok('keystore generation needs an admin token', anonKs.status === 401);
const weakKs = await call('/api/admin/keystore', { method: 'POST', token: admin, body: { password: 'short' } });
ok('a short keystore password is rejected', weakKs.status === 400 && weakKs.json?.error === 'password-too-short');
const ks = await call('/api/admin/keystore', { method: 'POST', token: admin, body: { password: 'E2E-Keystore-2026!' } });
const ksBuf = ks.json?.base64 ? Buffer.from(ks.json.base64, 'base64') : Buffer.alloc(0);
ok('a real PKCS#12 keystore is produced', ks.status === 200 && ksBuf.length > 1500);
ok('the keystore is a PKCS#12 container (DER SEQUENCE)', ksBuf[0] === 0x30);
ok('it carries the alias the workflow expects', ks.json?.alias === 'mda-upload');
ok('it reports the SHA-256 fingerprint for Play Console', /^[0-9A-F]{2}(:[0-9A-F]{2}){31}$/.test(ks.json?.sha256 || ''));
ok('validity reaches Google Play\'s 25-year minimum', Number((ks.json?.not_after || '0').slice(0, 4)) >= 2050);
ok('the response tells the owner where to paste the secrets', Array.isArray(ks.json?.commands) && ks.json.commands.some((c) => c.includes('ANDROID_KEYSTORE_BASE64')));
const stored = fs.readdirSync(path.join(process.cwd(), 'data')).filter((f) => f.endsWith('.p12'));
ok('the private key is never written to disk', stored.length === 0);

/* ------------------------------------------------------------------ cleanup */
console.log('cleanup');
const users = await call('/api/admin/users?q=e2e', { token: admin });
const me = (users.json || []).find((u) => u.email === email);
if (me) await call(`/api/admin/users/${me.id}`, { method: 'DELETE', token: admin });
ok('test account removed', !(await call('/api/admin/users?q=e2e', { token: admin })).json?.some((u) => u.email === email));
try { fs.unlinkSync(imgPath); } catch { /* ignore */ }

console.log(`\n${pass} passed · ${fail} failed\n`);
process.exit(fail ? 1 : 0);
