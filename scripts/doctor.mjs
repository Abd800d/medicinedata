#!/usr/bin/env node
/*
 * MDA doctor — "why is localhost not working?"
 *
 *   npm run doctor
 *
 * Every check prints what it actually observed, not what it expected. When something is
 * broken it prints the exact error text and the exact command that fixes it. The last check
 * boots a real API on a free port and calls /api/health, so a green run means the backend
 * really serves HTTP on this machine — not that a file exists.
 *
 * Exit code 0 = everything needed for `npm run dev` works; 1 = at least one blocker.
 */
import { spawn } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync, unlinkSync, mkdirSync } from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const C = {
  reset: '\x1b[0m', dim: '\x1b[2m', bold: '\x1b[1m',
  red: '\x1b[31m', green: '\x1b[32m', yellow: '\x1b[33m', cyan: '\x1b[36m',
};
const results = [];
const record = (name, ok, detail, fix, blocker = true) => {
  results.push({ name, ok, detail, fix, blocker });
  const mark = ok ? `${C.green}✓${C.reset}` : (blocker ? `${C.red}✗${C.reset}` : `${C.yellow}!${C.reset}`);
  console.log(`${mark} ${name}`);
  if (detail) console.log(`   ${C.dim}${detail.split('\n').join(`\n   `)}${C.reset}`);
  if (!ok && fix) console.log(`   ${C.cyan}→ ${fix}${C.reset}`);
};

const readText = (p) => { try { return readFileSync(p, 'utf8'); } catch { return ''; } };
const rel = (p) => path.relative(ROOT, p) || '.';

/* ------------------------------------------------------------------ 1. Node */
const nodeMajor = Number(process.versions.node.split('.')[0]);
const pkg = (() => { try { return JSON.parse(readText(path.join(ROOT, 'package.json'))); } catch { return {}; } })();
const wantNode = String(pkg.engines?.node || '>=20');
record(
  `Node ${process.versions.node} (package.json wants "${wantNode}")`,
  nodeMajor >= 20,
  `execPath: ${process.execPath}\nplatform: ${process.platform}/${process.arch}`,
  'Install Node 20 or 22 (LTS) and re-run. With nvm:  nvm install 22 && nvm use 22',
);

/* ------------------------------------------------------- 2. dependencies exist */
const modules = path.join(ROOT, 'node_modules');
const missingDeps = !existsSync(modules);
const depCount = missingDeps ? 0 : readdirSync(modules).length;
record(
  missingDeps ? 'node_modules is missing' : `node_modules present (${depCount} entries)`,
  !missingDeps,
  missingDeps ? `no directory at ${rel(modules)}` : '',
  'Run:  npm install   (or `npm ci` for a clean, lockfile-exact install)',
);

/* ------------------------------------------- 3. better-sqlite3 native binding */
let sqliteOk = false;
let sqliteDetail = '';
let sqliteFix = 'Run:  npm rebuild better-sqlite3   (then restart the API)';
try {
  const { createRequire } = await import('node:module');
  const req = createRequire(import.meta.url);
  const Database = req('better-sqlite3');
  const db = new Database(':memory:');
  db.exec('CREATE TABLE proof(a INTEGER)');
  db.prepare('INSERT INTO proof VALUES (?)').run(42);
  const row = db.prepare('SELECT a FROM proof').get();
  db.close();
  sqliteOk = row?.a === 42;
  sqliteDetail = `better-sqlite3 ${req('better-sqlite3/package.json').version} — in-memory insert/select round-trip OK`;
} catch (e) {
  sqliteDetail = String(e?.message || e);
  if (/Cannot find module/.test(sqliteDetail) && missingDeps) {
    sqliteFix = 'Not installed yet — run:  npm install';
  } else if (/Cannot find module/.test(sqliteDetail)) {
    sqliteFix = 'The package itself is missing from node_modules. Run:  npm install';
  } else if (/NODE_MODULE_VERSION/.test(sqliteDetail)) {
    sqliteFix = 'The native binding was compiled for a different Node version (you switched Node after installing). Run:  npm rebuild better-sqlite3';
  } else if (/GLIBC|libstdc\+\+/.test(sqliteDetail)) {
    sqliteFix = 'The prebuilt binary does not match this OS/libc. Run:  npm rebuild better-sqlite3 --build-from-source   (needs build-essential + python3)';
  }
}
record('better-sqlite3 native binding', sqliteOk, sqliteDetail, sqliteFix);

