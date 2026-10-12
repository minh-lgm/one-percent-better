// M7-AC15: Vietnamese, axe and 360 px for the sync UI (merge flow and offline → online in vi-VN).
import { expect, test } from './fixtures';
import { createGoal, expectAxeClean, expectNoHorizontalScroll, expectNoViLeaks, gotoHash, importBackup, logTime, toast, VI } from '../helpers/app';
import { accountCard, C1, expectSyncState, signInViaMock, signOutDialog, syncIndicator } from './helpers';

const READ = { name: 'Read', targetValue: 30, startDate: '2026-10-01', endDate: '2026-10-31' };

test.describe('M7-AC15 vi-VN', () => {
  test.use({ locale: 'vi-VN' });

  test.beforeEach(async ({ mock }) => {
    await mock.reset();
  });

  test('merge flow (M7-AC7) in vi: toast, indicator, Account details, D5 when switching accounts; no English leaks; axe clean', async ({ page, mock }) => {
    await mock.seed('u1', C1);
    await importBackup(page, 'sample-backup.json', VI);
    await signInViaMock(page, 'Minh Test', VI);
    await expect(toast(page)).toHaveText('Đã đăng nhập. Tài khoản của bạn hiện có 6 mục tiêu, 25 lần ghi.', { timeout: 15_000 });
    await expectSyncState(page, 'synced');
    await expect(syncIndicator(page)).toHaveText(/^Đã đồng bộ \d\d:\d\d$/);
    await expect(page.getByTestId('last-synced')).toHaveText(/^hôm nay lúc \d\d:\d\d$/);
    await expect(page.getByTestId('pending-count')).toHaveText('0 thay đổi');
    await expect(page.getByTestId('language-sync-note')).toHaveText(VI.settings.language.syncNote);
    await expectNoViLeaks(page);
    await expectAxeClean(page);
    await gotoHash(page, '/today');
    await expectNoViLeaks(page);
    await expectAxeClean(page);

    await gotoHash(page, '/settings');
    await accountCard(page).getByRole('button', { name: VI.settings.account.signOut }).click();
    await expect(signOutDialog(page)).toBeVisible();
    await expectNoViLeaks(page);
    await page.getByTestId('signout-confirm').click();
    await expect(accountCard(page)).toHaveAttribute('data-state', 'signed-out');
    await signInViaMock(page, 'Other User', VI);
    const d5 = page.getByTestId('merge-dialog');
    await expect(d5).toHaveAttribute('open');
    await expect(d5).toContainText('Thiết bị này vẫn còn 6 mục tiêu, 25 lần ghi từ một tài khoản khác.');
    await expectNoViLeaks(page);
    await expectAxeClean(page);
    await d5.getByRole('button', { name: VI.common.cancel }).click();
    await expect(toast(page)).toHaveText(VI.toast.signedOutKept);
  });

  test('offline → online (M7-AC8) in vi; D4 with the unsynced warning; 360 px without horizontal scroll', async ({ page, context }) => {
    await page.setViewportSize({ width: 360, height: 740 });
    await createGoal(page, READ, VI);
    await gotoHash(page, '/settings');
    await signInViaMock(page, 'Minh Test', VI);
    await expectSyncState(page, 'synced');
    await gotoHash(page, '/today');
    await expectNoHorizontalScroll(page);
    await context.setOffline(true);
    await logTime(page, 'Read', 10, '', VI);
    await expectSyncState(page, 'offline');
    await expect(syncIndicator(page)).toHaveText('Ngoại tuyến · 1 thay đổi đang chờ');
    await expectNoViLeaks(page);
    await expectNoHorizontalScroll(page);
    await gotoHash(page, '/settings');
    await expect(page.getByTestId('pending-count')).toHaveText('1 thay đổi');
    await expect(page.getByTestId('offline-sync')).toHaveText(VI.settings.account.offlineSync);
    await expectNoViLeaks(page);
    await expectNoHorizontalScroll(page);
    await accountCard(page).getByRole('button', { name: VI.settings.account.signOut }).click();
    await expect(signOutDialog(page).getByTestId('unsynced-warning')).toContainText('1 thay đổi chưa được đồng bộ vào tài khoản của bạn.');
    await expectNoViLeaks(page);
    await expectAxeClean(page);
    await expectNoHorizontalScroll(page);
    await signOutDialog(page).getByRole('button', { name: VI.common.cancel }).click();
    await context.setOffline(false);
    await expectSyncState(page, 'synced', 10_000);
    await expect(page.getByTestId('pending-count')).toHaveText('0 thay đổi');
  });
});
