// M8-AC2 (LoginPromptBanner on Today), M8-AC3 (ExportSignInHint), M8-AC4 e2e part (fixed entry points),
// and the backlog fix M7-D5 (rows the cloud refused are named in D4 before "Remove").
import type { Page } from '@playwright/test';
import { expect, test } from './fixtures';
import { createGoal, EN, expectAxeClean, expectNoHorizontalScroll, FIXED_TIME, freezeClock, goalCard, gotoHash, importBackup, kvGet, logTime, toast } from '../helpers/app';
import { accountCard, CLOUD_BASE_URL, collectErrors, expectSyncState, signInAsMinh, signInViaMock, signOutDialog, syncIndicator } from './helpers';

const DAY = 86_400_000;
const plus = (days: number) => new Date(FIXED_TIME.getTime() + days * DAY);
const banner = (page: Page) => page.getByTestId('login-prompt-banner');
const backupBanner = (page: Page) => page.getByTestId('backup-banner');

test.beforeEach(async ({ page, mock }) => {
  await mock.reset();
  await freezeClock(page);
});

test.describe('M8-AC2 LoginPromptBanner on Today (FR-52)', () => {
  test('S1 imported → banner (section, no dialog), goals still usable, BackupBanner hidden; "Not now" → hidden + toast + focus h1 + BackupBanner; stays hidden after reload; back after 14 days; gone for good after 3 × "Not now"', async ({ page }) => {
    const errors = collectErrors(page);
    await importBackup(page);
    await gotoHash(page, '/today');
    const b = banner(page);
    await expect(b).toBeVisible();
    expect(await b.evaluate((el) => el.tagName)).toBe('SECTION');
    await expect(b).toHaveAttribute('aria-label', EN.loginPrompt.label);
    await expect(b).not.toHaveAttribute('role', /./);
    await expect(b).not.toHaveAttribute('aria-modal', /./);
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(b.getByText(EN.loginPrompt.title)).toBeVisible();
    await expect(b.getByRole('button', { name: EN.auth.signInGoogle })).toBeEnabled();
    await expect(b.getByRole('button', { name: EN.loginPrompt.notNow })).toBeEnabled();
    await expect(backupBanner(page)).toHaveCount(0);
    // Focus did not move into the banner; the page heading has it (route change).
    expect(await b.evaluate((el) => el.contains(document.activeElement))).toBe(false);
    await expectAxeClean(page);
    // Logging time works with the banner showing.
    await logTime(page, 'Read', 10);
    await expect(toast(page)).toHaveText(EN.toast.entrySaved);
    await expect(goalCard(page, 'Read').locator('.amount')).toContainText('10/30');
    await expect(b).toBeVisible();

    // "Not now"
    await b.getByRole('button', { name: EN.loginPrompt.notNow }).click();
    await expect(b).toHaveCount(0);
    await expect(toast(page)).toHaveText(EN.loginPrompt.snoozedToast);
    await expect(page.getByRole('heading', { level: 1, name: EN.today.title })).toBeFocused();
    await expect(backupBanner(page)).toBeVisible();
    expect(await kvGet(page, 'loginPrompt')).toMatchObject({ dismissCount: 1, lastDismissedAt: FIXED_TIME.toISOString() });
    await page.reload();
    await expect(page.getByRole('heading', { level: 1, name: EN.today.title })).toBeVisible();
    await expect(backupBanner(page)).toBeVisible();
    await expect(b).toHaveCount(0);

    // +14 days: back. Second and third "Not now", each 14 days later; then +100 more days: never again.
    await freezeClock(page, plus(14));
    await page.reload();
    await expect(b).toBeVisible();
    await b.getByRole('button', { name: EN.loginPrompt.notNow }).click();
    await expect(b).toHaveCount(0);
    await freezeClock(page, plus(28));
    await page.reload();
    await expect(b).toBeVisible();
    await b.getByRole('button', { name: EN.loginPrompt.notNow }).click();
    await expect(b).toHaveCount(0);
    expect(await kvGet(page, 'loginPrompt')).toMatchObject({ dismissCount: 3 });
    await freezeClock(page, plus(142));
    await page.reload();
    await expect(page.getByRole('heading', { level: 1, name: EN.today.title })).toBeVisible();
    await expect(b).toHaveCount(0);
    // The Account card is the permanent entry point (FR-54).
    await gotoHash(page, '/settings');
    await expect(accountCard(page)).toHaveAttribute('data-state', 'signed-out');
    await expect(accountCard(page).getByRole('button', { name: EN.auth.signInGoogle })).toBeEnabled();
    await expect(accountCard(page).getByText(EN.settings.account.descSignedOut)).toBeVisible();
    await expect(accountCard(page).getByRole('button', { name: EN.loginPrompt.notNow })).toHaveCount(0);
    expect(errors.list).toEqual([]);
  });

  test('"Sign in with Google" on the banner → back on #/today, signed in, banner gone, sync indicator showing', async ({ page, mock }) => {
    await importBackup(page);
    await gotoHash(page, '/today');
    await expect(banner(page)).toBeVisible();
    await signInViaMock(page, 'Minh Test');
    expect(page.url()).toBe(`${CLOUD_BASE_URL}#/today`);
    await expect(page.getByRole('heading', { level: 1, name: EN.today.title })).toBeVisible();
    await expect(banner(page)).toHaveCount(0);
    await expect(toast(page)).toHaveText('Signed in. Your account now has 5 goals, 23 entries.', { timeout: 15_000 });
    await expectSyncState(page, 'synced');
    await expect(syncIndicator(page)).toBeVisible();
    expect((await mock.liveRows('u1')).goals).toHaveLength(5);
    // Signed in: no banner anywhere, also after a reload.
    await page.reload();
    await expect(page.getByRole('heading', { level: 1, name: EN.today.title })).toBeVisible();
    await expect(banner(page)).toHaveCount(0);
  });

  test('fresh database with one goal created today and no entries → no banner; offline → no banner even with S1', async ({ page, context }) => {
    await createGoal(page, { name: 'Read', targetValue: 30 });
    await gotoHash(page, '/today');
    await expect(goalCard(page, 'Read')).toBeVisible();
    await expect(banner(page)).toHaveCount(0);
    await importBackup(page);
    await context.setOffline(true);
    await gotoHash(page, '/today');
    await expect(goalCard(page, 'Read')).toBeVisible();
    await expect(banner(page)).toHaveCount(0);
    await context.setOffline(false);
    await expect(banner(page)).toBeVisible();
  });

  test('360 px: the banner fits without horizontal scroll (en)', async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 740 });
    await importBackup(page);
    await gotoHash(page, '/today');
    await expect(banner(page)).toBeVisible();
    await expectNoHorizontalScroll(page);
    await expectAxeClean(page);
  });
});

