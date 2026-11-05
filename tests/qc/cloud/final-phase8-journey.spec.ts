/**
 * Final QC phase 8 (scope final): the Big goals journey across two devices + a third context, on the CLOUD-ON build
 * with the mock Supabase. Run 4x: en-US / vi-VN x 360x740 / 1440x900 (the viewport applies to A, B and C).
 *
 * (The file lives in tests/qc/cloud/ because the `cloud` Playwright project only matches that folder.)
 *
 * A: import q1-goal-only-backup.json -> template QPT (27/10/2026, goal "QPT study") -> W1 27/10 - 01/11 -> Diagnostic
 *    24/09/2026 = 5 -> Q1 numbers (list + detail) -> Sync now.
 * B: sign in -> same numbers; offline: tick W2 -> pending > 0; online -> Sync now. A Sync now -> 2/21.
 * A deletes the linked goal; sync A, B, A -> B shows "no goal linked" and hours "—".
 * B exports; C (fresh context, signed out) imports the file -> same roadmap.
 * roadmapTables:false -> A creates a goal and ticks W3 -> Sync now: no "Sign in again", hint visible, goal reached the
 * mock; tables back -> Sync now -> pending 0.
 * Axe (serious/critical) + no horizontal scroll (+ vi scan) on each roadmap screen. 0 page errors, only app + mock origins.
 */
import { readFile } from 'node:fs/promises';
import type { Page } from '@playwright/test';
import { expect, test } from '../../../e2e/cloud/fixtures';
import { collectErrors, expectSyncState, pendingCount, recordRequests, signInViaMock, syncIndicator, syncNow, accountCard } from '../../../e2e/cloud/helpers';
import { createGoal, EN, expectAxeClean, expectNoHorizontalScroll, expectNoViLeaks, FIXED_TIME_Q1, freezeClock, gotoHash, importBackup, ROADMAP_EN, ROADMAP_VI, toast, VI } from '../../../e2e/helpers/app';

const items = (page: Page) => page.getByTestId('roadmap-item');
const cpRow = (page: Page, title: string) => page.getByTestId('cp-row').filter({ has: page.locator('.cp-n', { hasText: new RegExp(`^${title}$`) }) });
/** Frozen clock plus s seconds: a later edit needs a later updatedAt (a tie keeps the server row, ADR-21). */
const later = (s: number) => new Date(FIXED_TIME_Q1.getTime() + s * 1000);
const rows = (page: Page) => page.getByTestId('roadmap-row');

const CASES = [
  { lang: 'en', locale: 'en-US', copy: EN, rm: ROADMAP_EN, viewport: { width: 360, height: 740 } },
  { lang: 'en', locale: 'en-US', copy: EN, rm: ROADMAP_EN, viewport: { width: 1440, height: 900 } },
  { lang: 'vi', locale: 'vi-VN', copy: VI, rm: ROADMAP_VI, viewport: { width: 360, height: 740 } },
  { lang: 'vi', locale: 'vi-VN', copy: VI, rm: ROADMAP_VI, viewport: { width: 1440, height: 900 } },
] as const;

test.beforeEach(async ({ mock }) => {
  await mock.reset();
});

