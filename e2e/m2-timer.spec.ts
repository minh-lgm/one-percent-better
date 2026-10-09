import { expect, test } from '@playwright/test';
import {
  at,
  createGoal,
  EN,
  expectAmount,
  expectAxeClean,
  expectNoHorizontalScroll,
  freezeClock,
  goalCard,
  gotoHash,
  kvGet,
  startTimer,
  stopDialog,
  timerCard,
  timerElapsed,
  toast,
} from './helpers/app';

const ORIGIN = 'http://localhost:4173';

test.beforeEach(async ({ page }) => {
  await freezeClock(page);
});

async function twoGoals(page: Parameters<typeof createGoal>[0]) {
  await createGoal(page, { name: 'Read', why: 'Be smarter', targetValue: 30, startDate: '2026-10-01', endDate: '2026-10-31' });
  await createGoal(page, { name: 'Guitar', targetValue: 20, startDate: '2026-09-01', endDate: '2026-12-31' });
  await gotoHash(page, '/today');
}

test.describe('M2 timer', () => {
  test('M2-AC1: Start shows 00:00:00, ticks to 00:01:05, other Start buttons are disabled', async ({ page }) => {
    await twoGoals(page);
    await startTimer(page, 'Read');
    await expect(timerCard(page).getByRole('heading', { level: 2, name: 'Timer running · Read' })).toBeVisible();
    await expect(timerElapsed(page)).toHaveText('00:00:00');
    await expect(timerCard(page)).toContainText('Started at 10:00');
    await expect(timerCard(page).getByRole('button', { name: 'Stop timer for Read, running 00:00:00' })).toBeVisible();

    await freezeClock(page, at('00:01:05'));
    await expect(timerElapsed(page)).toHaveText('00:01:05');

    const guitarStart = goalCard(page, 'Guitar').getByRole('button', { name: EN.goalCard.startTimer });
    await expect(guitarStart).toHaveAttribute('aria-disabled', 'true');
    await expect(guitarStart).toHaveAccessibleDescription(EN.goalCard.timerDisabled);
    await expect(goalCard(page, 'Read').getByText(EN.goalCard.timerRunningBadge)).toBeVisible();
    await guitarStart.click({ force: true }); // aria-disabled: Playwright would otherwise wait for it to become enabled
    expect(await kvGet(page, 'activeTimer')).toMatchObject({ goalId: expect.any(String) });
    await expect(timerCard(page).getByRole('heading', { level: 2, name: 'Timer running · Read' })).toBeVisible();
  });

  test('M2-AC2: the timer survives a reload and a new page in the same context', async ({ page, context }) => {
    await twoGoals(page);
    await startTimer(page, 'Read');
    await freezeClock(page, at('00:25:00'));
    await expect(timerElapsed(page)).toHaveText('00:25:00');

    await page.reload();
    await expect(timerElapsed(page)).toHaveText('00:25:00');
    await freezeClock(page, at('00:25:02'));
    await expect(timerElapsed(page)).toHaveText('00:25:02');

    await page.close();
    const page2 = await context.newPage();
    await freezeClock(page2, at('00:25:10'));
    await gotoHash(page2, '/today');
    await expect(timerElapsed(page2)).toHaveText('00:25:10');
    await expect(goalCard(page2, 'Guitar').getByRole('button', { name: EN.goalCard.startTimer })).toHaveAttribute('aria-disabled', 'true');
  });

  test('M2-AC3: Stop → pre-filled minutes → Save adds a timer entry; Discard adds nothing', async ({ page }) => {
    await twoGoals(page);
    await startTimer(page, 'Read');
    await freezeClock(page, at('00:25:31'));
    await expect(timerElapsed(page)).toHaveText('00:25:31');
    await timerCard(page).getByRole('button', { name: /^Stop timer for Read/ }).click();

    const dialog = stopDialog(page);
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole('heading', { level: 2, name: EN.timer.dialogTitle })).toBeVisible();
    await expect(dialog).toContainText('Read · tracked 00:25:31');
    const minutes = dialog.getByLabel(/^Minutes/);
    await expect(minutes).toHaveValue('26');
    await expect(minutes).toBeFocused();
    await expect(dialog).toContainText('Rounded from 25 min 31 s. You can change it.');
    await expect(dialog).toContainText('Saved to Friday, October 9 (the day you started).');
    await minutes.fill('25');
    await dialog.getByLabel(/^Note/).fill('Pomodoro');
    await dialog.getByRole('button', { name: EN.entry.form.save }).click();

    await expectAmount(page, 'Read', '25/30');
    await expect(toast(page)).toHaveText(EN.toast.entrySaved);
    await expect(timerCard(page)).toHaveCount(0);
    await expect(dialog).toBeHidden();
    await expect(goalCard(page, 'Read')).toContainText('Pomodoro');
    expect(await kvGet(page, 'activeTimer')).toBeNull();
    await expect(page.getByRole('heading', { level: 1, name: EN.today.title })).toBeFocused();

    // Discard
    await startTimer(page, 'Read');
    await freezeClock(page, at('00:35:31'));
    await expect(timerElapsed(page)).toHaveText('00:10:00');
    await timerCard(page).getByRole('button', { name: /^Stop timer for Read/ }).click();
    await expect(dialog.getByLabel(/^Minutes/)).toHaveValue('10');
    await dialog.getByRole('button', { name: EN.timer.discard }).click();
    await expect(timerCard(page)).toHaveCount(0);
    await expect(toast(page)).toHaveText(EN.toast.timerDiscarded);
    await expectAmount(page, 'Read', '25/30');
    expect(await kvGet(page, 'activeTimer')).toBeNull();
    await expect(goalCard(page, 'Read').getByRole('button', { name: EN.goalCard.startTimer })).not.toHaveAttribute('aria-disabled');
  });

  test('M2-AC3 (keep running) + M2-AC12: Esc keeps the timer; axe on Today with timer, on D1 and on Settings; no external requests', async ({ page }) => {
    const external: string[] = [];
    page.on('request', (req) => {
      if (!req.url().startsWith(ORIGIN)) external.push(req.url());
    });
    await twoGoals(page);
    await startTimer(page, 'Read');
    await freezeClock(page, at('00:03:00'));
    await expect(timerElapsed(page)).toHaveText('00:03:00');
    await expectAxeClean(page);

    const stop = timerCard(page).getByRole('button', { name: /^Stop timer for Read/ });
    await stop.click();
    await expect(stopDialog(page)).toBeVisible();
    await expectAxeClean(page);
    await page.keyboard.press('Escape');
    await expect(stopDialog(page)).toBeHidden();
    await expect(timerCard(page)).toBeVisible();
    await expect(stop).toBeFocused();

    await stop.click();
    await stopDialog(page).getByRole('button', { name: EN.timer.keepRunning }).click();
    await expect(stopDialog(page)).toBeHidden();
    await expect(timerElapsed(page)).toHaveText('00:03:00');

    await gotoHash(page, '/settings');
    await expect(page.getByRole('heading', { level: 2, name: EN.settings.reminders.title })).toBeVisible();
    await expectAxeClean(page);
    expect(external).toEqual([]);
  });

  test('M2-D2 regression: a 60-char goal name without spaces does not widen Today, the TimerCard or D1 at 360 px', async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 740 });
    const long = 'W'.repeat(60);
    await createGoal(page, { name: long, targetValue: 30, startDate: '2026-10-01', endDate: '2026-10-31' });
    await gotoHash(page, '/today');
    await expectNoHorizontalScroll(page);
    await startTimer(page, long);
    await expect(timerCard(page).getByRole('heading', { level: 2, name: `Timer running · ${long}` })).toBeVisible();
    await expectNoHorizontalScroll(page);
    await timerCard(page).getByRole('button', { name: /^Stop timer for/ }).click();
    await expect(stopDialog(page)).toBeVisible();
    await expectNoHorizontalScroll(page);
    await page.keyboard.press('Escape');
    await gotoHash(page, '/goals');
    await page.getByTestId('goal-row').getByRole('button', { name: EN.common.delete }).click();
    await expect(page.getByRole('dialog')).toContainText(EN.goal.delete.timerNote);
    await expectNoHorizontalScroll(page);
  });

  test('M2-AC5: deleting the goal with the running timer discards the timer', async ({ page }) => {
    await twoGoals(page);
    await startTimer(page, 'Read');
    expect(await kvGet(page, 'activeTimer')).toMatchObject({ goalId: expect.any(String) });

    await gotoHash(page, '/goals');
    const row = page.getByTestId('goal-row').filter({ hasText: 'Read' });
    await row.getByRole('button', { name: EN.common.delete }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toContainText(EN.goal.delete.timerNote);
    await dialog.getByRole('button', { name: EN.goal.delete.confirm }).click();
    await expect(page.getByTestId('goal-row').filter({ hasText: 'Read' })).toHaveCount(0);
    await expect(toast(page)).toHaveText(EN.toast.goalDeleted);

    expect(await kvGet(page, 'activeTimer')).toBeNull();
    await gotoHash(page, '/today');
    await expect(goalCard(page, 'Guitar')).toBeVisible();
    await expect(timerCard(page)).toHaveCount(0);
    await expect(goalCard(page, 'Guitar').getByRole('button', { name: EN.goalCard.startTimer })).not.toHaveAttribute('aria-disabled');
    await expect(page.locator('[role="alert"]')).toHaveCount(0);
  });
});
