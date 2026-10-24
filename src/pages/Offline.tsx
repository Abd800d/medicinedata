import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowRight, CheckCircle2, ChevronLeft, CloudDownload, Database, HardDriveDownload, RefreshCw,
  ShieldCheck, Trash2, Wifi, WifiOff, Zap,
} from 'lucide-react';
import { useI18n } from '../lib/i18n';
import { useOnline, downloadPack, packMeta, deletePack } from '../lib/offline';
import { useToast } from '../components/ui';
import { fmt } from '../lib/utils';

type Meta = { generated_at: string; drugs: number; products: number; systems: number } | null;

function bytes(n: number) {
  if (!n) return '0 MB';
  const mb = n / 1024 / 1024;
  return mb >= 1024 ? `${(mb / 1024).toFixed(2)} GB` : `${mb.toFixed(1)} MB`;
}

export default function Offline() {
  const { lang } = useI18n();
  const ar = lang === 'ar';
  const online = useOnline();
  const { push } = useToast();
  const [meta, setMeta] = useState<Meta>(() => packMeta());
  const [busy, setBusy] = useState(false);
  const [usage, setUsage] = useState<{ used: number; quota: number } | null>(null);

  const refreshUsage = async () => {
    try {
      const est = await navigator.storage?.estimate?.();
      if (est) setUsage({ used: est.usage || 0, quota: est.quota || 0 });
    } catch { /* unsupported */ }
  };

  useEffect(() => { refreshUsage(); }, [meta]);

  const download = async () => {
    setBusy(true);
    try {
      await downloadPack();
      setMeta(packMeta());
      push(ar ? 'تم حفظ الحزمة — التطبيق يعمل الآن بدون إنترنت' : 'Pack saved — the app now works offline');
      refreshUsage();
    } catch {
      push(ar ? 'تعذّر تحميل الحزمة، تحقق من الاتصال' : 'Could not download the pack, check your connection', 'error');
    } finally { setBusy(false); }
  };

  const remove = async () => {
    if (!confirm(ar ? 'حذف الحزمة المحفوظة؟ ستحتاج اتصالاً للبحث من جديد.' : 'Delete the saved pack? You will need a connection to search again.')) return;
    setBusy(true);
    try { await deletePack(); setMeta(null); push(ar ? 'تم حذف الحزمة' : 'Pack deleted'); }
    catch { push(ar ? 'تعذّر الحذف' : 'Delete failed', 'error'); }
    finally { setBusy(false); }
  };

  const pct = usage && usage.quota ? Math.min(100, Math.round((usage.used / usage.quota) * 100)) : 0;
  const savedDate = meta?.generated_at ? new Date(meta.generated_at).toLocaleDateString(ar ? 'ar-YE' : 'en-GB') : '';

  return (
    <div className="space-y-4">
      <div className={`page-hero ${online ? 'page-hero-emerald' : 'page-hero-amber'} p-5 text-white`}>
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            {online ? <Wifi className="h-5 w-5" /> : <WifiOff className="h-5 w-5" />}
            <h1 className="text-[21px] font-extrabold">{ar ? 'العمل بدون إنترنت' : 'Offline mode'}</h1>
          </div>
          <span className="inline-flex items-center gap-1 rounded-full border border-white/25 bg-white/15 px-2.5 py-1 text-[10px] font-bold backdrop-blur">
            <span className={`h-1.5 w-1.5 rounded-full ${online ? 'bg-emerald-300' : 'bg-amber-300'} animate-pulse`} />
            {online ? (ar ? 'متصل الآن' : 'Online') : (ar ? 'غير متصل' : 'Offline')}
          </span>
        </div>
        <p className="mt-1.5 max-w-lg text-[11.5px] leading-6 text-white/85">
          {ar
            ? 'حزمة MDA تحفظ الأجهزة والأدوية والمنتجات على جهازك، فتعمل القوائم والبحث والباركود حتى بدون شبكة.'
            : 'The MDA pack stores systems, drugs and products on your device, so lists, search and barcode lookup keep working with no network.'}
        </p>
        <div className="mt-3 flex flex-wrap gap-1.5 text-[10px] font-semibold">
          <span className="rounded-full bg-white/15 px-2 py-0.5">{fmt(meta?.drugs ?? 0)} {ar ? 'دواء' : 'drugs'}</span>
          <span className="rounded-full bg-white/15 px-2 py-0.5">{fmt(meta?.products ?? 0)} {ar ? 'منتج' : 'products'}</span>
          <span className="rounded-full bg-white/15 px-2 py-0.5">{fmt(meta?.systems ?? 0)} {ar ? 'جهاز' : 'systems'}</span>
        </div>
      </div>

      <div className="card p-4">
        <div className="flex items-start gap-3">
          <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl text-white shadow-tile ring-1 ring-white/20 ${meta ? 'bg-brand-grad' : 'bg-white/[.08]'}`}>
            {meta ? <CheckCircle2 className="h-5 w-5" /> : <CloudDownload className="h-5 w-5" />}
          </span>
          <div className="min-w-0 flex-1">
            <div className="text-[13px] font-extrabold text-white">
              {meta ? (ar ? 'الحزمة محفوظة على جهازك' : 'Pack saved on this device') : (ar ? 'لم تُحمّل الحزمة بعد' : 'No pack saved yet')}
            </div>
            <p className="mt-0.5 text-[10.5px] leading-5 text-ink-400">
              {meta
                ? (ar ? `آخر تحديث: ${savedDate}` : `Last updated: ${savedDate}`)
                : (ar ? 'حمّل الحزمة مرة واحدة لتفتح الأدوية والمنتجات بدون إنترنت.' : 'Download once to open drugs and products without internet.')}
            </p>
          </div>
        </div>

        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          <button onClick={download} disabled={busy} className="btn-primary">
            {busy ? <RefreshCw className="h-4 w-4 animate-spin" /> : <HardDriveDownload className="h-4 w-4" />}
            {meta ? (ar ? 'تحديث الحزمة' : 'Refresh pack') : (ar ? 'تحميل الحزمة' : 'Download pack')}
          </button>
          {meta ? (
            <button onClick={remove} disabled={busy} className="btn-danger">
              <Trash2 className="h-4 w-4" />
              {ar ? 'حذف الحزمة' : 'Delete pack'}
            </button>
          ) : (
            <Link to="/more" className="btn-ghost">
              <Database className="h-4 w-4" />
              {ar ? 'خيارات أخرى' : 'More options'}
            </Link>
          )}
        </div>

        {usage && (
          <div className="mt-3">
            <div className="mb-1 flex items-center justify-between text-[10px] font-semibold text-ink-400">
              <span>{ar ? 'مساحة التخزين المستخدمة' : 'Storage used'}</span>
              <span className="num">{bytes(usage.used)} · {pct}%</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-white/[.07]">
              <span className="block h-full rounded-full bg-brand-grad transition-all" style={{ width: `${Math.max(3, pct)}%` }} />
            </div>
          </div>
        )}
      </div>

      <div className="grid gap-2 sm:grid-cols-2">
        {[
          { icon: Zap, title: ar ? 'بحث فوري' : 'Instant search', text: ar ? 'البحث في الأسماء العربية والإنجليزية والباركود من الحزمة.' : 'Search Arabic, English and barcodes straight from the pack.', g: 'from-[#1b6dff] to-[#38c6ff]' },
          { icon: ShieldCheck, title: ar ? 'بيانات موثوقة' : 'Trusted data', text: ar ? 'نفس القاعدة المعتمدة، محفوظة محليًا بدون تعديل.' : 'Same verified catalogue, stored locally untouched.', g: 'from-[#10b981] to-[#34d399]' },
          { icon: Database, title: ar ? 'الأجهزة والتصنيفات' : 'Systems & classes', text: ar ? 'تنقّل بين 18 جهازًا وتصنيفاتها دون اتصال.' : 'Browse 18 body systems and their classes offline.', g: 'from-[#8b5cf6] to-[#a78bfa]' },
          { icon: WifiOff, title: ar ? 'تنبيه تلقائي' : 'Auto notice', text: ar ? 'شريط تنبيه يظهر عند انقطاع الشبكة ويختفي عند عودتها.' : 'A banner appears when the network drops and clears on return.', g: 'from-[#f59e0b] to-[#fb923c]' },
        ].map((f) => (
          <div key={f.title} className="card flex items-start gap-3 p-3.5">
            <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br ${f.g} text-white shadow-tile ring-1 ring-white/20`}>
              <f.icon className="h-[18px] w-[18px]" />
            </span>
            <div className="min-w-0">
              <div className="text-[12px] font-extrabold text-white">{f.title}</div>
              <p className="mt-0.5 text-[10.5px] leading-5 text-ink-400">{f.text}</p>
            </div>
          </div>
        ))}
      </div>

      <Link to="/more" className="flex items-center justify-between rounded-2xl border border-white/[.08] bg-white/[.04] px-3.5 py-3 text-[11.5px] font-bold text-ink-200 transition hover:border-brand-400/40 hover:text-white">
        <span>{ar ? 'العودة إلى المزيد' : 'Back to More'}</span>
        <ChevronLeft className="h-4 w-4 rtl:block ltr:hidden" />
        <ArrowRight className="hidden h-4 w-4 ltr:block" />
      </Link>
    </div>
  );
}
