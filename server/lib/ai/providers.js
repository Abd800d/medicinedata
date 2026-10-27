/*
 * Provider presets for the AI layer.
 *
 * Every provider below speaks the OpenAI chat-completions dialect, so switching is a
 * base-URL + model change, never a code change. Free tiers are marked so the admin
 * screen can recommend one that costs nothing.
 */
export const PRESETS = {
  groq: {
    label: 'Groq (مجاني)',
    label_en: 'Groq (free tier)',
    base: 'https://api.groq.com/openai/v1',
    /* llama-3.3-70b-versatile and llama-3.1-8b-instant left Groq's free/developer tiers on
       2026-08-16; these are the models Groq now serves there. */
    model: 'openai/gpt-oss-120b',
    vision: 'meta-llama/llama-4-scout-17b-16e-instruct',
    models: ['openai/gpt-oss-120b', 'openai/gpt-oss-20b'],
    vision_models: ['meta-llama/llama-4-scout-17b-16e-instruct'],
    free: true,
    keys_url: 'https://console.groq.com/keys',
  },
  gemini: {
    label: 'Google Gemini (مجاني)',
    label_en: 'Google Gemini (free tier)',
    base: 'https://generativelanguage.googleapis.com/v1beta/openai',
    /* gemini-2.0-flash was shut down 2026-06-01. */
    model: 'gemini-3.6-flash',
    vision: 'gemini-3.6-flash',
    models: ['gemini-3.6-flash', 'gemini-3.8-flash', 'gemini-3.1-flash-lite'],
    vision_models: ['gemini-3.6-flash', 'gemini-3.8-flash'],
    free: true,
    keys_url: 'https://aistudio.google.com/apikey',
  },
  openai: {
    label: 'OpenAI',
    label_en: 'OpenAI',
    base: 'https://api.openai.com/v1',
    model: 'gpt-4o-mini',
    vision: 'gpt-4o-mini',
    models: ['gpt-4o-mini', 'gpt-4.1-mini'],
    vision_models: ['gpt-4o-mini'],
    free: false,
    keys_url: 'https://platform.openai.com/api-keys',
  },
  openrouter: {
    label: 'OpenRouter',
    label_en: 'OpenRouter',
    base: 'https://openrouter.ai/api/v1',
    model: 'google/gemini-2.0-flash-001',
    vision: 'google/gemini-2.0-flash-001',
    free: false,
    keys_url: 'https://openrouter.ai/keys',
  },
  together: {
    label: 'Together AI',
    label_en: 'Together AI',
    base: 'https://api.together.xyz/v1',
    model: 'meta-llama/Llama-3.3-70B-Instruct-Turbo',
    vision: 'meta-llama/Llama-3.2-90B-Vision-Instruct-Turbo',
    free: false,
    keys_url: 'https://api.together.ai/settings/api-keys',
  },
  deepseek: {
    label: 'DeepSeek',
    label_en: 'DeepSeek',
    base: 'https://api.deepseek.com/v1',
    model: 'deepseek-chat',
    vision: 'deepseek-chat',
    free: false,
    keys_url: 'https://platform.deepseek.com/api_keys',
  },
  ollama: {
    label: 'Ollama (محلي)',
    label_en: 'Ollama (self-hosted)',
    base: 'http://127.0.0.1:11434/v1',
    model: 'llama3.2',
    vision: 'llava',
    free: true,
    keys_url: '',
  },
  custom: {
    label: 'مزوّد مخصص (OpenAI-compatible)',
    label_en: 'Custom OpenAI-compatible',
    base: '',
    model: '',
    vision: '',
    free: false,
    keys_url: '',
  },
};

export const PROVIDER_IDS = Object.keys(PRESETS);

export const presetFor = (id) => PRESETS[String(id || '').toLowerCase()] || null;

/** Trim trailing slashes; returns '' for an unusable value. */
export function normalizeBase(url) {
  const s = String(url || '').trim().replace(/\/+$/, '');
  if (!s) return '';
  if (!/^https?:\/\//i.test(s)) return '';
  return s;
}

/*
 * Models that used to work and now return 404/400 from their provider.
 *
 * Without this table an owner who enabled AI months ago keeps a retired id in the database
 * and every analysis fails with a generic provider error. The admin screen shows a one-tap
 * switch to the replacement instead.
 */
export const RETIRED_MODELS = {
  'llama-3.3-70b-versatile': { provider: 'groq', replacement: 'openai/gpt-oss-120b', note: 'Groq retired it on 2026-08-16' },
  'llama-3.1-8b-instant': { provider: 'groq', replacement: 'openai/gpt-oss-20b', note: 'Groq retired it on 2026-08-16' },
  'gemini-2.0-flash': { provider: 'gemini', replacement: 'gemini-3.6-flash', note: 'Google shut it down on 2026-06-01' },
  'gemini-2.0-flash-001': { provider: 'gemini', replacement: 'gemini-3.6-flash', note: 'Google shut it down on 2026-06-01' },
  'gemini-2.0-flash-lite': { provider: 'gemini', replacement: 'gemini-3.1-flash-lite', note: 'Google shut it down on 2026-06-01' },
  'gemini-2.0-flash-lite-001': { provider: 'gemini', replacement: 'gemini-3.1-flash-lite', note: 'Google shut it down on 2026-06-01' },
};

/** `{ replacement, note }` when this model id is known-dead, else null. */
export function retiredModel(id) {
  return RETIRED_MODELS[String(id || '').trim().toLowerCase()] || null;
}

/**
 * Preset defaults that are themselves retired must never ship again — this is what a test
 * asserts, so the table and the presets cannot drift apart silently.
 */
export function retiredPresetDefaults() {
  return Object.entries(PRESETS)
    .flatMap(([id, p]) => [[id, 'model', p.model], [id, 'vision', p.vision]])
    .filter(([, , value]) => Boolean(retiredModel(value)));
}
