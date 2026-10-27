/*
 * Bake the web bundle version into a file that ships inside the app.
 *
 * Why a file and not only the `__APP_VERSION__` define: a JSON/JS constant can be minified
 * into an unrelated chunk, so "is the new code really inside this APK?" could not be answered
 * from outside. `dist/version.txt` is a plain asset: CI unpacks the APK, reads this file and
 * compares it with package.json. If they differ, the release is stopped instead of shipping
 * an APK that silently carries yesterday's UI.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));

const payload = {
  version: pkg.version,
  built_at: new Date().toISOString(),
  build: process.env.GITHUB_RUN_NUMBER || 'local',
  app: 'MDA',
};

const out = path.join(ROOT, 'public', 'version.txt');
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, `${JSON.stringify(payload)}\n`);
console.log(`✓ version.txt → v${pkg.version} (build ${payload.build})`);
