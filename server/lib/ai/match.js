/*
 * Catalogue matching for extracted prescription lines.
 *
 * Two sources agree here: the OCR/model text (what is written) and the local database
 * (what actually exists). The output always keeps BOTH, plus alternatives, because a
 * machine guess is never allowed to silently become "the medicine".
 */
import { db } from '../../db.js';
import { normalize, similarity } from '../search.js';
import { allergyKeysForDrug, familiesForDrug, familyLabel, describeFamilies } from '../../data/allergens.js';

const norm = (s) => normalize(s || '');

const drugs = () => db.prepare(`
  SELECT d.id, d.generic_name, d.generic_ar, d.drug_class, d.atc_code, d.prescription_required,
         d.indications_ar, d.indications_en, d.dosage_adult, d.dosage_child, d.contraindications,
         d.side_effects, d.warnings, d.interactions, d.pregnancy, d.updated_at,
         s.slug AS system_slug, s.name_ar AS system_ar, s.name_en AS system_en
  FROM drugs d LEFT JOIN systems s ON s.id = d.system_id`).all();

const products = () => db.prepare(`
  SELECT p.id, p.drug_id, p.trade_name, p.trade_name_ar, p.strength, p.dosage_form, p.pack_size,
         p.country, p.price, p.currency, p.image_url, p.verified, p.updated_at,
         m.name AS manufacturer_name, a.name AS agent_name
  FROM products p LEFT JOIN manufacturers m ON m.id = p.manufacturer_id
  LEFT JOIN agents a ON a.id = p.agent_id
  WHERE p.active = 1`).all();

