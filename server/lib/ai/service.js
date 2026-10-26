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

const PRESETS = {
  groq: { base: 'https://api.groq.com/openai/v1', model: 'llama-3.3-70b-versatile', vision: 'meta-llama/llama-4-scout-17b-16e-instruct' },
  openai: { base: 'https://api.openai.com/v1', model: 'gpt-4o-mini', vision: 'gpt-4o-mini' },
  gemini: { base: 'https://generativelanguage.googleapis.com/v1beta/openai', model: 'gemini-2.0-flash', vision: 'gemini-2.0-flash' },
  openrouter: { base: 'https://openrouter.ai/api/v1', model: 'google/gemini-2.0-flash-001', vision: 'google/gemini-2.0-flash-001' },
  together: { base: 'https://api.together.xyz/v1', model: 'meta-llama/Llama-3.3-70B-Instruct-Turbo', vision: 'meta-llama/Llama-3.2-90B-Vision-Instruct-Turbo' },
  deepseek: { base: 'https://api.deepseek.com/v1', model: 'deepseek-chat', vision: 'deepseek-chat' },
  ollama: { base: 'http://127.0.0.1:11434/v1', model: 'llama3.2', vision: 'llava' },
};

const env = (k, d = '') => String(process.env[k] ?? d).trim();

export const provider = (env('AI_PROVIDER') || (env('AI_BASE_URL') ? 'custom' : 'openai')).toLowerCase();
const preset = PRESETS[provider] || { base: '', model: 'gpt-4o-mini', vision: 'gpt-4o-mini' };
const BASE = (env('AI_BASE_URL') || preset.base).replace(/\/+$/, '');
const KEY = env('AI_API_KEY') || env('OPENAI_API_KEY');
const MODEL = env('AI_MODEL') || preset.model;
const VISION_MODEL = env('AI_VISION_MODEL') || preset.vision;
const TIMEOUT_MS = Number(env('AI_TIMEOUT_MS', '45000')) || 45000;
const RETRIES = Math.max(0, Math.min(4, Number(env('AI_RETRIES', '2')) || 0));

export const isConfigured = () => Boolean(KEY && BASE);

/** Safe, client-facing capability report — never includes the key or a callable URL. */
export function status() {
  return {
    configured: isConfigured(),
    provider: isConfigured() ? provider : 'none',
    model: isConfigured() ? MODEL : null,
    vision_model: isConfigured() ? VISION_MODEL : null,
    timeout_ms: TIMEOUT_MS,
    retries: RETRIES,
    features: {
      prescription: isConfigured(),
      pack_recognition: isConfigured(),
      assistant: isConfigured(),
      offline_catalogue: true,
    },
    hint_ar: isConfigured() ? null
      : 'التحليل الذكي غير مفعّل. أضف AI_API_KEY على الخادم (متغيرات البيئة) — مفتاح Groq مجاني. كل بقية ميزات التطبيق تعمل بدونه.',
    hint_en: isConfigured() ? null
      : 'AI analysis is not enabled. Set AI_API_KEY on the server (Groq keys are free). Everything else works without it.',
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
  audit = null, timeoutMs = TIMEOUT_MS, retries = RETRIES,
}) {
  if (!isConfigured()) {
    throw new AiError('AI key is not configured', { code: 'AI_NOT_CONFIGURED', safe: 'التحليل الذكي غير مفعّل على الخادم' });
  }
  const chosen = model || (vision ? VISION_MODEL : MODEL);
  const requestId = randomUUID();
  let lastError = null;

  for (let attempt = 0; attempt <= retries; attempt++) {
    const started = Date.now();
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const res = await fetch(`${BASE}/chat/completions`, {
        method: 'POST',
        signal: ctrl.signal,
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${KEY}` },
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
        audit?.({ event: 'ai.call', ok: false, model: chosen, provider, latency_ms: latency, status: res.status, request_id: requestId, attempt });
        // 4xx (other than 429) will never succeed on retry
        if (res.status !== 429 && res.status < 500) throw lastError;
        throw lastError;
      }
      const data = await res.json();
      const text = data?.choices?.[0]?.message?.content || '';
      const meta = {
        provider, model: chosen, latency_ms: latency, request_id: requestId, attempt,
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

export const models = { text: MODEL, vision: VISION_MODEL };
