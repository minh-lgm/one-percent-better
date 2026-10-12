// QC M7 round 1 — invariants that whole-record last-write-wins cannot protect (two offline devices break a
// rule that each device enforced locally). The app must stay usable: no error screen, no page error.
import { expect, test } from '../../../e2e/cloud/fixtures';
import { collectErrors, expectSyncState, signInAsMinh, syncNow } from '../../../e2e/cloud/helpers';
import { createGoal, EN, expectAxeClean, goalCard, gotoHash, logTime } from '../../../e2e/helpers/app';

const LONG = { startDate: '2026-01-01', endDate: '2027-12-31' };

test.beforeEach(async ({ mock }) => {
  await mock.reset();
});

test('two offline devices each log 1000 min on the same day (limit 1440 per goal/day): after the merge both show 2,000, nothing crashes, no error screen', async ({ page, context, mock, device }) => {
  const errA = collectErrors(page);
  await createGoal(page, { name: 'Read', targetValue: 30, ...LONG });
  await signInAsMinh(page);
  await expectSyncState(page, 'synced');
  const b = await device();
  const errB = collectErrors(b.page);
  await signInAsMinh(b.page);
  await expectSyncState(b.page, 'synced');
  await context.setOffline(true);
  await b.context.setOffline(true);
  await gotoHash(page, '/today');
  await logTime(page, 'Read', 1000);
  await gotoHash(b.page, '/today');
  await logTime(b.page, 'Read', 1000);
  await context.setOffline(false);
  await b.context.setOffline(false);
  await expect.poll(async () => (await mock.liveRows('u1')).entries.length, { timeout: 20_000 }).toBe(2);
  await syncNow(page);
  await syncNow(b.page);
  for (const p of [page, b.page]) {
    await gotoHash(p, '/today');
    await expect(goalCard(p, 'Read').locator('.amount')).toContainText('2,000/30');
    await expectAxeClean(p);
    await gotoHash(p, '/review');
    await expect(p.getByRole('heading', { level: 1 })).toBeVisible();
    await gotoHash(p, '/goals');
    await expect(p.getByRole('heading', { level: 3, name: 'Read' })).toBeVisible();
  }
  await gotoHash(page, '/today');
  await expect(page.getByRole('alert')).toHaveCount(0);
  expect(errA.list).toEqual([]);
  expect(errB.list).toEqual([]);
  expect(EN.today.title).toBe('Today');
});

test('A shrinks the goal period while offline B logs an entry in the removed range: after the merge the goal, Goal detail, Review and Today still render', async ({ page, context, mock, device }) => {
  const errA = collectErrors(page);
  await createGoal(page, { name: 'Read', targetValue: 30, ...LONG });
  await signInAsMinh(page);
  await expectSyncState(page, 'synced');
  const b = await device();
  const errB = collectErrors(b.page);
  await signInAsMinh(b.page);
  await expectSyncState(b.page, 'synced');
  const goalId = (await mock.liveRows('u1')).goals[0]!.id as string;
  await context.setOffline(true);
  await b.context.setOffline(true);
  // B: entry on 2026-10-05 through the Day screen of that date.
  await gotoHash(b.page, '/day/2026-10-05');
  await goalCard(b.page, 'Read').getByRole('button', { name: EN.goalCard.addEntry }).click();
  await goalCard(b.page, 'Read').getByLabel(/^Minutes/).fill('25');
  await goalCard(b.page, 'Read').getByRole('button', { name: EN.entry.form.save }).click();
  // A: shrink the period to start on 2026-10-10 (no entries yet on A, so A accepts it).
  await gotoHash(page, `/goals/${goalId}/edit`);
  await page.getByLabel(new RegExp(`^${EN.goal.form.startLabel}`)).fill('2026-10-10');
  await page.getByRole('button', { name: EN.goal.form.saveChanges }).click();
  await expect(page.getByRole('heading', { level: 1, name: EN.goals.title })).toBeVisible();
  await context.setOffline(false);
  await b.context.setOffline(false);
  await expect.poll(async () => (await mock.liveRows('u1')).entries.length, { timeout: 20_000 }).toBe(1);
  await syncNow(page);
  await syncNow(b.page);
  for (const p of [page, b.page]) {
    for (const route of ['/today', '/goals', `/goals/${goalId}`, '/review', '/day/2026-10-05']) {
      await gotoHash(p, route);
      await expect(p.getByRole('heading', { level: 1 })).toBeVisible();
      await expect(p.getByTestId('error-state')).toHaveCount(0);
    }
  }
  expect(errA.list).toEqual([]);
  expect(errB.list).toEqual([]);
});