/** Score a written name against both brand names and generic names. */
export function matchName(rawName, { limit = 3 } = {}) {
  const q = norm(rawName);
  if (!q || q.length < 3) return { best: null, alternatives: [] };
  const dRows = drugs();
  const pRows = products();

  const scored = [];
  for (const p of pRows) {
    const s = Math.max(
      similarity(q, p.trade_name || ''),
      p.trade_name_ar ? similarity(q, p.trade_name_ar) : 0,
    );
    if (s >= 0.62) scored.push({ kind: 'brand', score: s, product: p });
  }
  for (const d of dRows) {
    const s = Math.max(
      similarity(q, d.generic_name || ''),
      d.generic_ar ? similarity(q, d.generic_ar) : 0,
    );
    if (s >= 0.66) scored.push({ kind: 'generic', score: s, drug: d });
  }
  scored.sort((a, b) => b.score - a.score);

  const seen = new Set();
  const alternatives = [];
  for (const hit of scored) {
    const drugId = hit.kind === 'brand' ? hit.product.drug_id : hit.drug.id;
    const key = `${drugId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const drug = hit.kind === 'brand' ? dRows.find((d) => d.id === drugId) : hit.drug;
    if (!drug) continue;
    const brand = hit.kind === 'brand' ? hit.product : null;
    alternatives.push({
      drug_id: drug.id,
      product_id: brand?.id ?? null,
      matched_on: hit.kind,
      score: Number(hit.score.toFixed(3)),
      generic_name: drug.generic_name,
      generic_ar: drug.generic_ar,
      trade_name: brand?.trade_name ?? null,
      trade_name_ar: brand?.trade_name_ar ?? null,
      strength: brand?.strength ?? null,
      form: brand?.dosage_form ?? null,
      manufacturer_name: brand?.manufacturer_name ?? null,
      country: brand?.country ?? null,
      image_url: brand?.image_url ?? null,
    });
    if (alternatives.length >= limit) break;
  }
  return { best: alternatives[0] || null, alternatives };
}

/** Everything the pharmacist needs to judge one confirmed drug. */
export function drugDossier(drugId, productId = null) {
  const d = db.prepare(`
    SELECT d.*, s.name_ar AS system_ar, s.name_en AS system_en
    FROM drugs d LEFT JOIN systems s ON s.id = d.system_id WHERE d.id = ?`).get(drugId);
  if (!d) return null;
  const brands = db.prepare(`
    SELECT p.id, p.trade_name, p.trade_name_ar, p.strength, p.dosage_form, p.pack_size, p.country,
           p.price, p.currency, p.image_url, p.updated_at, m.name AS manufacturer_name, a.name AS agent_name
    FROM products p LEFT JOIN manufacturers m ON m.id = p.manufacturer_id LEFT JOIN agents a ON a.id = p.agent_id
    WHERE p.drug_id = ? AND p.active = 1 ORDER BY p.verified DESC, p.trade_name LIMIT 12`).all(drugId);
  const selected = productId ? brands.find((b) => b.id === productId) || null : null;
  return {
    drug: {
      id: d.id, generic_name: d.generic_name, generic_ar: d.generic_ar, drug_class: d.drug_class,
      atc_code: d.atc_code, prescription_required: d.prescription_required,
      indications_ar: d.indications_ar, indications_en: d.indications_en,
      dosage_adult: d.dosage_adult, dosage_child: d.dosage_child,
      contraindications: d.contraindications, side_effects: d.side_effects,
      warnings: d.warnings, interactions: d.interactions, pregnancy: d.pregnancy,
      system_ar: d.system_ar, system_en: d.system_en,
      updated_at: d.updated_at, source: d.source || 'MDA database',
      allergen_families: describeFamilies(familiesForDrug(d)),
    },
    selected_brand: selected,
    brands,
  };
}

/* ---------------- Real-data safety checks (no AI, no guessing) ---------------- */

const MG_PER_UNIT = { mg: 1, mcg: 0.001, g: 1000, gm: 1000, gram: 1000, grams: 1000, 'ملغ': 1, 'مغم': 0.001, 'غم': 1000, 'جم': 1000, 'غم/': 1000 };
const FREQ_WORDS = [
  [/\b(once|1\s*(?:x|time)\s*(?:a\s*)?(?:day|daily)|od)\b/i, 1],
  [/\b(twice|2\s*(?:x|times)\s*(?:a\s*)?(?:day|daily)|bid|bd)\b/i, 2],
  [/\b(three|thrice|3\s*(?:x|times)\s*(?:a\s*)?(?:day|daily)|tid|tds)\b/i, 3],
  [/\b(four|4\s*(?:x|times)\s*(?:a\s*)?(?:day|daily)|qid|qds)\b/i, 4],
  [/\b(every\s*6\s*h(?:ours?|rs?))\b/i, 4],
  [/\b(every\s*8\s*h(?:ours?|rs?))\b/i, 3],
  [/\b(every\s*12\s*h(?:ours?|rs?))\b/i, 2],
];
const AR_FREQ = [
  [/مرة\s*(?:واحدة\s*)?(?:يوميًا|يوميا|في\s*اليوم)/, 1],
  [/مرتين/, 2],
  [/ثلاث\s*(?:مرات|مراتٍ)/, 3],
  [/أربع\s*مرات/, 4],
  [/كل\s*(\d+)\s*ساعات?/, null],
];

/** "500 mg × 3/day" → 1500 mg/day, when both parts are readable. Null otherwise. */
export function dailyDoseMg(dose, frequency, strength) {
  const text = `${dose || ''} ${frequency || ''} ${strength || ''}`;
  const m = text.match(/(\d+(?:[.,]\d+)?)\s*(mg|mcg|g|gm|grams?|ملغ|مغم|غم|جم)/i);
  if (!m) return null;
  const amount = Number(m[1].replace(',', '.'));
  const unit = MG_PER_UNIT[m[2].toLowerCase()] ?? 1;
  let perDoseMg = amount * unit;
  let times = null;
  for (const [re, n] of FREQ_WORDS) { if (re.test(frequency || '')) { times = n; break; } }
  if (times === null) {
    for (const [re, n] of AR_FREQ) {
      const mm = (frequency || '').match(re);
      if (mm) { times = n ?? (mm[1] ? Math.max(1, Math.round(24 / Number(mm[1]))) : null); break; }
    }
  }
  if (!times) return { per_dose_mg: perDoseMg, daily_mg: null };
  return { per_dose_mg: perDoseMg, daily_mg: Math.round(perDoseMg * times) };
}

/** Pull the documented maximum daily dose out of the Arabic/English monograph text. */
export function documentedMaxDailyMg(monograph) {
  if (!monograph) return null;
  const candidates = [];
  const re = /(?:حد\s*أقصى|بحد\s*أقصى|maximum|max)\D{0,24}?(\d+(?:[.,]\d+)?)\s*(mg|mcg|g|gm|grams?|ملغ|مغم|غم|جم)/gi;
  let m;
  while ((m = re.exec(String(monograph))) !== null) {
    const value = Number(m[1].replace(',', '.')) * (MG_PER_UNIT[m[2].toLowerCase()] ?? 1);
    if (value > 0) candidates.push(value);
  }
  return candidates.length ? Math.max(...candidates) : null;
}

/* ---------------- Clinical review flags ---------------- */
/*
 * Every flag is built from a stored field (drug_class, interactions, dosage_adult,
 * ATC code, declared allergies). Nothing here invents a molecule, a dose or a
 * diagnosis. Each flag carries:
 *   detail_*  – what the database says
 *   plain_*   – the same thing in everyday Arabic/English
 *   why_*     – the exact reason it appeared (so it can be checked)
 *   source    – where it came from + when that row was last updated
 */

const ALLERGY_SOURCE = 'قائمة حساسيات المستخدم (أُدخلت يدويًا)';

function sourceOf(drug) {
  return { label: drug?.source || 'MDA database', updated_at: drug?.updated_at || null };
}

function flag({ severity, type, drugId = null, drugIds = null, titleAr, titleEn, detailAr, detailEn, plainAr, plainEn, whyAr, whyEn, actionAr = 'يحتاج إلى مراجعة الصيدلي', actionEn = 'Needs pharmacist review', source = null }) {
  return {
    severity,
    type,
    ...(drugId != null ? { drug_id: drugId } : {}),
    ...(drugIds ? { drug_ids: drugIds } : {}),
    title_ar: titleAr,
    title_en: titleEn,
    detail_ar: detailAr,
    detail_en: detailEn,
    plain_ar: plainAr,
    plain_en: plainEn,
    why_ar: whyAr,
    why_en: whyEn,
    action_ar: actionAr,
    action_en: actionEn,
    source,
  };
}

/**
 * @param items    enriched prescription lines (need dossier.drug)
 * @param context  { allergies: [{ code, label, note }] }  — declared by the patient
 */
export function reviewFlags(items, { allergies = [] } = {}) {
  const flags = [];
  const byDrug = new Map();
  const declared = (allergies || []).filter((a) => a && a.code);

  for (const item of items) {
    const drug = item.dossier?.drug;
    if (!drug) continue;
    if (!byDrug.has(drug.id)) byDrug.set(drug.id, []);
    byDrug.get(drug.id).push(item);
  }

  /* 1) Same active ingredient written twice (common handwriting error) */
  for (const [drugId, group] of byDrug) {
    if (group.length < 2) continue;
    const drug = group[0].dossier.drug;
    const name = drug.generic_ar || drug.generic_name;
    flags.push(flag({
      severity: 'high',
      type: 'duplicate_ingredient',
      drugId,
      titleAr: 'تكرار المادة الفعالة',
      titleEn: 'Duplicate active ingredient',
      detailAr: `المادة الفعالة «${name}» مكرّرة في ${group.length} بنود — قد يعني جرعة مضاعفة.`,
      detailEn: `The same active ingredient appears in ${group.length} prescription lines.`,
      plainAr: 'الوصفة فيها نفس الدواء مكتوبًا مرتين (بأسماء تجارية مختلفة). لو أخذ المريض الاثنين معًا فكأنه أخذ جرعة مضاعفة.',
      plainEn: 'The same medicine is written twice under different brand names. Taking both means a double dose.',
      whyAr: `لأن ${group.length} أسماء في الوصفة طابقت نفس المادة الفعالة في قاعدة MDA: ${name}.`,
      whyEn: `All ${group.length} names matched the same generic molecule in the MDA database.`,
      source: sourceOf(drug),
    }));
  }

  /* 2) Daily dose above the documented maximum */
  for (const item of items) {
    const drug = item.dossier?.drug;
    if (!drug) continue;
    const calc = dailyDoseMg(item.dose, item.frequency, item.strength);
    const max = documentedMaxDailyMg(`${drug.dosage_adult || ''} ${drug.dosage_child || ''}`);
    if (!(calc?.daily_mg && max && calc.daily_mg > max * 1.05)) continue;
    flags.push(flag({
      severity: 'high',
      type: 'dose_above_max',
      drugId: drug.id,
      titleAr: 'جرعة أعلى من المعتاد',
      titleEn: 'Dose above documented maximum',
      detailAr: `المحسوب من الوصفة ${calc.daily_mg} مغم/يوم، والحد الأقصى في المرجع ${max} مغم/يوم.`,
      detailEn: `The prescription implies ${calc.daily_mg} mg/day; the reference maximum is ${max} mg/day.`,
      plainAr: 'الجرعة اليومية المكتوبة أكبر من الجرعة القصوى المعتادة. لا تُغيَّر الجرعة من تلقاء نفسك — الصيدلي يراجعها مع الطبيب.',
      plainEn: 'The written daily dose is above the usual maximum. Do not change it yourself — the pharmacist will check with the doctor.',
      whyAr: 'لأن حاسبة الجرعة ضربت عدد الأقراص × التركيز × عدد المرات اليومية، وقارنتها بالجرعة القصوى المحفوظة في مونوغراف الدواء.',
      whyEn: 'The dose calculator multiplied units × strength × times per day and compared it with the maximum stored in the drug monograph.',
      actionAr: 'يحتاج إلى مراجعة الصيدلي/الطبيب',
      actionEn: 'Needs pharmacist/doctor review',
      source: sourceOf(drug),
    }));
  }

  /* 3) Recorded interactions between the prescribed molecules */
  const present = [...byDrug.keys()];
  for (let i = 0; i < present.length; i++) {
    for (let j = i + 1; j < present.length; j++) {
      const a = byDrug.get(present[i])[0].dossier.drug;
      const b = byDrug.get(present[j])[0].dossier.drug;
      const mentionIn = (text, other) => {
        const t = norm(text);
        if (!t) return false;
        const names = [other.generic_name, other.generic_ar, ...(other.synonyms || '').split(/[,،;]/)]
          .map(norm).filter((n) => n.length >= 4);
        return names.some((n) => t.includes(n));
      };
      const hitA = mentionIn(a.interactions, b);
      const hitB = mentionIn(b.interactions, a);
      if (!hitA && !hitB) continue;
      const sourceDrug = hitA ? a : b;
      const other = hitA ? b : a;
      flags.push(flag({
        severity: 'medium',
        type: 'possible_interaction',
        drugIds: [a.id, b.id],
        titleAr: 'احتمال تداخل دوائي',
        titleEn: 'Possible drug interaction',
        detailAr: `سُجّل في مرجع «${sourceDrug.generic_ar || sourceDrug.generic_name}»: ${(hitA ? a.interactions : b.interactions).slice(0, 260)}`,
        detailEn: `Recorded in the ${sourceDrug.generic_name} monograph.`,
        plainAr: `الدواءان «${a.generic_ar || a.generic_name}» و«${b.generic_ar || b.generic_name}» قد يتفاعلان معًا. لا يعني هذا أنهما ممنوعان، لكنه يحتاج مراجعة صيدلي قبل الاستخدام.`,
        plainEn: `These two medicines may interact. That does not automatically forbid them, but a pharmacist should review before use.`,
        whyAr: `لأن حقل التداخلات في مونوغراف «${sourceDrug.generic_ar || sourceDrug.generic_name}» يذكر «${other.generic_ar || other.generic_name}» بالاسم.`,
        whyEn: `The interaction field of the ${sourceDrug.generic_name} monograph names ${other.generic_name}.`,
        source: sourceOf(sourceDrug),
      }));
    }
  }

  /* 4) Two different molecules from the same therapeutic class */
  const byClass = new Map();
  for (const [drugId, group] of byDrug) {
    const drug = group[0].dossier.drug;
    const cls = String(drug.drug_class || '').trim();
    if (!cls) continue;
    if (!byClass.has(cls)) byClass.set(cls, []);
    if (!byClass.get(cls).some((d) => d.id === drugId)) byClass.get(cls).push(drug);
  }
  for (const [cls, drugs] of byClass) {
    if (drugs.length < 2) continue;
    const names = drugs.map((d) => d.generic_ar || d.generic_name).join('، ');
    flags.push(flag({
      severity: 'medium',
      type: 'duplicate_therapy_class',
      drugIds: drugs.map((d) => d.id),
      titleAr: 'دواءان من نفس المجموعة العلاجية',
      titleEn: 'Two drugs from the same class',
      detailAr: `الأدوية: ${names} — التصنيف المشترك: ${cls}.`,
      detailEn: `Shared class: ${cls}.`,
      plainAr: 'الوصفة فيها دواءان من نفس العائلة العلاجية. أحيانًا يكون هذا مقصودًا، وأحيانًا يعني تكرارًا علاجيًا — الصيدلي يحدد.',
      plainEn: 'Two prescribed medicines belong to the same therapeutic class. Sometimes intended, sometimes duplication — the pharmacist decides.',
      whyAr: `لأن حقل «التصنيف الدوائي» في قاعدة MDA متطابق (${cls}) لاسمين مختلفين.`,
      whyEn: `The drug_class field is identical (${cls}) for two different molecules.`,
      actionAr: 'يحتاج إلى مراجعة الصيدلي',
      actionEn: 'Needs pharmacist review',
      source: sourceOf(drugs[0]),
    }));
  }

  /* 5) Declared allergy vs this prescription (molecule or documented family) */
  if (declared.length) {
    for (const item of items) {
      const drug = item.dossier?.drug;
      if (!drug) continue;
      const keys = allergyKeysForDrug(drug);
      const moleculeHit = declared.find((a) => keys.includes(a.code) && String(a.code).startsWith('mol:'));
      const familyHit = declared.find((a) => keys.includes(a.code) && !String(a.code).startsWith('mol:'));
      const hit = moleculeHit || familyHit;
      if (!hit) continue;
      const label = hit.label || familyLabel(hit.code);
      const drugName = drug.generic_ar || drug.generic_name;
      flags.push(flag({
        severity: 'high',
        type: 'allergy_conflict',
        drugId: drug.id,
        titleAr: moleculeHit ? 'حساسية مسجّلة لنفس الدواء' : 'حساسية مسجّلة من نفس العائلة الدوائية',
        titleEn: moleculeHit ? 'Recorded allergy to this medicine' : 'Recorded allergy to the same drug family',
        detailAr: moleculeHit
          ? `سجّلت حساسية من «${label}»، وهذا الدواء هو نفس المادة الفعالة (${drugName}).`
          : `سجّلت حساسية من «${label}»، وهذا الدواء (${drugName}) ينتمي لنفس العائلة (${familyLabel(hit.code)}). قد يحدث تفاعل متصالب.`,
        detailEn: moleculeHit
          ? `Recorded allergy: ${label}. This prescription contains the same molecule.`
          : `Recorded allergy: ${label}. This drug belongs to the same family (${familyLabel(hit.code)}).`,
        plainAr: moleculeHit
          ? 'أنت سجّلت أن عندك حساسية من هذا الدواء نفسه. لا يُصرف قبل أن يراجعه الصيدلي ويستبدله إن لزم.'
          : 'أنت سجّلت حساسية من عائلة دوائية، والدواء في الوصفة من نفس العائلة. الحساسية المتصالبة ممكنة — الصيدلي يقرر.',
        plainEn: moleculeHit
          ? 'You recorded an allergy to this exact medicine. It must be reviewed and likely replaced.'
          : 'You recorded an allergy to a drug family, and this prescription contains one of that family. Cross-reactivity is possible.',
        whyAr: moleculeHit
          ? `لأن قائمة حساسياتك تحتوي المادة الفعالة نفسها (${drug.generic_name}).`
          : `لأن كود ATC للدواء (${drug.atc_code || 'غير مسجّل'}) يضعه ضمن «${familyLabel(hit.code)}» المسجّلة في حساسياتك.`,
        whyEn: moleculeHit
          ? 'Your allergy list contains the same active ingredient.'
          : 'The drug ATC code places it in the family you recorded.',
        actionAr: 'يحتاج إلى مراجعة الصيدلي/الطبيب قبل الصرف',
        actionEn: 'Needs pharmacist/doctor review before dispensing',
        source: { ...sourceOf(drug), declared_at: hit.created_at || null, label: `${sourceOf(drug).label} + ${ALLERGY_SOURCE}` },
      }));
    }
  }

  /* 6) Names that could not be confirmed in the catalogue */
  const unmatched = items.filter((i) => !i.dossier);
  if (unmatched.length) {
    flags.push(flag({
      severity: 'medium',
      type: 'unmatched_items',
      titleAr: 'أسماء غير مؤكدة في القاعدة',
      titleEn: 'Names not confirmed in the database',
      detailAr: `${unmatched.length} بند لم يُطابق أي دواء — تحتاج تصحيحًا يدويًا.`,
      detailEn: `${unmatched.length} line(s) could not be matched.`,
      plainAr: 'اسم دواء واحد أو أكثر غير موجود في قاعدة البيانات، فقد يكون مكتوبًا بخط غير واضح أو اسمًا تجاريًا غير مُسجّل. صحّحه يدويًا.',
      plainEn: 'One or more names are not in the database — possibly unclear handwriting or an unlisted brand.',
      whyAr: 'لأن درجة التشابه مع كل أسماء القاعدة (تجارية وعلمية) كانت أقل من حد المطابقة.',
      whyEn: 'Similarity against every brand and generic name stayed below the match threshold.',
      source: { label: 'MDA database', updated_at: null },
    }));
  }

  /* 7) Missing monograph data → we say so instead of implying safety */
  const withoutMonograph = items.filter((i) => i.dossier?.drug && !i.dossier.drug.interactions && !i.dossier.drug.warnings);
  if (withoutMonograph.length) {
    flags.push(flag({
      severity: 'info',
      type: 'data_missing',
      titleAr: 'بيانات غير مكتملة',
      titleEn: 'Incomplete source data',
      detailAr: `لا توجد بيانات تداخلات/تحذيرات محفوظة لـ ${withoutMonograph.length} دواءً — غياب التحذير لا يعني السلامة.`,
      detailEn: `No interaction/warning data stored for ${withoutMonograph.length} medicine(s).`,
      plainAr: 'لا توجد لدينا معلومات كافية عن تداخلات أو تحذيرات هذا الدواء. عدم ظهور تحذير لا يعني أن الدواء آمن — راجع مرجعًا رسميًا.',
      plainEn: 'We do not hold enough interaction/warning data for this medicine. No warning does not mean safe.',
      whyAr: 'لأن حقلي «التداخلات» و«التحذيرات» فارغان في مونوغراف الدواء.',
      whyEn: 'The interactions and warnings fields are empty in the monograph.',
      actionAr: 'راجع المرجع الرسمي',
      actionEn: 'Check an authoritative reference',
      source: { label: 'MDA database', updated_at: withoutMonograph[0]?.dossier?.drug?.updated_at || null },
    }));
  }

  return flags;
}
