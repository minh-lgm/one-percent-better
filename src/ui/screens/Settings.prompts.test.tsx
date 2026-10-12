import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi as vitest } from 'vitest';
import en from '../../i18n/resources/en.json';
import vi from '../../i18n/resources/vi.json';
import { buildGoal } from '../../test/builders';
import { createTestContainer, setTestOnline, type TestContainer } from '../../test/container';
import { USER1 } from '../../test/fake-auth-port';
import { renderApp, scanVi } from '../../test/render-with-locale';

let tc: TestContainer | undefined;

afterEach(async () => {
  await tc?.dispose();
  tc = undefined;
  vitest.restoreAllMocks();
});

const card = () => screen.getByTestId('account-card');

async function signedOut(options: Parameters<typeof createTestContainer>[0] = {}) {
  tc = await createTestContainer({ cloud: true, ...options });
  await tc.container.db.goals.put(buildGoal({ id: 'g1', name: 'Read' }));
  await tc.container.authService.init();
  return tc;
}

async function signedIn(options: Parameters<typeof createTestContainer>[0] = {}) {
  tc = await createTestContainer({ cloud: true, authStored: true, ...options });
  tc.auth!.port.session = USER1;
  await tc.container.db.goals.put(buildGoal({ id: 'g1', name: 'Read' }));
  await tc.container.db.kv.put({ key: 'sync', value: { userId: USER1.userId, account: { email: USER1.email, name: USER1.name } } });
  await tc.container.authService.init();
  await tc.container.authService.settled();
  return tc;
}

function stubDownloads() {
  Object.assign(URL, { createObjectURL: vitest.fn(() => 'blob:json'), revokeObjectURL: vitest.fn() });
  vitest.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
}

describe('Settings — fixed entry points and copy by state (FR-54, M8-AC4)', () => {
  it('signed out: Account card always has the explanation + Google button and no "Not now"; Storage "Not protected" adds the sign-in line + "Go to Account" (focus → Google button); Backup/About use the signed-out cloud copy', async () => {
    const user = userEvent.setup();
    await signedOut({ persist: 'not-persisted' });
    await renderApp({ route: '/settings', container: tc });
    expect(card()).toHaveAttribute('data-state', 'signed-out');
    expect(within(card()).getByText(en.settings.account.descSignedOut)).toBeInTheDocument();
    expect(within(card()).getByRole('button', { name: en.auth.signInGoogle })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: en.loginPrompt.notNow })).toBeNull();
    await waitFor(() => expect(screen.getByText(en.settings.storage.notProtected)).toBeInTheDocument());
    expect(screen.getByTestId('storage-desc')).toHaveTextContent(`${en.settings.storage.notProtectedDesc} ${en.settings.storage.notProtectedSignIn}`);
    expect(screen.getByTestId('backup-desc')).toHaveTextContent(en.settings.backup.descSignedOut);
    expect(screen.getByText(en.settings.about.descCloud)).toBeInTheDocument();
    await user.click(screen.getByTestId('storage-go-to-account'));
    expect(document.activeElement).toBe(within(card()).getByRole('button', { name: en.auth.signInGoogle }));
  });

  it('signed in: no Storage sign-in line or button; Backup/About use the signed-in copy', async () => {
    await signedIn({ persist: 'not-persisted' });
    await renderApp({ route: '/settings', container: tc });
    await waitFor(() => expect(screen.getByText(en.settings.storage.notProtected)).toBeInTheDocument());
    expect(screen.getByTestId('storage-desc')).toHaveTextContent(en.settings.storage.notProtectedDesc);
    expect(screen.getByTestId('storage-desc')).not.toHaveTextContent(en.settings.storage.notProtectedSignIn);
    expect(screen.queryByTestId('storage-go-to-account')).toBeNull();
    expect(screen.getByTestId('backup-desc')).toHaveTextContent(en.settings.backup.descSignedIn);
    expect(screen.getByText(en.settings.about.descSignedIn)).toBeInTheDocument();
  });

  it('cloud off: phase-1 copy everywhere (M1), nothing about signing in', async () => {
    tc = await createTestContainer({ persist: 'not-persisted' });
    await renderApp({ route: '/settings', container: tc });
    await waitFor(() => expect(screen.getByText(en.settings.storage.notProtected)).toBeInTheDocument());
    expect(screen.getByTestId('storage-desc')).toHaveTextContent(en.settings.storage.notProtectedDesc);
    expect(screen.getByTestId('storage-desc')).not.toHaveTextContent(en.settings.storage.notProtectedSignIn);
    expect(screen.queryByTestId('storage-go-to-account')).toBeNull();
    expect(screen.getByTestId('backup-desc')).toHaveTextContent(en.settings.backup.desc);
    expect(screen.getByText(en.settings.about.desc)).toBeInTheDocument();
    expect(screen.queryByText(en.settings.about.privacy)).toBeNull();
  });

  it('Storage "Protected": no sign-in line even when signed out', async () => {
    await signedOut({ persist: 'persisted' });
    await renderApp({ route: '/settings', container: tc });
    await waitFor(() => expect(screen.getByText(en.settings.storage.protected)).toBeInTheDocument());
    expect(screen.getByTestId('storage-desc')).not.toHaveTextContent(en.settings.storage.notProtectedSignIn);
    expect(screen.queryByTestId('storage-go-to-account')).toBeNull();
  });
});

