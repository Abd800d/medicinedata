# التوقيع الرسمي (Release Signing) لـ APK / AAB

التطبيق في الإصدارات السابقة كان **debug-signed** — يعمل ويُثبَّت، لكنه ليس نسخة إصدار حقيقية
(لا يصلح لمتجر Google Play، ولا يمكن تحديثه لاحقًا بمفتاح مختلف).

هذا الملف يشرح كيف يُبنى إصدار **موقّع رسميًا** من داخل GitHub Actions، دون Android Studio.

---

## كيف يعمل الآن (بدون أي إعداد إضافي)

منذ **v1.8.4** يُشحن مع المستودع مفتاح توزيع ثابت `android/mda-distribution.keystore`، ويُستخدم
تلقائيًا متى لم يكن السر `ANDROID_KEYSTORE_BASE64` موجودًا. النتيجة: **كل إصدار يحمل نفس بصمة
التوقيع**، فيُثبَّت التحديث الجديد **فوق** التطبيق الموجود بدون حذفه.

| الحدث | ما يُبنى |
|---|---|
| push وسم `v*` **بدون** سر (الوضع الحالي) | `app-release.apk` موقّع بمفتاح التوزيع الثابت ✅ (لا AAB) |
| push وسم `v*` **مع** السر `ANDROID_KEYSTORE_BASE64` | `app-release.apk` + `app-release.aab` موقّعان بمفتاح الرفع الخاص بك |
| push إلى `arena/**` أو `feature/**` | `app-release.apk` (للتحقق من سلسلة الأدوات والتوقيع) |
| Actions → `build_type=debug` | `app-debug.apk` (للتشخيص فقط — توقيعه يتغيّر كل بناء) |
| Actions → `build_type=release` + `build_format=aab` | `app-release.aab` فقط (لـGoogle Play — يحتاج السر) |

الملفات تُرفع تلقائيًا في صفحة **Releases** عند الوسم، وتظهر أيضًا كـartifact باسم `mda-apk`.

### مفتاح التوزيع المدمج — ما هو وما ليس هو

