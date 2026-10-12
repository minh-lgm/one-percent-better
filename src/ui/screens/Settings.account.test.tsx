import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi as vitest } from 'vitest';
import { DEFAULT_SETTINGS } from '../../domain/types';
import en from '../../i18n/resources/en.json';
import vi from '../../i18n/resources/vi.json';
import { buildEntry, buildGoal } from '../../test/builders';
import { createTestContainer, setTestOnline, TEST_REDIRECT_URL, type TestContainer } from '../../test/container';
import { USER1 } from '../../test/fake-auth-port';
import { renderApp, scanVi } from '../../test/render-with-locale';

let tc: TestContainer | undefined;

afterEach(async () => {
  await tc?.dispose();
  tc = undefined;
});

const card = () => screen.getByTestId('account-card');

async function signedInContainer(options: Parameters<typeof createTestContainer>[0] = {}) {
  tc = await createTestContainer({ cloud: true, authStored: true, ...options });
  tc.auth!.port.session = USER1;
  await tc.container.db.kv.put({ key: 'sync', value: { userId: USER1.userId, account: { email: USER1.email, name: USER1.name } } });
  await tc.container.authService.init();
  await tc.container.authService.settled();
  return tc;
}

describe('Settings — cloud off (FR-38, M6-AC3)', () => {
  it('no Account card, no sign-in button, About keeps the phase-1 copy', async () => {
    const app = await renderApp({ route: '/settings' });
    tc = app.tc;
    expect(tc.auth).toBeNull();
    expect(tc.container.authService.state()).toEqual({ kind: 'unavailable' });
    expect(screen.queryByRole('heading', { level: 2, name: en.settings.account.title })).toBeNull();
    expect(screen.queryByRole('button', { name: en.auth.signInGoogle })).toBeNull();
    expect(screen.getByText(en.settings.about.desc)).toBeInTheDocument();
    expect(screen.queryByText(en.settings.about.privacy)).toBeNull();
    expect(screen.queryByTestId('signout-dialog')).toBeNull();
  });
});

