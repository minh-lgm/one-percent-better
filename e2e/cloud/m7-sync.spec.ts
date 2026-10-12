// M7-AC8 (triggers + indicator), M7-AC9 (deletion propagates, device-only state stays), M7-AC10
// (same-record conflict), M7-AC13 (401, hostile data, invalid rows, no page errors).
import { expect, test } from './fixtures';
import { createGoal, EN, expectAxeClean, freezeClock, goalCard, gotoHash, importBackup, kvGet, logTime, startTimer, timerCard } from '../helpers/app';
import { accountCard, C1, collectErrors, expectSyncState, pendingCount, signInAsMinh, syncIndicator, syncNow } from './helpers';

const READ = { name: 'Read', targetValue: 30, startDate: '2026-10-01', endDate: '2026-10-31' };
const GOAL_COLUMNS = ['archived', 'created_at', 'deleted_at', 'end_date', 'id', 'name', 'server_updated_at', 'start_date', 'target_minutes', 'target_type', 'updated_at', 'user_id', 'why'];
const ENTRY_COLUMNS = ['created_at', 'date', 'deleted_at', 'goal_id', 'id', 'minutes', 'note', 'server_updated_at', 'source', 'updated_at', 'user_id'];

test.beforeEach(async ({ mock }) => {
  await mock.reset();
});

async function renameGoal(page: Parameters<typeof gotoHash>[0], id: string, name: string): Promise<void> {
  await gotoHash(page, `/goals/${id}/edit`);
  const field = page.getByLabel(new RegExp(`^${EN.goal.form.nameLabel}`));
  await field.fill(name);
  await page.getByRole('button', { name: EN.goal.form.saveChanges }).click();
  await expect(page.getByRole('heading', { level: 1, name: EN.goals.title })).toBeVisible();
}

test.describe('M7-AC8 triggers and indicator (FR-46, FR-50)', () => {
  test('a local change is pushed within 5 s; offline shows the count; back online syncs; 500 → error, Sync now bypasses the backoff', async ({ page, context, mock }) => {
    const errors = collectErrors(page);
    await createGoal(page, READ);
    await signInAsMinh(page);
    await expectSyncState(page, 'synced');
    await expect(syncIndicator(page)).toHaveText(/^Synced \d\d:\d\d$/);
    await expect(page.getByTestId('status-row')).toHaveAttribute('role', 'group');
    await expect(page.getByTestId('status-row')).toHaveAttribute('aria-label', EN.sync.indicator.label);
    await expectAxeClean(page);

    await gotoHash(page, '/today');
    const before = (await mock.log()).log.filter((l) => l.method === 'POST' && l.path === '/rest/v1/entries').length;
    await logTime(page, 'Read', 10);
    await expect.poll(async () => (await mock.log()).log.filter((l) => l.method === 'POST' && l.path === '/rest/v1/entries').length, { timeout: 5_000 }).toBeGreaterThan(before);
    await expectSyncState(page, 'synced', 5_000);
    expect((await mock.liveRows('u1')).entries).toHaveLength(1);
    await expectAxeClean(page);

    await context.setOffline(true);
    await logTime(page, 'Read', 5);
    await expectSyncState(page, 'offline');
    await expect(syncIndicator(page)).toHaveText('Offline · 1 change waiting');
    await context.setOffline(false);
    await expect.poll(async () => (await mock.liveRows('u1')).entries.length, { timeout: 5_000 }).toBe(2);
    await expectSyncState(page, 'synced', 5_000);
    await gotoHash(page, '/settings');
    await expect.poll(() => pendingCount(page), { timeout: 5_000 }).toBe(0);

    await mock.fail('rest', 500, 100);
    await gotoHash(page, '/today');
    await logTime(page, 'Read', 3);
    await expectSyncState(page, 'error');
    await expect(syncIndicator(page)).toContainText(EN.sync.indicator.error);
    await expect(syncIndicator(page).getByRole('button', { name: EN.sync.indicator.retryAria })).toBeVisible();
    await gotoHash(page, '/settings');
    await expect(page.getByTestId('sync-error')).toContainText(EN.errors.SYNC_UNREACHABLE);
    await expect(page.getByTestId('next-retry')).toContainText(/Trying again at \d\d:\d\d\./);
    const count = (await mock.log()).log.length;
    await page.getByTestId('sync-now').click();
    await expect.poll(async () => (await mock.log()).log.length, { timeout: 3_000 }).toBeGreaterThan(count);
    await expectSyncState(page, 'error');
    await mock.clearFailures();
    await page.getByTestId('sync-now').click();
    await expectSyncState(page, 'synced');
    await expect(page.getByTestId('toast')).toHaveText(EN.toast.syncNowDone);
    await expect(page.getByTestId('sync-error')).toHaveCount(0);
    expect((await mock.liveRows('u1')).entries).toHaveLength(3);
    expect(errors.list).toEqual([]);
  });
});

