// QC M7 round 1 — two real browser contexts ("devices") against the mock Supabase: cross-device
// create / edit / archive / delete, offline-then-online, cascade, preferences, and the failure modes
// of the sync engine (5xx, 429, timeout, network abort, 401). Clocks are real: edits on different
// devices are >= 1.1 s apart so last-write-wins is deterministic.
import type { Page } from '@playwright/test';
import { expect, test } from '../../../e2e/cloud/fixtures';
import { accountCard, collectErrors, expectSyncState, pendingCount, signInAsMinh, syncIndicator, syncNow } from '../../../e2e/cloud/helpers';
import { createGoal, EN, goalCard, gotoHash, logTime } from '../../../e2e/helpers/app';


// ---- local helpers (kept per file: Playwright refuses to import one spec file into another) ----
/** Names of the goals listed on #/goals (all groups). */
async function goalNames(page: Page): Promise<string[]> {
  await gotoHash(page, '/goals');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  return (await page.getByRole('heading', { level: 3 }).allTextContents()).map((s) => s.trim()).sort();
}


const LONG = { startDate: '2026-01-01', endDate: '2027-12-31' };
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

test.beforeEach(async ({ mock }) => {
  await mock.reset();
});

/** The 2 s change debounce means `synced` right after a write is still the OLD state: wait for the cloud instead. */
async function cloudEntries(mock: { liveRows: (u: 'u1' | 'u2') => Promise<{ entries: unknown[] }> }, n: number): Promise<void> {
  await expect.poll(async () => (await mock.liveRows('u1')).entries.length, { timeout: 15_000 }).toBe(n);
}

async function amount(page: Parameters<typeof gotoHash>[0], name: string): Promise<string> {
  await gotoHash(page, '/today');
  return (await goalCard(page, name).locator('.amount').textContent())?.replace(/\s+/g, ' ').trim() ?? '';
}

async function archiveGoal(page: Parameters<typeof gotoHash>[0], name: string, action: string = EN.goals.archive): Promise<void> {
  await gotoHash(page, '/goals');
  await page.locator('li', { has: page.getByRole('heading', { level: 3, name }) }).getByRole('button', { name: action }).click();
}

async function deleteGoal(page: Parameters<typeof gotoHash>[0], name: string): Promise<void> {
  await gotoHash(page, '/goals');
  await page.locator('li', { has: page.getByRole('heading', { level: 3, name }) }).getByRole('button', { name: EN.common.delete }).click();
  await page.getByRole('dialog').getByRole('button', { name: EN.goal.delete.confirm }).click();
  await expect(page.getByRole('heading', { level: 3, name })).toHaveCount(0);
}

async function renameGoal(page: Parameters<typeof gotoHash>[0], id: string, name: string): Promise<void> {
  await gotoHash(page, `/goals/${id}/edit`);
  await page.getByLabel(new RegExp(`^${EN.goal.form.nameLabel}`)).fill(name);
  await page.getByRole('button', { name: EN.goal.form.saveChanges }).click();
  await expect(page.getByRole('heading', { level: 1, name: EN.goals.title })).toBeVisible();
}

