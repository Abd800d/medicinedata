/* Admin control panel API: catalogue CRUD, bulk import, images, users, threads, settings */
import { Router } from 'express';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { db, UPLOAD_DIR, getSetting, setSetting } from '../db.js';
import { adminRequired, hashPassword, googleClientId } from '../auth.js';
import { makeUploader } from '../lib/upload.js';
import { autoFillImages, cseConfigured, searchImages, downloadImage, attachImage, productsWithoutPhoto } from '../lib/product-images.js';
import { integrations, testIntegration, bundledImages } from '../lib/integrations.js';
import { searchNorm, normalize } from '../lib/search.js';
import { verifyChain } from '../lib/audit.js';
import {
  createImporter, csvRows, xlsxRows, jsonRows, detectKind, countRows,
} from '../lib/importer.js';

const router = Router();
router.use(adminRequired);

const productUpload = makeUploader('products');
const miscUpload = makeUploader('misc');
const importUpload = makeUploader('imports', { anyData: true });

const int = (v) => (v === undefined || v === null || v === '' ? null : Number(v));
const clean = (v) => (v === undefined || v === null ? null : String(v).trim() || null);

/* ---------------- Stats ---------------- */
/* ---------------- Audit log (immutable, hash-chained) ---------------- */
router.get('/audit', (req, res) => {
  const limit = Math.min(500, Math.max(1, Number(req.query.limit) || 100));
  const action = String(req.query.action || '').trim();
  const target = String(req.query.target || '').trim();
  const rows = db.prepare(`SELECT a.*, u.name AS actor_name FROM audit_log a
      LEFT JOIN users u ON u.id = a.actor_id
      ${action || target ? 'WHERE ' + [action ? '(a.action LIKE ?)' : null, target ? '(a.target_type=?)' : null].filter(Boolean).join(' AND ') : ''}
      ORDER BY a.id DESC LIMIT ?`).all(
    ...[...(action ? [`${action}%`] : []), ...(target ? [target] : []), limit],
  );
  res.json(rows.map((r) => ({ ...r, meta: r.meta_json ? JSON.parse(r.meta_json) : null })));
});
router.get('/audit/verify', (_req, res) => {
  const result = verifyChain(20000);
  res.json(result);
});
/* AI quality dashboard: what the model did, how often humans had to fix it,
   and which alerts actually fired. No patient text is returned here. */
router.get('/ai-stats', (req, res) => {
  const days = Math.min(365, Math.max(1, Number(req.query.days) || 30));
  const since = `-${days} days`;

  const runs = db.prepare(`SELECT provider, model, ok, latency_ms, created_at FROM ai_runs
    WHERE created_at >= datetime('now', ?)`).all(since);
  const byModel = {};
  for (const r of runs) {
    const key = `${r.provider}/${r.model}`;
    const m = byModel[key] || (byModel[key] = { provider: r.provider, model: r.model, calls: 0, failed: 0, latency_sum: 0 });
    m.calls++;
    if (!r.ok) m.failed++;
    if (r.latency_ms) m.latency_sum += r.latency_ms;
  }
  const models = Object.values(byModel).map((m) => ({
    provider: m.provider, model: m.model, calls: m.calls, failed: m.failed,
    success_rate: m.calls ? Number((((m.calls - m.failed) / m.calls) * 100).toFixed(1)) : 0,
    avg_latency_ms: m.calls ? Math.round(m.latency_sum / m.calls) : 0,
  })).sort((a, b) => b.calls - a.calls);

  const rx = db.prepare(`SELECT id, status, analysis_json FROM prescriptions
    WHERE created_at >= datetime('now', ?) ORDER BY id DESC LIMIT 1000`).all(since);
  const items = db.prepare(`SELECT i.status, COUNT(*) n FROM prescription_items i
    JOIN prescriptions p ON p.id = i.prescription_id
    WHERE p.created_at >= datetime('now', ?) GROUP BY i.status`).all(since);
  const itemTotals = items.reduce((s2, r) => s2 + r.n, 0);
  const corrected = items.find((r) => r.status === 'corrected')?.n || 0;

  const flagCounts = {};
  let withFlags = 0;
  for (const row of rx) {
    let a = null;
    try { a = row.analysis_json ? JSON.parse(row.analysis_json) : null; } catch { a = null; }
    const flags = a?.flags || [];
    if (flags.length) withFlags++;
    for (const f of flags) {
      const k = f.type;
      flagCounts[k] = (flagCounts[k] || 0) + 1;
    }
  }
  const statusCounts = rx.reduce((acc, r) => { acc[r.status] = (acc[r.status] || 0) + 1; return acc; }, {});

  const reviews = db.prepare(`SELECT action, COUNT(*) n FROM prescription_reviews
    WHERE created_at >= datetime('now', ?) GROUP BY action`).all(since);

  res.json({
    days,
    runs: { total: runs.length, failed: runs.filter((r) => !r.ok).length, models },
    prescriptions: { total: rx.length, by_status: statusCounts, with_flags: withFlags },
    items: { total: itemTotals, by_status: items.reduce((a2, r) => { a2[r.status] = r.n; return a2; }, {}), correction_rate: itemTotals ? Number(((corrected / itemTotals) * 100).toFixed(1)) : 0 },
    flags: Object.entries(flagCounts).sort((a2, b) => b[1] - a2[1]).map(([type, count]) => ({ type, count })),
    reviews: reviews.reduce((a2, r) => { a2[r.action] = r.n; return a2; }, {}),
    generated_at: new Date().toISOString(),
  });
});

router.get('/prescriptions', (req, res) => {
  const status = String(req.query.status || 'pending_review');
  const rows = db.prepare(`SELECT p.id, p.status, p.created_at, u.name AS owner_name,
      (SELECT COUNT(*) FROM prescription_items i WHERE i.prescription_id=p.id) items,
      (SELECT COUNT(*) FROM prescription_items i WHERE i.prescription_id=p.id AND i.status='pending') pending_items
    FROM prescriptions p LEFT JOIN users u ON u.id=p.user_id WHERE p.status=? ORDER BY p.id DESC LIMIT 200`).all(status);
  res.json(rows);
});

