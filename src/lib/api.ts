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
export const getApiBase = () => localStorage.getItem(BASE_KEY) || (import.meta as any).env?.VITE_API_BASE || '';
export const setApiBase = (b: string) => localStorage.setItem(BASE_KEY, b.replace(/\/$/, ''));

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

async function request<T>(path: string, options: RequestInit & { params?: Record<string, unknown> } = {}): Promise<T> {
  const { params, ...init } = options;
  const headers = new Headers(init.headers || {});
  const token = getToken();
  if (token) headers.set('Authorization', `Bearer ${token}`);
  if (!(init.body instanceof FormData) && init.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }
  let res: Response;
  try {
    res = await fetch(buildUrl(path, params), { ...init, headers });
  } catch {
    throw new ApiError('NETWORK', 0);
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
  const type = res.headers.get('content-type') || '';
  if (type.includes('application/json')) return res.json() as Promise<T>;
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
};

export const imgUrl = (p?: { image_url?: string | null } | string | null, fallbackId?: number) => {
  const base = getApiBase();
  if (typeof p === 'string' && p) return p.startsWith('http') ? p : `${base}${p}`;
  if (p && typeof p === 'object' && p.image_url) return p.image_url.startsWith('http') ? p.image_url : `${base}${p.image_url}`;
  if (fallbackId) return `${base}/api/catalog/product-image/${fallbackId}.svg`;
  return '';
};

export const assetUrl = (path?: string | null) => {
  if (!path) return '';
  if (/^https?:/i.test(path)) return path;
  return `${getApiBase()}${path}`;
};
