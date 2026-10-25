# الاستيراد الجماعي · Bulk import

يدعم النظام **CSV** و**Excel (XLSX)** و**JSON**، مع **معاينة (dry-run)** قبل التنفيذ وسجل لكل عملية.
الواجهة: `لوحة الإدارة → الاستيراد والصور → استيراد قاعدة البيانات`.

## 0) قالب جاهز للأسعار الحقيقية

ملف [`data/templates/prices-template.csv`](../data/templates/prices-template.csv) يحتوي **493 منتجًا**
بعمود `price` **فارغ** — املأ ما تعرفه من أسعار حقيقية فقط، ثم استورده من لوحة الإدارة.
التفاصيل في [`data/templates/README.md`](../data/templates/README.md).

> الأسعار لا تُولَّد ولا تُقدَّر: أي خلية فارغة تُبقي السعر `null` ويُخفى السعر في التطبيق.

## 1) الأعمدة

الأسماء غير حسّاسة لحالة الأحرف، وتقبل المرادفات العربية والإنجليزية (`ALIASES` في `server/lib/importer.js`).

| العمود | مرادفات | إلزامي | ملاحظات |
| --- | --- | --- | --- |
| `generic_name` | generic, INN, scientific_name, الاسم العلمي, المادة الفعالة | ✔︎ | الاسم العلمي؛ عليه يتم الربط |
| `generic_ar` | name_ar, الاسم العربي | — | |
| `trade_name` | brand, product, الاسم التجاري, المنتج | — | بدونه يُسجَّل الدواء فقط بلا منتج تجاري |
| `trade_name_ar` | brand_ar | — | |
| `strength` | dose, concentration, التركيز | — | `500 mg`, `125 mg/5 ml` |
| `dosage_form` | form, الشكل الصيدلاني | — | Tablet / Syrup / Injection… |
| `pack_size` | pack, size, العبوة | — | `20 tablets` |
| `manufacturer` | company, الشركة المصنعة | — | تُنشأ الشركة تلقائيًا إن لم توجد |
| `manufacturer_country` | company_country | — | |
| `agent` | distributor, supplier, الوكيل, الموزع | — | وكيل/موزّع يمني |
| `country` | market, الدولة | — | سوق المنتج |
| `barcode` | ean, gtin, الباركود | — | فريد عند وجوده |
| `price` | retail_price, السعر | — | رقم |
| `currency` | العملة | — | الافتراضي `YER` |
| `image_url` | image, photo, رابط الصورة | — | رابط مباشر أو `/uploads/...` |
| `system` | body_system, الجهاز | — | اسم الجهاز عربي/إنجليزي أو `slug` |
| `category` | class, group, التصنيف | — | يُنشأ داخل الجهاز إن لزم |
| `drug_class` | pharmacologic_class | — | |
| `atc_code` | atc | — | |
| `indications_ar`, `indications_en` | uses, الاستخدامات | — | |
| `dosage_adult`, `dosage_child` | adult_dose, child_dose | — | |
| `warnings`, `side_effects`, `contraindications` | — | — | |
| `description_ar`, `description_en` | — | — | |
| `verified` | موثق | — | `1/0`, `true/false` |

> يمكن تحديد «الجهاز الافتراضي» من واجهة الاستيراد لكل الصفوف التي لا تحتوي عمود `system`، وخيار «اعتبار كل الصفوف موثّقة».

## 2) CSV

- UTF-8 (مع أو بدون BOM)، فواصل `,`، حقول مقتبسة `"..."` مع `""` للاقتباس الحرفي.
- السطر الأول رؤوس أعمدة إلزاميًا.
- الملفات الكبيرة تُقرأ سطرًا بسطر (streaming) وتُعالج على دفعات.
- **لا يُدرَج سطر الرؤوس كبيانات**؛ ويُتجاهل أي سطر فارغ.

مثال:

```csv
generic_name,generic_ar,trade_name,strength,dosage_form,manufacturer,country,agent,barcode,price,system,category,verified
amoxicillin-clavulanate,أموكسيسيلين-كلافولانيك,Augmentin,1 g,Tablet,GSK,United Kingdom,Ard Al-Ganatain,5001234567890,4500,respiratory,penicillins,1
paracetamol,باراسيتامول,Panadol,500 mg,Tablet,GSK,United Kingdom,Ard Al-Ganatain,5001234567891,1200,central-nervous,painkillers,1
```

## 3) Excel

نفس الأعمدة في الورقة الأولى (`Sheet1`). الحقول الرقمية تُقرأ كأرقام.

## 4) JSON

مصفوفة كائنات بنفس أسماء الأعمدة:

```json
[
  { "generic_name": "metformin", "generic_ar": "ميتفورمين", "trade_name": "Glucophage",
    "strength": "500 mg", "dosage_form": "Tablet", "manufacturer": "Merck", "country": "France",
    "system": "endocrine", "category": "antidiabetics", "verified": true }
]
```

## 5) طلب الـ API

```bash
# معاينة
curl -X POST https://mda.example.com/api/admin/import \
  -H "Authorization: Bearer $TOKEN" \
  -F file=@drugs.csv -F dryRun=1

# تنفيذ
curl -X POST https://mda.example.com/api/admin/import \
  -H "Authorization: Bearer $TOKEN" \
  -F file=@drugs.csv -F system_id=5 -F verify=1
# → 202 { "id": 12, "status": "processing" }

curl -H "Authorization: Bearer $TOKEN" https://mda.example.com/api/admin/imports/12
```

الاستيراد لا يمسّ المستخدمين أو الوصفات. إعادة استيراد نفس الملف لا تُكرّر المنتجات (المفتاح: دواء + اسم تجاري + تركيز).

## 6) الصور

- **صور بالجملة:** سمِّ الملفات بالباركود أو بمعرّف المنتج (`5001234567890.jpg` أو `1234.webp`) وارفعها من «استيراد الصور».
- **صورة واحدة:** من صفحة المنتج في الإدارة → رفع/لصق رابط/جلب من Google CSE.
- بعد الاستيراد اضغط **«مزامنة البحث»** لبناء فهرس FTS من جديد.
