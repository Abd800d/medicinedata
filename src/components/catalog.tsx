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

export function SystemCard({ system, index = 0 }: { system: SystemRecord; index?: number }) {
  const { lang } = useI18n();
  const color = system.color || '#0f766e';
  return (
    <Link
      to={`/systems/${system.slug}`}
      className="group relative flex flex-col justify-between overflow-hidden rounded-2xl border border-ink-200/70 bg-white p-3 shadow-sm transition hover:-translate-y-0.5 hover:shadow-card dark:border-ink-800 dark:bg-ink-900"
      style={{ animationDelay: `${Math.min(index * 25, 220)}ms` }}
    >
      <span className="absolute inset-x-0 top-0 h-14 opacity-[0.07] transition group-hover:opacity-[0.14]" style={{ background: `radial-gradient(circle at 30% 0%, ${color}, transparent 70%)` }} />
      <div className="relative flex items-start justify-between">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl" style={{ backgroundColor: `${color}14`, color }}>
          <SystemIcon slug={system.slug} className="h-5 w-5" />
        </div>
        <ChevronLeft className="h-4 w-4 text-ink-300 transition group-hover:text-ink-500 rtl:block ltr:hidden" />
        <ChevronRight className="hidden h-4 w-4 text-ink-300 transition group-hover:text-ink-500 ltr:block" />
      </div>
      <div className="relative mt-2.5">
        <div className="text-[12.5px] font-extrabold leading-5 text-ink-900 dark:text-white">
          {lang === 'ar' ? system.name_ar : system.name_en}
        </div>
        <div className="text-[10px] leading-4 text-ink-400">{lang === 'ar' ? system.name_en : system.name_ar}</div>
        <div className="mt-1.5 flex items-center gap-1 text-[10px] font-semibold text-ink-500">
          <span>{fmt(system.drugs)} {lang === 'ar' ? 'دواء' : 'drugs'}</span>
          <span className="text-ink-300">•</span>
          <span>{fmt(system.products)} {lang === 'ar' ? 'منتج' : 'products'}</span>
        </div>
      </div>
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
  const { lang, t } = useI18n();
  const count = drug.products_count ?? drug.products ?? 0;
  return (
    <Link
      to={`/drugs/${drug.id}`}
      className="group flex items-center gap-3 rounded-2xl border border-ink-200/70 bg-white p-3 transition hover:border-brand-300 hover:shadow-card dark:border-ink-800 dark:bg-ink-900 dark:hover:border-brand-700"
    >
      <SmartImage
        src={drug.image_url}
        drugId={drug.id}
        alt={drug.generic_name}
        className="h-16 w-16 shrink-0 bg-ink-50 dark:bg-ink-800"
        rounded="rounded-xl"
      />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <h3 className="truncate text-[14px] font-bold text-ink-900 dark:text-white">{lang === 'ar' && drug.generic_ar ? drug.generic_ar : drug.generic_name}</h3>
          {drug.prescription_required ? <Badge tone="rose" className="shrink-0">Rx</Badge> : null}
        </div>
        <p className="truncate text-[11px] font-medium text-ink-400" dir="ltr">{lang === 'ar' ? drug.generic_name : drug.generic_ar || ''}</p>
        <div className="mt-1 flex flex-wrap items-center gap-1.5">
          {drug.drug_class && <span className="truncate rounded-md bg-brand-50 px-1.5 py-0.5 text-[10px] font-semibold text-brand-700 dark:bg-brand-900/40 dark:text-brand-300">{drug.drug_class}</span>}
          {drug.system_slug && (
            <span className="inline-flex items-center gap-1 rounded-md bg-ink-100 px-1.5 py-0.5 text-[10px] font-medium text-ink-500 dark:bg-ink-800">
              <SystemIcon slug={drug.system_slug} className="h-3 w-3" />
              {lang === 'ar' ? drug.system_ar : drug.system_en}
            </span>
          )}
        </div>
        {!compact && (
          <div className="mt-1 flex items-center gap-2 text-[10.5px] text-ink-400">
            <span className="font-semibold text-brand-700 dark:text-brand-300">{count} {lang === 'ar' ? 'منتج' : 'products'}</span>
            {drug.atc_code && <span className="font-mono">ATC {drug.atc_code}</span>}
          </div>
        )}
      </div>
      {typeof drug.score === 'number' && drug.score < 1 && (
        <span className="shrink-0 rounded-lg bg-ink-50 px-1.5 py-1 text-[9.5px] font-bold text-ink-400 dark:bg-ink-800">
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
        'group overflow-hidden rounded-2xl border border-ink-200/70 bg-white transition hover:border-brand-300 hover:shadow-card dark:border-ink-800 dark:bg-ink-900 dark:hover:border-brand-700',
        horizontal ? 'flex items-center gap-3 p-2.5' : 'flex flex-col',
      )}
    >
      <div className={cx('relative bg-gradient-to-br from-ink-50 to-brand-50/50 dark:from-ink-800 dark:to-ink-900', horizontal ? 'h-20 w-20 shrink-0 rounded-xl' : 'aspect-square w-full')}>
        <SmartImage src={product.image_url} productId={product.id} alt={product.trade_name} className="h-full w-full p-1.5" rounded={horizontal ? 'rounded-xl' : ''} />
        {product.verified ? (
          <span className="absolute end-1.5 top-1.5 inline-flex items-center gap-0.5 rounded-full bg-white/90 px-1.5 py-0.5 text-[8.5px] font-bold text-brand-700 shadow-sm dark:bg-ink-900/90 dark:text-brand-300">
            <BadgeCheck className="h-2.5 w-2.5" /> MDA
          </span>
        ) : null}
      </div>
      <div className={cx('min-w-0 flex-1', horizontal ? 'py-0.5' : 'p-3')}>
        <div className="flex items-start justify-between gap-1.5">
          <h3 className="line-clamp-1 text-[13px] font-bold text-ink-900 dark:text-white">{name}</h3>
          {product.price ? (
            <span className="shrink-0 text-[11px] font-extrabold text-brand-700 dark:text-brand-300">
              {fmt(product.price)} <span className="text-[8.5px] font-semibold text-ink-400">{product.currency || 'YER'}</span>
            </span>
          ) : null}
        </div>
        <p className="line-clamp-1 text-[11px] text-ink-500" dir="auto">{sub || product.generic_name || ''}</p>
        {!horizontal && (
          <div className="mt-2 flex items-center justify-between gap-2">
            <span className="line-clamp-1 text-[10px] text-ink-400">{product.manufacturer_name || product.country}</span>
            {product.country && (
              <span className="inline-flex shrink-0 items-center gap-0.5 text-[9.5px] text-ink-400"><MapPin className="h-2.5 w-2.5" />{product.country}</span>
            )}
          </div>
        )}
        {horizontal && product.manufacturer_name && (
          <div className="mt-1 flex items-center gap-1 text-[10px] text-ink-400">
            <span className="line-clamp-1">{product.manufacturer_name}</span>
            <span className="text-ink-300">•</span>
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
