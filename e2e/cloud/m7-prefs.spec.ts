// M7-AC18 (v2.1): reminder settings and language follow the account (FR-55), never prompt for permission.
import { expect, test } from './fixtures';
import { EN, fakeNotificationPermission, gotoHash, VI } from '../helpers/app';
import { accountCard, expectSyncState, signInViaMock, syncNow } from './helpers';

test.beforeEach(async ({ mock }) => {
  await mock.reset();
});

/** Count `Notification.requestPermission` calls from before the first script runs. */
async function spyPermissionRequests(page: Parameters<typeof gotoHash>[0]): Promise<void> {
  await page.addInitScript(() => {
    const w = window as unknown as { __permissionRequests: number };
    w.__permissionRequests = 0;
    if (!('Notification' in window)) return;
    const original = Notification.requestPermission.bind(Notification);
    Notification.requestPermission = (async () => {
      w.__permissionRequests += 1;
      return original();
    }) as typeof Notification.requestPermission;
  });
}

test('A chooses Tiếng Việt + reminder 07:30 → account row; B (en-US, nothing chosen) switches to vi without reload, shows 07:30, asks no permission; B back to English → A follows after Sync now', async ({ page, mock, device }) => {
  await fakeNotificationPermission(page, 'default');
  await gotoHash(page, '/settings');
  await signInViaMock(page, 'Minh Test');
  await expectSyncState(page, 'synced');
  await page.getByRole('radio', { name: 'Tiếng Việt' }).click();
  await expect(page.locator('html')).toHaveAttribute('lang', 'vi');
  await page.getByRole('switch', { name: VI.settings.reminders.switch }).click();
  await page.getByLabel(VI.settings.reminders.time).fill('07:30');
  await page.getByLabel(VI.settings.reminders.time).blur();
  await expectSyncState(page, 'synced', 10_000);
  await expect.poll(async () => (await mock.rows('u1')).settings[0] ?? null, { timeout: 10_000 }).toMatchObject({ locale: 'vi', reminder_enabled: true, reminder_time: '07:30' });

  const b = await device();
  await fakeNotificationPermission(b.page, 'default');
  await spyPermissionRequests(b.page);
  await gotoHash(b.page, '/settings');
  await expect(b.page.locator('html')).toHaveAttribute('lang', 'en');
  // The OAuth round trip is a real navigation (mock chooser → callback), so the "no reload" marker is
  // planted once the app is back from the callback and must survive until the language has changed.
  await signInViaMock(b.page, 'Minh Test');
  await b.page.waitForLoadState('load');
  let loads = 0;
  b.page.on('load', () => (loads += 1));
  await b.page.evaluate(() => {
    (window as unknown as { __noReload: boolean }).__noReload = true;
  });
  await expect(b.page.locator('html')).toHaveAttribute('lang', 'vi', { timeout: 15_000 });
  expect(await b.page.evaluate(() => (window as unknown as { __noReload?: boolean }).__noReload)).toBe(true);
  expect(loads).toBe(0);
  await expect(b.page.getByTestId('toast')).toHaveText(VI.toast.prefsFromAccount);
  await expect(b.page.getByRole('switch', { name: VI.settings.reminders.switch })).toBeChecked();
  await expect(b.page.getByLabel(VI.settings.reminders.time)).toHaveValue('07:30');
  expect(await b.page.evaluate(() => (window as unknown as { __permissionRequests: number }).__permissionRequests)).toBe(0);
  await expect(b.page.getByText(VI.settings.permission.default)).toBeVisible();
  await expect(b.page.getByTestId('permission-desc')).toHaveText(VI.settings.permission.defaultOnDesc);
  await expect(b.page.getByRole('button', { name: VI.settings.reminders.allow })).toBeVisible();

  await b.page.getByRole('radio', { name: 'English' }).click();
  await expect(b.page.locator('html')).toHaveAttribute('lang', 'en');
  await expectSyncState(b.page, 'synced', 10_000);
  await expect.poll(async () => (await mock.rows('u1')).settings[0]?.locale, { timeout: 10_000 }).toBe('en');
  await syncNow(page);
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  await expect(page.getByTestId('toast')).toHaveText(EN.toast.prefsFromAccount);
  await expect(accountCard(page)).toHaveAttribute('data-state', 'signed-in');
});

test('empty account: a device with vi chosen before signing in pushes it; a fresh en-US device then takes vi (cloud wins); signed out, no request leaves the device', async ({ page, mock, device }) => {
  // Signed out: changing language and time must not talk to the mock at all.
  await gotoHash(page, '/settings');
  await page.getByRole('radio', { name: 'Tiếng Việt' }).click();
  await expect(page.locator('html')).toHaveAttribute('lang', 'vi');
  await page.getByRole('switch', { name: VI.settings.reminders.switch }).click();
  await page.getByLabel(VI.settings.reminders.time).fill('06:00');
  await page.getByLabel(VI.settings.reminders.time).blur();
  await page.waitForTimeout(2500);
  expect((await mock.log()).log.filter((l) => l.path.startsWith('/rest/'))).toEqual([]);

  await signInViaMock(page, 'Other User', VI);
  await expectSyncState(page, 'synced');
  await expect.poll(async () => (await mock.rows('u2')).settings[0] ?? null, { timeout: 10_000 }).toMatchObject({ locale: 'vi', reminder_enabled: true, reminder_time: '06:00' });

  const d = await device();
  await gotoHash(d.page, '/settings');
  await expect(d.page.locator('html')).toHaveAttribute('lang', 'en');
  await signInViaMock(d.page, 'Other User');
  await expect(d.page.locator('html')).toHaveAttribute('lang', 'vi', { timeout: 15_000 });
  await expect(d.page.getByLabel(VI.settings.reminders.time)).toHaveValue('06:00');
});
