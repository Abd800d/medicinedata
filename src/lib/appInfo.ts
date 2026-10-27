/*
 * "Which version am I actually running?"
 *
 * After an update the honest answer needs three numbers, and they can disagree:
 *   • the shell (the APK installed on the phone)       — @capacitor/app getInfo()
 *   • the web bundle inside that APK                    — /version.txt, written at build time
 *   • the backend the app talks to                      — /api/config.version
 *
 * When the phone is newer than the server, new screens call endpoints that do not exist yet
 * and everything "does nothing". Saying that out loud — with the three numbers and the exact
 * fix — is worth more than any silent retry.
 */
import { api } from './api';

export type ShellInfo = { platform: 'android' | 'ios' | 'web'; version: string; build: string };

const BUNDLE_VERSION = typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : '0.0.0';

export const bundleVersion = () => BUNDLE_VERSION;

/** Version of the installed APK. Falls back to the bundle version when opened on the web. */
export async function shellInfo(): Promise<ShellInfo> {
  try {
    const { Capacitor } = await import('@capacitor/core');
    if (!Capacitor?.isNativePlatform?.()) return { platform: 'web', version: BUNDLE_VERSION, build: 'web' };
    const { App } = await import('@capacitor/app');
    const info = await App.getInfo();
    return {
      platform: Capacitor.getPlatform() === 'ios' ? 'ios' : 'android',
      version: String(info.version || BUNDLE_VERSION),
      build: String(info.build || ''),
    };
  } catch {
    return { platform: 'web', version: BUNDLE_VERSION, build: 'web' };
  }
}

/** The bundle that is actually inside this APK (proves the update landed). */
export async function bundleStamp(): Promise<{ version: string; built_at?: string; build?: string } | null> {
  try {
    /* Same origin inside the shell (the local asset server) and on the web deployment. */
    const res = await fetch('version.txt', { cache: 'no-store' });
    if (!res.ok) return null;
    const text = await res.text();
    const parsed = JSON.parse(text);
    return parsed && typeof parsed.version === 'string' ? parsed : null;
  } catch {
    return null;
  }
}

export type ServerInfo = {
  version?: string;
  build?: string;
  features?: Record<string, boolean>;
  ok: boolean;
  error?: string;
};

export async function serverInfo(): Promise<ServerInfo> {
  try {
    const cfg = await api.get<any>('/api/config');
    return { ok: true, version: cfg?.version, build: cfg?.build, features: cfg?.features || {} };
  } catch (e: any) {
    return { ok: false, error: e?.message || 'NETWORK' };
  }
}

const cmp = (a?: string, b?: string) => {
  const pa = String(a || '0').split('.').map((n) => parseInt(n, 10) || 0);
  const pb = String(b || '0').split('.').map((n) => parseInt(n, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] || 0) - (pb[i] || 0);
    if (d) return d > 0 ? 1 : -1;
  }
  return 0;
};

export type VersionVerdict = {
  state: 'match' | 'server-older' | 'server-newer' | 'offline' | 'unknown';
  /** What the user should do, already written in their language. */
  hint: { ar: string; en: string } | null;
};

export function judgeVersions(phone: string, server?: string | null, reachable = true): VersionVerdict {
  if (!reachable || !server) {
    return {
      state: 'offline',
      hint: {
        ar: 'الخادم غير متاح الآن — التطبيق يعمل بالكتالوج المدمج. جديد الواجهة يعمل، لكن الصور والاستيراد يحتاجان اتصالًا.',
        en: 'The server is unreachable — the bundled catalogue is in use. New screens work, uploads need a connection.',
      },
    };
  }
  const d = cmp(server, phone);
  if (d < 0) {
    return {
      state: 'server-older',
      hint: {
        ar: `هاتفك على ${phone} والخادم لا يزال على ${server}. بعض الميزات الجديدة ستفشل حتى يُعاد نشر الخادم من main على Render.`,
        en: `Phone is ${phone} but the server is still ${server}. New features will fail until Render redeploys main.`,
      },
    };
  }
  if (d > 0) {
    return {
      state: 'server-newer',
      hint: {
        ar: `الخادم أحدث (${server}) من هذا الإصدار (${phone}) — ثبّت أحدث APK للحصول على الواجهة الجديدة.`,
        en: `Server is newer (${server}) than this build (${phone}) — install the latest APK.`,
      },
    };
  }
  return { state: 'match', hint: null };
}

/** Set once so the "what's new" sheet appears exactly once per installed version. */
const SEEN_KEY = 'mda.seenVersion';
export const seenVersion = () => {
  try { return localStorage.getItem(SEEN_KEY) || ''; } catch { return ''; }
};
export const markVersionSeen = (v: string) => {
  try { localStorage.setItem(SEEN_KEY, v); } catch { /* private mode */ }
};
/** A fresh install has never seen any version — show the notes once, not on every launch. */
export const shouldShowWhatsNew = () => seenVersion() !== BUNDLE_VERSION;
