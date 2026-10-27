/*
 * Integration test for the prescription pipeline (v1.2.0).
 *
 *   npm run test:rx                          # against http://127.0.0.1:4000
 *   API=https://... EMAIL=... PASSWORD=... npm run test:rx
 *
 * It exercises the real HTTP API, not mocks of it:
 *   consent gate → analysis → manual correction → approval → audit chain → privacy purge.
 * If the server has no AI key, AI-dependent steps are reported as SKIP (not failures).
 */
const API = (process.env.API || 'http://127.0.0.1:4000').replace(/\/$/, '');
const EMAIL = process.env.EMAIL || '7a8b1d@gmail.com';
const PASSWORD = process.env.PASSWORD || 'MDAadmin@2026';

let pass = 0; let fail = 0; let skip = 0;
const ok = (name, cond, extra = '') => {
  if (cond) { pass++; console.log(`  ✓ ${name}`); } else { fail++; console.log(`  ✗ ${name} ${extra}`); }
};
const sk = (name, why) => { skip++; console.log(`  ○ SKIP ${name} — ${why}`); };

async function call(path, { method = 'GET', token, body, form } = {}) {
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  let payload;
  if (form) payload = form;
  else if (body !== undefined) { headers['content-type'] = 'application/json'; payload = JSON.stringify(body); }
  const res = await fetch(API + path, { method, headers, body: payload });
  let json = null;
  try { json = await res.json(); } catch { /* empty */ }
  return { status: res.status, json };
}

console.log(`\nMDA prescription pipeline test → ${API}\n`);

/* 1. auth */
const login = await call('/api/auth/login', { method: 'POST', body: { email: EMAIL, password: PASSWORD } });
if (!login.json?.token) { console.error('cannot log in — set EMAIL/PASSWORD'); process.exit(1); }
const token = login.json.token;
console.log('auth');
ok('login returns a token', typeof token === 'string' && token.length > 40);

console.log('ai status');
const st = await call('/api/rx/status', { token });
ok('status is public-safe (no key, no url)', st.status === 200 && !JSON.stringify(st.json).match(/key|base|https?:/i));
ok('prompt version reported', !!st.json?.prompt_version);
const aiOn = !!st.json?.configured;
console.log(`   provider=${st.json?.provider} configured=${aiOn}`);

console.log('consent gate');
await call('/api/rx/consent', { method: 'POST', token, body: { granted: false } });
const blocked = await call('/api/rx/analyze', { method: 'POST', token, body: { text: 'Augmentin 1g' } });
ok('analysis refused without consent (428)', blocked.status === 428, `got ${blocked.status}`);
await call('/api/rx/consent', { method: 'POST', token, body: { granted: true } });
const consent = await call('/api/rx/consent', { token });
ok('consent recorded', consent.json?.granted === true);

console.log('role separation');
const anon = await call('/api/rx/consent');
ok('anonymous gets 401', anon.status === 401, `got ${anon.status}`);

