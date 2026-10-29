/*
 * Verification workflow (v1.13.0) — the write side of the six states.
 *
 * Everything that changes a verification state goes through `applyChange()`:
 *   1. the row is read (never trusted from the request),
 *   2. lib/verification.js decides whether the change is legal, evidenced and permitted,
 *   3. the row, an immutable event and the audit chain are written in ONE transaction.
 *
 * The transaction matters: a state that changed without an event (or an event without the
 * change) would make "who verified this and when" unanswerable — the exact question the plan
 * says must always have an answer.
 */
import { db } from '../db.js';
import { audit } from './audit.js';
import {
  STATES, REVIEW_STATUSES, STATE_META, REVIEW_META, SOURCE_KINDS, SOURCE_KIND_LABELS,
  effectiveState, validateChange, missingFields, mirrorVerified, isSourceKind,
} from './verification.js';

const TABLES = { products: 'products', drugs: 'drugs' };
export const isEntity = (e) => Object.prototype.hasOwnProperty.call(TABLES, e);

export function getRecord(entity, id) {
  if (!isEntity(entity)) return null;
  return db.prepare(`SELECT * FROM ${TABLES[entity]} WHERE id=?`).get(Number(id));
}

export function listSources(entity, id) {
  return db.prepare(`SELECT s.*, u.name AS added_by_name
    FROM source_documents s LEFT JOIN users u ON u.id=s.added_by
    WHERE s.entity=? AND s.entity_id=? ORDER BY s.created_at DESC, s.id DESC`).all(entity, Number(id));
}

export function sourcesFor(entity, id) {
  return db.prepare('SELECT kind FROM source_documents WHERE entity=? AND entity_id=?').all(entity, Number(id));
}

export function addSource({ entity, entityId, kind, title, issuer, url, filePath, issuedAt, actor }) {
  if (!isEntity(entity)) return { error: 'unknown entity', status: 400 };
  if (!isSourceKind(kind)) return { error: 'نوع مستند غير معروف / Unknown document kind', status: 422 };
  const cleanTitle = String(title || '').trim();
  if (cleanTitle.length < 3) return { error: 'عنوان المستند مطلوب / A document title is required', status: 422 };
  if (!String(url || '').trim() && !String(filePath || '').trim()) {
    return { error: 'المستند يحتاج رابطًا أو ملفًا / A document needs a URL or a file', status: 422 };
  }
  const info = db.prepare(`INSERT INTO source_documents(entity,entity_id,kind,title,issuer,url,file_path,issued_at,added_by)
    VALUES(?,?,?,?,?,?,?,?,?)`).run(
    entity, Number(entityId), kind, cleanTitle, String(issuer || '').trim() || null,
    String(url || '').trim() || null, String(filePath || '').trim() || null,
    String(issuedAt || '').trim() || null, actor?.id ?? null,
  );
  audit('verification.source_added', {
    actor, targetType: entity, targetId: entityId,
    meta: { kind, title: cleanTitle, source_id: info.lastInsertRowid },
  });
  return { id: Number(info.lastInsertRowid) };
}

export function removeSource({ id, actor }) {
  const row = db.prepare('SELECT * FROM source_documents WHERE id=?').get(Number(id));
  if (!row) return { error: 'not found', status: 404 };
  db.prepare('DELETE FROM source_documents WHERE id=?').run(row.id);
  audit('verification.source_removed', {
    actor, targetType: row.entity, targetId: row.entity_id,
    meta: { kind: row.kind, title: row.title, source_id: row.id },
  });
  return { ok: true };
}

/**
 * Apply a verification change.
 * @returns {{ok:true, state, review, event_id}} | {{ok:false, status, error, code?, accepted_kinds?}}
 */
