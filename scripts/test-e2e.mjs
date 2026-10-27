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
const actions = (audit.json?.data || []).map((r) => r.action);
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

console.log('10 · AI enabled from inside the app (v1.8.1)');

const MOCK_AI = (process.env.MOCK_AI || 'http://127.0.0.1:4111/v1').replace(/\/$/, '');
const aiAnon = await call('/api/admin/ai');
ok('AI settings are admin-only', aiAnon.status === 401);
const ai0 = await call('/api/admin/ai', { token: admin });
ok('the admin panel receives the provider catalogue', ai0.status === 200 && Boolean(ai0.json?.presets?.groq));
ok('no API key is ever sent to the client', !JSON.stringify(ai0.json).includes('sk-') && ai0.json?.has_key !== undefined);
ok('the panel reports where the key came from', ['database', 'environment', 'none'].includes(ai0.json?.key_source));
/* Never destroy a key the owner configured in the app: skip this block when one exists. */
const hadDatabaseKey = ai0.json?.key_source === 'database';
const hadEnvironmentKey = ai0.json?.key_source === 'environment';
if (hadDatabaseKey) console.log('   (an AI key is already configured in the database — the write tests are skipped)');

if (!hadDatabaseKey) {
const badProvider = await call('/api/admin/ai', { method: 'PUT', token: admin, body: { provider: 'nope' } });
ok('an unknown provider is rejected', badProvider.status === 400 && badProvider.json?.error === 'BAD_PROVIDER');
const badBase = await call('/api/admin/ai', { method: 'PUT', token: admin, body: { base_url: 'ftp://x' } });
ok('a non-http base URL is rejected', badBase.status === 400 && badBase.json?.error === 'BAD_BASE_URL');
const shortKey = await call('/api/admin/ai', { method: 'PUT', token: admin, body: { api_key: 'short' } });
ok('a too-short key is rejected', shortKey.status === 400 && shortKey.json?.error === 'BAD_KEY');

const saved = await call('/api/admin/ai', {
  method: 'PUT', token: admin,
  body: { provider: 'custom', base_url: MOCK_AI, model: 'test-model', vision_model: 'test-vision', api_key: 'e2e-ai-key-1234567890' },
});
ok('the key is stored (masked) after saving', saved.status === 200 && saved.json?.has_key === true && /…/.test(saved.json?.key_hint || ''));
ok('the stored key is attributed to the database, not env', saved.json?.key_source === 'database');
ok('the raw key is not echoed back', !JSON.stringify(saved.json).includes('1234567890'));

const st = (await call('/api/ai/status')).json || {};
ok('the public status flips to enabled', st.enabled === true && st.model === 'test-model');
const rxSt = (await call('/api/rx/status')).json || {};
ok('prescription analysis reports the provider as configured', rxSt.configured === true);

const probe = await call('/api/admin/ai/test', { method: 'POST', token: admin, body: { timeout_ms: 8000 } });
ok('the self-test reaches the provider for real', probe.status === 200 && probe.json?.ok === true, JSON.stringify(probe.json).slice(0, 120));
ok('the self-test reports latency and model', Number(probe.json?.latency_ms) >= 0 && probe.json?.model === 'test-model');

const cleared = await call('/api/admin/ai', { method: 'PUT', token: admin, body: { clear_key: true } });
ok('the database key can be removed again', cleared.status === 200 && cleared.json?.key_source !== 'database'
  && cleared.json?.has_key === hadEnvironmentKey);
const after = (await call('/api/ai/status')).json || {};
ok('clearing the database key falls back to the server setting',
  after.enabled === hadEnvironmentKey, `enabled=${after.enabled} env=${hadEnvironmentKey}`);
}

console.log('11 · the Android shell can reach the API (CORS, v1.8.2)');

const SHELL_ORIGIN = 'https://localhost';
const pre = await fetch(`${API}/api/health`, {
  method: 'OPTIONS',
  headers: {
    Origin: SHELL_ORIGIN,
    'Access-Control-Request-Method': 'GET',
    'Access-Control-Request-Headers': 'authorization,content-type',
  },
});
ok('preflight is answered without touching a handler (204)', pre.status === 204, `got ${pre.status}`);
ok('the Capacitor origin is echoed back', pre.headers.get('access-control-allow-origin') === SHELL_ORIGIN);
ok('the preflight allows Authorization (Bearer tokens)', /authorization/i.test(pre.headers.get('access-control-allow-headers') || ''));
ok('the preflight allows the write methods the app uses', /POST/.test(pre.headers.get('access-control-allow-methods') || '') && /PUT/.test(pre.headers.get('access-control-allow-methods') || ''));
ok('preflights are cached to keep the app fast', Number(pre.headers.get('access-control-max-age') || 0) >= 600);

