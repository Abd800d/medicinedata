## Current State — أين توقفنا الآن

> آخر تحديث: 2026-10-26 · **v1.4.0** (offline-first للكتابة: طابور + مزامنة + منع تكرار + حل تعارض).

- **v1.2.0:** مسار وصفات كامل، دور `pharmacist`، سجل تدقيق، موافقة وحذف بيانات المريض.
- **v1.3.0:** حساسيات مسجّلة (69 عائلة ATC + مواد محددة)، تنبيه `allergy_conflict` و`duplicate_therapy_class`،
  شرح مبسّط + سبب + مصدر لكل تنبيه، لوحة جودة التحليل.
- **v1.4.0 (الجديد):**
  - `server/lib/idempotency.js` + جدول `idempotency_keys`: إعادة نفس الرد لمفتاح `X-Idempotency-Key` (7 أيام، لكل مستخدم).
  - `pharmacy_items`: `version` + `client_uuid`؛ `409 CONFLICT` عند `expected_updated_at` قديم، `?force=1` للتجاوز،
    ومنع إنشاء صنف مكرر لنفس `client_uuid`.
  - الواجهة: `src/lib/offlineQueue.ts` (طابور localStorage) + `src/lib/sync.tsx` (Provider، فحص `/api/health` كل 45ث،
    مزامنة تلقائية كل 30ث) + شارة حالة في الشريط العلوي + صفحة `/sync` (حالات، إعادة محاولة، تجاهل، حل تعارض).
  - الربط: صيدليتي (إضافة/تعديل/حذف) + طلبات إضافة دواء.
- **التحقق:** `npm run test:rx` 52/52 · `npm run test:sync` 22/22 · smoke لـ `/sync /pharmacy /submit-drug /prescriptions /admin?tab=ai` نظيف · `tsc`/`build` ✅.
- **التالي:** v1.5.0 (استيراد XML/SQLite، تصدير CSV/JSON/XLSX، نسخ احتياطية مشفّرة، تعدد صور الدواء + قص/تدوير،
  نقل مرفقات الطابور إلى IndexedDB)، ثم v1.6.0 (PIN/بصمة، مراجعة أمنية، E2E، theme ليلي/نهاري).
- **تحذير بيئة:** `node_modules/` و`data/` و`dist/` و`.env` تُفقد عند استعادة مساحة العمل → `npm ci --ignore-scripts` ثم `npm run seed` ثم `npm run build`.

## Workspace — الملفات المهمة

- `package.json` — v1.0.0، ESM، scripts: `dev`, `dev:api`, `dev:web`, `build`, `start`, `seed`, `seed:reset`, `cap:sync`, `cap:android`, **`smoke`**. devDeps تضمّ jsdom@25 و@capacitor/cli@6.
- `.npmrc` (غير مُتجاهَل) — `ignore-scripts=true` (ضروري: better-sqlite3 13 يجلب prebuilds مدمجة).
- `.env` (مُتجاهَل) — PORT 4000, HOST 0.0.0.0, JWT_SECRET عشوائي، OWNER_EMAIL `7a8b1d@gmail.com`, ADMIN_PASSWORD `MDAadmin@2026`.
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
