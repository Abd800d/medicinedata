# تطبيق أندرويد · Android build

التطبيق يُغلَّف بـ **Capacitor 6**، ومجلد `android/` جاهز في المستودع.

## المتطلبات

- Node.js ≥ 20
- [Android Studio](https://developer.android.com/studio) (Ladybug أو أحدث) + Android SDK 34
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

## 5) التوقيع والإصدار

أنشئ مفتاح توقيع:

```bash
keytool -genkey -v -keystore mda-release.jks -keyalg RSA -keysize 2048 -validity 10000 -alias mda
```

`android/key.properties` (لا تُضمّنه في Git — موجود في `.gitignore`):

```ini
storePassword=***
keyPassword=***
keyAlias=mda
storeFile=/absolute/path/mda-release.jks
```

ثم أضف في `android/app/build.gradle`:

```gradle
def keystoreProperties = new Properties()
def keystorePropertiesFile = rootProject.file('key.properties')
if (keystorePropertiesFile.exists()) {
    keystoreProperties.load(new FileInputStream(keystorePropertiesFile))
}

android {
    signingConfigs {
        release {
            keyAlias keystoreProperties['keyAlias']
            keyPassword keystoreProperties['keyPassword']
            storeFile file(keystoreProperties['storeFile'])
            storePassword keystoreProperties['storePassword']
        }
    }
    buildTypes {
        release {
            signingConfig signingConfigs.release
            minifyEnabled false
        }
    }
}
```

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

## 8) تحديث التطبيق

كل مرة تغيّر الواجهة:

```bash
VITE_API_BASE=https://mda.example.com npm run cap:sync
cd android && ./gradlew bundleRelease
```

ثم ارفع نسخة جديدة إلى Google Play (أو وزّع APK مباشرة).
