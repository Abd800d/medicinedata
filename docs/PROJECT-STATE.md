## Current State — أين توقفنا الآن

> آخر تحديث: 2026-10-27 · **v1.10.1** (التحديث صار مرئيًا: شاشة «ما الجديد»، بطاقة الإصدارات الثلاثة، تنظيف كاش WebView عند تغيّر الإصدار، والتصميم الطبي الفاتح افتراضيًا طبقًا للمواصفة).
>
> **v1.10.0** (صور الأدوية تُضاف وتُعدَّل من معرض الهاتف: صفحة الدواء، صلاحية الصيدلي، استبدال في المكان، إصلاح دوران EXIF).
>
> **v1.9.1** (سجل التدقيق في لوحة التحكم، حذف الحساب من التطبيق، استعادة كلمة المرور بمسار حقيقي، مصفوفة مطابقة المواصفات في docs/SPEC-STATUS.md).
>
> **v1.9.0** (إصلاح أخطاء الشبكة داخل التطبيق، استيراد متعدد الصيغ، Google من الجوال عبر متصفح النظام، طابور مراجعة الوصفات).
>
> **v1.8.4** (نسخة جاهزة للتثبيت والتحديث: مفتاح توقيع ثابت ⇒ لا «لم يتم تثبيت التطبيق»، بناء release، تحقق آلي من محتوى الـAPK).

- **v1.4.0:** offline-first للكتابة (طابور، `X-Idempotency-Key`، `409 CONFLICT`، صفحة `/sync`).
- **v1.5.0:** استيراد XML/SQLite، تصدير CSV/JSON/XLSX، نسخ احتياطية AES‑256‑GCM مع استعادة، ومعرض صور بقصّ وضغط.
- **v1.6.0:** مظهر ليلي/نهاري/تلقائي عبر متغيّرات CSS + قفل التطبيق (PBKDF2 + بصمة) + اختبارات ui/e2e.
- **v1.7.0:**
  - **سلسلة أدوات Android حديثة:** Capacitor 7.6.9 (core/android/cli)، AGP 8.7.2، Gradle 8.11.1، JDK 21،
    `compileSdk/targetSdk 35`، `minSdk 23`، وandroidx محدّثة. حُذف `bundledWebRuntime` وأُضيف `navigation`
    إلى `configChanges` حسب دليل الترقية الرسمي.
  - **CI:** الـ workflow صار يثبّت `platforms;android-35` و`build-tools;35.0.0` ويستخدم JDK 21،
    ويشغّل بناءً تجريبيًا (artifact فقط) عند أي دفع إلى `arena/**` أو `feature/**` — لأن سلسلة أدوات
    أندرويد لا يمكن اختبارها محليًا في هذه البيئة.
  - **منع لقطات الشاشة:** `MainActivity.java` يقرأ `localStorage['mda.secureFlag']` ويطبّق `FLAG_SECURE`
    عند كل عودة للتطبيق؛ المفتاح في «المزيد ← قفل التطبيق» مع توضيح أنه يعمل في تطبيق أندرويد فقط.
- **v1.10.1 (الجديد):**
  - **«ما الجديد»** تظهر تلقائيًا مرة واحدة بعد كل تحديث، مع زر لكل ميزة، وتشرح ما هو متاح للمدير/الصيدلي فقط.
  - **بطاقة الإصدارات** في «المزيد»: التطبيق المثبّت (`App.getInfo`) · الحزمة داخل الـAPK (`version.txt`) · الخادم (`/api/config.version`)،
    ومعها جملة صريحة عندما يكون الهاتف أحدث من الخادم.
  - **سبب حقيقي لبقاء الواجهة القديمة:** `MainActivity` يمسح كاش WebView عند تغيّر `versionName`.
  - **`/api/config`** يعرض `version` و`started_at` و`features` — التطبيق يعرف ما يدعمه الخادم فعلًا.
  - **CI يرفض النشر** إن كانت `version.txt` داخل الـAPK لا تطابق `package.json`، أو إن كانت شاشة «ما الجديد» غير موجودة في الحزمة.
  - **التصميم الطبي الفاتح افتراضيًا** لأول تشغيل (أبيض/أزرق) طبقًا للمواصفة؛ الليلي والنهاري بزر واحد.
