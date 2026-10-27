import { Router } from 'express';
import { db, getSetting } from '../db.js';
import {
  hashPassword, checkPassword, signToken, publicUser, authRequired,
  verifyGoogleToken, OWNER_EMAIL,
} from '../auth.js';
import {
  googleOAuthReady, googleClientIdResolved, startGoogleFlow, consumeState,
  exchangeCode, verifyIdToken, callbackUrl, normalizeRedirect,
} from '../lib/google-oauth.js';
import { audit } from '../lib/audit.js';
import { UPLOAD_DIR } from '../db.js';
import fs from 'node:fs';
import path from 'node:path';

const router = Router();

/* Lightweight in-memory throttle for credential endpoints */
const attempts = new Map();
function throttle(key, max = 12, windowMs = 60_000) {
  const now = Date.now();
  const arr = (attempts.get(key) || []).filter((t) => now - t < windowMs);
  if (arr.length >= max) return false;
  arr.push(now);
  attempts.set(key, arr);
  if (attempts.size > 5000) attempts.clear();
  return true;
}
const allowRegistration = () => {
  const v = getSetting('allow_registration');
  return !(v === 0 || v === '0' || v === false || v === 'false');
};

const emailOk = (e) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(e || ''));

router.get('/config', (_req, res) => {
  res.json({
    googleClientId: process.env.GOOGLE_CLIENT_ID || '',
    ownerEmail: OWNER_EMAIL,
    whatsapp: process.env.WHATSAPP_NUMBER || '+967781733795',
    supportEmail: process.env.SUPPORT_EMAIL || '7a8b1d@gmail.com',
    aiEnabled: !!(process.env.AI_API_KEY || process.env.OPENAI_API_KEY),
    /* v1.9.0: a full OAuth client (id + secret) enables the phone-friendly flow that
       opens the system browser. Without the secret we keep the in-page GIS button. */
    googleOAuth: googleOAuthReady(),
    googleClientIdResolved: googleClientIdResolved(),
  });
});

router.post('/register', (req, res) => {
  /* 20/min per IP: mobile carriers in Yemen put thousands of users behind one NAT
     address, so a strict per-IP cap locks out real sign-ups (v1.9.0). */
  if (!throttle(`reg:${req.ip}`, 20, 60_000)) return res.status(429).json({ error: 'محاولات كثيرة — انتظر قليلاً / Too many attempts' });
  if (!allowRegistration()) return res.status(403).json({ error: 'التسجيل متوقف مؤقتًا / Registration is currently disabled' });
  const { name, email, password, phone, city } = req.body || {};
  if (!name || String(name).trim().length < 2) return res.status(400).json({ error: 'الاسم مطلوب / Name required' });
  if (!emailOk(email)) return res.status(400).json({ error: 'بريد إلكتروني غير صالح / Invalid email' });
  if (!password || String(password).length < 6) return res.status(400).json({ error: 'كلمة المرور يجب أن تكون 6 أحرف على الأقل / Password too short' });
  const exists = db.prepare('SELECT id FROM users WHERE lower(email)=?').get(String(email).toLowerCase());
  if (exists) return res.status(409).json({ error: 'البريد مستخدم مسبقًا / Email already registered' });
  const info = db.prepare(`INSERT INTO users(name,email,password_hash,role,phone,city,country) VALUES(?,?,?,?,?,?,?)`)
    .run(String(name).trim(), String(email).toLowerCase(), hashPassword(password), 'user', phone || null, city || null, 'Yemen');
  const user = db.prepare('SELECT * FROM users WHERE id=?').get(info.lastInsertRowid);
  res.status(201).json({ token: signToken(user), user: publicUser(user) });
});

