import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  AlertTriangle, BadgeCheck, Bot, ChevronLeft, ChevronRight, ClipboardList, Clock, Droplets, FlaskConical,
  Heart, Info, MapPin, Package, Pencil, Pill, Share2, ShieldAlert, ShieldCheck, Sparkles, PackageSearch, Users,
} from 'lucide-react';
import { useApi } from '../lib/useApi';
import { useI18n } from '../lib/i18n';
import { useAuth } from '../lib/auth';
import { useConfig } from '../lib/config';
import { api } from '../lib/api';
import { Badge, EmptyState, ErrorState, PageLoader, SmartImage, Tabs, useToast } from '../components/ui';
import { ProductCard, SystemIcon } from '../components/catalog';
import { cx, fmt, shareItem } from '../lib/utils';

export default function DrugDetail() {
  const { id } = useParams();
  const { t, lang } = useI18n();
  const { user } = useAuth();
  const { config } = useConfig();
  const { push } = useToast();
  const navigate = useNavigate();
  const { data: drug, loading, error, reload } = useApi<any>(`/api/catalog/drugs/${id}`);
  const [tab, setTab] = useState<'info' | 'dosage' | 'safety' | 'products'>('info');
  const [fav, setFav] = useState(false);

  useEffect(() => { setTab('info'); }, [id]);

  if (loading && !drug) return <PageLoader />;
  if (error && !drug) {
    if (/not found|404/i.test(String(error))) {
      return (
        <EmptyState icon={<Pill className="h-6 w-6 text-ink-400" />} title={t('errors.notFoundDrug')}
          action={<Link to="/search" className="btn-primary">{t('errors.searchInstead')}</Link>} />
      );
    }
    return <ErrorState message={error} onRetry={reload} />;
  }
  if (!drug) return null;

  const color = drug.system_color || '#0f766e';
  const arabic = lang === 'ar';
  const name = arabic && drug.generic_ar ? drug.generic_ar : drug.generic_name;
  const altName = arabic ? drug.generic_name : drug.generic_ar;

  const onFav = async () => {
    if (!user) { navigate('/auth'); return; }
    try {
      if (fav) await api.del(`/api/community/favorites/drug/${drug.id}`);
      else await api.post('/api/community/favorites', { target_type: 'drug', target_id: drug.id });
      setFav(!fav);
      push(fav ? 'أُزيل من المفضلة' : 'أُضيف إلى المفضلة');
    } catch { push('تعذر تحديث المفضلة', 'error'); }
  };

  const onShare = async () => {
    const ok = await shareItem({ title: `${drug.generic_name} — MDA`, text: drug.indications_ar || '', url: location.href });
    if (ok) push(t('common.copied'));
  };

  const infoRows = [
    { label: t('drug.indications'), value: arabic ? drug.indications_ar : drug.indications_en, icon: ClipboardList },
    { label: t('drug.mechanism'), value: arabic ? drug.mechanism_ar : drug.mechanism_en, icon: FlaskConical },
    { label: t('drug.halfLife'), value: drug.half_life, icon: Clock },
    { label: t('drug.storage'), value: drug.storage, icon: Droplets },
  ].filter((x) => x.value);

  const safetyRows = [
    { label: t('drug.warnings'), value: drug.warnings, tone: 'amber' as const, icon: AlertTriangle },
    { label: t('drug.contraindications'), value: drug.contraindications, tone: 'rose' as const, icon: ShieldAlert },
    { label: t('drug.sideEffects'), value: drug.side_effects, tone: 'neutral' as const, icon: Info },
    { label: t('drug.interactions'), value: drug.interactions, tone: 'violet' as const, icon: Users },
    { label: t('drug.pregnancy'), value: drug.pregnancy, tone: 'sky' as const, icon: ShieldCheck },
  ].filter((x) => x.value);

  const wa = (config.whatsapp || '').replace(/[^\d]/g, '');
  const askText = `${arabic ? 'استفسار عن' : 'Question about'} ${drug.generic_name} — MDA`;

  return (
    <div className="space-y-4">
      <div className="relative overflow-hidden rounded-3xl p-5 text-white" style={{ background: `linear-gradient(135deg, ${color}, #0b1220)` }}>
        <div className="absolute -end-10 -top-12 h-44 w-44 rounded-full bg-white/10" />
        <div className="relative flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="mb-2 flex flex-wrap items-center gap-1.5">
              {drug.system_slug && (
                <Link to={`/systems/${drug.system_slug}`} className="inline-flex items-center gap-1 rounded-full bg-white/15 px-2 py-0.5 text-[10px] font-semibold backdrop-blur">
                  <SystemIcon slug={drug.system_slug} className="h-3 w-3" />{arabic ? drug.system_ar : drug.system_en}
                </Link>
              )}
              {drug.prescription_required ? <span className="rounded-full bg-rose-500/90 px-2 py-0.5 text-[9.5px] font-bold">Rx · {t('common.rxOnly')}</span> : <span className="rounded-full bg-emerald-500/90 px-2 py-0.5 text-[9.5px] font-bold">{t('common.otc')}</span>}
              {drug.verified ? <span className="inline-flex items-center gap-0.5 rounded-full bg-white/15 px-2 py-0.5 text-[9.5px] font-semibold"><BadgeCheck className="h-2.5 w-2.5" />{t('common.verified')}</span> : null}
            </div>
            <h1 className="text-[23px] font-extrabold leading-tight">{name}</h1>
            <p className="mt-0.5 text-[12px] font-medium text-white/70" dir="ltr">{altName}</p>
            <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[10.5px] text-white/75">
              {drug.drug_class && <span>{drug.drug_class}</span>}
              {drug.atc_code && <span className="font-mono">ATC {drug.atc_code}</span>}
              {drug.category_ar && <span>· {arabic ? drug.category_ar : drug.category_en}</span>}
            </div>
          </div>
          <div className="flex shrink-0 flex-col gap-1.5">
            <button onClick={onFav} className={cx('flex h-9 w-9 items-center justify-center rounded-full backdrop-blur transition', fav ? 'bg-rose-500 text-white' : 'bg-white/15 text-white hover:bg-white/25')} aria-label="favorite"><Heart className={cx('h-4 w-4', fav && 'fill-current')} /></button>
            <button onClick={onShare} className="flex h-9 w-9 items-center justify-center rounded-full bg-white/15 text-white backdrop-blur hover:bg-white/25" aria-label="share"><Share2 className="h-4 w-4" /></button>
            {user?.role === 'admin' && <Link to={`/admin?tab=drugs&edit=${drug.id}`} className="flex h-9 w-9 items-center justify-center rounded-full bg-white/15 text-white backdrop-blur hover:bg-white/25" title={t('drug.editInAdmin')}><Pencil className="h-4 w-4" /></Link>}
          </div>
        </div>
        <div className="relative mt-4 flex items-center gap-2">
          <div className="flex-1 rounded-xl bg-black/15 px-3 py-2 backdrop-blur">
            <div className="text-[9.5px] text-white/60">{t('drug.productsAvailable')}</div>
            <div className="text-[16px] font-extrabold">{fmt(drug.products?.length || 0)}</div>
          </div>
          <a href={`https://wa.me/${wa}?text=${encodeURIComponent(askText)}`} target="_blank" rel="noreferrer" className="flex-1 rounded-xl bg-white/15 px-3 py-2 text-[11px] font-bold backdrop-blur hover:bg-white/25">
            {arabic ? 'استفسر من الصيدلي' : 'Ask a pharmacist'}
          </a>
        </div>
      </div>

      <Tabs
        value={tab}
        onChange={(v) => setTab(v as any)}
        tabs={[
          { id: 'info', label: t('drug.tabs.info'), icon: <Info className="h-3.5 w-3.5" /> },
          { id: 'dosage', label: t('drug.tabs.dosage'), icon: <ClipboardList className="h-3.5 w-3.5" /> },
          { id: 'safety', label: t('drug.tabs.safety'), icon: <ShieldAlert className="h-3.5 w-3.5" /> },
          { id: 'products', label: `${t('drug.tabs.products')} (${drug.products?.length || 0})`, icon: <Package className="h-3.5 w-3.5" /> },
        ]}
      />

      {tab === 'info' && (
        <div className="space-y-3">
          {infoRows.map((row) => (
            <section key={row.label} className="card p-4">
              <div className="mb-1.5 flex items-center gap-2 text-brand-700 dark:text-brand-300">
                <row.icon className="h-4 w-4" />
                <h2 className="text-[12.5px] font-extrabold">{row.label}</h2>
              </div>
              <p className="prose-ar whitespace-pre-line">{row.value}</p>
            </section>
          ))}
          {drug.synonyms && (
            <div className="card p-4">
              <div className="mb-1 text-[11px] font-bold text-ink-500">{arabic ? 'أسماء أخرى' : 'Synonyms'}</div>
              <div className="flex flex-wrap gap-1.5">{String(drug.synonyms).split(',').map((s: string) => <span key={s} className="chip">{s.trim()}</span>)}</div>
            </div>
          )}
          {drug.related?.length > 0 && (
            <section className="card p-4">
              <h2 className="mb-2 text-[12.5px] font-extrabold text-ink-900 dark:text-white">{t('drug.alternatives')}</h2>
              <div className="grid gap-1.5 sm:grid-cols-2">
                {drug.related.map((r: any) => (
                  <Link key={r.id} to={`/drugs/${r.id}`} className="flex items-center justify-between rounded-xl bg-ink-50 px-3 py-2 text-[11.5px] hover:bg-brand-50 dark:bg-ink-800/60">
                    <span className="font-semibold text-ink-700 dark:text-ink-200">{r.generic_name}</span>
                    <span className="text-[10px] text-ink-400">{r.products_count} {t('system.products')}</span>
                  </Link>
                ))}
              </div>
            </section>
          )}
          <div className="flex items-start gap-2 rounded-2xl border border-amber-200 bg-amber-50 p-3.5 text-[10.5px] leading-5 text-amber-800 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-300">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{t('drug.disclaimer')} {drug.source ? `— ${drug.source}` : ''}</span>
          </div>
        </div>
      )}

      {tab === 'dosage' && (
        <div className="space-y-3">
          {[['drug.adult', drug.dosage_adult], ['drug.child', drug.dosage_child]].map(([label, value]) => (
            value ? (
              <section key={label as string} className="card p-4">
                <h2 className="mb-1.5 text-[12.5px] font-extrabold text-ink-900 dark:text-white">{t(label as string)}</h2>
                <p className="prose-ar whitespace-pre-line">{value}</p>
              </section>
            ) : null
          ))}
          {!drug.dosage_adult && !drug.dosage_child && <EmptyState title={t('common.notAvailable')} />}
          <div className="card p-4">
            <h2 className="mb-1.5 text-[12.5px] font-extrabold text-ink-900 dark:text-white">{t('drug.pregnancy')}</h2>
            <p className="prose-ar">{drug.pregnancy || t('common.notAvailable')}</p>
          </div>
        </div>
      )}

      {tab === 'safety' && (
        <div className="space-y-3">
          {safetyRows.map((row) => (
            <section key={row.label} className={cx(
              'rounded-2xl border p-4',
              row.tone === 'rose' && 'border-rose-200 bg-rose-50/60 dark:border-rose-900/50 dark:bg-rose-950/20',
              row.tone === 'amber' && 'border-amber-200 bg-amber-50/60 dark:border-amber-900/50 dark:bg-amber-950/20',
              row.tone === 'violet' && 'border-violet-200 bg-violet-50/50 dark:border-violet-900/40 dark:bg-violet-950/20',
              row.tone === 'sky' && 'border-sky-200 bg-sky-50/50 dark:border-sky-900/40 dark:bg-sky-950/20',
              row.tone === 'neutral' && 'border-ink-200 bg-white dark:border-ink-800 dark:bg-ink-900',
            )}>
              <div className="mb-1.5 flex items-center gap-2">
                <row.icon className="h-4 w-4" />
                <h2 className="text-[12.5px] font-extrabold">{row.label}</h2>
              </div>
              <p className="prose-ar whitespace-pre-line">{row.value}</p>
            </section>
          ))}
          {!safetyRows.length && <EmptyState title={t('common.notAvailable')} />}
        </div>
      )}

      {tab === 'products' && (
        <div className="space-y-2.5">
          {drug.products?.length ? drug.products.map((p: any) => (
            <Link key={p.id} to={`/products/${p.id}`} className="flex items-center gap-3 rounded-2xl border border-ink-200 bg-white p-2.5 transition hover:border-brand-300 hover:shadow-card dark:border-ink-800 dark:bg-ink-900">
              <SmartImage src={p.image_url} productId={p.id} alt={p.trade_name} className="h-[74px] w-[74px] shrink-0 bg-ink-50 dark:bg-ink-800" rounded="rounded-xl" />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <h3 className="truncate text-[13px] font-bold text-ink-900 dark:text-white">{arabic && p.trade_name_ar ? p.trade_name_ar : p.trade_name}</h3>
                  {p.verified ? <BadgeCheck className="h-3.5 w-3.5 shrink-0 text-brand-600" /> : null}
                </div>
                <p className="truncate text-[11px] text-ink-500">{[p.strength, p.dosage_form, p.pack_size].filter(Boolean).join(' · ')}</p>
                <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[10px] text-ink-400">
                  {p.manufacturer_name && <span className="inline-flex items-center gap-0.5"><PackageSearch className="h-2.5 w-2.5" />{p.manufacturer_name}</span>}
                  {p.country && <span className="inline-flex items-center gap-0.5"><MapPin className="h-2.5 w-2.5" />{p.country}</span>}
                  {p.agent_name && <span className="hidden sm:inline-flex"><Users className="h-2.5 w-2.5" />{p.agent_name}</span>}
                </div>
              </div>
              <ChevronLeft className="h-4 w-4 shrink-0 text-ink-300 rtl:block ltr:hidden" />
              <ChevronRight className="hidden h-4 w-4 shrink-0 text-ink-300 ltr:block" />
            </Link>
          )) : <EmptyState title={t('common.noResults')} />}
        </div>
      )}

      <Link to="/ai" className="flex items-center gap-3 rounded-2xl border border-violet-200 bg-violet-50/70 p-3.5 dark:border-violet-900/40 dark:bg-violet-950/20">
        <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-violet-600 text-white"><Bot className="h-5 w-5" /></span>
        <div className="min-w-0 flex-1">
          <div className="text-[12.5px] font-bold text-violet-900 dark:text-violet-200">{t('ai.title')}</div>
          <div className="text-[10.5px] text-violet-700/70 dark:text-violet-300/70">{arabic ? `اسأل عن ${drug.generic_name}: الجرعات، البدائل، التفاعلات` : `Ask about ${drug.generic_name}: dosing, alternatives, interactions`}</div>
        </div>
        <Sparkles className="h-4 w-4 text-violet-600" />
      </Link>
    </div>
  );
}
