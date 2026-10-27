/*
 * Native HTTP transport for the Android shell.
 *
 * Why this exists: inside the WebView the app runs on `https://localhost`, so every call
 * to the hosted API is cross-origin. A browser (and therefore a WebView) blocks the
 * *response* unless the server sends CORS headers — and a server that was deployed before
 * v1.8.2 sends none, so the app fell back to its built-in catalogue and login/AI looked
 * broken while the API itself was healthy.
 *
 * Capacitor ships a native HTTP plugin that performs the request in Java (OkHttp /
 * HttpURLConnection). Native requests are not subject to the same-origin policy, so the
 * app can reach ANY deployed version of the server, without redeploying it and without a
 * proxy. This module wraps that plugin in a `Response` so the rest of the code keeps
 * using plain `fetch` semantics.
 *
 * On the web this module is inert: `nativeAvailable()` is false and callers keep using
 * the browser's own fetch (same-origin, no CORS needed).
 */
import { Capacitor, CapacitorHttp } from '@capacitor/core';

type Parts = { data: unknown; dataType?: 'formData' | 'text' | 'json' };

export type NativeResponse = { status: number; headers?: Record<string, string>; data?: unknown };
export type NativeRequestOptions = Record<string, unknown>;
export type NativeTransport = (options: NativeRequestOptions) => Promise<NativeResponse>;

/** Inverse of readAsBase64 — used for downloads (backups, exports, CSV). */
function base64ToBytes(base64: string): Uint8Array {
  /* Android's Base64.DEFAULT wraps the string at 76 chars, so strip the line breaks
     before decoding (atob itself is forgiving, but being explicit avoids surprises). */
  const binary = atob(base64.replace(/\s+/g, ''));
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
}

/* Test seams. Null = real behaviour (Capacitor). They exist so the transport can be
   exercised in Node, where there is no Android bridge; production never calls them. */
let transportOverride: NativeTransport | null = null;
let platformOverride: boolean | null = null;

export function __setNativeTransport(fn: NativeTransport | null): void {
  transportOverride = fn;
}

export function __setNativePlatform(flag: boolean | null): void {
  platformOverride = flag;
}

function isNativePlatform(): boolean {
  if (platformOverride !== null) return platformOverride;
  try {
    return Boolean(Capacitor?.isNativePlatform?.());
  } catch {
    return false;
  }
}

function transport(): NativeTransport | null {
  if (transportOverride) return transportOverride;
  try {
    const plugin = CapacitorHttp as unknown as { request?: NativeTransport };
    return typeof plugin?.request === 'function' ? plugin.request.bind(plugin) : null;
  } catch {
    return null;
  }
}

/** True only inside the Android/iOS shell where the native bridge exists. */
export function nativeAvailable(): boolean {
  if (!isNativePlatform()) return false;
  return transportOverride !== null || transport() !== null;
}

function headersToObject(headers: Headers): Record<string, string> {
  const out: Record<string, string> = {};
  headers.forEach((value, key) => { out[key] = value; });
  return out;
}

/** Read a Blob/File as raw base64 (no data: prefix) — what the Android plugin wants. */
const readAsBase64 = async (file: Blob): Promise<string> => {
  const blob = file as Blob & { arrayBuffer?: () => Promise<ArrayBuffer> };
  if (typeof blob.arrayBuffer === 'function') {
    const bytes = new Uint8Array(await blob.arrayBuffer());
    let binary = '';
    const CHUNK = 0x8000; /* 32 KiB keeps String.fromCharCode away from arg limits */
    for (let i = 0; i < bytes.length; i += CHUNK) {
      binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
    }
    return btoa(binary);
  }
  /* Very old WebViews without Blob.arrayBuffer(): FileReader is the only way. */
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const result = String(reader.result || '');
      const comma = result.indexOf(',');
      resolve(comma >= 0 ? result.slice(comma + 1) : result);
    };
    reader.onerror = () => reject(reader.error || new Error('read-failed'));
    reader.readAsDataURL(file);
  });
};

/**
 * Convert a browser FormData into the array shape the Android plugin expects
 * ({key, value, type: 'string' | 'base64File', contentType, fileName}).
 * Exported for tests: file parts are encoded as base64 by the caller.
 */
