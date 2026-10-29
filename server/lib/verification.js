/*
 * Verification status — the plan asks every record to carry one of six states:
 *
 *   Verified · Manufacturer Confirmed · Supplier Submitted · User Submitted · Incomplete · Unverified
 *
 * The database currently records only `verified` (0/1) plus, for photos, whether the bytes were
 * uploaded by staff or generated as placeholder artwork. It does NOT yet store who supplied a
 * record or which document confirmed it — so this module deliberately derives only three of the
 * six states and says so, instead of printing "Verified" over a record nobody checked.
 *
 * Adding the other three is a schema + workflow change (source chain table + review queue);
 * docs/SPEC-STATUS.md tracks it. When that lands, only this file changes.
 */

/* Fields a commercial product needs before it can be called complete. */
const PRODUCT_CORE = ['trade_name', 'strength', 'dosage_form', 'country', 'barcode', 'manufacturer_id'];

export const PRODUCT_FIELDS_AR = {
  trade_name: 'الاسم التجاري',
  strength: 'القوة',
  dosage_form: 'الشكل الصيدلاني',
  country: 'بلد التسويق',
  barcode: 'الباركود',
  manufacturer_id: 'الشركة المصنعة',
};

/** Which required product fields are empty. */
export function missingProductFields(p = {}) {
  return PRODUCT_CORE.filter((f) => {
    const v = p[f];
    return v === undefined || v === null || String(v).trim() === '';
  });
}

/**
 * Status for one product row.
 *  • verified      → `verified` (a pharmacist/admin marked it)
 *  • not verified but complete → `unverified` (usable, not vouched for)
 *  • missing core fields → `incomplete`
 * Nothing here claims a manufacturer or supplier confirmed anything.
 */
export function productVerification(p = {}) {
  const missing = missingProductFields(p);
  if (Number(p.verified) === 1) return { status: 'verified', missing };
  if (missing.length) return { status: 'incomplete', missing };
  return { status: 'unverified', missing };
}

/** Same idea for a generic (scientific) record: needs the science fields, not the barcode. */
export function drugVerification(d = {}) {
  const missing = ['generic_name', 'indications_en', 'dosage_adult', 'warnings']
    .filter((f) => !d[f] || String(d[f]).trim() === '');
  if (Number(d.verified) === 1) return { status: 'verified', missing };
  if (missing.length) return { status: 'incomplete', missing };
  return { status: 'unverified', missing };
}

/** Labels the UI can print without inventing wording per screen. */
export const VERIFICATION_LABELS = {
  verified: { ar: 'موثّق', en: 'Verified', tone: 'emerald' },
  unverified: { ar: 'غير موثّق', en: 'Unverified', tone: 'neutral' },
  incomplete: { ar: 'بيانات ناقصة', en: 'Incomplete', tone: 'amber' },
};

/** Attach the derived status to a row before sending it to a client. */
export function withProductVerification(row) {
  if (!row) return row;
  const v = productVerification(row);
  return { ...row, verification: v.status, missing_fields: v.missing };
}
