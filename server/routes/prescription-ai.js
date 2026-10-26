/*
 * AI prescription endpoints (Phase 1).
 *
 *   POST   /api/rx/analyze            image (or text) → structured analysis, nothing saved as approved
 *   POST   /api/rx/:id/reanalyze      run the pipeline again on a saved prescription
 *   PATCH  /api/rx/:id/items/:itemId  pharmacist manual correction of one line
 *   POST   /api/rx/:id/confirm        pharmacist approval of the whole review
 *   POST   /api/rx/:id/reject         pharmacist rejection with a reason
 *   GET    /api/rx/:id                full analysis + items + review history
 *   DELETE /api/rx/:id                purge (image + patient fields) — auditable
 *   POST   /api/rx/consent            record explicit consent before any image upload
 *   GET    /api/rx/consent             current consent state
 */
import { Router } from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { db, UPLOAD_DIR } from '../db.js';
import { authRequired, roleRequired } from '../auth.js';
import { makeUploader } from '../lib/upload.js';
import { analyzePrescription, PROMPT_VERSION, FIELD_THRESHOLD, ITEM_THRESHOLD } from '../lib/ai/prescription.js';
import { status as aiStatus, AiError } from '../lib/ai/service.js';
import { matchName, drugDossier, dailyDoseMg, documentedMaxDailyMg, reviewFlags } from '../lib/ai/match.js';
import { audit, recordConsent, latestConsent } from '../lib/audit.js';
import { publicFamilies, familyLabel, ALLERGEN_CODES, describeFamilies } from '../data/allergens.js';

const router = Router();
const uploader = makeUploader('prescriptions');
const CONSENT_VERSION = 'rx-consent-2026-10';

const buckets = new Map();
function rateLimit(max = 12, windowMs = 60_000, bucket = 'default') {
  return (req, res, next) => {
    const key = `${bucket}:${req.user?.id || req.ip}`;
    const now = Date.now();
    const arr = (buckets.get(key) || []).filter((t) => now - t < windowMs);
    if (arr.length >= max) return res.status(429).json({ error: 'محاولات كثيرة — انتظر قليلًا / Too many requests', code: 'RATE_LIMIT' });
    arr.push(now);
    buckets.set(key, arr);
    next();
  };
}

const safeMsg = (e) => (e instanceof AiError ? e.safe : 'تعذّر إكمال التحليل، حاول لاحقًا');

/** Declared allergies for a user — the only source of allergy alerts. */
export function allergiesOf(userId) {
  return db.prepare('SELECT id, code, label, note, created_at FROM user_allergies WHERE user_id=? ORDER BY id').all(userId)
    .map((a) => ({ ...a, label: a.label || familyLabel(a.code) }));
}

/** Snapshot stored with the prescription so a later review uses the same facts. */
function patientContextFor(userId) {
  return { allergies: allergiesOf(userId), captured_at: new Date().toISOString() };
}

const normaliseAllergyLabel = (code, label) => {
  if (label && String(label).trim()) return String(label).trim().slice(0, 120);
  if (ALLERGEN_CODES.has(code)) return familyLabel(code);
  return code;
};

function loadOwned(req, res) {
  const row = db.prepare('SELECT * FROM prescriptions WHERE id=?').get(req.params.id);
  if (!row) { res.status(404).json({ error: 'Not found' }); return null; }
  const isOwner = row.user_id === req.user.id;
  const isStaff = req.user.role === 'admin' || req.user.role === 'pharmacist';
  if (!isOwner && !isStaff) { res.status(403).json({ error: 'Forbidden' }); return null; }
  return row;
}

