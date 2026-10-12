// M7-AC7 (merge on first sign-in, account switch with D5) and M7-AC12 (sign out with pending changes).
import { expect, test } from './fixtures';
import { createGoal, EN, gotoHash, importBackup, logTime, toast } from '../helpers/app';
import { accountCard, C1, collectErrors, expectSyncState, pendingCount, signInAsMinh, signInViaMock, signOutDialog, storedSession, syncNow } from './helpers';

const READ = { name: 'Read', targetValue: 30, startDate: '2026-10-01', endDate: '2026-10-31' };

test.beforeEach(async ({ mock }) => {
  await mock.reset();
});

test.describe('M7-AC7 merge and account switch (FR-47)', () => {
  test('S1 on the device + C1 in the account → silent merge with the toast; a second device sees 6 goals / 25 entries; D5 when switching to another account', async ({ page, mock, device }) => {
    const errors = collectErrors(page);
    await mock.seed('u1', C1);
    await importBackup(page);
    await signInAsMinh(page);
    await expect(toast(page)).toHaveText('Signed in. Your account now has 6 goals, 25 entries.', { timeout: 15_000 });
    await expectSyncState(page, 'synced');
    expect(await pendingCount(page)).toBe(0);
    await gotoHash(page, '/goals');
    await expect(page.getByRole('heading', { level: 3 })).toHaveCount(6);
    await expect(page.getByRole('heading', { level: 3, name: 'Cloud goal' })).toBeVisible();
    const u1 = await mock.liveRows('u1');
    expect(u1.goals).toHaveLength(6);
    expect(u1.entries).toHaveLength(25);

    // Device B: a new context signs in and receives everything.
    const b = await device();
    await signInAsMinh(b.page);
    await expectSyncState(b.page, 'synced');
    await gotoHash(b.page, '/goals');
    await expect(b.page.getByRole('heading', { level: 3 })).toHaveCount(6);
    await expect(b.page.getByRole('heading', { level: 3, name: 'Spanish' })).toBeVisible();

    // Same account again after Sign out (Keep): no D5, straight to synced.
    await gotoHash(page, '/settings');
    await accountCard(page).getByRole('button', { name: EN.settings.account.signOut }).click();
    await page.getByTestId('signout-confirm').click();
    await expect(accountCard(page)).toHaveAttribute('data-state', 'signed-out');
    await signInViaMock(page, 'Minh Test');
    await expect(accountCard(page)).toHaveAttribute('data-state', 'signed-in');
    await expect(page.getByTestId('merge-dialog')).not.toHaveAttribute('open');
    await expectSyncState(page, 'synced');

    // Switch to u2: D5 names the local data; Cancel = signed out, nothing uploaded.
    await accountCard(page).getByRole('button', { name: EN.settings.account.signOut }).click();
    await page.getByTestId('signout-confirm').click();
    await expect(accountCard(page)).toHaveAttribute('data-state', 'signed-out');
    await signInViaMock(page, 'Other User');
    const d5 = page.getByTestId('merge-dialog');
    await expect(d5).toHaveAttribute('open');
    await expect(d5).toContainText('This device still has 6 goals, 25 entries from another account.');
    await expect(d5).toContainText('other.user@example.com');
    await expect(d5.getByRole('button', { name: EN.common.cancel })).toBeFocused();
    await d5.getByRole('button', { name: EN.common.cancel }).click();
    await expect(accountCard(page)).toHaveAttribute('data-state', 'signed-out');
    await expect(toast(page)).toHaveText(EN.toast.signedOutKept);
    expect((await mock.liveRows('u2')).goals).toHaveLength(0);
    expect(await storedSession(page)).toBeNull();

    // Again → Add to account: u2 receives the 6 goals / 25 entries, u1 is unchanged.
    await signInViaMock(page, 'Other User');
    await expect(d5).toHaveAttribute('open');
    await d5.getByRole('button', { name: EN.auth.merge.confirm }).click();
    await expect(toast(page)).toHaveText('Signed in. Your account now has 6 goals, 25 entries.', { timeout: 15_000 });
    await expectSyncState(page, 'synced');
    const u2 = await mock.liveRows('u2');
    expect(u2.goals).toHaveLength(6);
    expect(u2.entries).toHaveLength(25);
    const u1After = await mock.liveRows('u1');
    expect(u1After.goals).toHaveLength(6);
    expect(u1After.entries).toHaveLength(25);
    expect(errors.list).toEqual([]);
  });
});

