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
  ArrowLeft, BadgeCheck, Camera, CheckCircle2, ClipboardList, FileText, Fingerprint, ImageIcon, Info, LayoutDashboard,
  Moon, Package, Palette, Pill, RefreshCw, ShieldAlert, ShieldCheck, Smartphone, Sparkles, Sun, Upload, X,
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
    version: '1.13.0',
    date: '2026-10-29',
    headline: 'ست حالات توثيق حقيقية: من وثّق، ومتى، وبأي مستند',
    items: [
      {
        icon: BadgeCheck,
        title: 'حالة من ست حالات على كل سجل',
        body: 'موثّق · مؤكد من الشركة المصنعة · مُقدَّم من مورّد · مُقدَّم من مستخدم · بيانات ناقصة · غير موثّق. ولم يبقَ «صح/خطأ» يخفي من أين جاء السجل.',
        to: '/products',
        cta: 'شاهد الحالات',
      },
      {
        icon: ShieldCheck,
        title: 'لوحة «التوثيق والمراجعة»',
        body: 'طابور يبدأ بالمعلّق ثم المرفوض ثم الناقص، ولوحة قرار تُظهر اسم المراجع وتاريخ القرار والمستندات المرفقة وأسماء الحقول الناقصة. الخادم يرفض «مؤكد من الشركة» بلا مستند، و«مرفوض» بلا سبب مكتوب.',
        to: '/admin?tab=verification',
        need: 'admin',
        cta: 'افتح الطابور',
      },
      {
        icon: FileText,
        title: 'الدليل مرفق ومرئي',
        body: 'ارفع خطاب الشركة أو التفويض أو وثيقة التسجيل (أو ضع رابطها)، فيظهر على صفحة المنتج العامة مع «مَن قرّر ومتى». وسحب المستند لا يغيّر الحالة بصمت.',
        to: '/products',
        cta: 'مثال على سجل موثّق',
      },
      {
        icon: ShieldAlert,
        title: 'طلبات المستخدمين لم تعد تبدو «موثّقة»',
        body: 'كل طلب يُعتمد من «أضف دواءً» يُسجَّل الآن «مُقدَّم من مستخدم» وبانتظار المراجعة، ولا يُعرض كأن صيدليًا راجعه.',
        to: '/submit-drug',
        cta: 'أرسل دواءً',
      },
    ],
  },
  {
    version: '1.12.0',
    date: '2026-10-29',
    headline: 'فاحص تداخلات صادق، ومتصفّح منتجات بالبلد والوكيل المحلي',
    items: [
      {
        icon: Pill,
        title: 'فاحص التداخلات',
        body: 'أضف من 2 إلى 25 دواءً بالاسم العلمي، فيُظهر التطبيق كل تداخل مذكور في بياناته مع الخطورة إن كانت مذكورة. ما لا يُذكر يُقال صراحةً: «مذكور بلا تصنيف» أو «غير موجود في بيانات MDA»، ولا يُكتب أبدًا «آمن».',
        to: '/interactions',
        cta: 'افحص أدويتك',
      },
      {
        icon: ShieldAlert,
        title: 'تكرار المادة الفعالة والتكرار العلاجي',
        body: 'نفس المادة الفعالة مرتين (جرعة مضاعفة) أو دواءان من نفس الفئة (مثل اثنين مضاد التهاب NSAID) — يُكتشفان بلا أي مرجع خارجي، لأنهما خطأ شائع ومحسوم من البيانات نفسها.',
        to: '/interactions',
        cta: 'جرّب التكرار',
      },
      {
        icon: Package,
        title: 'متصفّح المنتجات التجارية',
        body: '493 منتجًا بفلاتر: بلد التسويق، الشركة المصنعة، الوكيل المحلي ومدينته، جهاز الجسم، وجود صورة — وشارة توثيق على كل بطاقة مع الحقول الناقصة مكتوبة بالاسم.',
        to: '/products',
        cta: 'تصفّح المنتجات',
      },
    ],
  },
  {
    version: '1.11.0',
    date: '2026-10-28',
    headline: 'لوحة تحكم بخلاصة التطبيق: صحة النظام، ما ينتظرك، وقائمة التفعيل',
    items: [
      {
        icon: LayoutDashboard,
        title: '«خلاصة التطبيق» تفتح أولًا في الإدارة',
        body: 'درجة صحة من 100، أرقام الكتالوج والصور والمستخدمين، ومدة التشغيل وإصدار الخادم — كلها في شاشة واحدة تُقرأ من الخادم بطلب واحد.',
        to: '/admin?tab=overview',
        need: 'admin',
        cta: 'افتح الخلاصة',
      },
      {
        icon: ClipboardList,
        title: '«ينتظر إجراءً منك»',
        body: 'وصفات في طابور المراجعة، طلبات إضافة أدوية، رسائل بلا رد، أصناف منتهية في المخزون، واستيرادات فاشلة — كل صف ينقلك إلى الشاشة التي تحلّه.',
        to: '/review',
        need: 'admin',
        cta: 'طابور المراجعة',
      },
      {
        icon: ShieldCheck,
        title: 'قائمة تفعيل + تنزيل الخلاصة',
        body: 'سبع فحوصات تقول هل التطبيق «مفعّل بالكامل» (الكتالوج، الصور، الذكاء، المراجعة، الطلبات، المخزون) مع درجة صحة، وزر تنزيل الخلاصة كملف CSV يفتح في Excel.',
        to: '/admin?tab=overview',
        need: 'admin',
        cta: 'راجع التفعيل',
      },
    ],
  },
  {
    version: '1.10.3',
    date: '2026-10-28',
    headline: 'دليل ربط الذكاء الاصطناعي داخل التطبيق — كل خطوة برابطها',
    items: [
      {
        icon: Sparkles,
        title: 'شاشة «دليل ربط الذكاء الاصطناعي»',
        body: 'خمس خطوات مرقّمة، تعرف منها ما أُنجز تلقائيًا من حالة الخادم الحقيقية، وفيها زر لكل خطوة. تصل إليها من المزيد.',
        to: '/ai-guide',
        cta: 'افتح الدليل',
      },
      {
        icon: RefreshCw,
        title: 'روابط المفاتيح بضغطة',
        body: 'مفاتيح Groq وGemini وOpenRouter وOllama، ونشر Render، وأحدث APK، والوثائق — كل رابط ظاهر بنصّه مع زر فتح وزر نسخ، ويُفتح في متصفح النظام لأن نوافذ WebView لا تفتح روابط.',
        to: '/ai-guide',
        cta: 'كل الروابط',
      },
      {
        icon: ShieldCheck,
        title: 'جدول الأخطاء وأوامر جاهزة',
        body: 'معنى كل رمز فشل (auth/model/quota/network/NO_SECRET) وما تفعله، مع مقتطف .env وأوامر curl جاهزة للنسخ.',
        to: '/ai-guide',
        cta: 'راجع الأخطاء',
      },
    ],
  },
  {
    version: '1.10.2',
    date: '2026-10-28',
    headline: 'الذكاء الاصطناعي يُفعّل من الهاتف بنقرة — بلا NO_SECRET ولا موديلات مسحوبة',
    items: [
      {
        icon: Sparkles,
        title: 'حفظ المفتاح يعمل على أي خادم',
        body: 'كان الحفظ يفشل بالخطأ NO_SECRET إذا لم يكن JWT_SECRET متغيرًا في بيئة الخادم. الآن يُشتق مفتاح التشفير من السري الذي يحفظه الخادم نفسه — فيعمل التفعيل من الهاتف كما هو مقصود.',
        to: '/admin?tab=ai',
        need: 'admin',
        cta: 'افتح التفعيل',
      },
      {
        icon: RefreshCw,
        title: 'موديلات حديثة بضغطة',
        body: 'Groq أوقف llama-3.3-70b-versatile وGoogle أوقف gemini-2.0-flash. الافتراضيات صارت openai/gpt-oss-120b وgemini-3.6-flash، وأمامك أزرار بدائل جاهزة.',
        to: '/admin?tab=ai',
        need: 'admin',
        cta: 'اختر الموديل',
      },
      {
        icon: ShieldCheck,
        title: 'تحذير الموديل المسحوب',
        body: 'إن كان الموديل المحفوظ لم يعد متاحًا يظهر تنبيه أحمر باسم البديل، وزر واحد ينقلك إليه — بدل فشل غامض عند التحليل.',
        to: '/admin?tab=ai',
        need: 'admin',
        cta: 'راجع الإعداد',
      },
    ],
  },
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
