import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './styles.css';
import { loadLocal } from './lib/localcatalog';

/* The APK must be usable with zero network: warm the bundled catalogue before the first paint
   of any list screen. Failure is non-fatal (a connected backend still takes over). */
void loadLocal();

class ErrorBoundary extends React.Component<{ children: React.ReactNode }, { error: Error | null }> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { error: null };
  }
  static getDerivedStateFromError(error: Error) { return { error }; }
  componentDidCatch(error: Error) { console.error('[MDA]', error); }
  render() {
    if (this.state.error) {
      return (
        <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', padding: 24, fontFamily: 'Inter, system-ui, sans-serif', background: '#050c1a' }}>
          <div style={{ maxWidth: 420, textAlign: 'center', background: '#0a1930', border: '1px solid rgba(120,170,255,.18)', borderRadius: 20, padding: 28 }}>
            <div style={{ fontSize: 34, fontWeight: 900, color: '#67e8f9', letterSpacing: 4 }}>MDA</div>
            <h1 style={{ fontSize: 16, margin: '10px 0 6px', color: '#fff' }}>Something went wrong · حدث خطأ</h1>
            <p style={{ fontSize: 12, color: '#7290bd', lineHeight: 1.7, wordBreak: 'break-word' }}>{String(this.state.error?.message || this.state.error)}</p>
            <button onClick={() => location.reload()} style={{ marginTop: 14, background: 'linear-gradient(135deg,#1b6dff,#22d3ee)', color: '#fff', border: 0, borderRadius: 12, padding: '10px 18px', fontWeight: 700, cursor: 'pointer' }}>
              إعادة التحميل / Reload
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

const root = document.getElementById('root')!;
ReactDOM.createRoot(root).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>,
);

/* Fade the launch splash out once the first screen is painted (min 550 ms so it reads as a splash, not a flash) */
const bootStart = performance.now();
const hideBoot = () => {
  const boot = document.getElementById('boot');
  if (!boot) return;
  const wait = Math.max(0, 550 - (performance.now() - bootStart));
  setTimeout(() => {
    boot.style.opacity = '0';
    setTimeout(() => boot.remove(), 460);
  }, wait);
};
requestAnimationFrame(hideBoot);

/* PWA service worker (production build) */
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    import('virtual:pwa-register').then(({ registerSW }) => registerSW({ immediate: true })).catch(() => {});
  });
}
