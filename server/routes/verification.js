/*
 * Verification workflow API (v1.13.0) — mounted at /api/admin/verification.
 *
 * Pharmacists may review records (the plan makes the pharmacist the reviewer); admins may do
 * everything, including corrections that go backwards in the state machine. Plain users never
 * reach this router — their submissions go through /api/submissions and arrive as `user_submitted`.
 *
 * Every write returns the fresh detail object, so the UI never has to guess what the server did.
 */
import { Router } from 'express';
import { db } from '../db.js';
import { authRequired, roleRequired } from '../auth.js';
import { makeUploader, publicUrl } from '../lib/upload.js';
import { summary, queue, detail, applyChange, addSource, removeSource, isEntity } from '../lib/verification-workflow.js';
import {
  STATES, REVIEW_STATUSES, STATE_META, REVIEW_META, SOURCE_KINDS, SOURCE_KIND_LABELS, isState, isReview,
} from '../lib/verification.js';

const router = Router();
const docUpload = makeUploader('documents', {
  maxBytes: 20 * 1024 * 1024,
  types: ['application/pdf'],
});

router.use(authRequired);
/* A pharmacist is enough for everything here; adminRequired would lock out the reviewer role. */
router.use(roleRequired('pharmacist'));

router.get('/meta', (_req, res) => {
  res.json({
    states: STATES, reviews: REVIEW_STATUSES, source_kinds: SOURCE_KINDS,
    state_labels: STATE_META, review_labels: REVIEW_META, source_kind_labels: SOURCE_KIND_LABELS,
  });
});

router.get('/summary', (_req, res) => res.json(summary()));

router.get('/queue', (req, res) => {
  const { state = '', review = '', q = '', page = '1', limit = '30' } = req.query;
  if (state && !isState(state)) return res.status(422).json({ error: 'حالة غير معروفة / Unknown state' });
  if (review && !isReview(review)) return res.status(422).json({ error: 'حالة مراجعة غير معروفة / Unknown review' });
  res.json(queue({ state, review, q, page, limit }));
});

router.get('/:entity/:id', (req, res) => {
  const { entity, id } = req.params;
  if (!isEntity(entity)) return res.status(404).json({ error: 'نوع سجل غير معروف / Unknown record type' });
  const record = detail(entity, Number(id));
  if (!record) return res.status(404).json({ error: 'السجل غير موجود / Record not found' });
  res.json(record);
});

router.post('/:entity/:id', (req, res) => {
  const { entity, id } = req.params;
  if (!isEntity(entity)) return res.status(404).json({ error: 'نوع سجل غير معروف / Unknown record type' });
  const { state, review, note } = req.body || {};
  const out = applyChange({
    entity, id: Number(id), actor: req.user, role: req.user.role,
    requestedState: state || undefined, requestedReview: review || undefined,
    note: note || '', ip: req.ip,
  });
  if (!out.ok) {
    return res.status(out.status || 400).json({
      error: out.error, code: out.code, accepted_kinds: out.accepted_kinds,
    });
  }
  res.json({ ...out, detail: detail(entity, Number(id)) });
});

/* Attach evidence. Two shapes on purpose: a link (regulatory page, agent-letter PDF on a
   hospital drive) or an uploaded file — both end up in the same table so the reviewer sees
   one list, not two. */
router.post('/:entity/:id/sources', docUpload.single('file'), (req, res) => {
  const { entity, id } = req.params;
  if (!isEntity(entity)) return res.status(404).json({ error: 'نوع سجل غير معروف / Unknown record type' });
  if (!detail(entity, Number(id))) return res.status(404).json({ error: 'السجل غير موجود / Record not found' });
  const body = req.body || {};
  const kind = String(body.kind || (req.file ? 'other' : '')).trim();
  const out = addSource({
    entity, entityId: Number(id), kind,
    title: body.title || (req.file ? req.file.originalname : ''),
    issuer: body.issuer, url: body.url,
    filePath: req.file ? publicUrl('documents', req.file.filename) : '',
    issuedAt: body.issued_at,
    actor: req.user,
  });
  if (out.error) return res.status(out.status || 400).json({ error: out.error });
  res.status(201).json({ id: out.id, detail: detail(entity, Number(id)) });
});

router.delete('/sources/:id', (req, res) => {
  const out = removeSource({ id: Number(req.params.id), actor: req.user });
  if (out.error) return res.status(out.status || 400).json({ error: out.error });
  res.json({ ok: true });
});

/* Re-derive the two open states for every product after a bulk import. Claimed states
   (verified / manufacturer_confirmed / submitted) are never touched. */
router.post('/recompute', (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'صلاحيات المدير مطلوبة / Admin only' });
  const before = db.prepare(`SELECT verification_state s, COUNT(*) n FROM products
    WHERE verification_state IN ('incomplete','unverified') GROUP BY s`).all();
  const info = db.prepare(`UPDATE products SET verification_state = CASE
      WHEN (TRIM(COALESCE(trade_name,''))='' OR TRIM(COALESCE(strength,''))='' OR TRIM(COALESCE(dosage_form,''))=''
        OR TRIM(COALESCE(country,''))='' OR TRIM(COALESCE(barcode,''))='' OR manufacturer_id IS NULL)
      THEN 'incomplete' ELSE 'unverified' END
    WHERE verification_state IN ('incomplete','unverified')`).run();
  const after = db.prepare(`SELECT verification_state s, COUNT(*) n FROM products
    WHERE verification_state IN ('incomplete','unverified') GROUP BY s`).all();
  res.json({ changed: info.changes, before, after });
});

export default router;