/* ------------------------------------------------------------------ 4. .env */
const envPath = path.join(ROOT, '.env');
const hasEnv = existsSync(envPath);
const envRaw = readText(envPath);
const env = Object.fromEntries(envRaw.split('\n')
  .map((l) => l.trim())
  .filter((l) => l && !l.startsWith('#') && l.includes('='))
  .map((l) => {
    const i = l.indexOf('=');
    return [l.slice(0, i).trim(), l.slice(i + 1).trim()];
  }));
const keysOfInterest = ['PORT', 'HOST', 'JWT_SECRET', 'OWNER_EMAIL', 'ADMIN_EMAIL', 'ADMIN_PASSWORD', 'AI_API_KEY', 'GOOGLE_CLIENT_ID'];
const present = keysOfInterest.filter((k) => env[k]);
const absent = keysOfInterest.filter((k) => !env[k]);
record(
  hasEnv ? `.env found (${present.length} keys set)` : '.env is absent — this is allowed',
  true,
  hasEnv
    ? `set: ${present.join(', ') || '(none)'}\nnot set: ${absent.join(', ') || '(none)'}`
    : 'The server generates its own JWT secret and uses the documented defaults\n(owner 7a8b1d@gmail.com / MDAadmin@2026). Nothing crashes without .env.',
  'To pin values:  cp .env.example .env   then edit it',
  false,
);
if (hasEnv && env.JWT_SECRET && /^change-me/i.test(env.JWT_SECRET)) {
  record('JWT_SECRET is still the placeholder value', false,
    `.env has JWT_SECRET=${env.JWT_SECRET}`,
    'Dev: fine. Production: replace with 96 random chars — node -e "console.log(require(\'crypto\').randomBytes(48).toString(\'hex\'))"', false);
}

/* ------------------------------------------------------------ 5. data folder */
let dataOk = true;
let dataDetail = '';
const dataDir = path.resolve(ROOT, env.DATA_DIR || 'data');
try {
  mkdirSync(dataDir, { recursive: true });
  const probe = path.join(dataDir, `.doctor-${process.pid}`);
  writeFileSync(probe, 'ok');
  unlinkSync(probe);
  const dbFile = path.resolve(ROOT, env.DB_FILE || path.join(dataDir, 'mda.db'));
  dataDetail = `writable: ${rel(dataDir)}\ndatabase: ${rel(dbFile)} ${existsSync(dbFile) ? `(${(statSync(dbFile).size / 1024 / 1024).toFixed(1)} MB, created ${statSync(dbFile).mtime.toISOString().slice(0, 10)})` : '(not created yet — the first boot seeds it)'}`;
} catch (e) {
  dataOk = false;
  dataDetail = String(e?.message || e);
}
record('data directory is writable', dataOk, dataDetail, 'Fix permissions: the process must be able to create files in ./data (or set DATA_DIR to a writable path).');

