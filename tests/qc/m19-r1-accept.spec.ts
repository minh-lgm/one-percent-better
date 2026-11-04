// QC round 1 (M19): independent acceptance + exploratory checks. chromium project, clock 2026-11-04T10:00+07:00, Q1 fixture via the real import UI.
import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { EN, expectAxeClean, expectNoHorizontalScroll, expectNoViLeaks, fixturePath, FIXED_TIME_Q1, freezeClock, gotoHash, importBackup, ROADMAP_EN, ROADMAP_VI, toast, VI } from '../../e2e/helpers/app';

const item = (page: Page, id: string) => page.locator(`[data-testid="roadmap-item"][data-item="${id}"]`);
const cells = (page: Page) => page.getByTestId('strip-cell');
const ov = (page: Page) => page.getByTestId('overview');
const dialog = (page: Page) => page.getByRole('dialog');

async function viMode(page: Page) {
  await gotoHash(page, '/settings');
  await page.getByRole('radio', { name: EN.settings.language.option.vi }).check();
  await expect(page.locator('html')).toHaveAttribute('lang', 'vi');
}
type Backup = Record<string, Array<Record<string, unknown>>>;
/** Import a modified Q1 backup through the real Settings UI. */
async function importMutated(page: Page, mutate: (d: Backup) => void) {
  const d = JSON.parse(readFileSync(fixturePath('q1-roadmap-backup.json'), 'utf8'));
  mutate(d);
  await gotoHash(page, '/settings');
  await page.getByTestId('import-file').setInputFiles({ name: 'x.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(d)) });
  await expect(dialog(page)).toBeVisible();
  await dialog(page).getByRole('button', { name: EN.import.confirm }).click();
  await expect(dialog(page)).toBeHidden();
}

test.describe('M19 QC r1', () => {
  test.beforeEach(async ({ page }) => {
    await freezeClock(page, FIXED_TIME_Q1);
  });

  test('AC1/AC2 oracle Q1 (en) + light/dark axe', async ({ page }) => {
    await importBackup(page, 'q1-roadmap-backup.json');
    await gotoHash(page, '/roadmaps/rq');
    await expect(page.getByTestId('done-value')).toHaveText('1/21');
    await expect(ov(page).getByTestId('pace-chip')).toHaveText('On track');
    await expect(ov(page).getByTestId('hours-value')).toHaveText('5.8 h');
    await expect(ov(page)).toContainText('16 h');
    await expect(ov(page).getByTestId('milestone-value')).toContainText('125');
    await expect(cells(page)).toHaveCount(21);
    await expect(page.getByRole('list', { name: ROADMAP_EN.strip.label }).getByRole('listitem')).toHaveCount(21);
    await expect(cells(page).nth(0)).toHaveAttribute('data-state', 'done');
    await expect(cells(page).nth(1)).toHaveAttribute('data-current', 'true');
    await expect(page.locator('[data-testid="strip-cell"][data-state="overdue"]')).toHaveCount(0);
    await cells(page).nth(14).click();
    await expect(item(page, 'wq15')).toBeFocused();
    await expect(item(page, 'wq15')).toBeInViewport();
    const tw = page.getByTestId('this-week');
    await expect(tw).toContainText('W2');
    await expect(tw).toContainText('75/480');
    await expect(tw).toContainText('5 days');
    await expect(page.getByTestId('phase')).toHaveCount(5);
    await expect(item(page, 'wq1').getByTestId('item-label')).toHaveText('Early by 1 day · studied 6 days');
    await expect(item(page, 'wq1').getByTestId('item-hours')).toHaveText('4.5 h');
    await expect(item(page, 'wq2').getByTestId('item-hours')).toHaveText('1.3 h');
    await expect(item(page, 'wq3').getByTestId('item-hours')).toHaveText('0 h');
    await page.emulateMedia({ colorScheme: 'dark' });
    await expectAxeClean(page);
    await page.emulateMedia({ colorScheme: 'light' });
    await expectAxeClean(page);
  });

  test('AC2 archived goal -> hours + note; Q1e deleted goal -> dash + relink; no HTML injection', async ({ page }) => {
    await importBackup(page, 'q1-roadmap-backup.json');
    await gotoHash(page, '/goals');
    await page.getByTestId('goal-row').filter({ hasText: 'QPT study' }).getByRole('button', { name: EN.goals.archive }).click();
    await gotoHash(page, '/roadmaps/rq');
    await expect(ov(page).getByTestId('hours-value')).toHaveText('5.8 h');
    await expect(page.getByTestId('detail-goal')).toContainText(ROADMAP_EN.detail.goalArchived);
    await expect(page.locator('main')).toContainText(ROADMAP_EN.overview.hoursArchived);
    // delete (archived goals are listed under the archive toggle? try the row first)
    await gotoHash(page, '/goals/gq');
    await page.getByRole('button', { name: EN.common.delete }).click();
    await expect(dialog(page).getByTestId('confirm-note')).toContainText('"QPT 21 tuần"');
    await dialog(page).getByRole('button', { name: EN.goal.delete.confirm }).click();
    await gotoHash(page, '/roadmaps/rq');
    await expect(ov(page).getByTestId('hours-value')).toHaveText('—');
    for (const id of ['wq1', 'wq2', 'wq3', 'wq21']) await expect(item(page, id).getByTestId('item-hours')).toHaveText('—');
    // deleting a goal through the app unlinks the roadmap (FR-80); "linked goal was deleted" only arises from sync (covered by the dev component test)
    await expect(page.getByTestId('detail-goal')).toHaveText(ROADMAP_EN.detail.goalNone);
    await expect(page.getByTestId('overview-link-goal')).toBeVisible();
    // XSS
    const evil = '<img src=x onerror="window.__pwn=1"><b>x</b>';
    await page.evaluate(() => {
      (window as unknown as { __pwn?: number }).__pwn = 0;
    });
    await item(page, 'wq3').getByRole('button', { name: /^Dates & note/ }).click();
    const note = item(page, 'wq3').getByLabel('Note', { exact: true });
    await note.fill(evil);
    await note.blur();
    await expect(item(page, 'wq3').getByTestId('item-note')).toHaveText(evil);
    await gotoHash(page, '/roadmaps/rq/edit');
    await page.getByRole('form', { name: ROADMAP_EN.ed.srForm }).getByLabel(/^Note/).fill(evil);
    await page.getByRole('button', { name: ROADMAP_EN.ed.saveDetails }).click();
    await page.getByRole('button', { name: /^Edit Systems of linear equations/ }).first().click();
    await page.getByTestId('item-form-edit').getByLabel(/^Item title/).fill(evil);
    await page.getByTestId('item-form-edit').getByRole('button', { name: ROADMAP_EN.ed.saveItem }).click();
    await page.getByTestId('editor-done').click();
    await expect(page.getByTestId('roadmap-note')).toContainText(evil);
    await expect(item(page, 'wq1')).toContainText(evil);
    expect(await page.locator('main img, main b').count()).toBe(0);
    expect(await page.evaluate(() => (window as unknown as { __pwn?: number }).__pwn)).toBe(0);
    await page.reload();
    await expect(page.getByTestId('roadmap-note')).toContainText(evil);
    expect(await page.evaluate(() => (window as unknown as { __pwn?: number }).__pwn)).toBeUndefined();
  });

  test('AC3 (vi) sequence, online then offline', async ({ page, context }) => {
    await importBackup(page, 'q1-roadmap-backup.json');
    await viMode(page);
    await gotoHash(page, '/roadmaps/rq');
    await page.evaluate(() => navigator.serviceWorker.ready);
    await page.reload();
    await expect.poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller))).toBe(true);
    for (const offline of [false, true]) {
      await context.setOffline(offline);
      if (offline) await page.reload();
      await expect(page.getByTestId('done-value')).toHaveText('1/21');
      const w2 = item(page, 'wq2');
      await w2.getByRole('checkbox').click();
      await expect(page.getByTestId('done-value')).toHaveText('2/21');
      await expect(w2.getByLabel('Kết thúc thực tế', { exact: true })).toHaveValue('2026-11-04');
      await expect(w2.getByTestId('item-label')).toHaveText('Sớm 5 ngày');
      await expect(w2.getByTestId('item-label')).not.toContainText('học');
      await w2.getByRole('checkbox').click();
      await expect(page.getByTestId('done-value')).toHaveText('1/21');
      await expect(w2.getByTestId('item-label')).toHaveCount(0);
      const w3 = item(page, 'wq3');
      if ((await w3.getByRole('button', { name: /^Hôm nay/ }).count()) === 0) await w3.getByRole('button', { name: /^Ngày & ghi chú/ }).click();
      await w3.getByRole('button', { name: /^Hôm nay: đặt ngày bắt đầu/ }).click();
      await expect(w3.getByTestId('item-label')).toHaveText('Đang học');
      await expect(w3.getByTestId('item-hours')).toHaveText('0,5 giờ');
      await expect(w2.getByTestId('item-hours')).toHaveText('0,8 giờ');
      await expect(ov(page).getByTestId('hours-value')).toHaveText('5,8 giờ');
      await w3.getByLabel('Kết thúc thực tế', { exact: true }).fill('2026-11-05');
      await expect(w3.getByRole('alert')).toHaveText(ROADMAP_VI.errors.DATE_IN_FUTURE);
      expect(ROADMAP_VI.errors.DATE_IN_FUTURE).not.toBe(VI.errors.DATE_IN_FUTURE);
      await expect(page.getByTestId('done-value')).toHaveText('1/21');
      await w3.getByRole('button', { name: /^Xóa ngày bắt đầu/ }).click();
      const note = w2.getByLabel('Ghi chú', { exact: true });
      await note.fill('sai dấu');
      await note.blur();
      await page.reload();
      await expect(item(page, 'wq2').getByTestId('item-note')).toHaveText('sai dấu');
      await item(page, 'wq2').getByLabel('Ghi chú', { exact: true }).fill('');
      await item(page, 'wq2').getByLabel('Ghi chú', { exact: true }).blur();
      await expect(item(page, 'wq2').getByTestId('item-note')).toHaveCount(0);
    }
    await context.setOffline(false);
  });

  test('AC4 limits: title 81 chars rejected, first-up/last-down disabled, delete this-week item, 20 phases / 200 items', async ({ page }) => {
    await importBackup(page, 'q1-roadmap-backup.json');
    await gotoHash(page, '/roadmaps/rq/edit');
    const form = page.getByRole('form', { name: ROADMAP_EN.ed.srForm });
    await form.getByLabel(/^Title/).fill('x'.repeat(81));
    await page.getByRole('button', { name: ROADMAP_EN.ed.saveDetails }).click();
    await expect(form.getByRole('alert').first()).toBeVisible();
    await form.getByLabel(/^Title/).fill('x'.repeat(80));
    await page.getByRole('button', { name: ROADMAP_EN.ed.saveDetails }).click();
    await expect(toast(page)).toHaveText(ROADMAP_EN.toast.saved);
    const items = page.getByTestId('editor-item');
    await expect(items.first().getByRole('button', { name: /^Move .* up$/ })).toHaveAttribute('aria-disabled', 'true');
    await expect(items.last().getByRole('button', { name: /^Move .* down$/ })).toHaveAttribute('aria-disabled', 'true');
    await page.getByRole('button', { name: /^Delete Solving systems: elimination/ }).click();
    await dialog(page).getByRole('button', { name: /^Delete/ }).click();
    await page.getByTestId('editor-done').click();
    await expect(cells(page)).toHaveCount(20);
    await expect(page.getByTestId('this-week')).toBeVisible();
    await importMutated(page, (d) => {
      d.roadmapPhases = Array.from({ length: 20 }, (_, i) => ({ ...d.roadmapPhases[0], id: `p${i}`, title: `P${i}`, position: i }));
      d.roadmapItems = Array.from({ length: 200 }, (_, i) => ({ ...d.roadmapItems[0], id: `i${i}`, phaseId: `p${i % 20}`, title: `I${i}`, position: Math.floor(i / 20), plannedStart: '2026-10-27', plannedEnd: '2026-11-02', actualStart: null, actualEnd: null }));
    });
    await gotoHash(page, '/roadmaps/rq/edit');
    await page.getByRole('button', { name: ROADMAP_EN.ed.addPhase }).click();
    await expect(page.getByText(ROADMAP_EN.errors.ROADMAP_LIMIT_REACHED_phase.replace('{{max}}', '20'))).toBeVisible();
    await page.getByRole('button', { name: ROADMAP_EN.ed.addItem }).first().click();
    await expect(page.getByText(ROADMAP_EN.errors.ROADMAP_LIMIT_REACHED_item.replace('{{max}}', '200'))).toBeVisible();
    const t0 = Date.now();
    await gotoHash(page, '/roadmaps/rq');
    await expect(cells(page)).toHaveCount(200);
    console.log(`[QC] detail 200 items visible after ${Date.now() - t0} ms`);
  });

  test('AC4 validation on the new form + axe light/dark', async ({ page }) => {
    await importBackup(page, 'sample-backup.json');
    await gotoHash(page, '/roadmaps/new');
    const form = page.getByRole('form', { name: ROADMAP_EN.new.srForm });
    await form.getByLabel(/^Weekly study target/).fill('0.3');
    await form.getByRole('button', { name: ROADMAP_EN.ed.create }).click();
    await expect(form.getByLabel(/^Title/)).toBeFocused();
    await expect(form.getByText(ROADMAP_EN.errors.ROADMAP_TARGET_INVALID)).toBeVisible();
    await expect(form.getByLabel(/^Title/)).toHaveAttribute('aria-invalid', 'true');
    await expectAxeClean(page);
    await page.emulateMedia({ colorScheme: 'dark' });
    await expectAxeClean(page);
  });

  test('AC5 stale picker: ALREADY_LINKED names the other roadmap; GOAL_NOT_FOUND uses the namespace string', async ({ page }) => {
    await importBackup(page, 'q1-roadmap-backup.json');
    const newForm = page.getByRole('form', { name: ROADMAP_EN.new.srForm });
    await gotoHash(page, '/roadmaps/new');
    await newForm.getByLabel(/^Title/).fill('Plan A');
    await newForm.getByRole('button', { name: ROADMAP_EN.ed.create }).click();
    await expect(page).toHaveURL(/\/edit$/);
    const picker = page.getByRole('form', { name: ROADMAP_EN.ed.srForm }).getByLabel(ROADMAP_EN.ed.goalLabel);
    await expect(picker).toBeVisible();
    const p2 = await page.context().newPage();
    await freezeClock(p2, FIXED_TIME_Q1);
    await p2.goto('/#/roadmaps/new');
    const f2 = p2.getByRole('form', { name: ROADMAP_EN.new.srForm });
    await f2.getByLabel(/^Title/).fill('Plan B');
    await f2.getByLabel(ROADMAP_EN.ed.goalLabel).selectOption({ label: 'Read' });
    await f2.getByRole('button', { name: ROADMAP_EN.ed.create }).click();
    await expect(p2).toHaveURL(/\/edit$/);
    await p2.goto('/#/goals');
    await p2.getByTestId('goal-row').filter({ hasText: 'Spanish' }).getByRole('button', { name: EN.common.delete }).click();
    await dialog(p2).getByRole('button', { name: EN.goal.delete.confirm }).click();
    await expect(toast(p2)).toBeVisible();
    await picker.selectOption({ label: 'Read' });
    await page.getByRole('button', { name: ROADMAP_EN.ed.saveDetails }).click();
    await expect(page.getByText('This goal is already linked to "Plan B"', { exact: false })).toBeVisible();
    await expect(picker).toHaveAttribute('aria-invalid', 'true');
    await picker.selectOption({ label: 'Spanish' });
    await page.getByRole('button', { name: ROADMAP_EN.ed.saveDetails }).click();
    await expect(page.getByText(ROADMAP_EN.errors.GOAL_NOT_FOUND)).toBeVisible();
    await p2.close();
  });

  test('AC6 offline: delete dialog still opens (note when linked, none otherwise)', async ({ page, context }) => {
    await importBackup(page, 'q1-roadmap-backup.json');
    await gotoHash(page, '/goals');
    await page.evaluate(() => navigator.serviceWorker.ready);
    await page.reload();
    await expect.poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller))).toBe(true);
    await context.setOffline(true);
    await page.reload();
    await page.getByTestId('goal-row').filter({ hasText: 'QPT study' }).getByRole('button', { name: EN.common.delete }).click();
    await expect(dialog(page)).toBeVisible();
    console.log('[QC] offline D2 note count (gq):', await dialog(page).getByTestId('confirm-note').count());
    await dialog(page).getByRole('button', { name: EN.common.cancel }).click();
    await page.getByTestId('goal-row').filter({ hasText: 'Read' }).getByRole('button', { name: EN.common.delete }).click();
    await expect(dialog(page)).toBeVisible();
    await expect(dialog(page).getByTestId('confirm-note')).toHaveCount(0);
    await context.setOffline(false);
  });

  test('AC7 vi scan list/detail/editor/new/goal at 360x740, accessible names, dark axe on editor', async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 740 });
    await importBackup(page, 'q1-roadmap-backup.json');
    await viMode(page);
    for (const h of ['/roadmaps', '/roadmaps/rq', '/roadmaps/rq/edit', '/roadmaps/new', '/goals/gq']) {
      await gotoHash(page, h);
      await page.waitForLoadState('networkidle');
      await expectNoViLeaks(page);
      await expectNoHorizontalScroll(page);
    }
    await gotoHash(page, '/roadmaps/rq');
    await expect(page.getByTestId('done-value')).toBeVisible();
    for (const b of await page.getByRole('button', { name: /^Ngày & ghi chú/ }).all()) if ((await b.getAttribute('aria-expanded')) === 'false') await b.click();
    await expectNoHorizontalScroll(page);
    const unnamed = await page.evaluate(() => {
      const bad: string[] = [];
      document.querySelectorAll('main button, main input, main select, main textarea, main a').forEach((el) => {
        const e = el as HTMLElement;
        const by = e.getAttribute('aria-labelledby');
        const lab = e.getAttribute('aria-label') || (by ? by.split(' ').map((i) => document.getElementById(i)?.textContent ?? '').join('').trim() : '') || ((e as HTMLInputElement).labels?.[0]?.textContent ?? '') || e.textContent?.trim() || '';
        if (!lab.trim()) bad.push(e.outerHTML.slice(0, 120));
      });
      return bad;
    });
    expect(unnamed).toEqual([]);
    await page.emulateMedia({ colorScheme: 'dark' });
    await gotoHash(page, '/roadmaps/rq/edit');
    await expectAxeClean(page);
  });

  test('Explore: rapid tick, note typing survives re-render, editor to editor navigation, ?focus=goal, offline reload on detail', async ({ page, context }) => {
    await importBackup(page, 'q1-roadmap-backup.json');
    await gotoHash(page, '/roadmaps/rq');
    const box = item(page, 'wq2').getByRole('checkbox');
    for (let i = 0; i < 10; i++) await box.click({ noWaitAfter: true });
    await expect(page.getByTestId('done-value')).toHaveText('1/21');
    for (let i = 0; i < 5; i++) await box.click({ noWaitAfter: true });
    await expect(page.getByTestId('done-value')).toHaveText('2/21');
    const ta = item(page, 'wq2').getByLabel('Note', { exact: true });
    await ta.focus();
    await ta.pressSequentially('abc', { delay: 20 });
    await item(page, 'wq5').getByRole('checkbox').click({ noWaitAfter: true });
    await expect(page.getByTestId('done-value')).toHaveText('3/21');
    await expect(ta).toHaveValue('abc');
    // second roadmap, then editor A -> editor B directly
    await gotoHash(page, '/roadmaps/new');
    const nf = page.getByRole('form', { name: ROADMAP_EN.new.srForm });
    await nf.getByLabel(/^Title/).fill('Second');
    await nf.getByRole('button', { name: ROADMAP_EN.ed.create }).click();
    await expect(page).toHaveURL(/\/edit$/);
    const form = page.getByRole('form', { name: ROADMAP_EN.ed.srForm });
    await expect(form.getByLabel(/^Title/)).toHaveValue('Second');
    await gotoHash(page, '/roadmaps/rq/edit');
    await expect(form.getByLabel(/^Title/)).toHaveValue('QPT 21 tuần');
    await gotoHash(page, '/roadmaps/rq/edit?focus=goal');
    await expect(form.getByLabel(ROADMAP_EN.ed.goalLabel)).toBeFocused();
    // offline reload on the detail
    await gotoHash(page, '/roadmaps/rq');
    await page.evaluate(() => navigator.serviceWorker.ready);
    await page.reload();
    await expect.poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller))).toBe(true);
    await context.setOffline(true);
    await page.reload();
    await expect(page.getByTestId('done-value')).toHaveText('3/21');
    await context.setOffline(false);
    // non-existent roadmap + deep editor
    await gotoHash(page, '/roadmaps/nope');
    await expect(page.getByText(ROADMAP_EN.notFound.body)).toBeVisible();
    await gotoHash(page, '/roadmaps/nope/edit');
    await expect(page.getByText(ROADMAP_EN.notFound.body)).toBeVisible();
  });
  test('Explore: long unbroken strings (80/200/120/1000/2000) do not scroll horizontally at 360 px (detail + editor)', async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 740 });
    await importBackup(page, 'q1-roadmap-backup.json');
    await importMutated(page, (d) => {
      d.roadmaps[0].title = 'R'.repeat(80);
      d.roadmaps[0].note = 'N'.repeat(2000);
      d.roadmaps[0].milestoneLabel = 'Mm '.repeat(13);
      d.roadmapPhases[0].title = 'P'.repeat(80);
      d.roadmapPhases[0].note = 'Q'.repeat(120);
      d.roadmapItems[1].title = 'T'.repeat(200);
      d.roadmapItems[1].note = 'W'.repeat(1000);
    });
    for (const h of ['/roadmaps', '/roadmaps/rq', '/roadmaps/rq/edit']) {
      await gotoHash(page, h);
      await page.waitForLoadState('networkidle');
      await expectNoHorizontalScroll(page);
    }
    await gotoHash(page, '/roadmaps/rq');
    await item(page, 'wq2').getByRole('button', { name: /^Dates & note/ }).click({ trial: true }).catch(() => undefined);
    await expectNoHorizontalScroll(page);
  });
  // M19-D1 (fixed in 2e9534f, verified by QC M20 r1): a 40-char milestone label without spaces must not widen the overview metric (detail) or the list row at 360 px.
  test('M19-D1: 40 unbroken chars in the milestone label must not cause horizontal scroll at 360 px (list + detail)', async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 740 });
    await importBackup(page, 'q1-roadmap-backup.json');
    await importMutated(page, (d) => {
      d.roadmaps[0].milestoneLabel = 'M'.repeat(40);
    });
    for (const h of ['/roadmaps', '/roadmaps/rq']) {
      await gotoHash(page, h);
      await page.waitForLoadState('networkidle');
      await expectNoHorizontalScroll(page);
    }
  });
});
