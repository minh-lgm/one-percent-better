// QC M18 round 1 — independent cloud checks: (1) lazy sync engine on the wire, (2) the Demo M18 with two contexts and
// the "roadmap tables missing" mode. Only the mock Supabase (127.0.0.1:54321) and the app (localhost:4174) are contacted.
import type { Page } from '@playwright/test';
import { expect, test } from '../../../e2e/cloud/fixtures';
import { accountCard, collectErrors, expectSyncState, pendingCount, recordRequests, signInAsMinh, signInButton, syncNow } from '../../../e2e/cloud/helpers';
import { EN, FIXED_TIME_Q1, freezeClock, gotoHash, importBackup } from '../../../e2e/helpers/app';

/** Record every JavaScript response body (url → text) so the engine chunk can be told apart by content. */
function recordScripts(page: Page): { bodies: Map<string, string>; done: () => Promise<void> } {
  const bodies = new Map<string, string>();
  const pending: Promise<void>[] = [];
  page.on('response', (res) => {
    const url = res.url();
    if (!/\.js(\?|$)/.test(url) || !url.startsWith('http://localhost:4174/')) return;
    pending.push(res.text().then((t) => void bodies.set(url, t)).catch(() => undefined));
  });
  return { bodies, done: async () => void (await Promise.all(pending)) };
}

test.beforeEach(async ({ mock }) => {
  await mock.reset();
});

test.describe('M18 lazy sync engine on the wire (user decision 2026-11-04)', () => {
  test('signed-out cold load of #/today requests no engine chunk and no script contains the lock name; Sign in loads exactly one; a stored session loads it at startup and syncs without interaction', async ({ page, mock }) => {
    const rec = recordRequests(page);
    const scripts = recordScripts(page);
    await freezeClock(page, FIXED_TIME_Q1);
    await gotoHash(page, '/today');
    await expect(page.locator('main h1')).toBeVisible();
    await page.waitForTimeout(1500);
    await scripts.done();
    expect(rec.urls.filter((u) => /sync-engine/.test(u))).toEqual([]);
    expect(rec.sdk()).toEqual([]);
    expect(rec.mock()).toEqual([]);
    expect(scripts.bodies.size).toBeGreaterThan(0);
    for (const [url, body] of scripts.bodies) expect(body.includes('opb-sync'), `lock name inside eager script ${url}`).toBe(false);

    // Sign in through the mock provider: one engine chunk, and it is the one that holds the lock name.
    await gotoHash(page, '/settings');
    await signInAsMinh(page);
    await expectSyncState(page, 'synced');
    await scripts.done();
    // The OAuth round trip is two page loads (before the redirect and after the callback): one chunk URL, fetched at most twice.
    const engine = rec.urls.filter((u) => /sync-engine/.test(u));
    expect(new Set(engine).size).toBe(1);
    expect(engine.length).toBeLessThanOrEqual(2);
    expect(scripts.bodies.get(engine[0]!)?.includes('opb-sync')).toBe(true);

    // Reload with the stored session: the engine is requested at startup and the first cycle pulls without a click.
    const before = (await mock.log()).log.length;
    const rec2 = recordRequests(page);
    await page.reload();
    await expect(page.locator('main h1')).toBeVisible();
    await expect.poll(() => rec2.urls.filter((u) => /sync-engine/.test(u)).length, { timeout: 15_000 }).toBe(1);
    await expect.poll(async () => (await mock.log()).log.slice(before).filter((l) => l.path.startsWith('/rest/v1/goals')).length, { timeout: 15_000 }).toBeGreaterThan(0);
    await expectSyncState(page, 'synced');
  });
});

test.describe('M18 Demo with the roadmap tables missing', () => {
  test('hint in Settings and Big goals, never "Sign in again", pending stays, goals keep syncing; enabling the tables clears everything; B receives Q1', async ({ page, mock, device }) => {
    test.setTimeout(120_000);
    const errors = collectErrors(page);
    const rec = recordRequests(page);
    await freezeClock(page, FIXED_TIME_Q1);
    await importBackup(page, 'q1-roadmap-backup.json');
    await mock.config({ roadmapTables: false });
    await gotoHash(page, '/settings');
    await signInAsMinh(page);
    await expect(accountCard(page).getByTestId('roadmaps-unavailable')).toHaveText(EN.settings.account.roadmapsUnavailable);
    await expect.poll(async () => (await mock.rows('u1')).goals.length).toBe(6);
    expect((await mock.rows('u1')).roadmap_items).toEqual([]);
    expect(await pendingCount(page)).toBe(32);
    for (const route of ['/settings', '/roadmaps', '/today']) {
      await gotoHash(page, route);
      await expect(page.locator('main h1')).toBeVisible();
      const hits = await page.getByText(/sign in again/i).evaluateAll((els) => els.filter((e) => (e as HTMLElement).offsetParent !== null).map((e) => `${e.tagName}#${e.id}[${e.getAttribute('data-testid')}] visible=${(e as HTMLElement).offsetParent !== null} :: ${(e.textContent ?? '').slice(0, 120)}`));
      expect(hits, route).toEqual([]);
    }
    await gotoHash(page, '/roadmaps');
    await expect(page.getByTestId('roadmaps-unavailable')).toBeVisible();
    // Several manual cycles while missing: still ok, flag stays, nothing rejected, no sign-in prompt.
    await gotoHash(page, '/settings');
    for (let i = 0; i < 3; i++) {
      await page.getByTestId('sync-now').click();
      await page.waitForTimeout(500);
    }
    expect(await pendingCount(page)).toBe(32);
    await expect(accountCard(page)).toHaveAttribute('data-state', 'signed-in');
    await expect(page.getByTestId('rejected-note')).toHaveCount(0);

    await mock.config({ roadmapTables: true });
    await syncNow(page);
    await expect(accountCard(page).getByTestId('roadmaps-unavailable')).toHaveCount(0);
    await expect.poll(() => pendingCount(page)).toBe(0);
    expect((await mock.rows('u1')).roadmap_items).toHaveLength(21);

    const b = await device();
    await freezeClock(b.page, FIXED_TIME_Q1);
    await signInAsMinh(b.page);
    await expectSyncState(b.page, 'synced');
    await gotoHash(b.page, '/roadmaps');
    await expect(b.page.getByTestId('roadmap-row')).toHaveCount(1);
    await expect(b.page.getByTestId('roadmap-progress')).toHaveText('Done 1/21');
    await expect(signInButton(b.page)).toHaveCount(0);

    expect(errors.list).toEqual([]);
    expect(rec.external()).toEqual([]);
    expect(rec.urls.every((u) => /^http:\/\/(localhost:4174|127\.0\.0\.1:54321)\//.test(u))).toBe(true);
  });
});
