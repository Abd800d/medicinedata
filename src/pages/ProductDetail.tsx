import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  AlertTriangle, BadgeCheck, Building2, Camera, ChevronLeft, ChevronRight, Copy, Globe2, Heart, MapPin, MessageCircle,
  Package, Pencil, Share2, ShieldCheck, Truck, UserRound, Pill, Phone,
} from 'lucide-react';
import { useApi } from '../lib/useApi';
import { useI18n } from '../lib/i18n';
import { useAuth } from '../lib/auth';
import { useConfig } from '../lib/config';
import { api, assetUrl } from '../lib/api';
import { Badge, EmptyState, ErrorState, PageLoader, SmartImage, useToast } from '../components/ui';
import { ProductCard, ProductRecord } from '../components/catalog';
import ProductImages from '../components/ProductImages';
import { VerificationBadge, VerificationPanel } from '../components/Verification';
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
  const [photosOpen, setPhotosOpen] = useState(true);
  const canManagePhotos = user?.role === 'admin' || user?.role === 'pharmacist';

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
      <div className="card overflow-hidden p-0">
        <div className="relative">
          <div className="photo-plate relative flex h-[268px] items-center justify-center overflow-hidden p-4 sm:h-[320px]">
            <img src={shown} alt={p.trade_name} className="h-full w-full object-contain drop-shadow-[0_22px_36px_rgba(8,35,86,.28)]" />

            <div className="absolute start-3 top-3 flex flex-col items-start gap-1.5">
              {/* Six states, not a boolean: «مُقدَّم من مستخدم» must never look like «موثّق». */}
              <span className="rounded-full bg-ink-950/80 p-0.5 shadow-sm">
                <VerificationBadge state={p.verification_detail?.state || p.verification} review={p.review_status}
                  lang={lang as 'ar' | 'en'} />
              </span>
              <span className="rounded-full bg-ink-950/75 px-2 py-1 text-[9.5px] font-bold text-white backdrop-blur">{p.dosage_form || '—'}</span>
            </div>

            <div className="absolute end-3 top-3 flex gap-1.5">
              <button onClick={onShare} className="flex h-9 w-9 items-center justify-center rounded-full bg-ink-950/70 text-white backdrop-blur transition hover:bg-ink-950/90"><Share2 className="h-4 w-4" /></button>
              {(user?.role === 'admin' || user?.role === 'pharmacist') && (
                <button onClick={() => {
                  setPhotosOpen(true);
                  setTimeout(() => document.getElementById('product-photos')?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 60);
                }} aria-label={arabic ? 'إضافة صورة من الهاتف' : 'Add photo'}
                  className="flex h-9 w-9 items-center justify-center rounded-full bg-brand-600/90 text-white backdrop-blur transition hover:bg-brand-600"><Camera className="h-4 w-4" /></button>
              )}
              {user?.role === 'admin' && (
                <Link to={`/admin?tab=products&edit=${p.id}`} className="flex h-9 w-9 items-center justify-center rounded-full bg-ink-950/70 text-white backdrop-blur transition hover:bg-ink-950/90"><Pencil className="h-4 w-4" /></Link>
              )}
            </div>

            {gallery.length > 1 && (
              <div className="no-scrollbar absolute inset-x-0 bottom-2 flex justify-center gap-1.5 overflow-x-auto px-3">
                {gallery.map((g, i) => (
                  <button key={g + i} onClick={() => setActive(i)}
                    className={cx('h-11 w-11 shrink-0 overflow-hidden rounded-xl border bg-white p-0.5 transition',
                      active === i ? 'border-brand-400 ring-2 ring-brand-400/40' : 'border-white/60 opacity-80 hover:opacity-100')}>
                    <img src={g} alt="" className="h-full w-full object-contain" />
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="px-4 pb-4 pt-3 text-center">
            <h1 className="text-[21px] font-black leading-tight text-white">{name}</h1>
            <p className="mt-0.5 text-[11px] text-ink-400" dir="auto">{arabic ? p.trade_name : p.trade_name_ar}</p>
            <div className="mt-2 flex flex-wrap items-center justify-center gap-1.5">
              {p.strength && <span className="chip">{p.strength}</span>}
              {p.dosage_form && <span className="chip">{p.dosage_form}</span>}
              {p.price ? <span className="rounded-full border border-brand-400/30 bg-brand-500/15 px-3 py-1 text-[11px] font-extrabold text-brand-200 num">{fmt(p.price)} {p.currency || 'YER'}</span> : null}
            </div>
            {p.drug_id && (
              <Link to={`/drugs/${p.drug_id}`} className="mt-2.5 inline-flex items-center gap-1 rounded-full border border-brand-400/25 bg-brand-500/15 px-3 py-1 text-[11px] font-bold text-brand-200 transition hover:bg-brand-500/25">
                <Pill className="h-3 w-3" />{arabic ? p.generic_ar || p.generic_name : p.generic_name}
                <ChevronLeft className="h-3 w-3 rtl:block ltr:hidden" />
                <ChevronRight className="hidden h-3 w-3 ltr:block" />
              </Link>
            )}
            <p className="mt-2 text-[9.5px] text-ink-500">{t('product.noPhotoNote')}</p>
          </div>
        </div>
      </div>

      {/* Staff: add or re-crop a photo of this pack straight from the phone, no admin panel needed. */}
      {canManagePhotos && (
        <div className="card p-3.5" id="product-photos">
          <button onClick={() => setPhotosOpen((v) => !v)} className="flex w-full items-center gap-2">
            <Camera className="h-4 w-4 text-brand-300" />
            <span className="flex-1 text-start text-[12px] font-extrabold">
              {arabic ? 'صور هذا الدواء' : 'Photos of this medicine'}
            </span>
            <span className="rounded-full bg-brand-500/15 px-2 py-0.5 text-[9.5px] font-bold text-brand-200">
              {arabic ? 'إضافة / تعديل' : 'Add / edit'}
            </span>
          </button>
          {photosOpen && (
            <div className="mt-3">
              <ProductImages product={p} compact onChange={reload} />
            </div>
          )}
        </div>
      )}

      <div className="grid gap-2 sm:grid-cols-2">
        <div className="card p-4">
          <div className="mb-2 flex items-center gap-2 text-[11px] font-bold text-ink-500"><Building2 className="h-3.5 w-3.5" />{t('product.manufacturer')}</div>
          <div className="text-[13px] font-bold text-white">{p.manufacturer_name || t('common.notAvailable')}</div>
          <div className="mt-0.5 flex items-center gap-1 text-[11px] text-ink-500"><MapPin className="h-3 w-3" />{p.manufacturer_country || p.country || '—'}</div>
        </div>
        <div className="card p-4">
          <div className="mb-2 flex items-center gap-2 text-[11px] font-bold text-ink-500"><Truck className="h-3.5 w-3.5" />{t('product.agent')}</div>
          {p.agent_name ? (
            <>
              <div className="text-[13px] font-bold text-white">{p.agent_name}</div>
              <div className="mt-0.5 flex flex-wrap items-center gap-2 text-[11px] text-ink-500">
                {p.agent_city && <span className="inline-flex items-center gap-0.5"><MapPin className="h-3 w-3" />{p.agent_city}</span>}
                {p.agent_phone && <a href={`tel:${p.agent_phone}`} className="inline-flex items-center gap-0.5 text-brand-300"><Phone className="h-3 w-3" />{p.agent_phone}</a>}
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
              <span className="text-[12px] font-semibold text-ink-200" dir="auto">{r.value}</span>
            </div>
          ))}
        </div>
      )}

      {/* The review trail, on the page a pharmacist actually reads. */}
      <VerificationPanel detail={p.verification_detail} lang={lang as 'ar' | 'en'} />

      {p.barcode && (
        <div className="space-y-1">
          <button onClick={async () => { await copyText(p.barcode); push(t('common.copied')); }} className="flex w-full items-center justify-center gap-2 rounded-2xl border border-dashed border-white/15 py-2.5 text-[11px] font-semibold text-ink-300">
            <Copy className="h-3.5 w-3.5" /> <span dir="ltr">{p.barcode}</span>
          </button>
          {p.barcode_source === 'internal-ean13' && (
            <p className="text-center text-[10px] leading-4 text-ink-400">
              {arabic ? 'رمز داخلي للمتجر (غير مطبوع على العلبة)' : 'Internal store code (not printed on the pack)'}
            </p>
          )}
          {p.barcode_verified === 1 && (
            <p className="text-center text-[10px] font-semibold leading-4 text-emerald-400">{arabic ? 'باركود موثّق من العلبة' : 'Barcode verified from the pack'}</p>
          )}
        </div>
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
          <div className="mb-1.5 flex items-center gap-2 text-brand-300"><ShieldCheck className="h-4 w-4" /><span className="text-[12.5px] font-extrabold">{t('drug.indications')}</span></div>
          <p className="prose-ar">{arabic ? p.indications_ar : p.indications_en}</p>
          {p.dosage_adult && <p className="mt-2 text-[11px] text-ink-500"><b>{t('drug.adult')}:</b> {p.dosage_adult}</p>}
        </div>
      )}

      {p.alternatives?.length > 0 && (
        <div>
          <div className="mb-2 flex items-center justify-between">
            <h2 className="section-title">{t('product.alternatives')}</h2>
            <Link to={`/drugs/${p.drug_id}`} className="text-[11px] font-bold text-brand-300">{t('common.viewAll')}</Link>
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            {p.alternatives.map((a: ProductRecord) => <ProductCard key={a.id} product={a} horizontal />)}
          </div>
        </div>
      )}

      <div className="flex items-start gap-2 rounded-2xl border p-3.5 text-[11px] leading-5 border-amber-400/25 bg-amber-500/10 text-amber-200">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
        <span>{config.disclaimer_ar}</span>
      </div>
    </div>
  );
}
