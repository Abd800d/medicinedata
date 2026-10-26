/*
 * Catalogue matching for extracted prescription lines.
 *
 * Two sources agree here: the OCR/model text (what is written) and the local database
 * (what actually exists). The output always keeps BOTH, plus alternatives, because a
 * machine guess is never allowed to silently become "the medicine".
 */
import { db } from '../../db.js';
import { normalize, similarity } from '../search.js';

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

/**
 * Clinical review flags built ONLY from database fields.
 * Every flag is advisory: phrased as "needs pharmacist review", never as a decision.
 */
export function reviewFlags(items) {
  const flags = [];
  const byDrug = new Map();

  for (const item of items) {
    const drug = item.dossier?.drug;
    if (!drug) continue;
    if (!byDrug.has(drug.id)) byDrug.set(drug.id, []);
    byDrug.get(drug.id).push(item);
  }

  /* 1) Same active ingredient written twice (very common handwriting error) */
  for (const [drugId, group] of byDrug) {
    if (group.length > 1) {
      flags.push({
        severity: 'high', type: 'duplicate_ingredient', drug_id: drugId,
        title_ar: 'تكرار المادة الفعالة',
        title_en: 'Duplicate active ingredient',
        detail_ar: `المادة الفعالة «${group[0].dossier.drug.generic_ar || group[0].dossier.drug.generic_name}» مكرّرة في ${group.length} بنود — قد يعني جرعة مضاعفة.`,
        detail_en: `The same active ingredient appears in ${group.length} lines.`,
        action_ar: 'يحتاج إلى مراجعة الصيدلي', action_en: 'Needs pharmacist review',
      });
    }
  }

  /* 2) Daily dose above the documented maximum (only when both numbers are readable) */
  for (const item of items) {
    const drug = item.dossier?.drug;
    if (!drug) continue;
    const calc = dailyDoseMg(item.dose, item.frequency, item.strength);
    const max = documentedMaxDailyMg(`${drug.dosage_adult || ''} ${drug.dosage_child || ''}`);
    if (calc?.daily_mg && max && calc.daily_mg > max * 1.05) {
      flags.push({
        severity: 'high', type: 'dose_above_max', drug_id: drug.id,
        title_ar: 'جرعة أعلى من المعتاد',
        title_en: 'Dose above documented maximum',
        detail_ar: `المحسوب من الوصفة ${calc.daily_mg} مغم/يوم، والحد الأقصى في المرجع ${max} مغم/يوم.`,
        detail_en: `Prescription implies ${calc.daily_mg} mg/day; reference maximum is ${max} mg/day.`,
        action_ar: 'يحتاج إلى مراجعة الصيدلي/الطبيب', action_en: 'Needs pharmacist/doctor review',
      });
    }
  }

  /* 3) Recorded interactions between the prescribed molecules */
  const present = [...byDrug.keys()];
  if (present.length > 1) {
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
        if (hitA || hitB) {
          const sourceDrug = hitA ? a : b;
          flags.push({
            severity: 'medium', type: 'possible_interaction',
            drug_ids: [a.id, b.id],
            title_ar: 'احتمال تداخل دوائي',
            title_en: 'Possible drug interaction',
            detail_ar: `سُجّل في مرجع «${sourceDrug.generic_ar || sourceDrug.generic_name}»: ${(hitA ? a.interactions : b.interactions).slice(0, 260)}`,
            detail_en: `Recorded in the ${sourceDrug.generic_name} monograph.`,
            action_ar: 'يحتاج إلى مراجعة الصيدلي',
            action_en: 'Needs pharmacist review',
          });
        }
      }
    }
  }

  /* 4) Missing data → we say so instead of assuming it is safe */
  const withoutMonograph = items.filter((i) => i.dossier?.drug && !i.dossier.drug.interactions && !i.dossier.drug.warnings);
  if (withoutMonograph.length) {
    flags.push({
      severity: 'info', type: 'data_missing',
      title_ar: 'بيانات غير مكتملة',
      title_en: 'Incomplete source data',
      detail_ar: `لا توجد بيانات تداخلات/تحذيرات محفوظة لـ ${withoutMonograph.length} دواءً — غياب التحذير لا يعني السلامة.`,
      detail_en: `No interaction/warning data stored for ${withoutMonograph.length} medicine(s).`,
      action_ar: 'راجع المرجع الرسمي', action_en: 'Check an authoritative reference',
    });
  }

  const unmatched = items.filter((i) => !i.dossier);
  if (unmatched.length) {
    flags.push({
      severity: 'medium', type: 'unmatched_items',
      title_ar: 'أسماء غير مؤكدة في القاعدة',
      title_en: 'Names not confirmed in the database',
      detail_ar: `${unmatched.length} بند لم يُطابق أي دواء — تحتاج تصحيحًا يدويًا.`,
      detail_en: `${unmatched.length} line(s) could not be matched.`,
      action_ar: 'يحتاج إلى مراجعة الصيدلي', action_en: 'Needs pharmacist review',
    });
  }

  return flags;
}
