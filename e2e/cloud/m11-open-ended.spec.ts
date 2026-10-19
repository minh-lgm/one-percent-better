// M11-AC6 (FR-57, NFR-12), cloud project: an open-ended goal created on device A reaches the mock
// Supabase as `end_date: null` and shows up on device B after Sync now with the open-ended row.
import { expect, test } from './fixtures';
import { createGoal, EN, expectAxeClean, freezeClock, gotoHash } from '../helpers/app';
import { collectErrors, expectSyncState, recordRequests, signInAsMinh, syncNow } from './helpers';

const OPEN_ROW_EN = '10 min/day · from 2026-10-01, no end date';

test.beforeEach(async ({ mock }) => {
  await mock.reset();
});

test('M11-AC6: A creates "Meditate" with No end date → Sync now → mock row end_date null (daily); B signs in → Sync now → Goals shows the open-ended row, badge Active; only allowed origins', async ({ page, mock, device }) => {
  const errors = collectErrors(page);
  const rec = recordRequests(page);
  await freezeClock(page);
  await signInAsMinh(page);
  await expectSyncState(page, 'synced');
  await createGoal(page, { name: 'Meditate', targetValue: 10, startDate: '2026-10-01', endsNever: true });
  await gotoHash(page, '/settings');
  await syncNow(page);
  await expectSyncState(page, 'synced', 10_000);
  await expect.poll(async () => (await mock.liveRows('u1')).goals.length, { timeout: 10_000 }).toBe(1);
  const rows = await mock.rows('u1');
  const goal = rows.goals[0];
  expect(goal).toMatchObject({ name: 'Meditate', target_type: 'daily', target_minutes: 10, start_date: '2026-10-01', end_date: null, deleted_at: null });
  expect('end_date' in goal).toBe(true);
  expect(goal.end_date).toBeNull();
  expect(rec.external()).toEqual([]);
  expect(errors.list).toEqual([]);

  // Device B: same account, another browser context.
  const b = await device();
  const errorsB = collectErrors(b.page);
  await freezeClock(b.page);
  await signInAsMinh(b.page);
  await syncNow(b.page);
  await expectSyncState(b.page, 'synced', 10_000);
  await gotoHash(b.page, '/goals');
  const row = b.page.getByTestId('goal-row').filter({ has: b.page.getByRole('heading', { level: 3, name: 'Meditate' }) });
  await expect(row).toContainText(OPEN_ROW_EN);
  await expect(row.getByText(EN.goal.status.active)).toBeVisible();
  await expect(row).not.toContainText('–');
  await expect(b.page.getByRole('heading', { level: 2, name: 'Active (1)' })).toBeVisible();
  await expectAxeClean(b.page);
  // The Account card reports nothing skipped: the row was read, not dropped (no "remote invalid" line).
  await gotoHash(b.page, '/settings');
  await expect(b.page.getByTestId('account-card')).toBeVisible();
  await expect(b.page.getByTestId('remote-invalid')).toHaveCount(0);
  expect(errorsB.list).toEqual([]);

  // B sets an end date (10:02), A removes it later (10:05): both end up open-ended (LWW, like the unit
  // scenario). Both devices share the frozen §0 clock, so B must move its clock first or its edit would
  // tie with the row A created and lose (tie → server).
  await freezeClock(b.page, new Date('2026-10-09T10:02:00+07:00'));
  await gotoHash(b.page, '/goals');
  await row.getByRole('link', { name: EN.common.edit, exact: true }).click();
  await expect(b.page.getByRole('radio', { name: EN.goal.form.endsNever })).toBeChecked();
  await b.page.getByRole('radio', { name: EN.goal.form.endsSpecific }).check();
  await b.page.getByLabel(new RegExp(`^${EN.goal.form.endLabel}`)).fill('2026-12-31');
  await b.page.getByRole('button', { name: EN.goal.form.saveChanges }).click();
  await expect(row).toContainText('2026-10-01 – 2026-12-31');
  await gotoHash(b.page, '/settings');
  await syncNow(b.page);
  await expectSyncState(b.page, 'synced', 10_000);
  await expect.poll(async () => (await mock.liveRows('u1')).goals[0]?.end_date, { timeout: 10_000 }).toBe('2026-12-31');

  await gotoHash(page, '/settings');
  await syncNow(page);
  await expectSyncState(page, 'synced', 10_000);
  await gotoHash(page, '/goals');
  const rowA = page.getByTestId('goal-row').filter({ has: page.getByRole('heading', { level: 3, name: 'Meditate' }) });
  await expect(rowA).toContainText('2026-10-01 – 2026-12-31');
  await freezeClock(page, new Date('2026-10-09T10:05:00+07:00'));
  await rowA.getByRole('link', { name: EN.common.edit, exact: true }).click();
  await page.getByRole('radio', { name: EN.goal.form.endsNever }).check();
  await page.getByRole('button', { name: EN.goal.form.saveChanges }).click();
  await expect(rowA).toContainText(OPEN_ROW_EN);
  await gotoHash(page, '/settings');
  await syncNow(page);
  await expectSyncState(page, 'synced', 10_000);
  await expect.poll(async () => (await mock.liveRows('u1')).goals[0]?.end_date, { timeout: 10_000 }).toBeNull();
  await gotoHash(b.page, '/settings');
  await syncNow(b.page);
  await expectSyncState(b.page, 'synced', 10_000);
  await gotoHash(b.page, '/goals');
  await expect(row).toContainText(OPEN_ROW_EN);
  expect(errors.list).toEqual([]);
  expect(errorsB.list).toEqual([]);
});
