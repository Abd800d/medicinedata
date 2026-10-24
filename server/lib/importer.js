/* Bulk import: CSV (streamed, millions of rows), XLSX and JSON (drugs + products + images URLs) */
import fs from 'node:fs';
import readline from 'node:readline';
import XLSX from 'xlsx';
import { db } from '../db.js';
import { searchNorm, normalize } from './search.js';

const ALIASES = {
  generic_name: ['generic_name', 'generic', 'inn', 'active_ingredient', 'active ingredient', 'scientific_name', 'drug', 'name', 'الاسم العلمي', 'المادة الفعالة', 'اسم الدواء', 'الدواء'],
  generic_ar: ['generic_ar', 'arabic_name', 'name_ar', 'الاسم العربي', 'الاسم بالعربية'],
  trade_name: ['trade_name', 'brand', 'brand_name', 'product', 'product_name', 'trade', 'commercial_name', 'الاسم التجاري', 'المنتج', 'اسم المنتج', 'اسم الدواء التجاري'],
  trade_name_ar: ['trade_name_ar', 'trade_ar', 'brand_ar', 'الاسم التجاري بالعربية', 'الاسم التجاري العربي'],
  strength: ['strength', 'dose', 'dosage', 'concentration', 'القوة', 'التركيز', 'الجرعة'],
  dosage_form: ['dosage_form', 'form', 'pharmaceutical_form', 'الشكل الصيدلاني', 'الشكل الدوائي', 'شكل الدواء'],
  pack_size: ['pack_size', 'pack', 'packaging', 'size', 'الحجم', 'العبوة', 'حجم العبوة'],
  manufacturer: ['manufacturer', 'company', 'manufacturer_name', 'mfr', 'الشركة المصنعة', 'الشركة', 'المصنع'],
  manufacturer_country: ['manufacturer_country', 'company_country', 'بلد الشركة', 'دولة الشركة'],
  agent: ['agent', 'supplier', 'distributor', 'agent_name', 'الوكيل', 'المورد', 'الموزع'],
  country: ['country', 'market', 'origin', 'الدولة', 'البلد', 'السوق'],
  barcode: ['barcode', 'ean', 'gtin', 'upc', 'الباركود', 'الرقم الدولي'],
  price: ['price', 'retail_price', 'السعر', 'سعر الجمهور'],
  currency: ['currency', 'العملة'],
  image_url: ['image_url', 'image', 'photo', 'img', 'صورة', 'رابط الصورة', 'الصورة'],
  system: ['system', 'body_system', 'الجهاز', 'الجهاز الحيوي'],
  category: ['category', 'class', 'pharmacological_class', 'group', 'المجموعة', 'التصنيف', 'المجموعة الدوائية'],
  drug_class: ['drug_class', 'pharmacologic_class', 'الفئة الدوائية'],
  atc_code: ['atc', 'atc_code', 'رمز atc'],
  indications_ar: ['indications_ar', 'indications', 'uses', 'الاستخدامات', 'دواعي الاستعمال'],
  dosage_adult: ['dosage_adult', 'adult_dose', 'الجرعة للبالغين'],
  dosage_child: ['dosage_child', 'child_dose', 'جرعة الأطفال'],
  warnings: ['warnings', 'precautions', 'تحذيرات', 'الاحتياطات'],
  side_effects: ['side_effects', 'adverse_effects', 'الآثار الجانبية'],
  contraindications: ['contraindications', 'موانع الاستعمال'],
  description_ar: ['description_ar', 'description', 'الوصف'],
  verified: ['verified', 'موثق'],
};

const keyMap = new Map();
for (const [field, names] of Object.entries(ALIASES)) {
  for (const n of names) keyMap.set(normalize(n).replace(/\s+/g, ''), field);
}

function fieldOf(key) {
  const k = normalize(key).replace(/\s+/g, '').replace(/_/g, '');
  return keyMap.get(k) || keyMap.get(normalize(key).replace(/\s+/g, '')) || null;
}

export function mapRow(raw) {
  const out = {};
  for (const [k, v] of Object.entries(raw)) {
    if (v === undefined || v === null || v === '') continue;
    const f = fieldOf(k);
    if (f) out[f] = typeof v === 'string' ? v.trim() : v;
  }
  return out;
}