test.describe('M8-AC3 ExportSignInHint (FR-53)', () => {
  const hint = (page: Page) => page.getByTestId('export-sign-in-hint');

  async function exportBackup(page: Page): Promise<void> {
    const download = page.waitForEvent('download');
    await page.getByRole('button', { name: EN.settings.backup.export }).click();
    await download;
    await expect(toast(page)).toHaveText(EN.toast.backupExported);
  }

  test('signed out + S1: Export → hint with a Google button; a second export the same day does not re-claim; +30 days → hint again; the hint button signs in with returnTo #/settings', async ({ page }) => {
    await importBackup(page);
    await expect(hint(page)).toHaveCount(0);
    await exportBackup(page);
    await expect(hint(page)).toBeVisible();
    await expect(hint(page)).toHaveAttribute('role', 'group');
    await expect(hint(page)).toHaveAttribute('aria-label', EN.exportHint.label);
    await expect(hint(page).getByText(EN.exportHint.text)).toBeVisible();
    await expect(hint(page).getByRole('button', { name: EN.auth.signInGoogle })).toBeEnabled();
    const first = (await kvGet(page, 'loginPrompt')) as { lastExportHintAt: string };
    expect(first.lastExportHintAt).toBe(FIXED_TIME.toISOString());
    await expectAxeClean(page);

    // Same day: no new claim; after a reload nothing is shown by Export.
    await exportBackup(page);
    expect(((await kvGet(page, 'loginPrompt')) as { lastExportHintAt: string }).lastExportHintAt).toBe(first.lastExportHintAt);
    await page.reload();
    await expect(page.getByRole('heading', { level: 1, name: EN.settings.title })).toBeVisible();
    await exportBackup(page);
    await expect(hint(page)).toHaveCount(0);

    // +29 days: still nothing; +30 days: the hint.
    await freezeClock(page, plus(29));
    await page.reload();
    await exportBackup(page);
    await expect(hint(page)).toHaveCount(0);
    await freezeClock(page, plus(30));
    await page.reload();
    await exportBackup(page);
    await expect(hint(page)).toBeVisible();
    expect(((await kvGet(page, 'loginPrompt')) as { lastExportHintAt: string }).lastExportHintAt).toBe(plus(30).toISOString());

    // Shortcut to the same sign-in as the Account card.
    await freezeClock(page);
    await hint(page).getByRole('button', { name: EN.auth.signInGoogle }).click();
    await page.waitForURL((u) => u.pathname === '/auth/v1/authorize');
    await page.getByRole('button', { name: 'Minh Test', exact: true }).click();
    await page.waitForURL((u) => u.origin === new URL(CLOUD_BASE_URL).origin && !u.searchParams.has('code'));
    expect(page.url()).toBe(`${CLOUD_BASE_URL}#/settings`);
    await expect(accountCard(page)).toHaveAttribute('data-state', 'signed-in');
    await expect(hint(page)).toHaveCount(0);
  });

  test('signed in: Export shows the toast only', async ({ page }) => {
    await importBackup(page);
    await signInAsMinh(page);
    await expectSyncState(page, 'synced');
    await exportBackup(page);
    await expect(hint(page)).toHaveCount(0);
    expect(await kvGet(page, 'loginPrompt')).toBeNull();
  });
});

