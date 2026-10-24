import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  AlertTriangle, BadgeCheck, Building2, ChevronLeft, ChevronRight, Copy, Globe2, Heart, MapPin, MessageCircle,
  Package, Pencil, Share2, ShieldCheck, Truck, UserRound, Pill, Phone,
} from 'lucide-react';
import { useApi } from '../lib/useApi';
import { useI18n } from '../lib/i18n';
import { useAuth } from '../lib/auth';
import { useConfig } from '../lib/config';
import { api, assetUrl } from '../lib/api';
import { Badge, EmptyState, ErrorState, PageLoader, SmartImage, useToast } from '../components/ui';
import { ProductCard, ProductRecord } from '../components/catalog';
import { copyText, cx, fmt, shareItem } from '../lib/utils';

export default function ProductDetail() {
  const { id } = useParams();
  const { t, lang } = useI18n();
  const { user } = useAuth();
  const { config } = useConfig();
  const { push } = useToast();
  const navigate = useNavigate();
  const { data: p, loading, error, reload } = useApi<any>(`/api/catalog/products/${id}`);
  const [active, setActive] = useState(0);

  if (loading && !p) return <PageLoader />;
  if (error && !p) {
    if (/not found|404/i.test(String(error))) {
      return (
        <EmptyState icon={<Package className="h-6 w-6 text-ink-400" />} title={t('errors.notFoundProduct')}
          action={<Link to="/search" className="btn-primary">{t('errors.searchInstead')}</Link>} />
      );
    }
    return <ErrorState message={error} onRetry={reload} />;
  }
  if (!p) return null;

  const arabic = lang === 'ar';
  const name = arabic && p.trade_name_ar ? p.trade_name_ar : p.trade_name;
  const gallery = [
    ...(p.images || []).map((x: any) => assetUrl(x.url)),
    `/api/catalog/product-image/${p.id}.svg`,
  ].filter((v, i, arr) => arr.indexOf(v) === i);
  const main = p.image_url ? assetUrl(p.image_url) : gallery[0];
  const shown = active === 0 && p.image_url ? main : gallery[active] || main;
  const wa = (config.whatsapp || '').replace(/[^\d]/g, '');

  const rows = [
    { label: t('product.strength'), value: p.strength, icon: Pill },
    { label: t('product.form'), value: p.dosage_form, icon: Package },
    { label: t('product.pack'), value: p.pack_size, icon: Package },
    { label: t('product.country'), value: p.country, icon: MapPin },
    { label: t('product.barcode'), value: p.barcode, icon: Globe2 },
  ].filter((r) => r.value);

  const onShare = async () => {
    const ok = await shareItem({ title: `${p.trade_name} ${p.strength || ''} — MDA`, text: p.generic_name || '', url: location.href });
    if (ok) push(t('common.copied'));
  };

  return (
    <div className="space-y-4">
      <div className="relative overflow-hidden rounded-3xl border border-ink-200 bg-white p-4 dark:border-ink-800 dark:bg-ink-900">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-1.5">
            {p.verified ? <Badge tone="brand"><BadgeCheck className="h-3 w-3" />{t('common.verified')}</Badge> : null}
            <Badge>{p.dosage_form || '—'}</Badge>
          </div>
          <div className="flex gap-1.5">
            <button onClick={onShare} className="icon-btn h-9 w-9 border border-ink-200 dark:border-ink-700"><Share2 className="h-4 w-4" /></button>
            {user?.role === 'admin' && (
              <Link to={`/admin?tab=products&edit=${p.id}`} className="icon-btn h-9 w-9 border border-ink-200 dark:border-ink-700"><Pencil className="h-4 w-4" /></Link>
            )}
          </div>
        </div>

        <div className="mx-auto mt-2 flex h-[240px] w-full max-w-[300px] items-center justify-center rounded-2xl bg-gradient-to-br from-ink-50 to-brand-50/40 p-2 dark:from-ink-800 dark:to-ink-900">
          <img src={shown} alt={p.trade_name} className="h-full w-full object-contain" />
        </div>
        {gallery.length > 1 && (
          <div className="mt-2 flex justify-center gap-1.5 overflow-x-auto no-scrollbar">
            {gallery.map((g, i) => (
              <button key={g + i} onClick={() => setActive(i)} className={cx('h-12 w-12 shrink-0 overflow-hidden rounded-lg border bg-ink-50 p-0.5 dark:bg-ink-800', active === i ? 'border-brand-500 ring-2 ring-brand-500/20' : 'border-ink-200 dark:border-ink-700')}>
                <img src={g} alt="" className="h-full w-full object-contain" />
              </button>
            ))}
          </div>
        )}
        <p className="mt-1.5 text-center text-[9px] text-ink-400">{t('product.noPhotoNote')}</p>

        <div className="mt-3 text-center">
          <h1 className="text-[20px] font-extrabold leading-tight text-ink-900 dark:text-white">{name}</h1>
          <p className="text-[11.5px] text-ink-400" dir="auto">{arabic ? p.trade_name : p.trade_name_ar}</p>
          <div className="mt-1 flex flex-wrap items-center justify-center gap-1.5">
            {p.strength && <span className="chip">{p.strength}</span>}
            {p.dosage_form && <span className="chip">{p.dosage_form}</span>}
            {p.price ? <span className="chip border-brand-200 text-brand-800 dark:border-brand-800 dark:text-brand-300">{fmt(p.price)} {p.currency || 'YER'}</span> : null}
          </div>
          {p.drug_id && (
            <Link to={`/drugs/${p.drug_id}`} className="mt-2 inline-flex items-center gap-1 rounded-full bg-brand-50 px-3 py-1 text-[11px] font-bold text-brand-800 dark:bg-brand-900/40 dark:text-brand-200">
              <Pill className="h-3 w-3" />{arabic ? p.generic_ar || p.generic_name : p.generic_name}
              <ChevronLeft className="h-3 w-3 rtl:block ltr:hidden" />
              <ChevronRight className="hidden h-3 w-3 ltr:block" />
            </Link>
          )}
        </div>
      </div>

      <div className="grid gap-2 sm:grid-cols-2">
        <div className="card p-4">
          <div className="mb-2 flex items-center gap-2 text-[11px] font-bold text-ink-500"><Building2 className="h-3.5 w-3.5" />{t('product.manufacturer')}</div>
          <div className="text-[13px] font-bold text-ink-900 dark:text-white">{p.manufacturer_name || t('common.notAvailable')}</div>
          <div className="mt-0.5 flex items-center gap-1 text-[11px] text-ink-500"><MapPin className="h-3 w-3" />{p.manufacturer_country || p.country || '—'}</div>
        </div>
        <div className="card p-4">
          <div className="mb-2 flex items-center gap-2 text-[11px] font-bold text-ink-500"><Truck className="h-3.5 w-3.5" />{t('product.agent')}</div>
          {p.agent_name ? (
            <>
              <div className="text-[13px] font-bold text-ink-900 dark:text-white">{p.agent_name}</div>
              <div className="mt-0.5 flex flex-wrap items-center gap-2 text-[11px] text-ink-500">
                {p.agent_city && <span className="inline-flex items-center gap-0.5"><MapPin className="h-3 w-3" />{p.agent_city}</span>}
                {p.agent_phone && <a href={`tel:${p.agent_phone}`} className="inline-flex items-center gap-0.5 text-brand-700"><Phone className="h-3 w-3" />{p.agent_phone}</a>}
              </div>
            </>
          ) : (
            <div className="text-[11.5px] leading-6 text-ink-400">{t('product.agentNotSet')}</div>
          )}
        </div>
      </div>

      {rows.length > 0 && (
        <div className="card divide-soft px-4">
          {rows.map((r) => (
            <div key={r.label} className="flex items-center justify-between gap-2 py-2.5">
              <span className="inline-flex items-center gap-1.5 text-[11px] text-ink-500"><r.icon className="h-3.5 w-3.5" />{r.label}</span>
              <span className="text-[12px] font-semibold text-ink-800 dark:text-ink-200" dir="auto">{r.value}</span>
            </div>
          ))}
        </div>
      )}

      {p.barcode && (
        <button onClick={async () => { await copyText(p.barcode); push(t('common.copied')); }} className="flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-ink-300 py-2.5 text-[11px] font-semibold text-ink-500 dark:border-ink-700">
          <Copy className="h-3.5 w-3.5" /> {p.barcode}
        </button>
      )}

      <div className="grid grid-cols-2 gap-2">
        <a href={`https://wa.me/${wa}?text=${encodeURIComponent(`${arabic ? 'استفسار عن منتج' : 'Product enquiry'}: ${p.trade_name} ${p.strength || ''}`)}`} target="_blank" rel="noreferrer" className="btn-soft">
          <MessageCircle className="h-4 w-4" />{arabic ? 'استفسر عن التوفر' : 'Ask availability'}
        </a>
        <a href={`mailto:${config.support_email}?subject=${encodeURIComponent(`MDA: ${p.trade_name}`)}`} className="btn-ghost">
          <AlertTriangle className="h-4 w-4" />{arabic ? 'أبلغ عن خطأ' : 'Report an issue'}
        </a>
      </div>

      {p.indications_ar && (
        <div className="card p-4">
          <div className="mb-1.5 flex items-center gap-2 text-brand-700 dark:text-brand-300"><ShieldCheck className="h-4 w-4" /><span className="text-[12.5px] font-extrabold">{t('drug.indications')}</span></div>
          <p className="prose-ar">{arabic ? p.indications_ar : p.indications_en}</p>
          {p.dosage_adult && <p className="mt-2 text-[11px] text-ink-500"><b>{t('drug.adult')}:</b> {p.dosage_adult}</p>}
        </div>
      )}

      {p.alternatives?.length > 0 && (
        <div>
          <div className="mb-2 flex items-center justify-between">
            <h2 className="section-title">{t('product.alternatives')}</h2>
            <Link to={`/drugs/${p.drug_id}`} className="text-[11px] font-bold text-brand-700 dark:text-brand-300">{t('common.viewAll')}</Link>
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            {p.alternatives.map((a: ProductRecord) => <ProductCard key={a.id} product={a} horizontal />)}
          </div>
        </div>
      )}

      <div className="flex items-start gap-2 rounded-2xl border border-amber-200 bg-amber-50 p-3.5 text-[10.5px] leading-5 text-amber-800 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-300">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
        <span>{config.disclaimer_ar}</span>
      </div>
    </div>
  );
}
