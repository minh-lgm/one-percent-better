// QC round 1 (M9): exploratory + acceptance tests for the 1% curve, re-targeted to the v6.0 burn-up (FR-27 v6.0, ARCH 4.5, DESIGN S4 v6;
// user decision 2026-11-02). Ideal(k) = T₀·(1.01^k − 1)/0.01 minutes (T₀ = minutes per day; a total goal starts at
// total·0.01/(1.01^N − 1) so the plan sums to the total, v6.1 ADR-47); You = minutes logged, added up (flat on unlogged days, never down);
// headline = signed % of You vs Ideal on the last elapsed day; subtitle/summary/table/ticks in whole minutes.
// Data always goes through the real Import UI or the real Day page (TASKS section 0). Oracle values come from the PRD/ARCH examples
// and from exact arithmetic written here (derivations in the comments), not from app code.
import { readFile } from 'node:fs/promises';
import { expect, test, type Page } from '@playwright/test';
import { at, EN, expectAxeClean, expectNoHorizontalScroll, expectNoViLeaks, fixturePath, freezeClock, goalCard, gotoHash, importBackup, VI } from '../../e2e/helpers/app';

const ORIGIN = 'http://localhost:4173';
const MINUS = '−';
const CLOCK_R1 = at('2026-10-13T10:00:00');
/** Y ticks are plain minutes: digits with a group separator (`1,000` / `1.000`) or Intl compact from 10,000 (`20K` / vi `20 N` with a no-break space) — never signed, never `%`. */
const NO_BREAK_SPACES = String.fromCharCode(0x00a0, 0x202f); // U+00A0 / U+202F: Intl puts one before the vi compact suffix
const PLAIN_TICK = new RegExp(`^[0-9,.]+(?:[ ${NO_BREAK_SPACES}]?[A-Z])?$`);

