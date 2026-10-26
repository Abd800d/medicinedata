#!/usr/bin/env node
/*
 * Builds the catalogue that ships INSIDE the app (public/data/catalog.json).
 * The APK must work with zero backend: browse systems → classes → drugs → products,
 * search, barcode lookup, generated pack art — all from this file.
 *
 *   node scripts/build-offline-bundle.mjs [--db data/mda.db] [--out public/data/catalog.json]
 *
 * Re-run it after changing seed data or importing real records, then rebuild the APK.
 */
import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';

const args = process.argv.slice(2);
const argOf = (flag, fallback) => {
  const i = args.indexOf(flag);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
};
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const DB_PATH = path.resolve(ROOT, argOf('--db', 'data/mda.db'));
const OUT = path.resolve(ROOT, argOf('--out', 'public/data/catalog.json'));

if (!fs.existsSync(DB_PATH)) {
  console.error(`✗ database not found: ${DB_PATH}\n  run "npm run seed" first.`);
  process.exit(1);
}

const db = new Database(DB_PATH, { readonly: true });

const pick = (rows, cols) => rows.map((r) => { const o = {}; for (const c of cols) o[c] = r[c] ?? null; return o; });

const systems = db.prepare('SELECT * FROM systems ORDER BY sort_order, id').all();
const categories = db.prepare('SELECT * FROM categories ORDER BY sort_order, name_en').all();
const drugs = pick(db.prepare('SELECT * FROM drugs ORDER BY generic_name').all(), [
  'id', 'system_id', 'category_id', 'generic_name', 'generic_ar', 'synonyms', 'drug_class', 'atc_code',
  'prescription_required', 'pregnancy', 'indications_en', 'indications_ar', 'dosage_adult', 'dosage_child',
  'contraindications', 'side_effects', 'warnings', 'interactions', 'mechanism_en', 'mechanism_ar',
  'half_life', 'storage', 'notes', 'source', 'verified',
]);
const products = pick(db.prepare('SELECT * FROM products WHERE active=1 ORDER BY trade_name').all(), [
  'id', 'drug_id', 'trade_name', 'trade_name_ar', 'strength', 'dosage_form', 'pack_size', 'manufacturer_id',
  'agent_id', 'country', 'barcode', 'price', 'currency', 'image_url', 'image_source', 'description_en',
  'description_ar', 'verified', 'barcode_verified',
]);
const manufacturers = pick(db.prepare('SELECT * FROM manufacturers ORDER BY name').all(), ['id', 'name', 'country', 'website']);
const agents = pick(db.prepare('SELECT * FROM agents ORDER BY name').all(), ['id', 'name', 'name_ar', 'country', 'city', 'phone', 'email', 'website']);
const productImages = pick(db.prepare('SELECT * FROM product_images ORDER BY product_id, sort_order').all(), ['id', 'product_id', 'url', 'source', 'sort_order']);

/* PUBLIC settings only. This bundle is shipped inside the APK and served to anyone,
   so a secret here is a leaked secret — the guard below fails the build instead. */
const PUBLIC_SETTINGS = new Set([
  'site_name_ar', 'site_name_en', 'owner_name', 'owner_title', 'support_email', 'whatsapp',
  'about_ar', 'about_en', 'disclaimer_ar', 'disclaimer_en', 'default_lang',
  'google_client_id', 'primary_color', 'brand_color', 'currency', 'country',
]);
const SECRET_KEY = /(secret|password|passwd|token|api[_-]?key|private|credential|salt)/i;
const settings = {};
for (const row of db.prepare('SELECT key, value FROM settings').all()) {
  if (SECRET_KEY.test(row.key)) continue;
  if (!PUBLIC_SETTINGS.has(row.key)) continue;
  settings[row.key] = row.value;
}
const leaked = Object.keys(settings).filter((k) => SECRET_KEY.test(k));
if (leaked.length) throw new Error(`refusing to ship secrets in the offline bundle: ${leaked.join(', ')}`);

const counts = {
  systems: systems.length,
  categories: categories.length,
  drugs: drugs.length,
  products: products.length,
  manufacturers: manufacturers.length,
  agents: agents.length,
};

const bundle = {
  version: 1,
  generated_at: new Date().toISOString(),
  counts,
  settings,
  systems,
  categories,
  drugs,
  products,
  manufacturers,
  agents,
  product_images: productImages,
};

fs.mkdirSync(path.dirname(OUT), { recursive: true });
const json = JSON.stringify(bundle);
fs.writeFileSync(OUT, json);

const kb = (json.length / 1024).toFixed(0);
console.log(`✓ ${path.relative(ROOT, OUT)}  ${kb} KB  (${counts.drugs} drugs · ${counts.products} products · ${counts.systems} systems · ${counts.categories} classes)`);
console.log(`  photos bundled: ${productImages.length}`);
