// QC M20 r1 (AC5, independent of the dev spec): A creates the template in vi (no goal), adds a checkpoint in the editor, scores CP2 = 18,
// Sync now; B pulls 32+1 rows; B moves CP2 to 21 and deletes the added checkpoint (later clock); A Sync now -> 21 and the deletion.
// Requests only to {4174, 54321}. The clock is advanced between writes (a tie keeps the server row, ADR-21 - not a defect).
import type { Page } from '@playwright/test';
import { expect, test } from '../../../e2e/cloud/fixtures';
import { collectErrors, expectSyncState, pendingCount, recordRequests, signInAsMinh, syncNow } from '../../../e2e/cloud/helpers';
import { EN, FIXED_TIME_Q1, freezeClock, gotoHash, importBackup, ROADMAP_VI } from '../../../e2e/helpers/app';

const later = (s: number) => new Date(FIXED_TIME_Q1.getTime() + s * 1000);
const cpRow = (page: Page, title: string) => page.getByTestId('cp-row').filter({ has: page.locator('.cp-n', { hasText: new RegExp(`^${title}$`) }) });
async function score(page: Page, title: string, value: string) {
  const input = cpRow(page, title).getByTestId('cp-score');
  await input.fill(value);
  await input.blur();
}
async function toVi(page: Page) {
  await gotoHash(page, '/settings');
  await page.getByRole('radio', { name: EN.settings.language.option.vi }).check();
  await expect(page.locator('html')).toHaveAttribute('lang', 'vi');
}

test.beforeEach(async ({ mock }) => {
  await mock.reset();
});

test('M20-AC5 QC: vi template + added checkpoint + CP2 18 on A -> B; B CP2 21 + delete -> A (LWW, tombstone); only app + mock contacted', async ({ page, mock, device }) => {
  test.setTimeout(150_000);
  const errors = collectErrors(page);
  const rec = recordRequests(page);
  await freezeClock(page, FIXED_TIME_Q1);
  await importBackup(page, 'q1-goal-only-backup.json');
  await gotoHash(page, '/settings');
  await signInAsMinh(page);
  await expectSyncState(page, 'synced');
  await toVi(page);
  await gotoHash(page, '/roadmaps');
  await page.getByRole('button', { name: ROADMAP_VI.list.createTemplate }).click();
  const d = page.getByTestId('template-dialog');
  await d.locator('input[type="date"]').fill('2026-10-27');
  await d.getByRole('button', { name: ROADMAP_VI.ed.create }).click();
  await page.waitForURL(/#\/roadmaps\/[^/]+$/);
  const id = page.url().split('/roadmaps/')[1]!;
  await page.clock.setFixedTime(later(30));
  await page.getByTestId('detail-edit').click();
  await page.getByTestId('editor-checkpoints').getByRole('button', { name: ROADMAP_VI.ed.addCp }).click();
  const add = page.getByTestId('cp-form-add');
  await add.getByLabel(/^Tên/).fill('Mock 3');
  await add.getByLabel(/^Ngày/).fill('2027-03-12');
  await add.getByLabel(/^Điểm tối đa/).fill('32');
  await add.getByLabel(/^Ngưỡng đạt/).fill('28');
  await add.getByRole('button', { name: ROADMAP_VI.ed.saveCp }).click();
  await page.getByTestId('editor-done').click();
  await score(page, 'Checkpoint 2', '18');
  await syncNow(page);
  await expect.poll(() => pendingCount(page)).toBe(0);
  const rows = await mock.rows('u1');
  expect([rows.roadmaps.length, rows.roadmap_phases.length, rows.roadmap_items.length, rows.roadmap_checkpoints.length]).toEqual([1, 5, 21, 6]);
  expect(rows.roadmaps[0]).toMatchObject({ id, title: 'QPT 21 tuần', goal_id: null, milestone_label: 'Thi QPT', milestone_date: '2027-03-09' });
  expect(rows.roadmap_items.map((i) => i.title)).toContain('Thi QPT chính thức');

  const b = await device();
  const bErrors = collectErrors(b.page);
  await freezeClock(b.page, FIXED_TIME_Q1);
  await signInAsMinh(b.page);
  await expectSyncState(b.page, 'synced');
  await syncNow(b.page);
  await gotoHash(b.page, `/roadmaps/${id}`);
  await expect(b.page.getByRole('heading', { level: 1, name: 'QPT 21 tuần' })).toBeVisible();
  await expect(b.page.getByTestId('roadmap-item')).toHaveCount(21);
  await expect(b.page.getByTestId('cp-row')).toHaveCount(6);
  await expect(cpRow(b.page, 'Checkpoint 2').getByTestId('cp-score')).toHaveValue('18');
  await expect(cpRow(b.page, 'Mock 3').getByTestId('cp-threshold')).toContainText('28');
  await b.page.clock.setFixedTime(later(90));
  await score(b.page, 'Checkpoint 2', '21');
  await b.page.getByTestId('detail-edit').click();
  await b.page.getByTestId('editor-checkpoints').getByRole('button', { name: 'Xóa Mock 3' }).click();
  await b.page.getByRole('dialog').getByRole('button', { name: ROADMAP_VI.ed.deleteCpConfirm }).click();
  await b.page.getByTestId('editor-done').click();
  await syncNow(b.page);
  await expect.poll(async () => Number((await mock.rows('u1')).roadmap_checkpoints.find((c) => c.title === 'Checkpoint 2')?.score)).toBe(21);
  await expect.poll(async () => (await mock.rows('u1')).roadmap_checkpoints.find((c) => c.title === 'Mock 3')?.deleted_at ?? null).not.toBeNull();

  await syncNow(page);
  await gotoHash(page, `/roadmaps/${id}`);
  await expect(cpRow(page, 'Checkpoint 2').getByTestId('cp-score')).toHaveValue('21');
  await expect(page.getByTestId('cp-row')).toHaveCount(5);
  await expect(page.getByTestId('cp-row').locator('.cp-n')).not.toContainText(['Mock 3']);

  expect(errors.list).toEqual([]);
  expect(bErrors.list).toEqual([]);
  expect(rec.external()).toEqual([]);
  expect(rec.urls.every((u) => /^http:\/\/(localhost:4174|127\.0\.0\.1:54321)\//.test(u))).toBe(true);
});