router.get('/stats', (_req, res) => {
  const one = (sql) => db.prepare(sql).get().n;
  const newUsers = db.prepare(`SELECT date(created_at) d, COUNT(*) n FROM users
    WHERE created_at >= date('now','-13 day') GROUP BY d ORDER BY d`).all();
  const topSearches = db.prepare('SELECT term, hits FROM search_terms ORDER BY hits DESC LIMIT 10').all();
  const bySystem = db.prepare(`SELECT s.name_en, s.name_ar, s.color,
      COUNT(d.id) drugs, (SELECT COUNT(*) FROM products p JOIN drugs d2 ON d2.id=p.drug_id WHERE d2.system_id=s.id AND p.active=1) products
    FROM systems s LEFT JOIN drugs d ON d.system_id=s.id GROUP BY s.id ORDER BY s.sort_order`).all();
  const imports = db.prepare('SELECT * FROM imports ORDER BY id DESC LIMIT 5').all();
  res.json({
    counts: {
      systems: one('SELECT COUNT(*) n FROM systems'),
      categories: one('SELECT COUNT(*) n FROM categories'),
      drugs: one('SELECT COUNT(*) n FROM drugs'),
      products: one('SELECT COUNT(*) n FROM products WHERE active=1'),
      products_no_image: one("SELECT COUNT(*) n FROM products p WHERE active=1 AND (image_url IS NULL OR image_url='') AND NOT EXISTS (SELECT 1 FROM product_images pi WHERE pi.product_id=p.id AND pi.source<>'generated')"),
      products_unverified: one('SELECT COUNT(*) n FROM products WHERE active=1 AND verified=0'),
      manufacturers: one('SELECT COUNT(*) n FROM manufacturers'),
      agents: one('SELECT COUNT(*) n FROM agents'),
      users: one('SELECT COUNT(*) n FROM users'),
      admins: one("SELECT COUNT(*) n FROM users WHERE role='admin'"),
      threads: one('SELECT COUNT(*) n FROM threads'),
      open_threads: one("SELECT COUNT(*) n FROM threads WHERE status='open'"),
      prescriptions: one('SELECT COUNT(*) n FROM prescriptions'),
      jobs: one('SELECT COUNT(*) n FROM jobs'),
      favorites: one('SELECT COUNT(*) n FROM favorites'),
    },
    new_users: newUsers,
    top_searches: topSearches,
    by_system: bySystem,
    recent_imports: imports,
    storage: { uploads_mb: Math.round(dirSize(UPLOAD_DIR) / 1024 / 1024) },
  });
});

function dirSize(dir) {
  try {
    return fs.readdirSync(dir, { withFileTypes: true }).reduce((sum, e) => {
      const p = path.join(dir, e.name);
      return sum + (e.isDirectory() ? dirSize(p) : (fs.statSync(p).size || 0));
    }, 0);
  } catch { return 0; }
}

/* ---------------- Systems ---------------- */
const systemFields = ['slug', 'name_en', 'name_ar', 'description_en', 'description_ar', 'icon', 'color', 'sort_order'];
const slugify = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'item';

router.get('/systems', (_req, res) => res.json(db.prepare('SELECT * FROM systems ORDER BY sort_order, id').all()));
router.post('/systems', (req, res) => {
  const b = req.body || {};
  if (!b.name_en || !b.name_ar) return res.status(400).json({ error: 'name_en and name_ar are required' });
  const info = db.prepare(`INSERT INTO systems(slug,name_en,name_ar,description_en,description_ar,icon,color,sort_order)
    VALUES(?,?,?,?,?,?,?,?)`).run(clean(b.slug) || slugify(b.name_en), b.name_en, b.name_ar, clean(b.description_en), clean(b.description_ar),
    clean(b.icon) || 'activity', clean(b.color) || '#0f766e', int(b.sort_order) || 0);
  res.status(201).json(db.prepare('SELECT * FROM systems WHERE id=?').get(info.lastInsertRowid));
});
router.put('/systems/:id', (req, res) => {
  const cur = db.prepare('SELECT * FROM systems WHERE id=?').get(req.params.id);
  if (!cur) return res.status(404).json({ error: 'Not found' });
  const n = { ...cur, ...req.body };
  db.prepare(`UPDATE systems SET slug=?, name_en=?, name_ar=?, description_en=?, description_ar=?, icon=?, color=?, sort_order=? WHERE id=?`)
    .run(clean(n.slug) || slugify(n.name_en), n.name_en, n.name_ar, clean(n.description_en), clean(n.description_ar), clean(n.icon), clean(n.color), int(n.sort_order) || 0, cur.id);
  res.json(db.prepare('SELECT * FROM systems WHERE id=?').get(cur.id));
});
router.delete('/systems/:id', (req, res) => {
  const n = db.prepare('SELECT COUNT(*) n FROM drugs WHERE system_id=?').get(req.params.id).n;
  if (n) return res.status(400).json({ error: `لا يمكن حذف جهاز يحتوي ${n} دواءً — انقل الأدوية أولًا` });
  db.prepare('DELETE FROM systems WHERE id=?').run(req.params.id);
  res.json({ ok: true });
});

/* ---------------- Categories ---------------- */
router.get('/categories', (req, res) => {
  const rows = db.prepare(`SELECT c.*, s.name_en AS system_en, s.name_ar AS system_ar,
      (SELECT COUNT(*) FROM drugs d WHERE d.category_id=c.id) drugs
    FROM categories c LEFT JOIN systems s ON s.id=c.system_id
    ${req.query.system_id ? 'WHERE c.system_id=?' : ''} ORDER BY s.sort_order, c.sort_order, c.id`)
    .all(...(req.query.system_id ? [int(req.query.system_id)] : []));
  res.json(rows);
});
router.post('/categories', (req, res) => {
  const b = req.body || {};
  if (!b.system_id || !b.name_en || !b.name_ar) return res.status(400).json({ error: 'system_id, name_en and name_ar are required' });
  const info = db.prepare(`INSERT INTO categories(system_id,slug,name_en,name_ar,description_en,description_ar,sort_order)
    VALUES(?,?,?,?,?,?,?)`).run(int(b.system_id), clean(b.slug) || slugify(b.name_en), b.name_en, b.name_ar,
    clean(b.description_en), clean(b.description_ar), int(b.sort_order) || 0);
  res.status(201).json(db.prepare('SELECT * FROM categories WHERE id=?').get(info.lastInsertRowid));
});
router.put('/categories/:id', (req, res) => {
  const cur = db.prepare('SELECT * FROM categories WHERE id=?').get(req.params.id);
  if (!cur) return res.status(404).json({ error: 'Not found' });
  const n = { ...cur, ...req.body };
  db.prepare(`UPDATE categories SET system_id=?,slug=?,name_en=?,name_ar=?,description_en=?,description_ar=?,sort_order=? WHERE id=?`)
    .run(int(n.system_id), clean(n.slug) || slugify(n.name_en), n.name_en, n.name_ar, clean(n.description_en), clean(n.description_ar), int(n.sort_order) || 0, cur.id);
  res.json(db.prepare('SELECT * FROM categories WHERE id=?').get(cur.id));
});
router.delete('/categories/:id', (req, res) => {
  db.prepare('UPDATE drugs SET category_id=NULL WHERE category_id=?').run(req.params.id);
  db.prepare('DELETE FROM categories WHERE id=?').run(req.params.id);
  res.json({ ok: true });
});

/* ---------------- Drugs ---------------- */
const drugFields = ['system_id', 'category_id', 'generic_name', 'generic_ar', 'synonyms', 'drug_class', 'atc_code', 'prescription_required',
  'pregnancy', 'indications_en', 'indications_ar', 'dosage_adult', 'dosage_child', 'contraindications', 'side_effects', 'warnings',
  'interactions', 'mechanism_en', 'mechanism_ar', 'half_life', 'storage', 'notes', 'source', 'verified'];

