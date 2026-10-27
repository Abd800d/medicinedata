/*
 * "Sign in with Google" that works on a phone (v1.9.0).
 *
 * The old flow used Google Identity Services inside the page. Google refuses OAuth inside an
 * embedded WebView (`disallowed_useragent`), so the button either did nothing or failed in
 * the APK. The supported approach — and the one that uses the Google account already signed
 * in on the device — is the system browser:
 *
 *   app → opens  GET /api/auth/google/start   (in Chrome via Custom Tabs)
 *                └→ 302 to accounts.google.com with PKCE (S256) + state
 *       Google → GET /api/auth/google/callback?code&state
 *                └→ server swaps the code (client_secret stays on the server),
 *                   finds/creates the user and redirects back to the app:
 *                   com.mda.medicinedata://auth?token=<jwt>   (Android)
 *                   https://<host>/auth?google_token=<jwt>     (web)
 *
 * Nothing is stored in the client, no client secret ever reaches the app, and enabling it
 * needs no redeploy: the admin pastes the Client ID + Secret in the panel and they are
 * encrypted at rest with the same AES-256-GCM scheme as the AI key.
 */
import crypto from 'node:crypto';
import { db, getSetting, setSetting } from '../db.js';
import { encryptSecret, decryptSecret, secretsAvailable } from './secrets.js';

const AUTH_ENDPOINT = 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token';
const STATE_TTL_MS = 10 * 60 * 1000;
const APP_SCHEME = 'com.mda.medicinedata';

/* ---------------------------------------------------------------- config */

export function googleClientIdResolved() {
  const raw = process.env.GOOGLE_CLIENT_ID || getSetting('google_client_id', '') || '';
  return String(raw).trim();
}

/** The secret is only ever read on the server; null when the deployment/db has none. */
export function googleClientSecret() {
  const fromEnv = String(process.env.GOOGLE_CLIENT_SECRET || '').trim();
  if (fromEnv) return fromEnv;
  const blob = getSetting('google_client_secret_enc', '');
  if (!blob) return null;
  try {
    return decryptSecret(blob);
  } catch {
    return null;
  }
}

export function googleOAuthReady() {
  return Boolean(googleClientIdResolved() && googleClientSecret());
}

/** Save credentials from the admin panel. Empty secret keeps the stored one. */
export function saveGoogleCredential({ clientId, clientSecret, clearSecret }) {
  if (clientId !== undefined) setSetting('google_client_id', String(clientId || '').trim());
  if (clearSecret) {
    setSetting('google_client_secret_enc', '');
    return { has_secret: false };
  }
  const secret = String(clientSecret || '').trim();
  if (!secret) return { has_secret: Boolean(googleClientSecret()) };
  if (!secretsAvailable()) {
    throw Object.assign(new Error('JWT_SECRET is required to encrypt the Google secret'), { code: 'NO_CRYPTO' });
  }
  if (secret.length < 8) throw Object.assign(new Error('client secret looks too short'), { code: 'BAD_SECRET' });
  const blob = encryptSecret(secret);
  setSetting('google_client_secret_enc', blob);
  return { has_secret: true };
}

/* --------------------------------------------------------------- helpers */

const b64url = (buf) => buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

/** PKCE: 32 random bytes → verifier, SHA-256(verifier) → challenge. */
export function createPkce() {
  const verifier = b64url(crypto.randomBytes(32));
  const challenge = b64url(crypto.createHash('sha256').update(verifier).digest());
  return { verifier, challenge };
}

/** Only our own callback URLs may be used as the OAuth redirect (open-redirect defence). */
export function normalizeRedirect(value) {
  const raw = String(value || '').trim();
  if (!raw) return { flow: 'android', target: `${APP_SCHEME}://auth` };
  if (raw.startsWith(`${APP_SCHEME}://`)) return { flow: 'android', target: `${APP_SCHEME}://auth` };
  try {
    const url = new URL(raw);
    if (!/^https?:$/.test(url.protocol)) return null;
    /* Always come back to /auth on the same origin — never an arbitrary path. */
    url.pathname = '/auth';
    url.search = '';
    url.hash = '';
    return { flow: 'web', target: url.toString() };
  } catch {
    return null;
  }
}

/**
 * The URL Google must send the browser back to. It has to be a public https URL registered
 * on the OAuth client; when the app is behind a proxy we honour X-Forwarded-* headers.
 */
