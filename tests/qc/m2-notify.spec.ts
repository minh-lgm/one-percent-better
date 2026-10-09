// QC round 1 (M2): notification behaviour. Needs full Chromium (headless shell always reports permission "denied").
import { expect, test, type BrowserContext, type Page } from '@playwright/test';
import {
  advanceTo,
  at,
  createGoal,
  EN,
  freezeClock,
  goalCard,
  gotoHash,
  kvGet,
  shownNotifications,
  startTimer,
  stopDialog,
  timerCard,
  VI,
} from '../../e2e/helpers/app';

test.use({ channel: 'chromium', permissions: ['notifications'] });

interface Shown {
  title: string;
  body: string;
  lang: string;
  tag: string;
  icon: string;
  data: { url: string };
}

/** Count every real call to registration.showNotification (the tag makes getNotifications() hide duplicates). */
async function spy(page: Page) {
  await page.addInitScript(() => {
    const proto = ServiceWorkerRegistration.prototype;
    const orig = proto.showNotification;
    proto.showNotification = function (this: ServiceWorkerRegistration, title: string, options?: NotificationOptions) {
      const log = JSON.parse(localStorage.getItem('__qc_shown') ?? '[]') as unknown[];
      log.push({ title, ...(options as object) });
      localStorage.setItem('__qc_shown', JSON.stringify(log));
      return orig.call(this, title, options);
    };
  });
}
const calls = async (page: Page): Promise<Shown[]> => page.evaluate(() => JSON.parse(localStorage.getItem('__qc_shown') ?? '[]') as Shown[]);

/** Create goals, enable the reminder, wait until the SW controls the page. */
async function arm(page: Page, goals: string[], copy: typeof EN | typeof VI = EN, time = '2026-10-09T19:50:00') {
  await freezeClock(page, at(time));
  let i = 0;
  for (const name of goals) {
    await freezeClock(page, new Date(at(time).getTime() + 1000 * i++));
    await createGoal(page, { name, targetValue: 30, startDate: '2026-10-01', endDate: '2026-10-31' }, copy);
  }
  await freezeClock(page, at(time));
  await gotoHash(page, '/settings');
  await page.getByRole('switch', { name: copy.settings.reminders.switch }).click();
  await expect(page.getByRole('switch', { name: copy.settings.reminders.switch })).toBeChecked();
  await gotoHash(page, '/today');
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload();
  await expect.poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller))).toBe(true);
}

async function swOf(context: BrowserContext) {
  const existing = context.serviceWorkers();
  if (existing.length) return existing[0];
  return context.waitForEvent('serviceworker');
}

