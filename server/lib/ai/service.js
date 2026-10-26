/*
 * AI Service — the single, independent gateway to every model call.
 *
 * Rules enforced here (see docs/AI.md):
 *   • No key ever leaves the server. The client only sees /api/ai/status.
 *   • One OpenAI-compatible transport for Groq, OpenAI, Gemini, OpenRouter, Together,
 *     DeepSeek, Ollama… so switching provider is an env change, not a code change.
 *   • Hard timeout + bounded retries with exponential backoff and jitter.
 *   • Every call is audited: provider, model, latency, tokens, outcome (never the payload).
 *   • Raw provider errors are logged server-side; clients receive a short, safe message.
 */
import { randomUUID } from 'node:crypto';
import { getAiConfig } from '../ai-config.js';

/*
 * Configuration is resolved on every call (see server/lib/ai-config.js): an admin can
 * switch provider or paste a key in the app and the next request uses it — no restart.
 * `models` is kept as a live object because older modules read models.vision directly.
 */
export const models = { text: '', vision: '' };

export function refreshModels() {
  const c = getAiConfig();
  models.text = c.model;
  models.vision = c.vision || c.model;
  return models;
}
refreshModels();

export const isConfigured = () => getAiConfig().configured;

/** Safe, client-facing capability report — never includes the key or a callable URL. */
export function status() {
  const c = getAiConfig();
  const configured = c.configured;
  return {
    configured,
    provider: configured ? c.provider : 'none',
    model: configured ? c.model : null,
    vision_model: configured ? c.vision : null,
    timeout_ms: c.timeout_ms,
    retries: c.retries,
    features: {
      prescription: configured,
      pack_recognition: configured,
      assistant: configured,
      offline_catalogue: true,
    },
    hint_ar: configured ? null
      : 'التحليل الذكي غير مفعّل على الخادم. المدير يستطيع تفعيله من: الإدارة ← الذكاء الاصطناعي (مفتاح Groq مجاني). كل بقية ميزات التطبيق تعمل بدونه.',
    hint_en: configured ? null
      : 'AI is not enabled on the server. An admin can enable it in Admin → AI settings (a free Groq key works). Everything else works without it.',
  };
}

export class AiError extends Error {
  constructor(message, { status = 503, code = 'AI_UNAVAILABLE', safe = null } = {}) {
    super(message);
    this.status = status;
    this.code = code;
    this.safe = safe || message;
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Pull the first JSON object/array out of a model reply (models love to add prose). */
export function extractJson(text) {
  if (!text) return null;
  const s = String(text).trim();
  const fenced = s.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const body = fenced ? fenced[1] : s;
  const start = body.search(/[[{]/);
  if (start < 0) return null;
  const open = body[start];
  const close = open === '{' ? '}' : ']';
  let depth = 0;
  let inStr = false;
  let esc = false;
  for (let i = start; i < body.length; i++) {
    const c = body[i];
    if (inStr) {
      if (esc) esc = false;
      else if (c === '\\') esc = true;
      else if (c === '"') inStr = false;
      continue;
    }
    if (c === '"') { inStr = true; continue; }
    if (c === open) depth++;
    else if (c === close) {
      depth--;
      if (depth === 0) {
        try { return JSON.parse(body.slice(start, i + 1)); } catch { return null; }
      }
    }
  }
  return null;
}

/**
 * One audited chat completion.
 * @returns {{ json:any|null, text:string, meta:{provider,model,latency_ms,usage,attempt,request_id} }}
 */
export async function complete({
  messages, model, vision = false, json = true, maxTokens = 1400, temperature = 0,
  audit = null, timeoutMs = null, retries = null,
}) {
  const cfg = getAiConfig();
  if (!cfg.configured) {
    throw new AiError('AI key is not configured', { code: 'AI_NOT_CONFIGURED', safe: 'التحليل الذكي غير مفعّل على الخادم' });
  }
  refreshModels();
  const chosen = model || (vision ? cfg.vision : cfg.model);
  timeoutMs = timeoutMs ?? cfg.timeout_ms;
  retries = retries ?? cfg.retries;
  const requestId = randomUUID();
  let lastError = null;

  for (let attempt = 0; attempt <= retries; attempt++) {
    const started = Date.now();
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const res = await fetch(`${cfg.base}/chat/completions`, {
        method: 'POST',
        signal: ctrl.signal,
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${cfg.key}` },
        body: JSON.stringify({
          model: chosen,
          messages,
          max_tokens: maxTokens,
          temperature,
          ...(json ? { response_format: { type: 'json_object' } } : {}),
        }),
      });
      const latency = Date.now() - started;
      if (!res.ok) {
        const raw = await res.text().catch(() => '');
        lastError = new AiError(`AI upstream ${res.status}: ${raw.slice(0, 300)}`, {
          status: res.status === 429 ? 429 : 502,
          code: res.status === 429 ? 'AI_RATE_LIMIT' : 'AI_UPSTREAM',
          safe: res.status === 429
            ? 'الخدمة مشغولة الآن — أعد المحاولة بعد لحظات'
            : 'تعذّر الوصول إلى خدمة التحليل',
        });
        audit?.({ event: 'ai.call', ok: false, model: chosen, provider: cfg.provider, latency_ms: latency, status: res.status, request_id: requestId, attempt });
        // 4xx (other than 429) will never succeed on retry
        if (res.status !== 429 && res.status < 500) throw lastError;
        throw lastError;
      }
      const data = await res.json();
      const text = data?.choices?.[0]?.message?.content || '';
      const meta = {
        provider: cfg.provider, model: chosen, latency_ms: latency, request_id: requestId, attempt,
        usage: data?.usage || null,
      };
      audit?.({ event: 'ai.call', ok: true, ...meta });
      return { text, json: json ? extractJson(text) : null, meta };
    } catch (e) {
      const aborted = e?.name === 'AbortError';
      lastError = aborted
        ? new AiError(`AI timeout after ${timeoutMs}ms`, { code: 'AI_TIMEOUT', safe: 'انتهت مهلة التحليل — جرّب صورة أوضح' })
        : (e instanceof AiError ? e : new AiError(`AI transport: ${e.message}`, { code: 'AI_TRANSPORT', safe: 'تعذّر الاتصال بخدمة التحليل' }));
      if (aborted) audit?.({ event: 'ai.call', ok: false, model: chosen, provider, timeout: true, request_id: requestId, attempt });
      if (attempt >= retries) break;
      await sleep(Math.min(4000, 400 * 2 ** attempt) + Math.floor(Math.random() * 250));
    } finally {
      clearTimeout(timer);
    }
  }
  throw lastError || new AiError('AI failed', { code: 'AI_FAILED' });
}

/* `models` is refreshed by refreshModels() above. */
