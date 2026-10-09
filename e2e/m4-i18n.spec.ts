import { expect, test, type Page } from '@playwright/test';
import { EN, expectAxeClean, expectNoHorizontalScroll, expectNoViLeaks, freezeClock, gotoHash, importBackup, toast, VI } from './helpers/app';

const cell = (page: Page, date: string) => page.locator(`[data-date="${date}"]`);
const stat = (page: Page, id: string) => page.getByTestId(id);

test.describe('M4-AC11: Review in Vietnamese', () => {
  test.use({ locale: 'vi-VN', viewport: { width: 360, height: 740 } });

  test('stats, heatmap, charts and streak chip in vi; tooltip on focus; switch to English keeps goal/year', async ({ page }) => {
    await freezeClock(page);
    await importBackup(page, 'sample-backup.json', VI);
    await gotoHash(page, '/today');
    await expect(page.getByTestId('streak-chip')).toHaveText('Chuỗi 8 ngày');
    await expectNoViLeaks(page);

    await page.getByRole('link', { name: VI.nav.review }).first().click();
    await expect(page.getByRole('heading', { level: 1, name: VI.review.title })).toBeVisible();
    await expect(page).toHaveTitle('Tổng kết — 1% Better');
    await expect(stat(page, 'stat-time')).toContainText('9,4 giờ');
    await expect(stat(page, 'stat-current')).toContainText('8 ngày');
    await expect(page.getByTestId('stats-note')).toHaveText(VI.review.pickGoal);
    await expect(page.getByTestId('chart-weekly').locator('svg.recharts-surface')).toBeVisible();
    await expectNoViLeaks(page);

    await page.getByRole('combobox', { name: VI.review.goalLabel }).selectOption('g1');
    await expect(page).toHaveURL(/#\/review\?goal=g1&year=2026$/);
    await expect(stat(page, 'stat-time')).toContainText('4,0 giờ');
    await expect(stat(page, 'stat-progress')).toContainText('25,8%');
    await expect(stat(page, 'stat-progress')).toContainText('240/930 phút');
    await expect(stat(page, 'stat-pace')).toContainText('Chậm 30 phút');
    await expect(stat(page, 'stat-pace')).toContainText('Dự kiến 270 phút tính đến hôm nay');
    await expect(page.getByRole('grid', { name: 'Biểu đồ nhiệt hoạt động năm 2026, Read' })).toBeVisible();
    await expect(cell(page, '2026-10-07')).toHaveAttribute('aria-label', /7 tháng 10.*2026: 30 phút, đã đạt chỉ tiêu/);
    await expect(page.getByTestId('heatmap-weekday').first()).toHaveText(/^(Th(ứ)? 2|T2)$/);
    await expect(page.getByTestId('heatmap-month').nth(9)).toHaveText(/thg 10|Thg 10|Tháng 10/);
    await expect(page.getByRole('table', { name: 'Các tháng của năm 2026' }).locator('tbody tr').nth(9)).toContainText('4 giờ');
    await expect(page.getByRole('columnheader', { name: VI.chart.bar.colTime }).first()).toBeAttached();
    // Tooltip on a focused cell, then the vi scan with the tooltip open.
    await cell(page, '2026-10-07').focus();
    await expect(page.getByRole('tooltip')).toBeVisible();
    await expect(page.getByRole('tooltip')).toContainText('30 phút, đã đạt chỉ tiêu');
    await expectNoViLeaks(page);
    await expectAxeClean(page);
    await expectNoHorizontalScroll(page);
    // Bar tooltip in vi (hover the October bar).
    const bars = page.getByTestId('chart-monthly').locator('.recharts-bar-rectangle');
    await bars.last().hover();
    await expect(page.locator('.chart-tip')).toContainText('4 giờ');
    await expectNoViLeaks(page);

    // Year outside the goal and the empty-year line.
    await gotoHash(page, '/review?goal=g1&year=2025');
    await expect(page.getByTestId('heatmap-summary')).toHaveText('Mục tiêu này không diễn ra trong năm 2025.');
    await expectNoViLeaks(page);
    await gotoHash(page, '/review?goal=g4&year=2026');
    await expect(page.getByTestId('heatmap-summary')).toHaveText('Năm 2026 chưa có thời gian nào được ghi.');
    await expect(page.getByText(VI.chart.bar.empty).first()).toBeVisible();
    await expectNoViLeaks(page);

    // Switch to English in Settings and come back: the same goal/year URL, everything English, no reload.
    await gotoHash(page, '/review?goal=g1&year=2026');
    await expect(stat(page, 'stat-pace')).toContainText('Chậm 30 phút');
    await page.evaluate(() => {
      (window as unknown as { __noReload?: boolean }).__noReload = true;
    });
    await page.getByRole('link', { name: VI.nav.settings }).first().click();
    await page.getByRole('radio', { name: 'English' }).check();
    await expect(toast(page)).toHaveText(EN.toast.languageChanged);
    await page.goBack();
    await expect(page).toHaveURL(/#\/review\?goal=g1&year=2026$/);
    await expect(page.getByRole('heading', { level: 1, name: EN.review.title })).toBeVisible();
    await expect(stat(page, 'stat-pace')).toContainText('30 min behind');
    await expect(stat(page, 'stat-time')).toContainText('4.0 h');
    await expect(page.getByRole('grid', { name: 'Activity heatmap for 2026, Read' })).toBeVisible();
    await expect(page.getByTestId('heatmap-month').nth(9)).toHaveText('Oct');
    await expect(page.getByRole('table', { name: 'Months of 2026' })).toBeAttached();
    expect(await page.evaluate(() => (window as unknown as { __noReload?: boolean }).__noReload)).toBe(true);
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  });

  test('empty Review in vi', async ({ page }) => {
    await freezeClock(page);
    await gotoHash(page, '/review');
    await expect(page.getByRole('heading', { level: 2, name: VI.empty.review })).toBeVisible();
    await expect(page.getByRole('link', { name: VI.empty.reviewAction })).toHaveAttribute('href', '#/goals/new');
    await expectNoViLeaks(page);
    await expectAxeClean(page);
  });
});