test.describe('M7-AC12 sign out with changes waiting (FR-41)', () => {
  test('offline with 2 pending entries: D4 warns "2 changes", Keep keeps them on the device; back online + sign in → they reach the account', async ({ page, context, mock }) => {
    await createGoal(page, READ);
    await signInAsMinh(page);
    await expectSyncState(page, 'synced');
    await context.setOffline(true);
    await gotoHash(page, '/today');
    await logTime(page, 'Read', 10);
    await logTime(page, 'Read', 5);
    await expectSyncState(page, 'offline');
    await expect(page.getByTestId('sync-indicator')).toContainText('Offline · 2 changes waiting');
    await gotoHash(page, '/settings');
    await accountCard(page).getByRole('button', { name: EN.settings.account.signOut }).click();
    const d4 = signOutDialog(page);
    await expect(d4.getByTestId('unsynced-warning')).toContainText("2 changes haven't synced to your account yet.");
    await expect(d4.getByTestId('unsynced-warning')).toContainText(EN.auth.signOut.unsyncedOffline);
    await page.getByTestId('signout-confirm').click();
    await expect(accountCard(page)).toHaveAttribute('data-state', 'signed-out');
    await gotoHash(page, '/today');
    await expect(page.getByRole('article', { name: 'Read' }).locator('.amount')).toContainText('15/30');
    expect((await mock.liveRows('u1')).entries).toHaveLength(0);

    await context.setOffline(false);
    await signInAsMinh(page);
    await expectSyncState(page, 'synced');
    await expect.poll(async () => (await mock.liveRows('u1')).entries.length, { timeout: 15_000 }).toBe(2);
  });

  test('online with 1 pending change: Sign out (Keep) pushes it before the session is dropped', async ({ page, mock }) => {
    await createGoal(page, READ);
    await signInAsMinh(page);
    await expectSyncState(page, 'synced');
    // Block the background push so the change is still pending when the dialog opens.
    await mock.fail('rest', 500, 50);
    await gotoHash(page, '/today');
    await logTime(page, 'Read', 10);
    await expectSyncState(page, 'error');
    await mock.clearFailures();
    await gotoHash(page, '/settings');
    await expect.poll(() => pendingCount(page)).toBe(1);
    const before = (await mock.log()).log.length;
    await accountCard(page).getByRole('button', { name: EN.settings.account.signOut }).click();
    await expect(signOutDialog(page).getByTestId('unsynced-warning')).toContainText("1 change hasn't synced to your account yet.");
    await expect(signOutDialog(page).getByTestId('unsynced-warning')).toContainText(EN.auth.signOut.unsyncedOnline);
    await page.getByTestId('signout-confirm').click();
    await expect(accountCard(page)).toHaveAttribute('data-state', 'signed-out');
    const after = (await mock.log()).log.slice(before);
    const upsert = after.findIndex((l) => l.method === 'POST' && l.path === '/rest/v1/entries');
    expect(upsert).toBeGreaterThanOrEqual(0);
    expect((await mock.liveRows('u1')).entries).toHaveLength(1);
    // supabase-js `signOut({ scope: 'local' })` does not call /auth/v1/logout (M6 deviation D4): the push simply precedes the local sign-out.
    expect(await storedSession(page)).toBeNull();
    expect(syncNow).toBeDefined();
  });
});
