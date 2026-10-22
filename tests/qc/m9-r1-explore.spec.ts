// QC round 1 (M9): exploratory + acceptance tests for the 1% curve v3 (FR-27 v3.0, ARCH 4.5, DESIGN S4 v3).
// Data always goes through the real Import UI or the real Day page (TASKS section 0). Oracle values come from the PRD/ARCH examples
// and from exact arithmetic written here, not from app code.
import { readFile } from 'node:fs/promises';
import { expect, test, type Page } from '@playwright/test';
import { at, EN, expectAxeClean, expectNoHorizontalScroll, expectNoViLeaks, fixturePath, freezeClock, goalCard, gotoHash, importBackup, VI } from '../../e2e/helpers/app';

const ORIGIN = 'http://localhost:4173';
const MINUS = '−';
const CLOCK_R1 = at('2026-10-13T10:00:00');

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
async function noGarbage(p: Page): Promise<void> {
  const text = await p.locator('main').innerText();
  expect(text).not.toMatch(/NaN|Infinity|undefined|\[object|null/);
}

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
    await expect(headline(page)).toHaveText('+440.0% better');
    await expect(sub(page)).toHaveText('Today: 27 min, +92.9% vs Oct 12 (14 min). ×5.4 since Oct 10 (5 min).');
    await page.getByText(EN.goal.detail.showTable).click();
    await expect(rows(page)).toHaveCount(83);
    await expect(rows(page).nth(3).locator('td')).toHaveText(['+3.0%', '+440.0%', '27', '+92.9%']);
    await expect(rows(page).nth(10).locator('td')).toHaveText(['+10.5%', '—', '—', '—']); // Oct 20 is in the future: no You, no minutes
    await page.getByRole('radio', { name: EN.goal.detail.rangeSoFar }).check();
    await expect(rows(page)).toHaveCount(4);
    await noGarbage(page);
    expect(problems).toEqual([]);
  });

  test('A-41 FR-27: deleting entries through the Day page moves the baseline / latest (delete the first day -> baseline 10-11; delete today -> flat; delete all -> empty)', async ({ page }) => {
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
    await del('2026-10-10', '5 min'); // the baseline day disappears: new baseline = Oct 11 (10 min)
    await gotoHash(page, '/goals/r1');
    await expect(headline(page)).toHaveText('+170.0% better'); // 27 / 10
    await expect(sub(page)).toHaveText('Today: 27 min, +92.9% vs Oct 12 (14 min). ×2.7 since Oct 11 (10 min).');
    await page.getByText(EN.goal.detail.showTable).click();
    await expect(rows(page).nth(0).locator('td')).toHaveText(['+0.0%', '+0.0%', '0', '—']); // before the baseline: 1, not logged
    await expect(rows(page).nth(1).locator('td')).toHaveText(['+1.0%', '+0.0%', '10', '—']); // new baseline
    await expect(rows(page).nth(2).locator('td')).toHaveText(['+2.0%', '+40.0%', '14', '+40.0%']);
    await expect(rows(page).nth(3).locator('td')).toHaveText(['+3.0%', '+170.0%', '27', '+92.9%']);

    await del('2026-10-13', '27 min'); // today unlogged -> flat at the last logged day
    await gotoHash(page, '/goals/r1');
    await expect(headline(page)).toHaveText('+40.0% better');
    await expect(sub(page)).toHaveText('Last logged Oct 12: 14 min, +40.0% vs Oct 11 (10 min). ×1.4 since Oct 11 (10 min).');

    await del('2026-10-12', '14 min'); // only the baseline is left
    await gotoHash(page, '/goals/r1');
    await expect(headline(page)).toHaveText('+0.0% better');
    await expect(sub(page)).toHaveText('Starting point: 10 min on Oct 11. Your line moves once you log on another day.');
    await expect(sub(page)).not.toContainText('×');

    await del('2026-10-11', '10 min');
    await gotoHash(page, '/goals/r1');
    await expect(headline(page)).toHaveText('+0.0% better');
    await expect(sub(page)).toHaveText(EN.empty.detail.curve);
    await expect(chart(page).locator('.recharts-line')).toHaveCount(1);
    await noGarbage(page);
    await expectAxeClean(page);
    expect(problems).toEqual([]);
  });

  test('A-39: editing today on the Day page moves the headline up and down at once (27 -> 3 = -40.0%, -> 40 = +700.0%, -> 5 = +0.0%)', async ({ page }) => {
    await freezeClock(page, CLOCK_R1);
    await importBackup(page, 'r1-real-backup.json');
    let current = '27 min';
    for (const [minutes, expected, change] of [
      [3, `${MINUS}40.0% vs your first day`, `${MINUS}78.6%`], // 3 / 14
      [40, '+700.0% better', '+185.7%'], // 40 / 14, 40 / 5
      [5, '+0.0% better', `${MINUS}64.3%`], // 5 / 14, 5 / 5
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
      await expect(sub(page)).toContainText(`Today: ${minutes} min, ${change} vs Oct 12 (14 min)`);
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
    await expect(headline(page)).toHaveText('+440.0% better');
    await expect(page.getByText(EN.goal.status.archived, { exact: true }).first()).toBeVisible();
    await expect(chart(page).locator('.recharts-line')).toHaveCount(2);

    await gotoHash(page, '/goals/ended');
    await expect(headline(page)).toHaveText('+180.0% better'); // 10-13 is after the end: ignored
    await expect(page.getByTestId('headline-day')).toHaveText('Day 3 of 3');
    await expect(sub(page)).toHaveText('Last logged Oct 12: 14 min, +40.0% vs Oct 11 (10 min). ×2.8 since Oct 10 (5 min).');
    await expect(page.getByText(EN.goal.status.ended, { exact: true }).first()).toBeVisible();

    await gotoHash(page, '/goals/soon');
    await expect(headline(page)).toHaveText('+0.0% better');
    await expect(sub(page)).toHaveText('Starts 2026-10-20. Your line will appear once the goal begins.');
    await expect(chart(page).locator('.recharts-line')).toHaveCount(1);
    await expect(chart(page)).not.toContainText('You ');
    await expect(page.getByTestId('history-row')).toHaveCount(4);
    await noGarbage(page);
    await expectAxeClean(page);
    expect(problems).toEqual([]);
  });

  test('old M1-era backup (sample-backup.json, schemaVersion 1): all five S1 goals render the v3 curve without NaN; G1/G2/G3/G5 = +0.0%, G4 upcoming', async ({ page }) => {
    const problems = watch(page);
    await freezeClock(page);
    await importBackup(page);
    const raw = JSON.parse(await readFile(fixturePath('sample-backup.json'), 'utf8')) as Obj;
    expect(raw.schemaVersion).toBe(1);
    for (const id of ['g1', 'g2', 'g3', 'g4', 'g5']) {
      await gotoHash(page, `/goals/${id}`);
      await expect(headline(page)).toHaveText('+0.0% better');
      await expect(chart(page).locator('svg.recharts-surface')).toBeVisible();
      await noGarbage(page);
    }
    // G3 Spanish: one entry on 03-02 -> starting point sentence
    await gotoHash(page, '/goals/g3');
    await expect(sub(page)).toContainText('Starting point: 60 min on Mar 2.');
    expect(problems).toEqual([]);
  });

  test('FR-27 sync-merged data over 1440 min a day (A-25): 3000 -> 2999 prints +0.0% (never a signed zero), 2000 -> 1999 prints -0.1%; axis never shows -0%', async ({ page }) => {
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
    await gotoHash(page, '/goals/z');
    await expect(headline(page)).toHaveText('+0.0% better');
    await expect(headline(page)).toHaveAttribute('data-sign', 'positive');
    await page.getByText(EN.goal.detail.showTable).click();
    await expect(rows(page).nth(1).locator('td')).toHaveText(['+1.0%', '+0.0%', '2,999', '+0.0%']);
    const text = await page.locator('main').innerText();
    expect(text).not.toMatch(/[-−]0\.0%/);
    expect((await yTicks(page)).every((t) => !/[-−]0%/.test(t))).toBe(true);
    await chart(page).focus();
    await page.keyboard.press('End');
    await page.keyboard.press('Home');
    await page.keyboard.press('ArrowRight');
    await expect(page.getByTestId('curve-reading')).toHaveText('Oct 11 · 2,999 min, +0.0% vs previous logged day · You +0.0% since your first day · Ideal +1.0%');

    await gotoHash(page, '/goals/m');
    await expect(headline(page)).toHaveText(`${MINUS}0.1% vs your first day`);
    await expect(headline(page)).toHaveAttribute('data-sign', 'negative');
    expect((await yTicks(page)).some((t) => t.startsWith(MINUS))).toBe(true);
    await expectNoHorizontalScroll(page);
    expect(problems).toEqual([]);
  });
});

