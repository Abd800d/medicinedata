import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { ArrowLeft, BadgeCheck, ShieldCheck, Sparkles, X } from 'lucide-react';
import { Logo } from './ui';
import { useI18n } from '../lib/i18n';
import { useConfig } from '../lib/config';

/*
 * First-run welcome. Shown exactly once per device (localStorage flag), and always
 * skippable. The wording is editable from the admin panel (welcome_title / welcome_text),
 * so the owner can change the greeting without shipping a new APK.
 */
const SEEN_KEY = 'mda.welcome.seen.v1';

export function hasSeenWelcome() {
  try { return localStorage.getItem(SEEN_KEY) === '1'; } catch { return true; }
}
export function resetWelcome() {
  try { localStorage.removeItem(SEEN_KEY); } catch { /* ignore */ }
}

export default function Welcome() {
  const { lang } = useI18n();
  const { config } = useConfig();
  const { pathname } = useLocation();
  const ar = lang === 'ar';
  const [open, setOpen] = useState(() => !hasSeenWelcome());
  const [leaving, setLeaving] = useState(false);

  const title = (ar ? config.welcome_title_ar : config.welcome_title_en)
    || config.welcome_title
    || (ar ? 'مرحبًا بكم في تطبيق د. الصيدلاني عبدالمجيد الماخذي' : 'Welcome to Dr. Abdulmajeed Almakhedhi’s app');
  const body = (ar ? config.welcome_text_ar : config.welcome_text_en)
    || config.welcome_text
    || (ar
      ? 'مرجعك الدوائي الموثوق: أدوية ومنتجات تجارية في اليمن والعالم العربي، بحث ذكي، مسح باركود، وقراءة وصفة بالصورة — يعمل داخل التطبيق حتى بدون إنترنت.'
      : 'Your trusted pharmaceutical reference: drugs and commercial products across Yemen and the Arab world, smart search, barcode scanning and prescription photos — built to work offline.');

  useEffect(() => {
    document.body.style.overflow = open ? 'hidden' : '';
    return () => { document.body.style.overflow = ''; };
  }, [open]);

  const close = () => {
    setLeaving(true);
    try { localStorage.setItem(SEEN_KEY, '1'); } catch { /* ignore */ }
    setTimeout(() => setOpen(false), 220);
  };

  if (!open || pathname.startsWith('/admin')) return null;
  if (config.welcome_enabled === false || config.welcome_enabled === 'false') return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={title}
      className={`fixed inset-0 z-[70] grid place-items-center bg-ink-950/80 p-4 backdrop-blur-md transition-opacity duration-200 ${leaving ? 'opacity-0' : 'opacity-100'}`}
    >
      <div className="relative w-full max-w-[420px] overflow-hidden rounded-[28px] border border-white/[.12] bg-ink-900 shadow-2xl">
        {/* aurora header */}
        <div className="relative h-32 overflow-hidden bg-[radial-gradient(120%_130%_at_100%_0%,rgba(34,211,238,.55),transparent_58%),linear-gradient(135deg,#0b2f7a,#1262e0_58%,#0891b2)]">
          <span className="absolute -end-8 -top-10 h-32 w-32 rounded-full border-[16px] border-white/10" />
          <span className="absolute -start-6 bottom-0 h-24 w-24 rounded-full bg-white/10 blur-xl" />
          <button
            onClick={close}
            aria-label={ar ? 'إغلاق' : 'Close'}
            className="absolute end-3 top-3 grid h-8 w-8 place-items-center rounded-full bg-black/25 text-white/80 backdrop-blur transition hover:bg-black/40"
          >
            <X className="h-4 w-4" />
          </button>
          <div className="absolute -bottom-8 start-5 rounded-2xl bg-ink-900 p-1.5 ring-1 ring-white/10">
            <Logo compact />
          </div>
        </div>

        <div className="px-5 pb-5 pt-11">
          <div className="mb-2 inline-flex items-center gap-1.5 rounded-full border border-brand-400/25 bg-brand-500/12 px-2.5 py-1 text-[10px] font-bold text-brand-200">
            <Sparkles className="h-2.5 w-2.5" />
            {ar ? 'أهلًا بك' : 'Welcome'}
          </div>
          <h1 className="text-[17px] font-extrabold leading-7 text-white">{title}</h1>
          <p className="mt-2 text-[12.5px] leading-6 text-ink-300">{body}</p>

          <div className="mt-3 grid grid-cols-3 gap-2">
            {[
              { n: `${config.counts?.drugs ?? 0}`, l: ar ? 'دواء' : 'drugs' },
              { n: `${config.counts?.products ?? 0}`, l: ar ? 'منتج' : 'products' },
              { n: `${config.counts?.systems ?? 0}`, l: ar ? 'جهاز' : 'systems' },
            ].map((s) => (
              <div key={s.l} className="rounded-2xl border border-white/[.08] bg-white/[.04] px-2 py-2 text-center">
                <div className="text-[15px] font-extrabold text-brand-200">{s.n}</div>
                <div className="text-[9.5px] font-semibold text-ink-400">{s.l}</div>
              </div>
            ))}
          </div>

          <div className="mt-3 space-y-1.5">
            {[
              ar ? 'يعمل بدون إنترنت — الكتالوج كامل داخل التطبيق' : 'Works offline — the full catalogue ships in the app',
              ar ? 'بحث عربي وإنجليزي يتحمّل الأخطاء الإملائية' : 'Arabic + English search that forgives typos',
              ar ? 'مسح باركود وقراءة وصفة بالصورة' : 'Barcode scanning and prescription photos',
            ].map((line) => (
              <div key={line} className="flex items-start gap-1.5 text-[11px] leading-5 text-ink-300">
                <BadgeCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-400" />
                <span>{line}</span>
              </div>
            ))}
          </div>

          <button onClick={close} className="btn-primary mt-4 w-full justify-center text-[13px]">
            {ar ? 'ابدأ الاستخدام' : 'Get started'}
            <ArrowLeft className="h-4 w-4 rtl:block ltr:hidden" />
          </button>

          <div className="mt-3 flex items-center justify-center gap-1 text-[10px] font-semibold text-ink-500">
            <ShieldCheck className="h-3 w-3" />
            {config.owner_name || 'Dr. Abdulmajeed Almakhedhi'}
          </div>
        </div>
      </div>
    </div>
  );
}
