import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AlertCircle, CheckCircle2, Info, Loader2, SearchX, Server, X } from 'lucide-react';
import { cx } from '../lib/utils';
import { assetUrl } from '../lib/api';
import { localArt, useLocalReady } from '../lib/localcatalog';
import { Link } from 'react-router-dom';
import { useI18n } from '../lib/i18n';

/* ---------------- Logo ---------------- */
/** MDA mark: capsule + ECG pulse on a midnight-blue badge (matches the app icon). */
export function MDAIcon({ size = 36, className = '' }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" className={className} aria-hidden="true">
      <defs>
        <linearGradient id="mdaBadge" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#0b2f7a" />
          <stop offset=".55" stopColor="#1262e0" />
          <stop offset="1" stopColor="#12a7d8" />
        </linearGradient>
        <linearGradient id="mdaCap" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#ffffff" />
          <stop offset="1" stopColor="#d7ecff" />
        </linearGradient>
      </defs>
      <rect width="64" height="64" rx="18" fill="url(#mdaBadge)" />
      <circle cx="52" cy="10" r="20" fill="#67e8f9" opacity=".18" />
      <circle cx="8" cy="58" r="18" fill="#1b6dff" opacity=".35" />
      <g transform="rotate(-38 32 32)">
        <rect x="7" y="25.5" width="50" height="13" rx="6.5" fill="url(#mdaCap)" />
        <path d="M13 32h8.6l3.2-6.2 4.6 12.4 3.2-6.2H51"
          fill="none" stroke="#0a4fc0" strokeWidth="2.9" strokeLinecap="round" strokeLinejoin="round" />
      </g>
      <rect x="0.6" y="0.6" width="62.8" height="62.8" rx="17.6" fill="none" stroke="#ffffff" strokeOpacity=".16" />
    </svg>
  );
}

export function Logo({ compact = false, className = '', light = false }: { compact?: boolean; className?: string; light?: boolean }) {
  return (
    <div className={cx('flex items-center gap-2.5', className)}>
      <span className="relative shrink-0">
        <span className="absolute inset-0 rounded-[18px] bg-brand-500/40 blur-lg" aria-hidden="true" />
        <MDAIcon size={compact ? 34 : 40} className="relative drop-shadow-[0_6px_14px_rgba(17,133,255,.5)]" />
      </span>
      <div className="leading-none">
        <div className="flex items-baseline gap-1.5">
          <span className={cx(
            'bg-gradient-to-r from-white via-brand-100 to-brand-300 bg-clip-text text-[20px] font-black tracking-[-.03em] text-transparent',
            light && 'from-white via-white to-brand-100',
          )}>MDA</span>
          <span className="mb-[3px] h-1.5 w-1.5 rounded-full bg-gradient-to-br from-amber-300 to-amber-500 shadow-[0_0_10px_rgba(251,191,36,.85)]" aria-hidden="true" />
          {!compact && <span className="hidden text-[11px] font-bold tracking-wide text-brand-300 sm:inline">MedicineData</span>}
        </div>
        {!compact && <div className="mt-1 hidden text-[9.5px] font-semibold tracking-[.12em] text-ink-400 sm:block">ميديسين داتا · PHARMA</div>}
      </div>
    </div>
  );
}

/**
 * Splash-style wordmark used on auth / empty brand surfaces.
 */
export function BrandHero({ className = '' }: { className?: string }) {
  return (
    <div className={cx('flex flex-col items-center text-center', className)}>
      <span className="relative mb-4 flex h-24 w-24 items-center justify-center">
        <span className="absolute inset-0 animate-ping-slow rounded-[30px] bg-brand-500/30" />
        <span className="absolute inset-2 rounded-[28px] bg-brand-500/25 blur-xl" />
        <MDAIcon size={84} className="relative drop-shadow-[0_14px_30px_rgba(17,133,255,.55)]" />
      </span>
      <div className="text-[30px] font-black leading-none tracking-[-.03em] text-white">MDA</div>
      <div className="mt-1 text-[12.5px] font-bold text-brand-300">MedicineData</div>
      <div className="mt-1 text-[11px] font-semibold text-ink-400">جميع الأدوية في مكان واحد</div>
    </div>
  );
}

/* ---------------- Spinner / states ---------------- */
export function Spinner({ className = '' }: { className?: string }) {
  return <Loader2 className={cx('h-5 w-5 animate-spin', className)} />;
}

export function PageLoader({ label }: { label?: string }) {
  const { t } = useI18n();
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-16 text-ink-400">
      <span className="relative flex h-14 w-14 items-center justify-center">
        <span className="absolute inset-0 animate-ping rounded-2xl bg-brand-500/15" />
        <MDAIcon size={46} className="relative rounded-2xl shadow-glow" />
      </span>
      <span className="text-[12px] font-semibold">{label || t('common.loading')}</span>
    </div>
  );
}