export function callbackUrl(req) {
  const configured = String(process.env.GOOGLE_REDIRECT_URI || '').trim();
  if (configured) return configured;
  const proto = String(req.headers['x-forwarded-proto'] || req.protocol || 'https').split(',')[0].trim();
  const host = String(req.headers['x-forwarded-host'] || req.headers.host || '').split(',')[0].trim();
  return `${proto}://${host}/api/auth/google/callback`;
}

/* ----------------------------------------------------------------- state */

db.exec(`CREATE TABLE IF NOT EXISTS oauth_states (
  state TEXT PRIMARY KEY,
  verifier TEXT NOT NULL,
  redirect TEXT,
  flow TEXT NOT NULL DEFAULT 'android',
  created_at INTEGER NOT NULL
)`);

export function startGoogleFlow({ redirect, host }) {
  const { verifier, challenge } = createPkce();
  const state = b64url(crypto.randomBytes(24));
  const target = normalizeRedirect(redirect || (host ? `https://${host}/auth` : ''));
  if (!target) throw Object.assign(new Error('bad redirect'), { code: 'BAD_REDIRECT' });
  db.prepare('DELETE FROM oauth_states WHERE created_at < ?').run(Date.now() - STATE_TTL_MS);
  db.prepare('INSERT INTO oauth_states(state, verifier, redirect, flow, created_at) VALUES(?,?,?,?,?)')
    .run(state, verifier, target.target, target.flow, Date.now());

  const params = new URLSearchParams({
    client_id: googleClientIdResolved(),
    redirect_uri: callbackUrl({ headers: { host }, protocol: 'https' }),
    response_type: 'code',
    scope: 'openid email profile',
    state,
    code_challenge: challenge,
    code_challenge_method: 'S256',
    access_type: 'online',
    prompt: 'select_account',
  });
  return { state, url: `${AUTH_ENDPOINT}?${params.toString()}` };
}

/** Single-use state lookup; returns null when unknown/expired. */
export function consumeState(state) {
  const row = db.prepare('SELECT * FROM oauth_states WHERE state=?').get(String(state || ''));
  if (!row) return null;
  db.prepare('DELETE FROM oauth_states WHERE state=?').run(String(state));
  if (Date.now() - Number(row.created_at) > STATE_TTL_MS) return null;
  return row;
}

/* ------------------------------------------------------------------ token */

/** Swap the authorization code for tokens. Errors carry a short machine code. */
export async function exchangeCode({ code, codeVerifier, redirectUri }) {
  const body = new URLSearchParams({
    code: String(code || ''),
    client_id: googleClientIdResolved(),
    client_secret: googleClientSecret() || '',
    redirect_uri: redirectUri,
    grant_type: 'authorization_code',
    code_verifier: codeVerifier,
  });
  let res;
  try {
    res = await fetch(TOKEN_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
      body,
    });
  } catch {
    throw Object.assign(new Error('cannot reach Google'), { code: 'GOOGLE_UNREACHABLE' });
  }
  const payload = await res.json().catch(() => ({}));
  if (!res.ok || !payload?.id_token) {
    const reason = payload?.error || `http_${res.status}`;
    throw Object.assign(new Error(`Google rejected the code (${reason})`), { code: 'GOOGLE_TOKEN_FAILED', reason });
  }
  return payload;
}

/** Verify an id_token received from the code exchange (audience + verified email). */
export async function verifyIdToken(idToken) {
  const res = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(idToken)}`);
  if (!res.ok) throw Object.assign(new Error('Invalid Google token'), { code: 'GOOGLE_TOKEN_INVALID' });
  const info = await res.json();
  const expected = googleClientIdResolved();
  if (expected && info.aud !== expected) throw Object.assign(new Error('Google audience mismatch'), { code: 'GOOGLE_AUD_MISMATCH' });
  if (!info.email) throw Object.assign(new Error('Google account has no email'), { code: 'GOOGLE_NO_EMAIL' });
  if (info.email_verified === 'false') throw Object.assign(new Error('Google email not verified'), { code: 'GOOGLE_UNVERIFIED' });
  return {
    email: String(info.email).toLowerCase(),
    name: info.name || String(info.email).split('@')[0],
    picture: info.picture || null,
    sub: info.sub,
  };
}
