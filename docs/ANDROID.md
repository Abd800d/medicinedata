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