router.post('/login', (req, res) => {
  if (!throttle(`login:${req.ip}:${String(req.body?.email || '').toLowerCase()}`, 20, 60_000)) {
    return res.status(429).json({ error: 'محاولات دخول كثيرة — انتظر دقيقة / Too many login attempts' });
  }
  const { email, password } = req.body || {};
  const user = db.prepare('SELECT * FROM users WHERE lower(email)=?').get(String(email || '').toLowerCase());
  if (!user || !user.active || !checkPassword(String(password || ''), user.password_hash)) {
    return res.status(401).json({ error: 'البريد أو كلمة المرور غير صحيحة / Invalid credentials' });
  }
  res.json({ token: signToken(user), user: publicUser(user) });
});

/* One place that maps a verified Google profile to a local account (used by both flows). */
function upsertGoogleUser(g) {
  let user = db.prepare('SELECT * FROM users WHERE lower(email)=?').get(g.email);
  if (!user) {
    const role = g.email === OWNER_EMAIL ? 'admin' : 'user';
    const info = db.prepare(`INSERT INTO users(name,email,role,provider,google_id,avatar,country) VALUES(?,?,?,?,?,?,?)`)
      .run(g.name, g.email, role, 'google', g.sub, g.picture || null, 'Yemen');
    user = db.prepare('SELECT * FROM users WHERE id=?').get(info.lastInsertRowid);
    return { user, created: true };
  }
  db.prepare('UPDATE users SET google_id=?, avatar=COALESCE(?, avatar), provider=CASE WHEN provider=\'local\' THEN \'google\' ELSE provider END WHERE id=?')
    .run(g.sub, g.picture || null, user.id);
  return { user: db.prepare('SELECT * FROM users WHERE id=?').get(user.id), created: false };
}

/*
 * Google sign-in for phones (v1.9.0).
 *
 * GET /api/auth/google/start?redirect=<app-url|web-url>
 *   → 302 to Google with PKCE; the state row records the verifier and where to return.
 * GET /api/auth/google/callback?code&state
 *   → exchanges the code server-side (client_secret never leaves the server) and bounces
 *     back to com.mda.medicinedata://auth?token=… (Android) or <origin>/auth?google_token=…
 *
 * Both endpoints are public on purpose: they *are* the login.
 */
router.get('/google/start', (req, res, next) => {
  try {
    if (!googleOAuthReady()) return res.status(503).json({ error: 'GOOGLE_NOT_CONFIGURED' });
    if (!throttle(`gstart:${req.ip}`, 30, 60_000)) return res.status(429).json({ error: 'TOO_MANY' });
    const redirect = String(req.query.redirect || '');
    const { url } = startGoogleFlow({ redirect, host: req.headers.host });
    res.redirect(302, url);
  } catch (e) { next(e); }
});

router.get('/google/callback', async (req, res) => {
  const state = String(req.query.state || '');
  const code = String(req.query.code || '');
  const row = state ? consumeState(state) : null;
  const target = row ? normalizeRedirect(row.redirect) : null;
  if (!target) return res.status(400).type('html').send(googleErrorPage('انتهت صلاحية الطلب أو أنه غير صالح. أعد المحاولة من التطبيق. / This sign-in request expired.'));
  if (!code) return res.redirect(302, `${target.target}${target.target.includes('?') ? '&' : '?'}google_error=cancelled`);
  try {
    const tokens = await exchangeCode({ code, codeVerifier: row.verifier, redirectUri: callbackUrl(req) });
    const profile = await verifyIdToken(tokens.id_token);
    const { user } = upsertGoogleUser(profile);
    if (!user.active) return res.redirect(302, `${target.target}?google_error=disabled`);
    const token = signToken(user);
    if (row.flow === 'android') {
      return res.redirect(302, `com.mda.medicinedata://auth?token=${encodeURIComponent(token)}`);
    }
    return res.redirect(302, `${target.target}?google_token=${encodeURIComponent(token)}`);
  } catch (e) {
    console.error('[MDA] google callback failed', e?.code || e?.message);
    return res.redirect(302, `${target.target}?google_error=${encodeURIComponent(e?.code || 'failed')}`);
  }
});

