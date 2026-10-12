// M7-AC11 (import/export while signed in) and M7-AC14 (first sync of large-backup.json < 15 s).
import { readFile } from 'node:fs/promises';
import { expect, test } from './fixtures';
import { chooseBackupFile, EN, gotoHash, importBackup, logTime, toast } from '../helpers/app';
import { C1, collectErrors, expectSyncState, pendingCount, signInAsMinh } from './helpers';

test.beforeEach(async ({ mock }) => {
  await mock.reset();
});

test.describe('M7-AC11 backup while signed in (FR-51)', () => {
  test('import shows the signed-in D3, replaces device + account (C1 tombstoned, S1 stamped now); export has no sync metadata', async ({ page, mock, device }) => {
    const errors = collectErrors(page);
    await mock.seed('u1', C1);
    await signInAsMinh(page);
    await expectSyncState(page, 'synced');
    await gotoHash(page, '/goals');
    await expect(page.getByRole('heading', { level: 3, name: 'Cloud goal' })).toBeVisible();

    const importedAt = Date.now();
    await chooseBackupFile(page, 'sample-backup.json');
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole('heading', { level: 2 })).toHaveText(EN.import.titleSignedIn);
    await expect(dialog).toContainText('once synced, everything in your account too');
    await dialog.getByRole('button', { name: EN.import.confirm }).click();
    await expect(toast(page)).toContainText('Backup imported: 5 goals, 23 entries');
    await expectSyncState(page, 'synced', 15_000);
    await expect.poll(() => pendingCount(page)).toBe(0);
    await gotoHash(page, '/goals');
    await expect(page.getByRole('heading', { level: 3 })).toHaveCount(5);
    await expect(page.getByRole('heading', { level: 3, name: 'Cloud goal' })).toHaveCount(0);

    const rows = await mock.rows('u1');
    expect(rows.goals.find((g) => g.id === 'c1-goal')?.deleted_at).not.toBeNull();
    const live = await mock.liveRows('u1');
    expect(live.goals).toHaveLength(5);
    expect(live.entries).toHaveLength(23);
    for (const g of live.goals) expect(Date.parse(g.updated_at)).toBeGreaterThanOrEqual(importedAt - 1000);
    for (const e of live.entries) expect(Date.parse(e.updated_at)).toBeGreaterThanOrEqual(importedAt - 1000);

    const b = await device();
    await signInAsMinh(b.page);
    await expectSyncState(b.page, 'synced');
    await gotoHash(b.page, '/goals');
    await expect(b.page.getByRole('heading', { level: 3 })).toHaveCount(5);
    await expect(b.page.getByRole('heading', { level: 3, name: 'Cloud goal' })).toHaveCount(0);

    // Export while signed in: plain schemaVersion 1, no sync markers.
    await gotoHash(page, '/settings');
    const downloadPromise = page.waitForEvent('download');
    await page.getByRole('button', { name: EN.settings.backup.export }).click();
    const download = await downloadPromise;
    const text = await readFile((await download.path())!, 'utf8');
    const file = JSON.parse(text) as { schemaVersion: number; goals: unknown[]; entries: unknown[] };
    expect(file.schemaVersion).toBe(1);
    expect(file.goals).toHaveLength(5);
    expect(file.entries).toHaveLength(23);
    expect(text).not.toMatch(/deletedAt|dirty|user_id/);
    expect(errors.list).toEqual([]);
  });
});

test.describe('M7-AC14 sync performance (NFR-13)', () => {
  test('large-backup.json (5 goals, 5 449 entries) reaches the account in < 15 s with batches ≤ 500; logging stays responsive meanwhile', async ({ page, mock }) => {
    test.setTimeout(120_000);
    await importBackup(page, 'large-backup.json');
    await gotoHash(page, '/settings');
    const started = Date.now();
    await signInAsMinh(page);
    // While the first sync runs, logging on Today must not wait for it.
    await gotoHash(page, '/today');
    const t0 = Date.now();
    await logTime(page, 'Read', 5);
    await expect(page.getByRole('article', { name: 'Read' }).locator('.amount')).toContainText(/\d+\/30/, { timeout: 1_000 });
    expect(Date.now() - t0).toBeLessThan(1_500);
    await gotoHash(page, '/settings');
    await expect.poll(() => pendingCount(page), { timeout: 15_000 }).toBe(0);
    const elapsed = Date.now() - started;
    console.log(`[M7-AC14] first sync of large-backup.json done in ${elapsed} ms`);
    expect(elapsed).toBeLessThan(15_000);
    await expectSyncState(page, 'synced');
    const log = await mock.log();
    const batches = log.log.filter((l) => l.method === 'POST' && l.path.startsWith('/rest/v1/')).map((l) => l.rows);
    expect(Math.max(...batches)).toBeLessThanOrEqual(500);
    console.log(`[M7-AC14] largest upsert batch: ${Math.max(...batches)} rows, ${batches.length} upserts`);
    const live = await mock.liveRows('u1');
    expect(live.goals).toHaveLength(5);
    expect(live.entries).toHaveLength(5450);
  });
});
