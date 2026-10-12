// M7-AC1 (NFR-14): a phase-1 database (Dexie v1 = IndexedDB version 10) built with the raw
// IndexedDB API is upgraded in place by the M7 build; nothing is lost, the language is kept.
import { expect, test } from '@playwright/test';
import { EN, freezeClock, goalCard, gotoHash, VI } from './helpers/app';

const DB = 'one-percent-better';

/** Phase-1 rows: G1 "Read" + 8 entries (2026-10-01 … 10-08) + locale 'vi'. Only when the database does not exist yet. */
async function seedV1Database(page: Parameters<typeof freezeClock>[0]): Promise<void> {
  await page.addInitScript(
    ({ db }) => {
      const stamp = '2026-09-30T01:00:00.000Z';
      const goal = { id: 'g1', name: 'Read', why: 'Be smarter', targetType: 'daily', targetMinutes: 30, startDate: '2026-10-01', endDate: '2026-10-31', archived: false, createdAt: stamp, updatedAt: stamp };
      const entries = Array.from({ length: 8 }, (_, i) => ({ id: `e-g1-${i + 1}`, goalId: 'g1', date: `2026-10-0${i + 1}`, minutes: 30, note: '', source: 'manual', createdAt: stamp, updatedAt: stamp }));
      const w = window as unknown as { __v1Seed?: Promise<string> };
      w.__v1Seed = new Promise<string>((resolve) => {
        const req = indexedDB.open(db, 10);
        let created = false;
        req.onupgradeneeded = (ev) => {
          if (ev.oldVersion !== 0) return; // only on a fresh profile
          created = true;
          const d = req.result;
          d.createObjectStore('goals', { keyPath: 'id' });
          const e = d.createObjectStore('entries', { keyPath: 'id' });
          e.createIndex('goalId', 'goalId');
          e.createIndex('date', 'date');
          e.createIndex('[goalId+date]', ['goalId', 'date']);
          d.createObjectStore('kv', { keyPath: 'key' });
          const tx = req.transaction!;
          tx.objectStore('goals').put(goal);
          for (const x of entries) tx.objectStore('entries').put(x);
          tx.objectStore('kv').put({ key: 'locale', value: 'vi' });
        };
        req.onsuccess = () => {
          const d = req.result;
          d.onversionchange = () => d.close();
          d.close();
          resolve(created ? 'seeded' : 'existing');
        };
        req.onerror = () => resolve(`error: ${String(req.error)}`);
        req.onblocked = () => resolve('blocked');
      });
    },
    { db: DB },
  );
}

async function rawRows(page: Parameters<typeof freezeClock>[0]) {
  return page.evaluate(
    (db) =>
      new Promise<{ version: number; goals: Record<string, unknown>[]; entries: Record<string, unknown>[]; kv: Record<string, unknown>[] }>((resolve, reject) => {
        const req = indexedDB.open(db);
        req.onerror = () => reject(req.error);
        req.onsuccess = () => {
          const d = req.result;
          const tx = d.transaction(['goals', 'entries', 'kv'], 'readonly');
          const out = { version: d.version, goals: [] as Record<string, unknown>[], entries: [] as Record<string, unknown>[], kv: [] as Record<string, unknown>[] };
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

test.describe('M7-AC1 Dexie v1 → v2 upgrade (NFR-14)', () => {
  test('a v1 database with Read + 8 entries + locale vi opens in the M7 build: Today in Vietnamese with 0/30, history has 8 rows, rows are live + dirty, markers set', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await freezeClock(page);
    await seedV1Database(page);
    await gotoHash(page, '/today');
    expect(await page.evaluate(() => (window as unknown as { __v1Seed: Promise<string> }).__v1Seed)).toBe('seeded');
    await expect(page.locator('html')).toHaveAttribute('lang', 'vi');
    await expect(page.getByRole('heading', { level: 1, name: VI.today.title })).toBeVisible();
    await expect(goalCard(page, 'Read')).toBeVisible();
    await expect(goalCard(page, 'Read').locator('.amount')).toContainText('0/30');

    await gotoHash(page, '/goals/g1');
    await expect(page.getByRole('heading', { level: 1, name: 'Read' })).toBeVisible();
    await expect(page.getByRole('table').locator('tbody tr')).toHaveCount(8);

    const raw = await rawRows(page);
    expect(raw.version).toBe(20);
    expect(raw.goals).toHaveLength(1);
    expect(raw.goals[0]).toMatchObject({ id: 'g1', name: 'Read', why: 'Be smarter', deletedAt: null, dirty: 1, createdAt: '2026-09-30T01:00:00.000Z' });
    expect(raw.entries).toHaveLength(8);
    for (const e of raw.entries) expect(e).toMatchObject({ deletedAt: null, dirty: 1, minutes: 30 });
    const kv = Object.fromEntries(raw.kv.map((r) => [r.key as string, r.value]));
    expect(kv.locale).toBe('vi');
    expect(kv.prefsSync).toEqual({ reminder: { updatedAt: null, dirty: 0 }, locale: { updatedAt: '1970-01-01T00:00:00.000Z', dirty: 1 } });
    expect(errors).toEqual([]);

    // Still fully usable: reload keeps everything, phase-1 copy is untouched elsewhere.
    await page.reload();
    await gotoHash(page, '/today');
    await expect(goalCard(page, 'Read')).toBeVisible();
    expect(EN.today.title).toBe('Today');
  });
});
