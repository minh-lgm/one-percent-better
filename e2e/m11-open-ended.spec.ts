// M11 — goals with no end date (FR-56, FR-57; DESIGN v4.0 S2/S3/S4/S5/S6; ARCH §4.6). Dataset O1
// (e2e/fixtures/o1-open-ended-backup.json): "Meditate", 10 min/day from 2026-10-01, no end date,
// entries 10 / 15 / 10 / 20 min on 10-01, 10-02, 10-05, 10-08. Clock §0 = 2026-10-09.
import { readFile } from 'node:fs/promises';
import { expect, test, type Page } from '@playwright/test';
import { BASE_URL } from '../playwright.config';
import { at, createGoal, EN, expectAmount, expectAxeClean, expectNoHorizontalScroll, expectNoViLeaks, freezeClock, goalCard, gotoHash, importBackup, logTime, plusOne, toast, VI } from './helpers/app';

const OPEN_ROW_EN = '10 min/day · from 2026-10-01, no end date';
const OPEN_ROW_VI = '10 phút/ngày · từ 01/10/2026, không có thời hạn';
const CLOCK_2031 = at('2031-10-02T10:00:00');

function trackExternal(page: Page): string[] {
  const external: string[] = [];
  page.on('request', (req) => {
    if (!req.url().startsWith(BASE_URL)) external.push(req.url());
  });
  return external;
}

const row = (page: Page, name: string) => page.getByTestId('goal-row').filter({ has: page.getByRole('heading', { level: 3, name }) });
const endsGroup = (page: Page, legend: string) => page.getByRole('group', { name: legend });

