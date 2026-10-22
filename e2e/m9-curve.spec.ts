// M9 — the 1% curve v3 (FR-27 v3.0, ARCH §4.5, DESIGN S4 v3): "You" = minutes of the last logged
// day vs the first logged day, compounded day over day; flat on days without time; can go down.
// Datasets: R1 (the user's real data: 5 → 10 → 14 → 27 min), R3 (5 → 3), R4 (1 → 1440), S1 (M5).
import { expect, test, type Page } from '@playwright/test';
import { at, createGoal, EN, expectAmount, expectAxeClean, expectNoHorizontalScroll, expectNoViLeaks, freezeClock, gotoHash, importBackup, logTime, VI } from './helpers/app';
import { BASE_URL } from '../playwright.config';

const MINUS = '−';
const CLOCK_R1 = at('2026-10-13T10:00:00');
const CLOCK_R3 = at('2026-10-11T10:00:00');

const headline = (page: Page) => page.getByTestId('headline');
const sub = (page: Page) => page.getByTestId('headline-sub');
const chart = (page: Page) => page.getByTestId('curve-chart');
/** Y-axis tick labels (waits for the lazy chart to have drawn its axis). */
async function yTicks(page: Page): Promise<string[]> {
  const ticks = chart(page).locator('.recharts-yAxis-tick-labels .recharts-cartesian-axis-tick-value');
  await expect(ticks.first()).toBeAttached();
  return ticks.allTextContents();
}
const tableRows = (page: Page) => page.getByTestId('curve-table').locator('tbody tr');

function trackExternal(page: Page): string[] {
  const external: string[] = [];
  page.on('request', (req) => {
    if (!req.url().startsWith(BASE_URL)) external.push(req.url());
  });
  return external;
}

