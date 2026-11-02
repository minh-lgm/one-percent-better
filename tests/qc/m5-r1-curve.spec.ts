// QC round 1 (M5), re-targeted in M9 round 1 (v3.0) and again for the v6.0 burn-up (FR-27 v6.0, ARCH 4.5; user decision 2026-11-02):
// Goal detail and the 1% curve in a real browser, checked against an oracle that does not use app code.
// Ideal(k) = T₀·(1.01^k − 1)/0.01 minutes (T₀ = minutes per day), You = minutes logged added up (flat on unlogged days, never down),
// headline = signed % of You vs Ideal on the last elapsed day. The M5 (1.01^n) and M9 v3 (ratio to the first logged day) assertions
// are superseded (TASKS "Test cũ bị thay thế"). Data always comes in through the real Import UI (TASKS section 0).
import { readFile } from 'node:fs/promises';
import { expect, test, type Page } from '@playwright/test';
import { EN, expectAxeClean, expectNoHorizontalScroll, expectNoViLeaks, fixturePath, freezeClock, gotoHash, importBackup, VI } from '../../e2e/helpers/app';

const ORIGIN = 'http://localhost:4173';
const MINUS = '−';

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
// Oracle (v6.0, FR-27 / ARCH 4.5): the ideal line adds up a daily target that starts at T₀ and grows 1 % a day:
// ideal(k) = T₀·(1.01^k − 1)/0.01 (closed form, same operation order as src/domain/plan.ts so the float rounds the same way).
const ideal = (t0: number, k: number) => (t0 * (1.01 ** k - 1)) / 0.01;
/** `1,084` — en grouping, whole minutes (format.ts `number`). */
const grouped = (n: number) => new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(n);
/** Whole-minute gap with an explicit sign: `+0`, `−41` (format.ts `signed0`: round, then U+2212 / `+`; `Math.abs` so a rounded −0 prints `+0`). */
const signed0 = (n: number) => {
  const r = Math.round(n);
  return r < 0 ? `${MINUS}${grouped(-r)}` : `+${grouped(Math.abs(r))}`;
};

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
  test('S1 Read: every table row (Whole period 31, So far 9) equals the brute-force oracle in minutes (ideal(k), You added up, that day, signed gap); headline −14.6%, dots', async ({ page }) => {
    const problems = watch(page);
    await importBackup(page);
    await gotoHash(page, '/goals/g1');
    // 240 min logged (30 × 8) vs ideal(9) = 30·(1.01^9 − 1)/0.01 = 281.06 → (240 − 281.06)/281.06 = −14.6 %.
    await expect(page.getByTestId('headline')).toHaveText(`${MINUS}14.6% vs. ideal`);
    await expect(page.getByTestId('curve-chart')).toBeVisible();
    await page.getByText(EN.goal.detail.showTable).click();
    const rows = page.getByTestId('curve-table').locator('tbody tr');
    await expect(rows).toHaveCount(31);
    // oracle: G1 logged 30 min on 10-01..10-08, nothing on 10-09 (today); future days show em dashes in the You columns
    for (let i = 0; i < 31; i++) {
      const cells = await rows.nth(i).locator('th,td').allInnerTexts();
      const date = `2026-10-${String(i + 1).padStart(2, '0')}`;
      const you = i < 8 ? 30 * (i + 1) : 240;
      expect(cells[0], `row ${i}`).toBe(date);
      expect(cells[1], `ideal ${i}`).toBe(grouped(ideal(30, i + 1)));
      expect(cells[2], `you ${i}`).toBe(i <= 8 ? grouped(you) : '—');
      expect(cells[3], `minutes ${i}`).toBe(i < 8 ? '30' : i === 8 ? '0' : '—');
      expect(cells[4], `gap ${i}`).toBe(i <= 8 ? signed0(you - ideal(30, i + 1)) : '—');
    }
    // spot checks of the oracle itself against the PRD examples: 10-01 = 30 / 30 / 30 / +0, 10-08 = 249 / 240 / 30 / −9, 10-09 = 281 / 240 / 0 / −41
    await expect(rows.nth(0).locator('td')).toHaveText(['30', '30', '30', '+0']);
    await expect(rows.nth(7).locator('td')).toHaveText(['249', '240', '30', `${MINUS}9`]);
    await expect(rows.nth(8).locator('td')).toHaveText(['281', '240', '0', `${MINUS}41`]);
    await page.getByRole('radio', { name: EN.goal.detail.rangeSoFar }).check();
    await expect(rows).toHaveCount(9);
    await page.getByRole('radio', { name: EN.goal.detail.rangeWhole }).check();
    await expect(rows).toHaveCount(31);

    // pixel oracle for the two marker dots: y(281.06 min) and y(240 min) on the rendered y axis (plain minutes, from 0)
    const geo = await page.evaluate(() => {
      const grid = Array.from(document.querySelectorAll('.curve-chart .recharts-cartesian-grid-horizontal line')).map((l) => Number(l.getAttribute('y1')));
      const dots = Array.from(document.querySelectorAll('.curve-chart .recharts-reference-dot circle')).map((c) => ({ cy: Number(c.getAttribute('cy')), cx: Number(c.getAttribute('cx')) }));
      return { grid, dots };
    });
    expect(geo.dots).toHaveLength(2);
    expect(geo.grid.length).toBeGreaterThanOrEqual(3);
    // bottom grid line = 0 min, top grid line = the largest y label (plain grouped minutes, never signed, never %)
    const yLabels = await page.locator('.curve-chart text').evaluateAll((els) => els.map((e) => e.textContent ?? ''));
    const yValues = yLabels.map((t) => t.trim()).filter((t) => /^[\d,]+$/.test(t)).map((t) => Number(t.replace(/,/g, '')));
    expect(yLabels.some((t) => /%|^[+−-]/.test(t.trim())), JSON.stringify(yLabels)).toBe(false);
    const yTop = Math.max(...yValues);
    const yBottom = Math.max(...geo.grid);
    const yTopPx = Math.min(...geo.grid);
    // the whole-period ideal (1,084 min on Oct 31) sets the scale: top tick ≥ 1,084
    expect(yTop, JSON.stringify(yLabels)).toBeGreaterThanOrEqual(1084);
    const yOf = (v: number) => yBottom - (v / yTop) * (yBottom - yTopPx);
    const [dotIdeal, dotYou] = geo.dots.sort((p, q) => p.cy - q.cy); // Ideal (281) is above You (240)
    expect(Math.abs(dotIdeal.cy - yOf(ideal(30, 9))), `ideal dot cy ${dotIdeal.cy}`).toBeLessThan(2);
    expect(Math.abs(dotYou.cy - yOf(240)), `you dot cy ${dotYou.cy}`).toBeLessThan(2);
    expect(dotIdeal.cx).toBeCloseTo(dotYou.cx, 0);
    // the two series: ideal polyline has 31 vertices, you has a step shape (horizontal + vertical segments) ending at day 9
    const paths = await page.evaluate(() => Array.from(document.querySelectorAll('.curve-chart .recharts-line-curve')).map((p) => ({ dash: p.getAttribute('stroke-dasharray'), d: p.getAttribute('d') ?? '' })));
    expect(paths).toHaveLength(2);
    const idealPath = paths.find((p) => p.dash)!;
    const you = paths.find((p) => !p.dash)!;
    expect((idealPath.d.match(/[ML]/g) ?? []).length).toBe(31);
    expect((you.d.match(/[ML]/g) ?? []).length).toBeGreaterThanOrEqual(9);
    // step: every vertex shares x with the previous one or y with the previous one; You never goes down (y never grows along the path)
    const pts = (you.d.match(/[ML]\s*[-\d.]+[ ,][-\d.]+/g) ?? []).map((s) => s.slice(1).trim().split(/[ ,]/).map(Number));
    for (let i = 1; i < pts.length; i++) {
      expect(pts[i][0] === pts[i - 1][0] || Math.abs(pts[i][1] - pts[i - 1][1]) < 0.01, `step shape at ${i}: ${pts[i - 1]} -> ${pts[i]}`).toBe(true);
      expect(pts[i][1] <= pts[i - 1][1] + 0.01, `You goes down at ${i}: ${pts[i - 1]} -> ${pts[i]}`).toBe(true);
    }
    expect(problems).toEqual([]);
  });

  test('keyboard: Tab reaches the chart, arrows/Home/End/Escape read points (minutes that day + both totals) through the live region, blur clears; Range radios work from the keyboard', async ({ page }) => {
    await importBackup(page);
    await gotoHash(page, '/goals/g1');
    const chart = page.getByTestId('curve-chart');
    await expect(chart).toBeVisible();
    await expect(chart).toHaveAttribute('role', 'img');
    await expect(chart).toHaveAttribute('aria-label', 'Day 9 of 31: you have logged 240 min in total. The ideal line is at 281 min.');
    await expect(page.getByTestId('curve-reading')).toHaveAttribute('aria-live', 'polite');
    // reach by Tab from the Range control
    await page.getByRole('radio', { name: EN.goal.detail.rangeWhole }).focus();
    await page.keyboard.press('Tab');
    const focusedOnChart = await page.evaluate(() => document.activeElement?.getAttribute('data-testid'));
    expect(focusedOnChart).toBe('curve-chart');
    await page.keyboard.press('ArrowLeft'); // first press reads today's point
    await expect(page.getByTestId('curve-reading')).toHaveText('Oct 9 · Nothing logged · Total 240 min · Ideal 281 min');
    await page.keyboard.press('Home');
    await expect(page.getByTestId('curve-reading')).toHaveText('Oct 1 · 30 min this day · Total 30 min · Ideal 30 min');
    await page.keyboard.press('ArrowRight'); // ideal(2) = 30 + 30.3 = 60.3 → 60
    await expect(page.getByTestId('curve-reading')).toHaveText('Oct 2 · 30 min this day · Total 60 min · Ideal 60 min');
    await page.keyboard.press('Home');
    await page.keyboard.press('ArrowLeft'); // clamps at the first point
    await expect(page.getByTestId('curve-reading')).toHaveText('Oct 1 · 30 min this day · Total 30 min · Ideal 30 min');
    await page.keyboard.press('End'); // future day: Ideal only, ideal(31) = 1,084
    await expect(page.getByTestId('curve-reading')).toHaveText('Oct 31 · Ideal 1,084 min');
    await page.keyboard.press('ArrowRight'); // clamps at the last point
    await expect(page.getByTestId('curve-reading')).toHaveText('Oct 31 · Ideal 1,084 min');
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
    await expect(page.getByTestId('curve-reading')).toHaveText('Oct 9 · Nothing logged · Total 240 min · Ideal 281 min');
  });

  test('range default: 31-day goal whole period, 365-day goal "So far"; ended goal; upcoming has no Range; long goal table not mounted until opened', async ({ page }) => {
    const base = await sampleFile();
    const yearGoal = goalAt('y365', { name: 'Year', startDate: '2026-01-01', endDate: '2026-12-31' });
    const exactly120 = goalAt('d120', { name: 'D120', startDate: '2026-09-01', endDate: '2026-12-29' });
    const d121 = goalAt('d121', { name: 'D121', startDate: '2026-09-01', endDate: '2026-12-30' });
    const entries = Array.from({ length: 282 }, (_, i) => entryAt(`y${i}`, 'y365', add('2026-01-01', i)));
    await importContent(page, { ...base, goals: [yearGoal, exactly120, d121, ...(base.goals.slice(3) as Array<Record<string, unknown>>)], entries: [...entries, ...(base.entries.filter((e) => e.goalId === 'g5') as Array<Record<string, unknown>>)] });
    await gotoHash(page, '/goals/y365');
    // 30 min on each of 282 days = 8,460 min vs ideal(282) = 30·(1.01^282 − 1)/0.01 = 46,630.5 → −81.9 % (the flat 30 falls ever further behind the compounding target)
    await expect(page.getByTestId('headline')).toHaveText(`${MINUS}81.9% vs. ideal`);
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
    // ended: G5 Old course, actual stops at endDate; 15 min vs ideal(181) = 15·(1.01^181 − 1)/0.01 = 7,583.6 → −99.8 %
    await gotoHash(page, '/goals/g5');
    await expect(page.getByTestId('headline')).toHaveText(`${MINUS}99.8% vs. ideal`);
    await expect(page.getByTestId('headline-day')).toHaveText('Day 181 of 181');
    await expect(page.getByText(EN.goal.status.ended, { exact: true })).toBeVisible();
    // upcoming: G4 — nothing elapsed, headline 0 (positive variant), Ideal only
    await gotoHash(page, '/goals/g4');
    await expect(page.getByTestId('headline')).toHaveText('+0.0% ahead of ideal');
    await expect(page.getByRole('radio', { name: EN.goal.detail.rangeWhole })).toHaveCount(0);
    await expect(page.getByTestId('headline-sub')).toContainText('Starts');
    await expect(page.getByTestId('curve-chart').locator('.recharts-reference-dot')).toHaveCount(0);
  });

  test('empty goal (no entries): −100.0%, You drawn flat at 0 min under the Ideal line, empty.detail.curve and empty history', async ({ page }) => {
    const base = await sampleFile();
    await importContent(page, { ...base, goals: [goalAt('e1', { name: 'Empty' })], entries: [] });
    await gotoHash(page, '/goals/e1');
    await expect(page.getByTestId('headline')).toHaveText(`${MINUS}100.0% vs. ideal`); // 0 min vs ideal(9) = 281 → −100 %
    await expect(page.getByTestId('headline-sub')).toHaveText(EN.empty.detail.curve); // M9: curve-empty merged into headline-sub (dev deviation D2)
    await expect(page.getByTestId('headline-sub')).toHaveAttribute('data-variant', 'empty');
    await expect(page.getByRole('heading', { name: EN.empty.detail.history })).toBeVisible();
    await expect(page.getByTestId('curve-chart').locator('.recharts-line')).toHaveCount(2); // v6: You exists from day 1 (flat at 0 min)
    await expect(page.getByTestId('curve-chart')).toContainText('You 0 min');
    await expect(page.getByTestId('curve-chart')).toContainText('Ideal 281 min');
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
    // 30 min vs ideal(1) = 30 → exactly on the line: +0.0 % (positive variant)
    await expect(page.getByTestId('headline')).toHaveText('+0.0% ahead of ideal');
    await expect(page.getByTestId('headline-sub')).toHaveText('Today: 30 min. Total 30 min, ideal 30 min (+0 min).');
    const text = await page.locator('main').innerText();
    expect(text).not.toMatch(/NaN|Infinity|undefined|\[object/);
    await page.getByText(EN.goal.detail.showTable).click();
    await expect(page.getByTestId('curve-table').locator('tbody tr')).toHaveCount(1);
    await expect(page.getByTestId('curve-table').locator('tbody tr').nth(0).locator('td')).toHaveText(['30', '30', '30', '+0']);
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
    // the total keeps 240 min while the ideal grows to ideal(10) = 30·(1.01^10 − 1)/0.01 = 313.9 → 314, gap 240 − 313.9 = −74
    await expect(page.getByTestId('headline-sub')).toHaveText(`Last logged Oct 8: 30 min. Total 240 min, ideal 314 min (${MINUS}74 min).`);
    await expect(page.getByTestId('headline')).toHaveText(`${MINUS}23.5% vs. ideal`); // (240 − 313.87)/313.87 = −23.5 %
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
    await expect(page.getByTestId('headline')).toHaveText(VI.goal.detail.headlineDown.replace('{{value}}', `${MINUS}14,6`));
    await expect(page.getByTestId('headline-sub')).toHaveText(`Lần ghi gần nhất 8 thg 10: 30 phút. Tổng 240 phút, lý tưởng 281 phút (${MINUS}41 phút).`);
    await expect(page.getByTestId('curve-chart')).toContainText('Lý tưởng 281 phút');
    await expect(page.getByTestId('curve-chart')).toContainText('Bạn 240 phút');
    await page.getByTestId('curve-chart').focus();
    await page.keyboard.press('ArrowRight'); // today (9 thg 10): nothing logged
    await expect(page.getByTestId('curve-reading')).toContainText('Không ghi · Tổng 240 phút · Lý tưởng 281 phút');
    await page.keyboard.press('Escape'); // clear the multi-line reading before clicking below the chart (M9-D1)
    await expect(page.getByTestId('curve-reading')).toHaveText('');
    await page.getByText(VI.goal.detail.showTable).click();
    await expect(page.getByTestId('curve-table').locator('tbody tr').nth(8).locator('td')).toHaveText(['281', '240', '0', `${MINUS}41`]);
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
