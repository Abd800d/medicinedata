# استكشاف أخطاء التشغيل المحلي · Localhost troubleshooting

كل ما في هذه الصفحة **مُلتقط من طرفية حقيقية** على هذا المستودع (Node 22.22.3، npm 10.9.8، Linux x64).
لا يوجد خطأ مكتوب من الذاكرة: كل سطر خطأ أدناه نُسخ كما ظهر.

## ابدأ من هنا: `npm run doctor`

قبل أي شيء شغّل الفاحص:

```bash
npm run doctor
```

يفحص بالترتيب: إصدار Node، وجود `node_modules`، ربط `better-sqlite3` الأصلي (بإدخال/قراءة حقيقية داخل `:memory:`)،
وجود `.env` ومفاتيحه، قابلية الكتابة في `data/`، احتلال المنفذين 4000 و5173 (ومن الذي يحتلّهما)،
قاعدة الوكيل `/api` في `vite.config.ts`، وجود `src/lib/config.tsx` و`src/lib/auth.tsx`،
ثم **يُقلع خادمًا حقيقيًا على منفذ شاغر** ويستدعي `/api/health` و`/api/config` مع تعطيل Google والذكاء الاصطناعي،
ليثبت أن الخادم يخدم HTTP فعلًا. الرمز الخارجي `0` = كل شيء سليم، `1` = يوجد مانع.

مثال ناجح (مختصر):

```
✓ Node 22.22.3 (package.json wants ">=20")
✓ node_modules present (478 entries)
✓ better-sqlite3 native binding
   better-sqlite3 13.0.3 — in-memory insert/select round-trip OK
✓ .env is absent — this is allowed
✓ data directory is writable
   database: data/mda.db (1.1 MB, created 2026-10-27)
✓ port 4000 is free
✓ port 5173 is free
✓ Vite proxies /api to the API
   target: http://127.0.0.1:4000  (dev server: 5173)
✓ application source files are present
✓ the API really boots and serves HTTP
   spawned: node server/index.js (PORT=4310)
   GET /api/health → HTTP 200 {"ok":true,"app":"MDA","time":"..."}
   GET /api/config → drugs=225 products=493 ai_enabled=false google=false
   ready in 594 ms (no Google, no AI configured)

All good. Start both servers with:  npm run dev
```

## التشغيل الصحيح في أربعة أوامر

```bash
npm install          # 677 حزمة، ~12 ثانية
cp .env.example .env # اختياري: التطبيق يعمل بدونه
npm run dev          # API على 4000 + Vite على 5173 معًا
# ثم افتح http://localhost:5173
```

`npm run dev` يشغّل `concurrently` فيُقلع الاثنان معًا، وأي واحد يخرج يُوقف الآخر (`-k`):

```
[WEB]   VITE v5.4.21  ready in 259 ms
[WEB]   ➜  Local:   http://localhost:5173/
[API] [MDA] API ready on http://0.0.0.0:4000  (db: /…/data/mda.db)
```

## النتائج المرجعية (كلها مُلتقطة الآن)

| الفحص | الأمر | النتيجة الفعلية |
| --- | --- | --- |
| صحة الخادم | `curl -sS http://localhost:4000/api/health` | `{"ok":true,"app":"MDA","time":"2026-10-27T22:15:28.388Z"}` — **HTTP 200** في 7.6 ms |
| الواجهة | `curl -sS http://localhost:5173/` | **HTTP 200**، 7863 بايت، `<html lang="ar" dir="rtl" class="dark…">` |
| الوكيل | `curl -sS http://localhost:5173/api/health` | **HTTP 200** `{"ok":true,…}` في 0.179 ثانية |
| Node | `node -v` | `v22.22.3` (المطلوب `>=20`، مُعلن في `package.json → engines`) |
| SQLite | `require('better-sqlite3')` + `CREATE/INSERT/SELECT` | `13.0.3` يعمل على `:memory:` |

