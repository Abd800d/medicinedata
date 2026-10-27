/*
 * Runtime AI configuration — change the provider/model/key from inside the app.
 *
 * Before this module the only way to enable AI was editing .env on the server and
 * restarting it, which is impossible from a phone. Now an admin can paste a free Groq or
 * Gemini key in الإدارة ← الذكاء الاصطناعي; it is stored encrypted (see secrets.js) in the
 * settings table and read on every call, so no restart is needed.
 *
 * Precedence: database (set from the app) → environment (.env / Render dashboard).
 * A key is never returned by the API — only a mask and a fingerprint of the last 4 chars.
 */
import { getSetting, setSetting } from '../db.js';
import { encryptSecret, decryptSecret, maskSecret, secretsAvailable } from './secrets.js';
import { PRESETS, PROVIDER_IDS, presetFor, normalizeBase, retiredModel } from './ai/providers.js';

const KEY = {
  provider: 'ai.provider',
  base: 'ai.base_url',
  model: 'ai.model',
  vision: 'ai.vision_model',
  secret: 'ai.api_key_enc',
  updated: 'ai.updated_at',
  by: 'ai.updated_by',
};

const envStr = (k) => String(process.env[k] ?? '').trim();

/** Key saved from the app (decrypted), '' when absent or undecryptable. */
export function storedKey() {
  const blob = getSetting(KEY.secret, null);
  if (!blob) return '';
  return decryptSecret(blob) || '';
}

/** Merge DB overrides over env over the provider preset. Never throws. */
export function getAiConfig() {
  const dbProvider = getSetting(KEY.provider, '');
  const provider = String(
    dbProvider || envStr('AI_PROVIDER') || (envStr('AI_BASE_URL') ? 'custom' : 'openai'),
  ).toLowerCase();
  const preset = presetFor(provider) || PRESETS.custom;

  const base = normalizeBase(getSetting(KEY.base, '') || envStr('AI_BASE_URL') || preset.base);
  const model = String(getSetting(KEY.model, '') || envStr('AI_MODEL') || preset.model || '').trim();
  const vision = String(getSetting(KEY.vision, '') || envStr('AI_VISION_MODEL') || model || '').trim();

  const dbKey = storedKey();
  const envKey = envStr('AI_API_KEY') || envStr('OPENAI_API_KEY');
  const key = dbKey || envKey;

  return {
    provider,
    base,
    model,
    vision: vision || model,
    key,
    key_source: dbKey ? 'database' : envKey ? 'environment' : 'none',
    configured: Boolean(key && base && model),
    timeout_ms: Number(envStr('AI_TIMEOUT_MS') || 45000) || 45000,
    retries: Math.max(0, Math.min(4, Number(envStr('AI_RETRIES') || 2) || 0)),
    updated_at: getSetting(KEY.updated, null),
    updated_by: getSetting(KEY.by, null),
  };
}

/** Safe view for the admin screen: no key, no callable URL. */
export function aiAdminView() {
  const c = getAiConfig();
  /* A retired default must be visible, not a mystery provider error later. */
  const retired = retiredModel(c.model);
  const retiredVision = retiredModel(c.vision);
  return {
    provider: c.provider,
    model_warning: retired
      ? { model: c.model, replacement: retired.replacement, note: retired.note, field: 'model' }
      : retiredVision
        ? { model: c.vision, replacement: retiredVision.replacement, note: retiredVision.note, field: 'vision_model' }
        : null,
    base_url: c.base,
    base_is_custom: !(presetFor(c.provider)?.base === c.base) && c.provider !== 'custom',
    model: c.model,
    vision_model: c.vision,
    configured: c.configured,
    has_key: Boolean(c.key),
    key_hint: maskSecret(c.key),
    key_source: c.key_source,
    can_store: secretsAvailable(),
    updated_at: c.updated_at,
    updated_by: c.updated_by,
    presets: Object.fromEntries(PROVIDER_IDS.map((id) => [id, {
      label: PRESETS[id].label,
      label_en: PRESETS[id].label_en,
      base: PRESETS[id].base,
      model: PRESETS[id].model,
      vision: PRESETS[id].vision,
      models: PRESETS[id].models || (PRESETS[id].model ? [PRESETS[id].model] : []),
      vision_models: PRESETS[id].vision_models || (PRESETS[id].vision ? [PRESETS[id].vision] : []),
      free: PRESETS[id].free,
      keys_url: PRESETS[id].keys_url,
    }])),
  };
}

class ConfigError extends Error {
  constructor(message, code) { super(message); this.code = code; }
}

/**
 * Save provider/model/key. Only the fields present in `body` are changed, so the panel can
 * update a model without re-typing the key.
 * @returns {object} aiAdminView()
 */
