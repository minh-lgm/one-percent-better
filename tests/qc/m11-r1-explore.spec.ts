// QC M11 round 1 - exploratory / acceptance probes around "No end date" (chromium project, cloud OFF build).
// Clock = 2026-10-09 10:00 (+07:00) like TASKS section 0.
import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { BASE_URL } from '../../playwright.config';
import { EN, expectAxeClean, expectNoHorizontalScroll, expectNoViLeaks, freezeClock, goalCard, gotoHash, logTime, toast, VI, fixturePath } from '../../e2e/helpers/app';

type Json = Record<string, unknown>;
const O1 = JSON.parse(readFileSync(fixturePath('o1-open-ended-backup.json'), 'utf8')) as { goals: Json[]; entries: Json[]; [k: string]: unknown };
const SAMPLE = JSON.parse(readFileSync(fixturePath('sample-backup.json'), 'utf8')) as { goals: Json[]; entries: Json[]; [k: string]: unknown };

/** Import an arbitrary backup object through Settings -> D3 -> confirm. */
async function importObject(page: Page, obj: unknown, expectOk = true): Promise<void> {
  await gotoHash(page, '/settings');
  await page.getByTestId('import-file').setInputFiles({ name: 'qc.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(obj)) });
  if (!expectOk) return;
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: EN.import.confirm }).click();
  await expect(dialog).toBeHidden();
  await expect(toast(page)).toContainText(EN.toast.backupImported.split(':')[0]);
}

const withO1 = (over: Json = {}, entries: Json[] = O1.entries) => ({ ...O1, goals: [{ ...O1.goals[0], ...over }], entries });
const row = (page: Page, name: string) => page.getByTestId('goal-row').filter({ has: page.getByRole('heading', { level: 3, name }) });

async function bodyText(page: Page): Promise<string> {
  return (await page.locator('body').innerText()).replace(/\s+/g, ' ');
}

test.describe('M11 r1 explore: dates and lists', () => {
  test('an open-ended goal that starts in the future is Upcoming, not on Today, no chart card on Goal detail; Day of today lists nothing for it', async ({ page }) => {
    await freezeClock(page);
    await importObject(page, withO1({ startDate: '2026-11-01' }, []));
    await gotoHash(page, '/goals');
    await expect(page.getByRole('heading', { level: 2, name: /^Upcoming \(1\)/ })).toBeVisible();
    await expect(row(page, 'Meditate')).toContainText('from 2026-11-01, no end date');
    await expect(row(page, 'Meditate')).not.toContainText('Ended');
    await gotoHash(page, '/today');
    await expect(goalCard(page, 'Meditate')).toHaveCount(0);
    await gotoHash(page, '/goals/o1');
    await expect(page.getByRole('heading', { level: 1, name: 'Meditate' })).toBeVisible();
    expect(await bodyText(page)).not.toMatch(/Infinity|NaN|undefined|null/);
    await expect(page.locator('svg.recharts-surface')).toHaveCount(0);
    await gotoHash(page, '/review?goal=o1&year=2026');
    await expect(page.getByRole('heading', { level: 1, name: EN.review.title })).toBeVisible();
    expect(await bodyText(page)).not.toMatch(/Infinity|NaN|undefined/);
  });

  test('Day: today and a past day since the start accept an entry for O1; the day before the start and tomorrow do not list it / are blocked', async ({ page }) => {
    await freezeClock(page);
    await importObject(page, withO1());
    await gotoHash(page, '/day/2026-10-10');
    expect(await bodyText(page)).not.toContain('Meditate');
    await gotoHash(page, '/day/2026-09-30');
    expect(await bodyText(page)).not.toContain('Meditate');
    await gotoHash(page, '/day/2026-10-03');
    await expect(page.getByText('Meditate').first()).toBeVisible();
    expect(await bodyText(page)).not.toMatch(/Infinity|NaN|undefined/);
    await gotoHash(page, '/today');
    await logTime(page, 'Meditate', 30);
    await expect(goalCard(page, 'Meditate').locator('.amount')).toContainText('30/10');
    await gotoHash(page, '/goals/o1');
    // Progress: (55 + 30) of 90 expected so far = 94.4 %
    await expect(page.getByText('94.4%').first()).toBeVisible();
  });

  test('Review All goals with S1 + O1: overall totals = S1 totals + O1 55 min; no NaN anywhere', async ({ page }) => {
    await freezeClock(page);
    const merged = { ...SAMPLE, goals: [...SAMPLE.goals, O1.goals[0]], entries: [...SAMPLE.entries, ...O1.entries] };
    await importObject(page, merged);
    await gotoHash(page, '/review?year=2026');
    await expect(page.getByRole('heading', { level: 1, name: EN.review.title })).toBeVisible();
    await expect(page.getByTestId('chart-weekly').locator('svg.recharts-surface')).toBeVisible();
    const all = await bodyText(page);
    expect(all).not.toMatch(/Infinity|NaN|undefined/);
    // Single-goal view for the open-ended one keeps its Progress sub-line and the note.
    await gotoHash(page, '/review?goal=o1&year=2026');
    await expect(page.getByText('55 of 90 min expected so far')).toBeVisible();
    await expect(page.getByText(EN.review.progressNoteOpen)).toBeVisible();
    // A finite goal in the same data keeps the old note (not the open-ended variant).
    await gotoHash(page, '/review?goal=g1&year=2026');
    await expect(page.getByText(EN.review.progressNoteOpen)).toHaveCount(0);
  });
});

