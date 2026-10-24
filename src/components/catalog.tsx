import { Link } from 'react-router-dom';
import {
  Activity, Bone, Brain, Bug, Dna, Droplets, Ear, Eye, FlaskConical, HeartPulse, Microscope,
  ShieldCheck, Siren, Soup, Sparkles, Venus, Wind, Pill, BadgeCheck, MapPin, ChevronLeft, ChevronRight,
} from 'lucide-react';
import { cx, fmt } from '../lib/utils';
import { SmartImage, Badge } from './ui';
import { useI18n } from '../lib/i18n';

export const SYSTEM_ICONS: Record<string, React.ComponentType<any>> = {
  nervous: Brain,
  cardiovascular: HeartPulse,
  blood: Droplets,
  respiratory: Wind,
  gastrointestinal: Soup,
  hepatobiliary: FlaskConical,
  endocrine: Activity,
  renal: Droplets,
  reproductive: Venus,
  musculoskeletal: Bone,
  skin: Sparkles,
  eye: Eye,
  ent: Ear,
  immune: ShieldCheck,
  'anti-infective': Bug,
  oncology: Dna,
  emergency: Siren,
  diagnostic: Microscope,
};

export function SystemIcon({ slug, className = 'h-5 w-5' }: { slug?: string | null; className?: string }) {
  const Icon = SYSTEM_ICONS[slug || ''] || Pill;
  return <Icon className={className} strokeWidth={1.9} />;
}

export type SystemRecord = {
  id: number; slug: string; name_en: string; name_ar: string; color?: string | null; icon?: string;
  description_ar?: string; description_en?: string; drugs?: number; products?: number; categories?: number;
};

/* Each system gets a vivid gradient tile — the signature look of the MDA home screen */
export const SYSTEM_GRADIENTS = [
  'from-[#1b6dff] to-[#38c6ff]',
  'from-[#0ea5e9] to-[#22d3ee]',
  'from-[#14b8a6] to-[#34d399]',
  'from-[#f59e0b] to-[#fb923c]',
  'from-[#ec4899] to-[#f472b6]',
  'from-[#8b5cf6] to-[#a78bfa]',
  'from-[#ef4444] to-[#f87171]',
  'from-[#10b981] to-[#4ade80]',
  'from-[#6366f1] to-[#818cf8]',
  'from-[#06b6d4] to-[#67e8f9]',
];

export const systemGradient = (i = 0) => SYSTEM_GRADIENTS[i % SYSTEM_GRADIENTS.length];

export function SystemCard({ system, index = 0, compact = false }: { system: SystemRecord; index?: number; compact?: boolean }) {
  const { lang } = useI18n();
  return (
    <Link
      to={`/systems/${system.slug}`}
      className={cx(
        'group relative flex flex-col items-center overflow-hidden rounded-2xl border border-white/[.07] bg-white/[.035] text-center transition',
        'hover:-translate-y-0.5 hover:border-white/20 hover:bg-white/[.06] hover:shadow-glow',
        compact ? 'gap-1.5 px-1.5 py-2.5' : 'gap-2 px-2.5 py-3.5',
      )}
      style={{ animationDelay: `${Math.min(index * 22, 220)}ms` }}
    >
      <span className="pointer-events-none absolute inset-x-0 -top-6 h-16 opacity-0 blur-2xl transition group-hover:opacity-60"
        style={{ background: 'radial-gradient(circle, rgba(56,164,255,.9), transparent 70%)' }} />
      <span className={cx(
        'relative flex items-center justify-center rounded-2xl bg-gradient-to-br text-white shadow-tile ring-1 ring-white/25',
        compact ? 'h-10 w-10' : 'h-12 w-12',
        systemGradient(index),
      )}>
        <SystemIcon slug={system.slug} className={compact ? 'h-[18px] w-[18px]' : 'h-[22px] w-[22px]'} />
      </span>
      <span className="relative mt-0.5 line-clamp-2 text-[11px] font-bold leading-4 text-ink-100">
        {lang === 'ar' ? system.name_ar : system.name_en}
      </span>
      {!compact && (
        <span className="relative text-[10px] font-semibold text-ink-400 num">
          {fmt(system.drugs)} {lang === 'ar' ? 'دواء' : 'drugs'}
        </span>
      )}
    </Link>
  );
}

