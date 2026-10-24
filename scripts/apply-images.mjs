/* Attach the bundled real pack photographs to their products.
 *
 *   node scripts/apply-images.mjs           # apply (idempotent)
 *   node scripts/apply-images.mjs --check   # only verify referenced files exist
 *   node scripts/apply-images.mjs --clean   # drop pack-shot rows for products that no longer exist
 *
 * Source of truth: server/data/product-images.js
 * Matching: trade_name (case-insensitive) + strength, so it survives a reseed.
 */
import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { db } from '../server/db.js';
import { PRODUCT_IMAGES, SEED_IMAGE_DIR, SEED_IMAGE_URL } from '../server/data/product-images.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIR = path.join(ROOT, SEED_IMAGE_DIR);

export function applyProductImages({ log = true } = {}) {
  const find = db.prepare(`SELECT id, trade_name, strength, image_url, image_source FROM products
    WHERE lower(trade_name)=lower(?) AND COALESCE(strength,'')=COALESCE(?,'') AND active=1
    ORDER BY (image_source='pack-shot') DESC, id LIMIT 1`);
  const byId = db.prepare('SELECT id FROM products WHERE id=? AND active=1');
  const delGenerated = db.prepare("DELETE FROM product_images WHERE product_id=? AND source='generated'");
  const delByUrl = db.prepare('DELETE FROM product_images WHERE product_id=? AND url=?');
  const insert = db.prepare('INSERT INTO product_images(product_id,url,source,sort_order) VALUES(?,?,?,?)');
  const setMain = db.prepare("UPDATE products SET image_url=?, image_source='pack-shot', updated_at=datetime('now') WHERE id=?");

  const stats = { matched: 0, photos: 0, missingFiles: [], missingProducts: [] };

  db.transaction(() => {
    for (const entry of PRODUCT_IMAGES) {
      const product = entry.id ? byId.get(entry.id) : find.get(entry.trade, entry.strength ?? null);
      if (!product) {
        stats.missingProducts.push(`${entry.trade} ${entry.strength ?? ''}`.trim());
        continue;
      }
      stats.matched++;
      const urls = [];
      for (const file of entry.files) {
        if (!fs.existsSync(path.join(DIR, file))) { stats.missingFiles.push(file); continue; }
        urls.push(`${SEED_IMAGE_URL}/${file}`);
      }
      if (!urls.length) continue;
      delGenerated.run(product.id);
      urls.forEach((url, i) => {
        delByUrl.run(product.id, url);
        insert.run(product.id, url, 'pack-shot', i);
      });
      setMain.run(urls[0], product.id);
      stats.photos += urls.length;
    }
  })();

  if (log) {
    console.log(`[images] ${stats.matched}/${PRODUCT_IMAGES.length} products matched, ${stats.photos} photos attached`);
    if (stats.missingProducts.length) console.warn('[images] no matching product:', stats.missingProducts.join(' · '));
    if (stats.missingFiles.length) console.warn('[images] missing files:', stats.missingFiles.join(' · '));
  }
  return stats;
}

export function checkProductImages() {
  const missing = [];
  for (const e of PRODUCT_IMAGES) for (const f of e.files) if (!fs.existsSync(path.join(DIR, f))) missing.push(f);
  const extra = fs.existsSync(DIR) ? fs.readdirSync(DIR).filter((f) => /\.(jpe?g|png|webp)$/i.test(f) && !PRODUCT_IMAGES.some((e) => e.files.includes(f))) : [];
  return { missing, unused: extra };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  if (process.argv.includes('--check')) {
    const { missing, unused } = checkProductImages();
    console.log('[images] referenced:', PRODUCT_IMAGES.reduce((n, e) => n + e.files.length, 0));
    console.log('[images] missing:', missing.length ? missing.join(' · ') : 'none');
    console.log('[images] unused files:', unused.length ? unused.join(' · ') : 'none');
    process.exitCode = missing.length ? 1 : 0;
  } else {
    if (process.argv.includes('--clean')) {
      const n = db.prepare("DELETE FROM product_images WHERE source='pack-shot' AND product_id NOT IN (SELECT id FROM products)").run().changes;
      console.log('[images] removed orphan rows:', n);
    }
    applyProductImages();
    const n = db.prepare("SELECT COUNT(*) n FROM products WHERE image_source='pack-shot'").get().n;
    console.log('[images] products with a real photo:', n);
  }
}
