/*
 * Native HTTP transport tests — «the APK must reach the API without server-side CORS».
 *
 *   npm run test:native
 *
 * The app runs on https://localhost inside the Android WebView, so every API call is
 * cross-origin. v1.8.2 added CORS headers to the *server*, but that only helps once the
 * server is redeployed; a server still on 1.8.1 answers without them and the WebView
 * throws the response away. v1.8.3 therefore performs the requests natively, through
 * Capacitor's HTTP bridge, where the same-origin policy does not exist.
 *
 * These tests stand in for a phone: JSDOM at https://localhost (the real shell origin),
 * the native plugin replaced by a recording fake, and window.fetch booby-trapped. If a
 * request still reaches window.fetch, the test fails — which is exactly the defect the
 * user hit in the shipped APK.
 */
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HERE, '..');
const BUNDLE = path.join(ROOT, '.smoke', 'native.mjs');

let pass = 0;
let fail = 0;
const ok = (name, cond, extra = '') => {
  if (cond) { pass++; console.log(`  ✓ ${name}`); } else { fail++; console.log(`  ✗ ${name} ${extra}`); }
};

console.log('\nMDA native HTTP test — APK reaches the API without CORS\n');

/* ------------------------------------------------------------------ *
 * 1 · the shipped Capacitor configuration must enable the bridge
 * ------------------------------------------------------------------ */
console.log('config · capacitor.config.ts');
const capConfig = fs.readFileSync(path.join(ROOT, 'capacitor.config.ts'), 'utf8');
const httpBlock = capConfig.match(/CapacitorHttp:\s*\{([\s\S]*?)\}/);
ok('CapacitorHttp plugin block is present', Boolean(httpBlock));
ok('the native HTTP bridge is enabled', Boolean(httpBlock && /enabled:\s*true/.test(httpBlock[1])), httpBlock ? httpBlock[1].trim() : 'missing');
ok('webDir still points at the built SPA', /webDir:\s*'dist'/.test(capConfig));
ok('cleartext HTTP stays disabled', /allowMixedContent:\s*false/.test(capConfig));

/* ------------------------------------------------------------------ *
 * 2 · browser environment that mimics the Android shell
 * ------------------------------------------------------------------ */
const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', {
  url: 'https://localhost/',
  pretendToBeVisual: true,
});
globalThis.window = dom.window;
globalThis.document = dom.window.document;
Object.defineProperty(globalThis, 'navigator', { value: dom.window.navigator, configurable: true });
globalThis.localStorage = dom.window.localStorage;
globalThis.FileReader = dom.window.FileReader;

execSync(
  `npx esbuild scripts/native-entry.ts --bundle --format=esm --platform=browser --outfile=${BUNDLE} --log-level=error --define:process.env.NODE_ENV='"development"'`,
  { cwd: ROOT, stdio: 'inherit' },
);
const mod = await import(`${BUNDLE}?v=${Math.random()}`);
const { api, getApiBase, nativeHttp } = mod;
const { nativeFetch, nativeAvailable, __setNativePlatform, __setNativeTransport, formDataToParts } = nativeHttp;

/* Every call the app makes must land here, never in window.fetch. */
let calls = [];
let route = () => ({ status: 200, headers: { 'content-type': 'application/json' }, data: '{}' });
let fetchCalls = 0;
const fakeFetch = () => { fetchCalls++; throw new Error('window.fetch must not be used in the shell'); };
globalThis.fetch = fakeFetch;
dom.window.fetch = fakeFetch;

const useTransport = () => __setNativeTransport(async (options) => {
  calls.push(options);
  return route(options);
});

/* ------------------------------------------------------------------ *
 * 3 · availability gates
 * ------------------------------------------------------------------ */
console.log('\nnativeHttp · availability');
__setNativePlatform(null);
__setNativeTransport(null);
ok('on the web build the bridge is not used', nativeAvailable() === false);

__setNativePlatform(true);
ok('on a device the plugin from @capacitor/core is detected', nativeAvailable() === true);
const t = useTransport();
ok('native platform + plugin → available', nativeAvailable() === true);
__setNativePlatform(false);
ok('web platform + registered transport → still not used', nativeAvailable() === false);
__setNativePlatform(true);
void t;

/* ------------------------------------------------------------------ *
 * 4 · request mapping
 * ------------------------------------------------------------------ */
console.log('\nnativeHttp · request mapping');
calls = [];
route = () => ({ status: 200, headers: { 'content-type': 'application/json' }, data: '{"ok":true}' });
let res = await nativeFetch('https://medicinedata-1.onrender.com/api/health', {
  method: 'GET',
  headers: { Accept: 'application/json' },
});
ok('GET goes through the native transport', calls.length === 1 && calls[0].url.endsWith('/api/health'));
ok('method is forwarded', calls[0].method === 'GET');
ok('headers are normalised and forwarded', calls[0].headers.accept === 'application/json', JSON.stringify(calls[0].headers));
ok('the answer is a real Response object', res instanceof Response);
ok('status is preserved', res.status === 200);
ok('content-type is preserved', (res.headers.get('content-type') || '').includes('application/json'));
ok('the JSON body survives the round trip', (await res.json()).ok === true);
ok('fetch was never touched', fetchCalls === 0);

