/*
 * Allergy families derived from the ATC classification.
 *
 * Why ATC and not free text: an alert that says "this may be an allergy" is only
 * defensible when the family is a documented pharmacological group, not a guess
 * from a brand name. Each family below maps to an ATC stem (WHO ATC/DDD index)
 * plus a small explicit name list where the ATC stem alone is not enough.
 *
 * Cross-reactivity notes are deliberately conservative: we tell the pharmacist
 * which family matched and that the decision is theirs.
 */

export const ALLERGEN_FAMILIES = [
  { code: 'penicillin', label_ar: 'البنسلينات', label_en: 'Penicillins', atc: ['J01C'], note_ar: 'تشمل أموكسيسيلين وأمبيسيلين وكل ما يبدأ بـ J01C.' },
  { code: 'cephalosporin', label_ar: 'السيفالوسبورينات', label_en: 'Cephalosporins', atc: ['J01D'], note_ar: 'قد يوجد تفاعل متصالب مع البنسلين عند بعض المرضى — القرار للصيدلي.' },
  { code: 'carbapenem', label_ar: 'الكاربابينيمات', label_en: 'Carbapenems', atc: ['J01DH'], note_ar: 'مجموعة بيتا-لاكتام.' },
  { code: 'monobactam', label_ar: 'المونوباكتام', label_en: 'Monobactams', atc: ['J01DF'], note_ar: 'أزتريونام.' },
  { code: 'macrolide', label_ar: 'الماكروليدات', label_en: 'Macrolides', atc: ['J01FA'], note_ar: 'أزيثرومايسين وكلاريثرومايسين.' },
  { code: 'quinolone', label_ar: 'الكينولونات', label_en: 'Quinolones', atc: ['J01M', 'S01AE', 'S02AA'], names: ['ciprofloxacin-ear', 'ofloxacin-eye'], note_ar: 'سيبروفلوكساسين وليفوفلوكساسين، وتشمل القطرات الموضعية.' },
  { code: 'tetracycline', label_ar: 'التتراسيكلينات', label_en: 'Tetracyclines', atc: ['J01A'], note_ar: 'دوكسيسيكلين وتتراسيكلين.' },
  { code: 'aminoglycoside', label_ar: 'الأمينوغليكوزيدات', label_en: 'Aminoglycosides', atc: ['J01G'], names: ['tobramycin-eye', 'tobramycin'], note_ar: 'جنتاميسين وأميكاسين وتوبراميسين (حتى قطرة العين).' },
  { code: 'sulfonamide', label_ar: 'السلفوناميدات', label_en: 'Sulfonamides', atc: ['J01E', 'J01EC', 'C03CA01'], note_ar: 'تشمل كوتريموكسازول وبعض مدرّات العروة (فوروسيميد يحوي زمرة سلفوناميد).' },
  { code: 'nitroimidazole', label_ar: 'النتروإيميدازول', label_en: 'Nitroimidazoles', atc: ['J01XD', 'P01AB'], note_ar: 'ميترونيدازول وتينيدازول.' },
  { code: 'rifamycin', label_ar: 'الريفاميسينات', label_en: 'Rifamycins', atc: ['J04AB', 'A07AA'], note_ar: 'ريفامبيسين وريفاكسيمين.' },
  { code: 'antifungal_azole', label_ar: 'مضادات الفطريات الآزولية', label_en: 'Azole antifungals', atc: ['J02AC'], note_ar: 'فلوكونازول وإيتراكونازول.' },
  { code: 'nsaid', label_ar: 'مضادات الالتهاب غير الستيرويدية (NSAIDs)', label_en: 'NSAIDs', atc: ['M01A', 'N02BA'], names: ['aspirin', 'ibuprofen', 'diclofenac', 'naproxen', 'mefenamic-acid', 'ketoprofen', 'indomethacin', 'celecoxib', 'meloxicam', 'piroxicam'], note_ar: 'الحساسية هنا غالبًا «زمرة دوائية» لا مادة واحدة — تشمل الأسبرين.' },
  { code: 'paracetamol', label_ar: 'الباراسيتامول (أسيتامينوفين)', label_en: 'Paracetamol', atc: ['N02BE'], note_ar: 'حساسية حقيقية نادرة لكنها تُسجَّل.' },
  { code: 'opioid', label_ar: 'الأفيونيات', label_en: 'Opioids', atc: ['N02AA', 'N02AB', 'N02AX', 'R05DA'], note_ar: 'مورفين/كودايين وترامادول.' },
  { code: 'triptan', label_ar: 'التريبتانات', label_en: 'Triptans', atc: ['N02CC'], note_ar: 'سوماتريبتان.' },
  { code: 'benzodiazepine', label_ar: 'البنزوديازيبينات', label_en: 'Benzodiazepines', atc: ['N05BA', 'N05CD', 'N03AE'], note_ar: 'ديازيبام وكلونازيبام.' },
  { code: 'ssri', label_ar: 'مضادات الاكتئاب SSRI', label_en: 'SSRIs', atc: ['N06AB'], note_ar: 'سيرترالين وفلوكستين.' },
  { code: 'tricyclic', label_ar: 'مضادات الاكتئاب ثلاثية الحلقة', label_en: 'Tricyclics', atc: ['N06AA'], note_ar: 'أميتريبتيلين.' },
  { code: 'antiepileptic', label_ar: 'مضادات الصرع', label_en: 'Antiepileptics', atc: ['N03A'], note_ar: 'كاربامازيبين وفالبروات — بعضها يسبب حساسية جلدية خطيرة.' },
  { code: 'antipsychotic', label_ar: 'مضادات الذهان', label_en: 'Antipsychotics', atc: ['N05A'], note_ar: 'هالوبيريدول وأولانزابين.' },
  { code: 'antihistamine', label_ar: 'مضادات الهيستامين', label_en: 'Antihistamines', atc: ['R06A'], note_ar: 'سيتريزين ولوراتادين.' },
  { code: 'corticosteroid', label_ar: 'الكورتيكوستيرويدات', label_en: 'Corticosteroids', atc: ['H02', 'R03BA', 'R03AK', 'D07A', 'S01BA'], note_ar: 'بريدنيزولون وبوديزونيد — وفي تركيبات الربو يُعدّ الكورتيكوستيرويد المكوّن المسؤول عن الحساسية.' },
  { code: 'beta_blocker', label_ar: 'حاصرات بيتا', label_en: 'Beta blockers', atc: ['C07'], note_ar: 'بيسوبرولول وميتوبرولول.' },
  { code: 'ace_inhibitor', label_ar: 'مثبطات الإنزيم المحوّل (ACEI)', label_en: 'ACE inhibitors', atc: ['C09A', 'C09B'], note_ar: 'إينالابريل وليزينوبريل — تسبب كحة وحساسية وعائية.' },
  { code: 'arb', label_ar: 'حاصرات مستقبلات الأنجيوتنسين (ARB)', label_en: 'ARBs', atc: ['C09C', 'C09D'], note_ar: 'لوسارتان وفالسارتان.' },
  { code: 'statin', label_ar: 'الستاتينات', label_en: 'Statins', atc: ['C10AA', 'C10BA'], note_ar: 'أتورفاستاتين وسيمفاستاتين.' },
  { code: 'loop_diuretic', label_ar: 'مدرّات العروة', label_en: 'Loop diuretics', atc: ['C03CA'], note_ar: 'فوروسيميد — يحوي زمرة سلفوناميد.' },
  { code: 'thiazide', label_ar: 'مدرّات الثيازيد', label_en: 'Thiazides', atc: ['C03AA', 'C03AB', 'C03EA'], note_ar: 'هيدروكلوروثيازيد — سلفوناميد أيضًا.' },
  { code: 'insulin', label_ar: 'الأنسولين', label_en: 'Insulins', atc: ['A10A'], note_ar: 'أنسولينات بشرية/مماثلة.' },
  { code: 'sulfonylurea', label_ar: 'السلفونيل يوريا', label_en: 'Sulfonylureas', atc: ['A10BB'], note_ar: 'غليكلازيد وغليمبريد — حساسية سلفوناميد محتملة.' },
  { code: 'biguanide', label_ar: 'الميتفورمين', label_en: 'Metformin', atc: ['A10BA'], note_ar: '' },
  { code: 'ppi', label_ar: 'مثبطات مضخة البروتون', label_en: 'Proton pump inhibitors', atc: ['A02BC'], note_ar: 'أوميبرازول وبانتوبرازول.' },
  { code: 'h2_blocker', label_ar: 'حاصرات H2', label_en: 'H2 blockers', atc: ['A02BA'], note_ar: 'فاموتيدين ورانيتيدين.' },
  { code: 'iron', label_ar: 'مستحضرات الحديد', label_en: 'Iron preparations', atc: ['B03A'], note_ar: 'سلفات الحديد.' },
  { code: 'heparin', label_ar: 'الهيبارين', label_en: 'Heparins', atc: ['B01AB'], note_ar: 'هيبارين وإينوكسابارين.' },
  { code: 'vitamin_b12', label_ar: 'فيتامين B12', label_en: 'Vitamin B12', atc: ['B03BA'], note_ar: '' },
  { code: 'thyroid_hormone', label_ar: 'هرمونات الغدة الدرقية', label_en: 'Thyroid hormones', atc: ['H03AA'], note_ar: 'ليفوثيروكسين.' },
  { code: 'bisphosphonate', label_ar: 'البيسفوسفونات', label_en: 'Bisphosphonates', atc: ['M05BA'], note_ar: 'ألندرونات.' },
  { code: 'tamsulosin', label_ar: 'حاصرات ألفا البولية', label_en: 'Alpha blockers (urology)', atc: ['G04CA'], note_ar: 'تامسولوسين.' },
  { code: 'pde5', label_ar: 'مثبطات PDE5', label_en: 'PDE5 inhibitors', atc: ['G04BE'], note_ar: 'سيلدينافيل.' },
  { code: 'anticoagulant_doac', label_ar: 'مضادات التخثر الفموية الحديثة', label_en: 'DOACs', atc: ['B01AE', 'B01AF'], note_ar: 'ريفاروكسابان وأبيكسابان.' },
  { code: 'aminoquinoline', label_ar: 'مضادات الملاريا', label_en: 'Antimalarials', atc: ['P01B'], note_ar: 'كلوروكين وهيدروكسي كلوروكين.' },
  { code: 'antiviral_nucleoside', label_ar: 'مضادات الفيروسات النيوكليوزيدية', label_en: 'Nucleoside antivirals', atc: ['J05AB', 'J05AF'], note_ar: 'أسيكلوفير وتينوفوفير.' },
  { code: 'other_antibiotic', label_ar: 'مضادات حيوية أخرى', label_en: 'Other antibacterials', atc: ['J01X', 'J01XX', 'J01XB'], note_ar: 'نيتروفورانتوين وفوسفوميسين وبوليميكسين.' },
  { code: 'antifungal_other', label_ar: 'مضادات فطريات أخرى', label_en: 'Other antifungals', atc: ['J02A', 'D01A'], note_ar: 'نيستاتين وأمفوتريسين.' },
  { code: 'ccb', label_ar: 'حاصرات قنوات الكالسيوم', label_en: 'Calcium channel blockers', atc: ['C08'], note_ar: 'أملوديبين ونيفيديبين.' },
  { code: 'antiarrhythmic', label_ar: 'مضادات اضطراب النظم', label_en: 'Antiarrhythmics', atc: ['C01B'], note_ar: 'أميودارون — حساسية جلدية/رئوية موثّقة.' },
  { code: 'cardiac_glycoside', label_ar: 'الديجوكسين', label_en: 'Cardiac glycosides', atc: ['C01AA'], note_ar: '' },
  { code: 'nitrate', label_ar: 'النترات', label_en: 'Nitrates', atc: ['C01DA'], note_ar: 'نيتروغليسرين — صداع شائع وليس حساسية.' },
  { code: 'anticoagulant_vka', label_ar: 'الوارفارين', label_en: 'Warfarin (VKA)', atc: ['B01AA'], note_ar: '' },
  { code: 'antiplatelet', label_ar: 'مضادات الصفائح', label_en: 'Antiplatelets', atc: ['B01AC'], note_ar: 'كلوبيدوغريل — والأسبرين يُسجَّل ضمن NSAID أيضًا.' },
  { code: 'aldosterone_antagonist', label_ar: 'مضادات الألدوستيرون', label_en: 'Aldosterone antagonists', atc: ['C03DA'], note_ar: 'سبيرونولاكتون.' },
  { code: 'saba', label_ar: 'موسّعات الشعب قصيرة المفعول', label_en: 'Short-acting bronchodilators', atc: ['R03AC'], note_ar: 'سالبوتامول.' },
  { code: 'lama', label_ar: 'مضادات الكولين الاستنشاقية', label_en: 'Inhaled anticholinergics', atc: ['R03BB'], note_ar: 'إبراتروبيوم وتيوتروبيوم.' },
  { code: 'leukotriene', label_ar: 'مضادات الليوكوترين', label_en: 'Leukotriene modifiers', atc: ['R03DC'], note_ar: 'مونتيلوكاست — تُسجَّل له تفاعلات فرط حساسية.' },
  { code: 'mucolytic', label_ar: 'المذيب المخاطي', label_en: 'Mucolytics', atc: ['R05CB'], note_ar: 'أمbroكسول وأسيتيل سيستئين.' },
  { code: 'antiemetic', label_ar: 'مضادات القيء', label_en: 'Antiemetics', atc: ['A04AA', 'A03FA'], note_ar: 'أوندانسيترون وميتوكلوبراميد.' },
  { code: 'dopaminergic', label_ar: 'أدوية باركنسون', label_en: 'Dopaminergic agents', atc: ['N04B'], note_ar: 'ليفودوبا-كاربيدوبا.' },
  { code: 'cholinesterase_inhibitor', label_ar: 'مثبطات الكولين إستراز', label_en: 'Cholinesterase inhibitors', atc: ['N06DA'], note_ar: 'دونيبيزيل.' },
  { code: 'local_anesthetic', label_ar: 'المخدّرات الموضعية (أميدات)', label_en: 'Local anesthetics (amides)', atc: ['N01BB'], note_ar: 'ليدوكايين — حساسية موضعية حقيقية.' },
  { code: 'allopurinol', label_ar: 'الألوبيورينول', label_en: 'Allopurinol', atc: ['M04AA'], note_ar: 'من أشهر أسباب متلازمة ستيفنز-جونسون — أي طفح يستدعي إيقافًا فوريًا ومراجعة طبيب.' },
  { code: 'thioamide', label_ar: 'مضادات الغدة الدرقية (ثايوأميد)', label_en: 'Thionamides', atc: ['H03BB'], note_ar: 'كاربيمازول وميثيمازول — قد تسبب انخفاض كريات الدم المحببة.' },
  { code: 'salicylate', label_ar: 'الساليسبلات (ميسالازين)', label_en: 'Salicylates', atc: ['A07EC'], note_ar: 'ميسالازين — ترتبط بحساسية الأسبرين عند بعض المرضى.' },
  { code: 'lincosamide', label_ar: 'اللينكوساميدات', label_en: 'Lincosamides', atc: ['J01FF'], note_ar: 'كليندامايسين.' },
  { code: 'retinoid', label_ar: 'الريتينويدات', label_en: 'Retinoids', atc: ['D10'], note_ar: 'أيزوتريتينوين وأدابالين.' },
  { code: 'contrast_media', label_ar: 'وسائط التباين (الأشعة)', label_en: 'Contrast media', atc: ['V08'], note_ar: 'أيومهيكسول — تفاعلات فرط حساسية موثّقة، وتحتاج تحضيرًا طبيًا مسبقًا.' },
  { code: 'biologic', label_ar: 'الأدوية البيولوجية', label_en: 'Biologics', atc: ['L04'], note_ar: 'أداليموماب — تفاعلات حساسية عند الحقن.' },
  { code: 'vaccine', label_ar: 'اللقاحات', label_en: 'Vaccines', atc: ['J07'], note_ar: 'حساسية مكوّنات اللقاح (مثل الألبيومين أو المضادات الحياتية الأثرية).' },
];

