# مرجع الـ API · REST reference

- الأصل: `https://<host>/api`
- الترميز: JSON (`Content-Type: application/json`) ما عدا رفع الملفات (`multipart/form-data`)
- المصادقة: `Authorization: Bearer <JWT>` (يُرجَّع من `/auth/login` أو `/auth/register`)
- الأخطاء: `{ "error": "رسالة" }` مع رمز HTTP مناسب (`400`, `401`, `403`, `404`, `413`, `429`, `5xx`)
- الصفحات: `{ data: [], total, page, pages }`
- **كتابة آمنة التكرار:** أضف `X-Idempotency-Key: <uuid>` لأي `POST/PUT/PATCH/DELETE` ليُعاد نفس الرد عند تكرار الطلب (7 أيام) مع ترويسة `X-Idempotent-Replay: 1`.
- **تعارض التعديل:** `PUT/DELETE /api/pharmacy/:id` يقبل `expected_updated_at`؛ عند اختلافه يُعاد **409** `{ code: 'CONFLICT', server: {...} }`. تجاوز صريح: `?force=1`.

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
| 🔓 GET | `/catalog/barcode/:code` | البحث بالباركود — يقبل مسافات، UPC-A (12 رقمًا) أو EAN-13 |
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
| 👤 DELETE | `/auth/me` | حذف الحساب نهائيًا: `{ confirm: "DELETE", password? }` (`400 confirm-required` · `403 wrong-password`/`owner-protected` · `409 last-admin`) |
| 👤 POST | `/auth/delete-account` | نفس العملية عبر POST (للجسر الأصلي) |

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
| 🔓 GET | `/ai/status` | `{ enabled, provider, base_url, model, vision_model, features, hint_ar }` |
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
| `GET /admin/images/status` | حالة الصور: `{ configured, with_real_photo, without_photo, next[] }` |
| `POST /admin/images/auto-fill` | جلب صور تلقائيًا `{ limit ≤ 50, dry_run }` — يحتاج Google CSE |
| `POST /admin/products/:id/image-search` | مرشحو صور للمنتج `{ q?, limit }` |
| `POST /admin/products/:id/attach-url` | تنزيل رابط صورة وإرفاقها بالمنتج |
| `GET /admin/integrations` | حالة Google/AI/CSE/الباركود + الخطوات |
| `POST /admin/integrations/test` | اختبار اتصال حقيقي `{ target: google\|ai\|cse }` |
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

## تحليل الوصفات بالذكاء الاصطناعي · Prescription AI (v1.2.0)

كل المسارات تحت `/api/rx` وتحتاج `Authorization: Bearer`. لا مفتاح AI يمرّ للعميل.

| الطريقة | المسار | الوصف |
| --- | --- | --- |
| GET | `/rx/status` | هل التحليل مفعّل + المزوّد/النموذج/إصدار التعليمات (بلا مفتاح أو عنوان) |
| GET | `/rx/consent` | حالة الموافقة + نصّها الحالي |
| POST | `/rx/consent` | `{ granted: true\|false }` — تسجيل/سحب الموافقة |
| POST | `/rx/analyze` | `multipart: image` أو `{ text }` + `keep_image=1` اختياري ⇒ 201 `{ id, analysis, ai }` · **428** بلا موافقة · **503** بلا مفتاح · **429** تجاوز المعدّل |
| POST | `/rx/:id/reanalyze` | إعادة التحليل (صورة محفوظة أو نص مصحّح) |
| GET | `/rx/:id` | التحليل + البنود + المراجعات + آخر نداءات النموذج (المالك أو الطاقم — تُسجَّل قراءة الطاقم) |
| PATCH | `/rx/:id/items/:itemId` | تصحيح يدوي (صيدلي/مدير): `name`, `matched_drug_id`, `dose`, `frequency`, `duration`, `strength`, `form`, `route` … |
| POST | `/rx/:id/confirm` | اعتماد المراجعة (صيدلي/مدير) — **409** ما دام بند `pending` إلا مع `accept_uncertain: true` |
| POST | `/rx/:id/reject` | رفض مع `notes` |
| DELETE | `/rx/:id` | محو صورة/بيانات المريض نهائيًا مع إبقاء أثر التدقيق |
| GET | `/rx/queue?status=` | طابور الصيدلي (بلا بيانات مريض في القائمة) |
| GET | `/rx/allergies` | حساسيات المستخدم + كتالوج العائلات (69 عائلة موثّقة) |
| POST | `/rx/allergies` | `{ code, label? }` — `code` عائلة (`penicillin`) أو مادة (`mol:paracetamol`) · 400 لكود مجهول |
| DELETE | `/rx/allergies/:id` | حذف حساسية |
| GET | `/rx/allergen-families` | كتالوج العائلات فقط (بدون مصادقة) |