function saveItems(prescriptionId, analysis) {
  db.prepare('DELETE FROM prescription_items WHERE prescription_id=?').run(prescriptionId);
  const ins = db.prepare(`INSERT INTO prescription_items(prescription_id,line_no,raw_text,name,matched_drug_id,matched_product_id,
    match_score,alternatives_json,strength,form,dose,frequency,duration,route,instructions,field_confidence_json,confidence,uncertain_fields_json,status)
    VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);
  db.transaction(() => {
    for (const it of analysis.items || []) {
      ins.run(
        prescriptionId, it.line_no, it.raw_text, it.name,
        it.matched?.drug_id ?? null, it.matched?.product_id ?? null, it.matched?.score ?? null,
        JSON.stringify(it.alternatives || []),
        it.strength, it.form, it.dose, it.frequency, it.duration, it.route, it.instructions,
        JSON.stringify(it.field_confidence || {}),
        it.confidence ?? null,
        JSON.stringify(it.uncertain_fields || []),
        'pending',
      );
    }
  })();
}

/**
 * Rebuild a stored line into the same shape the analysis response uses.
 * Done at read time on purpose: the dossier, alternatives and dose maths are
 * always the *current* database truth, never a frozen copy from analysis day.
 */
function hydrateItem(row) {
  const fieldConfidence = row.field_confidence_json ? JSON.parse(row.field_confidence_json) : {};
  const stored = row.alternatives_json ? JSON.parse(row.alternatives_json) : [];
  const dossier = row.matched_drug_id ? drugDossier(row.matched_drug_id, row.matched_product_id) : null;
  const pick = stored.find((c) => c.drug_id === row.matched_drug_id && (c.product_id || null) === (row.matched_product_id || null)) || stored[0] || null;
  const matched = row.matched_drug_id
    ? {
      drug_id: row.matched_drug_id,
      product_id: row.matched_product_id ?? null,
      score: row.match_score ?? null,
      matched_on: pick?.matched_on ?? null,
      generic_name: dossier?.drug?.generic_name ?? pick?.generic_name ?? null,
      generic_ar: dossier?.drug?.generic_ar ?? pick?.generic_ar ?? null,
      trade_name: pick?.trade_name ?? null,
      trade_name_ar: pick?.trade_name_ar ?? null,
      strength: pick?.strength ?? row.strength ?? null,
      form: pick?.form ?? row.form ?? null,
      manufacturer_name: pick?.manufacturer_name ?? null,
      country: pick?.country ?? null,
      image_url: pick?.image_url ?? null,
    }
    : null;
  /* Only fields that actually hold a value can be "uncertain"; an empty field is absent, not doubtful. */
  const storedUncertain = row.uncertain_fields_json ? JSON.parse(row.uncertain_fields_json) : null;
  const uncertain = Array.isArray(storedUncertain) && storedUncertain.length
    ? storedUncertain.filter((k) => row[k])
    : Object.entries(fieldConfidence).filter(([k, v]) => row[k] && (!v || v < FIELD_THRESHOLD)).map(([k]) => k);
  const confidence = row.confidence ?? (Object.values(fieldConfidence).length
    ? Math.min(...Object.values(fieldConfidence).filter((v) => v > 0))
    : 0);
  const needsReview = !matched || uncertain.length > 0 || (row.match_score ?? 0) < ITEM_THRESHOLD;
  return {
    ...row,
    alternatives: stored,
    field_confidence: fieldConfidence,
    uncertain_fields: row.status === 'corrected' ? [] : uncertain,
    confidence: Number(confidence) || 0,
    matched,
    dossier,
    dose_calc: dailyDoseMg(row.dose, row.frequency, row.strength),
    documented_max_daily_mg: dossier?.drug
      ? documentedMaxDailyMg(`${dossier.drug.dosage_adult || ''} ${dossier.drug.dosage_child || ''}`)
      : null,
    needs_review: row.status === 'corrected' ? false : needsReview,
    review_reason: !matched ? 'not_in_database' : uncertain.length ? 'uncertain_fields' : null,
  };
}

function logRun({ kind = 'prescription', user, prescriptionId, ai, ok = true, errorCode = null }) {
  const info = db.prepare(`INSERT INTO ai_runs(kind,user_id,prescription_id,provider,model,request_id,latency_ms,prompt_version,ok,error_code,usage_json)
    VALUES(?,?,?,?,?,?,?,?,?,?,?)`).run(
    kind, user?.id ?? null, prescriptionId ?? null,
    ai?.provider ?? null, ai?.model ?? null, ai?.request_id ?? null,
    ai?.latency_ms ?? null, ai?.prompt_version || PROMPT_VERSION,
    ok ? 1 : 0, errorCode, ai?.usage ? JSON.stringify(ai.usage) : null,
  );
  return Number(info.lastInsertRowid);
}

/* ---------------- declared allergies ---------------- */

router.get('/allergies', authRequired, (req, res) => {
  res.json({
    items: allergiesOf(req.user.id),
    families: publicFamilies(),
    note_ar: 'هذه قائمة أدخلتها أنت بنفسك. لا يستنتجها التطبيق من أي مصدر، وتُستخدم فقط لتنبيهك وتنبيه الصيدلي. الحساسية المشتبه بها تحتاج تشخيص طبيب.',
    consent_note_ar: 'تُحفظ هذه البيانات في حسابك على الخادم، ويمكنك حذفها في أي وقت.',
  });
});

router.post('/allergies', authRequired, rateLimit(30, 60_000, 'allergies'), (req, res) => {
  const rawCode = String(req.body?.code || '').trim();
  if (!rawCode || rawCode.length > 120) return res.status(400).json({ error: 'كود الحساسية مطلوب', code: 'BAD_CODE' });
  const isFamily = ALLERGEN_CODES.has(rawCode);
  const isMolecule = /^mol:[a-z0-9-]{2,80}$/.test(rawCode);
  if (!isFamily && !isMolecule) {
    return res.status(400).json({ error: 'الحساسية يجب أن تكون عائلة دوائية موثّقة أو مادة فعالة محددة', code: 'UNKNOWN_ALLERGY_CODE' });
  }
  const label = normaliseAllergyLabel(rawCode, req.body?.label);
  const note = req.body?.note ? String(req.body.note).slice(0, 240) : null;
  try {
    db.prepare('INSERT INTO user_allergies(user_id,code,label,note) VALUES(?,?,?,?) ON CONFLICT(user_id,code) DO UPDATE SET label=excluded.label, note=excluded.note')
      .run(req.user.id, rawCode, label, note);
  } catch (e) { return res.status(500).json({ error: 'تعذّر الحفظ' }); }
  audit('user.allergy.added', {
    actor: req.user, targetType: 'user', targetId: req.user.id,
    meta: { code: rawCode, kind: isFamily ? 'family' : 'molecule' }, ip: req.ip,
  });
  res.status(201).json({ ok: true, items: allergiesOf(req.user.id) });
});

router.delete('/allergies/:id', authRequired, (req, res) => {
  const row = db.prepare('SELECT * FROM user_allergies WHERE id=? AND user_id=?').get(req.params.id, req.user.id);
  if (!row) return res.status(404).json({ error: 'Not found' });
  db.prepare('DELETE FROM user_allergies WHERE id=?').run(row.id);
  audit('user.allergy.removed', { actor: req.user, targetType: 'user', targetId: req.user.id, meta: { code: row.code }, ip: req.ip });
  res.json({ ok: true, items: allergiesOf(req.user.id) });
});

router.get('/allergen-families', (_req, res) => res.json({ families: publicFamilies(), source: 'ATC/WHO classification' }));

/* ---------------- consent ---------------- */

router.get('/consent', authRequired, (req, res) => {
  const row = latestConsent(req.user.id, 'prescription_image');
  res.json({
    version: CONSENT_VERSION,
    granted: row ? Boolean(row.granted) : false,
    granted_at: row?.created_at || null,
    text_ar: 'أوافق على إرسال صورة الوصفة إلى خدمة التحليل الآلي على الخادم لاستخراج النص، مع علمي أنها قراءة آلية قد تخطئ ولا تُعتمد إلا بعد مراجعة الصيدلي. يمكنني حذف الصورة في أي وقت.',
    text_en: 'I agree to send the prescription image to the server-side analysis service to extract text, understanding that machine reading may be wrong and is only accepted after pharmacist review. I can delete it at any time.',
  });
});

router.post('/consent', authRequired, (req, res) => {
  const granted = req.body?.granted !== false;
  recordConsent(req.user.id, 'prescription_image', CONSENT_VERSION, granted);
  audit(granted ? 'rx.consent.granted' : 'rx.consent.withdrawn', {
    actor: req.user, targetType: 'user', targetId: req.user.id, meta: { version: CONSENT_VERSION }, ip: req.ip,
  });
  res.json({ ok: true, granted, version: CONSENT_VERSION });
});

/* ---------------- analysis ---------------- */

router.get('/status', (_req, res) => res.json({ ...aiStatus(), prompt_version: PROMPT_VERSION }));

/* Pharmacist work queue — deliberately without patient/clinical payloads;
   the reviewer opens one record at a time (and that access is audited). */
router.get('/queue', authRequired, roleRequired('admin', 'pharmacist'), (req, res) => {
  const status = ['pending_review', 'reviewed', 'rejected'].includes(String(req.query.status))
    ? String(req.query.status) : 'pending_review';
  const rows = db.prepare(`SELECT p.id, p.status, p.created_at, u.name AS owner_name,
      (SELECT COUNT(*) FROM prescription_items i WHERE i.prescription_id=p.id) AS items,
      (SELECT COUNT(*) FROM prescription_items i WHERE i.prescription_id=p.id AND i.status='pending') AS pending_items,
      (SELECT COUNT(*) FROM prescription_items i WHERE i.prescription_id=p.id AND i.matched_drug_id IS NULL) AS unmatched,
      (SELECT COUNT(*) FROM prescription_reviews r WHERE r.prescription_id=p.id) AS reviews
    FROM prescriptions p LEFT JOIN users u ON u.id=p.user_id
    WHERE p.status=? ORDER BY p.id DESC LIMIT 100`).all(status);
  res.json({ status, count: rows.length, rows });
});

router.post('/analyze', authRequired, rateLimit(12, 60_000, 'analyze'), uploader.single('image'), async (req, res, next) => {
  const started = Date.now();
  try {
    const consent = latestConsent(req.user.id, 'prescription_image');
    if (!consent || !consent.granted) {
      if (req.file) { try { fs.unlinkSync(req.file.path); } catch { /* ignore */ } }
      return res.status(428).json({ error: 'الموافقة مطلوبة قبل رفع صورة الوصفة', code: 'CONSENT_REQUIRED' });
    }
    if (!aiStatus().configured) {
      if (req.file) { try { fs.unlinkSync(req.file.path); } catch { /* ignore */ } }
      return res.status(503).json({ error: aiStatus().hint_ar, code: 'AI_NOT_CONFIGURED' });
    }
    const text = String(req.body?.text || '').trim();
    if (!req.file && !text) return res.status(400).json({ error: 'صورة الوصفة أو النص مطلوب', code: 'INPUT_REQUIRED' });

    let dataUrl = null;
    if (req.file) {
      if (req.file.size > 12 * 1024 * 1024) return res.status(413).json({ error: 'حجم الصورة كبير جدًا (12MB كحد أقصى)', code: 'TOO_LARGE' });
      if (!/^image\//.test(req.file.mimetype)) return res.status(415).json({ error: 'الملف ليس صورة', code: 'BAD_MIME' });
      const buf = fs.readFileSync(req.file.path);
      dataUrl = `data:${req.file.mimetype};base64,${buf.toString('base64')}`;
    }

    const patientContext = patientContextFor(req.user.id);
    const { analysis, ai } = await analyzePrescription({
      imageDataUrl: dataUrl, text: text || null,
      lang: req.body?.lang === 'en' ? 'en' : 'ar', patientContext,
    });
    const runId = logRun({ user: req.user, ai });

    /* Image retention is opt-in. Default: the file never survives the request. */
    const keepImage = String(req.body?.keep_image || '0') === '1';
    let rel = null;
    if (req.file) {
      if (keepImage) rel = `/uploads/prescriptions/${path.basename(req.file.path)}`;
      else { try { fs.unlinkSync(req.file.path); } catch { /* ignore */ } }
    }

    const info = db.prepare(`INSERT INTO prescriptions(user_id,image_url,extracted_text,analysis_json,status,patient_context_json) VALUES(?,?,?,?,?,?)`)
      .run(req.user.id, rel, analysis.items.map((i) => i.raw_text || i.name).filter(Boolean).join('\n'),
        JSON.stringify(analysis), 'pending_review', JSON.stringify(patientContext));
    const id = Number(info.lastInsertRowid);
    saveItems(id, analysis);
    /* link the audit row to the record it produced */
    db.prepare('UPDATE ai_runs SET prescription_id=? WHERE id=?').run(id, runId);

    audit('rx.analyzed', {
      actor: req.user, targetType: 'prescription', targetId: id,
      meta: { model: ai.model, prompt_version: ai.prompt_version, items: analysis.items.length, flagged: analysis.summary.needs_review, ms: Date.now() - started },
      ip: req.ip,
    });

    res.status(201).json({
      id,
      analysis,
      ai,
      image_kept: Boolean(rel),
      needs_pharmacist: true,
      disclaimer_ar: analysis.disclaimer_ar,
      disclaimer_en: analysis.disclaimer_en,
    });
  } catch (e) {
    if (req.file) { try { fs.unlinkSync(req.file.path); } catch { /* ignore */ } }
    logRun({ user: req.user, ai: null, ok: false, errorCode: e.code || e.name });
    if (e instanceof AiError) return res.status(e.status || 502).json({ error: e.safe, code: e.code });
    next(e);
  }
});

router.post('/:id/reanalyze', authRequired, rateLimit(8, 60_000, 'reanalyze'), async (req, res, next) => {
  try {
    const row = loadOwned(req, res); if (!row) return;
    if (!aiStatus().configured) return res.status(503).json({ error: aiStatus().hint_ar, code: 'AI_NOT_CONFIGURED' });
    const text = String(req.body?.text || row.extracted_text || '').trim();
    const kept = row.image_url ? path.join(UPLOAD_DIR, 'prescriptions', path.basename(row.image_url)) : null;
    let dataUrl = null;
    if (kept && fs.existsSync(kept)) {
      const buf = fs.readFileSync(kept);
      dataUrl = `data:image/jpeg;base64,${buf.toString('base64')}`;
    }
    if (!dataUrl && !text) return res.status(400).json({ error: 'لا توجد صورة محفوظة أو نص لإعادة التحليل', code: 'NO_INPUT' });

    const patientContext = row.patient_context_json ? JSON.parse(row.patient_context_json) : patientContextFor(row.user_id);
    const { analysis, ai } = await analyzePrescription({
      imageDataUrl: dataUrl, text: dataUrl ? null : text,
      lang: req.body?.lang === 'en' ? 'en' : 'ar', patientContext,
    });
    logRun({ user: req.user, prescriptionId: row.id, ai });
    db.prepare("UPDATE prescriptions SET analysis_json=?, extracted_text=?, status='pending_review' WHERE id=?")
      .run(JSON.stringify(analysis), analysis.items.map((i) => i.raw_text || i.name).filter(Boolean).join('\n'), row.id);
    saveItems(row.id, analysis);
    audit('rx.reanalyzed', { actor: req.user, targetType: 'prescription', targetId: row.id, meta: { model: ai.model }, ip: req.ip });
    res.json({ id: row.id, analysis, ai });
  } catch (e) {
    logRun({ user: req.user, ai: null, ok: false, errorCode: e.code || e.name });
    if (e instanceof AiError) return res.status(e.status || 502).json({ error: e.safe, code: e.code });
    next(e);
  }
});

router.get('/:id', authRequired, (req, res) => {
  const row = loadOwned(req, res); if (!row) return;
  if (row.user_id !== req.user.id) {
    audit('rx.viewed_by_staff', { actor: req.user, targetType: 'prescription', targetId: row.id, ip: req.ip });
  }
  const items = db.prepare('SELECT * FROM prescription_items WHERE prescription_id=? ORDER BY line_no').all(row.id).map(hydrateItem);
  const reviews = db.prepare(`SELECT r.*, u.name AS reviewer_name FROM prescription_reviews r
    LEFT JOIN users u ON u.id=r.user_id WHERE r.prescription_id=? ORDER BY r.id`).all(row.id);
  const runs = db.prepare('SELECT provider,model,latency_ms,prompt_version,ok,created_at FROM ai_runs WHERE prescription_id=? ORDER BY id DESC LIMIT 5').all(row.id);
  res.json({
    ...row,
    analysis: row.analysis_json ? JSON.parse(row.analysis_json) : null,
    patient_context: row.patient_context_json ? JSON.parse(row.patient_context_json) : null,
    items, reviews, runs,
  });
});

/* Pharmacist manual correction of a single line */
router.patch('/:id/items/:itemId', authRequired, roleRequired('admin', 'pharmacist'), (req, res) => {
  const row = loadOwned(req, res); if (!row) return;
  const item = db.prepare('SELECT * FROM prescription_items WHERE id=? AND prescription_id=?').get(req.params.itemId, row.id);
  if (!item) return res.status(404).json({ error: 'Item not found' });
  const b = req.body || {};
  let drugId = b.matched_drug_id ?? item.matched_drug_id;
  let productId = b.matched_product_id ?? item.matched_product_id;
  let matchScore = item.match_score;
  let alternatives = item.alternatives_json;

  /* A free-typed name re-runs the matcher so we can offer the closest catalogue entries */
  if (typeof b.name === 'string' && b.name.trim() && !b.matched_drug_id) {
    const m = matchName(b.name.trim(), { limit: 4 });
    drugId = m.best?.drug_id ?? null;
    productId = m.best?.product_id ?? null;
    matchScore = m.best?.score ?? null;
    alternatives = JSON.stringify(m.alternatives);
  }
  const clean = (v, fb) => (v === undefined ? fb : (v === null ? null : String(v).slice(0, 300)));
  db.prepare(`UPDATE prescription_items SET name=?, matched_drug_id=?, matched_product_id=?, match_score=?, alternatives_json=?,
      strength=?, form=?, dose=?, frequency=?, duration=?, route=?, instructions=?,
      status='corrected', corrected_by=?, corrected_at=datetime('now') WHERE id=?`).run(
    clean(b.name, item.name), drugId ?? null, productId ?? null, matchScore, alternatives,
    clean(b.strength, item.strength), clean(b.form, item.form), clean(b.dose, item.dose),
    clean(b.frequency, item.frequency), clean(b.duration, item.duration), clean(b.route, item.route),
    clean(b.instructions, item.instructions), req.user.id, item.id,
  );
  audit('rx.item.corrected', {
    actor: req.user, targetType: 'prescription_item', targetId: item.id,
    meta: { prescription_id: row.id, before: { name: item.name, drug_id: item.matched_drug_id }, after: { name: b.name ?? item.name, drug_id: drugId } },
    ip: req.ip,
  });
  res.json({ ok: true, item: db.prepare('SELECT * FROM prescription_items WHERE id=?').get(item.id) });
});

/* Pharmacist approval — the only way a result becomes "reviewed" */
router.post('/:id/confirm', authRequired, roleRequired('admin', 'pharmacist'), (req, res) => {
  const row = loadOwned(req, res); if (!row) return;
  const items = db.prepare('SELECT * FROM prescription_items WHERE prescription_id=? ORDER BY line_no').all(row.id);
  if (!items.length) return res.status(400).json({ error: 'لا توجد بنود للمراجعة' });
  const pending = items.filter((i) => i.status === 'pending').length;
  const override = req.body?.accept_uncertain === true;
  if (pending && !override) {
    return res.status(409).json({
      error: `هناك ${pending} بندًا لم يُراجَع بعد. صحّحها أو أكّد قبولها صراحةً.`,
      code: 'PENDING_ITEMS', pending,
    });
  }
  const notes = String(req.body?.notes || '').slice(0, 1000) || null;
  const analysis = row.analysis_json ? JSON.parse(row.analysis_json) : {};
  const storedContext = row.patient_context_json ? JSON.parse(row.patient_context_json) : { allergies: [] };
  const flags = reviewFlags(
    items.map((i) => {
      const dossier = i.matched_drug_id ? drugDossier(i.matched_drug_id, i.matched_product_id) : null;
      return { dose: i.dose, frequency: i.frequency, strength: i.strength, dossier };
    }),
    { allergies: storedContext.allergies || [] },
  );
  db.prepare("UPDATE prescriptions SET status='reviewed' WHERE id=?").run(row.id);
  db.prepare(`INSERT INTO prescription_reviews(prescription_id,user_id,action,notes,flags_json) VALUES(?,?,?,?,?)`)
    .run(row.id, req.user.id, 'approved', notes, JSON.stringify(flags));
  audit('rx.approved', {
    actor: req.user, targetType: 'prescription', targetId: row.id,
    meta: { items: items.length, flags: flags.length, accepted_uncertain: override, notes },
    ip: req.ip,
  });
  res.json({ ok: true, status: 'reviewed', reviews: db.prepare('SELECT * FROM prescription_reviews WHERE prescription_id=?').all(row.id), flags, analysis_summary: analysis.summary || null });
});

router.post('/:id/reject', authRequired, roleRequired('admin', 'pharmacist'), (req, res) => {
  const row = loadOwned(req, res); if (!row) return;
  const notes = String(req.body?.notes || '').slice(0, 1000) || null;
  db.prepare("UPDATE prescriptions SET status='rejected' WHERE id=?").run(row.id);
  db.prepare('INSERT INTO prescription_reviews(prescription_id,user_id,action,notes) VALUES(?,?,?,?)')
    .run(row.id, req.user.id, 'rejected', notes);
  audit('rx.rejected', { actor: req.user, targetType: 'prescription', targetId: row.id, meta: { notes }, ip: req.ip });
  res.json({ ok: true, status: 'rejected' });
});

/* Right to erasure: image + patient-identifying fields removed, audit entry kept */
router.delete('/:id', authRequired, (req, res) => {
  const row = loadOwned(req, res); if (!row) return;
  if (row.image_url) {
    const f = path.join(UPLOAD_DIR, 'prescriptions', path.basename(row.image_url));
    if (fs.existsSync(f)) { try { fs.unlinkSync(f); } catch { /* ignore */ } }
  }
  const analysis = row.analysis_json ? JSON.parse(row.analysis_json) : null;
  if (analysis) {
    analysis.patient = { name: null, confidence: 0 };
    analysis.doctor = { name: null, confidence: 0 };
    analysis.clinic = { name: null, confidence: 0 };
    analysis.notes = null;
    analysis.items = (analysis.items || []).map((i) => ({ ...i, raw_text: null, instructions: null }));
    db.prepare('UPDATE prescriptions SET analysis_json=? WHERE id=?').run(JSON.stringify(analysis), row.id);
  }
  db.prepare('UPDATE prescriptions SET image_url=NULL, extracted_text=NULL WHERE id=?').run(row.id);
  db.prepare('INSERT INTO prescription_reviews(prescription_id,user_id,action,notes) VALUES(?,?,?,?)')
    .run(row.id, req.user.id, 'purged', 'patient data erased');
  audit('rx.purged', { actor: req.user, targetType: 'prescription', targetId: row.id, meta: { image: Boolean(row.image_url) }, ip: req.ip });
  res.json({ ok: true, purged: true });
});

export default router;
