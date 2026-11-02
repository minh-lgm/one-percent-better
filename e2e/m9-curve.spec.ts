// M9 — the 1% curve v6 (FR-27 v6.0, ARCH §4.5, DESIGN S4 v6; user decision 2026-11-02): a burn-up
// in minutes. "Ideal" = the daily target growing 1 %/day, added up (ideal(k) = T·(1.01^k − 1)/0.01);
// "You" = minutes logged, added up (flat on days without time, drawn from day 1, never negative);
// headline = signed % of You vs Ideal at the last elapsed day; subtitle/summary/table/ticks in minutes.
// Datasets: R1 (the user's real data: 5 → 10 → 14 → 27 min), R3 (5 → 3), R4 (1 → 1440), S1 (M5).
import { expect, test, type Page } from '@playwright/test';
import { at, createGoal, EN, expectAmount, expectAxeClean, expectNoHorizontalScroll, expectNoViLeaks, freezeClock, gotoHash, importBackup, logTime, VI } from './helpers/app';
import { BASE_URL } from '../playwright.config';

const MINUS = '−';
const CLOCK_R1 = at('2026-10-13T10:00:00');
const CLOCK_R3 = at('2026-10-11T10:00:00');
/** Y ticks are plain minutes: digits with a group separator (`1,000` / `1.000`) or Intl compact from 10,000 (`12K` / `12 N`) — never signed, never `%`. */
const PLAIN_TICK = /^[\d,.]+(?: ?[A-Z])?$/;

const headline = (page: Page) => page.getByTestId('headline');
const sub = (page: Page) => page.getByTestId('headline-sub');
const chart = (page: Page) => page.getByTestId('curve-chart');
/** Y-axis tick labels (waits for the lazy chart to have drawn its axis). */
async function yTicks(page: Page): Promise<string[]> {
  const ticks = chart(page).locator('.recharts-yAxis-tick-labels .recharts-cartesian-axis-tick-value');
  await expect(ticks.first()).toBeAttached();
  return ticks.allTextContents();
}
/** Every tick is a plain, unsigned minute value (no `%`, no `+`, no `−`). */
function expectPlainTicks(ticks: string[]) {
  expect(ticks.length).toBeGreaterThanOrEqual(3);
  for (const t of ticks) expect(t, ticks.join(' ')).toMatch(PLAIN_TICK);
}
const tableRows = (page: Page) => page.getByTestId('curve-table').locator('tbody tr');

function trackExternal(page: Page): string[] {
  const external: string[] = [];
  page.on('request', (req) => {
    if (!req.url().startsWith(BASE_URL)) external.push(req.url());
  });
  return external;
}