/* Small, dependency-free page for the rare case the browser stays on our domain. */
function googleErrorPage(message) {
  return `<!doctype html><html lang="ar" dir="rtl"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>MDA</title><body style="background:#050c1a;color:#e5e7eb;font-family:system-ui,sans-serif;display:grid;place-items:center;min-height:100vh;margin:0">
<div style="max-width:380px;padding:24px;text-align:center"><h1 style="font-size:18px">تعذّر تسجيل الدخول</h1>
<p style="font-size:13px;line-height:1.8;opacity:.8">${message}</p>
<a href="/auth" style="display:inline-block;margin-top:12px;padding:10px 18px;border-radius:12px;background:#0d9488;color:#fff;text-decoration:none;font-size:13px">العودة للتطبيق</a></div></body></html>`;
}

router.post('/google', async (req, res, next) => {
  try {
    const { credential } = req.body || {};
    if (!credential) return res.status(400).json({ error: 'credential required' });
    const g = await verifyGoogleToken(credential);
    const { user } = upsertGoogleUser(g);
    if (!user.active) return res.status(403).json({ error: 'الحساب موقوف / Account disabled' });
    res.json({ token: signToken(user), user: publicUser(user) });
  } catch (e) { next(e); }
});

router.get('/me', authRequired, (req, res) => res.json(publicUser(req.user)));

router.patch('/me', authRequired, (req, res) => {
  const { name, phone, city, avatar } = req.body || {};
  db.prepare(`UPDATE users SET name=COALESCE(?,name), phone=COALESCE(?,phone), city=COALESCE(?,city), avatar=COALESCE(?,avatar) WHERE id=?`)
    .run(name || null, phone || null, city || null, avatar || null, req.user.id);
  res.json(publicUser(db.prepare('SELECT * FROM users WHERE id=?').get(req.user.id)));
});

/*
 * Delete my account — self-service, immediate, irreversible.
 *
 * What leaves the database: the user row and everything keyed to it (favourites, saved
 * prescriptions + their items and reviews, pharmacy stock, allergies, consents, cached
 * idempotency responses) plus the prescription photographs on disk. Community threads they
 * opened go with them; their replies and job posts stay readable but are detached from the
 * account (ON DELETE SET NULL), so other users' conversations are not torn apart.
 *
 * Refused: the owner account, the last remaining administrator, and anyone who cannot prove
 * the account is theirs (password for local accounts, the typed word for Google accounts).
 */
