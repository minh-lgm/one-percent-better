// QC M7 round 1 — exploratory probes: consent when the account changes, sign out matrix with a broken
// sync, two tabs (Web Locks), untrusted cloud data, import while signed in, language from the cloud on
// another route, and a poison-pill check (a locally valid row the server rejects).
import { expect, test, type MockApi } from '../../../e2e/cloud/fixtures';
import { accountCard, CLOUD_BASE_URL, ALLOWED_ORIGINS, C1, collectErrors, expectSyncState, kvSync, pendingCount, recordRequests, signInAsMinh, signInViaMock, signOutDialog, storedSession, syncIndicator, syncNow } from '../../../e2e/cloud/helpers';
import { createGoal, EN, goalCard, gotoHash, importBackup, kvGet, logTime, toast, VI, fixturePath } from '../../../e2e/helpers/app';
import { readFileSync } from 'node:fs';
import type { Browser, BrowserContext, Page } from '@playwright/test';

// ---- local helpers (kept per file: Playwright refuses to import one spec file into another) ----
interface CtxOptions {
  locale?: string;
  width?: number;
  height?: number;
  colorScheme?: 'light' | 'dark';
}

/** Per-worker User-Agent so the mock keeps this context in the worker's partition. */
function workerUserAgent(workerIndex: number): string {
  return `Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/140.0 Safari/537.36 opb-e2e-w${workerIndex}-${process.pid}`;
}

async function newDevice(browser: Browser, workerIndex: number, o: CtxOptions = {}): Promise<{ context: BrowserContext; page: Page }> {
  const context = await browser.newContext({
    baseURL: CLOUD_BASE_URL,
    userAgent: workerUserAgent(workerIndex),
    timezoneId: 'Asia/Ho_Chi_Minh',
    locale: o.locale ?? 'en-US',
    viewport: { width: o.width ?? 1280, height: o.height ?? 800 },
    colorScheme: o.colorScheme ?? 'light',
  });
  const page = await context.newPage();
  return { context, page };
}

/** Read the sample backup and return a modified copy as an in-memory upload payload. */
function backupPayload(mutate: (file: { goals: Array<Record<string, unknown>>; entries: Array<Record<string, unknown>>; settings: Record<string, unknown> }) => void) {
  const file = JSON.parse(readFileSync(fixturePath('sample-backup.json'), 'utf8')) as { goals: Array<Record<string, unknown>>; entries: Array<Record<string, unknown>>; settings: Record<string, unknown> };
  mutate(file);
  return { name: 'backup.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(file)) };
}

/** Import an in-memory backup through the real UI (Settings -> file -> D3 -> confirm). */
async function importPayload(page: Page, payload: { name: string; mimeType: string; buffer: Buffer }, confirmLabel: string): Promise<void> {
  await gotoHash(page, '/settings');
  await page.getByTestId('import-file').setInputFiles(payload);
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: confirmLabel }).click();
  await expect(dialog).toBeHidden();
}

/** All console messages and page errors of a page (token/secret leak checks). */
function collectConsole(page: Page): { all: string[]; errors: string[] } {
  const all: string[] = [];
  const errors: string[] = [];
  page.on('console', (m) => all.push(`${m.type()}: ${m.text()}`));
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  return { all, errors };
}


const LONG = { startDate: '2026-01-01', endDate: '2027-12-31' };

test.beforeEach(async ({ mock }) => {
  await mock.reset();
});

async function cloudEntries(mock: { liveRows: (u: 'u1' | 'u2') => Promise<{ entries: unknown[] }> }, n: number): Promise<void> {
  await expect.poll(async () => (await mock.liveRows('u1')).entries.length, { timeout: 15_000 }).toBe(n);
}

async function openSignOut(page: Parameters<typeof gotoHash>[0]): Promise<void> {
  await gotoHash(page, '/settings');
  await accountCard(page).getByRole('button', { name: EN.settings.account.signOut }).click();
  await expect(signOutDialog(page)).toHaveAttribute('open');
}