test.describe('QC M7: cross-device create / edit / archive / delete converge', () => {
  test('A and B take turns; after every hand-over both lists, the Today totals and the cloud rows agree', async ({ page, mock, device }) => {
    const errA = collectErrors(page);
    await createGoal(page, { name: 'Alpha', targetValue: 30, ...LONG });
    await signInAsMinh(page);
    await gotoHash(page, '/today');
    await logTime(page, 'Alpha', 10);
    await cloudEntries(mock, 1);
    await syncNow(page);

    const b = await device();
    const errB = collectErrors(b.page);
    await signInAsMinh(b.page);
    await expectSyncState(b.page, 'synced');
    expect(await goalNames(b.page)).toEqual(['Alpha']);
    expect(await amount(b.page, 'Alpha')).toContain('10/30');

    // B: log more, archive Alpha, create Beta with an entry.
    await logTime(b.page, 'Alpha', 5);
    await archiveGoal(b.page, 'Alpha');
    await createGoal(b.page, { name: 'Beta', targetValue: 20, ...LONG });
    await gotoHash(b.page, '/today');
    await logTime(b.page, 'Beta', 20);
    await cloudEntries(mock, 3);
    await syncNow(b.page);

    // A picks it up.
    await syncNow(page);
    expect(await goalNames(page)).toEqual(['Alpha', 'Beta']);
    await gotoHash(page, '/goals');
    await expect(page.getByRole('heading', { level: 2, name: /^Archived \(1\)/ })).toBeVisible();
    expect(await amount(page, 'Beta')).toContain('20/20');
    await expect(goalCard(page, 'Alpha')).toHaveCount(0); // archived: not on Today

    // A restores Alpha and renames Beta; B deletes Alpha's sibling... then both converge again.
    await sleep(1200);
    await archiveGoal(page, 'Alpha', EN.goals.restore);
    const betaId = (await mock.liveRows('u1')).goals.find((g) => g.name === 'Beta')!.id as string;
    await renameGoal(page, betaId, 'Beta v2');
    await syncNow(page);
    await syncNow(b.page);
    expect(await goalNames(b.page)).toEqual(['Alpha', 'Beta v2']);
    expect(await amount(b.page, 'Alpha')).toContain('15/30'); // 10 (A) + 5 (B)

    // B deletes Beta v2 -> gone on A after its sync; Alpha stays.
    await sleep(1200);
    await deleteGoal(b.page, 'Beta v2');
    await syncNow(b.page);
    await syncNow(page);
    expect(await goalNames(page)).toEqual(['Alpha']);

    const live = await mock.liveRows('u1');
    expect(live.goals.map((g) => g.name)).toEqual(['Alpha']);
    expect(live.entries).toHaveLength(2); // 10 + 5 on Alpha; Beta's entry died with its goal
    expect(live.entries.every((e) => e.goal_id === live.goals[0]!.id)).toBe(true);
    const all = await mock.rows('u1');
    expect(all.goals.find((g) => g.name === 'Beta v2')?.deleted_at).not.toBeNull();
    expect(all.entries.filter((e) => e.deleted_at !== null)).toHaveLength(1);
    expect(errA.list).toEqual([]);
    expect(errB.list).toEqual([]);
  });

  test('both devices offline make different changes, come back online: the union appears on both, the edit of the same entry-less goal goes to the later writer', async ({ page, context, mock, device }) => {
    await createGoal(page, { name: 'Shared', targetValue: 30, ...LONG });
    await signInAsMinh(page);
    await expectSyncState(page, 'synced');
    const b = await device();
    await signInAsMinh(b.page);
    await expectSyncState(b.page, 'synced');
    const sharedId = (await mock.liveRows('u1')).goals[0]!.id as string;

    await context.setOffline(true);
    await b.context.setOffline(true);
    await createGoal(page, { name: 'Only on A', targetValue: 10, ...LONG });
    await gotoHash(page, '/today');
    await logTime(page, 'Only on A', 4);
    await renameGoal(page, sharedId, 'Shared (A)');
    await sleep(1200);
    await createGoal(b.page, { name: 'Only on B', targetValue: 10, ...LONG });
    await gotoHash(b.page, '/today');
    await logTime(b.page, 'Only on B', 6);
    await renameGoal(b.page, sharedId, 'Shared (B)');
    await expectSyncState(page, 'offline');
    await expectSyncState(b.page, 'offline');
    await expect(syncIndicator(page)).toContainText(/Offline · \d+ changes? waiting/);

    await context.setOffline(false);
    await b.context.setOffline(false);
    await expectSyncState(page, 'synced', 20_000);
    await expectSyncState(b.page, 'synced', 20_000);
    await syncNow(page);
    await syncNow(b.page);
    const expected = ['Only on A', 'Only on B', 'Shared (B)'];
    expect(await goalNames(page)).toEqual(expected);
    expect(await goalNames(b.page)).toEqual(expected);
    expect(await amount(page, 'Only on B')).toContain('6/10');
    expect(await amount(b.page, 'Only on A')).toContain('4/10');
    const live = await mock.liveRows('u1');
    expect(live.goals.map((g) => g.name).sort()).toEqual(expected);
    expect(live.entries).toHaveLength(2);
  });
});

