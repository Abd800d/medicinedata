import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  ArrowLeft, ArrowRight, BadgeCheck, Bot, Briefcase, ChevronLeft, CloudDownload, Database, MessageCircle,
  Package, Pill, ScanLine, Search, ShieldCheck, Sparkles, Stethoscope, TrendingUp, Users, ScanText, ShoppingCart, FilePlus2,
} from 'lucide-react';
import { useI18n } from '../lib/i18n';
import { useConfig } from '../lib/config';
import { useAuth } from '../lib/auth';
import { useApi } from '../lib/useApi';
import { SystemCard, SystemRecord, ProductCard, ProductRecord, DrugCard } from '../components/catalog';
import { SectionHead, SmartImage, Badge } from '../components/ui';
import { fmt } from '../lib/utils';
import { packMeta } from '../lib/offline';

const POPULAR_AR = ['باراسيتامول', 'أوجمنتين', 'أوميبرازول', 'ميتفورمين', 'فيتامين د', 'سيتريزين', 'فولتارين', 'أموكسيسيلين'];
const POPULAR_EN = ['paracetamol', 'augmentin', 'omeprazole', 'metformin', 'vitamin d', 'cetirizine', 'voltaren', 'amoxicillin'];

export default function Home() {
  const { t, lang } = useI18n();
  const { config } = useConfig();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [q, setQ] = useState('');
  const { data: systems } = useApi<SystemRecord[]>('/api/catalog/systems');
  const { data: trending } = useApi<string[]>('/api/catalog/trending');
  const { data: productsRes } = useApi<{ data: ProductRecord[] }>('/api/catalog/products', { limit: 8, verified: '1' });
  const { data: drugsRes } = useApi<{ data: any[] }>('/api/catalog/drugs', { limit: 6 });
  const { data: catalogStats } = useApi<any>('/api/catalog/stats');
  const meta = packMeta();

  const popular = useMemo(() => {
    const list = (trending && trending.length ? trending : (lang === 'ar' ? POPULAR_AR : POPULAR_EN)).slice(0, 8);
    return list;
  }, [trending, lang]);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    navigate(`/search?q=${encodeURIComponent(q.trim())}`);
  };

  const counts = config.counts;
  const stats = [
    { label: t('home.stats.drugs'), value: counts.drugs, icon: Pill },
    { label: t('home.stats.products'), value: counts.products, icon: Package },
    { label: t('home.stats.systems'), value: counts.systems, icon: Database },
    { label: t('home.stats.manufacturers'), value: catalogStats?.manufacturers ?? 0, icon: ShieldCheck },
  ];

  return (
    <div className="space-y-7">
      {/* Hero */}
      <section className="hero-card rounded-3xl p-5 pb-6 text-white shadow-float sm:p-7">
        <div className="relative z-10">
          <div className="mb-4 flex items-center justify-between">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-white/15 px-2.5 py-1 text-[10px] font-semibold backdrop-blur">
              <BadgeCheck className="h-3 w-3" /> {t('app.tagline')}
            </span>
            <span className="rounded-full border border-white/25 bg-white/10 px-2.5 py-1 text-[9.5px] font-semibold backdrop-blur">
              عبدالمجيد الماخذي · Abdulmajeed Almakhedhi
            </span>
          </div>
          <h1 className="max-w-xl text-[24px] font-extrabold leading-[1.35] sm:text-[30px]">
            {t('home.headline')}
          </h1>
          <p className="mt-1.5 text-[12px] text-white/75">{t('home.searchHint')}</p>

          <form onSubmit={submit} className="mt-4 flex items-center gap-2 rounded-2xl bg-white p-1.5 shadow-lg">
            <Search className="ms-2 h-5 w-5 shrink-0 text-brand-700" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder={t('home.searchPlaceholder')}
              className="min-w-0 flex-1 bg-transparent px-1 py-2 text-[13.5px] font-medium text-ink-900 outline-none placeholder:text-ink-400"
              aria-label={t('nav.search')}
            />
            <button type="submit" className="rounded-xl bg-brand-700 px-3.5 py-2.5 text-[12px] font-bold text-white transition hover:bg-brand-800">
              {t('common.search')}
            </button>
          </form>

          <div className="mt-3 flex gap-1.5 overflow-x-auto no-scrollbar">
            {popular.map((term) => (
              <button key={term} onClick={() => navigate(`/search?q=${encodeURIComponent(term)}`)}
                className="shrink-0 rounded-full bg-white/15 px-2.5 py-1 text-[10.5px] font-medium text-white/90 backdrop-blur transition hover:bg-white/25">
                {term}
              </button>
            ))}
          </div>

          <div className="mt-5 grid grid-cols-4 gap-2 rounded-2xl bg-black/10 p-2.5 backdrop-blur">
            {stats.map((s) => (
              <div key={s.label} className="text-center">
                <div className="text-[16px] font-extrabold leading-tight sm:text-[18px]">{fmt(s.value)}+</div>
                <div className="text-[9px] font-medium text-white/70">{s.label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Quick tools */}
      <section>
        <SectionHead title={t('home.quickTools')} />
        <div className="grid grid-cols-3 gap-2.5 sm:grid-cols-6">
          {[
            { to: '/prescriptions', label: t('home.tool.prescription'), icon: ScanText, color: 'from-rose-500 to-pink-600' },
            { to: '/scan', label: t('home.tool.scan'), icon: ScanLine, color: 'from-cyan-500 to-blue-600' },
            { to: '/ai', label: t('home.tool.ai'), icon: Bot, color: 'from-violet-500 to-purple-600' },
            { to: '/community', label: t('home.tool.community'), icon: MessageCircle, color: 'from-emerald-500 to-teal-600' },
            { to: '/jobs', label: t('home.tool.jobs'), icon: Briefcase, color: 'from-amber-500 to-orange-600' },
            { to: '/directories', label: t('home.tool.directories'), icon: Users, color: 'from-slate-500 to-slate-700' },
            { to: '/pharmacy', label: t('pharmacy.title'), icon: ShoppingCart, color: 'from-indigo-500 to-indigo-700' },
            { to: '/submit-drug', label: t('submit.title'), icon: FilePlus2, color: 'from-teal-500 to-emerald-700' },
          ].map((tool) => (
            <Link key={tool.to} to={tool.to} className="group flex flex-col items-center gap-2 rounded-2xl border border-ink-200/70 bg-white p-3 text-center transition hover:-translate-y-0.5 hover:shadow-card dark:border-ink-800 dark:bg-ink-900">
              <span className={`flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br ${tool.color} text-white shadow-sm`}>
                <tool.icon className="h-5 w-5" />
              </span>
              <span className="text-[10.5px] font-bold leading-4 text-ink-700 dark:text-ink-200">{tool.label}</span>
            </Link>
          ))}
        </div>
      </section>

      {/* Offline pack CTA */}
      {!meta && (
        <Link to="/more" className="flex items-center gap-3 rounded-2xl border border-brand-200/70 bg-brand-50/70 p-3.5 dark:border-brand-900 dark:bg-brand-950/30">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-white text-brand-700 dark:bg-ink-900 dark:text-brand-300"><CloudDownload className="h-5 w-5" /></span>
          <div className="min-w-0 flex-1">
            <div className="text-[12.5px] font-bold text-brand-900 dark:text-brand-100">{t('more.offlineTitle')}</div>
            <div className="text-[10.5px] text-brand-800/70 dark:text-brand-300/70">{t('more.offlineDesc')}</div>
          </div>
          <ChevronLeft className="h-4 w-4 rtl:block ltr:hidden text-brand-700" />
          <ArrowRight className="hidden h-4 w-4 ltr:block text-brand-700" />
        </Link>
      )}

      {/* Systems */}
      <section>
        <SectionHead
          title={t('home.systemsTitle')}
          subtitle={t('home.systemsSub')}
          action={<Link to="/systems" className="text-[11.5px] font-bold text-brand-700 dark:text-brand-300">{t('common.viewAll')}</Link>}
        />
        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-4">
          {(systems || []).map((s, i) => <SystemCard key={s.id} system={s} index={i} />)}
          {!systems && Array.from({ length: 8 }).map((_, i) => <div key={i} className="skeleton h-[104px]" />)}
        </div>
      </section>

      {/* Goods */}
      <section>
        <SectionHead
          title={lang === 'ar' ? 'منتجات موثّقة من السوق' : 'Verified market products'}
          subtitle={lang === 'ar' ? 'اليمن والخليج ومصر والأردن' : 'Yemen, Gulf, Egypt and Jordan'}
          action={<Link to="/search" className="text-[11.5px] font-bold text-brand-700 dark:text-brand-300">{t('common.viewAll')}</Link>}
        />
        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-4">
          {(productsRes?.data || []).map((p) => <ProductCard key={p.id} product={p} />)}
          {!productsRes && Array.from({ length: 4 }).map((_, i) => <div key={i} className="skeleton h-44" />)}
        </div>
      </section>

      {/* Popular generics */}
      <section>
        <SectionHead
          title={lang === 'ar' ? 'أدوية يبحث عنها الناس' : 'Frequently viewed'}
          action={<Link to="/search" className="text-[11.5px] font-bold text-brand-700 dark:text-brand-300">{t('common.viewAll')}</Link>}
        />
        <div className="grid gap-2 sm:grid-cols-2">
          {(drugsRes?.data || []).slice(0, 6).map((d) => <DrugCard key={d.id} drug={d} compact />)}
        </div>
      </section>

      {/* Trust */}
      <section className="card p-5">
        <div className="mb-4 flex items-center gap-2">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-50 text-brand-700 dark:bg-brand-900/40 dark:text-brand-300"><ShieldCheck className="h-5 w-5" /></span>
          <h2 className="text-[15px] font-extrabold text-ink-900 dark:text-white">{t('home.trustTitle')}</h2>
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          {[
            { icon: Stethoscope, title: t('home.trust1'), desc: t('home.trust1d') },
            { icon: BadgeCheck, title: t('home.trust2'), desc: t('home.trust2d') },
            { icon: TrendingUp, title: t('home.trust3'), desc: t('home.trust3d') },
          ].map((x) => (
            <div key={x.title} className="rounded-2xl bg-ink-50/80 p-3.5 dark:bg-ink-800/50">
              <x.icon className="mb-2 h-4.5 w-4.5 text-brand-600" />
              <div className="text-[12px] font-bold text-ink-800 dark:text-ink-100">{x.title}</div>
              <p className="mt-1 text-[10.5px] leading-5 text-ink-500">{x.desc}</p>
            </div>
          ))}
        </div>
        <div className="mt-4 flex items-start gap-2 rounded-xl bg-amber-50 p-3 text-[10.5px] leading-5 text-amber-800 dark:bg-amber-950/30 dark:text-amber-300">
          <Sparkles className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span><b>{t('home.disclaimer')}:</b> {lang === 'ar' ? config.disclaimer_ar : config.disclaimer_en}</span>
        </div>
      </section>

      {user?.role === 'admin' && (
        <Link to="/admin" className="flex items-center justify-between rounded-2xl bg-ink-900 p-4 text-white dark:bg-ink-800">
          <div>
            <div className="text-[13px] font-bold">{t('common.admin')}</div>
            <div className="text-[10.5px] text-white/60">إدارة الأدوية والمنتجات والاستيراد والمستخدمين</div>
          </div>
          <ChevronLeft className="h-5 w-5 rtl:block ltr:hidden" />
          <ArrowRight className="hidden h-5 w-5 ltr:block" />
        </Link>
      )}
    </div>
  );
}
