// M20-AC5 (FR-78, FR-76, FR-75): a roadmap made from the QPT template on device A and its checkpoint scores travel
// through the mock Supabase. A: template (27/10/2026, gq) + CP2 18 → Sync now; B: Sync now → the same 32 rows and
// CP2 18; B changes CP2 to 21 (later write) → A Sync now → 21 (last write wins). Requests only to {4174, 54321}.
import { expect, test } from './fixtures';
import { FIXED_TIME_Q1, freezeClock, gotoHash, importBackup, ROADMAP_EN } from '../helpers/app';

/** The frozen clock plus `s` seconds: a later edit needs a later `updatedAt` (a tie keeps the server row, ADR-21). */
const later = (s: number) => new Date(FIXED_TIME_Q1.getTime() + s * 1000);
import { collectErrors, expectSyncState, pendingCount, recordRequests, signInAsMinh, syncNow } from './helpers';
import type { Page } from '@playwright/test';

const cpRow = (page: Page, title: string) => page.getByTestId('cp-row').filter({ has: page.locator('.cp-n', { hasText: new RegExp(`^${title}$`) }) });

async function setScore(page: Page, title: string, value: string): Promise<void> {
  const input = cpRow(page, title).getByTestId('cp-score');
  await input.fill(value);
  await input.blur();
}

test.beforeEach(async ({ mock }) => {
  await mock.reset();
});

test('M20-AC5: template + CP2 18 on A → B gets the 32 rows and 18; B sets 21 later → A gets 21 (LWW); only the app and the mock are contacted', async ({ page, mock, device }) => {
  test.setTimeout(120_000);
  const errors = collectErrors(page);
  const rec = recordRequests(page);
  await freezeClock(page, FIXED_TIME_Q1);
  await importBackup(page, 'q1-goal-only-backup.json');
  await gotoHash(page, '/settings');
  await signInAsMinh(page);
  await expectSyncState(page, 'synced');

  // A: Big goals (empty) → template 2026-10-27 linked to QPT study
  await gotoHash(page, '/roadmaps');
  await page.getByTestId('roadmaps-empty').getByRole('button', { name: ROADMAP_EN.list.createTemplate }).click();
  const d = page.getByTestId('template-dialog');
  await d.getByLabel(/^Start date/).fill('2026-10-27');
  await d.getByLabel(ROADMAP_EN.ed.goalLabel).selectOption({ label: 'QPT study' });
  await d.getByRole('button', { name: ROADMAP_EN.ed.create }).click();
  await page.waitForURL(/#\/roadmaps\/[^/]+$/);
  const roadmapId = page.url().split('/roadmaps/')[1]!;
  await page.clock.setFixedTime(later(30));
  await setScore(page, 'Checkpoint 2', '18');
  await expect(cpRow(page, 'Checkpoint 2').getByTestId('cp-delta')).toHaveText('−2');
  await syncNow(page);
  await expect.poll(() => pendingCount(page)).toBe(0);
  const rows = await mock.rows('u1');
  expect([rows.roadmaps.length, rows.roadmap_phases.length, rows.roadmap_items.length, rows.roadmap_checkpoints.length]).toEqual([1, 5, 21, 5]);
  expect(rows.roadmaps[0]).toMatchObject({ id: roadmapId, title: 'QPT 21 weeks', goal_id: 'gq', weekly_target_minutes: 480, milestone_label: 'QPT exam', milestone_date: '2027-03-09', deleted_at: null });
  const cp2 = rows.roadmap_checkpoints.find((c) => c.title === 'Checkpoint 2')!;
  expect(cp2).toMatchObject({ date: '2027-02-15', threshold: 20 });
  expect(Number(cp2.score)).toBe(18);

  // B: sign in → the first cycle pulls everything; Sync now once more for good measure
  const b = await device();
  const bErrors = collectErrors(b.page);
  await freezeClock(b.page, FIXED_TIME_Q1);
  await signInAsMinh(b.page);
  await expectSyncState(b.page, 'synced');
  await syncNow(b.page);
  await gotoHash(b.page, `/roadmaps/${roadmapId}`);
  await expect(b.page.getByRole('heading', { level: 1, name: 'QPT 21 weeks' })).toBeVisible();
  await expect(b.page.getByTestId('done-value')).toHaveText('0/21');
  await expect(b.page.getByTestId('roadmap-item')).toHaveCount(21);
  await expect(b.page.getByTestId('phase')).toHaveCount(5);
  await expect(b.page.getByTestId('cp-row')).toHaveCount(5);
  await expect(b.page.getByTestId('hours-value')).toHaveText('5.8 h');
  await expect(cpRow(b.page, 'Checkpoint 2').getByTestId('cp-score')).toHaveValue('18');
  await expect(cpRow(b.page, 'Checkpoint 2').getByTestId('cp-state')).toHaveAttribute('data-state', 'below');

  // B changes CP2 to 21 after A's write → A Sync now → 21
  await b.page.clock.setFixedTime(later(60));
  await setScore(b.page, 'Checkpoint 2', '21');
  await expect(cpRow(b.page, 'Checkpoint 2').getByTestId('cp-state')).toHaveAttribute('data-state', 'pass');
  await syncNow(b.page);
  await expect.poll(async () => Number((await mock.rows('u1')).roadmap_checkpoints.find((c) => c.title === 'Checkpoint 2')?.score)).toBe(21);
  await syncNow(page);
  await gotoHash(page, `/roadmaps/${roadmapId}`);
  await expect(cpRow(page, 'Checkpoint 2').getByTestId('cp-score')).toHaveValue('21');
  await expect(cpRow(page, 'Checkpoint 2').getByTestId('cp-delta')).toHaveText('+1');
  // still exactly 32 rows on the account
  const after = await mock.rows('u1');
  expect([after.roadmaps.length, after.roadmap_phases.length, after.roadmap_items.length, after.roadmap_checkpoints.length]).toEqual([1, 5, 21, 5]);

  expect(errors.list).toEqual([]);
  expect(bErrors.list).toEqual([]);
  expect(rec.external()).toEqual([]);
  expect(rec.urls.every((u) => /^http:\/\/(localhost:4174|127\.0\.0\.1:54321)\//.test(u))).toBe(true);
});
