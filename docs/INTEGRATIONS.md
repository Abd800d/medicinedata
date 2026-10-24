# التكاملات الاختيارية · Optional integrations

كل ما في هذا الملف **اختياري**: التطبيق يعمل كاملًا بدونه. لكن إذا أردت Google Sign-In،
أو قراءة صور الوصفات بالذكاء الاصطناعي، أو جلب صور المنتجات تلقائيًا — اتبع الخطوات التالية
ثم افتح لوحة التحكم ← **التكاملات** ← «اختبار الاتصال».

| التكامل | المتغيرات | يعمل بدونه؟ |
| --- | --- | --- |
| تسجيل الدخول بحساب Google | `GOOGLE_CLIENT_ID` | نعم — تسجيل بالبريد وكلمة المرور |
| الذكاء الاصطناعي (صور الوصفات + التعرّف على العلب) | `AI_API_KEY`، `AI_BASE_URL`، `AI_MODEL`، `AI_VISION_MODEL` | نعم — إدخال الوصفة نصيًا + بحث قاعدة البيانات |
| جلب صور المنتجات | `GOOGLE_CSE_KEY`، `GOOGLE_CSE_CX` | نعم — رفع الصور يدويًا + 27 صورة مرفقة |
| الباركود | — | يعمل دائمًا (EAN-13 داخلي) |

بعد أي تعديل على `.env`: **أعد تشغيل الخادم** (`npm start` أو `pm2 restart mda`).

---

## 1) Google Sign-In

