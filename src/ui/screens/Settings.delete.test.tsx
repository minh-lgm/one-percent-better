// M14: the Delete account flow on the Settings screen with the real container (FakeAccountDeletionPort, FakeAuthPort,
// real SyncService over a FakeRemoteStore): D6 open/cancel/confirm, toast, focus, Apple panel, errors, iOS sheet.
import { act, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import en from '../../i18n/resources/en.json';
import vi from '../../i18n/resources/vi.json';
import { buildEntry, buildGoal } from '../../test/builders';
import { createTestContainer, setTestOnline, type TestContainer } from '../../test/container';
import { USER1 } from '../../test/fake-auth-port';
import { renderApp, scanVi } from '../../test/render-with-locale';

let tc: TestContainer | undefined;

afterEach(async () => {
  await tc?.dispose();
  tc = undefined;
});

type Options = Parameters<typeof createTestContainer>[0];

async function signedIn(options: Options = {}, providers: Array<'google' | 'apple'> = ['google']) {
  tc = await createTestContainer({ cloud: true, authStored: true, ...options });
  tc.auth!.port.session = { ...USER1, providers };
  await tc.container.db.kv.put({ key: 'sync', value: { userId: USER1.userId, lastUserId: USER1.userId, account: { email: USER1.email, name: USER1.name } } });
  await tc.container.db.goals.put(buildGoal({ id: 'g1', name: 'Read' }));
  await tc.container.db.entries.put(buildEntry({ id: 'e1', goalId: 'g1', minutes: 20 }));
  await tc.container.authService.init();
  await tc.container.authService.settled();
  await renderApp({ route: '/settings', container: tc });
  await waitFor(() => expect(screen.getByTestId('account-card')).toHaveAttribute('data-state', 'signed-in'));
  return tc;
}

const card = () => screen.getByTestId('account-card');
const dialog = () => screen.getByTestId('delete-account-dialog') as HTMLDialogElement;
const deleteButton = () => screen.getByTestId('delete-account');

describe('Settings › Account › Delete account (FR-61, M14)', () => {
  it('button → D6 open (email, Remove default, focus Cancel); Cancel closes it, focus back on Delete account, nothing deleted', async () => {
    const user = userEvent.setup();
    await signedIn();
    await user.click(deleteButton());
    expect(dialog().open).toBe(true);
    expect(screen.getByTestId('delete-account-email')).toHaveTextContent(USER1.email);
    expect(screen.getByRole('radio', { name: en.auth.delete.remove })).toBeChecked();
    expect(document.activeElement).toBe(screen.getByTestId('delete-account-cancel'));
    expect(screen.queryByTestId('delete-apple-note')).toBeNull();
    await user.click(screen.getByTestId('delete-account-cancel'));
    expect(dialog().open).toBe(false);
    await waitFor(() => expect(document.activeElement).toBe(deleteButton()));
    expect(tc!.auth!.deletion.calls).toEqual([]);
    expect(card()).toHaveAttribute('data-state', 'signed-in');
  });

  it('confirm (Remove): one call to the port, dialog closes, card signed-out, toast "Data removed", goal gone, focus on the Account heading, no Apple panel', async () => {
    const user = userEvent.setup();
    await signedIn();
    await user.click(deleteButton());
    await user.click(screen.getByTestId('delete-account-confirm'));
    await waitFor(() => expect(card()).toHaveAttribute('data-state', 'signed-out'));
    // The dialog closes right after the service resolves (one render after the state change).
    await waitFor(() => expect(dialog().open).toBe(false));
    expect(tc!.auth!.deletion.calls).toEqual([{}]);
    expect(screen.getByTestId('toast')).toHaveTextContent(en.toast.accountDeletedRemoved);
    expect(await tc!.container.db.goals.count()).toBe(0);
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole('heading', { level: 2, name: en.settings.account.title })));
    expect(screen.queryByTestId('apple-revoke-panel')).toBeNull();
    expect(screen.queryByTestId('delete-account-block')).toBeNull();
    // Only one toast (DESIGN: one toast rule) and the sign-in button is back.
    expect(screen.getAllByTestId('toast')).toHaveLength(1);
    expect(screen.getByRole('button', { name: en.auth.signInGoogle })).toBeEnabled();
  });

  it('confirm (Keep): toast "still on this device", goal still there and usable signed out', async () => {
    const user = userEvent.setup();
    await signedIn();
    await user.click(deleteButton());
    await user.click(screen.getByRole('radio', { name: en.auth.delete.keep }));
    await user.click(screen.getByTestId('delete-account-confirm'));
    await waitFor(() => expect(card()).toHaveAttribute('data-state', 'signed-out'));
    expect(screen.getByTestId('toast')).toHaveTextContent(en.toast.accountDeletedKept);
    expect(await tc!.container.db.goals.count()).toBe(1);
  });

  it('offline: the button is disabled with the reason; going offline after D6 opened → confirm shows ACCOUNT_DELETE_OFFLINE, dialog stays, still signed in', async () => {
    const user = userEvent.setup();
    await signedIn();
    setTestOnline(tc!, false);
    await waitFor(() => expect(deleteButton()).toBeDisabled());
    expect(screen.getByTestId('delete-account-reason')).toHaveTextContent(en.settings.account.deleteOffline);
    setTestOnline(tc!, true);
    await waitFor(() => expect(deleteButton()).toBeEnabled());
    await user.click(deleteButton());
    setTestOnline(tc!, false);
    await user.click(screen.getByTestId('delete-account-confirm'));
    await waitFor(() => expect(screen.getByTestId('delete-account-error')).toHaveTextContent(en.errors.ACCOUNT_DELETE_OFFLINE));
    expect(dialog().open).toBe(true);
    expect(card()).toHaveAttribute('data-state', 'signed-in');
    expect(tc!.auth!.deletion.calls).toEqual([]);
  });

  it('function fails (500) → ACCOUNT_DELETE_FAILED in D6, still signed in, data untouched; pressing again succeeds', async () => {
    const user = userEvent.setup();
    await signedIn();
    tc!.auth!.deletion.next = { kind: 'failed' };
    await user.click(deleteButton());
    await user.click(screen.getByTestId('delete-account-confirm'));
    await waitFor(() => expect(screen.getByTestId('delete-account-error')).toHaveTextContent(en.errors.ACCOUNT_DELETE_FAILED));
    expect(dialog().open).toBe(true);
    expect(card()).toHaveAttribute('data-state', 'signed-in');
    expect(await tc!.container.db.goals.count()).toBe(1);
    expect(screen.queryByTestId('toast')).toBeNull();
    tc!.auth!.deletion.next = { kind: 'deleted', appleRevoked: 'not-applicable' };
    await user.click(screen.getByTestId('delete-account-confirm'));
    await waitFor(() => expect(card()).toHaveAttribute('data-state', 'signed-out'));
    expect(tc!.auth!.deletion.calls).toHaveLength(2);
  });

  it('401 from the function → ACCOUNT_DELETE_SESSION_EXPIRED; the dialog stays open (closing it shows the card as it is)', async () => {
    const user = userEvent.setup();
    await signedIn();
    tc!.auth!.deletion.next = { kind: 'session-expired' };
    await user.click(deleteButton());
    await user.click(screen.getByTestId('delete-account-confirm'));
    await waitFor(() => expect(screen.getByTestId('delete-account-error')).toHaveTextContent(en.errors.ACCOUNT_DELETE_SESSION_EXPIRED));
    expect(dialog().open).toBe(true);
  });

  it('busy while the function runs: confirm aria-disabled, Cancel disabled, status text; a second click is ignored', async () => {
    const user = userEvent.setup();
    await signedIn();
    let release: () => void = () => undefined;
    tc!.auth!.deletion.gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    await user.click(deleteButton());
    await user.click(screen.getByTestId('delete-account-confirm'));
    await waitFor(() => expect(dialog()).toHaveAttribute('aria-busy', 'true'));
    expect(screen.getByTestId('delete-account-confirm')).toHaveAttribute('aria-disabled', 'true');
    expect(screen.getByTestId('delete-account-cancel')).toBeDisabled();
    expect(screen.getByTestId('delete-working')).toHaveTextContent(en.auth.delete.workingStatus);
    await user.click(screen.getByTestId('delete-account-confirm'));
    await act(async () => release());
    await waitFor(() => expect(card()).toHaveAttribute('data-state', 'signed-out'));
    expect(tc!.auth!.deletion.calls).toHaveLength(1);
  });

  it('iOS + Apple identity: D6 shows the Apple note; confirm opens the Apple sheet first; manual-required → panel with the support link; Dismiss → focus heading', async () => {
    const user = userEvent.setup();
    await signedIn({ native: 'ios', idTokens: true }, ['apple']);
    tc!.auth!.deletion.next = { kind: 'deleted', appleRevoked: 'manual-required' };
    await user.click(deleteButton());
    expect(screen.getByTestId('delete-apple-note')).toHaveTextContent(en.auth.delete.appleNote);
    await user.click(screen.getByTestId('delete-account-confirm'));
    await waitFor(() => expect(card()).toHaveAttribute('data-state', 'signed-out'));
    expect(tc!.auth!.idTokens!.count('getIdToken', 'apple')).toBe(1);
    expect(tc!.auth!.deletion.calls).toEqual([{ appleAuthorizationCode: 'apple-code-1' }]);
    expect(screen.getByTestId('toast')).toHaveTextContent(en.toast.accountDeletedRemoved);
    const panel = screen.getByTestId('apple-revoke-panel');
    expect(within(panel).getByRole('link')).toHaveAttribute('href', 'https://support.apple.com/102571');
    // The panel survives a round trip to another tab and back (in-memory for the app run).
    await user.click(within(panel).getByRole('button', { name: en.common.dismiss }));
    expect(screen.queryByTestId('apple-revoke-panel')).toBeNull();
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole('heading', { level: 2, name: en.settings.account.title })));
  });

  it('iOS + Apple identity: the Apple sheet cancelled → ACCOUNT_DELETE_CANCELLED, still signed in; revoked → no panel', async () => {
    const user = userEvent.setup();
    await signedIn({ native: 'ios', idTokens: true }, ['apple', 'google']);
    tc!.auth!.idTokens!.results.apple = { kind: 'cancelled' };
    await user.click(deleteButton());
    await user.click(screen.getByTestId('delete-account-confirm'));
    await waitFor(() => expect(screen.getByTestId('delete-account-error')).toHaveTextContent(en.errors.ACCOUNT_DELETE_CANCELLED));
    expect(card()).toHaveAttribute('data-state', 'signed-in');
    expect(tc!.auth!.deletion.calls).toEqual([]);
    tc!.auth!.idTokens!.results.apple = undefined;
    tc!.auth!.deletion.next = { kind: 'deleted', appleRevoked: 'revoked' };
    await user.click(screen.getByTestId('delete-account-confirm'));
    await waitFor(() => expect(card()).toHaveAttribute('data-state', 'signed-out'));
    expect(screen.queryByTestId('apple-revoke-panel')).toBeNull();
  });

  it('web + Google only: no Apple sheet, no note; Google-only account on the web with manual-required but no Apple identity → no panel', async () => {
    const user = userEvent.setup();
    await signedIn();
    tc!.auth!.deletion.next = { kind: 'deleted', appleRevoked: 'manual-required' };
    await user.click(deleteButton());
    expect(screen.queryByTestId('delete-apple-note')).toBeNull();
    await user.click(screen.getByTestId('delete-account-confirm'));
    await waitFor(() => expect(card()).toHaveAttribute('data-state', 'signed-out'));
    expect(screen.queryByTestId('apple-revoke-panel')).toBeNull();
  });

  it('vi: the whole flow scans clean (M14-AC11)', async () => {
    const user = userEvent.setup();
    await signedIn({ locale: 'vi', native: 'ios', idTokens: true }, ['apple']);
    expect(scanVi()).toEqual([]);
    await user.click(screen.getByRole('button', { name: vi.settings.account.delete }));
    expect(scanVi()).toEqual([]);
    tc!.auth!.deletion.next = { kind: 'deleted', appleRevoked: 'manual-required' };
    await user.click(screen.getByTestId('delete-account-confirm'));
    await waitFor(() => expect(card()).toHaveAttribute('data-state', 'signed-out'));
    expect(screen.getByTestId('toast')).toHaveTextContent(vi.toast.accountDeletedRemoved);
    expect(screen.getByTestId('apple-revoke-panel')).toHaveTextContent(vi.auth.delete.revokeTitle);
    expect(scanVi()).toEqual([]);
  });
});

