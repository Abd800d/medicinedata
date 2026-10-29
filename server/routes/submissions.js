/* Manual add-drug section: users submit missing medicines, admins review & publish */
import { Router } from 'express';
import { db } from '../db.js';
import { authRequired, adminRequired } from '../auth.js';
import { searchNorm } from '../lib/search.js';

const router = Router();
const text = (v) => (v === undefined || v === null ? null : String(v).trim() || null);

/* Create a submission (signed-in users) */
router.post('/', authRequired, (req, res) => {
  const b = req.body || {};
  const name = text(b.name_en);
  if (!name || name.length < 2) return res.status(400).json({ error: 'الاسم العلمي مطلوب / Scientific name required' });
  const recent = db.prepare(`SELECT COUNT(*) n FROM drug_submissions WHERE user_id=? AND created_at >= datetime('now','-1 day')`).get(req.user.id).n;
  if (recent >= 10) return res.status(429).json({ error: 'بلغت الحد اليومي للإضافة (10) / Daily limit reached' });
  const info = db.prepare(`INSERT INTO drug_submissions(user_id,name_en,name_ar,system_id,company,strength,form,country,notes)
    VALUES(?,?,?,?,?,?,?,?,?)`).run(
    req.user.id, name, text(b.name_ar), b.system_id ? Number(b.system_id) : null,
    text(b.company), text(b.strength), text(b.form), text(b.country), text(b.notes),
  );
  res.status(201).json({ id: info.lastInsertRowid, status: 'pending' });
});

/* My submissions */
router.get('/mine', authRequired, (req, res) => {
  res.json(db.prepare(`SELECT s.*, y.name_ar AS system_ar, y.name_en AS system_en FROM drug_submissions s
    LEFT JOIN systems y ON y.id=s.system_id WHERE s.user_id=? ORDER BY s.id DESC LIMIT 100`).all(req.user.id));
});

/* Admin review list */
router.get('/', adminRequired, (req, res) => {
  const where = req.query.status ? 'WHERE s.status=?' : '';
  res.json(db.prepare(`SELECT s.*, u.name AS author_name, u.email AS author_email, y.name_ar AS system_ar, y.name_en AS system_en
    FROM drug_submissions s LEFT JOIN users u ON u.id=s.user_id LEFT JOIN systems y ON y.id=s.system_id
    ${where} ORDER BY s.id DESC LIMIT 300`).all(...(req.query.status ? [req.query.status] : [])));
});

/* Approve → create drug (+ optional product) in the real catalogue, or reject */
router.patch('/:id', adminRequired, (req, res) => {
  const s = db.prepare('SELECT * FROM drug_submissions WHERE id=?').get(req.params.id);
  if (!s) return res.status(404).json({ error: 'Not found' });
  const status = String(req.body?.status || '');
  if (!['approved', 'rejected', 'pending'].includes(status)) return res.status(400).json({ error: 'Invalid status' });
  if (status !== 'approved') {
    db.prepare("UPDATE drug_submissions SET status=?, reviewed_by=?, reviewed_at=datetime('now') WHERE id=?").run(status, req.user.id, s.id);
    return res.json({ ok: true, status });
  }
  if (s.created_drug_id) {
    db.prepare("UPDATE drug_submissions SET status='approved', reviewed_by=?, reviewed_at=datetime('now') WHERE id=?").run(req.user.id, s.id);
    return res.json({ ok: true, status: 'approved', drug_id: s.created_drug_id, already: true });
  }

  const systemId = s.system_id || (req.body?.system_id ? Number(req.body.system_id) : null);
  const categoryId = req.body?.category_id ? Number(req.body.category_id) : null;
  let drug = db.prepare('SELECT * FROM drugs WHERE lower(generic_name)=lower(?)').get(s.name_en);
  let created = false;
  if (!drug) {
    /* Provenance is not a quality claim: a record born from a community submission is stored as
       `user_submitted` and enters the review queue — it must never look pharmacist-reviewed. */
    const info = db.prepare(`INSERT INTO drugs(system_id,category_id,generic_name,generic_ar,indications_ar,indications_en,verified,source,search_norm,verification_state,review_status)
      VALUES(?,?,?,?,?,?,0,'community-submission',?,'user_submitted','pending')`).run(
      systemId, categoryId, s.name_en, s.name_ar, s.notes, s.notes,
      searchNorm(s.name_en, s.name_ar, s.notes),
    );
    drug = db.prepare('SELECT * FROM drugs WHERE id=?').get(info.lastInsertRowid);
    created = true;
  }

  let productId = null;
  if (s.company) {
    let manufacturer = db.prepare('SELECT id FROM manufacturers WHERE lower(name)=lower(?)').get(s.company);
    if (!manufacturer) {
      const mid = db.prepare('INSERT INTO manufacturers(name,country) VALUES(?,?)').run(s.company, s.country || null).lastInsertRowid;
      manufacturer = { id: mid };
    }
    const existing = db.prepare(`SELECT id FROM products WHERE drug_id=? AND lower(trade_name)=lower(?) AND COALESCE(strength,'')=COALESCE(?,'')`)
      .get(drug.id, s.name_en, s.strength || '');
    if (existing) productId = existing.id;
    else {
      productId = db.prepare(`INSERT INTO products(drug_id,trade_name,trade_name_ar,strength,dosage_form,manufacturer_id,country,verified,active,search_norm,verification_state,review_status)
        VALUES(?,?,?,?,?,?,?,0,1,?,'user_submitted','pending')`).run(
        drug.id, s.name_en, s.name_ar, s.strength, s.form, manufacturer.id, s.country,
        searchNorm(s.name_en, s.name_ar, s.strength),
      ).lastInsertRowid;
    }
  }

  db.prepare(`UPDATE drug_submissions SET status='approved', reviewed_by=?, reviewed_at=datetime('now'), created_drug_id=?, created_product_id=? WHERE id=?`)
    .run(req.user.id, drug.id, productId, s.id);
  res.json({ ok: true, status: 'approved', drug_id: drug.id, product_id: productId, created });
});

router.delete('/:id', adminRequired, (req, res) => {
  db.prepare('DELETE FROM drug_submissions WHERE id=?').run(req.params.id);
  res.json({ ok: true });
});

export default router;