**الاستنتاج:** إعدادات المستودع سليمة. الأعطال الحقيقية التي يمكن أن تصادفها هي الأربعة أدناه فقط، وكلها بيئية (machine-side) لا برمجية.

## الأعطال الأربعة — خطأ ← سبب ← إصلاح

### 1) المنفذ مستخدم من نسخة سابقة — `EADDRINUSE`

**الخطأ كما ظهر فعلًا** عند تشغيل خادم ثانٍ على 4000:

```
node:events:497
      throw er; // Unhandled 'error' event
      ^

Error: listen EADDRINUSE: address already in use 0.0.0.0:4000
    at Server.setupListenHandle [as _listen2] (node:net:1940:16)
```

**السبب:** نسخة من الخادم ما زالت تعمل (شغّلت `npm run dev` سابقًا وأغلقت النافذة، أو `npm run dev:api &` بقي في الخلفية).
Node لا يستطيع ربط المنفذ مرتين، فيخرج العملية قبل أن يخدم أي طلب — ولهذا `localhost:4000` «لا يستجيب».

**الإصلاح:**

```bash
# macOS / Linux
lsof -i :4000
kill <PID>
# Windows
netstat -ano | findstr :4000
taskkill /PID <PID> /F
```

ثم `npm run dev` من جديد. `npm run doctor` يخبرك أيضًا هل الذي يحتلّ 4000 هو **خادمك الصحيح** (يجيب `/api/health` بـ 200) أم برنامج آخر.

### 2) Vite على 5173 مشغول — `Port 5173 is already in use`

**الخطأ:**

```
error when starting dev server:
Error: Port 5173 is already in use
    at Server.onError (…/vite/dist/node/chunks/dep-BK3b2jBa.js:45596:18)
```

السبب أن `vite.config.ts` يستخدم `strictPort: true` — قرار مقصود: بدل أن يقفز Vite إلى 5174 ويجعلك تفتح منفذًا لا يعرفه أحد، يفشل بوضوح. الإصلاح: أوقف النسخة الأخرى، أو `npx vite --port 5174`.

### 3) تشغيل الواجهة قبل الخادم — `ECONNREFUSED` في طرفية Vite

إذا شغّلت `npm run dev:web` وحدها (أو انهار الخادم بعد الإقلاع) تفتح الصفحة عادي لكن كل `/api/...` يفشل.
**الخطأ الحقيقي** في طرفية Vite وفي استجابة المتصفح:

```
10:13:55 PM [vite] http proxy error: /api/health
Error: connect ECONNREFUSED 127.0.0.1:4000
----------------  ← والطلب يُرجِع HTTP 500 بجسم فارغ
```

```
$ curl -sS -o /dev/null -w 'HTTP %{http_code}\n' http://localhost:5173/api/health
HTTP 500
```

**السبب:** الوكيل يعمل، لكن لا شيء يستمع على 4000. هذا هو **السبب الأكثر شيوعًا** لجملة «localhost connection is failing»: الصفحة تُحمّل، لكن التطبيق يعرض وضع عدم الاتصال (كتالوج محلي فقط، لا تسجيل دخول ولا ذكاء اصطناعي) لأن `apiUrl()` لا يجد خادمًا.
**الإصلاح:** شغّل الاثنين معًا `npm run dev`، أو `npm run dev:api` في نافذة و`npm run dev:web` في أخرى.

### 4) الاعتماديات غير مثبتة أو ربط SQLite غير متوافق

على نسخة مستنسخة حديثًا لا يوجد `node_modules`. **الخطأ** عندها:

```
Error: Cannot find module 'better-sqlite3'
Require stack:
- /…/scripts/doctor.mjs
```

وبعد `npm install` مع إصدار Node مختلف عن الذي بُني له الملف الأصلي:

```
Error: The module '…/better_sqlite3.node' was compiled against a different Node.js version using
NODE_MODULE_VERSION 127. This version of Node.js requires NODE_MODULE_VERSION 115.
```

**الإصلاح:**