test.describe('M11 r1 explore: editing', () => {
  test('finite -> no end date -> finite: entries survive; open -> a date before the last entry is refused and nothing changes', async ({ page }) => {
    await freezeClock(page);
    await importObject(page, SAMPLE);
    await gotoHash(page, '/goals');
    const g1 = row(page, SAMPLE.goals[0].name as string);
    const before = (await g1.textContent()) ?? '';
    await g1.getByRole('link', { name: EN.common.edit, exact: true }).click();
    await page.getByRole('radio', { name: EN.goal.form.endsNever }).check();
    await page.getByRole('button', { name: EN.goal.form.saveChanges }).click();
    await expect(toast(page)).toHaveText(EN.toast.goalUpdated);
    await expect(row(page, SAMPLE.goals[0].name as string)).toContainText('no end date');
    // back to a date that excludes an entry (the sample has entries up to 2026-10-08)
    await row(page, SAMPLE.goals[0].name as string).getByRole('link', { name: EN.common.edit, exact: true }).click();
    await expect(page.getByRole('radio', { name: EN.goal.form.endsNever })).toBeChecked();
    await page.getByRole('radio', { name: EN.goal.form.endsSpecific }).check();
    await page.getByLabel(new RegExp(`^${EN.goal.form.endLabel}`)).fill('2026-10-02');
    await page.getByRole('button', { name: EN.goal.form.saveChanges }).click();
    await expect(page.getByRole('alert').first()).toBeVisible();
    await expect(page).toHaveURL(/goals\/.+\/edit|goals\/g1/);
    await gotoHash(page, '/goals');
    await expect(row(page, SAMPLE.goals[0].name as string)).toContainText('no end date');
    // restoring the original end date works and the row text is the same as at the start
    await row(page, SAMPLE.goals[0].name as string).getByRole('link', { name: EN.common.edit, exact: true }).click();
    await page.getByRole('radio', { name: EN.goal.form.endsSpecific }).check();
    await page.getByLabel(new RegExp(`^${EN.goal.form.endLabel}`)).fill(SAMPLE.goals[0].endDate as string);
    await page.getByRole('button', { name: EN.goal.form.saveChanges }).click();
    await expect(toast(page)).toHaveText(EN.toast.goalUpdated);
    await expect(row(page, SAMPLE.goals[0].name as string)).toHaveText(before);
  });

  test('edit O1: Target -> Total hours moves Ends to "This year" (+ status), saving stores a finite total goal; never total + null', async ({ page }) => {
    await freezeClock(page);
    await importObject(page, withO1());
    await gotoHash(page, '/goals');
    await row(page, 'Meditate').getByRole('link', { name: EN.common.edit, exact: true }).click();
    await expect(page.getByRole('radio', { name: EN.goal.form.endsNever })).toBeChecked();
    await page.getByRole('radio', { name: EN.goal.form.targetTotal }).check();
    await expect(page.getByRole('radio', { name: EN.goal.form.endsNever })).toBeDisabled();
    await expect(page.getByTestId('ends-status')).toHaveText(EN.goal.form.endsNeverSwitched);
    await page.getByRole('textbox', { name: new RegExp(`^${EN.goal.form.targetTotal}`) }).fill('100');
    await page.getByRole('button', { name: EN.goal.form.saveChanges }).click();
    await expect(toast(page)).toHaveText(EN.toast.goalUpdated);
    await expect(row(page, 'Meditate')).toContainText('2026-10-01 – 2026-12-31');
    await expect(row(page, 'Meditate')).not.toContainText('no end date');
  });

  test('edit an old open-ended goal (start 2024) to Total hours: "This year" = 2024-12-31 excludes the 2026 entries -> refused with an Alert, goal unchanged', async ({ page }) => {
    await freezeClock(page);
    await importObject(page, withO1({ startDate: '2024-01-01' }));
    await gotoHash(page, '/goals');
    await row(page, 'Meditate').getByRole('link', { name: EN.common.edit, exact: true }).click();
    await page.getByRole('radio', { name: EN.goal.form.targetTotal }).check();
    await page.getByRole('textbox', { name: new RegExp(`^${EN.goal.form.targetTotal}`) }).fill('100');
    await page.getByRole('button', { name: EN.goal.form.saveChanges }).click();
    await expect(page.getByRole('alert').first()).toBeVisible();
    await gotoHash(page, '/goals');
    await expect(row(page, 'Meditate')).toContainText('no end date');
  });
});

