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
      <div className="rounded-3xl bg-gradient-to-br from-brand-800 via-brand-700 to-cyan-800 p-5 text-white">
        <h1 className="text-[22px] font-extrabold">{t('home.systemsTitle')}</h1>
        <p className="mt-1 text-[11.5px] text-white/75">{t('home.systemsSub')}</p>
        <div className="mt-3 flex items-center gap-2 rounded-xl bg-white/95 p-1.5">
          <Search className="ms-1.5 h-4 w-4 text-brand-700" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={lang === 'ar' ? 'ابحث في الأجهزة…' : 'Filter systems…'}
            className="min-w-0 flex-1 bg-transparent px-1 py-1.5 text-[12.5px] text-ink-900 outline-none placeholder:text-ink-400"
          />
        </div>
      </div>

      {error && !data ? <ErrorState message={error} onRetry={reload} /> : null}

      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-4">
        {filtered.map((s, i) => <SystemCard key={s.id} system={s} index={i} />)}
        {loading && Array.from({ length: 8 }).map((_, i) => <div key={i} className="skeleton h-[104px]" />)}
      </div>
      {!loading && !filtered.length && <div className="py-10 text-center text-sm text-ink-400">{t('common.noResults')}</div>}
    </div>
  );
}
