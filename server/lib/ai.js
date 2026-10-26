/* AI layer: OpenAI-compatible chat + vision, with a fully offline retrieval fallback. */
import { db } from '../db.js';
import { normalize, similarity, queryTokens } from './search.js';

import { getAiConfig } from './ai-config.js';

/* Resolved per call so a key added from the admin screen works without a restart. */
export const aiEnabled = () => getAiConfig().configured;

async function chat(messages, { json = false, maxTokens = 900, temperature = 0.2 } = {}) {
  const cfg = getAiConfig();
  if (!cfg.key) throw Object.assign(new Error('AI is not configured'), { status: 503, publicMessage: 'AI key not configured' });
  const r = await fetch(`${cfg.base}/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${cfg.key}` },
    body: JSON.stringify({
      model: messages.model || cfg.model,
      messages: messages.map(({ model, ...m }) => m),
      max_tokens: maxTokens,
      temperature,
      ...(json ? { response_format: { type: 'json_object' } } : {}),
    }),
  });
  if (!r.ok) {
    const t = await r.text().catch(() => '');
    throw Object.assign(new Error(`AI upstream ${r.status} ${t.slice(0, 200)}`), { status: 502, publicMessage: 'AI provider error' });
  }
  const data = await r.json();
  return data.choices?.[0]?.message?.content || '';
}

function safeJson(text, fallback) {
  try {
    const m = String(text).match(/\{[\s\S]*\}/);
    return m ? JSON.parse(m[0]) : fallback;
  } catch { return fallback; }
}

/* ---------- Local retrieval over the real database ---------- */
/* Question words that carry no medicine identity ("ما جرعة …؟", "what is the dose of …") */
const QUESTION_STOP = new Set([
  'ما', 'ماذا', 'هل', 'كيف', 'متى', 'اين', 'لماذا', 'هي', 'هو', 'هذا', 'هذه', 'عن', 'من', 'في', 'على', 'الى', 'او', 'ثم',
  'جرعات', 'علاج', 'دواء', 'الادويه', 'استخدام', 'استخدامات', 'دواعي', 'فوائد', 'اعراض', 'اثار', 'تحذيرات', 'موانع',
  'سعر', 'بديل', 'بدائل', 'افضل', 'معلومات', 'نبذه', 'شرح', 'هل', 'تعريف', 'what', 'whats', 'which', 'when', 'where',
  'why', 'how', 'who', 'is', 'are', 'was', 'were', 'the', 'a', 'an', 'of', 'for', 'to', 'and', 'or', 'with', 'about',
  'tell', 'me', 'medicine', 'medicines', 'drug', 'drugs', 'dose', 'doses', 'dosing', 'dosage', 'use', 'uses', 'used',
  'used?', 'side', 'effects', 'effect', 'warnings', 'warning', 'price', 'alternative', 'alternatives', 'info',
  'information', 'please', 'can', 'you', 'give', 'explain',
]);

