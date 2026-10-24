/* Public catalog: systems, classes, drugs, products, search, directories */
import { Router } from 'express';
import { db } from '../db.js';
import { normalize, searchNorm, rankCandidates, likePattern, similarity, queryTokens } from '../lib/search.js';
import { packSvg, capsuleSvg } from '../lib/packArt.js';

const router = Router();
const safeLimit = (v, def = 20, max = 100) => Math.max(1, Math.min(max, parseInt(v, 10) || def));

router.get('/systems', (_req, res) => {
  const rows = db.prepare(`
    SELECT s.*,
      (SELECT COUNT(*) FROM categories c WHERE c.system_id = s.id) AS categories,
      (SELECT COUNT(*) FROM drugs d WHERE d.system_id = s.id) AS drugs,
      (SELECT COUNT(*) FROM products p JOIN drugs d ON d.id = p.drug_id WHERE d.system_id = s.id AND p.active=1) AS products
    FROM systems s ORDER BY s.sort_order, s.id
  `).all();
  res.json(rows);
});

router.get('/systems/:slug', (req, res) => {
  const system = db.prepare('SELECT * FROM systems WHERE slug=?').get(req.params.slug);
  if (!system) return res.status(404).json({ error: 'System not found' });
  const categories = db.prepare(`
    SELECT c.*, (SELECT COUNT(*) FROM drugs d WHERE d.category_id=c.id) AS drugs
    FROM categories c WHERE c.system_id=? ORDER BY c.sort_order, c.name_en
  `).all(system.id);
  res.json({ ...system, category_list: categories });
});

router.get('/categories/:id', (req, res) => {
  const category = db.prepare(`SELECT c.*, s.slug AS system_slug, s.name_en AS system_en, s.name_ar AS system_ar
    FROM categories c JOIN systems s ON s.id=c.system_id WHERE c.id=?`).get(req.params.id);
  if (!category) return res.status(404).json({ error: 'Category not found' });
  res.json(category);
});

router.get('/drugs', (req, res) => {
  const { system, category, q } = req.query;
  const limit = safeLimit(req.query.limit, 30, 200);
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const offset = (page - 1) * limit;
  const where = [];
  const params = {};
  if (system) { where.push('s.slug = @system'); params.system = system; }
  if (category) { where.push('d.category_id = @category'); params.category = Number(category); }
  if (q) { where.push('(d.search_norm LIKE @q OR d.generic_name LIKE @q OR p.search_norm LIKE @q)'); params.q = likePattern(q); }
  const base = `FROM drugs d
    LEFT JOIN systems s ON s.id=d.system_id
    LEFT JOIN categories c ON c.id=d.category_id
    ${q ? 'LEFT JOIN products p ON p.drug_id=d.id' : ''}
    ${where.length ? 'WHERE ' + where.join(' AND ') : ''}`;
  const rows = db.prepare(`SELECT DISTINCT d.id, d.generic_name, d.generic_ar, d.drug_class, d.atc_code, d.prescription_required,
      d.verified, s.slug AS system_slug, s.name_en AS system_en, s.name_ar AS system_ar, c.name_en AS category_en, c.name_ar AS category_ar,
      (SELECT COUNT(*) FROM products p2 WHERE p2.drug_id=d.id AND p2.active=1) AS products_count,
      (SELECT image_url FROM products p3 WHERE p3.drug_id=d.id AND p3.image_url IS NOT NULL LIMIT 1) AS image_url
    ${base} ORDER BY d.generic_name LIMIT @limit OFFSET @offset`)
    .all({ ...params, limit, offset });
  const total = db.prepare(`SELECT COUNT(DISTINCT d.id) AS n ${base}`).get(params).n;
  res.json({ data: rows, page, limit, total, pages: Math.ceil(total / limit) });
});

