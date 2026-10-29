/* Public catalog: systems, classes, drugs, products, search, directories */
import { Router } from 'express';
import { db } from '../db.js';
import { normalize, searchNorm, rankCandidates, likePattern, similarity, queryTokens } from '../lib/search.js';
import { packSvg, capsuleSvg } from '../lib/packArt.js';
import { withProductVerification, withDrugVerification } from '../lib/verification.js';
import { detail as verificationDetail } from '../lib/verification-workflow.js';
import { checkInteractions } from '../lib/interactions.js';

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
    ...withDrugVerification(drug),
    products: products.map((p) => ({ ...withProductVerification(p), images: byDrug.get(p.id) || [] })),
    related,
    verification_detail: verificationDetail('drugs', drug.id),
  });
});

/*
 * Commercial product browser (v1.12.0). Filters the plan calls for — country of marketing,
 * manufacturer, local agent, verification state, presence of a real photo, and free text —
 * plus the derived `verification` field so a client never has to guess what "verified" means.
 */
router.get('/products', (req, res) => {
  const limit = safeLimit(req.query.limit, 30, 200);
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const q = String(req.query.q || '').trim();
  const params = { limit, offset: (page - 1) * limit };
  const where = ['p.active=1'];
  if (q) {
    where.push('(p.search_norm LIKE @q OR p.trade_name LIKE @q OR p.trade_name_ar LIKE @q OR p.barcode LIKE @q OR d.search_norm LIKE @q)');
    params.q = likePattern(q);
  }
  if (req.query.country) { where.push('p.country = @country'); params.country = req.query.country; }
  if (req.query.system) { where.push('d.system_id = (SELECT id FROM systems WHERE slug=@system)'); params.system = req.query.system; }
  if (req.query.manufacturer) { where.push('p.manufacturer_id = @manufacturer'); params.manufacturer = Number(req.query.manufacturer); }
  if (req.query.agent) { where.push('p.agent_id = @agent'); params.agent = Number(req.query.agent); }
  if (req.query.verified === '1') where.push('p.verified=1');
  if (req.query.unverified === '1') where.push('p.verified=0');
  /* Six-state filter (v1.13.0). The legacy `verified=1` above stays for older clients. */
  if (req.query.state) { where.push('p.verification_state = @state'); params.state = String(req.query.state); }
  if (req.query.review) { where.push("COALESCE(p.review_status,'none') = @review"); params.review = String(req.query.review); }
  if (req.query.has_image === '1') where.push("p.image_url IS NOT NULL AND p.image_url <> ''");
  if (req.query.drug) { where.push('p.drug_id = @drug'); params.drug = Number(req.query.drug); }
  const w = 'WHERE ' + where.join(' AND ');
  const rows = db.prepare(`SELECT p.*, d.generic_name, d.generic_ar, d.id AS drug_id, d.drug_class,
      s.slug AS system_slug, s.name_ar AS system_ar, s.name_en AS system_en,
      m.name AS manufacturer_name, m.country AS manufacturer_country, a.name AS agent_name, a.city AS agent_city
    FROM products p
    LEFT JOIN drugs d ON d.id=p.drug_id
    LEFT JOIN systems s ON s.id=d.system_id
    LEFT JOIN manufacturers m ON m.id=p.manufacturer_id
    LEFT JOIN agents a ON a.id=p.agent_id
    ${w} ORDER BY p.verified DESC, p.trade_name COLLATE NOCASE LIMIT @limit OFFSET @offset`).all(params);
  const total = db.prepare(`SELECT COUNT(*) n FROM products p LEFT JOIN drugs d ON d.id=p.drug_id ${w}`).get(params).n;
  res.json({
    data: rows.map(withProductVerification),
    page, limit, total, pages: Math.ceil(total / limit),
  });
});

/* Filter values for the browser above — read from the data, not a hand-written list. */
router.get('/products-facets', (_req, res) => {
  res.json({
    countries: db.prepare(`SELECT country AS value, COUNT(*) n FROM products
      WHERE active=1 AND country IS NOT NULL AND country<>'' GROUP BY country ORDER BY n DESC LIMIT 40`).all(),
    manufacturers: db.prepare(`SELECT m.id AS value, m.name AS label, COUNT(p.id) n
      FROM manufacturers m JOIN products p ON p.manufacturer_id=m.id AND p.active=1
      GROUP BY m.id ORDER BY n DESC LIMIT 40`).all(),
    agents: db.prepare(`SELECT a.id AS value, a.name AS label, a.city, COUNT(p.id) n
      FROM agents a JOIN products p ON p.agent_id=a.id AND p.active=1
      GROUP BY a.id ORDER BY n DESC LIMIT 40`).all(),
    systems: db.prepare(`SELECT s.slug AS value, s.name_ar AS label_ar, s.name_en AS label_en,
        COUNT(p.id) n FROM systems s
      LEFT JOIN drugs d ON d.system_id=s.id
      LEFT JOIN products p ON p.drug_id=d.id AND p.active=1
      GROUP BY s.id ORDER BY n DESC`).all(),
    states: db.prepare(`SELECT COALESCE(verification_state,'unverified') AS value, COUNT(*) n
      FROM products WHERE active=1 GROUP BY value ORDER BY n DESC`).all(),
    reviews: db.prepare(`SELECT COALESCE(review_status,'none') AS value, COUNT(*) n
      FROM products WHERE active=1 GROUP BY value`).all(),
    totals: {
      products: db.prepare('SELECT COUNT(*) n FROM products WHERE active=1').get().n,
      verified: db.prepare('SELECT COUNT(*) n FROM products WHERE active=1 AND verified=1').get().n,
      with_image: db.prepare("SELECT COUNT(*) n FROM products WHERE active=1 AND image_url IS NOT NULL AND image_url<>''").get().n,
    },
  });
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
  const drug = p.drug_id ? db.prepare('SELECT * FROM drugs WHERE id=?').get(p.drug_id) : null;
  res.json({
    ...withProductVerification(p),
    images,
    alternatives: alternatives.map(withProductVerification),
    /* The full review trail: state + who + when + which documents + what is still missing.
       `verification` (a string) stays for list-style clients; this is the honest detail. */
    verification_detail: verificationDetail('products', p.id),
    drug_verification: drug ? withDrugVerification(drug).verification : null,
    drug_verification_detail: drug ? verificationDetail('drugs', drug.id) : null,
  });
});

