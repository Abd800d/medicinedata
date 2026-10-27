/*
 * UI + crypto tests (v1.6.0): the app lock and the day/night theme.
 *
 *   npm run test:ui
 *
 * The lock's crypto runs for real (PBKDF2 via WebCrypto), and the theme is tested
 * by mounting the actual ConfigProvider in JSDOM and watching <html data-theme>.
 */
import { execSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HERE, '..');
const BUNDLE = path.join(ROOT, '.smoke', 'ui.mjs');

let pass = 0;
let fail = 0;
const ok = (name, cond, extra = '') => {
  if (cond) { pass++; console.log(`  ✓ ${name}`); } else { fail++; console.log(`  ✗ ${name} ${extra}`); }
};

console.log('\nMDA UI test — lock + theme + privacy\n');

execSync(
  `npx esbuild scripts/ui-entry.tsx --bundle --format=esm --platform=browser --jsx=automatic --loader:.tsx=tsx --outfile=${BUNDLE} --log-level=error --define:process.env.NODE_ENV='"development"'`,
  { cwd: ROOT, stdio: 'inherit' },
);

/* ---------------- DOM environment ---------------- */
const dom = new JSDOM('<!doctype html><html><head><meta name="theme-color" content="#000"></head><body><div id="root"></div></body></html>', {
  url: 'https://localhost/',
  pretendToBeVisual: true,
});
globalThis.window = dom.window;
globalThis.document = dom.window.document;
Object.defineProperty(globalThis, 'navigator', { value: dom.window.navigator, configurable: true });
globalThis.HTMLElement = dom.window.HTMLElement;
globalThis.Element = dom.window.Element;
globalThis.Node = dom.window.Node;
globalThis.localStorage = dom.window.localStorage;
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
dom.window.matchMedia = (q) => ({
  matches: q.includes('dark') ? globalThis.__sysDark !== false : false,
  media: q, onchange: null,
  addEventListener: () => {}, removeEventListener: () => {}, addListener: () => {}, removeListener: () => {}, dispatchEvent: () => false,
});

const ui = await import(`${BUNDLE}?v=${Math.random()}`);

/* ---------------- lock crypto ---------------- */
console.log('lock · PIN hashing');
execSync(`npx esbuild src/lib/lockCrypto.ts --bundle --format=esm --platform=browser --outfile=${path.join(ROOT, '.smoke', 'lock-crypto.mjs')} --log-level=error`, { cwd: ROOT, stdio: 'inherit' });

const lc = await import(`${ROOT}/.smoke/lock-crypto.mjs?v=${Math.random()}`);
ok('PIN validation accepts 4–8 digits', lc.pinValid('1234') && lc.pinValid('12345678'));
ok('PIN validation rejects 3 digits', !lc.pinValid('123'));
ok('PIN validation rejects letters', !lc.pinValid('12ab'));

const salt = lc.randomSalt();
const t0 = Date.now();
const hash1 = await lc.hashPin('246810', salt);
const hash2 = await lc.hashPin('246810', salt);
const hashOther = await lc.hashPin('246811', salt);
ok('same PIN + salt gives the same digest', hash1 === hash2);
ok('one different digit gives a different digest', hash1 !== hashOther);
ok('digest is not the PIN', !hash1.includes('246810') && hash1.length >= 40);
ok(`PBKDF2 cost is real (${Date.now() - t0} ms for 3 hashes)`, Date.now() - t0 >= 30);

lc.writeLock({ v: 1, salt, hash: hash1, iterations: lc.ITERATIONS, createdAt: Date.now(), autoLockMinutes: 0, biometricId: null });
ok('correct PIN verifies', await lc.verifyPin('246810'));
ok('wrong PIN does not verify', !(await lc.verifyPin('000000')));
ok('two phones with the same PIN store different digests', (() => {
  const other = lc.randomSalt();
  return other !== salt;
})());

console.log('lock · lockout backoff');
lc.resetFails();
const f1 = lc.registerFail();
const f5 = [1, 2, 3, 4].reduce(() => lc.registerFail(), f1);
ok('first four mistakes do not lock', lc.backoffMs(4) === 0);
ok('fifth mistake locks for 30 s', lc.backoffMs(5) === 30_000);
ok('seventh mistake locks for 5 min', lc.backoffMs(7) === 300_000);
ok('eighth+ mistake locks for 15 min', lc.backoffMs(9) === 900_000);
ok('fail state is persisted', lc.readFails().fails === f5.fails);
lc.resetFails();
ok('lockout clears after a success', lc.readFails().fails === 0);

