/*
 * Plan slice test (v1.12.0): verification states, product browser, interaction checker.
 *
 *   npm run test:plan        # needs the API on :4000
 *
 * Two halves, both against the real server and the real SQLite file:
 *   A. the HTTP contract — filters, facets, severity derivation, duplicates, refusals;
 *   B. the two screens mounted for real in JSDOM (no screenshot, no mock data).
 */
import { execSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HERE, '..');
const API = (process.env.API || 'http://127.0.0.1:4000').replace(/\/$/, '');
const BUNDLE = path.join(ROOT, '.smoke', 'plan.mjs');

let pass = 0;
let fail = 0;
const ok = (name, cond, extra = '') => {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✗ ${name}${extra ? ' — ' + extra : ''}`); }
};

const call = async (p, { method = 'GET', body } = {}) => {
  const res = await fetch(API + p, {
    method,
    headers: body === undefined ? {} : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  let json = null;
  try { json = await res.json(); } catch { /* empty */ }
  return { status: res.status, json };
};

console.log('\nMDA plan slice — verification · products · interactions\n');

/* ───────────────────────── A. HTTP contract ───────────────────────── */
const facets = await call('/api/catalog/products-facets');
ok('facets respond', facets.status === 200, `status ${facets.status}`);
const t = facets.json?.totals || {};
ok('facets total > 0', t.products > 0, JSON.stringify(t));
ok('facets countries counted', (facets.json?.countries || []).length > 5);
ok('facets manufacturers counted', (facets.json?.manufacturers || []).length > 0);

const all = await call('/api/catalog/products?limit=5');
ok('products page responds', all.status === 200 && Array.isArray(all.json?.data));
ok('every product row carries a verification label',
  (all.json?.data || []).every((p) => ['verified', 'unverified', 'incomplete'].includes(p.verification)));
ok('every product row carries missing_fields[]',
  (all.json?.data || []).every((p) => Array.isArray(p.missing_fields)));
ok('page size respected', (all.json?.data || []).length === 5);

const photo = await call('/api/catalog/products?has_image=1&limit=100');
ok('has_image filter returns only rows with an image',
  (photo.json?.data || []).length > 0 && (photo.json?.data || []).every((p) => !!p.image_url));
const yemen = await call('/api/catalog/products?country=Yemen&limit=100');
ok('country filter (Yemen) matches facets',
  (yemen.json?.total || 0) === ((facets.json?.countries || []).find((c) => c.value === 'Yemen')?.n ?? -1),
  `${yemen.json?.total} vs facet`);
const noHit = await call('/api/catalog/products?q=zzzzzzzz');
ok('a search that matches nothing returns an empty page, not an error',
  noHit.status === 200 && noHit.json?.total === 0);

const detail = await call('/api/catalog/products?limit=1');
const pid = detail.json?.data?.[0]?.id;
const pd = await call(`/api/catalog/products/${pid}`);
ok('product detail exposes verification + drug verification',
  pd.status === 200 && !!pd.json?.verification && !!pd.json?.drug_verification);

/* interaction search */
const s1 = await call('/api/catalog/interactions/search?q=warf');
ok('interaction search finds warfarin', (s1.json?.data || []).some((d) => /warfarin/i.test(d.generic_name)));
const oneChar = await call('/api/catalog/interactions/search?q=w');
ok('one character returns an empty list, not an error (typing must not flash errors)',
  oneChar.status === 200 && (oneChar.json?.data || []).length === 0);
const s2 = await call('/api/catalog/interactions/search?q=' + encodeURIComponent('أسبرين'));
ok('interaction search works in Arabic', (s2.json?.data || []).length > 0, JSON.stringify(s2.json).slice(0, 120));

/* the four behaviours that matter clinically */
const pair = async (body) => (await call('/api/catalog/interactions/check', { method: 'POST', body })).json;
const wa = await pair({ names: ['warfarin', 'aspirin'] });
ok('warfarin + aspirin → a documented pair', wa?.checked === 2 && wa?.pairs?.length === 1);
ok('warfarin + aspirin is NOT labelled with an invented severity',
  wa?.pairs?.[0]?.level === 'review' && wa?.pairs?.[0]?.severity_known === false,
  JSON.stringify(wa?.pairs?.[0]?.level));
const pw = await pair({ names: ['paracetamol', 'warfarin'] });
ok('paracetamol + warfarin → moderate (severity word in the stored text)',
  pw?.pairs?.[0]?.level === 'moderate', JSON.stringify(pw?.pairs?.[0]?.level));
const nd = await pair({ names: ['ibuprofen', 'diclofenac'] });
ok('ibuprofen + diclofenac → same_class duplication',
  (nd?.duplications || []).some((d) => d.kind === 'same_class'));
const dd = await pair({ names: ['aspirin', 'aspirin'] });
ok('the same drug twice → same_ingredient duplication (double dose)',
  (dd?.duplications || []).some((d) => d.kind === 'same_ingredient') && dd?.checked === 2);
ok('duplicate ingredient is never reported as "no interaction"',
  dd?.max_severity === 'major', String(dd?.max_severity));
ok('empty body → 400', (await call('/api/catalog/interactions/check', { method: 'POST', body: {} })).status === 400);
ok('a single resolvable drug → 422', (await call('/api/catalog/interactions/check', { method: 'POST', body: { names: ['warfarin'] } })).status === 422);
ok('unknown names → 422', (await call('/api/catalog/interactions/check', { method: 'POST', body: { names: ['zzzz', 'qqqq'] } })).status === 422);
ok('more than 25 drugs → 400',
  (await call('/api/catalog/interactions/check', { method: 'POST', body: { names: Array(26).fill('aspirin') } })).status === 400);
ok('every answer carries its limits and a disclaimer',
  Array.isArray(wa?.limits) && wa.limits.length >= 2 && !!wa.disclaimer_ar && !!wa.disclaimer_en);
ok('the disclaimer refuses to declare safety', /سلامة|safe/i.test(wa.disclaimer_ar + wa.disclaimer_en));

/* ─────────────── Expiry guardian: 180/90/60/30 buckets ─────────────── */
const login = async () => {
  const r = await call('/api/auth/login', { method: 'POST', body: { email: process.env.EMAIL || '7a8b1d@gmail.com', password: process.env.PASSWORD || 'MDAadmin@2026' } });
  return r.json?.token || null;
};
const token = await login();
const authed = async (p, { method = 'GET', body } = {}) => {
  const res = await fetch(API + p, {
    method,
    headers: { Authorization: `Bearer ${token}`, ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  let json = null; try { json = await res.json(); } catch { /* empty */ }
  return { status: res.status, json };
};
if (token) {
  const before = (await authed('/api/pharmacy')).json?.summary?.expiry_buckets || { d30: 0, d60: 0, d90: 0, d180: 0 };
  const made = [];
  for (const d of [10, 45, 80, 150, 365]) {
    const expiry = new Date(Date.now() + d * 864e5).toISOString().slice(0, 10);
    const r = await authed('/api/pharmacy', { method: 'POST', body: { name: `test-batch-${d}`, quantity: 3, expiry_date: expiry } });
    if (r.json?.id) made.push(r.json.id);
  }
  const ph = await authed('/api/pharmacy');
  const b = ph.json?.summary?.expiry_buckets || {};
  const delta = { d30: b.d30 - before.d30, d60: b.d60 - before.d60, d90: b.d90 - before.d90, d180: b.d180 - before.d180 };
  ok('expiry guardian buckets land in the nearest window (10/45/80/150/365 days)',
    delta.d30 === 1 && delta.d60 === 1 && delta.d90 === 1 && delta.d180 === 1, JSON.stringify({ before, after: b }));
  ok('a batch beyond 180 days is in no alert window',
    delta.d30 + delta.d60 + delta.d90 + delta.d180 === 4, JSON.stringify(delta));
  for (const id of made) await authed(`/api/pharmacy/${id}`, { method: 'DELETE' });
  const after = await authed('/api/pharmacy');
  ok('test batches are removed again', !(after.json?.items || []).some((i) => /test-batch-/.test(i.name)));
} else {
  ok('admin login for pharmacy checks', false, 'login failed');
}

/* ───────────────────────── B. the screens ───────────────────────── */
execSync(
  `npx esbuild scripts/plan-entry.tsx --bundle --format=esm --platform=browser --jsx=automatic --loader:.tsx=tsx --outfile=${BUNDLE} --log-level=error --define:process.env.NODE_ENV='"development"'`,
  { cwd: ROOT, stdio: 'inherit' },
);

const dom = new JSDOM('<!doctype html><html><head></head><body></body></html>', { url: 'https://localhost/', pretendToBeVisual: true });
globalThis.window = dom.window;
globalThis.document = dom.window.document;
Object.defineProperty(globalThis, 'navigator', { value: dom.window.navigator, configurable: true });
globalThis.HTMLElement = dom.window.HTMLElement;
globalThis.HTMLInputElement = dom.window.HTMLInputElement;
globalThis.Element = dom.window.Element;
globalThis.Node = dom.window.Node;
globalThis.localStorage = dom.window.localStorage;
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
/* point the app at the test server instead of the baked production fallback */
dom.window.localStorage.setItem('mda.apiBase', API);
dom.window.matchMedia = (q) => ({ matches: false, media: q, onchange: null, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, dispatchEvent: () => false });
/* the app calls relative /api paths; in JSDOM that has no origin — point it at the server */
const realFetch = globalThis.fetch;
globalThis.fetch = (input, init) => realFetch(String(input).startsWith('/') ? API + input : input, init);
dom.window.fetch = globalThis.fetch;

const ui = await import(`${BUNDLE}?v=${Math.random()}`);

/* Products screen */
const products = ui.mountProducts();
for (let i = 0; i < 60 && !products.host.querySelector('a[href^="/products/"]'); i++) await ui.wait(100);
const cards = products.host.querySelectorAll('a[href^="/products/"]');
ok('products screen renders cards from the API', cards.length > 0, `${cards.length} cards`);
ok('products screen shows a verification badge', /موثّق|Verified|بيانات ناقصة|Incomplete/.test(products.host.textContent || ''));
ok('products screen states the verification meaning (no unearned claim)',
  /اعتمد السجل|pharmacist reviewer approved/.test(products.host.textContent || ''));

/* Interactions screen */
const inter = ui.mountInteractions();
await ui.wait(50);
const input = inter.host.querySelector('input');
ok('interactions screen renders a generic-name search box', !!input);
if (input) {
  ui.typeInto(input, 'warfarin');
  for (let i = 0; i < 60 && !inter.host.textContent?.includes('Warfarin'); i++) await ui.wait(100);
  const pick = Array.from(inter.host.querySelectorAll('button')).find((b) => /Warfarin/i.test(b.textContent || ''));
  ok('search reaches the API and lists warfarin', !!pick);
  if (pick) {
    ui.click(pick);
    const input2 = inter.host.querySelector('input');
    if (input2) ui.typeInto(input2, 'aspirin');
    for (let i = 0; i < 60 && !/Aspirin/i.test(inter.host.textContent || ''); i++) await ui.wait(100);
    const pick2 = Array.from(inter.host.querySelectorAll('button')).find((b) => /^Aspirin/i.test((b.textContent || '').trim()));
    if (pick2) ui.click(pick2);
    const checkBtn = Array.from(inter.host.querySelectorAll('button')).find((b) => /افحص|Check interactions/i.test(b.textContent || ''));
    ok('the check button becomes available after two drugs', !!checkBtn && !checkBtn.hasAttribute('disabled'));
    if (checkBtn) {
      ui.click(checkBtn);
      for (let i = 0; i < 100 && !/مذكور بلا تصنيف|Mentioned/.test(inter.host.textContent || ''); i++) await ui.wait(100);
      const txt = inter.host.textContent || '';
      ok('result renders the pair with an explicit "unclassified" label', /مذكور بلا تصنيف|Mentioned/.test(txt));
      ok('result shows the limits block', /حدود هذه الأداة|What this tool does not do/.test(txt));
      ok('result never prints the word "safe" as a verdict',
        !/(آمن تمامًا|safe to take|no interaction, safe)/i.test(txt));
    }
  }
}

console.log(`\n${fail === 0 ? '✓' : '✗'} ${pass} passed, ${fail} failed\n`);
process.exit(fail === 0 ? 0 : 1);