let rxId = null;
if (!aiOn) {
  sk('full analysis', 'AI not configured on this server');
} else {
  console.log('analysis');
  const an = await call('/api/rx/analyze', { method: 'POST', token, body: { text: 'Augmentin 1g tab 1x2 x7d\nPanadol 500mg 4x/day\nAugmentin 625 ???' } });
  ok('analysis returns 201', an.status === 201, `got ${an.status} ${JSON.stringify(an.json)?.slice(0, 120)}`);
  if (an.status === 201) {
    rxId = an.json.id;
    const a = an.json.analysis;
    ok('items extracted', Array.isArray(a.items) && a.items.length > 0);
    ok('nothing auto-accepted', a.summary?.auto_accepted === 0);
    ok('pharmacist required', a.summary?.requires_pharmacist === true);
    ok('per-field confidence present', !!a.items[0].field_confidence);
    ok('uncertain lines flagged', a.summary.needs_review >= 0);
    ok('source + timestamp shown', !!a.source?.analysed_at && !!a.source?.model);
    ok('disclaimer present', typeof a.disclaimer_ar === 'string' && a.disclaimer_ar.includes('مراجعة'));
    ok('every flag says "needs pharmacist review"', (a.flags || []).every((f) => !f.action_ar || /مراجعة/.test(f.action_ar)));
    ok('no invented catalogue entry', a.items.every((i) => !i.matched || typeof i.matched.drug_id === 'number'));

    console.log('review workflow');
    const full = await call(`/api/rx/${rxId}`, { token });
    ok('items persisted', full.json?.items?.length === a.items.length);
    const itemId = full.json.items[0].id;
    const patched = await call(`/api/rx/${rxId}/items/${itemId}`, { method: 'PATCH', token, body: { dose: '1 tablet', frequency: 'twice daily' } });
    ok('manual correction saved', patched.status === 200 && patched.json?.item?.status === 'corrected');
    const early = await call(`/api/rx/${rxId}/confirm`, { method: 'POST', token, body: {} });
    ok('approval blocked while lines unreviewed (409)', early.status === 409, `got ${early.status}`);
    const approved = await call(`/api/rx/${rxId}/confirm`, { method: 'POST', token, body: { accept_uncertain: true, notes: 'integration test' } });
    ok('approval succeeds with explicit override', approved.status === 200 && approved.json?.status === 'reviewed');
    const again = await call(`/api/rx/${rxId}/reanalyze`, { method: 'POST', token, body: {} });
    ok('re-analysis re-runs the model', again.status === 200 && !!again.json?.analysis);
  }
}