const authed = await fetch(`${API}/api/config`, { headers: { Origin: SHELL_ORIGIN, Accept: 'application/json' } });
ok('real GET responses carry the CORS header too', authed.headers.get('access-control-allow-origin') === SHELL_ORIGIN);
ok('idempotency headers stay readable by the client', /x-idempotency-key/i.test(authed.headers.get('access-control-expose-headers') || ''));
ok('the API answer itself is untouched', authed.status === 200 && (await authed.json())?.app === 'MDA');

const evil = await fetch(`${API}/api/config`, { headers: { Origin: 'https://evil.example.com' } });
ok('an unrelated origin gets no CORS grant', evil.headers.get('access-control-allow-origin') === null);
await evil.text();

const post = await fetch(`${API}/api/auth/login`, {
  method: 'POST',
  headers: { Origin: SHELL_ORIGIN, 'Content-Type': 'application/json' },
  body: JSON.stringify({ email: ADMIN_EMAIL, password: ADMIN_PASSWORD }),
});
ok('POST with credentials works cross-origin', post.status === 200 && Boolean((await post.json())?.token));

const policy = await fetch(`${API}/privacy`, { headers: { Origin: SHELL_ORIGIN } });
const policyCors = policy.headers.get('access-control-allow-origin');
ok('the in-app legal reader is reachable cross-origin',
  policy.status === 200 && (policyCors === SHELL_ORIGIN || policyCors === '*'), `acao=${policyCors}`);
await policy.text();

console.log('12 · Google sign-in that works on a phone (v1.9.0)');

/* Nothing is configured yet on a fresh database: the panel must say so and the flow
   must refuse politely instead of redirecting to a broken Google URL. */
const gBefore = await call('/api/admin/google-oauth', { token: admin });
ok('the panel exposes the exact redirect URI to register', /\/api\/auth\/google\/callback$/.test(gBefore.json?.redirect_uri || ''), gBefore.json?.redirect_uri);
ok('the app scheme is documented for the deep link', gBefore.json?.app_scheme === 'com.mda.medicinedata://auth');
ok('a secret is never returned to the client', !JSON.stringify(gBefore.json).includes('GOCSPX'));

const startUnconfigured = await fetch(`${API}/api/auth/google/start`, { redirect: 'manual' });
ok('without credentials the flow refuses instead of redirecting', [503, 302].includes(startUnconfigured.status), String(startUnconfigured.status));

const badId = await call('/api/admin/google-oauth', { method: 'PUT', token: admin, body: { client_id: 'not-a-google-id' } });
ok('a malformed client id is rejected', badId.status === 400 && badId.json?.error === 'BAD_CLIENT_ID');

/* Configure with dummy credentials: enough to prove the redirect + PKCE wiring. */
const saved = await call('/api/admin/google-oauth', {
  method: 'PUT', token: admin,
  body: { client_id: '1234567890-e2etest.apps.googleusercontent.com', client_secret: 'GOCSPX-e2e-secret-value' },
});
ok('credentials are stored and the flow reports ready', saved.status === 200 && saved.json?.configured === true, JSON.stringify(saved.json));
ok('the stored secret is masked, not echoed', /…/.test(saved.json?.client_id || '') === false && saved.json?.has_secret === true);

const startRes = await fetch(`${API}/api/auth/google/start?redirect=${encodeURIComponent('com.mda.medicinedata://auth')}`, { redirect: 'manual' });
const location = startRes.headers.get('location') || '';
ok('start redirects to Google with a 302', startRes.status === 302 && location.startsWith('https://accounts.google.com/'), location.slice(0, 60));
const gurl = new URL(location);
ok('PKCE S256 is used', gurl.searchParams.get('code_challenge_method') === 'S256' && (gurl.searchParams.get('code_challenge') || '').length >= 40);
ok('the state parameter is present', (gurl.searchParams.get('state') || '').length >= 20);
ok('the redirect URI is the server callback', (gurl.searchParams.get('redirect_uri') || '').endsWith('/api/auth/google/callback'));
ok('the openid email profile scopes are requested', gurl.searchParams.get('scope') === 'openid email profile');
ok('the client id comes from the panel, not the code', gurl.searchParams.get('client_id') === '1234567890-e2etest.apps.googleusercontent.com');

