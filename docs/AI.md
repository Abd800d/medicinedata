# طبقة الذكاء الاصطناعي · AI layer (v1.2.0)

> «النموذج يقرأ، والصيدلي يقرر.» لا يوجد مسار في هذا النظام يسمح للنموذج باعتماد دواء أو جرعة أو تغيير وصفة.

## 1. البنية

```
التطبيق (Android/Web)
   │  لا مفاتيح، لا عناوين مزوّدين
   ▼
POST /api/rx/analyze  ──►  authRequired  ──►  consent gate (428)
   │                          │
   │                          ├─ multer (12MB, images only)
   │                          ▼
   │                    lib/ai/prescription.js
   │                      analyzePrescription()
   │                        ├─ lib/ai/prompts.js  (تعليمات ثابتة)
   │                        ├─ lib/ai/service.js  (النقل/المهلة/الإعادة/السجل)
   │                        ├─ validateAnalysis() (شكل صارم + ثقة لكل حقل)
   │                        └─ enrich()           (مطابقة + dossier + flags)
   ▼
SQLite: prescriptions · prescription_items · ai_runs · prescription_reviews · audit_log
```

| ملف | المسؤولية | لا يفعل |
| --- | --- | --- |
| `server/lib/ai/service.js` | مزوّد واحد بواجهة OpenAI-compatible، مهلة، إعادة محاولة، تسجيل | لا يعرف الوصفات ولا يفسّر مخرجات |
| `server/lib/ai/prompts.js` | نصوص التعليمات والمخطط (data لا code) | لا يجمع طلبات ديناميكيًا |
| `server/lib/ai/prescription.js` | تحقق + إثراء + تجميع | لا يتصل بالشبكة مباشرة |
| `server/lib/ai/match.js` | مطابقة الاسم مع قاعدة MDA + الجرعات + التنبيهات | لا يخترع دواءً غير موجود |
| `server/lib/audit.js` | سجل تجزئة متسلسل + الموافقات | لا يحذف شيئًا |

## 2. المزوّدون

متغيرات البيئة على الخادم فقط:

| المتغيّر | القيمة | ملاحظة |
| --- | --- | --- |
| `AI_PROVIDER` | `groq` \| `openai` \| `gemini` \| `openrouter` \| `together` \| `deepseek` \| `ollama` | Groq هو الافتراضي المجاني |
| `AI_API_KEY` | المفتاح | **لا يُرسل للعميل أبدًا** |
| `AI_BASE_URL` | اختياري | لاستخدام مزوّد مخصّص/compatible |
| `AI_MODEL` | `llama-3.3-70b-versatile` | نصوص |
| `AI_VISION_MODEL` | `meta-llama/llama-4-scout-17b-16e-instruct` | صور |
| `AI_TIMEOUT_MS` | `45000` | مهلة كل محاولة |
| `AI_RETRIES` | `2` | إعادة بمهلة أسّية + jitter |

- `GET /api/rx/status` يعيد `configured`, `provider`, `model`, `vision_model`, `prompt_version` فقط — لا مفتاح، لا عنوان URL.
- لو لم يُضبط المفتاح: كل المسارات تُرجع `503 AI_NOT_CONFIGURED` مع رسالة عربية واضحة، وبقية التطبيق يعمل طبيعيًا.

## 3. العقد

```js
complete({ messages, model, vision, json, maxTokens, temperature, timeoutMs, retries })
→ { text, json, meta: { provider, model, latency_ms, request_id, attempt, usage } }
```

- `extractJson()` يستخرج أول كائن JSON متوازن ويتسامح مع أسوار ```json.
- كل نداء يُسجَّل في `ai_runs` (المزوّد، النموذج، الزمن، الإصدار، النجاح/الفشل، الاستهلاك) — **بلا نصّ المريض**.

## 4. المخطط والثقة

`PRESCRIPTION_SCHEMA` (في `prompts.js`) يفرض:

```json
{ "readable": bool, "image_quality": "good|fair|poor", "language": "ar|en|mixed",
  "patient": {"name": string|null, "confidence": 0..1}, "doctor": {...}, "clinic": {...}, "date": {...},
  "items": [{ "raw_text", "name", "name_ar", "strength", "form", "dose", "frequency",
              "duration", "route", "instructions", "confidence", "uncertain_fields": [] }],
  "notes": string|null, "warnings": [string] }