/* --- CSV parsing (RFC4180-ish, streaming friendly) --- */
function parseCsvLine(line) {
  const out = [];
  let cur = '';
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (quoted) {
      if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++; } else if (ch === '"') quoted = false; else cur += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',') { out.push(cur); cur = ''; }
    else cur += ch;
  }
  out.push(cur);
  return out;
}

export async function* csvRows(filePath) {
  const stream = fs.createReadStream(filePath);
  const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });
  let headers = null;
  for await (const line of rl) {
    const clean = line.replace(/^\uFEFF/, '');
    if (!clean.trim()) continue;
    const cells = parseCsvLine(clean);
    if (!headers) { headers = cells.map((c) => c.trim()); continue; }
    const obj = {};
    for (let i = 0; i < headers.length; i++) obj[headers[i]] = cells[i];
    yield obj;
  }
}

export function xlsxRows(filePath) {
  const wb = XLSX.readFile(filePath, { cellDates: false, dense: true });
  const rows = [];
  for (const name of wb.SheetNames) {
    const sheet = wb.Sheets[name];
    rows.push(...XLSX.utils.sheet_to_json(sheet, { defval: '', raw: false }));
  }
  return rows;
}

export function jsonRows(filePath) {
  const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  if (Array.isArray(parsed)) return parsed;
  if (Array.isArray(parsed.drugs)) {
    // structured export: [{generic_name, products:[...]}]
    const rows = [];
    for (const d of parsed.drugs) {
      if (Array.isArray(d.products) && d.products.length) {
        for (const p of d.products) rows.push({ ...d, ...p, products: undefined });
      } else rows.push(d);
    }
    return rows;
  }
  if (Array.isArray(parsed.products)) return parsed.products;
  throw new Error('Unsupported JSON structure');
}

