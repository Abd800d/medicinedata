import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AlertCircle, CheckCircle2, Info, Loader2, SearchX, X } from 'lucide-react';
import { cx } from '../lib/utils';
import { assetUrl } from '../lib/api';
import { useI18n } from '../lib/i18n';

/* ---------------- Logo ---------------- */
export function MDAIcon({ size = 36, className = '' }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" className={className} aria-hidden="true">
      <defs>
        <linearGradient id="mdaGrad" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#0f766e" />
          <stop offset=".55" stopColor="#0d9488" />
          <stop offset="1" stopColor="#0e7490" />
        </linearGradient>
      </defs>
      <rect width="64" height="64" rx="18" fill="url(#mdaGrad)" />
      <path d="M32 14v36M14 32h36" stroke="white" strokeOpacity=".22" strokeWidth="7" strokeLinecap="round" />
      <path d="M24 32h16M32 24v16" stroke="white" strokeWidth="5.4" strokeLinecap="round" />
      <path d="M44.5 36.5c3.4-3.7 8.5.4 5.6 4.2-1.6 2.1-3.9 3.5-5.6 5.3-1.7-1.8-4-3.2-5.6-5.3-2.9-3.8 2.2-7.9 5.6-4.2z" fill="white" fillOpacity=".92" />
    </svg>
  );
}

export function Logo({ compact = false, className = '' }: { compact?: boolean; className?: string }) {
  return (
    <div className={cx('flex items-center gap-2.5', className)}>
      <MDAIcon size={compact ? 32 : 38} />
      <div className="leading-tight">
        <div className="flex items-baseline gap-1.5">
          <span className="text-[19px] font-extrabold tracking-tight text-ink-900 dark:text-white">MDA</span>
          {!compact && <span className="hidden text-[11px] font-semibold text-brand-700 dark:text-brand-300 xs:inline sm:inline">MedicineData</span>}
        </div>
        {!compact && <div className="text-[9.5px] font-medium tracking-wide text-ink-400">ميديسين داتا · PHARMA</div>}
      </div>
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
      <Spinner className="h-7 w-7 text-brand-600" />
      <span className="text-sm">{label || t('common.loading')}</span>
    </div>
  );
}

export function EmptyState({ icon, title, text, action }: { icon?: React.ReactNode; title: string; text?: string; action?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-3xl border border-dashed border-ink-200 bg-white/70 px-6 py-12 text-center dark:border-ink-800 dark:bg-ink-900/40">
      <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-ink-100 text-ink-400 dark:bg-ink-800">
        {icon || <SearchX className="h-6 w-6" />}
      </div>
      <div className="text-[15px] font-bold text-ink-800 dark:text-ink-100">{title}</div>
      {text && <p className="mt-1 max-w-xs text-[13px] leading-6 text-ink-500">{text}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message?: string; onRetry?: () => void }) {
  const { t } = useI18n();
  return (
    <EmptyState
      icon={<AlertCircle className="h-6 w-6 text-rose-500" />}
      title={t('common.error')}
      text={message === 'NETWORK' ? t('errors.network') : message || t('errors.server')}
      action={onRetry ? <button className="btn-ghost" onClick={onRetry}>{t('common.retry')}</button> : undefined}
    />
  );
}

/* ---------------- Badges ---------------- */
export function Badge({ children, tone = 'neutral', className = '' }: { children: React.ReactNode; tone?: 'neutral' | 'brand' | 'rose' | 'amber' | 'sky' | 'emerald' | 'violet'; className?: string }) {
  const tones: Record<string, string> = {
    neutral: 'bg-ink-100 text-ink-600 dark:bg-ink-800 dark:text-ink-300',
    brand: 'bg-brand-50 text-brand-700 dark:bg-brand-900/50 dark:text-brand-200',
    rose: 'bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300',
    amber: 'bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300',
    sky: 'bg-sky-50 text-sky-700 dark:bg-sky-950/40 dark:text-sky-300',
    emerald: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300',
    violet: 'bg-violet-50 text-violet-700 dark:bg-violet-950/40 dark:text-violet-300',
  };
  return <span className={cx('pill-badge', tones[tone], className)}>{children}</span>;
}

/* ---------------- Section header ---------------- */
export function SectionHead({ title, subtitle, action }: { title: string; subtitle?: string; action?: React.ReactNode }) {
  return (
    <div className="mb-3 flex items-end justify-between gap-3">
      <div>
        <h2 className="text-[16px] font-extrabold tracking-tight text-ink-900 dark:text-white">{title}</h2>
        {subtitle && <p className="mt-0.5 text-[11.5px] text-ink-500">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

/* ---------------- Product image with robust fallback ---------------- */
export function SmartImage({
  src, alt, productId, drugId, className = '', rounded = 'rounded-2xl', eager = false,
}: { src?: string | null; alt: string; productId?: number; drugId?: number; className?: string; rounded?: string; eager?: boolean }) {
  const initial = src ? assetUrl(src) : productId ? `/api/catalog/product-image/${productId}.svg` : drugId ? `/api/catalog/drug-image/${drugId}.svg` : '';
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
        if (productId && !url.includes('/product-image/')) setUrl(`/api/catalog/product-image/${productId}.svg`);
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
    <div className={cx('no-scrollbar flex gap-1.5 overflow-x-auto rounded-2xl bg-ink-100/80 p-1 dark:bg-ink-900', className)}>
      {tabs.map((tab) => (
        <button
          key={tab.id}
          onClick={() => onChange(tab.id)}
          className={cx(
            'flex flex-1 shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-xl px-3 py-2 text-[12.5px] font-semibold transition',
            value === tab.id ? 'bg-white text-brand-800 shadow-sm dark:bg-ink-800 dark:text-brand-200' : 'text-ink-500 hover:text-ink-700 dark:hover:text-ink-300',
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
            'pointer-events-auto flex w-full max-w-sm items-center gap-2.5 rounded-2xl border px-3.5 py-3 text-[13px] font-semibold shadow-lg animate-fade-up',
            i.type === 'success' && 'border-emerald-200 bg-white text-emerald-800 dark:border-emerald-900 dark:bg-ink-900 dark:text-emerald-300',
            i.type === 'error' && 'border-rose-200 bg-white text-rose-700 dark:border-rose-900 dark:bg-ink-900 dark:text-rose-300',
            i.type === 'info' && 'border-sky-200 bg-white text-sky-800 dark:border-sky-900 dark:bg-ink-900 dark:text-sky-300',
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
    <div className="flex items-center justify-center rounded-full bg-gradient-to-br from-brand-600 to-cyan-600 font-bold text-white" style={{ width: size, height: size, fontSize: size * 0.36 }}>
      {text}
    </div>
  );
}
