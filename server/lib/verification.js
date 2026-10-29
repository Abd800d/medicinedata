/*
 * Six verification states — the plan's vocabulary, made real.
 *
 *   verified               موثّق                  a pharmacist/admin reviewed the record
 *   manufacturer_confirmed مؤكد من الشركة المصنعة  backed by a document from the manufacturer
 *   supplier_submitted     مُقدَّم من مورّد         a licensed supplier supplied the data
 *   user_submitted         مُقدَّم من مستخدم        a user submitted it (never a quality claim)
 *   incomplete             بيانات ناقصة            required fields are still empty
 *   unverified             غير موثّق               nothing vouches for it yet
 *
 * Two things are deliberately separate:
 *   • the STATE says what the record is and where it came from;
 *   • the REVIEW (none | pending | approved | rejected) says what a human decided about it.
 * Rejection is a review outcome, not a provenance claim — mixing them would make "rejected"
 * look like a source and would erase where the data came from.
 *
 * Every rule below is enforced on the server: a state cannot be reached by sending a request,
 * and a claim that needs a document is refused without one.
 */

export const STATES = [
  'verified',
  'manufacturer_confirmed',
  'supplier_submitted',
  'user_submitted',
  'incomplete',
  'unverified',
];

export const REVIEW_STATUSES = ['none', 'pending', 'approved', 'rejected'];

/* States that are claims about provenance and therefore need evidence attached first. */
export const EVIDENCE_REQUIRED = {
  manufacturer_confirmed: ['manufacturer_letter', 'authorization', 'regulatory'],
};

export const SOURCE_KINDS = [
  'manufacturer_letter',
  'authorization',
  'regulatory',
  'invoice',
  'leaflet',
  'photo',
  'other',
];

export const SOURCE_KIND_LABELS = {
  manufacturer_letter: { ar: 'خطاب من الشركة المصنعة', en: 'Manufacturer letter' },
  authorization: { ar: 'تفويض/توكيل رسمي', en: 'Authorization' },
  regulatory: { ar: 'وثيقة تسجيل تنظيمي', en: 'Regulatory registration' },
  invoice: { ar: 'فاتورة شراء', en: 'Purchase invoice' },
  leaflet: { ar: 'نشرة دواء رسمية', en: 'Official leaflet' },
  photo: { ar: 'صورة العلبة', en: 'Pack photo' },
  other: { ar: 'مستند آخر', en: 'Other document' },
};

export const STATE_META = {
  verified: { ar: 'موثّق', en: 'Verified', tone: 'emerald', rank: 5, claim_ar: 'راجعه صيدلي', claim_en: 'a pharmacist reviewed it' },
  manufacturer_confirmed: { ar: 'مؤكد من الشركة المصنعة', en: 'Manufacturer confirmed', tone: 'sky', rank: 4, claim_ar: 'بمستند من الشركة المصنعة', claim_en: 'backed by a manufacturer document' },
  supplier_submitted: { ar: 'مُقدَّم من مورّد', en: 'Supplier submitted', tone: 'violet', rank: 3, claim_ar: 'من مورّد، بلا مراجعة صيدلي', claim_en: 'supplied by a supplier, not reviewed' },
  user_submitted: { ar: 'مُقدَّم من مستخدم', en: 'User submitted', tone: 'neutral', rank: 2, claim_ar: 'من مستخدم، لا يعني الجودة', claim_en: 'submitted by a user, no quality claim' },
  incomplete: { ar: 'بيانات ناقصة', en: 'Incomplete', tone: 'amber', rank: 1, claim_ar: 'حقول أساسية فارغة', claim_en: 'required fields are empty' },
  unverified: { ar: 'غير موثّق', en: 'Unverified', tone: 'neutral', rank: 0, claim_ar: 'لا أحد تبنّاه بعد', claim_en: 'no one has vouched for it' },
};

export const REVIEW_META = {
  none: { ar: 'بلا مراجعة', en: 'Not reviewed', tone: 'neutral' },
  pending: { ar: 'بانتظار المراجعة', en: 'Pending review', tone: 'amber' },
  approved: { ar: 'اعتُمد', en: 'Approved', tone: 'emerald' },
  rejected: { ar: 'مرفوض', en: 'Rejected', tone: 'rose' },
};

