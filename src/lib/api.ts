import { isLocalPath, loadLocal, localArt, localServe, setServerReachable, setServerWaking, getServerWaking } from './localcatalog';
import { fallbackServer, normalizeServer, serverFromQuery } from './server';
import { nativeAvailable, nativeFetch } from './nativeHttp';

export class ApiError extends Error {
  status: number;
  constructor(message: string, status = 0) {
    super(message);
    this.status = status;
  }
}

const TOKEN_KEY = 'mda.token';
const BASE_KEY = 'mda.apiBase';

export const getToken = () => localStorage.getItem(TOKEN_KEY);
export const setToken = (t: string | null) => (t ? localStorage.setItem(TOKEN_KEY, t) : localStorage.removeItem(TOKEN_KEY));
/*
 * Resolution order: ?server= (this session) → saved choice → build/env default → the
 * baked server in the Android shell (relative URLs on the web deployment).
 */
const QUERY_BASE = serverFromQuery();

export const getApiBase = () =>
  QUERY_BASE || normalizeServer(localStorage.getItem(BASE_KEY)) || fallbackServer();

/** Explicit choice made by the user (shown in الإعدادات); '' means "use the default". */
export const getSavedApiBase = () => normalizeServer(localStorage.getItem(BASE_KEY));

export const setApiBase = (b: string) => {
  const clean = normalizeServer(b);
  if (clean) localStorage.setItem(BASE_KEY, clean);
  else localStorage.removeItem(BASE_KEY);
};

/** Where the app actually points right now, for display/diagnostics. */
export const describeApiBase = () => {
  if (QUERY_BASE) return { base: QUERY_BASE, source: 'query' as const };
  const saved = getSavedApiBase();
  if (saved) return { base: saved, source: 'saved' as const };
  const fallback = fallbackServer();
  return { base: fallback, source: fallback ? ('default' as const) : ('same-origin' as const) };
};

const buildUrl = (path: string, params?: Record<string, unknown>) => {
  const base = getApiBase();
  const url = new URL(`${base}${path}`, base ? window.location.origin : window.location.origin);
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      if (v === undefined || v === null || v === '') continue;
      url.searchParams.set(k, String(v));
    }
  }
  return base ? url.toString() : url.pathname + url.search;
};

/* How long to wait for the backend before serving the built-in catalogue.
   Short, because a phone with no configured server should never stare at spinners. */
const NET_TIMEOUT = 2600;
/* Cold starts: a hosted free-tier server can take ~30–60 s to boot after idling. The
   first call from a native shell therefore gets a longer budget, and a timeout is
   reported as "waking" instead of "offline" so the UI can explain it. */
const COLD_START_TIMEOUT = 25_000;
/* After a failure, skip the network entirely for this long (fast, quiet offline mode). */
const RETRY_AFTER = 25_000;
let backendDownUntil = 0;
let probedColdStart = false;

/** One long, patient attempt per session before declaring the backend down. */
async function wakeBackend(): Promise<boolean> {
  if (probedColdStart) return false;
  probedColdStart = true;
  try {
    setServerWaking(true);
    const res = await fetchWithTimeout(buildUrl('/api/health'), { headers: { Accept: 'application/json' } }, COLD_START_TIMEOUT);
    if (!res.ok) return false;
    setServerReachable(true);
    backendDownUntil = 0;
    return true;
  } catch {
    return false;
  } finally {
    setServerWaking(false);
  }
}

const backendKnownDown = () => Date.now() < backendDownUntil;

function localAnswer<T>(path: string, params?: Record<string, unknown>): T | undefined {
  try {
    const out = localServe(path, params as Record<string, any>);
    return out as T | undefined;
  } catch { return undefined; }
}

/* The bridge is only worth falling back from when the *plugin* is missing or refuses the
   call — a network error must stay a network error (otherwise offline mode gets slow). */
function bridgeUnusable(e: unknown): boolean {
  const message = String((e as Error)?.message || e || '');
  return /native-http-unavailable|not implemented|plugin .*not found|not found.*plugin/i.test(message);
}

