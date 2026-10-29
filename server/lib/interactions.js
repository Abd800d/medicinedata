/*
 * فاحص التداخلات — pair-wise interaction checker built ONLY from what the database stores.
 *
 * The plan asks for severity, mechanism, effect, reference and "what the pharmacist must check".
 * MDA has one free-text `interactions` field per drug and no curated interaction table, so this
 * module does exactly two honest things:
 *
 *   1. It finds the sentence in drug A's stored text that names drug B (and vice versa) and shows
 *      it verbatim, with the drug it came from. That is a *documented mention*, not a computed
 *      pharmacological judgement.
 *   2. It flags structural risks that need no external knowledge: the same active ingredient twice,
 *      and two different ingredients in the same `drug_class` (therapeutic duplication).
 *
 * Severity is derived from wording that already exists in the stored sentence. When the sentence
 * contains no severity wording the level is `review` — never `severe`, never `minor`, and never
 * "safe": the absence of a documented interaction is reported as "not found in MDA", which is not
 * the same thing. Nothing here edits a dose, stops a drug, or auto-approves anything.
 */
import { normalize } from './search.js';

/** Highest level found in a sentence, or null when the text carries no severity wording. */
const SEVERITY_PATTERNS = [
  { level: 'contraindicated', re: /contraindicat|avoid (?:concomitant|use)|do not (?:use|combine|co-?administer)|يمنع|لا يستخدم مع|تجنب الاستخدام مع/i },
  { level: 'major', re: /severe|serious|fatal|arrhythm|haemorrhag|hemorrhag|bleeding|qt|serotonin syndrome|hyperkalaemi|hyperkalemi|renal failure|شديد|خطير|نزيف|اضطراب النظم/i },
  { level: 'moderate', re: /increase[sd]? (?:the )?(?:risk|effect|level|concentration)|decrease[sd]? (?:the )?(?:effect|absorption|level)|may (?:reduce|enhance|potentiate)|monitor|adjust|يزيد|يقلل|يرفع|يخفض|قد يضعف|راقب|يعدل/i },
  { level: 'minor', re: /minimal|slight|unlikely|طفيف|بسيط|غير محتمل/i },
];

export function severityOf(text) {
  const s = String(text || '');
  if (!s) return null;
  for (const p of SEVERITY_PATTERNS) if (p.re.test(s)) return p.level;
  return null;
}

const SENTENCE_SPLIT = /(?<=[.!?؛;])\s+|\n+/;

/**
 * Every name a stored sentence might use for one drug: the English generic name, the Arabic
 * name, and the synonyms list. MDA's own data proves why this matters — warfarin's interaction
 * text names aspirin as «أسبرين», so an English-only matcher reported "no interaction" for the
 * most famous pair in pharmacy.
 */
export function aliasesFor(drug = {}) {
  const out = [drug.generic_name, drug.generic_ar]
    .concat(String(drug.synonyms || '').split(/[,;|\n]/))
    .map((s) => normalize(String(s || '').trim()))
    .filter((s) => s.length >= 3);
  return [...new Set(out)];
}

/** The sentence(s) inside `text` that mention any alias of `drug`. */
export function sentencesMentioning(text, drug) {
  const aliases = Array.isArray(drug) ? drug : aliasesFor(typeof drug === 'string' ? { generic_name: drug } : drug);
  if (!aliases.length) return [];
  return String(text || '')
    .split(SENTENCE_SPLIT)
    .map((s) => s.trim())
    .filter((s) => s.length > 3 && aliases.some((a) => normalize(s).includes(a)))
    .slice(0, 2);
}

const SEVERITY_ORDER = { contraindicated: 4, major: 3, moderate: 2, minor: 1, review: 0 };

/**
 * @param {Array<{id:number,generic_name:string,generic_ar?:string,drug_class?:string,interactions?:string}>} drugs
 * @returns {{pairs:object[], duplications:object[], checked:number, max_severity:string, notes:string[], limits:string[]}}
 */