describe('Settings — Account card with cloud on (M6-AC6 … AC9, AC11)', () => {
  it('card order Language → Account → Reminders; signed-out card + About cloud copy; loader never called', async () => {
    tc = await createTestContainer({ cloud: true });
    await tc.container.authService.init();
    await renderApp({ route: '/settings', container: tc });
    const headings = screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent);
    expect(headings.slice(0, 3)).toEqual(['Language / Ngôn ngữ', en.settings.account.title, en.settings.reminders.title]);
    expect(card()).toHaveAttribute('data-state', 'signed-out');
    expect(screen.getByText(en.settings.about.descCloud)).toBeInTheDocument();
    expect(screen.getByText(en.settings.about.privacy)).toBeInTheDocument();
    expect(tc.auth!.state.loads).toBe(0);
  });

  it('Sign in with Google → signIn(#/settings): returnTo saved, redirect URL passed, card shows signing-in', async () => {
    const user = userEvent.setup();
    tc = await createTestContainer({ cloud: true });
    await tc.container.authService.init();
    await renderApp({ route: '/settings', container: tc });
    await user.click(screen.getByRole('button', { name: en.auth.signInGoogle }));
    await waitFor(() => expect(card()).toHaveAttribute('data-state', 'signing-in'));
    expect(tc.auth!.returnTo.value).toBe('#/settings');
    expect(tc.auth!.port.lastRedirectTo).toBe(TEST_REDIRECT_URL);
    expect(tc.auth!.state.loads).toBe(1);
    expect(screen.getByRole('button', { name: en.auth.signingIn })).toBeDisabled();
  });

  it('offline: button disabled with the hint; back online → enabled', async () => {
    tc = await createTestContainer({ cloud: true, online: false });
    await tc.container.authService.init();
    await renderApp({ route: '/settings', container: tc });
    expect(screen.getByRole('button', { name: en.auth.signInGoogle })).toBeDisabled();
    expect(screen.getByTestId('offline-hint')).toHaveTextContent(en.settings.account.offlineHint);
    setTestOnline(tc, true);
    await waitFor(() => expect(screen.getByRole('button', { name: en.auth.signInGoogle })).toBeEnabled());
  });

  it('callback success: signing-in → signed-in, toast "Signed in as …", About switches to the signed-in copy', async () => {
    tc = await createTestContainer({ cloud: true });
    await tc.container.authService.init();
    await renderApp({ route: '/settings', container: tc });
    const promise = tc.container.authService.completeCallback({ code: 'abc' });
    await waitFor(() => expect(card()).toHaveAttribute('data-state', 'signing-in'));
    await promise;
    await waitFor(() => expect(card()).toHaveAttribute('data-state', 'signed-in'));
    expect(within(card()).getByTestId('account-email')).toHaveTextContent(USER1.email);
    expect(within(card()).getByTestId('account-name')).toHaveTextContent(USER1.name);
    await waitFor(() => expect(screen.getByTestId('toast')).toHaveTextContent(`Signed in as ${USER1.email}`));
    expect(screen.getByText(en.settings.about.descSignedIn)).toBeInTheDocument();
  });

  it('callback cancelled on Settings: Alert AUTH_CANCELLED in the card, no toast; Dismiss clears it', async () => {
    const user = userEvent.setup();
    tc = await createTestContainer({ cloud: true });
    await tc.container.authService.init();
    await renderApp({ route: '/settings', container: tc });
    await tc.container.authService.completeCallback({ error: 'access_denied', description: 'cancelled' });
    await waitFor(() => expect(within(card()).getByRole('alert')).toHaveTextContent(en.errors.AUTH_CANCELLED));
    expect(screen.queryByTestId('toast')).toBeNull();
    await user.click(screen.getByRole('button', { name: en.common.dismiss }));
    await waitFor(() => expect(within(card()).queryByRole('alert')).toBeNull());
    expect(screen.getByRole('button', { name: en.auth.signInGoogle })).toBeEnabled();
  });

  it('callback failed while on Today: error toast with "Go to Account" → navigates to Settings (A4 Alert there)', async () => {
    const user = userEvent.setup();
    tc = await createTestContainer({ cloud: true });
    await tc.container.authService.init();
    await renderApp({ route: '/today', container: tc });
    tc.auth!.port.exchangeResult = new Error('verifier missing');
    await tc.container.authService.completeCallback({ code: 'bogus' });
    await waitFor(() => expect(screen.getByTestId('toast')).toHaveTextContent(en.toast.signInFailed));
    expect(screen.getByTestId('toast')).toHaveAttribute('data-tone', 'error');
    await user.click(screen.getByRole('button', { name: en.settings.account.goTo }));
    await waitFor(() => expect(screen.getByRole('heading', { level: 1, name: en.settings.title })).toBeInTheDocument());
    expect(within(card()).getByRole('alert')).toHaveTextContent(en.errors.AUTH_FAILED);
  });

  it('stored session: card shows the saved account immediately (no flash) and stays signed in', async () => {
    await signedInContainer();
    await renderApp({ route: '/settings', container: tc });
    expect(card()).toHaveAttribute('data-state', 'signed-in');
    expect(within(card()).getByTestId('account-email')).toHaveTextContent(USER1.email);
    expect(tc!.auth!.state.loads).toBe(1);
  });

  it('session expired event → A10 with the saved email; data kept', async () => {
    await signedInContainer();
    await tc!.container.db.goals.put(buildGoal({ id: 'g', name: 'Read' }));
    await renderApp({ route: '/settings', container: tc });
    tc!.auth!.port.emit({ type: 'session-expired' });
    await waitFor(() => expect(card()).toHaveAttribute('data-state', 'expired'));
    expect(screen.getByTestId('auth-expired')).toHaveTextContent('Account: minh.test@example.com');
    expect(await tc!.container.db.goals.count()).toBe(1);
    expect(screen.getByText(en.settings.about.descCloud)).toBeInTheDocument();
  });

  it('Sign out → D4 (Keep focused) → Cancel keeps the session and returns focus to Sign out', async () => {
    const user = userEvent.setup();
    await signedInContainer();
    await renderApp({ route: '/settings', container: tc });
    const signOut = screen.getByRole('button', { name: en.settings.account.signOut });
    await user.click(signOut);
    const dialog = screen.getByTestId('signout-dialog');
    await waitFor(() => expect(dialog).toHaveAttribute('open'));
    expect(within(dialog).getByRole('radio', { name: en.auth.signOut.keep })).toBeChecked();
    expect(within(dialog).getByRole('radio', { name: en.auth.signOut.keep })).toHaveFocus();
    await user.click(within(dialog).getByRole('button', { name: en.common.cancel }));
    await waitFor(() => expect(dialog).not.toHaveAttribute('open'));
    expect(card()).toHaveAttribute('data-state', 'signed-in');
    await waitFor(() => expect(signOut).toHaveFocus());
  });

  it('Sign out → Keep: signed out, data kept, toast, focus on the card heading', async () => {
    const user = userEvent.setup();
    await signedInContainer();
    await tc!.container.db.goals.put(buildGoal({ id: 'g', name: 'Read' }));
    await tc!.container.db.entries.put(buildEntry({ id: 'e', goalId: 'g' }));
    await renderApp({ route: '/settings', container: tc });
    await user.click(screen.getByRole('button', { name: en.settings.account.signOut }));
    await user.click(screen.getByTestId('signout-confirm'));
    await waitFor(() => expect(card()).toHaveAttribute('data-state', 'signed-out'));
    await waitFor(() => expect(screen.getByTestId('toast')).toHaveTextContent(en.toast.signedOutKept));
    expect(await tc!.container.db.goals.count()).toBe(1);
    expect(await tc!.container.db.entries.count()).toBe(1);
    expect(tc!.auth!.port.calls.signOut).toBe(1);
    await waitFor(() => expect(screen.getByRole('heading', { level: 2, name: en.settings.account.title })).toHaveFocus());
  });

  it('Sign out → Remove: data removed, language kept, settings back to defaults, toast', async () => {
    const user = userEvent.setup();
    await signedInContainer({ locale: 'vi' });
    await tc!.container.db.goals.put(buildGoal({ id: 'g', name: 'Read' }));
    await tc!.container.db.entries.put(buildEntry({ id: 'e', goalId: 'g' }));
    await tc!.container.db.kv.put({ key: 'locale', value: 'vi' });
    await tc!.container.settingsService.setReminderTime('07:30');
    await renderApp({ route: '/settings', container: tc });
    await user.click(screen.getByRole('button', { name: vi.settings.account.signOut }));
    await user.click(screen.getByRole('radio', { name: vi.auth.signOut.remove }));
    await waitFor(() => expect(screen.getByTestId('signout-confirm')).toHaveTextContent(vi.auth.signOut.confirmRemove));
    expect(scanVi()).toEqual([]);
    await user.click(screen.getByTestId('signout-confirm'));
    await waitFor(() => expect(card()).toHaveAttribute('data-state', 'signed-out'));
    await waitFor(() => expect(screen.getByTestId('toast')).toHaveTextContent(vi.toast.signedOutRemoved));
    expect(await tc!.container.db.goals.count()).toBe(0);
    expect(await tc!.container.db.entries.count()).toBe(0);
    expect(await tc!.container.db.kv.get('locale')).toEqual({ key: 'locale', value: 'vi' });
    expect(await tc!.container.settingsService.get()).toEqual(DEFAULT_SETTINGS);
    // The UI language is untouched (kv `locale` still 'vi', page still renders vi copy; <html lang> is set by bootstrap, checked in E2E).
    expect(tc!.i18n.language).toBe('vi');
    expect(scanVi()).toEqual([]);
  });

  it('Sign out → Remove with a storage failure: dialog stays open with WRITE_FAILED, still signed in', async () => {
    const user = userEvent.setup();
    await signedInContainer();
    await tc!.container.db.goals.put(buildGoal({ id: 'g', name: 'Read' }));
    const spy = vitest.spyOn(tc!.container.db.goals, 'clear').mockRejectedValue(new Error('disk full'));
    await renderApp({ route: '/settings', container: tc });
    await user.click(screen.getByRole('button', { name: en.settings.account.signOut }));
    await user.click(screen.getByRole('radio', { name: en.auth.signOut.remove }));
    await user.click(screen.getByTestId('signout-confirm'));
    const dialog = screen.getByTestId('signout-dialog');
    await waitFor(() => expect(within(dialog).getByRole('alert')).toHaveTextContent(en.errors.WRITE_FAILED));
    expect(dialog).toHaveAttribute('open');
    expect(card()).toHaveAttribute('data-state', 'signed-in');
    expect(await tc!.container.db.goals.count()).toBe(1);
    spy.mockRestore();
  });

  it('vi: Settings with the Account card (signed-out, signed-in, expired) has no English leaks', async () => {
    tc = await createTestContainer({ cloud: true, locale: 'vi' });
    await tc.container.authService.init();
    const app = await renderApp({ route: '/settings', container: tc });
    await waitFor(() => expect(screen.getByText(vi.settings.storage.protected)).toBeInTheDocument());
    expect(screen.getByRole('heading', { level: 2, name: vi.settings.account.title })).toBeInTheDocument();
    expect(scanVi()).toEqual([]);
    app.unmount();
    await tc.dispose();
    await signedInContainer({ locale: 'vi' });
    const app2 = await renderApp({ route: '/settings', container: tc });
    await waitFor(() => expect(screen.getByText(vi.settings.storage.protected)).toBeInTheDocument());
    expect(screen.getByText(vi.settings.about.descSignedIn)).toBeInTheDocument();
    expect(scanVi()).toEqual([]);
    tc!.auth!.port.emit({ type: 'session-expired' });
    await waitFor(() => expect(card()).toHaveAttribute('data-state', 'expired'));
    expect(scanVi()).toEqual([]);
    app2.unmount();
  });
});
