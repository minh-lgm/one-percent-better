// M8-AC5: the whole phase-2 journey, en-US and vi-VN, device A at 1440 px and device B at 360 px.
// Install → use without an account → prompt → sign in from the banner → two devices sync (offline edit,
// Sync now, reminder time) → export → Sign out (Keep) → delete on B → sign in again on A → Sign out (Remove) on B.
// Every screen: vi scan (vi-VN), axe 0 serious/critical, no horizontal scroll; 0 page errors; only the two origins.
import type { Page } from '@playwright/test';
import { expect, test } from './fixtures';
import { at, createGoal, EN, expectAmount, expectAxeClean, expectNoHorizontalScroll, expectNoViLeaks, freezeClock, goalCard, gotoHash, importBackup, logTime, startTimer, stopDialog, timerCard, toast, VI } from '../helpers/app';
import { accountCard, CLOUD_BASE_URL, collectErrors, expectSyncState, recordRequests, signInViaMock, signOutDialog, syncNow } from './helpers';

type Copy = typeof EN | typeof VI;

const CASES: Array<{ locale: 'en-US' | 'vi-VN'; copy: Copy; mergeToast: string }> = [
  { locale: 'en-US', copy: EN, mergeToast: 'Signed in. Your account now has 6 goals, 26 entries.' },
  { locale: 'vi-VN', copy: VI, mergeToast: 'Đã đăng nhập. Tài khoản của bạn hiện có 6 mục tiêu, 26 lần ghi.' },
];

test.beforeEach(async ({ mock }) => {
  await mock.reset();
});