function deleteAccount(req, res) {
  const { confirm, password } = req.body || {};
  if (String(confirm || '').trim().toUpperCase() !== 'DELETE') {
    return res.status(400).json({
      error: 'confirm-required',
      message: 'اكتب كلمة DELETE لتأكيد الحذف / type DELETE to confirm',
    });
  }
  const me = db.prepare('SELECT * FROM users WHERE id=?').get(req.user.id);
  if (!me) return res.status(404).json({ error: 'not-found' });
  if (String(me.email).toLowerCase() === OWNER_EMAIL) {
    return res.status(403).json({
      error: 'owner-protected',
      message: 'لا يمكن حذف حساب المالك / the owner account cannot be deleted',
    });
  }
  if (me.password_hash && !checkPassword(String(password || ''), me.password_hash)) {
    return res.status(403).json({
      error: 'wrong-password',
      message: 'كلمة المرور غير صحيحة / wrong password',
    });
  }
  if (me.role === 'admin') {
    const others = db.prepare("SELECT COUNT(*) AS n FROM users WHERE role='admin' AND active=1 AND id<>?").get(me.id).n;
    if (!others) {
      return res.status(409).json({
        error: 'last-admin',
        message: 'هذا آخر مدير — أضف مديرًا آخر قبل الحذف / promote another admin first',
      });
    }
  }

  const photos = db.prepare('SELECT image_url FROM prescriptions WHERE user_id=?').all(me.id)
    .map((r) => r.image_url).filter((u) => typeof u === 'string' && u.startsWith('/uploads/'));
  const counts = {
    prescriptions: db.prepare('SELECT COUNT(*) AS n FROM prescriptions WHERE user_id=?').get(me.id).n,
    favorites: db.prepare('SELECT COUNT(*) AS n FROM favorites WHERE user_id=?').get(me.id).n,
    threads: db.prepare('SELECT COUNT(*) AS n FROM threads WHERE user_id=?').get(me.id).n,
    pharmacy_items: db.prepare('SELECT COUNT(*) AS n FROM pharmacy_items WHERE user_id=?').get(me.id).n,
    allergies: db.prepare('SELECT COUNT(*) AS n FROM user_allergies WHERE user_id=?').get(me.id).n,
  };

  const tx = db.transaction((id) => {
    // Explicit, so it holds even if a deployment has foreign_keys off.
    db.prepare('DELETE FROM prescription_reviews WHERE user_id=? OR prescription_id IN (SELECT id FROM prescriptions WHERE user_id=?)').run(id, id);
    db.prepare('DELETE FROM prescription_items WHERE prescription_id IN (SELECT id FROM prescriptions WHERE user_id=?)').run(id);
    db.prepare('DELETE FROM prescriptions WHERE user_id=?').run(id);
    db.prepare('DELETE FROM pharmacy_items WHERE user_id=?').run(id);
    db.prepare('DELETE FROM favorites WHERE user_id=?').run(id);
    db.prepare('DELETE FROM user_allergies WHERE user_id=?').run(id);
    db.prepare('DELETE FROM user_consents WHERE user_id=?').run(id);
    db.prepare('DELETE FROM idempotency_keys WHERE user_id=?').run(id);
    db.prepare('DELETE FROM thread_messages WHERE thread_id IN (SELECT id FROM threads WHERE user_id=?)').run(id);
    db.prepare('DELETE FROM threads WHERE user_id=?').run(id);
    db.prepare('UPDATE thread_messages SET user_id=NULL WHERE user_id=?').run(id);
    db.prepare('UPDATE jobs SET user_id=NULL WHERE user_id=?').run(id);
    db.prepare('UPDATE drug_submissions SET user_id=NULL WHERE user_id=?').run(id);
    db.prepare('UPDATE prescription_items SET corrected_by=NULL WHERE corrected_by=?').run(id);
    db.prepare('UPDATE prescription_reviews SET user_id=NULL WHERE user_id=?').run(id);
    db.prepare('DELETE FROM users WHERE id=?').run(id);
  });
  tx(me.id);

  // Photographs are personal data: remove the files, ignore anything already gone.
  for (const url of photos) {
    const abs = path.join(UPLOAD_DIR, url.replace(/^\/uploads\//, ''));
    if (!abs.startsWith(UPLOAD_DIR)) continue;
    try { fs.unlinkSync(abs); } catch { /* already removed */ }
  }

  audit('account.delete', {
    actor: me,
    targetType: 'user',
    targetId: me.id,
    meta: { provider: me.provider, role: me.role, counts, photos: photos.length },
    ip: req.ip,
  });
  res.json({ ok: true, deleted: { ...counts, photos: photos.length } });
}

router.post('/delete-account', authRequired, deleteAccount);
router.delete('/me', authRequired, deleteAccount);

router.post('/change-password', authRequired, (req, res) => {
  const { current, next: nextPw } = req.body || {};
  if (!checkPassword(String(current || ''), req.user.password_hash)) {
    return res.status(400).json({ error: 'كلمة المرور الحالية غير صحيحة / Wrong current password' });
  }
  if (!nextPw || String(nextPw).length < 6) return res.status(400).json({ error: 'كلمة المرور قصيرة / Password too short' });
  db.prepare('UPDATE users SET password_hash=? WHERE id=?').run(hashPassword(String(nextPw)), req.user.id);
  res.json({ ok: true });
});

export default router;