const timeouts = calls[0];
ok('connect timeout is capped for phones', timeouts.connectTimeout >= 4_000 && timeouts.connectTimeout <= 15_000, String(timeouts.connectTimeout));
ok('read timeout matches the call budget', timeouts.readTimeout === 20_000, String(timeouts.readTimeout));
ok('text response type is requested', timeouts.responseType === 'text');

calls = [];
route = () => ({ status: 204, headers: {}, data: '' });
res = await nativeFetch('https://x/api/drugs/1/favorite', { method: 'DELETE' });
ok('204 becomes an empty Response', res.status === 204 && res.body === null);

calls = [];
route = () => ({ status: 201, headers: { 'content-type': 'application/json' }, data: { id: 7, name: 'Panadol' } });
res = await nativeFetch('https://x/api/drugs', { method: 'POST', body: JSON.stringify({ name: 'Panadol' }) });
ok('object payloads are stringified', (await res.json()).id === 7);
ok('string bodies are sent as text', calls[0].dataType === 'text' && calls[0].data === '{"name":"Panadol"}');
ok('POST method is forwarded', calls[0].method === 'POST');

calls = [];
route = () => ({ status: 200, headers: {}, data: '' });
await nativeFetch('https://x/api/search', { method: 'POST', body: new URLSearchParams({ q: 'باراسيتامول' }) });
ok('URLSearchParams bodies are serialised', calls[0].data === 'q=%D8%A8%D8%A7%D8%B1%D8%A7%D8%B3%D9%8A%D8%AA%D8%A7%D9%85%D9%88%D9%84', calls[0].data);

calls = [];
route = () => ({ status: 200, headers: {}, data: '' });
await nativeFetch('https://x/api/ping');
ok('no body → no data field', !('data' in calls[0]));

/* ------------------------------------------------------------------ *
 * 5 · failures behave like fetch failures
 * ------------------------------------------------------------------ */
console.log('\nnativeHttp · failure modes');
let threw = null;
route = () => ({ status: 0, headers: {}, data: '' });
try { await nativeFetch('https://x/api/health'); } catch (e) { threw = e; }
ok('status 0 (unreachable host) throws a TypeError', threw instanceof TypeError, String(threw));

threw = null;
__setNativeTransport(() => new Promise(() => {})); /* never settles */
const started = Date.now();
try { await nativeFetch('https://x/api/health', {}, 120); } catch (e) { threw = e; }
const waited = Date.now() - started;
ok('a hanging native call is aborted', threw?.name === 'AbortError', String(threw));
ok('the abort happens close to the budget', waited >= 100 && waited < 4_000, `${waited} ms`);

threw = null;
__setNativeTransport(() => { throw new TypeError('no plugin'); });
try { await nativeFetch('https://x/api/health'); } catch (e) { threw = e; }
ok('a missing plugin surfaces as an error (never a silent hang)', Boolean(threw));

/* ------------------------------------------------------------------ *
 * 6 · prescription photo upload (FormData) stays byte-exact
 * ------------------------------------------------------------------ */
console.log('\nnativeHttp · FormData upload');
const bytes = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46]); /* JPEG magic */
const photo = new File([bytes], 'prescription.jpg', { type: 'image/jpeg' });
const form = new FormData();
form.append('note', 'وصفة بخط اليد');
form.append('image', photo);
const parts = await formDataToParts(form);
const textPart = parts.find((p) => p.key === 'note');
const filePart = parts.find((p) => p.key === 'image');
ok('text fields are sent as strings', textPart?.type === 'string' && textPart?.value === 'وصفة بخط اليد');
ok('files are sent as base64File', filePart?.type === 'base64File');
ok('the mime type is kept', filePart?.contentType === 'image/jpeg');
ok('the file name is kept', filePart?.fileName === 'prescription.jpg');
ok('the bytes are byte-exact', filePart?.value === '/9j/4AAQSkY=', String(filePart?.value));

calls = [];
route = () => ({ status: 200, headers: { 'content-type': 'application/json' }, data: '{"ok":true}' });
useTransport();
await nativeFetch('https://x/api/ai/prescription', { method: 'POST', body: form });
ok('FormData is flagged as formData', calls[0].dataType === 'formData');
ok('the boundary is left to the native layer (no content-type header)', !calls[0].headers['content-type']);

/* ------------------------------------------------------------------ *
 * 6b · backups / exports / legal pages / server probe
 * ------------------------------------------------------------------ */
console.log('\nsmartFetch · downloads and probes');
useTransport();
calls = [];
route = () => ({ status: 200, headers: { 'content-type': 'application/pdf' }, data: 'JVBERi0=' }); /* "%PDF-" */
const pdf = await nativeHttp.smartFetch('https://x/api/admin/backup', {}, 30_000, true);
const pdfBlob = await pdf.blob();
ok('binary downloads ask the plugin for an arraybuffer', calls[0].responseType === 'arraybuffer', String(calls[0].responseType));
ok('the bytes survive the base64 hop', pdfBlob.size === 5, String(pdfBlob.size));
ok('the content type is kept on the blob', pdfBlob.type === 'application/pdf', pdfBlob.type);
ok('the download did not use window.fetch', fetchCalls === 0);