router.get('/drugs/:id', (req, res) => {
  const drug = db.prepare(`
    SELECT d.*, s.slug AS system_slug, s.name_en AS system_en, s.name_ar AS system_ar, s.color AS system_color,
           c.name_en AS category_en, c.name_ar AS category_ar
    FROM drugs d LEFT JOIN systems s ON s.id=d.system_id LEFT JOIN categories c ON c.id=d.category_id
    WHERE d.id=?`).get(req.params.id);
  if (!drug) return res.status(404).json({ error: 'Drug not found' });
  const products = db.prepare(`
    SELECT p.*, m.name AS manufacturer_name, m.country AS manufacturer_country,
           a.name AS agent_name, a.phone AS agent_phone, a.city AS agent_city
    FROM products p LEFT JOIN manufacturers m ON m.id=p.manufacturer_id LEFT JOIN agents a ON a.id=p.agent_id
    WHERE p.drug_id=? AND p.active=1 ORDER BY p.verified DESC, p.trade_name COLLATE NOCASE LIMIT 400`).all(drug.id);
  const images = products.length
    ? db.prepare(`SELECT * FROM product_images WHERE product_id IN (${products.map(() => '?').join(',')}) ORDER BY sort_order`)
      .all(...products.map((p) => p.id))
    : [];
  const byDrug = new Map();
  for (const img of images) {
    if (!byDrug.has(img.product_id)) byDrug.set(img.product_id, []);
    byDrug.get(img.product_id).push(img);
  }
  const related = db.prepare(`
    SELECT d2.id, d2.generic_name, d2.generic_ar, d2.drug_class,
      (SELECT COUNT(*) FROM products p WHERE p.drug_id=d2.id AND p.active=1) AS products_count
    FROM drugs d2 WHERE d2.id<>? AND (
      (d2.category_id = ? AND ? IS NOT NULL) OR
      (d2.drug_class = ? AND ? IS NOT NULL)
    ) ORDER BY d2.generic_name LIMIT 12`)
    .all(drug.id, drug.category_id, drug.category_id, drug.drug_class, drug.drug_class);
  res.json({
    ...drug,
    products: products.map((p) => ({ ...p, images: byDrug.get(p.id) || [] })),
    related,
  });
});

router.get('/products', (req, res) => {
  const limit = safeLimit(req.query.limit, 30, 200);
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const q = req.query.q;
  const params = { limit, offset: (page - 1) * limit };
  const where = ['p.active=1'];
  if (q) { where.push('(p.search_norm LIKE @q OR p.trade_name LIKE @q)'); params.q = likePattern(q); }
  if (req.query.country) { where.push('p.country = @country'); params.country = req.query.country; }
  if (req.query.verified === '1') where.push('p.verified=1');
  const w = 'WHERE ' + where.join(' AND ');
  const data = db.prepare(`SELECT p.*, d.generic_name, d.generic_ar, m.name AS manufacturer_name, a.name AS agent_name
    FROM products p LEFT JOIN drugs d ON d.id=p.drug_id LEFT JOIN manufacturers m ON m.id=p.manufacturer_id
    LEFT JOIN agents a ON a.id=p.agent_id ${w} ORDER BY p.verified DESC, p.trade_name COLLATE NOCASE LIMIT @limit OFFSET @offset`).all(params);
  const total = db.prepare(`SELECT COUNT(*) n FROM products p ${w}`).get(params).n;
  res.json({ data, page, limit, total, pages: Math.ceil(total / limit) });
});

router.get('/products/:id', (req, res) => {
  const p = db.prepare(`SELECT p.*, d.generic_name, d.generic_ar, d.id AS drug_id, d.drug_class, d.indications_ar, d.indications_en,
      d.dosage_adult, d.warnings, d.side_effects, m.name AS manufacturer_name, m.country AS manufacturer_country,
      a.name AS agent_name, a.phone AS agent_phone, a.email AS agent_email, a.city AS agent_city
    FROM products p LEFT JOIN drugs d ON d.id=p.drug_id LEFT JOIN manufacturers m ON m.id=p.manufacturer_id
    LEFT JOIN agents a ON a.id=p.agent_id WHERE p.id=?`).get(req.params.id);
  if (!p) return res.status(404).json({ error: 'Product not found' });
  const images = db.prepare('SELECT * FROM product_images WHERE product_id=? ORDER BY sort_order').all(p.id);
  const alternatives = p.drug_id ? db.prepare(`SELECT p2.id, p2.trade_name, p2.trade_name_ar, p2.strength, p2.dosage_form,
      p2.image_url, p2.country, p2.price, p2.currency, m.name AS manufacturer_name
    FROM products p2 LEFT JOIN manufacturers m ON m.id=p2.manufacturer_id
    WHERE p2.drug_id=? AND p2.id<>? AND p2.active=1 ORDER BY p2.verified DESC LIMIT 30`).all(p.drug_id, p.id) : [];
  res.json({ ...p, images, alternatives });
});

