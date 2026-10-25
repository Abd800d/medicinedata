/* Optional integrations — status, self-test and copy-paste setup hints.
 *
 * Nothing here fakes a credential: when a key is missing the integration reports
 * configured:false plus the exact steps to enable it. When a key exists we make a
 * real, cheap network call so "enabled" means "it actually answered".
 */
import fs from 'node:fs';
import { getSetting } from '../db.js';

const mask = (v) => {
  const s = String(v || '');
  if (!s) return null;
  return s.length <= 8 ? '••••' : `${s.slice(0, 4)}…${s.slice(-4)}`;
};

export const integrations = () => {
  const aiKey = process.env.AI_API_KEY || process.env.OPENAI_API_KEY || '';
  const cseKey = process.env.GOOGLE_CSE_KEY || '';
  const cseCx = process.env.GOOGLE_CSE_CX || '';
  const googleClient = process.env.GOOGLE_CLIENT_ID || getSetting('google_client_id', '') || '';
  const aiBase = (process.env.AI_BASE_URL || 'https://api.openai.com/v1').replace(/\/+$/, '');
  return {
    google_signin: {
      configured: Boolean(googleClient),
      key: mask(googleClient),
      env: ['GOOGLE_CLIENT_ID'],
      purpose_ar: 'تسجيل الدخول بحساب Google (Google Identity Services + /api/auth/google).',
      purpose_en: 'Sign in with Google (Google Identity Services + /api/auth/google).',
      steps_ar: [
        'افتح console.cloud.google.com ← APIs & Services ← Credentials.',
        'Create credentials ← OAuth client ID ← نوع Web application.',
        'Authorized JavaScript origins: https://نطاق-التطبيق و http://localhost:4000.',
        'انسخ Client ID إلى .env ثم أعد تشغيل الخادم.',
      ],
      steps_en: [
        'console.cloud.google.com → APIs & Services → Credentials.',
        'Create credentials → OAuth client ID → Web application.',
        'Authorized JavaScript origins: your app domain and http://localhost:4000.',
        'Copy the Client ID into .env and restart the server.',
      ],
      test: 'google',
    },
    ai: {
      configured: Boolean(aiKey),
      key: mask(aiKey),
      base_url: aiBase,
      model: process.env.AI_MODEL || 'gpt-4o-mini',
      vision_model: process.env.AI_VISION_MODEL || process.env.AI_MODEL || 'gpt-4o-mini',
      env: ['AI_API_KEY', 'AI_BASE_URL', 'AI_MODEL', 'AI_VISION_MODEL'],
      purpose_ar: 'قراءة صور الوصفات والتعرّف على علب الأدوية من الصور، مع إجابات المعالج الذكي.',
      purpose_en: 'Read prescription photos, recognise medicine packs, and power the AI assistant.',
      steps_ar: [
        'أي مزوّد متوافق مع واجهة OpenAI (OpenAI، Groq، OpenRouter، Together، DeepSeek…).',
        'ضع AI_API_KEY في .env، و AI_BASE_URL إن لم يكن api.openai.com/v1.',
        'اختر موديلًا يدعم الصور لـ AI_VISION_MODEL (مثل gpt-4o-mini أو llava عبر OpenRouter).',
        'أعد تشغيل الخادم ثم اضغط «اختبار» هنا.',
      ],
      steps_en: [
        'Any OpenAI-compatible provider (OpenAI, Groq, OpenRouter, Together, DeepSeek…).',
        'Set AI_API_KEY in .env; set AI_BASE_URL when not api.openai.com/v1.',
        'Pick a vision-capable model for AI_VISION_MODEL (e.g. gpt-4o-mini).',
        'Restart the server, then press "Test" here.',
      ],
      test: 'ai',
    },
    google_cse: {
      configured: Boolean(cseKey && cseCx),
      key: mask(cseKey),
      cx: mask(cseCx),
      env: ['GOOGLE_CSE_KEY', 'GOOGLE_CSE_CX'],
      purpose_ar: 'جلب صور المنتجات تلقائيًا من بحث Google للصور.',
      purpose_en: 'Fetch product photos automatically from Google image search.',
      steps_ar: [
        'programmablesearchengine.google.com ← Add search engine ← فعّل "Image search".',
        'console.cloud.google.com ← Enable "Custom Search API" ← Create API key.',
        'ضع Key و CX في .env ثم استخدم زر «جلب الصور» في صفحة الاستيراد والصور أو npm run images:fetch.',
      ],
      steps_en: [
        'programmablesearchengine.google.com → Add search engine → enable "Image search".',
        'console.cloud.google.com → enable "Custom Search API" → create an API key.',
        'Put Key and CX in .env, then use "Fetch images" in admin → Media, or npm run images:fetch.',
      ],
      test: 'cse',
    },
    barcode: {
      configured: true,
      mode: 'internal-ean13',
      purpose_ar: 'كل منتج لديه باركود EAN-13 داخلي صالح (بادئة 20–29) قابل للمسح، ويُستبدل بباركود الشركة عند توفره.',
      purpose_en: 'Every product has a scannable internal EAN-13 (prefix 20–29), replaced by the printed code when known.',
      steps_ar: ['لتحديث جماعي: npm run barcodes -- --all', 'لباركود حقيقي: عدّل المنتج من لوحة التحكم وأدخل رقم العلبة ثم فعّل «موثّق».'],
      steps_en: ['Bulk regenerate: npm run barcodes -- --all', 'For a real code: edit the product in the dashboard, paste the printed number, mark it verified.'],
    },
  };
};

