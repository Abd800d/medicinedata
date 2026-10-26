/*
 * Offline write queue (outbox).
 *
 * Design rules:
 *   • Writes are attempted immediately when the device looks online; only a
 *     network failure puts the operation in the queue. A server rejection
 *     (400/403/409) is NOT queued — it is a real answer, not a lost request.
 *   • Every queued operation carries a stable idempotency key, so retries can
 *     never create duplicates on the server.
 *   • Operations are stored in localStorage because they are small JSON bodies.
 *     Photo uploads are deliberately NOT queued (a blob would not survive), and
 *     the UI says so instead of pretending.
 *   • Per-operation status is visible: pending · syncing · failed · conflict · done.
 */

export type OpStatus = 'pending' | 'syncing' | 'failed' | 'conflict' | 'done';

export type QueuedOp = {
  id: string;
  method: 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  path: string;
  body?: unknown;
  label: string;
  createdAt: number;
  updatedAt: number;
  attempts: number;
  status: OpStatus;
  error?: string | null;
  statusCode?: number;
  conflict?: unknown;
  idempotencyKey: string;
};

const KEY = 'mda.outbox.v1';
const MAX_OPS = 200;
const MAX_ATTEMPTS = 6;

type Listener = (ops: QueuedOp[]) => void;
const listeners = new Set<Listener>();

const uid = () => {
  const rnd = typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  return rnd;
};

export function readQueue(): QueuedOp[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr.filter((o) => o && o.id && o.status !== 'done') : [];
  } catch { return []; }
}

function writeQueue(ops: QueuedOp[]) {
  const trimmed = ops.slice(-MAX_OPS);
  try { localStorage.setItem(KEY, JSON.stringify(trimmed)); } catch { /* quota — keep going */ }
  for (const l of listeners) { try { l(trimmed); } catch { /* ignore */ } }
}

export function subscribeQueue(fn: Listener): () => void {
  listeners.add(fn);
  fn(readQueue());
  return () => listeners.delete(fn);
}

export function enqueue({ method, path, body, label }: { method: QueuedOp['method']; path: string; body?: unknown; label: string }): QueuedOp {
  const now = Date.now();
  const op: QueuedOp = {
    id: uid(),
    method,
    path,
    body,
    label,
    createdAt: now,
    updatedAt: now,
    attempts: 0,
    status: 'pending',
    error: null,
    idempotencyKey: uid(),
  };
  writeQueue([...readQueue(), op]);
  return op;
}

export function updateOp(id: string, patch: Partial<QueuedOp>) {
  const ops = readQueue().map((o) => (o.id === id ? { ...o, ...patch, updatedAt: Date.now() } : o));
  writeQueue(ops);
}

export function removeOp(id: string) {
  writeQueue(readQueue().filter((o) => o.id !== id));
}

export function clearDone() {
  writeQueue(readQueue().filter((o) => o.status !== 'done'));
}

export const pendingCount = () => readQueue().filter((o) => o.status === 'pending' || o.status === 'syncing').length;
export const failedCount = () => readQueue().filter((o) => o.status === 'failed' || o.status === 'conflict').length;
export const conflictCount = () => readQueue().filter((o) => o.status === 'conflict').length;

export type FlushResult = { sent: number; failed: number; conflicts: number; stillOffline: boolean };

/**
 * Send every pending operation in order.
 * @param send  performs the HTTP call; must throw {network: true} for transport errors.
 */
export async function flushQueue(send: (op: QueuedOp) => Promise<{ status: number; body: any }>): Promise<FlushResult> {
  const result: FlushResult = { sent: 0, failed: 0, conflicts: 0, stillOffline: false };
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    return { ...result, stillOffline: true };
  }
  const ops = readQueue().filter((o) => o.status === 'pending' || o.status === 'failed');
  for (const op of ops) {
    updateOp(op.id, { status: 'syncing' });
    try {
      const res = await send(op);
      if (res.status >= 200 && res.status < 300) {
        updateOp(op.id, { status: 'done', error: null, statusCode: res.status });
        result.sent++;
        removeOp(op.id);
      } else if (res.status === 409) {
        updateOp(op.id, { status: 'conflict', conflict: res.body, error: res.body?.error || 'تعارض', statusCode: 409 });
        result.conflicts++;
      } else if (res.status === 408 || res.status === 429 || res.status >= 500) {
        result.failed++;
        updateOp(op.id, {
          status: op.attempts + 1 >= MAX_ATTEMPTS ? 'failed' : 'pending',
          attempts: op.attempts + 1,
          statusCode: res.status,
          error: res.body?.error || `HTTP ${res.status}`,
        });
      } else {
        /* 4xx: the server understood and refused. Retrying will not help. */
        result.failed++;
        updateOp(op.id, { status: 'failed', attempts: op.attempts + 1, statusCode: res.status, error: res.body?.error || `HTTP ${res.status}` });
      }
    } catch (e: any) {
      /* Transport failure: stop the whole flush, keep everything pending. */
      updateOp(op.id, { status: 'pending', attempts: op.attempts + 1, error: 'لا يوجد اتصال' });
      return { ...result, stillOffline: true };
    }
  }
  return result;
}

/** Human-readable summary for the sync badge. */
export function queueSummary(ops: QueuedOp[]) {
  return {
    pending: ops.filter((o) => o.status === 'pending' || o.status === 'syncing').length,
    failed: ops.filter((o) => o.status === 'failed').length,
    conflicts: ops.filter((o) => o.status === 'conflict').length,
    total: ops.length,
  };
}
