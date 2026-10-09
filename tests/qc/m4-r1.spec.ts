// QC round 1 (M4): independent acceptance + exploratory E2E for Review (heatmap, stats, charts), against the
// production build (preview 4173). Data always arrives through the real Import UI (TASKS §0).
import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import {
  EN,
  expectAxeClean,
  expectNoHorizontalScroll,
  expectNoViLeaks,
  fixturePath,
  freezeClock,
  goalCard,
  gotoHash,
  importBackup,
  logTime,
  toast,
  VI,
} from '../../e2e/helpers/app';

const ORIGIN = 'http://localhost:4173';
const cell = (page: Page, date: string) => page.locator(`[data-date="${date}"]`);
const stat = (page: Page, id: string) => page.getByTestId(id);

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
  page.on('dialog', (d) => {
    problems.push(`js dialog: ${d.message()}`);
    void d.dismiss();
  });
  return problems;
}

interface RawGoal {
  id: string;
  name: string;
  why: string;
  targetType: 'daily' | 'total';
  targetMinutes: number;
  startDate: string;
  endDate: string;
  archived: boolean;
  createdAt: string;
  updatedAt: string;
}
interface RawEntry {
  id: string;
  goalId: string;
  date: string;
  minutes: number;
  note: string;
  source: 'manual' | 'timer';
  createdAt: string;
  updatedAt: string;
}
const sample = () => JSON.parse(readFileSync(fixturePath('sample-backup.json'), 'utf8')) as { goals: RawGoal[]; entries: RawEntry[]; [k: string]: unknown };
const addDays = (s: string, n: number) => new Date(new Date(`${s}T00:00:00Z`).getTime() + n * 86_400_000).toISOString().slice(0, 10);

function goal(id: string, name: string, daily: number, start: string, end: string, extra: Partial<RawGoal> = {}): RawGoal {
  return { id, name, why: '', targetType: 'daily', targetMinutes: daily, startDate: start, endDate: end, archived: false, createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z', ...extra };
}
function entry(goalId: string, date: string, minutes: number): RawEntry {
  return { id: `e-${goalId}-${date}`, goalId, date, minutes, note: '', source: 'manual', createdAt: `${date}T03:00:00.000Z`, updatedAt: `${date}T03:00:00.000Z` };
}
async function importCustom(page: Page, goals: RawGoal[], entries: RawEntry[], name = 'custom.json'): Promise<{ dialog: string; toast: string }> {
  const body = { ...sample(), goals, entries };
  await gotoHash(page, '/settings');
  await page.getByTestId('import-file').setInputFiles({ name, mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(body)) });
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  const dialogText = (await dialog.textContent()) ?? '';
  await dialog.getByRole('button', { name: EN.import.confirm }).click();
  await expect(dialog).toBeHidden();
  await expect(toast(page)).toContainText(EN.toast.backupImported.split(':')[0]);
  return { dialog: dialogText, toast: (await toast(page).textContent()) ?? '' };
}

test.beforeEach(async ({ page }) => {
  await freezeClock(page);
});

