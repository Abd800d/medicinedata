import { useEffect, useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import {
  Briefcase, ChevronLeft, CircleUserRound, CloudDownload, Home, LayoutGrid, Mail, Menu, MessageCircle,
  MoreHorizontal, ScanLine, Search, ShieldCheck, WifiOff, X, Pill, Sparkles,
  Stethoscope, Boxes,
} from 'lucide-react';
import { Logo, Avatar, MDAIcon } from './ui';
import { useI18n } from '../lib/i18n';
import { useConfig } from '../lib/config';
import { useAuth } from '../lib/auth';
import { useOnline } from '../lib/offline';
import { cx } from '../lib/utils';

/* Bottom navigation — 5 destinations, matching the mobile reference design */
const NAV = [
  { to: '/', key: 'nav.home', icon: Home, end: true },
  { to: '/systems', key: 'nav.systems', icon: Boxes },
  { to: '/search', key: 'nav.search', icon: Search },
  { to: '/community', key: 'community.title', icon: MessageCircle },
  { to: '/more', key: 'nav.more', icon: MoreHorizontal },
];

const DESKTOP_NAV = [
  { to: '/systems', key: 'nav.systems' },
  { to: '/search', key: 'nav.search' },
  { to: '/scan', key: 'home.tool.scan' },
  { to: '/ai', key: 'ai.title' },
  { to: '/community', key: 'community.title' },
  { to: '/directories', key: 'more.directories' },
];

function CreditBadge() {
  const { lang } = useI18n();
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-brand-400/25 bg-brand-500/10 px-2 py-0.5 text-[9.5px] font-bold text-brand-200 backdrop-blur">
      <ShieldCheck className="h-2.5 w-2.5" />
      {lang === 'ar' ? 'عبدالمجيد الماخذي' : 'Abdulmajeed Almakhedhi'}
    </span>
  );
}

export function TopBar() {
  const { t, lang, toggleLang } = useI18n();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 6);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <header className={cx('sticky top-0 z-40 transition-all duration-300', scrolled ? 'backdrop-blur-2xl' : '')}>
      <div className={cx('border-b transition-colors', scrolled ? 'border-white/[.08] bg-ink-950/80' : 'border-transparent bg-gradient-to-b from-ink-950/85 to-transparent')}>
        <div className="app-shell flex h-[62px] items-center justify-between gap-3">
          <Link to="/" className="shrink-0" aria-label="MDA home"><Logo /></Link>

          <nav className="hidden items-center gap-0.5 lg:flex">
            {DESKTOP_NAV.map((l) => (
              <NavLink
                key={l.to}
                to={l.to}
                className={({ isActive }) => cx(
                  'relative rounded-xl px-3 py-2 text-[12.5px] font-bold transition',
                  isActive ? 'text-white' : 'text-ink-400 hover:text-white',
                )}
              >
                {({ isActive }) => (
                  <>
                    {t(l.key)}
                    {isActive && <span className="absolute inset-x-3 -bottom-0.5 h-0.5 rounded-full bg-brand-grad" />}
                  </>
                )}
              </NavLink>
            ))}
          </nav>

          <div className="flex items-center gap-1.5">
            <span className="hidden md:inline-flex"><CreditBadge /></span>
            <button onClick={toggleLang} className="icon-btn h-9 w-9" title={t('common.language')} aria-label={t('common.language')}>
              <span className="text-[10px] font-black tracking-wide">{lang === 'ar' ? 'EN' : 'ع'}</span>
            </button>
            <button onClick={() => setOpen((v) => !v)} className="icon-btn h-9 w-9 lg:hidden" aria-label="menu">
              {open ? <X className="h-[18px] w-[18px]" /> : <Menu className="h-[18px] w-[18px]" />}
            </button>
            <Link to={user ? '/profile' : '/auth'} className="ms-0.5 flex h-9 items-center gap-2 rounded-full border border-white/10 bg-white/[.05] ps-1 pe-3 text-[11.5px] font-bold text-ink-100 transition hover:border-brand-400/40 hover:bg-white/[.09]">
              {user ? <Avatar name={user.name} src={user.avatar} size={26} /> : <CircleUserRound className="h-5 w-5" />}
              <span className="hidden max-w-[90px] truncate sm:inline">{user ? user.name.split(' ')[0] : t('common.login')}</span>
            </Link>
          </div>
        </div>
      </div>

      {open && (
        <div className="border-b border-white/[.08] bg-ink-950/95 px-4 pb-4 pt-2 backdrop-blur-2xl lg:hidden">
          <div className="grid grid-cols-2 gap-2">
            {[
              { to: '/systems', label: t('nav.systems'), icon: LayoutGrid },
              { to: '/search', label: t('nav.search'), icon: Search },
              { to: '/scan', label: t('home.tool.scan'), icon: ScanLine },
              { to: '/ai', label: t('ai.title'), icon: Sparkles },
              { to: '/prescriptions', label: t('nav.rx'), icon: Pill },
              { to: '/community', label: t('community.title'), icon: MessageCircle },
              { to: '/jobs', label: t('jobs.title'), icon: Briefcase },
              { to: '/directories', label: t('more.directories'), icon: Stethoscope },
              { to: '/pharmacy', label: t('pharmacy.title'), icon: CloudDownload },
              { to: '/profile', label: t('common.profile'), icon: CircleUserRound },
              { to: '/admin', label: t('common.admin'), icon: ShieldCheck },
            ].map((l) => (
              <Link key={l.to} to={l.to} onClick={() => setOpen(false)}
                className="flex items-center gap-2 rounded-xl border border-white/[.06] bg-white/[.04] px-3 py-2.5 text-[12.5px] font-semibold text-ink-200">
                <l.icon className="h-4 w-4 text-brand-300" />{l.label}
              </Link>
            ))}
          </div>
        </div>
      )}
    </header>
  );
}