export type DrugRecord = {
  id: number; generic_name: string; generic_ar?: string; drug_class?: string; atc_code?: string;
  prescription_required?: number; products_count?: number; products?: number; image_url?: string | null;
  system_slug?: string; system_en?: string; system_ar?: string; system_color?: string;
  score?: number; verified?: number; products_preview?: ProductRecord[];
};

export function DrugCard({ drug, compact = false }: { drug: DrugRecord; compact?: boolean }) {
  const { lang } = useI18n();
  const count = drug.products_count ?? drug.products ?? 0;
  return (
    <Link
      to={`/drugs/${drug.id}`}
      className="group flex items-center gap-3 rounded-2xl border border-white/[.07] bg-white/[.035] p-2.5 transition hover:border-brand-400/35 hover:bg-white/[.06] hover:shadow-glow"
    >
      <div className="photo-plate relative flex h-[62px] w-[62px] shrink-0 items-center justify-center overflow-hidden rounded-xl">
        <SmartImage src={drug.image_url} drugId={drug.id} alt={drug.generic_name} className="h-full w-full p-1" rounded="" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <h3 className="truncate text-[13.5px] font-bold text-white">{lang === 'ar' && drug.generic_ar ? drug.generic_ar : drug.generic_name}</h3>
          {drug.prescription_required ? <Badge tone="rose" className="shrink-0">Rx</Badge> : null}
        </div>
        <p className="truncate text-[11px] font-medium text-ink-400" dir="ltr">{lang === 'ar' ? drug.generic_name : drug.generic_ar || ''}</p>
        <div className="mt-1 flex flex-wrap items-center gap-1.5">
          {drug.drug_class && <span className="truncate rounded-md bg-brand-500/15 px-1.5 py-0.5 text-[10px] font-bold text-brand-200">{drug.drug_class}</span>}
          {drug.system_slug && (
            <span className="inline-flex items-center gap-1 rounded-md bg-white/[.06] px-1.5 py-0.5 text-[10px] font-semibold text-ink-300">
              <SystemIcon slug={drug.system_slug} className="h-2.5 w-2.5" />
              {lang === 'ar' ? drug.system_ar : drug.system_en}
            </span>
          )}
        </div>
        {!compact && (
          <div className="mt-1 flex items-center gap-2 text-[10.5px] text-ink-400">
            <span className="font-bold text-brand-300 num">{count} {lang === 'ar' ? 'منتج' : 'products'}</span>
            {drug.atc_code && <span className="font-mono">ATC {drug.atc_code}</span>}
          </div>
        )}
      </div>
      {typeof drug.score === 'number' && drug.score < 1 && (
        <span className="shrink-0 rounded-lg bg-white/[.06] px-1.5 py-1 text-[9.5px] font-bold text-ink-400 num">
          {Math.round(drug.score * 100)}%
        </span>
      )}
    </Link>
  );
}

export type ProductRecord = {
  id: number; trade_name: string; trade_name_ar?: string | null; strength?: string | null; dosage_form?: string | null;
  pack_size?: string | null; manufacturer_name?: string | null; manufacturer_country?: string | null;
  agent_name?: string | null; country?: string | null; image_url?: string | null; verified?: number;
  price?: number | null; currency?: string | null; generic_name?: string | null; generic_ar?: string | null;
  drug_id?: number | null; score?: number; barcode?: string | null; description_ar?: string | null;
};