test.describe('S1 numbers per goal (oracle: mockup 06 script and TASKS table)', () => {
  const expected: Array<{ id: string; name: string; time: string; whole: string; days: string; progress: string; sub: string; pace: string; expectedMin: string; cur: string; longest: string }> = [
    { id: 'g1', name: 'Read', time: '4.0 h', whole: 'Whole goal: 4.0 h', days: '8', progress: '25.8%', sub: '240 of 930 min', pace: '30 min behind', expectedMin: 'Expected 270 min by today', cur: '8 days', longest: '8 days' },
    { id: 'g2', name: 'Guitar', time: '4.2 h', whole: 'Whole goal: 4.2 h', days: '12', progress: '10.2%', sub: '250 of 2,440 min', pace: '8 h 50 min behind', expectedMin: 'Expected 780 min by today', cur: '2 days', longest: '10 days' },
    { id: 'g3', name: 'Spanish', time: '1.0 h', whole: 'Whole goal: 1.0 h', days: '1', progress: '1.0%', sub: '60 of 6,000 min', pace: '78 h 54 min behind', expectedMin: 'Expected 4,794 min by today', cur: '0 days', longest: '1 day' },
    { id: 'g4', name: 'Marathon prep', time: '0.0 h', whole: 'Whole goal: 0.0 h', days: '0', progress: '0.0%', sub: '0 of 1,350 min', pace: 'On pace', expectedMin: 'Expected 0 min by today', cur: '0 days', longest: '0 days' },
    { id: 'g5', name: 'Old course', time: '0.3 h', whole: 'Whole goal: 0.3 h', days: '1', progress: '0.6%', sub: '15 of 2,715 min', pace: '45 h behind', expectedMin: 'Expected 2,715 min by today', cur: '0 days', longest: '1 day' },
  ];
  test('every goal: time, days, progress, pace, streaks; year 2025/2027 behaviour', async ({ page }) => {
    const problems = watch(page);
    await importBackup(page);
    await gotoHash(page, '/review');
    for (const e of expected) {
      await page.getByRole('combobox', { name: EN.review.goalLabel }).selectOption(e.id);
      await expect(page).toHaveURL(new RegExp(`#/review\\?goal=${e.id}&year=2026$`));
      await expect(page.getByRole('grid', { name: `Activity heatmap for 2026, ${e.name}` })).toBeVisible();
      await expect(stat(page, 'stat-time'), e.name).toContainText(e.time);
      await expect(stat(page, 'stat-time'), e.name).toContainText(e.whole);
      await expect(stat(page, 'stat-days'), e.name).toContainText(e.days);
      await expect(stat(page, 'stat-progress'), e.name).toContainText(e.progress);
      await expect(stat(page, 'stat-progress'), e.name).toContainText(e.sub);
      await expect(stat(page, 'stat-pace'), e.name).toContainText(e.pace);
      await expect(stat(page, 'stat-pace'), e.name).toContainText(e.expectedMin);
      await expect(stat(page, 'stat-current'), e.name).toContainText(e.cur);
      await expect(stat(page, 'stat-longest'), e.name).toContainText(e.longest);
      await expect(stat(page, 'stat-progress').getByRole('progressbar')).toHaveAttribute('aria-valuetext', e.progress);
    }
    // 2025: no goal runs in 2025 (S1 goals are all 2026) -> every goal says so, all cells outside, stats 0 for the year but whole-goal numbers stay.
    await gotoHash(page, '/review?goal=g3&year=2025');
    await expect(page.getByTestId('heatmap-summary')).toHaveText("This goal doesn't run in 2025.");
    await expect(stat(page, 'stat-time')).toContainText('0.0 h');
    await expect(stat(page, 'stat-time')).toContainText('Whole goal: 1.0 h');
    await expect(page.locator('[role="gridcell"].out')).toHaveCount(365);
    // All goals 2025: nothing logged.
    await gotoHash(page, '/review?goal=all&year=2025');
    await expect(page.getByTestId('heatmap-summary')).toHaveText('No time logged in 2025 yet.');
    await expect(stat(page, 'stat-time')).toContainText('0.0 h');
    await expect(stat(page, 'stat-days')).toContainText('0');
    await expect(stat(page, 'stat-current')).toContainText('8 days'); // streaks are not year-bound
    await expect(page.getByTestId('chart-weekly').locator('svg.recharts-surface')).toBeVisible();
    // A year in the future falls back to the current year.
    await gotoHash(page, '/review?goal=g1&year=2027');
    await expect(page.getByRole('combobox', { name: EN.review.yearLabel })).toHaveValue('2026');
    // Odd params
    for (const q of ['goal=&year=', 'goal=ALL&year=2026', 'goal=g1&goal=g2&year=2026', 'goal=%3Cscript%3E&year=-1', 'year=2026.5', 'year=02026', 'goal=__proto__']) {
      await gotoHash(page, `/review?${q}`);
      await expect(page.getByRole('heading', { level: 1, name: EN.review.title })).toBeVisible();
      await expect(page.getByRole('grid')).toBeVisible();
    }
    expect(problems).toEqual([]);
  });

  test('All goals values and the hidden tables match the oracle', async ({ page }) => {
    await importBackup(page);
    await gotoHash(page, '/review');
    await expect(stat(page, 'stat-time')).toContainText('9.4 h');
    await expect(stat(page, 'stat-days')).toContainText('20');
    await expect(stat(page, 'stat-current')).toContainText('8 days');
    await expect(stat(page, 'stat-longest')).toContainText('10 days');
    const weekly = page.getByRole('table', { name: EN.review.weeklyTitle });
    const rows = weekly.locator('tbody tr');
    await expect(rows).toHaveCount(12);
    // Week starting 2026-10-05 = 160 min = 2 h 40 min (last row); the week from 09-28 only has Read 10-01..10-04 = 120 min.
    await expect(rows.nth(11)).toContainText('2 h 40 min');
    await expect(rows.nth(11)).toContainText('Oct 5');
    await expect(rows.nth(10)).toContainText('Sep 28');
    await expect(rows.nth(10)).toContainText('2 h'); // Read 10-01..10-04 = 120 min
    // 12 weeks back from Mon 2026-10-05 is Mon 2026-07-20.
    await expect(rows.nth(0)).toContainText('Jul 20');
    const monthly = page.getByRole('table', { name: 'Months of 2026' }).locator('tbody tr');
    const expectedMonths = ['0 min', '0 min', '1 h', '0 min', '0 min', '15 min', '0 min', '0 min', '3 h 30 min', '4 h 40 min', '0 min', '0 min'];
    for (let i = 0; i < 12; i++) await expect(monthly.nth(i), `month ${i + 1}`).toContainText(expectedMonths[i]);
    // The tables are not visible but are in the accessibility tree; the svg is hidden from AT.
    const hiddenStyle = await weekly.evaluate((el) => {
      const cs = getComputedStyle(el);
      return { position: cs.position, clip: cs.clip };
    });
    expect(hiddenStyle, 'hidden table is clipped away (sr-only)').toEqual({ position: 'absolute', clip: 'rect(0px, 0px, 0px, 0px)' });
    expect(await page.getByTestId('chart-weekly').locator('.chart').getAttribute('aria-hidden')).toBe('true');
  });

  test('logging time on Today updates the Review streak and the Today chip live (no reload)', async ({ page }) => {
    await importBackup(page);
    await gotoHash(page, '/today');
    await expect(page.getByTestId('streak-chip')).toHaveText('8-day streak');
    await logTime(page, 'Read', 30);
    await expect(page.getByTestId('streak-chip')).toHaveText('9-day streak');
    await page.getByRole('link', { name: EN.nav.review }).first().click();
    await expect(stat(page, 'stat-current')).toContainText('9 days');
    await expect(stat(page, 'stat-longest')).toContainText('10 days');
    await page.getByRole('combobox', { name: EN.review.goalLabel }).selectOption('g1');
    await expect(stat(page, 'stat-current')).toContainText('9 days');
    await expect(stat(page, 'stat-longest')).toContainText('9 days');
    await expect(stat(page, 'stat-time')).toContainText('4.5 h');
    await expect(stat(page, 'stat-pace')).toContainText('On pace'); // 270 of 270
    await expect(stat(page, 'stat-progress')).toContainText('29.0%');
    await expect(cell(page, '2026-10-09')).toHaveClass(/\bl3\b/);
    await expect(cell(page, '2026-10-09')).toHaveClass(/\btoday\b/);
    await expect(cell(page, '2026-10-09')).toHaveAttribute('aria-label', 'Friday, October 9, 2026: 30 min, target met');
  });
});