/* --- Upsert pipeline --- */
export function createImporter() {
  const cache = { systems: new Map(), categories: new Map(), drugs: new Map(), manufacturers: new Map(), agents: new Map() };
  const S = db.prepare('SELECT id FROM systems WHERE lower(name_en)=lower(?) OR lower(name_ar)=? OR slug=?');
  const insSystem = db.prepare("INSERT INTO systems(slug,name_en,name_ar,sort_order) VALUES(?,?,?,0)");
  const SYS_ALIASES = {
    'nervous system': 'nervous', 'cardiovascular system': 'cardiovascular', 'blood and hematopoietic system': 'blood',
    'respiratory system': 'respiratory', 'gastrointestinal system': 'gastrointestinal', 'hepatobiliary system': 'hepatobiliary',
    'endocrine system': 'endocrine', 'renal and urinary system': 'renal', 'reproductive system': 'reproductive',
    'musculoskeletal system': 'musculoskeletal', 'skin system': 'skin', 'eye': 'eye', 'ear nose and throat': 'ent',
    'ear, nose, and throat': 'ent', 'immune system': 'immune', 'anti-infective system': 'antiinfective',
    'oncology': 'oncology', 'emergency and toxicology': 'emergency', 'diagnostic and miscellaneous': 'diagnostic',
  };

  function systemId(name) {
    if (!name) return null;
    const slug = SYS_ALIASES[normalize(name)] || normalize(name).replace(/\s+/g, '-');
    if (cache.systems.has(slug)) return cache.systems.get(slug);
    const found = S.get(name, name, slug);
    if (found) { cache.systems.set(slug, found.id); return found.id; }
    const id = insSystem.run(slug, name, name).lastInsertRowid;
    cache.systems.set(slug, id);
    return id;
  }

  const C = db.prepare('SELECT id FROM categories WHERE system_id=? AND (lower(name_en)=lower(?) OR lower(name_ar)=? OR slug=?)');
  const insCategory = db.prepare('INSERT INTO categories(system_id,slug,name_en,name_ar) VALUES(?,?,?,?)');
  function categoryId(system, name) {
    if (!name || !system) return null;
    const key = system + '|' + normalize(name);
    if (cache.categories.has(key)) return cache.categories.get(key);
    const slug = normalize(name).replace(/\s+/g, '-');
    const found = C.get(system, name, name, slug);
    if (found) { cache.categories.set(key, found.id); return found.id; }
    const id = insCategory.run(system, slug, name, name).lastInsertRowid;
    cache.categories.set(key, id);
    return id;
  }

  const D = db.prepare('SELECT id FROM drugs WHERE lower(generic_name)=lower(?)');
  const insDrug = db.prepare(`INSERT INTO drugs(system_id,category_id,generic_name,generic_ar,synonyms,drug_class,atc_code,prescription_required,
      indications_ar,indications_en,dosage_adult,dosage_child,warnings,side_effects,contraindications,notes,source,verified,search_norm)
    VALUES(@system_id,@category_id,@generic_name,@generic_ar,@synonyms,@drug_class,@atc_code,@prescription_required,
      @indications_ar,@indications_en,@dosage_adult,@dosage_child,@warnings,@side_effects,@contraindications,@notes,@source,@verified,@search_norm)
    ON CONFLICT(id) DO NOTHING`);
  const updDrug = db.prepare(`UPDATE drugs SET
      system_id=COALESCE(@system_id, system_id), category_id=COALESCE(@category_id, category_id),
      generic_ar=COALESCE(NULLIF(@generic_ar,''), generic_ar), drug_class=COALESCE(NULLIF(@drug_class,''), drug_class),
      atc_code=COALESCE(NULLIF(@atc_code,''), atc_code), indications_ar=COALESCE(NULLIF(@indications_ar,''), indications_ar),
      indications_en=COALESCE(NULLIF(@indications_en,''), indications_en), dosage_adult=COALESCE(NULLIF(@dosage_adult,''), dosage_adult),
      dosage_child=COALESCE(NULLIF(@dosage_child,''), dosage_child), warnings=COALESCE(NULLIF(@warnings,''), warnings),
      side_effects=COALESCE(NULLIF(@side_effects,''), side_effects), contraindications=COALESCE(NULLIF(@contraindications,''), contraindications),
      verified=CASE WHEN @verified=1 THEN 1 ELSE verified END, updated_at=datetime('now'), search_norm=@search_norm
    WHERE id=@id`);

  function drugId(row, sysId, catId) {
    const name = row.generic_name || row.trade_name;
    if (!name) return null;
    const key = normalize(name);
    if (cache.drugs.has(key)) return cache.drugs.get(key);
    let found = D.get(name);
    const payload = {
      system_id: sysId || null, category_id: catId || null, generic_name: name,
      generic_ar: row.generic_ar || null, synonyms: row.synonyms || null, drug_class: row.drug_class || row.category || null,
      atc_code: row.atc_code || null, prescription_required: /^(1|true|yes|نعم)$/i.test(String(row.prescription_required || '')) ? 1 : 0,
      indications_ar: row.indications_ar || null, indications_en: row.indications_en || null,
      dosage_adult: row.dosage_adult || null, dosage_child: row.dosage_child || null,
      warnings: row.warnings || null, side_effects: row.side_effects || null, contraindications: row.contraindications || null,
      notes: row.notes || null, source: row.source || 'import', verified: /^(1|true|yes|نعم)$/i.test(String(row.verified || '')) ? 1 : 0,
      search_norm: searchNorm(name, row.generic_ar, row.synonyms, row.drug_class, row.category),
    };
    if (!found) {
      const id = insDrug.run(payload).lastInsertRowid;
      found = { id };
    } else {
      updDrug.run({ ...payload, id: found.id });
    }
    cache.drugs.set(key, found.id);
    return found.id;
  }

  const M = db.prepare('SELECT id FROM manufacturers WHERE lower(name)=lower(?)');
  const insM = db.prepare('INSERT INTO manufacturers(name,country) VALUES(?,?)');
  function manufacturerId(name, country) {
    if (!name) return null;
    const key = normalize(name);
    if (cache.manufacturers.has(key)) return cache.manufacturers.get(key);
    let row = M.get(name);
    if (!row) row = { id: insM.run(name, country || null).lastInsertRowid };
    cache.manufacturers.set(key, row.id);
    return row.id;
  }

  const A = db.prepare('SELECT id FROM agents WHERE lower(name)=lower(?)');
  const insA = db.prepare('INSERT INTO agents(name,country,city) VALUES(?,?,?)');
  function agentId(name, country, city) {
    if (!name) return null;
    const key = normalize(name);
    if (cache.agents.has(key)) return cache.agents.get(key);
    let row = A.get(name);
    if (!row) row = { id: insA.run(name, country || 'Yemen', city || null).lastInsertRowid };
    cache.agents.set(key, row.id);
    return row.id;
  }

  const P = db.prepare(`SELECT id FROM products WHERE drug_id=? AND lower(trade_name)=lower(?) AND COALESCE(strength,'')=COALESCE(?,'')`);
  const insP = db.prepare(`INSERT INTO products(drug_id,trade_name,trade_name_ar,strength,dosage_form,pack_size,manufacturer_id,agent_id,country,
      barcode,price,currency,image_url,image_source,description_ar,verified,search_norm)
    VALUES(@drug_id,@trade_name,@trade_name_ar,@strength,@dosage_form,@pack_size,@manufacturer_id,@agent_id,@country,
      @barcode,@price,@currency,@image_url,@image_source,@description_ar,@verified,@search_norm)`);
  const updP = db.prepare(`UPDATE products SET trade_name_ar=COALESCE(NULLIF(@trade_name_ar,''),trade_name_ar),
      dosage_form=COALESCE(NULLIF(@dosage_form,''),dosage_form), pack_size=COALESCE(NULLIF(@pack_size,''),pack_size),
      manufacturer_id=COALESCE(@manufacturer_id,manufacturer_id), agent_id=COALESCE(@agent_id,agent_id),
      country=COALESCE(NULLIF(@country,''),country), barcode=COALESCE(NULLIF(@barcode,''),barcode),
      price=COALESCE(@price,price), image_url=COALESCE(NULLIF(@image_url,''),image_url),
      image_source=COALESCE(NULLIF(@image_source,''),image_source), updated_at=datetime('now'), search_norm=@search_norm
    WHERE id=@id`);
  const insImg = db.prepare('INSERT INTO product_images(product_id,url,source) VALUES(?,?,?)');

  return function importRow(raw, opts = {}) {
    const row = mapRow(raw);
    if (!row.generic_name && !row.trade_name) throw new Error('missing generic_name/trade_name');
    const sysId = row.system ? systemId(row.system) : (opts.defaultSystemId || null);
    const catId = row.category ? categoryId(sysId, row.category) : null;
    const dId = drugId(row, sysId, catId);
    if (!dId) throw new Error('could not resolve drug');
    if (!row.trade_name) return { ok: true, drug_only: true };
    const mId = manufacturerId(row.manufacturer, row.manufacturer_country || row.country);
    const aId = agentId(row.agent, row.country);
    const price = row.price === undefined || row.price === '' ? null : Number(String(row.price).replace(/[^\d.]/g, '')) || null;
    const userVerified = /^(1|true|yes|نعم)$/i.test(String(row.verified || '')) ? 1 : 0;
    const payload = {
      drug_id: dId, trade_name: row.trade_name, trade_name_ar: row.trade_name_ar || null,
      strength: row.strength || null, dosage_form: row.dosage_form || null, pack_size: row.pack_size || null,
      manufacturer_id: mId, agent_id: aId, country: row.country || null, barcode: row.barcode ? String(row.barcode) : null,
      price, currency: row.currency || 'YER', image_url: row.image_url || null, image_source: row.image_url ? 'import' : null,
      description_ar: row.description_ar || null, verified: userVerified || opts.verifyAll ? 1 : 0,
      search_norm: searchNorm(row.trade_name, row.trade_name_ar, row.strength, row.generic_name, row.generic_ar, row.barcode, row.manufacturer),
    };
    const existing = P.get(dId, row.trade_name, row.strength || null);
    if (existing) {
      updP.run({ ...payload, id: existing.id });
      return { ok: true, updated: true, product_id: existing.id, drug_id: dId };
    }
    const pId = insP.run(payload).lastInsertRowid;
    if (row.image_url) insImg.run(pId, row.image_url, 'import');
    return { ok: true, product_id: pId, drug_id: dId };
  };
}

export function detectKind(filename) {
  const ext = (filename.split('.').pop() || '').toLowerCase();
  if (ext === 'csv' || ext === 'tsv' || ext === 'txt') return 'csv';
  if (ext === 'xlsx' || ext === 'xls') return 'xlsx';
  if (ext === 'json') return 'json';
  return null;
}

export async function countRows(filePath, kind) {
  if (kind === 'json') return jsonRows(filePath).length;
  if (kind === 'xlsx') return xlsxRows(filePath).length;
  let n = 0;
  for await (const _ of csvRows(filePath)) n++;
  return n;
}
