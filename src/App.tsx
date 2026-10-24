import { lazy, Suspense } from 'react';
import { BrowserRouter, Link, Route, Routes } from 'react-router-dom';
import { I18nProvider, useI18n } from './lib/i18n';
import { ConfigProvider } from './lib/config';
import { AuthProvider } from './lib/auth';
import { PageLoader, ToastProvider } from './components/ui';
import Layout from './components/Layout';

const Home = lazy(() => import('./pages/Home'));
const Systems = lazy(() => import('./pages/Systems'));
const SystemDetail = lazy(() => import('./pages/SystemDetail'));
const SearchPage = lazy(() => import('./pages/SearchPage'));
const DrugDetail = lazy(() => import('./pages/DrugDetail'));
const ProductDetail = lazy(() => import('./pages/ProductDetail'));
const Prescriptions = lazy(() => import('./pages/Prescriptions'));
const ScanPage = lazy(() => import('./pages/ScanPage'));
const AiAssistant = lazy(() => import('./pages/AiAssistant'));
const Community = lazy(() => import('./pages/Community'));
const ThreadDetail = lazy(() => import('./pages/ThreadDetail'));
const Jobs = lazy(() => import('./pages/Jobs'));
const Directories = lazy(() => import('./pages/Directories'));
const Pharmacy = lazy(() => import('./pages/Pharmacy'));
const SubmitDrug = lazy(() => import('./pages/SubmitDrug'));
const More = lazy(() => import('./pages/More'));
const About = lazy(() => import('./pages/About'));
const Auth = lazy(() => import('./pages/Auth'));
const Profile = lazy(() => import('./pages/Profile'));
const Admin = lazy(() => import('./pages/admin/Admin'));

function NotFound() {
  const { t, lang } = useI18n();
  return (
    <div className="card mx-auto max-w-md p-8 text-center">
      <div className="text-[40px] font-black text-brand-700">404</div>
      <p className="mt-1 text-[12px] text-ink-500">{lang === 'ar' ? 'الصفحة غير موجودة' : 'Page not found'}</p>
      <Link to="/" className="btn-primary mt-4 inline-flex">{t('nav.home')}</Link>
    </div>
  );
}

export default function App() {
  return (
    <I18nProvider>
      <ConfigProvider>
        <AuthProvider>
          <ToastProvider>
            <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
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
                    <Route path="about" element={<About />} />
                    <Route path="auth" element={<Auth />} />
                    <Route path="profile" element={<Profile />} />
                    <Route path="*" element={<NotFound />} />
                  </Route>
                  <Route path="admin" element={<Admin />} />
                </Routes>
              </Suspense>
            </BrowserRouter>
          </ToastProvider>
        </AuthProvider>
      </ConfigProvider>
    </I18nProvider>
  );
}
