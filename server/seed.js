/* Seed the real MDA reference catalogue (18 systems, classes, generics, commercial products). */
import 'dotenv/config';
import { db, setSetting } from './db.js';
import { ensureAdmin } from './auth.js';
import { SYSTEMS } from './data/systems.js';
import { AGENTS } from './data/refs.js';
import { DRUGS } from './data/drugs.js';
import { drugToRecord } from './data/helpers.js';
import { searchNorm } from './lib/search.js';
import { applyProductImages } from '../scripts/apply-images.mjs';
import { assignBarcodes } from './lib/barcodes.js';

const reset = process.argv.includes('--reset');

const slugify = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

function resetCatalog() {
  db.exec(`DELETE FROM product_images; DELETE FROM products; DELETE FROM drugs; DELETE FROM categories; DELETE FROM systems; DELETE FROM manufacturers; DELETE FROM agents;`);
  console.log('[seed] catalogue cleared');
}

function seedSystems() {
  const upsert = db.prepare(`INSERT INTO systems(slug,name_en,name_ar,description_en,description_ar,icon,color,sort_order)
    VALUES(@slug,@en,@ar,@desc_en,@desc_ar,@icon,@color,@sort)
    ON CONFLICT(slug) DO UPDATE SET name_en=excluded.name_en,name_ar=excluded.name_ar,description_en=excluded.description_en,
      description_ar=excluded.description_ar,icon=excluded.icon,color=excluded.color,sort_order=excluded.sort_order`);
  const sysId = db.prepare('SELECT id FROM systems WHERE slug=?');
  const upsertCat = db.prepare(`INSERT INTO categories(system_id,slug,name_en,name_ar,description_en,description_ar,sort_order)
    VALUES(?,?,?,?,?,?,?)
    ON CONFLICT(system_id,slug) DO UPDATE SET name_en=excluded.name_en,name_ar=excluded.name_ar`);
  let cats = 0;
  for (const s of SYSTEMS) {
    upsert.run({ slug: s.slug, en: s.en, ar: s.ar, desc_en: s.desc_en || null, desc_ar: s.desc_ar || null, icon: s.icon, color: s.color, sort: s.sort });
    const id = sysId.get(s.slug).id;
    s.classes.forEach((c, i) => { upsertCat.run(id, c.slug, c.en, c.ar, c.desc_en || null, c.desc_ar || null, i); cats++; });
  }
  console.log(`[seed] ${SYSTEMS.length} systems, ${cats} pharmacological classes`);
  return true;
}

function seedAgents() {
  const stmt = db.prepare(`INSERT INTO agents(name,name_ar,country,city,phone,email,website,notes) VALUES(?,?,?,?,?,?,?,?)
    ON CONFLICT(name) DO UPDATE SET name_ar=COALESCE(excluded.name_ar,agents.name_ar), city=COALESCE(excluded.city,agents.city), website=COALESCE(excluded.website,agents.website)`);
  for (const a of AGENTS) stmt.run(a.name, a.name_ar || null, a.country || 'Yemen', a.city || null, a.phone || null, a.email || null, a.website || null, a.notes || null);
  console.log(`[seed] ${AGENTS.length} Yemeni distributors/agents`);
}

