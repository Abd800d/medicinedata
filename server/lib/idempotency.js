/*
 * Idempotent writes for an offline-first client.
 *
 * A phone that loses the network mid-request cannot know whether the server
 * saved the change. The client attaches X-Idempotency-Key; the server stores the
 * first response for that key and replays it on retry, so a queued operation can
 * be retried as many times as needed without creating duplicates.
 *
 * Scope: authenticated, mutating requests only. Keys are per-user and expire
 * after 7 days (an hour would be too short for a phone that was offline a while).
 */
import { db } from '../db.js';

const TTL_DAYS = 7;
const MAX_BODY = 200_000; // never store huge payloads (uploads are excluded anyway)

export function idempotency(req, res, next) {
  const key = String(req.get('X-Idempotency-Key') || '').trim();
  const mutating = ['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method);
  if (!key || !mutating) return next();
  if (key.length < 8 || key.length > 120) {
    return res.status(400).json({ error: 'X-Idempotency-Key غير صالح', code: 'BAD_IDEMPOTENCY_KEY' });
  }
  /* Only authenticated writes: the same key from another account must not replay. */
  if (!req.user) return next();

  const existing = db.prepare(`SELECT * FROM idempotency_keys
    WHERE user_id=? AND key=? AND created_at >= datetime('now', ?)`).get(req.user.id, key, `-${TTL_DAYS} days`);
  if (existing) {
    res.setHeader('X-Idempotent-Replay', '1');
    res.status(existing.status_code || 200);
    try { return res.json(JSON.parse(existing.response_json)); } catch { return res.json({ ok: true, replayed: true }); }
  }

  const originalJson = res.json.bind(res);
  res.json = (payload) => {
    try {
      const body = JSON.stringify(payload);
      if (body && body.length <= MAX_BODY && res.statusCode < 500) {
        db.prepare(`INSERT OR REPLACE INTO idempotency_keys(user_id,key,method,path,status_code,response_json,created_at)
          VALUES(?,?,?,?,?,?,datetime('now'))`).run(
          req.user.id, key, req.method, String(req.originalUrl).slice(0, 300), res.statusCode, body,
        );
      }
    } catch { /* never let bookkeeping break the response */ }
    res.setHeader('X-Idempotency-Key', key);
    return originalJson(payload);
  };
  return next();
}

/** Housekeeping: drop expired keys (called on boot and daily). */
export function pruneIdempotency() {
  try {
    db.prepare(`DELETE FROM idempotency_keys WHERE created_at < datetime('now', ?)`).run(`-${TTL_DAYS} days`);
  } catch { /* table may not exist yet during first boot */ }
}
