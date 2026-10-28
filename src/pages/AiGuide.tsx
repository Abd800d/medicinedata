/*
 * «دليل ربط الذكاء الاصطناعي» — كل خطوة برابطها، داخل التطبيق.
 *
 * السبب: التعليمات كانت موزّعة بين هذا الملف وذاك، وروابط إنشاء المفاتيح لا تُفتح من
 * WebView (window.open يُهمَل)، والمستخدم على الهاتف لا يستطيع فتح طرفية. هنا:
 *   • حالة حقيقية من /api/ai/status (هل هو مفعّل؟ أي مزوّد؟ أي موديل؟)،
 *   • خطوات مرقّمة يُعلَّم المنجَز منها تلقائيًا،
 *   • كل رابط مطلوب ظاهر بنصّه مع زر فتح وزر نسخ،
 *   • أوامر جاهزة للنسخ (.env و curl) لمن يفضّل الخادم.
 *
 * الروابط الخارجية تُفتح عبر openExternal (Custom Tabs على أندرويد) لا <a target=_blank>،
 * لأن الأخير لا يعمل داخل Capacitor — وهو سبب سابق لـ«الزر لا يفعل شيئًا».
 */
import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowLeft, BookOpen, Bot, CheckCircle2, CircleDashed, Cloud, Code2, Copy, ExternalLink,
  KeyRound, LifeBuoy, Loader2, ScrollText, Server, Sparkles, Terminal, TriangleAlert, XCircle,
} from 'lucide-react';
import { useApi } from '../lib/useApi';
import { useConfig } from '../lib/config';
import { useI18n } from '../lib/i18n';
import { useToast } from '../components/ui';
import { describeApiBase, apiUrl } from '../lib/api';
import { openExternal } from '../lib/external';
import { copyText } from '../lib/utils';

type AiStatus = {
  enabled?: boolean;
  provider?: string;
  model?: string | null;
  vision_model?: string | null;
  hint_ar?: string | null;
  hint_en?: string | null;
  features?: Record<string, boolean>;
};

type LinkRow = { label: string; url: string; note?: string; external: boolean };

const GROQ_KEYS = 'https://console.groq.com/keys';
const GEMINI_KEYS = 'https://aistudio.google.com/apikey';
const OPENROUTER_KEYS = 'https://openrouter.ai/keys';
const OLLAMA = 'https://ollama.com/download';
const RENDER_DEPLOY = 'https://render.com/deploy?repo=https://github.com/Abd800d/medicinedata';
const RENDER_DASH = 'https://dashboard.render.com/';
const REPO = 'https://github.com/Abd800d/medicinedata';
const LATEST_APK = `${REPO}/releases/latest`;
const DOC_AI = `${REPO}/blob/main/docs/AI.md`;
const DOC_FIX = `${REPO}/blob/main/docs/TROUBLESHOOTING.md`;
const DOC_SETUP = `${REPO}/blob/main/docs/AI-SETUP-AR.md`;

