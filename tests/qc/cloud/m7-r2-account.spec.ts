// QC M7 round 2 — verifies the D2 fix by TIMELINE (which token touched REST, and when), and adds the
// variants asked for in round 2: the session expires in the middle of a running cycle, and the person
// signs out in the middle of a running cycle. Requests are recorded in the browser (Authorization header
// decoded to the `sub` claim only; tokens are never logged).
import { expect, test } from '../../../e2e/cloud/fixtures';
import { accountCard, C1, collectErrors, expectSyncState, signInAsMinh, signInViaMock, signOutDialog } from '../../../e2e/cloud/helpers';
import { createGoal, EN, gotoHash, logTime, toast } from '../../../e2e/helpers/app';
import type { Page } from '@playwright/test';

const U1_ID = '00000000-0000-4000-8000-000000000001';
const LONG = { startDate: '2026-01-01', endDate: '2027-12-31' };

interface Rec {
  t: number;
  method: string;
  path: string;
  sub: string | null;
}

/** Record every request to the mock (REST + token endpoint) with the `sub` of its bearer token. */
function timeline(page: Page): { all: Rec[] } {
  const all: Rec[] = [];
  page.on('request', (req) => {
    const u = new URL(req.url());
    if (!u.pathname.startsWith('/rest/') && !u.pathname.startsWith('/auth/v1/token')) return;
    const bearer = (req.headers()['authorization'] ?? '').replace(/^Bearer\s+/i, '');
    let sub: string | null;
    try {
      sub = (JSON.parse(Buffer.from(bearer.split('.')[1] ?? '', 'base64url').toString('utf8')) as { sub?: string }).sub ?? null;
    } catch {
      sub = null;
    }
    all.push({ t: Date.now(), method: req.method(), path: u.pathname, sub });
  });
  return { all };
}

test.beforeEach(async ({ mock }) => {
  await mock.reset();
});

async function rawCounts(page: Page): Promise<{ goals: number; entries: number; kv: string[] }> {
  return page.evaluate(
    () =>
      new Promise((resolve, reject) => {
        const req = indexedDB.open('one-percent-better');
        req.onerror = () => reject(req.error);
        req.onsuccess = () => {
          const db = req.result;
          const tx = db.transaction(['goals', 'entries', 'kv'], 'readonly');
          const g = tx.objectStore('goals').count();
          const e = tx.objectStore('entries').count();
          const k = tx.objectStore('kv').getAllKeys();
          tx.oncomplete = () => {
            db.close();
            resolve({ goals: g.result, entries: e.result, kv: k.result as string[] });
          };
        };
      }),
  );
}

test.describe('QC M7 r2 - D2: expired session, then another account', () => {
  for (const variant of ['expired by a plain 401', 'expired in the middle of a running cycle (401 after 1.5 s)'] as const) {
    test(`${variant}: no REST write before "Add to account", nothing from the old u1 session either; u2 stays at 0 rows`, async ({ page, mock }) => {
      const errors = collectErrors(page);
      const tl = timeline(page);
      await createGoal(page, { name: 'Read', targetValue: 30, ...LONG });
      await signInAsMinh(page);
      await expectSyncState(page, 'synced');
      await mock.fail('rest', 401, 1000, variant.startsWith('expired in') ? 1500 : 0);
      await gotoHash(page, '/today');
      await logTime(page, 'Read', 7);
      await expectSyncState(page, 'expired', 20_000);
      await mock.clearFailures();

      await gotoHash(page, '/settings');
      expect((await rawCounts(page)).entries).toBe(1); // the change is still on the device (not lost)
      await page.getByRole('button', { name: EN.auth.signInGoogle }).click();
      await page.waitForURL((u) => u.pathname === '/auth/v1/authorize');
      const clickedAt = Date.now();
      await page.getByRole('button', { name: 'Other User', exact: true }).click();
      await expect(page.getByTestId('merge-dialog')).toHaveAttribute('open', { timeout: 15_000 });
      await page.waitForTimeout(3000); // any stray cycle (debounce 2 s) would have fired by now
      const beforeAnswer = tl.all.filter((r) => r.t >= clickedAt);
      console.log(`QC D2 timeline (${variant}): ` + beforeAnswer.map((r) => `+${r.t - clickedAt}ms ${r.method} ${r.path} ${r.sub === null ? 'anon' : r.sub.endsWith('2') ? 'u2' : 'u1'}`).join(' | '));
      const writes = beforeAnswer.filter((r) => r.path.startsWith('/rest/') && r.method !== 'GET');
      expect(writes, JSON.stringify(beforeAnswer)).toEqual([]);
      expect((await mock.rows('u2')).goals).toHaveLength(0);
      expect((await mock.rows('u2')).entries).toHaveLength(0);
      const restSubs = [...new Set(beforeAnswer.filter((r) => r.path.startsWith('/rest/')).map((r) => r.sub))];
      expect(restSubs.filter((x) => x === U1_ID), 'REST requests carrying the OLD u1 token after choosing the other account').toEqual([]);

      // Cancel: signs out, uploads nothing; the entry is still on the device.
      await page.getByTestId('merge-dialog').getByRole('button', { name: EN.common.cancel }).click();
      await expect(accountCard(page)).toHaveAttribute('data-state', 'signed-out', { timeout: 15_000 });
      await page.waitForTimeout(2500);
      expect((await mock.rows('u2')).entries).toHaveLength(0);
      expect((await rawCounts(page)).entries).toBeGreaterThanOrEqual(1);
      expect(errors.list).toEqual([]);
    });
  }

  test('"Add to account" after the question uploads to u2 (and only then)', async ({ page, mock }) => {
    await createGoal(page, { name: 'Read', targetValue: 30, ...LONG });
    await signInAsMinh(page);
    await expectSyncState(page, 'synced');
    await mock.fail('rest', 401, 1000);
    await gotoHash(page, '/today');
    await logTime(page, 'Read', 7);
    await expectSyncState(page, 'expired', 20_000);
    await mock.clearFailures();
    await gotoHash(page, '/settings');
    await page.getByRole('button', { name: EN.auth.signInGoogle }).click();
    await page.waitForURL((u) => u.pathname === '/auth/v1/authorize');
    await page.getByRole('button', { name: 'Other User', exact: true }).click();
    await expect(page.getByTestId('merge-dialog')).toHaveAttribute('open', { timeout: 15_000 });
    expect((await mock.liveRows('u2')).entries).toHaveLength(0);
    await page.getByTestId('merge-confirm').click();
    await expect.poll(async () => (await mock.liveRows('u2')).entries.length, { timeout: 15_000 }).toBe(1);
  });

  test('expired, then the SAME account signs in again: no D5, the waiting change is pushed', async ({ page, mock }) => {
    await createGoal(page, { name: 'Read', targetValue: 30, ...LONG });
    await signInAsMinh(page);
    await expectSyncState(page, 'synced');
    await mock.fail('rest', 401, 1000);
    await gotoHash(page, '/today');
    await logTime(page, 'Read', 7);
    await expectSyncState(page, 'expired', 20_000);
    await mock.clearFailures();
    await gotoHash(page, '/settings');
    await signInViaMock(page, 'Minh Test');
    await expect(page.getByTestId('merge-dialog')).not.toHaveAttribute('open', '');
    await expect.poll(async () => (await mock.liveRows('u1')).entries.length, { timeout: 15_000 }).toBe(1);
    await expectSyncState(page, 'synced', 15_000);
  });
});

