// M18-AC7 (FR-78, FR-79, ADR-50, ADR-52) and parts of AC4/AC5 (NFR-13, FR-41, FR-61): the Demo M18 against the
// mock Supabase. A imports Q1 and syncs; B receives it; deleting the linked goal unlinks the roadmap on B; the
// "roadmap tables missing" mode keeps goals syncing and shows the hint; the migration "runs" and the rows go up;
// delete account removes every row of the seven tables; sign out → remove empties the four local tables.
import { expect, test } from './fixtures';
import { EN, FIXED_TIME_Q1, freezeClock, gotoHash, importBackup, logTime, ROADMAP_EN, toast } from '../helpers/app';
import { accountCard, collectErrors, expectSyncState, pendingCount, recordRequests, signInAsMinh, signInButton, syncIndicator, syncNow } from './helpers';

const U1 = '00000000-0000-4000-8000-000000000001';
const ROADMAP_TABLES = ['roadmaps', 'roadmap_phases', 'roadmap_items', 'roadmap_checkpoints'] as const;
const roadmapRow = (page: Parameters<typeof gotoHash>[0]) => page.getByTestId('roadmap-row');

/** Rows in one local Dexie store (the app's database). */
async function storeCount(page: Parameters<typeof gotoHash>[0], store: string): Promise<number> {
  return page.evaluate(
    (name) =>
      new Promise<number>((resolve, reject) => {
        const req = indexedDB.open('one-percent-better');
        req.onerror = () => reject(req.error);
        req.onsuccess = () => {
          const db = req.result;
          const count = db.transaction(name, 'readonly').objectStore(name).count();
          count.onsuccess = () => {
            resolve(count.result);
            db.close();
          };
          count.onerror = () => reject(count.error);
        };
      }),
    store,
  );
}

test.beforeEach(async ({ mock }) => {
  await mock.reset();
});

