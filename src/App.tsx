import { lazy, Suspense, useEffect } from 'react';
import Welcome from './components/Welcome';
import { BrowserRouter, Link, Route, Routes } from 'react-router-dom';
import { ChevronLeft } from 'lucide-react';
import { I18nProvider, useI18n } from './lib/i18n';
import { ConfigProvider } from './lib/config';
import { AuthProvider } from './lib/auth';
import { PageLoader, ToastProvider } from './components/ui';
import { SyncProvider } from './lib/sync';
import { LockProvider, useAppLock } from './lib/lock';
import { syncSecureFromGlobal } from './lib/secure';
import LockScreen from './components/LockScreen';
import Layout from './components/Layout';
import DeepLinks from './components/DeepLinks';
import { WhatsNewSheet } from './pages/WhatsNew';

const Home = lazy(() => import('./pages/Home'));
const Systems = lazy(() => import('./pages/Systems'));
const SystemDetail = lazy(() => import('./pages/SystemDetail'));
const SearchPage = lazy(() => import('./pages/SearchPage'));
const DrugDetail = lazy(() => import('./pages/DrugDetail'));
const ProductDetail = lazy(() => import('./pages/ProductDetail'));
const Prescriptions = lazy(() => import('./pages/Prescriptions'));
const SyncCenter = lazy(() => import('./pages/SyncCenter'));
const Legal = lazy(() => import('./pages/Legal'));
const ScanPage = lazy(() => import('./pages/ScanPage'));
const AiAssistant = lazy(() => import('./pages/AiAssistant'));
const Community = lazy(() => import('./pages/Community'));
const ThreadDetail = lazy(() => import('./pages/ThreadDetail'));
const Jobs = lazy(() => import('./pages/Jobs'));
const Directories = lazy(() => import('./pages/Directories'));
const Pharmacy = lazy(() => import('./pages/Pharmacy'));
const SubmitDrug = lazy(() => import('./pages/SubmitDrug'));
const More = lazy(() => import('./pages/More'));
const Offline = lazy(() => import('./pages/Offline'));
const ServerSettings = lazy(() => import('./pages/ServerSettings'));
const ForgotPassword = lazy(() => import('./pages/ForgotPassword'));
const WhatsNew = lazy(() => import('./pages/WhatsNew'));
const About = lazy(() => import('./pages/About'));
const Auth = lazy(() => import('./pages/Auth'));
const Profile = lazy(() => import('./pages/Profile'));
const Admin = lazy(() => import('./pages/admin/Admin'));
const ReviewQueue = lazy(() => import('./pages/ReviewQueue'));

function NotFound() {
  const { t, lang } = useI18n();
  const ar = lang === 'ar';
  return (
    <div className="space-y-4">
      <div className="page-hero page-hero-violet relative overflow-hidden p-7 text-center text-white">
        <span className="pointer-events-none absolute -end-10 -top-12 h-40 w-40 rounded-full border-[18px] border-white/10" />
        <svg viewBox="0 0 320 60" className="pointer-events-none absolute inset-x-0 bottom-0 h-12 w-full opacity-30" fill="none" aria-hidden="true">
          <path d="M0 32h44l10-18 14 36 12-26 8 8h38l12-10 10 20 10-12h44l10-14 12 28 10-14h72"
            stroke="rgba(255,255,255,.85)" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        <div className="relative mx-auto mb-2 inline-flex items-center gap-1 rounded-full bg-white/15 px-2.5 py-1 text-[10px] font-bold backdrop-blur">
          <span className="h-1.5 w-1.5 rounded-full bg-amber-300" />
          {ar ? 'خطأ 404' : 'Error 404'}
        </div>
        <div className="relative bg-gradient-to-b from-white to-brand-300 bg-clip-text text-[64px] font-black leading-none tracking-tight text-transparent num">404</div>
        <p className="relative mt-2 text-[13px] font-bold">{ar ? 'لم نجد هذه الصفحة' : 'We could not find that page'}</p>
        <p className="relative mx-auto mt-1 max-w-xs text-[11px] leading-6 text-white/80">
          {ar ? 'قد يكون الرابط قديماً أو مكتوباً بشكل خاطئ. جرّب البحث عن الدواء مباشرة.' : 'The link may be old or mistyped. Try searching for the medicine instead.'}
        </p>
      </div>

      <div className="grid gap-2 sm:grid-cols-2">
        <Link to="/" className="btn-primary">{t('nav.home')}</Link>
        <Link to="/search" className="btn-ghost">{ar ? 'البحث في الأدوية' : 'Search medicines'}</Link>
      </div>

      <div className="grid gap-2 sm:grid-cols-2">
        {[
          { to: '/systems', label: ar ? 'أجهزة الجسم' : 'Body systems' },
          { to: '/ai', label: ar ? 'المساعد الذكي' : 'AI assistant' },
        ].map((l) => (
          <Link key={l.to} to={l.to} className="flex items-center justify-between rounded-2xl border border-white/[.08] bg-white/[.04] px-3.5 py-3 text-[11.5px] font-bold text-ink-200 transition hover:border-brand-400/40 hover:text-white">
            <span>{l.label}</span>
            <ChevronLeft className="h-4 w-4 rtl:block ltr:hidden" />
          </Link>
        ))}
      </div>
    </div>
  );
}

