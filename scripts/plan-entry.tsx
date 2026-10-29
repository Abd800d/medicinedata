/* Test entry for scripts/test-plan.mjs — mounts the plan screens in JSDOM. */
import React from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { I18nProvider } from '../src/lib/i18n';
import { ToastProvider } from '../src/components/ui';
import Products from '../src/pages/Products';
import Interactions from '../src/pages/Interactions';
import { VerificationPanel, VerificationBadge } from '../src/components/Verification';
import AdminVerification from '../src/pages/admin/Verification';

export { act, createRoot };

function mount(node: React.ReactNode) {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = createRoot(host);
  act(() => { root.render(<I18nProvider><ToastProvider><MemoryRouter>{node}</MemoryRouter></ToastProvider></I18nProvider>); });
  return { host, root };
}

export const mountProducts = () => mount(<Products />);
export const mountInteractions = () => mount(<Interactions />);

/** The verification panel with a fixed record — proves the wording rules without the server. */
export function mountVerificationPanel(detail: any, lang: 'ar' | 'en' = 'ar') {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = createRoot(host);
  act(() => { root.render(<I18nProvider><VerificationPanel detail={detail} lang={lang} /></I18nProvider>); });
  return { host, root };
}
export const mountAdminVerification = () => mount(<AdminVerification />);

export function mountVerificationBadge(state: string, review: string) {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = createRoot(host);
  act(() => { root.render(<I18nProvider><VerificationBadge state={state} review={review} lang="ar" /></I18nProvider>); });
  return { host, root };
}

/** Type into a React-controlled input so onChange actually fires. */
export function typeInto(el: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')!.set!;
  setter.call(el, value);
  el.dispatchEvent(new window.Event('input', { bubbles: true }));
}

export const click = (el: Element) => act(() => { (el as HTMLElement).click(); });
export const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
