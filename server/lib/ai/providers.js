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
    model: 'llama-3.3-70b-versatile',
    vision: 'meta-llama/llama-4-scout-17b-16e-instruct',
    free: true,
    keys_url: 'https://console.groq.com/keys',
  },
  gemini: {
    label: 'Google Gemini (مجاني)',
    label_en: 'Google Gemini (free tier)',
    base: 'https://generativelanguage.googleapis.com/v1beta/openai',
    model: 'gemini-2.0-flash',
    vision: 'gemini-2.0-flash',
    free: true,
    keys_url: 'https://aistudio.google.com/apikey',
  },
  openai: {
    label: 'OpenAI',
    label_en: 'OpenAI',
    base: 'https://api.openai.com/v1',
    model: 'gpt-4o-mini',
    vision: 'gpt-4o-mini',
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
