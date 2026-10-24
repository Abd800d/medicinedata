import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './styles.css';

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
        <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', padding: 24, fontFamily: 'Inter, system-ui, sans-serif', background: '#f8fafc' }}>
          <div style={{ maxWidth: 420, textAlign: 'center', background: '#fff', border: '1px solid #e2e8f0', borderRadius: 20, padding: 28 }}>
            <div style={{ fontSize: 34, fontWeight: 900, color: '#0f766e', letterSpacing: 4 }}>MDA</div>
            <h1 style={{ fontSize: 16, margin: '10px 0 6px', color: '#0f172a' }}>Something went wrong · حدث خطأ</h1>
            <p style={{ fontSize: 12, color: '#64748b', lineHeight: 1.7, wordBreak: 'break-word' }}>{String(this.state.error?.message || this.state.error)}</p>
            <button onClick={() => location.reload()} style={{ marginTop: 14, background: '#0f766e', color: '#fff', border: 0, borderRadius: 12, padding: '10px 18px', fontWeight: 700, cursor: 'pointer' }}>
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

/* Hide the boot splash as soon as the app paints */
requestAnimationFrame(() => {
  const boot = document.getElementById('boot');
  if (boot) { boot.style.transition = 'opacity .25s'; boot.style.opacity = '0'; setTimeout(() => boot.remove(), 260); }
});

/* PWA service worker (production build) */
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    import('virtual:pwa-register').then(({ registerSW }) => registerSW({ immediate: true })).catch(() => {});
  });
}
