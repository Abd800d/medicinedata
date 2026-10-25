#!/usr/bin/env node
/*
 * The catalogue engine runs on both sides: the Express API and the offline app.
 * Keep a single source of truth in server/lib and copy it into src/lib/core on every build,
 * so search ranking / pack artwork can never drift between server and APK.
 */
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const FILES = ['search.js', 'packArt.js'];
const BANNER = (name) => `/* AUTO-GENERATED from server/lib/${name} by scripts/sync-core.mjs — do not edit here. */\n`;

fs.mkdirSync(path.join(ROOT, 'src/lib/core'), { recursive: true });
let changed = 0;
for (const name of FILES) {
  const src = path.join(ROOT, 'server/lib', name);
  const dst = path.join(ROOT, 'src/lib/core', name);
  const body = BANNER(name) + fs.readFileSync(src, 'utf8');
  const prev = fs.existsSync(dst) ? fs.readFileSync(dst, 'utf8') : '';
  if (prev !== body) { fs.writeFileSync(dst, body); changed++; }
  console.log(`${prev === body ? '=' : '↻'} src/lib/core/${name}`);
}
console.log(changed ? `✓ ${changed} shared module(s) synced` : '✓ shared modules already in sync');