test.describe('M7-AC9 deletion propagates; device-only state stays (FR-44, FR-48)', () => {
  test('A deletes Read → B loses it everywhere incl. Review; timer and +1% stay on A only; cloud rows have only the §4.3 columns', async ({ page, mock, device }) => {
    await freezeClock(page);
    await importBackup(page);
    await signInAsMinh(page);
    await expectSyncState(page, 'synced');
    const b = await device();
    await freezeClock(b.page);
    await signInAsMinh(b.page);
    await expectSyncState(b.page, 'synced');
    await gotoHash(b.page, '/goals');
    await expect(b.page.getByRole('heading', { level: 3 })).toHaveCount(5);
    await gotoHash(b.page, '/review');
    await expect(b.page.locator('[data-date="2026-10-05"]')).toHaveAttribute('aria-label', /30 min/);

    // A deletes "Read".
    await gotoHash(page, '/goals');
    const read = page.locator('li', { has: page.getByRole('heading', { level: 3, name: 'Read' }) });
    await read.getByRole('button', { name: EN.common.delete }).click();
    await page.getByRole('dialog').getByRole('button', { name: EN.goal.delete.confirm }).click();
    await expect(page.getByRole('heading', { level: 3, name: 'Read' })).toHaveCount(0);
    await expectSyncState(page, 'synced', 10_000);
    await expect.poll(async () => (await mock.rows('u1')).goals.find((g) => g.id === 'g1')?.deleted_at ?? null).not.toBeNull();

    await syncNow(b.page);
    await gotoHash(b.page, '/today');
    await expect(goalCard(b.page, 'Guitar')).toBeVisible();
    await expect(goalCard(b.page, 'Read')).toHaveCount(0);
    await gotoHash(b.page, '/goals');
    await expect(b.page.getByRole('heading', { level: 3, name: 'Read' })).toHaveCount(0);
    await gotoHash(b.page, '/review');
    await expect(b.page.locator('[data-date="2026-10-05"]')).toHaveClass(/\bl0\b/);

    // Timer + "+1%" on A are device-only.
    await gotoHash(page, '/today');
    await startTimer(page, 'Guitar');
    await logTime(page, 'Guitar', 20);
    await expect(goalCard(page, 'Guitar').getByTestId('plus-one')).toBeVisible();
    await expectSyncState(page, 'synced', 10_000);
    const bSettingsBefore = (await kvGet(b.page, 'settings')) as Record<string, unknown> | null;
    await syncNow(b.page);
    await b.page.reload();
    await gotoHash(b.page, '/today');
    await expect(goalCard(b.page, 'Guitar').locator('.amount')).toContainText('20/20');
    await expect(timerCard(b.page)).toHaveCount(0);
    await expect(goalCard(b.page, 'Guitar').getByTestId('plus-one')).not.toHaveClass(/\bentering\b/);
    await expect(b.page.getByTestId('plus-one-live')).toHaveText('');
    const bSettingsAfter = (await kvGet(b.page, 'settings')) as Record<string, unknown> | null;
    expect(bSettingsAfter?.plusOneShown ?? {}).toEqual(bSettingsBefore?.plusOneShown ?? {});
    expect(bSettingsAfter?.lastReminderDate ?? null).toEqual(bSettingsBefore?.lastReminderDate ?? null);
    expect(bSettingsAfter?.lastBackupAt ?? null).toEqual(bSettingsBefore?.lastBackupAt ?? null);
    expect(await kvGet(b.page, 'activeTimer')).toBeNull();

    const rows = await mock.rows('u1');
    for (const g of rows.goals) expect(Object.keys(g).sort()).toEqual(GOAL_COLUMNS);
    for (const e of rows.entries) expect(Object.keys(e).sort()).toEqual(ENTRY_COLUMNS);
  });
});

