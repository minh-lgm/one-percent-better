// QC M10 round 1 - M10-AC4/AC5 in the browser with the cloud ON (mock Supabase), and M10-AC6(2) PKCE leftovers.
//  - a device that has synced keeps its unsynced (dirty 1) tombstones through the purge, pushes the deletion later,
//    then purges it; the account keeps the tombstone and a second device never sees the goal again
//  - after sign-in / sign-out / a replayed callback no PKCE verifier key is left in localStorage
import type { Page } from '@playwright/test';
import { expect, test } from '../../../e2e/cloud/fixtures';
import { accountCard, collectErrors, expectSyncState, signInAsMinh, signInViaMock, syncNow, MOCK_SUPABASE_URL } from '../../../e2e/cloud/helpers';
import { createGoal, EN, freezeClock, goalCard, gotoHash, logTime } from '../../../e2e/helpers/app';

interface RawGoal {
  name: string;
  deletedAt: string | null;
  dirty: number;
}

async function rawGoals(page: Page): Promise<RawGoal[]> {
  return page.evaluate(
    () =>
      new Promise<RawGoal[]>((resolve, reject) => {
        const req = indexedDB.open('one-percent-better');
        req.onerror = () => reject(req.error);
        req.onsuccess = () => {
          const db = req.result;
          const all = db.transaction('goals', 'readonly').objectStore('goals').getAll();
          all.onsuccess = () => {
            resolve((all.result as RawGoal[]).map((g) => ({ name: g.name, deletedAt: g.deletedAt ?? null, dirty: g.dirty })));
            db.close();
          };
          all.onerror = () => reject(all.error);
        };
      }),
  );
}

test.beforeEach(async ({ mock }) => {
  await mock.reset();
});