```

قواعد التحقق في `validateAnalysis()`:

1. أي حقل فارغ/`"غير محدد"`/`"n/a"` ⇒ `null` وثقته **0** (لا يبدو واثقًا وهو فارغ).
2. `FIELD_THRESHOLD = 0.55`: أي حقل ثقته أقل يُضاف إلى `uncertain_fields` تلقائيًا.
3. `ITEM_THRESHOLD = 0.7`: البند يُعلَّم `needs_review`.
4. `auto_accepted = 0` **دائمًا** و`requires_pharmacist = true`.
5. الحد الأقصى 25 بندًا في التحليل الواحد.

## 5. الإثراء من قاعدة MDA

`enrich()` يضيف لكل بند:

- `matched` (أفضل مرشّح: منتج تجاري أو مادة فعالة) + `alternatives` (حتى 6 مرشّحين).
- `dossier`: المادة الفعالة، الفئة، ATC، دواعي الاستعمال، الجرعة المرجعية، موانع الاستعمال، التحذيرات، التداخلات، الحمل، **المصدر وتاريخ آخر تحديث**.
- `dose_calc`: حساب الجرعة اليومية بالملغ فقط عند وجود رقمين مقروءين (جرعة + تركيز).
- `review_flags` من بيانات محفوظة فقط:
  | النوع | متى | الصياغة |
  | --- | --- | --- |
  | `duplicate_ingredient` | نفس المادة الفعالة في أكثر من سطر | «يحتاج إلى مراجعة الصيدلي» |
  | `dose_above_max` | المحسوب > المرجع × 1.05 | «يحتاج إلى مراجعة الصيدلي/الطبيب» |
  | `possible_interaction` | اسم الدواء الآخر مذكور في حقل التداخلات | «يحتاج إلى مراجعة الصيدلي» |
  | `unmatched_items` | بند بلا مطابقة | تصحيح يدوي مطلوب |
  | `data_missing` | لا تداخلات ولا تحذيرات محفوظة | «غياب التحذير لا يعني السلامة» |

لا يوجد أي تنبيه مُخترع: إن لم تكن المعلومة في القاعدة، لا يُقال شيء.

## 6. دورة المراجعة

```
pending_review ──(صيدلي: تصحيح بند)──► البند corrected
      │
      ├──(POST confirm, وكل البنود غير pending)──► reviewed + prescription_reviews(approved)
      ├──(POST confirm مع accept_uncertain)──────► reviewed (موثّق أنه تجاوز بشري صريح)
      └──(POST reject + سبب)─────────────────────► rejected
```

- التأكيد محجوب `409` ما دام أي بند `pending` — لا يمكن «الموافقة الشاملة» بالخطأ.
- كل تصحيح يخزّن `corrected_by` و`corrected_at`، وكل الإجراءات تُكتب في `audit_log` بسلسلة تجزئة.

## 7. الاختبارات

```bash
# خادم وهمي يحاكي مزوّدًا متوافقًا مع OpenAI، بدون أي مفتاح حقيقي
node scripts/mock-ai.mjs 4111
AI_PROVIDER=openai AI_API_KEY=test AI_BASE_URL=http://127.0.0.1:4111/v1 node server/index.js
npm run test:rx           # 28 تحققًا: موافقة، تحليل، تصحيح، تأكيد، تدقيق، حذف
npm run smoke -- /prescriptions   # عرض الصفحة في jsdom
```

يغطي `test:rx`: بوابة الموافقة (428)، استخراج البنود، منع الاعتماد التلقائي، وجود ثقة لكل حقل، صياغة التنبيهات، حفظ التصحيح، حجب التأكيد (409)، التأكيد الصريح، إعادة التحليل، سلامة سلسلة التدقيق، ومحو بيانات المريض.

## 8. حدود معلنة

- **لا OCR على الجهاز**: بدون إنترنت لا تحليل (يظهر تنبيه). السبب: لا نموذج مضمّن في APK.
- **لا تحسين صور على الخادم** في هذه النسخة: التحسين (قص/دوران/تباين) مسؤولية الكاميرا والمستخدم الآن؛ معالجة الصور المضغوطة/المائلة تبدأ في v1.5.0.
- النماذج المجانية قد تفشل أو تتأخر؛ لذلك مهلة + إعادة محاولة + رسالة قابلة للفهم + إمكانية الإدخال اليدوي.
- لا يوجد ضمان على دقة النموذج؛ الضمان الوحيد هو أن **القرار لا يُتخذ آليًا**.
