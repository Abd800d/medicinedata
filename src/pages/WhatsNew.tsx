/*
 * "ما الجديد" — what actually changed, on the device, once per installed version.
 *
 * Written because "I installed the update and nothing changed" is a fair complaint when every
 * new feature sits behind an admin login. This screen and the auto-sheet list what landed,
 * where to find it, and put a button next to each item.
 */
import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  ArrowLeft, Camera, CheckCircle2, ClipboardList, Fingerprint, ImageIcon, Info, LayoutDashboard,
  Moon, Palette, RefreshCw, ShieldCheck, Smartphone, Sparkles, Sun, Upload, X,
} from 'lucide-react';
import { useI18n } from '../lib/i18n';
import { useAuth } from '../lib/auth';
import { useConfig } from '../lib/config';
import { bundleVersion, markVersionSeen, shouldShowWhatsNew } from '../lib/appInfo';
import { Badge } from '../components/ui';

type Release = {
  version: string;
  date: string;
  headline: string;
  items: { icon: any; title: string; body: string; to?: string; need?: 'admin' | 'staff' | null; cta?: string }[];
};

const RELEASES: Release[] = [
  {
    version: '1.10.1',
    date: '2026-10-27',
    headline: 'التحديث يُثبت نفسه: إصدارات ظاهرة + تصميم طبي فاتح',
    items: [
      {
        icon: Sparkles,
        title: 'شاشة «ما الجديد» بعد كل تحديث',
        body: 'تظهر مرة واحدة تلقائيًا بعد التثبيت، وتشرح ما تغيّر وأين تجده بزر مباشر لكل ميزة — بدل أن تبحث عنها.',
        to: '/whats-new',
        cta: 'اقرأ التفاصيل',
      },
      {
        icon: Smartphone,
        title: 'بطاقة الإصدارات: التطبيق · الحزمة · الخادم',
        body: 'في «المزيد» أسفل الصفحة. إن كان هاتفك أحدث من الخادم ستقرأ ذلك صريحًا مع الحل، بدل أعطال صامتة.',
        to: '/more',
        cta: 'افتح المزيد',
      },
      {
        icon: RefreshCw,
        title: 'التحديث يظهر فورًا',
        body: 'التطبيق يمسح ذاكرة WebView المؤقتة تلقائيًا عند تغيّر رقم الإصدار — سبب حقيقي لبقاء الواجهة القديمة بعد التثبيت.',
      },
      {
        icon: Sun,
        title: 'التصميم الطبي الفاتح افتراضيًا',
        body: 'أبيض وأزرق كما في المواصفة والصورة المرجعية. الليلي موجود بزر واحد من نفس الشاشة.',
      },
    ],
  },
  {
    version: '1.10.0',
    date: '2026-10-27',
    headline: 'صور الأدوية من معرض الهاتف',
    items: [
      {
        icon: Camera,
        title: 'أضف صورة الدواء من هاتفك',
        body: 'افتح أي دواء ← زر الكاميرا فوق الصورة أو «صور هذا الدواء» ← إضافة من معرض الهاتف. قصّ وتدوير وضغط على الجهاز قبل الرفع.',
        to: '/search',
        need: 'staff',
        cta: 'ابحث عن دواء',
      },
      {
        icon: ImageIcon,
        title: 'عدّل صورة منشورة في مكانها',
        body: 'زر ✏️ على أي صورة يفتحها في الاستوديو ثم يستبدلها بنفس السجل — دون فقدان التاريخ أو الترتيب.',
        to: '/admin?tab=media',
        need: 'staff',
        cta: 'معرض الصور',
      },
      {
        icon: CheckCircle2,
        title: '٧ أعطال حقيقية أُصلحت',
        body: 'أزرار كانت تظهر عند مرور الفأرة فقط، صور مكسورة داخل التطبيق، دوران EXIF، HEIC يُجمّد الاستوديو، وملفات لم تُحذف.',
      },
    ],
  },
  {
    version: '1.9.1',
    date: '2026-10-27',
    headline: 'سجل تدقيق قابل للتحقق + حذف الحساب',
    items: [
      {
        icon: Fingerprint,
        title: 'سجل التدقيق',
        body: 'كل عملية في النظام مسجّلة بسلسلة تجزئة SHA‑256 مع زر «تحقّق من السلامة».',
        to: '/admin?tab=audit',
        need: 'admin',
        cta: 'افتح السجل',
      },
      {
        icon: ShieldCheck,
        title: 'احذف حسابك نهائيًا',
        body: 'من «حسابي»: تأكيد مكتوب + كلمة المرور، ويُمسح معه الوصفات وصورها من الخادم.',
        to: '/profile',
        cta: 'حسابي',
      },
    ],
  },
  {
    version: '1.9.0',
    date: '2026-10-27',
    headline: 'استيراد بكل الصيغ + Google من الجوال + طابور الصيدلي',
    items: [
      {
        icon: Upload,
        title: 'استيراد CSV · TSV · Excel · JSON · XML · SQLite',
        body: 'عدة ملفات دفعة واحدة، سحب وإفلات، قوالب جاهزة، ولصق JSON مباشر.',
        to: '/admin?tab=media',
        need: 'admin',
        cta: 'الاستيراد',
      },
      {
        icon: ClipboardList,
        title: 'طابور مراجعة الوصفات للصيدلي',
        body: 'اعتماد أو رفض وصفة، وتصحيح أي بند قبل الاعتماد.',
        to: '/review',
        need: 'staff',
        cta: 'الطابور',
      },
      {
        icon: Sparkles,
        title: 'الدخول بحساب Google من متصفح النظام',
        body: 'تجاوز حجب Google لـWebView عبر PKCE وdeep link، بلا تعديل على الخادم.',
        to: '/auth',
        cta: 'تسجيل الدخول',
      },
    ],
  },
];

