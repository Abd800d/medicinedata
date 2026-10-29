/*
 * «المنتجات التجارية» — the product browser the plan asks for.
 *
 * Until now a product could only be reached by searching, by opening a generic drug, or from the
 * home strip; there was no screen that answers "what is actually registered, made by whom, sold
 * where". This page lists commercial products with the filters the plan names — country of
 * marketing, manufacturer, local agent, body system, verification state, presence of a real
 * photo — and prints the derived verification label on every card so nothing looks more certain
 * than it is.
 *
 * Data comes from /api/catalog/products (paged, 30 per request) and /api/catalog/products-facets
 * (filter values counted from the database, never a hand-written list that drifts).
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  ArrowLeft, Building2, Camera, CheckCircle2, Filter, Globe2, Loader2, Package, RefreshCw, Search,
  ShieldAlert, ShieldCheck, Truck, X,
} from 'lucide-react';
import { api } from '../lib/api';
import { useApi } from '../lib/useApi';
import { useDebounced } from '../lib/utils';
import { SmartImage, EmptyState, Spinner } from '../components/ui';
import { VerificationBadge } from '../components/Verification';
import { useI18n } from '../lib/i18n';

type Product = {
  id: number; trade_name: string; trade_name_ar: string | null; strength: string | null;
  dosage_form: string | null; country: string | null; barcode: string | null;
  image_url: string | null; verified: number; review_status?: string | null;
  verification: 'verified' | 'manufacturer_confirmed' | 'supplier_submitted' | 'user_submitted' | 'incomplete' | 'unverified';
  missing_fields: string[]; generic_name: string | null; generic_ar: string | null; drug_id: number | null;
  manufacturer_name: string | null; agent_name: string | null; agent_city: string | null;
  system_ar: string | null; system_en: string | null;
};

type Facets = {
  countries: { value: string; n: number }[];
  manufacturers: { value: number; label: string; n: number }[];
  agents: { value: number; label: string; city: string | null; n: number }[];
  systems: { value: string; label_ar: string; label_en: string; n: number }[];
  states?: { value: string; n: number }[];
  totals: { products: number; verified: number; with_image: number };
};

const PAGE = 30;

export default function Products() {
  const { lang } = useI18n();
  const ar = lang === 'ar';
  const [params, setParams] = useSearchParams();

  const [q, setQ] = useState(params.get('q') || '');
  const text = useDebounced(q, 350);
  const [filters, setFilters] = useState({
    country: params.get('country') || '',
    manufacturer: params.get('manufacturer') || '',
    agent: params.get('agent') || '',
    system: params.get('system') || '',
    verified: params.get('verified') === '1',
    state: params.get('state') || '',
    has_image: params.get('has_image') === '1',
  });
  const [rows, setRows] = useState<Product[]>([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const { data: facets } = useApi<Facets>('/api/catalog/products-facets', undefined, { ttl: 300_000 });
  const requestId = useRef(0);

  const query = useMemo(() => {
    const p = new URLSearchParams();
    if (text.trim()) p.set('q', text.trim());
    if (filters.country) p.set('country', filters.country);
    if (filters.manufacturer) p.set('manufacturer', filters.manufacturer);
    if (filters.agent) p.set('agent', filters.agent);
    if (filters.system) p.set('system', filters.system);
    if (filters.verified) p.set('verified', '1');
    if (filters.state) p.set('state', filters.state);
    if (filters.has_image) p.set('has_image', '1');
    return p;
  }, [text, filters]);

  const load = useCallback(async (nextPage: number, append: boolean) => {
    const mine = ++requestId.current;
    setBusy(true); setError('');
    try {
      const p = new URLSearchParams(query);
      p.set('limit', String(PAGE));
      p.set('page', String(nextPage));
      const res = await api.get<{ data: Product[]; total: number; pages: number }>(`/api/catalog/products?${p.toString()}`);
      if (mine !== requestId.current) return; /* a newer keystroke already replaced this request */
      setRows((prev) => (append ? [...prev, ...res.data] : res.data));
      setTotal(res.total);
      setPage(nextPage);
    } catch (e: any) {
      if (mine === requestId.current) {
        /* "NETWORK" is the API layer's code for "no reachable backend" — say that in words. */
        setError(e?.message === 'NETWORK'
          ? (ar ? 'تعذّر الوصول إلى الخادم. شاشة المنتجات تحتاج اتصالًا بالخادم — جرّب «إعادة المحاولة» بعد التحقق من الشبكة.'
                : 'Cannot reach the server. The product browser needs a live server — retry after checking your connection.')
          : e?.message || (ar ? 'تعذّر التحميل' : 'Could not load'));
      }
    } finally { if (mine === requestId.current) setBusy(false); }
  }, [query, ar]);

  /* first page on any filter change; the URL keeps the state shareable */
  useEffect(() => {
    void load(1, false);
    setParams(query, { replace: true });
  }, [query, load, setParams]);

  const activeCount = Object.values(filters).filter(Boolean).length;
  const set = (k: keyof typeof filters, v: string | boolean) => setFilters((f) => ({ ...f, [k]: v }));

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Link to="/more" className="icon-btn h-9 w-9"><ArrowLeft className="h-4 w-4 rtl:-scale-x-100" /></Link>
        <div className="min-w-0 flex-1">
          <h1 className="text-[16px] font-extrabold">{ar ? 'المنتجات التجارية' : 'Commercial products'}</h1>
          <p className="text-[10.5px] text-ink-500">
            {ar ? 'ابدأ من المنتج أو من الشركة أو الوكيل — مع حالة التوثيق لكل سجل'
                : 'Browse by product, manufacturer or agent — with the verification state of every record'}
          </p>
        </div>
        <button onClick={() => setShowFilters((s) => !s)}
          className={cxBtn(activeCount > 0)} aria-label={ar ? 'الفلاتر' : 'Filters'}>
          <Filter className="h-3.5 w-3.5" />
          {activeCount > 0 && <span className="rounded-full bg-brand-500 px-1 text-[9px] font-black text-white">{activeCount}</span>}
        </button>
      </div>

      {/* search */}
      <div className="relative">
        <Search className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-500" />
        <input value={q} onChange={(e) => setQ(e.target.value)} className="input w-full ps-9"
          placeholder={ar ? 'اسم تجاري، اسم علمي، باركود…' : 'Trade name, generic name, barcode…'} />
        {q && (
          <button onClick={() => setQ('')} className="absolute end-2 top-1/2 -translate-y-1/2 rounded-lg p-1 text-ink-500" aria-label={ar ? 'مسح' : 'Clear'}>
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {/* counters read from the database, not written by hand */}
      {facets?.totals && (
        <div className="grid grid-cols-3 gap-1.5 text-center">
          {[
            { k: ar ? 'منتج' : 'Products', v: facets.totals.products, icon: Package, tone: 'text-brand-300' },
            { k: ar ? 'موثّق' : 'Verified', v: facets.totals.verified, icon: ShieldCheck, tone: 'text-emerald-300' },
            { k: ar ? 'بصورة' : 'With photo', v: facets.totals.with_image, icon: Camera, tone: 'text-sky-300' },
          ].map((t) => (
            <div key={t.k} className="card px-2 py-2">
              <t.icon className={`mx-auto mb-0.5 h-3.5 w-3.5 ${t.tone}`} />
              <div className="text-[14px] font-black leading-none text-white">{t.v}</div>
              <div className="text-[9.5px] text-ink-500">{t.k}</div>
            </div>
          ))}
        </div>
      )}

      {/* filters */}
      {showFilters && (
        <div className="card space-y-2.5 p-3">
          <div className="grid gap-2 sm:grid-cols-2">
            <label className="block">
              <span className="mb-1 block text-[10px] font-bold text-ink-400">{ar ? 'بلد التسويق' : 'Country of marketing'}</span>
              <select value={filters.country} onChange={(e) => set('country', e.target.value)} className="input w-full text-[11.5px]">
                <option value="">{ar ? 'الكل' : 'All'}</option>
                {(facets?.countries || []).map((c) => <option key={c.value} value={c.value}>{c.value} ({c.n})</option>)}
              </select>
            </label>
            <label className="block">
              <span className="mb-1 block text-[10px] font-bold text-ink-400">{ar ? 'الشركة المصنعة' : 'Manufacturer'}</span>
              <select value={filters.manufacturer} onChange={(e) => set('manufacturer', e.target.value)} className="input w-full text-[11.5px]">
                <option value="">{ar ? 'الكل' : 'All'}</option>
                {(facets?.manufacturers || []).map((m) => <option key={m.value} value={m.value}>{m.label} ({m.n})</option>)}
              </select>
            </label>
            <label className="block">
              <span className="mb-1 block text-[10px] font-bold text-ink-400">{ar ? 'الوكيل المحلي' : 'Local agent'}</span>
              <select value={filters.agent} onChange={(e) => set('agent', e.target.value)} className="input w-full text-[11.5px]">
                <option value="">{ar ? 'الكل' : 'All'}</option>
                {(facets?.agents || []).map((a) => <option key={a.value} value={a.value}>{a.label}{a.city ? ` — ${a.city}` : ''} ({a.n})</option>)}
              </select>
            </label>
            <label className="block">
              <span className="mb-1 block text-[10px] font-bold text-ink-400">{ar ? 'جهاز الجسم' : 'Body system'}</span>
              <select value={filters.system} onChange={(e) => set('system', e.target.value)} className="input w-full text-[11.5px]">
                <option value="">{ar ? 'الكل' : 'All'}</option>
                {(facets?.systems || []).map((s) => <option key={s.value} value={s.value}>{ar ? s.label_ar : s.label_en} ({s.n})</option>)}
              </select>
            </label>
          </div>
          <div className="flex flex-wrap gap-1.5">
            <button onClick={() => set('verified', !filters.verified)} className={chip(filters.verified)}>
              <ShieldCheck className="h-3 w-3" />{ar ? 'موثّق فقط' : 'Verified only'}
            </button>
            <button onClick={() => set('has_image', !filters.has_image)} className={chip(filters.has_image)}>
              <Camera className="h-3 w-3" />{ar ? 'له صورة' : 'Has a photo'}
            </button>
            {activeCount > 0 && (
              <button onClick={() => setFilters({ country: '', manufacturer: '', agent: '', system: '', verified: false, state: '', has_image: false })}
                className="rounded-lg bg-rose-500/15 px-2 py-1 text-[10.5px] font-bold text-rose-300">
                <X className="me-1 inline h-3 w-3" />{ar ? 'إزالة الفلاتر' : 'Clear filters'}
              </button>
            )}
          </div>
        </div>
      )}

      {/* results */}
      <div className="flex items-center justify-between px-1 text-[10.5px] text-ink-500">
        <span>{ar ? `${total} نتيجة` : `${total} results`}</span>
        {busy && rows.length > 0 && <Spinner className="h-3 w-3" />}
      </div>

      {error && (
        <div className="card border-rose-400/25 bg-rose-500/[.07] p-3 text-[11px] text-rose-200">
          <div>{error}</div>
          <button onClick={() => void load(1, false)} className="btn-ghost mt-1.5 px-2 py-1 text-[10.5px]">
            <RefreshCw className="h-3 w-3" />{ar ? 'إعادة المحاولة' : 'Retry'}
          </button>
        </div>
      )}

      {!busy && rows.length === 0 && !error && (
        <EmptyState icon={<Package className="h-6 w-6" />}
          title={ar ? 'لا منتجات بهذه الفلاتر' : 'No products match'}
          text={ar ? 'جرّب كلمة أقصر أو أزل الفلاتر.' : 'Try a shorter word or clear the filters.'} />
      )}

      <div className="grid gap-2 sm:grid-cols-2">
        {rows.map((p) => (
            <Link key={p.id} to={`/products/${p.id}`} className="card flex gap-2.5 p-2.5 transition hover:border-brand-400/30">
              <div className="h-16 w-16 shrink-0 overflow-hidden rounded-xl bg-white/[.05]">
                <SmartImage src={p.image_url} alt={p.trade_name} productId={p.id} drugId={p.drug_id ?? undefined} rounded="rounded-xl" className="h-full w-full object-cover" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-start gap-1">
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[12px] font-extrabold text-white" dir="auto">{ar && p.trade_name_ar ? p.trade_name_ar : p.trade_name}</div>
                    <div className="truncate text-[10px] text-brand-300" dir="ltr">{p.generic_name || '—'}</div>
                  </div>
                  <VerificationBadge state={p.verification} review={p.review_status} lang={lang as 'ar' | 'en'} className="shrink-0" />
                </div>
                <div className="mt-1 flex flex-wrap gap-1 text-[9.5px] text-ink-400">
                  {p.strength && <span className="rounded bg-white/[.06] px-1 py-0.5" dir="ltr">{p.strength}</span>}
                  {p.dosage_form && <span className="rounded bg-white/[.06] px-1 py-0.5">{p.dosage_form}</span>}
                  {p.country && <span className="inline-flex items-center gap-0.5"><Globe2 className="h-2.5 w-2.5" />{p.country}</span>}
                </div>
                <div className="mt-0.5 space-y-0.5 text-[9.5px] text-ink-500">
                  {p.manufacturer_name && <div className="flex items-center gap-1 truncate"><Building2 className="h-2.5 w-2.5 shrink-0" />{p.manufacturer_name}</div>}
                  {p.agent_name && <div className="flex items-center gap-1 truncate"><Truck className="h-2.5 w-2.5 shrink-0" />{p.agent_name}{p.agent_city ? ` · ${p.agent_city}` : ''}</div>}
                </div>
                {p.verification === 'incomplete' && p.missing_fields.length > 0 && (
                  <div className="mt-0.5 truncate text-[9px] text-amber-300/90">
                    {ar ? 'ينقص:' : 'Missing:'} {p.missing_fields.slice(0, 3).join(' · ')}
                  </div>
                )}
              </div>
            </Link>
        ))}
      </div>

      {rows.length > 0 && rows.length < total && (
        <button onClick={() => void load(page + 1, true)} disabled={busy} className="btn-soft w-full text-[11.5px]">
          {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Package className="h-3.5 w-3.5" />}
          {busy ? (ar ? 'جارٍ التحميل…' : 'Loading…') : (ar ? `المزيد (${total - rows.length})` : `Load more (${total - rows.length})`)}
        </button>
      )}

      <div className="flex items-start gap-2 rounded-2xl border border-amber-400/25 bg-amber-500/10 p-2.5 text-[10px] leading-5 text-amber-200">
        <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        <span>
          {ar
            ? '«موثّق» تعني أن مراجعًا صيدليًا اعتمد السجل. «بيانات ناقصة» تعني أن حقولًا أساسية لم تُملأ بعد (القوة، الشكل، الباركود، الشركة، البلد). لا يوجد في التطبيق ادعاء «مؤكد من الشركة المصنعة» قبل توثيق المصدر.'
            : '«Verified» means a pharmacist reviewer approved the record. «Incomplete» means core fields are still empty (strength, form, barcode, manufacturer, country). The app makes no "manufacturer confirmed" claim before the source is documented.'}
        </span>
      </div>
    </div>
  );
}

const chip = (on: boolean) =>
  `inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[10.5px] font-bold transition ${
    on ? 'bg-brand-500/25 text-brand-100' : 'bg-white/[.05] text-ink-400 hover:text-ink-200'
  }`;

const stateAr = (s: string) => ({
  verified: 'موثّق', manufacturer_confirmed: 'مؤكد من الشركة', supplier_submitted: 'من مورّد',
  user_submitted: 'من مستخدم', incomplete: 'ناقص', unverified: 'غير موثّق',
}[s] || s);

const cxBtn = (on: boolean) =>
  `icon-btn relative h-9 w-9 ${on ? 'bg-brand-500/25 text-brand-100' : ''}`;
