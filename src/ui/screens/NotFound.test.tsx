import { render, screen, waitFor } from '@testing-library/react';
import { I18nextProvider } from 'react-i18next';
import { afterEach, describe, expect, it, vi as vitest } from 'vitest';
import { createI18n } from '../../i18n/instance';
import en from '../../i18n/resources/en.json';
import vi from '../../i18n/resources/vi.json';
import type { TestContainer } from '../../test/container';
import { renderApp, renderWithLocale, scanVi } from '../../test/render-with-locale';
import { NotFound } from './NotFound';
import { StorageError } from './StorageError';

let tc: TestContainer | undefined;

afterEach(async () => {
  await tc?.dispose();
  tc = undefined;
});

describe('NotFound (M1-AC14)', () => {
  it('unknown route shows the page variant with a link to Today, and / redirects to /today', async () => {
    const app = await renderApp({ route: '/abc' });
    tc = app.tc;
    expect(screen.getByRole('heading', { level: 1, name: en.notFound.pageTitle })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: en.notFound.pageAction })).toHaveAttribute('href', '/today');
    await waitFor(() => expect(document.title).toBe('Page not found — 1% Better'));
    await app.router.navigate('/');
    await waitFor(() => expect(app.router.state.location.pathname).toBe('/today'));
  });

  it('vi: page and goal variants have no English leaks', async () => {
    const app = await renderApp({ route: '/abc', locale: 'vi' });
    tc = app.tc;
    expect(screen.getByRole('heading', { level: 1, name: vi.notFound.pageTitle })).toBeInTheDocument();
    expect(scanVi()).toEqual([]);
    app.unmount();
    const r = await renderWithLocale(<NotFound variant="goal" />, 'vi', { container: tc });
    expect(screen.getByRole('heading', { level: 1, name: vi.notFound.goalTitle })).toBeInTheDocument();
    expect(screen.getByText(vi.errors.GOAL_NOT_FOUND)).toBeInTheDocument();
    expect(scanVi()).toEqual([]);
    r.unmount();
  });
});

describe('StorageError (M1-AC15, M1-AC17)', () => {
  it('renders in the detected language and calls onRetry', async () => {
    const i18n = createI18n({ locale: 'vi', strictMissingKeys: true });
    const onRetry = vitest.fn().mockResolvedValue(undefined);
    render(
      <I18nextProvider i18n={i18n}>
        <StorageError onRetry={onRetry} />
      </I18nextProvider>,
    );
    expect(screen.getByRole('heading', { level: 1, name: vi.storageError.title })).toBeInTheDocument();
    expect(screen.getByText(vi.storageError.body)).toBeInTheDocument();
    expect(screen.getAllByRole('listitem').map((li) => li.textContent)).toEqual([vi.storageError.step1, vi.storageError.step2, vi.storageError.step3]);
    expect(scanVi()).toEqual([]);
    screen.getByRole('button', { name: vi.common.tryAgain }).click();
    await waitFor(() => expect(onRetry).toHaveBeenCalledTimes(1));
  });
});
