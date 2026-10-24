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
};

type CfgCtx = {
  config: AppConfig;
  refresh: () => Promise<void>;
  dark: boolean;
  toggleDark: () => void;
};

const Ctx = createContext<CfgCtx | null>(null);

export function ConfigProvider({ children }: { children: React.ReactNode }) {
  const [config, setConfig] = useState<AppConfig>(DEFAULTS);
  /* MDA ships one carefully tuned midnight-navy theme (the reference identity).
     `dark` stays in the context so older screens keep working; it is always on. */
  const [dark] = useState(true);
  const { t: _t } = useI18n();

  useEffect(() => {
    document.documentElement.classList.toggle('dark', dark);
    localStorage.setItem('mda.theme', dark ? 'dark' : 'light');
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', '#050c1a');
  }, [dark]);

  const refresh = async () => {
    try {
      const c = await api.get<AppConfig>('/api/config');
      setConfig({ ...DEFAULTS, ...c });
    } catch { /* offline: keep defaults */ }
  };

  useEffect(() => { refresh(); }, []);

  const value = useMemo(() => ({
    config, refresh, dark, toggleDark: () => { /* single-theme product */ },
  }), [config, dark]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useConfig() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useConfig outside provider');
  return ctx;
}
