/* EAN-13 helpers + assignment of internal (restricted-circulation) barcodes.
 *
 * GS1 keeps 200–299 for internal / restricted use, so every code we invent stays
 * inside that block and is flagged barcode_source='internal-ean13', barcode_verified=0.
 * Codes are derived from trade name + strength → stable across re-seeds, so printed
 * shelf labels keep working. A real printed code always wins: anything already set
 * with another source is left untouched.
 */
import crypto from 'node:crypto';
import { db } from '../db.js';

export function ean13CheckDigit(digits12) {
  let sum = 0;
  for (let i = 0; i < 12; i++) sum += Number(digits12[i]) * (i % 2 === 0 ? 1 : 3);
  return String((10 - (sum % 10)) % 10);
}

export function ean13(body12) {
  const b = String(body12).replace(/\D/g, '').padStart(12, '0').slice(0, 12);
  return b + ean13CheckDigit(b);
}

export const isValidEan13 = (code) => /^\d{13}$/.test(String(code || '')) && ean13CheckDigit(String(code).slice(0, 12)) === String(code)[12];

function bodyFor(product, prefix, salt = 0) {
  const key = `${product.trade_name}|${product.strength || ''}|${product.dosage_form || ''}|${salt}`;
  const n = crypto.createHash('sha1').update(key).digest().readUIntBE(0, 6) % 1_000_000_000;
  return `${prefix}${String(n).padStart(9, '0')}`.slice(0, 12);
}

export function assignBarcodes({ prefix = process.env.BARCODE_PREFIX || '20', all = false, dryRun = false } = {}) {
  const pfx = String(prefix).replace(/\D/g, '').padEnd(2, '0').slice(0, 2);
  const products = db.prepare('SELECT id, trade_name, strength, dosage_form, barcode, barcode_source FROM products ORDER BY id').all();
  const taken = new Set(products.filter((p) => p.barcode).map((p) => p.barcode));
  const update = db.prepare("UPDATE products SET barcode=?, barcode_source='internal-ean13', barcode_verified=0, updated_at=datetime('now') WHERE id=?");
  const todo = products.filter((p) => !p.barcode || (all && p.barcode_source === 'internal-ean13'));
  let assigned = 0;
  db.transaction(() => {
    for (const p of todo) {
      if (p.barcode) taken.delete(p.barcode);
      let code = null;
      for (let salt = 0; salt < 50 && !code; salt++) {
        const candidate = ean13(bodyFor(p, pfx, salt));
        if (!taken.has(candidate)) code = candidate;
      }
      if (!code) continue;
      taken.add(code);
      if (!dryRun) update.run(code, p.id);
      assigned++;
    }
  })();
  return { assigned, total: products.length, withBarcode: db.prepare('SELECT COUNT(*) n FROM products WHERE barcode IS NOT NULL AND barcode<>\'\'').get().n };
}