test('purge never drops an unsynced tombstone of a device that has synced; after the push it is purged; the account keeps the tombstone; device B never sees the goal', async ({ page, context, mock, device }) => {
  test.setTimeout(120_000);
  const errors = collectErrors(page);
  await freezeClock(page, new Date('2026-09-01T10:00:00+07:00'));
  await createGoal(page, { name: 'Read', targetValue: 30, startDate: '2026-08-01', endDate: '2026-12-31' });
  await createGoal(page, { name: 'Keep', targetValue: 15, startDate: '2026-08-01', endDate: '2026-12-31' });
  await signInAsMinh(page);
  await expectSyncState(page, 'synced');
  await expect.poll(async () => (await mock.liveRows('u1')).goals.length).toBe(2);
  const readId = (await mock.liveRows('u1')).goals.find((g) => g.name === 'Read')!.id;

  // Time passes (a frozen clock would stamp the deletion with the very millisecond of the creation: a tie, not what a user does).
  await freezeClock(page, new Date('2026-09-01T11:00:00+07:00'));
  // The mock becomes unreachable (the app still believes it is online): the deletion stays dirty = 1.
  await context.route(`${MOCK_SUPABASE_URL}/**`, (route) => route.abort('connectionrefused'));
  await gotoHash(page, '/goals');
  await page.getByTestId('goal-row').filter({ hasText: 'Read' }).getByRole('button', { name: EN.common.delete }).click();
  await page.getByRole('dialog').getByRole('button', { name: EN.goal.delete.confirm }).click();
  await expect(page.getByTestId('goal-row')).toHaveCount(1);
  expect(await rawGoals(page)).toEqual(expect.arrayContaining([expect.objectContaining({ name: 'Read', dirty: 1, deletedAt: expect.any(String) })]));

  // 38 days later the app is opened again, still without a connection to the account: tombstone must survive the purge.
  await freezeClock(page, new Date('2026-10-09T10:00:00+07:00'));
  await page.reload();
  await expect(page.getByRole('heading', { level: 1, name: EN.goals.title })).toBeVisible();
  await page.waitForTimeout(3500); // purge runs when the browser is idle (<= 10 s)
  const unsynced = (await rawGoals(page)).find((g) => g.name === 'Read');
  expect(unsynced, 'unsynced tombstone must still be there (ADR-29: dirty 1 on a device that has synced)').toBeTruthy();
  expect(unsynced!.dirty).toBe(1);

  // Connection back: the deletion reaches the account.
  await context.unroute(`${MOCK_SUPABASE_URL}/**`);
  await gotoHash(page, '/settings');
  await syncNow(page);
  await expect.poll(async () => JSON.stringify((await mock.rows('u1')).goals.find((g) => g.id === readId) ?? null), { timeout: 10_000 }).toMatch(/"deleted_at":"/);
  expect((await rawGoals(page)).find((g) => g.name === 'Read')?.dirty).toBe(0);

  // Next start: dirty 0 and older than 30 days -> hard-deleted locally.
  await page.reload();
  await expect(page.getByRole('heading', { level: 1, name: EN.settings.title })).toBeVisible();
  await expect.poll(async () => (await rawGoals(page)).some((g) => g.name === 'Read'), { timeout: 12_000 }).toBe(false);
  expect((await rawGoals(page)).map((g) => g.name)).toEqual(['Keep']);
  // The account still holds the tombstone (cloud is not purged), and its live set is just Keep.
  expect((await mock.rows('u1')).goals.find((g) => g.id === readId)?.deleted_at).toEqual(expect.any(String));
  expect((await mock.liveRows('u1')).goals.map((g) => g.name)).toEqual(['Keep']);

  // A second device signs in and syncs: never sees "Read".
  const b = await device();
  await freezeClock(b.page, new Date('2026-10-09T10:00:00+07:00'));
  await signInAsMinh(b.page);
  await gotoHash(b.page, '/goals');
  await expect(b.page.getByTestId('goal-row')).toHaveCount(1);
  await expect(goalCard(b.page, 'Read')).toHaveCount(0);

  // And device A after one more full sync still agrees.
  await gotoHash(page, '/settings');
  await syncNow(page);
  await gotoHash(page, '/goals');
  await expect(page.getByTestId('goal-row')).toHaveCount(1);
  expect(errors.list).toEqual([]);
});

test('purge with entries: a goal with logged time is deleted and synced, 38 days later the other goal and its entry are intact on device and account', async ({ page, mock }) => {
  test.setTimeout(120_000);
  await freezeClock(page, new Date('2026-09-01T10:00:00+07:00'));
  await createGoal(page, { name: 'Read', targetValue: 30, startDate: '2026-08-01', endDate: '2026-12-31' });
  await createGoal(page, { name: 'Keep', targetValue: 15, startDate: '2026-08-01', endDate: '2026-12-31' });
  await gotoHash(page, '/today');
  await logTime(page, 'Keep', 12);
  await logTime(page, 'Read', 20);
  await signInAsMinh(page);
  await expectSyncState(page, 'synced');
  await freezeClock(page, new Date('2026-09-01T11:00:00+07:00'));
  await gotoHash(page, '/goals');
  await page.getByTestId('goal-row').filter({ hasText: 'Read' }).getByRole('button', { name: EN.common.delete }).click();
  await page.getByRole('dialog').getByRole('button', { name: EN.goal.delete.confirm }).click();
  await gotoHash(page, '/settings');
  await syncNow(page);
  await expect.poll(async () => (await mock.liveRows('u1')).goals.map((g) => g.name)).toEqual(['Keep']);
  await freezeClock(page, new Date('2026-10-09T10:00:00+07:00'));
  await page.reload();
  await expect(page.getByRole('heading', { level: 1, name: EN.settings.title })).toBeVisible();
  await page.waitForTimeout(4000);
  // The most recent server row may be pulled back as a synced tombstone right after the purge (ADR-29 / ADR-30 c: harmless).
  const left = (await rawGoals(page)).filter((g) => g.name === 'Read');
  for (const g of left) expect(g.deletedAt, 'any surviving Read row must be a tombstone').not.toBeNull();
  await gotoHash(page, '/review');
  await expect(page.getByRole('heading', { level: 1, name: EN.review.title })).toBeVisible();
  const live = await mock.liveRows('u1');
  expect(live.goals.map((g) => g.name)).toEqual(['Keep']);
  expect(live.entries.map((e) => e.minutes)).toEqual([12]);
});

test.describe('PKCE verifier leftovers (M6-P1c)', () => {
  const keys = (page: Page) => page.evaluate(() => Object.keys(localStorage).sort());

  test('no key mentioning a verifier survives sign-in, a replayed callback, or sign-out', async ({ page }) => {
    await freezeClock(page);
    await gotoHash(page, '/settings');
    await signInViaMock(page, 'Minh Test');
    await expect(accountCard(page)).toHaveAttribute('data-state', 'signed-in');
    expect((await keys(page)).filter((k) => /verifier/i.test(k))).toEqual([]);
    // replay of a stale callback URL while signed in (M6-D1 scenario)
    await page.goto('?auth=callback&code=stale-code#/settings');
    await expect(accountCard(page)).toBeVisible();
    await page.waitForTimeout(800);
    expect((await keys(page)).filter((k) => /verifier/i.test(k))).toEqual([]);
    await expect(accountCard(page)).toHaveAttribute('data-state', 'signed-in');
    // error callback from the provider
    await page.goto('?auth=callback&error=access_denied&error_description=nope#/settings');
    await page.waitForTimeout(800);
    expect((await keys(page)).filter((k) => /verifier/i.test(k))).toEqual([]);
  });

  test('a full sign-in leaves the session key and no verifier key', async ({ page }) => {
    await freezeClock(page);
    await gotoHash(page, '/settings');
    await page.getByRole('button', { name: EN.auth.signInGoogle }).click();
    await page.waitForURL((u) => u.origin === MOCK_SUPABASE_URL && u.pathname === '/auth/v1/authorize');
    // we are on the mock provider page: the app's origin is not readable here, go back through the callback instead
    await page.getByRole('button', { name: 'Minh Test', exact: true }).click();
    await page.waitForURL((u) => u.origin !== MOCK_SUPABASE_URL && !u.searchParams.has('code'));
    await expect(accountCard(page)).toHaveAttribute('data-state', 'signed-in');
    const k = await keys(page);
    expect(k).toContain('opb-auth');
    expect(k.filter((x) => /verifier/i.test(x))).toEqual([]);
  });
});