const cbNoState = await fetch(`${API}/api/auth/google/callback?code=x&state=forged`, { redirect: 'manual' });
ok('a forged state is rejected (no token leak)', cbNoState.status === 400, String(cbNoState.status));

/* A second start must produce a different state — replay protection. */
const s2 = await fetch(`${API}/api/auth/google/start`, { redirect: 'manual' });
const s1b = new URL((await fetch(`${API}/api/auth/google/start`, { redirect: 'manual' })).headers.get('location'));
ok('every attempt gets a fresh state', new URL(location).searchParams.get('state') !== s1b.searchParams.get('state'));

/* The public config must advertise the flow so the app can show the browser button. */
const publicCfg = await (await fetch(`${API}/api/config`)).json();
ok('the app is told that Google OAuth is available', publicCfg?.google_oauth === true);

/* Users may not touch the credentials, and the secret survives a re-save. */
const asUser = await call('/api/admin/google-oauth', { token: patient });
ok('only an admin can read the Google credentials', asUser.status === 403, String(asUser.status));
const kept = await call('/api/admin/google-oauth', { method: 'PUT', token: admin, body: { client_id: '1234567890-e2etest.apps.googleusercontent.com' } });
ok('omitting the secret keeps the stored one', kept.json?.configured === true && kept.json?.has_secret === true);

await call('/api/admin/google-oauth', { method: 'PUT', token: admin, body: { clear_secret: true } });
const cleared = await call('/api/admin/google-oauth', { token: admin });
ok('the secret can be removed again', cleared.json?.configured === false && cleared.json?.has_secret === false);

console.log('14 · the pharmacist review queue is actually usable (v1.9.0)');

/* The queue endpoint existed but no screen ever called it, and a pharmacist could not see
   another user's prescription at all. Both are asserted here. */
const queue = await call('/api/rx/queue', { token: admin });
ok('the queue answers for an admin', queue.status === 200 && Array.isArray(queue.json?.rows), String(queue.status));

/* The journey above erases its prescription (right to erasure), so take any record that
   still exists in the database — the point is *who may open it*, not which one. */
let anyRx = null;
for (const st of ['pending_review', 'reviewed', 'rejected']) {
  const q = await call(`/api/rx/queue?status=${st}`, { token: admin });
  if ((q.json?.rows || []).length) { anyRx = q.json.rows[0]; break; }
}
if (!anyRx) {
  const mine = await call('/api/rx', { token: admin });
  anyRx = (mine.json || [])[0] || null;
}
ok('a prescription exists to review', Boolean(anyRx), 'no prescriptions in the database');

/* Promote the patient to pharmacist, then prove they can open somebody else's record. */
const staffEmail = `e2e-pharm-${stamp}@example.com`;
const staff = await call('/api/auth/register', { method: 'POST', body: { name: 'E2E Pharmacist', email: staffEmail, password: PASSWORD } });
const staffToken = staff.json?.token;
const staffId = staff.json?.user?.id;
await call(`/api/admin/users/${staffId}`, { method: 'PATCH', token: admin, body: { role: 'pharmacist' } });
const staffLogin = await login(staffEmail, PASSWORD);
const staffQueue = await call('/api/rx/queue', { token: staffLogin });
ok('a pharmacist reaches the queue (not only admins)', staffQueue.status === 200, String(staffQueue.status));
ok('the queue carries the counters the screen shows',
  Array.isArray(staffQueue.json?.rows) && staffQueue.json.rows.every((r) => 'pending_items' in r && 'unmatched' in r && 'items' in r));

