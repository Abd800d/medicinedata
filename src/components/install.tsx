import { useEffect, useState } from 'react';
import { Download, X } from 'lucide-react';
import { MDAIcon } from './ui';
import { useI18n } from '../lib/i18n';

type Bipe = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
};

const DISMISS_KEY = 'mda.install.dismissed';
const SNOOZE_MS = 1000 * 60 * 60 * 24 * 14;

/** Fire the native install prompt from anywhere (e.g. the More page). */
export function requestInstall() {
  window.dispatchEvent(new Event('mda:install-request'));
}

export function canPromptInstall() {
  return !!(window as any).__mdaBipe || !!document.querySelector('link[rel="manifest"]');
}

/**
 * Slim, dismissible "install MDA" banner.
 * Appears once the browser fires `beforeinstallprompt` (Android/Chrome), stays
 * hidden in the installed app, and sleeps for two weeks after a dismissal.
 */
export default function InstallPrompt() {
  const { lang } = useI18n();
  const [evt, setEvt] = useState<Bipe | null>(null);
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const standalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      window.matchMedia('(display-mode: fullscreen)').matches ||
      (navigator as any).standalone === true;
    if (standalone) return;

    const dismissedAt = Number(localStorage.getItem(DISMISS_KEY) || 0);
    if (Date.now() - dismissedAt < SNOOZE_MS) return;

    let timer: number | undefined;
    const onPrompt = (e: Event) => {
      e.preventDefault();
      const bipe = e as Bipe;
      (window as any).__mdaBipe = bipe;
      setEvt(bipe);
      timer = window.setTimeout(() => setShow(true), 2600);
    };
    const onInstalled = () => {
      setShow(false);
      setEvt(null);
      (window as any).__mdaBipe = null;
      localStorage.setItem(DISMISS_KEY, String(Date.now()));
    };
    const onRequest = async () => {
      const current = (window as any).__mdaBipe as Bipe | null;
      if (current) {
        setBusy(true);
        try { await current.prompt(); await current.userChoice; } catch { /* ignored */ }
        finally { setBusy(false); setShow(false); (window as any).__mdaBipe = null; }
      } else {
        setShow(true);
      }
    };

    window.addEventListener('beforeinstallprompt', onPrompt);
    window.addEventListener('appinstalled', onInstalled);
    window.addEventListener('mda:install-request', onRequest);
    return () => {
      if (timer) clearTimeout(timer);
      window.removeEventListener('beforeinstallprompt', onPrompt);
      window.removeEventListener('appinstalled', onInstalled);
      window.removeEventListener('mda:install-request', onRequest);
    };
  }, []);

  const close = () => {
    setShow(false);
    localStorage.setItem(DISMISS_KEY, String(Date.now()));
  };

  const install = async () => {
    if (!evt) return close();
    setBusy(true);
    try {
      await evt.prompt();
      const choice = await evt.userChoice;
      if (choice.outcome === 'accepted') localStorage.setItem(DISMISS_KEY, String(Date.now()));
    } catch { /* ignored */ }
    finally { setBusy(false); setShow(false); (window as any).__mdaBipe = null; }
  };

  if (!show) return null;

  return (
    <div className="install-card animate-fade-up" role="dialog" aria-label={lang === 'ar' ? 'تثبيت التطبيق' : 'Install app'}>
      <MDAIcon size={42} className="shrink-0 rounded-xl shadow-glow" />
      <div className="min-w-0 flex-1">
        <div className="text-[12.5px] font-extrabold text-white">
          {lang === 'ar' ? 'ثبّت MDA على جهازك' : 'Install MDA on your phone'}
        </div>
        <div className="line-clamp-1 text-[10.5px] text-ink-400">
          {lang === 'ar' ? 'وصول أسرع ويعمل بدون إنترنت' : 'Faster access, works offline'}
        </div>
      </div>
      <button onClick={install} disabled={busy} className="btn-primary shrink-0 px-3 py-2 text-[11px]">
        <Download className="h-3.5 w-3.5" />
        {lang === 'ar' ? 'تثبيت' : 'Install'}
      </button>
      <button onClick={close} className="icon-btn h-8 w-8 shrink-0" aria-label={lang === 'ar' ? 'إغلاق' : 'Close'}>
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