test.describe('M8-AC4 copy by state (FR-54) — e2e part', () => {
  test('signed out: Backup/About/Storage copy; signed in: copy switches; Storage "Go to Account" focuses the Google button when storage is not protected', async ({ page }) => {
    await createGoal(page, { name: 'Read', targetValue: 30 });
    await gotoHash(page, '/settings');
    await expect(page.getByTestId('backup-desc')).toHaveText(EN.settings.backup.descSignedOut);
    await expect(page.getByText(EN.settings.about.descCloud)).toBeVisible();
    await expect(page.getByText(EN.settings.about.privacy)).toBeVisible();
    const storageDesc = page.getByTestId('storage-desc');
    await expect(storageDesc).toBeVisible();
    const notProtected = (await page.getByText(EN.settings.storage.notProtected, { exact: true }).count()) > 0;
    if (notProtected) {
      await expect(storageDesc).toContainText(EN.settings.storage.notProtectedSignIn);
      await page.getByTestId('storage-go-to-account').click();
      await expect(accountCard(page).getByRole('button', { name: EN.auth.signInGoogle })).toBeFocused();
    } else {
      // Headless Chromium granted persistent storage: the sign-in line is for "Not protected" only (component test covers it).
      await expect(storageDesc).not.toContainText(EN.settings.storage.notProtectedSignIn);
      await expect(page.getByTestId('storage-go-to-account')).toHaveCount(0);
    }
    await signInViaMock(page, 'Minh Test');
    await expect(accountCard(page)).toHaveAttribute('data-state', 'signed-in');
    await expect(page.getByTestId('backup-desc')).toHaveText(EN.settings.backup.descSignedIn);
    await expect(page.getByText(EN.settings.about.descSignedIn)).toBeVisible();
    await expect(storageDesc).not.toContainText(EN.settings.storage.notProtectedSignIn);
    await expect(page.getByTestId('storage-go-to-account')).toHaveCount(0);
  });
});

// ---- Backlog M7-D5 / M7-P1 ----

const LONG_ID = 'x'.repeat(70);

