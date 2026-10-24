/* Fetch real product photographs from Google Custom Search and attach them to products.
 *
 * Requires GOOGLE_CSE_KEY + GOOGLE_CSE_CX on the machine running this code
 * (a Google Programmable Search engine with "Image search" enabled).
 * With no keys the helpers return { configured: false } — nothing is invented.
 *
 * Used by:
 *   POST /api/admin/images/auto-fill   (admin dashboard → الصور)
 *   npm run images:fetch               (CLI, same logic)
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { db, UPLOAD_DIR } from '../db.js';

const TIMEOUT_MS = 9000;
const MAX_BYTES = 6 * 1024 * 1024;

export const cseConfigured = () => Boolean(process.env.GOOGLE_CSE_KEY && process.env.GOOGLE_CSE_CX);

const BAD_HOSTS = /(facebook|fbsbx|pinterest|instagram|tiktok|lookaside|ytimg|gstatic|googleusercontent)/i;
const BAD_WORDS = /(logo|icon|clipart|vector|stock|sprite)/i;

export function scoreCandidate(item, query) {
  const link = String(item.link || '');
  let score = 0;
  if (!/^https?:/i.test(link)) return -1;
  if (BAD_HOSTS.test(link)) return -1;
  if (BAD_WORDS.test(link)) return -1;
  if (/\.(jpe?g|png|webp)(\?|$)/i.test(link)) score += 3;
  const hay = `${link} ${item.title || ''} ${item.snippet || ''}`.toLowerCase();
  for (const token of query.toLowerCase().split(/[\s/]+/).filter((t) => t.length >= 3)) if (hay.includes(token)) score += 1;
  const w = item.image?.width ? Number(item.image.width) : 0;
  const h = item.image?.height ? Number(item.image.height) : 0;
  if (w >= 300 && h >= 300) score += 2;
  if (w && h && (w / h > 2.2 || h / w > 2.2)) score -= 1;
  return score;
}

export async function searchImages(query, num = 8) {
  if (!cseConfigured()) return { configured: false, items: [] };
  const url = `https://www.googleapis.com/customsearch/v1?key=${process.env.GOOGLE_CSE_KEY}&cx=${process.env.GOOGLE_CSE_CX}`
    + `&searchType=image&num=${Math.min(10, Math.max(1, num))}&safe=active&imgSize=medium&q=${encodeURIComponent(query)}`;
  const r = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS) });
  const data = await r.json();
  if (!r.ok) throw new Error(data?.error?.message || `Google CSE ${r.status}`);
  const items = (data.items || [])
    .map((i) => ({ ...i, score: scoreCandidate(i, query) }))
    .filter((i) => i.score >= 0)
    .sort((a, b) => b.score - a.score);
  return { configured: true, items };
}

export async function downloadImage(url) {
  const r = await fetch(url, {
    signal: AbortSignal.timeout(TIMEOUT_MS),
    redirect: 'follow',
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; MDA/1.0; +https://github.com/Abd800d/medicinedata)' },
  });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  const type = (r.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
  if (!type.startsWith('image/') || /svg/.test(type)) throw new Error(`not a bitmap image (${type || 'unknown'})`);
  const buf = Buffer.from(await r.arrayBuffer());
  if (!buf.length) throw new Error('empty body');
  if (buf.length > MAX_BYTES) throw new Error(`too large (${Math.round(buf.length / 1024)} KB)`);
  const ext = type.includes('png') ? '.png' : type.includes('webp') ? '.webp' : type.includes('gif') ? '.gif' : '.jpg';
  const dir = path.join(UPLOAD_DIR, 'products');
  fs.mkdirSync(dir, { recursive: true });
  const name = `${Date.now()}-${crypto.randomBytes(4).toString('hex')}${ext}`;
  fs.writeFileSync(path.join(dir, name), buf);
  return { url: `/uploads/products/${name}`, bytes: buf.length, type };
}

export function attachImage(productId, url, source = 'web') {
  const p = db.prepare('SELECT * FROM products WHERE id=?').get(productId);
  if (!p) throw new Error('product not found');
  const sort = db.prepare('SELECT COALESCE(MAX(sort_order),0)+1 n FROM product_images WHERE product_id=?').get(productId).n;
  db.prepare('INSERT INTO product_images(product_id,url,source,sort_order) VALUES(?,?,?,?)').run(productId, url, source, sort);
  if (!p.image_url || p.image_source === 'generated' || p.image_source === 'seed') {
    db.prepare('UPDATE products SET image_url=?, image_source=?, updated_at=datetime(\'now\') WHERE id=?').run(url, source, productId);
  }
  db.prepare("DELETE FROM product_images WHERE product_id=? AND source='generated'").run(productId);
  return db.prepare('SELECT * FROM product_images WHERE product_id=? ORDER BY sort_order').all(productId);
}

export function productsWithoutPhoto(limit = 20) {
  return db.prepare(`SELECT p.id, p.trade_name, p.strength, p.dosage_form, m.name AS manufacturer
    FROM products p LEFT JOIN manufacturers m ON m.id=p.manufacturer_id
    WHERE p.active=1 AND (p.image_url IS NULL OR p.image_url='' OR p.image_source IN ('generated','seed'))
      AND NOT EXISTS (SELECT 1 FROM product_images pi WHERE pi.product_id=p.id AND pi.source NOT IN ('generated'))
    ORDER BY p.verified DESC, p.trade_name LIMIT ?`).all(Math.min(100, Math.max(1, limit)));
}

const queryFor = (p) => [p.trade_name, p.strength, p.manufacturer, 'box'].filter(Boolean).join(' ');

/** Try to fetch + attach one photo per product. Never throws for a single product. */
export async function autoFillImages({ limit = 10, dryRun = false } = {}) {
  if (!cseConfigured()) {
    return { configured: false, hint: 'أضف GOOGLE_CSE_KEY و GOOGLE_CSE_CX إلى ملف .env ثم أعد تشغيل الخادم.', applied: 0, results: [] };
  }
  const targets = productsWithoutPhoto(limit);
  const results = [];
  for (const p of targets) {
    const q = queryFor(p);
    try {
      const { items } = await searchImages(q, 6);
      const candidates = items.slice(0, 3);
      let attached = null;
      for (const c of candidates) {
        try {
          const file = await downloadImage(c.link);
          if (dryRun) { attached = { url: c.link, dryRun: true }; break; }
          attachImage(p.id, file.url, 'web-cse');
          attached = { url: file.url, bytes: file.bytes, from: c.link, title: c.title };
          break;
        } catch (e) { /* try the next candidate */ }
      }
      results.push({ id: p.id, name: `${p.trade_name} ${p.strength || ''}`.trim(), query: q, ok: Boolean(attached), ...(attached || {}), candidates: items.length });
    } catch (e) {
      results.push({ id: p.id, name: `${p.trade_name} ${p.strength || ''}`.trim(), query: q, ok: false, error: e.message });
    }
  }
  return { configured: true, applied: results.filter((r) => r.ok).length, tried: targets.length, results };
}
