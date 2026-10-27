# تطبيق أندرويد · Android build

التطبيق يُغلَّف بـ **Capacitor 6**، ومجلد `android/` جاهز في المستودع.

## سلسلة الأدوات (v1.7.0+) — Capacitor 7 / SDK 35

| المكوّن | الإصدار | الملف |
| --- | --- | --- |
| Capacitor (core / android / cli) | 7.6.9 | `package.json` |
| Android Gradle Plugin | 8.7.2 | `android/build.gradle` |
| Gradle wrapper | 8.11.1 | `android/gradle/wrapper/gradle-wrapper.properties` |
| JDK | **21** | `.github/workflows/android.yml` + Android Studio Ladybug |
| compileSdk / targetSdk | **35** | `android/variables.gradle` |
| minSdk | 23 | نفس الملف |
| Android SDK (CI) | `platforms;android-35` + `build-tools;35.0.0` | workflow |

**لماذا الترقية؟** Google Play لا يقبل أي نسخة بـ `targetSdk` أقل من 35. Capacitor 6 لا يدعم 35،
لذلك الترقية إلى Capacitor 7 إجبارية قبل النشر في المتجر.

**ما تغيّر في الشيفرة؟**
- `bundledWebRuntime` حُذف من `capacitor.config.ts` (محذوف في v7).
- `android:configChanges` صار يحتوي `navigation` (توصية Capacitor 7 لمنع إعادة تشغيل التطبيق مع لوحات المفاتيح).
- `MainActivity.java` صار يقرأ `localStorage['mda.secureFlag']` ويطبّق `FLAG_SECURE` عند الطلب
  (المزيد ← قفل التطبيق ← منع لقطات الشاشة) — يُعيد القراءة عند كل عودة للتطبيق.

**التحقق من الترقية:**
1. أي دفع إلى فرع `arena/**` أو `feature/**` يشغّل بناءً تجريبيًا (APK artifact فقط، بلا إصدار) —
   لذلك تُختبر سلسلة الأدوات الجديدة قبل الدمج لا بعده.
2. خطوة **«Verify SDK 35»** تقرأ `targetSdkVersion` من الـ APK نفسه بـ `aapt2 dump badging`
   و**تُفشل التشغيل** إن كان أقل من 35، وتطبع `targetSdk`/`minSdk`/`versionName`/`versionCode`
   في ملخص التشغيل. السبب: بناء ينجح بـ targetSdk خاطئ = APK مرفوض من Play بعد كل هذا العمل.

## المتطلبات

