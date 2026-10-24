import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ChevronDown, ChevronLeft, ChevronUp, Pill, Search } from 'lucide-react';
import { useApi } from '../lib/useApi';
import { useI18n } from '../lib/i18n';
import { DrugCard, SystemIcon } from '../components/catalog';
import { ErrorState, PageLoader, EmptyState, Badge } from '../components/ui';
import { cx, fmt } from '../lib/utils';

type Category = { id: number; slug: string; name_en: string; name_ar: string; drugs: number; description_ar?: string; description_en?: string };
type System = { id: number; slug: string; name_en: string; name_ar: string; color?: string; icon?: string; description_ar?: string; description_en?: string; category_list: Category[] };

export default function SystemDetail() {
  const { slug } = useParams();
  const { t, lang } = useI18n();
  const { data, error, loading, reload } = useApi<System>(`/api/catalog/systems/${slug}`);
  const [classId, setClassId] = useState<number | 'all'>('all');
  const [q, setQ] = useState('');
  const [openClass, setOpenClass] = useState<number | null>(null);

  const drugsQ = useApi<{ data: any[]; total: number }>('/api/catalog/drugs', {
    system: slug,
    category: classId === 'all' ? undefined : classId,
    q: q || undefined,
    limit: 100,
  }, { enabled: !!slug });

  const color = data?.color || '#0f766e';
  const classes = data?.category_list || [];
  const totalDrugs = useMemo(() => classes.reduce((a, c) => a + (c.drugs || 0), 0), [classes]);

  if (loading && !data) return <PageLoader />;
  if (error && !data) return <ErrorState message={error} onRetry={reload} />;
  if (!data) return null;

  return (
    <div className="space-y-4">
      <div className="relative overflow-hidden rounded-3xl p-5 text-white" style={{ background: `linear-gradient(135deg, ${color}, #0f172a)` }}>
        <div className="absolute -end-8 -top-10 h-40 w-40 rounded-full bg-white/10" />
        <div className="relative flex items-start gap-3">
          <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white/15 backdrop-blur"><SystemIcon slug={data.slug} className="h-6 w-6" /></span>
          <div className="min-w-0">
            <h1 className="text-[21px] font-extrabold leading-tight">{lang === 'ar' ? data.name_ar : data.name_en}</h1>
            <div className="text-[11px] text-white/70" dir="auto">{lang === 'ar' ? data.name_en : data.name_ar}</div>
            <p className="mt-2 max-w-lg text-[11.5px] leading-6 text-white/85">{lang === 'ar' ? data.description_ar : data.description_en}</p>
          </div>
        </div>
        <div className="relative mt-4 flex flex-wrap gap-2 text-[10.5px]">
          <span className="rounded-full bg-white/15 px-2.5 py-1 font-semibold">{fmt(totalDrugs)} {t('system.drugs')}</span>
          <span className="rounded-full bg-white/15 px-2.5 py-1 font-semibold">{classes.length} {t('system.classes')}</span>
        </div>
      </div>

      <div className="flex items-center gap-2 rounded-2xl border border-ink-200 bg-white p-1.5 dark:border-ink-800 dark:bg-ink-900">
        <Search className="ms-1.5 h-4 w-4 text-ink-400" />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={lang === 'ar' ? 'ابحث داخل هذا الجهاز…' : 'Search in this system…'} className="min-w-0 flex-1 bg-transparent px-1 py-1.5 text-[12.5px] outline-none" />
      </div>

      <div className="flex gap-1.5 overflow-x-auto no-scrollbar pb-1">
        <button onClick={() => setClassId('all')} className={cx('chip shrink-0', classId === 'all' && 'chip-active')}>
          {t('common.all')} <span className="opacity-60">({fmt(totalDrugs)})</span>
        </button>
        {classes.map((c) => (
          <button key={c.id} onClick={() => setClassId(c.id)} className={cx('chip shrink-0', classId === c.id && 'chip-active')}>
            {lang === 'ar' ? c.name_ar : c.name_en} <span className="opacity-60">({c.drugs})</span>
          </button>
        ))}
      </div>

      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {(drugsQ.data?.data || []).map((d: any) => <DrugCard key={d.id} drug={d} compact />)}
      </div>
      {drugsQ.loading && <PageLoader />}
      {drugsQ.data && drugsQ.data.data.length === 0 && <EmptyState title={t('common.noResults')} />}

      {classId === 'all' && !q && (
        <div className="card p-4">
          <h3 className="mb-3 text-[13px] font-bold text-ink-900 dark:text-white">{t('system.classes')}</h3>
          <div className="divide-soft">
            {classes.map((c) => (
              <div key={c.id} className="py-2">
                <button onClick={() => setOpenClass(openClass === c.id ? null : c.id)} className="flex w-full items-center justify-between gap-3 text-start">
                  <span className="flex items-center gap-2">
                    <span className="flex h-7 w-7 items-center justify-center rounded-lg" style={{ background: `${color}14`, color }}><Pill className="h-3.5 w-3.5" /></span>
                    <span className="text-[12.5px] font-semibold text-ink-800 dark:text-ink-100">{lang === 'ar' ? c.name_ar : c.name_en}</span>
                  </span>
                  <span className="flex items-center gap-2">
                    <Badge>{c.drugs}</Badge>
                    {openClass === c.id ? <ChevronUp className="h-4 w-4 text-ink-400" /> : <ChevronDown className="h-4 w-4 text-ink-400" />}
                  </span>
                </button>
                {openClass === c.id && <ClassDrugs categoryId={c.id} color={color} />}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function ClassDrugs({ categoryId, color }: { categoryId: number; color: string }) {
  const { data, loading } = useApi<{ data: any[] }>('/api/catalog/drugs', { category: categoryId, limit: 100 });
  if (loading) return <div className="mt-2 skeleton h-16" />;
  return (
    <div className="mt-2 space-y-1.5 border-s-2 ps-3" style={{ borderColor: color }}>
      {(data?.data || []).map((d) => (
        <Link key={d.id} to={`/drugs/${d.id}`} className="flex items-center justify-between rounded-lg bg-ink-50 px-2.5 py-1.5 text-[11.5px] hover:bg-brand-50 dark:bg-ink-800/60 dark:hover:bg-brand-900/30">
          <span className="font-semibold text-ink-700 dark:text-ink-200">{d.generic_name}</span>
          <ChevronLeft className="h-3.5 w-3.5 text-ink-400 rtl:block ltr:hidden" />
        </Link>
      ))}
    </div>
  );
}
