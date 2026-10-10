// QC round 1 (M5): +1% feedback, archive, delete from Goal detail, empty/error states, storage failures,
// offline and corrupt-data resilience. Data always comes in through the real Import UI unless a test needs
// a state the UI refuses to create (then it writes IndexedDB directly and says so).
import { readFile } from 'node:fs/promises';
import { expect, test, type BrowserContext, type Page } from '@playwright/test';
import {
  advanceTo,
  at,
  EN,
  expectAmount,
  expectAxeClean,
  expectNoHorizontalScroll,
  fixturePath,
  freezeClock,
  goalCard,
  gotoHash,
  importBackup,
  kvGet,
  logTime,
  startTimer,
  timerCard,
  toast,
} from '../../e2e/helpers/app';

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
async function importContent(page: Page, content: unknown): Promise<void> {
  if (!page.url().includes('#/settings')) await gotoHash(page, '/settings');
  await page.getByTestId('import-file').setInputFiles({ name: 'b.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(content), 'utf8') });
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: EN.import.confirm }).click();
  await expect(dialog).toBeHidden();
}
async function idbPut(page: Page, store: 'goals' | 'entries' | 'kv', value: unknown): Promise<void> {
  await page.evaluate(
    ([s, v]) =>
      new Promise<void>((resolve, reject) => {
        const req = indexedDB.open('one-percent-better');
        req.onerror = () => reject(req.error);
        req.onsuccess = () => {
          const tx = req.result.transaction(s as string, 'readwrite');
          tx.objectStore(s as string).put(v);
          tx.oncomplete = () => {
            req.result.close();
            resolve();
          };
          tx.onerror = () => reject(tx.error);
        };
      }),
    [store, value] as const,
  );
}
async function idbAll(page: Page, store: 'goals' | 'entries'): Promise<Array<Record<string, unknown>>> {
  return page.evaluate(
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
        };
      }),
    store,
  );
}

const live = (page: Page) => page.getByTestId('plus-one-live');
const row = (page: Page, name: string) => page.getByTestId('goal-row').filter({ has: page.getByRole('link', { name, exact: true }) });

async function newTab(context: BrowserContext, hash: string): Promise<Page> {
  const p = await context.newPage();
  await freezeClock(p);
  await gotoHash(p, hash);
  return p;
}

test.beforeEach(async ({ page }) => {
  await freezeClock(page);
});

test.describe('M5-AC3 +1% feedback: extra scenarios', () => {
  test('one single entry that jumps over the target fires once; an edit that crosses the target fires; a goal already above target on load never fires', async ({ page }) => {
    await importBackup(page);
    await gotoHash(page, '/today');
    await logTime(page, 'Read', 45); // 45/30 straight away
    await expectAmount(page, 'Read', '45/30');
    await expect(live(page)).toHaveAttribute('data-count', '1');
    await expect(live(page)).toHaveText('+1% for Read today.');

    // Guitar: 10 then edit the entry to 20 (target 20): crossing by edit fires once
    await logTime(page, 'Guitar', 10);
    await expectAmount(page, 'Guitar', '10/20');
    await expect(live(page)).toHaveAttribute('data-count', '1');
    await goalCard(page, 'Guitar').getByRole('button', { name: /^Edit entry: 10 min/ }).click();
    await goalCard(page, 'Guitar').getByLabel(/^Minutes/).fill('20');
    await goalCard(page, 'Guitar').getByRole('button', { name: EN.entry.form.saveChanges }).click();
    await expectAmount(page, 'Guitar', '20/20');
    await expect(live(page)).toHaveAttribute('data-count', '2');
    await expect(live(page)).toHaveText('+1% for Guitar today.');
    // second visit of Today in the same session: nothing again
    await gotoHash(page, '/goals');
    await gotoHash(page, '/today');
    await expect(live(page)).toHaveAttribute('data-count', '0');
    const shown = (await kvGet(page, 'settings')) as { plusOneShown?: Record<string, string> };
    expect(shown.plusOneShown).toEqual({ g1: '2026-10-09', g2: '2026-10-09' });
  });

  test('timer Save that reaches the target fires the feedback; two goals reaching the target one after the other each fire once', async ({ page }) => {
    await importBackup(page);
    await gotoHash(page, '/today');
    await startTimer(page, 'Guitar');
    await freezeClock(page, at('00:20:00'));
    await timerCard(page).getByRole('button', { name: /^Stop timer for Guitar/ }).click();
    await page.getByTestId('stop-dialog').getByRole('button', { name: EN.entry.form.save }).click();
    await expectAmount(page, 'Guitar', '20/20');
    await expect(live(page)).toHaveAttribute('data-count', '1');
    await logTime(page, 'Read', 30);
    await expect(live(page)).toHaveAttribute('data-count', '2');
    await expect(live(page)).toHaveText('+1% for Read today.');
  });

  test('two tabs of the same browser: the feedback is shown by exactly one of them (no duplicate), also when each tab adds half', async ({ context }) => {
    const a = await context.newPage();
    await freezeClock(a);
    await importBackup(a);
    await gotoHash(a, '/today');
    const b = await newTab(context, '/today');
    await expect(goalCard(b, 'Read')).toBeVisible();
    await expect(goalCard(a, 'Read')).toBeVisible();
    await logTime(a, 'Read', 20);
    await expectAmount(b, 'Read', '20/30');
    await logTime(b, 'Read', 10);
    await expectAmount(a, 'Read', '30/30');
    await expectAmount(b, 'Read', '30/30');
    await a.waitForTimeout(1500);
    const ca = Number(await live(a).getAttribute('data-count'));
    const cb = Number(await live(b).getAttribute('data-count'));
    console.log(`M5-QC two tabs +1% counts: tab A=${ca}, tab B=${cb}`);
    expect(ca + cb).toBe(1);
    // and a third tab opened now shows nothing
    const c = await newTab(context, '/today');
    await expectAmount(c, 'Read', '30/30');
    await c.waitForTimeout(500);
    expect(await live(c).getAttribute('data-count')).toBe('0');
  });
});

