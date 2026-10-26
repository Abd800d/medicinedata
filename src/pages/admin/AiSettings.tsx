/*
 * الإدارة ← الذكاء الاصطناعي: تفعيل التحليل من داخل التطبيق.
 *
 * قبل v1.8.1 كان تفعيل الذكاء الاصطناعي يحتاج تعديل .env على الخادم وإعادة تشغيله —
 * وهو مستحيل من الهاتف، ولهذا ظهر للتطبيق أنه «لا يعمل». هنا:
 *   • اختيار مزوّد جاهز (Groq/Gemini مجانيان) فيملأ العنوان والموديلات تلقائيًا،
 *   • لصق المفتاح (يُخزَّن مشفّرًا على الخادم ولا يُعاد أبدًا)،
 *   • اختبار حقيقي يخبرك بالسبب بالضبط: مفتاح خاطئ، موديل غير متاح، حصة، شبكة…
 *   • دليل خطوة بخطوة مع روابط إنشاء المفتاح ونشر الخادم.
 */
import { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle, Bot, CheckCircle2, ChevronDown, CircleDollarSign, Copy, ExternalLink, Eye, EyeOff,
  KeyRound, Loader2, RefreshCw, Save, Server, Sparkles, XCircle,
} from 'lucide-react';
import { api } from '../../lib/api';
import { useToast } from '../../components/ui';
import { cx } from '../../lib/utils';

type Preset = {
  label: string; label_en: string; base: string; model: string; vision: string;
  free: boolean; keys_url: string;
};

type AiView = {
  provider: string;
  base_url: string;
  base_is_custom: boolean;
  model: string;
  vision_model: string;
  configured: boolean;
  has_key: boolean;
  key_hint: string | null;
  key_source: 'database' | 'environment' | 'none';
  can_store: boolean;
  updated_at: string | null;
  updated_by: string | null;
  presets: Record<string, Preset>;
};

type TestResult = {
  ok: boolean; kind?: string; latency_ms?: number; provider?: string; model?: string;
  sample?: string; error?: string; hint_ar?: string; hint_en?: string; status?: number;
};

const DEPLOY_URL = 'https://render.com/deploy?repo=https://github.com/Abd800d/medicinedata';