export function BottomNav() {
  const { t } = useI18n();
  return (
    <nav className="no-print fixed inset-x-0 bottom-0 z-40 px-3 pb-[calc(10px+var(--safe-bottom))]">
      <div className="mx-auto flex max-w-md items-stretch justify-between gap-0.5 rounded-[26px] border border-white/[.10] bg-ink-950/85 p-1.5 shadow-[0_20px_50px_-24px_rgba(0,0,0,.95)] backdrop-blur-2xl">
        {NAV.map((item) => (
          <NavLink key={item.to} to={item.to} end={(item as any).end}
            className={({ isActive }) => cx('nav-item', isActive && 'nav-item-active')}>
            {({ isActive }) => (
              <>
                <span className="nav-ico">
                  <item.icon className="h-[18px] w-[18px]" strokeWidth={isActive ? 2.4 : 2} />
                </span>
                <span className="line-clamp-1 max-w-[62px] text-center leading-tight">{t(item.key)}</span>
              </>
            )}
          </NavLink>
        ))}
      </div>
    </nav>
  );
}

export function OfflineBanner() {
  const online = useOnline();
  const { t } = useI18n();
  if (online) return null;
  return (
    <div className="sticky top-[62px] z-30 border-b border-amber-400/20 bg-amber-500/10 px-4 py-2 text-center text-[11.5px] font-bold text-amber-200 backdrop-blur">
      <span className="inline-flex items-center gap-1.5"><WifiOff className="h-3.5 w-3.5" />{t('offline.banner')}</span>
    </div>
  );
}

export function Footer() {
  const { t, lang } = useI18n();
  const { config } = useConfig();
  const year = new Date().getFullYear();
  const wa = (config.whatsapp || '').replace(/[^\d]/g, '');
  return (
    <footer className="mx-auto mt-10 w-full max-w-6xl px-4 pb-10 sm:px-6">
      <div className="overflow-hidden rounded-3xl border border-white/[.07] bg-ink-900/50 backdrop-blur-xl">
        <div className="grid gap-6 p-5 sm:grid-cols-3">
          <div>
            <Logo />
            <p className="mt-3 text-[11.5px] leading-6 text-ink-400">
              {lang === 'ar' ? config.about_ar : config.about_en}
            </p>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <span className="rounded-lg bg-brand-500/15 px-2 py-1 text-[10px] font-bold text-brand-200">MDA v1.0</span>
              <CreditBadge />
            </div>
          </div>
          <div className="text-[12px]">
            <div className="mb-2 text-[10px] font-bold uppercase tracking-[.14em] text-ink-500">{t('common.more')}</div>
            <div className="grid gap-1.5">
              {[
                ['/about', t('more.about')],
                ['/directories', t('more.directories')],
                ['/ai', t('ai.title')],
                ['/community', t('community.title')],
                ['/admin', t('common.admin')],
              ].map(([to, label]) => (
                <Link key={to} to={to} className="text-ink-300 transition hover:text-white">{label}</Link>
              ))}
            </div>
          </div>
          <div className="text-[12px]">
            <div className="mb-2 text-[10px] font-bold uppercase tracking-[.14em] text-ink-500">{t('more.contact')}</div>
            <a href={`https://wa.me/${wa}`} target="_blank" rel="noreferrer" className="flex items-center gap-2 py-1 text-ink-300 transition hover:text-white">
              <MessageCircle className="h-4 w-4 text-emerald-400" /> {config.whatsapp}
            </a>
            <a href={`mailto:${config.support_email}`} className="flex items-center gap-2 py-1 text-ink-300 transition hover:text-white">
              <Mail className="h-4 w-4 text-brand-300" /> {config.support_email}
            </a>
            <div className="mt-3 rounded-xl border border-white/[.06] bg-white/[.03] p-2.5 text-[10.5px] leading-5 text-ink-400">
              {lang === 'ar' ? config.disclaimer_ar : config.disclaimer_en}
            </div>
          </div>
        </div>
        <div className="flex flex-col items-center justify-between gap-1 border-t border-white/[.06] px-4 py-3 text-center text-[10.5px] text-ink-500 sm:flex-row sm:text-start">
          <span>{t('home.footerRights', { year })}</span>
          <span className="inline-flex items-center gap-1.5"><MDAIcon size={14} /> MDA · MedicineData</span>
        </div>
      </div>
    </footer>
  );
}

export default function Layout() {
  const location = useLocation();
  useEffect(() => { window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior }); }, [location.pathname]);
  return (
    <div className="app-bg min-h-screen">
      <TopBar />
      <OfflineBanner />
      <main className="app-shell page animate-fade-in">
        <Outlet />
      </main>
      <Footer />
      <div className="h-16" />
      <BottomNav />
    </div>
  );
}