export function applyChange({ entity, id, actor, role, requestedState, requestedReview, note, ip }) {
  const record = getRecord(entity, id);
  if (!record) return { ok: false, status: 404, error: 'السجل غير موجود / Record not found' };
  if (!actor) return { ok: false, status: 401, error: 'يجب تسجيل الدخول / Login required' };

  const missing = missingFields(record, entity);
  const verdict = validateChange({
    row: record, entity, role: role || actor.role || 'user',
    requestedState, requestedReview, note, sources: sourcesFor(entity, id),
  });
  if (!verdict.ok) return verdict;

  const reviewedAt = new Date().toISOString().replace('T', ' ').slice(0, 19);
  const stateChanged = verdict.to !== verdict.from;
  const reviewChanged = verdict.review !== (record.review_status || 'none');
  if (!stateChanged && !reviewChanged) {
    return { ok: false, status: 409, code: 'NO_CHANGE', error: 'لا تغيير في الحالة أو المراجعة / Nothing changed' };
  }

  const tx = db.transaction(() => {
    db.prepare(`UPDATE ${TABLES[entity]} SET verification_state=?, review_status=?, reviewer_id=?, reviewed_at=?,
        review_note=?, verified=?, updated_at=datetime('now') WHERE id=?`).run(
      verdict.to, verdict.review, actor.id, reviewedAt,
      String(note || '').trim() || record.review_note || null,
      mirrorVerified(verdict.to), record.id,
    );
    const ev = db.prepare(`INSERT INTO verification_events
        (entity, entity_id, from_state, to_state, from_review, to_review, actor_id, note)
        VALUES (?,?,?,?,?,?,?,?)`).run(
      entity, record.id, verdict.from, verdict.to,
      record.review_status || 'none', verdict.review, actor.id, String(note || '').trim() || null,
    );
    audit(`verification.${verdict.to}`, {
      actor, targetType: entity, targetId: record.id, ip,
      meta: {
        from: verdict.from, to: verdict.to,
        review_from: record.review_status || 'none', review_to: verdict.review,
        correction: verdict.correction, note: String(note || '').trim() || null,
      },
    });
    return Number(ev.lastInsertRowid);
  });

  const eventId = tx();
  return { ok: true, state: verdict.to, review: verdict.review, from: verdict.from, event_id: eventId, at: reviewedAt };
}

export function history(entity, id, limit = 50) {
  return db.prepare(`SELECT e.*, u.name AS actor_name, u.email AS actor_email
    FROM verification_events e LEFT JOIN users u ON u.id=e.actor_id
    WHERE e.entity=? AND e.entity_id=? ORDER BY e.id DESC LIMIT ?`).all(entity, Number(id), Math.min(200, Number(limit) || 50));
}

/** Full picture for one record: state, reviewer, documents, history and what is still missing. */
export function detail(entity, id) {
  const record = getRecord(entity, id);
  if (!record) return null;
  const missing = missingFields(record, entity);
  const state = effectiveState(record, missing);
  const sources = listSources(entity, id);
  const reviewer = record.reviewer_id
    ? db.prepare('SELECT id, name, email, role FROM users WHERE id=?').get(record.reviewer_id)
    : null;
  return {
    entity,
    id: record.id,
    title: entity === 'products' ? record.trade_name : record.generic_name,
    state,
    state_meta: STATE_META[state],
    review: record.review_status || 'none',
    review_meta: REVIEW_META[record.review_status || 'none'],
    reviewed_at: record.reviewed_at || null,
    review_note: record.review_note || null,
    reviewer: reviewer ? { id: reviewer.id, name: reviewer.name, role: reviewer.role } : null,
    missing_fields: missing,
    missing_labels_ar: missing.map(missingFieldLabel),
    sources,
    events: history(entity, id, 20),
  };
}

/* Arabic labels for missing fields, kept next to the check that produces them. */
const FIELD_AR = {
  trade_name: 'الاسم التجاري', strength: 'القوة', dosage_form: 'الشكل الصيدلاني',
  country: 'بلد التسويق', barcode: 'الباركود', manufacturer_id: 'الشركة المصنعة',
  generic_name: 'الاسم العلمي', indications_en: 'الدواعي', dosage_adult: 'جرعة البالغين', warnings: 'التحذيرات',
};
export const missingFieldLabel = (f) => FIELD_AR[f] || f;

/** Persist the self-healed open state after an edit/import, so SQL filters keep matching the UI. */
export function refreshState(entity, id) {
  if (!isEntity(entity)) return null;
  const row = getRecord(entity, id);
  if (!row) return null;
  const missing = missingFields(row, entity);
  const state = effectiveState(row, missing);
  if (state !== row.verification_state) {
    db.prepare(`UPDATE ${TABLES[entity]} SET verification_state=?, verified=? WHERE id=?`)
      .run(state, mirrorVerified(state), row.id);
  }
  return state;
}