- **v1.10.0:**
  - **صور الأدوية من الهاتف:** بطاقة «صور هذا الدواء» في صفحة كل منتج + زر كاميرا فوق الصورة،
    للمدير **والصيدلي**. معرض الهاتف متعدد الصور + الكاميرا، قص/تدوير/ضغط على الجهاز.
  - **تعديل صورة منشورة في مكانها:** `PUT /api/admin/product-images/:id/file` يكتب ملفًا جديدًا
    (كي لا تُخدَم نسخة قديمة من الذاكرة)، ويحدّث صورة المنتج، ويحذف الملف القديم.
  - **إصلاح أخطاء حقيقية:** أزرار المعرض كانت **تظهر عند المرور بالفأرة فقط** ⇒ غير قابلة للاستخدام على الهاتف؛
    صور المعرض كانت تُطلب برابط نسبي `/uploads/…` ⇒ لا تظهر داخل الـAPK؛ اختيار نفس الصورة مرتين لم يعمل؛
    دوران EXIF يجعل الصور العمودية مائلة؛ HEIC يُعلّق الاستوديو بلا رسالة؛ حذف الصورة كان يترك ملفها على القرص.
  - **صلاحيات:** الصيدلي يضيف ويعدّل ويُعيّن الرئيسية، والحذف/الترتيب للمدير فقط — وكل ذلك في سجل التدقيق.
- **v1.9.1:**
  - **سجل التدقيق** (`/admin?tab=audit`): فلترة بالعملية/الهدف/التاريخ/نص حر، ترقيم صفحات حقيقي،
    وزر **تحقّق من السلسلة** يقرأ نتيجة `verifyChain` من الخادم (لا شارة تجميلية).
    `GET /api/admin/audit` صار `{data,total,limit,offset}` + `GET /api/admin/audit/actions` للفهارس.
  - **حذف الحساب من التطبيق:** بطاقة حمراء في `/profile`، تأكيد مكتوب + كلمة المرور، حذف فعلي للوصفات
    وصورها من القرص، حماية حساب المالك وآخر مدير، وقيد `account.delete` في سجل التدقيق.
  - **نسيت كلمة المرور:** شاشة `/forgot-password` بمسار يعمل فعلًا (واتساب + كلمة مؤقتة من الإدارة)
    بدل ادعاء إرسال بريد لا يملك الخادم SMTP له.
  - **`docs/SPEC-STATUS.md`:** مطابقة كل بنود المواصفة الأصلية بالحالة الفعلية، وما ينقص صراحةً.
- **v1.9.0:**
  - **إصلاح 10 أخطاء حقيقية:** روابط API نسبية في الاستيراد والنسخ الاحتياطي (`apiUrl` + `smartFetch`)،
    `window.open` في WebView (`@capacitor/browser`)، معاينة CSV/TSV في المستورد، كشف الفاصل،
    وحد تسجيل يناسب مستخدمي NAT.
  - **استيراد متعدد:** عدة ملفات، سحب وإفلات، قوالب CSV/TSV/JSON، ولصق JSON مباشر.
  - **Google من الجوال:** OAuth + PKCE عبر متصفح النظام + deep link `com.mda.medicinedata://auth`،
    الاعتماد يُحفظ مشفّرًا من لوحة الإدارة (`server/lib/google-oauth.js`، `docs/GOOGLE.md`).
  - **طابور مراجعة الوصفات:** صفحة `/review` للصيدلي والمدير.
