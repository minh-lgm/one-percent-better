// QC round 1 (M5), re-targeted in M9 round 1 (FR-27 v3.0, ARCH 4.5): Goal detail and the 1% curve in a real browser, checked against an
// oracle that does not use app code. The M5 1.01^n assertions are superseded (TASKS "Test cũ bị thay thế"); S1 G1/G3/G5 now read +0.0%.
// Data always comes in through the real Import UI (TASKS section 0).
import { readFile } from 'node:fs/promises';
import { expect, test, type Page } from '@playwright/test';
import { EN, expectAxeClean, expectNoHorizontalScroll, expectNoViLeaks, fixturePath, freezeClock, gotoHash, importBackup, VI } from '../../e2e/helpers/app';

const ORIGIN = 'http://localhost:4173';

function watch(page: Page) {
  const problems: string[] = [];
  page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`));
  page.on('console', (m) => {
    if (m.type() === 'error') problems.push(`console.error: ${m.text()}`);
  });
  page.on('request', (r) => {
    const u = r.url();
    if (!u.startsWith(ORIGIN) && !u.startsWith('data:') && !u.startsWith('blob:')) problems.push(`external request: ${u}`);
  });
  return problems;
}

type Sample = { goals: Array<Record<string, unknown>>; entries: Array<Record<string, unknown>>; settings: Record<string, unknown>; [k: string]: unknown };
async function sampleFile(): Promise<Sample> {
  return JSON.parse(await readFile(fixturePath('sample-backup.json'), 'utf8'));
}
async function importContent(page: Page, content: unknown, copy: typeof EN | typeof VI = EN): Promise<void> {
  if (!page.url().includes('#/settings')) await gotoHash(page, '/settings');
  await page.getByTestId('import-file').setInputFiles({ name: 'b.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(content), 'utf8') });
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: copy.import.confirm }).click();
  await expect(dialog).toBeHidden();
}

const D = (s: string) => new Date(`${s}T00:00:00Z`);
const add = (s: string, n: number) => new Date(D(s).getTime() + n * 86_400_000).toISOString().slice(0, 10);
const pct = (n: number) => `+${(((1.01 ** n) - 1) * 100).toFixed(1)}%`; // the IDEAL line is unchanged (1.01^k)

function goalAt(id: string, p: Record<string, unknown>) {
  return { id, name: id, why: '', targetType: 'daily', targetMinutes: 30, startDate: '2026-10-01', endDate: '2026-10-31', archived: false, createdAt: '2026-09-30T01:00:00.000Z', updatedAt: '2026-09-30T01:00:00.000Z', ...p };
}
function entryAt(id: string, goalId: string, date: string, minutes = 30) {
  return { id, goalId, date, minutes, note: '', source: 'manual', createdAt: `${date}T01:00:00.000Z`, updatedAt: `${date}T01:00:00.000Z` };
}

test.beforeEach(async ({ page }) => {
  await freezeClock(page);
});

test.describe('M5 curve in the browser', () => {
  test('S1 Read: every table row (Whole period 31, So far 9) equals the brute-force oracle (M9: You flat at +0.0%, minutes, change); headline, dots', async ({ page }) => {
    const problems = watch(page);
    await importBackup(page);
    await gotoHash(page, '/goals/g1');
    await expect(page.getByTestId('headline')).toHaveText('+0.0% better');
    await expect(page.getByTestId('curve-chart')).toBeVisible();
    await page.getByText(EN.goal.detail.showTable).click();
    const rows = page.getByTestId('curve-table').locator('tbody tr');
    await expect(rows).toHaveCount(31);
    // oracle (M9): G1 logged 30 min on 10-01..10-08, nothing on 10-09 (today); future days show em dashes
    for (let i = 0; i < 31; i++) {
      const cells = await rows.nth(i).locator('th,td').allInnerTexts();
      const date = `2026-10-${String(i + 1).padStart(2, "0")}`;
      expect(cells[0], `row ${i}`).toBe(date);
      expect(cells[1], `ideal ${i}`).toBe(pct(i + 1));
      expect(cells[2], `you ${i}`).toBe(i <= 8 ? '+0.0%' : '—');
      expect(cells[3], `minutes ${i}`).toBe(i < 8 ? '30' : i === 8 ? '0' : '—');
      expect(cells[4], `change ${i}`).toBe(i >= 1 && i <= 7 ? '+0.0%' : '—');
    }
    await page.getByRole('radio', { name: EN.goal.detail.rangeSoFar }).check();
    await expect(rows).toHaveCount(9);
    await page.getByRole('radio', { name: EN.goal.detail.rangeWhole }).check();
    await expect(rows).toHaveCount(31);

    // pixel oracle for the two marker dots: y(+9.4%) and y(+0.0%) on the rendered y axis
    const geo = await page.evaluate(() => {
      const labels = Array.from(document.querySelectorAll('.curve-chart .recharts-yAxis-tick-labels text, .curve-chart .recharts-yAxis text')).map((t) => t.textContent ?? '');
      const grid = Array.from(document.querySelectorAll('.curve-chart .recharts-cartesian-grid-horizontal line')).map((l) => Number(l.getAttribute('y1')));
      const dots = Array.from(document.querySelectorAll('.curve-chart .recharts-reference-dot circle')).map((c) => ({ cy: Number(c.getAttribute('cy')), cx: Number(c.getAttribute('cx')) }));
      return { labels, grid, dots };
    });
    expect(geo.dots).toHaveLength(2);
    expect(geo.grid.length).toBeGreaterThanOrEqual(3);
    // bottom grid line = 0%, top grid line = the largest y label (labels appear in a separate layer: collect all '0%' / '+N%' texts)
    const yLabels = await page.locator('.curve-chart text').evaluateAll((els) => els.map((e) => e.textContent ?? ''));
    const yValues = yLabels.map((t) => /^(?:0|\+(\d+(?:\.\d+)?))%$/.exec(t.trim())).filter((m): m is RegExpExecArray => m !== null).map((m) => Number(m[1] ?? 0));
    const yTop = Math.max(...yValues);
    const yBottom = Math.max(...geo.grid);
    const yTopPx = Math.min(...geo.grid);
    expect(yTop, JSON.stringify(yLabels)).toBeGreaterThanOrEqual(9.4);
    const yOf = (v: number) => yBottom - (v / yTop) * (yBottom - yTopPx);
    const [dotIdeal, dotYou] = geo.dots.sort((p, q) => p.cy - q.cy);
    expect(Math.abs(dotIdeal.cy - yOf(((1.01 ** 9) - 1) * 100)), `ideal dot cy ${dotIdeal.cy}`).toBeLessThan(2);
    expect(Math.abs(dotYou.cy - yOf(0)), `you dot cy ${dotYou.cy}`).toBeLessThan(2); // M9: You = +0.0% -> on the 0% line
    expect(dotIdeal.cx).toBeCloseTo(dotYou.cx, 0);
    // the two series: ideal polyline has 31 vertices, you has a step shape (horizontal + vertical segments) ending at day 9
    const paths = await page.evaluate(() => Array.from(document.querySelectorAll('.curve-chart .recharts-line-curve')).map((p) => ({ dash: p.getAttribute('stroke-dasharray'), d: p.getAttribute('d') ?? '' })));
    expect(paths).toHaveLength(2);
    const ideal = paths.find((p) => p.dash)!;
    const you = paths.find((p) => !p.dash)!;
    expect((ideal.d.match(/[ML]/g) ?? []).length).toBe(31);
    expect((you.d.match(/[ML]/g) ?? []).length).toBeGreaterThanOrEqual(9);
    // step: every second vertex shares x with the previous one or y with the previous one
    const pts = (you.d.match(/[ML]\s*[-\d.]+[ ,][-\d.]+/g) ?? []).map((s) => s.slice(1).trim().split(/[ ,]/).map(Number));
    for (let i = 1; i < pts.length; i++) expect(pts[i][0] === pts[i - 1][0] || Math.abs(pts[i][1] - pts[i - 1][1]) < 0.01, `step shape at ${i}: ${pts[i - 1]} -> ${pts[i]}`).toBe(true);
    expect(problems).toEqual([]);
  });

  test('keyboard: Tab reaches the chart, arrows/Home/End/Escape read points through the live region, blur clears; Range radios work from the keyboard', async ({ page }) => {
    await importBackup(page);
    await gotoHash(page, '/goals/g1');
    const chart = page.getByTestId('curve-chart');
    await expect(chart).toBeVisible();
    await expect(chart).toHaveAttribute('role', 'img');
    await expect(chart).toHaveAttribute('aria-label', 'Day 9 of 31: your line is +0.0% compared with your first logged day. The ideal line is +9.4%.');
    await expect(page.getByTestId('curve-reading')).toHaveAttribute('aria-live', 'polite');
    // reach by Tab from the Range control
    await page.getByRole('radio', { name: EN.goal.detail.rangeWhole }).focus();
    await page.keyboard.press('Tab');
    const focusedOnChart = await page.evaluate(() => document.activeElement?.getAttribute('data-testid'));
    expect(focusedOnChart).toBe('curve-chart');
    await page.keyboard.press('ArrowLeft');
    await expect(page.getByTestId('curve-reading')).toHaveText('Oct 9 · Nothing logged, the line stays flat · You +0.0% · Ideal +9.4%');
    await page.keyboard.press('Home');
    await expect(page.getByTestId('curve-reading')).toHaveText('Oct 1 · 30 min, your first logged day · You +0.0% · Ideal +1.0%');
    await page.keyboard.press('ArrowRight');
    await expect(page.getByTestId('curve-reading')).toHaveText('Oct 2 · 30 min, +0.0% vs previous logged day · You +0.0% since your first day · Ideal +2.0%');
    await page.keyboard.press('Home');
    await page.keyboard.press('ArrowLeft'); // clamps at the first point
    await expect(page.getByTestId('curve-reading')).toHaveText('Oct 1 · 30 min, your first logged day · You +0.0% · Ideal +1.0%');
    await page.keyboard.press('End');
    await expect(page.getByTestId('curve-reading')).toHaveText('Oct 31 · Ideal +36.1%');
    await page.keyboard.press('ArrowRight'); // clamps at the last point
    await expect(page.getByTestId('curve-reading')).toHaveText('Oct 31 · Ideal +36.1%');
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('curve-reading')).toHaveText('');
    await page.keyboard.press('ArrowRight');
    await expect(page.getByTestId('curve-reading')).not.toHaveText('');
    await page.keyboard.press('Shift+Tab');
    await expect(page.getByTestId('curve-reading')).toHaveText('');
    // Range from the keyboard
    await page.getByRole('radio', { name: EN.goal.detail.rangeWhole }).focus();
    await page.keyboard.press('ArrowRight');
    await expect(page.getByRole('radio', { name: EN.goal.detail.rangeSoFar })).toBeChecked();
    await chart.focus();
    await page.keyboard.press('End');
    await expect(page.getByTestId('curve-reading')).toHaveText('Oct 9 · Nothing logged, the line stays flat · You +0.0% · Ideal +9.4%');
  });

  test('range default: 31-day goal whole period, 365-day goal "So far"; ended goal; upcoming has no Range; long goal table not mounted until opened', async ({ page }) => {
    const base = await sampleFile();
    const yearGoal = goalAt('y365', { name: 'Year', startDate: '2026-01-01', endDate: '2026-12-31' });
    const exactly120 = goalAt('d120', { name: 'D120', startDate: '2026-09-01', endDate: '2026-12-29' });
    const d121 = goalAt('d121', { name: 'D121', startDate: '2026-09-01', endDate: '2026-12-30' });
    const entries = Array.from({ length: 282 }, (_, i) => entryAt(`y${i}`, 'y365', add('2026-01-01', i)));
    await importContent(page, { ...base, goals: [yearGoal, exactly120, d121, ...(base.goals.slice(3) as Array<Record<string, unknown>>)], entries: [...entries, ...(base.entries.filter((e) => e.goalId === 'g5') as Array<Record<string, unknown>>)] });
    await gotoHash(page, '/goals/y365');
    await expect(page.getByTestId('headline')).toHaveText('+0.0% better'); // M5 +1,620.2% superseded: 30 min on each of 282 days = no change
    await expect(page.getByRole('radio', { name: EN.goal.detail.rangeSoFar })).toBeChecked();
    await expect(page.getByTestId('curve-table')).toHaveCount(0);
    await page.getByText(EN.goal.detail.showTable).click();
    await expect(page.getByTestId('curve-table').locator('tbody tr')).toHaveCount(282);
    await page.getByRole('radio', { name: EN.goal.detail.rangeWhole }).check();
    await expect(page.getByTestId('curve-table').locator('tbody tr')).toHaveCount(365);
    await expectNoHorizontalScroll(page);
    await gotoHash(page, '/goals/d120');
    await expect(page.getByRole('radio', { name: EN.goal.detail.rangeWhole })).toBeChecked();
    await gotoHash(page, '/goals/d121');
    await expect(page.getByRole('radio', { name: EN.goal.detail.rangeSoFar })).toBeChecked();
    // ended: G5 Old course, actual stops at endDate, headline from the single entry
    await gotoHash(page, '/goals/g5');
    await expect(page.getByTestId('headline')).toHaveText('+0.0% better'); // M5 +1.0% superseded (single entry = the baseline)
    await expect(page.getByTestId('headline-day')).toHaveText('Day 181 of 181');
    await expect(page.getByText(EN.goal.status.ended, { exact: true })).toBeVisible();
    // upcoming: G4
    await gotoHash(page, '/goals/g4');
    await expect(page.getByTestId('headline')).toHaveText('+0.0% better');
    await expect(page.getByRole('radio', { name: EN.goal.detail.rangeWhole })).toHaveCount(0);
    await expect(page.getByTestId('headline-sub')).toContainText('Starts');
    await expect(page.getByTestId('curve-chart').locator('.recharts-reference-dot')).toHaveCount(0);
  });

  test('empty goal (no entries): +0.0%, only the Ideal line, empty.detail.curve and empty history', async ({ page }) => {
    const base = await sampleFile();
    await importContent(page, { ...base, goals: [goalAt('e1', { name: 'Empty' })], entries: [] });
    await gotoHash(page, '/goals/e1');
    await expect(page.getByTestId('headline')).toHaveText('+0.0% better');
    await expect(page.getByTestId('headline-sub')).toHaveText(EN.empty.detail.curve); // M9: curve-empty merged into headline-sub (dev deviation D2)
    await expect(page.getByTestId('headline-sub')).toHaveAttribute('data-variant', 'empty');
    await expect(page.getByRole('heading', { name: EN.empty.detail.history })).toBeVisible();
    await expect(page.getByTestId('curve-chart').locator('.recharts-line')).toHaveCount(1); // Ideal only
    await expectAxeClean(page);
  });

  test('single-day goal and goal whose period is today only render without NaN/Infinity', async ({ page }) => {
    const problems = watch(page);
    const base = await sampleFile();
    await importContent(page, {
      ...base,
      goals: [goalAt('one', { name: 'One', startDate: '2026-10-09', endDate: '2026-10-09' })],
      entries: [entryAt('o1', 'one', '2026-10-09')],
    });
    await gotoHash(page, '/goals/one');
    await expect(page.getByTestId('headline')).toHaveText('+0.0% better');
    const text = await page.locator('main').innerText();
    expect(text).not.toMatch(/NaN|Infinity|undefined|\[object/);
    await page.getByText(EN.goal.detail.showTable).click();
    await expect(page.getByTestId('curve-table').locator('tbody tr')).toHaveCount(1);
    await expectAxeClean(page);
    expect(problems).toEqual([]);
  });

  test('large dataset: 1827-day goal with 1500 entries opens quickly, history is complete, no horizontal scroll', async ({ page }) => {
    const base = await sampleFile();
    const goal = goalAt('big', { name: 'Big', startDate: '2022-01-01', endDate: '2026-12-31', targetMinutes: 10 });
    const entries = Array.from({ length: 1500 }, (_, i) => entryAt(`b${i}`, 'big', add('2022-01-01', i), 12));
    await importContent(page, { ...base, goals: [goal], entries });
    const t0 = Date.now();
    await gotoHash(page, '/goals/big');
    await expect(page.getByTestId('headline')).toBeVisible();
    await expect(page.getByTestId('curve-chart').locator('.recharts-line')).toHaveCount(2);
    const ms = Date.now() - t0;
    console.log(`M5-QC big goal detail ready in ${ms} ms`);
    expect(ms).toBeLessThan(5000);
    await expect(page.getByRole('radio', { name: EN.goal.detail.rangeSoFar })).toBeChecked();
    await page.getByRole('radio', { name: EN.goal.detail.rangeWhole }).check();
    await expect(page.getByTestId('curve-chart').locator('.recharts-line')).toHaveCount(2);
    await expectNoHorizontalScroll(page);
    await expectAxeClean(page);
  });

  test('midnight rollover: the open Goal detail moves from day 9 to day 10 after the day changes (visibilitychange)', async ({ page }) => {
    await importBackup(page);
    await gotoHash(page, '/goals/g1');
    await expect(page.getByTestId('headline-day')).toHaveText('Day 9 of 31');
    await page.clock.setFixedTime(new Date('2026-10-10T00:01:00+07:00'));
    await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
    await expect(page.getByTestId('headline-day')).toHaveText('Day 10 of 31');
    await expect(page.getByTestId('headline-sub')).toContainText('Last logged Oct 8: 30 min'); // M9: flat through the unlogged days
    await expect(page.getByTestId('curve-chart')).toHaveAttribute('aria-label', /Day 10 of 31/);
  });

  test('XSS: HTML/script in goal name, why and note is inert on Goal detail (title, chart label, table, history), no dialogs, no external requests', async ({ page }) => {
    const problems = watch(page);
    page.on('dialog', (d) => {
      problems.push(`js dialog: ${d.message()}`);
      void d.dismiss();
    });
    const base = await sampleFile();
    const evil = '<img src=x onerror=alert(1)><script>alert(2)</script>"\'`';
    await importContent(page, {
      ...base,
      goals: [goalAt('x1', { name: evil, why: evil })],
      entries: [{ ...entryAt('xe', 'x1', '2026-10-08'), note: evil }],
    });
    await gotoHash(page, '/goals/x1');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(evil);
    await expect(page.locator('main img, main script')).toHaveCount(0);
    await expect(page.getByTestId('history-row').first()).toContainText(evil);
    await expect(page).toHaveTitle(`${evil} — 1% Better`);
    await gotoHash(page, '/goals');
    await expect(page.locator('main img, main script')).toHaveCount(0);
    await gotoHash(page, '/today');
    await expect(page.locator('main img, main script')).toHaveCount(0);
    await page.waitForTimeout(300);
    expect(problems).toEqual([]);
  });

  test('vi: Goal detail uses vi strings and decimal commas; vi scan is clean (full, empty, upcoming, ended); long vi name at 360px does not scroll', async ({ browser }) => {
    const ctx = await browser.newContext({ locale: 'vi-VN', timezoneId: 'Asia/Ho_Chi_Minh', viewport: { width: 360, height: 800 } });
    const page = await ctx.newPage();
    await freezeClock(page);
    const problems = watch(page);
    await importBackupVi(page);
    await gotoHash(page, '/goals/g1');
    await expect(page.getByTestId('headline')).toHaveText(VI.goal.detail.headline.replace('{{value}}', '+0,0'));
    await expect(page.getByTestId('headline-sub')).toHaveText('Lần ghi gần nhất 8 thg 10: 30 phút, +0,0% so với 7 thg 10 (30 phút). ×1 kể từ 1 thg 10 (30 phút).');
    await expect(page.getByTestId('curve-chart')).toContainText('Lý tưởng +9,4%');
    await expect(page.getByTestId('curve-chart')).toContainText('Bạn +0,0%');
    await page.getByTestId('curve-chart').focus();
    await page.keyboard.press('ArrowRight');
    await expect(page.getByTestId('curve-reading')).toContainText('+9,4%');
    await page.getByText(VI.goal.detail.showTable).click();
    await expect(page.getByTestId('curve-table').locator('tbody tr').nth(8)).toContainText('+0,0%');
    await expectNoViLeaks(page);
    await expectNoHorizontalScroll(page);
    for (const id of ['g4', 'g5', 'g3']) {
      await gotoHash(page, `/goals/${id}`);
      await expect(page.getByTestId('headline')).toBeVisible();
      await expectNoViLeaks(page);
      await expectNoHorizontalScroll(page);
      await expectAxeClean(page);
    }
    expect(problems).toEqual([]);
    await ctx.close();
  });
});

async function importBackupVi(page: Page) {
  await importBackup(page, 'sample-backup.json', VI);
}
