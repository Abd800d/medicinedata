/*
 * Prescription analysis pipeline (server side).
 *
 *   image / text ──▶ model (strict JSON) ──▶ validation ──▶ catalogue matching
 *                 ──▶ clinical review flags ──▶ per-field confidence ──▶ pharmacist review
 *
 * Guarantees:
 *   • A missing/unreadable field stays null with confidence 0 — never filled by the model
 *     and never filled by us.
 *   • Low-confidence items are flagged, not silently accepted.
 *   • The result is *advisory*. Nothing is stored as "approved" without a pharmacist.
 */
import { complete, isConfigured, models, AiError } from './service.js';
import {
  PRESCRIPTION_SYSTEM_PROMPT, PRESCRIPTION_USER_PROMPT,
  PRESCRIPTION_TEXT_SYSTEM_PROMPT, REPORT_DISCLAIMER_AR, REPORT_DISCLAIMER_EN,
} from './prompts.js';
import { matchName, drugDossier, reviewFlags, dailyDoseMg, documentedMaxDailyMg } from './match.js';

export const PROMPT_VERSION = 'rx-1.0.0';
export const FIELD_THRESHOLD = 0.55;   // below this a field is "uncertain"
export const ITEM_THRESHOLD = 0.7;     // below this the line needs human confirmation

const clamp = (n) => {
  const v = Number(n);
  if (!Number.isFinite(v)) return 0;
  return Math.max(0, Math.min(1, v));
};
const str = (v) => {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s && !/^(null|undefined|n\/a|none|غير محدد|-)$/i.test(s) ? s : null;
};

const FIELD_KEYS = ['name', 'name_ar', 'strength', 'form', 'dose', 'frequency', 'duration', 'route', 'instructions'];

/** Coerce whatever the model returned into exactly the documented shape. */
export function validateAnalysis(raw) {
  if (!raw || typeof raw !== 'object') {
    return { ok: false, reason: 'not_an_object', analysis: null };
  }
  const itemsIn = Array.isArray(raw.items) ? raw.items.slice(0, 25) : [];
  const items = [];
  for (const it of itemsIn) {
    if (!it || typeof it !== 'object') continue;
    const fields = {
      name: str(it.name),
      name_ar: str(it.name_ar),
      strength: str(it.strength),
      form: str(it.form),
      dose: str(it.dose),
      frequency: str(it.frequency),
      duration: str(it.duration),
      route: str(it.route),
      instructions: str(it.instructions),
    };
    const rawText = str(it.raw_text);
    if (!fields.name && !fields.name_ar && !rawText) continue; // nothing to work with
    const baseConf = clamp(it.confidence);
    /* Per-field confidence: the model's own value when supplied, otherwise the item score,
       and always 0 when the field is empty (an absent field must never look confident). */
    const given = it.field_confidence && typeof it.field_confidence === 'object' ? it.field_confidence : {};
    const fieldConfidence = {};
    for (const k of FIELD_KEYS) {
      fieldConfidence[k] = fields[k] ? clamp(given[k] ?? baseConf) : 0;
    }
    const uncertain = new Set(
      Array.isArray(it.uncertain_fields)
        ? it.uncertain_fields.map((x) => String(x).trim().toLowerCase()).filter(Boolean)
        : [],
    );
    for (const k of FIELD_KEYS) if (fields[k] && fieldConfidence[k] < FIELD_THRESHOLD) uncertain.add(k);
    items.push({
      raw_text: rawText,
      fields,
      confidence: baseConf,
      field_confidence: fieldConfidence,
      uncertain_fields: [...uncertain],
    });
  }
  const meta = {
    readable: raw.readable !== false,
    image_quality: ['good', 'fair', 'poor'].includes(raw.image_quality) ? raw.image_quality : 'fair',
    language: ['ar', 'en', 'mixed'].includes(raw.language) ? raw.language : 'ar',
    patient: { name: str(raw?.patient?.name), confidence: str(raw?.patient?.name) ? clamp(raw?.patient?.confidence) : 0 },
    doctor: { name: str(raw?.doctor?.name), confidence: str(raw?.doctor?.name) ? clamp(raw?.doctor?.confidence) : 0 },
    clinic: { name: str(raw?.clinic?.name), confidence: str(raw?.clinic?.name) ? clamp(raw?.clinic?.confidence) : 0 },
    date: { value: str(raw?.date?.value), confidence: str(raw?.date?.value) ? clamp(raw?.date?.confidence) : 0 },
    notes: str(raw.notes),
    warnings: Array.isArray(raw.warnings) ? raw.warnings.map(str).filter(Boolean).slice(0, 10) : [],
  };
  return { ok: true, analysis: { ...meta, items } };
}