export default function AiGuide() {
  const { lang } = useI18n();
  const ar = lang === 'ar';
  const { push } = useToast();
  const { config } = useConfig();
  const { data, loading, reload } = useApi<AiStatus>('/api/ai/status', undefined, { ttl: 0 });

  const enabled = Boolean(data?.enabled);
  const base = useMemo(() => describeApiBase(), []);
  const statusUrl = useMemo(() => apiUrl('/api/ai/status'), []);
  const whatsapp = String(config?.whatsapp || '').replace(/[^\d]/g, '');

  const copy = async (text: string, label = 'نُسخ') => {
    const ok = await copyText(text);
    push(ok ? label : 'تعذّر النسخ', ok ? 'success' : 'error');
  };

  const open = async (url: string) => {
    const ok = await openExternal(url);
    if (!ok) push(ar ? 'تعذّر فتح الرابط' : 'Could not open the link', 'error');
  };

  const envSnippet = `JWT_SECRET=${'<96 حرفًا عشوائيًا>'}\nAI_PROVIDER=groq\nAI_API_KEY=gsk_xxxxxxxxxxxxxxxxxxxx\nAI_MODEL=openai/gpt-oss-120b\nAI_VISION_MODEL=meta-llama/llama-4-scout-17b-16e-instruct`;
  const curlSnippet = `curl -s ${statusUrl}\ncurl -s -X POST ${apiUrl('/api/admin/ai/test')} \\\n  -H "authorization: Bearer <TOKEN>" -H 'content-type: application/json' -d '{}'`;

  const steps = [
    {
      title: ar ? '١ · تأكد أن التطبيق متصل بخادم' : '1 · Make sure the app has a server',
      done: Boolean(base.base) || base.source === 'same-origin',
      body: ar
        ? 'الذكاء الاصطناعي يعمل على الخادم لا داخل الهاتف. بلا خادم لن يعمل أي مفتاح.'
        : 'AI runs on the server, never inside the phone. Without a server no key can work.',
      actions: (
        <>
          <Link to="/server" className="btn-soft px-2.5 py-1.5 text-[10.5px]"><Server className="h-3 w-3" />{ar ? 'الخادم والاتصال' : 'Server & connection'}</Link>
          <button onClick={() => void open(RENDER_DEPLOY)} className="btn-ghost px-2.5 py-1.5 text-[10.5px]"><Cloud className="h-3 w-3" />{ar ? 'نشر مجاني على Render' : 'Deploy on Render'}</button>
        </>
      ),
    },
    {
      title: ar ? '٢ · أنشئ مفتاحًا مجانيًا' : '2 · Create a free key',
      done: enabled,
      body: ar
        ? 'Groq أو Google Gemini — كلاهما بلا بطاقة بنكية. المفتاح يبقى على الخادم مشفّرًا ولا يظهر في الهاتف.'
        : 'Groq or Google Gemini — both without a card. The key stays encrypted on the server and is never shown on the phone.',
      actions: (
        <>
          <button onClick={() => void open(GROQ_KEYS)} className="btn-primary px-2.5 py-1.5 text-[10.5px]"><KeyRound className="h-3 w-3" />Groq · console.groq.com/keys</button>
          <button onClick={() => void open(GEMINI_KEYS)} className="btn-soft px-2.5 py-1.5 text-[10.5px]"><KeyRound className="h-3 w-3" />Gemini · aistudio.google.com/apikey</button>
        </>
      ),
    },
    {
      title: ar ? '٣ · الصق المفتاح في شاشة التفعيل' : '3 · Paste the key in the admin screen',
      done: enabled,
      body: ar
        ? 'الإدارة ← جودة التحليل ← اختر المزوّد ← الصق المفتاح ← حفظ. تحتاج حساب مدير.'
        : 'Admin → AI quality → pick a provider → paste the key → save. Requires an admin account.',
      actions: (
        <Link to="/admin?tab=ai" className="btn-primary px-2.5 py-1.5 text-[10.5px]"><Sparkles className="h-3 w-3" />{ar ? 'افتح التفعيل' : 'Open AI settings'}</Link>
      ),
    },
    {
      title: ar ? '٤ · اضغط «اختبار حقيقي للمفتاح»' : '4 · Run the real self-test',
      done: enabled,
      body: ar
        ? 'الاختبار يستدعي المزوّد فعلًا ويعيد الزمن بالمللي ثانية، أو السبب الحقيقي: مفتاح خاطئ / موديل غير متاح / حصة مستهلكة / شبكة.'
        : 'The test calls the provider for real and returns the latency, or the true cause: bad key / model gone / quota / network.',
      actions: (
        <Link to="/admin?tab=ai" className="btn-soft px-2.5 py-1.5 text-[10.5px]"><Sparkles className="h-3 w-3" />{ar ? 'شاشة الاختبار' : 'Test screen'}</Link>
      ),
    },
    {
      title: ar ? '٥ · جرّبه من ثلاثة أماكن' : '5 · Try it in three places',
      done: false,
      body: ar
        ? 'المساعد الذكي (سؤال) · الوصفات (صورة وصفة) · المسح (صورة علبة). كل تحليل يمرّ على مراجعة الصيدلي ولا يُعتمد آليًا.'
        : 'Assistant (questions) · Prescriptions (photo) · Scan (pack photo). Every analysis goes through pharmacist review; nothing is auto-approved.',
      actions: (
        <>
          <Link to="/ai" className="btn-soft px-2.5 py-1.5 text-[10.5px]"><Bot className="h-3 w-3" />{ar ? 'المساعد' : 'Assistant'}</Link>
          <Link to="/prescriptions" className="btn-soft px-2.5 py-1.5 text-[10.5px]"><ScrollText className="h-3 w-3" />{ar ? 'الوصفات' : 'Prescriptions'}</Link>
          <Link to="/scan" className="btn-soft px-2.5 py-1.5 text-[10.5px]"><Sparkles className="h-3 w-3" />{ar ? 'المسح' : 'Scan'}</Link>
        </>
      ),
    },
  ];

  const links: LinkRow[] = [
    { label: ar ? 'شاشة التفعيل داخل التطبيق' : 'In-app activation screen', url: '/admin?tab=ai', external: false, note: ar ? 'الإدارة ← جودة التحليل' : 'Admin → AI quality' },
    { label: ar ? 'مفاتيح Groq (مجاني)' : 'Groq keys (free)', url: GROQ_KEYS, external: true, note: 'gsk_…' },
    { label: ar ? 'مفاتيح Google Gemini (مجاني)' : 'Google Gemini keys (free)', url: GEMINI_KEYS, external: true, note: 'AIza…' },
    { label: ar ? 'حدود الاستخدام المجانية على Groq' : 'Groq free-tier limits', url: 'https://console.groq.com/docs/rate-limits', external: true },
    { label: ar ? 'قائمة موديلات Gemini الحالية' : 'Current Gemini models', url: 'https://ai.google.dev/gemini-api/docs/models', external: true, note: 'gemini-3.6-flash' },
    { label: ar ? 'بديل: OpenRouter' : 'Alternative: OpenRouter', url: OPENROUTER_KEYS, external: true },
    { label: ar ? 'بديل: Ollama محلي بلا إنترنت' : 'Alternative: local Ollama', url: OLLAMA, external: true, note: 'http://127.0.0.1:11434/v1' },
    { label: ar ? 'نشر خادمك على Render (مجاني)' : 'Deploy your own server (Render)', url: RENDER_DEPLOY, external: true },
    { label: ar ? 'لوحة Render — متغيّرات البيئة' : 'Render dashboard — env vars', url: RENDER_DASH, external: true, note: 'JWT_SECRET · AI_API_KEY' },
    { label: ar ? 'أحدث إصدار APK' : 'Latest APK', url: LATEST_APK, external: true },
    { label: ar ? 'حالة الذكاء الاصطناعي على الخادم (JSON)' : 'AI status on the server (JSON)', url: statusUrl, external: true, note: statusUrl },
    { label: ar ? 'وثيقة الذكاء الاصطناعي الكاملة' : 'Full AI documentation', url: DOC_AI, external: true, note: 'docs/AI.md' },
    { label: ar ? 'هذا الدليل على GitHub' : 'This guide on GitHub', url: DOC_SETUP, external: true, note: 'docs/AI-SETUP-AR.md' },
    { label: ar ? 'أعطال التشغيل وحلولها' : 'Troubleshooting', url: DOC_FIX, external: true, note: 'docs/TROUBLESHOOTING.md' },
    { label: ar ? 'مستودع المشروع' : 'Project repository', url: REPO, external: true },
  ];

  const errors = [
    { kind: 'no-key', ar: 'لا مفتاح', fix: ar ? 'الصق المفتاح واحفظ' : 'Paste a key and save' },
    { kind: 'auth', ar: 'المفتاح غير صحيح أو منتهٍ', fix: ar ? 'أنشئ مفتاحًا جديدًا' : 'Create a new key' },
    { kind: 'model', ar: 'الموديل مسحوب من المزوّد', fix: ar ? 'اضغط «استخدم البديل الآن»' : 'Tap “use the replacement”' },
    { kind: 'quota', ar: 'الحصة المجانية انتهت مؤقتًا', fix: ar ? 'انتظر دقيقة أو مزوّدًا آخر' : 'Wait a minute or switch provider' },
    { kind: 'network', ar: 'الخادم لا يصل للمزوّد', fix: ar ? 'جرّب مزوّدًا آخر' : 'Try another provider' },
    { kind: 'NO_SECRET', ar: 'الخادم بلا JWT_SECRET', fix: ar ? 'حدّث إلى 1.10.2+ أو اضبط JWT_SECRET' : 'Update to 1.10.2+ or set JWT_SECRET' },
  ];

  return (
    <div className="space-y-4">
      {/* hero + live status */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-violet-600 to-fuchsia-600 p-5 text-white">
        <div className="absolute -end-10 -top-12 h-40 w-40 rounded-full bg-white/10" />
        <div className="relative flex items-start gap-2.5">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-white/20"><Bot className="h-5 w-5" /></span>
          <div className="min-w-0 flex-1">
            <h1 className="text-[17px] font-extrabold">{ar ? 'دليل ربط الذكاء الاصطناعي' : 'Connect the AI — step by step'}</h1>
            <p className="mt-0.5 text-[11px] leading-5 text-white/80">
              {ar ? 'كل خطوة برابطها. المفتاح يبقى على الخادم ولا يدخل الهاتف أبدًا.' : 'Every step with its link. The key stays on the server, never in the phone.'}
            </p>
          </div>
        </div>

        <div className="relative mt-3 rounded-2xl bg-black/20 p-3">
          {loading && !data ? (
            <div className="flex items-center gap-2 text-[11.5px] text-white/80"><Loader2 className="h-3.5 w-3.5 animate-spin" />{ar ? 'جارٍ قراءة الحالة…' : 'Reading status…'}</div>
          ) : (
            <>
              <div className="flex items-center gap-2 text-[12px] font-extrabold">
                {enabled ? <CheckCircle2 className="h-4 w-4 text-emerald-300" /> : <XCircle className="h-4 w-4 text-amber-300" />}
                {enabled ? (ar ? 'الذكاء الاصطناعي مفعّل الآن' : 'AI is enabled right now') : (ar ? 'غير مفعّل بعد' : 'Not enabled yet')}
              </div>
              <div className="mt-1 grid grid-cols-2 gap-1.5 text-[10px] text-white/75">
                <div>{ar ? 'المزوّد' : 'Provider'} <span className="font-mono text-white" dir="ltr">{data?.provider || '—'}</span></div>
                <div className="truncate">{ar ? 'الموديل' : 'Model'} <span className="font-mono text-white" dir="ltr">{data?.model || '—'}</span></div>
                <div className="col-span-2 truncate">{ar ? 'الخادم' : 'Server'} <span className="font-mono" dir="ltr">{base.base || (ar ? 'نفس الأصل' : 'same origin')}</span> <span className="text-white/50">({base.source})</span></div>
              </div>
              {!enabled && (data?.hint_ar || data?.hint_en) && (
                <p className="mt-1.5 text-[10.5px] leading-5 text-white/70">{ar ? data?.hint_ar : data?.hint_en}</p>
              )}
            </>
          )}
          <button onClick={() => void reload()} className="mt-2 rounded-lg bg-white/15 px-2 py-1 text-[10px] font-bold">
            {ar ? 'إعادة القراءة' : 'Refresh'}
          </button>
        </div>
      </div>

      {/* steps */}
      <div className="space-y-2">
        {steps.map((s) => (
          <div key={s.title} className="card p-3">
            <div className="flex items-start gap-2">
              {s.done
                ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" />
                : <CircleDashed className="mt-0.5 h-4 w-4 shrink-0 text-ink-500" />}
              <div className="min-w-0 flex-1">
                <div className="text-[12px] font-extrabold text-white">{s.title}</div>
                <p className="mt-0.5 text-[10.5px] leading-5 text-ink-300">{s.body}</p>
                <div className="mt-1.5 flex flex-wrap gap-1.5">{s.actions}</div>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* every link, visible and copyable */}
      <div className="card overflow-hidden">
        <div className="flex items-center gap-1.5 border-b border-white/[.06] px-3.5 py-2.5 text-[11px] font-bold text-ink-300">
          <ExternalLink className="h-3.5 w-3.5" />{ar ? 'كل الروابط في مكان واحد' : 'Every link in one place'}
        </div>
        <div className="divide-y divide-white/[.04]">
          {links.map((l) => (
            <div key={l.url + l.label} className="flex items-center gap-2 px-3 py-2">
              <div className="min-w-0 flex-1">
                <div className="truncate text-[11px] font-bold text-white">{l.label}</div>
                <div className="truncate font-mono text-[9.5px] text-ink-500" dir="ltr">{l.url}</div>
                {l.note && <div className="truncate text-[9.5px] text-brand-300/80" dir="ltr">{l.note}</div>}
              </div>
              {l.external ? (
                <button onClick={() => void open(l.url)} className="btn-ghost shrink-0 px-2 py-1 text-[10px]" aria-label={ar ? 'فتح' : 'Open'}>
                  <ExternalLink className="h-3 w-3" />
                </button>
              ) : (
                <Link to={l.url} className="btn-ghost shrink-0 px-2 py-1 text-[10px]"><ArrowLeft className="h-3 w-3" /></Link>
              )}
              <button onClick={() => void copy(l.url)} className="btn-ghost shrink-0 px-2 py-1 text-[10px]" aria-label={ar ? 'نسخ' : 'Copy'}>
                <Copy className="h-3 w-3" />
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* server-side alternative */}
      <div className="card space-y-2 p-3.5">
        <div className="flex items-center gap-1.5 text-[11.5px] font-extrabold text-white"><Terminal className="h-3.5 w-3.5 text-brand-300" />{ar ? 'الطريقة الثانية: من الخادم (.env)' : 'Option 2: from the server (.env)'}</div>
        <p className="text-[10.5px] leading-5 text-ink-300">
          {ar ? 'إن كنت تفضل الملف: انسخ الأسطر إلى .env ثم أعد تشغيل الخادم. ما تحفظه من التطبيق يتقدّم على هذه القيم.'
            : 'Prefer the file? Copy these lines into .env and restart. Values saved from the app win over these.'}
        </p>
        <div className="relative rounded-xl bg-black/30 p-2">
          <pre className="overflow-x-auto text-[10px] leading-5 text-ink-300" dir="ltr">{envSnippet}</pre>
          <button onClick={() => void copy(envSnippet)} className="btn-ghost absolute end-1.5 top-1.5 px-2 py-1 text-[10px]"><Copy className="h-3 w-3" /></button>
        </div>
        <div className="relative rounded-xl bg-black/30 p-2">
          <pre className="overflow-x-auto text-[10px] leading-5 text-ink-300" dir="ltr">{curlSnippet}</pre>
          <button onClick={() => void copy(curlSnippet)} className="btn-ghost absolute end-1.5 top-1.5 px-2 py-1 text-[10px]"><Copy className="h-3 w-3" /></button>
        </div>
        <a href={DOC_AI} onClick={(e) => { e.preventDefault(); void open(DOC_AI); }} className="inline-flex items-center gap-1 text-[10.5px] font-bold text-brand-300">
          <BookOpen className="h-3 w-3" />{ar ? 'الشرح الكامل على GitHub' : 'Full explanation on GitHub'}
        </a>
      </div>

      {/* error table */}
      <div className="card overflow-hidden">
        <div className="flex items-center gap-1.5 border-b border-white/[.06] px-3.5 py-2.5 text-[11px] font-bold text-ink-300">
          <TriangleAlert className="h-3.5 w-3.5 text-amber-300" />{ar ? 'إن فشل الاختبار: الرسالة ومعناها' : 'If the test fails: message and meaning'}
        </div>
        <div className="divide-y divide-white/[.04]">
          {errors.map((e) => (
            <div key={e.kind} className="flex items-start gap-2 px-3 py-2 text-[10.5px]">
              <code className="shrink-0 rounded bg-black/25 px-1 py-0.5 font-mono text-[9.5px] text-amber-200" dir="ltr">{e.kind}</code>
              <div className="min-w-0 flex-1">
                <div className="text-ink-200">{e.ar}</div>
                <div className="text-ink-500">{e.fix}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* support */}
      <div className="card space-y-2 p-3.5">
        <div className="flex items-center gap-1.5 text-[11.5px] font-extrabold text-white"><LifeBuoy className="h-3.5 w-3.5 text-emerald-300" />{ar ? 'لم ينجح شيء؟' : 'Nothing worked?'}</div>
        <p className="text-[10.5px] leading-5 text-ink-300">
          {ar ? 'أرسل آخر صورة من شاشة الاختبار (نوع الخطأ وحده يكفي) على واتساب، أو افتح دليل الأعطال.'
            : 'Send the test result (the error kind is enough) on WhatsApp, or open the troubleshooting guide.'}
        </p>
        <div className="flex flex-wrap gap-1.5">
          {whatsapp && (
            <button onClick={() => void open(`https://wa.me/${whatsapp}`)} className="btn-soft px-2.5 py-1.5 text-[10.5px]"><LifeBuoy className="h-3 w-3" />WhatsApp</button>
          )}
          <button onClick={() => void open(DOC_FIX)} className="btn-ghost px-2.5 py-1.5 text-[10.5px]"><Code2 className="h-3 w-3" />{ar ? 'دليل الأعطال' : 'Troubleshooting'}</button>
        </div>
      </div>
    </div>
  );
}
