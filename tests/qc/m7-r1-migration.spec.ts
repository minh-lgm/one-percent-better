// QC M7 round 1 (project `chromium`, cloud OFF) — the phase-1 -> M7 upgrade in a real browser, from the QC side:
// the whole sample backup (5 goals / 23 entries) + a running timer + settings + locale are written with the raw
// IndexedDB API at version 10 (Dexie v1), then (a) the upgrade is aborted half-way (what a closed tab / crash does)
// and the data must still be v1-intact and upgradable, (b) the app upgrades it in place and shows everything.
import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { EN, fixturePath, freezeClock, goalCard, gotoHash, kvGet, timerCard, VI } from '../../e2e/helpers/app';

const DB = 'one-percent-better';
const SAMPLE = JSON.parse(readFileSync(fixturePath('sample-backup.json'), 'utf8')) as { goals: Array<Record<string, unknown>>; entries: Array<Record<string, unknown>>; settings: Record<string, unknown> };
const TIMER = { goalId: 'g1', startedAt: '2026-10-09T02:30:00.000Z' };
const SETTINGS = { reminderEnabled: true, reminderTime: '07:30', lastReminderDate: '2026-10-08', lastBackupAt: '2026-10-01T00:00:00.000Z', plusOneShown: {} };

/** Create the v1 database (IndexedDB version 10) with the full dataset. Runs in any page of the app origin. */
async function writeV1(page: Page): Promise<void> {
  await page.evaluate(
    ({ db, sample, timer, settings }) =>
      new Promise<void>((resolve, reject) => {
        const req = indexedDB.open(db, 10);
        req.onupgradeneeded = () => {
          const d = req.result;
          d.createObjectStore('goals', { keyPath: 'id' });
          const e = d.createObjectStore('entries', { keyPath: 'id' });
          e.createIndex('goalId', 'goalId');
          e.createIndex('date', 'date');
          e.createIndex('[goalId+date]', ['goalId', 'date']);
          d.createObjectStore('kv', { keyPath: 'key' });
          const tx = req.transaction!;
          for (const g of sample.goals) tx.objectStore('goals').put(g);
          for (const x of sample.entries) tx.objectStore('entries').put(x);
          tx.objectStore('kv').put({ key: 'activeTimer', value: timer });
          tx.objectStore('kv').put({ key: 'settings', value: settings });
          tx.objectStore('kv').put({ key: 'locale', value: 'vi' });
        };
        req.onsuccess = () => {
          req.result.close();
          resolve();
        };
        req.onerror = () => reject(req.error);
      }),
    { db: DB, sample: SAMPLE, timer: TIMER, settings: SETTINGS },
  );
}

interface Raw { version: number; goals: Array<Record<string, unknown>>; entries: Array<Record<string, unknown>>; kv: Array<{ key: string; value: unknown }> }
async function rawRows(page: Page): Promise<Raw> {
  return page.evaluate(
    (db) =>
      new Promise<Raw>((resolve, reject) => {
        const req = indexedDB.open(db);
        req.onerror = () => reject(req.error);
        req.onsuccess = () => {
          const d = req.result;
          const tx = d.transaction(['goals', 'entries', 'kv'], 'readonly');
          const out: Raw = { version: d.version, goals: [], entries: [], kv: [] };
          tx.objectStore('goals').getAll().onsuccess = (e) => (out.goals = (e.target as IDBRequest).result);
          tx.objectStore('entries').getAll().onsuccess = (e) => (out.entries = (e.target as IDBRequest).result);
          tx.objectStore('kv').getAll().onsuccess = (e) => (out.kv = (e.target as IDBRequest).result);
          tx.oncomplete = () => {
            d.close();
            resolve(out);
          };
        };
      }),
    DB,
  );
}

const byId = (a: Record<string, unknown>, b: Record<string, unknown>) => String(a.id).localeCompare(String(b.id));
const strip = ({ deletedAt: _d, dirty: _x, ...rest }: Record<string, unknown>) => rest;

