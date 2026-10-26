import { Link } from 'react-router-dom';
import {
  BadgeCheck, BookOpen, Bot, Briefcase, Globe2, HeartHandshake, Languages, Mail, MessageCircle, Phone, ScanLine,
  ShieldCheck, Smartphone, Sparkles, Users, WifiOff,
} from 'lucide-react';
import { useConfig } from '../lib/config';
import { useI18n } from '../lib/i18n';
import { MDAIcon } from '../components/ui';

export default function About() {
  const { config } = useConfig();
  const { lang, t } = useI18n();
  const ar = lang === 'ar';

  const features = [
    { icon: BookOpen, title: ar ? 'مرجع دوائي شامل' : 'Complete drug reference', text: ar ? 'أدوية مصنّفة حسب الأجهزة الحيوية، مع الاسم العلمي وكل المنتجات التجارية والشركة والدولة والوكيل.' : 'Drugs grouped by body system with generic names, every commercial product, maker, country and Yemeni agent.' },
    { icon: ScanLine, title: ar ? 'وصفات وتحليل بالصور' : 'Prescriptions by photo', text: ar ? 'صوّر الوصفة أو ارفعها من المعرض، ويقوم التحليل الذكي باستخراج الأدوية ومطابقتها بالمنتجات المتوفرة.' : 'Capture or upload a prescription and let AI extract medicines and match available products.' },
    { icon: Bot, title: ar ? 'مساعد ذكي موثوق' : 'Trusted AI assistant', text: ar ? 'إجابات مرتبطة بقاعدة البيانات ومراجع WHO/BNF/FDA/EMA، مع تحذير السلامة دائمًا.' : 'Answers grounded in the database and WHO/BNF/FDA/EMA references, always with a safety note.' },
    { icon: WifiOff, title: ar ? 'يعمل دون إنترنت' : 'Works offline', text: ar ? 'حمّل حزمة البيانات مرة واحدة لتتصفح الأدوية والبحث دون اتصال.' : 'Download the offline pack once and browse/search medicines without a connection.' },
    { icon: Users, title: ar ? 'مجتمع ووظائف' : 'Community & jobs', text: ar ? 'اسأل وشارك، وتابع لوحة وظائف الصيادلة، وردود الإدارة تظهر للجميع.' : 'Ask, share, follow the pharmacy jobs board; admin replies are visible to everyone.' },
    { icon: Languages, title: ar ? 'عربي وإنجليزي' : 'Arabic & English', text: ar ? 'واجهة كاملة بالعربية والإنجليزية مع دعم RTL ووضع ليلي.' : 'Full Arabic/English UI with RTL support and a dark theme.' },
    { icon: Smartphone, title: ar ? 'مصمّم للجوال' : 'Mobile first', text: ar ? 'تجربة سريعة مبنية للهاتف، وقابلة للتثبيت كتطبيق أندرويد.' : 'Fast phone-first experience, installable as an Android app.' },
    { icon: BadgeCheck, title: ar ? 'بيانات قابلة للتحرير' : 'Editable data', text: ar ? 'كل دواء ومنتج وصورة يمكن تحريره أو استيراده من لوحة الإدارة، ويُحفظ بشكل دائم.' : 'Every drug, product and image is editable/importable from the admin panel and stored permanently.' },
  ];

  return (
    <div className="space-y-4">
      <div className="relative overflow-hidden rounded-3xl page-hero p-6 text-center text-white">
        <div className="absolute -start-10 -top-10 h-40 w-40 rounded-full bg-white/10" />
        <div className="absolute -bottom-12 -end-10 h-44 w-44 rounded-full bg-white/5" />
        <div className="relative flex justify-center"><MDAIcon size={54} /></div>
        <h1 className="relative mt-3 text-[22px] font-extrabold">{config.name_ar}</h1>
        <p className="relative text-[11px] text-white/70">{config.name_en} · Medicine Data App</p>
        <p className="relative mx-auto mt-2 max-w-md text-[11.5px] leading-6 text-white/85">{ar ? config.about_ar : config.about_en}</p>
        <div className="relative mt-4 flex justify-center gap-2 text-[10.5px] font-semibold">
          <span className="rounded-full bg-white/15 px-2.5 py-1">{config.counts?.drugs ?? 0} {ar ? 'دواء' : 'drugs'}</span>
          <span className="rounded-full bg-white/15 px-2.5 py-1">{config.counts?.products ?? 0} {ar ? 'منتج' : 'products'}</span>
          <span className="rounded-full bg-white/15 px-2.5 py-1">{config.counts?.systems ?? 0} {ar ? 'جهاز' : 'systems'}</span>
        </div>
      </div>

      <div className="card p-4">
        <div className="mb-3 flex items-center gap-2 text-brand-300"><HeartHandshake className="h-[18px] w-[18px]" /><h2 className="text-[13px] font-extrabold text-white">{ar ? 'المالك والحقوق' : 'Ownership & rights'}</h2></div>
        <div className="flex items-center gap-3 rounded-2xl border border-white/[.06] bg-white/[.03] p-3">
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-brand-grad text-[15px] font-black on-color shadow-float ring-1 ring-white/20">ع.م</span>
          <div className="min-w-0">
            <div className="truncate text-[13px] font-extrabold text-white">{config.owner_name}</div>
            <div className="text-[11px] text-brand-300">{config.owner_title}</div>
            <div className="mt-0.5 text-[10px] text-ink-500">Developer &amp; Creator · MDA</div>
          </div>
        </div>
        <p className="mt-2.5 text-[11px] leading-6 text-ink-400">
          {ar ? 'جميع حقوق التطبيق والبيانات والتصميم محفوظة للمالك. يُمنع إعادة النشر أو الاستخدام التجاري دون إذن كتابي. العلامة التجارية MDA مسجلة لصالح المالك.' : 'All rights to the application, data and design belong to the owner. Redistribution or commercial use without written permission is prohibited. The MDA brand belongs to the owner.'}
        </p>
        <div className="mt-2.5 grid grid-cols-2 gap-1.5">
          <a href={`mailto:${config.owner_email}`} className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-white/[.07] bg-white/[.03] px-2 py-2 text-[10.5px] font-bold text-ink-200 transition hover:border-brand-400/30"><Mail className="h-3 w-3 text-brand-300" /><span className="truncate" dir="ltr">{config.owner_email}</span></a>
          <a href={`https://wa.me/${(config.whatsapp || '').replace(/[^\d]/g, '')}`} target="_blank" rel="noreferrer" className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-emerald-400/20 bg-emerald-500/10 px-2 py-2 text-[10.5px] font-bold text-emerald-200 transition hover:bg-emerald-500/20"><Phone className="h-3 w-3" /><span dir="ltr">{config.whatsapp}</span></a>
        </div>
      </div>

      <div className="grid gap-2 sm:grid-cols-2">
        {features.map((f) => (
          <div key={f.title} className="card p-4">
            <span className="mb-2 flex h-10 w-10 items-center justify-center rounded-2xl bg-brand-500/15 text-brand-300 ring-1 ring-brand-400/20"><f.icon className="h-[18px] w-[18px]" /></span>
            <h3 className="text-[12.5px] font-extrabold text-white">{f.title}</h3>
            <p className="mt-0.5 text-[11px] leading-5 text-ink-400">{f.text}</p>
          </div>
        ))}
      </div>

      <div className="card p-4">
        <div className="mb-2 flex items-center gap-2 text-emerald-300"><ShieldCheck className="h-[18px] w-[18px]" /><h2 className="text-[13px] font-extrabold text-white">{ar ? 'مصادر المعلومات' : 'Sources'}</h2></div>
        <ul className="space-y-1.5 text-[11px] leading-6 text-ink-400">
          <li>• WHO Essential Medicines List — <span className="text-ink-200">who.int</span></li>
          <li>• BNF (British National Formulary) — <span className="text-ink-200">bnf.nice.org.uk</span></li>
          <li>• FDA Drug Labels & DailyMed — <span className="text-ink-200">dailymed.nlm.nih.gov</span></li>
          <li>• EMA / SmPC — <span className="text-ink-200">ema.europa.eu</span></li>
          <li>• Yemeni MOH & local distributors</li>
        </ul>
        <p className="mt-2 rounded-xl border border-amber-400/20 bg-amber-500/10 p-2.5 text-[10.5px] leading-5 text-amber-200">{ar ? config.disclaimer_ar : config.disclaimer_en}</p>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <Link to="/community" className="btn-soft"><MessageCircle className="h-4 w-4" />{ar ? 'تواصل معنا' : 'Contact us'}</Link>
        <Link to="/jobs" className="btn-ghost"><Briefcase className="h-4 w-4" />{ar ? 'لوحة الوظائف' : 'Jobs board'}</Link>
        <Link to="/legal/privacy" className="btn-ghost"><ShieldCheck className="h-4 w-4" />{ar ? 'سياسة الخصوصية' : 'Privacy policy'}</Link>
        <Link to="/legal/terms" className="btn-ghost"><BookOpen className="h-4 w-4" />{ar ? 'شروط الاستخدام' : 'Terms of use'}</Link>
      </div>
      <p className="pb-2 text-center text-[10px] text-ink-400">© {new Date().getFullYear()} {config.owner_name} · MDA · {ar ? 'جميع الحقوق محفوظة' : 'All rights reserved'}</p>
      <div className="flex justify-center gap-2 pb-2 text-[9.5px] text-ink-400">
        <span className="inline-flex items-center gap-1"><Globe2 className="h-2.5 w-2.5" />Yemen</span>
        <span>·</span><span className="inline-flex items-center gap-1"><Sparkles className="h-2.5 w-2.5" />v{__APP_VERSION__}</span>
        <span>·</span><span className="inline-flex items-center gap-1"><BadgeCheck className="h-2.5 w-2.5" />{t('common.verified')}</span>
      </div>
    </div>
  );
}
