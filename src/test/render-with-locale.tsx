import { render, type RenderResult } from '@testing-library/react';
import type { ReactElement, ReactNode } from 'react';
import { I18nextProvider } from 'react-i18next';
import { MemoryRouter, RouterProvider } from 'react-router';
import { App } from '../app/App';
import { ServicesProvider } from '../app/AppContext';
import { createTestRouter } from '../app/router';
import { flattenMessages } from '../i18n/parity';
import en from '../i18n/resources/en.json';
import vi from '../i18n/resources/vi.json';
import type { Locale } from '../i18n/types';
import { ToastProvider } from '../ui/components/Toast';
import { createTestContainer, type TestContainer } from './container';
import { scanUntranslated, type ScanHit } from './i18n-scan';

const SCAN_DATA = { en: flattenMessages(en), vi: flattenMessages(vi) };

/** Run the "vi scan" on the document (or a subtree). Returns the offending strings. */
export function scanVi(root: Element | Document = document): ScanHit[] {
  return scanUntranslated(root, SCAN_DATA);
}

export interface RenderOptions {
  locale?: Locale;
  container?: TestContainer;
  route?: string;
}

/**
 * Render an isolated component with i18n, services and toasts (MemoryRouter for links).
 */
export async function renderWithLocale(ui: ReactElement, locale: Locale = 'en', options: Omit<RenderOptions, 'locale'> = {}): Promise<RenderResult & { tc: TestContainer }> {
  const tc = options.container ?? (await createTestContainer({ locale }));
  const route = options.route ?? '/';
  // Providers as a `wrapper` so `rerender(<Component …/>)` keeps i18n, services, toasts and the router.
  const Wrapper = ({ children }: { children: ReactNode }) => (
    <I18nextProvider i18n={tc.i18n}>
      <ServicesProvider container={tc.container}>
        <ToastProvider>
          <MemoryRouter initialEntries={[route]}>{children}</MemoryRouter>
        </ToastProvider>
      </ServicesProvider>
    </I18nextProvider>
  );
  const result = render(ui, { wrapper: Wrapper });
  return Object.assign(result, { tc });
}

/**
 * Render the whole app (shell + routes) at `route`, closest to what E2E sees.
 */
export async function renderApp(options: RenderOptions = {}): Promise<RenderResult & { tc: TestContainer; router: ReturnType<typeof createTestRouter> }> {
  const tc = options.container ?? (await createTestContainer({ locale: options.locale ?? 'en' }));
  const router = createTestRouter([options.route ?? '/today']);
  const result = render(<App container={tc.container} router={router as unknown as Parameters<typeof RouterProvider>[0]['router'] & ReturnType<typeof createTestRouter>} />);
  return Object.assign(result, { tc, router });
}
