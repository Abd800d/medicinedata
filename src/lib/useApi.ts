import { useCallback, useEffect, useRef, useState } from 'react';
import { api, ApiError } from './api';

const memory = new Map<string, { at: number; data: unknown }>();

export function useApi<T>(path: string | null, params?: Record<string, unknown>, opts: { ttl?: number; enabled?: boolean } = {}) {
  const { ttl = 60_000, enabled = true } = opts;
  const privatePath = !!path && /^\/api\/(admin|auth|community|prescriptions|ai|rx)\//.test(path);
  const key = path ? path + '?' + JSON.stringify(params || {}) : '';
  const [data, setData] = useState<T | null>(() => {
    if (!key || /^\/api\/(admin|auth|community|prescriptions|ai|rx)\//.test(key)) return null;
    const cached = memory.get(key);
    return cached && Date.now() - cached.at < ttl ? (cached.data as T) : null;
  });
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(enabled && !!path && !data);
  const mounted = useRef(true);

  const load = useCallback(async (force = false) => {
    if (!path || !enabled) return;
    const cached = privatePath ? null : memory.get(key);
    if (!force && cached && Date.now() - cached.at < ttl) { setData(cached.data as T); setLoading(false); return; }
    setLoading(true);
    setError(null);
    try {
      const res = await api.get<T>(path, params);
      if (!mounted.current) return;
      if (!privatePath) memory.set(key, { at: Date.now(), data: res });
      setData(res);
    } catch (e) {
      if (!mounted.current) return;
      const err = e as ApiError;
      setError(err.message === 'NETWORK' ? 'NETWORK' : err.message);
    } finally {
      if (mounted.current) setLoading(false);
    }
  }, [key, path, enabled, ttl, privatePath, JSON.stringify(params || {})]);

  useEffect(() => {
    mounted.current = true;
    load();
    return () => { mounted.current = false; };
  }, [load]);

  return { data, error, loading, reload: () => load(true), setData };
}

export function invalidate(prefix: string) {
  for (const k of Array.from(memory.keys())) if (k.startsWith(prefix)) memory.delete(k);
}

export function clearApiCache() { memory.clear(); }