const byCode = new Map(ALLERGEN_FAMILIES.map((f) => [f.code, f]));

export const ALLERGEN_CODES = new Set(byCode.keys());

export const familyLabel = (code) => {
  const f = byCode.get(code);
  return f ? f.label_ar : code;
};

/**
 * Which documented families does this drug belong to?
 * Matching is on the ATC stem (5 chars, dropping the last 2 of a 7-char code),
 * plus an explicit generic-name list where the class matters more than the code.
 * Returns [] when we cannot prove a family — no guessing.
 */
export function familiesForDrug(drug = {}) {
  const atc = String(drug.atc_code || '').toUpperCase().replace(/\s+/g, '');
  const name = String(drug.generic_name || '').toLowerCase();
  const out = new Set();
  if (!atc && !name) return [];
  for (const fam of ALLERGEN_FAMILIES) {
    const hitAtc = atc && (fam.atc || []).some((stem) => {
      const s = stem.toUpperCase();
      return atc === s || atc.startsWith(s);
    });
    const hitName = (fam.names || []).includes(name);
    if (hitAtc || hitName) out.add(fam.code);
  }
  return [...out];
}

/** A drug is always its own allergen as a molecule; cross-reactivity comes from families. */
export const moleculeKey = (genericName) => {
  const n = String(genericName || '').toLowerCase().trim().replace(/\s+/g, '-');
  return n ? `mol:${n}` : null;
};

/** Every allergy key that should match this drug (molecule first, then families). */
export function allergyKeysForDrug(drug = {}) {
  return [moleculeKey(drug.generic_name), ...familiesForDrug(drug)].filter(Boolean);
}

/** Describe the families of a drug for the UI (code + Arabic label + why). */
export function describeFamilies(codes = []) {
  return codes.map((code) => {
    const f = byCode.get(code);
    return { code, label_ar: f?.label_ar || code, label_en: f?.label_en || code, note_ar: f?.note_ar || '' };
  });
}

/** Public list for the allergy picker — grouped, no patient data. */
export function publicFamilies() {
  return ALLERGEN_FAMILIES.map(({ code, label_ar, label_en, note_ar }) => ({ code, label_ar, label_en, note_ar }));
}
