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
 * 1b · the release pipeline must keep ONE signature (upgradeable APK)
 * ------------------------------------------------------------------ */
console.log('\nrelease · stable signing & self-contained APK');
const gradle = fs.readFileSync(path.join(ROOT, 'android/app/build.gradle'), 'utf8');
const workflow = fs.readFileSync(path.join(ROOT, '.github/workflows/android.yml'), 'utf8');
const ignore = fs.readFileSync(path.join(ROOT, '.gitignore'), 'utf8');
const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));

const keystorePath = path.join(ROOT, 'android/mda-distribution.keystore');
const keystore = fs.existsSync(keystorePath) ? fs.readFileSync(keystorePath) : null;
ok('a stable distribution keystore ships with the repo', Boolean(keystore && keystore.length > 1000), String(keystore?.length));
ok('the keystore really is PKCS#12 (ASN.1 SEQUENCE)', Boolean(keystore && keystore[0] === 0x30));
ok('.gitignore lets that one key through', /!android\/mda-distribution\.keystore/.test(ignore));
ok('gradle falls back to the bundled key', /mda-distribution\.keystore/.test(gradle) && /signingConfig signingConfigs\.release/.test(gradle));
ok('the Play upload key still overrides it', /MDA_KEYSTORE_PATH/.test(gradle) && /externalKeystore/.test(gradle));
ok('the bundled key is PKCS#12 with the documented alias', /storeType System\.getenv\("MDA_KEYSTORE_TYPE"\) \?: "PKCS12"/.test(gradle) && /keyAlias System\.getenv\("MDA_KEY_ALIAS"\) \?: \(useBundledCreds \? "mda"/.test(gradle));
ok('CI builds a release (not a random debug key) by default', /BT=release/.test(workflow));
ok('CI refuses to ship a Play bundle with the public key', /no AAB/.test(workflow));
ok('CI verifies the APK really contains the web bundle', /Verify the APK is self-contained/.test(workflow) && /assets\/public\/index\.html/.test(workflow));
ok('CI verifies the APK really contains the native bridge', /apk-capacitor\.json/.test(workflow));
ok('CI rejects a debuggable APK when a release was requested', /application-debuggable/.test(workflow));
const gradleVersion = (gradle.match(/versionName\(ciVersionName \?: "([^"]+)"\)/) || [])[1];
ok('the app version matches the Gradle default', gradleVersion === pkg.version, `${gradleVersion} vs ${pkg.version}`);
/* the service worker must not be registered in the shell (stale assets after an update) */
const mainTsx = fs.readFileSync(path.join(ROOT, 'src/main.tsx'), 'utf8');
ok('the PWA service worker is disabled inside the APK', /serviceWorker.*&& !isNativeShell\(\)/.test(mainTsx));

/* ------------------------------------------------------------------ *
 * 1c · no relative API URLs anywhere (v1.9.0)
 * ------------------------------------------------------------------ *
 * The import screen, the backup panel and the legal reader each had a literal
 * '/api/...' call. Inside the shell that resolves to https://localhost, i.e. the
 * packaged bundle, and every one of them failed with 404 while working on the web.
 * A literal relative API URL in src/ is therefore a defect, not a style choice.
 */
console.log('source · absolute API URLs only');
{
  const walk = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((d) => {
    const full = path.join(dir, d.name);
    return d.isDirectory() ? walk(full) : (/\.[jt]sx?$/.test(d.name) ? [full] : []);
  });
  const files = walk(path.join(ROOT, 'src'));
  const offenders = [];
  for (const file of files) {
    const text = fs.readFileSync(file, 'utf8');
    const lines = text.split('\n');
    lines.forEach((line, i) => {
      if (/\/\*|^\s*\*|^\s*\/\//.test(line)) return; /* comments may quote the old pattern */
      const rel = /(fetch|smartFetch|open|xhr\.open|axios\.\w+)\s*\(\s*[`'"]\/api\//.exec(line);
      if (rel) offenders.push(`${path.relative(ROOT, file)}:${i + 1} → ${rel[0]}`);
    });
  }
  ok('no component calls the API with a relative URL', offenders.length === 0, offenders.slice(0, 3).join(' | '));

  const apiSrc = fs.readFileSync(path.join(ROOT, 'src/lib/api.ts'), 'utf8');
  ok('apiUrl() is exported for XHR and raw-fetch callers', /export const apiUrl =/.test(apiSrc));
  const mediaSrc = fs.readFileSync(path.join(ROOT, 'src/pages/admin/Media.tsx'), 'utf8');
  ok('the import uploader uses apiUrl()', /xhr\.open\('POST', apiUrl\('\/api\/admin\/import'\)\)/.test(mediaSrc));
  const dataSrc = fs.readFileSync(path.join(ROOT, 'src/pages/admin/DataTools.tsx'), 'utf8');
  ok('the encrypted backup panel uses apiUrl() + smartFetch', /smartFetch\(apiUrl\('\/api\/admin\/backup'\)/.test(dataSrc));
  ok('the backup download asks for binary bytes', /180_000,\s*true/.test(dataSrc));
}

/* ------------------------------------------------------------------ *
 * 1d · Google deep-link parsing (v1.9.0)
 * ------------------------------------------------------------------ */
console.log('google · deep link contract');
{
  const deepSrc = fs.readFileSync(path.join(ROOT, 'src/lib/googleauth.ts'), 'utf8');
  ok('the app scheme matches AndroidManifest', /com\.mda\.medicinedata/.test(deepSrc));
  const manifest = fs.readFileSync(path.join(ROOT, 'android/app/src/main/AndroidManifest.xml'), 'utf8');
  ok('AndroidManifest registers the return scheme', /android:scheme="com\.mda\.medicinedata"[\s\S]{0,80}android:host="auth"/.test(manifest));
  ok('the manifest filter is browsable (required by Android)', /<category android:name="android\.intent\.category\.BROWSABLE"\s*\/>\s*<data android:scheme="com\.mda\.medicinedata"/.test(manifest));
  const appSrc = fs.readFileSync(path.join(ROOT, 'src/App.tsx'), 'utf8');
  ok('deep links are wired into the app tree', /<DeepLinks \/>/.test(appSrc));
  const serverOauth = fs.readFileSync(path.join(ROOT, 'server/lib/google-oauth.js'), 'utf8');
  ok('the server uses PKCE S256', /S256/.test(serverOauth) && /createHash\('sha256'\)/.test(serverOauth));
  ok('the server keeps the client secret server-side only', /client_secret: googleClientSecret\(\)/.test(serverOauth));
  ok('the server encrypts the stored secret', /encryptSecret\(secret\)/.test(serverOauth));
  ok('the callback only accepts our own scheme', /com\.mda\.medicinedata:\/\/auth/.test(serverOauth));
}

console.log('admin · audit log + account lifecycle contract');
{
  const adminSrc = fs.readFileSync(path.join(ROOT, 'src/pages/admin/Admin.tsx'), 'utf8');
  ok('the audit tab is registered in the admin panel', /id: 'audit'/.test(adminSrc) && /<AuditLog \/>/.test(adminSrc));
  const auditSrc = fs.readFileSync(path.join(ROOT, 'src/pages/admin/AuditLog.tsx'), 'utf8');
  ok('the screen reads the paginated endpoint', /\/api\/admin\/audit'/.test(auditSrc) && /limit/.test(auditSrc) && /offset/.test(auditSrc));
  ok('it verifies the hash chain from the server, not from local state', /\/api\/admin\/audit\/verify/.test(auditSrc));
  ok('it filters by action, target and date', /\{ action \}/.test(auditSrc) && /\{ target \}/.test(auditSrc) && /\{ from \}/.test(auditSrc));
  const routes = fs.readFileSync(path.join(ROOT, 'server/routes/admin.js'), 'utf8');
  ok('the endpoint exposes real facets', /router\.get\('\/audit\/actions'/.test(routes));
  const authRoutes = fs.readFileSync(path.join(ROOT, 'server/routes/auth.js'), 'utf8');
  ok('account deletion requires the typed word', /confirm-required/.test(authRoutes) && /'DELETE'/.test(authRoutes));
  ok('the owner account is protected from deletion', /owner-protected/.test(authRoutes));
  ok('the last administrator cannot delete themselves', /last-admin/.test(authRoutes));
  ok('prescription photos are removed from disk', /fs\.unlinkSync\(abs\)/.test(authRoutes));
  ok('the deletion is written to the tamper-evident log', /audit\('account\.delete'/.test(authRoutes));
  const appSrc = fs.readFileSync(path.join(ROOT, 'src/App.tsx'), 'utf8');
  ok('a real password-recovery screen exists (no fake e-mail)', /forgot-password/.test(appSrc));
  const forgotSrc = fs.readFileSync(path.join(ROOT, 'src/pages/ForgotPassword.tsx'), 'utf8');
  ok('recovery goes through WhatsApp, which works on a phone', /wa\.me\/\$\{whatsapp\}/.test(forgotSrc));
  ok('the delete card is on the profile page', /<DeleteAccountCard \/>/.test(fs.readFileSync(path.join(ROOT, 'src/pages/Profile.tsx'), 'utf8')));
}

console.log('photos · medicine pictures come from the phone gallery');
{
  const picker = fs.readFileSync(path.join(ROOT, 'src/components/ProductImages.tsx'), 'utf8');
  ok('the gallery opens with a real file input', /type="file"[^>]*accept="image\/\*"/.test(picker));
  ok('a second input asks the chooser for the camera', /capture="environment"/.test(picker));
  ok('several photos can be added in one go', /multiple/.test(picker));
  ok('the same photo can be picked twice in a row', /e\.target\.value = ''/.test(picker) || /target\.value=''/.test(picker));
  ok('photos are straightened and compressed before upload', /normalizeImage\(/.test(picker));
  ok('a published photo can be re-cropped in place', /product-images\/\$\{row\.id\}\/file/.test(picker));
  ok('the new photo can become the main one', /makePrimary/.test(picker) && /\/image`/.test(picker));
  ok('pharmacists may manage photos, deletion stays admin-only', /role === 'pharmacist'/.test(picker) && /isAdmin \?/.test(picker));
  ok('image URLs go through assetUrl (never a bare /uploads in the shell)', /assetUrl\(row\.url\)/.test(picker));
  ok('the upload carries the on-device crop numbers', /fd\.append\('width'/.test(picker) && /bytes_original/.test(picker));
  ok('no hover-only controls (invisible on a touch screen)', !/group-hover:opacity-100/.test(picker));
  ok('photos are not fetched with a raw relative URL', !/fetch\('\/api/.test(picker));

  const studio = fs.readFileSync(path.join(ROOT, 'src/components/ImageStudio.tsx'), 'utf8');
  ok('the studio applies the EXIF orientation', /imageOrientation: 'from-image'/.test(fs.readFileSync(path.join(ROOT, 'src/lib/imageFile.ts'), 'utf8')));
  ok('the studio explains an undecodable photo instead of spinning forever', /decodeErrorMessage/.test(studio));

  const lib = fs.readFileSync(path.join(ROOT, 'src/lib/imageFile.ts'), 'utf8');
  ok('HEIC is detected and explained', /heic/i.test(lib) && /HEIC/.test(lib));
  ok('a big photo is bounded before it reaches the network', /MAX_SOURCE_EDGE = 2048/.test(lib));
  ok('binary download goes through the native bridge', /smartFetch\(assetUrl\(url\)/.test(lib));

  const detail = fs.readFileSync(path.join(ROOT, 'src/pages/ProductDetail.tsx'), 'utf8');
  ok('the product page offers photo management', /<ProductImages /.test(detail));
  ok('it is shown to admins and pharmacists', /user\?\.role === 'admin' \|\| user\?\.role === 'pharmacist'/.test(detail));

  const adminRoutes = fs.readFileSync(path.join(ROOT, 'server/routes/admin.js'), 'utf8');
  ok('the replace-file endpoint exists', /router\.put\('\/product-images\/:imageId\/file'/.test(adminRoutes));
  ok('pharmacists are let through only on the listed photo routes', /STAFF_PHOTO_ROUTES/.test(adminRoutes) && /req\.user\?\.role === 'pharmacist'/.test(adminRoutes));
  ok('deleting a photo also unlinks the file', /removeUploadedFile\(img\.url\)/.test(adminRoutes));
}

console.log('release · the summary dashboard opens first and reads one snapshot');
{
  const admin = fs.readFileSync(path.join(ROOT, 'src/pages/admin/Admin.tsx'), 'utf8');
  ok('the summary is the default admin tab', /'overview'\s*\|/.test(admin) && /\|\| 'overview'/.test(admin));
  ok('the old detailed dashboard is still reachable', /id: 'dashboard'/.test(admin) && /<Dashboard \/>/.test(admin));

  const page = fs.readFileSync(path.join(ROOT, 'src/pages/admin/Overview.tsx'), 'utf8');
  ok('the screen makes exactly one request', (page.match(/useApi</g) || []).length === 1 && /\/api\/admin\/overview/.test(page));
  ok('it never invents a number when the server is silent', /\?\? '—'/.test(page) || /: '—'/.test(page));
  ok('every alert is a link to the fix', /<Link key=\{a\.id\} to=\{a\.to\}/.test(page));
  ok('the checklist links to each screen', /<Link key=\{ch\.id\} to=\{ch\.to\}/.test(page));
  ok('optional checks are marked instead of counted', /optional_failed|optional/.test(page));
  ok('it can export the summary as CSV', /overview\.csv/.test(page) && /downloadWithAuth/.test(page));
  ok('auto-refresh is opt-in, not a hidden timer', /auto-refresh/.test(page) && /setInterval/.test(page));
  ok('no chart library was added for two sparklines', !/recharts|chart\.js|victory/i.test(page));

  const lib = fs.readFileSync(path.join(ROOT, 'server/lib/overview.js'), 'utf8');
  ok('the backend score ignores optional checks', /scored = checks\.filter\(\(c\) => !c\.optional\)/.test(lib));
  ok('the backend reports the real process uptime', /process\.uptime\(\)/.test(lib));
  ok('the backend never selects password or token columns', !/password_hash|jwt_secret|api_key_enc/.test(lib));
}

console.log('release · the AI guide ships with every working link');
{
  const app = fs.readFileSync(path.join(ROOT, 'src/App.tsx'), 'utf8');
  ok('the guide has its own route', /ai-guide/.test(app) && /<AiGuide \/>/.test(app));

  const guide = fs.readFileSync(path.join(ROOT, 'src/pages/AiGuide.tsx'), 'utf8');
  ok('it links both free providers', /console\.groq\.com\/keys/.test(guide) && /aistudio\.google\.com\/apikey/.test(guide));
  ok('it links the in-app activation screen', /\/admin\?tab=ai/.test(guide));
  ok('it links the APK and the docs', /releases\/latest/.test(guide) && /docs\/TROUBLESHOOTING\.md/.test(guide));
  ok('it shows the live AI status instead of guessing', /\/api\/ai\/status/.test(guide));
  ok('it opens links through the native bridge, not window.open', /openExternal/.test(guide) && !/target="_blank"[^>]*>\(ar \?/.test(guide));
  ok('the status URL is absolute so the APK does not hit https://localhost', /apiUrl\('\/api\/ai\/status'\)/.test(guide));

  ok('المزيد links to the guide', /to="\/ai-guide"/.test(fs.readFileSync(path.join(ROOT, 'src/pages/More.tsx'), 'utf8')));
  ok('the "not enabled" card also links to it', /to="\/ai-guide"/.test(fs.readFileSync(path.join(ROOT, 'src/components/AiSetupHint.tsx'), 'utf8')));

  const doc = fs.readFileSync(path.join(ROOT, 'docs/AI-SETUP-AR.md'), 'utf8');
  ok('the same guide exists as a document with real URLs', /console\.groq\.com\/keys/.test(doc) && /releases\/latest/.test(doc));
  ok('it documents the error kinds an owner will actually see', /NO_SECRET/.test(doc) && /quota/.test(doc) && /network/.test(doc));
}

console.log('release · the update is visible, not just installed');
{
  const app = fs.readFileSync(path.join(ROOT, 'src/App.tsx'), 'utf8');
  ok('a what\'s-new screen is routed', /whats-new/.test(app) && /<WhatsNew \/>/.test(app));
  ok('a one-time sheet is mounted with the router', /<WhatsNewSheet \/>/.test(app));

  const page = fs.readFileSync(path.join(ROOT, 'src/pages/WhatsNew.tsx'), 'utf8');
  ok('the sheet is shown once per version', /shouldShowWhatsNew/.test(page) && /markVersionSeen/.test(page));
  ok('each item links to where the feature lives', /to: '\/admin\?tab=media'/.test(page) && /to: '\/review'/.test(page));
  ok('features behind a role say so instead of hiding silently', /متاح لحساب المدير أو الصيدلي/.test(page));
  ok('the theme can be switched from that screen', /export function ThemeCard/.test(page) && /setMode\(o\.key\)/.test(page) && /key: 'light'/.test(page));

  const info = fs.readFileSync(path.join(ROOT, 'src/lib/appInfo.ts'), 'utf8');
  ok('the app reads the installed APK version from Capacitor', /App\.getInfo\(\)/.test(info));
  ok('it reads the bundle version from version.txt', /version\.txt/.test(info));
  ok('it compares itself with the server', /judgeVersions/.test(info));
  ok('a phone newer than the server is explained, not hidden', /server-older/.test(info) && /Render/.test(info));

  const card = fs.readFileSync(path.join(ROOT, 'src/components/VersionCard.tsx'), 'utf8');
  ok('the versions card shows all three numbers', /Installed app/.test(card) && /Bundle in the app/.test(card) && /'Server'/.test(card));
  ok('the card is reachable from المزيد', /<VersionCard \/>/.test(fs.readFileSync(path.join(ROOT, 'src/pages/More.tsx'), 'utf8')));

  const gradle = fs.readFileSync(path.join(ROOT, 'android/app/src/main/java/com/mda/medicinedata/MainActivity.java'), 'utf8');
  ok('the shell clears the WebView cache when the version changes', /clearCacheAfterUpdate/.test(gradle) && /clearCache\(true\)/.test(gradle));
  ok('it stores the version it last ran', /lastVersionName/.test(gradle));

  const script = fs.readFileSync(path.join(ROOT, 'scripts/write-version.mjs'), 'utf8');
  ok('the bundle version is written at build time', /version\.txt/.test(script));
  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
  ok('the version file is produced on every build', /write-version/.test(pkg.scripts.prebuild));

  const ci = fs.readFileSync(path.join(ROOT, '.github/workflows/android.yml'), 'utf8');
  ok('CI refuses an APK whose bundled version differs', /stale bundle, refusing to publish/.test(ci));
  ok('CI proves the new screens are inside the APK', /whats-new/.test(ci));

  const serverCfg = fs.readFileSync(path.join(ROOT, 'server/routes/index.js'), 'utf8');
  ok('the API publishes its version and features', /version: APP_VERSION/.test(serverCfg) && /features: \{/.test(serverCfg));
  const configTs = fs.readFileSync(path.join(ROOT, 'src/lib/config.tsx'), 'utf8');
  ok('a fresh install starts on the clinical light theme', /return 'light';/.test(configTs));
}

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
/* Android's Base64.DEFAULT inserts a line break every 76 chars — the decoder must cope */
route = () => ({ status: 200, headers: { 'content-type': 'application/pdf' }, data: 'JVBE\nRi0=' }); /* "%PDF-" */
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

/* bridge missing on a device (plugin not registered / disabled): must not look like "offline" */
calls = [];
let fallbackHits = 0;
globalThis.fetch = async (url) => {
  fallbackHits++;
  if (String(url).includes('/api/health')) {
    return new Response('{"ok":true,"app":"MDA"}', { status: 200, headers: { 'content-type': 'application/json' } });
  }
  return new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } });
};
__setNativeTransport(() => { throw new Error('"CapacitorHttp" plugin is not implemented on android'); });
const rescued = await api.get('/api/health');
ok('a missing native plugin falls back to the WebView fetch', rescued.ok === true && fallbackHits === 1, `hits=${fallbackHits}`);
globalThis.fetch = fakeFetch;
useTransport();

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