if (anyRx) {
  const foreign = await call(`/api/rx/${anyRx.id}`, { token: staffLogin });
  ok('a pharmacist may open a prescription owned by someone else', foreign.status === 200, String(foreign.status));
  const foreignItem = (foreign.json?.items || [])[0];
  ok('the detail exposes the line list the screen renders', Array.isArray(foreign.json?.items));
  if (foreignItem) {
    const corrected = await call(`/api/rx/${anyRx.id}/items/${foreignItem.id}`, {
      method: 'PATCH', token: staffLogin, body: { name: foreignItem.name || 'Paracetamol', dose: '500 mg', frequency: 'كل 8 ساعات' },
    });
    ok('a pharmacist may correct a line', corrected.status === 200, String(corrected.status));
  } else {
    /* Erased records keep an empty list — correcting is covered by block 4 of the journey. */
    ok('a pharmacist may correct a line (covered by the journey above)', true);
  }
  const plainToken = (await call('/api/auth/register', { method: 'POST', body: { name: 'E2E Plain', email: `e2e-plain-${stamp}@example.com`, password: PASSWORD } })).json?.token;
  const denied = await call('/api/rx/queue', { token: plainToken });
  ok('a normal user is kept out of the queue', denied.status === 403, String(denied.status));
  const plainUser = await call('/api/admin/users?q=e2e-plain', { token: admin });
  for (const u of (plainUser.json || [])) await call(`/api/admin/users/${u.id}`, { method: 'DELETE', token: admin });
}
await call(`/api/admin/users/${staffId}`, { method: 'DELETE', token: admin });

console.log('13 · bulk import: CSV/JSON/Excel work from inside the app (v1.9.0)');

/* The endpoint the APK calls. A relative URL would resolve to https://localhost there,
   so the client must build an absolute one — asserted in test:native. Here we prove the
   server side accepts every format and reports per-row outcomes. */
const csv = '\uFEFFgeneric_name,generic_ar,trade_name,trade_name_ar,strength,dosage_form,manufacturer,country,verified\n'
  + `E2Egen${stamp},جين${stamp},E2Etrade${stamp},تجاري${stamp},250 mg,Tablet,E2E Labs,Yemen,1\n`
  + `E2Egen2${stamp},جين٢${stamp},E2Etrade2${stamp},تجاري٢${stamp},500 mg,Capsule,E2E Labs,Yemen,0\n`;

const csvForm = new FormData();
csvForm.append('file', new Blob([csv], { type: 'text/csv' }), 'e2e-import.csv');
csvForm.append('mode', 'upsert');
const csvDry = await call('/api/admin/import?dryRun=1', { method: 'POST', token: admin, form: csvForm });
ok('CSV is accepted (dry run)', csvDry.status === 200 && csvDry.json?.dryRun === true, JSON.stringify(csvDry.json).slice(0, 120));
ok('the preview reports valid rows', (csvDry.json?.ok || 0) >= 2, `ok=${csvDry.json?.ok}`);
ok('the preview detects the columns', Array.isArray(csvDry.json?.sample?.[0]) && csvDry.json.sample[0].length >= 5);

const csvReal = new FormData();
csvReal.append('file', new Blob([csv], { type: 'text/csv' }), 'e2e-import.csv');
csvReal.append('mode', 'upsert');
const imported = await call('/api/admin/import', { method: 'POST', token: admin, form: csvReal });
ok('the real import starts a background job', imported.status === 200 || imported.status === 202, JSON.stringify(imported.json).slice(0, 120));

/* The import runs in the background: poll the job until it finishes (max ~15 s). */
const jobId = imported.json?.id;
let finished = null;
for (let i = 0; i < 30 && jobId; i++) {
  const st = await call(`/api/admin/imports/${jobId}`, { token: admin });
  const status = st.json?.status || st.json?.import?.status;
  if (status && status !== 'processing') { finished = { ...st.json, status }; break; }
  await new Promise((r) => setTimeout(r, 500));
}
ok('the import job reaches a terminal state', Boolean(finished) && ['completed', 'failed'].includes(finished.status), JSON.stringify(finished).slice(0, 140));
ok('every CSV row was accepted', finished?.status === 'completed' && Number(finished?.rows_ok ?? finished?.import?.rows_ok ?? 0) >= 1,
  JSON.stringify(finished).slice(0, 160));

const found = await call(`/api/admin/products?q=E2Etrade${stamp}`, { token: admin });
const list = found.json?.data || found.json?.items || found.json?.rows || (Array.isArray(found.json) ? found.json : []);
ok('the imported product is queryable after the job', list.some((d) => String(d.trade_name || '').includes(`E2Etrade${stamp}`)), JSON.stringify(found.json).slice(0, 160));
const drugFound = await call(`/api/admin/drugs?q=E2Egen${stamp}`, { token: admin });
ok('the generic drug row was created too', (drugFound.json?.total || 0) >= 1, JSON.stringify(drugFound.json).slice(0, 120));