/** Attach catalogue matches + dossiers + review flags to a validated analysis. */
export function enrich(analysis, { lang = 'ar' } = {}) {
  const items = analysis.items.map((item, idx) => {
    const hint = [item.fields.name || item.fields.name_ar, item.fields.strength].filter(Boolean).join(' ');
    const { best, alternatives } = matchName(hint || item.raw_text || '');
    const dossier = best ? drugDossier(best.drug_id, best.product_id) : null;
    const dosage = dailyDoseMg(item.fields.dose, item.fields.frequency, item.fields.strength);
    const maxRef = dossier?.drug ? documentedMaxDailyMg(`${dossier.drug.dosage_adult || ''} ${dossier.drug.dosage_child || ''}`) : null;

    /* Review decision is derived from data we have, never from optimism */
    const needsReview = !best || item.confidence < ITEM_THRESHOLD || item.uncertain_fields.length > 0 || !analysis.readable;
    const reason = !best ? 'not_in_database'
      : !analysis.readable ? 'image_unreadable'
      : item.confidence < ITEM_THRESHOLD ? 'low_confidence'
      : item.uncertain_fields.length ? 'uncertain_fields'
      : null;

    return {
      line_no: idx + 1,
      raw_text: item.raw_text,
      ...item.fields,
      confidence: item.confidence,
      field_confidence: item.field_confidence,
      uncertain_fields: item.uncertain_fields,
      matched: best,
      alternatives,
      dossier,
      dose_calc: dosage,
      documented_max_daily_mg: maxRef,
      needs_review: needsReview,
      review_reason: reason,
      status: 'pending',
    };
  });

  const flags = reviewFlags(items);
  const lowConfidence = items.filter((i) => i.needs_review).length;
  const matched = items.filter((i) => i.matched).length;
  const overall = items.length
    ? Number((items.reduce((s, i) => s + i.confidence, 0) / items.length).toFixed(3))
    : 0;

  return {
    ...analysis,
    items,
    flags,
    summary: {
      items: items.length,
      matched,
      unmatched: items.length - matched,
      needs_review: lowConfidence,
      average_confidence: overall,
      auto_accepted: 0,                 // by design: nothing is auto-accepted
      requires_pharmacist: true,
    },
    disclaimer_ar: REPORT_DISCLAIMER_AR,
    disclaimer_en: REPORT_DISCLAIMER_EN,
    source: {
      catalogue: 'MDA database',
      catalogue_generated_at: null,
      prompt_version: PROMPT_VERSION,
      model: models.vision || models.text,
      engine: 'ai-service',
      analysed_at: new Date().toISOString(),
      language: lang,
    },
  };
}

/**
 * Full pipeline. Returns { analysis, ai } where analysis is safe to show
 * and `ai` carries audit metadata (model, latency, request id).
 */
export async function analyzePrescription({ imageDataUrl = null, text = null, lang = 'ar' } = {}) {
  if (!isConfigured()) {
    throw new AiError('AI not configured', { code: 'AI_NOT_CONFIGURED', status: 503, safe: 'AI_NOT_CONFIGURED' });
  }
  if (!imageDataUrl && !text) {
    throw new AiError('image or text required', { code: 'INPUT_REQUIRED', status: 400, safe: 'INPUT_REQUIRED' });
  }

  const system = imageDataUrl ? PRESCRIPTION_SYSTEM_PROMPT : PRESCRIPTION_TEXT_SYSTEM_PROMPT;
  const userContent = imageDataUrl
    ? [
      { type: 'text', text: PRESCRIPTION_USER_PROMPT(lang) },
      { type: 'image_url', image_url: { url: imageDataUrl } },
    ]
    : [{ type: 'text', text: `${PRESCRIPTION_USER_PROMPT(lang)}\n\n---\n${String(text).slice(0, 6000)}` }];

  const { json, text: rawText, meta } = await complete({
    messages: [{ role: 'system', content: system }, { role: 'user', content: userContent }],
    vision: Boolean(imageDataUrl),
    json: true,
    maxTokens: 1800,
    temperature: 0,
  });

  const parsed = json || (() => { try { return JSON.parse(rawText); } catch { return null; } })();
  const validated = validateAnalysis(parsed);
  if (!validated.ok) {
    throw new AiError('model returned unusable JSON', {
      code: 'AI_BAD_OUTPUT', status: 502,
      safe: 'تعذّر فهم نتيجة التحليل — أعد المحاولة أو أدخل النص يدويًا',
    });
  }
  const analysis = enrich(validated.analysis, { lang });
  return {
    analysis,
    ai: {
      provider: meta.provider,
      model: meta.model,
      request_id: meta.request_id,
      latency_ms: meta.latency_ms,
      prompt_version: PROMPT_VERSION,
      usage: meta.usage,
    },
  };
}