async function browserFetch(url: string, init: RequestInit, timeout: number): Promise<Response> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeout);
  try {
    return await fetch(url, { ...init, signal: ctrl.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function fetchWithTimeout(url: string, init: RequestInit, timeout = NET_TIMEOUT): Promise<Response> {
  /* Android shell: go through the native bridge, which is not subject to the same-origin
     policy. That is what lets the app talk to a deployed server that predates our CORS
     headers — no redeploy, no proxy, and no silent fall back to the bundled catalogue. */
  if (nativeAvailable() && /^https?:\/\//i.test(url)) {
    try {
      return await nativeFetch(url, init, Math.max(timeout, 10_000));
    } catch (e) {
      const err = e as Error;
      if (err?.name === 'AbortError' || /timeout/i.test(String(err?.message))) {
        const t = new Error('timeout');
        t.name = 'AbortError';
        throw t;
      }
      /* Last line of defence: if the native plugin is not available on this device/build,
         use the WebView's own fetch instead of declaring the backend unreachable. */
      if (!bridgeUnusable(e)) throw e;
      return browserFetch(url, init, timeout);
    }
  }
  return browserFetch(url, init, timeout);
}

async function request<T>(path: string, options: RequestInit & { params?: Record<string, unknown>; timeoutMs?: number } = {}): Promise<T> {
  const { params, timeoutMs, ...init } = options;
  /* Long-running calls (AI analysis) get their own budget and must not mark the
     whole backend as down just because one slow request was aborted. */
  const slowCall = (timeoutMs || 0) > NET_TIMEOUT;
  const method = (init.method || 'GET').toUpperCase();
  const canBeLocal = method === 'GET' && isLocalPath(path);
  const headers = new Headers(init.headers || {});
  const token = getToken();
  if (token) headers.set('Authorization', `Bearer ${token}`);
  if (!(init.body instanceof FormData) && init.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }
  /* Built-in data: skip the network entirely when we already know it is unreachable,
     or when the app was never pointed at a server. */
  if (canBeLocal && (backendKnownDown() || navigator.onLine === false)) {
    await loadLocal();
    const cached = localAnswer<T>(path, params);
    if (cached !== undefined) return cached;
  }

  let res: Response;
  try {
    res = await fetchWithTimeout(buildUrl(path, params), { ...init, headers }, timeoutMs);
    setServerReachable(true);
    if (!slowCall) backendDownUntil = 0;
  } catch {
    /* A timeout from a hosted server is usually a cold start (free tiers sleep), not an
       outage: give it one patient attempt before showing the built-in catalogue. */
    if (!slowCall && fallbackServer() && (await wakeBackend())) {
      try {
        res = await fetchWithTimeout(buildUrl(path, params), { ...init, headers }, timeoutMs);
        setServerReachable(true);
        backendDownUntil = 0;
      } catch {
        setServerReachable(false);
        backendDownUntil = Date.now() + RETRY_AFTER;
        if (canBeLocal) {
          await loadLocal();
          const fallback = localAnswer<T>(path, params);
          if (fallback !== undefined) return fallback;
        }
        throw new ApiError('NETWORK', 0);
      }
    } else {
      if (!slowCall) { setServerReachable(false); backendDownUntil = Date.now() + RETRY_AFTER; }
      if (canBeLocal) {
        await loadLocal();
        const fallback = localAnswer<T>(path, params);
        if (fallback !== undefined) return fallback;
      }
      throw new ApiError('NETWORK', 0);
    }
  }
  const resType = res.headers.get('content-type') || '';
  /* A server that answers but is not our API (static host / SPA fallback) → use the bundle */
  if (canBeLocal && res.ok && !resType.includes('application/json')) {
    await loadLocal();
    const fallback = localAnswer<T>(path, params);
    if (fallback !== undefined) { setServerReachable(false); return fallback; }
  }
  /* A static host (or a half-configured server) answers /api/... with HTML/404:
     that is "no backend", not "data missing" — serve the bundled catalogue instead. */
  if (!res.ok && canBeLocal && (res.status >= 500 || !resType.includes('application/json'))) {
    await loadLocal();
    const fallback = localAnswer<T>(path, params);
    if (fallback !== undefined) { setServerReachable(false); return fallback; }
  }
  if (!res.ok) {
    let message = res.status === 401 ? 'UNAUTHORIZED' : 'SERVER';
    try {
      const data = await res.json();
      message = data?.error || data?.message || message;
    } catch { /* ignore */ }
    if (res.status === 401) setToken(null);
    throw new ApiError(message, res.status);
  }
  if (res.status === 204) return undefined as T;
  if (resType.includes('application/json')) return res.json() as Promise<T>;
  return (await res.text()) as unknown as T;
}

export const api = {
  get: <T>(path: string, params?: Record<string, unknown>) => request<T>(path, { params }),
  post: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: 'POST', body: body instanceof FormData ? body : JSON.stringify(body ?? {}) }),
  put: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: 'PUT', body: body instanceof FormData ? body : JSON.stringify(body ?? {}) }),
  patch: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: 'PATCH', body: JSON.stringify(body ?? {}) }),
  del: <T>(path: string) => request<T>(path, { method: 'DELETE' }),
  /** For AI routes: analysis can legitimately take 30–60 s on a phone connection. */
  slow: {
    post: <T>(path: string, body?: unknown) =>
      request<T>(path, {
        method: 'POST',
        body: body instanceof FormData ? body : JSON.stringify(body ?? {}),
        timeoutMs: 120_000,
      }),
    get: <T>(path: string, params?: Record<string, unknown>) =>
      request<T>(path, { params, timeoutMs: 20_000 }),
    patch: <T>(path: string, body?: unknown) =>
      request<T>(path, { method: 'PATCH', body: JSON.stringify(body ?? {}), timeoutMs: 30_000 }),
  },
};

export const imgUrl = (p?: { image_url?: string | null } | string | null, fallbackId?: number) => {
  const src = typeof p === 'string' ? p : p?.image_url;
  if (src) return assetUrl(src);
  /* No photo: draw the same procedural pack art locally instead of hitting the server */
  const art = fallbackId ? localArt(fallbackId) : undefined;
  if (art) return art;
  return fallbackId ? `${getApiBase()}/api/catalog/product-image/${fallbackId}.svg` : '';
};

const STATIC_PATH = /^\/(seed-images|icons|assets|data)\//;

export const assetUrl = (path?: string | null) => {
  if (!path) return '';
  if (/^https?:/i.test(path)) return path;
  /* Assets that ship inside the app bundle are always relative — they must load offline. */
  if (STATIC_PATH.test(path)) return path;
  return `${getApiBase()}${path}`;
};