export function retrieve(q, limit = 8) {
  const norm = normalize(q);
  if (!norm) return { drugs: [], products: [] };
  const tokens = queryTokens(q).filter((t) => !QUESTION_STOP.has(t));
  if (!tokens.length) return { drugs: [], products: [] };
  const likes = tokens.slice(0, 4).map((t) => `%${t.replace(/[%_]/g, '')}%`);
  const DRUG_SELECT = `SELECT d.id, d.generic_name, d.generic_ar, d.drug_class, d.indications_ar, d.indications_en,
      d.dosage_adult, d.dosage_child, d.contraindications, d.side_effects, d.warnings, d.interactions, d.pregnancy,
      d.mechanism_ar, d.mechanism_en, d.half_life, d.storage, d.atc_code, d.synonyms,
      s.name_ar AS system_ar, s.name_en AS system_en
    FROM drugs d LEFT JOIN systems s ON s.id=d.system_id`;
  const where = likes.map(() => '(d.search_norm LIKE ? OR d.generic_name LIKE ? OR d.generic_ar LIKE ?)').join(' OR ');
  let drugs = db.prepare(`${DRUG_SELECT} WHERE ${where} LIMIT 200`).all(...likes.flatMap((l) => [l, l, l]));
  // Small catalogue (or a heavily misspelled Arabic name): score everything rather than miss the match
  if (drugs.length < 40) drugs = db.prepare(`${DRUG_SELECT} LIMIT 6000`).all();
  const scoreOf = (d) => Math.max(...tokens.map((t) => Math.max(
    similarity(t, d.generic_name),
    d.generic_ar ? similarity(t, d.generic_ar) : 0,
    d.synonyms ? similarity(t, d.synonyms) * 0.9 : 0,
  )));
  /* Brands: a question may name the trade name ("أوجمنتين") while the monograph is the generic */
  const PROD_SELECT = `SELECT p.drug_id, p.trade_name, p.trade_name_ar FROM products p WHERE p.active=1`;
  let prodRows = db.prepare(`${PROD_SELECT} AND (${likes.map(() => '(p.search_norm LIKE ? OR p.trade_name LIKE ? OR p.trade_name_ar LIKE ?)').join(' OR ')}) LIMIT 300`)
    .all(...likes.flatMap((l) => [l, l, l]));
  if (prodRows.length < 60) prodRows = db.prepare(`${PROD_SELECT} LIMIT 20000`).all();
  const byId = new Map(drugs.map((d) => [d.id, d]));
  const brandScore = new Map();
  for (const p of prodRows) {
    if (!p.drug_id) continue;
    const sc = Math.max(...tokens.map((t) => Math.max(similarity(t, p.trade_name), p.trade_name_ar ? similarity(t, p.trade_name_ar) : 0)));
    if (sc > (brandScore.get(p.drug_id) || 0)) brandScore.set(p.drug_id, sc);
  }
  const extraIds = [...brandScore.entries()].filter(([id, sc]) => sc > 0.6 && !byId.has(id))
    .sort((a, b) => b[1] - a[1]).slice(0, 12).map(([id]) => id);
  if (extraIds.length) {
    const extra = db.prepare(`SELECT d.id, d.generic_name, d.generic_ar, d.drug_class, d.indications_ar, d.indications_en,
        d.dosage_adult, d.dosage_child, d.contraindications, d.side_effects, d.warnings, d.interactions, d.pregnancy,
        d.mechanism_ar, d.mechanism_en, d.half_life, d.storage, d.atc_code, d.synonyms,
        s.name_ar AS system_ar, s.name_en AS system_en
      FROM drugs d LEFT JOIN systems s ON s.id=d.system_id WHERE d.id IN (${extraIds.map(() => '?').join(',')})`).all(...extraIds);
    for (const d of extra) { byId.set(d.id, d); drugs.push(d); }
  }

  const scored = drugs
    .map((d) => ({ d, s: Math.max(scoreOf(d), brandScore.get(d.id) || 0) }))
    .filter((x) => x.s > 0.62)
    .sort((a, b) => b.s - a.s)
    .slice(0, limit)
    .map((x) => x.d);
  if (!scored.length) return { drugs: [], products: [] };
  const stmt = db.prepare(`SELECT p.id, p.trade_name, p.trade_name_ar, p.strength, p.dosage_form, p.country, p.price, p.currency,
      m.name AS manufacturer_name, a.name AS agent_name
    FROM products p LEFT JOIN manufacturers m ON m.id=p.manufacturer_id LEFT JOIN agents a ON a.id=p.agent_id
    WHERE p.drug_id=? AND p.active=1 ORDER BY p.verified DESC LIMIT 8`);
  return { drugs: scored.map((d) => ({ ...d, products: stmt.all(d.id) })) };
}

function localAnswer(question) {
  const { drugs } = retrieve(question, 4);
  if (!drugs.length) {
    return {
      answer_ar: 'لم أجد دواءً مطابقًا في قاعدة البيانات. جرّب الاسم العلمي أو التجاري، أو استخدم البحث الضبابي في الصفحة الرئيسية.',
      answer_en: 'No matching medicine was found in the database. Try the generic or brand name, or use fuzzy search on the home page.',
      sources: [],
    };
  }
  const d = drugs[0];
  const lines_ar = [
    `**${d.generic_ar || d.generic_name}** (${d.generic_name})${d.drug_class ? ' — ' + d.drug_class : ''}`,
    d.indications_ar ? `**الاستخدامات:** ${d.indications_ar}` : '',
    d.dosage_adult ? `**الجرعة للبالغين:** ${d.dosage_adult}` : '',
    d.dosage_child ? `**جرعة الأطفال:** ${d.dosage_child}` : '',
    d.contraindications ? `**موانع الاستعمال:** ${d.contraindications}` : '',
    d.warnings ? `**تحذيرات:** ${d.warnings}` : '',
    d.side_effects ? `**آثار جانبية شائعة:** ${d.side_effects}` : '',
    d.products?.length ? `**متوفر في اليمن/الأسواق العربية بأسماء:** ${d.products.map((p) => `${p.trade_name} ${p.strength || ''}`).join('، ')}` : '',
    '\n_مصدر: قاعدة بيانات MedicineData (MDA). هذه معلومات مرجعية ولا تُغني عن استشارة الطبيب أو الصيدلي._',
  ].filter(Boolean);
  const lines_en = [
    `**${d.generic_name}**${d.drug_class ? ' — ' + d.drug_class : ''}`,
    d.indications_en ? `**Indications:** ${d.indications_en}` : '',
    d.dosage_adult ? `**Adult dose:** ${d.dosage_adult}` : '',
    d.warnings ? `**Warnings:** ${d.warnings}` : '',
    '\n_Source: MedicineData (MDA) reference database. Not a substitute for medical advice._',
  ].filter(Boolean);
  return {
    answer_ar: lines_ar.join('\n'),
    answer_en: lines_en.join('\n'),
    sources: drugs.map((x) => ({ id: x.id, name: x.generic_name, name_ar: x.generic_ar, atc: x.atc_code })),
    drug: d,
  };
}