export const RUNNING_HINT = 'أعد تشغيل الخادم بعد تعديل .env (pm2 restart / systemctl restart / Ctrl+C ثم npm start).';

function providerModels(base) {
  const b = base.replace(/\/+$/, '');
  return b.endsWith('/v1') ? `${b}/models` : `${b}/v1/models`;
}

/** Real connectivity test for one integration. Never throws. */
export async function testIntegration(target) {
  const started = Date.now();
  const done = (ok, detail, extra = {}) => ({ ok, target, ms: Date.now() - started, detail, ...extra });

  if (target === 'google') {
    if (!process.env.GOOGLE_CLIENT_ID) return done(false, 'GOOGLE_CLIENT_ID غير مضبوط — Google Sign-In معطّل (تسجيل البريد وكلمة المرور يعمل).');
    try {
      const r = await fetch(`https://oauth2.googleapis.com/tokeninfo?access_token=x&id_token=x`, { signal: AbortSignal.timeout(8000) });
      // Any HTTP answer proves the identity service is reachable; 400 is expected for a dummy token.
      return done(r.status < 500, r.status < 500
        ? `خدمة Google Identity متاحة (HTTP ${r.status}) و GOOGLE_CLIENT_ID مضبوط — اكتمل الإعداد.`
        : `خدمة Google Identity أعادت HTTP ${r.status}.`);
    } catch (e) {
      return done(false, `تعذر الوصول إلى Google (${e.message}). تحقق من الشبكة/الجدار الناري على الخادم.`);
    }
  }

  if (target === 'ai') {
    const key = process.env.AI_API_KEY || process.env.OPENAI_API_KEY;
    if (!key) return done(false, 'AI_API_KEY غير مضبوط — تحليل صور الوصفات يعمل يدويًا فقط.');
    const url = providerModels(process.env.AI_BASE_URL || 'https://api.openai.com/v1');
    try {
      const r = await fetch(url, { headers: { Authorization: `Bearer ${key}` }, signal: AbortSignal.timeout(12000) });
      if (!r.ok) {
        const body = await r.text().catch(() => '');
        return done(false, `المزوّد رفض المفتاح (HTTP ${r.status}): ${body.slice(0, 180) || 'بدون تفاصيل'}`);
      }
      const data = await r.json().catch(() => ({}));
      const ids = (data.data || []).map((m) => m.id);
      const vision = process.env.AI_VISION_MODEL || process.env.AI_MODEL || 'gpt-4o-mini';
      const hasVision = !ids.length || ids.some((id) => id === vision || /vision|4o|llava|gemini|claude-3/i.test(id));
      return done(true, `المزوّد متاح — ${ids.length} موديل. الموديل الحالي: ${vision}${hasVision ? '' : ' (تحقق أنه يدعم الصور)'}`, { models: ids.slice(0, 12) });
    } catch (e) {
      return done(false, `تعذر الوصول إلى ${url} (${e.message}).`);
    }
  }

  if (target === 'cse') {
    const key = process.env.GOOGLE_CSE_KEY;
    const cx = process.env.GOOGLE_CSE_CX;
    if (!key || !cx) return done(false, 'GOOGLE_CSE_KEY / GOOGLE_CSE_CX غير مضبوطين — جلب الصور التلقائي معطّل (الرفع اليدوي يعمل).');
    try {
      const url = `https://www.googleapis.com/customsearch/v1?key=${key}&cx=${cx}&searchType=image&num=1&q=panadol+box`;
      const r = await fetch(url, { signal: AbortSignal.timeout(10000) });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) return done(false, `Google CSE: ${data?.error?.message || `HTTP ${r.status}`}`);
      return done(true, `Google CSE يعمل — ${data.searchInformation?.totalResults || 0} نتيجة لاستعلام تجريبي.`);
    } catch (e) {
      return done(false, `تعذر الوصول إلى Google CSE (${e.message}).`);
    }
  }

  return done(false, 'هدف اختبار غير معروف');
}

/** Existence of the bundled photo folder — helps the media page explain where images come from. */
export const bundledImages = () => {
  const dir = process.env.PUBLIC_IMAGE_DIR || 'public/seed-images/products';
  try { return fs.readdirSync(dir).filter((f) => /\.(jpe?g|png|webp)$/i.test(f)).length; } catch { return 0; }
};