router.get('/drugs', (req, res) => {
  const page = Math.max(1, int(req.query.page) || 1);
  const limit = Math.min(200, int(req.query.limit) || 40);
  const where = []; const p = {};
  if (req.query.q) { where.push('(d.generic_name LIKE @q OR d.generic_ar LIKE @q OR d.drug_class LIKE @q)'); p.q = `%${req.query.q}%`; }
  if (req.query.system_id) { where.push('d.system_id=@sid'); p.sid = int(req.query.system_id); }
  if (req.query.category_id) { where.push('d.category_id=@cid'); p.cid = int(req.query.category_id); }
  const w = where.length ? 'WHERE ' + where.join(' AND ') : '';
  const data = db.prepare(`SELECT d.*, s.name_en AS system_en, s.name_ar AS system_ar,
      (SELECT COUNT(*) FROM products p WHERE p.drug_id=d.id) AS products_count
    FROM drugs d LEFT JOIN systems s ON s.id=d.system_id ${w} ORDER BY d.generic_name LIMIT @limit OFFSET @offset`)
    .all({ ...p, limit, offset: (page - 1) * limit });
  const total = db.prepare(`SELECT COUNT(*) n FROM drugs d ${w}`).get(p).n;
  res.json({ data, total, page, pages: Math.ceil(total / limit) });
});

function drugPayload(b, cur = {}) {
  const n = { ...cur, ...b };
  const payload = {};
  for (const f of drugFields) {
    let v = n[f];
    if (['system_id', 'category_id'].includes(f)) v = int(v);
    else if (['prescription_required', 'verified'].includes(f)) v = v ? 1 : 0;
    else v = clean(v);
    payload[f] = v;
  }
  payload.generic_name = String(n.generic_name || '').trim();
  payload.search_norm = searchNorm(payload.generic_name, payload.generic_ar, payload.synonyms, payload.drug_class);
  return payload;
}

router.post('/drugs', (req, res) => {
  const b = req.body || {};
  if (!b.generic_name) return res.status(400).json({ error: 'generic_name is required' });
  const payload = drugPayload(b);
  const cols = [...drugFields, 'search_norm'];
  const info = db.prepare(`INSERT INTO drugs(${cols.join(',')}) VALUES(${cols.map((c) => '@' + c).join(',')})`).run(payload);
  res.status(201).json(db.prepare('SELECT * FROM drugs WHERE id=?').get(info.lastInsertRowid));
});
router.put('/drugs/:id', (req, res) => {
  const cur = db.prepare('SELECT * FROM drugs WHERE id=?').get(req.params.id);
  if (!cur) return res.status(404).json({ error: 'Not found' });
  const payload = drugPayload(req.body || {}, cur);
  db.prepare(`UPDATE drugs SET ${drugFields.map((f) => `${f}=@${f}`).join(',')}, search_norm=@search_norm, updated_at=datetime('now') WHERE id=@id`)
    .run({ ...payload, id: cur.id });
  res.json(db.prepare('SELECT * FROM drugs WHERE id=?').get(cur.id));
});
router.delete('/drugs/:id', (req, res) => {
  db.prepare('DELETE FROM drugs WHERE id=?').run(req.params.id);
  res.json({ ok: true });
});

/* ---------------- Products ---------------- */
const productFields = ['drug_id', 'trade_name', 'trade_name_ar', 'strength', 'dosage_form', 'pack_size', 'manufacturer_id', 'agent_id',
  'country', 'barcode', 'price', 'currency', 'image_url', 'image_source', 'description_en', 'description_ar', 'verified', 'active'];

router.get('/products', (req, res) => {
  const page = Math.max(1, int(req.query.page) || 1);
  const limit = Math.min(200, int(req.query.limit) || 40);
  const where = []; const p = {};
  if (req.query.q) { where.push('(p.trade_name LIKE @q OR p.trade_name_ar LIKE @q OR p.barcode LIKE @q OR d.generic_name LIKE @q)'); p.q = `%${req.query.q}%`; }
  if (req.query.drug_id) { where.push('p.drug_id=@did'); p.did = int(req.query.drug_id); }
  if (req.query.system_id) { where.push('d.system_id=@sid'); p.sid = int(req.query.system_id); }
  if (req.query.missing_image === '1') where.push("(p.image_url IS NULL OR p.image_url='') AND NOT EXISTS (SELECT 1 FROM product_images pi WHERE pi.product_id=p.id AND pi.source<>'generated')");
  if (req.query.unverified === '1') where.push('p.verified=0');
  const w = where.length ? 'WHERE ' + where.join(' AND ') : '';
  const data = db.prepare(`SELECT p.*, d.generic_name, d.generic_ar, m.name AS manufacturer_name, a.name AS agent_name,
      (SELECT COUNT(*) FROM product_images pi WHERE pi.product_id=p.id) AS images_count
    FROM products p LEFT JOIN drugs d ON d.id=p.drug_id LEFT JOIN manufacturers m ON m.id=p.manufacturer_id
    LEFT JOIN agents a ON a.id=p.agent_id ${w} ORDER BY p.id DESC LIMIT @limit OFFSET @offset`)
    .all({ ...p, limit, offset: (page - 1) * limit });
  const total = db.prepare(`SELECT COUNT(*) n FROM products p LEFT JOIN drugs d ON d.id=p.drug_id ${w}`).get(p).n;
  res.json({ data, total, page, pages: Math.ceil(total / limit) });
});

function productPayload(b, cur = {}) {
  const n = { ...cur, ...b };
  const payload = {};
  for (const f of productFields) {
    let v = n[f];
    if (['drug_id', 'manufacturer_id', 'agent_id'].includes(f)) v = int(v);
    else if (['verified', 'active'].includes(f)) v = v ? 1 : 0;
    else if (f === 'price') v = v === '' || v === null || v === undefined ? null : Number(v);
    else v = clean(v);
    payload[f] = v;
  }
  payload.trade_name = String(n.trade_name || '').trim();
  payload.currency = clean(n.currency) || 'YER';
  if (payload.active === null) payload.active = 1;
  payload.search_norm = searchNorm(payload.trade_name, payload.trade_name_ar, payload.strength, payload.barcode);
  return payload;
}