/* Generated pack artwork for products without a real photo */
router.get('/product-image/:id.svg', (req, res) => {
  const p = db.prepare(`SELECT p.*, d.generic_name, d.generic_ar, s.color AS color, s.name_en AS system_en
    FROM products p LEFT JOIN drugs d ON d.id=p.drug_id LEFT JOIN systems s ON s.id=d.system_id WHERE p.id=?`).get(req.params.id);
  if (!p) return res.status(404).end();
  res.setHeader('Content-Type', 'image/svg+xml; charset=utf-8');
  res.setHeader('Cache-Control', 'public, max-age=604800');
  res.send(packSvg(p));
});

router.get('/drug-image/:id.svg', (req, res) => {
  const d = db.prepare(`SELECT d.*, s.color AS color FROM drugs d LEFT JOIN systems s ON s.id=d.system_id WHERE d.id=?`).get(req.params.id);
  if (!d) return res.status(404).end();
  res.setHeader('Content-Type', 'image/svg+xml; charset=utf-8');
  res.setHeader('Cache-Control', 'public, max-age=604800');
  res.send(capsuleSvg(d));
});

/* Typo tolerant global search */
router.get('/search', (req, res) => {
  const q = String(req.query.q || '').trim();
  if (!q) return res.json({ query: q, drugs: [], products: [], suggestions: [] });
  const norm = normalize(q);
  const like = likePattern(q);
  /* Match either the whole phrase or any meaningful token ("500 mg panadol" → "panadol") */
  const terms = [...new Set([norm, ...queryTokens(q)].filter((t) => t.length >= 2))].slice(0, 4);
  const termLikes = terms.map((t) => `%${t.replace(/[%_]/g, '')}%`);
  const orLikes = (cols) => termLikes.map((t) => cols.map((c) => `${c} LIKE '${t.replace(/'/g, "''")}'`).join(' OR ')).join(' OR ');

  const DRUG_COLS = `d.id, d.generic_name, d.generic_ar, d.synonyms, d.drug_class, d.atc_code, d.prescription_required, d.verified,
      d.search_norm, s.slug AS system_slug, s.name_en AS system_en, s.name_ar AS system_ar, s.color AS system_color,
      (SELECT COUNT(*) FROM products p WHERE p.drug_id=d.id AND p.active=1) AS products_count,
      (SELECT image_url FROM products p2 WHERE p2.drug_id=d.id AND p2.image_url IS NOT NULL LIMIT 1) AS image_url`;
  const PRODUCT_COLS = `p.id, p.trade_name, p.trade_name_ar, p.strength, p.dosage_form, p.pack_size, p.country, p.image_url,
      p.price, p.currency, p.verified, p.search_norm, d.id AS drug_id, d.generic_name, d.generic_ar, d.drug_class,
      m.name AS manufacturer_name, a.name AS agent_name`;

  const drugRows = db.prepare(`
    SELECT ${DRUG_COLS}
    FROM drugs d LEFT JOIN systems s ON s.id=d.system_id
    WHERE ${orLikes(['d.search_norm', 'd.generic_name', 'd.generic_ar', 'd.synonyms'])}
    LIMIT 400`).all();

  const productRows = db.prepare(`
    SELECT ${PRODUCT_COLS}
    FROM products p LEFT JOIN drugs d ON d.id=p.drug_id LEFT JOIN manufacturers m ON m.id=p.manufacturer_id
    LEFT JOIN agents a ON a.id=p.agent_id
    WHERE p.active=1 AND (${orLikes(['p.search_norm', 'p.trade_name', 'p.trade_name_ar'])} OR p.barcode = ?)
    LIMIT 400`).all(q);

  /* Progressive fallback for typos: relax to 2-char prefix / swapped prefix / same first letter */
  const anchor = [...terms].sort((a, b) => b.length - a.length)[0] || norm;
  if (drugRows.length < 6 && anchor.length >= 3) {
    const p2 = anchor.slice(0, 2);
    const p2swap = anchor[1] + anchor[0];
    const p1 = anchor[0];
    const extra = db.prepare(`
      SELECT ${DRUG_COLS}
      FROM drugs d LEFT JOIN systems s ON s.id=d.system_id
      WHERE d.search_norm LIKE ? OR d.search_norm LIKE ? OR d.generic_ar LIKE ?
        OR (d.search_norm LIKE ? AND length(d.generic_name) BETWEEN ? AND ?)
      LIMIT 500`).all(`${p2}%`, `${p2swap}%`, `${p1}%`, `${p1}%`, Math.max(3, anchor.length - 4), anchor.length + 5);
    const seen = new Set(drugRows.map((r) => r.id));
    for (const r of extra) if (!seen.has(r.id)) { seen.add(r.id); drugRows.push(r); }
  }
  if (productRows.length < 8 && anchor.length >= 3) {
    const p2 = anchor.slice(0, 2);
    const p2swap = anchor[1] + anchor[0];
    const p1 = anchor[0];
    const extra = db.prepare(`
      SELECT ${PRODUCT_COLS}
      FROM products p LEFT JOIN drugs d ON d.id=p.drug_id LEFT JOIN manufacturers m ON m.id=p.manufacturer_id
      LEFT JOIN agents a ON a.id=p.agent_id
      WHERE p.active=1 AND (p.search_norm LIKE ? OR p.search_norm LIKE ? OR p.trade_name_ar LIKE ?
        OR (p.search_norm LIKE ? AND length(p.trade_name) BETWEEN ? AND ?))
      LIMIT 700`).all(`${p2}%`, `${p2swap}%`, `${p1}%`, `${p1}%`, Math.max(3, anchor.length - 6), anchor.length + 7);
    const seen = new Set(productRows.map((r) => r.id));
    for (const r of extra) if (!seen.has(r.id)) { seen.add(r.id); productRows.push(r); }
  }

  const drugHits = rankCandidates(q, drugRows, ['generic_name', 'generic_ar', 'synonyms', 'drug_class'], 30, 0.34);
  const productHits = rankCandidates(q, productRows, ['trade_name', 'trade_name_ar', 'generic_name', 'generic_ar'], 40, 0.4);

  // attach quick product previews to drugs
  const previewStmt = db.prepare(`SELECT p.id, p.trade_name, p.trade_name_ar, p.strength, p.dosage_form, p.image_url,
      p.country, p.price, p.currency, m.name AS manufacturer_name
    FROM products p LEFT JOIN manufacturers m ON m.id=p.manufacturer_id
    WHERE p.drug_id=? AND p.active=1 ORDER BY p.verified DESC, p.trade_name LIMIT 4`);
  const drugs = drugHits.map(({ row, score }) => ({ ...row, score, products_preview: previewStmt.all(row.id) }));

  // include drugs owning matched products
  const seen = new Set(drugs.map((d) => d.id));
  for (const { row, score } of productHits) {
    if (row.drug_id && !seen.has(row.drug_id)) {
      seen.add(row.drug_id);
      const d = db.prepare(`SELECT d.id, d.generic_name, d.generic_ar, d.drug_class, d.prescription_required, d.verified,
          s.slug AS system_slug, s.name_en AS system_en, s.name_ar AS system_ar, s.color AS system_color,
          (SELECT COUNT(*) FROM products p WHERE p.drug_id=d.id AND p.active=1) AS products_count
        FROM drugs d LEFT JOIN systems s ON s.id=d.system_id WHERE d.id=?`).get(row.drug_id);
      if (d) drugs.push({ ...d, score: score * 0.95, products_preview: previewStmt.all(d.id) });
    }
  }
  drugs.sort((a, b) => b.score - a.score);

  const suggestions = [...new Set([
    ...drugs.slice(0, 5).map((d) => d.generic_name),
    ...productHits.slice(0, 5).map((p) => p.row.trade_name),
  ])].slice(0, 8);

  try {
    db.prepare(`INSERT INTO search_terms(term,hits) VALUES(?,1)
      ON CONFLICT(term) DO UPDATE SET hits=hits+1, last_at=datetime('now')`).run(norm.slice(0, 80));
  } catch { /* non critical */ }

  res.json({
    query: q,
    normalized: norm,
    drugs: drugs.slice(0, 30),
    products: productHits.map(({ row, score }) => ({ ...row, score })),
    suggestions,
  });
});

