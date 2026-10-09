import { expect, test, type Page } from '@playwright/test';
import { EN, expectAxeClean, expectNoHorizontalScroll, freezeClock, gotoHash, importBackup } from './helpers/app';
import { BASE_URL } from '../playwright.config';

const cell = (page: Page, date: string) => page.locator(`[data-date="${date}"]`);
const stat = (page: Page, id: string) => page.getByTestId(id);

test.beforeEach(async ({ page }) => {
  await freezeClock(page);
});

test.describe('M4 Review', () => {
  test('M4-AC5/AC6/AC7: All goals stats, pick Read → URL + stats 4.0 h / 25.8% / 30 min behind, charts with 12 columns, axe, no external requests', async ({ page }) => {
    const external: string[] = [];
    page.on('request', (req) => {
      if (!req.url().startsWith(BASE_URL)) external.push(req.url());
    });
    await importBackup(page);
    await page.getByRole('link', { name: EN.nav.review }).first().click();
    await expect(page).toHaveURL(/#\/review$/);
    await expect(page.getByRole('heading', { level: 1, name: EN.review.title })).toBeVisible();
    await expect(page.getByRole('heading', { level: 1, name: EN.review.title })).toBeFocused();
    await expect(page).toHaveTitle('Review — 1% Better');

    await expect(stat(page, 'stat-time')).toContainText('9.4 h');
    await expect(stat(page, 'stat-days')).toContainText('20');
    await expect(stat(page, 'stat-current')).toContainText('8 days');
    await expect(stat(page, 'stat-longest')).toContainText('10 days');
    await expect(stat(page, 'stat-progress')).toHaveCount(0);
    await expect(page.getByTestId('stats-note')).toHaveText(EN.review.pickGoal);
    await expect(page.getByTestId('heatmap-summary')).toHaveText('In 2026 you logged time on 21 days and hit your target on 20 days. Longest streak: 10 days.');
    await expect(page.getByRole('grid', { name: 'Activity heatmap for 2026, All goals' })).toBeVisible();
    await expect(cell(page, '2026-10-07')).toHaveAttribute('aria-label', 'Wednesday, October 7, 2026: 50 min, target met');
    // Colour levels (M4-AC2) and the month row.
    await expect(cell(page, '2026-09-15')).toHaveClass(/\bl1\b/);
    await expect(cell(page, '2026-10-07')).toHaveClass(/\bl2\b/);
    await expect(cell(page, '2026-03-02')).toHaveClass(/\bl3\b/);
    await expect(cell(page, '2026-06-30')).toHaveClass(/\bl1\b/);
    await expect(cell(page, '2026-10-09')).toHaveClass(/\btoday\b/);
    await expect(page.getByTestId('heatmap-month')).toHaveText(['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']);
    // Both charts rendered (Recharts chunk) with 12-row hidden tables.
    await expect(page.getByTestId('chart-weekly').locator('svg.recharts-surface')).toBeVisible();
    await expect(page.getByTestId('chart-monthly').locator('svg.recharts-surface')).toBeVisible();
    await expect(page.getByRole('table', { name: EN.review.weeklyTitle }).locator('tbody tr')).toHaveCount(12);
    await expect(page.getByRole('table', { name: 'Months of 2026' }).locator('tbody tr')).toHaveCount(12);
    await expect(page.getByRole('table', { name: 'Months of 2026' }).locator('tbody tr').nth(9)).toContainText('4 h 40 min');
    await expect(page.getByText('2026: 9 h 25 min logged, busiest month October with 4 h 40 min.')).toBeVisible();
    await expect(page.getByText('Last 12 weeks: 8 h 10 min logged, busiest week starting Oct 5 with 2 h 40 min.')).toBeVisible();
    await expectAxeClean(page);

    await page.getByRole('combobox', { name: EN.review.goalLabel }).selectOption('g1');
    await expect(page).toHaveURL(/#\/review\?goal=g1&year=2026$/);
    await expect(stat(page, 'stat-time')).toContainText('4.0 h');
    await expect(stat(page, 'stat-time')).toContainText('Whole goal: 4.0 h');
    await expect(stat(page, 'stat-days')).toContainText('8');
    await expect(stat(page, 'stat-progress')).toContainText('25.8%');
    await expect(stat(page, 'stat-progress')).toContainText('240 of 930 min');
    await expect(stat(page, 'stat-pace')).toContainText('30 min behind');
    await expect(stat(page, 'stat-pace')).toContainText('Expected 270 min by today');
    await expect(stat(page, 'stat-current')).toContainText('8 days');
    await expect(stat(page, 'stat-longest')).toContainText('8 days');
    await expect(page.getByTestId('stats-note')).toHaveText(EN.review.progressNote);
    await expect(page.getByRole('grid', { name: 'Activity heatmap for 2026, Read' })).toBeVisible();
    await expect(cell(page, '2026-09-30')).toHaveAttribute('aria-disabled', 'true');
    await expect(cell(page, '2026-10-07')).toHaveAttribute('aria-label', 'Wednesday, October 7, 2026: 30 min, target met');
    await expect(page.getByRole('table', { name: 'Months of 2026' }).locator('tbody tr').nth(9)).toContainText('4 h');
    await expectAxeClean(page);

    // Guitar: pace in hours; Marathon prep (upcoming): on pace.
    await page.getByRole('combobox', { name: EN.review.goalLabel }).selectOption('g2');
    await expect(stat(page, 'stat-pace')).toContainText('8 h 50 min behind');
    await expect(stat(page, 'stat-progress')).toContainText('10.2%');
    await page.getByRole('combobox', { name: EN.review.goalLabel }).selectOption('g4');
    await expect(stat(page, 'stat-pace')).toContainText(EN.stat.paceOnTrack);
    await expect(page.getByTestId('heatmap-summary')).toHaveText('No time logged in 2026 yet.');

    // Reload keeps the selection from the URL.
    await page.reload();
    await expect(page.getByRole('combobox', { name: EN.review.goalLabel })).toHaveValue('g4');
    expect(external).toEqual([]);
  });

  test('M4-AC7: year 2025 for Read is all outside; bad params fall back to All goals / 2026 without errors', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await importBackup(page);
    await gotoHash(page, '/review?goal=g1&year=2025');
    await expect(page.getByRole('combobox', { name: EN.review.yearLabel })).toHaveValue('2025');
    await expect(page.getByRole('grid', { name: 'Activity heatmap for 2025, Read' })).toBeVisible();
    await expect(page.locator('[role="gridcell"]')).toHaveCount(365);
    await expect(page.locator('[role="gridcell"].out')).toHaveCount(365);
    await expect(page.getByTestId('heatmap-summary')).toHaveText("This goal doesn't run in 2025.");
    await expect(stat(page, 'stat-time')).toContainText('0.0 h');

    await page.getByRole('combobox', { name: EN.review.yearLabel }).selectOption('2026');
    await expect(page).toHaveURL(/#\/review\?goal=g1&year=2026$/);
    // Jan–Sep are outside the goal; Oct 10 → Dec 31 are future (future wins, like the mockup).
    await expect(page.locator('[role="gridcell"].out')).toHaveCount(273);
    await expect(page.locator('[role="gridcell"].fut')).toHaveCount(83);

    await gotoHash(page, '/review?goal=xyz&year=abc');
    await expect(page.getByRole('combobox', { name: EN.review.goalLabel })).toHaveValue('all');
    await expect(page.getByRole('combobox', { name: EN.review.yearLabel })).toHaveValue('2026');
    await expect(stat(page, 'stat-time')).toContainText('9.4 h');
    await gotoHash(page, '/review?year=1800');
    await expect(page.getByRole('combobox', { name: EN.review.yearLabel })).toHaveValue('2026');
    expect(errors).toEqual([]);
  });

  test('M4-AC8: click and Enter on 2026-10-05 open Day; the future cell 2026-10-10 does not navigate; tooltip on focus', async ({ page }) => {
    await importBackup(page);
    await gotoHash(page, '/review');
    await expect(cell(page, '2026-10-05')).toBeVisible();
    await cell(page, '2026-10-05').click();
    await expect(page).toHaveURL(/#\/day\/2026-10-05$/);
    await expect(page.getByRole('heading', { level: 1, name: EN.day.title })).toBeVisible();
    await expect(page.getByText('Monday, October 5, 2026')).toBeVisible();

    await gotoHash(page, '/review');
    // Keyboard: Tab from the Year select lands on today's cell (single tab stop), ArrowUp ×4 → Monday 10-05.
    await page.getByRole('combobox', { name: EN.review.yearLabel }).focus();
    await page.keyboard.press('Tab');
    await expect(cell(page, '2026-10-09')).toBeFocused();
    await expect(page.getByRole('tooltip')).toHaveText('Friday, October 9, 2026: no time logged');
    await page.keyboard.press('ArrowUp');
    await page.keyboard.press('ArrowUp');
    await page.keyboard.press('ArrowUp');
    await page.keyboard.press('ArrowUp');
    await expect(cell(page, '2026-10-05')).toBeFocused();
    await expect(page.getByRole('tooltip')).toHaveText('Monday, October 5, 2026: 30 min, target met');
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(/#\/day\/2026-10-05$/);

    await gotoHash(page, '/review');
    await cell(page, '2026-10-10').click({ force: true }); // aria-disabled: Playwright would otherwise wait for "enabled"
    await expect(page).toHaveURL(/#\/review$/);
    await cell(page, '2026-10-10').focus();
    await expect(page.getByRole('tooltip')).toHaveText('Saturday, October 10, 2026: upcoming');
    await page.keyboard.press('Enter');
    await page.keyboard.press('Space');
    await expect(page).toHaveURL(/#\/review$/);
    // Left/Right move by a week.
    await page.keyboard.press('ArrowLeft');
    await expect(cell(page, '2026-10-03')).toBeFocused();
    await page.keyboard.press('Home');
    await expect(cell(page, '2026-01-01')).toBeFocused();
    await page.keyboard.press('End');
    await expect(cell(page, '2026-12-31')).toBeFocused();
  });

  test('M4-AC9/AC10: chart chunk is not requested on Today, only on Review; 360 px and 1440 px without horizontal scroll', async ({ page }) => {
    const scripts: string[] = [];
    page.on('request', (req) => {
      if (req.resourceType() === 'script') scripts.push(req.url());
    });
    await importBackup(page);
    await gotoHash(page, '/today');
    await expect(page.getByTestId('streak-chip')).toHaveText('8-day streak');
    await gotoHash(page, '/goals');
    await expect(page.getByRole('heading', { level: 1, name: EN.goals.title })).toBeVisible();
    const chartChunk = (url: string) => /\/assets\/BarChart-[^/]+\.js$/.test(url);
    const reviewChunk = (url: string) => /\/assets\/Review-[^/]+\.js$/.test(url);
    expect(scripts.some(chartChunk), scripts.join('\n')).toBe(false);
    expect(scripts.some(reviewChunk), scripts.join('\n')).toBe(false);

    await page.setViewportSize({ width: 360, height: 740 });
    await gotoHash(page, '/review?goal=g1&year=2026');
    await expect(page.getByTestId('chart-weekly').locator('svg.recharts-surface')).toBeVisible();
    expect(scripts.some(reviewChunk), scripts.join('\n')).toBe(true);
    expect(scripts.some(chartChunk), scripts.join('\n')).toBe(true);
    await expectNoHorizontalScroll(page);
    // The heatmap scrolls inside its own container and is scrolled to the current week.
    const scroll = page.getByTestId('heatmap-scroll');
    expect(await scroll.evaluate((el) => el.scrollWidth > el.clientWidth)).toBe(true);
    expect(await scroll.evaluate((el) => el.scrollLeft)).toBeGreaterThan(0);
    expect(
      await scroll.evaluate((el) => {
        const c = el.querySelector<HTMLElement>('[data-date="2026-10-09"]')!;
        const x = c.offsetLeft - el.scrollLeft;
        return x >= 0 && x + c.offsetWidth <= el.clientWidth;
      }),
    ).toBe(true);
    await expect(stat(page, 'stat-pace')).toBeVisible();
    await expectAxeClean(page);
    await page.getByRole('combobox', { name: EN.review.goalLabel }).selectOption('all');
    await expectNoHorizontalScroll(page);

    await page.setViewportSize({ width: 1440, height: 900 });
    await expectNoHorizontalScroll(page);
    // M4-D2: desktop uses the 960 px column and the whole 53-week heatmap fits without clipping.
    const desktop = await page.evaluate(() => {
      const s = document.querySelector<HTMLElement>('[data-testid="heatmap-scroll"]')!;
      return { main: document.querySelector('main')!.getBoundingClientRect().width, hidden: s.scrollWidth - s.clientWidth, wide: document.querySelector('main')!.classList.contains('wide') };
    });
    expect(desktop.wide).toBe(true);
    expect(desktop.main).toBeGreaterThanOrEqual(940);
    expect(desktop.hidden).toBeLessThanOrEqual(2); // sub-pixel rounding only; nothing of the year is clipped
    await page.getByRole('combobox', { name: EN.review.goalLabel }).selectOption('g1');
    await expect(stat(page, 'stat-time')).toContainText('In 2026 · Whole goal: 4.0 h');
    await expectNoHorizontalScroll(page);
    await expectAxeClean(page);
    // Other screens keep the 720 px column.
    await gotoHash(page, '/today');
    expect(await page.evaluate(() => document.querySelector('main')!.classList.contains('wide'))).toBe(false);
  });

  test('M4-AC9: with large-backup.json (5 goals, 5,449 entries) Review shows the heatmap in < 1.5 s', async ({ page }) => {
    await importBackup(page, 'large-backup.json');
    await gotoHash(page, '/today');
    await expect(page.getByTestId('streak-chip')).toBeVisible();
    const started = Date.now();
    await gotoHash(page, '/review');
    await expect(page.getByRole('grid')).toBeVisible();
    await expect(stat(page, 'stat-time')).not.toHaveText('');
    const elapsed = Date.now() - started;
    console.log(`[perf] Review heatmap visible after ${elapsed} ms with large-backup.json`);
    expect(elapsed).toBeLessThan(1500);
    await expect(stat(page, 'stat-longest')).toContainText('days');
    await expect(page.getByTestId('chart-weekly').locator('svg.recharts-surface')).toBeVisible();

    // Switching to a goal and to an earlier year stays fast too.
    const t2 = Date.now();
    await page.getByRole('combobox', { name: EN.review.goalLabel }).selectOption('L3');
    await expect(page.getByRole('grid', { name: 'Activity heatmap for 2026, Spanish' })).toBeVisible();
    await page.getByRole('combobox', { name: EN.review.yearLabel }).selectOption('2024');
    await expect(page.getByRole('grid', { name: 'Activity heatmap for 2024, Spanish' })).toBeVisible();
    await expect(page.locator('[role="gridcell"]')).toHaveCount(366);
    console.log(`[perf] goal + year switch ${Date.now() - t2} ms`);
    await expect(page.getByRole('combobox', { name: EN.review.yearLabel }).locator('option')).toHaveText(['2026', '2025', '2024', '2023']);
  });
});