test.describe('QC M7: failure modes of the sync engine keep every local change (NFR-05, NFR-15)', () => {
  for (const status of [500, 503, 429]) {
    test(`REST answers ${status}: indicator "error" with Retry, Today unaffected, the change is pushed after recovery`, async ({ page, mock }) => {
      const errors = collectErrors(page);
      await createGoal(page, { name: 'Read', targetValue: 30, ...LONG });
      await signInAsMinh(page);
      await expectSyncState(page, 'synced');
      await mock.fail('rest', status, 1000);
      await gotoHash(page, '/today');
      await logTime(page, 'Read', 7);
      await expectSyncState(page, 'error', 20_000);
      await expect(syncIndicator(page)).toContainText(EN.sync.indicator.error);
      await expect(page.getByTestId('sync-announce')).toHaveText(EN.sync.announce.error, { timeout: 5_000 });
      expect(await amount(page, 'Read')).toContain('7/30');
      await gotoHash(page, '/settings');
      await expect(page.getByTestId('sync-error')).toContainText(EN.errors.SYNC_UNREACHABLE);
      expect(await pendingCount(page)).toBeGreaterThan(0);
      // New writes still work while sync is failing.
      await gotoHash(page, '/today');
      await logTime(page, 'Read', 3);
      expect(await amount(page, 'Read')).toContain('10/30');
      await mock.clearFailures();
      await gotoHash(page, '/settings');
      await page.getByTestId('sync-now').click();
      await expectSyncState(page, 'synced');
      await expect(page.getByTestId('sync-announce')).toHaveText(EN.sync.announce.synced, { timeout: 5_000 });
      expect((await mock.liveRows('u1')).entries.map((e) => e.minutes).sort()).toEqual([3, 7]);
      expect(errors.list).toEqual([]);
    });
  }

  test('network aborted for REST (not the browser being offline): the change stays pending, no page error, recovers on Sync now', async ({ page, mock }) => {
    const errors = collectErrors(page);
    await createGoal(page, { name: 'Read', targetValue: 30, ...LONG });
    await signInAsMinh(page);
    await expectSyncState(page, 'synced');
    await page.route('**/rest/v1/**', (r) => r.abort('failed'));
    await gotoHash(page, '/today');
    await logTime(page, 'Read', 7);
    await expect(syncIndicator(page)).toHaveAttribute('data-state', /^(offline|error)$/, { timeout: 15_000 });
    expect(await amount(page, 'Read')).toContain('7/30');
    await page.unroute('**/rest/v1/**');
    await gotoHash(page, '/settings');
    await page.getByTestId('sync-now').click();
    await expectSyncState(page, 'synced');
    expect((await mock.liveRows('u1')).entries).toHaveLength(1);
    expect(errors.list).toEqual([]);
  });

  test('a REST call that hangs past 20 s is abandoned (SYNC_UNREACHABLE) and the app stays usable', async ({ page, mock }) => {
    test.setTimeout(90_000);
    const errors = collectErrors(page);
    await createGoal(page, { name: 'Read', targetValue: 30, ...LONG });
    await signInAsMinh(page);
    await expectSyncState(page, 'synced');
    // The next REST request answers 500 only after 24 s: the client must give up at ~20 s on its own.
    await mock.fail('rest', 500, 1, 24_000);
    const started = Date.now();
    await gotoHash(page, '/today');
    await logTime(page, 'Read', 7);
    await expectSyncState(page, 'syncing', 10_000);
    expect(await amount(page, 'Read')).toContain('7/30'); // usable while the call hangs
    await expectSyncState(page, 'error', 30_000);
    const waited = Date.now() - started;
    expect(waited).toBeGreaterThan(17_000);
    expect(waited).toBeLessThan(23_500);
    await gotoHash(page, '/settings');
    await expect(page.getByTestId('sync-error')).toContainText(EN.errors.SYNC_UNREACHABLE);
    await page.getByTestId('sync-now').click();
    await expectSyncState(page, 'synced');
    expect((await mock.liveRows('u1')).entries).toHaveLength(1);
    expect(errors.list).toEqual([]);
  });

  test('401 on REST: card expired, indicator links to Settings, data and pending count stay; signing in again as the same user pushes them', async ({ page, mock }) => {
    const errors = collectErrors(page);
    await createGoal(page, { name: 'Read', targetValue: 30, ...LONG });
    await signInAsMinh(page);
    await expectSyncState(page, 'synced');
    await mock.fail('rest', 401, 1000);
    await gotoHash(page, '/today');
    await logTime(page, 'Read', 7);
    await expectSyncState(page, 'expired', 15_000);
    await expect(syncIndicator(page)).toHaveAttribute('href', /#\/settings$/);
    await expect(page.getByTestId('sync-announce')).toHaveText(EN.sync.announce.expired, { timeout: 5_000 });
    expect(await amount(page, 'Read')).toContain('7/30');
    await gotoHash(page, '/settings');
    await expect(accountCard(page)).toHaveAttribute('data-state', 'expired');
    await expect(accountCard(page)).toContainText('minh.test@example.com');
    // No retry storm while expired: the request log stops growing for REST.
    const before = (await mock.log()).log.filter((l) => l.path.startsWith('/rest/')).length;
    await sleep(2500);
    const after = (await mock.log()).log.filter((l) => l.path.startsWith('/rest/')).length;
    expect(after - before).toBeLessThanOrEqual(1);
    await mock.clearFailures();
    // Sign in again as the same user (new session) -> D5 must NOT appear, the pending entry is pushed.
    await page.getByRole('button', { name: EN.auth.signInGoogle }).click();
    await page.waitForURL((u) => u.pathname === '/auth/v1/authorize');
    await page.getByRole('button', { name: 'Minh Test', exact: true }).click();
    await page.waitForURL((u) => u.origin === 'http://localhost:4174');
    await expect(accountCard(page)).toHaveAttribute('data-state', 'signed-in');
    await expect(page.getByTestId('merge-dialog')).not.toHaveAttribute('open');
    await expectSyncState(page, 'synced');
    expect((await mock.liveRows('u1')).entries).toHaveLength(1);
    expect(errors.list).toEqual([]);
  });
});