router.get('/manufacturers', (req, res) => {
  const q = req.query.q ? likePattern(req.query.q) : null;
  const rows = db.prepare(`SELECT m.*, (SELECT COUNT(*) FROM products p WHERE p.manufacturer_id=m.id) AS products_count
    FROM manufacturers m ${q ? 'WHERE m.name LIKE @q OR m.country LIKE @q' : ''} ORDER BY products_count DESC, m.name LIMIT 500`)
    .all(q ? { q } : {});
  res.json(rows);
});

router.get('/agents', (req, res) => {
  const q = req.query.q ? likePattern(req.query.q) : null;
  const rows = db.prepare(`SELECT a.*, (SELECT COUNT(*) FROM products p WHERE p.agent_id=a.id) AS products_count
    FROM agents a ${q ? 'WHERE a.name LIKE @q OR a.country LIKE @q OR a.city LIKE @q' : ''} ORDER BY products_count DESC, a.name LIMIT 500`)
    .all(q ? { q } : {});
  res.json(rows);
});

router.get('/stats', (_req, res) => {
  const one = (sql) => db.prepare(sql).get().n;
  res.json({
    systems: one('SELECT COUNT(*) n FROM systems'),
    categories: one('SELECT COUNT(*) n FROM categories'),
    drugs: one('SELECT COUNT(*) n FROM drugs'),
    products: one('SELECT COUNT(*) n FROM products WHERE active=1'),
    manufacturers: one('SELECT COUNT(*) n FROM manufacturers'),
    agents: one('SELECT COUNT(*) n FROM agents'),
    users: one('SELECT COUNT(*) n FROM users'),
  });
});

