/* Authentication & authorization */
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import crypto from 'node:crypto';
import { db, getSetting, setSetting } from './db.js';

const SECRET = (() => {
  if (process.env.JWT_SECRET) return process.env.JWT_SECRET;
  /* Prefer an environment secret (Render env var), else a random per-database secret.
     A secret must never be shipped to clients — see scripts/build-offline-bundle.mjs. */
  let s = String(process.env.JWT_SECRET || '').trim() || getSetting('jwt_secret');
  if (!s) { s = crypto.randomBytes(48).toString('hex'); setSetting('jwt_secret', s); }
  return s;
})();

export const TOKEN_TTL = '30d';

export function hashPassword(pw) { return bcrypt.hashSync(pw, 10); }
export function checkPassword(pw, hash) { return !!hash && bcrypt.compareSync(pw, hash); }
export function signToken(user) {
  return jwt.sign({ id: user.id, email: user.email, role: user.role, name: user.name }, SECRET, { expiresIn: TOKEN_TTL });
}

export function publicUser(u) {
  if (!u) return null;
  const { password_hash, google_id, ...rest } = u;
  return rest;
}

export function getUser(id) {
  return db.prepare('SELECT * FROM users WHERE id=? AND active=1').get(id);
}

function readToken(req) {
  const h = req.headers.authorization || '';
  if (h.startsWith('Bearer ')) return h.slice(7);
  if (req.query.token) return String(req.query.token);
  return null;
}

export function optionalAuth(req, _res, next) {
  const t = readToken(req);
  if (t) {
    try {
      const payload = jwt.verify(t, SECRET);
      const user = getUser(payload.id);
      if (user) req.user = user;
    } catch { /* ignore */ }
  }
  next();
}

export function authRequired(req, res, next) {
  if (!req.user) return res.status(401).json({ error: 'يجب تسجيل الدخول / Login required' });
  next();
}

/** Any of the listed roles (admin always allowed). */
export function roleRequired(...roles) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: 'يجب تسجيل الدخول / Login required' });
    if (req.user.role === 'admin' || roles.includes(req.user.role)) return next();
    return res.status(403).json({ error: 'تحتاج صلاحية صيدلي أو مدير / Pharmacist or admin only', code: 'FORBIDDEN_ROLE' });
  };
}

export const ROLES = ['user', 'pharmacist', 'admin'];

export function adminRequired(req, res, next) {
  if (!req.user) return res.status(401).json({ error: 'يجب تسجيل الدخول / Login required' });
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'صلاحيات المدير مطلوبة / Admin only' });
  next();
}

/** Verify a Google ID token (credential) issued by Google Identity Services. */
/* The OAuth client id can come from the environment or from the admin panel
   (settings key google_client_id), so enabling Google sign-in needs no redeploy. */
export function googleClientId() {
  try {
    const row = db.prepare("SELECT value FROM settings WHERE key='google_client_id'").get();
    return String(process.env.GOOGLE_CLIENT_ID || row?.value || '').trim();
  } catch { return String(process.env.GOOGLE_CLIENT_ID || '').trim(); }
}

export async function verifyGoogleToken(idToken) {
  const r = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(idToken)}`);
  if (!r.ok) throw Object.assign(new Error('Invalid Google token'), { status: 401 });
  const info = await r.json();
  const expected = googleClientId();
  if (expected && info.aud !== expected) throw Object.assign(new Error('Google audience mismatch'), { status: 401 });
  if (!info.email || info.email_verified === 'false') throw Object.assign(new Error('Google email not verified'), { status: 401 });
  return { email: info.email.toLowerCase(), name: info.name || info.email.split('@')[0], picture: info.picture, sub: info.sub };
}

export function ensureAdmin() {
  const ownerEmail = (process.env.OWNER_EMAIL || '7a8b1d@gmail.com').toLowerCase();
  const adminEmail = (process.env.ADMIN_EMAIL || ownerEmail).toLowerCase();
  const adminPass = process.env.ADMIN_PASSWORD || 'MDAadmin@2026';
  let admin = db.prepare('SELECT * FROM users WHERE email=?').get(adminEmail);
  if (!admin) {
    db.prepare(`INSERT INTO users(name,email,password_hash,role,country) VALUES(?,?,?,?,?)`)
      .run('Dr. Abdulmajeed Almakhedhi', adminEmail, hashPassword(adminPass), 'admin', 'Yemen');
    console.log(`[MDA] admin account created: ${adminEmail}`);
  } else if (admin.role !== 'admin') {
    db.prepare(`UPDATE users SET role='admin' WHERE id=?`).run(admin.id);
  }
}

export const OWNER_EMAIL = (process.env.OWNER_EMAIL || '7a8b1d@gmail.com').toLowerCase();
