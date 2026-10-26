/*
 * Public legal pages — /privacy and /terms, rendered as standalone HTML.
 *
 * Why server-rendered and not a React route: Google Play requires a privacy-policy
 * URL that opens without JavaScript, without an account, and without being inside the
 * app shell. A reviewer (or a lawyer) clicking the link must get readable text.
 *
 * URLs are also advertised at /api/config → privacy_url / terms_url so the app and the
 * store listing always point at the same page.
 */

const UPDATED = '2026-10-27';
const VERSION = '1.2';
const CONTACT_EMAIL = process.env.SUPPORT_EMAIL || '7a8b1d@gmail.com';
const CONTACT_WA = process.env.WHATSAPP_NUMBER || '+967781733795';
const OWNER = 'Dr. Abdulmajeed Abdullah Almakhedhi — د. عبدالمجيد عبدالله الماخذي';

const shell = ({ title, subtitle, body, lang = 'ar' }) => `<!doctype html>
<html lang="${lang}" dir="${lang === 'ar' ? 'rtl' : 'ltr'}">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta name="theme-color" content="#050c1a" />
<meta name="robots" content="index,follow" />
<title>${title} — MDA</title>
<style>
  :root { color-scheme: dark; }
  * { box-sizing: border-box; }
  body {
    margin: 0; padding: 0;
    font-family: "Segoe UI", "Noto Naskh Arabic", "Cairo", system-ui, -apple-system, sans-serif;
    background:
      radial-gradient(900px 460px at 8% -6%, rgba(27,109,255,.30), transparent 62%),
      radial-gradient(760px 420px at 104% 2%, rgba(34,211,238,.20), transparent 60%),
      linear-gradient(180deg, #071227 0%, #050c1a 52%, #040914 100%);
    background-attachment: fixed;
    color: #e4ecf9; line-height: 1.9; font-size: 15px;
  }
  .wrap { max-width: 820px; margin: 0 auto; padding: 28px 18px 64px; }
  header { display: flex; align-items: center; gap: 12px; margin-bottom: 22px; }
  .logo {
    width: 46px; height: 46px; border-radius: 14px; flex: 0 0 auto;
    background: linear-gradient(135deg, #1b6dff, #0aa7ff 55%, #22d3ee);
    display: grid; place-items: center; font-weight: 900; color: #fff; letter-spacing: -.5px;
    box-shadow: 0 10px 24px -12px rgba(17,133,255,.8);
  }
  h1 { font-size: 22px; margin: 0; letter-spacing: -.2px; }
  .sub { color: #7f9dc9; font-size: 12.5px; margin-top: 2px; }
  .card {
    background: rgba(10,25,48,.72); border: 1px solid rgba(255,255,255,.075);
    border-radius: 20px; padding: 18px 20px; margin: 14px 0;
    box-shadow: 0 18px 40px -26px rgba(0,0,0,.85);
  }
  h2 { font-size: 16.5px; margin: 26px 0 8px; color: #fff; }
  h3 { font-size: 14px; margin: 18px 0 6px; color: #cfe1f8; }
  p, li { color: #cbdaf1; }
  ul { padding-inline-start: 20px; }
  li { margin: 5px 0; }
  a { color: #79c2ff; text-decoration: none; border-bottom: 1px solid rgba(121,194,255,.35); }
  a:hover { color: #fff; }
  table { width: 100%; border-collapse: collapse; margin: 10px 0; font-size: 13.5px; }
  th, td { text-align: start; padding: 8px 10px; border-bottom: 1px solid rgba(255,255,255,.07); vertical-align: top; }
  th { color: #a2b9dd; font-weight: 700; font-size: 12.5px; }
  .note { background: rgba(34,211,238,.09); border-color: rgba(34,211,238,.22); }
  .warn { background: rgba(245,158,11,.10); border-color: rgba(245,158,11,.25); }
  .ok { background: rgba(16,185,129,.10); border-color: rgba(16,185,129,.25); }
  code { background: rgba(255,255,255,.07); padding: 1px 6px; border-radius: 6px; font-size: 12.5px; }
  footer { margin-top: 34px; color: #5f7fae; font-size: 12px; text-align: center; }
  .pill { display: inline-block; padding: 2px 9px; border-radius: 999px; font-size: 11px; font-weight: 700;
          background: rgba(17,133,255,.18); color: #b6dbff; border: 1px solid rgba(121,194,255,.25); }
  @media (prefers-color-scheme: light) {
    body { background: #f4f8fd; color: #112240; }
    .card { background: #fff; border-color: rgba(15,23,42,.10); box-shadow: 0 10px 24px -20px rgba(15,23,42,.5); }
    h1, h2, h3 { color: #0b1a33; }
    p, li { color: #20365c; }
    th { color: #425a7d; }
    .sub, footer { color: #5c708c; }
    a { color: #0a53c4; }
    code { background: rgba(15,23,42,.06); }
    td, th { border-color: rgba(15,23,42,.08); }
  }
</style>
</head>
<body>
<div class="wrap">
  <header>
    <div class="logo">MDA</div>
    <div>
      <h1>${title}</h1>
      <div class="sub">${subtitle}</div>
    </div>
  </header>
  ${body}
  <footer>
    MDA — MedicineData · ${OWNER}<br />
    <span class="pill">آخر تحديث ${UPDATED} · v${VERSION}</span>
  </footer>
</div>
</body>
</html>`;