test.describe('M18-AC7 roadmaps reach the account and the other device (Demo M18)', () => {
  test('A imports Q1 + signs in → 1/5/21/5 rows of u1 on the mock in < 15 s; B syncs → Big goals shows QPT 21 tuần 1/21, 5.8 h; A deletes gq → B shows "No goal linked" and "Study time: —"', async ({ page, mock, device }) => {
    test.setTimeout(120_000);
    const errors = collectErrors(page);
    const rec = recordRequests(page);
    await freezeClock(page, FIXED_TIME_Q1);
    await importBackup(page, 'q1-roadmap-backup.json');
    await gotoHash(page, '/settings');
    const started = Date.now();
    await signInAsMinh(page);
    await expectSyncState(page, 'synced');
    await expect.poll(() => pendingCount(page), { timeout: 15_000 }).toBe(0);
    const elapsed = Date.now() - started;
    console.log(`[M18-AC7] first sync of Q1 (6 goals, 29 entries, 32 roadmap rows) done in ${elapsed} ms`);
    expect(elapsed).toBeLessThan(15_000);

    const items = await mock.rowsOf('u1', 'roadmap_items');
    expect(items).toHaveLength(21);
    const rows = await mock.rows('u1');
    expect(rows.roadmaps).toHaveLength(1);
    expect(rows.roadmap_phases).toHaveLength(5);
    expect(rows.roadmap_checkpoints).toHaveLength(5);
    expect(rows.goals).toHaveLength(6);
    expect(rows.entries).toHaveLength(29);
    expect(rows.roadmaps[0]).toMatchObject({ id: 'rq', goal_id: 'gq', user_id: U1, weekly_target_minutes: 480, milestone_date: '2027-03-09', deleted_at: null });
    expect(items.find((i) => i.id === 'wq1')).toMatchObject({ roadmap_id: 'rq', phase_id: 'pq1', actual_start: '2026-10-27', actual_end: '2026-11-01' });
    expect(rows.roadmap_checkpoints.find((c) => c.id === 'cq1')).toMatchObject({ date: '2026-09-24', max_score: 32, score: 5 });
    // Only the §4.8 g columns went up (no camelCase leftovers, no `dirty`).
    expect(Object.keys(items[0]).sort()).toEqual(['actual_end', 'actual_start', 'created_at', 'deleted_at', 'id', 'note', 'phase_id', 'planned_end', 'planned_start', 'position', 'roadmap_id', 'server_updated_at', 'title', 'updated_at', 'user_id']);

    // Device B: sign in → the first cycle pulls everything, the list shows the roadmap with hours from the synced entries.
    const b = await device();
    const bErrors = collectErrors(b.page);
    await freezeClock(b.page, FIXED_TIME_Q1);
    await signInAsMinh(b.page);
    await expectSyncState(b.page, 'synced');
    await gotoHash(b.page, '/roadmaps');
    await expect(b.page.getByRole('heading', { level: 1, name: ROADMAP_EN.list.title })).toBeVisible();
    const row = roadmapRow(b.page);
    await expect(row).toHaveCount(1);
    await expect(row.getByRole('heading', { level: 2 })).toHaveText('QPT 21 tuần');
    await expect(row.getByTestId('roadmap-goal')).toHaveText('Goal: QPT study');
    await expect(row.getByTestId('roadmap-progress')).toHaveText('Done 1/21');
    await expect(row.getByTestId('roadmap-hours')).toHaveText('Studied 5.8 h of 16 h');
    await expect(row.getByTestId('pace-chip')).toHaveText('On track');
    expect(await storeCount(b.page, 'roadmapItems')).toBe(21);
    await expect(b.page.getByTestId('roadmaps-unavailable')).toHaveCount(0);

    // A deletes the linked goal: the roadmap is unlinked in the same transaction (A-79) and the change travels.
    await gotoHash(page, '/goals');
    const gq = page.locator('li', { has: page.getByRole('heading', { level: 3, name: 'QPT study' }) });
    await gq.getByRole('button', { name: EN.common.delete }).click();
    await page.getByRole('dialog').getByRole('button', { name: EN.goal.delete.confirm }).click();
    await expect(page.getByRole('heading', { level: 3, name: 'QPT study' })).toHaveCount(0);
    await expectSyncState(page, 'synced', 10_000);
    await expect.poll(async () => (await mock.rowsOf('u1', 'roadmaps'))[0]?.goal_id).toBeNull();
    await expect.poll(async () => (await mock.rows('u1')).goals.find((g) => g.id === 'gq')?.deleted_at ?? null).not.toBeNull();
    await syncNow(b.page);
    await gotoHash(b.page, '/roadmaps');
    await expect(roadmapRow(b.page).getByTestId('roadmap-goal')).toHaveText(ROADMAP_EN.list.row.unlinked);
    await expect(roadmapRow(b.page).getByTestId('roadmap-hours')).toHaveText(ROADMAP_EN.list.row.hoursNone);
    await expect(roadmapRow(b.page).getByTestId('roadmap-progress')).toHaveText('Done 1/21');

    expect(errors.list).toEqual([]);
    expect(bErrors.list).toEqual([]);
    expect(rec.external()).toEqual([]);
    expect(rec.urls.every((u) => /^http:\/\/(localhost:4174|127\.0\.0\.1:54321)\//.test(u))).toBe(true);
  });

  test('roadmapTables false (migration not run): a new goal still syncs, indicator "Synced", the hint shows in Settings and Big goals, no "Sign in again"; tables back → Sync now clears the hint and the pending count', async ({ page, mock }) => {
    const errors = collectErrors(page);
    await freezeClock(page, FIXED_TIME_Q1);
    await importBackup(page, 'q1-roadmap-backup.json');
    await mock.config({ roadmapTables: false });
    await signInAsMinh(page);
    // The cycle is ok (goals/entries up); the 32 roadmap rows still count as waiting (ARCH §4.8 h: pending = dirty rows of
    // the six tables), so the indicator says "32 changes waiting" — never error / expired / "Sign in again".
    await expectSyncState(page, 'pending');
    await expect.poll(async () => (await mock.rows('u1')).goals.length).toBe(6);
    expect(await mock.rowsOf('u1', 'roadmaps')).toEqual([]);
    await expect.poll(() => pendingCount(page)).toBe(32);
    const hint = accountCard(page).getByTestId('roadmaps-unavailable');
    await expect(hint).toHaveText(EN.settings.account.roadmapsUnavailable);
    await expect(accountCard(page)).toHaveAttribute('data-state', 'signed-in');
    await expect(accountCard(page).getByTestId('auth-expired')).toHaveCount(0);
    await expect(accountCard(page).getByTestId('sync-error')).toHaveCount(0);
    await expect(accountCard(page).getByTestId('remote-invalid')).toHaveCount(0);
    await expect(syncIndicator(page)).toHaveAttribute('data-state', 'pending');
    await expect(syncIndicator(page)).toHaveText('32 changes waiting to sync');
    await expect(syncIndicator(page)).not.toHaveText(/Sign in again/);
    await expect(page.getByTestId('last-synced')).not.toHaveText(EN.settings.account.neverSynced);

    // A new entry goes up while the tables are missing (the core group is pushed in its own request). Under the Q1 clock
    // (2026-11-04) the S1 goals have ended; the open-ended "QPT study" is the one on Today.
    await gotoHash(page, '/today');
    await logTime(page, 'QPT study', 10);
    await expect.poll(async () => (await mock.rows('u1')).entries.length, { timeout: 10_000 }).toBe(30);
    await gotoHash(page, '/roadmaps');
    const note = page.getByTestId('roadmaps-unavailable');
    await expect(note).toHaveText(EN.settings.account.roadmapsUnavailable);
    await expect(note).toHaveAttribute('role', 'status');
    await expect(roadmapRow(page)).toHaveCount(1);

    // "U31 done": the tables exist → Sync now uploads the 32 rows, the hint disappears, 0 waiting, indicator synced.
    await mock.config({ roadmapTables: true });
    await syncNow(page);
    await expect(toast(page)).toHaveText(EN.toast.syncNowDone);
    await expect(accountCard(page).getByTestId('roadmaps-unavailable')).toHaveCount(0);
    await expect.poll(() => pendingCount(page)).toBe(0);
    expect(await mock.rowsOf('u1', 'roadmap_items')).toHaveLength(21);
    expect(await mock.rowsOf('u1', 'roadmaps')).toHaveLength(1);
    await gotoHash(page, '/roadmaps');
    await expect(roadmapRow(page)).toHaveCount(1);
    await expect(page.getByTestId('roadmaps-unavailable')).toHaveCount(0);
    // Only the first roadmap request of each cycle was attempted while the tables were missing (ADR-52 skips the rest).
    const log = (await mock.log()).log.filter((l) => l.path.startsWith('/rest/v1/roadmap'));
    expect(log.length).toBeGreaterThan(0);
    expect(errors.list).toEqual([]);
  });

  test('M18-AC5: delete account (mock function) → 0 rows in the seven tables of u1; sign out → remove data empties the four local roadmap tables', async ({ page, mock, device }) => {
    await freezeClock(page, FIXED_TIME_Q1);
    await importBackup(page, 'q1-roadmap-backup.json');
    await signInAsMinh(page);
    await expectSyncState(page, 'synced');
    await expect.poll(() => pendingCount(page)).toBe(0);
    expect(await mock.rowsOf('u1', 'roadmap_items')).toHaveLength(21);

    // Device B signs in with "remove data" on sign-out: the four local tables are emptied with goals/entries.
    const b = await device();
    await freezeClock(b.page, FIXED_TIME_Q1);
    await signInAsMinh(b.page);
    await expectSyncState(b.page, 'synced');
    await expect.poll(() => storeCount(b.page, 'roadmapItems')).toBe(21);
    await accountCard(b.page).getByRole('button', { name: EN.settings.account.signOut }).click();
    const signOut = b.page.getByTestId('signout-dialog');
    await expect(signOut).toBeVisible();
    await signOut.getByRole('radio', { name: new RegExp(`^${EN.auth.signOut.remove}`) }).check();
    await b.page.getByTestId('signout-confirm').click();
    await expect(accountCard(b.page)).toHaveAttribute('data-state', 'signed-out');
    for (const store of ['roadmaps', 'roadmapPhases', 'roadmapItems', 'roadmapCheckpoints', 'goals', 'entries']) expect(await storeCount(b.page, store), store).toBe(0);
    // The account still has everything.
    expect(await mock.rowsOf('u1', 'roadmap_items')).toHaveLength(21);

    // A deletes the account: the mock's `delete-account` removes the user and every row (cascade) of the seven tables.
    await gotoHash(page, '/settings');
    await accountCard(page).getByRole('button', { name: EN.settings.account.delete }).click();
    const d = page.getByTestId('delete-account-dialog');
    await expect(d).toBeVisible();
    await d.getByTestId('delete-account-confirm').click();
    await expect(accountCard(page)).toHaveAttribute('data-state', 'signed-out', { timeout: 15_000 });
    await expect(toast(page)).toHaveText(EN.toast.accountDeletedRemoved);
    const rows = await mock.rows('u1');
    expect(rows.goals).toEqual([]);
    expect(rows.entries).toEqual([]);
    expect(rows.settings).toEqual([]);
    for (const t of ROADMAP_TABLES) expect(rows[t], t).toEqual([]);
    for (const store of ['roadmaps', 'roadmapPhases', 'roadmapItems', 'roadmapCheckpoints']) expect(await storeCount(page, store), store).toBe(0);
    await expect(signInButton(page)).toBeEnabled();
  });
});
