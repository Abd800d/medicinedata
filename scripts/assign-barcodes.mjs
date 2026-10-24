/* Give every product a unique, valid EAN-13 barcode (internal / restricted-circulation block).
 *
 *   npm run barcodes              # fill products that have no barcode
 *   npm run barcodes -- --all     # also regenerate internal codes
 *   npm run barcodes -- --dry     # report only
 *   npm run barcodes -- --prefix 20
 *
 * Generated codes use the GS1 200–299 block reserved for internal use, are derived from
 * trade name + strength (stable across re-seeds) and are flagged barcode_source='internal-ean13',
 * barcode_verified=0. Replace them with the printed code once a real pack is scanned.
 */
import 'dotenv/config';
import { assignBarcodes } from '../server/lib/barcodes.js';

const argv = process.argv.slice(2);
const flag = (name, dflt) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 ? argv[i + 1] || dflt : dflt;
};

const out = assignBarcodes({
  prefix: flag('prefix', process.env.BARCODE_PREFIX || '20'),
  all: argv.includes('--all'),
  dryRun: argv.includes('--dry'),
});
console.log(`[barcodes] ${argv.includes('--dry') ? 'DRY RUN — ' : ''}assigned ${out.assigned} codes · products with a barcode: ${out.withBarcode}/${out.total}`);
console.log('[barcodes] all generated codes are prefix 20–29 (GS1 internal range) and marked unverified.');
