/* Community: public support board, private admin threads, jobs board */
import { Router } from 'express';
import { db } from '../db.js';
import { authRequired, adminRequired } from '../auth.js';

const router = Router();

/* ---------- Support / messaging threads ---------- */
router.get('/threads', authRequired, (req, res) => {
  const isAdmin = req.user.role === 'admin';
  const rows = isAdmin
    ? db.prepare(`SELECT t.*, u.name AS author_name, u.email AS author_email, u.avatar AS author_avatar,
        (SELECT COUNT(*) FROM thread_messages m WHERE m.thread_id=t.id) AS messages_count,
        (SELECT body FROM thread_messages m WHERE m.thread_id=t.id ORDER BY id DESC LIMIT 1) AS last_message
      FROM threads t LEFT JOIN users u ON u.id=t.user_id ORDER BY t.updated_at DESC LIMIT 300`).all()
    : db.prepare(`SELECT t.*, u.name AS author_name, u.avatar AS author_avatar,
        (SELECT COUNT(*) FROM thread_messages m WHERE m.thread_id=t.id) AS messages_count,
        (SELECT body FROM thread_messages m WHERE m.thread_id=t.id ORDER BY id DESC LIMIT 1) AS last_message
      FROM threads t LEFT JOIN users u ON u.id=t.user_id
      WHERE t.user_id=? OR t.is_public=1 ORDER BY t.updated_at DESC LIMIT 300`).all(req.user.id);
  res.json(rows);
});

router.post('/threads', authRequired, (req, res) => {
  const { subject, body, category = 'support', is_public = 1 } = req.body || {};
  if (!subject || !body) return res.status(400).json({ error: 'العنوان والرسالة مطلوبان / Subject and body required' });
  const info = db.prepare('INSERT INTO threads(user_id,subject,category,is_public) VALUES(?,?,?,?)')
    .run(req.user.id, String(subject).slice(0, 180), category, is_public ? 1 : 0);
  db.prepare('INSERT INTO thread_messages(thread_id,user_id,body) VALUES(?,?,?)')
    .run(info.lastInsertRowid, req.user.id, String(body).slice(0, 5000));
  res.status(201).json({ id: info.lastInsertRowid });
});

router.get('/threads/:id', authRequired, (req, res) => {
  const t = db.prepare(`SELECT t.*, u.name AS author_name, u.avatar AS author_avatar FROM threads t
    LEFT JOIN users u ON u.id=t.user_id WHERE t.id=?`).get(req.params.id);
  if (!t) return res.status(404).json({ error: 'Not found' });
  if (!t.is_public && t.user_id !== req.user.id && req.user.role !== 'admin') return res.status(403).json({ error: 'Forbidden' });
  const messages = db.prepare(`SELECT m.*, u.name AS author_name, u.role AS author_role, u.avatar AS author_avatar
    FROM thread_messages m LEFT JOIN users u ON u.id=m.user_id WHERE m.thread_id=? ORDER BY m.id`).all(t.id);
  res.json({ ...t, messages });
});

router.post('/threads/:id/messages', authRequired, (req, res) => {
  const t = db.prepare('SELECT * FROM threads WHERE id=?').get(req.params.id);
  if (!t) return res.status(404).json({ error: 'Not found' });
  if (!t.is_public && t.user_id !== req.user.id && req.user.role !== 'admin') return res.status(403).json({ error: 'Forbidden' });
  const body = String(req.body?.body || '').trim();
  if (!body) return res.status(400).json({ error: 'Message required' });
  const isStaff = req.user.role === 'admin' ? 1 : 0;
  db.prepare('INSERT INTO thread_messages(thread_id,user_id,body,is_staff) VALUES(?,?,?,?)').run(t.id, req.user.id, body.slice(0, 5000), isStaff);
  db.prepare("UPDATE threads SET updated_at=datetime('now'), status=CASE WHEN ?=1 THEN 'answered' ELSE status END WHERE id=?").run(isStaff, t.id);
  res.status(201).json({ ok: true });
});