/** Pre-M7 data path: a row with an id the cloud refuses (> 64 chars) written straight into IndexedDB. */
async function plantLongIdGoal(page: Page): Promise<void> {
  await page.evaluate(
    (longId) =>
      new Promise<void>((resolve, reject) => {
        const req = indexedDB.open('one-percent-better');
        req.onerror = () => reject(req.error);
        req.onsuccess = () => {
          const db = req.result;
          const tx = db.transaction(['goals', 'entries'], 'readwrite');
          const stamp = '2026-10-08T01:00:00.000Z';
          tx.objectStore('goals').put({ id: longId, name: 'Legacy id', why: '', targetType: 'daily', targetMinutes: 10, startDate: '2026-01-01', endDate: '2027-12-31', archived: false, createdAt: stamp, updatedAt: stamp, deletedAt: null, dirty: 1 });
          tx.objectStore('entries').put({ id: 'legacy-e1', goalId: longId, date: '2026-10-08', minutes: 10, note: '', source: 'manual', createdAt: stamp, updatedAt: stamp, deletedAt: null, dirty: 1 });
          tx.oncomplete = () => {
            db.close();
            resolve();
          };
          tx.onerror = () => reject(tx.error);
        };
      }),
    LONG_ID,
  );
}

test.describe('M7-D5 rows the cloud refused: D4 warns before "Remove"; M7-P1 wording on the Account card', () => {
  test('2 flagged rows → Account card names items on this device (not "from your account"); Sign out → Remove shows the warning block, the Remove description no longer promises the account keeps everything, the status note says they will be lost; confirming removes them', async ({ page, mock }) => {
    const errors = collectErrors(page);
    await importBackup(page);
    await plantLongIdGoal(page);
    await signInAsMinh(page);
    await expectSyncState(page, 'synced', 25_000);
    await expect.poll(async () => (await mock.liveRows('u1')).goals.length, { timeout: 15_000 }).toBe(5);
    const line = page.getByTestId('remote-invalid');
    await expect(line).toBeVisible();
    await expect(line).toHaveAttribute('data-reason', 'local');
    await expect(line).toHaveText(EN.settings.account.localRejected_other.replace('{{count}}', '2'));

    await accountCard(page).getByRole('button', { name: EN.settings.account.signOut }).click();
    const d4 = signOutDialog(page);
    await expect(d4).toBeVisible();
    const warning = d4.getByTestId('unsynced-warning');
    await expect(warning).toBeVisible();
    await expect(warning).toHaveAttribute('data-rejected', '2');
    await expect(warning).toContainText(EN.auth.signOut.rejected_other.replace('{{count}}', '2'));
    await expect(warning).toContainText(EN.auth.signOut.rejectedKeep);
    await expect(d4.getByText(EN.auth.signOut.removeDesc, { exact: true })).toHaveCount(0);
    await expect(d4.getByText(EN.auth.signOut.removeDescRejected, { exact: true })).toBeVisible();
    await expect(d4.getByTestId('unsynced-remove')).toHaveText('');
    await d4.getByRole('radio', { name: EN.auth.signOut.remove }).check();
    await expect(d4.getByTestId('unsynced-remove')).toHaveText(EN.auth.signOut.rejectedRemove);
    await expectAxeClean(page);
    await d4.getByTestId('signout-confirm').click();
    await expect(accountCard(page)).toHaveAttribute('data-state', 'signed-out', { timeout: 20_000 });
    await expect(toast(page)).toHaveText(EN.toast.signedOutRemoved);
    await gotoHash(page, '/today');
    await expect(page.getByRole('heading', { level: 2, name: EN.empty.today.noGoals })).toBeVisible();
    expect(errors.list).toEqual([]);
  });

  test('Keep: the flagged rows stay on the device and D4 says so', async ({ page }) => {
    await importBackup(page);
    await plantLongIdGoal(page);
    await signInAsMinh(page);
    await expectSyncState(page, 'synced', 25_000);
    await expect(page.getByTestId('remote-invalid')).toBeVisible();
    await accountCard(page).getByRole('button', { name: EN.settings.account.signOut }).click();
    await expect(signOutDialog(page).getByTestId('rejected-warning')).toHaveText(EN.auth.signOut.rejected_other.replace('{{count}}', '2'));
    await signOutDialog(page).getByTestId('signout-confirm').click();
    await expect(accountCard(page)).toHaveAttribute('data-state', 'signed-out', { timeout: 20_000 });
    await gotoHash(page, '/today');
    await expect(goalCard(page, 'Legacy id')).toBeVisible();
    await expect(goalCard(page, 'Read')).toBeVisible();
  });
});