1. [console.cloud.google.com](https://console.cloud.google.com) ← أنشئ مشروعًا (أو اختر مشروعًا).
2. **APIs & Services → OAuth consent screen**: النوع External، أضف اسم التطبيق
   `MedicineData`، وبريد الدعم، والنطاقات `openid`, `email`, `profile`.
3. **APIs & Services → Credentials → Create credentials → OAuth client ID → Web application**.
4. **Authorized JavaScript origins** (مهم — بدونها يفشل الزر):
   - `http://localhost:4000` (التطوير)
   - `https://نطاق-الإنتاج` (بدون `/` في النهاية)
   - عنوان المعاينة إن وجد
5. انسخ **Client ID** إلى `.env`:

```env
GOOGLE_CLIENT_ID=1234567890-abc123.apps.googleusercontent.com
```

6. أعد التشغيل، ثم افتح `/auth` — سيظهر زر «المتابعة باستخدام Google».
   تحقق من الخادم:

```bash
curl -s https://نطاقك/api/auth/config | jq .googleClientId
```

**كيف يعمل التحقق؟** الواجهة ترسل `credential` (ID token) إلى `POST /api/auth/google`،
والخادم يتحقق منه عبر `https://oauth2.googleapis.com/tokeninfo` ويطابق `aud` مع
`GOOGLE_CLIENT_ID` — لا تُقبل توكِنات صادرة لتطبيق آخر.

**ملاحظة أندرويد:** Google ترفض OAuth داخل WebView. لذلك في تطبيق الـ APK:
- إمّا استخدم تسجيل البريد/كلمة المرور (يعمل داخل WebView)،
- وإمّا أضف إضافة `@capacitor/google-auth` لاحقًا وأضف `GOOGLE_CLIENT_ID` نفسه إلى
  `android/app/src/main/res/values/strings.xml` مع SHA-1 لبصمة توقيع التطبيق. راجع
  `docs/ANDROID.md` ← «Google داخل التطبيق».

---

## 2) الذكاء الاصطناعي (قراءة الوصفات والصور)

يعمل مع أي مزوّد **متوافق مع واجهة OpenAI** (`/chat/completions` + `/models`).

| المزوّد | `AI_BASE_URL` | موديل رؤية مقترح |
| --- | --- | --- |
| OpenAI | `https://api.openai.com/v1` (افتراضي) | `gpt-4o-mini` |
| OpenRouter | `https://openrouter.ai/api/v1` | `google/gemini-2.0-flash-001` |
| Groq | `https://api.groq.com/openai/v1` | `llama-3.2-90b-vision-preview` |
| Together | `https://api.together.xyz/v1` | `meta-llama/Llama-Vision-Free` |
| DeepSeek | `https://api.deepseek.com/v1` | (نصي فقط — لا يدعم الصور) |
| Ollama محلي | `http://127.0.0.1:11434/v1` | `llama3.2-vision` |

```env
AI_API_KEY=sk-...
AI_BASE_URL=https://api.openai.com/v1
AI_MODEL=gpt-4o-mini
AI_VISION_MODEL=gpt-4o-mini
```

بعد إعادة التشغيل:

```bash
curl -s https://نطاقك/api/ai/status | jq
# { "enabled": true, "model": "...", "features": { "prescription": true, "pack_recognition": true } }
```

ثم جرّب: `/prescriptions` ← صوّر وصفة، و`/scan` ← صوّر علبة دواء.
اختبار مباشر من لوحة التحكم: **التكاملات ← الذكاء الاصطناعي ← اختبار الاتصال** (يجلب قائمة
الموديلات فعليًا من المزوّد).

**ما الذي يحدث بدون مفتاح؟** تبقى كل الصفحات تعمل: صفحة الوصفات تعرض حقل إدخال نصي
(`POST /api/ai/extract-text`) يحلّل الأدوية من قاعدة البيانات محليًا، وصفحة المسح تعرض
Google Lens + البحث بالاسم. لا أخطاء حمراء ولا شاشات فارغة.

---

## 3) جلب صور المنتجات (Google Custom Search)

1. [programmablesearchengine.google.com](https://programmablesearchengine.google.com) ←
   **Add** ← ابحث عن `medicine` ← فعّل **Image search** ← **Create**.
2. انسخ **Search engine ID (cx)** من إعدادات المحرك.
3. [console.cloud.google.com](https://console.cloud.google.com) ← **Enable APIs** ←
   `Custom Search API` ← **Create credentials → API key**.
4. `.env`:

```env
GOOGLE_CSE_KEY=AIza...
GOOGLE_CSE_CX=0123456789abcdef0
```

5. جرّب من التطبيق: **لوحة التحكم ← التكاملات ← جلب الصور ← اختبار الاتصال**.
   ثم **الاستيراد والصور ← جلب صور المنتجات** أو من الطرفية:

```bash
npm run images:fetch -- --limit 10 --dry   # عرض ما سيُجلب دون تنزيل
npm run images:fetch -- --limit 25         # تنزيل + إرفاق فعلي
```

كل صورة تُنزَّل إلى `data/uploads/products/` وتُسجَّل في `product_images` بمصدر
`web-cse`، والصورة الأولى تصبح صورة المنتج. **راجعها دائمًا** من صفحة المنتج: البحث الآلي
قد يعيد حجم علبة مختلفًا أو علبة لشركة أخرى.

البديل بدون أي مفتاح: 
- 27 صورة حقيقية مرفقة أصلًا في `public/seed-images/products/` (18 منتجًا) وتُطبَّق تلقائيًا
  عند `npm run seed` أو `npm run images:apply`.
- رفع دفعة صور من **الاستيراد والصور ← استيراد الصور** (اسم الملف = الباركود أو الاسم التجاري).

---

## 4) الباركود

كل منتج لديه باركود EAN-13 صالح للفحص الضوئي ضمن النطاق الذي تحتفظ به GS1 للاستخدام
الداخلي **200–299**، مولّد من الاسم التجاري + التركيز (ثابت حتى بعد إعادة البذر).

```bash
npm run barcodes              # يملأ المنتجات بلا باركود
npm run barcodes -- --all     # يعيد توليد الأكواد الداخلية
npm run barcodes -- --dry     # معاينة فقط
```

- الأكواد المولّدة مُعلَّمة `barcode_source='internal-ean13'` و`barcode_verified=0`،
  وتظهر في صفحة المنتج بعبارة «رمز داخلي للمتجر».
- لإدخال باركود الشركة الحقيقي: افتح المنتج في لوحة التحكم، الصق الرقم من العلبة، ثم
  فعّل «موثّق» (`barcode_verified=1`) — لن يُستبدل بعدها.
- القراءة: صفحة `/scan` ← «البحث بالباركود» تستخدم `BarcodeDetector` في المتصفح
  (Chrome أندرويد / تطبيق MDA)، وتسقط تلقائيًا إلى الإدخال اليدوي في المتصفحات التي لا تدعمه.
- واجهة برمجية: `GET /api/catalog/barcode/:code` (يقبل مسافات، UPC-A 12 رقمًا، أو 13 رقمًا).

---

## التحقق السريع من كل شيء

```bash
curl -s https://نطاقك/api/health | jq                     # الخادم
curl -s https://نطاقك/api/auth/config | jq                 # googleClientId + aiEnabled
curl -s https://نطاقك/api/ai/status | jq                   # الموديل والميزات
curl -s https://نطاقك/api/catalog/barcode/0202620725442 | jq '.[0].trade_name'   # Panadol
curl -s -X POST https://نطاقك/api/auth/login \
  -H 'content-type: application/json' \
  -d '{"email":"7a8b1d@gmail.com","password":"..."}' | jq .token
# ثم بلوحة الإدارة (Bearer token):
curl -s -X POST https://نطاقك/api/admin/integrations/test -H "authorization: Bearer $TOKEN" \
  -H 'content-type: application/json' -d '{"target":"ai"}' | jq
```