```bash
npm install                        # ينزّل prebuilt لنسخة Node الحالية
npm rebuild better-sqlite3         # إن غيّرت Node بعد التثبيت
```

`npm run doctor` يميّز بين الحالتين ويكتب الأمر الصحيح حرفيًا. على نظام بلا prebuilt مطابق:
`npm rebuild better-sqlite3 --build-from-source` (يحتاج `build-essential` + `python3`).

### 5) حفظ مفتاح الذكاء الاصطناعي يفشل بـ `NO_SECRET`

**الخطأ:**

```
PUT /api/admin/ai → HTTP 400
{"error":"NO_SECRET","message":"الخادم بلا JWT_SECRET — لا يمكن تشفير المفتاح / Server has no JWT_SECRET"}
```

**السبب (قبل v1.10.2):** `server/lib/secrets.js` كان يقرأ `process.env.JWT_SECRET` فقط، بينما `server/auth.js`
يقبل بديلًا محفوظًا في `settings.jwt_secret` ويولّده عند أول إقلاع. فخادم بلا متغيّر بيئة يسجّل الدخول
بنجاح لكنه يرفض تشفير المفتاح.
**الإصلاح (v1.10.2):** يُشتق مفتاح التشفير من نفس مادة `auth.js` (متغير البيئة ← السر المحفوظ ← توليد وحفظ تلقائي).
**إن كنت على إصدار أقدم:** اضبط `JWT_SECRET` على الخادم مرة واحدة، أو حدّث إلى 1.10.2.
**التحقق:** `npm run doctor` ← سطر «AI can be enabled from the app» يجب أن يطبع `can_store=true`.

### 6) اختبار المفتاح يفشل بـ `model` رغم صحة المفتاح

```
POST /api/admin/ai/test → {"ok":false,"kind":"model","status":404,...}
```

**السبب:** الموديل مسحوب لدى المزوّد. Groq أوقفت `llama-3.3-70b-versatile` و`llama-3.1-8b-instant` في
2026-08-16، وGoogle أوقفت `gemini-2.0-flash` في 2026-06-01.
**الإصلاح:** من نفس الشاشة اختر موديلًا من الأزرار (`openai/gpt-oss-120b` أو `gemini-3.6-flash`)، أو اضغط
**«استخدم البديل الآن»** إن ظهر التنبيه الأحمر.

## وأخيرًا: `.env` ليس سببًا لأي عطل

`.env` **غائب** في هذه النسخة، ومع ذلك:

- الخادم يقلع ويُنشئ القاعدة تلقائيًا (18 جهازًا، 137 تصنيفًا، 225 دواءً، 493 منتجًا).
- `JWT_SECRET` الغائب لا يعطّل شيئًا: `server/auth.js` يجرّب `process.env.JWT_SECRET` ثم `settings.jwt_secret` ثم يولّد `crypto.randomBytes(48)` **ويحفظه في القاعدة**، فتبقى الجلسات صالحة بعد إعادة التشغيل.
- `OWNER_EMAIL` / `ADMIN_EMAIL` الغائبان يعنيان المالك الافتراضي `7a8b1d@gmail.com` وكلمة المرور من `ADMIN_PASSWORD` أو الافتراضية `MDAadmin@2026`.
- Google وAI معطّلان تلقائيًا عند غياب مفاتيحهما، والتطبيق يعمل كاملًا بدونهما (`ai_enabled=false google=false` في استجابة `/api/config`).

ضع `.env` فقط لتثبيت القيم: `cp .env.example .env`.

## مسار الإعدادات الذي يخطئ فيه كثيرون

| مطلوب | الموجود فعلًا |
| --- | --- |
| إعدادات التطبيق | `src/lib/config.tsx` (وليس `config.ts`) |
| المصادقة | `src/lib/auth.tsx` (وليس `auth.ts`) |
| عميل HTTP | `src/lib/api.ts` |
| نقطة إقلاع Express | `server/index.js` |
| المنفذ | `PORT` (افتراضي 4000) — والوكيل في `vite.config.ts → server.proxy['/api'].target` |