const CURRENT = RELEASES[0].version;

/** Full page (/whats-new). */
export default function WhatsNew() {
  const { lang } = useI18n();
  const ar = lang === 'ar';
  return (
    <div className="mx-auto max-w-2xl space-y-3 py-2">
      <div className="flex items-center gap-2">
        <Link to="/more" className="btn-ghost px-2 py-1.5"><ArrowLeft className="h-4 w-4" /></Link>
        <h1 className="text-[15px] font-extrabold">{ar ? 'ما الجديد' : "What's new"}</h1>
        <Badge tone="brand">v{bundleVersion()}</Badge>
      </div>
      <ReleaseList ar={ar} />
      <ThemeCard />
    </div>
  );
}

function ReleaseList({ ar }: { ar: boolean }) {
  const { user } = useAuth();
  const roleOk = (need?: 'admin' | 'staff' | null) =>
    !need || (need === 'admin' ? user?.role === 'admin' : user?.role === 'admin' || user?.role === 'pharmacist');
  return (
    <div className="space-y-3">
      {RELEASES.map((r) => (
        <div key={r.version} className="card overflow-hidden">
          <div className="flex items-center gap-2 border-b border-white/[.06] px-4 py-2.5">
            <span className="rounded-lg bg-brand-500/15 px-2 py-0.5 text-[10px] font-black text-brand-200">v{r.version}</span>
            <span className="min-w-0 flex-1 truncate text-[12px] font-extrabold">{r.headline}</span>
            <span className="text-[9.5px] text-ink-500">{r.date}</span>
          </div>
          <div className="divide-y divide-white/[.05]">
            {r.items.map((it) => (
              <div key={it.title} className="p-3.5">
                <div className="flex items-start gap-2.5">
                  <span className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-xl bg-brand-500/15 text-brand-200">
                    <it.icon className="h-4 w-4" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="text-[12.5px] font-extrabold text-ink-100">{it.title}</div>
                    <p className="mt-0.5 text-[11px] leading-5 text-ink-400">{it.body}</p>
                    {it.to && roleOk(it.need) && (
                      <Link to={it.to} className="mt-1.5 inline-flex items-center gap-1 rounded-lg bg-white/[.06] px-2 py-1 text-[10.5px] font-bold text-brand-200">
                        {it.cta || (ar ? 'افتح' : 'Open')}
                      </Link>
                    )}
                    {it.to && !roleOk(it.need) && (
                      <p className="mt-1.5 text-[10px] text-amber-300/80">
                        {ar ? 'متاح لحساب المدير أو الصيدلي — اطلب ترقية دورك من الإدارة.' : 'Admin/pharmacist only — ask an admin for the role.'}
                      </p>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

export function ThemeCard() {
  const { lang } = useI18n();
  const { mode, setMode } = useConfig();
  const ar = lang === 'ar';
  const options: { key: 'light' | 'dark' | 'system'; label: string; icon: any }[] = [
    { key: 'light', label: ar ? 'طبي فاتح' : 'Clinical light', icon: Sun },
    { key: 'dark', label: ar ? 'ليلي' : 'Night', icon: Moon },
    { key: 'system', label: ar ? 'حسب النظام' : 'System', icon: Palette },
  ];
  return (
    <div className="card p-4">
      <div className="flex items-center gap-2 text-[12.5px] font-extrabold"><Palette className="h-4 w-4 text-brand-300" />{ar ? 'المظهر' : 'Appearance'}</div>
      <p className="mt-1 text-[11px] leading-5 text-ink-400">
        {ar ? 'التصميم الطبي الفاتح (أبيض/أزرق) هو الافتراضي طبقًا للمواصفة. يمكنك التبديل في أي وقت.' : 'The clinical light design (white/blue) is the default per the specification. You can switch anytime.'}
      </p>
      <div className="mt-2 grid grid-cols-3 gap-1.5">
        {options.map((o) => (
          <button key={o.key} onClick={() => setMode(o.key)}
            className={`flex flex-col items-center gap-1 rounded-xl py-2 text-[10.5px] font-bold ${mode === o.key ? 'bg-brand-grad text-white' : 'bg-white/[.06] text-ink-300'}`}>
            <o.icon className="h-4 w-4" />{o.label}
          </button>
        ))}
      </div>
    </div>
  );
}

/** One-time sheet after an update — the whole point is that "nothing changed" stops being true. */
export function WhatsNewSheet() {
  const { lang } = useI18n();
  const ar = lang === 'ar';
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    const t = setTimeout(() => { if (shouldShowWhatsNew()) setOpen(true); }, 900);
    return () => clearTimeout(t);
  }, []);

  const close = (go?: string) => {
    markVersionSeen(bundleVersion());
    setOpen(false);
    if (go) navigate(go);
  };

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[70] flex items-end justify-center bg-black/70 backdrop-blur-sm sm:items-center sm:p-4" role="dialog" aria-modal="true">
      <div className="card max-h-[88vh] w-full max-w-lg overflow-y-auto rounded-b-none p-4 sm:rounded-2xl">
        <div className="flex items-start gap-2">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-brand-grad text-white"><Sparkles className="h-5 w-5" /></span>
          <div className="min-w-0 flex-1">
            <div className="text-[9.5px] font-bold uppercase tracking-wide text-brand-300">{ar ? 'تم التحديث' : 'Updated'}</div>
            <div className="text-[15px] font-black text-white">MDA v{bundleVersion()}</div>
          </div>
          <button onClick={() => close()} className="icon-btn h-8 w-8" aria-label={ar ? 'إغلاق' : 'Close'}><X className="h-4 w-4" /></button>
        </div>

        <div className="mt-3 space-y-2">
          {RELEASES[0].items.slice(0, 3).map((it) => (
            <div key={it.title} className="flex items-start gap-2 rounded-xl p-2.5 bg-white/[.05]">
              <it.icon className="mt-0.5 h-4 w-4 shrink-0 text-brand-300" />
              <div className="min-w-0">
                <div className="text-[11.5px] font-bold text-ink-100">{it.title}</div>
                <p className="text-[10.5px] leading-5 text-ink-400">{it.body}</p>
              </div>
            </div>
          ))}
        </div>

        <div className="mt-3 grid grid-cols-2 gap-2">
          <button onClick={() => close('/whats-new')} className="btn-soft text-[11.5px]"><Info className="h-4 w-4" />{ar ? 'كل التفاصيل' : 'All details'}</button>
          <button onClick={() => close('/more')} className="btn-primary text-[11.5px]"><CheckCircle2 className="h-4 w-4" />{ar ? 'حسنًا، ابدأ' : 'Got it'}</button>
        </div>
        <p className="mt-2 flex items-center justify-center gap-1 text-[10px] text-ink-500">
          <RefreshCw className="h-3 w-3" />{ar ? 'تظهر هذه النافذة مرة واحدة لكل إصدار' : 'Shown once per version'}
        </p>
      </div>
    </div>
  );
}

export { CURRENT as CURRENT_RELEASE };
