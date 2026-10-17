// Settings + AppShell with the sync engine behind the real container (M7-AC7, AC8, AC11, AC12, AC15, AC18).
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import { buildBackup } from '../../domain/backup-file';
import { DEFAULT_SETTINGS } from '../../domain/types';
import en from '../../i18n/resources/en.json';
import vi from '../../i18n/resources/vi.json';
import { buildEntry, buildGoal, datasetS1, FIXED_NOW } from '../../test/builders';
import { createTestContainer, setTestOnline, type TestContainer } from '../../test/container';
import { USER1, USER2 } from '../../test/fake-auth-port';
import { unreachableError } from '../../test/fake-remote-store';
import { renderApp, scanVi } from '../../test/render-with-locale';

let tc: TestContainer | undefined;

afterEach(async () => {
  await tc?.dispose();
  tc = undefined;
});

const card = () => screen.getByTestId('account-card');
const U1 = USER1.userId;

async function signedIn(options: Parameters<typeof createTestContainer>[0] = {}) {
  tc = await createTestContainer({ cloud: true, authStored: true, ...options });
  tc.auth!.port.session = USER1;
  await tc.container.db.kv.put({ key: 'sync', value: { userId: U1, lastUserId: U1, account: { email: USER1.email, name: USER1.name } } });
  await tc.container.authService.init();
  await tc.container.authService.settled();
  return tc;
}

const sync = () => tc!.container.syncService!;

