/*
 * Screenshot protection (Android FLAG_SECURE) — device default + per-prescription override.
 *
 * Two scopes, both stored in the WebView's localStorage:
 *   mda.secureFlag      "1" = protect the whole app (المزيد → قفل التطبيق)
 *   mda.secureRx.v1     JSON array of prescription ids that are protected on their own,
 *                       even when the global switch is off.
 *
 * The Android shell reads the global key on every resume, and additionally exposes
 * `window.MDASecure.set('1' | '0')` so a toggle inside the prescription screen takes
 * effect immediately instead of at the next resume. Browsers have neither the flag nor
 * the bridge: both functions degrade to bookkeeping only, and the UI says so.
 */

export const SECURE_GLOBAL_KEY = 'mda.secureFlag';
export const SECURE_RX_KEY = 'mda.secureRx.v1';
/** Mirror of the state currently applied to the native window — the shell reads it on resume. */
export const SECURE_NOW_KEY = 'mda.secureNow';
const MAX_RX_IDS = 300;

type NativeBridge = { set?: (v: string) => void };

function bridge(): NativeBridge | undefined {
  try {
    return (window as unknown as { MDASecure?: NativeBridge }).MDASecure;
  } catch {
    return undefined;
  }
}

/** True inside the Android shell (the bridge is injected by MainActivity). */
export function nativeSecureAvailable(): boolean {
  return !!bridge()?.set;
}

/**
 * Push the wanted state to the native window flags and remember it, so the shell's
 * onResume check restores exactly what the current screen wanted (a per-prescription
 * flag survives backgrounding the app).
 */
export function applyNativeSecure(on: boolean): void {
  try {
    localStorage.setItem(SECURE_NOW_KEY, on ? '1' : '0');
  } catch {
    /* private mode */
  }
  try {
    bridge()?.set?.(on ? '1' : '0');
  } catch {
    /* never let a privacy nicety break the screen */
  }
}

/** Boot: drop any leftover per-screen value and follow the device-wide switch. */
export function syncSecureFromGlobal(): void {
  applyNativeSecure(globalSecure());
}

/* ── global default ─────────────────────────────────────────────────────── */

export function globalSecure(): boolean {
  try {
    return localStorage.getItem(SECURE_GLOBAL_KEY) === '1';
  } catch {
    return false;
  }
}

export function setGlobalSecure(on: boolean): void {
  try {
    localStorage.setItem(SECURE_GLOBAL_KEY, on ? '1' : '0');
  } catch {
    /* private mode */
  }
  applyNativeSecure(on);
}

/* ── per-prescription override ──────────────────────────────────────────── */

export function rxSecureIds(): number[] {
  try {
    const raw = localStorage.getItem(SECURE_RX_KEY);
    const list = raw ? JSON.parse(raw) : [];
    return Array.isArray(list) ? list.filter((n) => Number.isFinite(n)) : [];
  } catch {
    return [];
  }
}

export function isRxSecure(id: number | null | undefined): boolean {
  if (id === null || id === undefined) return false;
  return rxSecureIds().includes(Number(id));
}

/** Flag or unflag one prescription; keeps the list bounded (newest 300 kept). */
export function setRxSecure(id: number, on: boolean): void {
  const ids = rxSecureIds().filter((n) => n !== Number(id));
  if (on) ids.push(Number(id));
  try {
    localStorage.setItem(SECURE_RX_KEY, JSON.stringify(ids.slice(-MAX_RX_IDS)));
  } catch {
    /* ignore quota errors */
  }
  applyNativeSecure(on || globalSecure());
}

/**
 * Effective protection while a prescription is on screen: the record flag OR the global
 * switch. Used by the screen on mount and before it hands control back to the rest of
 * the app (which restores the global value).
 */
export function effectiveSecure(id?: number | null): boolean {
  return globalSecure() || isRxSecure(id);
}
