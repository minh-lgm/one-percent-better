// QC M7 round 1 — SyncIndicator states, layout / a11y / vi at 360-768-1440 px light and dark,
// first-sync and first-pull timing with large-backup.json, and the automatic retry timer.
import { expect, test } from '../../../e2e/cloud/fixtures';
import { accountCard, CLOUD_BASE_URL, expectSyncState, pendingCount, signInAsMinh, signInViaMock, signOutDialog, statusRow, syncIndicator, syncNow } from '../../../e2e/cloud/helpers';
import { createGoal, EN, expectNoHorizontalScroll, expectNoViLeaks, freezeClock, gotoHash, importBackup, logTime, VI, fixturePath } from '../../../e2e/helpers/app';
import AxeBuilder from '@axe-core/playwright';
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

/** serious/critical axe violations as readable strings. */
async function axeSerious(page: Page): Promise<string[]> {
  const results = await new AxeBuilder({ page }).analyze();
  return results.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical').map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(' | ')}`);
}

/** Read the sample backup and return a modified copy as an in-memory upload payload. */
function backupPayload(mutate: (file: { goals: Array<Record<string, unknown>>; entries: Array<Record<string, unknown>>; settings: Record<string, unknown> }) => void) {
  const file = JSON.parse(readFileSync(fixturePath('sample-backup.json'), 'utf8')) as { goals: Array<Record<string, unknown>>; entries: Array<Record<string, unknown>>; settings: Record<string, unknown> };
  mutate(file);
  return { name: 'backup.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(file)) };
}


const LONG = { startDate: '2026-01-01', endDate: '2027-12-31' };

test.beforeEach(async ({ mock }) => {
  await mock.reset();
});

test.describe('QC M7: SyncIndicator states (DESIGN §5) and the polite live region (§8.1)', () => {
  test('synced -> pending (2 s debounce) -> syncing -> synced; offline; error; expired; signing-in: exact text, role, data-state, announcements only on bad/back transitions', async ({ page, context, mock }) => {
    await createGoal(page, { name: 'Read', targetValue: 30, ...LONG });
    // signing-in: hold the token exchange so the chip is observable on the way back from the provider.
    await page.goto('#/settings');
    await page.route('**/auth/v1/token**', async (r) => {
      await new Promise((res) => setTimeout(res, 1500));
      await r.continue();
    });
    await signInViaMock(page, 'Minh Test').catch(() => undefined);
    await page.unroute('**/auth/v1/token**');
    await expectSyncState(page, 'synced', 20_000);
    const live = page.getByTestId('sync-announce');
    await expect(live).toHaveAttribute('role', 'status');
    await expect(live).toHaveAttribute('aria-live', 'polite');
    await expect(live).toHaveAttribute('aria-atomic', 'true');
    await expect(live).toHaveText('');
    await expect(statusRow(page)).toHaveAttribute('role', 'group');
    await expect(statusRow(page)).toHaveAttribute('aria-label', EN.sync.indicator.label);

    // pending: online, change written, debounce not yet elapsed.
    await gotoHash(page, '/today');
    await page.route('**/rest/v1/entries**', async (r) => {
      await new Promise((res) => setTimeout(res, 1500));
      await r.continue();
    });
    await logTime(page, 'Read', 5);
    await expect(syncIndicator(page)).toHaveAttribute('data-state', 'pending');
    await expect(syncIndicator(page)).toHaveText('1 change waiting to sync');
    await expect(live).toHaveText(''); // never announced
    await expectSyncState(page, 'syncing', 6_000);
    await expect(syncIndicator(page)).toHaveText('Syncing…');
    await expect(live).toHaveText('');
    await expectSyncState(page, 'synced', 15_000);
    await expect(syncIndicator(page)).toHaveText(/^Synced \d\d:\d\d$/);
    await expect(live).toHaveText(''); // plain synced after syncing: silent
    await page.unroute('**/rest/v1/entries**');

    // offline with one change waiting
    await context.setOffline(true);
    await expectSyncState(page, 'offline');
    await expect(syncIndicator(page)).toHaveText('Offline · all changes synced');
    await logTime(page, 'Read', 4);
    await expect(syncIndicator(page)).toHaveText('Offline · 1 change waiting');
    await expect(live).toHaveText(EN.sync.announce.offline, { timeout: 4_000 });
    await context.setOffline(false);
    await expectSyncState(page, 'synced', 20_000);
    await expect(live).toHaveText(EN.sync.announce.synced, { timeout: 4_000 });

    // error
    await mock.fail('rest', 500, 1000);
    await logTime(page, 'Read', 2);
    await expectSyncState(page, 'error', 20_000);
    const chip = syncIndicator(page);
    await expect(chip).toContainText(EN.sync.indicator.error);
    await expect(chip.getByRole('button', { name: EN.sync.indicator.retryAria })).toBeVisible();
    const box = await chip.getByRole('button').boundingBox();
    expect(box).not.toBeNull(); // the 44 px tap area comes from a pseudo-element; the visible chip stays 32 px
    const chipBox = await chip.boundingBox();
    expect(chipBox!.height).toBeLessThanOrEqual(40);
    await expect(live).toHaveText(EN.sync.announce.error, { timeout: 4_000 });
    // keyboard: Tab reaches Retry and Enter retries without stealing focus elsewhere
    await chip.getByRole('button').focus();
    await mock.clearFailures();
    await page.keyboard.press('Enter');
    await expectSyncState(page, 'synced', 20_000);

    // expired
    await mock.fail('rest', 401, 1000);
    await logTime(page, 'Read', 1);
    await expectSyncState(page, 'expired', 20_000);
    await expect(chip).toHaveText(EN.sync.indicator.expired);
    await expect(chip).toHaveAttribute('href', /#\/settings$/);
    await expect(live).toHaveText(EN.sync.announce.expired, { timeout: 4_000 });
    expect(await page.evaluate(() => document.activeElement?.closest('[data-testid="status-row"]') === null)).toBe(true); // chip never took focus
  });

  test('offline with nothing waiting -> back online: "All changes are synced." is announced (DESIGN 8.1)', async ({ page, context }) => {
    test.fail(true, 'M7-D3: the announcement is armed on the first `synced` render and cancelled by the transient `syncing` that the online trigger starts 2 ms later');
    await createGoal(page, { name: 'Read', targetValue: 30, ...LONG });
    await signInAsMinh(page);
    await expectSyncState(page, 'synced');
    const live = page.getByTestId('sync-announce');
    await context.setOffline(true);
    await expectSyncState(page, 'offline');
    await expect(live).toHaveText(EN.sync.announce.offline, { timeout: 4_000 });
    await context.setOffline(false);
    await expectSyncState(page, 'synced', 20_000);
    await expect(live).toHaveText(EN.sync.announce.synced, { timeout: 4_000 });
  });

  test('signing-in: back from the provider while the code exchange is slow, the chip says "Signing in…" on the way (any route), then becomes synced', async ({ page }) => {
    await createGoal(page, { name: 'Read', targetValue: 30, ...LONG });
    await page.addInitScript(() => {
      if (location.search.includes('auth=callback')) sessionStorage.setItem('opb-auth-return', '#/today');
    });
    await page.route('**/auth/v1/token**', async (r) => {
      await new Promise((res) => setTimeout(res, 2500));
      await r.continue();
    });
    await gotoHash(page, '/settings');
    await page.getByRole('button', { name: EN.auth.signInGoogle }).click();
    await page.waitForURL((u) => u.pathname === '/auth/v1/authorize');
    await page.getByRole('button', { name: 'Minh Test', exact: true }).click();
    await page.waitForURL((u) => u.origin === 'http://localhost:4174');
    await expectSyncState(page, 'signing-in', 5_000);
    await expect(syncIndicator(page)).toHaveText('Signing in…');
    await expectSyncState(page, 'synced', 20_000);
  });

  test('the StatusRow keeps its height (no layout jump) while the state changes', async ({ page, context, mock }) => {
    await createGoal(page, { name: 'Read', targetValue: 30, ...LONG });
    await signInAsMinh(page);
    await gotoHash(page, '/today');
    await expectSyncState(page, 'synced');
    const heights = new Set<number>();
    const measure = async () => {
      const box = await statusRow(page).boundingBox();
      heights.add(Math.round(box!.height));
    };
    await measure();
    await context.setOffline(true);
    await expectSyncState(page, 'offline');
    await measure();
    await context.setOffline(false);
    await expectSyncState(page, 'synced', 20_000);
    await mock.fail('rest', 500, 1000);
    await logTime(page, 'Read', 3);
    await expectSyncState(page, 'error', 20_000);
    await measure();
    await mock.clearFailures();
    await mock.fail('rest', 401, 1000);
    await page.getByTestId('sync-indicator').getByRole('button').click();
    await expectSyncState(page, 'expired', 20_000);
    await measure();
    expect([...heights], `StatusRow heights seen: ${[...heights].join(', ')}`).toHaveLength(1);
    expect([...heights][0]).toBeLessThanOrEqual(40);
  });

  test('Export while signed in leaves nothing pending and sends no write to the account', async ({ page, mock }) => {
    await createGoal(page, { name: 'Read', targetValue: 30, ...LONG });
    await signInAsMinh(page);
    await syncNow(page);
    const before = (await mock.log()).log.filter((l) => l.method === 'POST').length;
    const download = page.waitForEvent('download');
    await page.getByRole('button', { name: EN.settings.backup.export }).click();
    await download;
    await page.waitForTimeout(3000); // longer than the 2 s change debounce
    expect(await pendingCount(page)).toBe(0);
    expect((await mock.log()).log.filter((l) => l.method === 'POST').length).toBe(before);
    expect((await mock.rows('u1')).settings).toEqual([]); // lastBackupAt is device-only: no settings row was created either
  });

  test('chip is visible on every main screen when signed in, and absent when signed out', async ({ page }) => {
    await createGoal(page, { name: 'Read', targetValue: 30, ...LONG });
    for (const route of ['/today', '/goals', '/review', '/settings']) {
      await gotoHash(page, route);
      await expect(page.getByTestId('sync-indicator')).toHaveCount(0);
    }
    await signInAsMinh(page);
    for (const route of ['/today', '/goals', '/review', '/settings', '/goals/new']) {
      await gotoHash(page, route);
      await expect(syncIndicator(page)).toBeVisible();
    }
  });
});

const CONFIGS = [
  { w: 360, h: 740, locale: 'en-US', scheme: 'light' as const },
  { w: 360, h: 740, locale: 'vi-VN', scheme: 'dark' as const },
  { w: 768, h: 1024, locale: 'en-US', scheme: 'dark' as const },
  { w: 768, h: 1024, locale: 'vi-VN', scheme: 'light' as const },
  { w: 1440, h: 900, locale: 'en-US', scheme: 'light' as const },
  { w: 1440, h: 900, locale: 'vi-VN', scheme: 'dark' as const },
];

for (const c of CONFIGS) {
  test.describe(`QC M7 layout ${c.w}px ${c.locale} ${c.scheme}`, () => {
    test('signed-in Today / Settings / D4 (with warning) / D3 signed-in / error / expired / D5: no horizontal scroll, axe clean, no untranslated text', async ({ browser }, testInfo) => {
      const vi = c.locale === 'vi-VN';
      const copy = vi ? VI : EN;
      const { context, page } = await newDevice(browser, testInfo.workerIndex, { locale: c.locale, width: c.w, height: c.h, colorScheme: c.scheme });
      const check = async (label: string) => {
        await expectNoHorizontalScroll(page);
        expect(await axeSerious(page), `${label}: axe`).toEqual([]);
        if (vi) await expectNoViLeaks(page);
      };
      await page.goto('#/goals/new');
      await page.getByLabel(new RegExp(`^${copy.goal.form.nameLabel}`)).fill(vi ? 'Đọc sách' : 'Read');
      await page.getByRole('textbox', { name: new RegExp(`^${copy.goal.form.targetDaily}`) }).fill('30');
      await page.getByLabel(new RegExp(`^${copy.goal.form.startLabel}`)).fill('2026-01-01');
      await page.getByRole('radio', { name: copy.goal.form.endsSpecific }).check();
      await page.getByLabel(new RegExp(`^${copy.goal.form.endLabel}`)).fill('2027-12-31');
      await page.getByRole('button', { name: copy.goal.form.save }).click();
      await expect(page.getByRole('heading', { level: 1, name: copy.goals.title })).toBeVisible();

      await gotoHash(page, '/settings');
      await signInViaMock(page, 'Minh Test', copy);
      await expect(accountCard(page)).toHaveAttribute('data-state', 'signed-in');
      await expectSyncState(page, 'synced', 20_000);
      await check('Settings synced (A5)');
      await gotoHash(page, '/today');
      await check('Today synced');

      // offline with changes waiting: chip text at its longest, D4 warning
      await context.setOffline(true);
      await logTime(page, vi ? 'Đọc sách' : 'Read', 12, '', copy);
      await logTime(page, vi ? 'Đọc sách' : 'Read', 11, '', copy);
      await expectSyncState(page, 'offline');
      await check('Today offline + pending');
      await gotoHash(page, '/settings');
      await check('Settings offline (A7)');
      await accountCard(page).getByRole('button', { name: copy.settings.account.signOut }).click();
      await expect(signOutDialog(page).getByTestId('unsynced-warning')).toBeVisible();
      await check('D4 warning offline');
      const dlgBox = await signOutDialog(page).boundingBox();
      expect(dlgBox!.x).toBeGreaterThanOrEqual(0);
      expect(dlgBox!.x + dlgBox!.width).toBeLessThanOrEqual(c.w + 1);
      const confirm = await page.getByTestId('signout-confirm').boundingBox();
      expect(confirm!.y + confirm!.height).toBeLessThanOrEqual(c.h + 1); // button row inside the viewport
      await signOutDialog(page).getByRole('radio', { name: copy.auth.signOut.remove }).check();
      await check('D4 remove selected');
      await page.keyboard.press('Escape');
      await expect(signOutDialog(page)).not.toHaveAttribute('open');
      await context.setOffline(false);
      await expectSyncState(page, 'synced', 20_000);

      // D3 signed-in variant
      await page.getByTestId('import-file').setInputFiles(backupPayload(() => undefined));
      await expect(page.getByRole('dialog')).toBeVisible();
      await expect(page.getByRole('dialog').getByRole('heading')).toHaveText(copy.import.titleSignedIn);
      await check('D3 signed-in');
      await page.keyboard.press('Escape');
      await expect(page.getByRole('dialog')).toBeHidden();
    });
  });
}

test.describe('QC M7: error / expired / D5 visuals in both themes and languages at 360 px', () => {
  for (const loc of ['en-US', 'vi-VN'] as const) {
    for (const scheme of ['light', 'dark'] as const) {
      test(`${loc} ${scheme}: A8 error card + chip, A10 expired card, D5`, async ({ browser }, testInfo) => {
        const vi = loc === 'vi-VN';
        const copy = vi ? VI : EN;
        const { context, page } = await newDevice(browser, testInfo.workerIndex, { locale: loc, width: 360, height: 740, colorScheme: scheme });
        const mockUrl = 'http://127.0.0.1:54321';
        const scope = `opb-e2e-w${testInfo.workerIndex}-${process.pid}`;
        const call = (path: string) => context.request.get(`${mockUrl}${path}`, { headers: { 'x-opb-scope': scope } });
        await page.goto('#/goals/new');
        await page.getByLabel(new RegExp(`^${copy.goal.form.nameLabel}`)).fill(vi ? 'Đọc sách' : 'Read');
        await page.getByRole('textbox', { name: new RegExp(`^${copy.goal.form.targetDaily}`) }).fill('30');
        await page.getByRole('button', { name: copy.goal.form.save }).click();
        await expect(page.getByRole('heading', { level: 1, name: copy.goals.title })).toBeVisible();
        await page.goto('#/settings');
        await signInViaMock(page, 'Minh Test', copy);
        await expectSyncState(page, 'synced', 20_000);
        const check = async (label: string) => {
          await expectNoHorizontalScroll(page);
          expect(await axeSerious(page), `${label}: axe`).toEqual([]);
          if (vi) await expectNoViLeaks(page);
        };
        // A8: error
        await call('/__test/fail?path=rest&status=500&times=1000');
        await page.getByTestId('sync-now').click();
        await expectSyncState(page, 'error', 20_000);
        await expect(page.getByTestId('sync-error')).toBeVisible();
        await check('A8 error');
        await page.screenshot({ path: testInfo.outputPath(`A8-${loc}-${scheme}.png`), fullPage: true });
        await call('/__test/fail?clear=1');
        // A10: expired
        await call('/__test/fail?path=rest&status=401&times=1000');
        await page.getByTestId('sync-now').click().catch(() => undefined);
        await expectSyncState(page, 'expired', 20_000);
        await expect(accountCard(page)).toHaveAttribute('data-state', 'expired');
        await check('A10 expired');
        await page.screenshot({ path: testInfo.outputPath(`A10-${loc}-${scheme}.png`), fullPage: true });
        await call('/__test/fail?clear=1');
        // D5: Sign out (Keep) from the expired card, then sign in as another account that has none of this data.
        await accountCard(page).getByRole('button', { name: copy.settings.account.signOut }).click();
        await page.getByTestId('signout-confirm').click();
        await expect(accountCard(page)).toHaveAttribute('data-state', 'signed-out');
        await signInViaMock(page, 'Other User', copy);
        const d5 = page.getByTestId('merge-dialog');
        await expect(d5).toHaveAttribute('open', { timeout: 15_000 });
        await expect(d5).toContainText('other.user@example.com');
        await check('D5');
        const box = await d5.boundingBox();
        expect(box!.x).toBeGreaterThanOrEqual(0);
        expect(box!.x + box!.width).toBeLessThanOrEqual(361);
        await page.screenshot({ path: testInfo.outputPath(`D5-${loc}-${scheme}.png`) });
        await d5.getByRole('button', { name: copy.common.cancel }).click();
        await expect(accountCard(page)).toHaveAttribute('data-state', 'signed-out');
        await context.close();
      });
    }
  }
});

test.describe('QC M7: performance with the large backup (NFR-13)', () => {
  test('device A uploads 5 goals / 5 449 entries and device B downloads them, both < 15 s; logging stays instant; batches <= 500', async ({ page, mock, device }) => {
    test.setTimeout(180_000);
    await freezeClock(page);
    await importBackup(page, 'large-backup.json');
    await gotoHash(page, '/settings');
    const t0 = Date.now();
    await signInAsMinh(page);
    await expect.poll(async () => (await mock.liveRows('u1')).entries.length, { timeout: 15_000, intervals: [100] }).toBe(5449);
    await expectSyncState(page, 'synced', 15_000);
    const upload = Date.now() - t0;
    const log = (await mock.log()).log.filter((l) => l.method === 'POST' && l.path.startsWith('/rest/v1/'));
    const biggest = Math.max(...log.map((l) => l.rows));
    console.log(`QC M7 perf: upload ${upload} ms incl. OAuth round trip, ${log.length} upserts, biggest batch ${biggest}`);
    expect(upload).toBeLessThan(15_000);
    expect(biggest).toBeLessThanOrEqual(500);

    const b = await device();
    await freezeClock(b.page);
    const t1 = Date.now();
    await signInAsMinh(b.page);
    await b.page.goto('#/goals');
    await expect.poll(async () => b.page.getByRole('heading', { level: 3 }).count(), { timeout: 15_000 }).toBe(5);
    await expectSyncState(b.page, 'synced', 15_000);
    await gotoHash(b.page, '/settings');
    await expect.poll(() => pendingCount(b.page)).toBe(0);
    const download = Date.now() - t1;
    console.log(`QC M7 perf: device B first pull ${download} ms incl. OAuth round trip`);
    expect(download).toBeLessThan(15_000);
    // B holds all entries: Goal detail history of the biggest goal lists many rows.
    const stored = await b.page.evaluate(
      () =>
        new Promise<number>((resolve, reject) => {
          const req = indexedDB.open('one-percent-better');
          req.onerror = () => reject(req.error);
          req.onsuccess = () => {
            const c = req.result.transaction('entries').objectStore('entries').count();
            c.onsuccess = () => resolve(c.result);
          };
        }),
    );
    expect(stored).toBe(5449);
  });
});

test.describe('QC M7: automatic retry (FR-46)', () => {
  test('one failed cycle schedules a retry; without any user action the change reaches the account within ~35 s', async ({ page, mock }) => {
    test.setTimeout(120_000);
    await createGoal(page, { name: 'Read', targetValue: 30, ...LONG });
    await signInAsMinh(page);
    await expectSyncState(page, 'synced');
    await mock.fail('rest', 503, 1);
    await gotoHash(page, '/today');
    const t0 = Date.now();
    await logTime(page, 'Read', 6);
    await expectSyncState(page, 'error', 20_000);
    await expect.poll(async () => (await mock.liveRows('u1')).entries.some((e) => e.minutes === 6), { timeout: 45_000, intervals: [500] }).toBe(true);
    const waited = Date.now() - t0;
    console.log(`QC M7 retry: pushed ${waited} ms after the write (first failure ~2 s after the write, backoff 30 s)`);
    expect(waited).toBeGreaterThan(25_000);
    expect(waited).toBeLessThan(40_000);
    await expectSyncState(page, 'synced', 10_000);
  });
});