router.get('/barcode/:code', (req, res) => {
  const p = db.prepare(`SELECT p.*, d.generic_name, d.generic_ar, m.name AS manufacturer_name
    FROM products p LEFT JOIN drugs d ON d.id=p.drug_id LEFT JOIN manufacturers m ON m.id=p.manufacturer_id
    WHERE p.barcode=? AND p.active=1`).all(req.params.code);
  res.json(p);
});

router.get('/trending', (_req, res) => {
  const terms = db.prepare('SELECT term FROM search_terms ORDER BY hits DESC, last_at DESC LIMIT 12').all().map((r) => r.term);
  res.json(terms.length ? terms : ['paracetamol', 'amoxicillin', 'omeprazole', 'metformin', 'vitamin d']);
});

/* Offline pack: compact catalogue for the PWA / Android offline mode */
router.get('/offline-pack', (_req, res) => {
  const systems = db.prepare('SELECT id, slug, name_en, name_ar, icon, color FROM systems ORDER BY sort_order').all();
  const drugs = db.prepare(`SELECT d.id, d.generic_name, d.generic_ar, d.synonyms, d.drug_class, d.atc_code,
      d.prescription_required, d.indications_ar, d.indications_en, d.dosage_adult, d.dosage_child,
      d.contraindications, d.side_effects, d.warnings, d.pregnancy, d.system_id, d.category_id,
      s.slug AS system_slug, s.name_ar AS system_ar, s.name_en AS system_en, s.color AS system_color
    FROM drugs d LEFT JOIN systems s ON s.id=d.system_id ORDER BY d.generic_name`).all();
  const products = db.prepare(`SELECT p.id, p.drug_id, p.trade_name, p.trade_name_ar, p.strength, p.dosage_form, p.pack_size,
      p.country, p.image_url, p.price, p.currency, p.barcode, m.name AS manufacturer_name, a.name AS agent_name
    FROM products p LEFT JOIN manufacturers m ON m.id=p.manufacturer_id LEFT JOIN agents a ON a.id=p.agent_id
    WHERE p.active=1 ORDER BY p.trade_name`).all();
  res.setHeader('Cache-Control', 'public, max-age=1800');
  res.json({ generated_at: new Date().toISOString(), systems, drugs, products });
});

export default router;
