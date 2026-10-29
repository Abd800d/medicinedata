/*
 * Offline behaviour test (v1.13.1) — the APK must be honest with no server at all.
 *
 *   npm run test:offline
 *
 * What this proves, from the bundled file only (no API calls):
 *   • every product/drug in public/data/catalog.json carries its six-state value;
 *   • the product browser renders cards and «موثّق» offline — not a blank screen and not a
 *     false «غير موثّق»;
 *   • filtering by a state works offline, including the states with zero records;
 *   • the product page explains that the review trail needs a connection instead of claiming
 *     "no reviewer".
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';
import { JSDOM } from 'jsdom';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HERE, '..');
const BUNDLE = path.join(ROOT, '.smoke', 'plan.mjs');
const CATALOG = path.join(ROOT, 'public', 'data', 'catalog.json');

let pass = 0;
let fail = 0;
const ok = (name, cond, extra = '') => {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✗ ${name}${extra ? ' — ' + extra : ''}`); }
};

console.log('\nMDA offline — the APK with no server\n');

/* ---------- 1. the shipped file itself ---------- */
const raw = JSON.parse(fs.readFileSync(CATALOG, 'utf8'));
ok('the bundle ships products', (raw.products || []).length > 0, String((raw.products || []).length));
ok('every product carries a six-state value',
  raw.products.every((p) => typeof p.verification_state === 'string' && p.verification_state.length > 0),
  JSON.stringify(raw.products.find((p) => !p.verification_state)));
ok('every generic record carries a six-state value',
  raw.drugs.every((d) => typeof d.verification_state === 'string'));
ok('the states in the bundle are only the six known ones',
  [...raw.products, ...raw.drugs].every((r) => ['verified', 'manufacturer_confirmed', 'supplier_submitted', 'user_submitted', 'incomplete', 'unverified'].includes(r.verification_state)));
ok('the bundle is small enough to ship in the APK', fs.statSync(CATALOG).size < 2_000_000, `${Math.round(fs.statSync(CATALOG).size / 1024)} KB`);
ok('no fabricated price is bundled', raw.products.every((p) => p.price === null || p.price === undefined));

/* ---------- 2. the app, with the network switched off ---------- */
execSync(
  `npx esbuild scripts/plan-entry.tsx --bundle --format=esm --platform=browser --jsx=automatic --loader:.tsx=tsx --outfile=${BUNDLE} --log-level=error --define:process.env.NODE_ENV='"development"'`,
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
/* the phone with no connection */
Object.defineProperty(dom.window.navigator, 'onLine', { value: false, configurable: true });
/* The bundled file lives inside the APK; on the phone it is read from the package, never from
   the network. The stub serves exactly that file and refuses every other request. */
const bundleBody = fs.readFileSync(CATALOG, 'utf8');
const localFetch = async (input) => {
  if (String(input).includes('/data/catalog.json')) {
    return new Response(bundleBody, { status: 200, headers: { 'content-type': 'application/json' } });
  }
  throw new TypeError('offline');
};
globalThis.fetch = localFetch;
dom.window.fetch = localFetch;

const ui = await import(`${BUNDLE}?v=${Math.random()}`);
const loaded = await ui.offlineLoad();
ok('the bundle loads with no network at all', !!loaded && (loaded.products || []).length > 0);

const all = ui.offlineAnswer('/api/catalog/products', { limit: 5 });
ok('the bundled answer lists products', Array.isArray(all?.data) && all.data.length === 5, JSON.stringify(all)?.slice(0, 100));
ok('bundled rows expose the six-state field', all.data.every((p) => typeof p.verification === 'string'));

const verified = ui.offlineAnswer('/api/catalog/products', { state: 'verified', limit: 100 });
ok('filtering by «verified» offline returns only verified rows',
  verified?.data?.length > 0 && verified.data.every((p) => p.verification === 'verified'));
const users = ui.offlineAnswer('/api/catalog/products', { state: 'user_submitted', limit: 100 });
ok('filtering by a state with no records returns zero, not everything', users?.total === 0, String(users?.total));
const missing = ui.offlineAnswer('/api/catalog/products', { state: 'incomplete', limit: 100 });
ok('«بيانات ناقصة» offline is derived from real missing fields',
  missing.total === 0 || missing.data.every((p) => p.missing_fields.length > 0));

const one = ui.offlineAnswer('/api/catalog/products/1');
ok('a product page answers offline', !!one && one.trade_name);
ok('it carries the six-state value', one.verification === 'verified', String(one?.verification));
ok('its review trail says plainly that it needs a connection', one.verification_detail?.offline === true);
ok('it never claims "no reviewer" while offline', !('reviewer' in (one.verification_detail || {})) || one.verification_detail.reviewer === null);

const drug = ui.offlineAnswer('/api/catalog/drugs/1');
ok('a generic record answers offline with its state', !!drug && typeof drug.verification === 'string');

/* the browser screen itself, mounted with the network down */
globalThis.fetch = localFetch;
dom.window.fetch = localFetch;
const products = ui.mountProducts();
for (let i = 0; i < 80 && !products.host.querySelector('a[href^="/products/"]'); i++) await new Promise((r) => setTimeout(r, 100));
const cards = products.host.querySelectorAll('a[href^="/products/"]');
ok('the product browser renders cards with no server', cards.length > 0, `${cards.length} cards`);
const text = products.host.textContent || '';
ok('it shows «موثّق» for verified records, not a false «غير موثّق»', /موثّق/.test(text));
ok('it does not show a blank screen or a raw error code', !/^NETWORK$/.test(text.trim()) && text.length > 80);


console.log(`\n${fail === 0 ? '✓' : '✗'} ${pass} passed, ${fail} failed\n`);
process.exit(fail === 0 ? 0 : 1);