/*
 * Pair-wise interaction check (v1.12.0) — POST { drug_ids: [1,2,3] } or { names: ["warfarin","aspirin"] }.
 * Public and read-only: it reads stored text, creates nothing, and returns its own limits.
 */
router.post('/interactions/check', (req, res) => {
  const ids = Array.isArray(req.body?.drug_ids) ? req.body.drug_ids.map(Number).filter((n) => Number.isFinite(n) && n > 0) : [];
  const names = Array.isArray(req.body?.names) ? req.body.names.map((s) => String(s || '').trim()).filter(Boolean) : [];
  if (!ids.length && !names.length) return res.status(400).json({ error: 'أضف دواءين على الأقل / Add at least two drugs' });
  /* Refuse loudly instead of silently truncating: a clinician who entered 26 drugs must never
     believe 26 were checked. */
  if (ids.length > 25 || names.length > 25) {
    return res.status(400).json({ error: 'الحد الأقصى 25 دواءً في الفحص الواحد / At most 25 drugs per check' });
  }

  const picked = [];
  for (const id of ids) {
    const row = db.prepare('SELECT id, generic_name, generic_ar, synonyms, drug_class, interactions FROM drugs WHERE id=?').get(id);
    /* duplicates are kept on purpose: adding the same active ingredient twice is a real
       finding (double dose), not something to silently dedupe away. */
    if (row) picked.push(row);
  }
  for (const name of names) {
    const row = db.prepare(`SELECT id, generic_name, generic_ar, synonyms, drug_class, interactions FROM drugs
      WHERE search_norm LIKE ? OR generic_name LIKE ? OR generic_ar LIKE ? ORDER BY verified DESC, length(generic_name) LIMIT 1`)
      .get(likePattern(name), likePattern(name), likePattern(name));
    if (row) picked.push(row);
  }
  if (picked.length < 2) {
    return res.status(422).json({
      error: 'لم يُعرف دواوان على الأقل من المدخلات / Fewer than two drugs could be resolved',
      resolved: picked.map((d) => ({ id: d.id, generic_name: d.generic_name })),
    });
  }
  const result = checkInteractions(picked);
  res.json({
    ...result,
    drugs: picked.map((d) => ({ id: d.id, generic_name: d.generic_name, generic_ar: d.generic_ar, drug_class: d.drug_class })),
    resolved_from: { ids: ids.length, names: names.length },
  });
});

/* Search used by the picker: generic names only, so the checker cannot be fed a trade name
   that silently resolves to a different active ingredient. */
router.get('/interactions/search', (req, res) => {
  const q = String(req.query.q || '').trim();
  if (q.length < 2) return res.json({ data: [] });
  const rows = db.prepare(`SELECT id, generic_name, generic_ar, drug_class, verified,
      (SELECT COUNT(*) FROM products p WHERE p.drug_id=drugs.id AND p.active=1) AS products_count
    FROM drugs WHERE search_norm LIKE ? OR generic_name LIKE ? OR generic_ar LIKE ?
    ORDER BY verified DESC, length(generic_name), generic_name LIMIT 20`)
    .all(likePattern(q), likePattern(q), likePattern(q));
  res.json({ data: rows });
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
  /* Scanner input can arrive with spaces, dashes, a UPC-A 12-digit form or a trailing newline */
  const raw = String(req.params.code || '').trim();
  const digits = raw.replace(/\D/g, '');
  const variants = new Set([raw, digits]);
  if (digits.length === 12) variants.add('0' + digits);           // UPC-A → EAN-13
  if (digits.length === 13 && digits.startsWith('0')) variants.add(digits.slice(1));
  if (digits.length === 13) variants.add(digits.slice(0, 12));    // missing check digit
  const list = [...variants].filter(Boolean);
  const rows = db.prepare(`SELECT p.*, d.generic_name, d.generic_ar, m.name AS manufacturer_name,
      (SELECT COUNT(*) FROM product_images pi WHERE pi.product_id=p.id AND pi.source<>'generated') AS photo_count
    FROM products p LEFT JOIN drugs d ON d.id=p.drug_id LEFT JOIN manufacturers m ON m.id=p.manufacturer_id
    WHERE p.barcode IN (${list.map(() => '?').join(',')}) AND p.active=1
    ORDER BY CASE WHEN p.barcode=? THEN 0 ELSE 1 END, p.verified DESC`).all(...list, digits || raw);
  res.setHeader('X-Barcode-Query', digits || raw);
  res.json(rows);
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
