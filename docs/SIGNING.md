# التوقيع الرسمي (Release Signing) لـ APK / AAB

التطبيق في الإصدارات السابقة كان **debug-signed** — يعمل ويُثبَّت، لكنه ليس نسخة إصدار حقيقية
(لا يصلح لمتجر Google Play، ولا يمكن تحديثه لاحقًا بمفتاح مختلف).

هذا الملف يشرح كيف يُبنى إصدار **موقّع رسميًا** من داخل GitHub Actions، دون Android Studio.

---

## كيف يعمل الآن (بدون أي إعداد إضافي)

| الحدث | ما يُبنى |
|---|---|
| push وسم `v*` **مع** وجود السر `ANDROID_KEYSTORE_BASE64` | `app-release.apk` موقّع ✅ + `app-release.aab` (الافتراضي) |
| push وسم `v*` **بدون** السر | `app-debug.apk` (سلوك قديم، للتوزيع المباشر) |
| Actions → Android APK → `build_type=debug` | `app-debug.apk` |
| Actions → Android APK → `build_type=release` بدون السر | ❌ يفشل برسالة واضحة (حماية من توقيع debug خاطئ) |
| Actions → Android APK → `build_type=release` + `build_format=aab` | `app-release.aab` فقط (لـGoogle Play) |
| Actions → `build_format=both` | الاثنان معًا |

الملفات تُرفع تلقائيًا في صفحة **Releases** عند الوسم، وتظهر أيضًا كـartifact باسم `mda-apk`.

---

## الإعداد (مرة واحدة، دقيقتان)

### ١) احصل على keystore
إما من مجلد `mda-signing/` الذي سلّمك إياه الوكيل (`mda-release.keystore` + كلمة المرور)،
أو أنشئ واحدًا بنفسك على أي جهاز فيه Java:

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
