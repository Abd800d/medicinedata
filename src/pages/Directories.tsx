import { useState } from 'react';
import { Building2, Globe2, Mail, MapPin, Phone, Search, Truck, Users, ExternalLink } from 'lucide-react';
import { useApi } from '../lib/useApi';
import { useI18n } from '../lib/i18n';
import { Badge, EmptyState, PageLoader } from '../components/ui';
import { useDebounced, cx } from '../lib/utils';

type Org = {
  id: number; name: string; name_ar?: string; country?: string; city?: string; phone?: string; email?: string;
  website?: string; notes?: string; products_count?: number;
};

export default function Directories() {
  const { t, lang } = useI18n();
  const [tab, setTab] = useState<'agents' | 'manufacturers'>('agents');
  const [q, setQ] = useState('');
  const query = useDebounced(q, 300);
  const { data, loading } = useApi<Org[]>(tab === 'agents' ? '/api/catalog/agents' : '/api/catalog/manufacturers', { q: query || undefined });

  return (
    <div className="space-y-4">
      <div className="page-hero page-hero-violet p-5 text-white">
        <div className="flex items-center gap-2"><Users className="h-5 w-5" /><h1 className="text-[21px] font-extrabold">{t('dir.title')}</h1></div>
        <p className="mt-1 max-w-lg text-[11.5px] leading-6 text-white/80">{t('dir.subtitle')}</p>
      </div>

      <div className="grid grid-cols-2 gap-1 rounded-2xl border border-white/[.08] bg-white/[.04] p-1 backdrop-blur">
        {([['agents', t('dir.agents'), Truck], ['manufacturers', t('dir.manufacturers'), Building2]] as const).map(([id, label, Icon]) => (
          <button key={id} onClick={() => setTab(id as any)} className={cx('flex items-center justify-center gap-1.5 rounded-xl py-2 text-[12px] font-bold transition', tab === id ? 'bg-brand-grad text-white shadow-glow' : 'text-ink-400 hover:text-white')}>
            <Icon className="h-3.5 w-3.5" />{label}
          </button>
        ))}
      </div>

      <div className="flex items-center gap-2 rounded-2xl border p-1.5 border-white/[.08] bg-ink-900">
        <Search className="ms-1.5 h-4 w-4 text-ink-400" />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={tab === 'agents' ? t('dir.searchAgents') : t('dir.searchManufacturers')} className="min-w-0 flex-1 bg-transparent px-1 py-1.5 text-[12.5px] font-semibold text-white outline-none placeholder:text-ink-400" />
      </div>

      {loading && <PageLoader />}
      {data?.length === 0 && <EmptyState icon={tab === 'agents' ? <Truck className="h-6 w-6" /> : <Building2 className="h-6 w-6" />} title={t('common.noResults')} />}

      <div className="grid gap-2.5 sm:grid-cols-2">
        {(data || []).map((o) => (
          <div key={o.id} className="card group relative overflow-hidden p-4 transition hover:border-brand-400/40 hover:shadow-glow">
            <span className="pointer-events-none absolute -end-6 -top-6 h-20 w-20 rounded-full bg-brand-500/10 blur-2xl" />
            <div className="relative flex items-start justify-between gap-2">
              <div className="flex min-w-0 items-start gap-2.5">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brand-grad text-[11px] font-extrabold on-color shadow-glow">
                  {(o.name || 'MDA').trim().split(/\s+/).slice(0, 2).map((w) => w[0]).join('') || 'MDA'}
                </span>
                <div className="min-w-0">
                  <h3 className="text-[13px] font-extrabold leading-snug text-white">{o.name}</h3>
                  {o.name_ar && <div className="text-[11px] text-ink-400" dir="auto">{o.name_ar}</div>}
                </div>
              </div>
              <Badge tone="brand">{o.products_count ?? 0} {t('dir.products')}</Badge>
            </div>
            <div className="mt-2 space-y-1 text-[11px] text-ink-500">
              <div className="flex items-center gap-1.5"><Globe2 className="h-3 w-3" />{o.country || '—'}{o.city ? ` · ${o.city}` : ''}</div>
              {o.phone && <a href={`tel:${o.phone}`} className="flex items-center gap-1.5 font-semibold text-brand-300"><Phone className="h-3 w-3" /><span dir="ltr">{o.phone}</span></a>}
              {o.email && <a href={`mailto:${o.email}`} className="flex items-center gap-1.5 font-semibold text-brand-300"><Mail className="h-3 w-3" />{o.email}</a>}
              {o.website && <a href={o.website.startsWith('http') ? o.website : `https://${o.website}`} target="_blank" rel="noreferrer" className="flex items-center gap-1.5 font-semibold text-sky-200"><ExternalLink className="h-3 w-3" />{o.website.replace(/^https?:\/\//, '')}</a>}
            </div>
            {o.notes && <p className="mt-2 line-clamp-2 text-[10.5px] leading-5 text-ink-400">{o.notes}</p>}
          </div>
        ))}
      </div>
      <p className="text-center text-[10.5px] leading-5 text-ink-400">{lang === 'ar' ? 'تُحدَّث بيانات الوكلاء والمصنّعين من لوحة الإدارة.' : 'Agent and manufacturer data is managed from the admin panel.'}</p>
    </div>
  );
}