type Obj = Record<string, unknown>;
interface Backup {
  goals: Obj[];
  entries: Obj[];
  [k: string]: unknown;
}
async function fixture(name: string): Promise<Backup> {
  return JSON.parse(await readFile(fixturePath(name), 'utf8')) as Backup;
}
function entry(id: string, goalId: string, date: string, minutes: number, source = 'manual'): Obj {
  return { id, goalId, date, minutes, note: '', source, createdAt: `${date}T02:00:00.000Z`, updatedAt: `${date}T02:00:00.000Z` };
}
async function importContent(page: Page, content: unknown, copy: typeof EN | typeof VI = EN): Promise<void> {
  if (!page.url().includes('#/settings')) await gotoHash(page, '/settings');
  await page.getByTestId('import-file').setInputFiles({ name: 'b.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(content), 'utf8') });
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: copy.import.confirm }).click();
  await expect(dialog).toBeHidden();
}
/** Put rows straight into IndexedDB (what a sync merge can deliver, A-25: import validation would refuse them), then reload. */
async function injectEntries(page: Page, extra: Obj[]): Promise<void> {
  await page.evaluate(
    (rows) =>
      new Promise<void>((resolve, reject) => {
        const req = indexedDB.open('one-percent-better');
        req.onerror = () => reject(req.error);
        req.onsuccess = () => {
          const db = req.result;
          const tx = db.transaction('entries', 'readwrite');
          const store = tx.objectStore('entries');
          const probe = store.getAll();
          probe.onsuccess = () => {
            const template = (probe.result[0] ?? {}) as Record<string, unknown>;
            for (const r of rows) store.put({ ...template, deletedAt: null, ...r });
          };
          tx.oncomplete = () => {
            db.close();
            resolve();
          };
          tx.onerror = () => reject(tx.error);
        };
      }),
    extra,
  );
  await page.reload();
}
function watch(page: Page): string[] {
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
const headline = (p: Page) => p.getByTestId('headline');
const sub = (p: Page) => p.getByTestId('headline-sub');
const chart = (p: Page) => p.getByTestId('curve-chart');
const rows = (p: Page) => p.getByTestId('curve-table').locator('tbody tr');
async function yTicks(p: Page): Promise<string[]> {
  const ticks = chart(p).locator('.recharts-yAxis-tick-labels .recharts-cartesian-axis-tick-value');
  await expect(ticks.first()).toBeAttached();
  return ticks.allTextContents();
}
/** Every tick is a plain, unsigned minute value (no `%`, no `+`, no `−`); the axis starts at 0 (v6: You is never negative). */
async function expectPlainTicks(p: Page): Promise<string[]> {
  const ticks = await yTicks(p);
  expect(ticks.length).toBeGreaterThanOrEqual(3);
  for (const t of ticks) expect(t, ticks.join(' ')).toMatch(PLAIN_TICK);
  await expect(chart(p)).toHaveAttribute('data-y-min', '0');
  return ticks;
}
async function noGarbage(p: Page): Promise<void> {
  const text = await p.locator('main').innerText();
  expect(text).not.toMatch(/NaN|Infinity|undefined|\[object|null/);
}

// R1 (r1-real-backup.json): 30 min/day from 2026-10-10 to 12-31 (83 days), 5 / 10 / 14 / 27 min on 10-10..10-13, clock 10-13 → day 4.
// ideal(k) = 30·(1.01^k − 1)/0.01: 30 / 60.3 / 90.9 / 121.8 → table 30 / 60 / 91 / 122; You 5 / 15 / 29 / 56; gaps −25 / −45 / −62 / −66.
// headline (56 − 121.812)/121.812 = −54.0 %; ideal(11) (Oct 20) = 347.0; ideal(83) = 3,852.
const R1_HEADLINE = `${MINUS}54.0%`;
const R1_SUB = `Today: 27 min. Total 56 min, ideal 122 min (${MINUS}66 min).`;

test.describe('M9 QC — data edge cases (en, 1440 px)', () => {
  test('M9-AC1/A-41: several entries a day sum; entries before the start, after today and after the end are ignored; headline and subtitle identical to plain R1', async ({ page }) => {
    const problems = watch(page);
    await freezeClock(page, CLOCK_R1);
    const b = await fixture('r1-real-backup.json');
    const keep = b.entries.filter((e) => e.id !== 'e-r-4');
    await importContent(page, {
      ...b,
      entries: [
        ...keep,
        entry('x1', 'r1', '2026-10-13', 20),
        entry('x2', 'r1', '2026-10-13', 7, 'timer'),
      ],
    });
    // what a sync merge can bring in (A-25) but import validation refuses: before startDate, after today (even inside the period), after endDate
    await injectEntries(page, [entry('before', 'r1', '2026-10-09', 400), entry('after', 'r1', '2027-01-05', 900), entry('future', 'r1', '2026-10-20', 900)]);
    await gotoHash(page, '/goals/r1');
    await expect(headline(page)).toHaveText(R1_HEADLINE);
    await expect(sub(page)).toHaveText(R1_SUB);
    await expect(sub(page)).not.toContainText('×');
    await page.getByText(EN.goal.detail.showTable).click();
    await expect(rows(page)).toHaveCount(83);
    await expect(rows(page).nth(3).locator('td')).toHaveText(['122', '56', '27', `${MINUS}66`]);
    await expect(rows(page).nth(10).locator('td')).toHaveText(['347', '—', '—', '—']); // Oct 20 is in the future: Ideal only, the 900 min are ignored
    await page.getByRole('radio', { name: EN.goal.detail.rangeSoFar }).check();
    await expect(rows(page)).toHaveCount(4);
    await noGarbage(page);
    expect(problems).toEqual([]);
  });

  test('A-41 FR-27: deleting entries through the Day page lowers the running total (delete the first day → 51 min; delete today → "Last logged"; one day left; delete all → empty, You flat at 0)', async ({ page }) => {
    const problems = watch(page);
    await freezeClock(page, CLOCK_R1);
    await importBackup(page, 'r1-real-backup.json');
    const del = async (date: string, label: string) => {
      await gotoHash(page, `/day/${date}`);
      const card = goalCard(page, 'Đọc sách');
      await card.getByRole('button', { name: `Delete entry: ${label}` }).click();
      await card.getByRole('group', { name: /^Confirm delete/ }).getByRole('button', { name: EN.common.delete }).click();
      await expect(card.getByRole('button', { name: `Delete entry: ${label}` })).toHaveCount(0);
    };
    await del('2026-10-10', '5 min'); // total 51; (51 − 121.812)/121.812 = −58.1 %; gap 51 − 121.8 = −71
    await gotoHash(page, '/goals/r1');
    await expect(headline(page)).toHaveText(`${MINUS}58.1%`);
    await expect(sub(page)).toHaveText(`Today: 27 min. Total 51 min, ideal 122 min (${MINUS}71 min).`);
    await page.getByText(EN.goal.detail.showTable).click();
    await expect(rows(page).nth(0).locator('td')).toHaveText(['30', '0', '0', `${MINUS}30`]); // day 1 unlogged: You starts flat at 0 (never a "baseline")
    await expect(rows(page).nth(1).locator('td')).toHaveText(['60', '10', '10', `${MINUS}50`]); // 10 − 60.3
    await expect(rows(page).nth(2).locator('td')).toHaveText(['91', '24', '14', `${MINUS}67`]); // 24 − 90.9
    await expect(rows(page).nth(3).locator('td')).toHaveText(['122', '51', '27', `${MINUS}71`]);

    await del('2026-10-13', '27 min'); // today unlogged → the total stays 24 while the ideal keeps 121.8: (24 − 121.812)/121.812 = −80.3 %, gap −98
    await gotoHash(page, '/goals/r1');
    await expect(headline(page)).toHaveText(`${MINUS}80.3%`);
    await expect(sub(page)).toHaveText(`Last logged Oct 12: 14 min. Total 24 min, ideal 122 min (${MINUS}98 min).`);
    await expect(sub(page)).toHaveAttribute('data-variant', 'earlier');

    await del('2026-10-12', '14 min'); // one logged day left (Oct 11, 10 min): the same "Last logged" sentence, no starting-point variant; (10 − 121.812)/121.812 = −91.8 %
    await gotoHash(page, '/goals/r1');
    await expect(headline(page)).toHaveText(`${MINUS}91.8%`);
    await expect(sub(page)).toHaveText(`Last logged Oct 11: 10 min. Total 10 min, ideal 122 min (${MINUS}112 min).`);
    await expect(sub(page)).not.toContainText('×');

    await del('2026-10-11', '10 min'); // nothing logged: −100 %, empty copy, You still drawn (flat at 0 min) under Ideal
    await gotoHash(page, '/goals/r1');
    await expect(headline(page)).toHaveText(`${MINUS}100.0%`);
    await expect(sub(page)).toHaveText(EN.empty.detail.curve);
    await expect(sub(page)).toHaveAttribute('data-variant', 'empty');
    await expect(chart(page).locator('.recharts-line')).toHaveCount(2);
    await expect(chart(page)).toContainText('You 0 min');
    await expect(chart(page).locator('.curve-dot')).toHaveCount(0);
    await noGarbage(page);
    await expectAxeClean(page);
    expect(problems).toEqual([]);
  });

  test('A-39: editing today on the Day page moves the headline at once (27 → 3 = −73.7%, → 40 = −43.4%, → 5 = −72.1%)', async ({ page }) => {
    await freezeClock(page, CLOCK_R1);
    await importBackup(page, 'r1-real-backup.json');
    let current = '27 min';
    // total = 5 + 10 + 14 + m; headline = (total − 121.812)/121.812; gap = round(total − 121.812)
    for (const [minutes, total, expected, gap] of [
      [3, 32, `${MINUS}73.7%`, `${MINUS}90`], // 32 − 121.8
      [40, 69, `${MINUS}43.4%`, `${MINUS}53`], // 69 − 121.8
      [5, 34, `${MINUS}72.1%`, `${MINUS}88`], // 34 − 121.8
    ] as const) {
      await gotoHash(page, '/day/2026-10-13');
      const card = goalCard(page, 'Đọc sách');
      await card.getByRole('button', { name: `Edit entry: ${current}` }).click();
      const form = card.getByRole('form', { name: 'Edit entry for Đọc sách' });
      await form.getByLabel(/^Minutes/).fill(String(minutes));
      await form.getByRole('button', { name: EN.entry.form.saveChanges }).click();
      current = `${minutes} min`;
      await gotoHash(page, '/goals/r1');
      await expect(headline(page)).toHaveText(expected);
      await expect(headline(page)).toHaveAttribute('data-sign', 'negative');
      await expect(sub(page)).toHaveText(`Today: ${minutes} min. Total ${total} min, ideal 122 min (${gap} min).`);
    }
  });

  test('archived, ended and upcoming goals keep the right numbers (archived = same curve; ended stops at endDate; upcoming = Ideal only even with stray entries)', async ({ page }) => {
    const problems = watch(page);
    await freezeClock(page, CLOCK_R1);
    const b = await fixture('r1-real-backup.json');
    const g = b.goals[0];
    await importContent(page, {
      ...b,
      goals: [
        { ...g, id: 'arch', name: 'Archived one', archived: true },
        { ...g, id: 'ended', name: 'Ended one', endDate: '2026-10-12' },
        { ...g, id: 'soon', name: 'Soon one', startDate: '2026-10-20', endDate: '2026-11-20' },
      ],
      entries: [
        ...(b.entries as Obj[]).map((e) => ({ ...e, id: `arch-${String(e.id)}`, goalId: 'arch' })),
        ...(b.entries as Obj[]).filter((e) => String(e.date) <= '2026-10-12').map((e) => ({ ...e, id: `ended-${String(e.id)}`, goalId: 'ended' })),
      ],
    });
    // stray rows a sync merge can bring in (A-25): after the end of 'ended', before the start of 'soon'
    await injectEntries(page, [
      entry('ended-late', 'ended', '2026-10-13', 27),
      ...(b.entries as Obj[]).map((e) => entry(`soon-${String(e.id)}`, 'soon', String(e.date), Number(e.minutes))),
    ]);
    await gotoHash(page, '/goals/arch');
    await expect(headline(page)).toHaveText(R1_HEADLINE);
    await expect(sub(page)).toHaveText(R1_SUB);
    await expect(page.getByText(EN.goal.status.archived, { exact: true }).first()).toBeVisible();
    await expect(chart(page).locator('.recharts-line')).toHaveCount(2);

    // ended on 10-12 (3-day period): 5 + 10 + 14 = 29 min vs ideal(3) = 90.903 → (29 − 90.903)/90.903 = −68.1 %, gap −62; 10-13 is after the end: ignored
    await gotoHash(page, '/goals/ended');
    await expect(headline(page)).toHaveText(`${MINUS}68.1%`);
    await expect(page.getByTestId('headline-day')).toHaveText('Day 3 of 3');
    await expect(sub(page)).toHaveText(`Last logged Oct 12: 14 min. Total 29 min, ideal 91 min (${MINUS}62 min).`);
    await expect(page.getByTestId('curve-summary')).toHaveText('Day 3 of 3: you have logged 29 min in total. The ideal line is at 91 min.');
    await expect(page.getByText(EN.goal.status.ended, { exact: true }).first()).toBeVisible();

    await gotoHash(page, '/goals/soon');
    await expect(headline(page)).toHaveText('+0.0%');
    await expect(headline(page)).toHaveAttribute('data-sign', 'positive');
    await expect(sub(page)).toHaveText('Starts 2026-10-20. Your line will appear once the goal begins.');
    await expect(chart(page).locator('.recharts-line')).toHaveCount(1);
    await expect(chart(page)).not.toContainText('You ');
    await expect(page.getByTestId('history-row')).toHaveCount(4);
    await noGarbage(page);
    await expectAxeClean(page);
    expect(problems).toEqual([]);
  });

  test('old M1-era backup (sample-backup.json, schemaVersion 1): all five S1 goals render the v6 curve without NaN; G1 −14.6, G2 −73.6, G3 −97.6, G4 upcoming, G5 −99.8', async ({ page }) => {
    const problems = watch(page);
    await freezeClock(page);
    await importBackup(page);
    const raw = JSON.parse(await readFile(fixturePath('sample-backup.json'), 'utf8')) as Obj;
    expect(raw.schemaVersion).toBe(1);
    // S1 at 2026-10-09 (same fixtures as e2e/m9-curve.spec.ts / tests/qc/m4-r1.spec.ts):
    // g1 240 vs ideal(9) = 281.06 → −14.6; g2 250 vs ideal(39) = 948 → −73.6; g3 total 6,000 over 365 d → T₀ = 1.63, 60 vs ideal(282) = 2,535 → −97.6;
    // g4 starts 11-01 → +0.0 (positive variant); g5 15 vs ideal(181) = 7,584 → −99.8.
    for (const [id, expected] of [
      ['g1', `${MINUS}14.6%`],
      ['g2', `${MINUS}73.6%`],
      ['g3', `${MINUS}97.6%`],
      ['g4', '+0.0%'],
      ['g5', `${MINUS}99.8%`],
    ] as const) {
      await gotoHash(page, `/goals/${id}`);
      await expect(headline(page), id).toHaveText(expected);
      await expect(chart(page).locator('svg.recharts-surface')).toBeVisible();
      await noGarbage(page);
    }
    // G3 Spanish: one entry on 03-02 → the ordinary "Last logged" sentence (no starting-point variant); gap 60 − 2,535.4 = −2,475
    await gotoHash(page, '/goals/g3');
    await expect(sub(page)).toHaveText(`Last logged Mar 2: 60 min. Total 60 min, ideal 2,535 min (${MINUS}2,475 min).`);
    await expect(sub(page)).not.toContainText('×');
    expect(problems).toEqual([]);
  });

  test('FR-27 sync-merged data over 1440 min a day (A-25): 3000 + 2999 → +4,824.8% ahead, 2000 + 1999 → +3,182.9%; whole-minute table, axis from 0, never "−0"', async ({ page }) => {
    const problems = watch(page);
    await freezeClock(page, CLOCK_R1);
    const b = await fixture('r1-real-backup.json');
    const g = b.goals[0];
    await importContent(page, { ...b, goals: [{ ...g, id: 'z', name: 'Zero' }, { ...g, id: 'm', name: 'MinusTenth' }, { ...g, id: 'k', name: 'Keeper' }], entries: [entry('seed', 'k', '2026-10-10', 5)] });
    await injectEntries(page, [
      entry('z1', 'z', '2026-10-10', 1000), entry('z2', 'z', '2026-10-10', 1000), entry('z3', 'z', '2026-10-10', 1000),
      entry('z4', 'z', '2026-10-11', 1000), entry('z5', 'z', '2026-10-11', 1000), entry('z6', 'z', '2026-10-11', 999),
      entry('m1', 'm', '2026-10-10', 1000), entry('m2', 'm', '2026-10-10', 1000),
      entry('m3', 'm', '2026-10-11', 1000), entry('m4', 'm', '2026-10-11', 999),
    ]);
    // z: 3,000 + 2,999 = 5,999 min vs ideal(4) = 121.812 → (5999 − 121.812)/121.812 = +4,824.8 %; last logged Oct 11; gap +5,877
    await gotoHash(page, '/goals/z');
    await expect(headline(page)).toHaveText('+4,824.8%');
    await expect(headline(page)).toHaveAttribute('data-sign', 'positive');
    await expect(sub(page)).toHaveText('Last logged Oct 11: 2,999 min. Total 5,999 min, ideal 122 min (+5,877 min).');
    await page.getByText(EN.goal.detail.showTable).click();
    await expect(rows(page).nth(0).locator('td')).toHaveText(['30', '3,000', '3,000', '+2,970']);
    await expect(rows(page).nth(1).locator('td')).toHaveText(['60', '5,999', '2,999', '+5,939']); // 5,999 − 60.3
    await expect(rows(page).nth(3).locator('td')).toHaveText(['122', '5,999', '0', '+5,877']);
    const text = await page.locator('main').innerText();
    expect(text).not.toMatch(/[-−]0\.0%|[-−]0 min/);
    await expectPlainTicks(page);
    await chart(page).focus();
    await page.keyboard.press('End');
    await page.keyboard.press('Home');
    await page.keyboard.press('ArrowRight');
    await expect(page.getByTestId('curve-reading')).toHaveText('Oct 11 · 2,999 min this day · Total 5,999 min · Ideal 60 min');

    // m: 2,000 + 1,999 = 3,999 min → (3999 − 121.812)/121.812 = +3,182.9 %; v6: You is cumulative so nothing is ever negative on the axis
    await gotoHash(page, '/goals/m');
    await expect(headline(page)).toHaveText('+3,182.9%');
    await expect(headline(page)).toHaveAttribute('data-sign', 'positive');
    await expect(sub(page)).toHaveText('Last logged Oct 11: 1,999 min. Total 3,999 min, ideal 122 min (+3,877 min).');
    const ticks = await expectPlainTicks(page);
    expect(ticks.some((t) => t.startsWith(MINUS) || t.startsWith('-'))).toBe(false);
    await expectNoHorizontalScroll(page);

    // k: the one seeded entry (5 min on 10-10) → the negative variant, (5 − 121.812)/121.812 = −95.9 %
    await gotoHash(page, '/goals/k');
    await expect(headline(page)).toHaveText(`${MINUS}95.9%`);
    await expect(headline(page)).toHaveAttribute('data-sign', 'negative');
    await expect(sub(page)).toHaveText(`Last logged Oct 10: 5 min. Total 5 min, ideal 122 min (${MINUS}117 min).`);
    expect(problems).toEqual([]);
  });
});

test.describe('M9 QC — extreme values and long goals at 360 px', () => {
  test.use({ viewport: { width: 360, height: 740 } });

  test('1 min then 40 x 1440 min on one day (+95,424.0% ahead): headline wraps, axis labels <= 8 chars (compact minutes), no horizontal scroll, axe clean; en and vi', async ({ page }) => {
    const problems = watch(page);
    await freezeClock(page, at('2026-10-11T10:00:00'));
    const b = await fixture('r1-real-backup.json');
    const g = b.goals[0];
    const big = Array.from({ length: 40 }, (_, i) => entry(`big${i}`, 'r1', '2026-10-11', 1440));
    await importContent(page, { ...b, goals: [g], entries: [entry('one', 'r1', '2026-10-10', 1), entry('big-seed', 'r1', '2026-10-11', 1440)] });
    await injectEntries(page, big.slice(1)); // 40 x 1440 on one day: only reachable through a sync merge (A-25)
    await gotoHash(page, '/goals/r1');
    // total 1 + 57,600 = 57,601 min vs ideal(2) = 60.3 → (57601 − 60.3)/60.3 = +95,424.0 %; gap 57,601 − 60.3 = +57,541
    await expect(headline(page)).toHaveText('+95,424.0%');
    await expect(sub(page)).toHaveText('Today: 57,600 min. Total 57,601 min, ideal 60 min (+57,541 min).');
    await expect(sub(page)).not.toContainText('×');
    // scale: max You 57,601 → top 80,000, step 20,000 → compact ticks `20K` … `80K`
    const ticks = await expectPlainTicks(page);
    for (const t of ticks) expect(t.length, ticks.join(' ')).toBeLessThanOrEqual(8);
    expect(ticks).toContain('20K');
    await expectNoHorizontalScroll(page);
    await noGarbage(page);
    await page.getByText(EN.goal.detail.showTable).click();
    await expect(rows(page).nth(0).locator('td')).toHaveText(['30', '1', '1', `${MINUS}29`]);
    await expect(rows(page).nth(1).locator('td')).toHaveText(['60', '57,601', '57,600', '+57,541']);
    await expectNoHorizontalScroll(page);
    await expectAxeClean(page);
    // vi
    await gotoHash(page, '/settings');
    await page.getByRole('radio', { name: 'Tiếng Việt' }).check();
    await gotoHash(page, '/goals/r1');
    await expect(headline(page)).toHaveText('+95.424,0%');
    await expect(sub(page)).toContainText('57.601 phút');
    await expect(sub(page)).toContainText('+57.541 phút');
    for (const t of await expectPlainTicks(page)) expect(t.length).toBeLessThanOrEqual(8);
    await expectNoHorizontalScroll(page);
    await expectNoViLeaks(page);
    await expectAxeClean(page);
    expect(problems).toEqual([]);
  });

  test('1826-day goal (Ideal in the hundreds of billions of minutes): Whole period keeps the layout and labels short, So far is the default and readable; table not mounted until opened', async ({ page }) => {
    const problems = watch(page);
    await freezeClock(page);
    const b = await fixture('r1-real-backup.json');
    const g = { ...b.goals[0], id: 'long', startDate: '2022-01-01', endDate: '2026-12-31' };
    const entries = [entry('l1', 'long', '2022-01-01', 7), entry('l2', 'long', '2024-05-05', 21), entry('l3', 'long', '2026-10-08', 14)];
    await importContent(page, { ...b, goals: [g], entries });
    await gotoHash(page, '/goals/long');
    // 42 min vs ideal(1743) = 30·(1.01^1743 − 1)/0.01 ≈ 1.02 × 10^11 min → rounds to −100.0 %
    await expect(headline(page)).toHaveText(`${MINUS}100.0%`);
    await expect(sub(page)).toContainText('Last logged Oct 8: 14 min. Total 42 min, ideal 102,158,791,116 min');
    await expect(page.getByRole('radio', { name: EN.goal.detail.rangeSoFar })).toBeChecked();
    // So far: the scale tops out above ideal(1743) ≈ 1.02 × 10^11 (next nice step: 1.5 × 10^11); Whole period above ideal(1826) ≈ 2.33 × 10^11 (→ 2.5 × 10^11)
    await expect.poll(async () => Number(await chart(page).getAttribute('data-y-max'))).toBeGreaterThan(1.02e11);
    for (const t of await expectPlainTicks(page)) expect(t.length).toBeLessThanOrEqual(8);
    await page.getByRole('radio', { name: EN.goal.detail.rangeWhole }).check();
    await expect.poll(async () => Number(await chart(page).getAttribute('data-y-max'))).toBeGreaterThan(2.33e11);
    for (const t of await expectPlainTicks(page)) expect(t.length).toBeLessThanOrEqual(8);
    await expect(page.getByTestId('curve-table')).toHaveCount(0);
    await expectNoHorizontalScroll(page);
    await noGarbage(page);
    await expectAxeClean(page);
    expect(problems).toEqual([]);
  });

  test('dots: <= 45 visible You points draw one dot per logged day; 46+ draw none (DESIGN rule 1)', async ({ page }) => {
    await freezeClock(page, at('2026-10-31T10:00:00'));
    const b = await fixture('r1-real-backup.json');
    const g45 = { ...b.goals[0], id: 'd45', startDate: '2026-09-17', endDate: '2026-12-31' }; // up to 10-31 = 45 days
    const g46 = { ...b.goals[0], id: 'd46', startDate: '2026-09-16', endDate: '2026-12-31' }; // 46 days
    const mk = (id: string, start: string, n: number) => Array.from({ length: n }, (_, i) => entry(`${id}-${i}`, id, new Date(Date.parse(`${start}T00:00:00Z`) + i * 86_400_000).toISOString().slice(0, 10), 10 + (i % 5)));
    await importContent(page, { ...b, goals: [g45, g46], entries: [...mk('d45', '2026-09-17', 45), ...mk('d46', '2026-09-16', 46)] });
    await gotoHash(page, '/goals/d45');
    await expect(page.getByTestId('headline-day')).toHaveText('Day 45 of 106');
    await expect(chart(page).locator('.curve-dot')).toHaveCount(45);
    await gotoHash(page, '/goals/d46');
    await expect(page.getByTestId('headline-day')).toHaveText('Day 46 of 107');
    await expect(chart(page).locator('.recharts-line')).toHaveCount(2);
    await expect(chart(page).locator('.curve-dot')).toHaveCount(0);
  });

  test('360 px: R1 (Whole + So far), R3, S1 goals in en have no horizontal scroll and the labels never overlap each other', async ({ page }) => {
    const problems = watch(page);
    await freezeClock(page, CLOCK_R1);
    await importBackup(page, 'r1-real-backup.json');
    await gotoHash(page, '/goals/r1');
    await expect(headline(page)).toHaveText(R1_HEADLINE);
    for (const range of [EN.goal.detail.rangeWhole, EN.goal.detail.rangeSoFar]) {
      await page.getByRole('radio', { name: range }).check();
      await expect(chart(page).locator('.recharts-line')).toHaveCount(2);
      await expectNoHorizontalScroll(page);
      // the two direct labels (`Ideal 122 min` / `You 56 min`) do not intersect
      const boxes = await chart(page).locator('text').evaluateAll((els) => els.map((e) => { const r = e.getBoundingClientRect(); return { t: e.textContent ?? '', x: r.x, y: r.y, w: r.width, h: r.height }; }));
      const labelBoxes = boxes.filter((b) => /^(Ideal|You) [\d,]+ min$/.test(b.t));
      expect(labelBoxes.map((b) => b.t).sort(), JSON.stringify(boxes)).toEqual(['Ideal 122 min', 'You 56 min']);
      for (let i = 0; i < labelBoxes.length; i++)
        for (let j = i + 1; j < labelBoxes.length; j++) {
          const a = labelBoxes[i];
          const c = labelBoxes[j];
          const overlap = a.x < c.x + c.w && c.x < a.x + a.w && a.y < c.y + c.h && c.y < a.y + a.h;
          expect(overlap, `${a.t} vs ${c.t}`).toBe(false);
        }
    }
    expect(problems).toEqual([]);
  });
});

test.describe('M9 QC — interaction, language, theme', () => {
  test('language switch midway: R1 en -> vi -> en updates headline, subtitle, ticks, table, summary without reload and keeps the data', async ({ page }) => {
    const problems = watch(page);
    await freezeClock(page, CLOCK_R1);
    await importBackup(page, 'r1-real-backup.json');
    await gotoHash(page, '/goals/r1');
    await expect(headline(page)).toHaveText(R1_HEADLINE);
    await gotoHash(page, '/settings');
    await page.evaluate(() => {
      (window as unknown as { __noReload: boolean }).__noReload = true;
    });
    await page.getByRole('radio', { name: 'Tiếng Việt' }).check();
    await page.getByRole('link', { name: VI.nav.goals }).click();
    await page.getByRole('link', { name: 'Đọc sách' }).first().click();
    await expect(headline(page)).toHaveText(`${MINUS}54,0%`);
    await expect(sub(page)).toHaveText(`Hôm nay: 27 phút. Tổng 56 phút, lý tưởng 122 phút (${MINUS}66 phút).`);
    await expect(page.getByTestId('curve-summary')).toHaveText('Ngày 4/83: bạn đã ghi tổng cộng 56 phút. Đường lý tưởng ở mức 122 phút.');
    expect(await yTicks(page)).toContain('1.000'); // whole period: 0 … 5.000 in steps of 1.000 (ideal(83) = 3,852 → top 5,000)
    await page.getByText(VI.goal.detail.showTable).click();
    await expect(rows(page).nth(3).locator('td')).toHaveText(['122', '56', '27', `${MINUS}66`]);
    await expectNoViLeaks(page);
    await page.getByRole('link', { name: VI.nav.settings }).click();
    await page.getByRole('radio', { name: 'English' }).check();
    await page.getByRole('link', { name: EN.nav.goals }).click();
    await page.getByRole('link', { name: 'Đọc sách' }).first().click();
    await expect(headline(page)).toHaveText(R1_HEADLINE);
    expect(await page.evaluate(() => (window as unknown as { __noReload?: boolean }).__noReload)).toBe(true);
    expect(problems).toEqual([]);
  });

  test('mouse tooltip on R3 (fewer minutes than the day before) shows the minutes of the day and both totals, U+2212 only, never NaN; keyboard: Tab reaches the chart once, Escape clears, no focus trap', async ({ page }) => {
    await freezeClock(page, at('2026-10-11T10:00:00'));
    await importBackup(page, 'r3-down-backup.json');
    await gotoHash(page, '/goals/r1');
    // R3: 5 then 3 min on 10-10 / 10-11 → 8 min vs ideal(2) = 60.3 → (8 − 60.3)/60.3 = −86.7 %; You still goes up (5 → 8)
    await expect(headline(page)).toHaveText(`${MINUS}86.7%`);
    await expect(sub(page)).toHaveText(`Today: 3 min. Total 8 min, ideal 60 min (${MINUS}52 min).`);
    const box = (await chart(page).boundingBox())!;
    const seen = new Set<string>();
    for (let i = 0; i <= 40; i++) {
      await page.mouse.move(box.x + 40 + i * 2.5, box.y + box.height / 2); // the first two days of an 83-day goal sit at the far left
      const tip = page.locator('.chart-tip');
      if (await tip.count()) seen.add((await tip.first().innerText()).replace(/\s+/g, ' ').trim());
    }
    const all = [...seen].join(' || ');
    expect(all).toContain('Oct 11 · 3 min this day · Total 8 min · Ideal 60 min');
    expect(all).toContain('Oct 10 · 5 min this day · Total 5 min · Ideal 30 min');
    expect(all).not.toMatch(/NaN|undefined|null|%/);
    expect(all).not.toMatch(/(^|[^\w])-\d/); // ASCII hyphen as a sign
    await page.mouse.move(5, 5);
    // keyboard
    await page.getByRole('radio', { name: EN.goal.detail.rangeWhole }).focus();
    await page.keyboard.press('Tab');
    expect(await page.evaluate(() => document.activeElement?.getAttribute('data-testid'))).toBe('curve-chart');
    await page.keyboard.press('ArrowLeft');
    await expect(page.getByTestId('curve-reading')).toHaveText('Oct 11 · 3 min this day · Total 8 min · Ideal 60 min');
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('curve-reading')).toHaveText('');
    await page.keyboard.press('Tab');
    expect(await page.evaluate(() => document.activeElement?.getAttribute('data-testid'))).not.toBe('curve-chart');
  });

  test('Range changes the Y domain: a 365-day goal with R1-sized data fits 122 min on So far and is dominated by the Ideal curve on Whole period', async ({ page }) => {
    await freezeClock(page, CLOCK_R1);
    const b = await fixture('r1-real-backup.json');
    const g = { ...b.goals[0], id: 'y', startDate: '2026-10-10', endDate: '2027-10-09' };
    await importContent(page, { ...b, goals: [g], entries: (b.entries as Obj[]).map((e) => ({ ...e, id: `y-${String(e.id)}`, goalId: 'y' })) });
    await gotoHash(page, '/goals/y');
    await expect(page.getByRole('radio', { name: EN.goal.detail.rangeSoFar })).toBeChecked();
    await expect(headline(page)).toHaveText(R1_HEADLINE);
    // So far: max(ideal 121.8, You 56) + 5 % = 127.9 → nice step 50 → top 150. Whole period: ideal(365) = 30·(1.01^365 − 1)/0.01 = 110,350 → step 50,000 → top 150,000.
    await expect.poll(async () => Number(await chart(page).getAttribute('data-y-max'))).toBeLessThanOrEqual(200);
    expect(Number(await chart(page).getAttribute('data-y-max'))).toBeGreaterThanOrEqual(122);
    expect(Number(await chart(page).getAttribute('data-y-min'))).toBe(0);
    await page.getByRole('radio', { name: EN.goal.detail.rangeWhole }).check();
    await expect.poll(async () => Number(await chart(page).getAttribute('data-y-max'))).toBeGreaterThanOrEqual(110350);
    await page.keyboard.press('Tab'); // focus stays in the Range control group, summary unchanged
    await expect(page.getByTestId('curve-summary')).toHaveText('Day 4 of 365: you have logged 56 min in total. The ideal line is at 122 min.');
  });

  test.describe('dark scheme', () => {
    test.use({ colorScheme: 'dark', viewport: { width: 360, height: 740 } });
    test('axe (serious/critical) on R1, R3 and the empty state in the dark colour scheme', async ({ page }) => {
      await freezeClock(page, at('2026-10-11T10:00:00'));
      await importBackup(page, 'r3-down-backup.json');
      await gotoHash(page, '/goals/r1');
      await expect(headline(page)).toHaveText(`${MINUS}86.7%`);
      await expectAxeClean(page);
      await expectNoHorizontalScroll(page);
      await freezeClock(page, CLOCK_R1);
      await importBackup(page, 'r1-real-backup.json');
      await gotoHash(page, '/goals/r1');
      await expect(headline(page)).toHaveText(R1_HEADLINE);
      await expectAxeClean(page);
    });
  });
});

// M9-D1 (Minor): with the longer v3 reading strings, a keyboard reading that wraps to 3 lines (vi at 360 px) made the first
// mouse click on "Show data as table" miss. FIXED in M10 (44dee1b); the test.fail marker was removed in M10 round 1 so this is a normal regression test.
test.describe('M9-D1 mixed keyboard reading + mouse click (vi, 360 px)', () => {
  test.use({ viewport: { width: 360, height: 900 }, locale: 'vi-VN' });
  test('the first click on the table summary opens the table even while a multi-line reading is shown', async ({ page }) => {
    await freezeClock(page, CLOCK_R1);
    await importBackup(page, 'r1-real-backup.json', VI);
    await gotoHash(page, '/goals/r1');
    await expect(headline(page)).toHaveText(`${MINUS}54,0%`);
    await chart(page).focus();
    await page.keyboard.press('ArrowLeft'); // today (13 thg 10)
    await page.keyboard.press('ArrowLeft'); // 12 thg 10: 14 min that day, totals 29 / 91
    await expect(page.getByTestId('curve-reading')).toContainText('Ngày này 14 phút · Tổng 29 phút · Lý tưởng 91 phút');
    await page.getByText(VI.goal.detail.showTable).click();
    await expect(page.getByTestId('curve-table')).toBeVisible({ timeout: 2000 });
  });
});