/* The lock overlay lives above the router; the app keeps running behind it. */
function LockGate({ children }: { children: React.ReactNode }) {
  const { locked } = useAppLock();
  /* Cold start: the native window must follow the device-wide switch, not a value left
     behind by the last prescription that was open. */
  useEffect(() => { syncSecureFromGlobal(); }, []);
  return (
    <>
      {children}
      {locked && <LockScreen />}
    </>
  );
}

export default function App() {
  return (
    <I18nProvider>
      <ConfigProvider>
        <AuthProvider>
          <LockProvider>
          <ToastProvider>
            <SyncProvider>
            <LockGate>
            <DeepLinks />
            <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
              <Welcome />
              {/* Once per installed version: says out loud what changed after an update. */}
              <WhatsNewSheet />
              <Suspense fallback={<PageLoader />}>
                <Routes>
                  <Route element={<Layout />}>
                    <Route index element={<Home />} />
                    <Route path="systems" element={<Systems />} />
                    <Route path="systems/:slug" element={<SystemDetail />} />
                    <Route path="search" element={<SearchPage />} />
                    <Route path="drugs/:id" element={<DrugDetail />} />
                    <Route path="products/:id" element={<ProductDetail />} />
                    <Route path="prescriptions" element={<Prescriptions />} />
                    <Route path="scan" element={<ScanPage />} />
                    <Route path="ai" element={<AiAssistant />} />
                    <Route path="community" element={<Community />} />
                    <Route path="community/:id" element={<ThreadDetail />} />
                    <Route path="jobs" element={<Jobs />} />
                    <Route path="directories" element={<Directories />} />
                    <Route path="pharmacy" element={<Pharmacy />} />
                    <Route path="submit-drug" element={<SubmitDrug />} />
                    <Route path="more" element={<More />} />
                    <Route path="offline" element={<Offline />} />
                    <Route path="server" element={<ServerSettings />} />
                    <Route path="sync" element={<SyncCenter />} />
                    <Route path="legal/:doc" element={<Legal />} />
                    <Route path="about" element={<About />} />
                    <Route path="whats-new" element={<WhatsNew />} />
                    <Route path="auth" element={<Auth />} />
                    <Route path="forgot-password" element={<ForgotPassword />} />
                    <Route path="profile" element={<Profile />} />
                    <Route path="*" element={<NotFound />} />
                  </Route>
                  <Route path="review" element={<ReviewQueue />} />
                  <Route path="admin" element={<Admin />} />
                </Routes>
              </Suspense>
            </BrowserRouter>
            </LockGate>
            </SyncProvider>
          </ToastProvider>
          </LockProvider>
        </AuthProvider>
      </ConfigProvider>
    </I18nProvider>
  );
}