/* ------------------------------------------------------ 6. ports 4000 / 5173 */
const probePort = (port) => new Promise((resolve) => {
  const sock = net.connect({ host: '127.0.0.1', port });
  const done = (busy) => { sock.destroy(); resolve(busy); };
  sock.setTimeout(600);
  sock.once('connect', () => done(true));
  sock.once('timeout', () => done(false));
  sock.once('error', () => done(false));
});
const busy4000 = await probePort(4000);
const busy5173 = await probePort(5173);
if (busy4000) {
  let healthText = '';
  let isMda = false;
  try {
    const r = await fetch('http://127.0.0.1:4000/api/health', { signal: AbortSignal.timeout(2500) });
    healthText = `GET http://127.0.0.1:4000/api/health → HTTP ${r.status} ${(await r.text()).slice(0, 80)}`;
    isMda = r.ok && /"app"\s*:\s*"MDA"/.test(healthText);
  } catch (e) {
    healthText = `port 4000 is open but does not answer HTTP /api/health: ${e?.message || e}`;
  }
  if (isMda) {
    record('port 4000 is held by a healthy MDA API (good — it is already running)', true,
      healthText + '\nNothing to fix: reuse this instance, or stop it before `npm run dev`.',
      'If you want a fresh start:  lsof -i :4000  (macOS/Linux)  ·  netstat -ano | findstr :4000  (Windows)', false);
  } else {
    record('port 4000 is taken by another program', false, healthText,
      'Find and stop the squatter, then restart:\n  macOS/Linux:  lsof -i :4000        then:  kill <PID>\n  Windows:      netstat -ano | findstr :4000   then:  taskkill /PID <PID> /F\nOr change PORT in .env AND server.proxy["/api"].target in vite.config.ts to the same new port.');
  }
} else {
  record('port 4000 is free', true, 'nothing is listening on 127.0.0.1:4000');
}
record('port 5173 is ' + (busy5173 ? 'in use' : 'free'), !busy5173,
  busy5173 ? 'another Vite instance is running (strictPort:true makes Vite refuse to start)' : 'nothing is listening on 127.0.0.1:5173',
  'Stop the other Vite process, or run:  npx vite --port 5174', false);