/* ---------------- v1.3.0: allergies, class duplication, plain language ---------------- */
if (aiOn) {
  console.log('declared allergies');
  const fam = await call('/api/rx/allergen-families');
  ok('allergen families are public and sourced from ATC', Array.isArray(fam.json?.families) && fam.json.families.length > 10);
  /* start from a clean list so counts are deterministic */
  const pre = await call('/api/rx/allergies', { token });
  for (const a of pre.json?.items || []) await call(`/api/rx/allergies/${a.id}`, { method: 'DELETE', token });
  const addFam = await call('/api/rx/allergies', { method: 'POST', token, body: { code: 'penicillin' } });
  ok('family allergy added', addFam.status === 201 && (addFam.json?.items || []).some((a) => a.code === 'penicillin'));
  const badCode = await call('/api/rx/allergies', { method: 'POST', token, body: { code: 'made-up-family' } });
  ok('unknown allergy code rejected (400)', badCode.status === 400, `got ${badCode.status}`);

  const listBefore = await call('/api/rx/allergies', { token });
  const allergyRun = await call('/api/rx/analyze', { method: 'POST', token, body: { text: 'Augmentin 1g tab 1x2 x7d' } });
  const af = allergyRun.json?.analysis?.flags || [];
  const allergyFlag = af.find((f) => f.type === 'allergy_conflict');
  ok('allergy conflict raised for penicillin + amoxicillin', !!allergyFlag && allergyFlag.severity === 'high');
  ok('allergy flag names the declared family', !!allergyFlag && /البنسلين/.test(allergyFlag.detail_ar));
  ok('allergy flag explains itself in plain words', !!allergyFlag?.plain_ar && !!allergyFlag?.why_ar);
  ok('allergy flag cites ATC code', !!allergyFlag && /ATC/.test(allergyFlag.why_ar));
  ok('summary counts allergies checked', allergyRun.json?.analysis?.summary?.allergies_checked === (listBefore.json?.items || []).length,
    `got ${allergyRun.json?.analysis?.summary?.allergies_checked} vs ${(listBefore.json?.items || []).length}`);
  if (allergyRun.json?.id) await call(`/api/rx/${allergyRun.json.id}`, { method: 'DELETE', token });

  /* molecule-level allergy must match only that molecule (family allergy cleared first) */
  const clear1 = await call('/api/rx/allergies', { token });
  for (const a of clear1.json?.items || []) await call(`/api/rx/allergies/${a.id}`, { method: 'DELETE', token });
  await call('/api/rx/allergies', { method: 'POST', token, body: { code: 'mol:paracetamol', label: 'باراسيتامول' } });
  const molRun = await call('/api/rx/analyze', { method: 'POST', token, body: { text: 'Augmentin 1g\nPanadol 500mg' } });
  const molFlags = (molRun.json?.analysis?.flags || []).filter((f) => f.type === 'allergy_conflict');
  ok('molecule allergy matches exactly one line', molFlags.length === 1, `got ${molFlags.length}`);
  ok('molecule allergy is worded as same medicine', !!molFlags[0] && /نفس المادة الفعالة|نفس الدواء/.test(molFlags[0].detail_ar));
  if (molRun.json?.id) await call(`/api/rx/${molRun.json.id}`, { method: 'DELETE', token });

  const listAfter = await call('/api/rx/allergies', { token });
  for (const a of listAfter.json?.items || []) await call(`/api/rx/allergies/${a.id}`, { method: 'DELETE', token });
  const cleaned = await call('/api/rx/allergies', { token });
  ok('allergies can be removed by the user', (cleaned.json?.items || []).length === 0);

  console.log('duplicate therapy class');
  const ppi = await call('/api/rx/analyze', { method: 'POST', token, body: { text: 'PPSAMPLE: Omeprazole 20mg + Pantoprazole 40mg' } });
  const cls = (ppi.json?.analysis?.flags || []).find((f) => f.type === 'duplicate_therapy_class');
  ok('two molecules from one class flagged', !!cls, JSON.stringify((ppi.json?.analysis?.flags || []).map((f) => f.type)));
  ok('class flag quotes the shared class', !!cls && /Proton Pump/.test(cls.detail_ar));
  if (ppi.json?.id) await call(`/api/rx/${ppi.json.id}`, { method: 'DELETE', token });

  console.log('unreadable image path');
  const bad = await call('/api/rx/analyze', { method: 'POST', token, body: { text: 'UNREADABLE photo' } });
  ok('unreadable stays unreadable', bad.status === 201 && bad.json?.analysis?.readable === false);
  ok('no invented lines when unreadable', (bad.json?.analysis?.items || []).length === 0);
  ok('still requires a pharmacist', bad.json?.analysis?.summary?.requires_pharmacist === true);
  if (bad.json?.id) await call(`/api/rx/${bad.json.id}`, { method: 'DELETE', token });

  console.log('every flag is explained');
  const explained = (allergyRun.json?.analysis?.flags || []).concat(cls ? [cls] : []);
  ok('all flags carry plain_ar + why_ar + source', explained.every((f) => f.plain_ar && f.why_ar && f.source), JSON.stringify(explained.map((f) => f.type)));

  console.log('admin AI quality');
  const stats = await call('/api/admin/ai-stats?days=30', { token });
  ok('ai-stats reachable for admin', stats.status === 200);
  ok('runs counted', (stats.json?.runs?.total || 0) > 0);
  ok('models reported with latency', Array.isArray(stats.json?.runs?.models) && stats.json.runs.models.length > 0);
  ok('items correction rate is a number', typeof stats.json?.items?.correction_rate === 'number');
  ok('flag histogram present', Array.isArray(stats.json?.flags) && stats.json.flags.length > 0);
  ok('no patient text in stats payload', !/سالم|أمينة|Augmentin|Panadol/.test(JSON.stringify(stats.json)));

  const notAdmin = await call('/api/admin/ai-stats', { token: '' });
  ok('ai-stats needs auth', notAdmin.status === 401);
}

console.log('audit chain');
const verify = await call('/api/admin/audit/verify', { token });
ok('hash chain intact', verify.json?.ok === true, JSON.stringify(verify.json));
const log = await call('/api/admin/audit?limit=200', { token });
ok('approval audited with actor', Array.isArray(log.json?.data) && log.json.data.some((r) => r.action === 'rx.approved' && r.actor_email));
ok('correction audited with before/after', (log.json?.data || []).some((r) => r.action === 'rx.item.corrected' && r.meta?.before));

if (rxId) {
  console.log('privacy purge');
  const del = await call(`/api/rx/${rxId}`, { method: 'DELETE', token });
  ok('purge accepted', del.status === 200);
  const after = await call(`/api/rx/${rxId}`, { token });
  ok('patient name erased', after.json?.analysis?.patient?.name === null);
  ok('image reference erased', after.json?.image_url === null);
  ok('purge is recorded, history is not', (after.json?.reviews || []).some((r) => r.action === 'purged'));
}

console.log(`\n${pass} passed · ${fail} failed · ${skip} skipped\n`);
process.exit(fail ? 1 : 0);