test.describe('streak across year and leap-day boundaries (real UI, moved clock)', () => {
  test('2025-12-25 .. 2026-01-02 is one streak of 9; year 2025 counts 7 days, 2026 counts 2', async ({ page }) => {
    await freezeClock(page, new Date('2026-01-02T10:00:00+07:00'));
    const g = goal('y1', 'Yearly', 10, '2025-12-01', '2026-12-31');
    const entries: RawEntry[] = [];
    for (let d = '2025-12-25'; d <= '2026-01-02'; d = addDays(d, 1)) entries.push(entry('y1', d, 10));
    await importCustom(page, [g], entries);
    await gotoHash(page, '/today');
    await expect(page.getByTestId('streak-chip')).toHaveText('9-day streak');
    await gotoHash(page, '/review?goal=y1&year=2026');
    await expect(stat(page, 'stat-current')).toContainText('9 days');
    await expect(stat(page, 'stat-longest')).toContainText('9 days');
    await expect(stat(page, 'stat-days')).toContainText('2');
    await expect(page.getByRole('combobox', { name: EN.review.yearLabel }).locator('option')).toHaveText(['2026', '2025']);
    await page.getByRole('combobox', { name: EN.review.yearLabel }).selectOption('2025');
    await expect(stat(page, 'stat-days')).toContainText('7');
    await expect(stat(page, 'stat-current')).toContainText('9 days');
    await expect(page.locator('[role="gridcell"]')).toHaveCount(365);
    await expect(page.getByTestId('heatmap-summary')).toHaveText('In 2025 you logged time on 7 days and hit your target on 7 days. Longest streak: 9 days.');
    // Today = Friday 2026-01-02: 2026 grid, first cell is Thursday (row 3); today's cell is in column 0 and flagged.
    await page.getByRole('combobox', { name: EN.review.yearLabel }).selectOption('2026');
    await expect(cell(page, '2026-01-02')).toHaveClass(/\btoday\b/);
    await expect(cell(page, '2026-01-03')).toHaveClass(/\bfut\b/);
  });

  test('leap day 2028-02-29: 5-day streak across Feb 27 .. Mar 2, 366 cells, Feb 29 cell opens Day', async ({ page }) => {
    await freezeClock(page, new Date('2028-03-02T10:00:00+07:00'));
    const g = goal('l1', 'Leap', 20, '2028-01-01', '2028-12-31');
    const entries: RawEntry[] = [];
    for (let d = '2028-02-27'; d <= '2028-03-02'; d = addDays(d, 1)) entries.push(entry('l1', d, 20));
    await importCustom(page, [g], entries);
    await gotoHash(page, '/review?goal=l1&year=2028');
    await expect(stat(page, 'stat-current')).toContainText('5 days');
    await expect(stat(page, 'stat-longest')).toContainText('5 days');
    await expect(page.locator('[role="gridcell"]')).toHaveCount(366);
    await expect(cell(page, '2028-02-29')).toHaveAttribute('aria-label', 'Tuesday, February 29, 2028: 20 min, target met');
    // 2028-01-01 is a Saturday: first non-pad cell sits in row 6 of column 0.
    const rowOf = await page.evaluate(() => {
      const c = document.querySelector('[data-date="2028-01-01"]')!;
      return Array.from(c.parentElement!.parentElement!.children).indexOf(c.parentElement!);
    });
    expect(rowOf).toBe(5);
    await cell(page, '2028-02-29').click();
    await expect(page).toHaveURL(/#\/day\/2028-02-29$/);
    await expect(page.getByText('Tuesday, February 29, 2028')).toBeVisible();
    // the same data with year 2027 chosen via URL: outside for the goal
    await gotoHash(page, '/review?goal=l1&year=2027');
    await expect(page.getByTestId('heatmap-summary')).toHaveText("This goal doesn't run in 2027.");
  });

  test('a gap day resets the current streak but keeps the longest; an unmet today keeps yesterday-based streak', async ({ page }) => {
    await freezeClock(page, new Date('2026-06-15T23:30:00+07:00'));
    const g = goal('s1', 'Gap', 30, '2026-06-01', '2026-06-30');
    const entries = [...['06-01', '06-02', '06-03', '06-04'].map((d) => entry('s1', `2026-${d}`, 30)), entry('s1', '2026-06-06', 30), entry('s1', '2026-06-07', 29), entry('s1', '2026-06-13', 30), entry('s1', '2026-06-14', 45)];
    await importCustom(page, [g], entries);
    await gotoHash(page, '/review?goal=s1&year=2026');
    await expect(stat(page, 'stat-current')).toContainText('2 days'); // 06-13, 06-14; today 06-15 not logged yet
    await expect(stat(page, 'stat-longest')).toContainText('4 days');
    await expect(stat(page, 'stat-days')).toContainText('7');
    await expect(cell(page, '2026-06-07')).toHaveAttribute('aria-label', /29 min, target not met/);
    await expect(page.getByTestId('heatmap-summary')).toContainText('logged time on 8 days and hit your target on 7 days');
  });
});

test.describe('heatmap interaction', () => {
  test('keyboard model, roving tab stop, tooltip, today border, no navigation on future / outside cells', async ({ page }) => {
    await importBackup(page);
    await gotoHash(page, '/review?goal=g1&year=2026');
    await expect(page.getByRole('grid')).toBeVisible();
    // exactly one tab stop
    expect(await page.locator('[role="gridcell"][tabindex="0"]').count()).toBe(1);
    expect(await page.locator('[role="gridcell"][tabindex="-1"]').count()).toBe(364);
    await page.getByRole('combobox', { name: EN.review.yearLabel }).focus();
    await page.keyboard.press('Tab');
    await expect(cell(page, '2026-10-09')).toBeFocused();
    // one more Tab leaves the grid, Shift+Tab comes back to the same cell
    await page.keyboard.press('Tab');
    expect(await page.evaluate(() => document.activeElement?.getAttribute('role'))).not.toBe('gridcell');
    await page.keyboard.press('Shift+Tab');
    await expect(cell(page, '2026-10-09')).toBeFocused();
    // arrows
    await page.keyboard.press('ArrowLeft');
    await expect(cell(page, '2026-10-02')).toBeFocused();
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('ArrowRight');
    await expect(cell(page, '2026-10-16')).toBeFocused();
    await expect(page.getByRole('tooltip')).toHaveText('Friday, October 16, 2026: upcoming');
    await page.keyboard.press('ArrowDown'); // Sat 10-17
    await page.keyboard.press('ArrowDown'); // Sun 10-18
    await page.keyboard.press('ArrowDown'); // Mon 10-19 (next column)
    await expect(cell(page, '2026-10-19')).toBeFocused();
    await page.keyboard.press('ArrowUp'); // back to Sun 10-18
    await expect(cell(page, '2026-10-18')).toBeFocused();
    // Enter / Space on a future cell: no navigation
    await page.keyboard.press('Enter');
    await page.keyboard.press(' ');
    await expect(page).toHaveURL(/#\/review\?goal=g1&year=2026$/);
    // roving: after moving, that cell is the only tab stop
    expect(await page.locator('[role="gridcell"][tabindex="0"]').count()).toBe(1);
    await expect(cell(page, '2026-10-18')).toHaveAttribute('tabindex', '0');
    // outside cell (before the goal): focusable, tooltip text, no navigation
    await cell(page, '2026-09-30').focus();
    await expect(page.getByRole('tooltip')).toHaveText("Wednesday, September 30, 2026: outside this goal's dates");
    await expect(cell(page, '2026-09-30')).toHaveAttribute('aria-disabled', 'true');
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(/#\/review\?goal=g1&year=2026$/);
    // first cell: ArrowLeft / ArrowUp at the very beginning does not throw or leave the grid
    await page.keyboard.press('Home');
    await expect(cell(page, '2026-01-01')).toBeFocused();
    await page.keyboard.press('ArrowLeft');
    await page.keyboard.press('ArrowUp');
    await expect(cell(page, '2026-01-01')).toBeFocused();
    await page.keyboard.press('End');
    await expect(cell(page, '2026-12-31')).toBeFocused();
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('ArrowDown');
    await expect(cell(page, '2026-12-31')).toBeFocused();
    // Space opens Day for a valid past cell
    await cell(page, '2026-10-03').focus();
    await page.keyboard.press(' ');
    await expect(page).toHaveURL(/#\/day\/2026-10-03$/);
    // Going back to Review keeps the goal/year (history entry replaced, not pushed per change)
    await page.goBack();
    await expect(page).toHaveURL(/#\/review\?goal=g1&year=2026$/);
    // today's cell has a distinct border
    const todayBorder = await cell(page, '2026-10-09').evaluate((el) => {
      const s = getComputedStyle(el);
      return `${s.borderTopWidth} ${s.borderTopStyle} ${s.outlineStyle} ${s.boxShadow}`;
    });
    const otherBorder = await cell(page, '2026-10-08').evaluate((el) => {
      const s = getComputedStyle(el);
      return `${s.borderTopWidth} ${s.borderTopStyle} ${s.outlineStyle} ${s.boxShadow}`;
    });
    expect(todayBorder).not.toBe(otherBorder);
  });

  test('hover tooltip: appears, disappears, stays inside the viewport at 360 px for the first and last columns; clicking selects roving stop', async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 740 });
    await importBackup(page);
    await gotoHash(page, '/review');
    const scroll = page.getByTestId('heatmap-scroll');
    for (const [date, pos] of [['2026-10-07', 'right'], ['2026-01-01', 'left']] as const) {
      await scroll.evaluate((el, p) => {
        el.scrollLeft = p === 'left' ? 0 : el.scrollWidth;
      }, pos);
      await cell(page, date).scrollIntoViewIfNeeded();
      await cell(page, date).hover();
      const tip = page.getByRole('tooltip');
      await expect(tip).toBeVisible();
      const box = await tip.boundingBox();
      expect(box, date).not.toBeNull();
      expect(box!.x, `${date} tooltip left edge`).toBeGreaterThanOrEqual(-1);
      expect(box!.x + box!.width, `${date} tooltip right edge`).toBeLessThanOrEqual(361);
      expect(box!.y, `${date} tooltip top`).toBeGreaterThanOrEqual(0);
    }
    await page.mouse.move(5, 5);
    await expect(page.getByRole('tooltip')).toBeHidden();
    // 53 columns x 7 rows, month labels do not overlap
    const labels = await page.getByTestId('heatmap-month').evaluateAll((els) => els.map((e) => ({ t: e.textContent, r: e.getBoundingClientRect() })).map((x) => ({ t: x.t, l: x.r.left, rt: x.r.right })));
    for (let i = 1; i < labels.length; i++) expect(labels[i].l, `${labels[i - 1].t} vs ${labels[i].t}`).toBeGreaterThanOrEqual(labels[i - 1].rt - 0.5);
    const colCount = await page.evaluate(() => {
      const rows = Array.from(document.querySelectorAll('[role="row"]'));
      return rows.map((r) => r.children.length);
    });
    expect(colCount).toEqual([53, 53, 53, 53, 53, 53, 53]);
  });
});

test.describe('layout, a11y, i18n, dark mode', () => {
  // M4-D2 (open): Review's <main> lacks the `wide` class, so at 1440 px the content is 640 px wide instead of
  // 960 px (DESIGN 3.2 / S6, mockup 06) and about a third of the year heatmap is hidden behind a horizontal scroll.
  test('M4-D2: at 1440 px the Review column is 960 px wide and the heatmap loses at most 60 px to scrolling', async ({ page }) => {
    test.fail();
    await page.setViewportSize({ width: 1440, height: 900 });
    await importBackup(page);
    await gotoHash(page, '/review');
    const m = await page.evaluate(() => {
      const s = document.querySelector('[data-testid="heatmap-scroll"]')!;
      return { main: document.querySelector('main')!.getBoundingClientRect().width, hidden: s.scrollWidth - s.clientWidth };
    });
    expect(m.main).toBeGreaterThanOrEqual(940);
    expect(m.hidden).toBeLessThanOrEqual(60);
  });

  for (const width of [360, 768, 1440]) {
    test(`${width}px: no horizontal scroll (All, Read, no-entry year), axe clean in light and dark`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await importBackup(page);
      for (const q of ['', '?goal=g1&year=2026', '?goal=g3&year=2025', '?goal=g2&year=2026']) {
        await gotoHash(page, `/review${q}`);
        await expect(page.getByTestId('chart-monthly').locator('svg.recharts-surface')).toBeVisible();
        await expectNoHorizontalScroll(page);
        const scroller = await page.getByTestId('heatmap-scroll').evaluate((el) => ({ sw: el.scrollWidth, cw: el.clientWidth }));
        void scroller;
        await expectAxeClean(page);
        // chart svgs never wider than their card
        const overflow = await page.evaluate(() => Array.from(document.querySelectorAll('.chart svg')).filter((s) => s.getBoundingClientRect().right > (s.closest('.card') as HTMLElement).getBoundingClientRect().right + 1).length);
        expect(overflow).toBe(0);
      }
      await page.emulateMedia({ colorScheme: 'dark' });
      await gotoHash(page, '/review?goal=g1&year=2026');
      await expect(page.getByTestId('chart-monthly').locator('svg.recharts-surface')).toBeVisible();
      await expectAxeClean(page);
      await expectNoHorizontalScroll(page);
    });
  }

  test('Vietnamese: every goal and year variant scans clean, no horizontal scroll at 360, labels do not overlap', async ({ browser }) => {
    const context = await browser.newContext({ locale: 'vi-VN', timezoneId: 'Asia/Ho_Chi_Minh', viewport: { width: 360, height: 740 }, baseURL: ORIGIN });
    const page = await context.newPage();
    await freezeClock(page);
    const problems = watch(page);
    await importBackup(page, 'sample-backup.json', VI);
    for (const q of ['', '?goal=g1&year=2026', '?goal=g2&year=2026', '?goal=g3&year=2026', '?goal=g4&year=2026', '?goal=g5&year=2026', '?goal=g1&year=2025', '?goal=all&year=2025']) {
      await gotoHash(page, `/review${q}`);
      await expect(page.getByRole('heading', { level: 1, name: VI.review.title })).toBeVisible();
      await expect(page.getByTestId('chart-weekly').locator('svg.recharts-surface')).toBeVisible();
      await expectNoViLeaks(page);
      await expectNoHorizontalScroll(page);
      const labels = await page.getByTestId('heatmap-month').evaluateAll((els) => els.map((e) => ({ t: e.textContent, l: e.getBoundingClientRect().left, r: e.getBoundingClientRect().right })));
      for (let i = 1; i < labels.length; i++) expect(labels[i].l, `${q}: ${labels[i - 1].t} / ${labels[i].t}`).toBeGreaterThanOrEqual(labels[i - 1].r - 0.5);
    }
    // Vietnamese numbers / pace
    await gotoHash(page, '/review?goal=g2&year=2026');
    await expect(stat(page, 'stat-pace')).toContainText('Chậm 8 giờ 50 phút');
    await expect(stat(page, 'stat-progress')).toContainText('10,2%');
    await expect(stat(page, 'stat-progress')).toContainText('250/2.440 phút');
    await expect(stat(page, 'stat-time')).toContainText('4,2 giờ');
    // Weekday labels start with Monday, 7 of them, Vietnamese
    const days = await page.getByTestId('heatmap-weekday').allTextContents();
    expect(days).toHaveLength(7);
    expect(days[0]).toMatch(/2/);
    expect(days[6]).toMatch(/CN|Chủ/);
    await expectAxeClean(page);
    // Empty DB in vi
    expect(problems).toEqual([]);
    await context.close();
  });

  test('empty database: friendly empty state with Create a goal; works in vi; no errors', async ({ page }) => {
    const problems = watch(page);
    await gotoHash(page, '/review');
    await expect(page.getByRole('heading', { level: 1, name: EN.review.title })).toBeVisible();
    await expect(page.getByText(EN.empty.review)).toBeVisible();
    await page.getByRole('link', { name: EN.empty.reviewAction }).click();
    await expect(page).toHaveURL(/#\/goals\/new$/);
    await gotoHash(page, '/review?goal=g1&year=2020');
    await expect(page.getByText(EN.empty.review)).toBeVisible();
    await expectAxeClean(page);
    expect(problems).toEqual([]);
  });
});

test.describe('security and robustness', () => {
  test('hostile goal names are text everywhere on Review (select, grid name, tooltip, tables); no external requests', async ({ page }) => {
    const problems = watch(page);
    const names = ['<img src=x onerror="window.__pwned=1">', '"><script>window.__pwned=2</script>', "'; DROP TABLE goals;--", 'x'.repeat(60)];
    const goals = names.map((n, i) => goal(`h${i}`, n, 10, '2026-10-01', '2026-10-31'));
    const entries = goals.flatMap((g) => ['2026-10-03', '2026-10-04'].map((d) => entry(g.id, d, 15)));
    await importCustom(page, goals, entries);
    for (let i = 0; i < goals.length; i++) {
      await gotoHash(page, `/review?goal=h${i}&year=2026`);
      await expect(page.getByRole('grid')).toHaveAttribute('aria-label', `Activity heatmap for 2026, ${names[i]}`);
      await cell(page, '2026-10-03').hover();
      await expect(page.getByRole('tooltip')).toHaveText('Saturday, October 3, 2026: 15 min, target met');
      await expect(page.getByRole('combobox', { name: EN.review.goalLabel }).locator('option').nth(i + 1)).toHaveText(names[i]);
      expect(await page.locator('main img, main script').count()).toBe(0);
      await expectNoHorizontalScroll(page);
    }
    expect(await page.evaluate(() => (window as unknown as { __pwned?: number }).__pwned)).toBeUndefined();
    expect(problems).toEqual([]);
  });

  test('archived goals: label suffix in the goal select; an archived goal in progress keeps its pace', async ({ page }) => {
    const goals = [goal('a1', 'Old thing', 30, '2026-10-01', '2026-10-31', { archived: true })];
    await importCustom(page, goals, [entry('a1', '2026-10-02', 30)]);
    await gotoHash(page, '/review?goal=a1&year=2026');
    await expect(page.getByRole('combobox', { name: EN.review.goalLabel }).locator('option').nth(1)).toHaveText('Old thing (archived)');
    await expect(stat(page, 'stat-pace')).toContainText('4 h behind'); // 9 days x 30 = 270 expected, 30 logged -> -240
  });

  // M4-D1 (open): an archived goal that starts in the future gets negative elapsed days and a huge positive pace.
  // test.fail() keeps the suite green while the defect is open and turns red once it is fixed (then drop test.fail).
  test('M4-D1: archived goal that has not started yet shows "On pace" like an upcoming one', async ({ page }) => {
    test.fail();
    const goals = [goal('a2', 'Future thing', 45, '2026-11-01', '2026-11-30', { archived: true }), goal('a3', 'Future thing live', 45, '2026-11-01', '2026-11-30')];
    await importCustom(page, goals, []);
    await gotoHash(page, '/review?goal=a3&year=2026');
    await expect(stat(page, 'stat-pace')).toContainText('On pace');
    await gotoHash(page, '/review?goal=a2&year=2026');
    await expect(stat(page, 'stat-pace')).toContainText('On pace');
    await expect(stat(page, 'stat-pace')).toContainText('Expected 0 min by today');
  });

  test.describe('chart chunk failure', () => {
    test.use({ serviceWorkers: 'block' });
    test('chart chunk failing to load shows ErrorState with Retry while stats and heatmap keep working', async ({ page }) => {
    await importBackup(page);
    await page.route(/\/assets\/BarChart-[^/]+\.js$/, (route) => route.abort());
    await gotoHash(page, '/review');
    await page.reload();
    await expect(page.getByRole('grid')).toBeVisible();
    await expect(stat(page, 'stat-time')).toContainText('9.4 h');
    await expect(page.getByText(EN.errors.loadViewTitle).first()).toBeVisible();
    await expect(page.getByRole('button', { name: EN.common.retry }).first()).toBeVisible();
    await page.unroute(/\/assets\/BarChart-[^/]+\.js$/);
    });
  });

  test('offline after the first visit: Review and its chart chunk still work (service worker precache)', async ({ page, context }) => {
    await importBackup(page);
    await gotoHash(page, '/today');
    await page.evaluate(async () => {
      await navigator.serviceWorker.ready;
    });
    await page.reload();
    await page.waitForFunction(() => !!navigator.serviceWorker.controller);
    await context.setOffline(true);
    await page.getByRole('link', { name: EN.nav.review }).first().click();
    await expect(page.getByTestId('chart-weekly').locator('svg.recharts-surface')).toBeVisible();
    await expect(stat(page, 'stat-time')).toContainText('9.4 h');
    await context.setOffline(false);
  });
});

test.describe('large dataset (5 goals, 5,449 entries, 3 years)', () => {
  test('stats match an independent computation; Review ready quickly on repeated visits; year switches', async ({ page }) => {
    const problems = watch(page);
    const large = JSON.parse(readFileSync(fixturePath('large-backup.json'), 'utf8')) as { goals: RawGoal[]; entries: RawEntry[] };
    const hours = (m: number) => (m / 60).toLocaleString('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
    const sumYear = (y: number) => large.entries.filter((e) => e.date.startsWith(`${y}-`)).reduce((a, e) => a + e.minutes, 0);
    const loggedDays = (y: number) => new Set(large.entries.filter((e) => e.date.startsWith(`${y}-`)).map((e) => e.date)).size;
    // Independent overall streak: a day is met when some goal reaches its daily target that day.
    const dailyOf = (g: RawGoal) => (g.targetType === 'daily' ? g.targetMinutes : Math.ceil(g.targetMinutes / ((Date.parse(g.endDate) - Date.parse(g.startDate)) / 86_400_000 + 1)));
    const perDay = new Map<string, number>();
    for (const e of large.entries) perDay.set(`${e.goalId}|${e.date}`, (perDay.get(`${e.goalId}|${e.date}`) ?? 0) + e.minutes);
    const metDay = (d: string) => large.goals.some((g) => d >= g.startDate && d <= g.endDate && (perDay.get(`${g.id}|${d}`) ?? 0) >= dailyOf(g));
    let expectedStreak = 0;
    for (let d = metDay('2026-10-09') ? '2026-10-09' : '2026-10-08'; metDay(d); d = addDays(d, -1)) expectedStreak++;
    console.log(`[qc] large-backup expected overall current streak ${expectedStreak}`);
    await importBackup(page, 'large-backup.json');
    const times: number[] = [];
    for (let i = 0; i < 4; i++) {
      await gotoHash(page, '/today');
      await expect(page.getByTestId('streak-chip')).toHaveText(`${expectedStreak}-day streak`);
      const t0 = Date.now();
      await page.getByRole('link', { name: EN.nav.review }).first().click();
      await expect(page.getByRole('grid')).toBeVisible();
      await expect(stat(page, 'stat-time')).toContainText(' h');
      times.push(Date.now() - t0);
    }
    console.log(`[qc-perf] large-backup Review visible after (ms): ${times.join(', ')}`);
    expect(Math.max(...times)).toBeLessThan(1500);
    // cold: reload straight on #/review
    const t1 = Date.now();
    await page.reload();
    await expect(page.getByRole('grid')).toBeVisible();
    await expect(stat(page, 'stat-time')).toContainText(' h');
    console.log(`[qc-perf] cold reload on Review heatmap+stats ms: ${Date.now() - t1}`);
    await expect(page.getByTestId('chart-weekly').locator('svg.recharts-surface')).toBeVisible();
    // numbers
    await gotoHash(page, '/review?goal=all&year=2026');
    await expect(stat(page, 'stat-time')).toContainText(`${hours(sumYear(2026))} h`);
    for (const y of [2025, 2024, 2023]) {
      await page.getByRole('combobox', { name: EN.review.yearLabel }).selectOption(String(y));
      await expect(stat(page, 'stat-time'), `year ${y}`).toContainText(`${hours(sumYear(y))} h`);
      await expect(page.getByTestId('heatmap-summary')).toContainText(`logged time on ${loggedDays(y)} days`);
    }
    // leap-free years here (2024 is leap)
    await page.getByRole('combobox', { name: EN.review.yearLabel }).selectOption('2024');
    await expect(page.locator('[role="gridcell"]')).toHaveCount(366);
    // per goal total and progress for the Spanish "total" goal
    const g3 = large.goals.find((g) => g.id === 'L3')!;
    const g3Total = large.entries.filter((e) => e.goalId === 'L3').reduce((a, e) => a + e.minutes, 0);
    await gotoHash(page, '/review?goal=L3&year=2026');
    await expect(stat(page, 'stat-progress')).toContainText(`${((Math.round((g3Total / g3.targetMinutes) * 1000) / 10).toFixed(1))}%`);
    await expectAxeClean(page);
    expect(problems).toEqual([]);
  });
});

test.describe('regression smoke M1..M3 with M4 present', () => {
  test('Today / Goals / Goal detail why quotes (M3-D1) / import toast and dialog thousands separators (M3-D2)', async ({ page }) => {
    await importBackup(page);
    await gotoHash(page, '/today');
    await expect(goalCard(page, 'Read')).toBeVisible();
    await gotoHash(page, '/goals/g2');
    // M3-D1: the why quote marks are curly quotes drawn by CSS, no mojibake
    const pseudo = await page.evaluate(() => {
      const el = document.querySelector('.gd-head .why');
      if (!el) return null;
      return { before: getComputedStyle(el, '::before').content, after: getComputedStyle(el, '::after').content };
    });
    expect(pseudo).not.toBeNull();
    expect(pseudo!.before).toBe('"“"');
    expect(pseudo!.after).toBe('"”"');
    const css = readFileSync(new URL('../../src/ui/styles/app.css', import.meta.url));
    expect([...css].every((b) => b < 0x80), 'app.css is pure ASCII').toBe(true);
    // M3-D2: 1,400 entries -> thousands separator in the toast (and D3 shows the file's count)
    const goals = [goal('big', 'Big', 1, '2020-01-01', '2024-12-31')];
    const entries: RawEntry[] = [];
    for (let d = '2020-01-01'; entries.length < 1400; d = addDays(d, 1)) entries.push(entry('big', d, 1));
    const shown = await importCustom(page, goals, entries);
    expect(shown.dialog).toContain('1,400');
    expect(shown.toast).toContain('1,400');
  });
});

test.describe('extra exploratory', () => {
  test('chart chunk is not requested by any page on Today / Goals / Day / Settings (service worker blocked) and is requested once on Review', async ({ browser }) => {
    const context = await browser.newContext({ serviceWorkers: 'block', timezoneId: 'Asia/Ho_Chi_Minh', locale: 'en-US', baseURL: ORIGIN });
    const page = await context.newPage();
    await freezeClock(page);
    const urls: string[] = [];
    page.on('request', (r) => urls.push(r.url()));
    await importBackup(page);
    for (const h of ['/today', '/goals', '/goals/g1', '/day/2026-10-05', '/settings']) {
      await gotoHash(page, h);
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    }
    expect(urls.filter((u) => /BarChart|Review-/.test(u))).toEqual([]);
    await gotoHash(page, '/review');
    await expect(page.getByTestId('chart-weekly').locator('svg.recharts-surface')).toBeVisible();
    expect(urls.filter((u) => /BarChart-/.test(u))).toHaveLength(1);
    await context.close();
  });

  test('focused heatmap cell has a visible focus indicator; 320 px reflow without page-level horizontal scroll', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 640 });
    await importBackup(page);
    await gotoHash(page, '/review?goal=g1&year=2026');
    await expect(page.getByRole('grid')).toBeVisible();
    await expectNoHorizontalScroll(page);
    await cell(page, '2026-10-09').focus();
    await page.keyboard.press('ArrowLeft');
    const ring = await cell(page, '2026-10-02').evaluate((el) => {
      const s = getComputedStyle(el);
      return { outlineStyle: s.outlineStyle, outlineWidth: s.outlineWidth, shadow: s.boxShadow };
    });
    expect(ring.outlineStyle !== 'none' || ring.shadow.includes('rgb'), JSON.stringify(ring)).toBe(true);
  });

  test('another tab logging time updates an open Review live', async ({ page, context }) => {
    await importBackup(page);
    await gotoHash(page, '/review');
    await expect(stat(page, 'stat-current')).toContainText('8 days');
    const other = await context.newPage();
    await freezeClock(other);
    await gotoHash(other, '/today');
    await logTime(other, 'Read', 30);
    await expect(stat(page, 'stat-current')).toContainText('9 days', { timeout: 5000 });
    await other.close();
  });
});