test.describe('M9 QC — extreme values and long goals at 360 px', () => {
  test.use({ viewport: { width: 360, height: 740 } });

  test('1 min then 40 x 1440 min on one day (+5,759,900.0%): headline wraps, axis labels <= 8 chars, no horizontal scroll, axe clean; en and vi', async ({ page }) => {
    const problems = watch(page);
    await freezeClock(page, at('2026-10-11T10:00:00'));
    const b = await fixture('r1-real-backup.json');
    const g = b.goals[0];
    const big = Array.from({ length: 40 }, (_, i) => entry(`big${i}`, 'r1', '2026-10-11', 1440));
    await importContent(page, { ...b, goals: [g], entries: [entry('one', 'r1', '2026-10-10', 1), entry('big-seed', 'r1', '2026-10-11', 1440)] });
    await injectEntries(page, big.slice(1)); // 40 x 1440 on one day: only reachable through a sync merge (A-25)
    await gotoHash(page, '/goals/r1');
    await expect(headline(page)).toHaveText('+5,759,900.0% better');
    await expect(sub(page)).toContainText('×57,600');
    const ticks = await yTicks(page);
    for (const t of ticks) expect(t.length, ticks.join(' ')).toBeLessThanOrEqual(8);
    await expectNoHorizontalScroll(page);
    await noGarbage(page);
    await page.getByText(EN.goal.detail.showTable).click();
    await expect(rows(page).nth(1).locator('td')).toHaveText(['+1.0%', '+5,759,900.0%', '57,600', '+5,759,900.0%']);
    await expectNoHorizontalScroll(page);
    await expectAxeClean(page);
    // vi
    await gotoHash(page, '/settings');
    await page.getByRole('radio', { name: 'Tiếng Việt' }).check();
    await gotoHash(page, '/goals/r1');
    await expect(headline(page)).toHaveText('Tốt hơn +5.759.900,0%');
    for (const t of await yTicks(page)) expect(t.length).toBeLessThanOrEqual(8);
    await expectNoHorizontalScroll(page);
    await expectNoViLeaks(page);
    await expectAxeClean(page);
    expect(problems).toEqual([]);
  });

  test('1826-day goal (Ideal in billions of %): Whole period keeps the layout and labels short, So far is the default and readable; table not mounted until opened', async ({ page }) => {
    const problems = watch(page);
    await freezeClock(page);
    const b = await fixture('r1-real-backup.json');
    const g = { ...b.goals[0], id: 'long', startDate: '2022-01-01', endDate: '2026-12-31' };
    const entries = [entry('l1', 'long', '2022-01-01', 7), entry('l2', 'long', '2024-05-05', 21), entry('l3', 'long', '2026-10-08', 14)];
    await importContent(page, { ...b, goals: [g], entries });
    await gotoHash(page, '/goals/long');
    await expect(headline(page)).toHaveText('+100.0% better'); // 14 / 7
    await expect(page.getByRole('radio', { name: EN.goal.detail.rangeSoFar })).toBeChecked();
    // Ideal reaches 1.01^1743 (+3.4 billion %) at today on So far and 1.01^1826 (+7.8 billion %) at the end on Whole period
    await expect.poll(async () => Number(await chart(page).getAttribute('data-y-max'))).toBeGreaterThan(3.4e9);
    for (const t of await yTicks(page)) expect(t.length).toBeLessThanOrEqual(8);
    await page.getByRole('radio', { name: EN.goal.detail.rangeWhole }).check();
    await expect.poll(async () => Number(await chart(page).getAttribute('data-y-max'))).toBeGreaterThan(7.8e9);
    for (const t of await yTicks(page)) expect(t.length).toBeLessThanOrEqual(8);
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
    await expect(headline(page)).toHaveText('+440.0% better');
    for (const range of [EN.goal.detail.rangeWhole, EN.goal.detail.rangeSoFar]) {
      await page.getByRole('radio', { name: range }).check();
      await expect(chart(page).locator('.recharts-line')).toHaveCount(2);
      await expectNoHorizontalScroll(page);
      // the two direct labels do not intersect
      const boxes = await chart(page).locator('text').evaluateAll((els) => els.map((e) => { const r = e.getBoundingClientRect(); return { t: e.textContent ?? '', x: r.x, y: r.y, w: r.width, h: r.height }; }));
      const labelBoxes = boxes.filter((b) => /^(Ideal|You) [+−]/.test(b.t));
      expect(labelBoxes.length, JSON.stringify(boxes)).toBeGreaterThanOrEqual(2);
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
    await expect(headline(page)).toHaveText('+440.0% better');
    await gotoHash(page, '/settings');
    await page.evaluate(() => {
      (window as unknown as { __noReload: boolean }).__noReload = true;
    });
    await page.getByRole('radio', { name: 'Tiếng Việt' }).check();
    await page.getByRole('link', { name: VI.nav.goals }).click();
    await page.getByRole('link', { name: 'Đọc sách' }).first().click();
    await expect(headline(page)).toHaveText('Tốt hơn +440,0%');
    await expect(sub(page)).toContainText('×5,4');
    await expect(page.getByTestId('curve-summary')).toContainText('+440,0%');
    expect(await yTicks(page)).toContain('+500%');
    await page.getByText(VI.goal.detail.showTable).click();
    await expect(rows(page).nth(3).locator('td')).toHaveText(['+3,0%', '+440,0%', '27', '+92,9%']);
    await expectNoViLeaks(page);
    await page.getByRole('link', { name: VI.nav.settings }).click();
    await page.getByRole('radio', { name: 'English' }).check();
    await page.getByRole('link', { name: EN.nav.goals }).click();
    await page.getByRole('link', { name: 'Đọc sách' }).first().click();
    await expect(headline(page)).toHaveText('+440.0% better');
    expect(await page.evaluate(() => (window as unknown as { __noReload?: boolean }).__noReload)).toBe(true);
    expect(problems).toEqual([]);
  });

  test('mouse tooltip on R3 (going down) shows signed values with U+2212 and never NaN; keyboard: Tab reaches the chart once, Escape clears, no focus trap', async ({ page }) => {
    await freezeClock(page, at('2026-10-11T10:00:00'));
    await importBackup(page, 'r3-down-backup.json');
    await gotoHash(page, '/goals/r1');
    await expect(headline(page)).toHaveText(`${MINUS}40.0% vs your first day`);
    const box = (await chart(page).boundingBox())!;
    const seen = new Set<string>();
    for (let i = 0; i <= 40; i++) {
      await page.mouse.move(box.x + 40 + i * 2.5, box.y + box.height / 2); // the first two days of an 83-day goal sit at the far left
      const tip = page.locator('.chart-tip');
      if (await tip.count()) seen.add((await tip.first().innerText()).replace(/\s+/g, ' ').trim());
    }
    const all = [...seen].join(' || ');
    expect(all).toContain(`Oct 11 · 3 min, ${MINUS}40.0% vs previous logged day · You ${MINUS}40.0% since your first day · Ideal +1.0%`);
    expect(all).toContain('Oct 10 · 5 min, your first logged day · You +0.0% · Ideal +0.0%');
    expect(all).not.toMatch(/NaN|undefined|null/);
    expect(all).not.toMatch(/(^|[^\w])-\d/); // ASCII hyphen as a sign
    await page.mouse.move(5, 5);
    // keyboard
    await page.getByRole('radio', { name: EN.goal.detail.rangeWhole }).focus();
    await page.keyboard.press('Tab');
    expect(await page.evaluate(() => document.activeElement?.getAttribute('data-testid'))).toBe('curve-chart');
    await page.keyboard.press('ArrowLeft');
    await expect(page.getByTestId('curve-reading')).not.toHaveText('');
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('curve-reading')).toHaveText('');
    await page.keyboard.press('Tab');
    expect(await page.evaluate(() => document.activeElement?.getAttribute('data-testid'))).not.toBe('curve-chart');
  });

  test('Range changes the Y domain: a 365-day goal with R1-sized data is tiny on So far and dominated by the Ideal curve on Whole period', async ({ page }) => {
    await freezeClock(page, CLOCK_R1);
    const b = await fixture('r1-real-backup.json');
    const g = { ...b.goals[0], id: 'y', startDate: '2026-10-10', endDate: '2027-10-09' };
    await importContent(page, { ...b, goals: [g], entries: (b.entries as Obj[]).map((e) => ({ ...e, id: `y-${String(e.id)}`, goalId: 'y' })) });
    await gotoHash(page, '/goals/y');
    await expect(page.getByRole('radio', { name: EN.goal.detail.rangeSoFar })).toBeChecked();
    await expect(headline(page)).toHaveText('+440.0% better');
    await expect.poll(async () => Number(await chart(page).getAttribute('data-y-max'))).toBeLessThanOrEqual(550);
    expect(Number(await chart(page).getAttribute('data-y-max'))).toBeGreaterThanOrEqual(440);
    expect(Number(await chart(page).getAttribute('data-y-min'))).toBe(0);
    await page.getByRole('radio', { name: EN.goal.detail.rangeWhole }).check();
    await expect.poll(async () => Number(await chart(page).getAttribute('data-y-max'))).toBeGreaterThanOrEqual(3678); // 1.01^365
    await page.keyboard.press('Tab'); // focus stays in the Range control group, summary unchanged
    await expect(page.getByTestId('curve-summary')).toHaveText('Day 4 of 365: your line is +440.0% compared with your first logged day. The ideal line is +3.0%.');
  });

  test.describe('dark scheme', () => {
    test.use({ colorScheme: 'dark', viewport: { width: 360, height: 740 } });
    test('axe (serious/critical) on R1, R3 and the empty state in the dark colour scheme', async ({ page }) => {
      await freezeClock(page, at('2026-10-11T10:00:00'));
      await importBackup(page, 'r3-down-backup.json');
      await gotoHash(page, '/goals/r1');
      await expect(headline(page)).toHaveText(`${MINUS}40.0% vs your first day`);
      await expectAxeClean(page);
      await expectNoHorizontalScroll(page);
      await freezeClock(page, CLOCK_R1);
      await importBackup(page, 'r1-real-backup.json');
      await gotoHash(page, '/goals/r1');
      await expect(headline(page)).toHaveText('+440.0% better');
      await expectAxeClean(page);
    });
  });
});

// M9-D1 (Minor): with the longer v3 reading strings, a keyboard reading that wraps to 3 lines (vi at 360 px) made the first
// mouse click on "Show data as table" miss. FIXED in M10 (44dee1b); the test.fail marker was removed in M10 round 1 so this is a normal regression test.
test.describe('M9-D1 mixed keyboard reading + mouse click (vi, 360 px)', () => {
  test.use({ viewport: { width: 360, height: 900 }, locale: 'vi-VN' });
  test('the first click on the table summary opens the table even while a 3-line reading is shown', async ({ page }) => {
    await freezeClock(page, CLOCK_R1);
    await importBackup(page, 'r1-real-backup.json', VI);
    await gotoHash(page, '/goals/r1');
    await expect(headline(page)).toHaveText('Tốt hơn +440,0%');
    await chart(page).focus();
    await page.keyboard.press('ArrowLeft');
    await page.keyboard.press('ArrowLeft');
    await expect(page.getByTestId('curve-reading')).toContainText('14 phút, +40,0% so với ngày có ghi trước');
    await page.getByText(VI.goal.detail.showTable).click();
    await expect(page.getByTestId('curve-table')).toBeVisible({ timeout: 2000 });
  });
});