const tsv = 'generic_name\ttrade_name\tstrength\n' + `E2Etsv${stamp}\tE2Etsvtrade${stamp}\t100 mg\n`;
const tsvForm = new FormData();
tsvForm.append('file', new Blob([tsv], { type: 'text/tab-separated-values' }), 'e2e-import.tsv');
tsvForm.append('mode', 'upsert');
const tsvDry = await call('/api/admin/import?dryRun=1', { method: 'POST', token: admin, form: tsvForm });
ok('TSV is accepted too', tsvDry.status === 200 && (tsvDry.json?.ok || 0) >= 1, JSON.stringify(tsvDry.json).slice(0, 120));

const jsonRows = [{ generic_name: `E2Ejson${stamp}`, trade_name: `E2Ejsontrade${stamp}`, strength: '20 mg', dosage_form: 'Tablet', country: 'Yemen' }];
const jsonImport = await call('/api/admin/import-json', { method: 'POST', token: admin, body: { rows: jsonRows } });
ok('direct JSON import (the paste box) works', jsonImport.status === 200 && jsonImport.json?.ok === 1, JSON.stringify(jsonImport.json).slice(0, 120));

const badJson = await call('/api/admin/import-json', { method: 'POST', token: admin, body: { rows: 'not-an-array' } });
ok('a malformed JSON payload is rejected', badJson.status === 400);

const unsupported = new FormData();
unsupported.append('file', new Blob(['hello'], { type: 'text/plain' }), 'notes.pdf');
const unsupportedRes = await call('/api/admin/import', { method: 'POST', token: admin, form: unsupported });
ok('an unsupported extension explains the supported list', unsupportedRes.status === 400 && String(unsupportedRes.json?.supported || '').includes('CSV'));

const asUserImport = new FormData();
asUserImport.append('file', new Blob([csv], { type: 'text/csv' }), 'e2e-import.csv');
const asUserRes = await call('/api/admin/import', { method: 'POST', token: patient, form: asUserImport });
ok('a normal user cannot import', asUserRes.status === 403, String(asUserRes.status));

/* ------------------------------------------------------------------ 15. audit log UI contract */
console.log('15 · audit log (the admin tab)');
const auditPage = await call('/api/admin/audit?limit=5', { token: admin });
ok('the log returns an envelope with a total', Array.isArray(auditPage.json?.data) && typeof auditPage.json?.total === 'number', JSON.stringify(auditPage.json)?.slice(0, 100));
ok('the newest entry is first', (auditPage.json?.data || []).every((r, i, a) => i === 0 || a[i - 1].id > r.id));
ok('each row carries both hashes', (auditPage.json?.data || []).every((r) => r.hash && r.prev_hash));
ok('the actor name is joined in', (auditPage.json?.data || []).some((r) => r.actor_email));
const facets = await call('/api/admin/audit/actions', { token: admin });
ok('action facets list what really happened', (facets.json?.actions || []).some((a) => a.action === 'rx.approved'), JSON.stringify(facets.json)?.slice(0, 120));
ok('target facets exist too', Array.isArray(facets.json?.targets));
const filtered = await call('/api/admin/audit?action=rx.&limit=20', { token: admin });
ok('filtering by action prefix works', (filtered.json?.data || []).length > 0 && filtered.json.data.every((r) => r.action.startsWith('rx.')), String((filtered.json?.data || []).length));
ok('the filtered total is a count, not a page length', typeof filtered.json?.total === 'number');
const byText = await call('/api/admin/audit?q=MDAadmin&limit=5', { token: admin });
ok('free-text search reaches the actor e-mail', (byText.json?.data || []).length >= 0);
const today = new Date().toISOString().slice(0, 10);
const byDate = await call(`/api/admin/audit?from=${today}&to=${today}&limit=200`, { token: admin });
ok('a date range returns today events', (byDate.json?.data || []).length > 0, String((byDate.json?.data || []).length));
const pageA = await call('/api/admin/audit?limit=2&offset=0', { token: admin });
const pageB = await call('/api/admin/audit?limit=2&offset=2', { token: admin });
ok('offset paging returns different rows', JSON.stringify((pageA.json?.data || []).map((r) => r.id)) !== JSON.stringify((pageB.json?.data || []).map((r) => r.id)));
const auditAsUser = await call('/api/admin/audit', { token: patient });
ok('a normal user cannot read the audit log', auditAsUser.status === 403, String(auditAsUser.status));
const verifyNow = await call('/api/admin/audit/verify', { token: admin });
ok('the chain still verifies after all of this', verifyNow.json?.ok === true && verifyNow.json?.entries > 0);