router.post('/products', (req, res) => {
  const b = req.body || {};
  if (!b.trade_name || !b.drug_id) return res.status(400).json({ error: 'drug_id and trade_name are required' });
  const payload = productPayload(b, { active: 1 });
  const cols = [...productFields, 'search_norm'];
  const info = db.prepare(`INSERT INTO products(${cols.join(',')}) VALUES(${cols.map((c) => '@' + c).join(',')})`).run(payload);
  if (payload.image_url) db.prepare('INSERT INTO product_images(product_id,url,source) VALUES(?,?,?)').run(info.lastInsertRowid, payload.image_url, 'admin');
  res.status(201).json(db.prepare('SELECT * FROM products WHERE id=?').get(info.lastInsertRowid));
});
router.put('/products/:id', (req, res) => {
  const cur = db.prepare('SELECT * FROM products WHERE id=?').get(req.params.id);
  if (!cur) return res.status(404).json({ error: 'Not found' });
  const payload = productPayload(req.body || {}, cur);
  db.prepare(`UPDATE products SET ${productFields.map((f) => `${f}=@${f}`).join(',')}, search_norm=@search_norm, updated_at=datetime('now') WHERE id=@id`)
    .run({ ...payload, id: cur.id });
  if (payload.image_url && payload.image_url !== cur.image_url) {
    db.prepare('INSERT INTO product_images(product_id,url,source) VALUES(?,?,?)').run(cur.id, payload.image_url, 'admin');
  }
  res.json(db.prepare('SELECT * FROM products WHERE id=?').get(cur.id));
});
router.delete('/products/:id', (req, res) => {
  db.prepare('DELETE FROM products WHERE id=?').run(req.params.id);
  res.json({ ok: true });
});

