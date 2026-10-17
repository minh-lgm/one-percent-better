/**
 * Final QC phase 2: the whole product journey on the CLOUD-ON build (mock Supabase), run four times
 * (en-US / vi-VN x 360 / 1440 px for device A; device B uses the other width).
 *
 * Phase 1 while signed out: first launch -> 2 goals (daily + total) -> manual entries -> timer across a reload
 * -> reminder (banner + one notification) -> back-fill yesterday -> Review -> curve -> archive -> export ->
 * delete all -> import -> offline.
 * Phase 2: 8 days later the Today banner asks to sign in -> sign in from the banner -> merge -> device B joins
 * -> language and reminder time follow the account -> a deletion propagates -> Sign out Keep (A) / Remove (B).
 * Every screen: axe 0 serious/critical, no horizontal scroll, vi scan; 0 page errors; only the app + mock origins;
 * the mock is not contacted before the user presses "Sign in".
 */
import { expect, test } from '../../../e2e/cloud/fixtures';
import type { Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import {
  advanceTo,
  at,
  createGoal,
  EN,
  expectAmount,
  expectAxeClean,
  expectNoHorizontalScroll,
  expectNoViLeaks,
  freezeClock,
  goalCard,
  gotoHash,
  logTime,
  recordedNotifications,
  startTimer,
  stopDialog,
  timerCard,
  timerElapsed,
  toast,
  trackNotifications,
  VI,
} from '../../../e2e/helpers/app';
import { accountCard, collectErrors, expectSyncState, recordRequests, signInViaMock, signOutDialog, syncNow } from '../../../e2e/cloud/helpers';

// Full Chromium build: the default headless shell reports notification permission as blocked.
test.use({ channel: 'chromium', permissions: ['notifications'] });

type Copy = typeof EN | typeof VI;

const CONFIGS = [
  { name: 'en-US 360px', locale: 'en-US', lang: 'en', copy: EN as Copy, other: VI as Copy, viewport: { width: 360, height: 740 }, bViewport: { width: 1440, height: 900 } },
  { name: 'en-US 1440px', locale: 'en-US', lang: 'en', copy: EN as Copy, other: VI as Copy, viewport: { width: 1440, height: 900 }, bViewport: { width: 360, height: 740 } },
  { name: 'vi-VN 360px', locale: 'vi-VN', lang: 'vi', copy: VI as Copy, other: EN as Copy, viewport: { width: 360, height: 740 }, bViewport: { width: 1440, height: 900 } },
  { name: 'vi-VN 1440px', locale: 'vi-VN', lang: 'vi', copy: VI as Copy, other: EN as Copy, viewport: { width: 1440, height: 900 }, bViewport: { width: 360, height: 740 } },
] as const;

const READ = { name: 'Read', why: 'Be smarter', targetValue: 30, startDate: '2026-10-01', endDate: '2026-10-31' };
const SPANISH = { name: 'Spanish', why: 'Talk to family', targetType: 'total' as const, targetValue: 100, startDate: '2026-01-01', endDate: '2026-12-31' };

test.beforeEach(async ({ mock }) => {
  await mock.reset();
});

async function goalIdOf(page: Page, name: string): Promise<string> {
  await gotoHash(page, '/goals');
  const href = await page.getByRole('link', { name, exact: true }).getAttribute('href');
  return href!.replace(/^#?\/goals\//, '');
}

async function dbCounts(page: Page, raw = false): Promise<{ goals: number; entries: number }> {
  return page.evaluate(
    (includeTombstones) =>
      new Promise((resolve, reject) => {
        const req = indexedDB.open('one-percent-better');
        req.onerror = () => reject(req.error);
        req.onsuccess = () => {
          const db = req.result;
          const tx = db.transaction(['goals', 'entries'], 'readonly');
          const g = tx.objectStore('goals').getAll();
          const e = tx.objectStore('entries').getAll();
          const live = (rows: Array<{ deletedAt?: string | null }>) => rows.filter((r) => includeTombstones || r.deletedAt === null || r.deletedAt === undefined).length;
          tx.oncomplete = () => {
            db.close();
            resolve({ goals: live(g.result), entries: live(e.result) });
          };
          tx.onerror = () => reject(tx.error);
        };
      }),
    raw,
  );
}

async function waitForPrecache(page: Page): Promise<void> {
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.waitForFunction(() => Boolean(navigator.serviceWorker.controller), undefined, { timeout: 30_000 }).catch(async () => {
    await page.reload();
    await page.waitForFunction(() => Boolean(navigator.serviceWorker.controller));
  });
  await page.waitForFunction(async () => {
    const keys = await caches.keys();
    for (const key of keys) {
      const cache = await caches.open(key);
      const urls = (await cache.keys()).map((r) => r.url);
      if (urls.some((u) => /GoalDetail-/.test(u)) && urls.some((u) => /useRechartsWidth-/.test(u)) && urls.some((u) => /CurveChart-/.test(u)) && urls.some((u) => /BarChart-/.test(u))) return true;
    }
    return false;
  });
}

for (const cfg of CONFIGS) {
  test.describe(`Final2 journey (cloud on) - ${cfg.name}`, () => {
    test.use({ locale: cfg.locale, viewport: cfg.viewport });

    test('phase 1 signed out -> banner -> sign in -> two devices -> language/reminder -> delete -> Keep / Remove', async ({ page, mock, device }, testInfo) => {
      test.setTimeout(420_000);
      const { lang } = cfg;
      const otherLang = lang === 'en' ? 'vi' : 'en';
      let copy: Copy = cfg.copy; // A's current UI language (changes in the sync step)
      const errA = collectErrors(page);
      const recA = recordRequests(page);
      let offline = false;
      const consoleErrors: string[] = [];
      page.on('console', (m) => {
        // The mock's own account-chooser page has no favicon (404 from the mock origin): not an app error.
        if (m.type() === 'error' && !offline && !m.location().url.endsWith('/favicon.ico')) consoleErrors.push(`${m.text()} @ ${m.location().url}`);
      });
      const badResponses: string[] = [];
      page.on('response', (r) => {
        if (r.status() >= 400 && !r.url().endsWith('/favicon.ico')) badResponses.push(`${r.status()} ${r.request().method()} ${r.url()}`);
      });

      const check = async (p: Page, vi: boolean) => {
        await expect(p.locator('main h1')).toBeVisible();
        await expect(p.locator('[data-testid="plus-one"][data-animate]')).toHaveCount(0, { timeout: 6_000 });
        await expectNoHorizontalScroll(p);
        if (vi) await expectNoViLeaks(p);
        await expectAxeClean(p);
      };
      const checkA = () => check(page, copy === VI);

      // ================= PHASE 1 (signed out, cloud build) =================
      await trackNotifications(page);
      await freezeClock(page);
      await gotoHash(page, '/today');
      await expect(page.locator('html')).toHaveAttribute('lang', lang);
      await expect(page.getByText(copy.empty.today.noGoals)).toBeVisible();
      await checkA();
      expect(await dbCounts(page)).toEqual({ goals: 0, entries: 0 });
      await gotoHash(page, '/settings');
      await expect(accountCard(page)).toHaveAttribute('data-state', 'signed-out');
      await expect(page.getByTestId('login-prompt-banner')).toHaveCount(0);
      await checkA();

      await createGoal(page, READ, copy);
      await createGoal(page, SPANISH, copy);
      await expect(page.getByRole('link', { name: 'Read', exact: true })).toBeVisible();
      await checkA();
      const readId = await goalIdOf(page, 'Read');
      const spanishId = await goalIdOf(page, 'Spanish');
      await gotoHash(page, '/today');
      await expectAmount(page, 'Read', '0/30');
      await expectAmount(page, 'Spanish', '0/17');
      await expect(page.getByTestId('login-prompt-banner')).toHaveCount(0); // nothing worth protecting yet
      await checkA();
      await page.evaluate(() => navigator.serviceWorker.ready);
      await page.reload();
      await page.waitForFunction(() => Boolean(navigator.serviceWorker.controller));

      await logTime(page, 'Read', 20, 'Ch. 3', copy);
      await expectAmount(page, 'Read', '20/30');
      await logTime(page, 'Spanish', 10, '', copy);
      await expectAmount(page, 'Spanish', '10/17');
      await checkA();

      await startTimer(page, 'Read', copy);
      await freezeClock(page, at('00:10:00'));
      await expect(timerElapsed(page)).toHaveText('00:10:00');
      await page.reload();
      await expect(timerCard(page)).toBeVisible();
      await expect(timerElapsed(page)).toHaveText('00:10:00');
      await checkA();
      await timerCard(page).getByRole('button', { name: new RegExp(`^${copy.timer.stopAria.split('{{')[0]}Read`) }).click();
      await expect(stopDialog(page)).toBeVisible();
      await expect(stopDialog(page).getByLabel(new RegExp(`^${copy.entry.form.minutesLabel}`))).toHaveValue('10');
      await stopDialog(page).getByRole('button', { name: copy.entry.form.save }).click();
      await expectAmount(page, 'Read', '30/30');
      await expect(timerCard(page)).toHaveCount(0);

      await gotoHash(page, '/settings');
      const sw = page.getByRole('switch', { name: copy.settings.reminders.switch });
      await sw.click();
      await expect(sw).toBeChecked();
      await checkA();
      await gotoHash(page, '/today');
      await advanceTo(page, at('2026-10-09T20:01:00'));
      await expect.poll(() => recordedNotifications(page).then((n) => n.length), { timeout: 20_000 }).toBe(1);
      const [note] = await recordedNotifications(page);
      expect(note.lang).toBe(lang);
      expect(note.body).toContain('Spanish');
      await expect(page.getByTestId('reminder-banner')).toBeVisible();
      await checkA();

      await gotoHash(page, '/day/2026-10-08');
      await goalCard(page, 'Read').getByRole('button', { name: copy.goalCard.addEntry }).click();
      await goalCard(page, 'Read').getByLabel(new RegExp(`^${copy.entry.form.minutesLabel}`)).fill('30');
      await goalCard(page, 'Read').getByRole('button', { name: copy.entry.form.save }).click();
      await expectAmount(page, 'Read', '30/30');
      await checkA();

      await gotoHash(page, '/review');
      await expect(page.getByTestId('chart-weekly').locator('svg.recharts-surface')).toBeVisible();
      await expect(page.locator('[data-date="2026-10-08"]')).toHaveClass(/\bl[1-4]\b/);
      await expect(page.getByTestId('stat-current')).toContainText(/2/);
      await checkA();
      await page.screenshot({ path: testInfo.outputPath(`review-${cfg.name}.png`), fullPage: true });
      await gotoHash(page, `/goals/${readId}`);
      await expect(page.getByTestId('headline')).toHaveText(/\+0[.,]0%/); // M5-AC7 superseded by M9-AC7 (FR-27 v3.0): 30 min then 30 min = first day, no change -> +0.0%
      await expect(page.getByTestId('curve-chart').locator('.recharts-line')).toHaveCount(2);
      await expect(page.getByTestId('history-row')).toHaveCount(3);
      await checkA();

      await gotoHash(page, '/goals');
      await page.getByTestId('goal-row').filter({ hasText: 'Spanish' }).getByRole('button', { name: copy.goals.archive }).click();
      await expect(toast(page)).toHaveText(copy.toast.goalArchived);
      await checkA();

      await gotoHash(page, '/settings');
      const dl = page.waitForEvent('download');
      await page.getByRole('button', { name: copy.settings.backup.export }).click();
      const download = await dl;
      expect(download.suggestedFilename()).toBe('1percent-better-backup-2026-10-09.json');
      const exportedPath = (await download.path())!;
      const file = JSON.parse(await readFile(exportedPath, 'utf8')) as { schemaVersion: number; goals: unknown[]; entries: unknown[] };
      expect(file.schemaVersion).toBe(1);
      expect(file.goals).toHaveLength(2);
      expect(file.entries).toHaveLength(4);
      await expect(toast(page)).toHaveText(copy.toast.backupExported);
      // Export hint (M8-AC3): signed out + online + cloud build.
      await expect(page.getByTestId('export-sign-in-hint')).toBeVisible();
      await checkA();

      await gotoHash(page, '/goals');
      for (const name of ['Read', 'Spanish']) {
        await page.getByTestId('goal-row').filter({ hasText: name }).getByRole('button', { name: copy.common.delete }).click();
        const d = page.getByRole('dialog');
        await expect(d).toBeVisible();
        await d.getByRole('button', { name: copy.goal.delete.confirm }).click();
        await expect(d).toBeHidden();
      }
      expect(await dbCounts(page)).toEqual({ goals: 0, entries: 0 });
      await gotoHash(page, '/settings');
      await page.getByTestId('import-file').setInputFiles(exportedPath);
      const dialog = page.getByRole('dialog');
      await expect(dialog).toBeVisible();
      await dialog.getByRole('button', { name: copy.import.confirm }).click();
      await expect(dialog).toBeHidden();
      await expect(toast(page)).toContainText(copy.toast.backupImported.split(':')[0]);
      expect(await dbCounts(page)).toEqual({ goals: 2, entries: 4 });
      expect(await goalIdOf(page, 'Read')).toBe(readId);
      expect(await goalIdOf(page, 'Spanish')).toBe(spanishId);
      await gotoHash(page, `/goals/${readId}`);
      await expect(page.getByTestId('history-row')).toHaveCount(3);
      await checkA();

      // Offline (signed out, cloud build): routes reload from the precache, logging works, sign-in is disabled.
      await gotoHash(page, '/today');
      await waitForPrecache(page);
      await page.context().setOffline(true);
      offline = true;
      for (const route of ['/today', '/goals', '/review', `/goals/${readId}`, '/settings']) {
        await page.goto(`#${route}`);
        await page.reload();
        await expect(page.locator('html')).toHaveAttribute('lang', lang);
        await expect(page.locator('main h1')).toBeVisible();
        await expectNoHorizontalScroll(page);
      }
      await expect(page.getByRole('button', { name: copy.auth.signInGoogle })).toBeDisabled();
      await gotoHash(page, '/today');
      await page.reload();
      await logTime(page, 'Read', 5, '', copy);
      await expectAmount(page, 'Read', '35/30');
      await page.context().setOffline(false);
      offline = false;
      // The user never pressed "Sign in": the mock origin has not been contacted at all.
      expect(recA.mock(), 'mock contacted while signed out').toEqual([]);
      expect(recA.sdk(), 'SDK chunk requested while signed out').toEqual([]);

      // ================= PHASE 2 =================
      // 8 days after the first data: the Today banner asks (never before, never blocking).
      await advanceTo(page, at('2026-10-17T10:00:00'));
      await page.reload();
      const banner = page.getByTestId('login-prompt-banner');
      await expect(banner).toBeVisible();
      await expect(banner.getByText(copy.loginPrompt.title)).toBeVisible();
      await expect(goalCard(page, 'Read')).toBeVisible();
      await checkA();
      await page.screenshot({ path: testInfo.outputPath(`banner-${cfg.name}.png`), fullPage: true });

      // Sign in from the banner -> back on Today, banner gone, data merged into the account.
      await signInViaMock(page, 'Minh Test', copy);
      expect(page.url()).toMatch(/#\/today$/);
      await expect(toast(page)).toBeVisible({ timeout: 15_000 });
      await expectSyncState(page, 'synced');
      await expect(banner).toHaveCount(0);
      expect(recA.sdk().length).toBeGreaterThan(0);
      const afterMerge = await mock.liveRows('u1');
      expect(afterMerge.goals.map((g) => g.name).sort()).toEqual(['Read', 'Spanish']);
      expect(afterMerge.entries).toHaveLength(5);
      await checkA();

      // Device B (other width), same account.
      const b = await device({ locale: cfg.locale, viewport: cfg.bViewport });
      const errB = collectErrors(b.page);
      const recB = recordRequests(b.page);
      await freezeClock(b.page, at('2026-10-17T10:00:00'));
      await gotoHash(b.page, '/settings');
      await expect(accountCard(b.page)).toHaveAttribute('data-state', 'signed-out');
      await check(b.page, lang === 'vi');
      await signInViaMock(b.page, 'Minh Test', cfg.copy);
      await expect(accountCard(b.page)).toHaveAttribute('data-state', 'signed-in');
      await expectSyncState(b.page, 'synced');
      await gotoHash(b.page, '/goals');
      await expect(b.page.getByRole('link', { name: 'Read', exact: true })).toBeVisible();
      await expect(b.page.getByRole('link', { name: 'Spanish', exact: true })).toBeVisible();
      await check(b.page, lang === 'vi');
      await gotoHash(b.page, `/goals/${readId}`);
      await expect(b.page.getByTestId('history-row')).toHaveCount(4);
      await check(b.page, lang === 'vi');
      // Reminder settings came with the account.
      await gotoHash(b.page, '/settings');
      await expect(b.page.getByRole('switch', { name: cfg.copy.settings.reminders.switch })).toBeChecked();

      // A changes language + reminder time -> B follows after Sync now.
      await freezeClock(page, at('2026-10-17T10:05:00'));
      await gotoHash(page, '/settings');
      await page.getByRole('radio', { name: cfg.other.settings.language.option[otherLang] }).check();
      copy = cfg.other;
      await expect(page.locator('html')).toHaveAttribute('lang', otherLang);
      await page.getByLabel(copy.settings.reminders.time).fill('07:30');
      await page.getByLabel(copy.settings.reminders.time).blur();
      await expect.poll(async () => (await mock.rows('u1')).settings[0] ?? null, { timeout: 20_000 }).toMatchObject({ reminder_enabled: true, reminder_time: '07:30' });
      await expect.poll(async () => JSON.stringify((await mock.rows('u1')).settings[0] ?? {}), { timeout: 20_000 }).toContain(`"${otherLang}"`);
      await checkA();
      await freezeClock(b.page, at('2026-10-17T10:06:00'));
      await syncNow(b.page);
      await expect(b.page.locator('html')).toHaveAttribute('lang', otherLang);
      await expect(b.page.getByLabel(cfg.other.settings.reminders.time)).toHaveValue('07:30');
      await check(b.page, otherLang === 'vi');

      // A deletes Spanish (archived) -> account tombstone -> B loses it (goal + its entry).
      await gotoHash(page, '/goals');
      await page.getByTestId('goal-row').filter({ hasText: 'Spanish' }).getByRole('button', { name: copy.common.delete }).click();
      const dd = page.getByRole('dialog');
      await dd.getByRole('button', { name: copy.goal.delete.confirm }).click();
      await expect(dd).toBeHidden();
      await expectSyncState(page, 'synced', 20_000);
      await expect.poll(async () => (await mock.liveRows('u1')).goals.length, { timeout: 20_000 }).toBe(1);
      expect((await mock.liveRows('u1')).entries).toHaveLength(4);
      await syncNow(b.page);
      await gotoHash(b.page, '/goals');
      await expect(b.page.getByRole('link', { name: 'Spanish', exact: true })).toHaveCount(0);
      await expect(b.page.getByRole('link', { name: 'Read', exact: true })).toBeVisible();
      await check(b.page, otherLang === 'vi');

      // A: Sign out (Keep) -> data stays, no sync chip.
      await gotoHash(page, '/settings');
      await accountCard(page).getByRole('button', { name: copy.settings.account.signOut }).click();
      await expect(signOutDialog(page)).toBeVisible();
      await checkA();
      await signOutDialog(page).getByTestId('signout-confirm').click();
      await expect(accountCard(page)).toHaveAttribute('data-state', 'signed-out');
      await expect(toast(page)).toHaveText(copy.toast.signedOutKept);
      await gotoHash(page, '/today');
      await expectAmount(page, 'Read', '/30');
      await expect(page.getByTestId('sync-indicator')).toHaveCount(0);
      expect(await dbCounts(page)).toEqual({ goals: 1, entries: 4 });

      // B: Sign out (Remove) -> empty device; the account keeps its rows.
      await gotoHash(b.page, '/settings');
      await accountCard(b.page).getByRole('button', { name: copy.settings.account.signOut }).click();
      await expect(signOutDialog(b.page)).toBeVisible();
      await signOutDialog(b.page).getByRole('radio', { name: copy.auth.signOut.remove }).check();
      await signOutDialog(b.page).getByTestId('signout-confirm').click();
      await expect(accountCard(b.page)).toHaveAttribute('data-state', 'signed-out', { timeout: 20_000 });
      await expect(toast(b.page)).toHaveText(copy.toast.signedOutRemoved);
      await gotoHash(b.page, '/today');
      await expect(b.page.getByRole('heading', { level: 2, name: copy.empty.today.noGoals })).toBeVisible();
      await check(b.page, copy === VI);
      expect(await dbCounts(b.page)).toEqual({ goals: 0, entries: 0 });
      expect((await mock.liveRows('u1')).goals).toHaveLength(1);

      expect(errA.list).toEqual([]);
      expect(errB.list).toEqual([]);
      expect(badResponses, 'HTTP >= 400 responses on A').toEqual([]);
      expect(consoleErrors).toEqual([]);
      expect(recA.external(), 'A: requests outside app + mock').toEqual([]);
      expect(recB.external(), 'B: requests outside app + mock').toEqual([]);
    });
  });
}