- **v1.8.4 — تثبيت وتحديث بلا أخطاء:**
  - **السبب:** كل بناء سابق كان debug، ومفتاح debug في CI يُولَّد جديدًا كل تشغيل ⇒ بصمة مختلفة لكل إصدار ⇒
    `INSTALL_FAILED_UPDATE_INCOMPATIBLE` («لم يتم تثبيت التطبيق») عند التحديث فوق نسخة سابقة.
  - **الحل:** `android/mda-distribution.keystore` (PKCS#12، بصمة ثابتة) داخل المستودع، يستخدمه Gradle تلقائيًا،
    والسر `ANDROID_KEYSTORE_BASE64` يتقدّم عليه عند النشر على Play.
  - **CI:** يبني release افتراضيًا، يرفض AAB بمفتاح التوزيع العام، ويتحقق من أن الـAPK يحوي حزمة الويب
    و`capacitor.config.json` بصلاحية `CapacitorHttp`، ويرفض `application-debuggable`.
  - **PWA:** لا Service Worker داخل التطبيق (لمنع خدمة حزمة قديمة بعد التحديث).
  - **شبكة:** سقوط آمن إلى `fetch` إن غاب جسر Capacitor على جهاز معيّن.
  - **اختبار:** `npm run test:native` صار **71** تحقّقًا (منها 13 لمسار الإصدار والتوقيع).
- **v1.8.3 — النقل الأصلي: التطبيق يعمل دون أي خطوة على الخادم:**
  - **السبب الجذري:** WebView يعمل من `https://localhost`، فأي طلب إلى خادم مستضاف يُحجب إن لم يرسل الخادم
    ترويسات CORS؛ الخادم المنشور كان v1.8.1 (بلا CORS) ⇒ لا تسجيل دخول ولا ذكاء اصطناعي.
  - **الحل:** `capacitor.config.ts` → `plugins.CapacitorHttp.enabled: true` + `src/lib/nativeHttp.ts`
    (`nativeFetch`/`smartFetch`). الطلب يُنفَّذ أصليًا في أندرويد ⇒ لا سياسة أصل واحد ⇒ لا حاجة لأي إعداد خادم.
  - **مسار الـAPI:** `src/lib/api.ts` يوجّه كل طلب عبر الجسر داخل التطبيق، ويبقى `fetch` على الويب.
  - **الرفع:** `FormData` → أجزاء `base64File` مع boundary يُولَّد أصليًا (صور الروشتة/المنتجات).
  - **التنزيلات:** `responseType: 'arraybuffer'` ⇒ النسخ الاحتياطية/التصدير تعمل بلا CORS.
  - **بقية المسارات:** المزامنة، الصفحات القانونية، فحص الاتصال — كلها عبر `smartFetch`.
  - **مؤشّر في الواجهة:** «الخادم والاتصال» يعرض «نقل أصلي — يتجاوز CORS بالكامل» داخل التطبيق.
  - **اختبار:** `npm run test:native` (57 تحقّقًا) يثبت أن كل طلب يمر بالجسر ولا يلمس `window.fetch`.
- **v1.8.2 — دمج الخادم:**
  - **CORS:** `server/lib/cors.js` — أصول Capacitor (`https://localhost`, `capacitor://localhost`, `null`)
    و`*.onrender.com` مسموحة افتراضيًا، preflight بـ204، ويُباح `Authorization` و`X-Idempotency-Key`،
    و`CORS_ORIGINS` لنطاقات إضافية. بدونها كان WebView يحجب كل طلب إلى خادم مستضاف.
  - **خادم مدمج:** `src/lib/server.ts` — `DEFAULT_SERVER=https://medicinedata-1.onrender.com`،
    `isNativeShell()`، وأولوية: `?server=` → محفوظ → `VITE_API_BASE` → المدمج → نسبي على الويب.
    التطبيق يعمل من أول تشغيل بلا كتابة عنوان.
  - **البدء البارد:** محاولة صبورة 25 ثانية + شريط «جارٍ تشغيل الخادم…» + عرض العنوان الفعلي في الإشعار.
  - **شاشة الخادم:** بطاقة «خادم مدمج في هذه النسخة» + مصدر العنوان الحالي + reset يعيد للمدمج.
- **v1.8.1:**
  - **تفعيل الذكاء الاصطناعي من الهاتف:** `server/lib/ai-config.js` + `secrets.js` + `providers.js`،
    واجهة `الإدارة ← الذكاء الاصطناعي`. المفتاح يُخزَّن مشفّرًا (AES‑256‑GCM) ويُقرأ عند كل طلب،
    فلا حاجة لإعادة تشغيل الخادم. `POST /api/admin/ai/test` يجرّب المزوّد فعليًا ويصنّف السبب
    (auth/model/quota/request/network/timeout).
  - **بطاقة تشخيص موحّدة:** `AiSetupHint` في شاشة الوصفات والمساعد: تفرّق بين «لا خادم متصل»
    و«الخادم متصل لكن المفتاح ناقص»، وتقود المدير بزر واحد إلى لوحة التفعيل.
  - **اختصارات في «المزيد»:** الذكاء الاصطناعي (أو لوحة الإدارة)، سياسة الخصوصية، شروط الاستخدام.
  - **أمان:** لا يُعاد المفتاح لأي عميل؛ `/api/ai/status` و`/api/rx/status` عامّان وبلا حقول حسّاسة؛
    كل تغيير/اختبار مسجّل في سجل التدقيق.
- **v1.8.0:**
  - **صفحتان قانونيتان من الخادم:** `GET /privacy` و`GET /terms` (HTML من `server/lib/legal.js`، بلا JavaScript
    وبلا تسجيل — شرط Play)، ويعرضهما التطبيق أيضًا في `/legal/privacy` و`/legal/terms` من نفس المصدر،
    ويُعلن رابطهما في `GET /api/config` (`privacy_url`, `terms_url`, `legal_version`).
  - **مفتاح رفع Play من الهاتف:** `POST /api/admin/keystore` يولّد PKCS#12 (RSA-2048، 30 سنة) بمكتبة node-forge
    دون Java، ويعيده مرة واحدة؛ لا يُخزَّن. واجهته: الإدارة ← التكاملات ← «مفتاح رفع Google Play»
    مع تنزيل الملف ونسخ القيم الأربع لأسرار GitHub. بديل CLI: `npm run keystore`.
  - **منع لقطات الشاشة لكل وصفة:** مفتاح داخل شاشة الوصفات (`src/components/RxSecureToggle.tsx`) يخزّن
    `mda.secureRx.v1`، ويطبّق فورًا عبر جسر `window.MDASecure.set()` في `MainActivity` (بديل الجلسة
    `mda.secureNow` يقرأه الـshell عند العودة للتطبيق).
  - **أصول المتجر:** `store/icon-512.png` (بدون ألفا) و`store/feature-graphic.png` و`npm run store:assets`
    (يُؤطّر أيضًا لقطاتك إلى 1080×1920). أيقونات الويب أُعيد ترميزها 8-bit (−501 KB على أيقونة 512).
  - **دليل الرفع:** `docs/PLAY.md` (بيانات التطبيق، تصنيف المحتوى، أمان البيانات، وصول المراجعين، المسارات).
- **التحقق:** `test:ui` 35 · `test:e2e` 39 · `test:data` 51 · `test:rx` 52 · `test:sync` 22 · `tsc`/`build` ✅
  · بناء Android على Actions (انظر آخر تشغيل في PR الإصدار).
- **التالي:** إضافة أسرار التوقيع الأربعة (مفتاح الرفع من صفحة الإدارة) → وسم `v1.8.2` ينتج `.aab` موقّعًا
  → رفعه على Play (Internal أولًا)، ثم لقطات الشاشة الحقيقية عبر `store/screenshots-src/`.
- **تحذير بيئة:** `node_modules/` و`data/` و`dist/` و`.env` تُفقد عند استعادة مساحة العمل → `npm ci --ignore-scripts` ثم `npm run seed` ثم `npm run build`.

## Workspace — الملفات المهمة

- `package.json` — v1.0.0، ESM، scripts: `dev`, `dev:api`, `dev:web`, `build`, `start`, `seed`, `seed:reset`, `cap:sync`, `cap:android`, **`smoke`**. devDeps تضمّ jsdom@25 و@capacitor/cli@6.
- `.npmrc` (غير مُتجاهَل) — `ignore-scripts=true` (ضروري: better-sqlite3 13 يجلب prebuilds مدمجة).
- `.env` (مُتجاهَل) — PORT 4000, HOST 0.0.0.0, JWT_SECRET عشوائي، OWNER_EMAIL `7a8b1d@gmail.com`, ADMIN_PASSWORD `MDAadmin@2026`.
- `server/lib/ai-config.js` (v1.8.1) — الإعداد المتغيّر للذكاء الاصطناعي + الاختبار الذاتي؛ `secrets.js` تشفير AES‑256‑GCM؛ `ai/providers.js` قوالب المزوّدين.
- `server/` — `index.js`, `db.js` (17 جدولًا + FTS5 trigram), `seed.js`, `auth.js`, `data/{systems,drugs,drugs-1..5,helpers,refs}.js`, `lib/{search,ai,importer,upload,packArt}.js`, `routes/{index,auth,catalog,community,prescriptions,ai,admin,pharmacy,submissions}.js`.
- `src/` — `App.tsx` (lazy routes + `BrowserRouter future` flags), `pages/*` (19 صفحة) + `pages/admin/{Admin,Catalog,Media,People,Submissions,SettingsPanel}.tsx`, `lib/*`, `components/*`, `smoke-entry.tsx` (حزمة الاختبار).
- `scripts/smoke.mjs` — يرندر التطبيق في jsdom مقابل API حي، يختار معرّفات حقيقية تلقائيًا، يطبع `{path,len,text,tail,errors}`.
- `docs/{ENV,DEPLOY,ANDROID,IMPORT,API,DATA}.md` + `README.md` (عربي، وملخص إنجليزي) + `LICENSE` (MIT).
- `android/` + `capacitor.config.ts` — غلاف Capacitor 6 جاهز (`appId com.mda.medicinedata`).
- `data/mda.db` — قاعدة SQLite (WAL) غير مُضمَّنة في Git.

## Actions Taken — ما نُفّذ (الأحدث أولًا)

1. **إعادة بناء بيئة ممسوحة**: `npm ci --ignore-scripts`، `.npmrc`، `.env` جديد، `npm run seed`، `npm run build`.
2. **إصلاح خط البحث**: `normalize()` يحوّل الأرقام العربية/الفارسية؛ `queryTokens()` (يحذف أدوات الجرعة + «ال» التعريف + لواحق الجمع)؛ `rankCandidates()` يقيّم الكلمات المفردة للاستعلامات المتعددة؛ `/api/catalog/search` يبني استعلامات LIKE لكل كلمة مع fallback تدريجي.
3. **`/api/admin/rebuild-search`**: كان `UPDATE … lower(concat)` يدمّر تطبيع العربية → أُعيد كتابته بـ `searchNorm()` في JS داخل معاملة.
4. **محرّك AI المحلي**: `retrieve()` يستخدم `queryTokens` + `QUESTION_STOP`، يفحص كل الكتالوج عند قلة المرشحين (مقاومة للأخطاء الإملائية العربية)، ويحسب درجات العلامات التجارية (brands → drug).
5. **مطابقة الوصفات**: `matchPrescriptionText` يدعم أسماء المنتجات العربية، وإزالة تكرار المتغيرات (`ciprofloxacin` ⊃ `ciprofloxacin-ear`)، وإزالة التكرار حسب المادة الفعالة. `routes/prescriptions.js` صار يبني نتيجة جاهزة للعرض (`analyzeText`) ويعمل **بدون AI** للصور المرافقة للنص.
6. **توسيع الكتالوج**: `server/data/drugs-5.js` (31 دواءً جديدًا بمونوغراف + 78 منتجًا)، تصنيفان جديدان (`hypnotics-sedatives`, `other-antibacterials`)، metoprolol + remdesivir في `drugs-1/4`.
7. **تنظيف التكرارات**: حُذفت 5 مواد مكرّرة (levodopa, valproate, combined-pill, betamethasone, calcium-carbonate) وأُضيفت كمرادفات للمواد الأصلية؛ صُحّح `Jardiance` (كان مربوطًا بـ dapagliflozin) → `Forxiga`؛ لا تكرار ATC ولا منتجات مكرّرة الآن.
8. **واجهة**: صفحات `Pharmacy` (مخزون/أسعار/انتهاء/تصدير CSV) و`SubmitDrug` (إضافة دواء يدويًا + حالة الطلبات)، تبويب `Submissions` للإدارة، روابط في Home وMore، مفاتيح i18n، حالات «لم يُعثر» في تفاصيل الدواء/المنتج.
9. **أمان**: حدّ محاولات على تسجيل الدخول/التسجيل، احترام `allow_registration`، اقتصار الأدوار على `user/admin`.
10. **توثيق**: README كامل + 6 ملفات docs (بيئة، نشر systemd/Nginx/Docker، أندرويد، استيراد، API، نموذج بيانات).
11. **اختبارات**: تشغيل smoke لـ19 مسارًا (نظيف) + مسارات إدارية/مستخدم مسجّل، وتحقق API عبر curl لسلسلة كاملة (بحث، وصفة، صيدلية، طلبات إضافة، اعتماد، تصدير).

## Errors & Dead Ends — مهالك لا تُكرَّر

- **jsdom**: لا يمكن `globalThis.navigator = …` (getter) → استخدم `Object.defineProperty`.
- **استعادة البيئة**: `npm ci` العادي يفشل على `better-sqlite3` (تنزيل headers من nodejs.org → ECONNRESET) → `--ignore-scripts` (الحزمة تحتوي prebuilds).
- **`/api/prescriptions/:id/analyze`** يعيد 404 إن لم توجد وصفة؛ التحليل النصي المباشر عبر `POST /api/ai/extract-text`.
- **`rebuild-search` القديم** كان يكتب نصًا غير مطبَّع → لا تُعِد `lower(concat)` أبدًا.
- **LIKE مع عربية غير مطبَّعة**: مطابقة `%اوجمنتين%` تفشل على قيمة `أوجمنتين` — الاعتماد على `search_norm` المطبّع إلزامي.
- **مقارنة رسائل الخطأ**: الـ API يرجّع `Product not found` (حرف n صغير) → استخدم `/not found|404/i`.
- **تكرار المواد** بعد إضافة ملف بيانات: `seed` يتخطى المادة الموجودة بالاسم فقط، لذا يجب فحص ATC قبل الإضافة.
- **`sqlite3` CLI غير مثبت** — استخدم `node --input-type=module -e "import {db} from './server/db.js'"`.
- لا يوجد chromium/playwright؛ jsdom يكشف الانهيارات فقط لا التخطيط.
- `NODE_ENV` داخل `.env` يزعج Vite — لا يُكتب هناك.

## Key Results — أرقام ومسارات مؤكدة

- **الإحصاءات الحيّة**: `{systems:18, categories:137, drugs:225, products:493, manufacturers:105, agents:24, users:1}`.
- **نطاقات المعرّفات** (بعد `seed:reset`): أدوية `232..456`، منتجات `507..999` — لا تستخدم `/drugs/1` أو `/products/1` في الاختبارات.
- **بناء الواجهة**: `vite build` ناجح، `index` ≈236 kB (79 kB gzip)، `Admin` ≈78 kB، PWA precache 98 مدخلًا ≈2.49 MiB. `npx tsc --noEmit` = 0 أخطاء.
- **البحث (أمثلة مؤكدة)**: `panadol`→Panadol 500 mg(1.0)، `بنادول`/`٥٠٠ ملغ بنادول`→Panadol، `أوجمنتين 1 غم`→Augmentin 1 g، `ميتوبرولول`→metoprolol(1.0)، `فولتارين`→diclofenac/Voltaren، `جارديانس`→empagliflozin/Jardiance، `ديباكين`→valproic-acid، `ليريكا`→pregabalin، `كوارتم`→artemether-lumefantrine، `زيفوكس`→linezolid.
- **مطابقة وصفة**: `Augmentin/Panadol/Concor/ciprofloxacin/omeprazol` → 0.99/0.99/0.99/0.98/0.948 بلا أي نتيجة خاطئة؛ العربية `أوجمنتين/بنادول/كونكور/ديباكين/ليريكا` تعمل.
- **الصيدلي الذكي (بدون مفتاح)**: `mode:'offline-database'` ويجيب بجرعة/استخدامات/تحذيرات من القاعدة.
- **الوصفة بدون AI**: `POST /api/prescriptions` (صورة + text) → `status:'analyzed', ai:false, mode:'manual'` مع `items[].matched.products`.
- **الحسابات**: المدير `7a8b1d@gmail.com` / `MDAadmin@2026` (id 1). حساب الاختبار `test.ph@example.com` أُزيل.
- **الروابط/الهوية**: واتساب `+967781733795`، بريد `7a8b1d@gmail.com`، الحقوق «د. عبدالمجيد عبدالله الماخذي»، الهوية اللونية `#0f766e`، مصادر البيانات المرجعية موثّقة في `docs/DATA.md`.

## 2026-10 — الصور والباركود والتكاملات والـ APK

- **صور حقيقية:** `public/seed-images/products/` (27 صورة/18 منتجًا) + `server/data/product-images.js`
  كمصدر وحيد للمطابقة (trade_name + strength). تُطبَّق بـ `npm run images:apply` ومن داخل `server/seed.js`.
  سكربت `scripts/fetch-images.mjs` + `server/lib/product-images.js` يجلب الباقي من Google CSE (يحتاج مفاتيح
  وشبكة على جهاز المستخدم — لا تعمل داخل الصندوق المعزول).
- **الباركود:** أعمدة جديدة `products.barcode_source` و`barcode_verified` تُضاف تلقائيًا في `server/db.js`
  (دالة `ensureColumn`). التوليد في `server/lib/barcodes.js` (EAN-13 ببادئة 20–29، ثابت عبر إعادة البذر).
  كل الـ493 منتجًا لها باركود؛ لا تُستبدل أكواد المصدر إلا بـ `--all`.
- **التكاملات:** `server/lib/integrations.js` + لوحة `/admin?tab=integrations` + `POST /api/admin/integrations/test`
  (اختبار شبكي حقيقي). الدليل `docs/INTEGRATIONS.md`.
- **الباركود في الواجهة:** `src/components/barcodescanner.tsx` — BarcodeDetector وإلا ZXing
  (`@zxing/browser`، تحميل كسول) وإلا إدخال يدوي. صلاحية CAMERA مضافة في `AndroidManifest.xml`.
- **APK:** `.github/workflows/android.yml` (workflow_dispatch + وسوم v*)، يبني debug افتراضيًا وrelease موقّعًا
  عند وجود أسرار `ANDROID_KEYSTORE_*`. `android/app/build.gradle` يقرأ `MDA_KEYSTORE_PATH` و
  `-PversionName/-PversionCode`.
- **تنبيه:** لا يوجد JDK/SDK في الصندوق — لا يمكن تجربة `gradlew` محليًا؛ التحقق الفعلي يتم في CI.

## 2026-10 — إعادة التصميم الكاملة (هوية MDA الكحلية)

- **الهوية:** شعار جديد (كبسولة + نبضة ECG) مولَّد بسكربت `scripts/make-icons.sh` (ImageMagick)،
  ينتج `public/icons/*` و`public/favicon.png` و`android/.../mipmap-*` و`/splash.png` لكل الكثافات.
  خلفية الأيقونة التكيفية `#0A2560`، شاشة البداية `#050C1A` (Android + Capacitor + PWA).
- **وضع واحد داكن:** `src/lib/config.tsx` يثبّت `dark`، حُذف مبدّل السمة من الواجهة، وأُزيلت كل
  قواعد `html:not(.dark)` من `src/styles.css` و`index.html`.
- **نظام تصميم جديد:** `tailwind.config.js` (brand/ink/aqua + `brand-grad`/`hero-grad` + ظلال
  `card|float|glow|tile` + حركات) و`src/styles.css` (`.app-bg`، `.card`، `.page-hero` بمتغيّرات
  violet/emerald/amber/rose، `.tile`، `.photo-plate`، `.sheet`...). مرجع كامل في `docs/DESIGN.md`.
- **شاشات أُعيد تصميمها:** Home (Hero + أدوات + أجهزة + بانر AI + منتجات)، Systems، SystemDetail،
  ProductDetail، Search، DrugDetail، Auth، Profile، More، About، Community، Jobs، Directories،
  Pharmacy، Prescriptions، ScanPage، AiAssistant، SubmitDrug، ThreadDetail، ولوحة التحكم بكل تبويباتها.
- **تنظيف التقني:** سكربت `scripts/normalize-classes.py` يحوّل أزواج `x dark:y` القديمة إلى قيم
  داكنة واحدة ويزيل التكرار (مع احترام متغيّرات `hover:`/`focus:`). أُضيفت `spacing.4.5/18` إلى
  Tailwind وأُزيلت `.mesh` غير المعرّفة (كانت تُستخدم في Admin).
- **التحقق:** `npx tsc --noEmit` = 0، `npm run build` ناجح (PWA theme/background `#050c1a`)،
  `npm run smoke` = 19/19 صفحة بلا أخطاء.