export const isState = (v) => STATES.includes(String(v || ''));
export const isReview = (v) => REVIEW_STATUSES.includes(String(v || ''));
export const isSourceKind = (v) => SOURCE_KINDS.includes(String(v || ''));

/* Who may set which state. Only a pharmacist or admin can make any of these claims; a plain
   user never writes directly to a catalogue record (their input goes through /submissions). */
const ROLE_RANK = { user: 1, pharmacist: 2, admin: 3 };
export const MIN_ROLE_FOR_STATE = {
  unverified: 2, incomplete: 2, user_submitted: 2,
  supplier_submitted: 2, manufacturer_confirmed: 2, verified: 2,
};

/* Allowed forward moves. Anything else is a correction: admin-only and with a written reason. */
const FORWARD = {
  unverified: ['incomplete', 'user_submitted', 'supplier_submitted', 'manufacturer_confirmed', 'verified'],
  incomplete: ['unverified', 'user_submitted', 'supplier_submitted', 'manufacturer_confirmed', 'verified'],
  user_submitted: ['supplier_submitted', 'manufacturer_confirmed', 'verified', 'incomplete'],
  supplier_submitted: ['manufacturer_confirmed', 'verified', 'incomplete'],
  manufacturer_confirmed: ['verified', 'incomplete'],
  verified: ['manufacturer_confirmed'],
};

/* Fields a commercial product needs before it can be called complete. */
const PRODUCT_CORE = ['trade_name', 'strength', 'dosage_form', 'country', 'barcode', 'manufacturer_id'];
const DRUG_CORE = ['generic_name', 'indications_en', 'dosage_adult', 'warnings'];

export const FIELDS_AR = {
  trade_name: 'الاسم التجاري',
  strength: 'القوة',
  dosage_form: 'الشكل الصيدلاني',
  country: 'بلد التسويق',
  barcode: 'الباركود',
  manufacturer_id: 'الشركة المصنعة',
  generic_name: 'الاسم العلمي',
  indications_en: 'الدواعي',
  dosage_adult: 'جرعة البالغين',
  warnings: 'التحذيرات',
};

export const missingFields = (row, entity) =>
  (entity === 'drugs' ? DRUG_CORE : PRODUCT_CORE).filter((f) => {
    const v = row?.[f];
    return v === undefined || v === null || String(v).trim() === '';
  });

/**
 * Effective state for a row.
 *  • a stored claim (verified / manufacturer_confirmed / submitted) always wins — we never
 *    silently demote a human decision;
 *  • the two open states self-heal: a record whose missing fields were filled stops saying
 *    "incomplete", and a record that lost a required field starts saying it;
 *  • a row with no stored state at all is derived from its fields.
 */
export function effectiveState(row, missing = []) {
  const stored = row?.verification_state;
  if (isState(stored)) {
    if (stored === 'incomplete') return missing.length ? 'incomplete' : 'unverified';
    if (stored === 'unverified') return missing.length ? 'incomplete' : 'unverified';
    return stored;
  }
  if (missing.length) return 'incomplete';
  return Number(row?.verified) === 1 ? 'verified' : 'unverified';
}

/**
 * Validate one requested change.
 * @returns {{ok:true, from:string, to:string, review:string, correction:boolean}}
 *        | {{ok:false, status:number, code:string, error:string, accepted_kinds?:string[]}}
 */