describe('Settings — ExportSignInHint (FR-53, M8-AC3)', () => {
  it('signed out: Export → hint (role group, label, Google button → signIn("#/settings")); a second export the same day claims nothing; kv lastExportHintAt set', async () => {
    const user = userEvent.setup();
    stubDownloads();
    await signedOut();
    await renderApp({ route: '/settings', container: tc });
    expect(screen.queryByTestId('export-sign-in-hint')).toBeNull();
    await user.click(screen.getByRole('button', { name: en.settings.backup.export }));
    const hint = await screen.findByTestId('export-sign-in-hint');
    expect(hint).toHaveAttribute('role', 'group');
    expect(hint).toHaveAttribute('aria-label', en.exportHint.label);
    expect(hint).not.toHaveAttribute('aria-live');
    expect(within(hint).getByText(en.exportHint.text)).toBeInTheDocument();
    expect(screen.getByTestId('toast')).toHaveTextContent(en.toast.backupExported);
    const state = await tc!.container.loginPromptService.getState();
    expect(state.lastExportHintAt).not.toBeNull();
    // Same day again: the slot is taken (claim false) — the state does not move.
    await user.click(screen.getByRole('button', { name: en.settings.backup.export }));
    await waitFor(() => expect(screen.getByRole('button', { name: en.settings.backup.export })).toBeEnabled());
    expect((await tc!.container.loginPromptService.getState()).lastExportHintAt).toBe(state.lastExportHintAt);
    // The hint's button is a shortcut to the same sign-in as the Account card.
    await user.click(within(hint).getByRole('button', { name: en.auth.signInGoogle }));
    await waitFor(() => expect(tc!.container.authService.state().kind).toBe('signing-in'));
    expect(tc!.auth!.returnTo.value).toBe('#/settings');
  });

  it('slot already used less than 30 days ago: Export shows no hint; 30 days ago: hint', async () => {
    const user = userEvent.setup();
    stubDownloads();
    await signedOut();
    const now = Date.now();
    await tc!.container.db.kv.put({ key: 'loginPrompt', value: { dismissCount: 0, lastDismissedAt: null, lastExportHintAt: new Date(now - 29 * 86_400_000).toISOString() } });
    const app = await renderApp({ route: '/settings', container: tc });
    await user.click(screen.getByRole('button', { name: en.settings.backup.export }));
    await waitFor(() => expect(screen.getByTestId('toast')).toHaveTextContent(en.toast.backupExported));
    expect(screen.queryByTestId('export-sign-in-hint')).toBeNull();
    app.unmount();
    await tc!.container.db.kv.put({ key: 'loginPrompt', value: { dismissCount: 0, lastDismissedAt: null, lastExportHintAt: new Date(now - 30 * 86_400_000).toISOString() } });
    await renderApp({ route: '/settings', container: tc });
    await user.click(screen.getByRole('button', { name: en.settings.backup.export }));
    expect(await screen.findByTestId('export-sign-in-hint')).toBeInTheDocument();
  });

  it('signed in: Export shows the toast only, no hint, no claim', async () => {
    const user = userEvent.setup();
    stubDownloads();
    await signedIn();
    await renderApp({ route: '/settings', container: tc });
    await user.click(screen.getByRole('button', { name: en.settings.backup.export }));
    await waitFor(() => expect(screen.getByTestId('toast')).toHaveTextContent(en.toast.backupExported));
    expect(screen.queryByTestId('export-sign-in-hint')).toBeNull();
    expect((await tc!.container.loginPromptService.getState()).lastExportHintAt).toBeNull();
  });

  it('offline export: no hint and the slot is not used (OQ-D12); a hint that is showing when the device goes offline disables its button with the reason', async () => {
    const user = userEvent.setup();
    stubDownloads();
    await signedOut({ online: false });
    await renderApp({ route: '/settings', container: tc });
    await user.click(screen.getByRole('button', { name: en.settings.backup.export }));
    await waitFor(() => expect(screen.getByTestId('toast')).toHaveTextContent(en.toast.backupExported));
    expect(screen.queryByTestId('export-sign-in-hint')).toBeNull();
    expect((await tc!.container.loginPromptService.getState()).lastExportHintAt).toBeNull();
    setTestOnline(tc!, true);
    await waitFor(() => expect(within(card()).getByRole('button', { name: en.auth.signInGoogle })).toBeEnabled());
    await user.click(screen.getByRole('button', { name: en.settings.backup.export }));
    const hint = await screen.findByTestId('export-sign-in-hint');
    setTestOnline(tc!, false);
    await waitFor(() => expect(within(hint).getByRole('button', { name: en.auth.signInGoogle })).toBeDisabled());
    expect(within(hint).getByRole('button', { name: en.auth.signInGoogle })).toHaveAccessibleDescription(en.settings.account.offlineHint);
  });

  it('vi: hint and Storage/Backup copy from DESIGN 7.7, no English leaks', async () => {
    const user = userEvent.setup();
    stubDownloads();
    await signedOut({ locale: 'vi', persist: 'not-persisted' });
    await renderApp({ route: '/settings', container: tc, locale: 'vi' });
    await waitFor(() => expect(screen.getByText(vi.settings.storage.notProtected)).toBeInTheDocument());
    expect(screen.getByTestId('storage-desc')).toHaveTextContent(vi.settings.storage.notProtectedSignIn);
    expect(screen.getByTestId('backup-desc')).toHaveTextContent(vi.settings.backup.descSignedOut);
    await user.click(screen.getByRole('button', { name: vi.settings.backup.export }));
    const hint = await screen.findByTestId('export-sign-in-hint');
    expect(hint).toHaveAttribute('aria-label', vi.exportHint.label);
    expect(within(hint).getByText(vi.exportHint.text)).toBeInTheDocument();
    expect(scanVi()).toEqual([]);
  });
});