for (const { locale, copy, mergeToast } of CASES) {
  test.describe(`M8-AC5 journey (${locale})`, () => {
    test.use({ locale, viewport: { width: 1440, height: 900 } });
    const vi = locale === 'vi-VN';

    /** Per-screen checks (DESIGN 8.1, M8-AC5). */
    async function checkScreen(page: Page): Promise<void> {
      await expect(page.locator('main h1')).toBeVisible();
      // The "+1%" pill plays a short entering effect (M5); its transitional colours are not a resting state.
      await expect(page.locator('[data-testid="plus-one"][data-animate]')).toHaveCount(0, { timeout: 6_000 });
      if (vi) await expectNoViLeaks(page);
      await expectAxeClean(page);
      await expectNoHorizontalScroll(page);
    }

    test(`A 1440 px creates data without an account, signs in from the banner; B 360 px joins, edits offline; A sees it; Sign out Keep / delete on B / sign in again; B Sign out Remove`, async ({ page: a, mock, device }) => {
      test.setTimeout(240_000);
      const errorsA = collectErrors(a);
      const recA = recordRequests(a);
      await freezeClock(a);

      // ---- A: use the app without an account ----
      // S1 gives the data worth protecting (23 entries since 2026-03) — the banner shows from here on.
      await importBackup(a, 'sample-backup.json', copy);
      await createGoal(a, { name: 'Piano', targetValue: 20, startDate: '2026-10-01', endDate: '2026-10-31' }, copy);
      await gotoHash(a, '/today');
      const banner = a.getByTestId('login-prompt-banner');
      await expect(banner).toBeVisible();
      await expect(banner.getByText(copy.loginPrompt.title)).toBeVisible();
      await expect(a.getByTestId('backup-banner')).toHaveCount(0);
      await checkScreen(a);
      await logTime(a, 'Piano', 10, '', copy);
      await expectAmount(a, 'Piano', '10/20');
      // Timer: 5 min on Piano.
      await startTimer(a, 'Piano', copy);
      await freezeClock(a, at('00:05:00'));
      await timerCard(a).getByRole('button').first().click();
      const stop = stopDialog(a);
      await expect(stop).toBeVisible();
      await expect(stop.getByLabel(new RegExp(`^${copy.entry.form.minutesLabel}`))).toHaveValue('5');
      await stop.getByRole('button', { name: copy.entry.form.save }).click();
      await expect(stop).toBeHidden();
      await expectAmount(a, 'Piano', '15/20');
      await expect(banner).toBeVisible();
      // Back-fill a past day.
      await gotoHash(a, '/day/2026-10-07');
      const piano = goalCard(a, 'Piano');
      await piano.getByRole('button', { name: copy.goalCard.addEntry }).click();
      const form = piano.getByRole('form');
      await form.getByLabel(new RegExp(`^${copy.entry.form.minutesLabel}`)).fill('20');
      await form.getByRole('button', { name: copy.entry.form.save }).click();
      await expect(toast(a)).toHaveText(copy.toast.entrySaved);
      await checkScreen(a);
      for (const hash of ['/goals', '/review', '/settings']) {
        await gotoHash(a, hash);
        await checkScreen(a);
      }
      await expect(a.getByTestId('backup-desc')).toHaveText(copy.settings.backup.descSignedOut);
      await expect(accountCard(a)).toHaveAttribute('data-state', 'signed-out');

      // ---- A: sign in from the banner ----
      await gotoHash(a, '/today');
      await signInViaMock(a, 'Minh Test', copy);
      expect(a.url()).toBe(`${CLOUD_BASE_URL}#/today`);
      await expect(toast(a)).toHaveText(mergeToast, { timeout: 15_000 });
      await expectSyncState(a, 'synced');
      await expect(a.getByTestId('login-prompt-banner')).toHaveCount(0);
      await checkScreen(a);
      const u1 = await mock.liveRows('u1');
      expect(u1.goals).toHaveLength(6);
      expect(u1.entries).toHaveLength(26);

      // ---- B: 360 px, same account ----
      const b = await device({ locale, viewport: { width: 360, height: 740 } });
      const errorsB = collectErrors(b.page);
      const recB = recordRequests(b.page);
      await freezeClock(b.page);
      await gotoHash(b.page, '/settings');
      await expect(accountCard(b.page)).toHaveAttribute('data-state', 'signed-out');
      await checkScreen(b.page);
      await signInViaMock(b.page, 'Minh Test', copy);
      await expect(accountCard(b.page)).toHaveAttribute('data-state', 'signed-in');
      await expectSyncState(b.page, 'synced');
      await checkScreen(b.page);
      await gotoHash(b.page, '/goals');
      await expect(b.page.getByRole('heading', { level: 3 })).toHaveCount(6);
      await expect(b.page.getByRole('heading', { level: 3, name: 'Piano' })).toBeVisible();
      await checkScreen(b.page);
      await gotoHash(b.page, '/today');
      await expectAmount(b.page, 'Piano', '15/20');
      await checkScreen(b.page);

      // B offline → entry waits → online → synced; A "Sync now" sees it.
      await b.context.setOffline(true);
      await logTime(b.page, 'Piano', 5, '', copy);
      await expectAmount(b.page, 'Piano', '20/20');
      await expectSyncState(b.page, 'offline');
      await checkScreen(b.page);
      await b.context.setOffline(false);
      await expectSyncState(b.page, 'synced', 15_000);
      await syncNow(a);
      await gotoHash(a, '/today');
      await expectAmount(a, 'Piano', '20/20');

      // B changes the reminder time → A follows after Sync now (FR-55). Both devices are frozen at the same
      // instant and A's import stamped its reminder group with that instant (A-37): B's edit must be newer
      // than that to win last-write-wins, so B's clock moves on first.
      await freezeClock(b.page, at('00:10:00'));
      await gotoHash(b.page, '/settings');
      await b.page.getByRole('switch', { name: copy.settings.reminders.switch }).click();
      await b.page.getByLabel(copy.settings.reminders.time).fill('07:30');
      await b.page.getByLabel(copy.settings.reminders.time).blur();
      await expect.poll(async () => (await mock.rows('u1')).settings[0] ?? null, { timeout: 15_000 }).toMatchObject({ reminder_enabled: true, reminder_time: '07:30' });
      await syncNow(a);
      await expect(a.getByLabel(copy.settings.reminders.time)).toHaveValue('07:30');
      await expect(a.getByRole('switch', { name: copy.settings.reminders.switch })).toBeChecked();
      await checkScreen(a);

      // A: export while signed in → plain file, no sign-in hint.
      const download = a.waitForEvent('download');
      await a.getByRole('button', { name: copy.settings.backup.export }).click();
      expect((await download).suggestedFilename()).toBe('1percent-better-backup-2026-10-09.json');
      await expect(toast(a)).toHaveText(copy.toast.backupExported);
      await expect(a.getByTestId('export-sign-in-hint')).toHaveCount(0);

      // A: Sign out (Keep) → data stays, no account.
      await accountCard(a).getByRole('button', { name: copy.settings.account.signOut }).click();
      await expect(signOutDialog(a)).toBeVisible();
      await checkScreen(a);
      await signOutDialog(a).getByTestId('signout-confirm').click();
      await expect(accountCard(a)).toHaveAttribute('data-state', 'signed-out');
      await expect(toast(a)).toHaveText(copy.toast.signedOutKept);
      await gotoHash(a, '/today');
      await expectAmount(a, 'Piano', '20/20');
      await expect(a.getByTestId('sync-indicator')).toHaveCount(0);

      // B deletes "Read" → the account has a tombstone.
      await gotoHash(b.page, '/goals');
      const row = b.page.getByTestId('goal-row').filter({ hasText: 'Read' });
      await row.getByRole('button', { name: copy.common.delete }).click();
      await b.page.getByRole('dialog').getByRole('button', { name: copy.goal.delete.confirm }).click();
      await expect(toast(b.page)).toHaveText(copy.toast.goalDeleted);
      await expectSyncState(b.page, 'synced', 15_000);
      await expect.poll(async () => (await mock.liveRows('u1')).goals.length, { timeout: 15_000 }).toBe(5);

      // A signs in again (same account → no D5) → "Read" is gone on A too.
      await gotoHash(a, '/settings');
      await signInViaMock(a, 'Minh Test', copy);
      await expect(accountCard(a)).toHaveAttribute('data-state', 'signed-in');
      await expect(a.getByTestId('merge-dialog')).not.toHaveAttribute('open');
      await expectSyncState(a, 'synced', 15_000);
      await gotoHash(a, '/goals');
      await expect(a.getByRole('heading', { level: 3 })).toHaveCount(5);
      await expect(a.getByRole('heading', { level: 3, name: 'Read' })).toHaveCount(0);
      await checkScreen(a);

      // B: Sign out (Remove) → empty device; the account keeps everything.
      await gotoHash(b.page, '/settings');
      await accountCard(b.page).getByRole('button', { name: copy.settings.account.signOut }).click();
      await expect(signOutDialog(b.page)).toBeVisible();
      await expect(signOutDialog(b.page).getByTestId('unsynced-warning')).toHaveCount(0);
      await signOutDialog(b.page).getByRole('radio', { name: copy.auth.signOut.remove }).check();
      await checkScreen(b.page);
      await signOutDialog(b.page).getByTestId('signout-confirm').click();
      await expect(accountCard(b.page)).toHaveAttribute('data-state', 'signed-out', { timeout: 20_000 });
      await expect(toast(b.page)).toHaveText(copy.toast.signedOutRemoved);
      await gotoHash(b.page, '/today');
      await expect(b.page.getByRole('heading', { level: 2, name: copy.empty.today.noGoals })).toBeVisible();
      await checkScreen(b.page);
      expect((await mock.liveRows('u1')).goals).toHaveLength(5);

      expect(errorsA.list).toEqual([]);
      expect(errorsB.list).toEqual([]);
      expect(recA.external()).toEqual([]);
      expect(recB.external()).toEqual([]);
    });
  });
}