export async function formDataToParts(form: FormData): Promise<Array<Record<string, unknown>>> {
  const parts: Array<Record<string, unknown>> = [];
  for (const [key, raw] of form.entries()) {
    const value = raw as unknown;
    if (typeof Blob !== 'undefined' && value instanceof Blob) {
      const file = value as File;
      parts.push({
        key,
        value: await readAsBase64(file),
        type: 'base64File',
        contentType: file.type || 'application/octet-stream',
        fileName: file.name || `${key}.bin`,
      });
    } else {
      parts.push({ key, value: String(value), type: 'string' });
    }
  }
  return parts;
}

/** Build the plugin payload for a given RequestInit. */
export async function buildParts(init: RequestInit): Promise<Parts> {
  const body = init.body;
  if (body === undefined || body === null) return { data: null };
  if (typeof FormData !== 'undefined' && body instanceof FormData) {
    return { data: await formDataToParts(body), dataType: 'formData' };
  }
  if (typeof body === 'string') return { data: body, dataType: 'text' };
  if (body instanceof URLSearchParams) return { data: body.toString(), dataType: 'text' };
  if (typeof Blob !== 'undefined' && body instanceof Blob) {
    return { data: await readAsBase64(body), dataType: 'text' };
  }
  /* Anything else (ArrayBuffer views) → decode as text; the server only takes JSON/forms. */
  try {
    return { data: new TextDecoder().decode(body as ArrayBuffer), dataType: 'text' };
  } catch {
    return { data: null };
  }
}

/**
 * Perform a request through the native bridge and return a real `Response`.
 * `timeoutMs` maps onto the plugin's connect/read timeouts, and a JS-side race guarantees
 * the promise settles even if the native call hangs (the app must never freeze).
 */
export async function nativeFetch(
  url: string,
  init: RequestInit = {},
  timeoutMs = 20_000,
  kind: 'text' | 'binary' = 'text',
): Promise<Response> {
  const headers = headersToObject(new Headers(init.headers || {}));
  const method = (init.method || 'GET').toUpperCase();
  const parts = await buildParts(init);
  const connectTimeout = Math.max(4_000, Math.min(timeoutMs, 15_000));

  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => {
      const err = new Error('native-http-timeout');
      err.name = 'AbortError';
      reject(err);
    }, timeoutMs + 2_000);
  });

  const send = transport();
  if (!send) throw new TypeError('native-http-unavailable');

  try {
    const res = await Promise.race([
      send({
        url,
        method,
        headers,
        ...(parts.data !== null ? { data: parts.data, dataType: parts.dataType as never } : {}),
        connectTimeout,
        readTimeout: timeoutMs,
        responseType: kind === 'binary' ? 'arraybuffer' : 'text',
      }),
      timeout,
    ]) as NativeResponse;

    const status = Number(res?.status) || 0;
    /* status 0 = the native layer could not reach the host at all; mirror fetch's
       network error so callers can distinguish it from an HTTP error response. */
    if (status < 200 || status > 599) {
      throw new TypeError(`native-http-status-${status}`);
    }
    const raw = res?.data;
    const noBody = status === 204 || status === 205 || status === 304;
    let body: BodyInit | null = null;
    if (!noBody) {
      if (raw === undefined || raw === null) body = '';
      else if (kind === 'binary' && typeof raw === 'string') body = base64ToBytes(raw);
      else body = typeof raw === 'string' ? raw : JSON.stringify(raw);
    }
    return new Response(body, { status, headers: res?.headers || {} });
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/**
 * Drop-in replacement for `fetch` in app code that talks to the API: it uses the native
 * bridge inside the Android shell (no same-origin policy, no CORS) and the browser's own
 * fetch everywhere else. `binary` keeps bytes intact for backups/exports.
 */
export function smartFetch(
  url: string,
  init: RequestInit = {},
  timeoutMs = 20_000,
  binary = false,
): Promise<Response> {
  if (nativeAvailable() && /^https?:\/\//i.test(url)) {
    return nativeFetch(url, init, timeoutMs, binary ? 'binary' : 'text');
  }
  return fetch(url, init);
}