describe('Settings on iOS — native sign-in from the card (M14-AC7)', () => {
  it("Sign in with Apple → authService.signIn('#/settings', 'apple') → signed-in with the Apple provider line; the sheet was used, no redirect", async () => {
    const user = userEvent.setup();
    tc = await createTestContainer({ cloud: true, native: 'ios', idTokens: true });
    await tc.container.authService.init();
    await renderApp({ route: '/settings', container: tc });
    await user.click(screen.getByRole('button', { name: en.auth.signInApple }));
    await waitFor(() => expect(card()).toHaveAttribute('data-state', 'signed-in'));
    expect(tc.auth!.idTokens!.calls).toEqual([{ method: 'getIdToken', provider: 'apple' }]);
    expect(tc.auth!.port.calls.signIn).toBe(0);
    expect(tc.auth!.returnTo.value).toBeNull();
    expect(screen.getByTestId('account-provider')).toHaveTextContent(en.settings.account.providerApple);
    expect(screen.getByTestId('toast')).toHaveTextContent(`Signed in as ${USER1.email}`);
  });

  it('Sign in with Google on iOS uses the Google sheet; a cancelled sheet shows the shared AUTH_CANCELLED Alert', async () => {
    const user = userEvent.setup();
    tc = await createTestContainer({ cloud: true, native: 'ios', idTokens: true });
    tc.auth!.idTokens!.results.google = { kind: 'cancelled' };
    await tc.container.authService.init();
    await renderApp({ route: '/settings', container: tc });
    await user.click(screen.getByRole('button', { name: en.auth.signInGoogle }));
    await waitFor(() => expect(within(card()).getByRole('alert')).toHaveTextContent(en.errors.AUTH_CANCELLED));
    expect(card()).toHaveAttribute('data-state', 'signed-out');
    expect(tc.auth!.port.calls.signIn).toBe(0);
  });
});
