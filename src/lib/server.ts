/*
 * The server the app talks to when nothing else is configured.
 *
 * Two deployments share one bundle:
 *   • the web app, served BY the server → relative URLs (same origin, no CORS, no config)
 *   • the Android shell (Capacitor, origin https://localhost) → has no server of its own,
 *     so it must be pointed at the hosted instance. Before v1.8.2 that required tapping
 *     through المزيد ← الخادم والاتصال and typing a URL, which is why a freshly installed
 *     APK looked "offline" (catalogue only, AI/login disabled).
 *
 * Overridable at build time with VITE_API_BASE (CI / Render dashboard), otherwise this
 * constant is the fallback. `?server=` or the settings screen still win over it.
 */
export const DEFAULT_SERVER = 'https://medicinedata-1.onrender.com';

const envBase = String((import.meta as unknown as { env?: Record<string, string> }).env?.VITE_API_BASE || '').trim();

/** Normalise a user/build supplied origin: absolute http(s), no trailing slash. */
export function normalizeServer(raw: string | null | undefined): string {
  const s = String(raw || '').trim();
  if (!s) return '';
  if (!/^https?:\/\//i.test(s)) return '';
  return s.replace(/\/+$/, '');
}

/**
 * True inside the Capacitor Android shell. The bridge (`window.Capacitor`) is the most
 * reliable signal; the localhost origin is the fallback because Capacitor serves the
 * bundle from https://localhost inside the WebView.
 */
export function isNativeShell(): boolean {
  try {
    const w = window as unknown as { Capacitor?: { isNativePlatform?: () => boolean; platform?: string } };
    if (w.Capacitor?.isNativePlatform?.()) return true;
    if (w.Capacitor?.platform && w.Capacitor.platform !== 'web') return true;
    const { protocol, hostname } = window.location;
    return protocol === 'https:' && (hostname === 'localhost' || hostname === '127.0.0.1');
  } catch {
    return false;
  }
}

/** The origin this build should use when the user has not chosen one. */
export function fallbackServer(): string {
  const fromEnv = normalizeServer(envBase);
  if (fromEnv) return fromEnv;
  /* The web build is served from the API host itself → relative requests. */
  return isNativeShell() ? DEFAULT_SERVER : '';
}

/**
 * `?server=https://…` on any URL — lets a tester retarget the app without rebuilding
 * (used by smoke tests and by the owner when switching Render instances).
 */
export function serverFromQuery(search = typeof window !== 'undefined' ? window.location.search : ''): string {
  try {
    return normalizeServer(new URLSearchParams(search).get('server'));
  } catch {
    return '';
  }
}
