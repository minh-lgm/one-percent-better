// QC M10 round 1 - cost of the start-up tombstone purge (ADR-29) on a big database. The purge scans goals and entries with
// filter() (no index on deletedAt) inside one rw transaction at every start. This spec seeds a large IndexedDB, reloads, and
// records the main-thread long tasks (> 50 ms) and the time the purge needs; numbers go to the QC report.
import { expect, test, type Page } from '@playwright/test';
import { freezeClock, gotoHash } from '../../e2e/helpers/app';

interface Seed {
  liveEntries: number;
  oldTombstoneEntries: number;
}

async function seed(page: Page, s: Seed): Promise<void> {
  await page.evaluate(
    (opts) =>
      new Promise<void>((resolve, reject) => {
        const req = indexedDB.open('one-percent-better');
        req.onerror = () => reject(req.error);
        req.onsuccess = () => {
          const db = req.result;
          const tx = db.transaction(['goals', 'entries'], 'readwrite');
          const goals = tx.objectStore('goals');
          const entries = tx.objectStore('entries');
          const goal = (id: string, deletedAt: string | null) => ({ id, name: id, why: '', targetType: 'daily', targetMinutes: 60, startDate: '2020-01-01', endDate: '2025-12-31', archived: false, createdAt: '2020-01-01T00:00:00.000Z', updatedAt: deletedAt ?? '2020-01-01T00:00:00.000Z', deletedAt, dirty: 0 });
          goals.put(goal('perf-live', null));
          goals.put(goal('perf-dead', '2026-01-01T00:00:00.000Z'));
          const mk = (i: number, goalId: string, deletedAt: string | null) => {
            const day = new Date(Date.UTC(2020, 0, 1) + (i % 2000) * 86_400_000).toISOString().slice(0, 10);
            return { id: `${goalId}-${i}`, goalId, date: day, minutes: 10, note: '', source: 'manual', createdAt: '2020-01-01T00:00:00.000Z', updatedAt: deletedAt ?? '2020-01-01T00:00:00.000Z', deletedAt, dirty: 0 };
          };
          for (let i = 0; i < opts.liveEntries; i += 1) entries.put(mk(i, 'perf-live', null));
          for (let i = 0; i < opts.oldTombstoneEntries; i += 1) entries.put(mk(i, 'perf-dead', '2026-01-01T00:00:00.000Z'));
          tx.oncomplete = () => {
            db.close();
            resolve();
          };
          tx.onerror = () => reject(tx.error);
        };
      }),
    s,
  );
}

async function counts(page: Page): Promise<{ goals: number; entries: number }> {
  return page.evaluate(
    () =>
      new Promise<{ goals: number; entries: number }>((resolve, reject) => {
        const req = indexedDB.open('one-percent-better');
        req.onerror = () => reject(req.error);
        req.onsuccess = () => {
          const db = req.result;
          const tx = db.transaction(['goals', 'entries'], 'readonly');
          const g = tx.objectStore('goals').count();
          const e = tx.objectStore('entries').count();
          tx.oncomplete = () => {
            db.close();
            resolve({ goals: g.result, entries: e.result });
          };
          tx.onerror = () => reject(tx.error);
        };
      }),
  );
}

for (const s of [
  { label: 'heavy user, nothing to purge', liveEntries: 50_000, oldTombstoneEntries: 0, expectedLeft: 50_000 },
  { label: 'heavy user + one big deleted goal (20,000 old tombstones)', liveEntries: 50_000, oldTombstoneEntries: 20_000, expectedLeft: 50_000 },
]) {
  test(`start-up purge cost: ${s.label}`, async ({ page }) => {
    test.setTimeout(180_000);
    await page.addInitScript(() => {
      const w = window as unknown as { __long: number[] };
      w.__long = [];
      try {
        new PerformanceObserver((list) => {
          for (const e of list.getEntries()) w.__long.push(Math.round(e.duration));
        }).observe({ entryTypes: ['longtask'] });
      } catch {
        // not supported
      }
    });
    await freezeClock(page, new Date('2026-10-09T10:00:00+07:00'));
    await gotoHash(page, '/today');
    await expect(page.getByRole('heading', { level: 1, name: 'Today' })).toBeVisible();
    await seed(page, s);
    const before = await counts(page);
    // fresh load: the long-task log starts again with the reload
    const t0 = Date.now();
    await page.reload();
    await expect(page.getByRole('heading', { level: 1, name: 'Today' })).toBeVisible();
    const shown = Date.now() - t0;
    let doneAfter = -1;
    for (let i = 0; i < 80; i += 1) {
      const c = await counts(page);
      if (c.goals === 1 && c.entries === s.expectedLeft) {
        doneAfter = Date.now() - t0;
        break;
      }
      await page.waitForTimeout(250);
    }
    await page.waitForTimeout(1000);
    const long = await page.evaluate(() => (window as unknown as { __long: number[] }).__long);
    const after = await counts(page);
    console.log(
      `QC M10 purge perf [${s.label}]: rows before ${JSON.stringify(before)} after ${JSON.stringify(after)}; Today heading visible after ${shown} ms; purge finished after ${doneAfter} ms; long tasks (ms) ${JSON.stringify(long)} max ${Math.max(0, ...long)}`,
    );
    expect(after.entries).toBe(s.expectedLeft);
    expect(after.goals).toBe(1); // the deleted goal's tombstone is purged too
  });
}