test.describe('M11 — No end date (en)', () => {
  test('M11-AC9: create via the form, Goals row + Active, Today 0/10, survives a reload, edit shows the radio checked, specific date and back; keyboard; axe (Minutes per day and Total hours)', async ({ page }) => {
    const external = trackExternal(page);
    await freezeClock(page);
    await gotoHash(page, '/goals/new');
    await expect(page.getByRole('heading', { level: 1, name: EN.goal.form.titleNew })).toBeVisible();

    // The Ends group: three radios, "No end date" last; keyboard moves through all three.
    const radios = endsGroup(page, EN.goal.form.endsLegend).getByRole('radio');
    await expect(radios).toHaveCount(3);
    await expect(radios.nth(2)).toHaveAccessibleName(EN.goal.form.endsNever);
    await radios.nth(0).focus();
    await page.keyboard.press('ArrowDown');
    await expect(radios.nth(1)).toBeChecked();
    await expect(page.getByLabel(new RegExp(`^${EN.goal.form.endLabel}`))).toBeVisible();
    await page.keyboard.press('ArrowDown');
    await expect(radios.nth(2)).toBeChecked();
    await expect(radios.nth(2)).toBeFocused();
    await expect(page.getByLabel(new RegExp(`^${EN.goal.form.endLabel}`))).toHaveCount(0);
    await expect(page.getByText(EN.goal.form.endsNeverHint)).toBeVisible();
    await expectAxeClean(page);

    // Total hours locks the radio (note always visible, aria-describedby) and moves Ends to "This year".
    await page.getByRole('radio', { name: EN.goal.form.targetTotal }).check();
    await expect(radios.nth(2)).toBeDisabled();
    await expect(radios.nth(2)).toHaveAccessibleDescription(EN.goal.form.endsNeverTotalNote);
    await expect(page.getByText(EN.goal.form.endsNeverTotalNote)).toBeVisible();
    await expect(page.getByRole('radio', { name: 'This year — ends 2026-12-31' })).toBeChecked();
    await expect(page.getByTestId('ends-status')).toHaveText(EN.goal.form.endsNeverSwitched);
    await expectAxeClean(page);
    await page.getByRole('radio', { name: EN.goal.form.targetDaily }).check();
    await expect(radios.nth(2)).toBeEnabled();
    await expect(radios.nth(2)).not.toBeChecked();
    await expect(page.getByTestId('ends-status')).toHaveText('');

    // The Demo flow: Meditate, 10 min/day, from 2026-10-01, no end date.
    await createGoal(page, { name: 'Meditate', targetValue: 10, startDate: '2026-10-01', endsNever: true });
    await expect(row(page, 'Meditate')).toContainText(OPEN_ROW_EN);
    await expect(row(page, 'Meditate').getByText(EN.goal.status.active)).toBeVisible();
    await expect(page.getByRole('heading', { level: 2, name: 'Active (1)' })).toBeVisible();
    await expect(row(page, 'Meditate')).not.toContainText('–');
    await expect(row(page, 'Meditate')).not.toContainText('Ended');
    await gotoHash(page, '/today');
    await expectAmount(page, 'Meditate', '0/10');
    await page.reload();
    await expectAmount(page, 'Meditate', '0/10');

    // Edit: the radio is checked; switch to a specific date (prefilled with the end of the start year).
    await gotoHash(page, '/goals');
    await row(page, 'Meditate').getByRole('link', { name: EN.common.edit, exact: true }).click();
    await expect(page.getByRole('heading', { level: 1, name: EN.goal.form.titleEdit })).toBeVisible();
    await expect(page.getByRole('radio', { name: EN.goal.form.endsNever })).toBeChecked();
    await expect(page.getByLabel(new RegExp(`^${EN.goal.form.endLabel}`))).toHaveCount(0);
    await page.getByRole('radio', { name: EN.goal.form.endsSpecific }).check();
    const end = page.getByLabel(new RegExp(`^${EN.goal.form.endLabel}`));
    await expect(end).toHaveValue('2026-12-31');
    await end.fill('2026-10-31');
    await page.getByRole('button', { name: EN.goal.form.saveChanges }).click();
    await expect(toast(page)).toHaveText(EN.toast.goalUpdated);
    await expect(row(page, 'Meditate')).toContainText('10 min/day · 2026-10-01 – 2026-10-31');
    // And back to no end date.
    await row(page, 'Meditate').getByRole('link', { name: EN.common.edit, exact: true }).click();
    await expect(page.getByRole('radio', { name: EN.goal.form.endsSpecific })).toBeChecked();
    await page.getByRole('radio', { name: EN.goal.form.endsNever }).check();
    await page.getByRole('button', { name: EN.goal.form.saveChanges }).click();
    await expect(toast(page)).toHaveText(EN.toast.goalUpdated);
    await expect(row(page, 'Meditate')).toContainText(OPEN_ROW_EN);
    expect(external).toEqual([]);
  });

  test('M11-AC10 / M11-AC5: O1 at 2026-10-09 on Goals, Goal detail (Day 9, +100.0%, no Range, 9 rows, 61.1 %), Review, Day; 2031-10-02 still Active with +1%; Export writes "endDate": null with schemaVersion 1', async ({ page }) => {
    const external = trackExternal(page);
    await freezeClock(page);
    await importBackup(page, 'o1-open-ended-backup.json');

    // Goals
    await gotoHash(page, '/goals');
    await expect(row(page, 'Meditate')).toContainText(OPEN_ROW_EN);
    await expect(row(page, 'Meditate').getByText(EN.goal.status.active)).toBeVisible();
    await expect(row(page, 'Meditate')).not.toContainText('–');
    await expect(row(page, 'Meditate')).not.toContainText('2026-12-31');
    await expect(row(page, 'Meditate')).not.toContainText('Ended');
    await expectAxeClean(page);

    // Goal detail
    await gotoHash(page, '/goals/o1');
    await expect(page.getByRole('heading', { level: 1, name: 'Meditate' })).toBeVisible();
    await expect(page.locator('.gd-head')).toContainText(OPEN_ROW_EN);
    await expect(page.locator('.gd-head')).not.toContainText('–');
    await expect(page.getByTestId('headline')).toHaveText('+100.0% better');
    await expect(page.getByTestId('headline-day')).toHaveText('Day 9');
    await expect(page.getByTestId('headline-sub')).toHaveText('Last logged Oct 8: 20 min, +100.0% vs Oct 5 (10 min). ×2 since Oct 1 (10 min).');
    await expect(page.getByTestId('curve-summary')).toHaveText('Day 9: your line is +100.0% compared with your first logged day. The ideal line is +9.4%.');
    await expect(page.getByRole('radio', { name: EN.goal.detail.rangeWhole })).toHaveCount(0);
    await expect(page.getByRole('radio', { name: EN.goal.detail.rangeSoFar })).toHaveCount(0);
    const chart = page.getByTestId('curve-chart');
    await expect(chart.locator('.recharts-line')).toHaveCount(2);
    await expect(chart.locator('.curve-dot')).toHaveCount(4);
    await expect(chart).toContainText('You +100.0%');
    await expect(chart).toContainText('Ideal +9.4%');
    await page.getByText(EN.goal.detail.showTable).click();
    const rows = page.getByTestId('curve-table').locator('tbody tr');
    await expect(rows).toHaveCount(9);
    await expect(rows.last().locator('th')).toHaveText('2026-10-09');
    await expect(rows.nth(7).locator('td')).toHaveText(['+8.3%', '+100.0%', '20', '+100.0%']);
    await expect(page.getByTestId('stat-progress')).toContainText('61.1%');
    await expect(page.getByTestId('stat-progress')).toContainText('55 of 90 min expected so far');
    await expect(page.getByTestId('stat-pace')).toContainText('35 min behind');
    await expect(page.getByTestId('stat-pace')).toContainText('Expected 90 min by today');
    await expect(page.getByTestId('stat-current')).toContainText('1 day');
    await expect(page.getByTestId('stat-longest')).toContainText('2 days');
    await expectAxeClean(page);

    // Review
    await gotoHash(page, '/review?goal=o1&year=2026');
    await expect(page.getByTestId('stat-progress')).toContainText('61.1%');
    await expect(page.getByTestId('stat-progress')).toContainText('55 of 90 min expected so far');
    await expect(page.getByTestId('stat-pace')).toContainText('35 min behind');
    await expect(page.getByTestId('stats-note')).toHaveText(EN.review.progressNoteOpen);
    const outside = page.locator('[data-date="2026-09-30"]');
    await expect(outside).toHaveAttribute('aria-disabled', 'true');
    await expect(outside).toHaveClass(/\bout\b/);
    await expect(page.locator('[data-date="2026-10-01"]')).not.toHaveAttribute('aria-disabled', 'true');
    await expect(page.locator('[data-date="2026-10-08"]')).toHaveAttribute('aria-label', /20 min/);
    await expectAxeClean(page);

    // Day: present from the start date on, absent before it.
    await gotoHash(page, '/day/2026-10-05');
    await expect(goalCard(page, 'Meditate')).toBeVisible();
    await expect(goalCard(page, 'Meditate').locator('.amount')).toContainText('10/10');
    await gotoHash(page, '/day/2026-09-30');
    await expect(page.getByRole('heading', { level: 2, name: EN.empty.day.noGoals })).toBeVisible();
    await expect(goalCard(page, 'Meditate')).toHaveCount(0);

    // Five years later: still Active, on Today, loggable, +1%.
    await freezeClock(page, CLOCK_2031);
    await gotoHash(page, '/goals');
    await page.reload();
    await expect(page.getByRole('heading', { level: 2, name: 'Active (1)' })).toBeVisible();
    await expect(row(page, 'Meditate').getByText(EN.goal.status.active)).toBeVisible();
    await expect(page.getByRole('heading', { level: 2, name: /^Ended/ })).toHaveCount(0);
    await gotoHash(page, '/today');
    await expectAmount(page, 'Meditate', '0/10');
    await logTime(page, 'Meditate', 10);
    await expectAmount(page, 'Meditate', '10/10');
    await expect(plusOne(page, 'Meditate')).toBeVisible();
    await gotoHash(page, '/goals/o1');
    await expect(page.getByTestId('headline-day')).toHaveText('Day 1,828');
    await expect(page.getByText(EN.goal.status.ended)).toHaveCount(0);

    // Export keeps schemaVersion 1 and writes the key with null (ADR-32).
    await gotoHash(page, '/settings');
    const downloadPromise = page.waitForEvent('download');
    await page.getByRole('button', { name: EN.settings.backup.export }).click();
    const download = await downloadPromise;
    const text = await readFile((await download.path())!, 'utf8');
    expect(text).toMatch(/"endDate":\s*null/);
    const file = JSON.parse(text) as { schemaVersion: number; goals: Array<{ id: string; endDate: unknown }>; entries: unknown[] };
    expect(file.schemaVersion).toBe(1);
    expect(file.goals).toHaveLength(1);
    expect(file.goals[0].endDate).toBeNull();
    expect('endDate' in file.goals[0]).toBe(true);
    expect(file.entries).toHaveLength(5);
    expect(external).toEqual([]);
  });

  test('M11-AC10: an open-ended goal that has not started shows no chart card and Progress 0 of 0', async ({ page }) => {
    await freezeClock(page);
    await createGoal(page, { name: 'Piano', targetValue: 15, startDate: '2026-11-01', endsNever: true });
    await expect(row(page, 'Piano')).toContainText('15 min/day · from 2026-11-01, no end date');
    await expect(row(page, 'Piano').getByText(EN.goal.status.upcoming)).toBeVisible();
    await expect(row(page, 'Piano')).toContainText('Starts 2026-11-01');
    await row(page, 'Piano').getByRole('link', { name: 'Piano' }).click();
    await expect(page.getByTestId('headline')).toHaveText('+0.0% better');
    await expect(page.getByTestId('headline-sub')).toHaveText('Starts 2026-11-01. Your line will appear once the goal begins.');
    await expect(page.getByTestId('headline-day')).toHaveCount(0);
    await expect(page.getByRole('heading', { level: 2, name: EN.goal.detail.chartTitle })).toHaveCount(0);
    await expect(page.getByTestId('curve-chart')).toHaveCount(0);
    await expect(page.getByTestId('stat-progress')).toContainText('0.0%');
    await expect(page.getByTestId('stat-progress')).toContainText('0 of 0 min expected so far');
    await expect(page.getByTestId('stat-pace')).toContainText(EN.stat.paceOnTrack);
    await expectAxeClean(page);
  });
});

