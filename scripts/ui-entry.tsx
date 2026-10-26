/* Test entry: exposes UI pieces to scripts/test-ui.mjs (bundled by esbuild). */
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createRoot } from 'react-dom/client';
import { act } from 'react';
import { I18nProvider } from '../src/lib/i18n';
import { ConfigProvider, useConfig } from '../src/lib/config';
import { AuthProvider } from '../src/lib/auth';
import { LockProvider } from '../src/lib/lock';
import LockScreen from '../src/components/LockScreen';
import RxSecureToggle from '../src/components/RxSecureToggle';
import { ToastProvider } from '../src/components/ui';

/** Static markup of the lock screen (effects do not run during SSR). */
export function renderLockMarkup() {
  return renderToStaticMarkup(
    <I18nProvider>
      <AuthProvider>
        <LockProvider>
          <LockScreen />
        </LockProvider>
      </AuthProvider>
    </I18nProvider>,
  );
}

/** Mount ConfigProvider so its effects touch <html data-theme>. */
export function mountTheme(container: HTMLElement) {
  const api: { setMode?: (m: 'light' | 'dark' | 'system') => void; mode?: string } = {};
  function Probe() {
    const { mode, setMode, dark } = useConfig();
    api.setMode = setMode;
    api.mode = `${mode}:${dark ? 'dark' : 'light'}`;
    return null;
  }
  const root = createRoot(container);
  act(() => {
    root.render(
      <I18nProvider>
        <ConfigProvider>
          <Probe />
        </ConfigProvider>
      </I18nProvider>,
    );
  });
  return {
    get mode() { return api.mode; },
    setMode: (m: 'light' | 'dark' | 'system') => act(() => { api.setMode?.(m); }),
    unmount: () => act(() => root.unmount()),
  };
}

export { act };

/** Screenshot-protection card, as mounted inside the prescription screen. */
export function renderRxSecureMarkup(rxId?: number) {
  return renderToStaticMarkup(
    <I18nProvider>
      <ToastProvider>
        <RxSecureToggle rxId={rxId} />
      </ToastProvider>
    </I18nProvider>,
  );
}
