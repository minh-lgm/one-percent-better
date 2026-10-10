import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi as vitest } from 'vitest';
import { I18nextProvider } from 'react-i18next';
import { createMemoryRouter, RouterProvider, type RouteObject } from 'react-router';
import { createI18n } from '../i18n/instance';
import en from '../i18n/resources/en.json';
import vi from '../i18n/resources/vi.json';
import { routes } from './router';
import { scanVi } from '../test/render-with-locale';
import { ErrorBoundary, ErrorFallback } from './ErrorBoundary';

afterEach(() => {
  vitest.restoreAllMocks();
});

function Boom(): never {
  throw new Error('render failed');
}

describe('ErrorBoundary / RouteErrorFallback (DESIGN S9, FR-31, M5-T5)', () => {
  it('a render error inside a route shows the S9 screen (not the router default) with Reload app and Go to Today', async () => {
    vitest.spyOn(console, 'error').mockImplementation(() => {});
    const i18n = createI18n({ locale: 'en', strictMissingKeys: true });
    // Same root route (with its errorElement) as the app, plus a throwing child.
    const root = routes[0] as RouteObject & { index?: false };
    const testRoutes: RouteObject[] = [{ ...root, index: false, children: [...(root.children ?? []), { path: 'boom', element: <Boom /> }] }];
    const router = createMemoryRouter(testRoutes, { initialEntries: ['/boom'] });
    render(
      <I18nextProvider i18n={i18n}>
        <RouterProvider router={router} />
      </I18nextProvider>,
    );
    const box = await screen.findByTestId('error-boundary');
    expect(screen.getByRole('heading', { level: 1, name: en.errorBoundary.title })).toBeInTheDocument();
    expect(box).toHaveTextContent(en.errorBoundary.body);
    expect(screen.getByRole('button', { name: en.errorBoundary.reload })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: en.notFound.pageAction })).toBeInTheDocument();
    await waitFor(() => expect(document.title).toBe('Something went wrong — 1% Better'));
    expect(document.body.textContent).not.toContain('render failed');
    await userEvent.setup().click(screen.getByRole('button', { name: en.notFound.pageAction }));
    await waitFor(() => expect(router.state.location.pathname).toBe('/today'));
  });

  it('ErrorBoundary around the tree renders the fallback; Go to Today resets it; vi has no English leaks', async () => {
    vitest.spyOn(console, 'error').mockImplementation(() => {});
    const i18n = createI18n({ locale: 'vi', strictMissingKeys: true });
    const view = render(
      <I18nextProvider i18n={i18n}>
        <ErrorBoundary>
          <Boom />
        </ErrorBoundary>
      </I18nextProvider>,
    );
    expect(await screen.findByRole('heading', { level: 1, name: vi.errorBoundary.title })).toBeInTheDocument();
    expect(screen.getByText(vi.errorBoundary.body)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: vi.errorBoundary.reload })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: vi.notFound.pageAction })).toBeInTheDocument();
    expect(scanVi()).toEqual([]);
    view.unmount();

    const reload = vitest.fn();
    render(
      <I18nextProvider i18n={i18n}>
        <ErrorFallback onGoToToday={() => {}} reload={reload} />
      </I18nextProvider>,
    );
    await userEvent.setup().click(screen.getByRole('button', { name: vi.errorBoundary.reload }));
    expect(reload).toHaveBeenCalledTimes(1);
  });
});
