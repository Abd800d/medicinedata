# متغيّرات البيئة · Environment variables

كل القيم اختيارية — التطبيق يعمل بدون أي منها، لكن الإنتاج **يجب** أن يضبط `JWT_SECRET` و`ADMIN_PASSWORD`.
تُقرأ من `.env` في جذر المشروع (عبر `dotenv`) أو من بيئة التشغيل.

## الخادم

| المتغير | الافتراضي | الوصف |
| --- | --- | --- |
| `PORT` | `4000` | منفذ HTTP |
| `HOST` | `0.0.0.0` | عنوان الاستماع (اتركه `0.0.0.0` داخل الحاويات) |
| `NODE_ENV` | — | `production` في `npm start` (يخدّم `dist/` ويضغط الاستجابات). لا تكتبه في `.env` أثناء التطوير لأنه يُربك Vite. |

## التخزين

| المتغير | الافتراضي | الوصف |
| --- | --- | --- |
| `DATA_DIR` | `./data` | مجلد البيانات (قاعدة + رفع) |
| `DB_FILE` | `$DATA_DIR/mda.db` | مسار قاعدة SQLite |
| `UPLOAD_DIR` | `$DATA_DIR/uploads` | مجلد صور المنتجات والوصفات والمسح |

## الأمان والمصادقة

| المتغير | الافتراضي | الوصف |
| --- | --- | --- |
| `JWT_SECRET` | قيمة عشوائية مؤقتة | مفتاح توقيع الجلسات — **إلزامي في الإنتاج** (96 حرفًا عشوائيًا) |
| `OWNER_EMAIL` | `7a8b1d@gmail.com` | بريد المالك؛ يُرقّى تلقائيًا إلى `admin` عند أول تشغيل |
| `ADMIN_EMAIL` | = `OWNER_EMAIL` | بريد المدير الافتراضي (بديل) |
| `ADMIN_PASSWORD` | `MDAadmin@2026` | كلمة مرور المدير الأولى — **غيّرها فورًا في الإنتاج** |
| `GOOGLE_CLIENT_ID` | فارغ | معرّف OAuth لتسجيل الدخول بجوجل (يظهر الزر فقط عند ضبطه) |

## البحث عن الصور

| المتغير | الافتراضي | الوصف |
| --- | --- | --- |
| `GOOGLE_CSE_KEY` | فارغ | مفتاح Google Programmable Search (Custom Search API) |
| `GOOGLE_CSE_CX` | فارغ | معرّف محرك البحث (يجب تفعيل «البحث عن الصور») |

بدون هذين المفتاحين يظل رفع الصور يدويًا ولصق رابط الصورة متاحًا من الإدارة.

## الباركود

| المتغير | الافتراضي | الوصف |
| --- | --- | --- |
| `BARCODE_PREFIX` | `20` | أول رقمين من الباركود الداخلي؛ اتركه داخل نطاق GS1 المحجوز 20–29 |

الأكواد المولّدة تُعلَّم `internal-ean13` و`barcode_verified=0`، وتُستبدل بباركود الشركة عند إدخاله يدويًا. التفاصيل في `docs/INTEGRATIONS.md`.

## ملف الصور المرفقة

الصور الحقيقية للمنتجات موجودة في `public/seed-images/products/` وتُخدَم على `/seed-images/products/…`.
تُطبَّق على قاعدة البيانات عبر `npm run images:apply` (يُستدعى تلقائيًا من `npm run seed`).
الصور التي تُرفع أو تُنزَّل لاحقًا تذهب إلى `UPLOAD_DIR/products/` وتُخدَم على `/uploads/products/…`.

## الذكاء الاصطناعي (اختياري)

متوافق مع أي مزوّد يدعم `POST /chat/completions` بصيغة OpenAI (OpenAI, Azure OpenAI, Groq, OpenRouter, vLLM محلي…).

| المتغير | الافتراضي | الوصف |
| --- | --- | --- |
| `AI_PROVIDER` | `openai` (أو `custom` عند ضبط `AI_BASE_URL`) | `groq` \| `openai` \| `gemini` \| `openrouter` \| `together` \| `deepseek` \| `ollama` |
| `AI_API_KEY` | فارغ | المفتاح. `OPENAI_API_KEY` مقبول كبديل |
| `AI_BASE_URL` | حسب المزوّد | عنوان الـ API (يلغي عنوان المزوّد الجاهز) |
| `AI_MODEL` | حسب المزوّد | نموذج المحادثة (Groq: `llama-3.3-70b-versatile`) |
| `AI_VISION_MODEL` | حسب المزوّد | نموذج قراءة الصور (Groq: `meta-llama/llama-4-scout-17b-16e-instruct`) |
| `AI_TIMEOUT_MS` | `45000` | مهلة كل محاولة قبل الإلغاء |
| `AI_RETRIES` | `2` | عدد إعادات المحاولة (0–4) بمهلة أسّية + jitter |

> بدون مفتاح: مساعد الدواء ومحلّل الوصفات وماسح الصور يعملون **محليًا** من قاعدة البيانات (مطابقة نصية ذكية بدون توليد)، وتظهر رسالة واضحة بأن قراءة الصور تحتاج مفتاحًا.

القيم الافتراضية لمزوّدين جاهزين، واختبار الاتصال خطوة واحدة من **لوحة التحكم ← التكاملات ← اختبار الاتصال** (أو `POST /api/admin/integrations/test`). الدليل الكامل: `docs/INTEGRATIONS.md`.

## التواصل والدعم

| المتغير | الافتراضي | الوصف |
| --- | --- | --- |
| `WHATSAPP_NUMBER` | `+967781733795` | رقم الواتساب الظاهر في «عن التطبيق» وروابط الدعم |
| `SUPPORT_EMAIL` | `7a8b1d@gmail.com` | بريد الدعم |

## الواجهة (Vite — تُقرأ وقت البناء)

| المتغير | الوصف |
| --- | --- |
| `VITE_API_BASE` | عنوان الـ API الكامل عند بناء الواجهة لتطبيق أندرويد أو استضافة منفصلة (مثال `https://api.example.com`). اتركه فارغًا لو Vite يخدم الواجهة مع API على نفس الأصل. يُمكن أيضًا ضبطه لاحقًا من `localStorage['mda.apiBase']`. |

مثال إنتاج آمن:

```ini
PORT=4000
HOST=0.0.0.0
DATA_DIR=/var/lib/mda
JWT_SECRET=$(openssl rand -hex 48)
OWNER_EMAIL=owner@example.com
ADMIN_PASSWORD=<كلمة-مرور-قوية>
GOOGLE_CLIENT_ID=xxxxxxxx.apps.googleusercontent.com
AI_API_KEY=sk-...
WHATSAPP_NUMBER=+9677xxxxxxx
SUPPORT_EMAIL=support@example.com
```
