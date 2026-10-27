/*
 * Opening things outside the app (v1.9.0).
 *
 * `window.open()` does not work inside a Capacitor WebView: there is no second window and
 * the popup is silently dropped, which is why the Google Lens / Google Images buttons and
 * the "open the approved drug" link did nothing on the phone. On the device we hand the URL
 * to the operating system (Custom Tabs via @capacitor/browser) so it opens in Chrome — the
 * user's own Google account therefore works, unlike an embedded WebView which Google blocks.
 *
 * On the web nothing changes: a normal new tab is opened.
 */
import { Browser } from '@capacitor/browser';
import { Capacitor } from '@capacitor/core';

const isNative = () => {
  try {
    return Boolean(Capacitor?.isNativePlatform?.());
  } catch {
    return false;
  }
};

/** True for links that leave the app (other sites, mail, phone, WhatsApp). */
export function isExternalUrl(url: string): boolean {
  return /^(https?:|mailto:|tel:|whatsapp:)/i.test(url);
}

/**
 * Open a URL in the device browser (or a new tab on the web).
 * Returns false when nothing could be opened, so callers can show a hint.
 */
export async function openExternal(url: string): Promise<boolean> {
  const target = String(url || '').trim();
  if (!target) return false;
  if (isNative() && /^https?:/i.test(target)) {
    try {
      await Browser.open({ url: target, presentationStyle: 'popover' });
      return true;
    } catch { /* fall through to the anchor approach */ }
  }
  try {
    const win = window.open(target, '_blank', 'noopener,noreferrer');
    if (win) return true;
    /* Popup blocked (or dropped by the WebView): navigate the anchor instead of losing the tap. */
    const a = document.createElement('a');
    a.href = target;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    document.body.appendChild(a);
    a.click();
    a.remove();
    return true;
  } catch {
    return false;
  }
}
