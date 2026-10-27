# الدخول بحساب Google من الجوال (v1.9.0)

## لماذا تغيّر الطريقة

Google **يرفض** تسجيل الدخول من داخل WebView مدمج (خطأ `disallowed_useragent`). التطبيق يعمل داخل
WebView، لذلك كان زر «الدخول بحساب Google» إمّا لا يظهر أو يفشل. الطريقة المدعومة رسميًا — وهي أيضًا
التي تستخدم **حساب Google المسجَّل على الجهاز** بلا كلمة مرور — هي فتح **متصفح النظام**.

```
التطبيق ──▶ يفتح Chrome (Custom Tab)
            GET /api/auth/google/start?redirect=com.mda.medicinedata://auth
              └─ 302 إلى accounts.google.com مع PKCE (S256) + state
Google ──▶ GET /api/auth/google/callback?code&state
              └─ الخادم يبدّل code بـ id_token (الـ secret يبقى على الخادم)
                 يُنشئ/يربط الحساب ثم يعيد التوجيه إلى:
                 com.mda.medicinedata://auth?token=<jwt>   ← داخل التطبيق
                 https://<host>/auth?google_token=<jwt>    ← على الويب
التطبيق ──▶ @capacitor/app يلتقط الرابط → تخزين JWT → إعادة تحميل
```

## ما تحتاجه مرة واحدة (٣ دقائق، من الجوال)

1. افتح `console.cloud.google.com` بحسابك.
2. أنشئ مشروعًا (أو اختر مشروعًا) ← **APIs & Services ← OAuth consent screen**.
   - User type: **External** ← اسم التطبيق `MDA MedicineData` ← بريد الدعم ← حفظ.
   - في **Test users** أضف بريدك (يكفي في وضع Testing).
3. **Credentials ← Create credentials ← OAuth client ID**
   - Application type: **Web application**
   - **Authorized redirect URIs** — الصق **بالضبط**:
     ```
     https://medicinedata-1.onrender.com/api/auth/google/callback
     ```
     (التطبيق يعرض نفس الرابط في شاشة الإعدادات بزر نسخ — استخدمه بدل الكتابة اليدوية.)
4. انسخ **Client ID** و **Client Secret**.
5. في التطبيق: **المزيد ← الإدارة ← التكاملات ← «الدخول بحساب Google (من الجوال)»**
   ← الصق الاثنين ← **حفظ وتفعيل**.
6. اخرج من الحساب ثم اضغط **الدخول بحساب Google** — سيُفتح Chrome، اختر حسابك، وسيعود تلقائيًا.

> لا حاجة لتعديل Render ولا لإعادة النشر: المفتاح يُحفظ في قاعدة البيانات **مشفّرًا**
> (AES-256-GCM بمفتاح مشتق من `JWT_SECRET`) ويُقرأ عند كل طلب.

## ما يحدث على الخادم

| المسار | الوظيفة |
|---|---|
| `GET /api/auth/config` | يعرض `google_oauth: true` عندما يتوفر Client ID + Secret |
| `GET /api/auth/google/start` | يُنشئ `state` + `code_verifier` (صلاحية 10 دقائق، استخدام واحد) ويحوّل إلى Google |
| `GET /api/auth/google/callback` | يتحقق من `state`، يبدّل `code`، يتحقق من `id_token` (audience + بريد موثّق)، ينشئ/يربط المستخدم، يصدر JWT |
| `GET/PUT /api/admin/google-oauth` | لوحة الإدارة: قراءة الحالة/حفظ الاعتماد (المدير فقط) |

- **ربط الحساب:** إن وُجد مستخدم بنفس البريد يُربط بـ`google_id` بدل إنشاء حساب مكرر.
- **حماية:** `state` مزوّر أو منتهٍ ⇒ `400` بلا أي تسجيل دخول. لا تُقبل إعادة توجيه إلى نطاق خارجي.
- **لا يُعاد السر إلى أي عميل أبدًا** — الواجهة ترى `has_secret` وقناعًا فقط.

## جدول الأخطاء

| ما تراه | السبب | الحل |
|---|---|---|
| الزر لا يظهر | لم يُحفظ Client Secret بعد | أعد الخطوة 5 (يجب أن تظهر شارة «مُفعّل») |
| `redirect_uri_mismatch` | الرابط في Google لا يطابق رابط الخادم حرفيًا | انسخه من شاشة الإعدادات والصقه في Google Cloud |
| `access_blocked` / `403` | تطبيق OAuth في وضع Testing وبريدك ليس من Test users | أضف بريدك في OAuth consent screen ← Test users |
| يعود إلى التطبيق بلا دخول | لم تُثبَّت نسخة تحتوي `@capacitor/app` (قبل 1.9.0) | ثبّت v1.9.0 أو أحدث |
| يعمل على الويب ويفشل في التطبيق | `Authorized JavaScript origins` ناقص (لتدفق الويب فقط) | أضف نطاق الخادم هناك أيضًا |
| `Google rejected the code` | انتهت صلاحية `state` (أكثر من 10 دقائق بين الفتح والرجوع) | أعد المحاولة من التطبيق |

## على الويب

نفس المسار: اضغط الزر ← يفتح تبويبًا ← تعود إلى `/auth?google_token=…` فيسجّل الدخول تلقائيًا.
وإذا كان لديك **Client ID فقط** بلا سر، يظل زر Google Identity Services القديم يعمل على الويب
داخل الصفحة (لا يعمل في التطبيق — وهذا سبب التغيير).