/* ---------------- Product images ---------------- */
router.get('/products/:id/images', (req, res) => {
  res.json(db.prepare('SELECT * FROM product_images WHERE product_id=? ORDER BY sort_order, id').all(req.params.id));
});
router.post('/products/:id/images', productUpload.array('images', 12), (req, res) => {
  const product = db.prepare('SELECT * FROM products WHERE id=?').get(req.params.id);
  if (!product) return res.status(404).json({ error: 'Not found' });
  const created = [];
  for (const f of req.files || []) {
    const url = `/uploads/products/${path.basename(f.path)}`;
    const sort = db.prepare('SELECT COALESCE(MAX(sort_order),0)+1 n FROM product_images WHERE product_id=?').get(product.id).n;
    const info = db.prepare('INSERT INTO product_images(product_id,url,source,sort_order) VALUES(?,?,?,?)').run(product.id, url, 'upload', sort);
    created.push(db.prepare('SELECT * FROM product_images WHERE id=?').get(info.lastInsertRowid));
  }
  const replaceable = !product.image_url || product.image_source === 'generated' || product.image_url.startsWith('/api/catalog/');
  if (created.length && replaceable) {
    db.prepare('UPDATE products SET image_url=?, image_source=? WHERE id=?').run(created[0].url, 'upload', product.id);
  }
  res.status(201).json(created);
});
router.post('/products/:id/image-url', (req, res) => {
  const product = db.prepare('SELECT * FROM products WHERE id=?').get(req.params.id);
  if (!product) return res.status(404).json({ error: 'Not found' });
  const url = String(req.body?.url || '').trim();
  if (!/^https?:\/\//i.test(url)) return res.status(400).json({ error: 'صيغة الرابط غير صحيحة' });
  const sort = db.prepare('SELECT COALESCE(MAX(sort_order),0)+1 n FROM product_images WHERE product_id=?').get(product.id).n;
  db.prepare('INSERT INTO product_images(product_id,url,source,sort_order) VALUES(?,?,?,?)').run(product.id, url, 'external', sort);
  if (!product.image_url || product.image_source === 'generated') db.prepare('UPDATE products SET image_url=?, image_source=? WHERE id=?').run(url, 'external', product.id);
  res.status(201).json(db.prepare('SELECT * FROM product_images WHERE product_id=? ORDER BY sort_order').all(product.id));
});
router.put('/products/:id/image', (req, res) => {
  const product = db.prepare('SELECT * FROM products WHERE id=?').get(req.params.id);
  if (!product) return res.status(404).json({ error: 'Not found' });
  const url = String(req.body?.url || '').trim();
  if (!url) return res.status(400).json({ error: 'url is required' });
  db.prepare('UPDATE products SET image_url=?, image_source=?, updated_at=datetime(\'now\') WHERE id=?').run(url, 'admin', product.id);
  res.json({ ok: true, image_url: url });
});
router.delete('/product-images/:imageId', (req, res) => {
  const img = db.prepare('SELECT * FROM product_images WHERE id=?').get(req.params.imageId);
  if (img) {
    db.prepare('DELETE FROM product_images WHERE id=?').run(img.id);
    const p = db.prepare('SELECT * FROM products WHERE id=?').get(img.product_id);
    if (p && p.image_url === img.url) {
      const next = db.prepare('SELECT url FROM product_images WHERE product_id=? ORDER BY sort_order LIMIT 1').get(p.id);
      db.prepare('UPDATE products SET image_url=? WHERE id=?').run(next?.url || null, p.id);
    }
  }
  res.json({ ok: true });
});

/* Download a remote image (web fetch) and attach it to a product */
router.post('/fetch-image', async (req, res) => {
  try {
    const url = String(req.body?.url || '').trim();
    const productId = int(req.body?.product_id);
    if (!/^https?:\/\//i.test(url)) return res.status(400).json({ error: 'رابط غير صالح' });
    const r = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 (compatible; MDA/1.0)' }, redirect: 'follow' });
    if (!r.ok) return res.status(502).json({ error: `تعذر تنزيل الصورة (${r.status})` });
    const type = r.headers.get('content-type') || '';
    if (!type.startsWith('image/')) return res.status(400).json({ error: 'الرابط لا يشير إلى صورة' });
    const buf = Buffer.from(await r.arrayBuffer());
    if (buf.length > 12 * 1024 * 1024) return res.status(400).json({ error: 'حجم الصورة كبير جدًا' });
    const ext = type.includes('png') ? '.png' : type.includes('webp') ? '.webp' : type.includes('svg') ? '.svg' : '.jpg';
    const dir = path.join(UPLOAD_DIR, 'products');
    fs.mkdirSync(dir, { recursive: true });
    const name = `${Date.now()}-${crypto.randomBytes(4).toString('hex')}${ext}`;
    fs.writeFileSync(path.join(dir, name), buf);
    const publicPath = `/uploads/products/${name}`;
    if (productId) {
      const p = db.prepare('SELECT * FROM products WHERE id=?').get(productId);
      if (p) {
        db.prepare('INSERT INTO product_images(product_id,url,source) VALUES(?,?,?)').run(p.id, publicPath, 'web');
        if (!p.image_url || p.image_source === 'generated') db.prepare('UPDATE products SET image_url=?, image_source=? WHERE id=?').run(publicPath, 'web', p.id);
      }
    }
    res.json({ url: publicPath });
  } catch (e) {
    res.status(500).json({ error: 'فشل تنزيل الصورة', detail: e.message });
  }
});

/* Image candidates from Google Custom Search (optional keys) */
router.get('/image-search', async (req, res) => {
  const q = String(req.query.q || '').trim();
  const searchUrl = `https://www.google.com/search?tbm=isch&q=${encodeURIComponent(`${q} medicine`)}`;
  if (!q) return res.status(400).json({ error: 'q is required' });
  const key = process.env.GOOGLE_CSE_KEY;
  const cx = process.env.GOOGLE_CSE_CX;
  if (!key || !cx) {
    return res.json({ configured: false, items: [], searchUrl, hint: 'أضف GOOGLE_CSE_KEY و GOOGLE_CSE_CX على الخادم للبحث التلقائي، أو افتح Google Images والصق رابط الصورة.' });
  }
  try {
    const r = await fetch(`https://www.googleapis.com/customsearch/v1?key=${key}&cx=${cx}&searchType=image&num=8&safe=active&q=${encodeURIComponent(q)}`);
    const data = await r.json();
    if (!r.ok) return res.status(502).json({ error: data?.error?.message || 'Google CSE error', configured: true, searchUrl });
    res.json({
      configured: true, searchUrl,
      items: (data.items || []).map((i) => ({ link: i.link, thumb: i.image?.thumbnailLink, title: i.title, source: i.displayLink })),
    });
  } catch (e) {
    res.status(502).json({ error: e.message, configured: true, searchUrl });
  }
});

/* Optional integrations: status + one-click connectivity test */
router.get('/integrations', (_req, res) => {
  res.json({ integrations: integrations(), bundled_images: bundledImages(), env_file: process.env.ENV_FILE || '.env' });
});
router.post('/integrations/test', async (req, res) => {
  try {
    const target = String(req.body?.target || '');
    if (!['google', 'ai', 'cse'].includes(target)) return res.status(400).json({ error: 'target must be google | ai | cse' });
    res.json(await testIntegration(target));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/* Batch: pull real photos from Google Custom Search for products that only have placeholders */
router.post('/images/auto-fill', async (req, res) => {
  try {
    const limit = Math.min(50, Math.max(1, Number(req.body?.limit) || 10));
    const out = await autoFillImages({ limit, dryRun: Boolean(req.body?.dry_run) });
    if (!out.configured) return res.status(400).json({ ...out, configured: false });
    res.json(out);
  } catch (e) {
    res.status(502).json({ error: 'فشل جلب الصور', detail: e.message });
  }
});
router.get('/images/status', (_req, res) => {
  const missing = db.prepare(`SELECT COUNT(*) n FROM products p WHERE p.active=1
    AND (p.image_url IS NULL OR p.image_url='' OR p.image_source IN ('generated','seed'))
    AND NOT EXISTS (SELECT 1 FROM product_images pi WHERE pi.product_id=p.id AND pi.source NOT IN ('generated'))`).get().n;
  const real = db.prepare("SELECT COUNT(*) n FROM products WHERE active=1 AND image_source IS NOT NULL AND image_source NOT IN ('generated','seed')").get().n;
  res.json({ configured: cseConfigured(), with_real_photo: real, without_photo: missing, next: productsWithoutPhoto(5) });
});
router.post('/products/:id/image-search', async (req, res) => {
  const p = db.prepare(`SELECT p.*, m.name AS manufacturer FROM products p
    LEFT JOIN manufacturers m ON m.id=p.manufacturer_id WHERE p.id=?`).get(req.params.id);
  if (!p) return res.status(404).json({ error: 'Not found' });
  const q = String(req.body?.q || '').trim() || [p.trade_name, p.strength, p.manufacturer, 'box'].filter(Boolean).join(' ');
  try {
    const out = await searchImages(q, 8);
    if (!out.configured) return res.status(400).json({ ...out, hint: 'أضف GOOGLE_CSE_KEY و GOOGLE_CSE_CX إلى .env' });
    res.json({ query: q, items: out.items.map((i) => ({ link: i.link, thumb: i.image?.thumbnailLink, title: i.title, score: i.score })) });
  } catch (e) {
    res.status(502).json({ error: e.message });
  }
});
router.post('/products/:id/attach-url', async (req, res) => {
  try {
    const url = String(req.body?.url || '').trim();
    if (!/^https?:\/\//i.test(url)) return res.status(400).json({ error: 'رابط غير صالح' });
    const file = await downloadImage(url);
    res.status(201).json({ images: attachImage(req.params.id, file.url, 'web-cse'), url: file.url });
  } catch (e) {
    res.status(502).json({ error: 'تعذر تنزيل الصورة', detail: e.message });
  }
});

/* ---------------- Manufacturers & agents ---------------- */
router.get('/manufacturers', (req, res) => {
  const rows = db.prepare(`SELECT m.*, (SELECT COUNT(*) FROM products p WHERE p.manufacturer_id=m.id) AS products_count
    FROM manufacturers m ${req.query.q ? 'WHERE m.name LIKE @q OR m.country LIKE @q' : ''}
    ORDER BY products_count DESC, m.name LIMIT 500`).all(req.query.q ? { q: `%${req.query.q}%` } : {});
  res.json(rows);
});
router.post('/manufacturers', (req, res) => {
  const b = req.body || {};
  if (!clean(b.name)) return res.status(400).json({ error: 'name is required' });
  const info = db.prepare('INSERT INTO manufacturers(name,country,website,notes) VALUES(?,?,?,?)').run(clean(b.name), clean(b.country), clean(b.website), clean(b.notes));
  res.status(201).json(db.prepare('SELECT * FROM manufacturers WHERE id=?').get(info.lastInsertRowid));
});
router.put('/manufacturers/:id', (req, res) => {
  const cur = db.prepare('SELECT * FROM manufacturers WHERE id=?').get(req.params.id);
  if (!cur) return res.status(404).json({ error: 'Not found' });
  const n = { ...cur, ...req.body };
  db.prepare('UPDATE manufacturers SET name=?, country=?, website=?, notes=? WHERE id=?').run(clean(n.name), clean(n.country), clean(n.website), clean(n.notes), cur.id);
  res.json(db.prepare('SELECT * FROM manufacturers WHERE id=?').get(cur.id));
});
router.delete('/manufacturers/:id', (req, res) => {
  db.prepare('UPDATE products SET manufacturer_id=NULL WHERE manufacturer_id=?').run(req.params.id);
  db.prepare('DELETE FROM manufacturers WHERE id=?').run(req.params.id);
  res.json({ ok: true });
});

router.get('/agents', (req, res) => {
  const rows = db.prepare(`SELECT a.*, (SELECT COUNT(*) FROM products p WHERE p.agent_id=a.id) AS products_count
    FROM agents a ${req.query.q ? 'WHERE a.name LIKE @q OR a.city LIKE @q' : ''}
    ORDER BY products_count DESC, a.name LIMIT 500`).all(req.query.q ? { q: `%${req.query.q}%` } : {});
  res.json(rows);
});
router.post('/agents', (req, res) => {
  const b = req.body || {};
  if (!clean(b.name)) return res.status(400).json({ error: 'name is required' });
  const info = db.prepare('INSERT INTO agents(name,name_ar,country,city,phone,email,website,notes) VALUES(?,?,?,?,?,?,?,?)')
    .run(clean(b.name), clean(b.name_ar), clean(b.country) || 'Yemen', clean(b.city), clean(b.phone), clean(b.email), clean(b.website), clean(b.notes));
  res.status(201).json(db.prepare('SELECT * FROM agents WHERE id=?').get(info.lastInsertRowid));
});
router.put('/agents/:id', (req, res) => {
  const cur = db.prepare('SELECT * FROM agents WHERE id=?').get(req.params.id);
  if (!cur) return res.status(404).json({ error: 'Not found' });
  const n = { ...cur, ...req.body };
  db.prepare(`UPDATE agents SET name=?, name_ar=?, country=?, city=?, phone=?, email=?, website=?, notes=? WHERE id=?`)
    .run(clean(n.name), clean(n.name_ar), clean(n.country) || 'Yemen', clean(n.city), clean(n.phone), clean(n.email), clean(n.website), clean(n.notes), cur.id);
  res.json(db.prepare('SELECT * FROM agents WHERE id=?').get(cur.id));
});
router.delete('/agents/:id', (req, res) => {
  db.prepare('UPDATE products SET agent_id=NULL WHERE agent_id=?').run(req.params.id);
  db.prepare('DELETE FROM agents WHERE id=?').run(req.params.id);
  res.json({ ok: true });
});

/* ---------------- Upload (generic image) ---------------- */
router.post('/upload', miscUpload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'file is required' });
  res.status(201).json({ url: `/uploads/misc/${path.basename(req.file.path)}` });
});

/* ---------------- Bulk image import (filename ⇄ barcode/trade name) ---------------- */
router.post('/import-images', productUpload.array('images', 300), (req, res) => {
  const results = { matched: 0, assigned: 0, unmatched: [], details: [] };
  for (const f of req.files || []) {
    const base = path.basename(f.originalname, path.extname(f.originalname)).trim();
    let product = db.prepare('SELECT id FROM products WHERE barcode=?').get(base);
    if (!product) product = db.prepare('SELECT id FROM products WHERE lower(trade_name)=lower(?) LIMIT 1').get(base);
    if (!product) product = db.prepare('SELECT p.id FROM products p JOIN drugs d ON d.id=p.drug_id WHERE lower(d.generic_name)=lower(?) LIMIT 1').get(base);
    if (!product) { results.unmatched.push(f.originalname); continue; }
    const url = `/uploads/products/${path.basename(f.path)}`;
    const sort = db.prepare('SELECT COALESCE(MAX(sort_order),0)+1 n FROM product_images WHERE product_id=?').get(product.id).n;
    db.prepare('INSERT INTO product_images(product_id,url,source,sort_order) VALUES(?,?,?,?)').run(product.id, url, 'bulk-upload', sort);
    const upd = db.prepare("UPDATE products SET image_url=?, image_source='bulk-upload' WHERE id=? AND (image_url IS NULL OR image_url='' OR image_source='generated')").run(url, product.id);
    if (upd.changes) results.assigned++;
    results.matched++;
    results.details.push({ file: f.originalname, url });
  }
  res.json(results);
});

/* ---------------- Import (CSV / XLSX / JSON) ---------------- */
const importsInFlight = new Map();

async function runImport(importId, filePath, kind, opts) {
  const importer = createImporter();
  let ok = 0; let failed = 0; let processed = 0; let lastSave = 0;
  const errors = [];
  const started = Date.now();
  const update = db.prepare('UPDATE imports SET rows_ok=?, rows_failed=?, log=? WHERE id=?');
  const save = (status) => {
    update.run(ok, failed, JSON.stringify({ processed, failed, total: null, elapsed_ms: Date.now() - started, errors: errors.slice(0, 10) }), importId);
    if (status) db.prepare('UPDATE imports SET status=? WHERE id=?').run(status, importId);
  };
  const consume = (rows) => {
    db.transaction((batch) => {
      for (const raw of batch) {
        try { importer(raw, opts); ok++; } catch (e) {
          failed++;
          if (errors.length < 10) errors.push({ row: processed + 1, error: e.message, keys: Object.keys(raw).slice(0, 8) });
        }
        processed++;
      }
    })(rows);
    if (processed - lastSave >= 2000) { lastSave = processed; save(); }
  };
  try {
    if (kind === 'csv') {
      let batch = [];
      for await (const row of csvRows(filePath)) {
        batch.push(row);
        if (batch.length >= 1000) {
          consume(batch); batch = [];
          await new Promise((r) => setImmediate(r));
        }
      }
      if (batch.length) consume(batch);
    } else {
      const rows = kind === 'xlsx' ? xlsxRows(filePath) : jsonRows(filePath);
      for (let i = 0; i < rows.length; i += 1000) {
        consume(rows.slice(i, i + 1000));
        await new Promise((r) => setImmediate(r));
      }
    }
    save('completed');
  } catch (e) {
    errors.push({ fatal: e.message });
    save('failed');
  } finally {
    importsInFlight.delete(importId);
    try { fs.unlinkSync(filePath); } catch { /* keep */ }
    db.prepare('UPDATE imports SET log=? WHERE id=?').run(JSON.stringify({ processed, errors: errors.slice(0, 10), elapsed_ms: Date.now() - started }), importId);
  }
}

router.post('/import', importUpload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'file is required (CSV, XLSX, JSON)' });
  const kind = detectKind(req.file.originalname);
  if (!kind) { try { fs.unlinkSync(req.file.path); } catch { /* ignore */ } return res.status(400).json({ error: 'صيغة غير مدعومة — استخدم CSV أو XLSX أو JSON' }); }
  const opts = { defaultSystemId: int(req.body?.system_id), verifyAll: req.body?.verify === '1' };
  const dryRun = req.body?.dryRun === '1' || req.query.dryRun === '1';

  if (dryRun) {
    const importer = createImporter();
    const preview = { rows: 0, ok: 0, failed: 0, errors: [], sample: [] };
    try {
      const rows = [];
      if (kind === 'csv') { for await (const r of csvRows(req.file.path)) { rows.push(r); if (rows.length >= 50) break; } }
      else if (kind === 'xlsx') rows.push(...xlsxRows(req.file.path).slice(0, 50));
      else rows.push(...jsonRows(req.file.path).slice(0, 50));
      db.exec('SAVEPOINT dryrun');
      for (const r of rows) {
        preview.rows++;
        if (preview.sample.length < 3) preview.sample.push(Object.keys(r).slice(0, 10));
        try { importer(r, opts); preview.ok++; } catch (e) { preview.failed++; if (preview.errors.length < 10) preview.errors.push(e.message); }
      }
      db.exec('ROLLBACK TO dryrun'); db.exec('RELEASE dryrun');
      try { fs.unlinkSync(req.file.path); } catch { /* ignore */ }
      return res.json({ dryRun: true, kind, ...preview });
    } catch (e) {
      try { db.exec('ROLLBACK TO dryrun'); db.exec('RELEASE dryrun'); } catch { /* ignore */ }
      try { fs.unlinkSync(req.file.path); } catch { /* ignore */ }
      return res.status(400).json({ error: e.message, ...preview });
    }
  }

  const info = db.prepare('INSERT INTO imports(user_id,filename,kind,status) VALUES(?,?,?,?)').run(req.user.id, req.file.originalname, kind, 'processing');
  const id = info.lastInsertRowid;
  importsInFlight.set(String(id), true);
  res.status(202).json({ id, status: 'processing' });
  setImmediate(() => { runImport(id, req.file.path, kind, opts).catch(() => {}); });
});