export async function answerQuestion(question, lang = 'ar') {
  const { drugs } = retrieve(question, 5);
  const context = drugs.map((d) => ({
    generic: d.generic_name, arabic: d.generic_ar, class: d.drug_class,
    indications: d.indications_en, dose_adult: d.dosage_adult, dose_child: d.dosage_child,
    contraindications: d.contraindications, side_effects: d.side_effects, warnings: d.warnings,
    pregnancy: d.pregnancy, interactions: d.interactions, atc: d.atc_code,
    brands: d.products?.map((p) => `${p.trade_name} ${p.strength || ''} (${p.manufacturer_name || ''}, ${p.country || ''})`),
  }));
  if (!aiEnabled()) {
    return { mode: 'offline-database', ...localAnswer(question) };
  }
  try {
    const system = `You are MDA, a careful clinical pharmacology assistant for pharmacists in Yemen and the Arab world.
Rules:
- Use ONLY the supplied DATABASE CONTEXT for medicine-specific facts. If something is missing, say it is not in the database and recommend an authoritative reference (WHO, BNF, FDA, EMA, Yemeni MOH).
- Never prescribe for a specific patient, never give a definitive diagnosis. Add a short safety disclaimer.
- Answer in ${lang === 'ar' ? 'Arabic' : 'English'}. Keep it structured, concise, practical.
- Include a "sources" array of {name, atc} taken from the context.
Return strict JSON: {"answer_ar": "...", "answer_en": "...", "sources": [{"name": "...", "atc": "..."}], "safety": "..."}`;
    const content = `DATABASE CONTEXT:\n${JSON.stringify(context)}\n\nQUESTION: ${question}`;
    const raw = await chat([
      { role: 'system', content: system },
      { role: 'user', content },
    ], { json: true, maxTokens: 1200 });
    const parsed = safeJson(raw, null);
    if (!parsed) throw new Error('bad AI json');
    return { mode: 'ai', ...parsed };
  } catch (e) {
    return { mode: 'offline-database', ...localAnswer(question), warning: e.message };
  }
}

/* ---------- Prescription analysis ---------- */
export async function analyzePrescription(imageDataUrl, lang = 'ar') {
  if (!aiEnabled()) return null;
  const system = `You are a licensed-pharmacist assistant reading a prescription image.
Extract ONLY what is visible. Never invent medicines. Return strict JSON:
{"readable": true|false, "patient": "", "doctor": "", "date": "", "diagnosis": "",
 "items": [{"name": "", "strength": "", "form": "", "dose": "", "frequency": "", "duration": "", "notes": ""}],
 "notes": "", "confidence": 0-1}`;
  const raw = await chat([
    { role: 'system', content: system },
    { role: 'user', content: [
      { type: 'text', text: `Read this prescription. Reply in ${lang === 'ar' ? 'Arabic' : 'English'} where free text is needed.` },
      { type: 'image_url', image_url: { url: imageDataUrl } },
    ] },
  ], { json: true, maxTokens: 1200, temperature: 0 });
  return safeJson(raw, null);
}

