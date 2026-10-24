import { Link } from 'react-router-dom';
import {
  Bot, Briefcase, ChevronLeft, ChevronRight, Database, Download, FilePlus2, FileText, Globe2, Info, Languages, LayoutDashboard,
  LogIn, LogOut, MessageCircle, MoonStar, ScanLine, ScrollText, Settings2, ShieldCheck, ShoppingCart, SunMedium, UserRound, Users, Mail, Phone,
} from 'lucide-react';
import { useI18n } from '../lib/i18n';
import { useConfig } from '../lib/config';
import { useAuth } from '../lib/auth';
import { Avatar, Badge, useToast } from '../components/ui';
import { downloadPack } from '../lib/offline';
import { useState } from 'react';

export default function More() {
  const { t, lang, toggleLang } = useI18n();
  const { dark, toggleDark, config } = useConfig();
  const { user, logout } = useAuth();
  const { push } = useToast();
  const [busy, setBusy] = useState(false);

  const links = [
    { to: '/prescriptions', icon: ScrollText, label: t('rx.title'), desc: t('more.rxDesc'), tone: 'text-rose-600 bg-rose-50 dark:bg-rose-950/30' },
    { to: '/pharmacy', icon: ShoppingCart, label: t('pharmacy.title'), desc: (lang === 'ar' ? 'المخزون والأسعار وتواريخ الانتهاء' : 'Stock, prices and expiry tracking'), tone: 'text-indigo-600 bg-indigo-50 dark:bg-indigo-950/30' },
    { to: '/submit-drug', icon: FilePlus2, label: t('submit.title'), desc: (lang === 'ar' ? 'أرسل دواءً مفقودًا للمراجعة' : 'Submit a missing medicine'), tone: 'text-teal-600 bg-teal-50 dark:bg-teal-950/30' },
    { to: '/scan', icon: ScanLine, label: t('scan.title'), desc: t('more.scanDesc'), tone: 'text-sky-600 bg-sky-50 dark:bg-sky-950/30' },
    { to: '/ai', icon: Bot, label: t('ai.title'), desc: t('more.aiDesc'), tone: 'text-violet-600 bg-violet-50 dark:bg-violet-950/30' },
    { to: '/community', icon: Users, label: t('community.title'), desc: t('more.communityDesc'), tone: 'text-emerald-600 bg-emerald-50 dark:bg-emerald-950/30' },
    { to: '/jobs', icon: Briefcase, label: t('jobs.title'), desc: t('more.jobsDesc'), tone: 'text-amber-600 bg-amber-50 dark:bg-amber-950/30' },
    { to: '/directories', icon: Database, label: t('dir.title'), desc: t('more.dirDesc'), tone: 'text-ink-600 bg-ink-100 dark:bg-ink-800' },
    { to: '/about', icon: Info, label: t('about.title'), desc: t('more.aboutDesc'), tone: 'text-brand-700 bg-brand-50 dark:bg-brand-950/30' },
  ];

  const download = async () => {
    setBusy(true);
    try {
      await downloadPack();
      push(t('more.packSaved'));
    } catch { push(t('common.error'), 'error'); }
    finally { setBusy(false); }
  };

  return (
    <div className="space-y-4">
      <div className="card overflow-hidden">
        {user ? (
          <Link to="/profile" className="flex items-center gap-3 p-4">
            <Avatar name={user.name} src={user.avatar} size={52} />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <h2 className="truncate text-[15px] font-extrabold text-ink-900 dark:text-white">{user.name}</h2>
                {user.role === 'admin' && <Badge tone="amber">{t('more.admin')}</Badge>}
              </div>
              <p className="truncate text-[11px] text-ink-500">{user.email}</p>
              <p className="mt-0.5 text-[10px] text-ink-400">{user.city || '—'} · {t('profile.memberSince')} {new Date(user.created_at).getFullYear()}</p>
            </div>
            <ChevronLeft className="h-4 w-4 text-ink-300 rtl:block ltr:hidden" />
            <ChevronRight className="hidden h-4 w-4 text-ink-300 ltr:block" />
          </Link>
        ) : (
          <div className="p-4">
            <div className="mb-2 flex items-center gap-2"><span className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-50 text-brand-700 dark:bg-brand-950/40 dark:text-brand-300"><UserRound className="h-5 w-5" /></span><div><div className="text-[13px] font-extrabold">{t('common.guest')}</div><div className="text-[10.5px] text-ink-500">{t('more.loginDesc')}</div></div></div>
            <div className="flex gap-2">
              <Link to="/auth" className="btn-primary flex-1"><LogIn className="h-4 w-4" />{t('common.login')}</Link>
            </div>
          </div>
        )}
      </div>

      {user?.role === 'admin' && (
        <Link to="/admin" className="flex items-center gap-3 rounded-2xl border border-amber-300 bg-amber-50 p-3.5 dark:border-amber-900 dark:bg-amber-950/30">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-500 text-white"><LayoutDashboard className="h-5 w-5" /></span>
          <div className="min-w-0 flex-1"><div className="text-[12.5px] font-extrabold text-amber-900 dark:text-amber-200">{t('admin.title')}</div><div className="text-[10px] text-amber-800/70 dark:text-amber-300/70">{t('more.adminDesc')}</div></div>
          <ChevronLeft className="h-4 w-4 text-amber-600 rtl:block ltr:hidden" /><ChevronRight className="hidden h-4 w-4 text-amber-600 ltr:block" />
        </Link>
      )}

      <div className="card divide-soft overflow-hidden px-1">
        {links.map((l) => (
          <Link key={l.to} to={l.to} className="flex items-center gap-3 rounded-xl px-3 py-3 transition hover:bg-ink-50 dark:hover:bg-ink-800/60">
            <span className={`flex h-9 w-9 items-center justify-center rounded-xl ${l.tone}`}><l.icon className="h-4 w-4" /></span>
            <div className="min-w-0 flex-1"><div className="text-[12.5px] font-bold text-ink-800 dark:text-ink-100">{l.label}</div><div className="line-clamp-1 text-[10px] text-ink-400">{l.desc}</div></div>
            <ChevronLeft className="h-3.5 w-3.5 text-ink-300 rtl:block ltr:hidden" /><ChevronRight className="hidden h-3.5 w-3.5 text-ink-300 ltr:block" />
          </Link>
        ))}
      </div>

      <div className="card divide-soft overflow-hidden px-1">
        <button onClick={toggleLang} className="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-start hover:bg-ink-50 dark:hover:bg-ink-800/60">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-ink-100 text-ink-600 dark:bg-ink-800 dark:text-ink-300"><Languages className="h-4 w-4" /></span>
          <div className="flex-1"><div className="text-[12.5px] font-bold">{t('more.language')}</div><div className="text-[10px] text-ink-400">{lang === 'ar' ? 'العربية' : 'English'}</div></div>
          <span className="text-[10.5px] font-bold text-brand-700 dark:text-brand-300">{lang === 'ar' ? 'English' : 'العربية'}</span>
        </button>
        <button onClick={toggleDark} className="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-start hover:bg-ink-50 dark:hover:bg-ink-800/60">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-ink-100 text-ink-600 dark:bg-ink-800 dark:text-ink-300">{dark ? <MoonStar className="h-4 w-4" /> : <SunMedium className="h-4 w-4" />}</span>
          <div className="flex-1"><div className="text-[12.5px] font-bold">{t('more.theme')}</div><div className="text-[10px] text-ink-400">{dark ? t('more.dark') : t('more.light')}</div></div>
          <span className={`relative h-5 w-9 rounded-full transition ${dark ? 'bg-brand-600' : 'bg-ink-300'}`}><span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition-all ${dark ? 'start-4' : 'start-0.5'}`} /></span>
        </button>
        <button onClick={download} disabled={busy} className="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-start hover:bg-ink-50 dark:hover:bg-ink-800/60">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-ink-100 text-ink-600 dark:bg-ink-800 dark:text-ink-300"><Download className="h-4 w-4" /></span>
          <div className="flex-1"><div className="text-[12.5px] font-bold">{t('more.offlinePack')}</div><div className="text-[10px] text-ink-400">{busy ? t('common.loading') : t('more.offlineDesc')}</div></div>
        </button>
      </div>

      <div className="card space-y-2 p-4">
        <div className="flex items-center gap-2 text-[11px] font-bold text-ink-500"><MessageCircle className="h-3.5 w-3.5" />{t('more.contact')}</div>
        <a href={`https://wa.me/${(config.whatsapp || '').replace(/[^\d]/g, '')}`} target="_blank" rel="noreferrer" className="flex items-center gap-2 rounded-xl bg-emerald-50 px-3 py-2.5 text-[11.5px] font-bold text-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-300"><Phone className="h-3.5 w-3.5" />WhatsApp · {config.whatsapp}</a>
        <a href={`mailto:${config.support_email}`} className="flex items-center gap-2 rounded-xl bg-ink-50 px-3 py-2.5 text-[11.5px] font-bold text-ink-700 dark:bg-ink-800 dark:text-ink-200"><Mail className="h-3.5 w-3.5" />{config.support_email}</a>
      </div>

      <div className="space-y-2 text-center">
        <div className="inline-flex items-center gap-1.5 rounded-full bg-ink-100 px-3 py-1 text-[9.5px] font-semibold text-ink-500 dark:bg-ink-800">
          <Globe2 className="h-2.5 w-2.5" /> MDA v1.0 · {config.counts?.drugs ?? 0} drugs · {config.counts?.products ?? 0} products
        </div>
        <p className="text-[9.5px] leading-5 text-ink-400">{t('more.credit')} · {config.owner_name}</p>
        {user && <button onClick={() => { logout(); push(t('common.logoutDone')); }} className="mx-auto flex items-center gap-1.5 rounded-xl px-3 py-2 text-[11px] font-bold text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/30"><LogOut className="h-3.5 w-3.5" />{t('common.logout')}</button>}
      </div>
    </div>
  );
}