/* ------------------------------------------------- 7. vite proxy + app files */
const viteCfg = readText(path.join(ROOT, 'vite.config.ts'));
const hasProxy = /'\/api':\s*\{\s*target:\s*'http:\/\/127\.0\.0\.1:4000'/.test(viteCfg);
const proxyPort = (viteCfg.match(/target:\s*'http:\/\/127\.0\.0\.1:(\d+)'/) || [])[1];
record('Vite proxies /api to the API', hasProxy,
  hasProxy ? `target: http://127.0.0.1:${proxyPort}  (dev server: ${(viteCfg.match(/port:\s*(\d+)/) || [])[1]})` : `no proxy rule found in vite.config.ts`,
  'The proxy target must match the API port. vite.config.ts → server.proxy["/api"].target');

const appFiles = [
  ['src/lib/config.tsx', 'app config (React context)'],
  ['src/lib/auth.tsx', 'auth provider'],
  ['src/lib/api.ts', 'HTTP client'],
  ['server/index.js', 'Express entry'],
];
const missingApp = appFiles.filter(([f]) => !existsSync(path.join(ROOT, f)));
record('application source files are present', missingApp.length === 0,
  missingApp.length ? `missing: ${missingApp.map(([f]) => f).join(', ')}` : appFiles.map(([f, d]) => `${f} — ${d}`).join('\n'),
  'You are probably in the wrong directory, or the checkout is incomplete. Config lives in src/lib/config.tsx and auth in src/lib/auth.tsx (both .tsx, not .ts).');
for (const stray of ['src/lib/config.ts', 'src/lib/auth.ts']) {
  if (existsSync(path.join(ROOT, stray))) {
    record(`stray file ${stray}`, false, `${stray} exists and will shadow/confuse the .tsx module`,
      `Delete it:  rm ${stray}`, false);
  }
}

/* ------------------------------------- 8. real boot: API on a throwaway port */
const freePort = await (async () => {
  for (let p = 4310; p < 4360; p++) if (!(await probePort(p))) return p;
  return 4399;
})();
let bootOk = false;
let bootDetail = '';
const startedAt = Date.now();
const child = spawn(process.execPath, ['server/index.js'], {
  cwd: ROOT,
  env: {
    ...process.env,
    PORT: String(freePort),
    /* Prove the server works with NO Google and NO AI configured. */
    GOOGLE_CLIENT_ID: '',
    AI_API_KEY: '',
    OPENAI_API_KEY: '',
    NODE_ENV: 'development',
  },
  stdio: ['ignore', 'pipe', 'pipe'],
});
let stdout = '';
let stderr = '';
child.stdout.on('data', (d) => { stdout += d; });
child.stderr.on('data', (d) => { stderr += d; });

const waitHealth = async (ms) => {
  const until = Date.now() + ms;
  while (Date.now() < until) {
    try {
      const r = await fetch(`http://127.0.0.1:${freePort}/api/health`, { signal: AbortSignal.timeout(1200) });
      if (r.ok) return r;
    } catch { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 250));
  }
  return null;
};
const canBoot = !missingDeps && existsSync(path.join(ROOT, 'server', 'index.js'));
const healthRes = canBoot ? await waitHealth(20_000) : null;
if (!canBoot) {
  bootDetail = 'skipped — fix node_modules / server/index.js first (a boot test would only re-print those errors)';
} else if (healthRes) {
  const body = await healthRes.json().catch(() => ({}));
  const cfg = await fetch(`http://127.0.0.1:${freePort}/api/config`, { signal: AbortSignal.timeout(4000) })
    .then((r) => r.json()).catch(() => ({}));
  const bootMs = Date.now() - startedAt;
  bootOk = body?.ok === true;
  bootDetail = `spawned: node server/index.js (PORT=${freePort})\n` +
    `GET /api/health → HTTP ${healthRes.status} ${JSON.stringify(body)}\n` +
    `GET /api/config → drugs=${cfg?.counts?.drugs ?? '?'} products=${cfg?.counts?.products ?? '?'} ai_enabled=${cfg?.ai_enabled} google=${cfg?.google_oauth ?? false}\n` +
    `ready in ${bootMs} ms (no Google, no AI configured)`;
} else {
  bootDetail = `the server did not answer /api/health on port ${freePort} within 20 s\n` +
    (stderr.trim() ? `stderr:\n${stderr.trim().split('\n').slice(-12).join('\n')}` : '') +
    (stdout.trim() ? `\nstdout:\n${stdout.trim().split('\n').slice(-12).join('\n')}` : '');
}
child.kill('SIGTERM');
await new Promise((r) => setTimeout(r, 400));
if (!child.killed) child.kill('SIGKILL');
record('the API really boots and serves HTTP', canBoot ? bootOk : false, bootDetail,
  'Read the stderr above: it is the exact Node error. Common causes: better-sqlite3 ABI mismatch (npm rebuild better-sqlite3), a locked data/mda.db, or a bad .env value.');

/* ------------------------------------------------------------- 9. summary */
const blockers = results.filter((r) => !r.ok && r.blocker);
console.log(`\n${C.bold}${'-'.repeat(64)}${C.reset}`);
if (!blockers.length) {
  console.log(`${C.green}${C.bold}All good.${C.reset} Start both servers with:  ${C.cyan}npm run dev${C.reset}`);
  console.log(`   ${C.dim}API  → http://localhost:4000/api/health`);
  console.log(`   Web  → http://localhost:5173  (calls /api through the Vite proxy)${C.reset}`);
} else {
  console.log(`${C.red}${C.bold}${blockers.length} blocker(s):${C.reset}`);
  for (const b of blockers) {
    console.log(`  ${C.red}✗${C.reset} ${b.name}`);
    if (b.fix) console.log(`    ${C.cyan}${b.fix.split('\n').join(`\n    `)}${C.reset}`);
  }
}
const warnings = results.filter((r) => !r.ok && !r.blocker);
if (warnings.length) {
  console.log(`\n${C.yellow}${warnings.length} warning(s) — not blocking local development.${C.reset}`);
}
console.log(`${C.dim}node ${process.versions.node} · ${process.platform}/${process.arch} · ${rel(ROOT)}${C.reset}\n`);
process.exit(blockers.length ? 1 : 0);
