/* Personal pharmacy / purchases management: stock, prices, expiry alerts */
import { Router } from 'express';
import { db } from '../db.js';
import { authRequired } from '../auth.js';

const router = Router();
router.use(authRequired);

const num = (v) => (v === undefined || v === null || v === '' ? null : Number(String(v).replace(/[^\d.-]/g, '')) || null);
const text = (v) => (v === undefined || v === null ? null : String(v).trim() || null);

/* Optimistic concurrency for offline edits.
   The client sends the updated_at it last saw; if the server row moved on, the
   write is refused with 409 + the current row so the app can ask the user.
   ?force=1 (explicit user choice) skips the check. */
function conflictCheck(req, res, row) {
  if (String(req.query.force || '') === '1') return false;
  const expected = text(req.body?.expected_updated_at) || text(req.query?.expected_updated_at) || text(req.get('X-Expected-Updated-At'));
  if (!expected || !row.updated_at) return false;
  if (String(expected) === String(row.updated_at)) return false;
  res.status(409).json({
    error: 'تغيّر هذا الصنف على الخادم بعد آخر تحميل — اختر نسختك أو نسخة الخادم',
    code: 'CONFLICT',
    server: row,
  });
  return true;
}

function listItems(userId) {
  return db.prepare(`SELECT pi.*, p.trade_name, p.trade_name_ar, p.image_url, d.generic_name, d.generic_ar, m.name AS manufacturer_name
    FROM pharmacy_items pi
    LEFT JOIN products p ON p.id = pi.product_id
    LEFT JOIN drugs d ON d.id = p.drug_id
    LEFT JOIN manufacturers m ON m.id = p.manufacturer_id
    WHERE pi.user_id=? ORDER BY (pi.expiry_date IS NULL), pi.expiry_date, pi.name COLLATE NOCASE LIMIT 1000`).all(userId);
}

function summaryFor(userId) {
  const rows = listItems(userId);
  const today = new Date().toISOString().slice(0, 10);
  const in90 = new Date(Date.now() + 90 * 864e5).toISOString().slice(0, 10);
  let stockValue = 0; let potential = 0; let low = 0; let expiring = 0; let expired = 0; let units = 0;
  for (const r of rows) {
    const qty = Number(r.quantity) || 0;
    stockValue += qty * (Number(r.buy_price) || 0);
    potential += qty * (Number(r.sell_price) || 0);
    units += qty;
    if (qty <= 5) low++;
    if (r.expiry_date) {
      if (r.expiry_date < today) expired++;
      else if (r.expiry_date <= in90) expiring++;
    }
  }
  return {
    items: rows.length, units, stock_value: Math.round(stockValue), potential_value: Math.round(potential),
    low_stock: low, expiring_soon: expiring, expired,
  };
}

router.get('/', (req, res) => res.json({ items: listItems(req.user.id), summary: summaryFor(req.user.id) }));

router.get('/summary', (req, res) => res.json(summaryFor(req.user.id)));

router.post('/', (req, res) => {
  const b = req.body || {};
  if (!text(b.name)) return res.status(400).json({ error: 'اسم المنتج مطلوب / Product name required' });
  /* An offline-created item carries its own uuid; retrying must not create a twin. */
  const uuid = text(b.client_uuid);
  if (uuid) {
    const seen = db.prepare('SELECT * FROM pharmacy_items WHERE user_id=? AND client_uuid=?').get(req.user.id, uuid);
    if (seen) return res.json({ ...seen, deduplicated: true });
  }
  const info = db.prepare(`INSERT INTO pharmacy_items(user_id,product_id,name,strength,form,quantity,unit,buy_price,sell_price,expiry_date,batch,supplier,notes,client_uuid)
    VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
    req.user.id, num(b.product_id), text(b.name), text(b.strength), text(b.form), num(b.quantity) || 0, text(b.unit) || 'box',
    num(b.buy_price), num(b.sell_price), text(b.expiry_date), text(b.batch), text(b.supplier), text(b.notes),
    text(b.client_uuid),
  );
  res.status(201).json(db.prepare('SELECT * FROM pharmacy_items WHERE id=?').get(info.lastInsertRowid));
});

router.put('/:id', (req, res) => {
  const row = db.prepare('SELECT * FROM pharmacy_items WHERE id=? AND user_id=?').get(req.params.id, req.user.id);
  if (!row) return res.status(404).json({ error: 'Not found' });
  if (conflictCheck(req, res, row)) return;
  const b = { ...row, ...(req.body || {}) };
  db.prepare(`UPDATE pharmacy_items SET product_id=?, name=?, strength=?, form=?, quantity=?, unit=?, buy_price=?, sell_price=?,
      expiry_date=?, batch=?, supplier=?, notes=?, version=COALESCE(version,1)+1, updated_at=datetime('now') WHERE id=?`).run(
    num(b.product_id), text(b.name) || row.name, text(b.strength), text(b.form), num(b.quantity) || 0, text(b.unit) || 'box',
    num(b.buy_price), num(b.sell_price), text(b.expiry_date), text(b.batch), text(b.supplier), text(b.notes), row.id,
  );
  res.json(db.prepare('SELECT * FROM pharmacy_items WHERE id=?').get(row.id));
});

/* Quick +/- stock adjustment */
router.patch('/:id/adjust', (req, res) => {
  const row = db.prepare('SELECT * FROM pharmacy_items WHERE id=? AND user_id=?').get(req.params.id, req.user.id);
  if (!row) return res.status(404).json({ error: 'Not found' });
  const delta = Number(req.body?.delta);
  if (!Number.isFinite(delta)) return res.status(400).json({ error: 'delta is required' });
  /* Adjustments are relative, so they never conflict — two devices both -1 = -2, which is intended. */
  const next = Math.max(0, (Number(row.quantity) || 0) + delta);
  db.prepare("UPDATE pharmacy_items SET quantity=?, version=COALESCE(version,1)+1, updated_at=datetime('now') WHERE id=?").run(next, row.id);
  res.json({ ok: true, quantity: next });
});

router.delete('/:id', (req, res) => {
  const row = db.prepare('SELECT * FROM pharmacy_items WHERE id=? AND user_id=?').get(req.params.id, req.user.id);
  if (!row) return res.status(404).json({ error: 'Not found' });
  if (conflictCheck(req, res, row)) return;
  db.prepare('DELETE FROM pharmacy_items WHERE id=?').run(row.id);
  res.json({ ok: true });
});

export default router;
