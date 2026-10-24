# مرجع الـ API · REST reference

- الأصل: `https://<host>/api`
- الترميز: JSON (`Content-Type: application/json`) ما عدا رفع الملفات (`multipart/form-data`)
- المصادقة: `Authorization: Bearer <JWT>` (يُرجَّع من `/auth/login` أو `/auth/register`)
- الأخطاء: `{ "error": "رسالة" }` مع رمز HTTP مناسب (`400`, `401`, `403`, `404`, `413`, `429`, `5xx`)
- الصفحات: `{ data: [], total, page, pages }`

الأعمدة: 🔓 عام · 👤 يتطلب دخول · 🛡️ مدير فقط

## النظام

| الطريقة | المسار | الوصف |
| --- | --- | --- |
| 🔓 GET | `/health` | فحص صحة الخادم |
| 🔓 GET | `/config` | إعدادات التطبيق العامة + الإحصاءات + تفعيل AI/Google |
| 🔓 GET | `/catalog/stats` | عدد الأجهزة/التصنيفات/الأدوية/المنتجات/الشركات/الوكلاء |
| 🔓 GET | `/catalog/offline-pack` | حزمة كاملة (أجهزة + أدوية + منتجات) للعمل دون اتصال |

## الكتالوج

| الطريقة | المسار | ملاحظات |
| --- | --- | --- |
| 🔓 GET | `/catalog/systems` | الأجهزة الـ18 مع عدد الأدوية |
| 🔓 GET | `/catalog/systems/:slug` | جهاز + تصنيفاته + أدويته |
| 🔓 GET | `/catalog/categories/:id` | تصنيف + أدويته |
| 🔓 GET | `/catalog/drugs` | `?q=&system_id=&category_id=&page=&limit=` (≤ 200) |
| 🔓 GET | `/catalog/drugs/:id` | مونوغراف + منتجاته التجارية |
| 🔓 GET | `/catalog/products` | `?q=&drug_id=&system_id=&manufacturer_id=&country=&page=` |
| 🔓 GET | `/catalog/products/:id` | منتج + صور + بدائل بنفس المادة الفعالة |
| 🔓 GET | `/catalog/search` | `?q=` → `{ drugs, products, suggestions, normalized }` (بحث ضبابي) |
| 🔓 GET | `/catalog/barcode/:code` | البحث بالباركود |
| 🔓 GET | `/catalog/manufacturers`, `/catalog/agents` | `?q=` |
| 🔓 GET | `/catalog/trending` | الأكثر مشاهدة/إضافة |
| 🔓 GET | `/catalog/product-image/:id.svg` | غلاف SVG مولّد (بديل الصورة) |
| 🔓 GET | `/catalog/drug-image/:id.svg` | غلاف SVG للدواء |

## المصادقة

| الطريقة | المسار | الوصف |
| --- | --- | --- |
| 🔓 POST | `/auth/register` | `{ name, email, password, phone?, city? }` → `{ token, user }` |
| 🔓 POST | `/auth/login` | `{ email, password }` → `{ token, user }` (محدود المحاولات) |
| 🔓 POST | `/auth/google` | `{ credential }` (Google ID Token) → `{ token, user }` |
| 👤 GET | `/auth/me` | بيانات الحساب الحالي |
| 👤 PATCH | `/auth/me` | `{ name?, phone?, city?, avatar?, lang? }` |
| 👤 POST | `/auth/change-password` | `{ current, next }` |

## الوصفات

| الطريقة | المسار | الوصف |
| --- | --- | --- |
| 👤 POST | `/prescriptions` | `multipart: image`, `lang` → يحفظ الصورة ويحلّلها (AI إن توفر) |
| 👤 GET | `/prescriptions` | وصفات المستخدم |
| 👤 GET | `/prescriptions/:id` | تفاصيل + نتيجة التحليل |
| 👤 POST | `/prescriptions/:id/analyze` | `{ text, lang }` → مطابقة محلية للأسماء (يعمل دائمًا) |
| 👤 DELETE | `/prescriptions/:id` | حذف |

نتيجة التحليل: `{ items: [{ name, strength, matched: { score, generic_name, generic_ar, drug_id, warnings, products[] } }], warnings, language }`.

## الذكاء الاصطناعي / المسح

| الطريقة | المسار | الوصف |
| --- | --- | --- |
| 🔓 GET | `/ai/status` | `{ enabled, provider }` |
| 🔓 POST | `/ai/ask` | `{ q, lang }` → `{ answer, sources, mode }` (محلي دائمًا، AI عند التفعيل) |
| 🔓 POST | `/ai/extract-text` | `{ text }` → استخراج أسماء الأدوية ومطابقتها |
| 🔓 GET | `/ai/drug-context/:q` | سياق دوائي من القاعدة |
| 🔓 POST | `/ai/identify-image` | `multipart: image` → تعرّف على العلبة (AI) أو رسالة واضحة بدونه |

## المجتمع والدعم