export default function AiSettings() {
  const { push } = useToast();
  const [view, setView] = useState<AiView | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [result, setResult] = useState<TestResult | null>(null);
  const [error, setError] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [showGuide, setShowGuide] = useState(false);

  const [provider, setProvider] = useState('groq');
  const [key, setKey] = useState('');
  const [baseUrl, setBaseUrl] = useState('');
  const [model, setModel] = useState('');
  const [vision, setVision] = useState('');

  const load = async () => {
    setLoading(true);
    try {
      const v = await api.get<AiView>('/api/admin/ai');
      setView(v);
      setProvider(v.provider);
      setBaseUrl(v.base_url);
      setModel(v.model);
      setVision(v.vision_model);
      setKey('');
    } catch (e: any) {
      setError(e?.message || 'تعذّر تحميل الإعدادات');
    } finally { setLoading(false); }
  };

  useEffect(() => { void load(); /* eslint-disable-next-line */ }, []);

  const preset = view?.presets?.[provider];
  const presets = useMemo(() => Object.entries(view?.presets || {}), [view]);

  /* Choosing a provider fills the fields from its preset (still editable). */
  const pickProvider = (id: string) => {
    setProvider(id);
    const p = view?.presets?.[id];
    if (p) { setBaseUrl(p.base); setModel(p.model); setVision(p.vision); }
    setResult(null);
  };

  const save = async (extra: Record<string, unknown> = {}) => {
    setSaving(true); setError(''); setResult(null);
    try {
      const payload: Record<string, unknown> = {
        provider, base_url: baseUrl, model, vision_model: vision, ...extra,
      };
      if (key.trim()) payload.api_key = key.trim();
      const v = await api.put<AiView>('/api/admin/ai', payload);
      setView(v);
      setKey('');
      push(v.configured ? 'حُفظت الإعدادات — الذكاء الاصطناعي مفعّل' : 'حُفظت، لكن المفتاح ناقص', v.configured ? 'success' : 'error');
      return v;
    } catch (e: any) {
      setError(e?.message || 'تعذر الحفظ');
      return null;
    } finally { setSaving(false); }
  };

  const test = async () => {
    setTesting(true); setResult(null);
    try {
      /* Test exactly what is on screen: save first when the key field is filled. */
      if (key.trim()) await save();
      const r = await api.post<TestResult>('/api/admin/ai/test', {});
      setResult(r);
      push(r.ok ? `المزوّد استجاب في ${r.latency_ms} مللي ثانية` : 'الاختبار فشل — انظر السبب أدناه', r.ok ? 'success' : 'error');
      await load();
    } catch (e: any) {
      setResult({ ok: false, kind: 'client', error: e?.message || 'تعذر الاختبار' });
    } finally { setTesting(false); }
  };

  const clearKey = async () => {
    setSaving(true);
    try {
      const v = await api.put<AiView>('/api/admin/ai', { clear_key: true });
      setView(v); setResult(null);
      push('حُذف المفتاح من الخادم');
    } catch (e: any) {
      push(e?.message || 'تعذر الحذف', 'error');
    } finally { setSaving(false); }
  };

  const copy = async (text: string) => {
    try { await navigator.clipboard.writeText(text); push('نُسخ', 'success'); } catch { push('تعذّر النسخ', 'error'); }
  };

  if (loading) {
    return <div className="card flex items-center justify-center p-8"><Loader2 className="h-5 w-5 animate-spin text-brand-300" /></div>;
  }

  return (
    <section className="card overflow-hidden">
      <div className="flex items-center gap-2.5 bg-gradient-to-r from-violet-600 to-fuchsia-600 p-3.5 text-white">
        <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/20"><Bot className="h-4.5 w-4.5" /></span>
        <div className="min-w-0 flex-1">
          <div className="truncate text-[12.5px] font-extrabold">الذكاء الاصطناعي — التفعيل من الهاتف</div>
          <div className="truncate text-[10.5px] text-white/75">مزوّد + مفتاح + اختبار حقيقي، دون تعديل ملفات الخادم</div>
        </div>
        <span className={cx('flex shrink-0 items-center gap-1 rounded-full px-2 py-1 text-[10px] font-bold',
          view?.configured ? 'bg-white/20' : 'bg-black/25')}>
          {view?.configured ? <CheckCircle2 className="h-3 w-3" /> : <AlertTriangle className="h-3 w-3" />}
          {view?.configured ? 'مُفعّل' : 'غير مُفعّل'}
        </span>
      </div>

      <div className="space-y-3 p-3.5">
        {view && (
          <div className="grid grid-cols-2 gap-1.5 text-[10px] sm:grid-cols-4">
            <div className="rounded-lg bg-white/[.05] p-2"><div className="text-ink-500">المزوّد</div><div className="font-mono text-brand-200">{view.provider}</div></div>
            <div className="rounded-lg bg-white/[.05] p-2"><div className="text-ink-500">الموديل</div><div className="truncate font-mono text-brand-200" dir="ltr">{view.model || '—'}</div></div>
            <div className="rounded-lg bg-white/[.05] p-2"><div className="text-ink-500">المفتاح</div><div className="font-mono text-brand-200" dir="ltr">{view.key_hint || '—'}</div></div>
            <div className="rounded-lg bg-white/[.05] p-2"><div className="text-ink-500">المصدر</div>
              <div className="text-brand-200">{view.key_source === 'database' ? 'من التطبيق' : view.key_source === 'environment' ? 'متغيّرات الخادم' : 'لا يوجد'}</div></div>
          </div>
        )}

        {view && !view.can_store && (
          <div className="flex items-start gap-2 rounded-xl border border-amber-400/25 bg-amber-500/10 p-2.5 text-[10.5px] leading-5 text-amber-200">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span>الخادم بلا <code className="rounded bg-black/20 px-1">JWT_SECRET</code> — لا يمكن تشفير المفتاح. أضف المتغيّر على الخادم مرة واحدة.</span>
          </div>
        )}

        {/* provider chips */}
        <div>
          <div className="mb-1.5 text-[10.5px] font-bold text-ink-400">المزوّد</div>
          <div className="flex flex-wrap gap-1.5">
            {presets.map(([id, p]) => (
              <button key={id} onClick={() => pickProvider(id)}
                className={cx('rounded-xl border px-2.5 py-1.5 text-[10.5px] font-bold transition',
                  provider === id ? 'border-brand-400/50 bg-brand-500/20 text-brand-100' : 'border-white/[.07] bg-white/[.03] text-ink-300 hover:border-brand-400/30')}>
                {p.label}
                {p.free && <CircleDollarSign className="ms-1 inline h-3 w-3 text-emerald-300" />}
              </button>
            ))}
          </div>
          {preset?.keys_url && (
            <a href={preset.keys_url} target="_blank" rel="noreferrer"
              className="mt-1.5 inline-flex items-center gap-1 text-[10.5px] font-bold text-brand-300 hover:underline">
              <ExternalLink className="h-3 w-3" /> أنشئ مفتاحًا من {preset.label}
            </a>
          )}
        </div>

        {/* key + models */}
        <div className="grid gap-2 sm:grid-cols-2">
          <label className="block sm:col-span-2">
            <span className="mb-1 block text-[10.5px] font-bold text-ink-400">
              مفتاح API {view?.has_key ? <span className="text-emerald-300">(محفوظ — اتركه فارغًا لعدم تغييره)</span> : ''}
            </span>
            <div className="flex gap-1.5">
              <div className="relative flex-1">
                <input value={key} onChange={(e) => setKey(e.target.value)} dir="ltr" autoComplete="off" spellCheck={false}
                  type={showKey ? 'text' : 'password'} placeholder="gsk_… / AIza…"
                  className="input w-full pe-9 font-mono text-[11px]" />
                <button type="button" onClick={() => setShowKey((s) => !s)}
                  className="absolute end-2 top-1/2 -translate-y-1/2 text-ink-500 hover:text-ink-300" aria-label="إظهار المفتاح">
                  {showKey ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                </button>
              </div>
              {view?.has_key && (
                <button onClick={clearKey} disabled={saving} className="btn-ghost shrink-0 px-2 py-1 text-[10px]">حذف المفتاح</button>
              )}
            </div>
          </label>
          <label className="block">
            <span className="mb-1 block text-[10.5px] font-bold text-ink-400">عنوان المزوّد (Base URL)</span>
            <input value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} dir="ltr"
              className="input w-full font-mono text-[11px]" placeholder="https://…/v1" />
          </label>
          <label className="block">
            <span className="mb-1 block text-[10.5px] font-bold text-ink-400">موديل النص</span>
            <input value={model} onChange={(e) => setModel(e.target.value)} dir="ltr"
              className="input w-full font-mono text-[11px]" placeholder="llama-3.3-70b-versatile" />
          </label>
          <label className="block sm:col-span-2">
            <span className="mb-1 block text-[10.5px] font-bold text-ink-400">موديل الصور (قراءة صور الوصفات والعلب)</span>
            <input value={vision} onChange={(e) => setVision(e.target.value)} dir="ltr"
              className="input w-full font-mono text-[11px]" placeholder="meta-llama/llama-4-scout-17b-16e-instruct" />
          </label>
        </div>

        <div className="flex flex-wrap gap-2">
          <button onClick={() => void save()} disabled={saving} className="btn-primary px-3 py-2 text-[11.5px]">
            {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />} حفظ
          </button>
          <button onClick={test} disabled={testing || saving}
            className="btn-soft px-3 py-2 text-[11.5px]">
            {testing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
            {testing ? 'جارٍ الاختبار…' : 'اختبار حقيقي للمفتاح'}
          </button>
          <button onClick={() => { void load(); setResult(null); }} className="btn-ghost px-3 py-2 text-[11.5px]">
            <RefreshCw className="h-3.5 w-3.5" /> تحديث
          </button>
        </div>

        {error && (
          <div className="flex items-start gap-2 rounded-xl bg-rose-500/10 p-2.5 text-[11px] text-rose-200">
            <XCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" /><span>{error}</span>
          </div>
        )}

        {result && (
          <div className={cx('space-y-1.5 rounded-xl p-2.5 text-[11px] leading-5',
            result.ok ? 'bg-emerald-500/10 text-emerald-200' : 'bg-rose-500/10 text-rose-200')}>
            <div className="flex items-center gap-1.5 font-extrabold">
              {result.ok ? <CheckCircle2 className="h-4 w-4" /> : <XCircle className="h-4 w-4" />}
              {result.ok ? `نجح الاتصال — ${result.latency_ms} ms` : `فشل الاختبار (${result.kind || 'خطأ'})`}
            </div>
            {result.hint_ar && <div>{result.hint_ar}</div>}
            {result.ok && result.sample && (
              <div className="rounded-lg bg-black/25 p-1.5 font-mono text-[10px] text-ink-300" dir="ltr">reply: {result.sample.slice(0, 60)}</div>
            )}
            {!result.ok && result.error && (
              <div className="rounded-lg bg-black/25 p-1.5 font-mono text-[10px] text-ink-400" dir="ltr">{result.error}</div>
            )}
            {!result.ok && result.kind === 'auth' && preset?.keys_url && (
              <a href={preset.keys_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-bold underline">
                <ExternalLink className="h-3 w-3" /> أنشئ مفتاحًا جديدًا
              </a>
            )}
          </div>
        )}

        {/* step-by-step guide */}
        <button onClick={() => setShowGuide((s) => !s)} className="flex w-full items-center gap-1.5 rounded-xl bg-white/[.04] px-2.5 py-2 text-[11px] font-bold text-ink-300">
          <ChevronDown className={cx('h-3.5 w-3.5 transition', showGuide && 'rotate-180')} />
          دليل التفعيل خطوة بخطوة (5 دقائق) — وماذا تفعل إن لم يكن لديك خادم
        </button>
        {showGuide && (
          <ol className="space-y-1.5 rounded-xl bg-white/[.03] p-3 text-[10.5px] leading-5 text-ink-300">
            <li><b>1.</b> لا بد من خادم يعمل: التطبيق لا يضع المفاتيح داخله أبدًا. إن لم يكن لديك خادم، اضغط
              {' '}<a href={DEPLOY_URL} target="_blank" rel="noreferrer" className="font-bold text-brand-300 underline">نشر مجاني على Render</a>{' '}
              ثم انسخ الرابط والصقه في <b>المزيد ← الخادم والاتصال</b>.</li>
            <li><b>2.</b> أنشئ مفتاحًا مجانيًا من {preset?.keys_url
              ? <a href={preset.keys_url} target="_blank" rel="noreferrer" className="font-bold text-brand-300 underline">{preset.label}</a>
              : 'المزوّد'} (Groq أو Gemini — بلا بطاقة بنكية).</li>
            <li><b>3.</b> الصقه في الحقل أعلاه ← <b>حفظ</b> ← <b>اختبار حقيقي للمفتاح</b>.</li>
            <li><b>4.</b> إن نجح: افتح <b>الوصفات</b> وجرّب صورة. إن فشل، الرسالة تقول السبب بالضبط
              (مفتاح خاطئ / موديل غير متاح / حصة مستهلكة / شبكة).</li>
            <li className="flex items-start gap-1 text-ink-400"><KeyRound className="mt-0.5 h-3 w-3 shrink-0" />
              المفتاح يُخزَّن مشفّرًا (AES-256-GCM) على الخادم، ولا يُرسل للهاتف ولا يظهر في أي شاشة بعد الحفظ.</li>
            <li className="flex items-start gap-1 text-ink-400"><Server className="mt-0.5 h-3 w-3 shrink-0" />
              على الخادم يمكن أيضًا استخدام متغيّرات <code className="rounded bg-black/20 px-1">AI_API_KEY</code>؛ إعداد التطبيق يتقدّم عليها.</li>
            <li className="flex items-start gap-1 text-ink-400"><Copy className="mt-0.5 h-3 w-3 shrink-0" />
              نفس المفتاح يعمل للإجابة الذكية (شاشة المساعد) وقراءة علب الأدوية بالصور.</li>
          </ol>
        )}

        {view?.updated_at && (
          <div className="text-[9.5px] text-ink-500">
            آخر تغيير: {new Date(view.updated_at).toLocaleString()} {view.updated_by ? `· ${view.updated_by}` : ''}
          </div>
        )}
      </div>
    </section>
  );
}
