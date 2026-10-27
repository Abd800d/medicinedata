/*
 * Deep links (v1.9.0) — how the Google sign-in result comes back into the app.
 *
 * After the system browser finishes the OAuth dance, the server redirects to
 * `com.mda.medicinedata://auth?token=<jwt>`. Android hands that URL to the app
 * (intent-filter in AndroidManifest.xml) and @capacitor/app reports it here.
 * A cold start delivers it through getLaunchUrl() instead of the listener,
 * so both paths must be handled — otherwise "sign in with Google" silently
 * returns to an empty screen.
 */
import { useEffect, useRef } from 'react';
import { App as CapacitorApp } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';
import { tokenFromDeepLink } from '../lib/googleauth';

const native = () => {
  try {
    return Boolean(Capacitor?.isNativePlatform?.());
  } catch {
    return false;
  }
};

export default function DeepLinks() {
  const handled = useRef(false);

  useEffect(() => {
    if (!native()) return;

    const handle = (rawUrl?: string | null) => {
      if (!rawUrl || handled.current) return;
      const { token, error } = tokenFromDeepLink(rawUrl);
      if (!token && !error) return;
      handled.current = true;
      if (token) {
        /* Full reload: the auth provider reads the token once at boot, so this avoids
           a half-initialised session and any stale state from the pre-login screens. */
        window.location.replace(`/?google=ok#${Date.now()}`);
        return;
      }
      window.location.replace(`/auth?google_error=${encodeURIComponent(error || 'failed')}`);
    };

    let remove: (() => void) | undefined;
    (async () => {
      try {
        const launch = await CapacitorApp.getLaunchUrl();
        handle(launch?.url);
      } catch { /* not a cold start from a link */ }
      try {
        const listener = await CapacitorApp.addListener('appUrlOpen', (event) => handle(event?.url));
        remove = () => { listener.remove(); };
      } catch { /* plugin missing: the web flow still works */ }
    })();

    return () => remove?.();
  }, []);

  return null;
}