| الطريقة | المسار | الوصف |
| --- | --- | --- |
| 👤 GET | `/community/threads` | مواضيعي + العامة (المدير: الكل) |
| 👤 POST | `/community/threads` | `{ subject, body, category?, is_public? }` |
| 👤 GET | `/community/threads/:id` | الموضوع + الرسائل (صلاحية مُتحقَّقة) |
| 👤 POST | `/community/threads/:id/messages` | `{ body }`؛ ردود المدير تُعلَّم `is_staff` |
| 👤 PATCH | `/community/threads/:id` | `{ status?, is_public? }` |
| 👤 DELETE | `/community/threads/:id` | حذف الموضوع |
| 🔓 GET | `/community/jobs` | `?type=seeker|offer&city=&q=` |
| 👤 POST | `/community/jobs` | `{ type, title, description, specialty, city, phone, email }` |
| 👤 DELETE | `/community/jobs/:id` | حذف إعلاني |
| 👤 GET/POST/DELETE | `/community/favorites` | `{ target_type: 'drug'|'product', target_id }` |
| 🔓 GET | `/community/stats` | إحصاءات المجتمع |

## الصيدلية (خاصة بالمستخدم)

| الطريقة | المسار | الوصف |
| --- | --- | --- |
| 👤 GET | `/pharmacy` | `{ items, summary }` |
| 👤 GET | `/pharmacy/summary` | قيمة المخزون، النواقص، قرب الانتهاء، المنتهي |
| 👤 POST | `/pharmacy` | إضافة صنف (`name` مطلوب) |
| 👤 PUT | `/pharmacy/:id` | تعديل |
| 👤 PATCH | `/pharmacy/:id/adjust` | `{ delta }` تعديل سريع للكمية |
| 👤 DELETE | `/pharmacy/:id` | حذف |

## طلبات إضافة دواء

| الطريقة | المسار | الوصف |
| --- | --- | --- |
| 👤 POST | `/submissions` | `{ name_en, name_ar?, system_id?, company?, strength?, form?, country?, notes? }` (حد 10/يوم) |
| 👤 GET | `/submissions/mine` | طلباتي وحالتها |
| 🛡️ GET | `/submissions` | `?status=pending|approved|rejected` |
| 🛡️ PATCH | `/submissions/:id` | `{ status: 'approved' }` → ينشئ الدواء/المنتج في القاعدة |
| 🛡️ DELETE | `/submissions/:id` | حذف الطلب |

## الإدارة 🛡️

| المسار | الوصف |
| --- | --- |
| `GET /admin/stats` | إحصاءات شاملة |
| `GET /admin/diagnostics` | Node، المسارات، حالة المفاتيح، حجم القاعدة |
| `GET/POST/PUT/DELETE /admin/systems` | إدارة الأجهزة |
| `GET/POST/PUT/DELETE /admin/categories` | التصنيفات |
| `GET/POST/PUT/DELETE /admin/drugs` | الأدوية (`?q=&system_id=&category_id=&unverified=1`) |
| `GET/POST/PUT/DELETE /admin/products` | المنتجات (`?missing_image=1`) |
| `GET/POST /admin/products/:id/images` | صور المنتج |
| `POST /admin/products/:id/image-url` | ربط صورة برابط |
| `PUT /admin/products/:id/image` | تعيين الصورة الأساسية |
| `DELETE /admin/product-images/:imageId` | حذف صورة |
| `GET/POST/PUT/DELETE /admin/manufacturers`, `/admin/agents` | الشركات والوكلاء |
| `POST /admin/upload` | رفع صورة عامة → `{ url }` |
| `POST /admin/import-images` | رفع صور بالجملة (`multipart: images[]`، الاسم = باركود/معرّف) |
| `GET /admin/image-search?q=` | بحث صور (Google CSE) أو رابط بحث يدوي |
| `POST /admin/fetch-image` | تنزيل صورة من رابط وتعيينها (`{ url, product_id }`) |
| `POST /admin/import` | استيراد CSV/XLSX/JSON (`dryRun=1` للمعاينة) |
| `GET /admin/imports`, `/admin/imports/:id` | سجل الاستيراد والتفاصيل |
| `POST /admin/import-json` | استيراد JSON مباشر (≤ 50k صف) |
| `GET /admin/users` + `PATCH/DELETE /admin/users/:id` + `POST /admin/users/:id/password` | إدارة المستخدمين |
| `GET /admin/threads`, `GET /admin/threads/:id`, `POST /admin/threads/:id/reply`, `PATCH/DELETE` | رسائل الدعم |
| `GET/PATCH/DELETE /admin/jobs` | إدارة الوظائف |
| `GET /admin/prescriptions` | وصفات المستخدمين |
| `GET/PUT /admin/settings` | الإعدادات |
| `POST /admin/rebuild-search` | إعادة بناء فهرس FTS |
| `POST /admin/verify` | تعليم منتجات كموثّقة (`{ ids: [] }`) |
| `GET /admin/export` | نسخة JSON كاملة (يلزم Bearer) |

## أمثلة

```bash
API=https://mda.example.com/api

# تسجيل دخول
TOKEN=$(curl -s -X POST $API/auth/login -H 'Content-Type: application/json' \
  -d '{"email":"owner@example.com","password":"***"}' | jq -r .token)

# بحث
curl -s "$API/catalog/search?q=بنادول" | jq '.products[0]'

# تحليل وصفة نصية
curl -s -X POST $API/prescriptions/1/analyze -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"text":"Augmentin 1g BID\nPanadol 500mg TID\nConcor 5mg OD"}' | jq '.items[].matched.generic_name'

# إضافة صنف للصيدلية
curl -s -X POST $API/pharmacy -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"name":"Panadol 500 mg","quantity":12,"buy_price":1500,"sell_price":2000,"expiry_date":"2027-06-30"}'
```