export function saveAiConfig(body = {}, actor = null) {
  const provider = body.provider === undefined ? undefined : String(body.provider).toLowerCase();
  if (provider !== undefined && !PROVIDER_IDS.includes(provider)) {
    throw new ConfigError('unknown-provider', 'BAD_PROVIDER');
  }
  const preset = provider ? PRESETS[provider] : presetFor(getAiConfig().provider);

  if (body.base_url !== undefined) {
    const raw = String(body.base_url || '').trim();
    if (raw && !normalizeBase(raw)) throw new ConfigError('bad-base-url', 'BAD_BASE_URL');
    setSetting(KEY.base, normalizeBase(raw) || '');
  }
  if (body.model !== undefined) setSetting(KEY.model, String(body.model || '').trim().slice(0, 120));
  if (body.vision_model !== undefined) setSetting(KEY.vision, String(body.vision_model || '').trim().slice(0, 120));

  /* Switching provider without an explicit base/model adopts that provider's preset. */
  if (provider !== undefined) {
    setSetting(KEY.provider, provider);
    if (body.base_url === undefined && preset?.base) setSetting(KEY.base, preset.base);
    if (body.model === undefined && preset?.model) setSetting(KEY.model, preset.model);
    if (body.vision_model === undefined && preset?.vision) setSetting(KEY.vision, preset.vision);
  }

  if (body.clear_key === true) {
    setSetting(KEY.secret, '');
  } else if (body.api_key !== undefined) {
    const raw = String(body.api_key || '').trim();
    if (raw) {
      if (raw.length < 12) throw new ConfigError('api-key-too-short', 'BAD_KEY');
      if (/\s/.test(raw)) throw new ConfigError('api-key-has-spaces', 'BAD_KEY');
      const blob = encryptSecret(raw);
      if (!blob) throw new ConfigError('server-has-no-jwt-secret', 'NO_SECRET');
      setSetting(KEY.secret, blob);
    }
  }

  setSetting(KEY.updated, new Date().toISOString());
  setSetting(KEY.by, actor?.email || actor?.name || null);
  return aiAdminView();
}

/* ------------------------------------------------------------------ self test */

const classify = (status, text) => {
  const t = String(text || '');
  if (status === 401 || status === 403 || /invalid[_ ]api[_ ]key|unauthori[sz]ed|incorrect api key/i.test(t)) {
    return { kind: 'auth', ar: 'المفتاح غير صحيح أو منتهي — أنشئ مفتاحًا جديدًا من موقع المزوّد والصقه هنا.', en: 'The key is invalid or expired.' };
  }
  if (status === 404 || /model[_ ]not[_ ]found|does not exist|unknown model/i.test(t)) {
    return { kind: 'model', ar: 'اسم الموديل غير متاح لهذا المفتاح — جرّب الموديل الافتراضي للمزوّد.', en: 'The model name is not available for this key.' };
  }
  if (status === 429 || /rate.?limit|quota|too many requests/i.test(t)) {
    return { kind: 'quota', ar: 'تجاوزت حصة الاستخدام المجانية مؤقتًا — انتظر دقيقة أو استخدم مزوّدًا آخر.', en: 'Free-tier quota reached; retry in a minute.' };
  }
  if (status === 400 || /bad request|invalid[_ ]request/i.test(t)) {
    return { kind: 'request', ar: 'المزوّد رفض الطلب (غالبًا اسم الموديل أو عدم دعم صيغة JSON).', en: 'The provider rejected the request.' };
  }
  return { kind: 'upstream', ar: 'خطأ من المزوّد — راجع التفاصيل أدناه.', en: 'Provider error.' };
};

/**
 * Make one tiny, real completion with the *current* settings so "يعمل" is proven rather
 * than assumed. Returns a classified result instead of throwing.
 */
export async function testAiConfig({ timeoutMs = 20000 } = {}) {
  const c = getAiConfig();
  if (!c.key) {
    return { ok: false, kind: 'no-key', error: 'no API key', hint_ar: 'أضف مفتاحًا أولًا (من Groq أو Gemini — مجاني).', hint_en: 'Add an API key first.' };
  }
  if (!c.base) {
    return { ok: false, kind: 'no-base', error: 'no base URL', hint_ar: 'لم يُحدَّد عنوان المزوّد.', hint_en: 'No provider base URL.' };
  }
  const started = Date.now();
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(`${c.base}/chat/completions`, {
      method: 'POST',
      signal: ctrl.signal,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${c.key}` },
      body: JSON.stringify({
        model: c.model,
        messages: [{ role: 'user', content: 'Reply with the single word: ok' }],
        max_tokens: 8,
        temperature: 0,
      }),
    });
    const latency = Date.now() - started;
    const raw = await res.text().catch(() => '');
    if (!res.ok) {
      const cls = classify(res.status, raw);
      return { ok: false, kind: cls.kind, status: res.status, latency_ms: latency, error: raw.slice(0, 300), hint_ar: cls.ar, hint_en: cls.en, provider: c.provider, model: c.model };
    }
    let sample = '';
    try {
      const data = JSON.parse(raw);
      sample = String(data?.choices?.[0]?.message?.content || '').slice(0, 80);
    } catch { /* non-JSON body is still a 200 */ }
    return { ok: true, latency_ms: latency, provider: c.provider, model: c.model, sample, hint_ar: 'المزوّد استجاب فعليًا — الذكاء الاصطناعي جاهز.', hint_en: 'Provider answered — AI is ready.' };
  } catch (e) {
    const aborted = e?.name === 'AbortError';
    return {
      ok: false,
      kind: aborted ? 'timeout' : 'network',
      latency_ms: Date.now() - started,
      error: String(e?.message || e).slice(0, 200),
      hint_ar: aborted ? 'انتهت المهلة — المزوّد بطيء أو العنوان غير صحيح.' : 'تعذّر الوصول إلى المزوّد من الخادم — تحقق من العنوان واتصال الخادم بالإنترنت.',
      hint_en: aborted ? 'Timed out.' : 'Cannot reach the provider from the server.',
      provider: c.provider,
      model: c.model,
    };
  } finally {
    clearTimeout(timer);
  }
}
