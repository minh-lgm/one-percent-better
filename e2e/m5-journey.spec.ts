import { expect, test, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { at, createGoal, EN, expectAmount, expectAxeClean, expectNoHorizontalScroll, freezeClock, goalCard, gotoHash, importBackup, logTime, startTimer, stopDialog, timerCard, timerElapsed, toast } from './helpers/app';
import { BASE_URL } from '../playwright.config';

const READ = { name: 'Read', why: 'Be smarter', targetValue: 30, startDate: '2026-10-01', endDate: '2026-10-31' };

async function goalIdOf(page: Page, name: string): Promise<string> {
  await gotoHash(page, '/goals');
  const href = await page.getByRole('link', { name, exact: true }).getAttribute('href');
  return href!.replace(/^#?\/goals\//, '');
}

async function waitForServiceWorker(page: Page): Promise<void> {
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload();
  await page.waitForFunction(() => Boolean(navigator.serviceWorker.controller));
  // Precache of every chunk (Goal detail, charts, Recharts) finishes shortly after install.
  await page.waitForFunction(async () => {
    const keys = await caches.keys();
    for (const key of keys) {
      const cache = await caches.open(key);
      const urls = (await cache.keys()).map((r) => r.url);
      if (urls.some((u) => /GoalDetail-/.test(u)) && urls.some((u) => /useRechartsWidth-/.test(u)) && urls.some((u) => /CurveChart-/.test(u))) return true;
    }
    return false;
  });
}

test.describe('M5 full journey, offline, keyboard, a11y (M5-AC7, M5-AC8, M5-AC11)', () => {
  test('M5-AC7: create → timer → back-fill yesterday → Review → Goal detail → export → import in a new context → offline everywhere', async ({ page, browser }) => {
    const external: string[] = [];
    page.on('request', (req) => {
      if (!req.url().startsWith(BASE_URL)) external.push(req.url());
    });
    await freezeClock(page);
    await createGoal(page, READ);
    const id = await goalIdOf(page, 'Read');

    // Timer: 30 minutes → Save → 30/30 and the one-time "+1%".
    await gotoHash(page, '/today');
    await startTimer(page, 'Read');
    await freezeClock(page, at('00:30:00'));
    await expect(timerElapsed(page)).toHaveText('00:30:00');
    await timerCard(page).getByRole('button', { name: /^Stop timer for Read/ }).click();
    await expect(stopDialog(page).getByLabel(/^Minutes/)).toHaveValue('30');
    await stopDialog(page).getByRole('button', { name: EN.entry.form.save }).click();
    await expectAmount(page, 'Read', '30/30');
    await expect(page.getByTestId('plus-one-live')).toHaveAttribute('data-count', '1');

    // Back-fill yesterday on Day.
    await gotoHash(page, '/day/2026-10-08');
    await goalCard(page, 'Read').getByRole('button', { name: EN.goalCard.addEntry }).click();
    await goalCard(page, 'Read').getByLabel(/^Minutes/).fill('30');
    await goalCard(page, 'Read').getByRole('button', { name: EN.entry.form.save }).click();
    await expectAmount(page, 'Read', '30/30');
    await expect(toast(page)).toHaveText(EN.toast.entrySaved);

    // Review: yesterday's cell is coloured and on target; streak 2.
    await gotoHash(page, '/review');
    await expect(page.locator('[data-date="2026-10-08"]')).toHaveAttribute('aria-label', 'Thursday, October 8, 2026: 30 min, target met');
    await expect(page.locator('[data-date="2026-10-08"]')).toHaveClass(/\bl[1-4]\b/);
    await expect(page.getByTestId('stat-current')).toContainText('2 days');

    // Goal detail: headline grew to +2.0 % (two days on target).
    await gotoHash(page, `/goals/${id}`);
    await expect(page.getByTestId('headline')).toHaveText('+2.0% better');
    await expect(page.getByTestId('headline-sub')).toHaveText(/Day 9 of 31 · 2 days on target · 1\.01\^2 = 1\.020/);
    await expect(page.getByTestId('curve-chart').locator('.recharts-line')).toHaveCount(2);
    await expect(page.getByTestId('history-row')).toHaveCount(2);
    await expect(page.getByTestId('history-row').nth(0)).toContainText(EN.entry.source.timer);
    await expect(page.getByTestId('history-row').nth(1)).toContainText(EN.entry.source.manual);

    // Export, then import into a fresh context: identical data.
    await gotoHash(page, '/settings');
    const downloadPromise = page.waitForEvent('download');
    await page.getByRole('button', { name: EN.settings.backup.export }).click();
    const exported = await (await downloadPromise).path();
    const file = JSON.parse(await readFile(exported!, 'utf8')) as { goals: unknown[]; entries: Array<{ minutes: number; source: string }> };
    expect(file.goals).toHaveLength(1);
    expect(file.entries.map((e) => e.source).sort()).toEqual(['manual', 'timer']);

    const context2 = await browser.newContext({ timezoneId: 'Asia/Ho_Chi_Minh', locale: 'en-US', baseURL: BASE_URL });
    const page2 = await context2.newPage();
    await freezeClock(page2);
    await gotoHash(page2, '/settings');
    await page2.getByTestId('import-file').setInputFiles(exported!);
    const dialog = page2.getByRole('dialog');
    await expect(dialog).toContainText('This backup has 1 goal, 2 entries');
    await dialog.getByRole('button', { name: EN.import.confirm }).click();
    await expect(toast(page2)).toHaveText('Backup imported: 1 goal, 2 entries');
    await gotoHash(page2, '/today');
    await expectAmount(page2, 'Read', '30/30');
    await expect(page2.getByTestId('plus-one-live')).toHaveAttribute('data-count', '0'); // plusOneShown travels with the backup
    await gotoHash(page2, `/goals/${id}`);
    await expect(page2.getByTestId('headline')).toHaveText('+2.0% better');
    await expect(page2.getByTestId('history-row')).toHaveCount(2);

    // Offline: every screen (including the lazy ones) opens from the precache and logging still works.
    await gotoHash(page2, '/today');
    await waitForServiceWorker(page2);
    await context2.setOffline(true);
    await page2.reload();
    await expect(goalCard(page2, 'Read')).toBeVisible();
    await expect(page2.getByRole('status').filter({ hasText: EN.offline.chip })).toBeVisible();
    await gotoHash(page2, '/goals');
    await expect(page2.getByRole('link', { name: 'Read', exact: true })).toBeVisible();
    await gotoHash(page2, '/review');
    await expect(page2.getByTestId('chart-weekly').locator('svg.recharts-surface')).toBeVisible();
    await gotoHash(page2, `/goals/${id}`);
    await expect(page2.getByTestId('headline')).toHaveText('+2.0% better');
    await expect(page2.getByTestId('curve-chart').locator('.recharts-line')).toHaveCount(2);
    await gotoHash(page2, '/today');
    await logTime(page2, 'Read', 5);
    await expectAmount(page2, 'Read', '35/30');
    await page2.reload();
    await expectAmount(page2, 'Read', '35/30');
    await context2.setOffline(false);
    await context2.close();
    expect(external).toEqual([]);
  });

  test('M5-AC8: keyboard only — create a goal and log time without the mouse', async ({ page }) => {
    await freezeClock(page);
    await gotoHash(page, '/goals/new');
    await expect(page.getByRole('heading', { level: 1, name: EN.goal.form.titleNew })).toBeFocused();
    const name = page.getByLabel(/^Name/);
    for (let i = 0; i < 4 && !(await name.evaluate((el) => el === document.activeElement)); i++) await page.keyboard.press('Tab');
    await expect(name).toBeFocused();
    await page.keyboard.type('Read');
    await page.keyboard.press('Tab');
    await expect(page.getByLabel(/^Why/)).toBeFocused();
    await page.keyboard.type('Be smarter');
    const minutes = page.getByRole('textbox', { name: /^Minutes per day/ });
    for (let i = 0; i < 6 && !(await minutes.evaluate((el) => el === document.activeElement)); i++) await page.keyboard.press('Tab');
    await expect(minutes).toBeFocused();
    await page.keyboard.type('30');
    await page.keyboard.press('Enter');
    await expect(page.getByRole('heading', { level: 1, name: EN.goals.title })).toBeVisible();
    await expect(toast(page)).toHaveText(EN.toast.goalCreated);
    await expect(page.getByRole('link', { name: 'Read', exact: true })).toBeVisible();

    await gotoHash(page, '/today');
    await expect(page.getByRole('heading', { level: 1, name: EN.today.title })).toBeFocused();
    const logButton = goalCard(page, 'Read').getByRole('button', { name: EN.goalCard.logTime });
    for (let i = 0; i < 12 && !(await logButton.evaluate((el) => el === document.activeElement)); i++) await page.keyboard.press('Tab');
    await expect(logButton).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(goalCard(page, 'Read').getByLabel(/^Minutes/)).toBeFocused();
    await page.keyboard.type('20');
    await page.keyboard.press('Tab');
    await page.keyboard.type('Ch. 3');
    await page.keyboard.press('Enter');
    await expectAmount(page, 'Read', '20/30');
    await expect(logButton).toBeFocused();
    await page.keyboard.press('Enter');
    await page.keyboard.type('10');
    await page.keyboard.press('Enter');
    await expectAmount(page, 'Read', '30/30');
    await expect(page.getByTestId('plus-one-live')).toHaveText('+1% for Read today.');
    // Esc closes an open form and returns focus.
    await page.keyboard.press('Enter');
    await expect(goalCard(page, 'Read').getByLabel(/^Minutes/)).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(logButton).toBeFocused();
  });

  test('M5-AC8: axe (light and dark) on every screen; no horizontal scroll at 360 px and 1440 px', async ({ page }) => {
    await freezeClock(page);
    await importBackup(page);
    const screens: Array<[string, () => Promise<void>]> = [
      ['/today', async () => expect(goalCard(page, 'Read')).toBeVisible()],
      ['/goals', async () => expect(page.getByRole('link', { name: 'Read', exact: true })).toBeVisible()],
      ['/goals/new', async () => expect(page.getByRole('heading', { level: 1, name: EN.goal.form.titleNew })).toBeVisible()],
      ['/goals/g1', async () => expect(page.getByTestId('curve-chart').locator('.recharts-line')).toHaveCount(2)],
      ['/review', async () => expect(page.getByTestId('chart-weekly').locator('svg.recharts-surface')).toBeVisible()],
      ['/day/2026-10-08', async () => expect(goalCard(page, 'Read')).toBeVisible()],
      ['/settings', async () => expect(page.getByRole('heading', { level: 1, name: EN.settings.title })).toBeVisible()],
      ['/nope', async () => expect(page.getByRole('heading', { level: 1, name: EN.notFound.pageTitle })).toBeVisible()],
    ];
    for (const scheme of ['light', 'dark'] as const) {
      await page.emulateMedia({ colorScheme: scheme });
      for (const [route, ready] of screens) {
        await gotoHash(page, route);
        await ready();
        await expectAxeClean(page);
      }
    }
    await page.emulateMedia({ colorScheme: 'light' });
    for (const viewport of [
      { width: 360, height: 740 },
      { width: 1440, height: 900 },
    ]) {
      await page.setViewportSize(viewport);
      for (const [route, ready] of screens) {
        await gotoHash(page, route);
        await ready();
        await expectNoHorizontalScroll(page);
      }
    }
    // The dialogs: D2 on Goals and the Stop dialog on Today.
    await page.setViewportSize({ width: 360, height: 740 });
    await gotoHash(page, '/goals');
    await page.getByTestId('goal-row').filter({ hasText: 'Read' }).getByRole('button', { name: EN.common.delete }).click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await expectAxeClean(page);
    await expectNoHorizontalScroll(page);
    await page.getByRole('dialog').getByRole('button', { name: EN.common.cancel }).click();
    await gotoHash(page, '/today');
    await startTimer(page, 'Read');
    await expectAxeClean(page);
    await timerCard(page).getByRole('button', { name: /^Stop timer for Read/ }).click();
    await expect(stopDialog(page)).toBeVisible();
    await expectAxeClean(page);
    await expectNoHorizontalScroll(page);
  });

  test('M5-AC8: StorageError in dark mode is axe-clean and fits 360 px', async ({ browser }) => {
    const context = await browser.newContext({ timezoneId: 'Asia/Ho_Chi_Minh', locale: 'en-US', baseURL: BASE_URL, colorScheme: 'dark', viewport: { width: 360, height: 740 } });
    const page = await context.newPage();
    await page.addInitScript(() => Object.defineProperty(window, 'indexedDB', { configurable: true, get: () => undefined }));
    await gotoHash(page, '/today');
    await expect(page.getByRole('heading', { level: 1, name: EN.storageError.title })).toBeVisible();
    await expectAxeClean(page);
    await expectNoHorizontalScroll(page);
    await context.close();
  });
});