test.describe('M11 r1 explore: backup', () => {
  test('old backup files import and export byte-for-byte the same goals (endDate strings, never null)', async ({ page }) => {
    await freezeClock(page);
    await importObject(page, SAMPLE);
    await gotoHash(page, '/settings');
    const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: EN.settings.backup.export }).click()]);
    const text = readFileSync(await download.path(), 'utf8');
    const out = JSON.parse(text) as { schemaVersion: number; goals: Json[] };
    expect(out.schemaVersion).toBe(1);
    const strip = (g: Json) => ({ id: g.id, name: g.name, targetType: g.targetType, targetMinutes: g.targetMinutes, startDate: g.startDate, endDate: g.endDate });
    expect(out.goals.map(strip).sort((a, b) => String(a.id).localeCompare(String(b.id)))).toEqual(SAMPLE.goals.map(strip).sort((a, b) => String(a.id).localeCompare(String(b.id))));
    expect(text).not.toContain('"endDate": null');
  });

  test('a total goal with endDate null, a missing endDate key and an entry dated tomorrow are refused at the Import step with an Alert and the data is unchanged', async ({ page }) => {
    await freezeClock(page);
    await importObject(page, withO1());
    const bad: Array<[string, unknown]> = [
      ['total + null', withO1({ targetType: 'total', targetMinutes: 6000 })],
      ['missing endDate key', (() => { const g = { ...O1.goals[0] }; delete g.endDate; return { ...O1, goals: [g] }; })()],
      ['entry tomorrow', withO1({}, [...O1.entries, { ...O1.entries[0], id: 'e-future', date: '2026-10-10' }])],
      ['entry before start', withO1({}, [...O1.entries, { ...O1.entries[0], id: 'e-before', date: '2026-09-30' }])],
    ];
    for (const [label, obj] of bad) {
      await importObject(page, obj, false);
      await expect(page.getByRole('alert').first(), label).toBeVisible();
      await expect(page.getByRole('dialog'), label).toHaveCount(0);
    }
    await gotoHash(page, '/goals');
    await expect(row(page, 'Meditate')).toContainText('no end date');
  });
});

