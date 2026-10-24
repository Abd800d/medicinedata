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
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-brand-800 via-brand-700 to-teal-900 p-6 text-center text-white">
        <div className="absolute -start-10 -top-10 h-40 w-40 rounded-full bg-white/10" />
        <div className="absolute -bottom-12 -end-10 h-44 w-44 rounded-full bg-white/5" />
        <div className="relative flex justify-center"><MDAIcon size={54} /></div>
        <h1 className="relative mt-3 text-[22px] font-extrabold">{config.name_ar}</h1>
        <p className="relative text-[11px] text-white/70">{config.name_en} · Medicine Data App</p>
        <p className="relative mx-auto mt-2 max-w-md text-[11.5px] leading-6 text-white/85">{ar ? config.about_ar : config.about_en}</p>
        <div className="relative mt-4 flex justify-center gap-2 text-[10px] font-semibold">
          <span className="rounded-full bg-white/15 px-2.5 py-1">{config.counts?.drugs ?? 0} {ar ? 'دواء' : 'drugs'}</span>
          <span className="rounded-full bg-white/15 px-2.5 py-1">{config.counts?.products ?? 0} {ar ? 'منتج' : 'products'}</span>
          <span className="rounded-full bg-white/15 px-2.5 py-1">{config.counts?.systems ?? 0} {ar ? 'جهاز' : 'systems'}</span>
        </div>
      </div>

      <div className="card p-4">
        <div className="mb-2 flex items-center gap-2 text-brand-700 dark:text-brand-300"><HeartHandshake className="h-4 w-4" /><h2 className="text-[13px] font-extrabold">{ar ? 'المالك والحقوق' : 'Ownership & rights'}</h2></div>
        <div className="text-[13px] font-extrabold text-ink-900 dark:text-white">{config.owner_name}</div>
        <div className="text-[11px] text-ink-500">{config.owner_title}</div>
        <p className="mt-2 text-[10.5px] leading-6 text-ink-500">
          {ar ? 'جميع حقوق التطبيق والبيانات والتصميم محفوظة للمالك. يُمنع إعادة النشر أو الاستخدام التجاري دون إذن كتابي. العلامة التجارية MDA مسجلة لصالح المالك.' : 'All rights to the application, data and design belong to the owner. Redistribution or commercial use without written permission is prohibited. The MDA brand belongs to the owner.'}
        </p>
        <div className="mt-2 flex flex-wrap gap-1.5">
          <a href={`mailto:${config.owner_email}`} className="inline-flex items-center gap-1 rounded-lg bg-ink-100 px-2 py-1 text-[10px] font-semibold text-ink-700 dark:bg-ink-800 dark:text-ink-200"><Mail className="h-3 w-3" />{config.owner_email}</a>
          <a href={`https://wa.me/${(config.whatsapp || '').replace(/[^\d]/g, '')}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 rounded-lg bg-emerald-50 px-2 py-1 text-[10px] font-semibold text-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-300"><Phone className="h-3 w-3" />{config.whatsapp}</a>
        </div>
      </div>

      <div className="grid gap-2 sm:grid-cols-2">
        {features.map((f) => (
          <div key={f.title} className="card p-4">
            <span className="mb-2 flex h-9 w-9 items-center justify-center rounded-xl bg-brand-50 text-brand-700 dark:bg-brand-950/40 dark:text-brand-300"><f.icon className="h-4 w-4" /></span>
            <h3 className="text-[12.5px] font-extrabold text-ink-900 dark:text-white">{f.title}</h3>
            <p className="mt-0.5 text-[10.5px] leading-5 text-ink-500">{f.text}</p>
          </div>
        ))}
      </div>

      <div className="card p-4">
        <div className="mb-2 flex items-center gap-2 text-emerald-700 dark:text-emerald-300"><ShieldCheck className="h-4 w-4" /><h2 className="text-[13px] font-extrabold">{ar ? 'مصادر المعلومات' : 'Sources'}</h2></div>
        <ul className="space-y-1.5 text-[10.5px] leading-6 text-ink-500">
          <li>• WHO Essential Medicines List — <span className="text-ink-700 dark:text-ink-300">who.int</span></li>
          <li>• BNF (British National Formulary) — <span className="text-ink-700 dark:text-ink-300">bnf.nice.org.uk</span></li>
          <li>• FDA Drug Labels & DailyMed — <span className="text-ink-700 dark:text-ink-300">dailymed.nlm.nih.gov</span></li>
          <li>• EMA / SmPC — <span className="text-ink-700 dark:text-ink-300">ema.europa.eu</span></li>
          <li>• Yemeni MOH & local distributors</li>
        </ul>
        <p className="mt-2 rounded-xl bg-amber-50 p-2.5 text-[10px] leading-5 text-amber-800 dark:bg-amber-950/30 dark:text-amber-300">{ar ? config.disclaimer_ar : config.disclaimer_en}</p>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <Link to="/community" className="btn-soft"><MessageCircle className="h-4 w-4" />{ar ? 'تواصل معنا' : 'Contact us'}</Link>
        <Link to="/jobs" className="btn-ghost"><Briefcase className="h-4 w-4" />{ar ? 'لوحة الوظائف' : 'Jobs board'}</Link>
      </div>
      <p className="pb-2 text-center text-[9.5px] text-ink-400">© {new Date().getFullYear()} {config.owner_name} · MDA · {ar ? 'جميع الحقوق محفوظة' : 'All rights reserved'}</p>
      <div className="flex justify-center gap-2 pb-2 text-[9px] text-ink-400">
        <span className="inline-flex items-center gap-1"><Globe2 className="h-2.5 w-2.5" />Yemen</span>
        <span>·</span><span className="inline-flex items-center gap-1"><Sparkles className="h-2.5 w-2.5" />v1.0.0</span>
        <span>·</span><span className="inline-flex items-center gap-1"><BadgeCheck className="h-2.5 w-2.5" />{t('common.verified')}</span>
      </div>
    </div>
  );
}
