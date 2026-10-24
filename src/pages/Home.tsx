import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  ArrowRight, BadgeCheck, Bot, Briefcase, ChevronLeft, CloudDownload, Database, MessageCircle, Package,
  Pill, ScanLine, Search, ShieldCheck, Sparkles, Stethoscope, TrendingUp, Users, ScanText, ShoppingCart,
  FilePlus2, HeartPulse, Activity, Zap, Star,
} from 'lucide-react';
import { useI18n } from '../lib/i18n';
import { useConfig } from '../lib/config';
import { useAuth } from '../lib/auth';
import { useApi } from '../lib/useApi';
import { SystemCard, SystemRecord, ProductCard, ProductRecord, DrugCard, systemGradient } from '../components/catalog';
import { SectionHead, SmartImage, Badge } from '../components/ui';
import { fmt, cx } from '../lib/utils';
import { packMeta } from '../lib/offline';

const POPULAR_AR = ['باراسيتامول', 'أوجمنتين', 'أوميبرازول', 'ميتفورمين', 'فيتامين د', 'سيتريزين', 'فولتارين', 'أموكسيسيلين'];
const POPULAR_EN = ['paracetamol', 'augmentin', 'omeprazole', 'metformin', 'vitamin d', 'cetirizine', 'voltaren', 'amoxicillin'];

