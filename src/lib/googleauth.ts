/*
 * Google sign-in for the phone (v1.9.0).
 *
 * Why this is not the old <script> button any more: Google refuses OAuth inside an embedded
 * WebView (`disallowed_useragent`), and the app shell is exactly that. The supported route —
 * and the one that uses the Google account already on the device — is the system browser:
 *
 *   Browser.open( /api/auth/google/start )  →  Google (PKCE)  →  /api/auth/google/callback
 *        → redirect to  com.mda.medicinedata://auth?token=<jwt>  →  the app picks it up.
 *
 * The client secret never leaves the server, nothing is stored in the APK, and the browser
 * carries the phone's own Google session, so no password is typed.
 *
 * Web keeps working the same way: the browser returns to <origin>/auth?google_token=<jwt>.
 */
import { apiUrl, setToken } from './api';
import { openExternal } from './external';
import { Capacitor } from '@capacitor/core';

export const APP_AUTH_SCHEME = 'com.mda.medicinedata';
export const APP_RETURN_URL = `${APP_AUTH_SCHEME}://auth`;

const isNative = () => {
  try {
    return Boolean(Capacitor?.isNativePlatform?.());
  } catch {
    return false;
  }
};

/** Where the server should send the browser back to. */
export function returnUrl(): string {
  if (isNative()) return APP_RETURN_URL;
  try {
    return `${window.location.origin}/auth`;
  } catch {
    return `${APP_RETURN_URL}`;
  }
}

/** Open the Google consent screen in the system browser (Chrome / Custom Tab). */
export async function startGoogleSignIn(): Promise<void> {
  const url = apiUrl(`/api/auth/google/start?redirect=${encodeURIComponent(returnUrl())}`);
  const opened = await openExternal(url);
  if (!opened) throw new Error('could not open the browser');
}

/** Extract a token from a deep link: com.mda.medicinedata://auth?token=… */
export function tokenFromDeepLink(rawUrl: string): { token?: string; error?: string } {
  try {
    const target = String(rawUrl || '');
    if (!target.startsWith(`${APP_AUTH_SCHEME}://`)) return {};
    /* URL() handles the custom scheme fine in modern WebViews; fall back to manual parsing. */
    let params: URLSearchParams;
    try {
      params = new URL(target.replace(`${APP_AUTH_SCHEME}://`, 'https://')).searchParams;
    } catch {
      params = new URLSearchParams(target.split('?')[1] || '');
    }
    const token = params.get('token') || undefined;
    const error = params.get('google_error') || undefined;
    return { ...(token ? { token } : {}), ...(error ? { error } : {}) };
  } catch {
    return {};
  }
}

/** Apply a deep-link result: store the JWT so the next render is signed in. */
export function applyDeepLinkAuth(rawUrl: string): boolean {
  const { token } = tokenFromDeepLink(rawUrl);
  if (!token) return false;
  setToken(token);
  return true;
}

/**
 * Read ?google_token= / ?google_error= that the web callback appends to /auth.
 * Returns true when a token was consumed (the caller should refresh the session).
 */
export function consumeWebCallback(search: string): { signedIn: boolean; error?: string } {
  const params = new URLSearchParams(String(search || ''));
  const token = params.get('google_token');
  const error = params.get('google_error') || undefined;
  if (token) {
    setToken(token);
    return { signedIn: true };
  }
  return { signedIn: false, ...(error ? { error } : {}) };
}