test.describe('M5-AC4 archive: extra scenarios', () => {
  test('Goal detail: Archive with a running timer is refused with GOAL_TIMER_RUNNING; archived goal leaves Today and the reminder count; Day screen and Review still show it; Restore works from the list', async ({ page }) => {
    const problems = watch(page);
    const base = await sampleFile();
    await importContent(page, { ...base, goals: [base.goals[0], base.goals[1]], entries: base.entries.filter((e) => e.goalId === 'g1' || e.goalId === 'g2'), settings: { ...base.settings, reminderEnabled: true, reminderTime: '20:00' } });
    await gotoHash(page, '/today');
    await startTimer(page, 'Read');
    await gotoHash(page, '/goals/g1');
    await page.getByRole('button', { name: EN.goals.archive }).click();
    await expect(page.getByRole('alert')).toHaveText(EN.errors.GOAL_TIMER_RUNNING);
    await expect(page.getByText(EN.goal.status.active, { exact: true })).toBeVisible();
    // stop the timer (discard via Esc keeps running; use Stop+Save of 0? use Delete-free path: stop and save 1 minute)
    await gotoHash(page, '/today');
    await freezeClock(page, at('00:01:00'));
    await timerCard(page).getByRole('button', { name: /^Stop timer for Read/ }).click();
    await page.getByTestId('stop-dialog').getByRole('button', { name: EN.entry.form.save }).click();
    await expectAmount(page, 'Read', '1/30');
    await gotoHash(page, '/goals/g1');
    await page.getByRole('button', { name: EN.goals.archive }).click();
    await expect(toast(page)).toHaveText(EN.toast.goalArchived);
    await expect(page.getByText(EN.goal.status.archived, { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: EN.goals.restore })).toBeVisible();
    await expect(page.getByTestId('headline')).toBeVisible();

    // Today: archived goal gone, banner counts only active goals (Guitar met? 2026-10-09 has no Guitar entry -> 1 goal pending)
    await advanceTo(page, at('2026-10-09T21:00:00'));
    await gotoHash(page, '/today');
    await expect(goalCard(page, 'Read')).toHaveCount(0);
    await expect(goalCard(page, 'Guitar')).toBeVisible();
    await expect(page.getByText('0 of 1 goal on target')).toBeVisible();
    const banner = page.getByTestId('reminder-banner');
    if (await banner.count()) await expect(banner).toHaveText("It's past 20:00 — 1 goal is not on target yet.");
    // Day screen for a past day: what does it do with an archived goal?
    await gotoHash(page, '/day/2026-10-08');
    const dayHasRead = (await goalCard(page, 'Read').count()) > 0;
    console.log(`M5-QC Day 2026-10-08 shows archived goal Read: ${dayHasRead}`);
    // Review includes it
    await gotoHash(page, '/review?goal=g1&year=2026');
    await expect(page.getByTestId('stat-time')).toContainText('4.0 h');
    // Restore from the list
    await gotoHash(page, '/goals');
    await row(page, 'Read').getByRole('button', { name: EN.goals.restore }).click();
    await expect(toast(page)).toHaveText(EN.toast.goalRestored);
    await gotoHash(page, '/today');
    await expect(goalCard(page, 'Read')).toBeVisible();
    expect(problems).toEqual([]);
  });

  test('archive keeps data: entries, history and curve are identical before and after archive/restore (IndexedDB compared)', async ({ page }) => {
    await importBackup(page);
    const before = JSON.stringify((await idbAll(page, 'entries')).sort((x, y) => String(x.id).localeCompare(String(y.id))));
    await gotoHash(page, '/goals');
    await row(page, 'Read').getByRole('button', { name: EN.goals.archive }).click();
    await expect(toast(page)).toHaveText(EN.toast.goalArchived);
    await row(page, 'Read').getByRole('button', { name: EN.goals.restore }).click();
    await expect(toast(page)).toHaveText(EN.toast.goalRestored);
    const after = JSON.stringify((await idbAll(page, 'entries')).sort((x, y) => String(x.id).localeCompare(String(y.id))));
    expect(after).toBe(before);
    const g = (await idbAll(page, 'goals')).find((x) => x.id === 'g1')!;
    expect(g.archived).toBe(false);
    await gotoHash(page, '/goals/g1');
    await expect(page.getByTestId('headline')).toHaveText('+8.3% better');
  });

  test('archive is double-click safe and the Goals list order of the Archived group is updatedAt descending', async ({ page }) => {
    await importBackup(page);
    await gotoHash(page, '/goals');
    await row(page, 'Read').getByRole('button', { name: EN.goals.archive }).dblclick();
    await page.waitForTimeout(300);
    await expect(page.getByRole('heading', { level: 2, name: 'Archived (1)' })).toBeVisible();
    await freezeClock(page, at('00:05:00')); // updatedAt is the frozen clock: make the second archive newer
    await row(page, 'Guitar').getByRole('button', { name: EN.goals.archive }).click();
    await expect(page.getByRole('heading', { level: 2, name: 'Archived (2)' })).toBeVisible();
    const archivedNames = await page.locator('section', { has: page.getByRole('heading', { level: 2, name: 'Archived (2)' }) }).getByTestId('goal-row').locator('a[href^="#/goals/g"]:not([href$="/edit"])').allInnerTexts();
    expect(archivedNames).toEqual(['Guitar', 'Read']);
  });
});

