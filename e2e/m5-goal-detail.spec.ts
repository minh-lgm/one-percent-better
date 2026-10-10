import { expect, test, type Page } from '@playwright/test';
import { advanceTo, at, createGoal, EN, expectAmount, expectAxeClean, freezeClock, goalCard, gotoHash, importBackup, logTime, startTimer, toast } from './helpers/app';
import { BASE_URL } from '../playwright.config';

const headline = (page: Page) => page.getByTestId('headline');
const live = (page: Page) => page.getByTestId('plus-one-live');
const row = (page: Page, name: string) => page.getByTestId('goal-row').filter({ has: page.getByRole('link', { name, exact: true }) });

/** Chunks that hold Recharts / the chart components (see README "Bundle"). */
const CHART_CHUNK = /\/assets\/(useRechartsWidth|CurveChart|BarChart)-[^/]+\.js$/;
const DETAIL_CHUNK = /\/assets\/GoalDetail-[^/]+\.js$/;

test.beforeEach(async ({ page }) => {
  await freezeClock(page);
});

test.describe('M5 Goal detail, +1%, archive, empty states, storage error', () => {
  test('M5-AC2: Read (S1) shows why, period, target, 25.8 %, streak 8/8, "+8.3% better", two curve series, 8 history rows; chart chunks only on this page or Review', async ({ page }) => {
    const scripts: string[] = [];
    const external: string[] = [];
    page.on('request', (req) => {
      if (req.resourceType() === 'script') scripts.push(req.url());
      if (!req.url().startsWith(BASE_URL)) external.push(req.url());
    });
    await importBackup(page);
    await gotoHash(page, '/today');
    await expect(page.getByTestId('streak-chip')).toHaveText('8-day streak');
    await gotoHash(page, '/goals');
    await expect(page.getByRole('heading', { level: 1, name: EN.goals.title })).toBeVisible();
    await gotoHash(page, '/settings');
    await expect(page.getByRole('heading', { level: 1, name: EN.settings.title })).toBeVisible();
    expect(scripts.filter((u) => CHART_CHUNK.test(u) || DETAIL_CHUNK.test(u)), scripts.join('\n')).toEqual([]);

    await gotoHash(page, '/goals');
    await page.getByRole('link', { name: 'Read', exact: true }).click();
    await expect(page).toHaveURL(/#\/goals\/g1$/);
    await expect(page.getByRole('heading', { level: 1, name: 'Read' })).toBeVisible();
    await expect(page.getByRole('heading', { level: 1, name: 'Read' })).toBeFocused();
    await expect(page).toHaveTitle('Read — 1% Better');
    await expect(page.locator('.gd-head .why')).toHaveText('Be smarter');
    await expect(page.locator('.gd-head')).toContainText('2026-10-01 – 2026-10-31');
    await expect(page.locator('.gd-head')).toContainText('30 min/day');
    await expect(page.getByText(EN.goal.status.active, { exact: true })).toBeVisible();

    await expect(headline(page)).toHaveText('+8.3% better');
    await expect(page.getByTestId('headline-sub')).toHaveText(/Day 9 of 31 · 8 days on target · 1\.01\^8 = 1\.083/);
    await expect(page.getByTestId('curve-summary')).toHaveText('Day 9 of 31: you are +8.3% better. The ideal line is +9.4%. You hit your target on 8 of 9 days.');
    const chart = page.getByTestId('curve-chart');
    await expect(chart).toBeVisible();
    await expect(chart.locator('.recharts-line')).toHaveCount(2);
    await expect(chart.locator('.recharts-line-curve[stroke-dasharray]')).toHaveCount(1);
    await expect(chart.locator('.recharts-reference-dot')).toHaveCount(2);
    await expect(chart).toContainText('Ideal +9.4%');
    await expect(chart).toContainText('You +8.3%');
    await expect(page.getByTestId('curve-legend')).toContainText(EN.goal.detail.legendIdeal);
    await expect(page.getByTestId('curve-legend')).toContainText(EN.goal.detail.legendYou);
    await expect(page.getByRole('radio', { name: EN.goal.detail.rangeWhole })).toBeChecked();
    // M5-D3: both Range segments fit their label with padding (no clipped text).
    for (const seg of await page.locator('.seg.range span').all()) {
      expect(await seg.evaluate((el) => ({ sw: el.scrollWidth, cw: el.clientWidth, pad: getComputedStyle(el).paddingLeft }))).toMatchObject({ pad: '14px' });
      expect(await seg.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);
    }

    await expect(page.getByTestId('stat-progress')).toContainText('25.8%');
    await expect(page.getByTestId('stat-progress')).toContainText('240 of 930 min');
    await expect(page.getByTestId('stat-pace')).toContainText('30 min behind');
    await expect(page.getByTestId('stat-current')).toContainText('8 days');
    await expect(page.getByTestId('stat-longest')).toContainText('8 days');
    await expect(page.getByTestId('history-row')).toHaveCount(8);
    await expect(page.getByTestId('history-row').first()).toContainText('2026-10-08');

    expect(scripts.some((u) => DETAIL_CHUNK.test(u)), scripts.join('\n')).toBe(true);
    expect(scripts.some((u) => /\/assets\/useRechartsWidth-[^/]+\.js$/.test(u)), scripts.join('\n')).toBe(true);
    expect(scripts.some((u) => /\/assets\/CurveChart-[^/]+\.js$/.test(u)), scripts.join('\n')).toBe(true);

    // Hover tooltip, keyboard reading, data table, range.
    await chart.hover({ position: { x: 120, y: 120 } });
    await expect(page.locator('.chart-tip')).toContainText(/Ideal \+\d+\.\d%/);
    await chart.focus();
    await page.keyboard.press('ArrowRight');
    await expect(page.getByTestId('curve-reading')).toHaveText('Oct 9 · Ideal +9.4% · You +8.3%');
    await page.keyboard.press('ArrowLeft');
    await expect(page.getByTestId('curve-reading')).toHaveText('Oct 8 · Ideal +8.3% · You +8.3%');
    await page.keyboard.press('End');
    await expect(page.getByTestId('curve-reading')).toHaveText('Oct 31 · Ideal +36.1%');
    await page.getByText(EN.goal.detail.showTable).click();
    await expect(page.getByTestId('curve-table').locator('tbody tr')).toHaveCount(31);
    await expect(page.getByTestId('curve-table').locator('tbody tr').nth(8)).toContainText('+8.3%');
    await expect(page.getByTestId('curve-table').locator('tbody tr').nth(30)).toContainText('—');
    await page.getByRole('radio', { name: EN.goal.detail.rangeSoFar }).check();
    await expect(page.getByTestId('curve-table').locator('tbody tr')).toHaveCount(9);
    await expectAxeClean(page);
    expect(external).toEqual([]);
  });

  test('M5-AC3: "+1%" feedback appears once per goal and day', async ({ page }) => {
    await importBackup(page);
    await gotoHash(page, '/today');
    await expectAmount(page, 'Read', '0/30');
    await expect(live(page)).toHaveAttribute('data-count', '0');

    await logTime(page, 'Read', 20);
    await expectAmount(page, 'Read', '20/30');
    await expect(live(page)).toHaveAttribute('data-count', '0');
    await expect(live(page)).toHaveText('');

    await logTime(page, 'Read', 10);
    await expectAmount(page, 'Read', '30/30');
    await expect(live(page)).toHaveAttribute('data-count', '1');
    await expect(live(page)).toHaveText('+1% for Read today.');
    await expect(goalCard(page, 'Read').getByTestId('plus-one')).toHaveAttribute('data-animate', 'true');
    await expect(page.getByTestId('plus-one').first()).toHaveClass(/\bentering\b/);

    await logTime(page, 'Read', 5);
    await expectAmount(page, 'Read', '35/30');
    await expect(live(page)).toHaveAttribute('data-count', '1');

    await page.reload();
    await expectAmount(page, 'Read', '35/30');
    await expect(goalCard(page, 'Read').getByTestId('plus-one')).toBeVisible();
    await expect(live(page)).toHaveAttribute('data-count', '0');
    await expect(live(page)).toHaveText('');
    await expect(goalCard(page, 'Read').getByTestId('plus-one')).not.toHaveClass(/\bentering\b/);

    // Delete the 10- and 5-minute entries, then log 10 again: already shown today.
    for (const label of ['Delete entry: 10 min', 'Delete entry: 5 min']) {
      await goalCard(page, 'Read').getByRole('button', { name: label }).click();
      await goalCard(page, 'Read').getByRole('group', { name: /^Confirm delete/ }).getByRole('button', { name: EN.common.delete }).click();
    }
    await expectAmount(page, 'Read', '20/30');
    await expect(goalCard(page, 'Read').getByTestId('plus-one')).toHaveCount(0);
    await logTime(page, 'Read', 10);
    await expectAmount(page, 'Read', '30/30');
    await expect(goalCard(page, 'Read').getByTestId('plus-one')).toBeVisible();
    await expect(live(page)).toHaveAttribute('data-count', '0');

    // The next day it fires again.
    await advanceTo(page, at('2026-10-10T10:00:00'));
    await expect(page.getByText('Saturday, October 10')).toBeVisible();
    await expectAmount(page, 'Read', '0/30');
    await logTime(page, 'Read', 30);
    await expectAmount(page, 'Read', '30/30');
    await expect(live(page)).toHaveAttribute('data-count', '1');
    await expect(live(page)).toHaveText('+1% for Read today.');
  });

  test('M5-AC4: Archive "Spanish" → gone from Today, in Archived on Goals, still selectable in Review with its data; Restore brings it back; timer blocks archiving', async ({ page }) => {
    await importBackup(page);
    await gotoHash(page, '/goals');
    await row(page, 'Spanish').getByRole('button', { name: EN.goals.archive }).click();
    await expect(toast(page)).toHaveText(EN.toast.goalArchived);
    await expect(page.getByRole('heading', { level: 2, name: 'Archived (1)' })).toBeVisible();
    await expect(page.getByRole('heading', { level: 2, name: 'Active (2)' })).toBeVisible();
    const archived = page.locator('section', { has: page.getByRole('heading', { level: 2, name: 'Archived (1)' }) });
    await expect(archived.getByRole('link', { name: 'Spanish' })).toBeVisible();
    await expect(archived.getByText(EN.goal.status.archived, { exact: true })).toBeVisible();
    await expect(archived.getByRole('button', { name: EN.goals.restore })).toBeVisible();
    await expectAxeClean(page);

    await gotoHash(page, '/today');
    await expect(goalCard(page, 'Read')).toBeVisible();
    await expect(goalCard(page, 'Spanish')).toHaveCount(0);
    await expect(page.getByText('0 of 2 goals on target')).toBeVisible();

    await gotoHash(page, '/review');
    await page.getByRole('combobox', { name: EN.review.goalLabel }).selectOption({ label: 'Spanish (archived)' });
    await expect(page).toHaveURL(/#\/review\?goal=g3&year=2026$/);
    await expect(page.getByTestId('stat-time')).toContainText('1.0 h');
    await expect(page.locator('[data-date="2026-03-02"]')).toHaveAttribute('aria-label', /60 min, target met/);

    await gotoHash(page, '/goals/g3');
    await expect(page.getByText(EN.goal.status.archived, { exact: true })).toBeVisible();
    await expect(headline(page)).toHaveText('+1.0% better');
    await page.getByRole('button', { name: EN.goals.restore }).click();
    await expect(toast(page)).toHaveText(EN.toast.goalRestored);
    await expect(page.getByText(EN.goal.status.active, { exact: true })).toBeVisible();
    await gotoHash(page, '/today');
    await expect(goalCard(page, 'Spanish')).toBeVisible();

    // A running timer blocks archiving (GOAL_TIMER_RUNNING); the goal stays active.
    await startTimer(page, 'Read');
    await gotoHash(page, '/goals');
    await row(page, 'Read').getByRole('button', { name: EN.goals.archive }).click();
    await expect(row(page, 'Read').getByRole('alert')).toHaveText(EN.errors.GOAL_TIMER_RUNNING);
    await expect(page.getByRole('heading', { level: 2, name: 'Active (3)' })).toBeVisible();
    await expect(page.getByRole('heading', { level: 2, name: 'Archived (1)' })).toHaveCount(0);
    await expectAxeClean(page);
  });

  test('M5-AC5: empty states on Today, Goals, Review and Day with an empty database (no console errors); a goal without entries shows +0.0% and an empty history', async ({ page }) => {
    const problems: string[] = [];
    page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`));
    page.on('console', (m) => {
      if (m.type() === 'error') problems.push(`console: ${m.text()}`);
    });
    await gotoHash(page, '/today');
    await expect(page.getByRole('heading', { level: 2, name: EN.empty.today.noGoals })).toBeVisible();
    await expect(page.getByText(EN.empty.today.noGoalsBody)).toBeVisible();
    await expect(page.getByRole('link', { name: EN.empty.today.noGoalsAction })).toHaveAttribute('href', '#/goals/new');
    await gotoHash(page, '/goals');
    await expect(page.getByRole('heading', { level: 2, name: EN.empty.goals })).toBeVisible();
    await expect(page.getByRole('link', { name: EN.empty.goalsAction })).toHaveAttribute('href', '#/goals/new');
    await gotoHash(page, '/review');
    await expect(page.getByRole('heading', { level: 2, name: EN.empty.review })).toBeVisible();
    await expect(page.getByRole('link', { name: EN.empty.reviewAction })).toHaveAttribute('href', '#/goals/new');
    await gotoHash(page, '/day/2026-10-09');
    await expect(page.getByRole('heading', { level: 2, name: EN.empty.day.noGoals })).toBeVisible();
    await expect(page.getByRole('link', { name: EN.empty.day.noGoalsAction })).toHaveAttribute('href', '#/goals');
    await expectAxeClean(page);

    await createGoal(page, { name: 'Read', why: 'Be smarter', targetValue: 30, startDate: '2026-10-01', endDate: '2026-10-31' });
    await page.getByRole('link', { name: 'Read', exact: true }).click();
    await expect(headline(page)).toHaveText('+0.0% better');
    await expect(page.getByTestId('curve-empty')).toHaveText(EN.empty.detail.curve);
    await expect(page.getByRole('heading', { level: 3, name: EN.empty.detail.history })).toBeVisible();
    await expect(page.getByTestId('curve-chart').locator('.recharts-line')).toHaveCount(2);
    // Upcoming goal: only the ideal line and the "Starts …" line.
    await createGoal(page, { name: 'Later', targetValue: 10, startDate: '2026-11-01', endDate: '2026-11-30' });
    await page.getByRole('link', { name: 'Later', exact: true }).click();
    await expect(headline(page)).toHaveText('+0.0% better');
    await expect(page.getByTestId('headline-sub')).toHaveText('Starts 2026-11-01. Your line will appear once the goal begins.');
    await expect(page.getByRole('radio', { name: EN.goal.detail.rangeWhole })).toHaveCount(0);
    await expectAxeClean(page);
    expect(problems).toEqual([]);
  });

  test('M5-AC6: IndexedDB unavailable → StorageError screen (title, 3 steps, Try again), never a blank page', async ({ browser }) => {
    for (const variant of ['undefined', 'throws'] as const) {
      const context = await browser.newContext({ timezoneId: 'Asia/Ho_Chi_Minh', locale: 'en-US', baseURL: BASE_URL });
      const page = await context.newPage();
      await page.addInitScript((v) => {
        if (v === 'undefined') {
          Object.defineProperty(window, 'indexedDB', { configurable: true, get: () => undefined });
        } else {
          const open = () => {
            throw new DOMException('blocked', 'SecurityError');
          };
          Object.defineProperty(IDBFactory.prototype, 'open', { configurable: true, value: open });
        }
      }, variant);
      await gotoHash(page, '/today');
      await expect(page.getByRole('heading', { level: 1, name: EN.storageError.title })).toBeVisible();
      await expect(page.getByText(EN.storageError.body)).toBeVisible();
      await expect(page.getByRole('listitem')).toHaveText([EN.storageError.step1, EN.storageError.step2, EN.storageError.step3]);
      await expect(page.getByRole('button', { name: EN.common.tryAgain })).toBeVisible();
      await expect(page).toHaveTitle("Can't open local storage — 1% Better");
      await expect(page.getByRole('navigation')).toHaveCount(0);
      await expectAxeClean(page);
      // Try again keeps the screen while storage is still blocked (no crash).
      await page.getByRole('button', { name: EN.common.tryAgain }).click();
      await expect(page.getByRole('heading', { level: 1, name: EN.storageError.title })).toBeVisible();
      await context.close();
    }
  });
});
