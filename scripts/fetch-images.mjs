/* Pull product photos from Google Custom Search and attach them.
 *
 *   npm run images:fetch -- --limit 25        # try 25 products that have no photo
 *   npm run images:fetch -- --limit 5 --dry   # show what would be downloaded
 *
 * Needs GOOGLE_CSE_KEY + GOOGLE_CSE_CX in .env (see docs/ENV.md).
 * Run this on a machine/server with outbound internet access — not inside a sandbox.
 */
import 'dotenv/config';
import { autoFillImages, cseConfigured, productsWithoutPhoto } from '../server/lib/product-images.js';

const argv = process.argv.slice(2);
const num = (flag, dflt) => {
  const i = argv.indexOf(flag);
  return i >= 0 ? Number(argv[i + 1]) || dflt : dflt;
};
const limit = Math.min(100, Math.max(1, num('--limit', 20)));
const dryRun = argv.includes('--dry') || argv.includes('--dry-run');

if (!cseConfigured()) {
  console.error('[images:fetch] GOOGLE_CSE_KEY / GOOGLE_CSE_CX are not set.');
  console.error('  1) https://programmablesearchengine.google.com → add a search engine, enable "Image search"');
  console.error('  2) https://console.cloud.google.com/apis/credentials → API key (Custom Search API enabled)');
  console.error('  3) put both values in .env, restart, then rerun:  npm run images:fetch -- --limit 25');
  console.error(`\n[images:fetch] ${productsWithoutPhoto(limit).length} products currently have no real photo (first ${limit} shown on run).`);
  process.exit(2);
}

console.log(`[images:fetch] ${dryRun ? 'DRY RUN — ' : ''}targeting ${limit} products without a photo`);
const out = await autoFillImages({ limit, dryRun });
for (const r of out.results) {
  console.log(r.ok ? `  ✓ ${r.name}  ←  ${r.from || r.url}` : `  ✗ ${r.name}  (${r.error || 'no usable candidate'})`);
}
console.log(`[images:fetch] attached ${out.applied}/${out.tried}`);
console.log('[images:fetch] review each photo in /admin/images before publishing — automated matches can be another pack size.');