export function EmptyState({ icon, title, text, action }: { icon?: React.ReactNode; title: string; text?: string; action?: React.ReactNode }) {
  return (
    <div className="relative flex flex-col items-center justify-center overflow-hidden rounded-3xl border border-dashed border-white/10 bg-white/[.025] px-6 py-12 text-center">
      <span className="pointer-events-none absolute -top-10 start-1/2 h-24 w-24 -translate-x-1/2 rounded-full bg-brand-500/15 blur-2xl" />
      <div className="relative mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-grad on-color shadow-glow ring-1 ring-white/20">
        {icon || <SearchX className="h-6 w-6" />}
      </div>
      <div className="text-[15px] font-bold text-white">{title}</div>
      {text && <p className="mt-1 max-w-xs text-[13px] leading-6 text-ink-400">{text}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message?: string; onRetry?: () => void }) {
  const { t, lang } = useI18n();
  const offline = message === 'NETWORK' || message === 'SERVER';
  /* A missing backend is a setup problem, not a bug: point the user at the one screen that fixes it. */
  if (offline) {
    return (
      <EmptyState
        icon={<Server className="h-6 w-6 text-amber-300" />}
        title={lang === 'ar' ? 'هذا القسم يحتاج خادمًا' : 'This section needs a server'}
        text={lang === 'ar'
          ? 'الكتالوج والبحث والأجهزة تعمل من داخل التطبيق بدون إنترنت، أما المجتمع والصيدلية ولوحة التحكم فتحتاج ربط خادم MDA (نشره مجانًا من صفحة الإعدادات).'
          : 'Browsing, search and systems work offline from built-in data. Community, pharmacy and the admin console need an MDA server (free to deploy — see the settings screen).'}
        action={(
          <div className="flex flex-wrap justify-center gap-2">
            <Link to="/server" className="btn-primary text-[12px]"><Server className="h-4 w-4" />{lang === 'ar' ? 'ربط الخادم' : 'Connect a server'}</Link>
            {onRetry && <button className="btn-ghost text-[12px]" onClick={onRetry}>{t('common.retry')}</button>}
          </div>
        )}
      />
    );
  }
  return (
    <EmptyState
      icon={<AlertCircle className="h-6 w-6 text-rose-500" />}
      title={t('common.error')}
      text={message || t('errors.server')}
      action={onRetry ? <button className="btn-ghost" onClick={onRetry}>{t('common.retry')}</button> : undefined}
    />
  );
}

/* ---------------- Badges ---------------- */
export function Badge({ children, tone = 'neutral', className = '' }: { children: React.ReactNode; tone?: 'neutral' | 'brand' | 'rose' | 'amber' | 'sky' | 'emerald' | 'violet'; className?: string }) {
  const tones: Record<string, string> = {
    neutral: 'bg-white/[.07] text-ink-300 ring-1 ring-white/10',
    brand: 'bg-brand-500/15 text-brand-200 ring-1 ring-brand-400/25',
    rose: 'bg-rose-500/15 text-rose-300 ring-1 ring-rose-400/25',
    amber: 'bg-amber-500/15 text-amber-300 ring-1 ring-amber-400/25',
    sky: 'bg-sky-500/15 text-sky-300 ring-1 ring-sky-400/25',
    emerald: 'bg-emerald-500/15 text-emerald-300 ring-1 ring-emerald-400/25',
    violet: 'bg-violet-500/15 text-violet-300 ring-1 ring-violet-400/25',
  };
  return <span className={cx('pill-badge', tones[tone], className)}>{children}</span>;
}

/* ---------------- Section header ---------------- */
export function SectionHead({ title, subtitle, action }: { title: string; subtitle?: string; action?: React.ReactNode }) {
  return (
    <div className="mb-3 flex items-end justify-between gap-3">
      <div>
        <h2 className="text-[16px] font-extrabold tracking-tight text-white">{title}</h2>
        {subtitle && <p className="mt-0.5 text-[11.5px] text-ink-400">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

/* ---------------- Product image with robust fallback ---------------- */
export function SmartImage({
  src, alt, productId, drugId, className = '', rounded = 'rounded-2xl', eager = false,
}: { src?: string | null; alt: string; productId?: number; drugId?: number; className?: string; rounded?: string; eager?: boolean }) {
  /* Offline-first: when the bundled catalogue is available we can draw the very same
     procedural pack artwork the server would render, with no request at all. */
  const localReady = useLocalReady();
  const generated = useMemo(() => (localReady ? localArt(productId, drugId) : undefined), [localReady, productId, drugId]);
  const initial = src ? assetUrl(src) : generated || (productId ? `/api/catalog/product-image/${productId}.svg` : drugId ? `/api/catalog/drug-image/${drugId}.svg` : '');
  const [url, setUrl] = useState(initial);
  const [failed, setFailed] = useState(false);
  useEffect(() => { setUrl(initial); setFailed(false); }, [initial]);
  if (!url || failed) {
    return (
      <div className={cx('img-fallback', rounded, className)}>
        <MDAIcon size={34} className="opacity-40" />
      </div>
    );
  }
  return (
    <img
      src={url}
      alt={alt}
      loading={eager ? 'eager' : 'lazy'}
      decoding="async"
      className={cx('object-contain', rounded, className)}
      onError={() => {
        if (generated && url !== generated) setUrl(generated);
        else if (productId && !url.includes('/product-image/')) setUrl(`/api/catalog/product-image/${productId}.svg`);
        else if (drugId && !url.includes('/drug-image/')) setUrl(`/api/catalog/drug-image/${drugId}.svg`);
        else setFailed(true);
      }}
    />
  );
}

/* ---------------- Modal / sheet ---------------- */
export function Modal({ open, onClose, title, children, footer, wide = false }: { open: boolean; onClose: () => void; title?: string; children: React.ReactNode; footer?: React.ReactNode; wide?: boolean }) {
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', esc);
    return () => { document.body.style.overflow = prev; window.removeEventListener('keydown', esc); };
  }, [open, onClose]);
  if (!open) return null;
  return createPortal(
    <div className="sheet-backdrop" onClick={onClose}>
      <div
        className={cx('sheet', wide && 'sm:w-[760px]')}
        onClick={(e) => e.stopPropagation()}
        role="dialog" aria-modal="true"
      >
        <div className="mb-4 flex items-center justify-between gap-3">
          <h3 className="text-[16px] font-extrabold text-ink-900 dark:text-white">{title}</h3>
          <button className="icon-btn" onClick={onClose} aria-label="close"><X className="h-5 w-5" /></button>
        </div>
        <div>{children}</div>
        {footer && <div className="mt-5 flex justify-end gap-2">{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}

/* ---------------- Form primitives ---------------- */
export function Field({ label, hint, children, required }: { label: string; hint?: string; children: React.ReactNode; required?: boolean }) {
  return (
    <div>
      <label className="label">{label}{required && <span className="ms-1 text-rose-500">*</span>}</label>
      {children}
      {hint && <p className="mt-1 text-[11px] text-ink-400">{hint}</p>}
    </div>
  );
}

export function TextInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={cx('input', props.className)} />;
}
export function TextArea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...props} className={cx('input min-h-[92px]', props.className)} />;
}
export function Select(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} className={cx('input appearance-none', props.className)} />;
}

/* ---------------- Tabs ---------------- */
export function Tabs<T extends string>({ tabs, value, onChange, className = '' }: { tabs: { id: T; label: string; icon?: React.ReactNode }[]; value: T; onChange: (v: T) => void; className?: string }) {
  return (
    <div className={cx('no-scrollbar flex gap-1.5 overflow-x-auto rounded-2xl border border-white/[.06] bg-ink-900/70 p-1', className)}>
      {tabs.map((tab) => (
        <button
          key={tab.id}
          onClick={() => onChange(tab.id)}
          className={cx(
            'flex flex-1 shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-xl px-3 py-2 text-[12.5px] font-semibold transition',
            value === tab.id ? 'bg-brand-grad text-white shadow-float' : 'text-ink-400 hover:text-white',
          )}
        >
          {tab.icon}{tab.label}
        </button>
      ))}
    </div>
  );
}

/* ---------------- Toasts ---------------- */
type Toast = { id: number; message: string; type: 'success' | 'error' | 'info' };
const ToastCtx = createContext<{ push: (m: string, t?: Toast['type']) => void } | null>(null);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<Toast[]>([]);
  const counter = useRef(0);
  const push = useCallback((message: string, type: Toast['type'] = 'success') => {
    const id = ++counter.current;
    setItems((p) => [...p, { id, message, type }]);
    setTimeout(() => setItems((p) => p.filter((x) => x.id !== id)), 3800);
  }, []);
  return (
    <ToastCtx.Provider value={{ push }}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 top-3 z-[100] flex flex-col items-center gap-2 px-4">
        {items.map((i) => (
          <div key={i.id} className={cx(
            'pointer-events-auto flex w-full max-w-sm items-center gap-2.5 rounded-2xl border px-3.5 py-3 text-[13px] font-semibold shadow-glow backdrop-blur-xl animate-fade-up',
            i.type === 'success' && 'border-emerald-400/25 bg-ink-900/95 text-emerald-300',
            i.type === 'error' && 'border-rose-400/25 bg-ink-900/95 text-rose-300',
            i.type === 'info' && 'border-brand-400/25 bg-ink-900/95 text-brand-200',
          )}>
            {i.type === 'success' ? <CheckCircle2 className="h-4.5 w-4.5 shrink-0" /> : i.type === 'error' ? <AlertCircle className="h-4.5 w-4.5 shrink-0" /> : <Info className="h-4.5 w-4.5 shrink-0" />}
            <span className="flex-1 leading-5">{i.message}</span>
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastCtx);
  if (!ctx) throw new Error('useToast outside provider');
  return ctx;
}

/* ---------------- Avatar ---------------- */
export function Avatar({ name, src, size = 36 }: { name?: string; src?: string | null; size?: number }) {
  const text = (name || '?').split(' ').filter(Boolean).slice(0, 2).map((x) => x[0]).join('').toUpperCase();
  if (src) return <img src={src} alt={name || ''} className="rounded-full object-cover" style={{ width: size, height: size }} />;
  return (
    <div className="flex items-center justify-center rounded-full bg-brand-grad font-bold on-color ring-2 ring-white/10" style={{ width: size, height: size, fontSize: size * 0.36 }}>
      {text}
    </div>
  );
}