calls = [];
route = () => ({ status: 200, headers: { 'content-type': 'application/json' }, data: '{"app":"MDA"}' });
const probe = await nativeHttp.smartFetch('https://medicinedata-1.onrender.com/api/health', { headers: { accept: 'application/json' } }, 25_000);
ok('the connection probe works without CORS', (await probe.json()).app === 'MDA');
ok('the probe went through the bridge', calls.length === 1 && fetchCalls === 0);

calls = [];
route = () => ({ status: 200, headers: { 'content-type': 'text/html' }, data: '<html><body>الخصوصية</body></html>' });
const legal = await nativeHttp.smartFetch('https://medicinedata-1.onrender.com/privacy', { headers: { accept: 'text/html' } }, 15_000);
ok('legal pages load inside the APK', (await legal.text()).includes('الخصوصية'));

__setNativePlatform(false);
calls = [];
let webFetchUsed = 0;
globalThis.fetch = async () => { webFetchUsed++; return new Response('{"ok":true}', { status: 200, headers: { 'content-type': 'application/json' } }); };
const webRes = await nativeHttp.smartFetch('https://x/api/health');
ok('on the web deploy smartFetch stays a normal fetch', webFetchUsed === 1 && calls.length === 0 && (await webRes.json()).ok === true);
globalThis.fetch = fakeFetch;
__setNativePlatform(true);
useTransport();

/* ------------------------------------------------------------------ *
 * 7 · the real API client uses the native path
 * ------------------------------------------------------------------ */
console.log('\napi · every request avoids the same-origin policy');
useTransport();
__setNativePlatform(true);
localStorage.clear();
fetchCalls = 0;
ok('the shell falls back to the baked server', getApiBase().startsWith('https://medicinedata-1.onrender.com'), getApiBase());

calls = [];
route = (o) => (o.url.includes('/api/health')
  ? { status: 200, headers: { 'content-type': 'application/json' }, data: '{"ok":true,"app":"MDA"}' }
  : { status: 200, headers: { 'content-type': 'application/json' }, data: '{"ok":true}' });
const health = await api.get('/api/health');
ok('health check succeeds with no CORS headers involved', health.ok === true && health.app === 'MDA');
ok('it hit the deployed host', calls[0].url === 'https://medicinedata-1.onrender.com/api/health', calls[0].url);
ok('window.fetch was still never called', fetchCalls === 0);

localStorage.setItem('mda.token', 'jwt-123');
calls = [];
route = () => ({ status: 200, headers: { 'content-type': 'application/json' }, data: '{"id":1}' });
await api.get('/api/auth/me');
ok('the bearer token travels with native requests', calls[0].headers.authorization === 'Bearer jwt-123', JSON.stringify(calls[0].headers));
localStorage.clear();

calls = [];
route = () => ({ status: 200, headers: { 'content-type': 'application/json' }, data: '{"token":"abc","user":{"id":1}}' });
const login = await api.post('/api/auth/login', { email: 'a@b.c', password: 'secret' });
ok('login posts JSON through the bridge', login.token === 'abc');
ok('the body is JSON and typed as JSON', calls[0].data === '{"email":"a@b.c","password":"secret"}' && calls[0].headers['content-type'] === 'application/json');

calls = [];
route = () => ({ status: 200, headers: { 'content-type': 'application/json' }, data: '{"ok":true}' });
const upForm = new FormData();
upForm.append('name', 'Panadol');
upForm.append('image', photo);
await api.post('/api/admin/products/1/image', upForm);
ok('photo upload uses formData + base64 parts', calls[0].dataType === 'formData' && Array.isArray(calls[0].data));
ok('the upload carries the file name', calls[0].data.some((p) => p.fileName === 'prescription.jpg'));

calls = [];
route = () => ({ status: 401, headers: { 'content-type': 'application/json' }, data: '{"error":"UNAUTHORIZED"}' });
let apiErr = null;
localStorage.setItem('mda.token', 'expired');
try { await api.get('/api/auth/me'); } catch (e) { apiErr = e; }
ok('401 still raises ApiError', apiErr?.status === 401, String(apiErr));
ok('an expired token is dropped', localStorage.getItem('mda.token') === null);
localStorage.clear();

/* network death last: it flips internal "backend is down" state for 25 s */
calls = [];
route = () => ({ status: 0, headers: {}, data: '' });
let netErr = null;
try { await api.get('/api/drugs?limit=1'); } catch (e) { netErr = e; }
ok('an unreachable host becomes a NETWORK ApiError', netErr?.message === 'NETWORK' && netErr?.status === 0, String(netErr?.message));
ok('the failure was produced natively, not by window.fetch', fetchCalls === 0 && calls.length > 0);

__setNativePlatform(null);
__setNativeTransport(null);

console.log(`\n${pass} passed · ${fail} failed\n`);
process.exit(fail ? 1 : 0);