for (const c of CASES) {
  test(`P8 journey (${c.lang}, ${c.viewport.width}x${c.viewport.height})`, async ({ mock, device }) => {
    test.setTimeout(240_000);
    const { copy, rm, lang } = c;
    const vi = lang === 'vi';
    const hours = vi ? '6,6 giờ' : '6.6 h';
    const a = await device({ locale: c.locale, viewport: c.viewport });
    const page = a.page;
    const errors = collectErrors(page);
    const rec = recordRequests(page);

    const signIn = async (p: Page) => {
      await p.goto('#/settings');
      await expect(accountCard(p)).toHaveAttribute('data-state', 'signed-out');
      await signInViaMock(p, 'Minh Test', copy);
      await expect(accountCard(p)).toHaveAttribute('data-state', 'signed-in');
    };
    const checkScreen = async (p: Page) => {
      await expectAxeClean(p);
      await expectNoHorizontalScroll(p);
      if (vi) await expectNoViLeaks(p);
    };
    const detail = (p: Page) => p.getByTestId('overview');
    const q1Detail = async (p: Page, done: string) => {
      await expect(detail(p).getByTestId('done-value')).toHaveText(done);
      await expect(detail(p).getByTestId('hours-value')).toHaveText(hours);
      await expect(detail(p).getByTestId('hours-sub')).toContainText('16');
      await expect(detail(p).getByTestId('pace-chip')).toHaveText(rm.pace.onTrack);
      await expect(detail(p).getByTestId('milestone-value')).toContainText('125');
      await expect(p.getByTestId('this-week-minutes')).toHaveText(new RegExp(`^75/480`));
      await expect(p.getByTestId('this-week-days')).toContainText('5');
      await expect(cpRow(p, 'Diagnostic').getByTestId('cp-score')).toHaveValue('5');
      await expect(cpRow(p, 'Diagnostic').getByTestId('cp-when')).toHaveText(vi ? '24/09/2026' : '2026-09-24');
    };
    const q1List = async (p: Page, done: string) => {
      const row = rows(p);
      await expect(row).toHaveCount(1);
      await expect(row.getByTestId('roadmap-progress')).toContainText(done);
      await expect(row.getByTestId('roadmap-hours')).toContainText(vi ? '6,6' : '6.6');
      await expect(row.getByTestId('roadmap-hours')).toContainText('16');
      await expect(row.getByTestId('pace-chip')).toHaveText(rm.pace.onTrack);
      await expect(row.getByTestId('roadmap-milestone')).toContainText('125');
    };

    // ---------- Device A ----------
    await freezeClock(page, FIXED_TIME_Q1);
    await importBackup(page, 'q1-goal-only-backup.json', copy);
    await gotoHash(page, '/roadmaps');
    await expect(page.getByTestId('roadmaps-empty')).toBeVisible();
    await checkScreen(page); // empty list
    await page.getByTestId('roadmaps-empty').getByRole('button', { name: rm.list.createTemplate }).click();
    const d = page.getByTestId('template-dialog');
    await d.getByLabel(vi ? /^Ngày bắt đầu/ : /^Start date/).fill('2026-10-27');
    await d.getByLabel(rm.ed.goalLabel).selectOption({ label: 'QPT study' });
    await d.getByRole('button', { name: rm.ed.create }).click();
    await page.waitForURL(/#\/roadmaps\/[^/]+$/);
    const roadmapId = page.url().split('/roadmaps/')[1]!;
    await expect(page.getByRole('heading', { level: 1, name: vi ? 'QPT 21 tuần' : 'QPT 21 weeks' })).toBeVisible();
    // W1 actual 27/10 - 01/11
    const w1 = items(page).nth(0);
    await w1.getByRole('button', { name: vi ? /^Ngày & ghi chú/ : /^Dates & note/ }).click();
    await w1.getByLabel(rm.item.actualStart, { exact: true }).fill('2026-10-27');
    await w1.getByLabel(rm.item.actualEnd, { exact: true }).fill('2026-11-01');
    // Diagnostic date 24/09/2026 (editor) and score 5 (table)
    await page.getByTestId('detail-edit').click();
    await page.getByRole('button', { name: vi ? 'Sửa Diagnostic' : 'Edit Diagnostic' }).click();
    await page.getByTestId('cp-form-edit').getByLabel(vi ? /^Ngày/ : /^Date/).fill('2026-09-24');
    await page.getByTestId('cp-form-edit').getByRole('button', { name: rm.ed.saveCp }).click();
    await expect(page.getByTestId('cp-form-edit')).toHaveCount(0);
    await page.getByTestId('editor-done').click();
    const score = cpRow(page, 'Diagnostic').getByTestId('cp-score');
    await score.fill('5');
    await score.blur();
    await q1Detail(page, '1/21');
    await checkScreen(page); // detail
    await gotoHash(page, '/roadmaps');
    await q1List(page, '1/21');
    await checkScreen(page); // list with data
    await gotoHash(page, '/roadmaps/new');
    await expect(page.getByTestId('new-template-banner')).toBeVisible();
    await checkScreen(page); // new

    // Sync now on A
    await signIn(page);
    await expectSyncState(page, 'synced');
    await syncNow(page);
    await expect.poll(() => pendingCount(page)).toBe(0);
    const r0 = await mock.rows('u1');
    expect([r0.roadmaps.length, r0.roadmap_phases.length, r0.roadmap_items.length, r0.roadmap_checkpoints.length]).toEqual([1, 5, 21, 5]);

    // ---------- Device B ----------
    const b = await device({ locale: c.locale, viewport: c.viewport });
    const bp = b.page;
    const bErrors = collectErrors(bp);
    const bRec = recordRequests(bp);
    await freezeClock(bp, FIXED_TIME_Q1);
    await signIn(bp);
    await expectSyncState(bp, 'synced');
    await syncNow(bp);
    await gotoHash(bp, '/roadmaps');
    await q1List(bp, '1/21');
    await checkScreen(bp);
    await gotoHash(bp, `/roadmaps/${roadmapId}`);
    await q1Detail(bp, '1/21');
    await checkScreen(bp);

    // B ticks W2 offline, then online + Sync now
    await freezeClock(bp, later(60));
    await b.context.setOffline(true);
    await items(bp).nth(1).getByRole('checkbox').click();
    await expect(detail(bp).getByTestId('done-value')).toHaveText('2/21');
    await gotoHash(bp, '/settings');
    await expect.poll(() => pendingCount(bp)).toBeGreaterThan(0);
    await b.context.setOffline(false);
    await syncNow(bp);
    await expect.poll(() => pendingCount(bp)).toBe(0);
    await expect.poll(async () => (await mock.rowsOf('u1', 'roadmap_items')).filter((i) => (i as { actual_end?: string | null }).actual_end != null).length).toBe(2);
    // A syncs -> 2/21
    await syncNow(page);
    await gotoHash(page, `/roadmaps/${roadmapId}`);
    await expect(detail(page).getByTestId('done-value')).toHaveText('2/21');
    await gotoHash(page, '/roadmaps');
    await expect(rows(page).getByTestId('roadmap-progress')).toContainText('2/21');

    // A deletes the linked goal; sync A, B, A
    await freezeClock(page, later(120));
    await gotoHash(page, '/goals');
    const gq = page.locator('li', { has: page.getByRole('heading', { level: 3, name: 'QPT study' }) });
    await gq.getByRole('button', { name: copy.common.delete }).click();
    await page.getByRole('dialog').getByRole('button', { name: copy.goal.delete.confirm }).click();
    await expect(page.getByRole('heading', { level: 3, name: 'QPT study' })).toHaveCount(0);
    await syncNow(page);
    await expect.poll(async () => (await mock.rowsOf('u1', 'roadmaps'))[0]?.goal_id).toBeNull();
    await syncNow(bp);
    await syncNow(page);
    await gotoHash(bp, '/roadmaps');
    await expect(rows(bp).getByTestId('roadmap-goal')).toHaveText(rm.list.row.unlinked);
    await expect(rows(bp).getByTestId('roadmap-hours')).toHaveText(rm.list.row.hoursNone);
    await expect(rows(bp).getByTestId('roadmap-progress')).toContainText('2/21');
    await checkScreen(bp);
    await gotoHash(page, '/roadmaps');
    await expect(rows(page).getByTestId('roadmap-goal')).toHaveText(rm.list.row.unlinked);

    // B exports -> C (fresh context) imports
    await gotoHash(bp, '/settings');
    const dl = bp.waitForEvent('download');
    await bp.getByRole('button', { name: copy.settings.backup.export }).click();
    const text = await readFile((await (await dl).path())!, 'utf8');
    const file = JSON.parse(text) as { schemaVersion: number; roadmaps: unknown[]; roadmapItems: unknown[] };
    expect(file.schemaVersion).toBe(2);
    expect([file.roadmaps.length, file.roadmapItems.length]).toEqual([1, 21]);
    const cc = await device({ locale: c.locale, viewport: c.viewport });
    const cp = cc.page;
    const cErrors = collectErrors(cp);
    await freezeClock(cp, FIXED_TIME_Q1);
    await gotoHash(cp, '/settings');
    await cp.getByTestId('import-file').setInputFiles({ name: 'export.json', mimeType: 'application/json', buffer: Buffer.from(text) });
    const dlg = cp.getByRole('dialog');
    await expect(dlg).toBeVisible();
    await dlg.getByRole('button', { name: copy.import.confirm }).click();
    await expect(dlg).toBeHidden();
    await gotoHash(cp, `/roadmaps/${roadmapId}`);
    await expect(detail(cp).getByTestId('done-value')).toHaveText('2/21');
    await expect(items(cp)).toHaveCount(21);
    await expect(cpRow(cp, 'Diagnostic').getByTestId('cp-score')).toHaveValue('5');
    await expect(cp.getByTestId('detail-goal')).toHaveText(rm.detail.goalNone);
    await checkScreen(cp);

    // roadmapTables:false -> A creates a goal and ticks W3
    await freezeClock(page, later(180));
    await mock.config({ roadmapTables: false });
    await createGoal(page, { name: 'Late goal', targetValue: 30, endsNever: true }, copy);
    await gotoHash(page, `/roadmaps/${roadmapId}`);
    await items(page).nth(2).getByRole('checkbox').click();
    await syncNow(page).catch(async () => {
      // with missing tables the indicator may say "N changes waiting" rather than "synced": press Sync now and wait for the cycle
      await expect(syncIndicator(page)).not.toHaveAttribute('data-state', 'syncing');
    });
    await expect.poll(async () => (await mock.rows('u1')).goals.some((g) => g.title === 'Late goal' || g.name === 'Late goal'), { timeout: 15_000 }).toBe(true);
    await gotoHash(page, '/settings');
    await expect(syncIndicator(page)).not.toHaveText(/Sign in again|Đăng nhập lại/);
    await expect(accountCard(page)).toHaveAttribute('data-state', 'signed-in');
    await expect(accountCard(page).getByTestId('auth-expired')).toHaveCount(0);
    await expect(accountCard(page).getByTestId('roadmaps-unavailable')).toHaveText(copy.settings.account.roadmapsUnavailable);
    const pendingMissing = await pendingCount(page);
    expect(pendingMissing).toBeGreaterThan(0);
    // tables back -> pending drops to 0
    await mock.config({ roadmapTables: true });
    await syncNow(page);
    await expect(toast(page)).toBeVisible();
    await expect(accountCard(page).getByTestId('roadmaps-unavailable')).toHaveCount(0);
    await expect.poll(() => pendingCount(page)).toBe(0);
    await syncNow(bp);
    await gotoHash(bp, `/roadmaps/${roadmapId}`);
    await expect(detail(bp).getByTestId('done-value')).toHaveText('3/21');

    expect(errors.list).toEqual([]);
    expect(bErrors.list).toEqual([]);
    expect(cErrors.list).toEqual([]);
    expect(rec.external()).toEqual([]);
    expect(bRec.external()).toEqual([]);
  });
}
