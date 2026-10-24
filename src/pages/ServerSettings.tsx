import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  AlertTriangle, CheckCircle2, ChevronLeft, Copy, Globe2, Loader2, RefreshCw, Save, Server, ShieldCheck, Wifi, WifiOff,
} from 'lucide-react';
import { useI18n } from '../lib/i18n';
import { getApiBase, setApiBase } from '../lib/api';
import { useToast } from '../components/ui';

const DEFAULT_BASE = ((import.meta as any).env?.VITE_API_BASE as string) || '';

async function probe(base: string) {
  const url = `${base.replace(/\/$/, '')}/api/health`;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 6000);
  try {
    const res = await fetch(url, { signal: ctrl.signal, headers: { accept: 'application/json' } });
    if (!res.ok) return { ok: false, message: `HTTP ${res.status}` };
    const data = await res.json();
    return { ok: true, message: data?.app ? `${data.app} · ${new Date(data.time).toLocaleTimeString()}` : 'ok' };
  } catch (e: any) {
    return { ok: false, message: e?.name === 'AbortError' ? 'timeout' : 'unreachable' };
  } finally { clearTimeout(timer); }
}

export default function ServerSettings() {
  const { lang } = useI18n();
  const ar = lang === 'ar';
  const { push } = useToast();
  const [value, setValue] = useState(() => getApiBase());
  const [testing, setTesting] = useState(false);
  const [state, setState] = useState<{ ok: boolean; message: string } | null>(null);
  const effective = value.trim() || window.location.origin;

  const test = async (raw = value) => {
    setTesting(true);
    setState(null);
    const base = raw.trim() || window.location.origin;
    const result = await probe(base);
    setState(result);
    setTesting(false);
    return result;
  };

  useEffect(() => { void test(getApiBase() || window.location.origin); /* eslint-disable-next-line */ }, []);

  const save = async () => {
    const raw = value.trim().replace(/\/$/, '');
    if (raw && !/^https?:\/\//i.test(raw)) {
      push(ar ? 'العنوان يجب أن يبدأ بـ https://' : 'URL must start with https://', 'error');
      return;
    }
    const result = await test(raw);
    if (!result.ok && raw) {
      push(ar ? 'لم يستجب الخادم — تحقق من العنوان' : 'Server did not respond — check the URL', 'error');
      return;
    }
    if (raw) setApiBase(raw); else setApiBase('');
    push(ar ? 'تم الحفظ، سيُعاد تحميل التطبيق' : 'Saved, reloading the app');
    setTimeout(() => window.location.reload(), 600);
  };

  const reset = () => {
    setApiBase('');
    setValue(DEFAULT_BASE);
    push(ar ? 'تمت العودة للعنوان الافتراضي' : 'Reverted to the default server');
    setTimeout(() => window.location.reload(), 600);
  };

  const copy = async () => {
    try { await navigator.clipboard.writeText(effective); push(ar ? 'تم النسخ' : 'Copied'); }
    catch { push(ar ? 'تعذّر النسخ' : 'Copy failed', 'error'); }
  };

  return (
    <div className="space-y-4">
      <div className="page-hero p-5 text-white">
        <div className="flex items-center gap-2"><Server className="h-5 w-5" /><h1 className="text-[21px] font-extrabold">{ar ? 'الخادم والاتصال' : 'Server & connection'}</h1></div>
        <p className="mt-1.5 max-w-lg text-[11.5px] leading-6 text-white/80">
          {ar
            ? 'حدّد عنوان الخادم الذي يخدم التطبيق (قاعدة الأدوية والمنتجات). يُحفظ على الجهاز ويُستخدم فوراً — بدون إعادة تثبيت.'
            : 'Point the app to the server hosting the catalogue. Saved on device and used immediately — no reinstall needed.'}
        </p>
        <div className="mt-3 flex items-center gap-2 text-[10.5px] font-semibold">
          <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 backdrop-blur ${state?.ok ? 'bg-emerald-500/25 text-emerald-100' : 'bg-amber-500/25 text-amber-100'}`}>
            {testing ? <Loader2 className="h-3 w-3 animate-spin" /> : state?.ok ? <Wifi className="h-3 w-3" /> : <WifiOff className="h-3 w-3" />}
            {testing ? (ar ? 'جارٍ الفحص…' : 'Checking…') : state?.ok ? (ar ? 'الخادم متصل' : 'Server reachable') : (ar ? 'لا يوجد اتصال' : 'Not reachable')}
          </span>
          {state?.ok && <span className="truncate text-white/70" dir="ltr">{state.message}</span>}
        </div>
      </div>

      <div className="card space-y-3 p-4">
        <label className="label" htmlFor="api-base">{ar ? 'عنوان الخادم' : 'Server URL'}</label>
        <div className="flex items-center gap-2 rounded-2xl border border-white/[.10] bg-white/[.04] px-3 py-1.5 focus-within:border-brand-400/50">
          <Globe2 className="h-4 w-4 shrink-0 text-ink-400" />
          <input
            id="api-base"
            value={value}
            onChange={(e) => { setValue(e.target.value); setState(null); }}
            placeholder="https://mda.example.com"
            className="min-w-0 flex-1 bg-transparent py-2 text-[12.5px] font-semibold text-white outline-none placeholder:text-ink-500"
            dir="ltr"
            inputMode="url"
            autoComplete="url"
            spellCheck={false}
          />
          <button onClick={copy} className="icon-btn h-8 w-8 shrink-0" title={ar ? 'نسخ' : 'Copy'}><Copy className="h-3.5 w-3.5" /></button>
        </div>
        <p className="text-[10px] leading-5 text-ink-400">
          {ar ? 'اتركه فارغاً إذا كانت الواجهة والخادم على نفس النطاق.' : 'Leave empty when the web app and API share the same origin.'}
        </p>

        <div className="grid gap-2 sm:grid-cols-2">
          <button onClick={() => test()} disabled={testing} className="btn-ghost">
            {testing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            {ar ? 'اختبار الاتصال' : 'Test connection'}
          </button>
          <button onClick={save} className="btn-primary"><Save className="h-4 w-4" />{ar ? 'حفظ وإعادة تحميل' : 'Save & reload'}</button>
        </div>
        <button onClick={reset} className="text-[10.5px] font-semibold text-brand-300 hover:underline">
          {ar ? 'العودة إلى العنوان الافتراضي' : 'Reset to the default server'}
        </button>

        {state && !state.ok && (
          <div className="flex items-start gap-2 rounded-xl border border-amber-400/25 bg-amber-500/10 p-2.5 text-[10.5px] leading-5 text-amber-200">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <div>
              {ar ? 'تعذّر الوصول: ' : 'Unreachable: '}<span dir="ltr">{state.message}</span>
              {' — '}
              {ar ? 'تأكد من تشغيل الخادم وأن الرابط https ويعمل من المتصفح.' : 'make sure the server runs and the https URL opens in a browser.'}
            </div>
          </div>
        )}
        {state?.ok && (
          <div className="flex items-center gap-2 rounded-xl border border-emerald-400/25 bg-emerald-500/10 p-2.5 text-[10.5px] font-semibold text-emerald-200">
            <CheckCircle2 className="h-3.5 w-3.5" />
            {ar ? 'الاتصال ناجح — البيانات تُحمَّل من هذا الخادم.' : 'Connection OK — data is loaded from this server.'}
          </div>
        )}
      </div>

      <div className="card space-y-2 p-4">
        <div className="flex items-center gap-2 text-[12px] font-extrabold text-white"><ShieldCheck className="h-4 w-4 text-brand-300" />{ar ? 'العنوان الفعّال الآن' : 'Effective endpoint'}</div>
        <code className="block break-all rounded-xl border border-white/[.08] bg-ink-950/60 px-3 py-2 text-[11px] text-brand-200" dir="ltr">{effective}</code>
        <div className="grid gap-1.5 text-[10px] leading-5 text-ink-400">
          <p>{ar ? '• التطبيق (APK) يحتاج عنواناً عاماً يعمل من الشبكة؛ localhost لا يعمل على الهاتف.' : '• The APK needs a public URL; localhost does not work on a phone.'}</p>
          <p>{ar ? '• بعد ضبط عنوان جديد يُعاد تحميل الواجهة تلقائياً وتُستخدم القاعدة الجديدة.' : '• After saving, the UI reloads and the new database is used.'}</p>
          <p>{ar ? '• عنوان الخادم محفوظ في هذا الجهاز فقط، ولا يؤثر على بقية المستخدمين.' : '• The URL is stored on this device only and never affects other users.'}</p>
        </div>
      </div>

      <Link to="/more" className="flex items-center justify-between rounded-2xl border border-white/[.08] bg-white/[.04] px-3.5 py-3 text-[11.5px] font-bold text-ink-200 transition hover:border-brand-400/40 hover:text-white">
        <span>{ar ? 'العودة إلى المزيد' : 'Back to More'}</span>
        <ChevronLeft className="h-4 w-4 rtl:block ltr:hidden" />
      </Link>
    </div>
  );
}