test.describe('M9 Goal detail — curve v6 (en)', () => {
  test('M9-AC4 / M9-AC3 / M9-AC8: R1 at 2026-10-13 → −54.0% vs. ideal, subtitle in minutes, summary, 2 series, Y axis from 0 in minutes, no 0 % line, tooltip Oct 12, table, Range, Progress 2.2 %, streak 0; axe; no external requests', async ({ page }) => {
    const external = trackExternal(page);
    await freezeClock(page, CLOCK_R1);
    await importBackup(page, 'r1-real-backup.json');
    await gotoHash(page, '/goals/r1');
    await expect(page.getByRole('heading', { level: 1, name: 'Đọc sách' })).toBeVisible();
    await expect(page.locator('.gd-head')).toContainText('2026-10-10 – 2026-12-31');
    await expect(page.locator('.gd-head')).toContainText('30 min/day');

    await expect(headline(page)).toHaveText(`${MINUS}54.0% vs. ideal`);
    await expect(headline(page)).toHaveAttribute('data-sign', 'negative');
    await expect(page.getByTestId('headline-day')).toHaveText('Day 4 of 83');
    await expect(sub(page)).toHaveText(`Today: 27 min. Total 56 min, ideal 122 min (${MINUS}66 min).`);
    await expect(sub(page)).toHaveAttribute('data-variant', 'today');
    for (const part of ['27 min', '56 min', '122 min', `${MINUS}66 min`]) await expect(sub(page)).toContainText(part);
    await expect(sub(page)).not.toContainText('×');
    await expect(page.getByTestId('curve-summary')).toHaveText('Day 4 of 83: you have logged 56 min in total. The ideal line is at 122 min.');
    await expect(page.getByTestId('curve-note')).toHaveText(EN.goal.detail.chartNote);
    await expect(page.getByTestId('curve-legend').getByRole('listitem')).toHaveText([EN.goal.detail.legendIdeal, EN.goal.detail.legendYou]);
    await expect(page.getByRole('radio', { name: EN.goal.detail.rangeWhole })).toBeChecked();

    // Chart: two series, stepped You with 4 dots, dashed Ideal, no 0 % line, labels in minutes, plain ticks from 0.
    await expect(chart(page).locator('.recharts-line')).toHaveCount(2);
    await expect(chart(page).locator('.recharts-line-curve[stroke-dasharray]')).toHaveCount(1);
    await expect(chart(page).locator('.recharts-reference-line.zero-line')).toHaveCount(0);
    await expect(chart(page).locator('.recharts-reference-dot')).toHaveCount(2);
    await expect(chart(page).locator('.curve-dot')).toHaveCount(4);
    await expect(chart(page)).toContainText('Ideal 122 min');
    await expect(chart(page)).toContainText('You 56 min');
    await expect(chart(page)).not.toContainText('%');
    const ticks = await yTicks(page);
    expect(ticks[0]).toBe('0');
    expect(ticks).toContain('1,000');
    expectPlainTicks(ticks);
    // The whole-period ideal (3,852 min on Dec 31) sets the top of the scale.
    expect(Math.max(...ticks.map((t) => Number(t.replace(/,/g, ''))))).toBeGreaterThanOrEqual(3852);
    await expect(chart(page)).toHaveAttribute('data-y-min', '0');
    // The You line is drawn as steps: its path only has horizontal and vertical segments.
    const youPath = await chart(page).locator('.recharts-line-curve:not([stroke-dasharray])').getAttribute('d');
    expect(youPath).toMatch(/^M/);
    const points = [...youPath!.matchAll(/(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/g)].map((m) => [Number(m[1]), Number(m[2])]);
    for (let i = 1; i < points.length; i++) expect(Math.abs(points[i][0] - points[i - 1][0]) < 0.01 || Math.abs(points[i][1] - points[i - 1][1]) < 0.01).toBe(true);

    // Keyboard reading / tooltip text: the minutes of that day plus both running totals.
    await chart(page).focus();
    await page.keyboard.press('ArrowRight');
    await expect(page.getByTestId('curve-reading')).toHaveText('Oct 13 · 27 min this day · Total 56 min · Ideal 122 min');
    await page.keyboard.press('ArrowLeft');
    await expect(page.getByTestId('curve-reading')).toHaveText('Oct 12 · 14 min this day · Total 29 min · Ideal 91 min');
    await page.keyboard.press('Home');
    await expect(page.getByTestId('curve-reading')).toHaveText('Oct 10 · 5 min this day · Total 5 min · Ideal 30 min');
    await page.keyboard.press('End');
    await expect(page.getByTestId('curve-reading')).toHaveText('Dec 31 · Ideal 3,852 min');
    await chart(page).hover({ position: { x: 80, y: 120 } });
    await expect(page.locator('.chart-tip')).toContainText(/Ideal [\d,]+ min/);
    await expect(page.locator('.chart-tip')).not.toContainText('%');

    // Table: Whole period 83 rows in whole minutes (10-13 = 122 / 56 / 27 / −66), future rows "—", So far 4 rows.
    await page.getByText(EN.goal.detail.showTable).click();
    await expect(page.getByTestId('curve-table').locator('thead th')).toHaveText([EN.goal.detail.tableDate, EN.goal.detail.tableIdeal, EN.goal.detail.tableYou, EN.goal.detail.tableMinutes, EN.goal.detail.tableChange]);
    await expect(tableRows(page)).toHaveCount(83);
    await expect(tableRows(page).nth(0)).toContainText('2026-10-10');
    await expect(tableRows(page).nth(0).locator('td')).toHaveText(['30', '5', '5', `${MINUS}25`]);
    await expect(tableRows(page).nth(1).locator('td')).toHaveText(['60', '15', '10', `${MINUS}45`]);
    await expect(tableRows(page).nth(2).locator('td')).toHaveText(['91', '29', '14', `${MINUS}62`]);
    const row13 = tableRows(page).nth(3);
    await expect(row13).toContainText('2026-10-13');
    await expect(row13.locator('td')).toHaveText(['122', '56', '27', `${MINUS}66`]);
    await expect(tableRows(page).nth(4).locator('td')).toHaveText(['153', '—', '—', '—']);
    await expect(tableRows(page).nth(82).locator('td')).toHaveText(['3,852', '—', '—', '—']);
    await expect(page.getByTestId('curve-table')).not.toContainText('%');
    await page.getByRole('radio', { name: EN.goal.detail.rangeSoFar }).check();
    await expect(tableRows(page)).toHaveCount(4);

    // Stat cards follow the +1 %-a-day plan (v6.1, ADR-47): 56 of 3,852 min (= the last Ideal row), expected 122 → 66 min behind, streak 0.
    await expect(page.getByTestId('stat-progress')).toContainText('1.5%');
    await expect(page.getByTestId('stat-progress')).toContainText('56 of 3,852 min');
    await expect(page.getByTestId('stat-pace')).toContainText('1 h 6 min behind');
    await expect(page.getByTestId('stat-pace')).toContainText('Expected 122 min by today');
    await expect(page.getByTestId('stat-current')).toContainText('0 days');
    await expect(page.getByTestId('history-row')).toHaveCount(4);
    await expectAxeClean(page);
    expect(external).toEqual([]);
  });

  test('M9-AC4: S1 at 2026-10-09 → Read −14.6% vs. ideal with the M5 stats and rows 30 / 249 / 281 / 314; Guitar −73.6% defaults to "So far" with 322 / 210 / 10 / −112 on 2026-09-15 and no negative tick', async ({ page }) => {
    await freezeClock(page);
    await importBackup(page);
    await gotoHash(page, '/goals/g1');
    await expect(headline(page)).toHaveText(`${MINUS}14.6% vs. ideal`);
    await expect(headline(page)).toHaveAttribute('data-sign', 'negative');
    await expect(page.getByTestId('headline-day')).toHaveText('Day 9 of 31');
    await expect(sub(page)).toHaveText(`Last logged Oct 8: 30 min. Total 240 min, ideal 281 min (${MINUS}41 min).`);
    await expect(sub(page)).toHaveAttribute('data-variant', 'earlier');
    await expect(page.getByTestId('curve-summary')).toHaveText('Day 9 of 31: you have logged 240 min in total. The ideal line is at 281 min.');
    await expect(page.getByTestId('stat-progress')).toContainText('22.1%');
    await expect(page.getByTestId('stat-pace')).toContainText('41 min behind');
    await expect(page.getByTestId('stat-current')).toContainText('8 days');
    await expect(page.getByTestId('stat-longest')).toContainText('8 days');
    await expect(page.getByTestId('history-row')).toHaveCount(8);
    await expect(chart(page).locator('.recharts-line')).toHaveCount(2);
    await expect(chart(page)).toContainText('Ideal 281 min');
    await expect(chart(page)).toContainText('You 240 min');
    await page.getByText(EN.goal.detail.showTable).click();
    await expect(tableRows(page)).toHaveCount(31);
    await expect(tableRows(page).nth(0).locator('td')).toHaveText(['30', '30', '30', '+0']);
    await expect(tableRows(page).nth(7).locator('td')).toHaveText(['249', '240', '30', `${MINUS}9`]);
    await expect(tableRows(page).nth(8).locator('td')).toHaveText(['281', '240', '0', `${MINUS}41`]);
    await expect(tableRows(page).nth(9).locator('td')).toHaveText(['314', '—', '—', '—']);

    await gotoHash(page, '/goals/g2');
    await expect(headline(page)).toHaveText(`${MINUS}73.6% vs. ideal`);
    await expect(sub(page)).toHaveText(`Last logged Oct 8: 20 min. Total 250 min, ideal 948 min (${MINUS}698 min).`);
    await expect(page.getByRole('radio', { name: EN.goal.detail.rangeSoFar })).toBeChecked();
    await expect(chart(page)).toContainText('You 250 min');
    await expect(chart(page)).toContainText('Ideal 948 min');
    await expect(chart(page).locator('.recharts-reference-line.zero-line')).toHaveCount(0);
    await expect(chart(page)).toHaveAttribute('data-y-min', '0');
    const ticks = await yTicks(page);
    expect(ticks.some((t) => /^[-−]/.test(t))).toBe(false);
    expectPlainTicks(ticks);
    await page.getByText(EN.goal.detail.showTable).click();
    await expect(tableRows(page)).toHaveCount(39);
    const row = tableRows(page).nth(14);
    await expect(row).toContainText('2026-09-15');
    await expect(row).toContainText(`${MINUS}112`);
    await expect(row.locator('td')).toHaveText(['322', '210', '10', `${MINUS}112`]);
    await expectAxeClean(page);
  });

  test('M9-AC6: no entries → −100.0% and empty.detail.curve with You flat at 0 min; one logged day → the same "Last logged" sentence; R3 → −86.7% with no negative tick; upcoming → Ideal only; ended → You stops at 2026-06-30', async ({ page }) => {
    const problems: string[] = [];
    page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`));
    page.on('console', (m) => {
      if (m.type() === 'error') problems.push(`console: ${m.text()}`);
    });
    // (1) a goal with no entries at all: You is still drawn (flat at 0 min) under the Ideal line.
    await freezeClock(page);
    await createGoal(page, { name: 'Read', why: 'Be smarter', targetValue: 30, startDate: '2026-10-01', endDate: '2026-10-31' });
    await page.getByRole('link', { name: 'Read', exact: true }).click();
    await expect(headline(page)).toHaveText(`${MINUS}100.0% vs. ideal`);
    await expect(headline(page)).toHaveAttribute('data-sign', 'negative');
    await expect(page.getByTestId('headline-day')).toHaveText('Day 9 of 31');
    await expect(sub(page)).toHaveText(EN.empty.detail.curve);
    await expect(sub(page)).toHaveAttribute('data-variant', 'empty');
    await expect(page.getByTestId('curve-summary')).toHaveText('Day 9 of 31: nothing logged yet. The ideal line is at 281 min.');
    await expect(chart(page).locator('.recharts-line')).toHaveCount(2);
    await expect(chart(page).locator('.recharts-reference-line.zero-line')).toHaveCount(0);
    await expect(chart(page).locator('.recharts-reference-dot')).toHaveCount(2);
    await expect(chart(page).locator('.curve-dot')).toHaveCount(0);
    await expect(chart(page)).toContainText('Ideal 281 min');
    await expect(chart(page)).toContainText('You 0 min');
    await expect(page.getByRole('heading', { level: 3, name: EN.empty.detail.history })).toBeVisible();
    await page.getByText(EN.goal.detail.showTable).click();
    await expect(tableRows(page).nth(0).locator('td')).toHaveText(['30', '0', '0', `${MINUS}30`]);
    await expect(tableRows(page).nth(8).locator('td')).toHaveText(['281', '0', '0', `${MINUS}281`]);
    await expect(tableRows(page).nth(9).locator('td')).toHaveText(['314', '—', '—', '—']);
    await expectAxeClean(page);

    // (2) one logged day: the ordinary "Last logged" sentence (no separate starting-point variant), no ×.
    await freezeClock(page, CLOCK_R1);
    await importBackup(page, 'r1-first-day-backup.json');
    await gotoHash(page, '/goals/r1');
    await expect(headline(page)).toHaveText(`${MINUS}95.9% vs. ideal`);
    await expect(page.getByTestId('headline-day')).toHaveText('Day 4 of 83');
    await expect(sub(page)).toHaveText(`Last logged Oct 10: 5 min. Total 5 min, ideal 122 min (${MINUS}117 min).`);
    await expect(sub(page)).toHaveAttribute('data-variant', 'earlier');
    await expect(sub(page)).not.toContainText('×');
    await expect(page.getByTestId('curve-summary')).toHaveText('Day 4 of 83: you have logged 5 min in total. The ideal line is at 122 min.');
    await expect(chart(page).locator('.recharts-line')).toHaveCount(2);
    await expect(chart(page).locator('.curve-dot')).toHaveCount(1);
    await expect(chart(page)).toContainText('You 5 min');
    await expect(chart(page)).toContainText('Ideal 122 min');

    // (3) going down (R3): fewer minutes than the day before still adds up, the gap to the ideal grows.
    await freezeClock(page, CLOCK_R3);
    await importBackup(page, 'r3-down-backup.json');
    await gotoHash(page, '/goals/r1');
    await expect(headline(page)).toHaveText(`${MINUS}86.7% vs. ideal`);
    await expect(headline(page)).toHaveAttribute('data-sign', 'negative');
    await expect(headline(page)).toHaveCSS('color', await page.evaluate(() => getComputedStyle(document.body).getPropertyValue('color').trim()));
    await expect(sub(page)).toHaveText(`Today: 3 min. Total 8 min, ideal 60 min (${MINUS}52 min).`);
    await expect(sub(page)).toHaveAttribute('data-variant', 'today');
    await expect(chart(page)).toContainText('You 8 min');
    await expect(chart(page)).toContainText('Ideal 60 min');
    const ticksR3 = await yTicks(page);
    expect(ticksR3.some((t) => t.startsWith(MINUS) || t.startsWith('-'))).toBe(false);
    expectPlainTicks(ticksR3);
    await chart(page).focus();
    await page.keyboard.press('ArrowRight');
    await expect(page.getByTestId('curve-reading')).toHaveText('Oct 11 · 3 min this day · Total 8 min · Ideal 60 min');
    await expectAxeClean(page);

    // (4) upcoming and (5) ended from S1.
    await freezeClock(page);
    await importBackup(page);
    await gotoHash(page, '/goals/g4');
    await expect(headline(page)).toHaveText('+0.0% ahead of ideal');
    await expect(headline(page)).toHaveAttribute('data-sign', 'positive');
    await expect(sub(page)).toHaveText('Starts 2026-11-01. Your line will appear once the goal begins.');
    await expect(sub(page)).toHaveAttribute('data-variant', 'upcoming');
    await expect(page.getByTestId('headline-day')).toHaveCount(0);
    await expect(page.getByRole('radio', { name: EN.goal.detail.rangeWhole })).toHaveCount(0);
    await expect(chart(page).locator('.recharts-line')).toHaveCount(1);
    await expect(chart(page).locator('.recharts-reference-dot')).toHaveCount(0);
    await expect(chart(page)).not.toContainText('You ');
    await gotoHash(page, '/goals/g5');
    await expect(headline(page)).toHaveText(`${MINUS}99.8% vs. ideal`);
    await expect(page.getByTestId('headline-day')).toHaveText('Day 181 of 181');
    await expect(sub(page)).toHaveText(`Last logged Jun 30: 15 min. Total 15 min, ideal 7,584 min (${MINUS}7,569 min).`);
    await expect(sub(page)).toHaveAttribute('data-variant', 'earlier');
    await expect(page.getByTestId('curve-summary')).toHaveText('Day 181 of 181: you have logged 15 min in total. The ideal line is at 7,584 min.');
    await expect(chart(page).locator('.recharts-line')).toHaveCount(2);
    await chart(page).focus();
    await page.keyboard.press('ArrowRight');
    await expect(page.getByTestId('curve-reading')).toHaveText('Jun 30 · 15 min this day · Total 15 min · Ideal 7,584 min');
    expect(problems).toEqual([]);
  });

  test('M9-AC6 (6): R1 on 2026-10-14 without a new entry → −63.4% (the total keeps 56 min while the ideal grows to 153); logging 3 minutes on Today turns it into −61.4% at once (A-39)', async ({ page }) => {
    await freezeClock(page, at('2026-10-14T10:00:00'));
    await importBackup(page, 'r1-real-backup.json');
    await gotoHash(page, '/goals/r1');
    await expect(headline(page)).toHaveText(`${MINUS}63.4% vs. ideal`);
    await expect(page.getByTestId('headline-day')).toHaveText('Day 5 of 83');
    await expect(sub(page)).toHaveText(`Last logged Oct 13: 27 min. Total 56 min, ideal 153 min (${MINUS}97 min).`);
    await expect(sub(page)).toHaveAttribute('data-variant', 'earlier');
    await expect(page.getByTestId('curve-summary')).toHaveText('Day 5 of 83: you have logged 56 min in total. The ideal line is at 153 min.');
    await expect(chart(page)).toContainText('You 56 min');
    await expect(chart(page)).toContainText('Ideal 153 min');
    await page.getByRole('radio', { name: EN.goal.detail.rangeSoFar }).check();
    await page.getByText(EN.goal.detail.showTable).click();
    await expect(tableRows(page)).toHaveCount(5);
    await expect(tableRows(page).nth(4).locator('td')).toHaveText(['153', '56', '0', `${MINUS}97`]);
    await chart(page).focus();
    await page.keyboard.press('ArrowRight');
    await expect(page.getByTestId('curve-reading')).toHaveText('Oct 14 · Nothing logged · Total 56 min · Ideal 153 min');

    await gotoHash(page, '/today');
    await logTime(page, 'Đọc sách', 3);
    await expectAmount(page, 'Đọc sách', '3/30');
    await gotoHash(page, '/goals/r1');
    await expect(headline(page)).toHaveText(`${MINUS}61.4% vs. ideal`);
    await expect(headline(page)).toContainText('61.4');
    await expect(sub(page)).toHaveText(`Today: 3 min. Total 59 min, ideal 153 min (${MINUS}94 min).`);
    await expect(sub(page)).toHaveAttribute('data-variant', 'today');
    await expect(page.getByTestId('curve-summary')).toHaveText('Day 5 of 83: you have logged 59 min in total. The ideal line is at 153 min.');
    await expect(chart(page)).toContainText('You 59 min');
    const ticks = await yTicks(page);
    expect(ticks.some((t) => t.startsWith(MINUS) || t.startsWith('-'))).toBe(false);
    expectPlainTicks(ticks);
  });
});

test.describe('M9-AC3 — extreme values at 360 px', () => {
  test.use({ viewport: { width: 360, height: 740 } });

  test('en: R4 → "+2,289.7% ahead of ideal", plain Y labels in minutes (≤ 6 characters), no horizontal scroll', async ({ page }) => {
    await freezeClock(page, CLOCK_R3);
    await importBackup(page, 'r4-extreme-backup.json');
    await gotoHash(page, '/goals/r1');
    await expect(headline(page)).toHaveText('+2,289.7% ahead of ideal');
    await expect(headline(page)).toHaveAttribute('data-sign', 'positive');
    await expect(sub(page)).toHaveText('Today: 1,440 min. Total 1,441 min, ideal 60 min (+1,381 min).');
    await expect(sub(page)).not.toContainText('×');
    await expect(page.getByTestId('curve-summary')).toHaveText('Day 2 of 83: you have logged 1,441 min in total. The ideal line is at 60 min.');
    await expect(chart(page).locator('.recharts-line')).toHaveCount(2);
    await expect(chart(page)).toContainText('You 1,441 min');
    await expect(chart(page)).toContainText('Ideal 60 min');
    const ticks = await yTicks(page);
    expectPlainTicks(ticks);
    for (const t of ticks) expect(t.length, ticks.join(' ')).toBeLessThanOrEqual(6);
    expect(ticks).toContain('1,000');
    expect(ticks.some((t) => t.includes('%'))).toBe(false);
    await expectNoHorizontalScroll(page);
    await page.getByText(EN.goal.detail.showTable).click();
    await expect(tableRows(page).nth(0).locator('td')).toHaveText(['30', '1', '1', `${MINUS}29`]);
    await expect(tableRows(page).nth(1).locator('td')).toHaveText(['60', '1,441', '1,440', '+1,381']);
    await expect(page.getByTestId('curve-table')).not.toContainText('%');
    await expectNoHorizontalScroll(page);
    await expectAxeClean(page);
  });

  test.describe('vi', () => {
    test.use({ locale: 'vi-VN' });

    test('vi: R4 → "Vượt lý tưởng +2.289,7%", plain Y labels, no horizontal scroll', async ({ page }) => {
      await freezeClock(page, CLOCK_R3);
      await importBackup(page, 'r4-extreme-backup.json', VI);
      await gotoHash(page, '/goals/r1');
      await expect(headline(page)).toHaveText('Vượt lý tưởng +2.289,7%');
      await expect(sub(page)).toContainText('1.441 phút');
      await expect(sub(page)).toContainText('+1.381 phút');
      await expect(sub(page)).not.toContainText('×');
      await expect(chart(page)).toContainText('Bạn 1.441 phút');
      const ticks = await yTicks(page);
      expectPlainTicks(ticks);
      for (const t of ticks) expect(t.length, ticks.join(' ')).toBeLessThanOrEqual(6);
      await expectNoHorizontalScroll(page);
      await expectNoViLeaks(page);
      await expectAxeClean(page);
    });
  });
});

test.describe('M9-AC5 — Vietnamese Goal detail at 360 px', () => {
  test.use({ locale: 'vi-VN', viewport: { width: 360, height: 740 } });

  test('vi: R1 (−54,0%, 56 / 122 phút, −66 phút), R3 (−86,7%), G2 (322 / 210 / 10 / −112 row), G1 without entries (−100,0%), G4 upcoming → no leaks, axe clean, no horizontal scroll', async ({ page }) => {
    const external = trackExternal(page);
    const oct = (day: number) => new Intl.DateTimeFormat('vi-VN', { month: 'short', day: 'numeric' }).format(new Date(2026, 9, day));
    // G1 without entries: created through the UI before any import.
    await freezeClock(page);
    await createGoal(page, { name: 'Read', why: 'Be smarter', targetValue: 30, startDate: '2026-10-01', endDate: '2026-10-31' }, VI);
    await page.getByRole('link', { name: 'Read', exact: true }).click();
    await expect(headline(page)).toHaveText(`${MINUS}100,0% so với lý tưởng`);
    await expect(sub(page)).toHaveText(VI.empty.detail.curve);
    await expect(page.getByTestId('curve-summary')).toHaveText('Ngày 9/31: chưa ghi gì. Đường lý tưởng ở mức 281 phút.');
    await expect(chart(page).locator('.recharts-line')).toHaveCount(2);
    await expect(chart(page)).toContainText('Bạn 0 phút');
    await expectNoViLeaks(page);
    await expectNoHorizontalScroll(page);
    await expectAxeClean(page);

    // R1.
    await freezeClock(page, CLOCK_R1);
    await importBackup(page, 'r1-real-backup.json', VI);
    await gotoHash(page, '/goals/r1');
    await expect(headline(page)).toHaveText(`${MINUS}54,0% so với lý tưởng`);
    await expect(page.getByTestId('headline-day')).toHaveText('Ngày 4/83');
    await expect(sub(page)).toHaveText(`Hôm nay: 27 phút. Tổng 56 phút, lý tưởng 122 phút (${MINUS}66 phút).`);
    for (const part of ['27 phút', '56 phút', '122 phút', `${MINUS}66 phút`]) await expect(sub(page)).toContainText(part);
    await expect(sub(page)).not.toContainText('×');
    await expect(page.getByTestId('curve-summary')).toHaveText('Ngày 4/83: bạn đã ghi tổng cộng 56 phút. Đường lý tưởng ở mức 122 phút.');
    await expect(page.getByTestId('curve-legend').getByRole('listitem')).toHaveText([VI.goal.detail.legendIdeal, VI.goal.detail.legendYou]);
    await expect(page.getByTestId('curve-note')).toHaveText(VI.goal.detail.chartNote);
    await expect(chart(page)).toContainText('Lý tưởng 122 phút');
    await expect(chart(page)).toContainText('Bạn 56 phút');
    await expect(chart(page)).not.toContainText('%');
    const ticks = await yTicks(page);
    expect(ticks).toContain('1.000');
    expectPlainTicks(ticks);
    await chart(page).focus();
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('ArrowLeft');
    await expect(page.getByTestId('curve-reading')).toHaveText(`${oct(12)} · Ngày này 14 phút · Tổng 29 phút · Lý tưởng 91 phút`);
    // Clear the (multi-line at 360 px) reading before clicking below the chart: blurring the chart on
    // mousedown collapses that line and would move the summary away from the pointer before mouseup.
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('curve-reading')).toHaveText('');
    await page.getByText(VI.goal.detail.showTable).click();
    await expect(page.getByTestId('curve-table').locator('thead th')).toHaveText([VI.goal.detail.tableDate, VI.goal.detail.tableIdeal, VI.goal.detail.tableYou, VI.goal.detail.tableMinutes, VI.goal.detail.tableChange]);
    await expect(tableRows(page).nth(3)).toContainText('13/10/2026');
    await expect(tableRows(page).nth(3).locator('td')).toHaveText(['122', '56', '27', `${MINUS}66`]);
    await expect(tableRows(page).nth(2).locator('td')).toHaveText(['91', '29', '14', `${MINUS}62`]);
    await expect(tableRows(page).nth(82).locator('td')).toHaveText(['3.852', '—', '—', '—']);
    await expect(page.getByTestId('curve-table')).not.toContainText('%');
    await expect(page.getByTestId('stat-progress')).toContainText('1,5%');
    await expect(page.getByTestId('stat-progress')).toContainText('56/3.852 phút');
    await expectNoViLeaks(page);
    await expectNoHorizontalScroll(page);
    await expectAxeClean(page);

    // R3: negative headline variant.
    await freezeClock(page, CLOCK_R3);
    await importBackup(page, 'r3-down-backup.json', VI);
    await gotoHash(page, '/goals/r1');
    await expect(headline(page)).toHaveText(`${MINUS}86,7% so với lý tưởng`);
    await expect(headline(page)).toContainText('86,7');
    await expect(sub(page)).toHaveText(`Hôm nay: 3 phút. Tổng 8 phút, lý tưởng 60 phút (${MINUS}52 phút).`);
    await expect(sub(page)).toContainText('8 phút');
    await expect(sub(page)).toContainText(`${MINUS}52 phút`);
    await expect(chart(page)).toContainText('Bạn 8 phút');
    await expect(chart(page)).toContainText('Lý tưởng 60 phút');
    const ticksR3 = await yTicks(page);
    expect(ticksR3.some((t) => t.startsWith(MINUS) || t.startsWith('-'))).toBe(false);
    expectPlainTicks(ticksR3);
    await chart(page).focus();
    await page.keyboard.press('ArrowRight');
    await expect(page.getByTestId('curve-reading')).toHaveText(`${oct(11)} · Ngày này 3 phút · Tổng 8 phút · Lý tưởng 60 phút`);
    await page.keyboard.press('Escape');
    await expectNoViLeaks(page);
    await expectNoHorizontalScroll(page);
    await expectAxeClean(page);

    // S1: G2 (−112 phút on 15/09) and G4 (upcoming).
    await freezeClock(page);
    await importBackup(page, 'sample-backup.json', VI);
    await gotoHash(page, '/goals/g2');
    await expect(headline(page)).toHaveText(`${MINUS}73,6% so với lý tưởng`);
    await expect(page.getByRole('radio', { name: VI.goal.detail.rangeSoFar })).toBeChecked();
    await expect(chart(page)).toContainText('Bạn 250 phút');
    await page.getByText(VI.goal.detail.showTable).click();
    const row = tableRows(page).nth(14);
    await expect(row).toContainText('15/09/2026');
    await expect(row).toContainText(`${MINUS}112`);
    await expect(row.locator('td')).toHaveText(['322', '210', '10', `${MINUS}112`]);
    await expectNoViLeaks(page);
    await expectNoHorizontalScroll(page);
    await expectAxeClean(page);
    await gotoHash(page, '/goals/g4');
    await expect(headline(page)).toHaveText('Vượt lý tưởng +0,0%');
    await expect(sub(page)).toHaveText('Bắt đầu 01/11/2026. Đường của bạn sẽ xuất hiện khi mục tiêu bắt đầu.');
    await expect(chart(page).locator('.recharts-line')).toHaveCount(1);
    await expect(chart(page).locator('.recharts-reference-dot')).toHaveCount(0);
    await expectNoViLeaks(page);
    await expectNoHorizontalScroll(page);
    await expectAxeClean(page);
    expect(external).toEqual([]);
  });
});
