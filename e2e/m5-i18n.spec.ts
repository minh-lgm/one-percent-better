import { expect, test, type Page } from '@playwright/test';
import { at, createGoal, expectAmount, expectAxeClean, expectNoHorizontalScroll, expectNoViLeaks, freezeClock, goalCard, gotoHash, importBackup, logTime, startTimer, stopDialog, timerCard, timerElapsed, toast, VI } from './helpers/app';
import { BASE_URL } from '../playwright.config';

const READ = { name: 'Read', why: 'Be smarter', targetValue: 30, startDate: '2026-10-01', endDate: '2026-10-31' };

async function goalIdOf(page: Page, name: string): Promise<string> {
  await gotoHash(page, '/goals');
  const href = await page.getByRole('link', { name, exact: true }).getAttribute('href');
  return href!.replace(/^#?\/goals\//, '');
}

test.describe('M5-AC12: full journey, offline and every screen in Vietnamese', () => {
  test.use({ locale: 'vi-VN' });

  test('tạo mục tiêu → đếm giờ → ghi bù → Tổng kết → chi tiết mục tiêu → xuất → nhập → ngoại tuyến; quét vi ở từng màn; đổi sang English khi ngoại tuyến vẫn giữ sau reload', async ({ page, browser }) => {
    const external: string[] = [];
    page.on('request', (req) => {
      if (!req.url().startsWith(BASE_URL)) external.push(req.url());
    });
    await freezeClock(page);
    await createGoal(page, READ, VI);
    await expectNoViLeaks(page);
    const id = await goalIdOf(page, 'Read');

    await gotoHash(page, '/today');
    await expect(page.locator('html')).toHaveAttribute('lang', 'vi');
    await startTimer(page, 'Read', VI);
    await freezeClock(page, at('00:30:00'));
    await expect(timerElapsed(page)).toHaveText('00:30:00');
    await expectNoViLeaks(page);
    await timerCard(page).getByRole('button', { name: /^Dừng đếm giờ cho Read/ }).click();
    await expect(stopDialog(page)).toBeVisible();
    await expect(stopDialog(page).getByLabel(/^Số phút/)).toHaveValue('30');
    await expectNoViLeaks(page);
    await stopDialog(page).getByRole('button', { name: VI.entry.form.save }).click();
    await expectAmount(page, 'Read', '30/30');
    await expect(page.getByTestId('plus-one-live')).toHaveText('+1% cho Read hôm nay.');
    await expect(page.getByTestId('plus-one-live')).toHaveAttribute('data-count', '1');
    await expectNoViLeaks(page);

    await gotoHash(page, '/day/2026-10-08');
    await goalCard(page, 'Read').getByRole('button', { name: VI.goalCard.addEntry }).click();
    await goalCard(page, 'Read').getByLabel(/^Số phút/).fill('30');
    await goalCard(page, 'Read').getByRole('button', { name: VI.entry.form.save }).click();
    await expectAmount(page, 'Read', '30/30');
    await expect(toast(page)).toHaveText(VI.toast.entrySaved);
    await expectNoViLeaks(page);

    await gotoHash(page, '/review');
    await expect(page.locator('[data-date="2026-10-08"]')).toHaveAttribute('aria-label', /30 phút, đã đạt chỉ tiêu/);
    await expect(page.getByTestId('stat-current')).toContainText('2 ngày');
    await expect(page.getByTestId('chart-weekly').locator('svg.recharts-surface')).toBeVisible();
    await expectNoViLeaks(page);

    await gotoHash(page, `/goals/${id}`);
    await expect(page.getByTestId('headline')).toHaveText('Tốt hơn +2,0%');
    await expect(page.getByTestId('headline-sub')).toHaveText(/Ngày 9\/31 · 2 ngày đạt chỉ tiêu · 1,01\^2 = 1,020/);
    await expect(page.getByTestId('curve-summary')).toHaveText('Ngày 9/31: bạn đã tốt hơn +2,0%. Đường lý tưởng là +9,4%. Bạn đạt chỉ tiêu 2/9 ngày.');
    await expect(page.getByTestId('curve-legend')).toContainText(VI.goal.detail.legendIdeal);
    await expect(page.getByRole('radio', { name: VI.goal.detail.rangeWhole })).toBeChecked();
    const chart = page.getByTestId('curve-chart');
    await expect(chart.locator('.recharts-line')).toHaveCount(2);
    await expect(chart).toContainText('Lý tưởng +9,4%');
    await expect(chart).toContainText('Bạn +2,0%');
    await chart.focus();
    await page.keyboard.press('ArrowRight');
    await expect(page.getByTestId('curve-reading')).toHaveText(/Lý tưởng \+9,4% · Bạn \+2,0%/);
    await page.getByText(VI.goal.detail.showTable).click();
    await expect(page.getByTestId('curve-table').locator('tbody tr')).toHaveCount(31);
    await expect(page.getByTestId('stat-progress')).toContainText('6,5%');
    await expect(page.getByTestId('stat-pace')).toContainText('Chậm 3 giờ 30 phút');
    await expect(page.getByTestId('history-row')).toHaveCount(2);
    await expectNoViLeaks(page);
    await expectAxeClean(page);

    // Archive / Restore on the detail page.
    await page.getByRole('button', { name: VI.goals.archive }).click();
    await expect(toast(page)).toHaveText(VI.toast.goalArchived);
    await expect(page.getByText(VI.goal.status.archived, { exact: true })).toBeVisible();
    await expectNoViLeaks(page);
    await gotoHash(page, '/goals');
    await expect(page.getByRole('heading', { level: 2, name: 'Đã lưu trữ (1)' })).toBeVisible();
    await expectNoViLeaks(page);
    await page.getByRole('button', { name: VI.goals.restore }).click();
    await expect(toast(page)).toHaveText(VI.toast.goalRestored);
    await expect(page.getByRole('heading', { level: 2, name: 'Đang chạy (1)' })).toBeVisible();

    // Export → import in a fresh vi-VN context.
    await gotoHash(page, '/settings');
    const downloadPromise = page.waitForEvent('download');
    await page.getByRole('button', { name: VI.settings.backup.export }).click();
    const exported = await (await downloadPromise).path();
    const context2 = await browser.newContext({ timezoneId: 'Asia/Ho_Chi_Minh', locale: 'vi-VN', baseURL: BASE_URL });
    const page2 = await context2.newPage();
    await freezeClock(page2);
    await gotoHash(page2, '/settings');
    await page2.getByTestId('import-file').setInputFiles(exported!);
    const dialog = page2.getByRole('dialog');
    await expect(dialog).toContainText('1 mục tiêu, 2 lần ghi');
    await expectNoViLeaks(page2);
    await dialog.getByRole('button', { name: VI.import.confirm }).click();
    await expect(toast(page2)).toHaveText('Đã nhập bản sao lưu: 1 mục tiêu, 2 lần ghi');
    await gotoHash(page2, '/today');
    await expectAmount(page2, 'Read', '30/30');
    await gotoHash(page2, `/goals/${id}`);
    await expect(page2.getByTestId('headline')).toHaveText('Tốt hơn +2,0%');
    await expectNoViLeaks(page2);

    // Offline: every screen opens; switching to English offline persists across an offline reload.
    await gotoHash(page2, '/today');
    await page2.evaluate(() => navigator.serviceWorker.ready);
    await page2.reload();
    await page2.waitForFunction(() => Boolean(navigator.serviceWorker.controller));
    await page2.waitForFunction(async () => {
      for (const key of await caches.keys()) {
        const urls = (await (await caches.open(key)).keys()).map((r) => r.url);
        if (urls.some((u) => /GoalDetail-/.test(u)) && urls.some((u) => /useRechartsWidth-/.test(u))) return true;
      }
      return false;
    });
    await context2.setOffline(true);
    await page2.reload();
    await expect(goalCard(page2, 'Read')).toBeVisible();
    await expect(page2.getByRole('status').filter({ hasText: VI.offline.chip })).toBeVisible();
    await expectNoViLeaks(page2);
    await gotoHash(page2, '/goals');
    await expect(page2.getByRole('link', { name: 'Read', exact: true })).toBeVisible();
    await gotoHash(page2, '/review');
    await expect(page2.getByTestId('chart-weekly').locator('svg.recharts-surface')).toBeVisible();
    await gotoHash(page2, `/goals/${id}`);
    await expect(page2.getByTestId('curve-chart').locator('.recharts-line')).toHaveCount(2);
    await expectNoViLeaks(page2);
    await gotoHash(page2, '/today');
    await logTime(page2, 'Read', 5, '', VI);
    await expectAmount(page2, 'Read', '35/30');

    await gotoHash(page2, '/settings');
    await page2.getByRole('radio', { name: 'English' }).check();
    await expect(page2.getByRole('heading', { level: 1, name: 'Settings' })).toBeVisible();
    await expect(page2.locator('html')).toHaveAttribute('lang', 'en');
    await page2.reload();
    await expect(page2.getByRole('heading', { level: 1, name: 'Settings' })).toBeVisible();
    await expect(page2.locator('html')).toHaveAttribute('lang', 'en');
    await gotoHash(page2, '/today');
    await expect(page2.getByRole('heading', { level: 1, name: 'Today' })).toBeVisible();
    await expectAmount(page2, 'Read', '35/30');
    await context2.setOffline(false);
    await context2.close();
    expect(external).toEqual([]);
  });

  test('axe in vi on every screen; 360 px and 1440 px without horizontal scroll; StorageError and Not found in vi', async ({ page, browser }) => {
    await freezeClock(page);
    await importBackup(page, 'sample-backup.json', VI);
    await page.getByRole('link', { name: VI.nav.goals }).first().click();
    await page.getByTestId('goal-row').filter({ hasText: 'Spanish' }).getByRole('button', { name: VI.goals.archive }).click();
    await expect(page.getByRole('heading', { level: 2, name: 'Đã lưu trữ (1)' })).toBeVisible();
    const screens: Array<[string, () => Promise<void>]> = [
      ['/today', async () => expect(goalCard(page, 'Read')).toBeVisible()],
      ['/goals', async () => expect(page.getByRole('heading', { level: 2, name: 'Đã lưu trữ (1)' })).toBeVisible()],
      ['/goals/new', async () => expect(page.getByRole('heading', { level: 1, name: VI.goal.form.titleNew })).toBeVisible()],
      ['/goals/g1', async () => expect(page.getByTestId('curve-chart').locator('.recharts-line')).toHaveCount(2)],
      ['/goals/g3', async () => expect(page.getByText(VI.goal.status.archived, { exact: true })).toBeVisible()],
      ['/goals/g4', async () => expect(page.getByTestId('headline')).toHaveText('Tốt hơn +0,0%')],
      ['/review', async () => expect(page.getByTestId('chart-weekly').locator('svg.recharts-surface')).toBeVisible()],
      ['/day/2026-10-08', async () => expect(goalCard(page, 'Read')).toBeVisible()],
      ['/settings', async () => expect(page.getByRole('heading', { level: 1, name: VI.settings.title })).toBeVisible()],
      ['/nope', async () => expect(page.getByRole('heading', { level: 1, name: VI.notFound.pageTitle })).toBeVisible()],
    ];
    for (const [route, ready] of screens) {
      await gotoHash(page, route);
      await ready();
      await expectNoViLeaks(page);
      await expectAxeClean(page);
    }
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

    const context = await browser.newContext({ timezoneId: 'Asia/Ho_Chi_Minh', locale: 'vi-VN', baseURL: BASE_URL, viewport: { width: 360, height: 740 } });
    const blocked = await context.newPage();
    await blocked.addInitScript(() => Object.defineProperty(window, 'indexedDB', { configurable: true, get: () => undefined }));
    await gotoHash(blocked, '/today');
    await expect(blocked.getByRole('heading', { level: 1, name: VI.storageError.title })).toBeVisible();
    await expect(blocked.getByRole('listitem')).toHaveText([VI.storageError.step1, VI.storageError.step2, VI.storageError.step3]);
    await expect(blocked.locator('html')).toHaveAttribute('lang', 'vi');
    await expectNoViLeaks(blocked);
    await expectAxeClean(blocked);
    await expectNoHorizontalScroll(blocked);
    await context.close();
  });
});
