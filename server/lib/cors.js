/*
 * CORS for the three places the app runs from.
 *
 * The Android shell (Capacitor 7) serves the bundle from https://localhost, so every
 * call to https://<host>/api/... is cross-origin. Without these headers the WebView
 * blocks the response — which looked exactly like "the server is not connected" and
 * silently dropped the app back to its built-in catalogue (no login, no AI).
 *
 * Policy:
 *   • same-origin requests (the web deployment) need nothing and are untouched;
 *   • Capacitor origins are allowed by default (localhost / capacitor / app schemes);
 *   • extra origins can be added with CORS_ORIGINS="https://a.com,https://b.com";
 *   • credentials are NOT allowed — the API uses a Bearer token, never cookies;
 *   • preflights short-circuit with 204 and list exactly the headers we use.
 */
const NATIVE_ORIGINS = new Set([
  'https://localhost',
  'http://localhost',
  'capacitor://localhost',
  'ionic://localhost',
  'https://mda.local',
  'null', // file:// pages (older shells / local HTML)
]);

const extra = () =>
  String(process.env.CORS_ORIGINS || '')
    .split(',')
    .map((s) => s.trim().replace(/\/+$/, ''))
    .filter(Boolean);

const ALLOW_HEADERS = [
  'Content-Type', 'Authorization', 'Accept', 'Accept-Language',
  'X-Idempotency-Key', 'X-Requested-With', 'X-Client-Version',
].join(', ');

const EXPOSE_HEADERS = ['X-Idempotency-Key', 'X-Idempotent-Replay', 'Retry-After'].join(', ');

const allowed = (origin) => {
  if (!origin) return false;
  if (NATIVE_ORIGINS.has(origin)) return true;
  const list = extra();
  if (list.includes('*') || list.includes(origin)) return true;
  /* The hosted app itself: any *.onrender.com subdomain and the request's own host. */
  try {
    const u = new URL(origin);
    if (u.hostname.endsWith('.onrender.com')) return true;
  } catch { /* malformed origin */ }
  return false;
};

export function cors(req, res, next) {
  const origin = req.headers.origin;
  if (origin && allowed(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Expose-Headers', EXPOSE_HEADERS);
  }
  /* Preflight: answer before routing so no handler has to know about OPTIONS. */
  if (req.method === 'OPTIONS') {
    if (origin && allowed(origin)) {
      res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', ALLOW_HEADERS);
      res.setHeader('Access-Control-Max-Age', '86400');
    }
    res.status(204).end();
    return undefined;
  }
  return next();
}

export const corsAllowedOrigins = () => [...NATIVE_ORIGINS, ...extra()];