test.describe('QC M7-AC1 / NFR-14 in a real browser', () => {
  test('an upgrade aborted half-way leaves the v1 data untouched; the next launch then upgrades it completely', async ({ page }) => {
    // A same-origin document that does NOT boot the app (the app would upgrade the DB itself).
    await page.goto('/manifest.webmanifest');
    await writeV1(page);
    const before = await rawRows(page);
    expect(before.version).toBe(10);

    // Interrupt: open at version 20 (what Dexie does), rewrite every row, then abort the versionchange transaction.
    const outcome = await page.evaluate(
      (db) =>
        new Promise<string>((resolve) => {
          const req = indexedDB.open(db, 20);
          req.onupgradeneeded = () => {
            const tx = req.transaction!;
            for (const name of ['goals', 'entries']) {
              const store = tx.objectStore(name);
              store.openCursor().onsuccess = (e) => {
                const cur = (e.target as IDBRequest<IDBCursorWithValue | null>).result;
                if (!cur) return;
                cur.update({ ...cur.value, deletedAt: null, dirty: 1 });
                cur.continue();
              };
            }
            tx.objectStore('kv').put({ key: 'prefsSync', value: { half: 'done' } });
            setTimeout(() => tx.abort(), 0);
          };
          req.onerror = () => resolve(`error:${req.error?.name}`);
          req.onsuccess = () => {
            req.result.close();
            resolve('success');
          };
        }),
      DB,
    );
    expect(outcome).toBe('error:AbortError');
    const afterAbort = await rawRows(page);
    expect(afterAbort.version).toBe(10);
    expect(afterAbort.goals).toEqual(before.goals);
    expect(afterAbort.entries).toEqual(before.entries);
    expect(afterAbort.kv).toEqual(before.kv);
    for (const r of [...afterAbort.goals, ...afterAbort.entries]) expect(r).not.toHaveProperty('dirty');

    // Next launch: the app upgrades it.
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await freezeClock(page);
    await gotoHash(page, '/today');
    await expect(page.locator('html')).toHaveAttribute('lang', 'vi');
    await expect(page.getByRole('heading', { level: 1, name: VI.today.title })).toBeVisible();
    await expect(goalCard(page, 'Read')).toBeVisible();
    const upgraded = await rawRows(page);
    expect(upgraded.version).toBe(20);
    expect(upgraded.goals).toHaveLength(5);
    expect(upgraded.entries).toHaveLength(23);
    expect(errors).toEqual([]);
  });

  test('the full S1 dataset + running timer + settings + locale survive the in-place upgrade: UI, raw rows, kv and export all agree with the fixture', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await freezeClock(page);
    await page.goto('/manifest.webmanifest');
    await writeV1(page);
    await gotoHash(page, '/today');
    await expect(page.locator('html')).toHaveAttribute('lang', 'vi');
    await expect(page.getByRole('heading', { level: 1, name: VI.today.title })).toBeVisible();
    // The running timer (started 02:30Z, now frozen at 03:00Z) is still there, on Read.
    await expect(timerCard(page)).toBeVisible();
    await expect(page.getByTestId('timer-elapsed')).toHaveText('00:30:00');

    const raw = await rawRows(page);
    expect(raw.version).toBe(20);
    expect(raw.goals.sort(byId).map(strip)).toEqual([...SAMPLE.goals].sort(byId));
    expect(raw.entries.sort(byId).map(strip)).toEqual([...SAMPLE.entries].sort(byId));
    for (const r of [...raw.goals, ...raw.entries]) expect({ deletedAt: r.deletedAt, dirty: r.dirty }).toEqual({ deletedAt: null, dirty: 1 });
    const kv = Object.fromEntries(raw.kv.map((r) => [r.key, r.value]));
    expect(kv.activeTimer).toEqual(TIMER);
    expect(kv.locale).toBe('vi');
    expect(kv.settings).toMatchObject({ reminderEnabled: true, reminderTime: '07:30', lastBackupAt: '2026-10-01T00:00:00.000Z' });
    expect(kv.prefsSync).toEqual({ reminder: { updatedAt: '1970-01-01T00:00:00.000Z', dirty: 1 }, locale: { updatedAt: '1970-01-01T00:00:00.000Z', dirty: 1 } });
    // Phase-1 app never made a `sync` row; the cloud-off build does not create one either.
    expect(kv.sync).toBeUndefined();

    // Goals list and a goal detail match the fixture.
    await gotoHash(page, '/goals');
    await expect(page.getByRole('heading', { level: 3 })).toHaveCount(5);
    await gotoHash(page, '/goals/g1');
    await expect(page.getByRole('table').locator('tbody tr')).toHaveCount(SAMPLE.entries.filter((e) => e.goalId === 'g1').length);

    // Export after the upgrade = the fixture (no deletedAt/dirty leak).
    await gotoHash(page, '/settings');
    const download = page.waitForEvent('download');
    await page.getByRole('button', { name: VI.settings.backup.export }).click();
    const text = readFileSync((await (await download).path())!, 'utf8');
    const file = JSON.parse(text) as typeof SAMPLE & { schemaVersion: number };
    expect(file.schemaVersion).toBe(1);
    expect([...file.goals].sort(byId)).toEqual([...SAMPLE.goals].sort(byId));
    expect([...file.entries].sort(byId)).toEqual([...SAMPLE.entries].sort(byId));
    expect(text).not.toMatch(/deletedAt|"dirty"|user_id/);
    expect(await kvGet(page, 'locale')).toBe('vi');
    expect(errors).toEqual([]);
    expect(EN.today.title).toBe('Today');
  });
});