const privacyBody = `
<div class="card note">
  <b>الخلاصة في أربعة أسطر:</b>
  <ul>
    <li>لا نطلب حسابًا لاستخدام المرجع الدوائي، والتسجيل اختياري.</li>
    <li>صور الوصفات تُرسل للتحليل <b>بموافقتك الصريحة فقط</b>، وتُحذف بعد التحليل إلا إذا طلبت حفظها.</li>
    <li>لا نبيع بياناتك ولا نشاركها مع مُعلنين، ولا نستخدمها لأي إعلان.</li>
    <li>يمكنك حذف حسابك وبياناته في أي وقت من داخل التطبيق أو بمراسلتنا.</li>
  </ul>
</div>

<h2>1. من نحن</h2>
<p>تطبيق <b>MDA — MedicineData</b> مرجع دوائي للأدوية والمنتجات التجارية في اليمن والعالم العربي، ويشمل تحليل صور الوصفات بمساعدة الذكاء الاصطناعي، وصيدلية شخصية، ومجتمعًا مهنيًا.</p>
<p>المسؤول عن البيانات: ${OWNER}.<br />
التواصل: <a href="mailto:${CONTACT_EMAIL}">${CONTACT_EMAIL}</a> · واتساب <a href="https://wa.me/${CONTACT_WA.replace(/[^0-9]/g, '')}">${CONTACT_WA}</a></p>

<h2>2. ما نجمعه ولماذا</h2>
<table>
  <tr><th>النوع</th><th>التفصيل</th><th>الأساس</th><th>مدة الاحتفاظ</th></tr>
  <tr><td>بيانات الحساب</td><td>الاسم، البريد، كلمة مرور مشفّرة (bcrypt) أو معرّف Google</td><td>اختياري — عند التسجيل</td><td>حتى حذف الحساب</td></tr>
  <tr><td>صور الوصفات</td><td>الصورة كما اخترتها، ونصها المستخرج</td><td>موافقة صريحة تُسجَّل بتاريخها</td><td>تُحذف فور التحليل إلا إذا فعّلت «حفظ الصورة»</td></tr>
  <tr><td>بيانات الصيدلية</td><td>أصناف مخزونك، الكميات، تواريخ الانتهاء</td><td>تنفيذ الخدمة</td><td>حتى تحذفها أو تحذف حسابك</td></tr>
  <tr><td>الحساسيات المسجّلة</td><td>عائلة دوائية أو مادة فعالة تُدخلها يدويًا</td><td>موافقتك (اختيارية تمامًا)</td><td>حتى تحذفها</td></tr>
  <tr><td>بيانات تقنية</td><td>عنوان IP، وقت الطلب، رمز الخطأ</td><td>أمن الخدمة ومنع الإساءة</td><td>سجلات مؤقتة</td></tr>
  <tr><td>سجل التدقيق</td><td>مَن فعل ماذا ومتى (معرّفات، بلا نصوص مرضى)</td><td>مساءلة مهنية</td><td>يبقى بعد حذف السجل الطبي (بلا محتوى صحي)</td></tr>
</table>

<h2>3. ما لا نجمعه أبدًا</h2>
<ul>
  <li>لا جهات اتصال، لا رسائل SMS، لا صور معرض غير التي تختارها للتحليل.</li>
  <li>لا موقع جغرافي دقيق (GPS).</li>
  <li>لا بيانات بطاقات أو مدفوعات — التطبيق لا يبيع شيئًا.</li>
  <li>لا نصوص وصفات في سجلات الخطأ أو التحليلات الإحصائية (تُسجَّل الأعداد والرموز فقط).</li>
</ul>

<h2>4. الذكاء الاصطناعي: ماذا يحدث لصورة وصفتك؟</h2>
<div class="card warn">
  <ul>
    <li>لا يُرسل شيء قبل أن تمنح <b>موافقة صريحة</b> داخل التطبيق (وترفض الخادم الطلب قبلها برمز 428).</li>
    <li>تُرسل الصورة إلى مزوّد نموذج ذكاء اصطناعي عبر خادمنا (نستخدم حاليًا مزوّدًا بطبقة مجانية مثل Groq/Gemini — لا مفاتيح في التطبيق).</li>
    <li>قد يعالج المزوّد الصورة وفق سياساته الخاصة؛ لا نتحكم في أنظمته الداخلية، ولهذا <b>الموافقة اختيارية</b> ويمكنك استخدام التطبيق كاملًا بدون تحليل الصور.</li>
    <li>يمكنك <b>تعطيل التحليل السحابي</b> كليًا (تسجيل الوصفة يدويًا بالنص).</li>
    <li>القراءة الآلية قد تخطئ، ولا تُعتمد إلا بمراجعة صيدلي بشري.</li>
  </ul>
</div>

<h2>5. من يمكنه رؤية بياناتك؟</h2>
<ul>
  <li><b>أنت</b> فقط، إلا وصفتك التي تطلب مراجعتها: يراها صيدلي/مدير معتمد، ويُسجَّل فتحه في سجل التدقيق.</li>
  <li>مزوّد الاستضافة (خادم التشغيل) ومزوّد نموذج الذكاء الاصطناعي — بوصفهما معالجين تقنيين، بالحد الأدنى اللازم.</li>
  <li>لا بيع، لا تأجير، لا مشاركة مع مُعلنين أو وسطاء بيانات.</li>
</ul>

<h2>6. الأمان</h2>
<ul>
  <li>الاتصال عبر HTTPS فقط، وكلمات المرور مشفّرة بـ bcrypt.</li>
  <li>قفل التطبيق: رقم سري يُحفظ كـ PBKDF2 على جهازك فقط ولا يُرسل للخادم.</li>
  <li>النسخ الاحتياطية التي تنشئها من لوحة التحكم مشفّرة بـ AES‑256‑GCM، ومفتاحها كلمتك وحدها.</li>
  <li>سجل تدقيق بسلسلة تجزئة SHA‑256 يكشف أي تعديل على السجل.</li>
</ul>
<p><b>حدود معلنة:</b> لا نستخدم تشفير SQLite على القرص (SQLCipher) حاليًا، ولا نمنع لقطات الشاشة إلا عند تفعيل الخيار في تطبيق أندرويد. من يملك الجهاز المفتوح والرقم السري يستطيع رؤية ما في التطبيق.</p>

<h2>7. حقوقك</h2>
<ul>
  <li><b>الوصول</b>: كل بياناتك ظاهرة داخل التطبيق.</li>
  <li><b>التصحيح</b>: من شاشة الحساب أو الصيدلية.</li>
  <li><b>الحذف</b>: حذف وصفة واحدة، أو حذف الحساب بالكامل — ويشمل الصور والنصوص والملف الشخصي.</li>
  <li><b>سحب الموافقة</b>: من صفحة الوصفات في أي وقت، ويسري فورًا.</li>
  <li><b>التصدير</b>: تصدير بياناتك CSV/JSON/XLSX من لوحة التحكم (للحسابات الإدارية).</li>
</ul>
<p>لطلب الحذف: من داخل التطبيق (الحساب ← حذف) أو راسلنا على <a href="mailto:${CONTACT_EMAIL}">${CONTACT_EMAIL}</a>، وسنستجيب خلال 30 يومًا كحد أقصى.</p>

<h2>8. الأطفال</h2>
<p>التطبيق موجّه للمهنيين والبالغين (16 عامًا وأكثر). لا نجمع بيانات أطفال عن قصد، وإن وصلتنا بيانات طفل بغير قصد نحذفها عند إبلاغنا.</p>

<h2>9. التغييرات على هذه السياسة</h2>
<p>عند أي تغيير جوهري نحدّث رقم الإصدار أعلاه، ونعرض إشعارًا داخل التطبيق قبل سريانه. استمرارك في الاستخدام بعد التحديث يعني الموافقة على النسخة الجديدة.</p>

<h2>10. الجهات الرقابية</h2>
<p>نلتزم بقوانين حماية البيانات المعمول بها في بلد التشغيل. إن كنت تعتقد أننا خالفنا شيئًا، راسلنا أولًا — ونرحّب بأي تصحيح.</p>
`;