function seedCatalog() {
  const sysBySlug = new Map(db.prepare('SELECT id,slug FROM systems').all().map((r) => [r.slug, r.id]));
  const catByKey = new Map(db.prepare('SELECT id,system_id,slug FROM categories').all().map((r) => [`${r.system_id}:${r.slug}`, r.id]));
  const agentByName = new Map(db.prepare('SELECT id,name FROM agents').all().map((r) => [r.name.toLowerCase(), r.id]));

  const findDrug = db.prepare('SELECT id FROM drugs WHERE lower(generic_name)=lower(?)');
  const insertDrug = db.prepare(`INSERT INTO drugs(system_id,category_id,generic_name,generic_ar,synonyms,drug_class,atc_code,prescription_required,
      pregnancy,indications_en,indications_ar,dosage_adult,dosage_child,contraindications,side_effects,warnings,interactions,
      mechanism_en,mechanism_ar,half_life,storage,notes,source,verified,search_norm)
    VALUES(@system_id,@category_id,@generic_name,@generic_ar,@synonyms,@drug_class,@atc_code,@prescription_required,
      @pregnancy,@indications_en,@indications_ar,@dosage_adult,@dosage_child,@contraindications,@side_effects,@warnings,@interactions,
      @mechanism_en,@mechanism_ar,@half_life,@storage,@notes,@source,@verified,@search_norm)`);

  const findMfr = db.prepare('SELECT id FROM manufacturers WHERE lower(name)=lower(?)');
  const insertMfr = db.prepare('INSERT INTO manufacturers(name,country,website) VALUES(?,?,?)');
  const findAgent = db.prepare('SELECT id FROM agents WHERE lower(name)=lower(?)');
  const insertAgent = db.prepare("INSERT INTO agents(name,country) VALUES(?,?)");

  const findProduct = db.prepare('SELECT id FROM products WHERE drug_id=? AND lower(trade_name)=lower(?) AND COALESCE(strength,\'\')=COALESCE(?,\'\')');
  const insertProduct = db.prepare(`INSERT INTO products(drug_id,trade_name,trade_name_ar,strength,dosage_form,pack_size,manufacturer_id,agent_id,
      country,image_url,image_source,description_ar,verified,search_norm)
    VALUES(@drug_id,@trade_name,@trade_name_ar,@strength,@dosage_form,NULL,@manufacturer_id,@agent_id,
      @country,NULL,NULL,@description_ar,1,@search_norm)`);
  const insertImage = db.prepare('INSERT INTO product_images(product_id,url,source) VALUES(?,?,?)');

  const mfrCache = new Map();
  const getMfr = (name, country) => {
    if (!name) return null;
    const key = name.toLowerCase();
    if (mfrCache.has(key)) return mfrCache.get(key);
    let row = findMfr.get(name);
    if (!row) row = { id: insertMfr.run(name, country || null, null).lastInsertRowid };
    mfrCache.set(key, row.id);
    return row.id;
  };
  const getAgent = (name) => {
    if (!name) return null;
    if (agentByName.has(name.toLowerCase())) return agentByName.get(name.toLowerCase());
    const row = insertAgent.run(name, 'Yemen');
    agentByName.set(name.toLowerCase(), row.lastInsertRowid);
    return row.lastInsertRowid;
  };

  let dCount = 0, pCount = 0, skipped = 0;
  const run = db.transaction(() => {
    for (const tuple of DRUGS) {
      const rec = drugToRecord(tuple);
      const systemId = sysBySlug.get(rec.system) || null;
      const categoryId = catByKey.get(`${systemId}:${rec.category}`) || null;
      let drug = findDrug.get(rec.generic_name);
      if (drug) { skipped++; continue; }
      const info = insertDrug.run({
        system_id: systemId, category_id: categoryId, generic_name: rec.generic_name, generic_ar: rec.generic_ar,
        synonyms: rec.synonyms, drug_class: rec.drug_class, atc_code: rec.atc_code, prescription_required: rec.prescription_required,
        pregnancy: rec.pregnancy, indications_en: rec.indications_en, indications_ar: rec.indications_ar,
        dosage_adult: rec.dosage_adult, dosage_child: rec.dosage_child, contraindications: rec.contraindications,
        side_effects: rec.side_effects, warnings: rec.warnings, interactions: rec.interactions,
        mechanism_en: rec.mechanism_en, mechanism_ar: rec.mechanism_ar, half_life: rec.half_life, storage: rec.storage,
        notes: rec.notes, source: rec.source, verified: rec.verified,
        search_norm: searchNorm(rec.generic_name, rec.generic_ar, rec.synonyms, rec.drug_class),
      });
      drug = { id: info.lastInsertRowid };
      dCount++;
      for (const p of rec.products) {
        if (findProduct.get(drug.id, p.trade_name, p.strength)) continue;
        const pid = insertProduct.run({
          drug_id: drug.id, trade_name: p.trade_name, trade_name_ar: p.trade_name_ar, strength: p.strength,
          dosage_form: p.dosage_form, manufacturer_id: getMfr(p.manufacturer, p.country), agent_id: getAgent(p.agent),
          country: p.country, description_ar: null,
          search_norm: searchNorm(p.trade_name, p.trade_name_ar, p.strength, rec.generic_name, rec.generic_ar, p.manufacturer),
        }).lastInsertRowid;
        // Every product always has a visual: its own generated pack artwork (replaceable by real photo from admin).
        insertImage.run(pid, `/api/catalog/product-image/${pid}.svg`, 'generated');
        pCount++;
      }
    }
  });
  run();
  console.log(`[seed] ${dCount} new generics, ${pCount} commercial products${skipped ? `, ${skipped} already present` : ''}`);
}

function seedSettings() {
  const defaults = {
    site_name_en: 'MedicineData', site_name_ar: 'ميديسين داتا',
    owner_name: 'Dr. Abdulmajeed Abdullah Almakhedhi', owner_title: 'المؤسس والمدير الطبي',
    support_email: '7a8b1d@gmail.com', whatsapp: '+967781733795',
    about_ar: 'مرجع دوائي شامل للأدوية والمنتجات التجارية في اليمن والدول العربية، مبني على مصادر علمية موثوقة، مع أدوات إدارة وتحديث مستمرة.',
    about_en: 'A comprehensive pharmaceutical reference for medicines and commercial products in Yemen and the Arab world.',
    disclaimer_ar: 'المعلومات لأغراض مرجعية وتعليمية ولا تُغني عن استشارة الطبيب أو الصيدلي. الجرعات يجب أن تُطابق التشخيص والحالة الفردية.',
    disclaimer_en: 'Reference information only; always confirm with a licensed clinician or pharmacist.',
    default_lang: 'ar',
  };
  for (const [k, v] of Object.entries(defaults)) setSetting(k, v);
}

if (reset) resetCatalog();
seedSystems();
seedAgents();
seedCatalog();
seedSettings();
ensureAdmin();
// Attach the bundled real pack photographs (server/data/product-images.js), replacing placeholders.
applyProductImages();
// Every product gets a scannable EAN-13 (internal block) unless it already has a manufacturer code.
assignBarcodes();

const counts = db.prepare(`SELECT
  (SELECT COUNT(*) FROM systems) systems,
  (SELECT COUNT(*) FROM categories) categories,
  (SELECT COUNT(*) FROM drugs) drugs,
  (SELECT COUNT(*) FROM products) products,
  (SELECT COUNT(*) FROM manufacturers) manufacturers,
  (SELECT COUNT(*) FROM agents) agents`).get();
console.log('[seed] done →', counts);
