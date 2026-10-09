import { expect, test } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import {
  advanceTo,
  at,
  createGoal,
  EN,
  expectAxeClean,
  fakeNotificationPermission,
  freezeClock,
  goalCard,
  gotoHash,
  kvGet,
  logTime,
  shownNotifications,
  toast,
} from './helpers/app';

const reminderSwitch = (page: Parameters<typeof gotoHash>[0]) => page.getByRole('switch', { name: EN.settings.reminders.switch });
const timeInput = (page: Parameters<typeof gotoHash>[0]) => page.getByLabel(EN.settings.reminders.time);

// The default headless shell reports Notification.permission = "denied" even when granted;
// the full Chromium build (new headless mode) honours context permissions. `channel`
// must be set at file level (it forces a dedicated worker).
test.use({ channel: 'chromium' });

test.describe('M2 reminders — settings', () => {
  test.use({ permissions: ['notifications'] });

  test('M2-AC6: defaults, turning on, changing the time persists across reload, limitation text', async ({ page }) => {
    await freezeClock(page);
    await gotoHash(page, '/settings');
    const sw = reminderSwitch(page);
    await expect(sw).toBeEnabled();
    await expect(sw).not.toBeChecked();
    await expect(timeInput(page)).toHaveValue('20:00');
    await expect(timeInput(page)).toBeDisabled();
    await expect(page.getByText(EN.settings.reminders.limit)).toBeVisible();
    await expect(page.getByText(EN.settings.reminders.ios)).toBeVisible();
    await expect(page.getByText('Adds a repeating daily event at 20:00.')).toBeVisible();
    await expect(page.getByText(EN.settings.permission.granted, { exact: true })).toBeVisible();
    await expect(page.getByText(EN.settings.permission.grantedDesc)).toBeVisible();

    await sw.click();
    await expect(sw).toBeChecked();
    await expect(timeInput(page)).toBeEnabled();
    await timeInput(page).fill('07:30');
    await expect(toast(page)).toHaveText(EN.toast.reminderTime);
    await expect(page.getByText('Adds a repeating daily event at 07:30.')).toBeVisible();
    expect(await kvGet(page, 'settings')).toMatchObject({ reminderEnabled: true, reminderTime: '07:30' });

    await page.reload();
    await expect(reminderSwitch(page)).toBeChecked();
    await expect(timeInput(page)).toHaveValue('07:30');
    await expectAxeClean(page);
  });

  test('M2-AC11: the .ics download has the fixed name and a daily event at the reminder time', async ({ page }) => {
    await freezeClock(page);
    await gotoHash(page, '/settings');
    const downloadPromise = page.waitForEvent('download');
    await page.getByRole('button', { name: EN.settings.reminders.ics }).click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toBe('1percent-better-reminder.ics');
    await expect(toast(page)).toHaveText(EN.toast.icsDownloaded);
    const text = await readFile((await download.path())!, 'utf8');
    expect(text.startsWith('BEGIN:VCALENDAR\r\n')).toBe(true);
    expect(text).toContain('PRODID:-//1% Better//EN\r\n');
    expect(text).toContain('DTSTART:20261010T200000\r\n');
    expect(text).toContain('RRULE:FREQ=DAILY\r\n');
    expect(text).toContain(`SUMMARY:${EN.ics.summary}\r\n`);
    expect(text).toContain('TRIGGER:PT0M\r\n');
    expect(text.endsWith('END:VCALENDAR\r\n')).toBe(true);
  });

  test('M2-AC8: at most one notification per day while the app is open; click target is #/today', async ({ page }) => {
    await freezeClock(page, at('2026-10-09T19:50:00'));
    await createGoal(page, { name: 'Read', targetValue: 30, startDate: '2026-10-01', endDate: '2026-10-31' });
    await gotoHash(page, '/settings');
    await reminderSwitch(page).click();
    await expect(reminderSwitch(page)).toBeChecked();
    await gotoHash(page, '/today');
    // The service worker must control the page before it can show notifications.
    await page.evaluate(() => navigator.serviceWorker.ready);
    await page.reload();
    await expect.poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller))).toBe(true);
    await expect(goalCard(page, 'Read')).toBeVisible();

    await advanceTo(page, at('2026-10-09T19:59:00'));
    expect(await shownNotifications(page)).toEqual([]);
    await expect(page.getByTestId('reminder-banner')).toHaveCount(0);

    await advanceTo(page, at('2026-10-09T20:01:00'));
    await expect.poll(() => shownNotifications(page).then((n) => n.length)).toBe(1);
    const [n] = await shownNotifications(page);
    expect(n.title).toBe('1% Better');
    expect(n.body).toBe('1 goal left today: Read 0/30 min');
    expect(n.lang).toBe('en');
    expect(n.tag).toBe('daily-reminder');
    expect(n.data).toEqual({ url: '#/today' });
    await expect(page.getByTestId('reminder-banner')).toHaveText("It's past 20:00 — 1 goal is not on target yet.");
    await expect.poll(() => kvGet(page, 'settings')).toMatchObject({ lastReminderDate: '2026-10-09' });

    // Three more checks (visibility changes) and a restart: still exactly one.
    for (const t of ['2026-10-09T20:02:00', '2026-10-09T20:03:00', '2026-10-09T20:04:00']) await advanceTo(page, at(t));
    await page.reload();
    await expect(goalCard(page, 'Read')).toBeVisible();
    await page.waitForTimeout(300);
    expect((await shownNotifications(page)).length).toBe(1);
    expect(await kvGet(page, 'settings')).toMatchObject({ lastReminderDate: '2026-10-09' });

    // Next day: a new notification is allowed again.
    await page.evaluate(async () => {
      const registration = await navigator.serviceWorker.ready;
      for (const n of await registration.getNotifications()) n.close();
    });
    await advanceTo(page, at('2026-10-10T20:00:30'));
    await expect.poll(() => shownNotifications(page).then((n) => n.length)).toBe(1);
    expect(await kvGet(page, 'settings')).toMatchObject({ lastReminderDate: '2026-10-10' });
  });
});

