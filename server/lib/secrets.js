/*
 * Encryption for the few secrets the admin may enter inside the app (currently the AI key).
 *
 * The key is never stored in clear text and is never sent back to any client: it is
 * encrypted with AES-256-GCM using a key derived from JWT_SECRET (always present, never
 * committed to the repository). A stolen mda.db therefore does not leak a usable API key,
 * and rotating JWT_SECRET invalidates the stored key safely — the admin simply re-enters it.
 */
import crypto from 'node:crypto';
import { db, getSetting } from '../db.js';

const PEPPER = 'mda.secrets.v1';

/**
 * The key material this deployment signs and encrypts with.
 *
 * Order matters and mirrors `server/auth.js`:
 *   1. MDA_SECRET_KEY / JWT_SECRET from the environment (a deliberate deployment choice),
 *   2. the secret `auth.js` generated on first boot and persisted in `settings.jwt_secret`.
 *
 * Step 2 used to be missing here, so a server without a JWT_SECRET environment variable
 * still *signed* tokens with the generated secret but refused to encrypt an AI key with it
 * ("NO_SECRET"), making the in-app AI activation impossible on exactly the installs that
 * never set the variable — which is every phone-managed deployment.
 */
function secretMaterial() {
  const env = String(process.env.MDA_SECRET_KEY || process.env.JWT_SECRET || '').trim();
  if (env.length >= 16) return env;
  let stored = String(getSetting('jwt_secret', '') || '').trim();
  if (stored.length < 16) {
    /* Same value `server/auth.js` would create. INSERT OR IGNORE + re-read keeps two
       processes booting at once in agreement instead of each keeping its own secret. */
    db.prepare('INSERT OR IGNORE INTO settings(key,value) VALUES(?,?)')
      .run('jwt_secret', crypto.randomBytes(48).toString('hex'));
    stored = String(getSetting('jwt_secret', '') || '').trim();
  }
  return stored.length >= 16 ? stored : '';
}

function derivedKey() {
  const material = secretMaterial();
  if (!material) return null;
  /* scrypt is deliberately slow; the result is cached for the process lifetime. */
  if (!derivedKey.cache || derivedKey.material !== material) {
    derivedKey.cache = crypto.scryptSync(material, PEPPER, 32);
    derivedKey.material = material;
  }
  return derivedKey.cache;
}

/** Can we encrypt at rest? False when the deployment has no JWT_SECRET. */
export const secretsAvailable = () => Boolean(derivedKey());

/** @returns {string|null} `v1:<iv>:<tag>:<ciphertext>` (all base64url) */
export function encryptSecret(plain) {
  const key = derivedKey();
  if (!key) return null;
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const data = Buffer.concat([cipher.update(String(plain), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return ['v1', iv.toString('base64url'), tag.toString('base64url'), data.toString('base64url')].join(':');
}

/** @returns {string|null} cleartext, or null when the blob is unusable/tampered. */
export function decryptSecret(blob) {
  const key = derivedKey();
  if (!key || !blob || typeof blob !== 'string') return null;
  const [version, ivB64, tagB64, dataB64] = blob.split(':');
  if (version !== 'v1' || !ivB64 || !tagB64 || !dataB64) return null;
  try {
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(ivB64, 'base64url'));
    decipher.setAuthTag(Buffer.from(tagB64, 'base64url'));
    return Buffer.concat([decipher.update(Buffer.from(dataB64, 'base64url')), decipher.final()]).toString('utf8');
  } catch {
    return null;
  }
}

/** `gsk_1a2b…c9f0` — enough to recognise a key, useless to anyone else. */
export function maskSecret(value) {
  const s = String(value || '');
  if (!s) return null;
  if (s.length <= 10) return '••••';
  return `${s.slice(0, 4)}…${s.slice(-4)}`;
}