test.describe('M11 r1 explore: form layout at 360 px', () => {
  for (const [lang, copy] of [['en-US', EN], ['vi-VN', VI]] as const) {
    test(`${lang}: Ends group, Total hours lock, error state - no horizontal scroll, no clipped text, axe clean`, async ({ browser }) => {
      const context = await browser.newContext({ locale: lang, timezoneId: 'Asia/Ho_Chi_Minh', viewport: { width: 360, height: 740 }, baseURL: BASE_URL });
      const page = await context.newPage();
      await freezeClock(page);
      await gotoHash(page, '/goals/new');
      const radioNever = page.getByRole('radio', { name: copy.goal.form.endsNever });
      await radioNever.check();
      await expectNoHorizontalScroll(page);
      await expectAxeClean(page);
      const box = await page.getByRole('group', { name: copy.goal.form.endsLegend }).boundingBox();
      expect(box!.x + box!.width).toBeLessThanOrEqual(360);
      await page.screenshot({ path: `test-results/qc-m11-form-never-${lang}.png`, fullPage: true });
      await page.getByRole('radio', { name: copy.goal.form.targetTotal }).check();
      await expectNoHorizontalScroll(page);
      await expectAxeClean(page);
      if (lang === 'vi-VN') await expectNoViLeaks(page);
      await page.screenshot({ path: `test-results/qc-m11-form-total-${lang}.png`, fullPage: true });
      // Keyboard: with Total hours the arrow keys never reach the disabled radio.
      await page.getByRole('radio', { name: copy.goal.form.endsSpecific }).focus();
      await page.keyboard.press('ArrowDown');
      await expect(radioNever).not.toBeChecked();
      await expect(radioNever).toBeDisabled();
      await context.close();
    });
  }
});

// A-49: an open-ended goal has no limit on how far back it starts. Whatever the user types in the Start date field
// (a typo such as 1926 for 2026), the screens must stay usable and never print Infinity / NaN.
test.describe('M11 r1 explore: open-ended goal with a very old start date', () => {
  for (const start of ['2000-01-01', '1926-01-01', '1800-01-01']) {
    test(`start ${start}: Today, Goals, Goal detail and Review render finite numbers within a few seconds`, async ({ page }) => {
      test.setTimeout(90_000);
      const errors: string[] = [];
      page.on('pageerror', (e) => errors.push(String(e)));
      await freezeClock(page);
      await importObject(page, withO1({ startDate: start }, [{ ...O1.entries[0], id: 'e-old', date: start }]));
      for (const hash of ['/today', '/goals', '/goals/o1', '/review?goal=o1&year=2026']) {
        const t0 = Date.now();
        await gotoHash(page, hash);
        await expect(page.getByRole('heading', { level: 1 })).toBeVisible({ timeout: 30_000 });
        if (hash === '/goals/o1') await expect(page.locator('svg.recharts-surface').first()).toBeVisible({ timeout: 30_000 });
        const text = await bodyText(page);
        console.log(`[probe] start ${start} ${hash}: ${Date.now() - t0} ms; Infinity=${/Infinity/.test(text)} NaN=${/NaN/.test(text)}`);
        expect(text, `${hash}`).not.toMatch(/Infinity|NaN|undefined/);
      }
      expect(errors).toEqual([]);
    });
  }
});

test.describe('M11 r1 explore: a mistyped start year (M11-D1)', () => {
  test('start 0026-10-01 (year typed as "26"): Goal detail shows its chart within 5 s', async ({ page }) => {
    test.fail(true, 'M11-D1: open-ended goals have no cap on elapsed days; ~740,000 chart points freeze the tab for ~20 s');
    test.setTimeout(120_000);
    await freezeClock(page);
    await importObject(page, withO1({ startDate: '0026-10-01' }, [{ ...O1.entries[0], id: 'e-old', date: '0026-10-01' }]));
    const t0 = Date.now();
    await gotoHash(page, '/goals/o1');
    await expect(page.locator('svg.recharts-surface').first()).toBeVisible({ timeout: 100_000 });
    expect(Date.now() - t0, 'ms until the chart is on screen').toBeLessThan(5_000);
  });
});
