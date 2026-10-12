// QC round 1 (M3): independent exploratory + acceptance E2E for Day, Goal detail / History, Backup, i18n, a11y.
// Data always comes in through the real Import UI (TASKS §0).
import { readFile } from 'node:fs/promises';
import { expect, test, type Page } from '@playwright/test';
import {
  advanceTo,
  at,
  EN,
  expectAmount,
  expectAxeClean,
  expectNoHorizontalScroll,
  expectNoViLeaks,
  fixturePath,
  freezeClock,
  goalCard,
  gotoHash,
  importBackup,
  kvGet,
  startTimer,
  timerCard,
  toast,
  VI,
} from '../../e2e/helpers/app';

const ORIGIN = 'http://localhost:4173';

/** Collect page errors, console errors, JS dialogs and requests that leave the origin. */
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

/** Rows of a Dexie table. M7 (soft delete): live rows only by default; `raw: true` includes tombstones. */
async function dbAll(page: Page, store: 'goals' | 'entries', raw = false): Promise<Array<Record<string, unknown>>> {
  const rows = await page.evaluate(
    (s) =>
      new Promise<Array<Record<string, unknown>>>((resolve, reject) => {
        const req = indexedDB.open('one-percent-better');
        req.onerror = () => reject(req.error);
        req.onsuccess = () => {
          const r = req.result.transaction(s).objectStore(s).getAll();
          r.onsuccess = () => {
            resolve(r.result as Array<Record<string, unknown>>);
            req.result.close();
          };
          r.onerror = () => reject(r.error);
        };
      }),
    store,
  );
  return raw ? rows : rows.filter((r) => r.deletedAt === null || r.deletedAt === undefined);
}

type Sample = { goals: Array<Record<string, unknown>>; entries: Array<Record<string, unknown>>; settings: Record<string, unknown>; [k: string]: unknown };
async function sampleFile(): Promise<Sample> {
  return JSON.parse(await readFile(fixturePath('sample-backup.json'), 'utf8'));
}

/** Pick an in-memory file on Settings. */
async function upload(page: Page, content: string | Buffer, name = 'backup.json'): Promise<void> {
  if (!page.url().includes('#/settings')) await gotoHash(page, '/settings');
  await page.getByTestId('import-file').setInputFiles({ name, mimeType: 'application/json', buffer: Buffer.isBuffer(content) ? content : Buffer.from(content, 'utf8') });
}

async function importContent(page: Page, content: string | Buffer, copy: typeof EN | typeof VI = EN): Promise<void> {
  await upload(page, content);
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: copy.import.confirm }).click();
  // The 16k-entry file takes ~3 s alone but 8-12 s while 12 workers share the machine (M7 round 1 measured 8.1/10.3/11.6 s): give the replace room.
  await expect(dialog).toBeHidden({ timeout: 40_000 });
}

test.beforeEach(async ({ page }) => {
  await freezeClock(page);
});