export function matchPrescriptionText(text) {
  // Keep line structure: normalize() collapses newlines, so split first.
  const rawLines = String(text || '').split(/[\n\r;؛]+/);
  const lines = rawLines.map((l) => normalize(l)).filter(Boolean);
  const tokens = [];
  for (const line of lines) {
    tokens.push(line);
    for (const part of line.split(/[,،.()\[\]\/|+]+/)) {
      const t = part.trim();
      if (t.length > 2 && t !== line) tokens.push(t);
    }
  }
  const uniq = [...new Set(tokens)].slice(0, 200);
  const drugRows = db.prepare('SELECT id, generic_name, generic_ar, drug_class, dosage_adult, warnings, prescription_required FROM drugs LIMIT 20000').all();
  const prodRows = db.prepare(`SELECT p.id, p.trade_name, p.trade_name_ar, p.strength, p.dosage_form, p.drug_id,
      d.generic_name, d.generic_ar, d.warnings FROM products p LEFT JOIN drugs d ON d.id=p.drug_id WHERE p.active=1 LIMIT 50000`).all();
  const found = new Map();
  const strongVariants = new Set();
  for (const t of uniq) {
    strongVariants.add(t);
    const words = t.split(' ').filter(Boolean);
    if (words.length > 1) strongVariants.add(words.slice(0, 2).join(' '));
    if (words.length > 2) strongVariants.add(words.slice(0, 3).join(' '));
  }
  const put = (key, score, kind, item) => {
    const prev = found.get(key);
    if (!prev || prev.score < score) found.set(key, { kind, score, item });
  };
  for (const t of uniq) {
    const words = t.split(' ').filter(Boolean);
    const variants = new Set([t]);
    if (words.length > 1) variants.add(words.slice(0, 2).join(' '));
    if (words.length > 2) variants.add(words.slice(0, 3).join(' '));
    for (const w of words) if (w.length >= 5 && !/^(tablet|tablets|capsule|capsules|syrup|drops|daily|twice|three|times|days|week)$/.test(w)) variants.add(w);
    for (const v of variants) {
      if (v.length < 3) continue;
      const strong = strongVariants.has(v);
      const productMin = strong ? 0.78 : 0.86;
      const drugMin = strong ? 0.8 : 0.88;
      for (const p of prodRows) {
        const nameLen = normalize(p.trade_name).length;
        const arLen = p.trade_name_ar ? normalize(p.trade_name_ar).length : 0;
        if (Math.min(Math.abs(nameLen - v.length), arLen ? Math.abs(arLen - v.length) : 99) > 14) continue;
        const sc = Math.max(similarity(v, p.trade_name), p.trade_name_ar ? similarity(v, p.trade_name_ar) : 0);
        if (sc >= productMin) put('prod:' + p.id, Math.min(0.99, sc), 'product', p);
      }
      for (const d of drugRows) {
        if (Math.abs(normalize(d.generic_name).length - v.length) > 14) continue;
        const sc = Math.max(similarity(v, d.generic_name), d.generic_ar ? similarity(v, d.generic_ar) : 0);
        if (sc >= drugMin) put('drug:' + d.id, Math.min(0.99, sc - 0.02), 'drug', d);
      }
    }
    if (found.size > 80) break;
  }
  // One entry per active ingredient: keep the best-matching brand and drop sibling brands
  const seenDrug = new Set();
  const results = [...found.values()]
    .sort((a, b) => b.score - a.score)
    .filter(({ item, kind }) => {
      const key = 'd' + (kind === 'product' ? (item.drug_id || 'p' + item.id) : item.id);
      if (seenDrug.has(key)) return false;
      seenDrug.add(key);
      return true;
    })
    .slice(0, 20);
  /* Drop a generic that is only a variant of a stronger match
     (e.g. keep "ciprofloxacin", drop "ciprofloxacin-ear" for the same line). */
  const genericNameOf = (r) => String((r.kind === 'product' ? r.item.generic_name : r.item.generic_name) || '').toLowerCase();
  const deduped = results.filter((r) => {
    const name = genericNameOf(r);
    if (!name) return true;
    return !results.some((other) => {
      if (other === r) return false;
      const on = genericNameOf(other);
      return on && on.length < name.length && other.score >= r.score && (name.startsWith(on + '-') || name.startsWith(on + ' '));
    });
  });

  const products = deduped.map(({ item, kind, score }) => {
    if (kind === 'product') {
      const drug = db.prepare('SELECT id, generic_name, generic_ar, warnings, dosage_adult FROM drugs WHERE id=?').get(item.drug_id) || {};
      return { ...item, matched_as: 'brand', score, drug };
    }
    const best = db.prepare(`SELECT p.id, p.trade_name, p.strength, p.dosage_form, p.image_url, p.country, p.price, p.currency,
        m.name AS manufacturer_name FROM products p LEFT JOIN manufacturers m ON m.id=p.manufacturer_id
        WHERE p.drug_id=? AND p.active=1 ORDER BY p.verified DESC LIMIT 3`).all(item.id);
    return { ...item, matched_as: 'generic', score, products: best };
  });
  return { language: /[\u0600-\u06FF]/.test(text) ? 'ar' : 'en', tokens: tokens.slice(0, 80), items: products };
}

/* ---------- Medicine recognition from a pack photo ---------- */
export async function identifyMedicine(imageDataUrl, lang = 'ar') {
  if (!aiEnabled()) return null;
  const system = `You identify medicines from photographs of packaging or blisters.
Read the visible brand name, generic name, strength and manufacturer. Never invent text that is not visible.
Return strict JSON: {"readable": true|false, "visible_text": "", "guesses": [{"name": "", "strength": "", "form": ""}], "confidence": 0-1}`;
  const raw = await chat([
    { role: 'system', content: system },
    { role: 'user', content: [
      { type: 'text', text: `Identify this medicine. Reply in ${lang === 'ar' ? 'Arabic' : 'English'} where free text is needed.` },
      { type: 'image_url', image_url: { url: imageDataUrl } },
    ] },
  ], { json: true, maxTokens: 700, temperature: 0, model: getAiConfig().vision || undefined });
  return safeJson(raw, null);
}