const termsBody = `
<div class="card warn">
  <b>تنبيه طبي أساسي:</b> هذا التطبيق مرجع معلوماتي. لا يُشخّص، ولا يصف دواءً، ولا يغني عن الطبيب أو الصيدلي.
  أي قرار علاجي يجب أن يتخذه مختص مرخّص يعرف حالتك. نصوص الوصفات المقروءة آليًا قد تكون خاطئة.
</div>

<h2>1. قبول الشروط</h2>
<p>باستخدامك تطبيق MDA — MedicineData فإنك توافق على هذه الشروط وعلى سياسة الخصوصية. إن لم توافق، لا تستخدم التطبيق.</p>

<h2>2. طبيعة الخدمة</h2>
<ul>
  <li>مرجع دوائي (مونوغرافات، منتجات تجارية، شركات ووكلاء) للأغراض التعليمية والمرجعية.</li>
  <li>أدوات تنظيمية: صيدلية شخصية، طابور مزامنة، تصدير ونسخ احتياطية.</li>
  <li>تحليل صور الوصفات بمساعدة الذكاء الاصطناعي — مساعدة قراءة فقط، وقرارها النهائي بيد صيدلي بشري.</li>
</ul>

<h2>3. الحساب</h2>
<ul>
  <li>أنت مسؤول عن سرية كلمة المرور/الرقم السري، وعن كل نشاط يحدث بحسابك.</li>
  <li>يُمنع إنشاء حسابات متعددة للإساءة أو استخدام أدوات آلية لإغراق الخدمة.</li>
  <li>يحق لنا تعليق حساب يخالف هذه الشروط، مع إبلاغك بالسبب.</li>
</ul>

<h2>4. المحتوى الذي تضيفه</h2>
<ul>
  <li>تبقى مالكًا لمحتواك (وصفات، أصناف صيدلية، طلبات إضافة دواء).</li>
  <li>تمنحنا ترخيصًا محدودًا لتخزينه ومعالجته فقط لتقديم الخدمة.</li>
  <li>يُمنع رفع محتوى مخالف أو بيانات شخص آخر بغير إذنه.</li>
</ul>

<h2>5. الاستخدام المقبول</h2>
<ul>
  <li>لا محاولات اختراق أو تجاوز حدود المعدّل أو استنزاف الخدمة.</li>
  <li>لا استخدام لأغراض تشخيصية آلية دون إشراف مهني.</li>
  <li>لا إعادة بيع البيانات أو استخراجها بكميات كبيرة (scraping).</li>
</ul>

<h2>6. دقة المعلومات</h2>
<p>نحرص على المصادر والتوثيق، لكن <b>لا نضمن</b> خلو البيانات من خطأ أو قدم. الأسعار غير مُدرجة عن قصد (لا نعرض سعرًا غير مؤكد). تحقق دائمًا من النشرة الرسمية للدواء ومن الصيدلي.</p>

<h2>7. حدود المسؤولية</h2>
<p>يُقدَّم التطبيق «كما هو». لا نتحمل مسؤولية أي ضرر ناتج عن قرار علاجي اتُّخذ بناءً على معلومات التطبيق دون مراجعة مختص مرخّص، أو عن انقطاع الخدمة أو فقد بيانات لم تنشئ لها نسخة احتياطية.</p>

<h2>8. توفر الخدمة</h2>
<p>نسعى لخدمة متاحة دائمًا، لكن قد تتوقف للصيانة أو لأسباب خارجة عن إرادتنا. العمل بدون إنترنت محدود بما هو مخزّن على جهازك.</p>

<h2>9. الملكية الفكرية</h2>
<p>اسم MDA وتصميمه وشيفرته مملوكة للمالك المذكور. أسماء الأدوية والعلامات التجارية مملوكة لأصحابها، وتُذكر للتعريف فقط.</p>

<h2>10. التعديلات والقانون الحاكم</h2>
<p>قد نحدّث الشروط، ونعلن ذلك داخل التطبيق. تخضع الشروط لقوانين الجمهورية اليمنية، مع احترام قوانين حماية البيانات في بلد إقامتك.</p>

<h2>11. التواصل</h2>
<p><a href="mailto:${CONTACT_EMAIL}">${CONTACT_EMAIL}</a> · واتساب <a href="https://wa.me/${CONTACT_WA.replace(/[^0-9]/g, '')}">${CONTACT_WA}</a></p>
`;

export function privacyHtml() {
  return shell({
    title: 'سياسة الخصوصية',
    subtitle: 'Privacy Policy · MDA — MedicineData',
    body: privacyBody,
  });
}

export function termsHtml() {
  return shell({
    title: 'شروط الاستخدام',
    subtitle: 'Terms of Service · MDA — MedicineData',
    body: termsBody,
  });
}

/** Public URLs derived from the incoming request, so the same code works on any host. */
export function legalUrls(req) {
  const proto = (req.headers['x-forwarded-proto'] || req.protocol || 'https').toString().split(',')[0];
  const host = req.headers['x-forwarded-host'] || req.headers.host || 'localhost';
  const base = `${proto}://${host}`;
  return { privacy_url: `${base}/privacy`, terms_url: `${base}/terms`, legal_updated: UPDATED, legal_version: VERSION };
}