router.get('/imports', (_req, res) => res.json(db.prepare('SELECT * FROM imports ORDER BY id DESC LIMIT 100').all()));
router.get('/imports/:id', (req, res) => {
  const row = db.prepare('SELECT * FROM imports WHERE id=?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Not found' });
  let log = null;
  try { log = JSON.parse(row.log || 'null'); } catch { log = { raw: row.log }; }
  res.json({ ...row, log });
});

/* JSON bulk import straight from the browser (small/medium payloads) */
router.post('/import-json', (req, res) => {
  const rows = Array.isArray(req.body) ? req.body : req.body?.rows;
  if (!Array.isArray(rows)) return res.status(400).json({ error: 'rows array is required' });
  if (rows.length > 50000) return res.status(413).json({ error: 'استخدم ملف CSV للكميات الكبيرة' });
  const importer = createImporter();
  let ok = 0; let failed = 0; const errors = [];
  db.transaction((list) => {
    for (const r of list) {
      try { importer(r, { verifyAll: !!req.body?.verify }); ok++; }
      catch (e) { failed++; if (errors.length < 10) errors.push(e.message); }
    }
  })(rows);
  res.json({ ok, failed, errors, total: rows.length });
});

/* ---------------- Users ---------------- */
router.get('/users', (req, res) => {
  const q = req.query.q ? `%${String(req.query.q).toLowerCase()}%` : null;
  const rows = db.prepare(`SELECT u.id, u.name, u.email, u.role, u.provider, u.phone, u.city, u.country, u.active, u.created_at, u.avatar,
      (SELECT COUNT(*) FROM threads t WHERE t.user_id=u.id) threads,
      (SELECT COUNT(*) FROM prescriptions p WHERE p.user_id=u.id) prescriptions
    FROM users u ${q ? 'WHERE lower(u.name) LIKE ? OR lower(u.email) LIKE ?' : ''} ORDER BY u.id DESC LIMIT 500`)
    .all(...(q ? [q, q] : []));
  res.json(rows);
});
router.patch('/users/:id', (req, res) => {
  const { role, active, name, phone, city } = req.body || {};
  const user = db.prepare('SELECT * FROM users WHERE id=?').get(req.params.id);
  if (!user) return res.status(404).json({ error: 'Not found' });
  if (role && !['user', 'pharmacist', 'admin'].includes(role)) return res.status(400).json({ error: 'Invalid role' });
  if (user.id === req.user.id && role && role !== 'admin') return res.status(400).json({ error: 'لا يمكنك إزالة صلاحيتك' });
  if (user.id === req.user.id && active === 0) return res.status(400).json({ error: 'لا يمكنك تعطيل حسابك' });
  db.prepare('UPDATE users SET role=COALESCE(?,role), active=COALESCE(?,active), name=COALESCE(?,name), phone=COALESCE(?,phone), city=COALESCE(?,city) WHERE id=?')
    .run(role || null, active === undefined ? null : (active ? 1 : 0), clean(name), clean(phone), clean(city), user.id);
  res.json({ ok: true });
});
router.delete('/users/:id', (req, res) => {
  if (int(req.params.id) === req.user.id) return res.status(400).json({ error: 'لا يمكنك حذف حسابك' });
  db.prepare('DELETE FROM users WHERE id=?').run(req.params.id);
  res.json({ ok: true });
});
router.post('/users/:id/password', (req, res) => {
  const pw = String(req.body?.password || '');
  if (pw.length < 6) return res.status(400).json({ error: 'كلمة المرور قصيرة' });
  db.prepare('UPDATE users SET password_hash=? WHERE id=?').run(hashPassword(pw), req.params.id);
  res.json({ ok: true });
});