- Node.js ≥ 20
- [Android Studio](https://developer.android.com/studio) (Ladybug أو أحدث) + Android SDK 35 + JDK 21
- JDK 21 (يأتي مع Android Studio)
- جهاز أندرويد حقيقي أو محاكي (API 24+)

## 1) بناء الواجهة

الواجهة داخل التطبيق لا تستطيع استخدام مسارات نسبية مثل `/api`؛ يجب أن تعرف عنوان الخادم وقت البناء:

```bash
# عنوان الخادم المنشور (بدون /api في النهاية)
VITE_API_BASE=https://mda.example.com npm run build
```

> بديل بدون إعادة بناء: يمكن ضبط العنوان من داخل التطبيق عبر `localStorage['mda.apiBase']` (أضف شاشة إعدادات داخلية إن رغبت). الطريقة الموصى بها هي `VITE_API_BASE`.

## 2) المزامنة

```bash
npm run cap:sync          # = npm run build && npx cap sync android
```

`npm run cap:sync` ينسخ `dist/` إلى `android/app/src/main/assets/public` ويحدّث الإعدادات.

## 3) البناء من Android Studio

```bash
npx cap open android
```

ثم `Build → Build Bundle(s)/APK(s) → Build APK(s)`.

## 4) البناء من الطرفية

```bash
cd android
./gradlew assembleDebug        # APK للتجربة: app/build/outputs/apk/debug/app-debug.apk
./gradlew bundleRelease        # AAB للنشر على Google Play
```

## 4.5) البناء بدون أي أدوات محلية — GitHub Actions (الطريقة الموصى بها)

لا تحتاج JDK ولا Android SDK على جهازك: سير العمل `.github/workflows/android.yml` يبني الـ APK
على خوادم GitHub ويرفعه كملف جاهز للتثبيت.

1. **Settings → Secrets and variables → Actions → Variables → New variable**
   - الاسم: `VITE_API_BASE`
   - القيمة: عنوان الخادم المنشور، مثل `https://mda.example.com` (بدون `/` في النهاية وبدون `/api`).
2. **Actions → Android APK → Run workflow** → اختر `debug` → **Run**.
3. انتظر ~5 دقائق، ثم من صفحة التشغيل نزّل الـ artifact باسم **`mda-apk`**.
   داخله `app-debug.apk` — انقله للهاتف وثبّته (اسمح بالتثبيت من مصدر غير معروف).

الـ APK يشمل الواجهة كاملة داخل التطبيق، ويتصل بخادمك عبر `VITE_API_BASE`.

**بناء موقّع للنشر (`release`)** — أضف هذه الأسرار (Secrets) مرة واحدة:

```bash
keytool -genkeypair -v -keystore mda-release.jks -keyalg RSA -keysize 2048 -validity 10000 -alias mda
base64 -w0 mda-release.jks > mda-release.jks.b64      # الصق محتواه في السر الأول
```

| Secret | القيمة |
| --- | --- |
| `ANDROID_KEYSTORE_BASE64` | محتوى `mda-release.jks.b64` |
| `ANDROID_KEYSTORE_PASSWORD` | كلمة مرور المخزن |
| `ANDROID_KEY_ALIAS` | `mda` |
| `ANDROID_KEY_PASSWORD` | كلمة مرور المفتاح |

ثم شغّل السير بـ `build_type = release`، أو ادفع وسمًا: `git tag v1.1.0 && git push origin v1.1.0`.
`android/app/build.gradle` يقرأ مسار المخزن من `MDA_KEYSTORE_PATH` ويستعمل `-PversionCode/-PversionName`
القادمين من السير، فلا حاجة لأي تعديل يدوي.

> بدون `VITE_API_BASE` يتوقف السير برسالة واضحة بدل إنتاج APK لا يتصل بأي خادم.

## 5) التوقيع والإصدار (بناء محلي)

أنشئ مفتاح توقيع:

```bash
keytool -genkey -v -keystore mda-release.jks -keyalg RSA -keysize 2048 -validity 10000 -alias mda
```

`android/key.properties` غير مطلوب: ملف `android/app/build.gradle` يقرأ التوقيع من متغيرات البيئة
`MDA_KEYSTORE_PATH` و`MDA_KEYSTORE_PASSWORD` و`MDA_KEY_ALIAS` و`MDA_KEY_PASSWORD` (نفس ما يستخدمه CI).

```bash
export MDA_KEYSTORE_PATH="$PWD/mda-release.jks"
export MDA_KEYSTORE_PASSWORD='***'
export MDA_KEY_ALIAS=mda
export MDA_KEY_PASSWORD='***'
```

بدون هذه المتغيرات يُبنى `release` **غير موقّع** (لن يُثبَّت) — استخدم `assembleDebug` للتجربة.

```bash
cd android && ./gradlew bundleRelease
# android/app/build/outputs/bundle/release/app-release.aab
```

## 6) الهوية والأيقونات

- اسم التطبيق: `android/app/src/main/res/values/strings.xml` (`app_name`)
- الأيقونة: استبدل `android/app/src/main/res/mipmap-*/ic_launcher*.png` بأيقونة MDA (توليدها: Android Studio → Image Asset، أو من `public/icons/icon-512.png`)
- شاشة البداية: `@style/AppTheme.NoActionBarLaunch` — عدّل `android/app/src/main/res/values/styles.xml`
- الألوان: `android/app/src/main/res/values/colors.xml`

## 7) سلوك متوقّع

- الاتصال بالإنترنت مطلوب للمزامنة؛ البحث المحلي يعمل من حزمة offline بعد أول تشغيل.
- رفع الصور (الوصفة/المسح) يستخدم `FormData` — يعمل كما في الويب.
- إن ظهرت شاشة بيضاء: تأكد أن `VITE_API_BASE` صحيح وأن `dist/` موجود قبل `cap sync`، ثم امسح بيانات التطبيق وأعد التثبيت.
- `android:usesCleartextTraffic` مرفوض افتراضيًا — استخدم HTTPS في الإنتاج.
- **الكاميرا والباركود:** صلاحية `CAMERA` مضافة في `AndroidManifest.xml`. مسح الباركود يعمل داخل
  التطبيق عبر محرّك ZXing (`.js` مضمّن، لا يحتاج خدمة Google Play)، وإدخال الرقم يدويًا متاح دائمًا.

## 7.5) Google Sign-In داخل التطبيق

Google ترفض تسجيل الدخول داخل `WebView`. داخل الـ APK:

- **الافتراضي والعامل الآن:** تسجيل بالبريد وكلمة المرور، ثم كل شيء يعمل (الوصفات، المجتمع، الطلبات).
- **لتفعيل Google:** أضف إضافة القراءة الأصلية ثم أعد البناء:

```bash
npm i @codetrix-studio/capacitor-google-auth
npx cap sync android
```

  سجّل `applicationId` (`com.mda.medicinedata`) + بصمة SHA-1 في Google Cloud، وأضف `serverClientId`
  في `capacitor.config.ts` بنفس `GOOGLE_CLIENT_ID`. التفاصيل في `docs/INTEGRATIONS.md`.

## 8) تحديث التطبيق

كل مرة تغيّر الواجهة:

```bash
VITE_API_BASE=https://mda.example.com npm run cap:sync
cd android && ./gradlew bundleRelease
```

ثم ارفع نسخة جديدة إلى Google Play (أو وزّع APK مباشرة).


---

## منع لقطات الشاشة — كيف يعمل فعليًا (v1.8.0)

ثلاث طبقات، كلها اختيارية:

| الطبقة | المفتاح | يطبّقه |
|---|---|---|
| افتراضي الجهاز | `localStorage['mda.secureFlag']` = `'1'` | `MainActivity.refreshSecureFlag()` عند `onCreate`/`onResume` |
| وصفة بعينها | `localStorage['mda.secureRx.v1']` (JSON لمُعرّفات الوصفات) | `RxSecureToggle` داخل شاشة الوصفات |
| الجسر الفوري | `window.MDASecure.set('1'\|'0')` | `SecureBridge` في `MainActivity` (فوري بدون إعادة تشغيل) |

عند التطبيق الفوري يُكتب `mda.secureNow`؛ والـshell يقرأه قبل `mda.secureFlag` في `onResume`،
فلا يُرفع الحماية عن وصفة محميّة عند العودة من الخلفية. الجسر يرفض الطلبات إذا لم تكن الصفحة
من أصول التطبيق (`https://localhost` أو `file://`).

على الويب لا يوجد `FLAG_SECURE`؛ المفتاح يحفظ الاختيار فقط والنص يوضّح ذلك.


---

## الخادم المدمج (v1.8.2) — لماذا لم يكن التطبيق يتصل بالخادم

### المشكلتان الحقيقيتان

| # | المشكلة | ماذا كان يحدث | الإصلاح |
|---|---|---|---|
| 1 | **لا CORS على الخادم** | التطبيق يعمل من أصل `https://localhost` (Capacitor)، وأي طلب إلى `https://<host>/api/…` يُحجب داخل WebView. الطلب يفشل ⇒ التطبيق يسقط بصمت إلى الكتالوج المدمج ⇒ لا تسجيل دخول ولا ذكاء اصطناعي | `server/lib/cors.js`: يُسمح بأصول Capacitor افتراضيًا، و204 للـpreflight، ويُباح `Authorization` و`X-Idempotency-Key` |
| 2 | **لا عنوان خادم مدمج** | نسخة APK تُبنى بـ`VITE_API_BASE` فارغ ⇒ حتى مع CORS لا تعرف أين تتصل | `src/lib/server.ts`: `DEFAULT_SERVER` مدمج + كشف بيئة Capacitor |

### كيف يُحلّ العنوان الآن

```
?server=https://…   ←  أعلى أولوية (اختبار/تبديل سريع بلا إعادة بناء)
   ↓
localStorage['mda.apiBase']   ← ما يحفظه المستخدم من «الخادم والاتصال»
   ↓
VITE_API_BASE (وقت البناء)    ← متغيّر المستودع/CI
   ↓
DEFAULT_SERVER                ← مدمج في الكود (وضع تطبيق أندرويد فقط)
   ↓
نسبي (same-origin)            ← نسخة الويب التي يخدمها الخادم نفسه
```

- على الويب: `fallbackServer()` تعيد `''` ⇒ كل الطلبات نسبية، بلا CORS أصلًا.
- في تطبيق أندرويد: `isNativeShell()` صحيحة ⇒ كل الطلبات إلى `DEFAULT_SERVER`.
- لتغيير الخادم في نسخة جديدة: عدّل `DEFAULT_SERVER` أو اضبط `VITE_API_BASE` عند البناء.

### البدء البارد (Render Free)

الخادم المجاني ينام بعد ~15 دقيقة خمول ويحتاج حتى دقيقة ليستيقظ. لذلك:

- أول طلب من التطبيق يحصل على محاولة صبورة واحدة تصل إلى **25 ثانية** (`wakeBackend`).
- أثناءها يظهر شريط **«جارٍ تشغيل الخادم…»** بدل «الخادم غير متصل».
- إن فشلت المحاولة: الكتالوج المدمج يبقى يعمل، والإشعار يعرض العنوان الفعلي الذي حاول التطبيق الوصول إليه.

### تحقّق سريع من أي خادم

```bash
# 1) هل الحزمة/الخادم يعمل؟
curl -s https://<host>/api/health

# 2) هل CORS مضبوط لأصل التطبيق؟
curl -s -o /dev/null -D- -X OPTIONS https://<host>/api/health \
  -H 'Origin: https://localhost' -H 'Access-Control-Request-Method: GET' | grep -i access-control
# المتوقع: 204 + Access-Control-Allow-Origin: https://localhost
```

إن أضفت نطاقًا آخر (نسخة ويب منفصلة عن الـAPI) ضعه في `CORS_ORIGINS` مفصولًا بفواصل.

---

## v1.8.3 — النقل الأصلي (Native HTTP): لا حاجة لأي خطوة على الخادم

**المشكلة التي أبلغ عنها المالك:** التطبيق المثبَّت (v1.8.2) على الهاتف لا يسجّل الدخول ولا يشغّل الذكاء الاصطناعي،
والحل المقترح كان «أعد النشر من Render». المالك رفض أن ينفّذ أي خطوة يدوية على الخادم، والمطلوب أن يعمل التطبيق وحده.

**سبب الجذر:** أي طلب من داخل WebView يعمل من أصل `https://localhost` هو طلب **cross-origin**، والمتصفح
(WebView) يرمي **الردّ** إن لم يرسل الخادم ترويسات CORS. الخادم المنشور كان v1.8.1 (بلا CORS) ⇒ كل ردّ يُحجب
⇒ فشل تسجيل الدخول والذكاء الاصطناعي، مع بقاء الكتالوج المدمج يعمل (لهذا بدا التطبيق «شبه سليم»).

**الحل في v1.8.3 (داخل التطبيق نفسه):** صار كل اتصال بالـAPI يُنفَّذ عبر **جسر Capacitor الأصلي**
(`CapacitorHttp`)، أي أن الطلب يخرج من طبقة Java/Android لا من WebView. الطلبات الأصلية **لا تخضع لسياسة
الأصل الواحد**، فلا تُشترط ترويسات CORS على الخادم إطلاقًا.

| الطبقة | الملف | الدور |
|---|---|---|
| تشغيل الجسر | `capacitor.config.ts` → `plugins.CapacitorHttp.enabled: true` | يُفعّل اعتراض `window.fetch` داخل WebView وتحويله إلى طلب أصلي |
| نقل صريح | `src/lib/nativeHttp.ts` | `nativeFetch()` / `smartFetch()` — يبني `Response` حقيقيًا من ردّ الجسر، ويحوّل `FormData` إلى أجزاء base64، ويفرض مهلة زمنية |
| عميل الـAPI | `src/lib/api.ts` → `fetchWithTimeout()` | يمرّ عبر الجسر عند وجوده، ويعود إلى المتصفح على الويب |
| الملفات والتنزيلات | `src/lib/download.ts` · `DataTools.tsx` | `responseType: 'arraybuffer'` + فكّ base64 ⇒ النسخ الاحتياطية والتصدير تعمل بلا CORS |
| الطابور دون اتصال | `src/lib/sync.tsx` | إعادة إرسال العمليات المؤجلة عبر الجسر لا عبر `fetch` |
| صفحات قانونية | `src/pages/Legal.tsx` | تقرأ النص من الخادم دون قيود CORS |
| فحص الاتصال | `src/pages/ServerSettings.tsx` | زر «اختبار الاتصال» يفحص عبر الجسر، ويظهر وسم **«نقل أصلي — يتجاوز CORS بالكامل»** |

### ماذا يبقى من CORS؟

`server/lib/cors.js` باقٍ كما هو (حماية إضافية لنسخة الويب التي تُقدَّم من نطاق آخر). لم يُحذف شيء، لكن
**لم يبقَ أي اعتماد عليه** من داخل APK. لذلك: أي خادم يعمل — قديمًا كان أو جديدًا — سيجيب التطبيق.

### ما يعمل الآن بعد التثبيت مباشرة (بلا أي خطوة على Render)

- تسجيل الدخول/إنشاء الحساب، المجتمع والوظائف، الصيدلية والمخزون.
- قراءة الروشتة بالصور ورفع صور المنتجات (الرفع عبر `dataType: 'formData'` مع boundary يُولَّد أصليًا).
- التنزيلات المحمية (نسخة احتياطية مشفّرة، تصدير CSV) دون أن يقطعها المتصفح.
- لوحة الإدارة وتعديل البيانات.
- **ما يبقى شرطًا:** مفتاح الذكاء الاصطناعي (Groq/Gemini) — لأن التحليل يجري على الخادم لا في التطبيق.
  يُدخل من داخل التطبيق: المزيد ← الخادم والاتصال ← تسجيل دخول الأدمن ← «التشغيل والتفعيل» ← الذكاء الاصطناعي.

### اختبار آلي يثبت ذلك

```bash
npm run test:native     # 57 تحقّقًا
```

الاختبار يبني حزمة حقيقية، يضعها في JSDOM على `https://localhost` (أصل التطبيق نفسه)، يستبدل الجسر بـ«طابور
تسجيل»، ويجعل `window.fetch` يرمي خطأً. ثم يتحقق من: تسجيل الدخول، الرأس `Authorization`، رفع الصور،
الردود 204/401/500، التنزيلات الثنائية، فحص الاتصال، والصفحات القانونية — **كلها تمر دون أي استدعاء لـ`window.fetch`**.
أي عودة مستقبلية إلى `fetch` عادي في مسار الـAPI تُسقِط الاختبار فورًا.

### استكشاف الأخطاء (v1.8.3)

| العَرَض | السبب | العلاج |
|---|---|---|
| «لا يوجد اتصال» مع أن الموقع يعمل في المتصفح | الخادم نائم (خطة مجانية) | أعد المحاولة بعد 30–60 ثانية؛ الشريط يعرض «جارٍ تشغيل الخادم…» |
| فشل تسجيل الدخول فقط | بريد/كلمة مرور خاطئة أو الحساب معطّل | رسالة الخطأ تأتي من الخادم نفسه؛ الأدمن يفعّل الحساب |
| التحليل يقول «الذكاء الاصطناعي غير مُهيّأ» | لا مفتاح على الخادم | أدخل المفتاح من داخل التطبيق (المسار أعلاه) أو `AI_API_KEY` في Render |
| التنزيل لا يبدأ | انقطاع الشبكة أثناء التحميل | أعد المحاولة؛ الرسالة تعرض رمز HTTP |
| «نقل عبر المتصفح (يحتاج CORS)» في الإعدادات | التطبيق غير مثبَّت كـAPK (نسخة ويب) | سلوك متوقع على الويب فقط |

---

## v1.8.4 — نسخة جاهزة: تثبيت وتحديث بلا أخطاء

### ١) سبب رسالة «لم يتم تثبيت التطبيق» (App not installed)

كل بناء سابق كان **debug**، ومفتاح الـdebug في GitHub Actions **يُولَّد من جديد في كل تشغيل**
(البيئة مؤقتة). أي أن v1.8.2 وv1.8.3 كانا يحملان **بصمتين مختلفتين** لنفس اسم الحزمة
`com.mda.medicinedata`، وأندرويد يرفض تثبيت حزمة موجودة بتوقيع مختلف:

```
INSTALL_FAILED_UPDATE_INCOMPATIBLE  ⇐  "لم يتم تثبيت التطبيق"
```

### ٢) الإصلاح

| ما تغيّر | الأثر |
|---|---|
| `android/mda-distribution.keystore` مفتاح توزيع ثابت داخل المستودع | **نفس بصمة التوقيع في كل إصدار قادم** ⇒ التحديث يُثبَّت فوق التطبيق بلا حذف |
| CI يبني **release** افتراضيًا (`BT=release`) بدل debug | غير قابل للتصحيح (not debuggable)، أسرع، ولا تحذيرات Play Protect |
| `build.gradle` يستخدم المفتاح المدمج تلقائيًا، والسر `ANDROID_KEYSTORE_BASE64` يتقدّم عليه | الترقية إلى مفتاح Play لاحقًا بلا تغيير كود |
| CI يرفض إنتاج `.aab` بمفتاح التوزيع العام | لا يُرسل مفتاح عام إلى Google Play |
| خطوة جديدة: **Verify the APK is self-contained** | تفكّ APK وتتحقق من وجود `assets/public/index.html` وحزمة JS و`assets/capacitor.config.json` بصلاحية `CapacitorHttp.enabled=true`، وترفض أي APK يحمل `application-debuggable` عند طلب release |
| `src/main.tsx`: لا Service Worker داخل التطبيق | لا تخدم النسخة القديمة من الحزمة بعد التحديث |
| `src/lib/api.ts`: سقوط آمن إلى `fetch` إن غاب جسر Capacitor | لا تظهر «لا يوجد اتصال» بسبب بلجن غير مسجَّل على جهاز معيّن |

**بصمة مفتاح التوزيع (SHA-256):**
`21:9F:C4:D7:3A:C3:EF:62:1C:C6:00:4B:7E:8A:6E:9E:B9:22:E8:5C:3A:CE:DD:0D:66:A0:B5:F4:B5:63:3F:C4`

### ٣) خطوات التثبيت الصحيحة

| حالتك الآن | ما تفعله |
|---|---|
| لم تثبّت أي نسخة | ثبّت `app-release.apk` مباشرة |
| مثبّت v1.8.0–v1.8.3 (توقيع debug) | **احذفها مرة واحدة** ثم ثبّت `app-release.apk` — من هذا الإصدار فصاعدًا لن تحتاج الحذف أبدًا |
| ستحدّث إلى v1.8.5 لاحقًا | ثبّت فوق النسخة الموجودة مباشرة (نفس التوقيع) |

### ٤) ما يتحقق منه البناء تلقائيًا (لا وعود بلا دليل)

```
✓ targetSdk 35 (شرط Google Play)
✓ versionCode/versionName من الوسم
✓ assets/public/index.html + حزمة JS داخل الـAPK   (لا شاشة بيضاء)
✓ assets/capacitor.config.json → CapacitorHttp.enabled=true (لا اعتماد على CORS)
✓ ليس debuggable
✓ توقيع apksigner سليم + بصمة الشهادة مطبوعة في السجل
```

### ٥) حدود

- مفتاح التوزيع **عام بقصد** (مهيّأ للتثبيت المباشر فقط) — للـPlay أضف `ANDROID_KEYSTORE_BASE64`.
- التحليل بالذكاء الاصطناعي يبقى على الخادم ⇒ يحتاج مفتاحًا على الخادم ولا يعمل بلا إنترنت.
- خطة Render المجانية تنام بعد ~15 دقيقة؛ أول طلب بعدها يستغرق حتى دقيقة.

---

## v1.9.0 — إصلاح أخطاء التطبيق + استيراد البيانات + Google من الجوال

### ١) أخطاء حقيقية كانت تُعطّل التطبيق (وأُصلحت)

| # | الموضع | الخطأ | ما كان يحدث | الإصلاح |
|---|---|---|---|---|
| 1 | `admin/Media.tsx` | `xhr.open('POST', '/api/admin/import')` رابط **نسبي** | داخل APK يُترجم إلى `https://localhost/api/…` = 404 ⇒ **الاستيراد لا يعمل على الجوال** | `apiUrl()` يبني رابطًا مطلقًا؛ الـXHR يمرّ عبر جسر Capacitor |
| 2 | `admin/DataTools.tsx` | `fetch('/api/admin/backup')` نسبي | إنشاء النسخة المشفّرة يفشل في التطبيق | `smartFetch(apiUrl(…), …, true)` |
| 3 | `admin/DataTools.tsx` | `fetch('/api/admin/backup/inspect')` | فحص ملف النسخة يفشل | نفس المعالجة |
| 4 | `admin/DataTools.tsx` | `fetch('/api/admin/backup/restore')` | الاستعادة تفشل | نفس المعالجة (مهلة 300 ثانية) |
| 5 | `ScanPage.tsx` | `window.open(...)` ×3 | WebView لا يفتح نوافذ ⇒ أزرار Google Lens/Images لا تفعل شيئًا | `openExternal()` عبر `@capacitor/browser` |
| 6 | `admin/Catalog.tsx` · `admin/Media.tsx` | `window.open(searchUrl)` | «بحث الصور» بلا استجابة | نفس المعالجة |
| 7 | `admin/Submissions.tsx` | `window.open('/drugs/…')` | لا يفتح الدواء المعتمد | `navigate()` داخل التطبيق |
| 8 | `server/lib/importer.js` | `readRows()` بلا فرع `csv/tsv` | **معاينة** ملف CSV تفشل بـ`unsupported kind: csv` (الاستيراد الفعلي كان يعمل) | فرع CSV/TSV متدفق مع حد للصفوف |
| 9 | `server/lib/importer.js` | `parseCsvLine` يفصل بالفاصلة فقط | ملفات **TSV** (المعلن دعمها) تُقرأ كعمود واحد ⇒ كل الصفوف فاشلة | كشف الفاصل تلقائيًا: Tab · `,` · `;` · `|` |
| 10 | `server/routes/auth.js` | حد التسجيل 8/دقيقة لكل IP | مشغّلو الجوال في اليمن خلف NAT واحد ⇒ تسجيل حقيقي يُحجب | 20/دقيقة (تسجيل ودخول) |

**حماية دائمة:** `test:native` يفحص كل ملفات `src/` ويفشل إن عاد أي استدعاء `fetch/xhr` برابط `/api/` نسبي.

### ٢) استيراد البيانات — ما يعمل الآن

| الصيغة | الحالة |
|---|---|
| CSV · TSV · TXT | ✅ متدفق حتى ملايين الصفوف، كشف الفاصل، مطابقة أعمدة عربية/إنجليزية |
| Excel XLSX · XLS | ✅ كل الأوراق |
| JSON | ✅ ملف، و**لصق مباشر** في الشاشة (حتى 50,000 صف) |
| XML · SQLite (.db) | ✅ مع اكتشاف الجدول تلقائيًا |

وأُضيف: **عدة ملفات في دفعة واحدة** + سحب وإفلات + حالة لكل ملف + **قوالب CSV/TSV/JSON** جاهزة.

### ٣) Google من الجوال

التفاصيل الكاملة في [`docs/GOOGLE.md`](GOOGLE.md). باختصار: زر Google يفتح **متصفح النظام** بتدفق
OAuth + PKCE، والخادم يبدّل الرمز ويعيد التطبيق عبر `com.mda.medicinedata://auth`. الاعتماد يُدخل
من لوحة الإدارة ويُخزَّن مشفّرًا — **بلا أي تعديل على Render**.

### ٤) لوحة التحكم — الناقص الذي أُكمل

`/review` — **طابور مراجعة الوصفات** للصيدلي والمدير: قائمة معلّقة/معتمدة/مرفوضة، فتح وصفة مستخدم
آخر، تصحيح بند، اعتماد (مع تأكيد صريح للبنود غير المراجعة) أو رفض. يظهر الرابط في «المزيد»
لحسابي الصيدلي والمدير.

### ٥) الإصدار والبناء

`versionName` يأتي من اسم الوسم (`v1.9.0`) و`versionCode` من **رقم تشغيل GitHub Actions**
(هذا الإصدار: **45**، والسابق v1.8.4: 42). الرقم يجب أن يزيد دائمًا، وإلا رفض أندرويد التحديث
فوق النسخة المثبّتة. البناء المحلي بلا `-PversionCode` يستخدم 45 كاحتياطي.

### ٦) البوابات


```
tsc نظيف · build OK · e2e 125 · native 84 · ui 60 · rx 52 · data 51 · sync 22 · smoke 28/0
```

---

## v1.9.1 — سجل التدقيق · حذف الحساب · استعادة كلمة المرور

### ١) سجل التدقيق (`/admin?tab=audit`)

| ميزة | التفصيل |
|---|---|
| المصدر | `GET /api/admin/audit` → `{data,total,limit,offset}` |
| الفلاتر | العملية (من قائمة العمليات التي حدثت فعلًا)، نوع الهدف، **من/إلى تاريخ**، بحث حر يشمل البريد/الاسم/المعرّف/البيانات الوصفية |
| الترقيم | 100 قيد لكل صفحة مع «السابق/التالي» وعدّاد `x–y من total` |
| التحقق | زر **«تحقّق من سلامة السلسلة»** يستدعي `GET /api/admin/audit/verify`، ويعرض إما «n قيدًا متصلًا» أو رقم القيد المكسور وسببه |
| التفاصيل | فتح أي قيد يعرض `meta_json` كاملًا + `prev_hash` و`hash` للمقارنة اليدوية |
| التصدير | زر يُنزّل صفحة الجدول الحالية JSON |

> الفهارس تأتي من `GET /api/admin/audit/actions` (أسماء العمليات الفعلية وعدد كل واحدة) — لا قائمة مخمّنة.

### ٢) حذف الحساب

| الحالة | النتيجة |
|---|---|
| بلا كتابة `DELETE` | `400 confirm-required` |
| كلمة مرور خاطئة (حساب محلي) | `403 wrong-password` — لا يُحذف شيء |
| حساب المالك | `403 owner-protected` |
| آخر مدير نشط | `409 last-admin` |
| صحيح | `200` + عدّادات المحذوف، والتوكن يصبح `401` فورًا |

يُحذف: الحساب، المفضلة، الوصفات وبنودها ومراجعاتها، مخزون صيدليتي، الحساسيات، الموافقات،
مفاتيح المزامنة، مواضيعه المجتمعية، **وملفات صور الوصفات من القرص**.
تبقى ردود الآخرين ووظائفهم بلا اسم (فصل الحساب) — والتفاصيل في `docs/ACCOUNT.md`.

### ٣) استعادة كلمة المرور

`/forgot-password`: لا ادعاء بريد غير موجود. يفتح واتساب برسالة جاهزة تحمل البريد المسجّل،
ويصدر المدير كلمة مؤقتة من لوحة التحكم. التحذير داخل الشاشة: الدعم لا يطلب كلمة المرور الحالية أبدًا.

### ٤) مصفوفة المواصفات

`docs/SPEC-STATUS.md` — جدول مطابقة كل بند من المواصفة الأصلية (26 شاشة، 20 مخرجًا، معايير القبول)
بالحالة الحقيقية، وأسباب الخروج المعماري (Capacitor بدل Compose، SQLite بدل Postgres)، وقائمة ما ينقص.

### ٥) الإصدار

`versionName` من الوسم، و`versionCode` من رقم تشغيل CI (يزيد دائمًا). الاحتياطي في `build.gradle`
للبناء المحلي فقط.

### ٦) البوابات

```
tsc نظيف · build OK · e2e 149 · native 97 · ui 60 · rx 52 · data 51 · sync 22 · smoke 30/0
```

---

## v1.10.0 — صور الأدوية من معرض الهاتف

### الأخطاء الحقيقية التي أُصلحت (كلها تظهر على الهاتف فقط)

| # | ما كان يحدث | السبب في الكود | الإصلاح |
|---|---|---|---|
| 1 | أزرار ⭐/🗑️/الترتيب **غير موجودة** على الهاتف | شريط الأدوات كان `opacity-0 group-hover:opacity-100` — لا يوجد «hover» على شاشة اللمس | شريط ثابت تحت كل صورة، بمساحة لمس كافية |
| 2 | صور المعرض تظهر مكسورة داخل الـAPK | `<img src={row.url}>` برابط نسبي `/uploads/…` ⇒ يُطلب من `https://localhost` | `assetUrl()` في كل مكان |
| 3 | اختيار **نفس الصورة** مرة ثانية لا يفعل شيئًا | لم يُفرَّغ `input.value` | يُفرَّغ بعد كل اختيار |
| 4 | صور الهاتف العمودية تظهر **مائلة** | `drawImage` يتجاهل وسم EXIF للدوران | `createImageBitmap(..., { imageOrientation: 'from-image' })` قبل القصّ |
| 5 | صور **HEIC** تجعل الاستوديو يدور بلا نهاية | لا فحص للصيغة ولا معالجة للفشل | رسالة عربية تشرح البديل + زر «اختر صورة أخرى» |
| 6 | حذف صورة يترك **ملفها** على القرص للأبد | `DELETE` يحذف الصف فقط | `removeUploadedFile()` + `file_removed` في الرد |
| 7 | لا طريقة لتعديل صورة **منشورة** | الرفع يُنشئ صفًا جديدًا فقط | `PUT /product-images/:id/file` — استبدال في المكان بنفس المعرّف |

### ما أصبح ممكنًا

- **من صفحة أي دواء:** زر كاميرا فوق الصورة + بطاقة «صور هذا الدواء ← إضافة من معرض الهاتف».
- **من لوحة التحكم:** الاستيراد والصور ← معرض المنتج (نفس المكوّن، نفس الأزرار).
- **اختيار الاسم العلمي** يعرض كل منتجاته التجارية لتختار أيّها تضيف له صورة.
- **صورة رئيسية** بضغطة، وترتيب، وحذف (للمدير).
- **الصيدلي** يضيف ويعدّل ويُعيّن الرئيسية؛ **الحذف والترتيب للمدير فقط**.
- كل عملية تُسجَّل: `image.upload` · `image.replace` · `image.update` · `image.reorder` · `image.delete` باسم المنفّذ ووقته.

### البوابات

```
tsc نظيف · build OK · e2e 171 · native 119 · ui 67 · rx 52 · data 51 · sync 22 · smoke 30/0
```