export function checkInteractions(drugs = []) {
  const list = drugs.filter(Boolean).slice(0, 25);
  const pairs = [];
  const duplications = [];

  for (let i = 0; i < list.length; i++) {
    for (let j = i + 1; j < list.length; j++) {
      const a = list[i];
      const b = list[j];

      /* same active ingredient twice — a real, checkable risk that needs no reference */
      if (Number(a.id) === Number(b.id) || normalize(a.generic_name) === normalize(b.generic_name)) {
        duplications.push({
          kind: 'same_ingredient',
          drug_ids: [a.id, b.id],
          generic_name: a.generic_name,
          message_ar: `تكرار المادة الفعالة نفسها (${a.generic_name}) — قد يعني جرعة مضاعفة.`,
          message_en: `The same active ingredient (${a.generic_name}) appears twice — a double dose is possible.`,
          level: 'major',
        });
        continue;
      }

      /* two different ingredients of the same therapeutic class */
      if (a.drug_class && b.drug_class && normalize(a.drug_class) === normalize(b.drug_class)) {
        duplications.push({
          kind: 'same_class',
          drug_ids: [a.id, b.id],
          generic_name: `${a.generic_name} + ${b.generic_name}`,
          message_ar: `${a.generic_name} و${b.generic_name} من نفس الفئة (${a.drug_class}) — تكرار علاجي محتمل.`,
          message_en: `${a.generic_name} and ${b.generic_name} share the class (${a.drug_class}) — possible therapeutic duplication.`,
          level: 'moderate',
        });
      }

      /* documented mention, both directions */
      const inA = sentencesMentioning(a.interactions, aliasesFor(b));
      const inB = sentencesMentioning(b.interactions, aliasesFor(a));
      if (!inA.length && !inB.length) continue;

      const source = inA.length ? a : b;
      const other = inA.length ? b : a;
      const sentences = inA.length ? inA : inB;
      const text = sentences.join(' ');
      const level = severityOf(text) || 'review';
      pairs.push({
        kind: 'documented',
        a: { id: a.id, generic_name: a.generic_name, generic_ar: a.generic_ar || null },
        b: { id: b.id, generic_name: b.generic_name, generic_ar: b.generic_ar || null },
        level,
        severity_known: Boolean(severityOf(text)),
        text,
        text_ar: /[\u0600-\u06ff]/.test(text) ? text : null,
        source_drug_id: source.id,
        source: `MDA · حقل التداخلات في سجل ${source.generic_name}`,
        other_name: other.generic_name,
        action_ar: level === 'contraindicated'
          ? 'لا تُصرف معًا — راجع الطبيب الواصف.'
          : level === 'review'
            ? 'التداخل مذكور بلا تصنيف خطورة — يحتاج مراجعة صيدلي قبل الصرف.'
            : 'يحتاج مراجعة صيدلي قبل الصرف، مع التحقق من الجرعة والمراقبة.',
        action_en: level === 'contraindicated'
          ? 'Do not dispense together — contact the prescriber.'
          : level === 'review'
            ? 'Mentioned without a severity class — requires pharmacist review before dispensing.'
            : 'Requires pharmacist review before dispensing, with dose check and monitoring.',
      });
    }
  }

  const levels = [...pairs.map((p) => p.level), ...duplications.map((d) => d.level)];
  const max = levels.sort((x, y) => (SEVERITY_ORDER[y] ?? 0) - (SEVERITY_ORDER[x] ?? 0))[0] || 'none';

  return {
    checked: list.length,
    pairs: pairs.sort((x, y) => (SEVERITY_ORDER[y.level] ?? 0) - (SEVERITY_ORDER[x.level] ?? 0)),
    duplications,
    max_severity: max,
    documented_count: pairs.length,
    notes: [
      'النتيجة مبنية على النص المحفوظ في قاعدة MDA فقط، ولا تُغني عن مرجع تداخلات مُدقَّق (مثل Lexicomp/Stockley).',
      'غياب التداخل هنا لا يعني السلامة — يُذكر صراحةً: «غير موجود في بيانات MDA».',
    ],
    limits: [
      'لا تصنيف خطورة مُستنتج بلا نص: عند غياب كلمات الخطورة في النص يظهر المستوى review.',
      'لا يشمل الغذاء أو المكملات أو الكحول (لا توجد بيانات منظمة لها في القاعدة بعد).',
      'لا يعدّل جرعة ولا يوقف دواءً ولا يعتمد أي نتيجة تلقائيًا.',
    ],
    disclaimer_ar: 'هذه أداة مساعدة للمراجعة الصيدلانية. عدم ظهور تداخل لا يعني أن الجمع آمن — يعني فقط أنه غير مذكور في بيانات MDA. القرار النهائي للطبيب أو الصيدلي المرخص، والمرجع المُدقَّق للتداخلات يبقى إلزاميًا.',
    disclaimer_en: 'A pharmacist-review aid. The absence of a listed interaction does not mean the combination is safe — only that MDA data does not mention it. The final decision belongs to a licensed physician or pharmacist; a curated interaction reference remains mandatory.',
  };
}