| | |
|---|---|
| الملف | `android/mda-distribution.keystore` (PKCS#12) |
| الاسم المستعار | `mda` |
| كلمة المرور | `mda-distribute-2026` (مذكورة هنا لأن المفتاح **عام ومقصود**) |
| البصمة (SHA-256) | `21:9F:C4:D7:3A:C3:EF:62:1C:C6:00:4B:7E:8A:6E:9E:B9:22:E8:5C:3A:CE:DD:0D:66:A0:B5:F4:B5:63:3F:C4` |
| صلاحية الشهادة | إلى 2056 |
| ✅ يصلح لـ | التثبيت المباشر (sideload) وتحديث الإصدارات فوق بعضها |
| ❌ لا يصلح لـ | Google Play — للرفع استخدم `ANDROID_KEYSTORE_BASE64` (السر يتقدّم دائمًا على المفتاح المدمج) |

> **لماذا مفتاح عام؟** لأن أسرار GitHub غير قابلة للإنشاء من هذه البيئة، وبِلا مفتاح ثابت كان كل
> بناء على CI يُولّد مفتاح debug عشوائيًا ⇒ رسالة **«لم يتم تثبيت التطبيق»** عند تحديثه. وجوده في
> المستودع مقصود ومُوثَّق. خطره محدود: من يملكه يستطيع توقيع APK يحمل نفس اسم الحزمة، ولهذا لا
> يجوز استخدامه للنشر على Play (Play يستخدم مفتاح الرفع + Play App Signing).

---

## الإعداد (مرة واحدة، دقيقتان)

### ١) احصل على keystore

**الطريقة الأسهل (v1.8.0) — لا تحتاج Java ولا حاسوبًا:**

1. افتح التطبيق بحساب **مدير** → الإدارة → التكاملات → «مفتاح رفع Google Play».
2. اكتب كلمة مرور (12 حرفًا أو أكثر، أو اضغط «عشوائي»)، ثم «إنشاء مفتاح الرفع».
3. اضغط **تنزيل mda-upload.p12** واحفظه، وانسخ كلمة المرور في مدير كلمات مرور.
4. نفس الصفحة تعرض القيم الأربع مع زر نسخ لكل واحدة — الصقها في أسرار GitHub.

المفتاح يُولَّد داخل الخادم بمكتبة `node-forge` (RSA-2048 + شهادة توقيع كود صالحة 30 سنة،
حزمة PKCS#12 بـ3DES يقرأها Gradle وapksigner). **لا يُحفظ على الخادم** ولا يُكتب في قاعدة البيانات؛
يُسجَّل في سجل التدقيق بصمته فقط.

بديل من الحاسوب (بدون Android Studio):

```bash
npm run keystore -- --password 'كلمة-مرور-قوية'
# يكتب mda-upload.p12 (صلاحيات 600) ويطبع أوامر gh secret set جاهزة
```

بديل ثالث: أي جهاز فيه Java:

```bash
keytool -genkeypair -v -keystore mda-release.keystore -alias mda \
  -keyalg RSA -keysize 2048 -validity 10000 -storetype PKCS12 \
  -dname "CN=Dr. Abdulmajeed Abdullah Almakhedhi, O=MDA, C=YE"
base64 -w0 mda-release.keystore > keystore.b64   # انسخ محتواه
```

> ⚠️ المفتاح الذي يُنشأ أول مرة هو **المفتاح النهائي**. إن فُقد لن تستطيع إصدار تحديثات
> للأجهزة التي ثبّتت التطبيق — احفظ نسخة احتياطية في مكانين.

### ٢) أضف ٤ أسرار في المستودع
`Settings → Secrets and variables → Actions → New repository secret`

| الاسم | القيمة |
|---|---|
| `ANDROID_KEYSTORE_BASE64` | محتوى `keystore.b64` (سطر واحد طويل) |
| `ANDROID_KEYSTORE_PASSWORD` | كلمة مرور المخزن |
| `ANDROID_KEY_ALIAS` | `mda` |
| `ANDROID_KEY_PASSWORD` | كلمة مرور المفتاح (نفسها عادة) |

اختياري — المتغير `MDA_KEYSTORE_TYPE` (في تبويب **Variables**) فقط إذا كان الملف `JKS` قديمًا؛
الافتراضي `PKCS12`.

### ٣) شغّل الإصدار
```bash
git tag v1.1.0 && git push origin v1.1.0
```
النتيجة: Release باسم `MDA v1.1.0` يحتوي `app-release.apk` (و`.aab` عند اختياره).

---

## ملاحظات مهمة

- **تغيير المفتاح = تطبيق جديد**: الأجهزة التي عليها نسخة debug (v1.0.4 أو أقدم) يجب أن
  تحذف التطبيق أولًا ثم تثبّت النسخة الموقّعة، لأن بصمة التوقيع مختلفة.
- **Google Play**: استخدم `build_format=aab`. إن فعّلت *Play App Signing* فالملف المرفوع
  يُسمّى *upload key* ويبقى هذا المفتاح صالحًا.
- **التحقق من التوقيع** (يظهر تلقائيًا في سجل البناء):
  ```bash
  apksigner verify --print-certs app-release.apk
  ```
- **لا ترفع** `mda-release.keystore` ولا كلمة المرور إلى Git — المستودع عام.
  الملف موجود في `.gitignore` باسم `*.keystore` و`*.jks` (تحقّق قبل الإضافة).
- **الأسعار:** التوقيع لا علاقة له بالبيانات؛ الأسعار تبقى فارغة حتى تُدخل قيمًا حقيقية من لوحة التحكم.

---

## للبناء محليًا (اختياري)

```bash
./gradlew assembleRelease \
  -PversionName=1.1.0 -PversionCode=2
# مع متغيرات البيئة:
# MDA_KEYSTORE_PATH, MDA_KEYSTORE_TYPE=PKCS12, MDA_KEYSTORE_PASSWORD, MDA_KEY_ALIAS, MDA_KEY_PASSWORD
```
