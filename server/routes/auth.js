import { Router } from 'express';
import { db, getSetting } from '../db.js';
import {
  hashPassword, checkPassword, signToken, publicUser, authRequired,
  verifyGoogleToken, OWNER_EMAIL,
} from '../auth.js';

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
  });
});

router.post('/register', (req, res) => {
  if (!throttle(`reg:${req.ip}`, 8, 60_000)) return res.status(429).json({ error: 'محاولات كثيرة — انتظر قليلاً / Too many attempts' });
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
  if (!throttle(`login:${req.ip}:${String(req.body?.email || '').toLowerCase()}`, 12, 60_000)) {
    return res.status(429).json({ error: 'محاولات دخول كثيرة — انتظر دقيقة / Too many login attempts' });
  }
  const { email, password } = req.body || {};
  const user = db.prepare('SELECT * FROM users WHERE lower(email)=?').get(String(email || '').toLowerCase());
  if (!user || !user.active || !checkPassword(String(password || ''), user.password_hash)) {
    return res.status(401).json({ error: 'البريد أو كلمة المرور غير صحيحة / Invalid credentials' });
  }
  res.json({ token: signToken(user), user: publicUser(user) });
});

router.post('/google', async (req, res, next) => {
  try {
    const { credential } = req.body || {};
    if (!credential) return res.status(400).json({ error: 'credential required' });
    const g = await verifyGoogleToken(credential);
    let user = db.prepare('SELECT * FROM users WHERE lower(email)=?').get(g.email);
    if (!user) {
      const role = g.email === OWNER_EMAIL ? 'admin' : 'user';
      const info = db.prepare(`INSERT INTO users(name,email,role,provider,google_id,avatar,country) VALUES(?,?,?,?,?,?,?)`)
        .run(g.name, g.email, role, 'google', g.sub, g.picture || null, 'Yemen');
      user = db.prepare('SELECT * FROM users WHERE id=?').get(info.lastInsertRowid);
    } else {
      db.prepare('UPDATE users SET google_id=?, avatar=COALESCE(?, avatar), provider=CASE WHEN provider=\'local\' THEN \'google\' ELSE provider END WHERE id=?')
        .run(g.sub, g.picture || null, user.id);
      user = db.prepare('SELECT * FROM users WHERE id=?').get(user.id);
    }
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