test.describe('Day (M3-AC1..AC4) exploratory', () => {
  test.beforeEach(async ({ page }) => {
    await importBackup(page);
  });

  test('odd route params never crash: malformed dates give the invalid screen, extreme but valid dates give an empty day', async ({ page }) => {
    const problems = watch(page);
    for (const bad of ['abc', '2026-13-40', '2026-02-30', '2026-1-5', '2026-10-5', '20261005', '2026-10-05T10', '0000-01-01', '%20', '..%2F..', '%3Cscript%3Ealert(1)%3C%2Fscript%3E', '2027-02-29', '٢٠٢٦-١٠-٠٥']) {
      await gotoHash(page, `/day/${bad}`);
      await expect(page.getByTestId('day-invalid'), bad).toBeVisible();
      await expect(page.getByRole('link', { name: EN.day.invalidAction })).toHaveAttribute('href', '#/today');
    }
    // Leap day that exists
    await gotoHash(page, '/day/2024-02-29');
    await expect(page.getByText('Thursday, February 29, 2024')).toBeVisible();
    await expect(page.getByRole('heading', { name: EN.empty.day.noGoals })).toBeVisible();
    for (const edge of ['0001-01-01', '1900-01-01']) {
      await gotoHash(page, `/day/${edge}`);
      await expect(page.getByRole('heading', { level: 1, name: EN.day.title }), edge).toBeVisible();
      await expect(page.getByRole('heading', { name: EN.empty.day.noGoals }), edge).toBeVisible();
    }
    for (const future of ['9999-12-31', '2026-10-10', '2030-01-01']) {
      await gotoHash(page, `/day/${future}`);
      await expect(page.getByText(EN.errors.DATE_IN_FUTURE), future).toBeVisible();
      await expect(page.getByRole('button', { name: EN.goalCard.addEntry })).toHaveCount(0);
      await expect(page.getByRole('button', { name: EN.day.next })).toBeDisabled();
    }
    // path shapes
    await gotoHash(page, '/day/2026-10-05/extra');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await gotoHash(page, '/day');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    expect(problems).toEqual([]);
  });

  test('0001-01-01: Previous day from year 1 does not blow up', async ({ page }) => {
    const problems = watch(page);
    await gotoHash(page, '/day/0001-01-01');
    await page.getByRole('button', { name: EN.day.prev }).click();
    await expect(page.getByRole('heading', { level: 1, name: EN.day.title })).toBeVisible();
    expect(problems).toEqual([]);
    console.log('M3-QC after Previous from 0001-01-01 URL =', page.url());
  });

  test('DateNav: Previous x N, picker, Next stops at today, typing a future/blank date in the picker is ignored, focus stays', async ({ page }) => {
    await gotoHash(page, '/day/2026-10-09');
    await expect(page.getByRole('button', { name: EN.day.next })).toBeDisabled();
    const prev = page.getByRole('button', { name: EN.day.prev });
    for (let i = 0; i < 9; i++) await prev.click();
    await expect(page.getByLabel(EN.day.dateLabel)).toHaveValue('2026-09-30');
    await expect(prev).toBeFocused();
    await page.getByLabel(EN.day.dateLabel).fill('2026-10-20'); // future: ignored
    await expect(page).toHaveURL(/#\/day\/2026-09-30$/);
    await page.getByLabel(EN.day.dateLabel).fill('2026-10-08');
    await expect(page).toHaveURL(/#\/day\/2026-10-08$/);
    const next = page.getByRole('button', { name: EN.day.next });
    await next.click();
    await expect(page).toHaveURL(/#\/day\/2026-10-09$/);
    await expect(next).toBeDisabled();
    // keyboard: the whole nav is reachable and operable
    await page.getByRole('button', { name: EN.day.prev }).focus();
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(/#\/day\/2026-10-08$/);
    // browser Back goes back through visited days
    await page.goBack();
    await expect(page).toHaveURL(/#\/day\/2026-10-09$/);
  });

  test('goals not running that day are absent; start and end day boundaries are inclusive', async ({ page }) => {
    await gotoHash(page, '/day/2026-09-30'); // Read starts 10-01
    await expect(goalCard(page, 'Read')).toHaveCount(0);
    await expect(goalCard(page, 'Guitar')).toBeVisible();
    await gotoHash(page, '/day/2026-10-01');
    await expect(goalCard(page, 'Read')).toBeVisible();
    await gotoHash(page, '/day/2026-06-30'); // Old course last day
    await expect(goalCard(page, 'Old course')).toBeVisible();
    await expectAmount(page, 'Old course', '15/15');
    await gotoHash(page, '/day/2026-07-01');
    await expect(goalCard(page, 'Old course')).toHaveCount(0);
    await gotoHash(page, '/day/2026-03-02'); // only Spanish + Old course
    await expect(goalCard(page, 'Spanish')).toBeVisible();
    await expectAmount(page, 'Spanish', '60/17');
    await expect(goalCard(page, 'Guitar')).toHaveCount(0);
    // upcoming goal (Marathon prep, Nov) shows on a future day? not today, no future logging
    await gotoHash(page, '/day/2025-12-25');
    await expect(page.getByRole('heading', { name: EN.empty.day.noGoals })).toBeVisible();
    await page.getByRole('link', { name: EN.empty.day.noGoalsAction }).click();
    await expect(page).toHaveURL(/#\/goals$/);
  });

  test('back-fill on an ended goal up to the 1440 limit; over the limit shows the remaining minutes; the entry shows up in Goal detail', async ({ page }) => {
    await gotoHash(page, '/day/2026-06-30');
    const card = goalCard(page, 'Old course');
    await card.getByRole('button', { name: EN.goalCard.addEntry }).click();
    const form = card.getByRole('form', { name: /Add entry for Old course on 2026-06-30/ });
    await form.getByLabel(/^Minutes/).fill('1426');
    await form.getByRole('button', { name: EN.entry.form.save }).click();
    await expect(card.getByText(/up to 1,425 more/)).toBeVisible();
    await form.getByLabel(/^Minutes/).fill('1425');
    await form.getByRole('button', { name: EN.entry.form.save }).click();
    await expect(toast(page)).toHaveText(EN.toast.entrySaved);
    await expectAmount(page, 'Old course', '1,440/15');
    // goal detail
    await gotoHash(page, '/goals/g5');
    const rows = page.getByTestId('history-row');
    await expect(rows).toHaveCount(2);
    await expect(rows.first()).toContainText('2026-06-30');
    await expect(page.getByText(EN.goal.status.ended)).toBeVisible();
    // Today untouched
    await gotoHash(page, '/today');
    await expect(goalCard(page, 'Old course')).toHaveCount(0);
  });

  test('a manual entry on the same day as an older one sorts first in History (newest created first); Day link round-trips', async ({ page }) => {
    await gotoHash(page, '/day/2026-10-08');
    const guitar = goalCard(page, 'Guitar');
    await guitar.getByRole('button', { name: EN.goalCard.addEntry }).click();
    await guitar.getByLabel(/^Minutes/).fill('5');
    await guitar.getByLabel(/^Note/).fill('late addition');
    await guitar.getByRole('button', { name: EN.entry.form.save }).click();
    await expect(toast(page)).toHaveText(EN.toast.entrySaved);
    await gotoHash(page, '/goals/g2');
    const rows = page.getByTestId('history-row');
    await expect(rows).toHaveCount(14);
    await expect(rows.nth(0)).toContainText('late addition');
    await expect(rows.nth(0)).toContainText(EN.entry.source.manual);
    await expect(rows.nth(1)).toContainText('2026-10-08');
    // all dates non-increasing
    const dates = await rows.locator('td:first-child').allTextContents();
    expect([...dates].sort().reverse()).toEqual(dates);
    await rows.nth(0).getByRole('link').click();
    await expect(page).toHaveURL(/#\/day\/2026-10-08$/);
  });

  test('midnight: a Day page left open on "today" moves on when the clock passes midnight (Next becomes enabled, future check follows)', async ({ page }) => {
    await gotoHash(page, '/day/2026-10-09');
    await expect(page.getByRole('button', { name: EN.day.next })).toBeDisabled();
    await advanceTo(page, at('2026-10-10T00:05:00'));
    await expect(page.getByRole('button', { name: EN.day.next })).toBeEnabled();
    await page.getByRole('button', { name: EN.day.next }).click();
    await expect(page).toHaveURL(/#\/day\/2026-10-10$/);
    await expect(page.getByText(EN.errors.DATE_IN_FUTURE)).toHaveCount(0);
    await gotoHash(page, '/today');
    await expect(page.getByRole('link', { name: EN.today.pastDayLink })).toHaveAttribute('href', '#/day/2026-10-09');
  });

  test('Day/Goal detail routes work offline (precached app shell + IndexedDB)', async ({ page, context }) => {
    await page.evaluate(() => navigator.serviceWorker.ready);
    await page.reload();
    await context.setOffline(true);
    await gotoHash(page, '/day/2026-10-05');
    await expect(goalCard(page, 'Guitar')).toBeVisible();
    await gotoHash(page, '/goals/g2');
    await expect(page.getByTestId('history-row')).toHaveCount(13);
    await context.setOffline(false);
  });
});

test.describe('Goal detail (M3-AC5) exploratory', () => {
  test.beforeEach(async ({ page }) => {
    await importBackup(page);
  });

  test('route edge cases: unknown id, odd ids, /goals/new is the form (not a goal), trailing slash, edit still reachable', async ({ page }) => {
    const problems = watch(page);
    for (const id of ['khong-ton-tai', '__proto__', 'constructor', '%20', 'g2%2F..', '%3Cb%3Ex%3C%2Fb%3E']) {
      await gotoHash(page, `/goals/${id}`);
      await expect(page.getByRole('heading', { level: 1 }), id).toBeVisible();
      await expect(page.getByTestId('history'), id).toHaveCount(0);
    }
    await gotoHash(page, '/goals/new');
    await expect(page.getByRole('heading', { level: 1, name: EN.goal.form.titleNew })).toBeVisible();
    await gotoHash(page, '/goals/g2/');
    await expect(page.getByRole('heading', { level: 1, name: 'Guitar' })).toBeVisible();
    await gotoHash(page, '/goals/g2');
    await page.getByRole('link', { name: EN.common.edit }).click();
    await expect(page).toHaveURL(/#\/goals\/g2\/edit$/);
    await expect(page.getByLabel(/^Name/)).toHaveValue('Guitar');
    expect(problems).toEqual([]);
  });

  test('info line, badge per status and empty history (Marathon prep upcoming, no entries)', async ({ page }) => {
    await gotoHash(page, '/goals/g4');
    await expect(page.getByRole('heading', { level: 1, name: 'Marathon prep' })).toBeFocused();
    await expect(page.getByText(EN.goal.status.upcoming)).toBeVisible();
    await expect(page.getByText('45 min/day · 2026-11-01 – 2026-11-30')).toBeVisible();
    await expect(page.getByRole('heading', { name: EN.empty.detail.history })).toBeVisible();
    await expect(page.getByTestId('history')).toHaveCount(0);
    await gotoHash(page, '/goals/g3');
    await expect(page.getByText(/17 min\/day|100 h/)).toBeVisible();
    await expect(page.getByTestId('history-row')).toHaveCount(1);
    await expect(page.getByTestId('history-row').first()).toContainText('2026-03-02');
  });

  test('Delete from Goal detail: D2 dialog, Cancel keeps it, Confirm returns to Goals, goal and its entries are gone, timer cleared', async ({ page }) => {
    await gotoHash(page, '/today');
    await startTimer(page, 'Guitar');
    await gotoHash(page, '/goals/g2');
    await page.getByRole('button', { name: EN.common.delete }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await dialog.getByRole('button', { name: EN.common.cancel }).click();
    await expect(dialog).toBeHidden();
    await expect(page.getByRole('heading', { level: 1, name: 'Guitar' })).toBeVisible();
    await page.getByRole('button', { name: EN.common.delete }).click();
    await page.getByRole('dialog').getByRole('button', { name: EN.goal.delete.confirm }).click();
    await expect(page).toHaveURL(/#\/goals$/);
    await expect(toast(page)).toHaveText(EN.toast.goalDeleted);
    expect((await dbAll(page, 'entries')).filter((e) => e.goalId === 'g2')).toHaveLength(0); // live rows (M7: soft delete)
    const g2Raw = (await dbAll(page, 'entries', true)).filter((e) => e.goalId === 'g2');
    expect(g2Raw.length).toBeGreaterThan(0); // tombstones, all dirty, all with deletedAt
    for (const e of g2Raw) expect(e).toMatchObject({ dirty: 1 });
    for (const e of g2Raw) expect(e.deletedAt).toBeTruthy();
    expect(new Set(g2Raw.map((e) => e.deletedAt)).size).toBe(1); // one stamp for the whole cascade
    expect(await kvGet(page, 'activeTimer')).toBeNull();
    await gotoHash(page, '/goals/g2');
    await expect(page.getByTestId('history')).toHaveCount(0);
  });

  test('timer-created entry shows source Timer with the right date after crossing midnight', async ({ page }) => {
    await gotoHash(page, '/today');
    await startTimer(page, 'Guitar');
    await advanceTo(page, at('2026-10-10T00:20:00'));
    await timerCard(page).getByRole('button', { name: EN.timer.stop }).click();
    const dlg = page.getByTestId('stop-dialog');
    await dlg.getByRole('button', { name: EN.entry.form.save }).click();
    await expect(dlg).toBeHidden();
    await gotoHash(page, '/goals/g2');
    const first = page.getByTestId('history-row').first();
    await expect(first).toContainText('2026-10-09');
    await expect(first).toContainText(EN.entry.source.timer);
    await expect(first).toContainText(EN.common.emptyValue);
  });
});

test.describe('Backup (M3-AC6..AC11) exploratory', () => {
  test('export on an empty database round-trips: 0 goals, 0 entries accepted by Import', async ({ page }) => {
    await gotoHash(page, '/settings');
    const dl = page.waitForEvent('download');
    await page.getByRole('button', { name: EN.settings.backup.export }).click();
    const d = await dl;
    const text = await readFile((await d.path())!, 'utf8');
    const file = JSON.parse(text);
    expect([file.goals.length, file.entries.length]).toEqual([0, 0]);
    expect(file.settings.lastBackupAt).toMatch(/^2026-10-09T03:00:00/);
    await upload(page, text);
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText('0 goals, 0 entries');
  });

  test('exported file is stable/pretty JSON, UTF-8 with non-ASCII intact, and re-importable (UI round trip)', async ({ page }) => {
    await importBackup(page);
    // create awkward data through the UI first
    await gotoHash(page, '/day/2026-10-05');
    const g = goalCard(page, 'Guitar');
    await g.getByRole('button', { name: EN.goalCard.addEntry }).click();
    await g.getByLabel(/^Minutes/).fill('12');
    await g.getByLabel(/^Note/).fill('Điệp khúc "Ba" <b>x</b> 😀\\n');
    await g.getByRole('button', { name: EN.entry.form.save }).click();
    await expect(toast(page)).toHaveText(EN.toast.entrySaved);
    await gotoHash(page, '/settings');
    const dl = page.waitForEvent('download');
    await page.getByRole('button', { name: EN.settings.backup.export }).click();
    const text = await readFile((await (await dl).path())!, 'utf8');
    expect((JSON.parse(text) as { entries: Array<{ note: string }> }).entries.some((e) => e.note === 'Điệp khúc "Ba" <b>x</b> 😀\\n')).toBe(true);
    expect(text).toContain('Điệp khúc'); // not \u-escaped
    const before = await dbAll(page, 'entries');
    await importContent(page, text);
    const after = await dbAll(page, 'entries');
    const key = (e: Record<string, unknown>) => String(e.id);
    expect(after.sort((a, b) => key(a).localeCompare(key(b)))).toEqual(before.sort((a, b) => key(a).localeCompare(key(b))));
  });

  test('every bad file: right Alert text, no dialog, data unchanged, Alert goes away after a later good import', async ({ page }) => {
    await importBackup(page);
    const goalsBefore = await dbAll(page, 'goals');
    const entriesBefore = await dbAll(page, 'entries');
    const base = await sampleFile();
    const cases: Array<[string, string | Buffer, string | RegExp]> = [
      ['empty file', '', EN.errors.IMPORT_INVALID_JSON],
      ['truncated JSON', JSON.stringify(base).slice(0, 500), EN.errors.IMPORT_INVALID_JSON],
      ['binary garbage', Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0]), EN.errors.IMPORT_INVALID_JSON],
      ['array root', '[]', EN.errors.IMPORT_INVALID_SCHEMA],
      ['another app', JSON.stringify({ ...base, app: 'other-app' }), EN.errors.IMPORT_INVALID_SCHEMA],
      ['version 7', JSON.stringify({ ...base, schemaVersion: 7 }), EN.errors.IMPORT_UNSUPPORTED_VERSION.replace('{{v}}', '7')],
      ['orphan entry', JSON.stringify({ ...base, entries: [...base.entries, { ...base.entries[0], id: 'o1', goalId: 'ghost' }] }), EN.errors.IMPORT_INTEGRITY],
      ['> 5 MB (valid JSON padded with spaces)', Buffer.from(JSON.stringify(base) + ' '.repeat(5 * 1024 * 1024)), EN.errors.IMPORT_FILE_TOO_LARGE],
    ];
    for (const [label, content, message] of cases) {
      await upload(page, content);
      await expect(page.getByRole('alert'), label).toHaveText(message);
      await expect(page.getByRole('dialog'), label).toHaveCount(0);
      await expect(page.getByRole('button', { name: EN.settings.backup.import })).toBeEnabled();
    }
    expect(await dbAll(page, 'goals')).toEqual(goalsBefore);
    expect(await dbAll(page, 'entries')).toEqual(entriesBefore);
    await importContent(page, JSON.stringify(base));
    await expect(page.getByRole('alert')).toHaveCount(0);
  });

  test('UTF-8 BOM at the start of an otherwise valid file (what Windows Notepad writes) is accepted', async ({ page }) => {
    const base = await sampleFile();
    await upload(page, Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from(JSON.stringify(base), 'utf8')]));
    const alert = page.getByRole('alert');
    const dialog = page.getByRole('dialog');
    await expect(dialog.or(alert).first()).toBeVisible();
    console.log('M3-QC BOM file result:', (await dialog.count()) ? 'D3 dialog (accepted)' : `Alert: ${await alert.innerText()}`);
    await expect(dialog).toBeVisible();
  });

  test('near-limit valid file (about 4.5 MB, 16k entries) imports through the real UI without freezing', async ({ page }) => {
    const base = await sampleFile();
    const goals = Array.from({ length: 20 }, (_, i) => ({ ...base.goals[1], id: `big-g${i}`, name: `Big ${i}`, startDate: '2020-01-01', endDate: '2024-12-31' }));
    const entries: unknown[] = [];
    const start = new Date('2020-01-01T00:00:00Z').getTime();
    for (let d = 0; d < 800 && entries.length < 16_000; d++) {
      const date = new Date(start + d * 86_400_000).toISOString().slice(0, 10);
      for (const g of goals) entries.push({ ...base.entries[0], id: `be-${g.id}-${d}`, goalId: g.id, date, minutes: 20, note: 'n'.repeat(40) });
    }
    const text = JSON.stringify({ ...base, goals, entries }, null, 2);
    expect(Buffer.byteLength(text)).toBeLessThan(5 * 1024 * 1024);
    const t0 = Date.now();
    await importContent(page, text);
    console.log(`M3-QC browser import of ${(Buffer.byteLength(text) / 1048576).toFixed(2)} MiB / ${entries.length} entries took ${Date.now() - t0} ms`);
    await expect(toast(page)).toContainText(/20 goals, 16,?000 entries/);
    console.log('M3-QC big import toast:', await toast(page).innerText());
    await gotoHash(page, '/goals/big-g3');
    await expect(page.getByTestId('history-row')).toHaveCount(800);
    await gotoHash(page, '/day/2020-02-01');
    await expect(page.getByRole('article')).toHaveCount(20);
  });

  test('hostile names/why/notes from a file are shown literally everywhere (Today, Goals, Detail, Day, D2, title)', async ({ page }) => {
    const problems = watch(page);
    const base = await sampleFile();
    const evil = '<img src=x onerror="window.__pwned=1"><script>window.__pwned=2</script>';
    const goals = [{ ...base.goals[0], name: evil.slice(0, 60), why: evil }];
    const entries = [{ ...base.entries[0], goalId: base.goals[0].id, date: '2026-10-08', note: evil.slice(0, 200) }];
    await importContent(page, JSON.stringify({ ...base, goals, entries }));
    for (const hash of ['/today', '/goals', `/goals/${base.goals[0].id}`, '/day/2026-10-08']) {
      await gotoHash(page, hash);
      await expect(page.locator('main')).toContainText('<img src=x');
      await expect(page.locator('main img')).toHaveCount(0);
      await expect(page.locator('main script')).toHaveCount(0);
    }
    await gotoHash(page, `/goals/${base.goals[0].id}`);
    await page.getByRole('button', { name: EN.common.delete }).click();
    await expect(page.getByRole('dialog')).toContainText('<img');
    expect(await page.evaluate(() => (window as unknown as { __pwned?: number }).__pwned)).toBeUndefined();
    expect(problems).toEqual([]);
  });

  test('D3: Escape and Cancel keep data and return focus to Import; double-clicking Replace imports once; counts are right', async ({ page }) => {
    await importBackup(page);
    await upload(page, JSON.stringify({ ...(await sampleFile()), goals: [], entries: [] }));
    let dialog = page.getByRole('dialog');
    await expect(dialog).toContainText('0 goals, 0 entries');
    await expect(dialog).toContainText('5 goals, 23 entries');
    await expect(dialog.getByRole('button', { name: EN.common.cancel })).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
    await expect(page.getByRole('button', { name: EN.settings.backup.import })).toBeFocused();
    expect(await dbAll(page, 'goals')).toHaveLength(5);
    // Focus trap: Tab stays inside
    await upload(page, JSON.stringify({ ...(await sampleFile()), goals: [], entries: [] }));
    dialog = page.getByRole('dialog');
    // Wait until the modal is really open with focus inside (pressing Tab before showModal() ran raced under load: M7 round 1 flake).
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole('button', { name: EN.common.cancel })).toBeFocused();
    for (let i = 0; i < 4; i++) {
      await page.keyboard.press('Tab');
      expect(await page.evaluate(() => document.activeElement === document.body || !!document.activeElement?.closest('[role="dialog"], dialog'))).toBe(true);
    }
    await dialog.getByRole('button', { name: EN.import.confirm }).dblclick();
    await expect(dialog).toBeHidden();
    await expect(toast(page)).toHaveText('Backup imported: 0 goals, 0 entries');
    expect(await dbAll(page, 'goals')).toHaveLength(0); // live rows (M7: soft delete)
    const replacedRaw = await dbAll(page, 'goals', true);
    expect(replacedRaw).toHaveLength(5); // the 5 replaced goals are dirty tombstones
    for (const g of replacedRaw) expect(g).toMatchObject({ dirty: 1 });
    for (const g of replacedRaw) expect(g.deletedAt).toBeTruthy();
    expect((await dbAll(page, 'entries'))).toHaveLength(0);
    await gotoHash(page, '/today');
    await expect(page.getByRole('heading', { level: 2, name: EN.empty.today.noGoals })).toBeVisible();
    await expect(page.getByTestId('backup-banner')).toHaveCount(0); // no goals -> no nag
  });

  test('backup nag (A-12) after import follows lastBackupAt: 31 days -> shown with 31, exactly 30 -> hidden, null -> never; Settings and Today agree', async ({ page }) => {
    const base = await sampleFile();
    const withBackup = (iso: string | null) => JSON.stringify({ ...base, settings: { ...base.settings, lastBackupAt: iso } });
    await importContent(page, withBackup('2026-09-08T10:00:00+07:00'));
    await gotoHash(page, '/today');
    await expect(page.getByTestId('backup-banner')).toContainText('It\'s been 31 days since your last backup.');
    await expect(page.getByTestId('backup-banner').getByRole('link', { name: EN.backup.banner.action })).toBeVisible();
    await page.getByTestId('backup-banner').getByRole('link', { name: EN.backup.banner.action }).click();
    await expect(page).toHaveURL(/#\/settings$/);
    await expect(page.getByTestId('backup-banner')).toContainText('31 days');
    await expect(page.getByTestId('last-backup')).toHaveText('Last backup: 2026-09-08');
    await importContent(page, withBackup('2026-09-09T10:00:00+07:00'));
    await expect(page.getByTestId('backup-banner')).toHaveCount(0);
    await importContent(page, withBackup(null));
    await expect(page.getByTestId('backup-banner')).toContainText(EN.backup.banner.never);
    // Export clears the nag everywhere
    const dl = page.waitForEvent('download');
    await page.getByRole('button', { name: EN.settings.backup.export }).click();
    await dl;
    await expect(page.getByTestId('backup-banner')).toHaveCount(0);
    await gotoHash(page, '/today');
    await expect(page.getByTestId('backup-banner')).toHaveCount(0);
  });

  test('importing while a timer is running clears it live and replaces goals, also in a second open tab (no reload)', async ({ page, context }) => {
    await importBackup(page);
    await gotoHash(page, '/today');
    await startTimer(page, 'Guitar');
    const other = await context.newPage();
    await freezeClock(other);
    await gotoHash(other, '/today');
    await expect(timerCard(other)).toBeVisible();
    await importContent(page, JSON.stringify({ ...(await sampleFile()), goals: [{ ...(await sampleFile()).goals[0], name: 'Only one' }], entries: [] }));
    await expect(timerCard(other)).toHaveCount(0);
    await expect(goalCard(other, 'Only one')).toBeVisible();
    await expect(goalCard(other, 'Guitar')).toHaveCount(0);
    await gotoHash(page, '/today');
    await expect(timerCard(page)).toHaveCount(0);
    await expect(goalCard(page, 'Only one').getByRole('button', { name: EN.goalCard.startTimer })).toBeEnabled();
  });

  test('offline: export and import still work', async ({ page, context }) => {
    await importBackup(page);
    await page.evaluate(() => navigator.serviceWorker.ready);
    await page.reload();
    await context.setOffline(true);
    const dl = page.waitForEvent('download');
    await page.getByRole('button', { name: EN.settings.backup.export }).click();
    await dl;
    await importBackup(page);
    await context.setOffline(false);
  });

  test('no network request leaves the origin during export / import; no secrets in the exported file', async ({ page }) => {
    const problems = watch(page);
    await importBackup(page);
    const dl = page.waitForEvent('download');
    await page.getByRole('button', { name: EN.settings.backup.export }).click();
    const text = await readFile((await (await dl).path())!, 'utf8');
    expect(text).not.toMatch(/token|secret|password|apikey/i);
    expect(problems).toEqual([]);
  });
});

test.describe('Two tabs saving the same timer (M3-AC15 in a real browser)', () => {
  test('both tabs have the Stop dialog open and press Save at the same time: exactly one entry (8 rounds)', async ({ page, context }) => {
    await importBackup(page);
    for (let round = 0; round < 8; round++) {
      await gotoHash(page, '/today');
      await startTimer(page, 'Guitar');
      const other = await context.newPage();
      await freezeClock(other);
      await gotoHash(other, '/today');
      await expect(timerCard(other)).toBeVisible();
      await advanceTo(page, at('10:30'));
      await advanceTo(other, at('10:30'));
      await timerCard(page).getByRole('button', { name: EN.timer.stop }).click();
      await timerCard(other).getByRole('button', { name: EN.timer.stop }).click();
      for (const p of [page, other]) await p.getByTestId('stop-dialog').getByLabel(/^Minutes/).fill('10');
      const before = (await dbAll(page, 'entries')).length;
      await Promise.all([page.getByTestId('stop-dialog').getByRole('button', { name: EN.entry.form.save }).click(), other.getByTestId('stop-dialog').getByRole('button', { name: EN.entry.form.save }).click()]);
      await expect(timerCard(page)).toHaveCount(0);
      await expect(timerCard(other)).toHaveCount(0);
      // The tab that lost the race keeps its Stop dialog open with "There's no timer running." (UX note in the report).
      const dialogs = [page, other].map((p) => p.getByTestId('stop-dialog'));
      await expect.poll(async () => (await Promise.all(dialogs.map((d) => d.isVisible()))).filter(Boolean).length).toBeLessThanOrEqual(1);
      for (const d of dialogs) {
        if (await d.isVisible()) {
          await expect(d.getByRole('alert')).toContainText(EN.errors.TIMER_NOT_RUNNING);
          await d.getByRole('button', { name: EN.timer.keepRunning }).click();
          await expect(d).toBeHidden();
        }
      }
      const entries = await dbAll(page, 'entries');
      expect(entries.length - before, `round ${round}`).toBe(1);
      await other.close();
      await freezeClock(page);
    }
  });
});

test.describe('Vietnamese (M3-AC13) exploratory at 360 px', () => {
  test.use({ locale: 'vi-VN', viewport: { width: 360, height: 740 } });

  test('Day, Goal detail, Settings(backup + errors + D3), Today(banner + link) show no English leaks, no horizontal scroll, axe clean', async ({ page }) => {
    await importBackup(page, 'sample-backup.json', VI);
    for (const hash of ['/today', '/day/2026-10-08', '/day/2026-10-10', '/day/abc', '/day/2025-01-01', '/goals', '/goals/g2', '/goals/g4', '/goals/khong-co', '/settings']) {
      await gotoHash(page, hash);
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
      await expectNoViLeaks(page);
      await expectNoHorizontalScroll(page);
      await expectAxeClean(page);
    }
    await gotoHash(page, '/day/2026-10-08');
    await expect(page.getByText('Thứ Năm, 8 tháng 10, 2026')).toBeVisible();
    await expect(page.locator('html')).toHaveAttribute('lang', 'vi');
    await gotoHash(page, '/goals/g2');
    await expect(page.getByTestId('history-row').first().getByRole('link')).toHaveText('08/10/2026');
    await gotoHash(page, '/settings');
    for (const [content, expected] of [
      ['{abc', VI.errors.IMPORT_INVALID_JSON],
      [JSON.stringify({ ...(await sampleFile()), schemaVersion: 3 }), VI.errors.IMPORT_UNSUPPORTED_VERSION.replace('{{v}}', '3')],
    ] as const) {
      await upload(page, content);
      await expect(page.getByRole('alert')).toHaveText(expected);
      await expectNoViLeaks(page);
      await expectNoHorizontalScroll(page);
    }
    await upload(page, await readFile(fixturePath('sample-backup.json')));
    await expect(page.getByRole('dialog')).toContainText('5 mục tiêu, 23 lần ghi');
    await expectNoViLeaks(page);
    await expectAxeClean(page);
    await expectNoHorizontalScroll(page);
    await page.screenshot({ path: 'test-results/qc-m3-vi-d3-360.png' });
  });

  test('page language persists through import (vi stays vi) and after reload', async ({ page }) => {
    await importBackup(page, 'sample-backup.json', VI);
    await page.reload();
    await expect(page.locator('html')).toHaveAttribute('lang', 'vi');
    await page.getByRole('radio', { name: 'English' }).check().catch(() => undefined);
  });
});

test.describe('Layout / a11y at 360 and 1440', () => {
  for (const [w, h] of [
    [360, 740],
    [1440, 900],
  ] as const) {
    test(`screens at ${w}px: no horizontal scroll, axe clean (en), screenshots`, async ({ page }) => {
      await page.setViewportSize({ width: w, height: h });
      await importBackup(page);
      for (const [name, hash] of [
        ['today', '/today'],
        ['day', '/day/2026-10-08'],
        ['day-future', '/day/2026-10-10'],
        ['day-invalid', '/day/zzz'],
        ['detail', '/goals/g2'],
        ['detail-empty', '/goals/g4'],
        ['settings', '/settings'],
      ] as const) {
        await gotoHash(page, hash);
        await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
        await expectNoHorizontalScroll(page);
        await expectAxeClean(page);
        await page.screenshot({ path: `test-results/qc-m3-${name}-${w}.png`, fullPage: true });
      }
      await gotoHash(page, '/settings');
      await upload(page, '{abc');
      await expectAxeClean(page);
      await page.screenshot({ path: `test-results/qc-m3-settings-error-${w}.png`, fullPage: true });
    });
  }
});

test.describe('Import of out-of-range but schema-valid data, and the past-day link states', () => {
  // Re-targeted in M5 round 1 (M3-D3 was fixed and the dispute settled by the orchestrator: import validates like the form).
  // Original intent kept: data the app itself would refuse to create must never reach the screens. Before M5 the import let it
  // through and the test checked that no screen crashed; now each violation is refused at the import boundary with an
  // IMPORT_* Alert, the confirm dialog (D3) never opens, and the data already in the database is untouched. A legitimate
  // archived goal still imports and renders on every screen.
  test('goals the app itself would refuse (daily target 600000, 100-year period, future entry) are rejected at import with IMPORT_*; an archived goal still imports and renders', async ({ page }) => {
    const problems = watch(page);
    await importBackup(page);
    const goalsBefore = await dbAll(page, 'goals');
    const entriesBefore = await dbAll(page, 'entries');
    expect(goalsBefore.length).toBe(5);
    const base = await sampleFile();
    const g = base.goals[0] as Record<string, unknown>;
    const huge = { ...g, id: 'huge', name: 'Huge', targetMinutes: 600_000 };
    const long = { ...g, id: 'long', name: 'Long', startDate: '2000-01-01', endDate: '2099-12-31' };
    const arch = { ...g, id: 'arch', name: 'Arch', archived: true };
    const fut = { ...(base.entries[0] as Record<string, unknown>), id: 'fut', goalId: 'long', date: '2030-05-05' };
    const cases: Array<[string, Sample, string]> = [
      ['daily target 600000', { ...base, goals: [huge], entries: [] }, EN.errors.IMPORT_INVALID_SCHEMA],
      ['100-year period', { ...base, goals: [long], entries: [] }, EN.errors.IMPORT_INVALID_SCHEMA],
      ['entry dated after today', { ...base, goals: [{ ...g, id: 'ok', name: 'Ok' }], entries: [{ ...fut, goalId: 'ok', date: '2026-10-10' }] }, EN.errors.IMPORT_INTEGRITY],
    ];
    for (const [label, file, message] of cases) {
      await upload(page, JSON.stringify(file));
      await expect(page.getByRole('alert'), label).toHaveText(message);
      await expect(page.getByRole('dialog'), label).toHaveCount(0);
    }
    // nothing was replaced
    expect((await dbAll(page, 'goals')).map((x) => x.id).sort()).toEqual(goalsBefore.map((x) => x.id).sort());
    expect((await dbAll(page, 'entries')).length).toBe(entriesBefore.length);
    // a legitimate archived goal imports and every screen renders
    await importContent(page, JSON.stringify({ ...base, goals: [arch], entries: [] }));
    for (const hash of ['/today', '/goals', '/goals/arch', '/review', '/day/2026-10-08']) {
      await gotoHash(page, hash);
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    }
    expect(problems).toEqual([]);
  });

  test('"Missed a day?" link: hidden with no goals, shown when goals exist but none is active today', async ({ page }) => {
    await gotoHash(page, '/today');
    await expect(page.getByRole('link', { name: EN.today.pastDayLink })).toHaveCount(0);
    const base = await sampleFile();
    await importContent(page, JSON.stringify({ ...base, goals: [base.goals[3]], entries: [] }));
    await gotoHash(page, '/today');
    await expect(page.getByRole('heading', { name: EN.empty.today.noActive })).toBeVisible();
    await expect(page.getByRole('link', { name: EN.today.pastDayLink })).toBeVisible();
  });
});
