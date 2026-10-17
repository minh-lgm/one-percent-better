/**
 * M10-AC4 (ADR-29, M7-P1): tombstones older than 30 days are hard-deleted from IndexedDB at the next
 * app start (cloud off: the device never synced, so nobody can need them). Reproduces QC M7 r1 §9.3:
 * delete "Read" on 2026-10-09 → the raw row stays (soft delete); open the app a month later → gone,
 * while Goals / Review / Export show exactly what they showed before the purge.
 */
import { expect, test, type Page } from '@playwright/test';
import { EN, freezeClock, gotoHash, importBackup, toast } from './helpers/app';

interface RawCounts {
  goals: number;
  goalTombstones: number;
  entries: number;
}

/** Raw rows of the goal named `name` in the app database (tombstones included). */
async function rawRows(page: Page, name: string): Promise<RawCounts> {
  return page.evaluate(
    (goalName) =>
      new Promise<RawCounts>((resolve, reject) => {
        const req = indexedDB.open('one-percent-better');
        req.onerror = () => reject(req.error);
        req.onsuccess = () => {
          const db = req.result;
          const tx = db.transaction(['goals', 'entries'], 'readonly');
          const all = tx.objectStore('goals').getAll();
          all.onsuccess = () => {
            const goals = (all.result as Array<{ id: string; name: string; deletedAt?: string | null }>).filter((g) => g.name === goalName);
            const ids = goals.map((g) => g.id);
            const entries = tx.objectStore('entries').getAll();
            entries.onsuccess = () => {
              const rows = (entries.result as Array<{ goalId: string }>).filter((e) => ids.includes(e.goalId));
              resolve({ goals: goals.length, goalTombstones: goals.filter((g) => g.deletedAt).length, entries: rows.length });
              db.close();
            };
            entries.onerror = () => reject(entries.error);
          };
          all.onerror = () => reject(all.error);
        };
      }),
    name,
  );
}

async function exportJson(page: Page): Promise<string> {
  await gotoHash(page, '/settings');
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: EN.settings.backup.export }).click();
  const file = await download;
  const stream = await file.createReadStream();
  const chunks: Buffer[] = [];
  for await (const c of stream) chunks.push(Buffer.from(c));
  const parsed = JSON.parse(Buffer.concat(chunks).toString('utf8')) as { goals: Array<{ name: string }>; entries: unknown[] };
  return JSON.stringify({ goals: parsed.goals.map((g) => g.name).sort(), entries: parsed.entries.length });
}

test('M10-AC4: a goal deleted on Oct 9 is purged from IndexedDB when the app opens on Nov 9; Goals/Review/Export unchanged', async ({ context }) => {
  const page = await context.newPage();
  await freezeClock(page, new Date('2026-10-09T10:00:00+07:00'));
  await gotoHash(page, '/today');
  await importBackup(page);
  await gotoHash(page, '/goals');
  const row = page.getByTestId('goal-row').filter({ hasText: 'Read' });
  await row.getByRole('button', { name: EN.common.delete }).click();
  await page.getByRole('dialog').getByRole('button', { name: EN.goal.delete.confirm }).click();
  await expect(toast(page)).toHaveText(EN.toast.goalDeleted);
  await expect(page.getByTestId('goal-row')).toHaveCount(4);
  // Soft delete (ADR-20): the raw rows are still there, flagged.
  expect(await rawRows(page, 'Read')).toEqual({ goals: 1, goalTombstones: 1, entries: 8 });
  // Names only: status badges legitimately change with the date (Marathon prep starts in November).
  const goalsBefore = await page.getByTestId('goal-row').locator('h3').allInnerTexts();
  await gotoHash(page, '/review');
  await expect(page.getByRole('heading', { level: 1, name: EN.review.title })).toBeVisible();
  const reviewBefore = await page.getByTestId('stat-time').innerText();
  const exportBefore = await exportJson(page);
  await page.close();

  const later = await context.newPage();
  await freezeClock(later, new Date('2026-11-09T10:00:00+07:00'));
  await gotoHash(later, '/today');
  await expect(later.getByRole('heading', { level: 1, name: 'Today' })).toBeVisible();
  await expect.poll(() => rawRows(later, 'Read'), { timeout: 10_000 }).toEqual({ goals: 0, goalTombstones: 0, entries: 0 });

  await gotoHash(later, '/goals');
  await expect(later.getByTestId('goal-row')).toHaveCount(4);
  expect(await later.getByTestId('goal-row').locator('h3').allInnerTexts()).toEqual(goalsBefore);
  await gotoHash(later, '/review');
  await expect(later.getByRole('heading', { level: 1, name: EN.review.title })).toBeVisible();
  expect(await later.getByTestId('stat-time').innerText()).toBe(reviewBefore);
  expect(await exportJson(later)).toBe(exportBefore);
});
