#!/usr/bin/env node
/*
 * Create the Google Play upload keystore without Android Studio (pure JS, no JDK).
 *
 *   node scripts/make-keystore.mjs --password 'a-strong-passphrase'
 *   node scripts/make-keystore.mjs                # generates a random password
 *
 * The .p12 file is written with 0600 permissions. Keep it offline + keep a copy of the
 * password: losing either means asking Google to reset your upload key.
 * See docs/PLAY.md and docs/SIGNING.md.
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { generateUploadKeystore } from '../server/lib/keystore.js';

const args = process.argv.slice(2);
const flag = (name, fallback = null) => {
  const i = args.indexOf(`--${name}`);
  if (i >= 0 && args[i + 1] && !args[i + 1].startsWith('--')) return args[i + 1];
  const inline = args.find((a) => a.startsWith(`--${name}=`));
  return inline ? inline.slice(name.length + 3) : fallback;
};

const out = path.resolve(flag('out', 'mda-upload.p12'));
const alias = flag('alias', 'mda-upload');
const force = args.includes('--force');

if (fs.existsSync(out) && !force) {
  console.error(`✗ ${out} already exists — refusing to overwrite an upload key (use --force to replace it).`);
  process.exit(1);
}

const password = flag('password') || process.env.MDA_KEYSTORE_PASSWORD
  || crypto.randomBytes(18).toString('base64url'); // 24 chars, no characters that break .env

const t0 = Date.now();
const ks = generateUploadKeystore({
  password,
  alias,
  commonName: flag('cn', 'MDA Medicine Data'),
  organization: flag('org', 'MDA'),
  country: flag('country', 'YE'),
});

fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, Buffer.from(ks.base64, 'base64'));
try { fs.chmodSync(out, 0o600); } catch { /* Windows */ }

const lines = [
  '',
  '✅ تم إنشاء مفتاح رفع Google Play (upload key)',
  '',
  `  الملف        : ${out}`,
  `  الحجم        : ${ks.bytes} بايت (PKCS#12)`,
  `  الاسم المستعار: ${alias}`,
  `  كلمة المرور  : ${password}`,
  `  صالح حتى     : ${ks.notAfter}`,
  `  SHA-256      : ${ks.sha256}`,
  `  SHA-1        : ${ks.sha1}`,
  `  المدة        : ${Date.now() - t0} ms`,
  '',
  'احفظ الملف وكلمة المرور في مكانين منفصلين — لا يمكن استرجاعهما.',
  '',
  'الخطوة التالية (من الحاسوب):',
  '',
  `  gh secret set ANDROID_KEYSTORE_BASE64   < <(base64 -w0 ${path.basename(out)})`,
  `  gh secret set ANDROID_KEYSTORE_PASSWORD --body '${password}'`,
  `  gh secret set ANDROID_KEY_ALIAS         --body '${alias}'`,
  `  gh secret set ANDROID_KEY_PASSWORD      --body '${password}'`,
  '',
  'أو من الهاتف: GitHub → Settings → Secrets and variables → Actions → New repository secret',
  '  ANDROID_KEYSTORE_BASE64   = محتوى الملف بعد base64 (استخدم زر التنزيل في صفحة الإدارة)',
  `  ANDROID_KEYSTORE_PASSWORD = ${password}`,
  `  ANDROID_KEY_ALIAS         = ${alias}`,
  `  ANDROID_KEY_PASSWORD      = ${password}`,
  '',
  'ثم أنشئ وسمًا جديدًا لبناء AAB موقّع:  git tag v1.8.0 && git push origin v1.8.0',
  '',
];
console.log(lines.join('\n'));