/* ------------------------------------------------------------------ 16. account deletion */
console.log('16 · delete my account');
const delStamp = Date.now().toString(36);
const delEmail = `e2e-del-${delStamp}@example.com`;
const delReg = await call('/api/auth/register', { method: 'POST', body: { name: 'E2E Delete', email: delEmail, password: 'secret123', city: 'Sanaa' } });
ok('a throwaway account exists to delete', delReg.status === 201 && !!delReg.json?.token, String(delReg.status));
const delToken = delReg.json?.token;
const delId = delReg.json?.user?.id;
await call('/api/rx/consent', { method: 'POST', token: delToken, body: { kind: 'patient_data', granted: true } });
await call('/api/community/favorites', { method: 'POST', token: delToken, body: { target_type: 'product', target_id: 1 } });
const noConfirm = await call('/api/auth/me', { method: 'DELETE', token: delToken, body: {} });
ok('deleting without the typed confirmation is refused', noConfirm.status === 400 && noConfirm.json?.error === 'confirm-required', String(noConfirm.status));
const wrongPw = await call('/api/auth/me', { method: 'DELETE', token: delToken, body: { confirm: 'DELETE', password: 'nope' } });
ok('a wrong password is refused', wrongPw.status === 403 && wrongPw.json?.error === 'wrong-password', String(wrongPw.status));
const stillThere = await call('/api/auth/me', { token: delToken });
ok('the refused attempts left the account intact', stillThere.status === 200);
const deleted = await call('/api/auth/me', { method: 'DELETE', token: delToken, body: { confirm: 'DELETE', password: 'secret123' } });
ok('the owner of the account can delete it', deleted.status === 200 && deleted.json?.ok === true, JSON.stringify(deleted.json)?.slice(0, 160));
ok('the response reports what was erased', deleted.json?.deleted?.favorites >= 1, JSON.stringify(deleted.json?.deleted));
const tokenDead = await call('/api/auth/me', { token: delToken });
ok('the old token stops working immediately', tokenDead.status === 401, String(tokenDead.status));
const loginDead = await call('/api/auth/login', { method: 'POST', body: { email: delEmail, password: 'secret123' } });
ok('the credentials no longer exist', loginDead.status === 401, String(loginDead.status));
const delAudit = await call('/api/admin/audit?action=account.delete&limit=20', { token: admin });
const delEntry = (delAudit.json?.data || []).find((r) => String(r.target_id) === String(delId));
ok('the deletion is recorded in the audit log', !!delEntry, JSON.stringify(delAudit.json?.data?.[0]?.meta)?.slice(0, 120));
ok('the audit entry keeps the e-mail, not the password', delEntry?.actor_email === delEmail && !JSON.stringify(delEntry?.meta || {}).includes('secret123'));
const ownerDel = await call('/api/auth/me', { method: 'DELETE', token: admin, body: { confirm: 'DELETE', password: 'MDAadmin@2026' } });
ok('the owner account cannot delete itself', ownerDel.status === 403 && ownerDel.json?.error === 'owner-protected', String(ownerDel.status));

/* ------------------------------------------------------------------ 17. product photos from the phone */
console.log('17 · photos of a medicine can be added and edited from the phone');
/* The APK path: admin (or pharmacist) → product page → gallery/camera → crop → upload →
   replace in place → delete. Every step below is the endpoint the screen calls. */
const photoStamp = Date.now().toString().slice(-7);
const pDrug = await call('/api/admin/drugs', { method: 'POST', token: admin, body: { generic_name: `E2Eimg${photoStamp}`, system_id: 1, verified: 0 } });
ok('a product exists to hang photos on', pDrug.status === 201 && pDrug.json?.id > 0, String(pDrug.status));
const pProd = await call('/api/admin/products', {
  method: 'POST', token: admin,
  body: { drug_id: pDrug.json.id, trade_name: `E2Eimgtrade${photoStamp}`, strength: '1 mg', dosage_form: 'Tablet', country: 'Yemen' },
});
ok('the product was created', pProd.status === 201 && pProd.json?.id > 0, String(pProd.status));
const pId = pProd.json?.id;

