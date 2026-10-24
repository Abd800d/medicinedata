import { Router } from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { db, UPLOAD_DIR } from '../db.js';
import { authRequired } from '../auth.js';
import { makeUploader } from '../lib/upload.js';
import { analyzePrescription, matchPrescriptionText, aiEnabled } from '../lib/ai.js';

const router = Router();
const uploader = makeUploader('prescriptions');

/* Build a UI-ready analysis straight from the local matcher (no AI required) */
function analyzeText(text, lang = 'ar') {
  const m = matchPrescriptionText(text);
  const items = (m.items || []).map((i) => {
    const drug = i.drug || (i.matched_as === 'generic'
      ? { id: i.id, generic_name: i.generic_name, generic_ar: i.generic_ar, warnings: i.warnings }
      : null);
    const products = i.products || (drug?.id
      ? db.prepare(`SELECT p.id, p.trade_name, p.trade_name_ar, p.strength, p.dosage_form, p.image_url, p.country, p.price, p.currency,
          m.name AS manufacturer_name FROM products p LEFT JOIN manufacturers m ON m.id=p.manufacturer_id
          WHERE p.drug_id=? AND p.active=1 ORDER BY p.verified DESC, p.trade_name LIMIT 3`).all(drug.id)
      : []);
    return {
      name: i.trade_name || i.generic_name || '',
      name_ar: i.trade_name_ar || i.generic_ar || null,
      strength: i.strength || '',
      matched_as: i.matched_as || null,
      score: Number(Number(i.score || 0).toFixed(3)),
      matched: {
        score: Number(Number(i.score || 0).toFixed(3)),
        drug_id: drug?.id || null,
        generic_name: drug?.generic_name || i.generic_name || null,
        generic_ar: drug?.generic_ar || i.generic_ar || null,
        warnings: drug?.warnings || null,
        products: products || [],
      },
    };
  });
  return {
    language: m.language || lang,
    readable: true,
    tokens: m.tokens || [],
    items,
    not_found: (m.tokens || []).filter((t) => !items.some((i) => (i.name && t.includes(String(i.name).toLowerCase())))).slice(0, 8),
    source: 'local-database',
  };
}

function enrichItems(analysis) {
  if (!analysis?.items?.length) return analysis;
  analysis.items = analysis.items.map((item) => {
    const text = [item.name, item.strength].filter(Boolean).join(' ');
    if (!text) return item;
    const match = matchPrescriptionText(text);
    const best = match.items?.[0];
    if (!best) return { ...item, matched: null };
    const drug = best.drug || (best.matched_as === 'generic' ? { id: best.id, generic_name: best.generic_name, generic_ar: best.generic_ar, warnings: best.warnings } : null);
    const products = best.products
      || (drug?.id ? db.prepare(`SELECT p.id, p.trade_name, p.strength, p.dosage_form, p.image_url, p.country, p.price, p.currency,
        m.name AS manufacturer_name FROM products p LEFT JOIN manufacturers m ON m.id=p.manufacturer_id
        WHERE p.drug_id=? AND p.active=1 ORDER BY p.verified DESC LIMIT 3`).all(drug.id) : []);
    return {
      ...item,
      matched: {
        score: best.score,
        drug_id: drug?.id || null,
        generic_name: drug?.generic_name || null,
        generic_ar: drug?.generic_ar || null,
        warnings: drug?.warnings || null,
        products: products || [],
      },
    };
  });
  return analysis;
}

router.post('/', authRequired, uploader.single('image'), async (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'صورة الوصفة مطلوبة / Prescription image required' });
    const rel = `/uploads/prescriptions/${path.basename(req.file.path)}`;
    let analysis = null;
    let extracted = '';
    let status = 'pending';
    if (aiEnabled()) {
      try {
        const buf = fs.readFileSync(req.file.path);
        const dataUrl = `data:${req.file.mimetype};base64,${buf.toString('base64')}`;
        analysis = await analyzePrescription(dataUrl, req.body.lang || 'ar');
        if (analysis) {
          extracted = analysis.items?.map((i) => [i.name, i.strength, i.dose, i.frequency, i.duration].filter(Boolean).join(' ')).join('\n') || '';
          analysis = enrichItems(analysis);
          status = 'analyzed';
        }
      } catch (e) {
        status = 'pending';
        analysis = { error: e.message, fallback: true };
      }
    }
    if (!analysis && String(req.body?.text || '').trim()) {
      extracted = String(req.body.text);
      analysis = analyzeText(extracted, req.body?.lang === 'en' ? 'en' : 'ar');
      status = 'analyzed';
    }
    const info = db.prepare(`INSERT INTO prescriptions(user_id,image_url,extracted_text,analysis_json,status) VALUES(?,?,?,?,?)`)
      .run(req.user.id, rel, extracted || req.body.text || null, analysis ? JSON.stringify(analysis) : null, status);
    const row = db.prepare('SELECT * FROM prescriptions WHERE id=?').get(info.lastInsertRowid);
    res.status(201).json({ ...row, analysis, ai: aiEnabled(), mode: aiEnabled() ? 'ai' : 'manual' });
  } catch (e) { next(e); }
});

router.get('/', authRequired, (req, res) => {
  const rows = req.user.role === 'admin'
    ? db.prepare(`SELECT p.*, u.name AS author_name, u.email AS author_email FROM prescriptions p
        LEFT JOIN users u ON u.id=p.user_id ORDER BY p.id DESC LIMIT 300`).all()
    : db.prepare('SELECT * FROM prescriptions WHERE user_id=? ORDER BY id DESC LIMIT 200').all(req.user.id);
  res.json(rows.map((r) => ({ ...r, analysis: r.analysis_json ? JSON.parse(r.analysis_json) : null })));
});

router.get('/:id', authRequired, (req, res) => {
  const row = db.prepare('SELECT * FROM prescriptions WHERE id=?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Not found' });
  if (row.user_id !== req.user.id && req.user.role !== 'admin') return res.status(403).json({ error: 'Forbidden' });
  res.json({ ...row, analysis: row.analysis_json ? JSON.parse(row.analysis_json) : null });
});

/* Manual text analysis (also used when AI is not configured) */
router.post('/:id/analyze', authRequired, (req, res) => {
  const row = db.prepare('SELECT * FROM prescriptions WHERE id=?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Not found' });
  if (row.user_id !== req.user.id && req.user.role !== 'admin') return res.status(403).json({ error: 'Forbidden' });
  const text = String(req.body?.text || '').trim();
  if (!text) return res.status(400).json({ error: 'النص مطلوب / Text required' });
  const analysis = analyzeText(text, req.body?.lang === 'en' ? 'en' : 'ar');
  db.prepare('UPDATE prescriptions SET extracted_text=?, analysis_json=?, status=? WHERE id=?')
    .run(text, JSON.stringify(analysis), 'analyzed', row.id);
  res.json({ ...row, analysis, mode: 'manual' });
});

router.delete('/:id', authRequired, (req, res) => {
  const row = db.prepare('SELECT * FROM prescriptions WHERE id=?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Not found' });
  if (row.user_id !== req.user.id && req.user.role !== 'admin') return res.status(403).json({ error: 'Forbidden' });
  if (row.image_url) {
    const f = path.join(UPLOAD_DIR, 'prescriptions', path.basename(row.image_url));
    if (fs.existsSync(f)) fs.unlinkSync(f);
  }
  db.prepare('DELETE FROM prescriptions WHERE id=?').run(row.id);
  res.json({ ok: true });
});

export default router;