test.describe('M7-AC10 same-record conflict (FR-49)', () => {
  test('both offline: A renames Guitar A, then (≥ 1 s later) B renames Guitar B; sync A, B, A → Guitar B everywhere, one live row', async ({ page, context, mock, device }) => {
    await importBackup(page);
    await signInAsMinh(page);
    await expectSyncState(page, 'synced');
    const b = await device();
    await signInAsMinh(b.page);
    await expectSyncState(b.page, 'synced');
    await context.setOffline(true);
    await b.context.setOffline(true);
    await renameGoal(page, 'g2', 'Guitar A');
    await page.waitForTimeout(1100);
    await renameGoal(b.page, 'g2', 'Guitar B');
    await context.setOffline(false);
    await b.context.setOffline(false);
    await syncNow(page);
    await syncNow(b.page);
    await syncNow(page);
    await gotoHash(page, '/goals');
    await expect(page.getByRole('heading', { level: 3, name: 'Guitar B' })).toBeVisible();
    await expect(page.getByRole('heading', { level: 3, name: 'Guitar A' })).toHaveCount(0);
    await gotoHash(b.page, '/goals');
    await expect(b.page.getByRole('heading', { level: 3, name: 'Guitar B' })).toBeVisible();
    const live = (await mock.liveRows('u1')).goals.filter((g) => g.id === 'g2');
    expect(live).toHaveLength(1);
    expect(live[0].name).toBe('Guitar B');
  });
});

test.describe('M7-AC13 fault tolerance and untrusted cloud data (NFR-05, NFR-15)', () => {
  test('401 from REST → "Sign in again", data and pending changes kept', async ({ page, mock }) => {
    const errors = collectErrors(page);
    await createGoal(page, READ);
    await signInAsMinh(page);
    await expectSyncState(page, 'synced');
    await mock.fail('rest', 401, 100);
    await gotoHash(page, '/today');
    await logTime(page, 'Read', 10);
    await expectSyncState(page, 'expired');
    await gotoHash(page, '/settings');
    await expect(accountCard(page)).toHaveAttribute('data-state', 'expired');
    await expect(page.getByTestId('auth-expired')).toContainText(EN.settings.account.expiredTitle);
    await gotoHash(page, '/today');
    await expect(goalCard(page, 'Read').locator('.amount')).toContainText('10/30');
    expect(errors.list).toEqual([]);
  });

  test('hostile note renders as text, an invalid row (minutes 5000) is skipped, valid rows still show, no page errors', async ({ page, mock }) => {
    const errors = collectErrors(page);
    let dialogs = 0;
    page.on('dialog', (d) => {
      dialogs += 1;
      void d.dismiss();
    });
    await mock.seed('u1', {
      goals: C1.goals,
      entries: [
        ...C1.entries,
        { id: 'c1-xss', goalId: 'c1-goal', date: '2026-10-08', minutes: 5, note: '<img src=x onerror=alert(1)>', source: 'manual', createdAt: '2026-10-05T01:00:00.000Z', updatedAt: '2026-10-05T01:00:00.000Z' },
        { id: 'c1-bad', goalId: 'c1-goal', date: '2026-10-09', minutes: 5000, note: '', source: 'manual', createdAt: '2026-10-05T01:00:00.000Z', updatedAt: '2026-10-05T01:00:00.000Z' },
      ],
    });
    await signInAsMinh(page);
    await expectSyncState(page, 'synced');
    await expect(page.getByTestId('remote-invalid')).toContainText(EN.errors.SYNC_REMOTE_INVALID);
    await gotoHash(page, '/goals/c1-goal');
    await expect(page.getByRole('table').locator('tbody tr')).toHaveCount(3);
    await expect(page.getByRole('table')).toContainText('<img src=x onerror=alert(1)>');
    await expect(page.locator('img[src="x"]')).toHaveCount(0);
    await expect(page.getByRole('table')).not.toContainText('5000');
    expect(dialogs).toBe(0);
    expect(errors.list).toEqual([]);
  });
});