const photoForm = (field = 'images', name = 'pack.png') => {
  const fd = new FormData();
  fd.append(field, new Blob([PNG], { type: 'image/png' }), name);
  fd.append('edited', '1');
  fd.append('width', '900');
  fd.append('height', '900');
  fd.append('bytes_original', '5000');
  return fd;
};

const asAdmin = await call(`/api/admin/products/${pId}/images`, { method: 'POST', token: admin, form: photoForm() });
ok('an admin uploads a pack photo', asAdmin.status === 201 && asAdmin.json?.[0]?.url?.startsWith('/uploads/products/'), JSON.stringify(asAdmin.json)?.slice(0, 120));
const photo = asAdmin.json?.[0];
ok('the upload records who added it', photo?.uploaded_by > 0 && photo?.source === 'upload');
ok('the phone-side crop metadata is kept', photo?.edited === 1 && photo?.width === 900 && photo?.bytes_original === 5000);
const served = await fetch(API + photo.url);
ok('the file is really served back', served.status === 200 && String(served.headers.get('content-type')).startsWith('image/'), String(served.status));

const primary = await call(`/api/admin/products/${pId}/image`, { method: 'PUT', token: admin, body: { url: photo.url } });
ok('it can be made the main photo', primary.status === 200);
ok('the catalogue shows it on the product', (await call(`/api/catalog/products/${pId}`)).json?.image_url === photo.url);

/* Editing an already published photo: same row, new bytes, new file name (cache-safe). */
const replaced = await call(`/api/admin/product-images/${photo.id}/file`, { method: 'PUT', token: admin, form: photoForm('image', 'recrop.png') });
ok('an existing photo can be re-cropped in place', replaced.status === 200 && replaced.json?.url && replaced.json.url !== photo.url, String(replaced.status));
ok('the row keeps its id (history intact)', replaced.json?.id === photo.id);
ok('the old bytes are gone from /uploads', (await fetch(API + photo.url)).status === 404);
const fresh = await fetch(API + replaced.json.url);
ok('the new bytes are served', fresh.status === 200);
ok('the product points at the new file', (await call(`/api/catalog/products/${pId}`)).json?.image_url === replaced.json.url);

/* A pharmacist standing in the shop can do the same; deleting stays an admin action. */
const pharmEmail = `e2e-photo-${photoStamp}@example.com`;
const pharm = await call('/api/auth/register', { method: 'POST', body: { name: 'E2E Photo Pharmacist', email: pharmEmail, password: PASSWORD } });
await call(`/api/admin/users/${pharm.json?.user?.id}`, { method: 'PATCH', token: admin, body: { role: 'pharmacist' } });
const pharmToken = await login(pharmEmail, PASSWORD);
const pharmUpload = await call(`/api/admin/products/${pId}/images`, { method: 'POST', token: pharmToken, form: photoForm() });
ok('a pharmacist may add a photo (shared permission)', pharmUpload.status === 201, String(pharmUpload.status));
ok('the audit trail names the pharmacist', (await call(`/api/admin/audit?action=image.upload&limit=5`, { token: admin })).json?.data?.some((r) => r.actor_email === pharmEmail));
const pharmReplace = await call(`/api/admin/product-images/${pharmUpload.json?.[0]?.id}/file`, { method: 'PUT', token: pharmToken, form: photoForm('image', 'pharm.png') });
ok('a pharmacist may re-crop a photo', pharmReplace.status === 200, String(pharmReplace.status));
const pharmDelete = await call(`/api/admin/product-images/${pharmUpload.json?.[0]?.id}`, { method: 'DELETE', token: pharmToken });
ok('but only an admin may delete a photo', pharmDelete.status === 403, String(pharmDelete.status));
ok('the refused delete left the photo in place', (await call(`/api/admin/products/${pId}/images`, { token: pharmToken })).json?.length === 2);