test.describe('M9 Goal detail — curve v3 (en)', () => {
  test('M9-AC4 / M9-AC3 / M9-AC8: R1 at 2026-10-13 → +440.0% better, subtitle, summary, 2 series, Y axis to +500%, 0 % line, tooltip Oct 12, table, Range, Progress 2.2 %, streak 0; axe; no external requests', async ({ page }) => {
    const external = trackExternal(page);
    await freezeClock(page, CLOCK_R1);
    await importBackup(page, 'r1-real-backup.json');
    await gotoHash(page, '/goals/r1');
    await expect(page.getByRole('heading', { level: 1, name: 'Đọc sách' })).toBeVisible();
    await expect(page.locator('.gd-head')).toContainText('2026-10-10 – 2026-12-31');
    await expect(page.locator('.gd-head')).toContainText('30 min/day');

    await expect(headline(page)).toHaveText('+440.0% better');
    await expect(headline(page)).toHaveAttribute('data-sign', 'positive');
    await expect(page.getByTestId('headline-day')).toHaveText('Day 4 of 83');
    await expect(sub(page)).toHaveText('Today: 27 min, +92.9% vs Oct 12 (14 min). ×5.4 since Oct 10 (5 min).');
    for (const part of ['27', '14', '+92.9%', '×5.4', '5']) await expect(sub(page)).toContainText(part);
    await expect(page.getByTestId('curve-summary')).toHaveText('Day 4 of 83: your line is +440.0% compared with your first logged day. The ideal line is +3.0%.');
    await expect(page.getByTestId('curve-note')).toHaveText(EN.goal.detail.chartNote);
    await expect(page.getByTestId('curve-legend').getByRole('listitem')).toHaveText([EN.goal.detail.legendIdeal, EN.goal.detail.legendYou, EN.goal.detail.legendZero]);
    await expect(page.getByRole('radio', { name: EN.goal.detail.rangeWhole })).toBeChecked();

    // Chart: two series, stepped You with 4 dots, dashed Ideal, 0 % line, signed labels, ticks up to +500%.
    await expect(chart(page).locator('.recharts-line')).toHaveCount(2);
    await expect(chart(page).locator('.recharts-line-curve[stroke-dasharray]')).toHaveCount(1);
    await expect(chart(page).locator('.recharts-reference-line.zero-line')).toHaveCount(1);
    await expect(chart(page).locator('.recharts-reference-dot')).toHaveCount(2);
    await expect(chart(page).locator('.curve-dot')).toHaveCount(4);
    await expect(chart(page)).toContainText('Ideal +3.0%');
    await expect(chart(page)).toContainText('You +440.0%');
    const ticks = await yTicks(page);
    expect(ticks).toContain('0%');
    expect(ticks).toContain('+500%');
    expect(Math.max(...ticks.map((t) => Number(t.replace(/[+%,]/g, ''))))).toBeGreaterThanOrEqual(440);
    expect(ticks.every((t) => t === '0%' || t.startsWith('+'))).toBe(true);
    // The You line is drawn as steps: its path only has horizontal and vertical segments.
    const youPath = await chart(page).locator('.recharts-line-curve:not([stroke-dasharray])').getAttribute('d');
    expect(youPath).toMatch(/^M/);
    const points = [...youPath!.matchAll(/(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/g)].map((m) => [Number(m[1]), Number(m[2])]);
    for (let i = 1; i < points.length; i++) expect(Math.abs(points[i][0] - points[i - 1][0]) < 0.01 || Math.abs(points[i][1] - points[i - 1][1]) < 0.01).toBe(true);

    // Keyboard reading / tooltip text at Oct 12: 14 min, +40.0% vs the previous logged day, +180.0% since the first.
    await chart(page).focus();
    await page.keyboard.press('ArrowRight');
    await expect(page.getByTestId('curve-reading')).toHaveText('Oct 13 · 27 min, +92.9% vs previous logged day · You +440.0% since your first day · Ideal +3.0%');
    await page.keyboard.press('ArrowLeft');
    await expect(page.getByTestId('curve-reading')).toHaveText('Oct 12 · 14 min, +40.0% vs previous logged day · You +180.0% since your first day · Ideal +2.0%');
    await page.keyboard.press('Home');
    await expect(page.getByTestId('curve-reading')).toHaveText('Oct 10 · 5 min, your first logged day · You +0.0% · Ideal +0.0%');
    await page.keyboard.press('End');
    await expect(page.getByTestId('curve-reading')).toHaveText('Dec 31 · Ideal +126.1%');
    await chart(page).hover({ position: { x: 80, y: 120 } });
    await expect(page.locator('.chart-tip')).toContainText(/Ideal \+\d+\.\d%/);

    // Table: Whole period 83 rows (10-13 = 27 / +440.0% / +4.1% / +92.9%), So far 4 rows.
    await page.getByText(EN.goal.detail.showTable).click();
    await expect(page.getByTestId('curve-table').locator('thead th')).toHaveText([EN.goal.detail.tableDate, EN.goal.detail.tableIdeal, EN.goal.detail.tableYou, EN.goal.detail.tableMinutes, EN.goal.detail.tableChange]);
    await expect(tableRows(page)).toHaveCount(83);
    const row13 = tableRows(page).nth(3);
    await expect(row13).toContainText('2026-10-13');
    await expect(row13.locator('td')).toHaveText(['+3.0%', '+440.0%', '27', '+92.9%']);
    await expect(tableRows(page).nth(2).locator('td')).toHaveText(['+2.0%', '+180.0%', '14', '+40.0%']);
    await expect(tableRows(page).nth(4).locator('td')).toHaveText(['+4.1%', '—', '—', '—']);
    await page.getByRole('radio', { name: EN.goal.detail.rangeSoFar }).check();
    await expect(tableRows(page)).toHaveCount(4);

    // Stat cards still follow the daily target (A-42): 56 of 2490 min, streak 0.
    await expect(page.getByTestId('stat-progress')).toContainText('2.2%');
    await expect(page.getByTestId('stat-progress')).toContainText('56 of 2,490 min');
    await expect(page.getByTestId('stat-current')).toContainText('0 days');
    await expect(page.getByTestId('history-row')).toHaveCount(4);
    await expectAxeClean(page);
    expect(external).toEqual([]);
  });

  test('M9-AC4: S1 at 2026-10-09 → Read +0.0% better with the M5 stats; Guitar defaults to "So far" with −50.0% on 2026-09-15 and a negative Y tick', async ({ page }) => {
    await freezeClock(page);
    await importBackup(page);
    await gotoHash(page, '/goals/g1');
    await expect(headline(page)).toHaveText('+0.0% better');
    await expect(page.getByTestId('headline-day')).toHaveText('Day 9 of 31');
    await expect(sub(page)).toHaveText('Last logged Oct 8: 30 min, +0.0% vs Oct 7 (30 min). ×1 since Oct 1 (30 min).');
    await expect(page.getByTestId('stat-progress')).toContainText('25.8%');
    await expect(page.getByTestId('stat-pace')).toContainText('30 min behind');
    await expect(page.getByTestId('stat-current')).toContainText('8 days');
    await expect(page.getByTestId('stat-longest')).toContainText('8 days');
    await expect(page.getByTestId('history-row')).toHaveCount(8);
    await expect(chart(page).locator('.recharts-line')).toHaveCount(2);

    await gotoHash(page, '/goals/g2');
    await expect(headline(page)).toHaveText('+0.0% better');
    await expect(page.getByRole('radio', { name: EN.goal.detail.rangeSoFar })).toBeChecked();
    await expect(chart(page)).toContainText('You +0.0%');
    expect((await yTicks(page)).some((t) => /^[-−]/.test(t))).toBe(true);
    await page.getByText(EN.goal.detail.showTable).click();
    await expect(tableRows(page)).toHaveCount(39);
    const row = tableRows(page).nth(14);
    await expect(row).toContainText('2026-09-15');
    await expect(row).toContainText(/[-−]50\.0%/);
    await expect(row.locator('td')).toHaveText(['+14.9%', `${MINUS}50.0%`, '10', `${MINUS}50.0%`]);
    await expectAxeClean(page);
  });

  test('M9-AC6: no entries → +0.0% and empty.detail.curve with the Ideal line only; one logged day → "Starting point"; R3 → −40.0% with a negative tick; upcoming → Ideal only; ended → You stops at 2026-06-30', async ({ page }) => {
    const problems: string[] = [];
    page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`));
    page.on('console', (m) => {
      if (m.type() === 'error') problems.push(`console: ${m.text()}`);
    });
    // (1) a goal with no entries at all.
    await freezeClock(page);
    await createGoal(page, { name: 'Read', why: 'Be smarter', targetValue: 30, startDate: '2026-10-01', endDate: '2026-10-31' });
    await page.getByRole('link', { name: 'Read', exact: true }).click();
    await expect(headline(page)).toHaveText('+0.0% better');
    await expect(page.getByTestId('headline-day')).toHaveText('Day 9 of 31');
    await expect(sub(page)).toHaveText(EN.empty.detail.curve);
    await expect(sub(page)).toHaveAttribute('data-variant', 'empty');
    await expect(page.getByTestId('curve-summary')).toHaveText('Day 9 of 31: nothing logged yet. The ideal line is +8.3%.');
    await expect(chart(page).locator('.recharts-line')).toHaveCount(1);
    await expect(chart(page).locator('.recharts-reference-line.zero-line')).toHaveCount(1);
    await expect(chart(page).locator('.recharts-reference-dot')).toHaveCount(1);
    await expect(chart(page)).not.toContainText('You ');
    await expect(page.getByRole('heading', { level: 3, name: EN.empty.detail.history })).toBeVisible();
    await page.getByText(EN.goal.detail.showTable).click();
    await expect(tableRows(page).nth(8).locator('td')).toHaveText(['+8.3%', '—', '—', '—']);
    await expectAxeClean(page);

    // (2) one logged day: the starting point sentence, no ×.
    await freezeClock(page, CLOCK_R1);
    await importBackup(page, 'r1-first-day-backup.json');
    await gotoHash(page, '/goals/r1');
    await expect(headline(page)).toHaveText('+0.0% better');
    await expect(sub(page)).toHaveText('Starting point: 5 min on Oct 10. Your line moves once you log on another day.');
    await expect(sub(page)).toContainText('5');
    await expect(sub(page)).not.toContainText('×');
    await expect(chart(page).locator('.recharts-line')).toHaveCount(2);
    await expect(chart(page)).toContainText('You +0.0%');

    // (3) going down (R3).
    await freezeClock(page, CLOCK_R3);
    await importBackup(page, 'r3-down-backup.json');
    await gotoHash(page, '/goals/r1');
    await expect(headline(page)).toHaveText(`${MINUS}40.0% vs your first day`);
    await expect(headline(page)).toHaveAttribute('data-sign', 'negative');
    await expect(headline(page)).toHaveCSS('color', await page.evaluate(() => getComputedStyle(document.body).getPropertyValue('color').trim()));
    await expect(sub(page)).toHaveText(`Today: 3 min, ${MINUS}40.0% vs Oct 10 (5 min). ×0.6 since Oct 10 (5 min).`);
    await expect(chart(page)).toContainText(`You ${MINUS}40.0%`);
    expect((await yTicks(page)).some((t) => t.startsWith(MINUS))).toBe(true);
    await expectAxeClean(page);

    // (4) upcoming and (5) ended from S1.
    await freezeClock(page);
    await importBackup(page);
    await gotoHash(page, '/goals/g4');
    await expect(headline(page)).toHaveText('+0.0% better');
    await expect(sub(page)).toHaveText('Starts 2026-11-01. Your line will appear once the goal begins.');
    await expect(page.getByTestId('headline-day')).toHaveCount(0);
    await expect(page.getByRole('radio', { name: EN.goal.detail.rangeWhole })).toHaveCount(0);
    await expect(chart(page).locator('.recharts-line')).toHaveCount(1);
    await expect(chart(page).locator('.recharts-reference-dot')).toHaveCount(0);
    await gotoHash(page, '/goals/g5');
    await expect(headline(page)).toHaveText('+0.0% better');
    await expect(page.getByTestId('headline-day')).toHaveText('Day 181 of 181');
    await expect(sub(page)).toHaveText('Starting point: 15 min on Jun 30. Your line moves once you log on another day.');
    await expect(chart(page).locator('.recharts-line')).toHaveCount(2);
    await chart(page).focus();
    await page.keyboard.press('ArrowRight');
    await expect(page.getByTestId('curve-reading')).toHaveText('Jun 30 · 15 min, your first logged day · You +0.0% · Ideal +499.6%');
    expect(problems).toEqual([]);
  });

  test('M9-AC6 (6): R1 on 2026-10-14 without a new entry keeps +440.0% (flat day); logging 3 minutes on Today turns it into −40.0% at once (A-39)', async ({ page }) => {
    await freezeClock(page, at('2026-10-14T10:00:00'));
    await importBackup(page, 'r1-real-backup.json');
    await gotoHash(page, '/goals/r1');
    await expect(headline(page)).toHaveText('+440.0% better');
    await expect(page.getByTestId('headline-day')).toHaveText('Day 5 of 83');
    await expect(sub(page)).toHaveText('Last logged Oct 13: 27 min, +92.9% vs Oct 12 (14 min). ×5.4 since Oct 10 (5 min).');
    await page.getByRole('radio', { name: EN.goal.detail.rangeSoFar }).check();
    await page.getByText(EN.goal.detail.showTable).click();
    await expect(tableRows(page)).toHaveCount(5);
    await expect(tableRows(page).nth(4).locator('td')).toHaveText(['+4.1%', '+440.0%', '0', '—']);
    await chart(page).focus();
    await page.keyboard.press('ArrowRight');
    await expect(page.getByTestId('curve-reading')).toHaveText('Oct 14 · Nothing logged, the line stays flat · You +440.0% · Ideal +4.1%');

    await gotoHash(page, '/today');
    await logTime(page, 'Đọc sách', 3);
    await expectAmount(page, 'Đọc sách', '3/30');
    await gotoHash(page, '/goals/r1');
    await expect(headline(page)).toHaveText(`${MINUS}40.0% vs your first day`);
    await expect(headline(page)).toContainText('40.0');
    await expect(sub(page)).toHaveText(`Today: 3 min, ${MINUS}88.9% vs Oct 13 (27 min). ×0.6 since Oct 10 (5 min).`);
    await expect(chart(page)).toContainText(`You ${MINUS}40.0%`);
    expect((await yTicks(page)).some((t) => t.startsWith(MINUS))).toBe(true);
  });
});

test.describe('M9-AC3 — extreme values at 360 px', () => {
  test.use({ viewport: { width: 360, height: 740 } });

  test('en: R4 → "+143,900.0% better", compact Y labels (≤ 8 characters), no horizontal scroll', async ({ page }) => {
    await freezeClock(page, CLOCK_R3);
    await importBackup(page, 'r4-extreme-backup.json');
    await gotoHash(page, '/goals/r1');
    await expect(headline(page)).toHaveText('+143,900.0% better');
    await expect(sub(page)).toHaveText('Today: 1,440 min, +143,900.0% vs Oct 10 (1 min). ×1,440 since Oct 10 (1 min).');
    await expect(chart(page).locator('.recharts-line')).toHaveCount(2);
    const ticks = await yTicks(page);
    expect(ticks.length).toBeGreaterThanOrEqual(3);
    for (const t of ticks) expect(t.length, ticks.join(' ')).toBeLessThanOrEqual(8);
    expect(ticks.some((t) => /K%$/.test(t))).toBe(true);
    await expectNoHorizontalScroll(page);
    await page.getByText(EN.goal.detail.showTable).click();
    await expect(tableRows(page).nth(1).locator('td')).toHaveText(['+1.0%', '+143,900.0%', '1,440', '+143,900.0%']);
    await expectNoHorizontalScroll(page);
    await expectAxeClean(page);
  });

  test.describe('vi', () => {
    test.use({ locale: 'vi-VN' });

    test('vi: R4 → "Tốt hơn +143.900,0%", compact Y labels, no horizontal scroll', async ({ page }) => {
      await freezeClock(page, CLOCK_R3);
      await importBackup(page, 'r4-extreme-backup.json', VI);
      await gotoHash(page, '/goals/r1');
      await expect(headline(page)).toHaveText('Tốt hơn +143.900,0%');
      await expect(sub(page)).toContainText('×1.440');
      const ticks = await yTicks(page);
      expect(ticks.length).toBeGreaterThanOrEqual(3);
      for (const t of ticks) expect(t.length, ticks.join(' ')).toBeLessThanOrEqual(8);
      await expectNoHorizontalScroll(page);
      await expectNoViLeaks(page);
      await expectAxeClean(page);
    });
  });
});

test.describe('M9-AC5 — Vietnamese Goal detail at 360 px', () => {
  test.use({ locale: 'vi-VN', viewport: { width: 360, height: 740 } });

  test('vi: R1 (+440,0%, ×5,4, +92,9%), R3 (−40,0%), G2 (−50,0% row), G1 without entries, G4 upcoming → no leaks, axe clean, no horizontal scroll', async ({ page }) => {
    const external = trackExternal(page);
    const oct = (day: number) => new Intl.DateTimeFormat('vi-VN', { month: 'short', day: 'numeric' }).format(new Date(2026, 9, day));
    // G1 without entries: created through the UI before any import.
    await freezeClock(page);
    await createGoal(page, { name: 'Read', why: 'Be smarter', targetValue: 30, startDate: '2026-10-01', endDate: '2026-10-31' }, VI);
    await page.getByRole('link', { name: 'Read', exact: true }).click();
    await expect(headline(page)).toHaveText('Tốt hơn +0,0%');
    await expect(sub(page)).toHaveText(VI.empty.detail.curve);
    await expect(page.getByTestId('curve-summary')).toHaveText('Ngày 9/31: chưa ghi gì. Đường lý tưởng ở mức +8,3%.');
    await expect(chart(page).locator('.recharts-line')).toHaveCount(1);
    await expectNoViLeaks(page);
    await expectNoHorizontalScroll(page);
    await expectAxeClean(page);

    // R1.
    await freezeClock(page, CLOCK_R1);
    await importBackup(page, 'r1-real-backup.json', VI);
    await gotoHash(page, '/goals/r1');
    await expect(headline(page)).toHaveText('Tốt hơn +440,0%');
    await expect(page.getByTestId('headline-day')).toHaveText('Ngày 4/83');
    await expect(sub(page)).toHaveText(`Hôm nay: 27 phút, +92,9% so với ${oct(12)} (14 phút). ×5,4 kể từ ${oct(10)} (5 phút).`);
    for (const part of ['×5,4', '+92,9%', '27', '14', '5']) await expect(sub(page)).toContainText(part);
    await expect(page.getByTestId('curve-summary')).toHaveText('Ngày 4/83: đường của bạn ở mức +440,0% so với ngày có ghi đầu tiên. Đường lý tưởng ở mức +3,0%.');
    await expect(page.getByTestId('curve-legend').getByRole('listitem')).toHaveText([VI.goal.detail.legendIdeal, VI.goal.detail.legendYou, VI.goal.detail.legendZero]);
    await expect(page.getByTestId('curve-note')).toHaveText(VI.goal.detail.chartNote);
    await expect(chart(page)).toContainText('Lý tưởng +3,0%');
    await expect(chart(page)).toContainText('Bạn +440,0%');
    expect(await yTicks(page)).toContain('+500%');
    await chart(page).focus();
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('ArrowLeft');
    await expect(page.getByTestId('curve-reading')).toHaveText(`${oct(12)} · 14 phút, +40,0% so với ngày có ghi trước · Bạn +180,0% so với ngày đầu · Lý tưởng +2,0%`);
    // Clear the (multi-line at 360 px) reading before clicking below the chart: blurring the chart on
    // mousedown collapses that line and would move the summary away from the pointer before mouseup.
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('curve-reading')).toHaveText('');
    await page.getByText(VI.goal.detail.showTable).click();
    await expect(tableRows(page).nth(3).locator('td')).toHaveText(['+3,0%', '+440,0%', '27', '+92,9%']);
    await expect(tableRows(page).nth(2).locator('td')).toHaveText(['+2,0%', '+180,0%', '14', '+40,0%']);
    await expect(page.getByTestId('stat-progress')).toContainText('2,2%');
    await expectNoViLeaks(page);
    await expectNoHorizontalScroll(page);
    await expectAxeClean(page);

    // R3: negative headline variant.
    await freezeClock(page, CLOCK_R3);
    await importBackup(page, 'r3-down-backup.json', VI);
    await gotoHash(page, '/goals/r1');
    await expect(headline(page)).toHaveText(`${MINUS}40,0% so với ngày đầu`);
    await expect(headline(page)).toContainText('40,0');
    await expect(sub(page)).toContainText('×0,6');
    await expect(chart(page)).toContainText(`Bạn ${MINUS}40,0%`);
    expect((await yTicks(page)).some((t) => t.startsWith(MINUS))).toBe(true);
    await expectNoViLeaks(page);
    await expectNoHorizontalScroll(page);
    await expectAxeClean(page);

    // S1: G2 (−50,0% on 15/09) and G4 (upcoming).
    await freezeClock(page);
    await importBackup(page, 'sample-backup.json', VI);
    await gotoHash(page, '/goals/g2');
    await expect(headline(page)).toHaveText('Tốt hơn +0,0%');
    await expect(page.getByRole('radio', { name: VI.goal.detail.rangeSoFar })).toBeChecked();
    await page.getByText(VI.goal.detail.showTable).click();
    const row = tableRows(page).nth(14);
    await expect(row).toContainText('15/09/2026');
    await expect(row).toContainText(`${MINUS}50,0%`);
    await expect(row.locator('td')).toHaveText(['+14,9%', `${MINUS}50,0%`, '10', `${MINUS}50,0%`]);
    await expectNoViLeaks(page);
    await expectNoHorizontalScroll(page);
    await expectAxeClean(page);
    await gotoHash(page, '/goals/g4');
    await expect(headline(page)).toHaveText('Tốt hơn +0,0%');
    await expect(sub(page)).toHaveText('Bắt đầu 01/11/2026. Đường của bạn sẽ xuất hiện khi mục tiêu bắt đầu.');
    await expect(chart(page).locator('.recharts-line')).toHaveCount(1);
    await expectNoViLeaks(page);
    await expectNoHorizontalScroll(page);
    await expectAxeClean(page);
    expect(external).toEqual([]);
  });
});