**الاستجابة المختصرة للتحليل:**

```json
{ "id": 12, "needs_pharmacist": true,
  "analysis": {
    "readable": true, "summary": { "items": 3, "matched": 2, "needs_review": 2, "auto_accepted": 0, "requires_pharmacist": true },
    "items": [{ "line_no": 1, "name": "Augmentin", "strength": "1g", "confidence": 0.94,
                "field_confidence": { "name": 0.97, "dose": 0.9 },
                "uncertain_fields": [], "matched": { "drug_id": 143, "product_id": 311, "score": 0.95 },
                "alternatives": [ … ], "dossier": { "drug": { … }, "brands": [ … ] },
                "needs_review": false }],
    "flags": [{ "severity": "high", "type": "allergy_conflict",
                "detail_ar": "سجّلت حساسية من «البنسلينات»…",
                "plain_ar": "أنت سجّلت حساسية من عائلة دوائية…",
                "why_ar": "لأن كود ATC للدواء (J01CR02) يضعه ضمن البنسلينات…",
                "source": { "label": "MDA database", "updated_at": "2026-10-26 19:28:04" },
                "action_ar": "يحتاج إلى مراجعة الصيدلي/الطبيب قبل الصرف" }],
    "disclaimer_ar": "…", "source": { "model": "…", "prompt_version": "rx-1.0.0", "analysed_at": "…" } } }
```

### سجل التدقيق (مدير)

| الطريقة | المسار | الوصف |
| --- | --- | --- |
| GET | `/admin/audit?limit=&offset=&action=&target=&q=&from=&to=` | `{ data, total, limit, offset }` — آخر الأحداث مع `meta` (قبل/بعد التصحيح مثلًا) |
| GET | `/admin/audit/actions` | `{ actions:[{action,n,last_at}], targets:[{target_type,n}] }` — فهارس الفلترة الحقيقية |
| GET | `/admin/audit/verify` | فحص سلسلة التجزئة؛ `{ ok, entries, broken_at? }` |
| GET | `/admin/ai-stats?days=30` | جودة التحليل: نداءات/فشل/متوسط زمن لكل نموذج، حالة الوصفات، معدل التصحيح اليدوي، توزيع التنبيهات — **بلا أي نص مريض** |
| GET | `/admin/import/capabilities` | الصيغ والأوضاع والأعمدة المدعومة |
| POST | `/admin/import` | استيراد CSV/XLSX/JSON/XML/SQLite (`mode=upsert\|insert\|update`، `table`، `dryRun=1`) |
| GET | `/admin/datasets` | مجموعات التصدير المتاحة + عدد الصفوف |
| GET | `/admin/export/:dataset` | تصدير جدول (`format=csv\|json\|xlsx`) |
| GET | `/admin/export-all` | تصدير الكل (`format=xlsx\|json`) |
| GET | `/admin/backup/summary` | حجم القاعدة وعدد الجداول |
| POST | `/admin/backup` | نسخة مشفّرة (`{passphrase}` ≥ 8 أحرف) |
| POST | `/admin/backup/inspect` | قراءة رأس النسخة بلا كلمة مرور |
| POST | `/admin/backup/restore` | استعادة (`file` + `passphrase`) — تعيد بناء FTS5 |
| GET/POST | `/admin/products/:id/images`, `/admin/products/:id/images/reorder` | معرض الصور ومَن أضافها |
| PATCH/DELETE | `/admin/product-images/:id` | تعديل صورة/حذفها |

### مثال: تسجيل حساسية ثم تحليل

```bash
curl -X POST $API/rx/allergies -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' -d '{"code":"penicillin"}'
curl -X POST $API/rx/analyze -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' -d '{"text":"Augmentin 1g BID"}'
# → flags[] تحتوي allergy_conflict، وsummary.allergies_checked = 1
```

## أمثلة

```bash
API=https://mda.example.com/api

# تسجيل دخول
TOKEN=$(curl -s -X POST $API/auth/login -H 'Content-Type: application/json' \
  -d '{"email":"owner@example.com","password":"***"}' | jq -r .token)

# بحث
curl -s "$API/catalog/search?q=بنادول" | jq '.products[0]'

# تحليل وصفة نصية (المسار الجديد)
curl -s -X POST $API/rx/analyze -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"text":"Augmentin 1g BID\nPanadol 500mg TID\nConcor 5mg OD"}' | jq '.analysis.items[].matched.generic_name'

# اعتماد الصيدلي بعد التصحيح
curl -s -X POST $API/rx/12/confirm -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' -d '{"accept_uncertain":true,"notes":"راجعتها"}'

# إضافة صنف للصيدلية
curl -s -X POST $API/pharmacy -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"name":"Panadol 500 mg","quantity":12,"buy_price":1500,"sell_price":2000,"expiry_date":"2027-06-30"}'
```