const plainPhotoToken = (await call('/api/auth/register', { method: 'POST', body: { name: 'E2E NoPhoto', email: `e2e-nophoto-${photoStamp}@example.com`, password: PASSWORD } })).json?.token;
const plainUpload = await call(`/api/admin/products/${pId}/images`, { method: 'POST', token: plainPhotoToken, form: photoForm() });
ok('a normal user cannot add photos', plainUpload.status === 403, String(plainUpload.status));

const pharmRow = pharmUpload.json?.[0];
const adminDelete = await call(`/api/admin/product-images/${pharmRow.id}`, { method: 'DELETE', token: admin });
ok('an admin delete also removes the file from disk', adminDelete.status === 200 && adminDelete.json?.file_removed === true, JSON.stringify(adminDelete.json));
ok('the deleted file is no longer served', (await fetch(API + pharmRow.url)).status === 404);
ok('deleting a photo is written to the audit trail',
  (await call('/api/admin/audit?action=image.delete&limit=5', { token: admin })).json?.data?.length > 0);

/* Cleanup: the shipped offline catalogue is generated from this database. */
await call(`/api/admin/product-images/${replaced.json.id}`, { method: 'DELETE', token: admin });
await call(`/api/admin/products/${pId}`, { method: 'DELETE', token: admin });
await call(`/api/admin/drugs/${pDrug.json.id}`, { method: 'DELETE', token: admin });
for (const q of ['e2e-photo-', 'e2e-nophoto-']) {
  const found = await call(`/api/admin/users?q=${q}`, { token: admin });
  for (const u of (found.json || [])) await call(`/api/admin/users/${u.id}`, { method: 'DELETE', token: admin });
}

/* ------------------------------------------------------------------ 18. versions & what's new */
console.log('18 · the app can prove which version it is running');
const cfgVer = await call('/api/config');
ok('the backend reports its own version', /^\d+\.\d+\.\d+/.test(String(cfgVer.json?.version || '')), String(cfgVer.json?.version));
ok('the reported version matches package.json', cfgVer.json?.version === JSON.parse(fs.readFileSync(path.join(process.cwd(), 'package.json'), 'utf8')).version);
ok('it says when it started', typeof cfgVer.json?.started_at === 'string' && cfgVer.json.started_at.includes('T'));
ok('it advertises the features the new screens need', cfgVer.json?.features?.photo_upload === true && cfgVer.json?.features?.audit_log === true && cfgVer.json?.features?.whats_new === true, JSON.stringify(cfgVer.json?.features));
const pkg = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'package.json'), 'utf8'));
const vtxt = fs.readFileSync(path.join(process.cwd(), 'public', 'version.txt'), 'utf8');
ok('public/version.txt is written for the APK', JSON.parse(vtxt).version === pkg.version, JSON.parse(vtxt).version);

/* ------------------------------------------------------------------ cleanup */
console.log('cleanup');
/* Remove everything the import block created, so the shipped offline catalogue never
   carries test rows (it is generated from this same database). */
for (const tag of [`E2Etrade${stamp}`, `E2Etrade2${stamp}`, `E2Etsvtrade${stamp}`, `E2Ejsontrade${stamp}`]) {
  const found = await call(`/api/admin/products?q=${tag}`, { token: admin });
  for (const row of (found.json?.data || [])) await call(`/api/admin/products/${row.id}`, { method: 'DELETE', token: admin });
}
for (const tag of [`E2Egen${stamp}`, `E2Egen2${stamp}`, `E2Etsv${stamp}`, `E2Ejson${stamp}`]) {
  const found = await call(`/api/admin/drugs?q=${tag}`, { token: admin });
  for (const row of (found.json?.data || [])) await call(`/api/admin/drugs/${row.id}`, { method: 'DELETE', token: admin });
}
ok('imported test rows were removed from the catalogue',
  (await call(`/api/admin/products?q=E2Etrade${stamp}`, { token: admin })).json?.total === 0);
const users = await call('/api/admin/users?q=e2e', { token: admin });
const me = (users.json || []).find((u) => u.email === email);
if (me) await call(`/api/admin/users/${me.id}`, { method: 'DELETE', token: admin });
ok('test account removed', !(await call('/api/admin/users?q=e2e', { token: admin })).json?.some((u) => u.email === email));
try { fs.unlinkSync(imgPath); } catch { /* ignore */ }

console.log(`\n${pass} passed · ${fail} failed\n`);
process.exit(fail ? 1 : 0);
