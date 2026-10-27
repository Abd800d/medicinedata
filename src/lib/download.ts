import { getToken } from './api';
import { smartFetch } from './nativeHttp';

/** Download a protected admin file (adds the JWT that a plain <a download> would miss). */
export async function downloadWithAuth(url: string, filename: string) {
  /* Native bridge inside the APK: an authenticated download must not depend on CORS. */
  const res = await smartFetch(url, { headers: getToken() ? { Authorization: `Bearer ${getToken()}` } : {} }, 60_000, true);
  if (!res.ok) {
    let msg = `HTTP ${res.status}`;
    try { const j = await res.json(); msg = j?.error || msg; } catch { /* ignore */ }
    throw new Error(msg);
  }
  const blob = await res.blob();
  const href = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = href;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(href), 4000);
}
