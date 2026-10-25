import { Link } from 'react-router-dom';
import { Bot, Briefcase, ChevronLeft, ChevronRight, CloudDownload, Database, Download, ExternalLink, FilePlus2, FileText, Globe2, Info, Languages, LayoutDashboard, LogIn, LogOut, Mail, MessageCircle, Phone, ScanLine, ScrollText, Server, Settings2, ShieldCheck, ShoppingCart, Smartphone, UserRound, Users } from 'lucide-react';
import { useI18n } from '../lib/i18n';
import { useConfig } from '../lib/config';
import { useAuth } from '../lib/auth';
import { Avatar, Badge, useToast } from '../components/ui';
import { requestInstall } from '../components/install';
import { useOnline } from '../lib/offline';
import { downloadPack } from '../lib/offline';
import { useState } from 'react';

export default function More() {
  const { t, lang, toggleLang } = useI18n();
  const { config } = useConfig();
  const { user, logout } = useAuth();
  const { push } = useToast();
  const [busy, setBusy] = useState(false);

  const links = [
    { to: '/prescriptions', icon: ScrollText, label: t('rx.title'), desc: t('more.rxDesc'), g: 'from-[#f43f5e] to-[#fb7185]' },
    { to: '/pharmacy', icon: ShoppingCart, label: t('pharmacy.title'), desc: (lang === 'ar' ? 'المخزون والأسعار وتواريخ الانتهاء' : 'Stock, prices and expiry tracking'), g: 'from-[#6366f1] to-[#818cf8]' },
    { to: '/submit-drug', icon: FilePlus2, label: t('submit.title'), desc: (lang === 'ar' ? 'أرسل دواءً مفقودًا للمراجعة' : 'Submit a missing medicine'), g: 'from-[#14b8a6] to-[#2dd4bf]' },
    { to: '/scan', icon: ScanLine, label: t('scan.title'), desc: t('more.scanDesc'), g: 'from-[#06b6d4] to-[#67e8f9]' },
    { to: '/ai', icon: Bot, label: t('ai.title'), desc: t('more.aiDesc'), g: 'from-[#8b5cf6] to-[#a78bfa]' },
    { to: '/community', icon: Users, label: t('community.title'), desc: t('more.communityDesc'), g: 'from-[#10b981] to-[#34d399]' },
    { to: '/jobs', icon: Briefcase, label: t('jobs.title'), desc: t('more.jobsDesc'), g: 'from-[#f59e0b] to-[#fbbf24]' },
    { to: '/directories', icon: Database, label: t('dir.title'), desc: t('more.dirDesc'), g: 'from-[#1b6dff] to-[#38c6ff]' },
    { to: '/about', icon: Info, label: t('about.title'), desc: t('more.aboutDesc'), g: 'from-[#0ea5e9] to-[#22d3ee]' },
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
        <div className="relative h-16 bg-[radial-gradient(120%_120%_at_100%_0%,rgba(34,211,238,.5),transparent_55%),linear-gradient(135deg,#0b2f7a,#1262e0)]">
          <span className="absolute -end-6 -top-8 h-24 w-24 rounded-full border-[14px] border-white/10" />
        </div>
        {user ? (
          <Link to="/profile" className="-mt-8 flex items-center gap-3 p-4 pt-0">
            <span className="rounded-full ring-4 ring-ink-900"><Avatar name={user.name} src={user.avatar} size={52} /></span>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <h2 className="truncate text-[15px] font-extrabold text-white">{user.name}</h2>
                {user.role === 'admin' && <Badge tone="amber">{t('more.admin')}</Badge>}
              </div>
              <p className="truncate text-[11px] text-ink-500">{user.email}</p>
              <p className="mt-0.5 text-[10.5px] text-ink-400">{user.city || '—'} · {t('profile.memberSince')} {new Date(user.created_at).getFullYear()}</p>
            </div>
            <ChevronLeft className="h-4 w-4 text-ink-300 rtl:block ltr:hidden" />
            <ChevronRight className="hidden h-4 w-4 text-ink-300 ltr:block" />
          </Link>
        ) : (
          <div className="p-4">
            <div className="mb-2 flex items-center gap-2"><span className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-grad text-white shadow-glow"><UserRound className="h-5 w-5" /></span><div><div className="text-[13px] font-extrabold">{t('common.guest')}</div><div className="text-[11px] text-ink-500">{t('more.loginDesc')}</div></div></div>
            <div className="flex gap-2">
              <Link to="/auth" className="btn-primary flex-1"><LogIn className="h-4 w-4" />{t('common.login')}</Link>
            </div>
          </div>
        )}
      </div>

      {user?.role === 'admin' && (
        <Link to="/admin" className="flex items-center gap-3 rounded-3xl border border-amber-400/25 bg-amber-500/10 p-3.5 backdrop-blur">
          <span className="flex h-10 w-10 items-center justify-center rounded-[14px] bg-gradient-to-br from-amber-500 to-orange-500 text-white shadow-tile ring-1 ring-white/20"><LayoutDashboard className="h-5 w-5" /></span>
          <div className="min-w-0 flex-1"><div className="text-[12.5px] font-extrabold text-amber-200">{t('admin.title')}</div><div className="text-[10.5px] text-amber-200/70">{t('more.adminDesc')}</div></div>
          <ChevronLeft className="h-4 w-4 text-amber-300 rtl:block ltr:hidden" /><ChevronRight className="hidden h-4 w-4 text-amber-300 ltr:block" />
        </Link>
      )}

      <div className="card divide-soft overflow-hidden px-1">
        {links.map((l) => (
          <Link key={l.to} to={l.to} className="flex items-center gap-3 rounded-xl px-3 py-2.5 transition hover:bg-white/[.04]">
            <span className={`flex h-10 w-10 items-center justify-center rounded-[14px] bg-gradient-to-br ${l.g} text-white shadow-tile ring-1 ring-white/20`}><l.icon className="h-[18px] w-[18px]" /></span>
            <div className="min-w-0 flex-1"><div className="text-[12.5px] font-bold text-white">{l.label}</div><div className="line-clamp-1 text-[10.5px] text-ink-400">{l.desc}</div></div>
            <ChevronLeft className="h-3.5 w-3.5 text-ink-500 rtl:block ltr:hidden" /><ChevronRight className="hidden h-3.5 w-3.5 text-ink-500 ltr:block" />
          </Link>
        ))}
      </div>

      <div className="card divide-soft overflow-hidden px-1">
        <button onClick={toggleLang} className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-start transition hover:bg-white/[.04]">
          <span className="flex h-10 w-10 items-center justify-center rounded-[14px] bg-gradient-to-br from-[#0ea5e9] to-[#22d3ee] text-white shadow-tile ring-1 ring-white/20"><Languages className="h-[18px] w-[18px]" /></span>
          <div className="flex-1"><div className="text-[12.5px] font-bold text-white">{t('more.language')}</div><div className="text-[10.5px] text-ink-400">{lang === 'ar' ? 'العربية' : 'English'}</div></div>
          <span className="rounded-lg bg-brand-500/15 px-2 py-1 text-[11px] font-bold text-brand-200">{lang === 'ar' ? 'English' : 'العربية'}</span>
        </button>
        <button onClick={() => requestInstall()} className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-start transition hover:bg-white/[.04]">
          <span className="flex h-10 w-10 items-center justify-center rounded-[14px] bg-gradient-to-br from-[#1b6dff] to-[#22d3ee] text-white shadow-tile ring-1 ring-white/20"><Smartphone className="h-[18px] w-[18px]" /></span>
          <div className="flex-1"><div className="text-[12.5px] font-bold text-white">{lang === 'ar' ? 'تثبيت التطبيق' : 'Install the app'}</div><div className="text-[10.5px] text-ink-400">{lang === 'ar' ? 'أضف MDA إلى الشاشة الرئيسية' : 'Add MDA to your home screen'}</div></div>
          <Download className="h-3.5 w-3.5 text-ink-500" />
        </button>
        <a href="https://github.com/Abd800d/medicinedata/releases/latest" target="_blank" rel="noreferrer" className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-start transition hover:bg-white/[.04]">
          <span className="flex h-10 w-10 items-center justify-center rounded-[14px] bg-gradient-to-br from-[#3ddc84] to-[#12a150] text-white shadow-tile ring-1 ring-white/20"><Smartphone className="h-4 w-4" /></span>
          <div className="flex-1"><div className="text-[12.5px] font-bold text-white">{lang === 'ar' ? 'تحميل نسخة الأندرويد (APK)' : 'Download Android APK'}</div><div className="text-[10.5px] text-ink-400">{lang === 'ar' ? 'أحدث إصدار من GitHub Releases' : 'Latest build from GitHub Releases'}</div></div>
          <ExternalLink className="h-3.5 w-3.5 text-ink-500" />
        </a>
        <Link to="/server" className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-start transition hover:bg-white/[.04]">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/[.05] text-ink-300"><Server className="h-4 w-4" /></span>
          <div className="flex-1"><div className="text-[12.5px] font-bold text-white">{lang === 'ar' ? 'الخادم والاتصال' : 'Server & connection'}</div><div className="text-[10px] text-ink-400">{lang === 'ar' ? 'عنوان الـ API واختبار الاتصال' : 'API URL and connection test'}</div></div>
          <ChevronLeft className="h-3.5 w-3.5 text-ink-500 rtl:block ltr:hidden" /><ChevronRight className="hidden h-3.5 w-3.5 text-ink-500 ltr:block" />
        </Link>
        <Link to="/offline" className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-start transition hover:bg-white/[.04]">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/[.05] text-ink-300"><CloudDownload className="h-4 w-4" /></span>
          <div className="flex-1"><div className="text-[12.5px] font-bold text-white">{lang === 'ar' ? 'العمل بدون إنترنت' : 'Offline mode'}</div><div className="text-[10px] text-ink-400">{lang === 'ar' ? 'حالة الحزمة والمساحة المستخدمة' : 'Pack status and storage'}</div></div>
          <ChevronLeft className="h-3.5 w-3.5 text-ink-500 rtl:block ltr:hidden" /><ChevronRight className="hidden h-3.5 w-3.5 text-ink-500 ltr:block" />
        </Link>
        <button onClick={download} disabled={busy} className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-start transition hover:bg-white/[.04]">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/[.05] text-ink-300"><Download className="h-4 w-4" /></span>
          <div className="flex-1"><div className="text-[12.5px] font-bold">{t('more.offlinePack')}</div><div className="text-[10.5px] text-ink-400">{busy ? t('common.loading') : t('more.offlineDesc')}</div></div>
        </button>
      </div>

      <div className="card space-y-2 p-4">
        <div className="flex items-center gap-2 text-[11px] font-bold text-ink-500"><MessageCircle className="h-3.5 w-3.5" />{t('more.contact')}</div>
        <a href={`https://wa.me/${(config.whatsapp || '').replace(/[^\d]/g, '')}`} target="_blank" rel="noreferrer" className="flex items-center gap-2 rounded-xl px-3 py-2.5 text-[11.5px] font-bold bg-emerald-500/10 text-emerald-200"><Phone className="h-3.5 w-3.5" />WhatsApp · {config.whatsapp}</a>
        <a href={`mailto:${config.support_email}`} className="flex items-center gap-2 rounded-xl px-3 py-2.5 text-[11.5px] font-bold bg-white/[.05] text-ink-200"><Mail className="h-3.5 w-3.5" />{config.support_email}</a>
      </div>

      <div className="space-y-2 text-center">
        <div className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[10px] font-semibold text-ink-500 bg-white/[.05]">
          <Globe2 className="h-2.5 w-2.5" /> MDA v{__APP_VERSION__} · {config.counts?.drugs ?? 0} drugs · {config.counts?.products ?? 0} products
        </div>
        <p className="text-[10px] leading-5 text-ink-400">{t('more.credit')} · {config.owner_name}</p>
        {user && <button onClick={() => { logout(); push(t('common.logoutDone')); }} className="mx-auto flex items-center gap-1.5 rounded-xl px-3 py-2 text-[11px] font-bold text-rose-300 hover:bg-rose-950/30"><LogOut className="h-3.5 w-3.5" />{t('common.logout')}</button>}
      </div>
    </div>
  );
}
