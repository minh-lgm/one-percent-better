import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi as vitest } from 'vitest';
import en from '../../i18n/resources/en.json';
import vi from '../../i18n/resources/vi.json';
import { createTestContainer, type TestContainer } from '../../test/container';
import { renderApp, scanVi } from '../../test/render-with-locale';

let tc: TestContainer | undefined;

afterEach(async () => {
  await tc?.dispose();
  tc = undefined;
});

describe('Settings (M1-AC10, M1-AC16, M1-AC17)', () => {
  it('shows Language, Storage (persisted) and About cards', async () => {
    const app = await renderApp({ route: '/settings' });
    tc = app.tc;
    expect(screen.getByRole('heading', { level: 1, name: en.settings.title })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 2, name: 'Language / Ngôn ngữ' })).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText(en.settings.storage.protected)).toBeInTheDocument());
    expect(screen.getByText(en.settings.storage.protectedDesc)).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 2, name: en.settings.about.title })).toBeInTheDocument();
    expect(screen.getByText(en.app.name)).toBeInTheDocument();
    const enOption = screen.getByRole('radio', { name: 'English' });
    const viOption = screen.getByRole('radio', { name: 'Tiếng Việt' });
    expect(enOption).toBeChecked();
    expect(viOption).not.toBeChecked();
    expect(screen.getByText('English')).toHaveAttribute('lang', 'en');
    expect(screen.getByText('Tiếng Việt')).toHaveAttribute('lang', 'vi');
  });

  it('shows the not-protected and unknown storage states', async () => {
    tc = await createTestContainer({ persist: 'not-persisted' });
    const app = await renderApp({ route: '/settings', container: tc });
    await waitFor(() => expect(screen.getByText(en.settings.storage.notProtected)).toBeInTheDocument());
    app.unmount();
    await tc.dispose();
    tc = await createTestContainer({ persist: 'unsupported' });
    await renderApp({ route: '/settings', container: tc });
    await waitFor(() => expect(screen.getByText(en.settings.storage.unknown)).toBeInTheDocument());
  });

  it('switching to Tiếng Việt changes the whole page immediately, keeps focus, persists', async () => {
    const user = userEvent.setup();
    const app = await renderApp({ route: '/settings' });
    tc = app.tc;
    const viOption = screen.getByRole('radio', { name: 'Tiếng Việt' });
    await user.click(viOption);
    await waitFor(() => expect(screen.getByRole('heading', { level: 1, name: vi.settings.title })).toBeInTheDocument());
    expect(document.documentElement.lang).toBe('vi');
    await waitFor(() => expect(document.title).toBe('Cài đặt — 1% Better'));
    expect(screen.getByRole('link', { name: vi.nav.today })).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent(vi.toast.languageChanged));
    expect(screen.getByRole('radio', { name: 'Tiếng Việt' })).toBeChecked();
    expect(screen.getByRole('radio', { name: 'Tiếng Việt' })).toHaveFocus();
    expect(screen.getByRole('radio', { name: 'English' })).toBeInTheDocument();
    await waitFor(async () => expect(await tc!.container.db.kv.get('locale')).toEqual({ key: 'locale', value: 'vi' }));
    expect(scanVi()).toEqual([]);

    await user.click(screen.getByRole('radio', { name: 'English' }));
    await waitFor(() => expect(screen.getByRole('heading', { level: 1, name: en.settings.title })).toBeInTheDocument());
    expect(document.documentElement.lang).toBe('en');
    await waitFor(async () => expect(await tc!.container.db.kv.get('locale')).toEqual({ key: 'locale', value: 'en' }));
  });

  it('keyboard: arrow keys switch the language', async () => {
    const user = userEvent.setup();
    const app = await renderApp({ route: '/settings' });
    tc = app.tc;
    screen.getByRole('radio', { name: 'English' }).focus();
    await user.keyboard('{ArrowRight}');
    await waitFor(() => expect(document.documentElement.lang).toBe('vi'));
    expect(screen.getByRole('heading', { level: 1, name: vi.settings.title })).toBeInTheDocument();
  });

  it('shows the save-failed alert when persisting the choice fails, but still switches', async () => {
    const user = userEvent.setup();
    const app = await renderApp({ route: '/settings' });
    tc = app.tc;
    vitest.spyOn(tc.container.localeService, 'set').mockRejectedValueOnce(new Error('quota'));
    await user.click(screen.getByRole('radio', { name: 'Tiếng Việt' }));
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(vi.settings.language.saveFailed));
    expect(document.documentElement.lang).toBe('vi');
  });

  it('vi: no English leaks', async () => {
    const app = await renderApp({ route: '/settings', locale: 'vi' });
    tc = app.tc;
    await waitFor(() => expect(screen.getByText(vi.settings.storage.protected)).toBeInTheDocument());
    expect(scanVi()).toEqual([]);
  });
});