test.describe('M11 — Không có thời hạn (vi, 360 px)', () => {
  test.use({ locale: 'vi-VN', viewport: { width: 360, height: 740 } });

  test('M11-AC11: form (both Target states, no horizontal scroll), Goals row, Goal detail +100,0% / 61,1%, Review — no English leaks, axe clean', async ({ page }) => {
    await freezeClock(page);
    await gotoHash(page, '/goals/new');
    await expect(page.getByRole('heading', { level: 1, name: VI.goal.form.titleNew })).toBeVisible();
    const never = page.getByRole('radio', { name: 'Không có thời hạn' });
    await expect(never).toBeVisible();
    await never.check();
    await expect(page.getByText(VI.goal.form.endsNeverHint)).toBeVisible();
    await expectNoViLeaks(page);
    await expectNoHorizontalScroll(page);
    await expectAxeClean(page);
    await page.getByRole('radio', { name: VI.goal.form.targetTotal }).check();
    await expect(never).toBeDisabled();
    await expect(page.getByText(VI.goal.form.endsNeverTotalNote)).toBeVisible();
    await expect(page.getByTestId('ends-status')).toHaveText(VI.goal.form.endsNeverSwitched);
    await expectNoViLeaks(page);
    await expectNoHorizontalScroll(page);
    await expectAxeClean(page);
    await page.getByRole('radio', { name: VI.goal.form.targetDaily }).check();
    await createGoal(page, { name: 'Thiền', targetValue: 10, startDate: '2026-10-01', endsNever: true }, VI);
    await expect(row(page, 'Thiền')).toContainText(OPEN_ROW_VI);
    await expect(row(page, 'Thiền').getByText(VI.goal.status.active)).toBeVisible();
    await expectNoViLeaks(page);
    await expectNoHorizontalScroll(page);
    await expectAxeClean(page);

    await importBackup(page, 'o1-open-ended-backup.json', VI);
    await gotoHash(page, '/goals');
    await expect(row(page, 'Meditate')).toContainText(OPEN_ROW_VI);
    await expectNoViLeaks(page);
    await expectNoHorizontalScroll(page);

    await gotoHash(page, '/goals/o1');
    await expect(page.getByTestId('headline')).toHaveText('Tốt hơn +100,0%');
    await expect(page.getByTestId('headline-day')).toHaveText('Ngày 9');
    await expect(page.getByTestId('curve-summary')).toHaveText('Ngày 9: đường của bạn ở mức +100,0% so với ngày có ghi đầu tiên. Đường lý tưởng ở mức +9,4%.');
    await expect(page.getByRole('radio', { name: VI.goal.detail.rangeWhole })).toHaveCount(0);
    await expect(page.getByTestId('stat-progress')).toContainText('61,1%');
    await expect(page.getByTestId('stat-progress')).toContainText('55/90 phút dự kiến đến nay');
    await expect(page.getByTestId('stat-pace')).toContainText('Chậm 35 phút');
    await expect(page.getByTestId('curve-chart').locator('.recharts-line')).toHaveCount(2);
    await expectNoViLeaks(page);
    await expectNoHorizontalScroll(page);
    await expectAxeClean(page);

    await gotoHash(page, '/review?goal=o1&year=2026');
    await expect(page.getByTestId('stat-progress')).toContainText('61,1%');
    await expect(page.getByTestId('stats-note')).toHaveText(VI.review.progressNoteOpen);
    await expect(page.getByTestId('chart-monthly')).toBeVisible();
    await expectNoViLeaks(page);
    await expectAxeClean(page);
  });
});

test.describe('M11 — desktop width', () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test('1440 px: Goal detail of O1 has no Range control, the chart head keeps only its heading, Goals row intact', async ({ page }) => {
    await freezeClock(page);
    await importBackup(page, 'o1-open-ended-backup.json');
    await gotoHash(page, '/goals/o1');
    await expect(page.getByTestId('headline')).toHaveText('+100.0% better');
    await expect(page.locator('.chart-head').getByRole('radio')).toHaveCount(0);
    await expect(page.locator('.chart-head').getByRole('heading', { level: 2, name: EN.goal.detail.chartTitle })).toBeVisible();
    await expect(page.getByTestId('curve-chart').locator('.recharts-reference-dot')).toHaveCount(2);
    await gotoHash(page, '/goals');
    await expect(row(page, 'Meditate')).toContainText(OPEN_ROW_EN);
    await expectNoHorizontalScroll(page);
  });
});