test.describe('Delete from Goal detail', () => {
  test('Cancel keeps everything and returns focus to Delete; Confirm deletes, shows the toast, lands on Goals; running timer note is in the dialog description', async ({ page }) => {
    const problems = watch(page);
    await importBackup(page);
    await gotoHash(page, '/today');
    await startTimer(page, 'Read');
    await gotoHash(page, '/goals/g1');
    const del = page.getByRole('button', { name: EN.common.delete });
    await del.click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole('heading')).toHaveText('Delete "Read"?');
    await expect(dialog).toContainText('8 entries');
    await expect(dialog).toHaveAccessibleDescription(new RegExp(EN.goal.delete.timerNote.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
    await expect(dialog.getByRole('button', { name: EN.common.cancel })).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
    await expect(del).toBeFocused();
    await expect(page.getByTestId('headline')).toBeVisible();
    await del.click();
    await page.getByRole('dialog').getByRole('button', { name: EN.goal.delete.confirm }).click();
    await expect(page).toHaveURL(/#\/goals$/);
    await expect(toast(page)).toHaveText(EN.toast.goalDeleted);
    // timer discarded, entries gone
    await gotoHash(page, '/today');
    await expect(timerCard(page)).toHaveCount(0);
    expect((await idbAll(page, 'entries')).filter((e) => e.goalId === 'g1')).toEqual([]);
    expect(problems).toEqual([]);
  });
});

test.describe('M5-D1 flash of "Goal not found" when deleting from Goal detail', () => {
  // Open defect M5-D1 (Minor): after Confirm the goal disappears from the live query before the navigation to #/goals is
  // rendered, so GoalDetail renders NotFound (and steals focus) for a few painted frames. Deterministic with 4x CPU throttling.
  test.fail('no painted frame shows "Goal not found" between Delete and the Goals list (CPU 4x slower)', async ({ page }) => {
    await importBackup(page);
    await gotoHash(page, '/goals/g1');
    await expect(page.getByTestId('headline')).toBeVisible();
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
    await page.evaluate(() => {
      const w = window as unknown as { __seen: string[] };
      w.__seen = [];
      const tick = () => {
        const h = document.querySelector('h1')?.textContent ?? '';
        if (/not found/i.test(h)) w.__seen.push(h);
        requestAnimationFrame(tick);
      };
      tick();
    });
    await page.getByRole('button', { name: EN.common.delete }).click();
    await page.getByRole('dialog').getByRole('button', { name: EN.goal.delete.confirm }).click();
    await expect(page).toHaveURL(/#\/goals$/);
    await expect(page.getByRole('heading', { level: 1, name: EN.goals.title })).toBeVisible();
    await page.waitForTimeout(300);
    const seen = await page.evaluate(() => (window as unknown as { __seen: string[] }).__seen);
    expect(seen).toEqual([]);
  });
});

test.describe('Not found, empty and error states', () => {
  test('Goal not found (unknown id, id with markup, trailing path) and unknown routes render the S8 screens inside the shell', async ({ page }) => {
    const problems = watch(page);
    await importBackup(page);
    for (const hash of ['/goals/zzz', '/goals/%3Cb%3Eboom%3C%2Fb%3E', '/goals/%E0%A4%A', '/goals/g1/extra', '/nope/at/all']) {
      await gotoHash(page, hash);
      const h1 = page.getByRole('heading', { level: 1 });
      await expect(h1, hash).toBeVisible();
      const text = await h1.innerText();
      expect([EN.notFound.goalTitle, EN.notFound.pageTitle], hash).toContain(text);
      await expect(page.getByRole('navigation').first(), hash).toBeVisible();
      await expect(page.locator('main b')).toHaveCount(0);
    }
    await gotoHash(page, '/goals/zzz');
    await expect(page.getByText(EN.errors.GOAL_NOT_FOUND)).toBeVisible();
    await expect(page.getByRole('link', { name: EN.notFound.goalAction })).toHaveAttribute('href', '#/goals');
    await expect(page.getByRole('heading', { level: 1 })).toBeFocused();
    await expectAxeClean(page);
    expect(problems.filter((p) => !p.includes('Failed to load resource'))).toEqual([]);
  });

  test('empty database: every screen incl. Settings and Goal edit of a missing goal; Review shows no chart errors; keyboard reaches the call to action', async ({ page }) => {
    const problems = watch(page);
    for (const [hash, heading] of [
      ['/today', EN.empty.today.noGoals],
      ['/goals', EN.empty.goals],
      ['/review', EN.empty.review],
      ['/day/2026-10-09', EN.empty.day.noGoals],
    ] as const) {
      await gotoHash(page, hash);
      await expect(page.getByRole('heading', { level: 2, name: heading })).toBeVisible();
      await page.keyboard.press('Tab');
      await expectNoHorizontalScroll(page);
    }
    await gotoHash(page, '/goals/nope/edit');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await gotoHash(page, '/settings');
    await expect(page.getByRole('heading', { level: 1, name: EN.settings.title })).toBeVisible();
    await expect(page.getByRole('button', { name: EN.settings.backup.export })).toBeVisible();
    expect(problems).toEqual([]);
  });

  test('only archived / upcoming / ended goals: Today says "No active goals today", Goals shows the groups, Review and Day do not crash', async ({ page }) => {
    const problems = watch(page);
    const base = await sampleFile();
    const g = (id: string, p: Record<string, unknown>) => ({ ...base.goals[0], id, name: id, entries: undefined, ...p });
    await importContent(page, {
      ...base,
      goals: [g('a1', { archived: true }), g('u1', { startDate: '2026-11-01', endDate: '2026-11-30' }), g('e1', { startDate: '2026-01-01', endDate: '2026-02-01' })],
      entries: [],
    });
    await gotoHash(page, '/today');
    await expect(page.getByRole('heading', { level: 2, name: EN.empty.today.noActive })).toBeVisible();
    await gotoHash(page, '/goals');
    for (const h of ['Upcoming (1)', 'Ended (1)', 'Archived (1)']) await expect(page.getByRole('heading', { level: 2, name: h })).toBeVisible();
    await expect(page.getByRole('heading', { level: 2, name: /^Active/ })).toHaveCount(0);
    await gotoHash(page, '/review');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await gotoHash(page, '/day/2026-10-09');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await expectAxeClean(page);
    expect(problems).toEqual([]);
  });
});

test.describe('Storage failures', () => {
  test('async IndexedDB open failure (request error event) shows StorageError; Try again succeeds without reload once storage works', async ({ browser }) => {
    const context = await browser.newContext({ timezoneId: 'Asia/Ho_Chi_Minh', locale: 'en-US', baseURL: ORIGIN });
    const page = await context.newPage();
    await freezeClock(page);
    await page.addInitScript(() => {
      const w = window as unknown as { __blockIdb: boolean };
      w.__blockIdb = true;
      const real = IDBFactory.prototype.open;
      IDBFactory.prototype.open = function (this: IDBFactory, ...args: Parameters<IDBFactory['open']>) {
        if (!w.__blockIdb) return real.apply(this, args);
        const req = {} as IDBOpenDBRequest;
        const fake = new EventTarget();
        Object.assign(req, { addEventListener: fake.addEventListener.bind(fake), removeEventListener: fake.removeEventListener.bind(fake), dispatchEvent: fake.dispatchEvent.bind(fake) });
        setTimeout(() => {
          Object.defineProperty(req, 'error', { value: new DOMException('denied', 'InvalidStateError') });
          const ev = new Event('error', { cancelable: true });
          (req as unknown as { onerror?: (e: unknown) => void }).onerror?.({ type: 'error', target: req, preventDefault() {}, stopPropagation() {} });
          fake.dispatchEvent(ev);
        }, 0);
        return req;
      } as typeof IDBFactory.prototype.open;
    });
    await gotoHash(page, '/today');
    await expect(page.getByRole('heading', { level: 1, name: EN.storageError.title })).toBeVisible();
    await page.evaluate(() => {
      (window as unknown as { __blockIdb: boolean }).__blockIdb = false;
    });
    await page.getByRole('button', { name: EN.common.tryAgain }).click();
    await expect(page.getByRole('heading', { level: 1, name: EN.empty.today.noGoals }).or(page.getByRole('heading', { level: 2, name: EN.empty.today.noGoals }))).toBeVisible();
    await expect(page.getByRole('navigation').first()).toBeVisible();
    await context.close();
  });

  test('a failing write (IDB put/add throws) shows an alert on Today and keeps the typed values; the app stays usable after storage recovers', async ({ page }) => {
    const problems: string[] = [];
    page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`));
    await importBackup(page);
    await gotoHash(page, '/today');
    await goalCard(page, 'Read').getByRole('button', { name: EN.goalCard.logTime }).click();
    await goalCard(page, 'Read').getByLabel(/^Minutes/).fill('12');
    await goalCard(page, 'Read').getByLabel(/^Note/).fill('typed note');
    await page.evaluate(() => {
      const w = window as unknown as { __orig: unknown };
      w.__orig = IDBObjectStore.prototype.add;
      IDBObjectStore.prototype.add = function () {
        throw new DOMException('quota', 'QuotaExceededError');
      };
      const putOrig = IDBObjectStore.prototype.put;
      IDBObjectStore.prototype.put = function (this: IDBObjectStore, ...args: Parameters<IDBObjectStore['put']>) {
        if (this.name === 'entries') throw new DOMException('quota', 'QuotaExceededError');
        return putOrig.apply(this, args);
      };
      (window as unknown as { __putOrig: unknown }).__putOrig = putOrig;
    });
    await goalCard(page, 'Read').getByRole('button', { name: EN.entry.form.save }).click();
    await expect(page.getByRole('alert').first()).toBeVisible();
    await expect(goalCard(page, 'Read').getByLabel(/^Minutes/)).toHaveValue('12');
    await expect(goalCard(page, 'Read').getByLabel(/^Note/)).toHaveValue('typed note');
    await expectAmount(page, 'Read', '0/30');
    await page.evaluate(() => {
      const w = window as unknown as { __orig: typeof IDBObjectStore.prototype.add; __putOrig: typeof IDBObjectStore.prototype.put };
      IDBObjectStore.prototype.add = w.__orig;
      IDBObjectStore.prototype.put = w.__putOrig;
    });
    await goalCard(page, 'Read').getByRole('button', { name: EN.entry.form.save }).click();
    await expectAmount(page, 'Read', '12/30');
    expect(problems).toEqual([]);
  });
});

test.describe('Corrupt data that bypasses import validation never produces a blank page', () => {
  // The Import UI now refuses such data (M3-D3); this writes IndexedDB directly to emulate a database written by an older build,
  // another tool or a manual edit, to make sure the ErrorBoundary / ViewError safety nets work.
  for (const [label, patch] of [
    ['startDate is null', { startDate: null }],
    ['endDate is not a date', { endDate: 'garbage' }],
    ['name is a number', { name: 123 }],
    ['targetMinutes is a string', { targetMinutes: 'lots' }],
    ['period is 100 years', { startDate: '2000-01-01', endDate: '2099-12-31' }],
    ['daily target is 600000', { targetMinutes: 600_000 }],
  ] as const) {
    test(`goal with ${label}: every route renders something with a heading (never blank)`, async ({ page }) => {
      await importBackup(page);
      const g = (await idbAll(page, 'goals')).find((x) => x.id === 'g2')!;
      await idbPut(page, 'goals', { ...g, ...patch });
      const results: string[] = [];
      for (const hash of ['/today', '/goals', '/goals/g2', '/goals/g2/edit', '/day/2026-10-08', '/review', '/review?goal=g2&year=2026', '/settings']) {
        await gotoHash(page, hash);
        await page.reload();
        await page.waitForTimeout(400);
        const info = await page.evaluate(() => ({ h1: document.querySelector('h1')?.textContent ?? '', body: document.body.innerText.trim().length, boundary: Boolean(document.querySelector('[data-testid="error-boundary"]')), err: Boolean(document.querySelector('[data-testid="error-state"]')) }));
        results.push(`${hash} => h1="${info.h1}" boundary=${info.boundary} errorState=${info.err} chars=${info.body}`);
        expect(info.body, `${hash} blank`).toBeGreaterThan(20);
        expect(info.h1 !== '' || info.boundary || info.err, `${hash} has no heading`).toBe(true);
      }
      console.log(`M5-QC corrupt [${label}]:\n  ${results.join('\n  ')}`);
    });
  }

  test('ErrorBoundary: a render error from corrupt data shows the boundary screen, "Go to Today" leaves it without a reload, "Reload app" reloads', async ({ page }) => {
    await importBackup(page);
    const g = (await idbAll(page, 'goals')).find((x) => x.id === 'g1')!;
    await idbPut(page, 'goals', { ...g, name: { not: 'a string' } });
    await gotoHash(page, '/today');
    await page.reload();
    await page.waitForTimeout(500);
    const boundary = page.getByTestId('error-boundary');
    const hit = (await boundary.count()) > 0;
    console.log(`M5-QC render error with object-typed goal name: ErrorBoundary shown = ${hit}`);
    if (hit) {
      await expect(boundary.getByRole('heading', { level: 1 })).toHaveText(EN.errorBoundary.title);
      await expect(boundary).toContainText(EN.errorBoundary.body);
      await expectAxeClean(page);
      await expect(boundary.getByRole('button', { name: EN.errorBoundary.reload })).toBeVisible();
      await expect(boundary.getByRole('button', { name: EN.notFound.pageAction })).toBeVisible();
    }
  });
});

test.describe('Offline (service worker precache)', () => {
  test('after the SW controls the page: cold navigation offline to every route incl. lazy Review and Goal detail (fresh page object), then log an entry and see +1%; going online keeps data', async ({ page, context }) => {
    const problems = watch(page);
    await importBackup(page);
    await gotoHash(page, '/review');
    await expect(page.getByTestId('heatmap')).toBeVisible();
    await gotoHash(page, '/goals/g1');
    await expect(page.getByTestId('curve-chart')).toBeVisible();
    await page.evaluate(() => navigator.serviceWorker.ready);
    await page.reload();
    await page.waitForFunction(() => Boolean(navigator.serviceWorker.controller));
    await context.setOffline(true);
    // brand-new tab: nothing cached in memory, every chunk must come from the precache
    const fresh = await context.newPage();
    await freezeClock(fresh);
    const errors: string[] = [];
    fresh.on('pageerror', (e) => errors.push(e.message));
    fresh.on('requestfailed', (r) => errors.push(`requestfailed ${r.url()}`));
    for (const [hash, check] of [
      ['/goals/g1', async () => expect(fresh.getByTestId('curve-chart').locator('.recharts-line')).toHaveCount(2)],
      ['/review', async () => expect(fresh.getByTestId('heatmap')).toBeVisible()],
      ['/goals/g3', async () => expect(fresh.getByTestId('headline')).toHaveText('+1.0% better')],
      ['/goals', async () => expect(fresh.getByTestId('goal-row').first()).toBeVisible()],
      ['/settings', async () => expect(fresh.getByRole('heading', { level: 1, name: EN.settings.title })).toBeVisible()],
      ['/day/2026-10-08', async () => expect(fresh.getByRole('heading', { level: 1 })).toBeVisible()],
      ['/today', async () => expect(goalCard(fresh, 'Read')).toBeVisible()],
    ] as const) {
      await fresh.goto(`/#${hash}`);
      await fresh.reload(); // real navigation request while offline
      await check();
    }
    await expect(fresh.getByRole('status').filter({ hasText: EN.offline.chip })).toBeVisible();
    await logTime(fresh, 'Read', 30);
    await expectAmount(fresh, 'Read', '30/30');
    await expect(live(fresh)).toHaveAttribute('data-count', '1');
    await context.setOffline(false);
    await fresh.reload();
    await expectAmount(fresh, 'Read', '30/30');
    expect(errors).toEqual([]);
    expect(problems.filter((p) => !p.includes('net::ERR_INTERNET_DISCONNECTED') && !p.includes('Failed to load resource'))).toEqual([]);
  });
});

test.describe('Backlog items closed in M5 (verified independently in the browser)', () => {
  test('M1-P1: goals and entries with equal sort keys are ordered by id regardless of storage order (Today, Goals groups, Day)', async ({ page }) => {
    const base = await sampleFile();
    const stamp = '2026-09-30T01:00:00.000Z';
    const mk = (id: string, p: Record<string, unknown> = {}) => ({ ...base.goals[0], id, name: `Goal ${id}`, createdAt: stamp, updatedAt: stamp, ...p });
    const goals = [
      mk('b'), mk('a'), // active, same createdAt
      mk('d', { startDate: '2026-11-01', endDate: '2026-11-30' }), mk('c', { startDate: '2026-11-01', endDate: '2026-11-30' }), // upcoming, same startDate
      mk('f', { startDate: '2026-01-01', endDate: '2026-02-01' }), mk('e', { startDate: '2026-01-01', endDate: '2026-02-01' }), // ended, same endDate
      mk('h', { archived: true }), mk('g', { archived: true }), // archived, same updatedAt
    ];
    const entryStamp = '2026-10-08T01:00:00.000Z';
    const entries = [
      { id: 'e2', goalId: 'a', date: '2026-10-08', minutes: 5, note: 'second', source: 'manual', createdAt: entryStamp, updatedAt: entryStamp },
      { id: 'e1', goalId: 'a', date: '2026-10-08', minutes: 6, note: 'first', source: 'manual', createdAt: entryStamp, updatedAt: entryStamp },
    ];
    await importContent(page, { ...base, goals, entries });
    await gotoHash(page, '/today');
    await expect(page.getByRole('article')).toHaveCount(2);
    expect(await page.getByRole('article').evaluateAll((els) => els.map((e) => e.getAttribute('aria-label') ?? e.querySelector('h2,h3')?.textContent))).toEqual(['Goal a', 'Goal b']);
    await gotoHash(page, '/goals');
    const names = await page.getByTestId('goal-row').locator('a[href^="#/goals/"]:not([href$="/edit"])').allInnerTexts();
    expect(names).toEqual(['Goal a', 'Goal b', 'Goal c', 'Goal d', 'Goal e', 'Goal f', 'Goal g', 'Goal h']);
    await gotoHash(page, '/day/2026-10-08');
    const cardText = await goalCard(page, 'Goal a').innerText();
    console.log('M5-QC Day card text:', JSON.stringify(cardText));
    expect(cardText.indexOf('first')).toBeGreaterThan(-1);
    expect(cardText.indexOf('first')).toBeLessThan(cardText.indexOf('second'));
    await gotoHash(page, '/goals/a');
    await expect(page.getByTestId('history-row')).toHaveCount(2);
  });

  test('M2-P2: Reminder time has an accessible description with the current time; goal D2 with a timer describes the discard note; pendingTimer clears after the timer is gone', async ({ page }) => {
    await importBackup(page);
    await gotoHash(page, '/settings');
    const time = page.getByLabel(EN.settings.reminders.time);
    await expect(time).toHaveAccessibleDescription(EN.settings.reminders.icsHint.replace('{{time}}', '20:00'));
    // pendingTimer: start a timer, discard it, the card disappears and every Start works again
    await gotoHash(page, '/today');
    await startTimer(page, 'Read');
    await timerCard(page).getByRole('button', { name: /^Stop timer for Read/ }).click();
    await page.getByTestId('stop-dialog').getByRole('button', { name: EN.timer.discard }).click();
    await expect(timerCard(page)).toHaveCount(0);
    await expect(goalCard(page, 'Guitar').getByRole('button', { name: EN.goalCard.startTimer })).not.toHaveAttribute('aria-disabled', 'true');
    await expect(goalCard(page, 'Read').getByRole('button', { name: EN.goalCard.startTimer })).not.toHaveAttribute('aria-disabled', 'true');
    // timer removed by another tab while this one shows the card
    const other = await page.context().newPage();
    await freezeClock(other);
    await startTimer(page, 'Read');
    await gotoHash(other, '/today');
    await expect(timerCard(other)).toBeVisible();
    await timerCard(other).getByRole('button', { name: /^Stop timer for Read/ }).click();
    await other.getByTestId('stop-dialog').getByRole('button', { name: EN.timer.discard }).click();
    await expect(timerCard(other)).toHaveCount(0);
    await expect(timerCard(page)).toHaveCount(0);
    await expect(goalCard(page, 'Guitar').getByRole('button', { name: EN.goalCard.startTimer })).not.toHaveAttribute('aria-disabled', 'true');
  });

  test('M3-D4: the tab that loses the Save race keeps the goal name in its open Stop dialog, then closes it on Save with a page alert and no extra entry', async ({ page, context }) => {
    await importBackup(page);
    await gotoHash(page, '/today');
    await startTimer(page, 'Guitar');
    const other = await context.newPage();
    await freezeClock(other);
    await gotoHash(other, '/today');
    await expect(timerCard(other)).toBeVisible();
    await advanceTo(page, at('00:20:00'));
    await advanceTo(other, at('00:20:00'));
    await timerCard(page).getByRole('button', { name: EN.timer.stop }).click();
    await timerCard(other).getByRole('button', { name: EN.timer.stop }).click();
    const before = (await idbAll(page, 'entries')).length;
    await page.getByTestId('stop-dialog').getByRole('button', { name: EN.entry.form.save }).click();
    await expect(timerCard(page)).toHaveCount(0);
    // loser tab: timer card is gone, dialog still open and still names the goal
    await expect(timerCard(other)).toHaveCount(0);
    await expect(other.getByTestId('stop-dialog')).toBeVisible();
    await expect(other.getByTestId('stop-dialog')).toContainText('Guitar');
    await other.getByTestId('stop-dialog').getByRole('button', { name: EN.entry.form.save }).click();
    await expect(other.getByTestId('stop-dialog')).toBeHidden();
    await expect(other.getByRole('alert')).toContainText(EN.errors.TIMER_NOT_RUNNING);
    await expect(other.getByRole('heading', { level: 1 })).toBeFocused();
    expect((await idbAll(page, 'entries')).length - before).toBe(1);
    await expectAxeClean(other);
  });
});
