# نموذج البيانات · Data model

SQLite واحدة في `data/mda.db` (WAL، مفاتيح أجنبية مفعّلة، FTS5 trigram).

```
systems ─┬─ categories ─┬─ drugs ─┬─ products ─┬─ product_images
         │              │         │            └─ (manufacturer، agent, country, strength, form, barcode, price)
         │              │         └─ (generic_name/ar, class, indications, dosage, contraindications,
         │              │             side_effects, warnings, interactions, pregnancy, mechanism,
         │              │             half_life, storage, atc_code, synonyms, verified, source)
         │              └─ (name_ar/en, description, sort)
         └─ (slug, name_ar/en, description, icon, color)

users ─┬─ favorites (drug_id)
       ├─ prescriptions (image_url, extracted_text, analysis_json, status)
       ├─ pharmacy_items (product_id?, name, strength, form, quantity, unit, buy_price, sell_price,
       │                   expiry_date, batch, supplier, notes)
       ├─ drug_submissions (name_en/ar, system_id, company, strength, form, country, notes,
       │                    status, reviewed_by/at, created_drug_id/product_id)
       └─ threads ── messages

manufacturers · agents · jobs · imports · settings
```

## الجداول الأساسية

| الجدول | الغرض |
| --- | --- |
| `systems` | 18 جهازًا حيويًا (`slug`, الاسم بالعربية والإنجليزية، أيقونة، لون) |
| `categories` | التصنيفات/المجموعات الدوائية داخل كل جهاز (135) |
| `drugs` | المونوغراف العلمي (195) — الاسم العلمي، الاستخدامات، الجرعات، الآثار، التداخلات… |
| `products` | المنتجات التجارية (426) — العلامة، التركيز، الشكل، الشركة، الدولة، الوكيل، الباركود، السعر |
| `product_images` | صور إضافية لكل منتج (`source`: upload/google/generated) |
| `manufacturers` | 95 شركة مصنّعة (الدولة) |
| `agents` | 24 وكيلًا/موزّعًا يمنيًا (هاتف، بريد، موقع) |
| `users` | الحسابات (bcrypt، الدور `user/admin`، حالة التفعيل) |
| `favorites` | المفضلة لكل مستخدم |
| `prescriptions` | وصفات مرفوعة + نتيجة التحليل (JSON) |
| `pharmacy_items` | مخزون الصيدلية الخاص بكل مستخدم |
| `drug_submissions` | طلبات إضافة دواء من المستخدمين ومراجعتها |
| `threads` / `messages` | رسائل المجتمع والدعم (عامة `/` خاصة، ردود الموظفين) |
| `jobs` | وظائف وطلبات توظيف (`seeker` / `employer`) |
| `imports` | سجل عمليات الاستيراد (عدد النجاح/الفشل + سجل الأخطاء) |
| `settings` | إعدادات التطبيق (نصوص، مفاتيح، صيانة…) |
| `drugs_fts` | فهرس FTS5 على `search_norm` للأدوية والمنتجات |

## البحث

- يُخزَّن `search_norm` مُطبَّعًا (حروف صغيرة، توحيد الألف/الهمزة/الياء/التاء المربوطة، إزالة التشكيل والأحرف الخاصة).
- فهرس FTS5 (trigram) يُستخدم للتصفية السريعة، ثم يُعاد ترتيب النتائج بدرجة تشابه نصية:
  - مطابقة كاملة / بادئة (≥ 4 أحرف)
  - احتواء (≥ 5 أحرف)
  - مسافة تحرير محسوبة (تحمّل الأخطاء الإملائية)
- لغة عربية وإنجليزية في نفس الفهرس.
- بعد أي تعديل جماعي: **الإدارة → الإعدادات → مزامنة البحث** (`POST /api/admin/rebuild-search`).

## المصادر (بيانات مرجعية حقيقية)

بيانات الكتالوج مبنية على مراجع صيدلانية معتمدة وأدلة شركات يمنية منشورة، منها:
هيئات الأدوية اليمنية (YEDCO، Shaphaco، Saba Pharma، YE Pharma، Global Pharma، Arab Pharmaceutical Co.)،
ووكلاء ومستوردون (Ard Al-Ganatain، Al-Nahdi، Meditech، Al-Samhari، Rahban Intl، Al-Ribaat، Twin Pharma،
Morshell/Al-Subbary، Easy Cure، Leadership Pharma)، إضافة إلى بيانات الشركات العالمية (GSK، Pfizer، Novartis،
Sanofi، AstraZeneca، Merck، Julphar، Hikma، Amman، Tabuk…).

> البيانات المرجعية للتعرّف الدوائي، وليست بديلًا عن رأي الطبيب أو الصيدلي. راجع إخلاء المسؤولية داخل التطبيق.

## الصيانة

```bash
sqlite3 data/mda.db ".tables"
sqlite3 data/mda.db "SELECT COUNT(*) FROM drugs;"
sqlite3 data/mda.db "VACUUM;"            # بعد حذف كبير
npm run seed                              # إضافة/تحديث idempotent
npm run seed:reset                        # تصفير الكتالوج وإعادة بنائه
```