export function ProductCard({ product, horizontal = false }: { product: ProductRecord; horizontal?: boolean }) {
  const { lang, t } = useI18n();
  const name = lang === 'ar' && product.trade_name_ar ? product.trade_name_ar : product.trade_name;
  const sub = [product.strength, product.dosage_form].filter(Boolean).join(' · ');
  return (
    <Link
      to={`/products/${product.id}`}
      className={cx(
        'group relative overflow-hidden rounded-3xl border border-white/[.07] bg-ink-900/60 backdrop-blur-xl transition',
        'hover:-translate-y-0.5 hover:border-brand-400/35 hover:shadow-glow',
        horizontal ? 'flex items-center gap-3 p-2.5' : 'flex flex-col',
      )}
    >
      <div className={cx('photo-plate relative overflow-hidden', horizontal ? 'h-[78px] w-[78px] shrink-0 rounded-2xl' : 'aspect-square w-full')}>
        <SmartImage
          src={product.image_url}
          productId={product.id}
          alt={product.trade_name}
          className={cx('h-full w-full object-contain transition duration-500 group-hover:scale-[1.05]', horizontal ? 'p-1' : 'p-3')}
          rounded=""
        />
        {product.verified ? (
          <span className="absolute start-1.5 top-1.5 inline-flex items-center gap-0.5 rounded-full bg-gradient-to-r from-amber-300 to-amber-500 px-1.5 py-0.5 text-[8.5px] font-black text-ink-950 shadow-[0_4px_12px_-4px_rgba(245,158,11,.8)]">
            <BadgeCheck className="h-2.5 w-2.5" /> MDA
          </span>
        ) : null}
      </div>

      <div className={cx('min-w-0 flex-1', horizontal ? 'py-0.5' : 'p-3')}>
        <div className="flex items-start justify-between gap-1.5">
          <h3 className="line-clamp-1 text-[12.5px] font-bold text-white">{name}</h3>
          {product.price ? (
            <span className="shrink-0 rounded-md bg-brand-500/15 px-1.5 py-0.5 text-[11px] font-extrabold text-brand-200 num">
              {fmt(product.price)} <span className="text-[8px] font-semibold text-ink-400">{product.currency || 'YER'}</span>
            </span>
          ) : null}
        </div>
        <p className="line-clamp-1 text-[11px] font-medium text-ink-400" dir="auto">{sub || product.generic_name || ''}</p>
        {!horizontal && (
          <div className="mt-2 flex items-center justify-between gap-2">
            <span className="line-clamp-1 text-[10px] font-semibold text-ink-400">{product.manufacturer_name || product.country}</span>
            {product.country && (
              <span className="inline-flex shrink-0 items-center gap-0.5 text-[9.5px] text-ink-400"><MapPin className="h-2.5 w-2.5" />{product.country}</span>
            )}
          </div>
        )}
        {horizontal && product.manufacturer_name && (
          <div className="mt-1 flex items-center gap-1 text-[10px] text-ink-500">
            <span className="line-clamp-1">{product.manufacturer_name}</span>
            <span className="text-ink-600">•</span>
            <span>{product.country}</span>
          </div>
        )}
      </div>
    </Link>
  );
}

export function ProductGrid({ products }: { products: ProductRecord[] }) {
  return (
    <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-4">
      {products.map((p) => <ProductCard key={p.id} product={p} />)}
    </div>
  );
}

/* Minimal safe markdown for AI answers */
export function RichText({ text, className = '' }: { text: string; className?: string }) {
  const escaped = (text || '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const html = escaped
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/_(.+?)_/g, '<em>$1</em>')
    .replace(/^[-•] (.+)$/gm, '<li>$1</li>')
    .replace(/(<li>.*<\/li>)/gs, '<ul>$1</ul>')
    .replace(/\n{2,}/g, '<br/><br/>')
    .replace(/\n/g, '<br/>');
  return <div className={cx('rich-text', className)} dangerouslySetInnerHTML={{ __html: html }} />;
}
