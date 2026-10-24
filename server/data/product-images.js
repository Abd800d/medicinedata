/* Real pack photographs bundled with the app (public/seed-images/products).
 *
 * Every entry was checked by eye against the printed box: trade name + strength must match.
 * `files` order = gallery order; the first file becomes products.image_url.
 * `credit` documents where the photo came from so the source stays auditable.
 *
 * Adding more photos:
 *   1) drop the JPEG in public/seed-images/products/  (≤ 600×600, ≤ 120 KB)
 *   2) add an entry here, then run `npm run images:apply`
 * Images for the remaining products can also be pulled from Google Custom Search
 * (`npm run images:fetch`) or uploaded from /admin/media once deployed.
 */
export const PRODUCT_IMAGES = [
  { trade: 'Panadol', strength: '500 mg', files: ['panadol-500.jpg', 'panadol-500-alt.jpg'], credit: 'GSK Gulf pack (144 tablets)' },
  { trade: 'Concor', strength: '5 mg', files: ['concor-5.jpg', 'concor-5-blister.jpg'], credit: 'Merck 30 tablets' },
  { trade: 'Lipitor', strength: '20 mg', files: ['lipitor-20.jpg'], credit: 'Pfizer 30 tablets' },
  { trade: 'Norvasc', strength: '5 mg', files: ['norvasc-5.jpg'], credit: 'Pfizer 30 tablets' },
  { trade: 'Ventolin', strength: '100 mcg/dose', files: ['ventolin-100.jpg'], credit: 'GSK Evohaler 200 doses' },
  { trade: 'Symbicort', strength: '160/4.5 mcg', files: ['symbicort-160-4-5.jpg', 'symbicort-160-4-5-box.jpg'], credit: 'AstraZeneca Turbuhaler 120 doses' },
  { trade: 'Seretide', strength: '250/50 mcg', files: ['seretide-250-50.jpg'], credit: 'GSK Accuhaler 60 doses' },
  { trade: 'Zyrtec', strength: '10 mg', files: ['zyrtec-10.jpg', 'zyrtec-10-alt.jpg'], credit: 'UCB 20 tablets' },
  { trade: 'Claritin', strength: '10 mg', files: ['claritin-10.jpg'], credit: 'Bayer 30 tablets' },
  { trade: 'Losec', strength: '20 mg', files: ['losec-20.jpg'], credit: 'AstraZeneca 28 capsules' },
  { trade: 'Buscopan', strength: '10 mg', files: ['buscopan-10.jpg'], credit: 'Boehringer 100 tablets' },
  { trade: 'Glucophage', strength: '500 mg', files: ['glucophage-500.jpg', 'glucophage-500-blister.jpg'], credit: 'Merck 30 tablets' },
  { trade: 'Brufen', strength: '400 mg', files: ['brufen-400.jpg'], credit: 'Abbott 30 tablets' },
  { trade: 'Voltaren', strength: '50 mg', files: ['voltaren-50.jpg'], credit: 'GSK 20 tablets' },
  { trade: 'Amoxil', strength: '500 mg', files: ['amoxil-500.jpg'], credit: 'GSK 20 capsules' },
  { trade: 'Augmentin', strength: '1 g', files: ['augmentin-1g.jpg', 'augmentin-1g-tablet.jpg'], credit: 'GSK 14 tablets (875/125)' },
  { trade: 'Flagyl', strength: '500 mg', files: ['flagyl-500.jpg', 'flagyl-500-box.jpg'], credit: 'Sanofi 30 tablets' },
  { trade: 'Zovirax', strength: '400 mg', files: ['zovirax-400.jpg'], credit: 'GSK 400 mg tablets' },
];

export const SEED_IMAGE_DIR = 'public/seed-images/products';
export const SEED_IMAGE_URL = '/seed-images/products';
