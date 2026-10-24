import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Barcode, Clock, Search, Sparkles, WifiOff, X } from 'lucide-react';
import { useApi } from '../lib/useApi';
import { useDebounced } from '../lib/utils';
import { useI18n } from '../lib/i18n';
import { api } from '../lib/api';
import { getPack, searchPack, useOnline } from '../lib/offline';
import { DrugCard, ProductGrid, ProductRecord, DrugRecord } from '../components/catalog';
import { EmptyState, PageLoader, Tabs, Badge } from '../components/ui';

type Res = { query: string; drugs: (DrugRecord & { score: number })[]; products: (ProductRecord & { score: number })[]; suggestions: string[] };

const RECENT_KEY = 'mda.recentSearches';

export default function SearchPage() {
  const { t, lang } = useI18n();
  const [params, setParams] = useSearchParams();
  const initial = params.get('q') || '';
  const [term, setTerm] = useState(initial);
  const debounced = useDebounced(term, 380);
  const [tab, setTab] = useState<'all' | 'drugs' | 'products'>('all');
  const [online] = [useOnline()];
  const [offlineRes, setOfflineRes] = useState<Res | null>(null);
  const [barcodeResult, setBarcodeResult] = useState<ProductRecord[] | null>(null);
  const [recent, setRecent] = useState<string[]>(() => { try { return JSON.parse(localStorage.getItem(RECENT_KEY) || '[]'); } catch { return []; } });

  const { data, loading, error } = useApi<Res>('/api/catalog/search', { q: debounced }, { enabled: debounced.trim().length > 0 });

  useEffect(() => { setTerm(initial); }, [initial]);

  useEffect(() => {
    if (initial) {
      setRecent((prev) => {
        const next = [initial, ...prev.filter((x) => x !== initial)].slice(0, 8);
        localStorage.setItem(RECENT_KEY, JSON.stringify(next));
        return next;
      });
    }
  }, [initial]);

  useEffect(() => {
    const q = debounced.trim();
    if (q && q !== initial) setParams({ q }, { replace: true });
    if (!q) setParams({}, { replace: true });
  }, [debounced]);

  // offline fallback
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if ((!online || error === 'NETWORK') && debounced.trim()) {
        const pack = await getPack();
        if (!pack || cancelled) return;
        const local = searchPack(pack, debounced);
        setOfflineRes({
          query: debounced,
          drugs: local.drugs as any,
          products: local.products as any,
          suggestions: local.drugs.slice(0, 5).map((d: any) => d.generic_name),
        });
      } else setOfflineRes(null);
    })();
    return () => { cancelled = true; };
  }, [online, error, debounced]);

  const result = offlineRes || data;

  const onBarcode = async () => {
    const q = term.trim();
    if (!/^\d{6,14}$/.test(q)) return;
    try {
      const rows = await api.get<ProductRecord[]>(`/api/catalog/barcode/${q}`);
      setBarcodeResult(rows);
    } catch { setBarcodeResult([]); }
  };

  const showEmpty = debounced.trim() && !loading && result && result.drugs.length === 0 && result.products.length === 0;
  const drugs = useMemo(() => (result?.drugs || []).filter((d) => tab !== 'products'), [result, tab]);
  const products = useMemo(() => (result?.products || []).filter((p) => tab !== 'drugs'), [result, tab]);

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <div className="flex items-center gap-2 rounded-2xl border border-ink-200 bg-white p-2 shadow-sm dark:border-ink-800 dark:bg-ink-900">
          <Search className="ms-1 h-5 w-5 text-brand-700" />
          <input
            autoFocus
            value={term}
            onChange={(e) => { setTerm(e.target.value); setBarcodeResult(null); }}
            placeholder={t('search.placeholder')}
            className="min-w-0 flex-1 bg-transparent px-1 py-1.5 text-[13.5px] font-medium outline-none placeholder:text-ink-400"
            inputMode="search"
          />
          {term && <button onClick={() => setTerm('')} className="icon-btn h-8 w-8"><X className="h-4 w-4" /></button>}
          <button onClick={onBarcode} className="icon-btn h-8 w-8" title={t('product.barcode')}><Barcode className="h-4 w-4" /></button>
        </div>
        {!online && <div className="flex items-center gap-1.5 rounded-xl bg-amber-50 px-3 py-2 text-[10.5px] font-semibold text-amber-800 dark:bg-amber-950/40 dark:text-amber-300"><WifiOff className="h-3.5 w-3.5" />{t('offline.banner')}</div>}
        <div className="flex flex-wrap items-center gap-1.5">
          {result?.suggestions?.slice(0, 8).map((s) => (
            <button key={s} onClick={() => setTerm(s)} className="chip hover:border-brand-400">
              <Sparkles className="h-3 w-3 text-brand-600" />{s}
            </button>
          ))}
        </div>
      </div>

      {!debounced.trim() && (
        <>
          {recent.length > 0 && (
            <div>
              <div className="mb-2 flex items-center justify-between">
                <span className="inline-flex items-center gap-1.5 text-[11.5px] font-bold text-ink-500"><Clock className="h-3.5 w-3.5" />{t('search.recent')}</span>
                <button onClick={() => { setRecent([]); localStorage.removeItem(RECENT_KEY); }} className="text-[10.5px] font-semibold text-ink-400 hover:text-rose-500">{t('search.clear')}</button>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {recent.map((r) => <button key={r} onClick={() => setTerm(r)} className="chip">{r}</button>)}
              </div>
            </div>
          )}
          <div className="card p-5">
            <div className="mb-2 flex items-center gap-2 text-brand-700 dark:text-brand-300"><Barcode className="h-4.5 w-4.5" /><span className="text-[12.5px] font-bold">{t('product.barcode')}</span></div>
            <p className="text-[11px] leading-6 text-ink-500">{lang === 'ar' ? 'امسح باركود المنتج أو اكتب رقمه في البحث ثم اضغط أيقونة الباركود لعرض المنتج مباشرة.' : 'Scan the barcode or paste its number, then tap the barcode icon.'}</p>
            {barcodeResult && (
              <div className="mt-3">
                {barcodeResult.length ? <ProductGrid products={barcodeResult} /> : <div className="text-[11px] text-rose-600">{t('common.noResults')}</div>}
              </div>
            )}
          </div>
          <EmptyState icon={<Search className="h-6 w-6" />} title={t('nav.search')} text={t('home.searchHint')} />
        </>
      )}

      {debounced.trim() && (
        <>
          <div className="flex items-center justify-between gap-2">
            <div className="text-[11.5px] text-ink-500">
              {t('search.resultsFor')} <b className="text-ink-800 dark:text-ink-200">“{debounced}”</b>
              {result && <span className="ms-2 text-[10px] text-ink-400">({result.drugs.length + result.products.length})</span>}
            </div>
            {offlineRes && <Badge tone="amber"><WifiOff className="h-2.5 w-2.5" /> offline</Badge>}
          </div>

          <Tabs
            value={tab}
            onChange={(v) => setTab(v as any)}
            tabs={[
              { id: 'all', label: t('common.all') },
              { id: 'drugs', label: `${t('search.drugs')} (${result?.drugs.length || 0})` },
              { id: 'products', label: `${t('search.products')} (${result?.products.length || 0})` },
            ]}
          />

          {loading && !result && <PageLoader />}

          {!!drugs.length && (
            <div>
              <div className="mb-2 text-[11.5px] font-bold text-ink-500">{t('search.drugs')}</div>
              <div className="grid gap-2 lg:grid-cols-2">
                {drugs.slice(0, 12).map((d) => <DrugCard key={d.id} drug={d} />)}
              </div>
            </div>
          )}

          {!!products.length && (
            <div>
              <div className="mb-2 text-[11.5px] font-bold text-ink-500">{t('search.products')}</div>
              <ProductGrid products={products.slice(0, 40)} />
            </div>
          )}

          {showEmpty && (
            <EmptyState
              title={t('search.noResultsTitle')}
              text={t('search.noResultsText')}
              action={result?.suggestions?.length ? (
                <div className="flex flex-wrap justify-center gap-1.5">
                  {result.suggestions.map((s) => <button key={s} onClick={() => setTerm(s)} className="chip">{s}</button>)}
                </div>
              ) : undefined}
            />
          )}
        </>
      )}
    </div>
  );
}