test.describe('M2 QC — notifications (full Chromium)', () => {
  test('AC8: exactly ONE showNotification call per day over many triggers + reload; the next day sends again', async ({ page }) => {
    await spy(page);
    await arm(page, ['Read']);
    await advanceTo(page, at('2026-10-09T19:59:59'));
    await page.waitForTimeout(300);
    expect(await calls(page)).toHaveLength(0);
    await advanceTo(page, at('2026-10-09T20:00:00'));
    await expect.poll(async () => (await calls(page)).length).toBe(1);
    for (const t of ['20:00:30', '20:05:00', '21:00:00', '23:59:59']) await advanceTo(page, at(`2026-10-09T${t}`));
    await page.reload();
    await expect(goalCard(page, 'Read')).toBeVisible();
    await page.waitForTimeout(500);
    await advanceTo(page, at('2026-10-09T22:00:00'));
    await page.waitForTimeout(300);
    const log = await calls(page);
    expect(log).toHaveLength(1);
    expect(log[0]).toMatchObject({ title: '1% Better', body: '1 goal left today: Read 0/30 min', lang: 'en', tag: 'daily-reminder', data: { url: '#/today' } });
    expect(log[0].icon).toMatch(/\/icons\/pwa-192\.png$/);
    expect(await page.evaluate(async (u) => (await fetch(u)).status, log[0].icon)).toBe(200);
    expect(await kvGet(page, 'settings')).toMatchObject({ reminderEnabled: true, reminderTime: '20:00', lastReminderDate: '2026-10-09' });
    // next day
    await advanceTo(page, at('2026-10-10T00:05:00'));
    await page.waitForTimeout(300);
    expect(await calls(page)).toHaveLength(1); // 00:05 is before 20:00
    await advanceTo(page, at('2026-10-10T20:00:10'));
    await expect.poll(async () => (await calls(page)).length).toBe(2);
  });

  test('goal already on target at the reminder time -> no notification, no banner', async ({ page }) => {
    await spy(page);
    await arm(page, ['Read']);
    await goalCard(page, 'Read').getByRole('button', { name: EN.goalCard.logTime }).click();
    await goalCard(page, 'Read').getByLabel(/^Minutes/).fill('30');
    await goalCard(page, 'Read').getByRole('button', { name: EN.entry.form.save }).click();
    await advanceTo(page, at('2026-10-09T20:30:00'));
    await page.waitForTimeout(500);
    expect(await calls(page)).toHaveLength(0);
    await expect(page.getByTestId('reminder-banner')).toHaveCount(0);
  });

  test('reminder switched off: nothing is sent even though permission is granted', async ({ page }) => {
    await spy(page);
    await arm(page, ['Read']);
    await gotoHash(page, '/settings');
    await page.getByRole('switch', { name: EN.settings.reminders.switch }).click();
    await expect(page.getByRole('switch', { name: EN.settings.reminders.switch })).not.toBeChecked();
    await advanceTo(page, at('2026-10-09T21:00:00'));
    await page.waitForTimeout(500);
    expect(await calls(page)).toHaveLength(0);
  });

  test('two tabs of the app open at 20:01: one notification call in total', async ({ page, context }) => {
    await spy(page);
    await arm(page, ['Read']);
    const b = await context.newPage();
    await spy(b);
    await freezeClock(b, at('2026-10-09T19:55:00'));
    await gotoHash(b, '/today');
    await expect(goalCard(b, 'Read')).toBeVisible();
    await advanceTo(page, at('2026-10-09T20:01:00'));
    await advanceTo(b, at('2026-10-09T20:01:00'));
    await page.waitForTimeout(600);
    expect(await calls(page)).toHaveLength(1);
  });

  test('language switched to Vietnamese before the next day: body and lang follow the CURRENT language; 4 goals -> "and 1 more"', async ({ page }) => {
    await spy(page);
    await arm(page, ['Read', 'Guitar', 'Spanish', 'Piano']);
    await advanceTo(page, at('2026-10-09T20:01:00'));
    await expect.poll(async () => (await calls(page)).length).toBe(1);
    expect((await calls(page))[0].body).toBe('4 goals left today: Read 0/30 min, Guitar 0/30 min, Spanish 0/30 min, and 1 more');
    await gotoHash(page, '/settings');
    await page.getByRole('radio', { name: 'Tiếng Việt' }).click();
    await expect(page.getByRole('heading', { level: 1, name: VI.settings.title })).toBeVisible();
    await advanceTo(page, at('2026-10-10T20:01:00'));
    await expect.poll(async () => (await calls(page)).length).toBe(2);
    const second = (await calls(page))[1];
    expect(second.lang).toBe('vi');
    expect(second.body).toBe('Hôm nay còn 4 mục tiêu: Read 0/30 phút, Guitar 0/30 phút, Spanish 0/30 phút và 1 mục tiêu nữa');
    expect(second.title).toBe('1% Better');
  });

  test('hostile goal names: notification body, timer card and dialog show them literally; no JS dialog, no injected nodes', async ({ page }) => {
    const dialogs: string[] = [];
    page.on('dialog', (d) => {
      dialogs.push(d.message());
      void d.dismiss();
    });
    await spy(page);
    const evil = '<img src=x onerror=alert(1)>';
    const tpl = '{{count}} $t(app.name) &amp;';
    await arm(page, [evil, tpl]);
    await advanceTo(page, at('2026-10-09T20:01:00'));
    await expect.poll(async () => (await calls(page)).length).toBe(1);
    expect((await calls(page))[0].body).toBe(`2 goals left today: ${evil} 0/30 min, ${tpl} 0/30 min`);
    await startTimer(page, evil);
    await expect(timerCard(page).getByRole('heading', { level: 2 })).toHaveText(`Timer running · ${evil}`);
    await timerCard(page).getByRole('button').click();
    await expect(stopDialog(page)).toContainText(`${evil} · tracked`);
    expect(await page.locator('img[src="x"]').count()).toBe(0);
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);
    expect(dialogs).toEqual([]);
  });

  test('AC9 (partial, real SW): a synthetic notificationclick closes the notification; the NAVIGATE message the SW sends moves the open page to #/today and ignores hostile hashes', async ({ page, context }) => {
    // A synthetic event cannot call WindowClient.focus() (Chromium: "Not allowed to focus a window"), so focus
    // and openWindow stay NOT VERIFIED (manual step in the QC report); close() and the page side are real.
    await spy(page);
    await arm(page, ['Read']);
    await advanceTo(page, at('2026-10-09T20:01:00'));
    await expect.poll(async () => (await shownNotifications(page)).length).toBe(1);
    await gotoHash(page, '/goals');
    const sw = await swOf(context);
    await sw.evaluate(`(async () => {
      const [n] = await self.registration.getNotifications({ tag: 'daily-reminder' });
      try { self.dispatchEvent(new NotificationEvent('notificationclick', { notification: n })); } catch (e) { /* waitUntil on a synthetic event */ }
    })()`);
    await expect.poll(async () => (await shownNotifications(page)).length).toBe(0);
    const send = (hash: string) =>
      sw.evaluate(`(async () => { for (const c of await clients.matchAll({ type: 'window' })) c.postMessage({ type: 'NAVIGATE', hash: ${JSON.stringify(hash)} }); })()`);
    await send('javascript:alert(1)');
    await send('#/../../etc');
    await page.waitForTimeout(300);
    expect(new URL(page.url()).hash).toBe('#/goals');
    await send('#/today');
    await expect.poll(() => new URL(page.url()).hash).toBe('#/today');
  });
});