export function validateChange({
  row, entity = 'products', role = 'user', requestedState, requestedReview, note = '', sources = [],
}) {
  const missing = missingFields(row, entity);
  const from = effectiveState(row, missing);
  const actorRank = ROLE_RANK[role] || 0;
  const noteText = String(note || '').trim();

  if (requestedState && !isState(requestedState)) {
    return { ok: false, status: 422, code: 'BAD_STATE', error: 'حالة تحقق غير معروفة / Unknown verification state' };
  }
  if (requestedReview && !isReview(requestedReview)) {
    return { ok: false, status: 422, code: 'BAD_REVIEW', error: 'حالة مراجعة غير معروفة / Unknown review status' };
  }
  if (!requestedState && !requestedReview) {
    return { ok: false, status: 400, code: 'NOTHING_TO_DO', error: 'لم يُطلب أي تغيير / Nothing to change' };
  }

  const to = requestedState || from;
  /* Approving without saying the record is verified would be a contradiction. */
  if (requestedReview === 'approved' && to !== 'verified') {
    return { ok: false, status: 422, code: 'APPROVE_NEEDS_VERIFIED', error: 'الاعتماد يعني الحالة «موثّق» / Approval means the state is «verified»' };
  }
  if (requestedReview === 'rejected' && noteText.length < 10) {
    return { ok: false, status: 422, code: 'NOTE_REQUIRED', error: 'الرفض يحتاج سببًا مكتوبًا (10 أحرف على الأقل) / A rejection needs a written reason (10+ characters)' };
  }
  if (requestedState && actorRank < (MIN_ROLE_FOR_STATE[requestedState] || 9)) {
    return { ok: false, status: 403, code: 'ROLE_TOO_LOW', error: 'هذه الحالة تحتاج صلاحية صيدلي أو مدير / Pharmacist or admin required' };
  }

  const allowed = new Set(FORWARD[from] || []);
  const correction = requestedState !== undefined && requestedState !== from && !allowed.has(requestedState);
  if (correction) {
    /* Going backwards is a correction. Allowed — but never silently: an admin writes why, and
       the reason is stored in verification_events and in the audit chain. */
    if (actorRank < 3) {
      return { ok: false, status: 403, code: 'CORRECTION_ADMIN_ONLY', error: 'تغيير الحالة بهذا الاتجاه يحتاج صلاحية مدير / This correction requires an admin' };
    }
    if (noteText.length < 10) {
      return { ok: false, status: 422, code: 'NOTE_REQUIRED', error: 'الرجوع بالحالة يحتاج سببًا مكتوبًا (10 أحرف على الأقل) / A correction needs a written reason (10+ characters)' };
    }
  }

  const needs = EVIDENCE_REQUIRED[to] || [];
  if (needs.length && !sources.some((s) => needs.includes(s.kind))) {
    return {
      ok: false, status: 422, code: 'SOURCE_REQUIRED',
      error: 'هذه الحالة تحتاج مستندًا موثّقًا (خطاب شركة/تفويض/تسجيل) / This state requires a manufacturer document',
      accepted_kinds: needs,
    };
  }

  if (requestedState === 'verified' && requestedReview === 'rejected') {
    return { ok: false, status: 422, code: 'CONTRADICTION', error: 'لا يمكن اعتماد السجل ورفضه في نفس الطلب / Cannot verify and reject in one request' };
  }

  /* Review outcome. An approval only exists for a verified record: moving away from «verified»
     re-opens the review instead of leaving a contradictory "approved but unverified" row. */
  let review = requestedReview || row?.review_status || 'none';
  if (review === 'approved' && to !== 'verified') {
    review = (to === 'unverified' || to === 'incomplete') ? 'none' : 'pending';
  }
  if (to === 'verified') review = 'approved';

  return { ok: true, from, to, review, correction, missing };
}

/** Mirror column kept in sync so old queries (`WHERE verified=1`) still mean "reviewed". */
export const mirrorVerified = (state) => (state === 'verified' ? 1 : 0);

/** Backwards-compatible shape used by list endpoints. */
export function statusOf(row, entity = 'products') {
  const missing = missingFields(row, entity);
  const state = effectiveState(row, missing);
  return { status: state, missing, review: row?.review_status || 'none' };
}

export function withProductVerification(row) {
  if (!row) return row;
  const v = statusOf(row, 'products');
  return { ...row, verification: v.status, missing_fields: v.missing, review_status: v.review };
}

export function withDrugVerification(row) {
  if (!row) return row;
  const v = statusOf(row, 'drugs');
  return { ...row, verification: v.status, missing_fields: v.missing, review_status: v.review };
}
