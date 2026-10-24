import { useEffect, useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import {
  Briefcase, ChevronLeft, CircleUserRound, CloudDownload, Home, LayoutGrid, LogIn, Mail, Menu, MessageCircle,
  MoonStar, MoreHorizontal, ScanLine, Search, ShieldCheck, SunMedium, WifiOff, X, Pill, Languages, Sparkles,
} from 'lucide-react';
import { Logo, Avatar, MDAIcon } from './ui';
import { useI18n } from '../lib/i18n';
import { useConfig } from '../lib/config';
import { useAuth } from '../lib/auth';
import { useOnline } from '../lib/offline';
import { cx } from '../lib/utils';

const NAV = [
  { to: '/', key: 'nav.home', icon: Home, end: true },
  { to: '/systems', key: 'nav.systems', icon: LayoutGrid },
  { to: '/scan', key: 'home.tool.scan', icon: ScanLine },
  { to: '/prescriptions', key: 'nav.rx', icon: Pill },
  { to: '/more', key: 'nav.more', icon: MoreHorizontal },
];

function CreditBadge() {
  const { lang } = useI18n();
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-brand-200/70 bg-white/70 px-2 py-0.5 text-[9.5px] font-semibold text-brand-800 backdrop-blur dark:border-brand-800 dark:bg-ink-900/60 dark:text-brand-200">
      <ShieldCheck className="h-2.5 w-2.5" />
      {lang === 'ar' ? 'عبدالمجيد الماخذي' : 'Abdulmajeed Almakhedhi'}
    </span>
  );
}

