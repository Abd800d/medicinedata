import { useMemo, useState } from 'react';
import { Search } from 'lucide-react';
import { useApi } from '../lib/useApi';
import { SystemCard, SystemRecord } from '../components/catalog';
import { useI18n } from '../lib/i18n';
import { ErrorState } from '../components/ui';

export default function Systems() {
  const { t, lang } = useI18n();
  const { data, error, loading, reload } = useApi<SystemRecord[]>('/api/catalog/systems');
  const [q, setQ] = useState('');

  const filtered = useMemo(() => {
    if (!data) return [];
    if (!q.trim()) return data;
    const norm = q.toLowerCase().trim();
    return data.filter((s) => `${s.name_ar} ${s.name_en} ${s.slug}`.toLowerCase().includes(norm));
  }, [data, q]);

  return (
    <div className="space-y-4">
      <div className="rounded-3xl page-hero p-5 text-white">
        <h1 className="text-[22px] font-extrabold">{t('home.systemsTitle')}</h1>
        <p className="mt-1 text-[11.5px] text-white/75">{t('home.systemsSub')}</p>
        <div className="mt-3 flex items-center gap-2 rounded-2xl border border-white/25 bg-white/95 p-1.5 shadow-[0_16px_36px_-20px_rgba(2,12,40,.9)]">
          <Search className="ms-1.5 h-4 w-4 text-[#0a53c4]" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={lang === 'ar' ? 'ابحث في الأجهزة…' : 'Filter systems…'}
            className="min-w-0 flex-1 bg-transparent px-1 py-1.5 text-[12.5px] font-semibold text-[#0a1930] outline-none placeholder:font-medium placeholder:text-[#5f7fae]"
          />
        </div>
      </div>

      {error && !data ? <ErrorState message={error} onRetry={reload} /> : null}

      <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 sm:gap-2.5 lg:grid-cols-6">
        {filtered.map((s, i) => <SystemCard key={s.id} system={s} index={i} />)}
        {loading && Array.from({ length: 12 }).map((_, i) => <div key={i} className="skeleton h-[96px]" />)}
      </div>
      {!loading && !filtered.length && <div className="py-10 text-center text-sm text-ink-400">{t('common.noResults')}</div>}
    </div>
  );
}