/* Decorative ECG line used in the hero */
function EcgLine({ className = '' }: { className?: string }) {
  return (
    <svg viewBox="0 0 320 60" className={className} fill="none" aria-hidden="true">
      <path d="M0 32h44l10-18 14 36 12-26 8 8h38l12-10 10 20 10-12h44l10-14 12 28 10-14h72"
        stroke="rgba(255,255,255,.75)" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function CapsuleArt({ className = '' }: { className?: string }) {
  return (
    <svg viewBox="0 0 120 120" className={className} fill="none" aria-hidden="true">
      <defs>
        <linearGradient id="capA" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#ffffff" stopOpacity=".95" />
          <stop offset="1" stopColor="#9fe6ff" stopOpacity=".55" />
        </linearGradient>
      </defs>
      <g transform="rotate(-32 60 60)">
        <rect x="18" y="48" width="84" height="24" rx="12" fill="url(#capA)" />
        <path d="M60 48v24" stroke="#0b3f8f" strokeOpacity=".35" strokeWidth="2" />
        <path d="M30 60h12l5-9 6 18 5-9h10" stroke="#0b3f8f" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
      </g>
    </svg>
  );
}

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
  const ar = lang === 'ar';

  const popular = useMemo(
    () => (trending && trending.length ? trending : (ar ? POPULAR_AR : POPULAR_EN)).slice(0, 8),
    [trending, ar],
  );

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (q.trim()) navigate(`/search?q=${encodeURIComponent(q.trim())}`);
  };

  const counts = config.counts;
  const stats = [
    { label: t('home.stats.drugs'), value: counts.drugs, icon: Pill },
    { label: t('home.stats.products'), value: counts.products, icon: Package },
    { label: t('home.stats.systems'), value: counts.systems, icon: Database },
    { label: t('home.stats.manufacturers'), value: catalogStats?.manufacturers ?? 0, icon: ShieldCheck },
  ];

  const tools = [
    { to: '/systems', label: ar ? 'الأجهزة' : 'Systems', icon: HeartPulse, g: 'from-[#1b6dff] to-[#38c6ff]' },
    { to: '/search', label: ar ? 'كل الأدوية' : 'Medicines', icon: Pill, g: 'from-[#8b5cf6] to-[#a78bfa]' },
    { to: '/scan', label: ar ? 'امسح وصوّر' : 'Scan', icon: ScanLine, g: 'from-[#06b6d4] to-[#67e8f9]' },
    { to: '/prescriptions', label: t('home.tool.prescription'), icon: ScanText, g: 'from-[#f43f5e] to-[#fb7185]' },
    { to: '/ai', label: t('home.tool.ai'), icon: Bot, g: 'from-[#10b981] to-[#34d399]' },
    { to: '/community', label: t('home.tool.community'), icon: MessageCircle, g: 'from-[#f59e0b] to-[#fbbf24]' },
    { to: '/pharmacy', label: t('pharmacy.title'), icon: ShoppingCart, g: 'from-[#6366f1] to-[#818cf8]' },
    { to: '/submit-drug', label: t('submit.title'), icon: FilePlus2, g: 'from-[#14b8a6] to-[#2dd4bf]' },
  ];

  return (
    <div className="space-y-6">
      {/* ── Hero ─────────────────────────────────────────────── */}
      <section className="hero-card animate-rise p-4 pb-5 text-white sm:p-6">
        <CapsuleArt className="pointer-events-none absolute -bottom-2 end-1 h-20 w-20 opacity-30 animate-float-slow sm:-top-2 sm:bottom-auto sm:h-36 sm:w-36 sm:opacity-60" />
        <EcgLine className="pointer-events-none absolute bottom-0 inset-x-0 h-12 w-full opacity-30" />

        <div className="relative z-10">
          <div className="flex flex-wrap items-center gap-2">
            <span className="eyebrow"><HeroDot /> {t('app.tagline') || 'MDA · MedicineData'}</span>
            <span className="hidden rounded-full border border-white/20 bg-white/10 px-2.5 py-1 text-[10px] font-bold text-white/80 backdrop-blur sm:inline-flex">
              عبدالمجيد الماخذي · Abdulmajeed Almakhedhi
            </span>
          </div>

          <h1 className="mt-3 max-w-[19rem] text-[25px] font-black leading-[1.25] tracking-tight sm:max-w-xl sm:text-[34px]">
            {ar ? 'صحتك أولويتنا' : 'Your health, our priority'}
          </h1>
          <p className="mt-1.5 max-w-md text-[11.5px] leading-6 text-white/75 sm:text-[13px]">
            {t('home.headline')}
          </p>

          <form onSubmit={submit} className="mt-4 flex items-center gap-2 rounded-2xl border border-white/25 bg-white/95 p-1.5 shadow-[0_18px_40px_-20px_rgba(2,12,40,.9)] backdrop-blur">
            <Search className="ms-2 h-[18px] w-[18px] shrink-0 text-[#0a53c4]" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder={t('home.searchPlaceholder')}
              className="min-w-0 flex-1 bg-transparent px-1 py-2 text-[13px] font-semibold text-[#0a1930] outline-none placeholder:font-medium placeholder:text-[#5f7fae]"
              aria-label={t('nav.search')}
            />
            <button type="submit" className="rounded-xl bg-brand-grad px-3.5 py-2 text-[11.5px] font-bold text-white shadow-float transition hover:brightness-110">
              {t('common.search')}
            </button>
          </form>

          <div className="no-scrollbar mt-3 flex gap-1.5 overflow-x-auto pb-0.5">
            {popular.map((term) => (
              <button key={term} onClick={() => navigate(`/search?q=${encodeURIComponent(term)}`)}
                className="shrink-0 rounded-full border border-white/20 bg-white/10 px-2.5 py-1 text-[10.5px] font-semibold text-white/90 backdrop-blur transition hover:bg-white/20">
                {term}
              </button>
            ))}
          </div>

          <div className="mt-4 grid grid-cols-4 divide-x divide-white/10 rounded-2xl border border-white/15 bg-black/20 p-2.5 backdrop-blur-lg [&>*]:px-1">
            {stats.map((s) => (
              <div key={s.label} className="min-w-0 text-center">
                <div className="num text-[15px] font-black leading-tight sm:text-[18px]">{fmt(s.value)}</div>
                <div className="truncate text-[8.5px] font-semibold text-white/65 sm:text-[10px]">{s.label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Quick tools ─────────────────────────────────────── */}
      <section>
        <SectionHead
          title={t('home.quickTools')}
          subtitle={ar ? 'كل ما تحتاجه في نقرة واحدة' : 'Everything one tap away'}
          action={<span className="hidden items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-1 text-[10px] font-bold text-emerald-300 sm:inline-flex"><Zap className="h-2.5 w-2.5" />{ar ? 'سريع' : 'Fast'}</span>}
        />
        <div className="grid grid-cols-4 gap-2 sm:grid-cols-8 sm:gap-3">
          {tools.map((tool) => (
            <Link key={tool.to} to={tool.to} className="group flex flex-col items-center gap-1.5 rounded-2xl p-1 text-center transition">
              <span className={cx(
                'relative flex h-[52px] w-[52px] items-center justify-center rounded-[18px] bg-gradient-to-br text-white shadow-tile ring-1 ring-white/20 transition duration-300 group-hover:-translate-y-0.5 group-hover:shadow-glow sm:h-14 sm:w-14',
                tool.g,
              )}>
                <span className="absolute inset-0 rounded-[18px] bg-white/0 transition group-hover:bg-white/10" />
                <tool.icon className="relative h-[21px] w-[21px]" strokeWidth={2.1} />
              </span>
              <span className="line-clamp-1 text-[10.5px] font-bold text-ink-200 sm:text-[11px]">{tool.label}</span>
            </Link>
          ))}
        </div>
      </section>

      {/* ── Systems ─────────────────────────────────────────── */}
      <section>
        <SectionHead
          title={t('home.systemsTitle')}
          subtitle={t('home.systemsSub')}
          action={<Link to="/systems" className="inline-flex items-center gap-1 text-[11.5px] font-bold text-brand-300 transition hover:text-white">{t('common.viewAll')}<ArrowRight className="h-3 w-3 rtl:hidden" /><ChevronLeft className="hidden h-3 w-3 rtl:block" /></Link>}
        />
        <div className="grid grid-cols-4 gap-2 sm:grid-cols-6 sm:gap-2.5 lg:grid-cols-8">
          {(systems || []).slice(0, 12).map((s, i) => <SystemCard key={s.id} system={s} index={i} compact />)}
          {!systems && Array.from({ length: 8 }).map((_, i) => <div key={i} className="skeleton h-[92px]" />)}
        </div>
      </section>

      {/* ── AI banner ───────────────────────────────────────── */}
      <Link to="/ai" className="group relative block overflow-hidden rounded-3xl border border-white/10 bg-[linear-gradient(120deg,rgba(27,109,255,.35),rgba(34,211,238,.18),rgba(139,92,246,.28))] p-4 backdrop-blur-xl">
        <span className="pointer-events-none absolute -end-6 -top-8 h-32 w-32 rounded-full bg-aqua-400/25 blur-2xl" />
        <div className="relative flex items-center gap-3">
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-white/15 text-white ring-1 ring-white/25 backdrop-blur"><Bot className="h-6 w-6" /></span>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5 text-[13px] font-extrabold text-white">
              {t('ai.title')}
              <Badge tone="emerald" className="!py-0 text-[8.5px]">{ar ? 'مجاني' : 'Free'}</Badge>
            </div>
            <p className="mt-0.5 line-clamp-2 text-[11px] leading-5 text-white/70">
              {ar ? 'اسأل عن الجرعة، التداخل الدوائي، أو البدائل — إجابات من قاعدة بيانات موثوقة.' : 'Ask about dosing, interactions or alternatives — grounded in a trusted database.'}
            </p>
          </div>
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/15 text-white transition group-hover:bg-white/25">
            <ChevronLeft className="h-4 w-4 rtl:block ltr:hidden" /><ArrowRight className="hidden h-4 w-4 ltr:block" />
          </span>
        </div>
      </Link>

      {/* ── Market products ─────────────────────────────────── */}
      <section>
        <SectionHead
          title={ar ? 'منتجات حقيقية من السوق' : 'Real market products'}
          subtitle={ar ? 'صور وأسعار ووكلاء • اليمن والخليج ومصر' : 'Photos, pricing and agents • Yemen & the Gulf'}
          action={<Link to="/search" className="inline-flex items-center gap-1 text-[11.5px] font-bold text-brand-300 transition hover:text-white">{t('common.viewAll')}<ArrowRight className="h-3 w-3 rtl:hidden" /><ChevronLeft className="hidden h-3 w-3 rtl:block" /></Link>}
        />
        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-4">
          {(productsRes?.data || []).map((p) => <ProductCard key={p.id} product={p} />)}
          {!productsRes && Array.from({ length: 4 }).map((_, i) => <div key={i} className="skeleton h-[230px]" />)}
        </div>
      </section>

      {/* ── Popular generics ────────────────────────────────── */}
      <section>
        <SectionHead
          title={ar ? 'أدوية يبحث عنها الناس' : 'Frequently viewed'}
          action={<Link to="/search" className="inline-flex items-center gap-1 text-[11.5px] font-bold text-brand-300 transition hover:text-white">{t('common.viewAll')}<ArrowRight className="h-3 w-3 rtl:hidden" /><ChevronLeft className="hidden h-3 w-3 rtl:block" /></Link>}
        />
        <div className="grid gap-2 sm:grid-cols-2">
          {(drugsRes?.data || []).slice(0, 6).map((d) => <DrugCard key={d.id} drug={d} compact />)}
        </div>
      </section>

      {/* ── Offline pack ────────────────────────────────────── */}
      {!meta && (
        <Link to="/more" className="group flex items-center gap-3 rounded-3xl border border-brand-400/20 bg-brand-500/10 p-3.5 backdrop-blur transition hover:border-brand-400/40">
          <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-brand-grad text-white shadow-float"><CloudDownload className="h-5 w-5" /></span>
          <div className="min-w-0 flex-1">
            <div className="text-[12.5px] font-bold text-white">{t('more.offlineTitle')}</div>
            <div className="text-[11px] text-ink-400">{t('more.offlineDesc')}</div>
          </div>
          <ChevronLeft className="h-4 w-4 text-brand-300 rtl:block ltr:hidden" />
          <ArrowRight className="hidden h-4 w-4 text-brand-300 ltr:block" />
        </Link>
      )}

      {/* ── Trust ───────────────────────────────────────────── */}
      <section className="card p-4 sm:p-5">
        <div className="mb-4 flex items-center gap-2">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-grad text-white shadow-float"><ShieldCheck className="h-4.5 w-4.5" /></span>
          <div>
            <h2 className="text-[14.5px] font-extrabold text-white">{t('home.trustTitle')}</h2>
            <p className="text-[10.5px] text-ink-400">{ar ? 'مصادر علمية وتحديث مستمر' : 'Evidence-based, always current'}</p>
          </div>
        </div>
        <div className="grid gap-2 sm:grid-cols-3">
          {[
            { icon: Stethoscope, title: t('home.trust1'), desc: t('home.trust1d') },
            { icon: BadgeCheck, title: t('home.trust2'), desc: t('home.trust2d') },
            { icon: TrendingUp, title: t('home.trust3'), desc: t('home.trust3d') },
          ].map((x) => (
            <div key={x.title} className="rounded-2xl border border-white/[.06] bg-white/[.03] p-3.5">
              <x.icon className="mb-2 h-4.5 w-4.5 text-brand-300" />
              <div className="text-[12px] font-bold text-white">{x.title}</div>
              <p className="mt-1 text-[11px] leading-5 text-ink-400">{x.desc}</p>
            </div>
          ))}
        </div>
        <div className="mt-3 flex items-start gap-2 rounded-2xl border border-amber-400/20 bg-amber-500/10 p-3 text-[11px] leading-5 text-amber-200">
          <Sparkles className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span><b>{t('home.disclaimer')}:</b> {ar ? config.disclaimer_ar : config.disclaimer_en}</span>
        </div>
      </section>

      {user?.role === 'admin' && (
        <Link to="/admin" className="flex items-center justify-between rounded-3xl border border-white/10 bg-ink-900/70 p-4 backdrop-blur transition hover:border-brand-400/30">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-white/[.07] text-brand-300"><Activity className="h-5 w-5" /></span>
            <div>
              <div className="text-[13px] font-bold text-white">{t('common.admin')}</div>
              <div className="text-[11px] text-ink-400">{ar ? 'إدارة الأدوية والمنتجات والاستيراد والمستخدمين' : 'Catalogue, imports, media and users'}</div>
            </div>
          </div>
          <ChevronLeft className="h-5 w-5 text-ink-400 rtl:block ltr:hidden" />
          <ArrowRight className="hidden h-5 w-5 text-ink-400 ltr:block" />
        </Link>
      )}

      <p className="flex items-center justify-center gap-1.5 pt-1 text-center text-[10px] font-semibold text-ink-500">
        <Star className="h-3 w-3 text-amber-400" />
        {ar ? 'صُنع بعناية للصيادلة والأطباء والطلاب في اليمن والعالم العربي' : 'Built for pharmacists, doctors and students across the Arab world'}
      </p>
    </div>
  );
}

function HeroDot() {
  return (
    <span className="relative flex h-1.5 w-1.5">
      <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-300 opacity-75" />
      <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-300" />
    </span>
  );
}