test.describe('QC M7: consent when the account changes (FR-47, D5)', () => {
  test('reloading while D5 is open does not upload anything: the question comes back and u2 stays empty', async ({ page, mock }) => {
    await mock.seed('u1', C1);
    await createGoal(page, { name: 'Read', targetValue: 30, ...LONG });
    await signInAsMinh(page);
    await expectSyncState(page, 'synced');
    await gotoHash(page, '/settings');
    await accountCard(page).getByRole('button', { name: EN.settings.account.signOut }).click();
    await page.getByTestId('signout-confirm').click(); // Keep
    await expect(accountCard(page)).toHaveAttribute('data-state', 'signed-out');
    await signInViaMock(page, 'Other User');
    await expect(page.getByTestId('merge-dialog')).toHaveAttribute('open');
    // The user closes the tab / reloads without answering.
    await page.reload();
    await expect(page.getByTestId('merge-dialog')).toHaveAttribute('open', { timeout: 15_000 });
    await page.waitForTimeout(2500); // any background trigger would have fired by now
    const u2 = await mock.rows('u2');
    expect(u2.goals).toHaveLength(0);
    expect(u2.entries).toHaveLength(0);
    // Cancel after the reload still signs out and still uploads nothing.
    await page.getByTestId('merge-dialog').getByRole('button', { name: EN.common.cancel }).click();
    await expect(accountCard(page)).toHaveAttribute('data-state', 'signed-out');
    expect((await mock.rows('u2')).goals).toHaveLength(0);
    expect(await storedSession(page)).toBeNull();
  });

  test('session expired, then the person signs in as ANOTHER Google account: D5 asks first, nothing is uploaded to u2 until "Add to account"', async ({ page, mock }) => {
    test.fail(true, 'M7-D2: a sync cycle started for the stored u1 session pushes the pending rows with the NEW u2 token before D5 is answered');
    await createGoal(page, { name: 'Read', targetValue: 30, ...LONG });
    await signInAsMinh(page);
    await expectSyncState(page, 'synced');
    await mock.fail('rest', 401, 1000);
    await gotoHash(page, '/today');
    await logTime(page, 'Read', 7);
    await expectSyncState(page, 'expired', 15_000);
    await mock.clearFailures();
    await gotoHash(page, '/settings');
    await page.getByRole('button', { name: EN.auth.signInGoogle }).click();
    await page.waitForURL((u) => u.pathname === '/auth/v1/authorize');
    await page.getByRole('button', { name: 'Other User', exact: true }).click();
    await expect(page.getByTestId('merge-dialog')).toHaveAttribute('open', { timeout: 15_000 });
    await expect(page.getByTestId('merge-dialog')).toContainText('other.user@example.com');
    await page.waitForTimeout(2500);
    expect((await mock.rows('u2')).goals).toHaveLength(0);
    expect((await mock.rows('u2')).entries).toHaveLength(0);
    await page.getByTestId('merge-confirm').click();
    await expect(toast(page)).toContainText('Signed in. Your account now has 1 goal, 1 entry.', { timeout: 15_000 });
    expect((await mock.liveRows('u2')).entries).toHaveLength(1);
  });
});

test.describe('QC M6-D1 follow-up: a replayed callback must not pause sync', () => {
  test('stale callback URL while signed in: card stays signed-in AND the next local change still reaches the account', async ({ page, mock }) => {
    await createGoal(page, { name: 'Read', targetValue: 30, ...LONG });
    await signInAsMinh(page);
    await expectSyncState(page, 'synced');
    await page.goto('http://localhost:4174/one-percent-better/?auth=callback&code=already-used-or-bogus');
    await expect(page.getByRole('heading', { level: 1, name: EN.settings.title })).toBeVisible();
    await expect(accountCard(page)).toHaveAttribute('data-state', 'signed-in', { timeout: 15_000 });
    await expectSyncState(page, 'synced', 15_000);
    await gotoHash(page, '/today');
    await logTime(page, 'Read', 4);
    await cloudEntries(mock, 1);
    await expectSyncState(page, 'synced', 15_000);
  });
});

test.describe('QC M7: sign-in feedback when the first sync fails (DESIGN F9/F11, A-D28)', () => {
  test('device with data signs in while the cloud answers 500: some confirmation toast is shown (signedIn), not silence', async ({ page, mock }) => {
    test.fail(true, 'M7-D4: AuthFeedback drops "Signed in as ..." because a merge toast was expected; the merge cycle fails, so no toast is shown at all');
    await createGoal(page, { name: 'Read', targetValue: 30, ...LONG });
    await mock.fail('rest', 500, 1000);
    await gotoHash(page, '/settings');
    await signInViaMock(page, 'Minh Test');
    await expect(toast(page)).toHaveText(/Signed in/, { timeout: 8_000 });
  });
});