test.describe('QC M7 r2 - sign-out in the middle of a running cycle', () => {
  test('Remove while a pull is in flight: the late response never repopulates the wiped device, and no REST request starts after sign-out', async ({ page, mock }) => {
    const errors = collectErrors(page);
    const tl = timeline(page);
    await mock.seed('u1', C1);
    await signInAsMinh(page);
    await expectSyncState(page, 'synced', 20_000);
    expect((await rawCounts(page)).goals).toBeGreaterThan(0);
    // New cloud rows + a slow server: the next pull is in flight for ~3 s.
    await mock.seed('u1', { goals: [{ id: 'late-goal', name: 'Late', why: '', targetType: 'daily', targetMinutes: 10, startDate: '2026-01-01', endDate: '2027-12-31', archived: false, createdAt: '2026-10-12T01:00:00.000Z', updatedAt: '2026-10-12T01:00:00.000Z', deletedAt: null }] });
    await page.route('**/rest/v1/**', async (route) => {
      if (route.request().method() === 'GET') await new Promise((r) => setTimeout(r, 3000));
      await route.continue();
    });
    await gotoHash(page, '/settings');
    await page.getByTestId('sync-now').click();
    await expectSyncState(page, 'syncing', 5000);
    await accountCard(page).getByRole('button', { name: EN.settings.account.signOut }).click();
    await signOutDialog(page).getByRole('radio', { name: EN.auth.signOut.remove }).check();
    await page.getByTestId('signout-confirm').click();
    await expect(accountCard(page)).toHaveAttribute('data-state', 'signed-out', { timeout: 30_000 });
    const signedOutAt = Date.now();
    await page.waitForTimeout(6000); // let every delayed response arrive
    const raw = await rawCounts(page);
    expect(raw.goals, 'device must stay empty after Remove').toBe(0);
    expect(raw.entries).toBe(0);
    expect(raw.kv).not.toContain('prefsSync');
    const late = tl.all.filter((r) => r.t > signedOutAt && r.path.startsWith('/rest/'));
    expect(late, JSON.stringify(late)).toEqual([]);
    await gotoHash(page, '/today');
    await expect(page.getByRole('heading', { name: EN.empty.today.noGoals })).toBeVisible();
    expect(errors.list).toEqual([]);
  });

  test('Keep while a pull is in flight: the device keeps its data, no cycle continues afterwards, signing in as the other account asks first', async ({ page, mock }) => {
    const tl = timeline(page);
    await createGoal(page, { name: 'Read', targetValue: 30, ...LONG });
    await signInAsMinh(page);
    await expectSyncState(page, 'synced', 20_000);
    await page.route('**/rest/v1/**', async (route) => {
      if (route.request().method() === 'GET') await new Promise((r) => setTimeout(r, 3000));
      await route.continue();
    });
    await gotoHash(page, '/settings');
    await page.getByTestId('sync-now').click();
    await expectSyncState(page, 'syncing', 5000);
    await accountCard(page).getByRole('button', { name: EN.settings.account.signOut }).click();
    await page.getByTestId('signout-confirm').click(); // Keep
    await expect(accountCard(page)).toHaveAttribute('data-state', 'signed-out', { timeout: 30_000 });
    const signedOutAt = Date.now();
    await page.waitForTimeout(6000);
    expect(tl.all.filter((r) => r.t > signedOutAt && r.path.startsWith('/rest/'))).toEqual([]);
    expect((await rawCounts(page)).goals).toBe(1);
    await page.unroute('**/rest/v1/**');
    await signInViaMock(page, 'Other User');
    await expect(page.getByTestId('merge-dialog')).toHaveAttribute('open', { timeout: 15_000 });
    await page.waitForTimeout(2500);
    expect((await mock.rows('u2')).goals).toHaveLength(0);
    await expect(toast(page)).toHaveCount(0);
  });
});
