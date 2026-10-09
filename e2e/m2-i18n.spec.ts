import { expect, test } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import {
  advanceTo,
  at,
  createGoal,
  EN,
  expectAmount,
  expectAxeClean,
  expectNoHorizontalScroll,
  expectNoViLeaks,
  fakeNotificationPermission,
  freezeClock,
  goalCard,
  gotoHash,
  startTimer,
  stopDialog,
  timerCard,
  timerElapsed,
  toast,
  VI,
} from './helpers/app';

const VI_DATE_LONG = new Intl.DateTimeFormat('vi-VN', { weekday: 'long', month: 'long', day: 'numeric' }).format(new Date(2026, 9, 9));

test.describe('M2-AC13: timer, reminders and .ics in Vietnamese', () => {
  test.use({ locale: 'vi-VN', viewport: { width: 360, height: 740 } });

  test('timer flow, banner, Settings Reminders and .ics are fully Vietnamese; language switch keeps the timer', async ({ page }) => {
    await fakeNotificationPermission(page, 'denied');
    await freezeClock(page);
    await createGoal(page, { name: 'Read', why: 'Be smarter', targetValue: 30, startDate: '2026-10-01', endDate: '2026-10-31' }, VI);
    await createGoal(page, { name: 'Guitar', targetValue: 20, startDate: '2026-09-01', endDate: '2026-12-31' }, VI);
    await gotoHash(page, '/today');
    await expect(page.locator('html')).toHaveAttribute('lang', 'vi');

    // Timer
    await startTimer(page, 'Read', VI);
    await expect(timerCard(page).getByRole('heading', { level: 2, name: 'Đang đếm giờ · Read' })).toBeVisible();
    await expect(timerCard(page).getByText(VI.timer.badge)).toBeVisible();
    await expect(timerCard(page)).toContainText('Bắt đầu lúc 10:00');
    await freezeClock(page, at('00:01:05'));
    await expect(timerElapsed(page)).toHaveText('00:01:05');
    await expect(timerCard(page).getByRole('button', { name: 'Dừng đếm giờ cho Read, đã chạy 00:01:05' })).toHaveText(VI.timer.stop);
    const guitarStart = goalCard(page, 'Guitar').getByRole('button', { name: VI.goalCard.startTimer });
    await expect(guitarStart).toHaveAttribute('aria-disabled', 'true');
    await expect(guitarStart).toHaveAccessibleDescription(VI.goalCard.timerDisabled);
    await expect(goalCard(page, 'Read').getByText(VI.goalCard.timerRunningBadge)).toBeVisible();
    await expectNoViLeaks(page);
    await expectNoHorizontalScroll(page);

    // Switching language while the timer runs does not reset it.
    await gotoHash(page, '/settings');
    await page.getByRole('radio', { name: 'English' }).check();
    await expect(page.getByRole('heading', { level: 1, name: EN.settings.title })).toBeVisible();
    await gotoHash(page, '/today');
    await expect(timerCard(page).getByRole('heading', { level: 2, name: 'Timer running · Read' })).toBeVisible();
    await expect(timerElapsed(page)).toHaveText('00:01:05');
    await gotoHash(page, '/settings');
    await page.getByRole('radio', { name: 'Tiếng Việt' }).check();
    await expect(page.getByRole('heading', { level: 1, name: VI.settings.title })).toBeVisible();
    await gotoHash(page, '/today');
    await expect(timerElapsed(page)).toHaveText('00:01:05');

    // Stop dialog
    await freezeClock(page, at('00:25:31'));
    await expect(timerElapsed(page)).toHaveText('00:25:31');
    await timerCard(page).getByRole('button', { name: /^Dừng đếm giờ cho Read/ }).click();
    const dialog = stopDialog(page);
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole('heading', { level: 2, name: VI.timer.dialogTitle })).toBeVisible();
    await expect(dialog).toContainText('Read · đã đếm 00:25:31');
    await expect(dialog.getByLabel(/^Số phút/)).toHaveValue('26');
    await expect(dialog).toContainText('Làm tròn từ 25 phút 31 giây. Bạn có thể sửa lại.');
    await expect(dialog).toContainText(`Sẽ lưu vào ${VI_DATE_LONG} (ngày bạn bắt đầu).`);
    await expectNoViLeaks(page);
    await expectAxeClean(page);
    await expectNoHorizontalScroll(page);
    await dialog.getByLabel(/^Số phút/).fill('0');
    await dialog.getByRole('button', { name: VI.entry.form.save }).click();
    await expect(dialog.getByText(VI.errors.ENTRY_MINUTES_INVALID)).toBeVisible();
    await expectNoViLeaks(page);
    await dialog.getByLabel(/^Số phút/).fill('30');
    await dialog.getByRole('button', { name: VI.entry.form.save }).click();
    await expectAmount(page, 'Read', '30/30');
    await expect(toast(page)).toHaveText(VI.toast.entrySaved);
    await expect(timerCard(page)).toHaveCount(0);
    await expectNoViLeaks(page);

    // Settings — Reminders (permission denied)
    await gotoHash(page, '/settings');
    await expect(page.getByRole('heading', { level: 2, name: VI.settings.reminders.title })).toBeVisible();
    await expect(page.getByLabel(VI.settings.reminders.time)).toHaveValue('20:00');
    await expect(page.getByText(VI.settings.permission.denied, { exact: true })).toBeVisible();
    await expect(page.getByText(VI.errors.NOTIFICATIONS_DENIED)).toBeVisible();
    await expect(page.getByText(VI.settings.reminders.limit)).toBeVisible();
    await expect(page.getByText('Thêm một sự kiện lặp lại hằng ngày lúc 20:00.')).toBeVisible();
    await page.getByRole('switch', { name: VI.settings.reminders.switch }).click();
    await expect(page.getByRole('switch', { name: VI.settings.reminders.switch })).toBeChecked();
    // M2-D1 regression (vi-VN, 24-hour picker): typing the time with the keyboard keeps the typed value.
    const time = page.getByLabel(VI.settings.reminders.time);
    await time.click({ position: { x: 8, y: 10 } });
    await page.keyboard.type('0730');
    // Chromium shows a 12-hour picker for vi-VN; the period segment keeps PM from 20:00 — toggle it.
    if ((await time.inputValue()) !== '07:30') await page.keyboard.press('ArrowDown');
    await expect(time).toHaveValue('07:30');
    await expect(toast(page)).toHaveText(VI.toast.reminderTime);
    await time.blur();
    await expect(page.getByText('Thêm một sự kiện lặp lại hằng ngày lúc 07:30.')).toBeVisible();
    await time.click({ position: { x: 8, y: 10 } });
    await page.keyboard.type('0800');
    if ((await time.inputValue()) !== '20:00') await page.keyboard.press('ArrowDown');
    await expect(time).toHaveValue('20:00');
    await time.blur();
    await expectNoViLeaks(page);
    await expectAxeClean(page);
    await expectNoHorizontalScroll(page);

    // .ics in Vietnamese
    const downloadPromise = page.waitForEvent('download');
    await page.getByRole('button', { name: VI.settings.reminders.ics }).click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toBe('1percent-better-reminder.ics');
    await expect(toast(page)).toHaveText(VI.toast.icsDownloaded);
    const ics = await readFile((await download.path())!, 'utf8');
    expect(ics).toContain(`SUMMARY:${VI.ics.summary}\r\n`);
    expect(ics).toContain(`DESCRIPTION:${VI.ics.alarm}\r\n`);
    expect(ics).toContain('PRODID:-//1% Better//EN\r\n');

    // Banner (vi) at 20:01 — Guitar is still not on target.
    await gotoHash(page, '/today');
    await advanceTo(page, at('2026-10-09T20:01:00'));
    const banner = page.getByRole('status', { name: VI.reminder.bannerLabel });
    await expect(banner).toHaveText('Đã quá 20:00 — còn 1 mục tiêu chưa đạt chỉ tiêu.');
    await expectNoViLeaks(page);
    await expectAxeClean(page);
    await expectNoHorizontalScroll(page);
  });
});