export function TopBar() {
  const { t, lang, toggleLang } = useI18n();
  const { dark, toggleDark } = useConfig();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);

  return (
    <header className="sticky top-0 z-40 border-b border-ink-200/70 glass dark:border-ink-800/80">
      <div className="app-shell flex h-[58px] items-center justify-between gap-3">
        <Link to="/" className="shrink-0" aria-label="MDA home"><Logo /></Link>

        <nav className="hidden items-center gap-1 lg:flex">
          {[
            { to: '/systems', label: t('nav.systems') },
            { to: '/search', label: t('nav.search') },
            { to: '/ai', label: t('ai.title') },
            { to: '/community', label: t('community.title') },
            { to: '/jobs', label: t('jobs.title') },
            { to: '/directories', label: t('more.directories') },
          ].map((l) => (
            <NavLink key={l.to} to={l.to} className={({ isActive }) => cx('rounded-xl px-3 py-2 text-[12.5px] font-semibold transition', isActive ? 'bg-brand-50 text-brand-800 dark:bg-brand-900/40 dark:text-brand-200' : 'text-ink-500 hover:bg-ink-100 dark:hover:bg-ink-900')}>
              {l.label}
            </NavLink>
          ))}
        </nav>

        <div className="flex items-center gap-1">
          <span className="hidden md:inline-flex"><CreditBadge /></span>
          <button onClick={toggleLang} className="icon-btn" title={t('common.language')} aria-label={t('common.language')}>
            <span className="text-[10px] font-black tracking-wide">{lang === 'ar' ? 'EN' : 'ع'}</span>
          </button>
          <button onClick={toggleDark} className="icon-btn" aria-label={t('common.dark')}>
            {dark ? <SunMedium className="h-[18px] w-[18px]" /> : <MoonStar className="h-[18px] w-[18px]" />}
          </button>
          <button onClick={() => setOpen((v) => !v)} className="icon-btn lg:hidden" aria-label="menu">
            {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
          <button onClick={() => navigate(user ? '/profile' : '/auth')} className="ms-0.5 hidden h-9 items-center gap-2 rounded-full border border-ink-200 bg-white ps-1 pe-3 text-[12px] font-bold text-ink-700 transition hover:bg-ink-50 dark:border-ink-800 dark:bg-ink-900 dark:text-ink-200 sm:flex">
            {user ? <Avatar name={user.name} src={user.avatar} size={26} /> : <CircleUserRound className="h-5 w-5" />}
            <span className="max-w-[90px] truncate">{user ? user.name.split(' ')[0] : t('common.login')}</span>
          </button>
        </div>
      </div>

      {open && (
        <div className="border-t border-ink-100 bg-white px-4 pb-4 pt-2 dark:border-ink-800 dark:bg-ink-950 lg:hidden">
          <div className="grid grid-cols-2 gap-2">
            {[
              { to: '/systems', label: t('nav.systems'), icon: LayoutGrid },
              { to: '/search', label: t('nav.search'), icon: Search },
              { to: '/ai', label: t('ai.title'), icon: Sparkles },
              { to: '/community', label: t('community.title'), icon: MessageCircle },
              { to: '/jobs', label: t('jobs.title'), icon: Briefcase },
              { to: '/directories', label: t('more.directories'), icon: LayoutGrid },
              { to: '/profile', label: t('common.profile'), icon: CircleUserRound },
              { to: '/admin', label: t('common.admin'), icon: ShieldCheck },
            ].map((l) => (
              <Link key={l.to} to={l.to} onClick={() => setOpen(false)} className="flex items-center gap-2 rounded-xl bg-ink-50 px-3 py-2.5 text-[12.5px] font-semibold text-ink-700 dark:bg-ink-900 dark:text-ink-200">
                <l.icon className="h-4 w-4 text-brand-600" />{l.label}
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
    <nav className="no-print fixed inset-x-0 bottom-0 z-40 border-t border-ink-200/70 glass pb-[var(--safe-bottom)] dark:border-ink-800/80">
      <div className="mx-auto flex max-w-lg items-stretch justify-around px-2 pb-1 pt-1">
        {NAV.map((item) => (
          <NavLink key={item.to} to={item.to} end={(item as any).end} className={({ isActive }) => cx('nav-item', isActive && 'nav-item-active')}>
            {({ isActive }) => (
              <>
                <span className={cx('flex h-8 w-12 items-center justify-center rounded-xl transition', isActive && 'bg-brand-50 dark:bg-brand-900/50')}>
                  <item.icon className={cx('h-[19px] w-[19px]', isActive ? 'text-brand-700 dark:text-brand-300' : 'text-ink-400')} strokeWidth={2.1} />
                </span>
                <span className="line-clamp-1 max-w-[64px] text-center">{t(item.key)}</span>
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
    <div className="sticky top-[58px] z-30 border-b border-amber-200 bg-amber-50 px-4 py-2 text-center text-[11.5px] font-semibold text-amber-800 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-300">
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
    <footer className="mx-auto mt-10 w-full max-w-6xl px-4 pb-8 sm:px-6">
      <div className="card overflow-hidden">
        <div className="grid gap-6 p-5 sm:grid-cols-3">
          <div>
            <Logo />
            <p className="mt-2 text-[11.5px] leading-6 text-ink-500">
              {lang === 'ar' ? config.about_ar : config.about_en}
            </p>
            <div className="mt-3 flex items-center gap-2">
              <span className="rounded-lg bg-brand-50 px-2 py-1 text-[10px] font-bold text-brand-700 dark:bg-brand-900/40 dark:text-brand-300">MDA v1.0</span>
              <CreditBadge />
            </div>
          </div>
          <div className="text-[12px]">
            <div className="mb-2 text-[11px] font-bold uppercase tracking-wide text-ink-400">{t('common.more')}</div>
            <div className="grid gap-1.5">
              <Link to="/about" className="text-ink-600 hover:text-brand-700 dark:text-ink-300">{t('more.about')}</Link>
              <Link to="/directories" className="text-ink-600 hover:text-brand-700 dark:text-ink-300">{t('more.directories')}</Link>
              <Link to="/ai" className="text-ink-600 hover:text-brand-700 dark:text-ink-300">{t('ai.title')}</Link>
              <Link to="/community" className="text-ink-600 hover:text-brand-700 dark:text-ink-300">{t('community.title')}</Link>
              <Link to="/admin" className="text-ink-600 hover:text-brand-700 dark:text-ink-300">{t('common.admin')}</Link>
            </div>
          </div>
          <div className="text-[12px]">
            <div className="mb-2 text-[11px] font-bold uppercase tracking-wide text-ink-400">{t('more.contact')}</div>
            <a href={`https://wa.me/${wa}`} target="_blank" rel="noreferrer" className="flex items-center gap-2 py-1 text-ink-600 hover:text-brand-700 dark:text-ink-300">
              <MessageCircle className="h-4 w-4 text-emerald-600" /> {config.whatsapp}
            </a>
            <a href={`mailto:${config.support_email}`} className="flex items-center gap-2 py-1 text-ink-600 hover:text-brand-700 dark:text-ink-300">
              <Mail className="h-4 w-4 text-sky-600" /> {config.support_email}
            </a>
            <div className="mt-3 rounded-xl bg-ink-50 p-2.5 text-[10.5px] leading-5 text-ink-500 dark:bg-ink-800/60">
              {lang === 'ar' ? config.disclaimer_ar : config.disclaimer_en}
            </div>
          </div>
        </div>
        <div className="flex flex-col items-center justify-between gap-1 border-t border-ink-100 bg-ink-50/60 px-4 py-3 text-center text-[10.5px] text-ink-500 dark:border-ink-800 dark:bg-ink-900/40 sm:flex-row sm:text-start">
          <span>{t('home.footerRights', { year })}</span>
          <span className="inline-flex items-center gap-1"><MDAIcon size={14} /> MDA · MedicineData</span>
        </div>
      </div>
    </footer>
  );
}

export default function Layout() {
  const location = useLocation();
  useEffect(() => { window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior }); }, [location.pathname]);
  return (
    <div className="mesh min-h-screen">
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