/**
 * The queue: what still needs a human. Ordered so the most consequential record is first
 * (pending review, then incomplete data, then unverified), and always paged — a queue that
 * silently truncates is a queue that hides work.
 */
export function queue({ state = '', review = '', q = '', page = 1, limit = 30 } = {}) {
  const per = Math.min(100, Math.max(1, Number(limit) || 30));
  const current = Math.max(1, Number(page) || 1);
  const where = [];
  const params = [];
  if (state && STATES.includes(state)) { where.push('p.verification_state = ?'); params.push(state); }
  if (review && REVIEW_STATUSES.includes(review)) { where.push("COALESCE(p.review_status,'none') = ?"); params.push(review); }
  if (q) {
    where.push('(p.trade_name LIKE ? OR p.trade_name_ar LIKE ? OR p.search_norm LIKE ?)');
    const like = `%${String(q).trim()}%`;
    params.push(like, like, like);
  }
  const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const total = db.prepare(`SELECT COUNT(*) n FROM products p ${clause}`).get(...params).n;
  /* Pending work first, then rejected (someone must look again), then everything else;
     inside each group the emptiest records come first because they need the most typing. */
  const rows = db.prepare(`SELECT p.id, p.trade_name, p.trade_name_ar, p.strength, p.dosage_form, p.country,
      p.image_url, p.verification_state, p.review_status, p.reviewed_at, p.review_note, p.reviewer_id,
      d.generic_name
    FROM products p LEFT JOIN drugs d ON d.id = p.drug_id ${clause}
    ORDER BY CASE COALESCE(p.review_status,'none') WHEN 'pending' THEN 0 WHEN 'rejected' THEN 1 ELSE 2 END,
      CASE COALESCE(p.verification_state,'unverified') WHEN 'incomplete' THEN 0 WHEN 'unverified' THEN 1 ELSE 2 END,
      p.id DESC LIMIT ? OFFSET ?`).all(...params, per, (current - 1) * per);

  const drugWhere = state && STATES.includes(state) ? 'WHERE verification_state = ?' : '';
  const drugRows = db.prepare(`SELECT id, generic_name, generic_ar, verification_state, review_status, reviewed_at
    FROM drugs ${drugWhere}
    ORDER BY CASE COALESCE(review_status,'none') WHEN 'pending' THEN 0 ELSE 1 END, id DESC LIMIT ?`)
    .all(...(drugWhere ? [state] : []), per);

  return {
    total, page: current, pages: Math.max(1, Math.ceil(total / per)),
    items: rows.map((r) => ({ ...r, missing_fields: missingFields(r, 'products') })),
    drugs: drugRows.map((d) => ({ ...d, missing_fields: missingFields(d, 'drugs') })),
  };
}

/** Counts for the admin badge and the dashboard checks. */
export function summary() {
  const byState = Object.fromEntries(STATES.map((s) => [s, 0]));
  for (const row of db.prepare("SELECT COALESCE(verification_state,'unverified') s, COUNT(*) n FROM products GROUP BY s").all()) {
    byState[row.s] = (byState[row.s] || 0) + row.n;
  }
  const review = { none: 0, pending: 0, approved: 0, rejected: 0 };
  for (const row of db.prepare("SELECT COALESCE(review_status,'none') s, COUNT(*) n FROM products GROUP BY s").all()) {
    review[row.s] = (review[row.s] || 0) + row.n;
  }
  const total = db.prepare('SELECT COUNT(*) n FROM products').get().n;
  const incomplete = db.prepare(`SELECT COUNT(*) n FROM products WHERE verification_state='incomplete'`).get().n;
  const drugs = Object.fromEntries(STATES.map((s) => [s, 0]));
  for (const row of db.prepare("SELECT COALESCE(verification_state,'unverified') s, COUNT(*) n FROM drugs GROUP BY s").all()) {
    drugs[row.s] = (drugs[row.s] || 0) + row.n;
  }
  return {
    products: { total, states: byState, review, incomplete },
    drugs: { total: db.prepare('SELECT COUNT(*) n FROM drugs').get().n, states: drugs },
    sources: db.prepare('SELECT COUNT(*) n FROM source_documents').get().n,
    events: db.prepare('SELECT COUNT(*) n FROM verification_events').get().n,
    labels: { states: STATE_META, review: REVIEW_META, source_kinds: SOURCE_KIND_LABELS, kinds: SOURCE_KINDS },
  };
}