describe('Settings — signed-in copy (M7-AC15, DESIGN S7)', () => {
  it('sync notes on Language and Reminders, Backup description + import hint, sync details; none of it when signed out', async () => {
    await signedIn();
    const r = await renderApp({ route: '/settings', container: tc });
    expect(screen.getByTestId('language-sync-note')).toHaveTextContent(en.settings.language.syncNote);
    expect(screen.getByTestId('reminders-sync-note')).toHaveTextContent(en.settings.reminders.syncNote);
    expect(screen.getByTestId('backup-desc')).toHaveTextContent(en.settings.backup.descSignedIn);
    expect(screen.getByTestId('import-hint')).toHaveTextContent(en.settings.backup.importHintSignedIn);
    expect(screen.getByTestId('sync-details')).toBeInTheDocument();
    expect(screen.getByTestId('status-row')).toHaveAttribute('aria-label', en.sync.indicator.label);
    r.unmount();
    await tc!.dispose();
    tc = await createTestContainer({ cloud: true });
    await tc.container.authService.init();
    await renderApp({ route: '/settings', container: tc });
    expect(screen.queryByTestId('language-sync-note')).toBeNull();
    expect(screen.queryByTestId('reminders-sync-note')).toBeNull();
    // M8 (DESIGN S7 table): cloud on + signed out → `descSignedOut`; the phase-1 `desc` is for cloud off only.
    expect(screen.getByTestId('backup-desc')).toHaveTextContent(en.settings.backup.descSignedOut);
    expect(screen.getByTestId('import-hint')).toHaveTextContent(en.settings.backup.importHint);
    expect(screen.queryByTestId('status-row')).toBeNull();
    expect(screen.queryByTestId('sync-indicator')).toBeNull();
  });

  it('Sync now → cycle runs, toast "Everything is up to date", Last synced "today at …", indicator synced', async () => {
    const user = userEvent.setup();
    await signedIn();
    await tc!.container.goalService.create({ name: 'Read', why: '', targetType: 'daily', targetValue: 30, startDate: '2026-10-01', endDate: '2026-10-31' }, new Date());
    await renderApp({ route: '/settings', container: tc });
    await waitFor(() => expect(screen.getByTestId('pending-count')).toHaveTextContent('1 change'));
    await user.click(screen.getByTestId('sync-now'));
    await waitFor(() => expect(screen.getByTestId('toast')).toHaveTextContent(en.toast.syncNowDone));
    expect(tc!.auth!.server.live('goals', U1)).toHaveLength(1);
    await waitFor(() => expect(screen.getByTestId('pending-count')).toHaveTextContent('0 changes'));
    expect(screen.getByTestId('last-synced')).toHaveTextContent(/today at \d\d:\d\d/);
    expect(screen.getByTestId('sync-indicator')).toHaveAttribute('data-state', 'synced');
  });

  it('Sync now while the cloud is unreachable → A8 Alert + next retry, indicator error with Retry, no toast; Retry after recovery → synced', async () => {
    const user = userEvent.setup();
    await signedIn();
    tc!.auth!.remote.failure = unreachableError();
    await renderApp({ route: '/settings', container: tc });
    await user.click(screen.getByTestId('sync-now'));
    await waitFor(() => expect(screen.getByTestId('sync-error')).toHaveTextContent(en.errors.SYNC_UNREACHABLE));
    expect(screen.getByTestId('next-retry')).toHaveTextContent(/Trying again at \d\d:\d\d\./);
    expect(screen.queryByTestId('toast')).toBeNull();
    expect(screen.getByTestId('sync-indicator')).toHaveAttribute('data-state', 'error');
    tc!.auth!.remote.failure = null;
    await user.click(screen.getByRole('button', { name: en.sync.indicator.retryAria }));
    await waitFor(() => expect(screen.getByTestId('sync-indicator')).toHaveAttribute('data-state', 'synced'));
    expect(screen.queryByTestId('sync-error')).toBeNull();
  });

  it('(FR-55) preferences from the account apply live: language switches without reload, reminder on + 07:30, no permission prompt, toast in the new language', async () => {
    await signedIn({ permission: 'default' });
    tc!.auth!.server.seedPrefsRow(U1, { reminder_enabled: true, reminder_time: '07:30', reminder_updated_at: '2026-10-09T02:00:00.000Z', locale: 'vi', locale_updated_at: '2026-10-09T02:00:00.000Z' });
    await renderApp({ route: '/settings', container: tc });
    expect(tc!.i18n.language).toBe('en');
    await sync().syncNow('manual');
    await waitFor(() => expect(tc!.i18n.language).toBe('vi'));
    await waitFor(() => expect(screen.getByRole('heading', { level: 1, name: vi.settings.title })).toBeInTheDocument());
    await waitFor(() => expect(screen.getByTestId('toast')).toHaveTextContent(vi.toast.prefsFromAccount));
    const sw = screen.getByRole('switch', { name: vi.settings.reminders.switch });
    await waitFor(() => expect(sw).toBeChecked());
    expect(screen.getByLabelText(vi.settings.reminders.time)).toHaveValue('07:30');
    expect(tc!.notifications.requests).toBe(0);
    expect(screen.getByText(vi.settings.permission.default)).toBeInTheDocument();
    expect(screen.getByTestId('permission-desc')).toHaveTextContent(vi.settings.permission.defaultOnDesc);
    expect(screen.getByRole('button', { name: vi.settings.reminders.allow })).toBeInTheDocument();
    expect(scanVi()).toEqual([]);
  });

  it('Sync now that applies preferences from the account keeps the prefsFromAccount toast (no "Everything is up to date" over it)', async () => {
    const user = userEvent.setup();
    await signedIn();
    tc!.auth!.server.seedPrefsRow(U1, { reminder_enabled: true, reminder_time: '07:30', reminder_updated_at: '2026-10-09T02:00:00.000Z', locale: 'vi', locale_updated_at: '2026-10-09T02:00:00.000Z' });
    await renderApp({ route: '/settings', container: tc });
    await user.click(screen.getByTestId('sync-now'));
    await waitFor(() => expect(tc!.i18n.language).toBe('vi'));
    await waitFor(() => expect(screen.getByTestId('sync-indicator')).toHaveAttribute('data-state', 'synced'));
    await waitFor(() => expect(screen.getByTestId('toast')).toHaveTextContent(vi.toast.prefsFromAccount));
    await new Promise((r) => setTimeout(r, 50));
    expect(screen.getByTestId('toast')).toHaveTextContent(vi.toast.prefsFromAccount);
    expect(screen.getByTestId('toast')).not.toHaveTextContent(vi.toast.syncNowDone);
  });

  it('first sign-in with device data: only the merge toast (no "Signed in as …" under it); clean device: the plain toast', async () => {
    tc = await createTestContainer({ cloud: true });
    await tc.container.authService.init();
    await tc.container.goalService.create({ name: 'Read', why: '', targetType: 'daily', targetValue: 30, startDate: '2026-10-01', endDate: '2026-10-31' }, new Date());
    await renderApp({ route: '/settings', container: tc });
    tc.auth!.port.session = USER1;
    await tc.container.authService.completeCallback({ code: 'ok' });
    await sync().handleSignedIn(U1, USER1.email);
    await waitFor(() => expect(screen.getByTestId('toast')).toHaveTextContent('Signed in. Your account now has 1 goal, 0 entries.'));
    await new Promise((r) => setTimeout(r, 50));
    expect(screen.getByTestId('toast')).not.toHaveTextContent(`Signed in as ${USER1.email}`);
    expect(await sync().willAnnounceMerge()).toBe(true);
    await tc.dispose();

    tc = await createTestContainer({ cloud: true });
    await tc.container.authService.init();
    await renderApp({ route: '/settings', container: tc });
    tc.auth!.port.session = USER1;
    await tc.container.authService.completeCallback({ code: 'ok' });
    await sync().handleSignedIn(U1, USER1.email);
    await waitFor(() => expect(screen.getByTestId('toast')).toHaveTextContent(`Signed in as ${USER1.email}`));
  });

  it('(M7-D4) first sign-in with device data while the cloud fails: the plain "Signed in as …" toast is shown, not silence', async () => {
    tc = await createTestContainer({ cloud: true });
    await tc.container.authService.init();
    await tc.container.goalService.create({ name: 'Read', why: '', targetType: 'daily', targetValue: 30, startDate: '2026-10-01', endDate: '2026-10-31' }, new Date());
    tc.auth!.remote.failure = unreachableError();
    await renderApp({ route: '/settings', container: tc });
    tc.auth!.port.session = USER1;
    await tc.container.authService.completeCallback({ code: 'ok' });
    await sync().handleSignedIn(U1, USER1.email);
    await waitFor(() => expect(screen.getByTestId('toast')).toHaveTextContent(`Signed in as ${USER1.email}`));
    // The failed cycle settles slightly after the toast under load (M10-D5): wait for it instead of asserting at once.
    await waitFor(() => expect(screen.getByTestId('sync-indicator')).toHaveAttribute('data-state', 'error'));
  });

  it('D3 signed in: title/body variant, offline note when offline; signed out keeps the M3 dialog', async () => {
    await signedIn();
    await tc!.container.db.goals.put(buildGoal({ id: 'temp', name: 'Temp' }));
    await renderApp({ route: '/settings', container: tc });
    const s1 = datasetS1();
    const text = JSON.stringify(buildBackup({ goals: s1.goals, entries: s1.entries, settings: DEFAULT_SETTINGS }, FIXED_NOW));
    const pick = () => fireEvent.change(screen.getByTestId('import-file'), { target: { files: [new File([text], 'b.json', { type: 'application/json' })] } });
    pick();
    const dialog = await screen.findByRole('dialog');
    await waitFor(() => expect(dialog).toHaveAttribute('open'));
    expect(within(dialog).getByRole('heading', { level: 2 })).toHaveTextContent(en.import.titleSignedIn);
    expect(dialog).toHaveTextContent('This backup has 5 goals, 23 entries, exported 2026-10-09. Importing replaces everything currently on this device (1 goal, 0 entries) and, once synced, everything in your account too, so it changes your other devices as well.');
    expect(screen.queryByText(en.import.offlineNote)).toBeNull();
    setTestOnline(tc!, false);
    await waitFor(() => expect(screen.getByText(en.import.offlineNote)).toBeInTheDocument());
    setTestOnline(tc!, true);
    await userEvent.setup().click(within(dialog).getByRole('button', { name: en.import.confirm }));
    await waitFor(() => expect(screen.getByTestId('toast')).toHaveTextContent('Backup imported: 5 goals, 23 entries'));
    // Signed in: imported rows are stamped "now" (A-29), the stray goal is tombstoned and will be pushed.
    expect((await tc!.container.db.goals.get('temp'))?.deletedAt).toBeTruthy();
    expect((await tc!.container.db.goals.get('g1'))?.updatedAt).not.toBe(s1.goals[0].updatedAt);
    expect(await tc!.container.db.goals.where('dirty').equals(1).count()).toBe(6);
  });

  it('D4 with pending changes: warning with the count; Keep → final sync pushes before signing out', async () => {
    const user = userEvent.setup();
    await signedIn();
    await tc!.container.goalService.create({ name: 'Read', why: '', targetType: 'daily', targetValue: 30, startDate: '2026-10-01', endDate: '2026-10-31' }, new Date());
    await tc!.container.goalService.create({ name: 'Two', why: '', targetType: 'daily', targetValue: 30, startDate: '2026-10-01', endDate: '2026-10-31' }, new Date());
    await renderApp({ route: '/settings', container: tc });
    await waitFor(() => expect(screen.getByTestId('pending-count')).toHaveTextContent('2 changes'));
    await user.click(screen.getByRole('button', { name: en.settings.account.signOut }));
    const dialog = screen.getByTestId('signout-dialog');
    await waitFor(() => expect(dialog).toHaveAttribute('open'));
    expect(screen.getByTestId('unsynced-warning')).toHaveTextContent(en.auth.signOut.unsynced_other.replace('{{count}}', '2'));
    expect(screen.getByTestId('unsynced-warning')).toHaveTextContent(en.auth.signOut.unsyncedOnline);
    await user.click(screen.getByTestId('signout-confirm'));
    await waitFor(() => expect(card()).toHaveAttribute('data-state', 'signed-out'));
    expect(tc!.auth!.server.live('goals', U1)).toHaveLength(2);
    expect(tc!.auth!.port.calls.signOut).toBe(1);
    expect(screen.queryByTestId('status-row')).toBeNull();
  });

  it('D4 Remove while the final sync fails: dialog stays with the Alert and "Remove anyway"; confirming again removes the data', async () => {
    const user = userEvent.setup();
    await signedIn();
    await tc!.container.goalService.create({ name: 'Read', why: '', targetType: 'daily', targetValue: 30, startDate: '2026-10-01', endDate: '2026-10-31' }, new Date());
    tc!.auth!.remote.failure = unreachableError();
    await renderApp({ route: '/settings', container: tc });
    await waitFor(() => expect(screen.getByTestId('pending-count')).toHaveTextContent('1 change'));
    await user.click(screen.getByRole('button', { name: en.settings.account.signOut }));
    await user.click(screen.getByRole('radio', { name: en.auth.signOut.remove }));
    expect(screen.getByTestId('unsynced-remove')).toHaveTextContent(en.auth.signOut.unsyncedRemove);
    await user.click(screen.getByTestId('signout-confirm'));
    await waitFor(() => expect(within(screen.getByTestId('signout-dialog')).getByRole('alert')).toHaveTextContent(en.auth.signOut.syncFailed));
    expect(card()).toHaveAttribute('data-state', 'signed-in');
    expect(screen.getByTestId('signout-confirm')).toHaveTextContent(en.auth.signOut.removeAnyway);
    await user.click(screen.getByTestId('signout-confirm'));
    await waitFor(() => expect(card()).toHaveAttribute('data-state', 'signed-out'));
    expect(await tc!.container.db.goals.count()).toBe(0);
    await waitFor(() => expect(screen.getByTestId('toast')).toHaveTextContent(en.toast.signedOutRemoved));
  });

  it('D5: another account with local data → merge dialog; Cancel signs out keeping lastUserId; Add to account pushes and toasts', async () => {
    const user = userEvent.setup();
    await signedIn();
    await tc!.container.db.kv.put({ key: 'sync', value: { userId: U1, lastUserId: USER2.userId, account: { email: USER1.email, name: USER1.name } } });
    await tc!.container.goalService.create({ name: 'Read', why: '', targetType: 'daily', targetValue: 30, startDate: '2026-10-01', endDate: '2026-10-31' }, new Date());
    await tc!.container.entryService.add({ goalId: (await tc!.container.goalService.watchAll(), (await tc!.container.db.goals.toArray())[0].id), date: '2026-10-05', minutes: 10, note: '', source: 'manual' }, new Date());
    await renderApp({ route: '/settings', container: tc });
    void sync().handleSignedIn(U1, USER1.email);
    const dialog = await screen.findByTestId('merge-dialog');
    await waitFor(() => expect(dialog).toHaveAttribute('open'));
    expect(dialog).toHaveTextContent('This device still has 1 goal, 1 entry from another account.');
    expect(dialog).toHaveTextContent(USER1.email);
    expect(within(dialog).getByRole('button', { name: en.common.cancel })).toHaveFocus();
    expect(sync().current().kind).toBe('paused');
    await user.click(within(dialog).getByRole('button', { name: en.common.cancel }));
    await waitFor(() => expect(card()).toHaveAttribute('data-state', 'signed-out'));
    await waitFor(() => expect(screen.getByTestId('toast')).toHaveTextContent(en.toast.signedOutKept));
    expect(tc!.auth!.server.live('goals', U1)).toHaveLength(0);
    expect(((await tc!.container.db.kv.get('sync')) as { value: { lastUserId: string } }).value.lastUserId).toBe(USER2.userId);
    expect(await tc!.container.db.goals.count()).toBe(1);

    // Sign in again (same other-account history) → the question comes back; this time add.
    tc!.auth!.port.session = USER1;
    await tc!.container.authService.completeCallback({ code: 'ok' });
    await waitFor(() => expect(card()).toHaveAttribute('data-state', 'signed-in'));
    void sync().handleSignedIn(U1, USER1.email);
    const again = await screen.findByTestId('merge-dialog');
    await waitFor(() => expect(again).toHaveAttribute('open'));
    await user.click(within(again).getByRole('button', { name: en.auth.merge.confirm }));
    await waitFor(() => expect(screen.getByTestId('toast')).toHaveTextContent('Signed in. Your account now has 1 goal, 1 entry.'));
    expect(tc!.auth!.server.live('goals', U1)).toHaveLength(1);
    expect(tc!.auth!.server.live('entries', U1)).toHaveLength(1);
    await waitFor(() => expect(screen.getByTestId('sync-indicator')).toHaveAttribute('data-state', 'synced'));
  });

  it('vi: Settings signed in (sync details, notes), D3 signed in, D4 with warning, D5 have no English leaks', async () => {
    const user = userEvent.setup();
    await signedIn({ locale: 'vi' });
    await tc!.container.db.kv.put({ key: 'locale', value: 'vi' });
    await tc!.container.goalService.create({ name: 'Read', why: '', targetType: 'daily', targetValue: 30, startDate: '2026-10-01', endDate: '2026-10-31' }, new Date());
    await renderApp({ route: '/settings', container: tc });
    await waitFor(() => expect(screen.getByTestId('pending-count')).toHaveTextContent('1 thay đổi'));
    expect(scanVi()).toEqual([]);
    const s1 = datasetS1();
    const text = JSON.stringify(buildBackup({ goals: s1.goals, entries: s1.entries, settings: DEFAULT_SETTINGS }, FIXED_NOW));
    fireEvent.change(screen.getByTestId('import-file'), { target: { files: [new File([text], 'b.json', { type: 'application/json' })] } });
    const d3 = await screen.findByRole('dialog');
    await waitFor(() => expect(d3).toHaveAttribute('open'));
    expect(within(d3).getByRole('heading', { level: 2 })).toHaveTextContent(vi.import.titleSignedIn);
    expect(scanVi()).toEqual([]);
    await user.click(within(d3).getByRole('button', { name: vi.common.cancel }));
    await user.click(screen.getByRole('button', { name: vi.settings.account.signOut }));
    await waitFor(() => expect(screen.getByTestId('signout-dialog')).toHaveAttribute('open'));
    expect(screen.getByTestId('unsynced-warning')).toHaveTextContent(vi.auth.signOut.unsynced_other.replace('{{count}}', '1'));
    expect(scanVi()).toEqual([]);
    await user.click(within(screen.getByTestId('signout-dialog')).getByRole('button', { name: vi.common.cancel }));
    await tc!.container.db.kv.put({ key: 'sync', value: { userId: U1, lastUserId: USER2.userId, account: { email: USER1.email, name: USER1.name } } });
    void sync().handleSignedIn(U1, USER1.email);
    const d5 = await screen.findByTestId('merge-dialog');
    await waitFor(() => expect(d5).toHaveAttribute('open'));
    expect(d5).toHaveTextContent('Thiết bị này vẫn còn 1 mục tiêu, 0 lần ghi từ một tài khoản khác.');
    expect(scanVi()).toEqual([]);
    expect(buildEntry).toBeDefined();
  });
});
