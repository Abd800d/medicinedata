import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { api } from './api';
import { useI18n } from './i18n';

export type AppConfig = {
  app: string;
  name_en: string;
  name_ar: string;
  owner_name: string;
  owner_title: string;
  support_email: string;
  whatsapp: string;
  owner_email: string;
  about_ar: string;
  about_en: string;
  disclaimer_ar: string;
  disclaimer_en: string;
  ai_enabled: boolean;
  google_client_id: string;
  counts: { drugs: number; products: number; systems: number };
  default_lang: string;
  maintenance?: boolean;
  allow_registration?: boolean;
  welcome_enabled?: boolean | string;
  welcome_title?: string;
  welcome_title_ar?: string;
  welcome_title_en?: string;
  welcome_text?: string;
  welcome_text_ar?: string;
  welcome_text_en?: string;
};

const DEFAULTS: AppConfig = {
  app: 'MDA',
  name_en: 'MedicineData',
  name_ar: 'ميديسين داتا',
  owner_name: 'Dr. Abdulmajeed Abdullah Almakhedhi',
  owner_title: 'المؤسس والمدير الطبي',
  support_email: '7a8b1d@gmail.com',
  whatsapp: '+967781733795',
  owner_email: '7a8b1d@gmail.com',
  about_ar: 'مرجع دوائي شامل للأدوية والمنتجات التجارية في اليمن والدول العربية.',
  about_en: 'A comprehensive pharmaceutical reference for Yemen and the Arab world.',
  disclaimer_ar: 'المعلومات مرجعية ولا تُغني عن استشارة الطبيب أو الصيدلي.',
  disclaimer_en: 'Reference information only; consult a licensed clinician.',
  ai_enabled: false,
  google_client_id: '',
  counts: { drugs: 0, products: 0, systems: 0 },
  default_lang: 'ar',
  allow_registration: true,
  welcome_enabled: true,
  welcome_title: '',
  welcome_text: '',
};

export type ThemeMode = 'light' | 'dark' | 'system';

type CfgCtx = {
  config: AppConfig;
  refresh: () => Promise<void>;
  dark: boolean;
  /** 'light' | 'dark' | 'system' — persisted in localStorage (`mda.themeMode`). */
  mode: ThemeMode;
  setMode: (m: ThemeMode) => void;
  /** Cycles dark → light → system, used by the header button. */
  toggleDark: () => void;
};

const THEME_KEY = 'mda.themeMode';
const THEME_COLOR = { dark: '#050c1a', light: '#f4f8fd' };

const readMode = (): ThemeMode => {
  try {
    const v = localStorage.getItem(THEME_KEY);
    if (v === 'light' || v === 'dark' || v === 'system') return v;
  } catch { /* private mode */ }
  return 'dark'; // the branded default
};

const systemPrefersDark = () =>
  typeof window !== 'undefined' && typeof window.matchMedia === 'function'
    ? window.matchMedia('(prefers-color-scheme: dark)').matches
    : true;

const Ctx = createContext<CfgCtx | null>(null);

export function ConfigProvider({ children }: { children: React.ReactNode }) {
  const [config, setConfig] = useState<AppConfig>(DEFAULTS);
  const [mode, setModeState] = useState<ThemeMode>(readMode);
  const [sysDark, setSysDark] = useState<boolean>(systemPrefersDark);
  const dark = mode === 'dark' || (mode === 'system' && sysDark);
  const { t: _t } = useI18n();

  /* Follow the phone's own day/night switch while the user picked "system". */
  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = (e: MediaQueryListEvent) => setSysDark(e.matches);
    mq.addEventListener?.('change', onChange);
    return () => mq.removeEventListener?.('change', onChange);
  }, []);

  useEffect(() => {
    const root = document.documentElement;
    root.dataset.theme = dark ? 'dark' : 'light';
    root.classList.toggle('dark', dark);
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', THEME_COLOR[dark ? 'dark' : 'light']);
    try { localStorage.setItem('mda.theme', dark ? 'dark' : 'light'); } catch { /* ignore */ }
  }, [dark]);

  const setMode = (m: ThemeMode) => {
    setModeState(m);
    try { localStorage.setItem(THEME_KEY, m); } catch { /* ignore */ }
  };

  const refresh = async () => {
    try {
      const c = await api.get<AppConfig>('/api/config');
      setConfig({ ...DEFAULTS, ...c });
    } catch { /* offline: keep defaults */ }
  };

  useEffect(() => { refresh(); }, []);

  const value = useMemo(() => ({
    config, refresh, dark, mode, setMode,
    toggleDark: () => setMode(mode === 'dark' ? 'light' : mode === 'light' ? 'system' : 'dark'),
  }), [config, dark, mode]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useConfig() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useConfig outside provider');
  return ctx;
}