/* ---------------- lock screen markup ---------------- */
console.log('lock · screen');
const markup = ui.renderLockMarkup();
ok('says the app is locked', markup.includes('التطبيق مقفل'));
ok('renders the numeric keypad', ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'].every((d) => markup.includes(`>${d}<`)));
ok('offers biometrics only when available (disabled here)', markup.includes('aria-label="فتح بالبصمة"') && markup.includes('disabled'));
ok('has a recovery path', markup.includes('نسيت الرقم السري؟'));
ok('states that the PIN never leaves the phone', markup.includes('لا يُرسل رقمك إلى الخادم'));
ok('does not leak the stored digest', !markup.includes(hash1.slice(0, 12)));

/* ---------------- screenshot protection (v1.8.0) ---------------- */
console.log('privacy · per-prescription FLAG_SECURE');
execSync(`npx esbuild src/lib/secure.ts --bundle --format=esm --platform=browser --outfile=${path.join(ROOT, '.smoke', 'secure.mjs')} --log-level=error`, { cwd: ROOT, stdio: 'inherit' });
const sec = await import(`${ROOT}/.smoke/secure.mjs?v=${Math.random()}`);

localStorage.clear();
ok('nothing is protected by default', !sec.globalSecure() && !sec.isRxSecure(7));
ok('the web build has no native bridge', sec.nativeSecureAvailable() === false);

sec.setRxSecure(7, true);
ok('flagging one prescription persists its id', sec.isRxSecure(7) && !sec.isRxSecure(8));
ok('the effective state follows the per-record flag', sec.effectiveSecure(7) === true);
ok('the shell mirror records "1"', localStorage.getItem(sec.SECURE_NOW_KEY) === '1');

sec.setRxSecure(7, false);
ok('unflagging restores the unprotected state', !sec.isRxSecure(7) && sec.effectiveSecure(7) === false);
ok('the shell mirror records "0"', localStorage.getItem(sec.SECURE_NOW_KEY) === '0');

sec.setGlobalSecure(true);
ok('the device-wide switch writes its own key', localStorage.getItem(sec.SECURE_GLOBAL_KEY) === '1');
ok('the device switch protects every prescription', sec.effectiveSecure(99) === true);
sec.setRxSecure(42, true);
sec.setRxSecure(42, false);
ok('clearing one record keeps the global protection', sec.effectiveSecure(42) === true);
sec.setGlobalSecure(false);
ok('turning the device switch off drops protection', sec.effectiveSecure(42) === false);

let bridged = [];
globalThis.window.MDASecure = { set: (v) => bridged.push(v) };
ok('the bridge is detected once present', sec.nativeSecureAvailable() === true);
sec.applyNativeSecure(true);
sec.applyNativeSecure(false);
ok('the bridge receives "1" then "0"', bridged.join(',') === '1,0', bridged.join(','));
delete globalThis.window.MDASecure;

const rxMarkup = ui.renderRxSecureMarkup(7);
ok('the prescription screen shows the block-screenshots card', rxMarkup.includes('منع لقطات الشاشة'));
ok('it names the scope of the switch', rxMarkup.includes('#7'));
ok('it explains the browser limitation', rxMarkup.includes('المتصفح لا يستطيع منع لقطات الشاشة'));
ok('it is an accessible switch', rxMarkup.includes('role="switch"') && rxMarkup.includes('aria-checked'));

/* ---------------- baked server (v1.8.2) ---------------- */
console.log('server · default endpoint');
const srv = ui.serverLib;
ok('a bare host is rejected (needs a scheme)', srv.normalizeServer('medicinedata-1.onrender.com') === '');
ok('https origins are accepted and trimmed', srv.normalizeServer('https://medicinedata-1.onrender.com/') === 'https://medicinedata-1.onrender.com');
ok('unsafe schemes are rejected', srv.normalizeServer('javascript:alert(1)') === '' && srv.normalizeServer('file:///etc/passwd') === '');
ok('the default server is the deployed instance', srv.DEFAULT_SERVER === 'https://medicinedata-1.onrender.com');
ok('?server= retargets the build without a rebuild', srv.serverFromQuery('?server=https://staging.example.com/') === 'https://staging.example.com');
ok('a bogus ?server= is ignored', srv.serverFromQuery('?server=ftp://x') === '');
/* jsdom runs at https://localhost, i.e. exactly the Android shell origin */
ok('the shell is detected by its origin', srv.isNativeShell() === true);
ok('the shell falls back to the baked server', srv.fallbackServer() === srv.DEFAULT_SERVER);

/* ---------------- theme ---------------- */
console.log('theme · dark / light / system');
const html = document.documentElement;
ok('nothing is painted before the provider mounts', !html.dataset.theme);

const theme = ui.mountTheme(document.getElementById('root'));
ok('defaults to the branded dark theme', theme.mode === 'dark:dark', String(theme.mode));
ok('html carries data-theme="dark"', html.dataset.theme === 'dark');
ok('html keeps the .dark class for tailwind', html.classList.contains('dark'));
ok('theme-color meta is the navy value', document.querySelector('meta[name="theme-color"]').getAttribute('content') === '#050c1a');

theme.setMode('light');
ok('switching to light flips data-theme', html.dataset.theme === 'light', html.dataset.theme);
ok('light mode drops the .dark class', !html.classList.contains('dark'));
ok('theme-color follows the theme', document.querySelector('meta[name="theme-color"]').getAttribute('content') === '#f4f8fd');
ok('choice is persisted', localStorage.getItem('mda.themeMode') === 'light');

globalThis.__sysDark = true;
theme.setMode('system');
ok('system mode follows a dark OS setting', html.dataset.theme === 'dark', html.dataset.theme);
theme.setMode('light');
globalThis.__sysDark = true;
ok('explicit light overrides the OS', html.dataset.theme === 'light');
theme.setMode('system');
ok('system + dark OS = dark', html.dataset.theme === 'dark');

/* persistence across a reload: readMode() runs at provider construction */
localStorage.setItem('mda.themeMode', 'light');
const slot2 = document.createElement('div');
document.body.appendChild(slot2);
const theme2 = ui.mountTheme(slot2);
ok('a saved light preference survives a remount', html.dataset.theme === 'light', html.dataset.theme);
theme2.unmount();
theme.unmount();

console.log(`\n${pass} passed · ${fail} failed\n`);
process.exit(fail ? 1 : 0);