/* ---------------- Threads oversight ---------------- */
router.get('/threads', (req, res) => {
  const rows = db.prepare(`SELECT t.*, u.name AS author_name, u.email AS author_email,
      (SELECT COUNT(*) FROM thread_messages m WHERE m.thread_id=t.id) messages,
      (SELECT body FROM thread_messages m WHERE m.thread_id=t.id ORDER BY id DESC LIMIT 1) last_message
    FROM threads t LEFT JOIN users u ON u.id=t.user_id
    ${req.query.status ? 'WHERE t.status=?' : ''} ORDER BY t.updated_at DESC LIMIT 300`)
    .all(...(req.query.status ? [req.query.status] : []));
  res.json(rows);
});
router.get('/threads/:id', (req, res) => {
  const t = db.prepare('SELECT t.*, u.name AS author_name, u.email AS author_email FROM threads t LEFT JOIN users u ON u.id=t.user_id WHERE t.id=?').get(req.params.id);
  if (!t) return res.status(404).json({ error: 'Not found' });
  const messages = db.prepare('SELECT m.*, u.name AS author_name, u.role AS author_role FROM thread_messages m LEFT JOIN users u ON u.id=m.user_id WHERE m.thread_id=? ORDER BY m.id').all(t.id);
  res.json({ ...t, messages });
});
router.post('/threads/:id/reply', (req, res) => {
  const t = db.prepare('SELECT * FROM threads WHERE id=?').get(req.params.id);
  if (!t) return res.status(404).json({ error: 'Not found' });
  const body = String(req.body?.body || '').trim();
  if (!body) return res.status(400).json({ error: 'الرسالة مطلوبة' });
  db.prepare('INSERT INTO thread_messages(thread_id,user_id,body,is_staff) VALUES(?,?,?,1)').run(t.id, req.user.id, body.slice(0, 5000));
  db.prepare("UPDATE threads SET updated_at=datetime('now'), status=CASE WHEN status='closed' THEN status ELSE 'answered' END, is_public=COALESCE(?,is_public) WHERE id=?")
    .run(req.body?.publish ? 1 : null, t.id);
  res.status(201).json({ ok: true });
});
router.patch('/threads/:id', (req, res) => {
  const t = db.prepare('SELECT * FROM threads WHERE id=?').get(req.params.id);
  if (!t) return res.status(404).json({ error: 'Not found' });
  const { status, is_public } = req.body || {};
  db.prepare('UPDATE threads SET status=COALESCE(?,status), is_public=COALESCE(?,is_public), updated_at=datetime(\'now\') WHERE id=?')
    .run(status || null, is_public === undefined ? null : (is_public ? 1 : 0), t.id);
  res.json({ ok: true });
});
router.delete('/threads/:id', (req, res) => {
  db.prepare('DELETE FROM threads WHERE id=?').run(req.params.id);
  res.json({ ok: true });
});