test.describe('M2 reminders — banner without permission', () => {
  test('M2-AC10: banner shows after the time with a pending goal (permission denied), hides when all goals are met or the reminder is off', async ({ page }) => {
    await fakeNotificationPermission(page, 'denied');
    await freezeClock(page, at('2026-10-09T19:50:00'));
    await createGoal(page, { name: 'Read', targetValue: 30, startDate: '2026-10-01', endDate: '2026-10-31' });
    await createGoal(page, { name: 'Guitar', targetValue: 20, startDate: '2026-09-01', endDate: '2026-12-31' });
    await gotoHash(page, '/settings');
    await expect(page.getByText(EN.settings.permission.denied, { exact: true })).toBeVisible();
    await expect(page.getByText(EN.errors.NOTIFICATIONS_DENIED)).toBeVisible();
    await reminderSwitch(page).click();
    await expect(reminderSwitch(page)).toBeChecked();

    await gotoHash(page, '/today');
    await expect(goalCard(page, 'Read')).toBeVisible();
    await advanceTo(page, at('2026-10-09T19:59:00'));
    await expect(page.getByTestId('reminder-banner')).toHaveCount(0);

    await advanceTo(page, at('2026-10-09T20:01:00'));
    const banner = page.getByRole('status', { name: EN.reminder.bannerLabel });
    await expect(banner).toHaveText("It's past 20:00 — 2 goals are not on target yet.");
    await expectAxeClean(page);

    await logTime(page, 'Read', 30);
    await expect(goalCard(page, 'Read').getByTestId('plus-one')).toBeVisible();
    await expect(banner).toHaveText("It's past 20:00 — 1 goal is not on target yet.");

    // Reminder off → no banner even though Guitar is still pending.
    await gotoHash(page, '/settings');
    await reminderSwitch(page).click();
    await expect(reminderSwitch(page)).not.toBeChecked();
    await gotoHash(page, '/today');
    await expect(goalCard(page, 'Guitar')).toBeVisible();
    await expect(page.getByTestId('reminder-banner')).toHaveCount(0);

    // Back on → banner returns; meeting the last goal removes it without a reload.
    await gotoHash(page, '/settings');
    await reminderSwitch(page).click();
    await expect(reminderSwitch(page)).toBeChecked();
    await gotoHash(page, '/today');
    await expect(banner).toHaveText("It's past 20:00 — 1 goal is not on target yet.");
    await logTime(page, 'Guitar', 20);
    await expect(goalCard(page, 'Guitar').getByTestId('plus-one')).toBeVisible();
    await expect(page.getByTestId('reminder-banner')).toHaveCount(0);
  });

  test('M2-AC6: the four permission states render (default and unsupported via init script)', async ({ page, context }) => {
    await fakeNotificationPermission(page, 'default');
    await freezeClock(page);
    await gotoHash(page, '/settings');
    await expect(page.getByText(EN.settings.permission.default, { exact: true })).toBeVisible();
    await expect(page.getByText(EN.settings.permission.defaultDesc)).toBeVisible();
    await expect(page.getByRole('button', { name: EN.settings.reminders.allow })).toBeVisible();

    const page2 = await context.newPage();
    await page2.addInitScript(() => {
      Object.defineProperty(window, 'Notification', { configurable: true, get: () => undefined });
    });
    await freezeClock(page2);
    await gotoHash(page2, '/settings');
    await expect(page2.getByText(EN.settings.permission.unsupported, { exact: true })).toBeVisible();
    await expect(page2.getByText(EN.errors.NOTIFICATIONS_UNSUPPORTED)).toBeVisible();
    await expect(page2.getByRole('button', { name: EN.settings.reminders.allow })).toHaveCount(0);
  });
});