router.patch('/threads/:id', authRequired, (req, res) => {
  const t = db.prepare('SELECT * FROM threads WHERE id=?').get(req.params.id);
  if (!t) return res.status(404).json({ error: 'Not found' });
  if (req.user.role !== 'admin' && t.user_id !== req.user.id) return res.status(403).json({ error: 'Forbidden' });
  const { status, is_public } = req.body || {};
  if (req.user.role === 'admin' && status) db.prepare('UPDATE threads SET status=? WHERE id=?').run(status, t.id);
  if (is_public !== undefined) db.prepare('UPDATE threads SET is_public=? WHERE id=?').run(is_public ? 1 : 0, t.id);
  res.json({ ok: true });
});

router.delete('/threads/:id', authRequired, (req, res) => {
  const t = db.prepare('SELECT * FROM threads WHERE id=?').get(req.params.id);
  if (!t) return res.status(404).json({ error: 'Not found' });
  if (req.user.role !== 'admin' && t.user_id !== req.user.id) return res.status(403).json({ error: 'Forbidden' });
  db.prepare('DELETE FROM threads WHERE id=?').run(t.id);
  res.json({ ok: true });
});

/* ---------- Jobs board ---------- */
router.get('/jobs', (req, res) => {
  const { type, q, city } = req.query;
  const where = ["j.status='published'"];
  const params = {};
  if (type) { where.push('j.type=@type'); params.type = type; }
  if (city) { where.push('j.city=@city'); params.city = city; }
  if (q) { where.push('(j.title LIKE @q OR j.description LIKE @q OR j.specialty LIKE @q)'); params.q = `%${q}%`; }
  const rows = db.prepare(`SELECT j.*, u.name AS author_name, u.avatar AS author_avatar, u.role AS author_role
    FROM jobs j LEFT JOIN users u ON u.id=j.user_id WHERE ${where.join(' AND ')} ORDER BY j.created_at DESC LIMIT 200`).all(params);
  res.json(rows);
});

router.post('/jobs', authRequired, (req, res) => {
  const { type = 'seeker', title, description, specialty, city, phone, email } = req.body || {};
  if (!title) return res.status(400).json({ error: 'العنوان مطلوب / Title required' });
  const info = db.prepare(`INSERT INTO jobs(user_id,type,title,description,specialty,city,phone,email) VALUES(?,?,?,?,?,?,?,?)`)
    .run(req.user.id, type === 'offer' ? 'offer' : 'seeker', String(title).slice(0, 160), description || null,
      specialty || null, city || null, phone || null, email || null);
  res.status(201).json({ id: info.lastInsertRowid });
});

router.delete('/jobs/:id', authRequired, (req, res) => {
  const j = db.prepare('SELECT * FROM jobs WHERE id=?').get(req.params.id);
  if (!j) return res.status(404).json({ error: 'Not found' });
  if (j.user_id !== req.user.id && req.user.role !== 'admin') return res.status(403).json({ error: 'Forbidden' });
  db.prepare('DELETE FROM jobs WHERE id=?').run(j.id);
  res.json({ ok: true });
});

/* ---------- Favourites ---------- */
router.get('/favorites', authRequired, (req, res) => {
  res.json(db.prepare('SELECT * FROM favorites WHERE user_id=? ORDER BY created_at DESC').all(req.user.id));
});

router.post('/favorites', authRequired, (req, res) => {
  const { target_type, target_id } = req.body || {};
  if (!['drug', 'product'].includes(target_type) || !target_id) return res.status(400).json({ error: 'Invalid target' });
  db.prepare('INSERT OR IGNORE INTO favorites(user_id,target_type,target_id) VALUES(?,?,?)').run(req.user.id, target_type, Number(target_id));
  res.json({ ok: true });
});

router.delete('/favorites/:type/:id', authRequired, (req, res) => {
  db.prepare('DELETE FROM favorites WHERE user_id=? AND target_type=? AND target_id=?')
    .run(req.user.id, req.params.type, Number(req.params.id));
  res.json({ ok: true });
});

/* ---------- Community stats (for home page) ---------- */
router.get('/stats', (_req, res) => {
  const one = (sql) => db.prepare(sql).get().n;
  res.json({
    threads: one('SELECT COUNT(*) n FROM threads WHERE is_public=1'),
    jobs: one("SELECT COUNT(*) n FROM jobs WHERE status='published'"),
    users: one('SELECT COUNT(*) n FROM users WHERE active=1'),
  });
});

export default router;