/* ---------------- Jobs oversight ---------------- */
router.get('/jobs', (_req, res) => {
  res.json(db.prepare(`SELECT j.*, u.name AS author_name, u.email AS author_email FROM jobs j
    LEFT JOIN users u ON u.id=j.user_id ORDER BY j.id DESC LIMIT 300`).all());
});
router.patch('/jobs/:id', (req, res) => {
  const { status } = req.body || {};
  if (!['published', 'hidden'].includes(status)) return res.status(400).json({ error: 'Invalid status' });
  db.prepare('UPDATE jobs SET status=? WHERE id=?').run(status, req.params.id);
  res.json({ ok: true });
});
router.delete('/jobs/:id', (req, res) => {
  db.prepare('DELETE FROM jobs WHERE id=?').run(req.params.id);
  res.json({ ok: true });
});

/* ---------------- Prescriptions oversight ---------------- */
router.get('/prescriptions', (_req, res) => {
  res.json(db.prepare(`SELECT p.*, u.name AS author_name, u.email AS author_email FROM prescriptions p
    LEFT JOIN users u ON u.id=p.user_id ORDER BY p.id DESC LIMIT 200`).all());
});

/* ---------------- Settings ---------------- */
const SETTING_KEYS = ['site_name_en', 'site_name_ar', 'owner_name', 'owner_title', 'owner_email', 'whatsapp', 'support_email',
  'about_ar', 'about_en', 'maintenance', 'allow_registration', 'default_lang', 'theme_color', 'ai_enabled', 'disclaimer_ar', 'disclaimer_en',
  'google_client_id', 'welcome_enabled', 'welcome_title', 'welcome_text',
  'welcome_title_ar', 'welcome_title_en', 'welcome_text_ar', 'welcome_text_en'];

router.get('/settings', (_req, res) => {
  const out = {};
  for (const k of SETTING_KEYS) out[k] = getSetting(k);
  res.json({
    settings: out,
    env: {
      ai: !!(process.env.AI_API_KEY || process.env.OPENAI_API_KEY),
      google_login: !!googleClientId(),
      google_cse: !!(process.env.GOOGLE_CSE_KEY && process.env.GOOGLE_CSE_CX),
      node: process.version,
      db_file: process.env.DB_FILE || 'data/mda.db',
    },
  });
});
router.put('/settings', (req, res) => {
  const b = req.body || {};
  for (const k of SETTING_KEYS) if (b[k] !== undefined) setSetting(k, b[k]);
  res.json({ ok: true, settings: Object.fromEntries(SETTING_KEYS.map((k) => [k, getSetting(k)])) });
});

/* ---------------- Maintenance ---------------- */
router.post('/rebuild-search', (_req, res) => {
  /* Re-normalize every search_norm with the same helper the importer uses
     (lowercase, hamza/ya/ta-marbuta folding, diacritics, digits, punctuation).
     A plain SQL lower() here would silently break Arabic matching. */
  const drugs = db.prepare(`SELECT d.id, d.generic_name, d.generic_ar, d.synonyms, d.drug_class, s.name_ar AS system_ar, s.name_en AS system_en
    FROM drugs d LEFT JOIN systems s ON s.id=d.system_id`).all();
  const products = db.prepare(`SELECT p.id, p.trade_name, p.trade_name_ar, p.strength, p.dosage_form, p.barcode,
      d.generic_name, d.generic_ar, m.name AS manufacturer_name, a.name AS agent_name
    FROM products p LEFT JOIN drugs d ON d.id=p.drug_id LEFT JOIN manufacturers m ON m.id=p.manufacturer_id
    LEFT JOIN agents a ON a.id=p.agent_id`).all();
  const upDrug = db.prepare('UPDATE drugs SET search_norm=? WHERE id=?');
  const upProd = db.prepare('UPDATE products SET search_norm=? WHERE id=?');
  db.transaction(() => {
    for (const d of drugs) upDrug.run(searchNorm(d.generic_name, d.generic_ar, d.synonyms, d.drug_class, d.system_ar, d.system_en), d.id);
    for (const p of products) upProd.run(searchNorm(p.trade_name, p.trade_name_ar, p.strength, p.dosage_form, p.barcode,
      p.generic_name, p.generic_ar, p.manufacturer_name, p.agent_name), p.id);
  })();
  try {
    db.exec("INSERT INTO drugs_fts(drugs_fts) VALUES('rebuild');");
    db.exec("INSERT INTO products_fts(products_fts) VALUES('rebuild');");
  } catch { /* FTS optional */ }
  res.json({ ok: true, drugs: drugs.length, products: products.length });
});

router.post('/verify', (req, res) => {
  const { type, ids, verified = 1 } = req.body || {};
  const table = type === 'drugs' ? 'drugs' : 'products';
  if (!Array.isArray(ids) || !ids.length) return res.status(400).json({ error: 'ids are required' });
  const stmt = db.prepare(`UPDATE ${table} SET verified=? WHERE id=?`);
  db.transaction((list) => { for (const id of list) stmt.run(verified ? 1 : 0, int(id)); })(ids);
  res.json({ ok: true, updated: ids.length });
});

/* Full catalogue export (also used as a backup) */
router.get('/export', (_req, res) => {
  const payload = {
    exported_at: new Date().toISOString(),
    systems: db.prepare('SELECT * FROM systems ORDER BY id').all(),
    categories: db.prepare('SELECT * FROM categories ORDER BY id').all(),
    drugs: db.prepare('SELECT * FROM drugs ORDER BY id').all(),
    products: db.prepare('SELECT * FROM products ORDER BY id').all(),
    product_images: db.prepare('SELECT * FROM product_images ORDER BY id').all(),
    manufacturers: db.prepare('SELECT * FROM manufacturers ORDER BY id').all(),
    agents: db.prepare('SELECT * FROM agents ORDER BY id').all(),
  };
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="mda-export-${new Date().toISOString().slice(0, 10)}.json"`);
  res.send(JSON.stringify(payload));
});

/* Health / diagnostics for the admin dashboard */
router.get('/diagnostics', (_req, res) => {
  const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").all().map((t) => t.name);
  const counts = {};
  for (const t of tables) { try { counts[t] = db.prepare(`SELECT COUNT(*) n FROM ${t}`).get().n; } catch { counts[t] = null; } }
  res.json({
    counts,
    db_file: process.env.DB_FILE || 'data/mda.db',
    uploads_dir: UPLOAD_DIR,
    uploads_mb: Math.round(dirSize(UPLOAD_DIR) / 1024 / 1024),
    node: process.version,
    env: {
      ai: !!(process.env.AI_API_KEY || process.env.OPENAI_API_KEY),
      google_login: !!process.env.GOOGLE_CLIENT_ID,
      google_cse: !!(process.env.GOOGLE_CSE_KEY && process.env.GOOGLE_CSE_CX),
      whatsapp: process.env.WHATSAPP_NUMBER || '+967781733795',
    },
    images: {
      products_with_image: db.prepare("SELECT COUNT(*) n FROM products p WHERE active=1 AND (p.image_url IS NOT NULL AND p.image_url<>'' OR EXISTS (SELECT 1 FROM product_images pi WHERE pi.product_id=p.id AND pi.source<>'generated'))").get().n,
      products_total: db.prepare('SELECT COUNT(*) n FROM products WHERE active=1').get().n,
    },
  });
});

export default router;
