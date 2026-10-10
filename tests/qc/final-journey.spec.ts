/**
 * Final QC: end-to-end user journey on the production preview, run four times:
 * en-US and vi-VN, at 360 px and 1440 px. First launch in a clean context →
 * create 2 goals (daily + total) → manual entry → timer across a reload →
 * reminder on (banner + one notification) → back-fill yesterday → Review →
 * Goal detail (+X% better) → archive → export JSON → delete all goals →
 * import the file → everything restored → offline reload of every route.
 */
import { expect, test, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import {
  at,
  advanceTo,
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
} from '../../e2e/helpers/app';
import { BASE_URL } from '../../playwright.config';

// Full Chromium build: the default headless shell reports notification permission as blocked.
test.use({ channel: 'chromium', permissions: ['notifications'] });

type Copy = typeof EN | typeof VI;

const CONFIGS = [
  { name: 'en-US 360px', locale: 'en-US', lang: 'en', copy: EN as Copy, viewport: { width: 360, height: 740 } },
  { name: 'en-US 1440px', locale: 'en-US', lang: 'en', copy: EN as Copy, viewport: { width: 1440, height: 900 } },
  { name: 'vi-VN 360px', locale: 'vi-VN', lang: 'vi', copy: VI as Copy, viewport: { width: 360, height: 740 } },
  { name: 'vi-VN 1440px', locale: 'vi-VN', lang: 'vi', copy: VI as Copy, viewport: { width: 1440, height: 900 } },
] as const;

const READ = { name: 'Read', why: 'Be smarter', targetValue: 30, startDate: '2026-10-01', endDate: '2026-10-31' };
// Total 100 h over the whole of 2026 => dailyTarget 17 min.
const SPANISH = { name: 'Spanish', why: 'Talk to family', targetType: 'total' as const, targetValue: 100, startDate: '2026-01-01', endDate: '2026-12-31' };

async function goalIdOf(page: Page, name: string): Promise<string> {
  await gotoHash(page, '/goals');
  const href = await page.getByRole('link', { name, exact: true }).getAttribute('href');
  return href!.replace(/^#?\/goals\//, '');
}

async function dbCounts(page: Page): Promise<{ goals: number; entries: number }> {
  return page.evaluate(
    () =>
      new Promise((resolve, reject) => {
        const req = indexedDB.open('one-percent-better');
        req.onerror = () => reject(req.error);
        req.onsuccess = () => {
          const db = req.result;
          const tx = db.transaction(['goals', 'entries'], 'readonly');
          const g = tx.objectStore('goals').count();
          const e = tx.objectStore('entries').count();
          tx.oncomplete = () => {
            db.close();
            resolve({ goals: g.result, entries: e.result });
          };
          tx.onerror = () => reject(tx.error);
        };
      }),
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
  test.describe(`Final journey — ${cfg.name}`, () => {
    test.use({ locale: cfg.locale, viewport: cfg.viewport });

    test('first launch → … → export → delete all → import → offline', async ({ page, browser }, testInfo) => {
      test.setTimeout(240_000);
      const { copy, lang } = cfg;
      const vi = lang === 'vi';
      const external: string[] = [];
      const pageErrors: string[] = [];
      const consoleErrors: string[] = [];
      let offline = false;
      page.on('request', (req) => {
        if (!req.url().startsWith(BASE_URL)) external.push(req.url());
      });
      page.on('pageerror', (e) => pageErrors.push(String(e)));
      page.on('console', (m) => {
        if (m.type() === 'error' && !offline) consoleErrors.push(m.text());
      });

      const check = async (axe = true) => {
        await expectNoHorizontalScroll(page);
        if (vi) await expectNoViLeaks(page);
        if (axe) await expectAxeClean(page);
      };

      // ---- 1. First launch: language follows the browser, empty state, no data
      await trackNotifications(page);
      await freezeClock(page);
      await gotoHash(page, '/today');
      await expect(page.locator('html')).toHaveAttribute('lang', lang);
      await expect(page.getByText(copy.empty.today.noGoals)).toBeVisible();
      await check();
      expect(await dbCounts(page)).toEqual({ goals: 0, entries: 0 });

      // ---- 2. Create two goals (daily + total)
      await createGoal(page, READ, copy);
      await createGoal(page, SPANISH, copy);
      await expect(page.getByRole('link', { name: 'Read', exact: true })).toBeVisible();
      await expect(page.getByRole('link', { name: 'Spanish', exact: true })).toBeVisible();
      await check();
      const readId = await goalIdOf(page, 'Read');
      const spanishId = await goalIdOf(page, 'Spanish');
      await gotoHash(page, '/today');
      await expectAmount(page, 'Read', '0/30');
      await expectAmount(page, 'Spanish', '0/17');
      await check();

      // Service worker in control before reminders are used.
      await page.evaluate(() => navigator.serviceWorker.ready);
      await page.reload();
      await page.waitForFunction(() => Boolean(navigator.serviceWorker.controller));

      // ---- 3. Manual entries
      await logTime(page, 'Read', 20, 'Ch. 3', copy);
      await expectAmount(page, 'Read', '20/30');
      await logTime(page, 'Spanish', 10, '', copy);
      await expectAmount(page, 'Spanish', '10/17');
      await expect(page.getByTestId('plus-one-live')).toHaveAttribute('data-count', '0');
      await check();

      // ---- 4. Timer survives a reload, Stop → Save
      await startTimer(page, 'Read', copy);
      await freezeClock(page, at('00:10:00'));
      await expect(timerElapsed(page)).toHaveText('00:10:00');
      await page.reload();
      await expect(timerCard(page)).toBeVisible();
      await expect(timerElapsed(page)).toHaveText('00:10:00');
      await check();
      await timerCard(page).getByRole('button', { name: new RegExp(`^${copy.timer.stopAria.split('{{')[0]}Read`) }).click();
      await expect(stopDialog(page)).toBeVisible();
      await expect(stopDialog(page).getByLabel(new RegExp(`^${copy.entry.form.minutesLabel}`))).toHaveValue('10');
      await check();
      await stopDialog(page).getByRole('button', { name: copy.entry.form.save }).click();
      await expectAmount(page, 'Read', '30/30');
      await expect(page.getByTestId('plus-one-live')).toHaveAttribute('data-count', '1');
      await expect(timerCard(page)).toHaveCount(0);

      // ---- 5. Reminder on: banner + exactly one notification after 20:00
      await gotoHash(page, '/settings');
      const sw = page.getByRole('switch', { name: copy.settings.reminders.switch });
      await sw.click();
      await expect(sw).toBeChecked();
      await check();
      await gotoHash(page, '/today');
      await expect(goalCard(page, 'Read')).toBeVisible();
      await advanceTo(page, at('2026-10-09T20:01:00'));
      await expect.poll(() => recordedNotifications(page).then((n) => n.length), { timeout: 20_000 }).toBe(1);
      const [note] = await recordedNotifications(page);
      expect(note.lang).toBe(lang);
      expect(note.body).toContain('Spanish');
      await expect(page.getByTestId('reminder-banner')).toBeVisible();
      await check();

      // ---- 6. Back-fill yesterday on Day
      await gotoHash(page, '/day/2026-10-08');
      await goalCard(page, 'Read').getByRole('button', { name: copy.goalCard.addEntry }).click();
      await goalCard(page, 'Read').getByLabel(new RegExp(`^${copy.entry.form.minutesLabel}`)).fill('30');
      await goalCard(page, 'Read').getByRole('button', { name: copy.entry.form.save }).click();
      await expectAmount(page, 'Read', '30/30');
      await expect(toast(page)).toHaveText(copy.toast.entrySaved);
      await check();

      // ---- 7. Review: heatmap cell coloured, streak 2, charts
      await gotoHash(page, '/review');
      await expect(page.getByTestId('chart-weekly').locator('svg.recharts-surface')).toBeVisible();
      await expect(page.locator('[data-date="2026-10-08"]')).toHaveClass(/\bl[1-4]\b/);
      await expect(page.locator('[data-date="2026-10-09"]')).toHaveClass(/\bl[1-4]\b/);
      await expect(page.getByTestId('stat-current')).toContainText(/2/);
      await check();
      await page.screenshot({ path: testInfo.outputPath(`review-${cfg.name}.png`), fullPage: true });

      // ---- 8. Goal detail: curve with 2 lines, +2.0% better, history of 3
      await gotoHash(page, `/goals/${readId}`);
      await expect(page.getByTestId('headline')).toHaveText(/2[.,]0%/);
      await expect(page.getByTestId('curve-chart').locator('.recharts-line')).toHaveCount(2);
      await expect(page.getByTestId('history-row')).toHaveCount(3);
      await expect(page.getByTestId('history-row').filter({ hasText: copy.entry.source.timer })).toHaveCount(1);
      await check();
      await page.screenshot({ path: testInfo.outputPath(`detail-${cfg.name}.png`), fullPage: true });

      // ---- 9. Archive Spanish
      await gotoHash(page, '/goals');
      await page.getByTestId('goal-row').filter({ hasText: 'Spanish' }).getByRole('button', { name: copy.goals.archive }).click();
      await expect(toast(page)).toHaveText(copy.toast.goalArchived);
      await expect(page.getByRole('heading', { level: 2, name: copy.goals.groupArchived.replace('{{n}}', '1') })).toBeVisible();
      await check();
      await gotoHash(page, '/today');
      await expect(goalCard(page, 'Spanish')).toHaveCount(0);
      await expect(goalCard(page, 'Read')).toBeVisible();

      // ---- 10. Export JSON
      await gotoHash(page, '/settings');
      const dl = page.waitForEvent('download');
      await page.getByRole('button', { name: copy.settings.backup.export }).click();
      const download = await dl;
      expect(download.suggestedFilename()).toBe('1percent-better-backup-2026-10-09.json');
      const exportedPath = (await download.path())!;
      const raw = await readFile(exportedPath, 'utf8');
      const file = JSON.parse(raw) as { app: string; schemaVersion: number; goals: Array<{ id: string; name: string; archived?: boolean }>; entries: unknown[]; settings: Record<string, unknown> };
      expect(file.app).toBe('one-percent-better');
      expect(file.schemaVersion).toBe(1);
      expect(file.goals.map((g) => g.name).sort()).toEqual(['Read', 'Spanish']);
      expect(file.entries).toHaveLength(4); // Read: 20 manual + 10 timer + 30 yesterday; Spanish: 10
      expect(raw).not.toContain('"locale"');
      await expect(toast(page)).toHaveText(copy.toast.backupExported);

      // ---- 11. Delete everything (delete both goals)
      await gotoHash(page, '/goals');
      for (const name of ['Read', 'Spanish']) {
        await page.getByTestId('goal-row').filter({ hasText: name }).getByRole('button', { name: copy.common.delete }).click();
        const dialog = page.getByRole('dialog');
        await expect(dialog).toBeVisible();
        await dialog.getByRole('button', { name: copy.goal.delete.confirm }).click();
        await expect(dialog).toBeHidden();
        await expect(page.getByRole('link', { name, exact: true })).toHaveCount(0);
      }
      expect(await dbCounts(page)).toEqual({ goals: 0, entries: 0 });
      await gotoHash(page, '/today');
      await expect(page.getByText(copy.empty.today.noGoals)).toBeVisible();
      await gotoHash(page, '/review');
      await expect(page.getByText(copy.empty.review, { exact: true })).toBeVisible();
      await check();

      // ---- 12. Import the file → restored
      await gotoHash(page, '/settings');
      await page.getByTestId('import-file').setInputFiles(exportedPath);
      const dialog = page.getByRole('dialog');
      await expect(dialog).toBeVisible();
      await check();
      await dialog.getByRole('button', { name: copy.import.confirm }).click();
      await expect(dialog).toBeHidden();
      await expect(toast(page)).toContainText(copy.toast.backupImported.split(':')[0]);
      expect(await dbCounts(page)).toEqual({ goals: 2, entries: 4 });

      await gotoHash(page, '/today');
      await expectAmount(page, 'Read', '30/30');
      await expect(goalCard(page, 'Spanish')).toHaveCount(0); // still archived
      await expect(page.getByTestId('plus-one-live')).toHaveAttribute('data-count', '0');
      await check();
      await gotoHash(page, '/goals');
      await expect(page.getByRole('heading', { level: 2, name: copy.goals.groupArchived.replace('{{n}}', '1') })).toBeVisible();
      await check();
      expect(await goalIdOf(page, 'Read')).toBe(readId);
      expect(await goalIdOf(page, 'Spanish')).toBe(spanishId);
      await gotoHash(page, `/goals/${readId}`);
      await expect(page.getByTestId('headline')).toHaveText(/2[.,]0%/);
      await expect(page.getByTestId('history-row')).toHaveCount(3);
      await expect(page.getByTestId('curve-chart').locator('.recharts-line')).toHaveCount(2);
      await check();
      await gotoHash(page, `/goals/${spanishId}`);
      await expect(page.getByText(copy.goal.status.archived, { exact: true })).toBeVisible();
      await expect(page.getByTestId('history-row')).toHaveCount(1);
      await gotoHash(page, '/review');
      await expect(page.locator('[data-date="2026-10-08"]')).toHaveClass(/\bl[1-4]\b/);
      await expect(page.getByTestId('stat-current')).toContainText(/2/);
      await check();
      await gotoHash(page, '/settings');
      await expect(page.getByRole('switch', { name: copy.settings.reminders.switch })).toBeVisible();

      // ---- 13. Offline: every route reloads from the precache; logging still works
      await gotoHash(page, '/today');
      await waitForPrecache(page);
      await page.context().setOffline(true);
      offline = true;
      const routes: Array<[string, () => Promise<void>]> = [
        ['/today', async () => expect(goalCard(page, 'Read')).toBeVisible()],
        ['/goals', async () => expect(page.getByRole('link', { name: 'Read', exact: true })).toBeVisible()],
        ['/review', async () => expect(page.getByTestId('chart-weekly').locator('svg.recharts-surface')).toBeVisible()],
        [`/goals/${readId}`, async () => expect(page.getByTestId('curve-chart').locator('.recharts-line')).toHaveCount(2)],
        ['/day/2026-10-08', async () => expect(goalCard(page, 'Read')).toBeVisible()],
        ['/settings', async () => expect(page.getByRole('switch', { name: copy.settings.reminders.switch })).toBeVisible()],
        ['/goals/new', async () => expect(page.getByRole('heading', { level: 1, name: copy.goal.form.titleNew })).toBeVisible()],
      ];
      for (const [route, ready] of routes) {
        await page.goto(`/#${route}`);
        await page.reload();
        await expect(page.locator('html')).toHaveAttribute('lang', lang);
        await ready();
        await expectNoHorizontalScroll(page);
        if (vi) await expectNoViLeaks(page);
      }
      await gotoHash(page, '/today');
      await page.reload();
      await expect(page.getByRole('status').filter({ hasText: copy.offline.chip })).toBeVisible();
      await logTime(page, 'Read', 5, '', copy);
      await expectAmount(page, 'Read', '35/30');
      await page.reload();
      await expectAmount(page, 'Read', '35/30');

      // Language switch while offline survives an offline reload (en run only).
      if (!vi) {
        await gotoHash(page, '/settings');
        await page.getByRole('radio', { name: VI.settings.language.option.vi }).check();
        await expect(page.locator('html')).toHaveAttribute('lang', 'vi');
        await page.reload();
        await expect(page.locator('html')).toHaveAttribute('lang', 'vi');
        await expectNoViLeaks(page);
      }
      await page.context().setOffline(false);
      offline = false;

      expect(external, 'requests to other origins').toEqual([]);
      expect(pageErrors, 'uncaught page errors').toEqual([]);
      expect(consoleErrors, 'console errors').toEqual([]);
      void browser;
    });
  });
}
