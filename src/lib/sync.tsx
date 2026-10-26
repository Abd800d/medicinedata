/*
 * Sync layer: connection state + offline write queue + conflict resolution.
 *
 * The rest of the app talks to `useSync()` instead of calling `api` directly for
 * mutations that must survive a dead network.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { api, getApiBase, getToken } from './api';
import {
  enqueue, flushQueue, readQueue, removeOp, subscribeQueue, updateOp,
  queueSummary, type QueuedOp, type FlushResult,
} from './offlineQueue';

type RunArgs = {
  method: 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  path: string;
  body?: unknown;
  label: string;
  queueable?: boolean;
};

type SyncValue = {
  online: boolean;
  serverUp: boolean;
  syncing: boolean;
  ops: QueuedOp[];
  counts: { pending: number; failed: number; conflicts: number; total: number };
  lastFlush: (FlushResult & { at: number }) | null;
  flush: () => Promise<void>;
  retry: (id: string) => Promise<void>;
  discard: (id: string) => void;
  resolveConflict: (id: string, strategy: 'mine' | 'server') => Promise<void>;
  /** Try now; on a transport failure queue it. Real API errors are rethrown. */
  runOrQueue: <T>(args: RunArgs) => Promise<{ queued: boolean; data?: T }>;
};

const Ctx = createContext<SyncValue | null>(null);

const OFFLINE_MARK = (e: any) => e?.message === 'NETWORK' || e?.name === 'AbortError' || (e instanceof TypeError);

async function sendOp(op: QueuedOp) {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'X-Idempotency-Key': op.idempotencyKey,
  };
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 15_000);
  try {
    const res = await fetch(`${getApiBase()}${op.path}`, {
      method: op.method,
      headers,
      body: op.body === undefined ? undefined : JSON.stringify(op.body),
      signal: ctrl.signal,
    });
    let body: any = null;
    try { body = await res.json(); } catch { /* empty */ }
    return { status: res.status, body };
  } finally {
    clearTimeout(timer);
  }
}

export function SyncProvider({ children }: { children: React.ReactNode }) {
  const [online, setOnline] = useState(() => (typeof navigator === 'undefined' ? true : navigator.onLine !== false));
  const [serverUp, setServerUp] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [ops, setOps] = useState<QueuedOp[]>(() => readQueue());
  const [lastFlush, setLastFlush] = useState<(FlushResult & { at: number }) | null>(null);
  const flushing = useRef(false);

  useEffect(() => subscribeQueue(setOps), []);

  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off); };
  }, []);

  /* Reachability probe — "online" from the OS is not the same as "our server answers". */
  useEffect(() => {
    let alive = true;
    const ping = async () => {
      try {
        const r = await fetch(`${getApiBase()}/api/health`, { method: 'GET' });
        if (alive) setServerUp(r.ok);
      } catch { if (alive) setServerUp(false); }
    };
    ping();
    const t = setInterval(ping, 45_000);
    return () => { alive = false; clearInterval(t); };
  }, []);

  const flush = useCallback(async () => {
    if (flushing.current) return;
    flushing.current = true;
    setSyncing(true);
    try {
      const res = await flushQueue(sendOp);
      setLastFlush({ ...res, at: Date.now() });
    } finally {
      flushing.current = false;
      setSyncing(false);
    }
  }, []);

  /* Auto-sync: when the connection returns, and every 30 s while work is waiting. */
  useEffect(() => {
    if (!online) return;
    if (readQueue().some((o) => o.status === 'pending' || o.status === 'failed')) flush();
  }, [online, flush]);

  useEffect(() => {
    const t = setInterval(() => {
      if (typeof navigator !== 'undefined' && navigator.onLine === false) return;
      if (readQueue().some((o) => o.status === 'pending')) flush();
    }, 30_000);
    return () => clearInterval(t);
  }, [flush]);

  const runOrQueue = useCallback(async <T,>({ method, path, body, label, queueable = true }: RunArgs) => {
    const send = async () => {
      if (method === 'POST') return api.post<T>(path, body);
      if (method === 'PUT') return api.put<T>(path, body);
      if (method === 'PATCH') return api.patch<T>(path, body);
      return api.del<T>(path);
    };
    if (!queueable || (typeof navigator !== 'undefined' && navigator.onLine === false)) {
      enqueue({ method, path, body, label });
      return { queued: true as const };
    }
    try {
      const data = await send();
      return { queued: false as const, data };
    } catch (e: any) {
      if (OFFLINE_MARK(e)) {
        enqueue({ method, path, body, label });
        return { queued: true as const };
      }
      throw e;
    }
  }, []);

  const retry = useCallback(async (id: string) => {
    updateOp(id, { status: 'pending', attempts: 0, error: null });
    await flush();
  }, [flush]);

  const discard = useCallback((id: string) => { removeOp(id); }, []);

  const resolveConflict = useCallback(async (id: string, strategy: 'mine' | 'server') => {
    if (strategy === 'server') { removeOp(id); return; }
    const op = readQueue().find((o) => o.id === id);
    if (!op) return;
    const sep = op.path.includes('?') ? '&' : '?';
    updateOp(id, {
      path: `${op.path.replace(/[?&]force=1$/, '')}${sep}force=1`,
      status: 'pending',
      attempts: 0,
      error: null,
      conflict: null,
      /* a fresh key: the previous attempt may already have been stored server-side */
      idempotencyKey: `${op.idempotencyKey}-f`,
    });
    await flush();
  }, [flush]);

  const counts = useMemo(() => queueSummary(ops), [ops]);

  /* Queue is dropped on logout (it belongs to the previous account). */
  useEffect(() => {
    const onLogout = () => { for (const o of readQueue()) removeOp(o.id); };
    window.addEventListener('mda:logout', onLogout);
    return () => window.removeEventListener('mda:logout', onLogout);
  }, []);

  const value: SyncValue = {
    online, serverUp, syncing, ops, counts, lastFlush, flush, retry, discard, resolveConflict, runOrQueue,
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useSync(): SyncValue {
  const v = useContext(Ctx);
  if (!v) throw new Error('useSync must be used inside <SyncProvider>');
  return v;
}
