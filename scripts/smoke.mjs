import { JSDOM } from 'jsdom';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/*
 * MDA smoke test — renders the real SPA in jsdom against a running API.
 * Usage: npm run smoke -- / /search /systems   (defaults to a built-in route list)
 * Env:   TOKEN=<jwt>  → render signed-in state      VERBOSE=1 → print console errors
 *        API=origin   → default http://127.0.0.1:4000
 * It catches render crashes and console.error output only (no layout/paint).
 */
const HERE = path.dirname(fileURLToPath(import.meta.url));
const BUNDLE = process.env.SMOKE_BUNDLE || path.join(HERE, '..', '.smoke', 'app.mjs');
const API = process.env.API || 'http://127.0.0.1:4000';

/* Pick real catalogue ids so detail pages are exercised with live data */
const firstId = async (path) => {
  try {
    const r = await fetch(`${API}${path}`, { headers: { 'Accept-Language': 'en' } });
    const j = await r.json();
    const row = Array.isArray(j?.data) ? j.data[0] : Array.isArray(j) ? j[0] : null;
    return row?.id;
  } catch { return null; }
};
const [drugId, productId] = [await firstId('/api/catalog/drugs?limit=1'), await firstId('/api/catalog/products?limit=1')];

const DEFAULT_ROUTES = ['/', '/systems', '/systems/nervous', '/search', '/search?q=panadol',
  drugId ? `/drugs/${drugId}` : '/drugs/1', productId ? `/products/${productId}` : '/products/1',
  '/prescriptions', '/scan', '/ai', '/community', '/jobs', '/directories', '/pharmacy', '/submit-drug',
  '/about', '/profile', '/more', '/auth', '/admin', '/admin?tab=data', '/admin?tab=media', '/sync', '/offline', '/server'];


const routes = process.argv.slice(2).length ? process.argv.slice(2) : DEFAULT_ROUTES;
const results = [];

function makeDom(path) {
  const dom = new JSDOM(`<!doctype html><html dir="rtl" lang="ar"><head></head><body><div id="root"></div></body></html>`, {
    url: `${API}${path}`,
    pretendToBeVisual: true,
  });
  const { window } = dom;
  if (process.env.TOKEN) window.localStorage.setItem('mda.token', process.env.TOKEN);
  window.matchMedia = window.matchMedia || (() => ({ matches: false, addEventListener() {}, removeEventListener() {} }));
  window.scrollTo = () => {};
  window.HTMLElement.prototype.scrollIntoView = () => {};
  globalThis.window = window;
  globalThis.document = window.document;
  Object.defineProperty(globalThis, 'navigator', { value: window.navigator, configurable: true });
  globalThis.localStorage = window.localStorage;
  globalThis.sessionStorage = window.sessionStorage;
  Object.defineProperty(globalThis, 'location', { value: window.location, configurable: true });
  Object.defineProperty(globalThis, 'history', { value: window.history, configurable: true });
  globalThis.HTMLElement = window.HTMLElement;
  globalThis.Node = window.Node;
  globalThis.Element = window.Element;
  globalThis.Event = window.Event;
  globalThis.CustomEvent = window.CustomEvent;
  globalThis.getComputedStyle = window.getComputedStyle;
  globalThis.requestAnimationFrame = (cb) => setTimeout(() => cb(Date.now()), 0);
  globalThis.cancelAnimationFrame = clearTimeout;
  globalThis.matchMedia = window.matchMedia;
  globalThis.URL.createObjectURL = () => 'blob:mock';
  const nodeFetch = globalThis.fetch;
  globalThis.fetch = (input, init) => {
    const url = typeof input === 'string' ? input : input.url;
    return nodeFetch(url.startsWith('http') ? url : `${API}${url}`, init);
  };
  window.fetch = globalThis.fetch;
  return dom;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const errors = [];
const origWarn = console.warn;
console.warn = (...args) => { if (process.env.VERBOSE) origWarn(...args); };
const origError = console.error;
console.error = (...args) => { errors.push(args.map(String).join(' ').slice(0, 300)); if (process.env.VERBOSE) origError(...args); };

for (const path of routes) {
  const dom = makeDom(path);
  errors.length = 0;
  try {
    const mod = await import(`${BUNDLE}?v=${Math.random()}`);
    const root = window.document.getElementById('root');
    const r = mod.createRoot(root);
    r.render(mod.React.createElement(mod.App));
    await sleep(2500);
    const html = root.innerHTML;
    const text = root.textContent || '';
    const errCards = [...root.querySelectorAll('h1,h2,div')].map((e) => e.textContent).filter((t) => t && t.includes('Something went wrong'));
    results.push({ path, len: html.length, text: text.slice(0, 160).replace(/\s+/g, ' '), tail: text.slice(-160).replace(/\s+/g, ' '), errors: [...new Set(errors)].slice(0, 4), errCards: errCards.slice(0, 1) });
    r.unmount();
  } catch (e) {
    results.push({ path, crash: e.message });
  }
  dom.window.close();
}

console.log(JSON.stringify(results, null, 2));