test.describe('QC M7: Sign out with a sync that does not work (FR-41, D4)', () => {
  async function setup(page: Parameters<typeof gotoHash>[0], mock: MockApi) {
    await createGoal(page, { name: 'Read', targetValue: 30, ...LONG });
    await signInAsMinh(page);
    await gotoHash(page, '/today');
    await logTime(page, 'Read', 10);
    await cloudEntries(mock, 1);
    await expectSyncState(page, 'synced');
    await mock.fail('rest', 500, 1000);
    await logTime(page, 'Read', 5);
    await expectSyncState(page, 'error', 20_000);
    await gotoHash(page, '/settings');
    await expect.poll(() => pendingCount(page)).toBe(1);
  }

  test('Remove with 1 change waiting and a failing sync: dialog stays, "Remove anyway" appears, Keep still works, nothing is lost silently', async ({ page, mock }) => {
    await setup(page, mock);
    await openSignOut(page);
    const d4 = signOutDialog(page);
    await expect(d4.getByTestId('unsynced-warning')).toContainText("1 change hasn't synced to your account yet.");
    await d4.getByRole('radio', { name: EN.auth.signOut.remove }).check();
    await expect(d4.getByTestId('unsynced-remove')).toHaveText(EN.auth.signOut.unsyncedRemove);
    await expect(page.getByTestId('signout-confirm')).toHaveText(EN.auth.signOut.confirmRemove);
    await page.getByTestId('signout-confirm').click();
    await expect(d4.getByRole('alert')).toContainText(EN.auth.signOut.syncFailed, { timeout: 20_000 });
    await expect(page.getByTestId('signout-confirm')).toHaveText(EN.auth.signOut.removeAnyway);
    await expect(d4).toHaveAttribute('open');
    expect(await storedSession(page)).not.toBeNull();
    // Local data is still all there.
    expect((await kvSync(page))?.userId).toBeTruthy();
    // Change of mind: Keep -> the label goes back and signing out keeps the data (and the unsynced change).
    await d4.getByRole('radio', { name: EN.auth.signOut.keep }).check();
    await expect(page.getByTestId('signout-confirm')).toHaveText(EN.auth.signOut.confirmKeep);
    await page.getByTestId('signout-confirm').click();
    await expect(accountCard(page)).toHaveAttribute('data-state', 'signed-out', { timeout: 20_000 });
    await gotoHash(page, '/today');
    await expect(goalCard(page, 'Read').locator('.amount')).toContainText('15/30');
  });

  test('"Remove anyway" really removes the device data, keeps the cloud copy of what was synced, and loses only the unsynced change', async ({ page, mock }) => {
    await setup(page, mock);
    await openSignOut(page);
    const d4 = signOutDialog(page);
    await d4.getByRole('radio', { name: EN.auth.signOut.remove }).check();
    await page.getByTestId('signout-confirm').click();
    await expect(page.getByTestId('signout-confirm')).toHaveText(EN.auth.signOut.removeAnyway, { timeout: 20_000 });
    await page.getByTestId('signout-confirm').click();
    await expect(accountCard(page)).toHaveAttribute('data-state', 'signed-out', { timeout: 20_000 });
    await expect(toast(page)).toHaveText(EN.toast.signedOutRemoved);
    await gotoHash(page, '/today');
    await expect(page.getByRole('heading', { name: EN.empty.today.noGoals })).toBeVisible();
    // Raw IndexedDB: nothing of the user's data is left (no tombstones either, clearUserData wipes them).
    const raw = await page.evaluate(
      () =>
        new Promise<{ goals: number; entries: number; kv: string[] }>((resolve, reject) => {
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
    expect(raw.goals).toBe(0);
    expect(raw.entries).toBe(0);
    expect(raw.kv).not.toContain('prefsSync');
    expect(raw.kv).not.toContain('activeTimer');
    await mock.clearFailures();
    expect((await mock.liveRows('u1')).entries.map((e) => e.minutes)).toEqual([10]); // the synced entry survives in the account
  });

  test('Remove while a cycle can still succeed: the last sync pushes the pending change first, then the device is wiped', async ({ page, mock }) => {
    await createGoal(page, { name: 'Read', targetValue: 30, ...LONG });
    await signInAsMinh(page);
    await expectSyncState(page, 'synced');
    await gotoHash(page, '/today');
    await logTime(page, 'Read', 9);
    await openSignOut(page); // within the 2 s debounce: still pending
    await signOutDialog(page).getByRole('radio', { name: EN.auth.signOut.remove }).check();
    await page.getByTestId('signout-confirm').click();
    await expect(accountCard(page)).toHaveAttribute('data-state', 'signed-out', { timeout: 20_000 });
    expect((await mock.liveRows('u1')).entries.map((e) => e.minutes)).toEqual([9]);
    await gotoHash(page, '/today');
    await expect(page.getByRole('heading', { name: EN.empty.today.noGoals })).toBeVisible();
  });
});

test.describe('QC M7: two tabs of one browser (Web Locks)', () => {
  test('Sync now in both tabs while the server is slow: never two REST requests in flight at once, and both tabs end synced', async ({ browser }, testInfo) => {
    const { context, page } = await newDevice(browser, testInfo.workerIndex);
    const errors = collectErrors(page);
    await createGoal(page, { name: 'Read', targetValue: 30, ...LONG });
    await signInAsMinh(page);
    await expectSyncState(page, 'synced');
    const page2 = await context.newPage();
    await gotoHash(page2, '/settings');
    await expect(accountCard(page2)).toHaveAttribute('data-state', 'signed-in');
    await expectSyncState(page2, 'synced');
    let inflight = 0;
    let maxInflight = 0;
    let total = 0;
    await context.route('**/rest/v1/**', async (route) => {
      inflight += 1;
      total += 1;
      maxInflight = Math.max(maxInflight, inflight);
      await new Promise((r) => setTimeout(r, 600));
      try {
        await route.continue();
      } finally {
        inflight -= 1;
      }
    });
    await gotoHash(page, '/settings');
    const lockProbe = () => page2.evaluate(async () => ((await navigator.locks.query()).held ?? []).map((l) => l.name));
    await Promise.all([page.getByTestId('sync-now').click(), page2.getByTestId('sync-now').click()]);
    // While a cycle runs, exactly one tab holds the lock.
    await expect.poll(lockProbe, { timeout: 5_000 }).toContain('opb-sync');
    await expectSyncState(page, 'synced', 20_000);
    await expectSyncState(page2, 'synced', 20_000);
    expect(total).toBeGreaterThan(0);
    // Note: the cycles are sequential; a request that is waiting for its 600 ms delay counts as in flight.
    expect(maxInflight).toBe(1);
    // A pending change written in tab 2 is pushed once, not twice.
    await context.unroute('**/rest/v1/**');
    await gotoHash(page2, '/today');
    await logTime(page2, 'Read', 8);
    await cloudEntries({ liveRows: (u) => mockRows(context, testInfo.workerIndex, u) }, 1);
    expect(errors.list).toEqual([]);
    await context.close();
  });
});

async function mockRows(context: import('@playwright/test').BrowserContext, workerIndex: number, user: 'u1' | 'u2'): Promise<{ entries: unknown[] }> {
  const res = await context.request.get(`http://127.0.0.1:54321/__test/rows?user=${user}`, { headers: { 'x-opb-scope': `opb-e2e-w${workerIndex}-${process.pid}` } });
  const rows = (await res.json()) as { goals: Array<{ id: string; deleted_at: string | null }>; entries: Array<{ goal_id: string; deleted_at: string | null }> };
  const live = new Set(rows.goals.filter((g) => g.deleted_at === null).map((g) => g.id));
  return { entries: rows.entries.filter((e) => e.deleted_at === null && live.has(e.goal_id)) };
}

test.describe('QC M7: untrusted cloud data (NFR-05)', () => {
  test('invalid rows from the account are skipped (and flagged), valid ones show, hostile text is literal, nothing crashes', async ({ page, mock }) => {
    const errors = collectErrors(page);
    const dialogs: string[] = [];
    page.on('dialog', (d) => {
      dialogs.push(d.message());
      void d.dismiss();
    });
    const T = '2026-10-05T01:00:00.000Z';
    const goal = (id: string, over: Record<string, unknown>) => ({ id, name: 'G', why: '', target_type: 'daily', target_minutes: 15, start_date: '2026-01-01', end_date: '2027-12-31', archived: false, created_at: T, updated_at: T, deleted_at: null, ...over });
    const entry = (id: string, over: Record<string, unknown>) => ({ id, goal_id: 'c1-goal', date: '2026-10-08', minutes: 5, note: '', source: 'manual', created_at: T, updated_at: T, deleted_at: null, ...over });
    await mock.seed('u1', {
      goals: [
        goal('c1-goal', { name: 'Cloud goal' }),
        goal('hostile', { name: '<img src=x onerror=alert(1)>', why: '"><script>alert(2)</script>' }),
        goal('bad-name-empty', { name: '' }),
        goal('bad-name-long', { name: 'x'.repeat(61) }),
        goal('bad-target', { target_minutes: 0 }),
        goal('bad-target-big', { target_minutes: 1441 }),
        goal('bad-period', { start_date: '2026-12-01', end_date: '2026-01-01' }),
        goal('bad-date', { start_date: '2026-02-30' }),
        goal('bad-type', { target_type: 'weekly' }),
        goal('bad-stamp', { updated_at: 'not a date' }),
      ],
      entries: [
        entry('ok-1', { minutes: 15 }),
        entry('bad-zero', { minutes: 0 }),
        entry('bad-5000', { minutes: 5000 }),
        entry('bad-neg', { minutes: -3 }),
        entry('bad-frac', { minutes: 1.5 }),
        entry('bad-str', { minutes: '10' }),
        entry('bad-source', { source: 'x' }),
        entry('bad-date', { date: '2026-02-30' }),
        entry('bad-note', { note: 'n'.repeat(281) }),
        entry('bad-stamp', { created_at: '' }),
      ],
    });
    await signInAsMinh(page);
    await expectSyncState(page, 'synced', 20_000);
    await expect(page.getByTestId('remote-invalid')).toContainText(EN.errors.SYNC_REMOTE_INVALID);
    await gotoHash(page, '/goals');
    const names = (await page.getByRole('heading', { level: 3 }).allTextContents()).map((s) => s.trim()).sort();
    expect(names).toEqual(['<img src=x onerror=alert(1)>', 'Cloud goal']);
    await expect(page.locator('img[src="x"]')).toHaveCount(0);
    await gotoHash(page, '/goals/c1-goal');
    await expect(page.getByTestId('history-row')).toHaveCount(1); // only the valid 15-minute entry
    await expect(page.getByTestId('history')).toContainText('15');
    expect(dialogs).toEqual([]);
    expect(errors.list).toEqual([]);
    // The device must not have written the invalid rows back to the account.
    const rows = await mock.rows('u1');
    expect(rows.goals).toHaveLength(10);
    expect(rows.entries).toHaveLength(10);
  });

  test('a settings row with reminder_time 25:00 and locale fr is ignored: the UI keeps its defaults, no crash', async ({ page, mock }) => {
    const errors = collectErrors(page);
    await mock.seed('u1', { settings: [{ reminder_enabled: true, reminder_time: '25:00', reminder_updated_at: '2026-10-05T01:00:00.000Z', locale: 'fr', locale_updated_at: '2026-10-05T01:00:00.000Z' }] });
    await signInAsMinh(page);
    await expectSyncState(page, 'synced', 20_000);
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
    await expect(page.getByRole('switch', { name: EN.settings.reminders.switch })).not.toBeChecked();
    await expect(page.getByLabel(EN.settings.reminders.time)).toHaveValue('20:00');
    expect(errors.list).toEqual([]);
  });
});

test.describe('QC M7: import while signed in, offline (FR-51)', () => {
  test('D3 shows the signed-in wording plus the offline note; Sync now is disabled; after reconnecting the replacement reaches the account', async ({ page, context, mock }) => {
    await mock.seed('u1', C1);
    await signInAsMinh(page);
    await expectSyncState(page, 'synced');
    await context.setOffline(true);
    await gotoHash(page, '/settings');
    await expect(page.getByTestId('sync-now')).toBeDisabled();
    await expect(page.getByTestId('offline-sync')).toHaveText(EN.settings.account.offlineSync);
    await page.getByTestId('import-file').setInputFiles(backupPayload(() => undefined));
    const dialog = page.getByRole('dialog');
    await expect(dialog.getByRole('heading')).toHaveText(EN.import.titleSignedIn);
    await expect(dialog).toContainText(EN.import.offlineNote);
    await dialog.getByRole('button', { name: EN.import.confirm }).click();
    await expect(dialog).toBeHidden();
    await expect(syncIndicator(page)).toContainText(/Offline · \d+ changes? waiting/);
    await context.setOffline(false);
    await expect.poll(async () => (await mock.liveRows('u1')).goals.length, { timeout: 20_000 }).toBe(5);
    await expectSyncState(page, 'synced', 20_000);
    const live = await mock.liveRows('u1');
    expect(live.entries).toHaveLength(23);
    expect(live.goals.map((g) => g.name)).not.toContain('Cloud goal');
    expect(await pendingCount(page)).toBe(0);
  });

  test('importing the same file twice while signed in is idempotent: still 5 goals / 23 entries in the account, no duplicates', async ({ page, mock }) => {
    await signInAsMinh(page);
    await importBackup(page);
    await syncNow(page);
    await importBackup(page);
    await syncNow(page);
    const live = await mock.liveRows('u1');
    expect(live.goals).toHaveLength(5);
    expect(live.entries).toHaveLength(23);
    expect(new Set(live.goals.map((g) => g.id)).size).toBe(5);
  });
});

test.describe('QC M7: preferences from the cloud on any route (FR-55)', () => {
  test('B sits on Today in English; A switches to Vietnamese; B gets it on the next visibility sync without a reload, with title and tab bar translated', async ({ page, mock, device }) => {
    await signInAsMinh(page);
    await expectSyncState(page, 'synced');
    const b = await device();
    await signInAsMinh(b.page);
    await expectSyncState(b.page, 'synced');
    await gotoHash(b.page, '/today');
    await b.page.waitForLoadState('load');
    await b.page.evaluate(() => {
      (window as unknown as { __marker: number }).__marker = 1;
    });
    await gotoHash(page, '/settings');
    await page.getByRole('radio', { name: 'Tiếng Việt' }).click();
    await expect.poll(async () => (await mock.rows('u1')).settings[0] ?? null, { timeout: 10_000 }).toMatchObject({ locale: 'vi' });
    await b.page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
    await expect(b.page.locator('html')).toHaveAttribute('lang', 'vi', { timeout: 15_000 });
    expect(await b.page.evaluate(() => (window as unknown as { __marker?: number }).__marker)).toBe(1);
    await expect(b.page.getByRole('link', { name: VI.nav.settings })).toBeVisible();
    expect(await b.page.title()).toContain(VI.nav.today);
    expect(await kvGet(b.page, 'locale')).toBe('vi');
  });
});

test.describe('QC M7: the client never leaks tokens or talks to a third party', () => {
  test('whole signed-in session incl. sync, offline, 401 and sign out: only app + mock origins, no token in console, URLs or storage keys', async ({ page, mock }) => {
    const rec = recordRequests(page);
    const con = collectConsole(page);
    await createGoal(page, { name: 'Read', targetValue: 30, ...LONG });
    await signInAsMinh(page);
    const session = JSON.parse((await storedSession(page)) ?? '{}') as { access_token: string; refresh_token: string };
    expect(session.access_token).toMatch(/^eyJ/);
    await gotoHash(page, '/today');
    await logTime(page, 'Read', 5);
    await cloudEntries(mock, 1);
    await mock.fail('rest', 401, 1);
    await syncNow(page).catch(() => undefined);
    await gotoHash(page, '/settings');
    await page.waitForTimeout(500);
    expect(rec.external()).toEqual([]);
    for (const u of rec.urls) {
      expect(u).not.toContain(session.access_token);
      expect(u).not.toContain(session.refresh_token);
      expect(ALLOWED_ORIGINS.some((o) => u.startsWith(o)) || u.startsWith('data:') || u.startsWith('blob:')).toBe(true);
    }
    for (const line of con.all) {
      expect(line).not.toContain(session.access_token);
      expect(line).not.toContain(session.refresh_token);
      expect(line).not.toMatch(/eyJ[A-Za-z0-9_-]{10,}\./);
      expect(line).not.toContain('sb_publishable');
    }
    expect(con.errors).toEqual([]);
  });
});

test.describe('QC M7: a row the cloud would refuse must not freeze sync (poison pill)', () => {
  test('an imported backup whose goal id is 65-200 characters (accepted by the importer, refused by the cloud: id <= 64) still lets the other goals sync', async ({ page, mock }) => {
    test.fail(true, 'M7-D1: importer accepts ids up to 200 chars, cloud/mapper allow 64; the push of that row fails for ever and blocks all sync');
    const longId = 'x'.repeat(70);
    const payload = backupPayload((f) => {
      const g = f.goals[0]!;
      for (const e of f.entries) if (e.goalId === g.id) e.goalId = longId;
      g.id = longId;
    });
    await importPayload(page, payload, EN.import.confirm);
    await signInAsMinh(page);
    await expect.poll(async () => (await mock.liveRows('u1')).goals.length, { timeout: 25_000, message: 'the 4 well-formed goals should reach the account' }).toBeGreaterThanOrEqual(4);
    await expectSyncState(page, 'synced', 25_000);
  });
});
