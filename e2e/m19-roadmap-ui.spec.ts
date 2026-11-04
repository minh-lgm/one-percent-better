// M19 — detail, quick actions, editor, goal link, FR-80 (TASKS M19-AC1 … AC7; "today" = 2026-11-04 10:00 +07:00).
// chromium project, en + vi, 1280×720 (default) and 360×740. Data: Q1 fixture through the real import UI.
import { readFileSync } from 'node:fs';
import { expect, test, type Locator, type Page } from '@playwright/test';
import { chooseBackupFile, EN, fixturePath, expectAxeClean, expectNoHorizontalScroll, expectNoViLeaks, FIXED_TIME_Q1, freezeClock, gotoHash, importBackup, ROADMAP_EN, ROADMAP_VI, toast, VI } from './helpers/app';

const item = (page: Page, id: string) => page.locator(`[data-testid="roadmap-item"][data-item="${id}"]`);
const cells = (page: Page) => page.getByTestId('strip-cell');
const overview = (page: Page) => page.getByTestId('overview');
const editorItems = (page: Page) => page.getByTestId('editor-item');
const itemTitles = (page: Page) => editorItems(page).locator('b').allTextContents();

async function switchToVi(page: Page): Promise<void> {
  await gotoHash(page, '/settings');
  await page.getByRole('radio', { name: EN.settings.language.option.vi }).check();
  await expect(page.locator('html')).toHaveAttribute('lang', 'vi');
}

/** Tick a checkbox and return how long the done counter took to change (ms, measured in the page). */
async function timedTick(page: Page, itemId: string, expected: string): Promise<number> {
  return page.evaluate(
    ({ itemId, expected }) =>
      new Promise<number>((resolve) => {
        const box = document.querySelector<HTMLInputElement>(`[data-testid="roadmap-item"][data-item="${itemId}"] input[type="checkbox"]`)!;
        const done = () => document.querySelector('[data-testid="done-value"]')?.textContent?.trim();
        const t0 = performance.now();
        const obs = new MutationObserver(() => {
          if (done() === expected) {
            obs.disconnect();
            resolve(performance.now() - t0);
          }
        });
        obs.observe(document.body, { subtree: true, childList: true, characterData: true });
        box.click();
      }),
    { itemId, expected },
  );
}

/** The sequence of M19-AC3 (1)–(5) in vi; `suffix` keeps the two notes apart (online / offline). */
async function quickActions(page: Page, suffix: string): Promise<void> {
  const ov = overview(page);
  await expect(ov.getByTestId('done-value')).toHaveText('1/21');
  // (1) tick W2 → 2/21 in < 100 ms; actual end = today; "Sớm 5 ngày" without "học"
  const ms = await timedTick(page, 'wq2', '2/21');
  console.log(`[M19 tick] 2/21 after ${ms.toFixed(1)} ms`);
  expect(ms).toBeLessThan(100);
  await expect(item(page, 'wq2').getByLabel('Kết thúc thực tế', { exact: true })).toHaveValue('2026-11-04');
  await expect(item(page, 'wq2').getByTestId('item-label')).toHaveText('Sớm 5 ngày');
  await expect(page.getByTestId('this-week').getByRole('button', { name: ROADMAP_VI.item.undoDone })).toBeVisible();
  await expect(cells(page).nth(1)).toHaveAttribute('data-state', 'done');
  // (2) untick → 1/21, end gone, no label
  await item(page, 'wq2').getByRole('checkbox').click();
  await expect(ov.getByTestId('done-value')).toHaveText('1/21');
  await expect(item(page, 'wq2').getByLabel('Kết thúc thực tế', { exact: true })).toHaveValue('');
  await expect(item(page, 'wq2').getByTestId('item-label')).toHaveCount(0);
  // (3) W3 "Hôm nay" on the actual start → "Đang học"; 11-04 moves from W2 to W3 (0,5 / 0,8), total unchanged
  await item(page, 'wq3').getByRole('button', { name: /^Ngày & ghi chú/ }).click();
  await item(page, 'wq3').getByRole('button', { name: /^Hôm nay: đặt ngày bắt đầu thực tế của/ }).click();
  await expect(item(page, 'wq3').getByTestId('item-label')).toHaveText('Đang học');
  await expect(item(page, 'wq3').getByTestId('item-hours')).toHaveText('0,5 giờ');
  await expect(item(page, 'wq2').getByTestId('item-hours')).toHaveText('0,8 giờ');
  await expect(ov.getByTestId('hours-value')).toHaveText('6,6 giờ');
  // (4) W3 end 05/11/2026 → DATE_IN_FUTURE from roadmap:errors, nothing saved
  await item(page, 'wq3').getByLabel('Kết thúc thực tế', { exact: true }).fill('2026-11-05');
  await expect(item(page, 'wq3').getByRole('alert')).toHaveText(ROADMAP_VI.errors.DATE_IN_FUTURE);
  await expect(item(page, 'wq3').getByRole('alert')).toHaveText('Ngày thực tế không được sau hôm nay.');
  await expect(item(page, 'wq3').getByLabel('Kết thúc thực tế', { exact: true })).toHaveAttribute('aria-invalid', 'true');
  await expect(ov.getByTestId('done-value')).toHaveText('1/21');
  // reset W3 for the next round: clear the start
  await item(page, 'wq3').getByRole('button', { name: /^Xóa ngày bắt đầu thực tế của/ }).click();
  await expect(item(page, 'wq3').getByTestId('item-label')).toHaveCount(0);
  // (5) note on W2, saved while typing (debounce) and on blur
  const note = item(page, 'wq2').getByLabel('Ghi chú', { exact: true });
  await note.fill(`sai dấu ${suffix}`);
  await note.blur();
  await expect(item(page, 'wq2').getByTestId('item-note')).toHaveText(`sai dấu ${suffix}`);
}

async function cacheForOffline(page: Page): Promise<void> {
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload();
  await expect.poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller))).toBe(true);
}

test.describe('M19 Big goals — detail, quick actions, editor, goal link', () => {
  test.beforeEach(async ({ page }) => {
    await freezeClock(page, FIXED_TIME_Q1);
  });

  test('M19-AC1/AC2/AC8 (en): detail of Q1 — overview in < 1 s, 21 cells, This week W2, phases/items with labels and hours, notes as text, axe', async ({ page }) => {
    await importBackup(page, 'q1-roadmap-backup.json');
    await gotoHash(page, '/roadmaps');
    const row = page.getByTestId('roadmap-row').getByRole('link');
    await expect(row).toHaveAttribute('href', /#\/roadmaps\/rq$/);
    const t0 = Date.now();
    await row.click();
    await expect(page.getByTestId('done-value')).toHaveText('1/21');
    const elapsed = Date.now() - t0;
    console.log(`[M19 detail] overview visible ${elapsed} ms after the click`);
    expect(elapsed).toBeLessThan(1000);
    await expect(page).toHaveURL(/#\/roadmaps\/rq$/);
    await expect(page.getByRole('heading', { level: 1, name: 'QPT 21 tuần' })).toBeFocused();
    await expect(page).toHaveTitle('QPT 21 tuần — 1% Better');

    const ov = overview(page);
    await expect(ov.getByTestId('pace-chip')).toHaveText(ROADMAP_EN.pace.onTrack);
    await expect(ov.getByTestId('pace-sub')).toHaveText(ROADMAP_EN.pace.subOnTrack);
    await expect(ov.getByTestId('hours-value')).toHaveText('6.6 h');
    await expect(ov.getByTestId('hours-sub')).toHaveText('Planned through this week: 16 h');
    await expect(ov.getByTestId('milestone-value')).toHaveText('125 days left');
    await expect(ov.getByTestId('metric-milestone')).toContainText('On 2027-03-09');

    const strip = page.getByRole('list', { name: ROADMAP_EN.strip.label });
    await expect(strip.getByRole('listitem')).toHaveCount(21);
    await expect(cells(page)).toHaveCount(21);
    await expect(cells(page).nth(0)).toHaveAttribute('data-state', 'done');
    await expect(cells(page).nth(1)).toHaveAttribute('data-current', 'true');
    await expect(page.locator('[data-testid="strip-cell"][data-state="overdue"]')).toHaveCount(0);
    await expect(cells(page).nth(1)).toHaveAccessibleName('Solving systems: elimination, row echelon form, rank, 11/03 – 11/09: this week');
    await expect(cells(page).nth(0)).toHaveAccessibleName(/, 10\/27 – 11\/02: done$/);
    // cell 15 → W15 row scrolled into view and focused
    await cells(page).nth(14).click();
    await expect(item(page, 'wq15')).toBeFocused();
    await expect(item(page, 'wq15')).toBeInViewport();

    const now = page.getByTestId('this-week');
    await expect(now.getByTestId('this-week-eyebrow')).toHaveText('This week · W2 · 2026-11-03 – 11-09');
    await expect(now.getByRole('heading', { level: 3 })).toHaveText('Solving systems: elimination, row echelon form, rank');
    await expect(now.getByTestId('this-week-minutes')).toHaveText('75/480 min');
    await expect(now.getByTestId('this-week-days')).toHaveText('5 days left');
    await expect(now.getByRole('progressbar')).toHaveAttribute('aria-valuetext', '75 of 480 minutes');

    const phases = page.getByTestId('phase');
    await expect(phases).toHaveCount(5);
    await expect(phases.nth(0).getByRole('heading', { level: 3 })).toHaveText('Phase 1 · Linear Algebra');
    await expect(phases.nth(0).getByTestId('phase-note')).toHaveText('Course 1 · 34h');
    await expect(phases.nth(0).getByTestId('phase-progress')).toHaveText('Done 1/4');
    await expect(item(page, 'wq1').getByTestId('item-label')).toHaveText('Early by 1 day · studied 6 days');
    await expect(item(page, 'wq1').getByTestId('item-hours')).toHaveText('4.5 h');
    await expect(item(page, 'wq2').getByTestId('item-tags')).toContainText(ROADMAP_EN.tag.currentWeek);
    await expect(item(page, 'wq2').getByTestId('item-hours')).toHaveText('1.3 h');
    await expect(item(page, 'wq2')).toContainText('Planned 2026-11-03 – 11-09');
    await expect(item(page, 'wq3').getByTestId('item-hours')).toHaveText('0 h');
    await expect(item(page, 'wq2').getByRole('button', { name: /^Dates & note/ })).toHaveAttribute('aria-expanded', 'true');
    await expect(item(page, 'wq3').getByRole('button', { name: /^Dates & note/ })).toHaveAttribute('aria-expanded', 'false');

    const note = page.getByTestId('roadmap-note');
    await expect(note).toContainText('Nhịp học mỗi tuần');
    await expect(note).toContainText('Quiz chưa đạt 80% thì chưa sang module mới.');
    expect((await note.locator('.rd-note').innerText()).split('\n')).toHaveLength(7);
    await expect(page.getByTestId('how-hours')).toContainText(ROADMAP_EN.howHours.summary);
    await expectAxeClean(page);
  });

  test('M19-AC1 variants: Q1b → "1 week behind" (warn), cell 1 overdue; 2026-11-10 → "2 weeks behind" (crit); Q1d (10-26) → Not started + before-start card; axe on Q1b', async ({ page }) => {
    await importBackup(page, 'q1-roadmap-backup.json');
    await gotoHash(page, '/roadmaps/rq');
    await expect(page.getByTestId('done-value')).toHaveText('1/21');
    // Q1b through the UI: clear W1's actual end (keeps its start)
    await item(page, 'wq1').getByRole('button', { name: /^Dates & note/ }).click();
    await item(page, 'wq1').getByRole('button', { name: /^Clear actual end of/ }).click();
    const ov = overview(page);
    await expect(ov.getByTestId('done-value')).toHaveText('0/21');
    await expect(ov.getByTestId('pace-chip')).toHaveText('1 week behind');
    await expect(ov.getByTestId('pace-chip')).toHaveClass(/\bwarn\b/);
    await expect(ov.getByTestId('pace-sub')).toHaveText(ROADMAP_EN.pace.subWarn);
    await expect(cells(page).nth(0)).toHaveAttribute('data-state', 'overdue');
    await expect(cells(page).nth(0)).toHaveAccessibleName(/: overdue, not done$/);
    await expect(item(page, 'wq1').getByTestId('item-tags')).toContainText(ROADMAP_EN.tag.overdue);
    await expect(item(page, 'wq1').getByTestId('item-label')).toHaveText(ROADMAP_EN.tag.inProgress);
    await expect(item(page, 'wq1').getByTestId('item-hours')).toHaveText('5.8 h'); // Q1b: 11-03/11-04 go to W1 (explicit window)
    await expect(item(page, 'wq2').getByTestId('item-hours')).toHaveText('0 h');
    await expectAxeClean(page);

    // 2026-11-10, W2 still open → 2 overdue → crit
    await freezeClock(page, new Date('2026-11-10T10:00:00+07:00'));
    await page.reload();
    await expect(ov.getByTestId('pace-chip')).toHaveText('2 weeks behind');
    await expect(ov.getByTestId('pace-chip')).toHaveClass(/\bcrit\b/);
    await expect(ov.getByTestId('pace-sub')).toHaveText(ROADMAP_EN.pace.subCrit);
    await expect(page.locator('[data-testid="strip-cell"][data-state="overdue"]')).toHaveCount(2);

    // Q1d: before the roadmap starts
    await freezeClock(page, new Date('2026-10-26T10:00:00+07:00'));
    await page.reload();
    await expect(ov.getByTestId('pace-chip')).toHaveText(ROADMAP_EN.pace.notStarted);
    await expect(ov.getByTestId('pace-sub')).toHaveText('Starts 2026-10-27');
    await expect(page.getByTestId('this-week')).toHaveAttribute('data-kind', 'notStarted');
    await expect(page.getByTestId('this-week')).toContainText('Starts 2026-10-27. First up: Systems of linear equations: singular vs non-singular, determinant.');
    await expect(ov.getByTestId('milestone-value')).toHaveText('134 days left');
  });

  test('M19-AC3 (vi): tick / untick / Today / future end / note — online, then the same offline', async ({ page, context }) => {
    await importBackup(page, 'q1-roadmap-backup.json');
    await switchToVi(page);
    await gotoHash(page, '/roadmaps/rq');
    await expect(page.getByRole('heading', { level: 1, name: 'QPT 21 tuần' })).toBeVisible();
    await quickActions(page, 'online');
    await page.reload();
    await expect(item(page, 'wq2').getByTestId('item-note')).toHaveText('sai dấu online');
    await expectNoViLeaks(page);

    await cacheForOffline(page);
    await context.setOffline(true);
    await page.reload();
    await expect(page.getByRole('heading', { level: 1, name: 'QPT 21 tuần' })).toBeVisible();
    await quickActions(page, 'offline');
    await page.reload();
    await expect(item(page, 'wq2').getByTestId('item-note')).toHaveText('sai dấu offline');
    await context.setOffline(false);
  });

  test('M19-AC4 (en, Demo M19): create "Spanish B1" → phase + 3 suggested items → reorder with the keyboard → Done 0/3; move across phases; delete phase (dialog counts 2); delete roadmap; validation errors', async ({ page }) => {
    await importBackup(page, 'sample-backup.json');
    await gotoHash(page, '/roadmaps');
    await page.getByTestId('roadmaps-empty').getByRole('link', { name: ROADMAP_EN.list.createBlank }).click();
    await expect(page).toHaveURL(/#\/roadmaps\/new$/);
    const form = page.getByRole('form', { name: ROADMAP_EN.new.srForm });
    // Validation first: empty title + 0.3 h
    await form.getByLabel(/^Weekly study target/).fill('0.3');
    await form.getByRole('button', { name: ROADMAP_EN.ed.create }).click();
    await expect(form.getByRole('alert').first()).toHaveText('Fix 2 fields to save.');
    await expect(form.getByText(ROADMAP_EN.errors.ROADMAP_TITLE_REQUIRED)).toBeVisible();
    await expect(form.getByText(ROADMAP_EN.errors.ROADMAP_TARGET_INVALID)).toBeVisible();
    await expect(form.getByLabel(/^Title/)).toBeFocused();
    // Fill it in properly
    await form.getByLabel(/^Title/).fill('Spanish B1');
    await form.getByLabel(ROADMAP_EN.ed.goalLabel).selectOption({ label: 'Spanish' });
    await form.getByLabel(/^Weekly study target/).fill('5');
    await form.getByLabel(/^Milestone name/).fill('Exam');
    await form.getByLabel(/^Milestone date/).fill('2027-06-01');
    await form.getByRole('button', { name: ROADMAP_EN.ed.create }).click();
    await expect(page).toHaveURL(/#\/roadmaps\/[^/]+\/edit$/);
    await expect(toast(page)).toHaveText(ROADMAP_EN.toast.created);
    await expect(page.getByRole('heading', { level: 1, name: ROADMAP_EN.ed.titleEdit })).toBeFocused();
    const id = /#\/roadmaps\/([^/]+)\/edit$/.exec(page.url())![1];

    await page.getByRole('button', { name: ROADMAP_EN.ed.addPhase }).click();
    await expect(page.getByLabel(/^Phase title/)).toBeFocused();
    await page.getByLabel(/^Phase title/).fill('Grammar');
    await page.getByRole('button', { name: ROADMAP_EN.ed.savePhase }).click();
    await expect(page.getByRole('heading', { level: 3, name: 'Grammar' })).toBeVisible();
    const ranges = [
      ['2026-11-04', '2026-11-10'],
      ['2026-11-11', '2026-11-17'],
      ['2026-11-18', '2026-11-24'],
    ];
    for (const [i, title] of ['Present tenses', 'Past tenses', 'Subjunctive'].entries()) {
      await page.getByRole('button', { name: ROADMAP_EN.ed.addItem }).click();
      const f = page.getByTestId('item-form-add');
      await expect(f.getByLabel(/^Planned start/)).toHaveValue(ranges[i][0]);
      await expect(f.getByLabel(/^Planned end/)).toHaveValue(ranges[i][1]);
      await expect(f.getByText(ROADMAP_EN.ed.itemDatesHint)).toBeVisible();
      await f.getByLabel(/^Item title/).fill(title);
      await f.getByRole('button', { name: ROADMAP_EN.ed.saveItem }).click();
      await expect(editorItems(page)).toHaveCount(i + 1);
    }
    expect(await itemTitles(page)).toEqual(['Present tenses', 'Past tenses', 'Subjunctive']);
    await expect(editorItems(page).nth(0)).toContainText('2026-11-04 – 11-10');
    await expect(editorItems(page).nth(1)).toContainText('2026-11-11 – 11-17');
    await expect(editorItems(page).nth(2)).toContainText('2026-11-18 – 11-24');

    // Item end before start → order error under Planned end
    await page.getByRole('button', { name: 'Edit Subjunctive' }).click();
    const edit = page.getByTestId('item-form-edit');
    await edit.getByLabel(/^Planned end/).fill('2026-11-17');
    await edit.getByRole('button', { name: ROADMAP_EN.ed.saveItem }).click();
    await expect(edit.getByText(ROADMAP_EN.errors.ROADMAP_DATE_INVALID_order)).toBeVisible();
    await expect(edit.getByLabel(/^Planned end/)).toBeFocused();
    await edit.getByRole('button', { name: ROADMAP_EN.ed.cancel }).click();
    await expect(page.getByRole('button', { name: 'Edit Subjunctive' })).toBeFocused();

    // Keyboard reorder: Tab to the up button of item 3, Enter twice; focus follows the item
    const up = page.getByRole('button', { name: 'Move Subjunctive up' });
    await up.focus();
    await page.keyboard.press('Enter');
    await expect.poll(() => itemTitles(page)).toEqual(['Present tenses', 'Subjunctive', 'Past tenses']);
    await expect(up).toBeFocused();
    await expect(page.getByTestId('editor-status')).toHaveText('Subjunctive moved to position 2 of 3');
    await page.keyboard.press('Enter');
    await expect.poll(() => itemTitles(page)).toEqual(['Subjunctive', 'Present tenses', 'Past tenses']);
    await expect(up).toBeFocused();
    await expect(up).toHaveAttribute('aria-disabled', 'true');
    await page.reload();
    await expect.poll(() => itemTitles(page)).toEqual(['Subjunctive', 'Present tenses', 'Past tenses']);

    // Second phase + move "Past tenses" into it through the Phase select
    await page.getByRole('button', { name: ROADMAP_EN.ed.addPhase }).click();
    await page.getByLabel(/^Phase title/).fill('Vocabulary');
    await page.getByRole('button', { name: ROADMAP_EN.ed.savePhase }).click();
    await expect(page.getByRole('heading', { level: 3, name: 'Vocabulary' })).toBeVisible();
    await page.getByRole('button', { name: 'Edit Past tenses' }).click();
    await page.getByTestId('item-form-edit').getByLabel(ROADMAP_EN.ed.itemPhaseLabel).selectOption({ label: 'Vocabulary' });
    await page.getByTestId('item-form-edit').getByRole('button', { name: ROADMAP_EN.ed.saveItem }).click();
    const vocab = page.getByTestId('editor-phase').nth(1);
    await expect(vocab.getByTestId('editor-item')).toHaveCount(1);
    await expect(vocab.getByTestId('editor-item')).toContainText('Past tenses');

    // Delete phase "Grammar" (2 items): the dialog names 2; Cancel keeps; Confirm removes both
    await page.getByRole('button', { name: 'Delete phase Grammar' }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog.getByRole('heading')).toHaveText('Delete phase "Grammar"?');
    await expect(dialog).toContainText("This deletes the phase and its 2 items. This can't be undone.");
    await expect(dialog.getByRole('button', { name: EN.common.cancel })).toBeFocused();
    await dialog.getByRole('button', { name: EN.common.cancel }).click();
    await expect(dialog).toBeHidden();
    await expect(editorItems(page)).toHaveCount(3);
    await page.getByRole('button', { name: 'Delete phase Grammar' }).click();
    await dialog.getByRole('button', { name: ROADMAP_EN.ed.deletePhase }).click();
    await expect(dialog).toBeHidden();
    await expect(editorItems(page)).toHaveCount(1);
    await expect(toast(page)).toHaveText(ROADMAP_EN.toast.phaseDeleted);

    // Done → detail 0/1 (one item left), then delete the roadmap from the editor
    await page.getByTestId('editor-done').click();
    await expect(page).toHaveURL(new RegExp(`#/roadmaps/${id}$`));
    await expect(page.getByTestId('done-value')).toHaveText('0/1');
    await expect(cells(page)).toHaveCount(1);
    await page.getByTestId('detail-edit').click();
    await page.getByRole('button', { name: ROADMAP_EN.ed.deleteRoadmap }).click();
    await expect(dialog.getByRole('heading')).toHaveText('Delete "Spanish B1"?');
    await expect(dialog).toContainText("This deletes the roadmap with its 1 phase, 1 item and 0 checkpoints. Your goal and its entries are not affected. This can't be undone.");
    await dialog.getByRole('button', { name: ROADMAP_EN.ed.deleteRoadmap }).click();
    await expect(page).toHaveURL(/#\/roadmaps$/);
    await expect(toast(page)).toHaveText(ROADMAP_EN.toast.deleted);
    await expect(page.getByTestId('roadmaps-empty')).toBeVisible();
    await expect(page.getByTestId('roadmap-row')).toHaveCount(0);
    await expect(page.getByRole('heading', { level: 1, name: ROADMAP_EN.list.title })).toBeFocused();
  });

  test('M19-AC5 (A-78): the picker of rq lists gq and the free goals, not the archived one nor the goal of another roadmap; G3 → hours from G3; unlink → "—"', async ({ page }) => {
    await importBackup(page, 'q1-roadmap-backup.json');
    // Archive "Guitar" (g2) and create a second roadmap linked to "Read" (g1)
    await gotoHash(page, '/goals');
    await page.getByTestId('goal-row').filter({ hasText: 'Guitar' }).getByRole('button', { name: EN.goals.archive }).click();
    await expect(toast(page)).toHaveText(EN.toast.goalArchived);
    await gotoHash(page, '/roadmaps/new');
    const form = page.getByRole('form', { name: ROADMAP_EN.new.srForm });
    await form.getByLabel(/^Title/).fill('Reading plan');
    const newPicker = form.getByLabel(ROADMAP_EN.ed.goalLabel);
    await expect(newPicker.locator('option')).toHaveCount(5); // No goal + Read, Spanish, Marathon prep, Old course (gq taken, Guitar archived)
    await newPicker.selectOption({ label: 'Read' });
    await form.getByRole('button', { name: ROADMAP_EN.ed.create }).click();
    await expect(page).toHaveURL(/#\/roadmaps\/[^/]+\/edit$/);

    await gotoHash(page, '/roadmaps/rq/edit');
    const picker = page.getByRole('form', { name: ROADMAP_EN.ed.srForm }).getByLabel(ROADMAP_EN.ed.goalLabel);
    await expect(picker).toHaveValue('gq');
    await expect(picker.locator('option')).toHaveText([ROADMAP_EN.ed.goalNone, 'Marathon prep', 'Old course', 'QPT study', 'Spanish']);
    await picker.selectOption({ label: 'Spanish' });
    await page.getByRole('button', { name: ROADMAP_EN.ed.saveDetails }).click();
    await expect(toast(page)).toHaveText(ROADMAP_EN.toast.saved);
    await page.getByTestId('editor-done').click();
    await expect(page.getByTestId('detail-goal')).toHaveText('Goal: Spanish');
    // Spanish's only entry (2026-03-02) lies outside every item: v8.3 the total is still every Spanish minute (1 h, all
    // of it before the roadmap start), 0/480 min this week, W1 0 h.
    await expect(overview(page).getByTestId('hours-value')).toHaveText('1 h');
    await expect(overview(page).getByTestId('hours-outside')).toHaveText("Includes 1 h from before the roadmap's start date.");
    await expect(page.getByTestId('this-week').getByTestId('this-week-minutes')).toHaveText('0/480 min');
    await expect(item(page, 'wq1').getByTestId('item-hours')).toHaveText('0 h');
    // Unlink
    await page.getByTestId('detail-edit').click();
    await expect(picker).toHaveValue('g3');
    await picker.selectOption({ label: ROADMAP_EN.ed.goalNone });
    await page.getByRole('button', { name: ROADMAP_EN.ed.saveDetails }).click();
    await expect(toast(page)).toHaveText(ROADMAP_EN.toast.saved);
    await page.getByTestId('editor-done').click();
    await expect(page.getByTestId('detail-goal')).toHaveText(ROADMAP_EN.detail.goalNone);
    await expect(overview(page).getByTestId('hours-value')).toHaveText('—');
    await expect(overview(page).getByTestId('hours-sub')).toContainText(ROADMAP_EN.overview.hoursNone);
    await expect(item(page, 'wq1').getByTestId('item-hours')).toHaveText('—');
    // "Link a goal" opens the editor with the picker focused
    await overview(page).getByTestId('overview-link-goal').click();
    await expect(page).toHaveURL(/#\/roadmaps\/rq\/edit\?focus=goal$/);
    await expect(picker).toBeFocused();
  });

  test('M19-AC6 (FR-80, vi): Goal detail "Thuộc lộ trình QPT 21 tuần" → link; D2 names the roadmap; after the delete the roadmap shows "Chưa liên kết mục tiêu"', async ({ page }) => {
    await importBackup(page, 'q1-roadmap-backup.json');
    await switchToVi(page);
    await gotoHash(page, '/goals/gq');
    const line = page.getByTestId('goal-roadmap');
    await expect(line).toHaveText('Thuộc lộ trình QPT 21 tuần');
    await line.getByRole('link', { name: 'QPT 21 tuần' }).click();
    await expect(page).toHaveURL(/#\/roadmaps\/rq$/);
    await expect(page.getByRole('heading', { level: 1, name: 'QPT 21 tuần' })).toBeVisible();
    await expectNoViLeaks(page);

    await gotoHash(page, '/goals');
    const row = page.getByTestId('goal-row').filter({ hasText: 'QPT study' });
    await row.getByRole('button', { name: VI.common.delete }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog.getByTestId('confirm-note')).toHaveText('Mục tiêu này thuộc lộ trình "QPT 21 tuần". Lộ trình vẫn được giữ, nhưng sẽ mất liên kết và hiện giờ học là —.');
    await dialog.getByRole('button', { name: VI.goal.delete.confirm }).click();
    await expect(toast(page)).toHaveText(VI.toast.goalDeleted);
    await gotoHash(page, '/roadmaps/rq');
    await expect(page.getByTestId('detail-goal')).toHaveText(ROADMAP_VI.detail.goalNone);
    await expect(overview(page).getByTestId('hours-value')).toHaveText('—');
    // A goal without a roadmap keeps the old dialog (no note paragraph).
    await gotoHash(page, '/goals/g1');
    await expect(page.getByRole('heading', { level: 1, name: 'Read' })).toBeVisible();
    await expect(page.getByTestId('goal-roadmap')).toHaveCount(0);
    await page.getByRole('button', { name: VI.common.delete }).click();
    await expect(dialog).toBeVisible();
    await expect(dialog.getByTestId('confirm-note')).toHaveCount(0);
  });

  test('M19-AC7: vi at 360×740 — detail (Q1, strip, card, open dates), editor with an item form, new form: no horizontal scroll, every control named, scan clean, axe', async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 740 });
    await importBackup(page, 'q1-roadmap-backup.json');
    await switchToVi(page);
    await gotoHash(page, '/roadmaps/rq');
    await expect(page.getByRole('heading', { level: 1, name: 'QPT 21 tuần' })).toBeVisible();
    await expect(page.getByRole('list', { name: ROADMAP_VI.strip.label }).getByRole('listitem')).toHaveCount(21);
    // 7 columns × 3 rows of 44 px cells
    const first = await cells(page).nth(0).boundingBox();
    const eighth = await cells(page).nth(7).boundingBox();
    expect(first!.width).toBeGreaterThanOrEqual(40);
    expect(first!.height).toBeGreaterThanOrEqual(44);
    expect(eighth!.y).toBeGreaterThan(first!.y);
    await item(page, 'wq1').getByRole('button', { name: /^Ngày & ghi chú/ }).click();
    await expect(item(page, 'wq1').getByRole('button', { name: 'Hôm nay: đặt ngày bắt đầu thực tế của Systems of linear equations: singular vs non-singular, determinant' })).toBeVisible();
    await expect(item(page, 'wq1').getByRole('button', { name: /^Xóa ngày kết thúc thực tế của/ })).toBeVisible();
    await expect(page.getByTestId('this-week').getByTestId('this-week-minutes')).toHaveText('75/480 phút');
    await expect(page.getByTestId('this-week').getByTestId('this-week-days')).toHaveText('Còn 5 ngày');
    await expect(item(page, 'wq1').getByTestId('item-label')).toHaveText('Sớm 1 ngày · học 6 ngày');
    await expect(item(page, 'wq2')).toContainText('Kế hoạch 03/11 – 09/11/2026');
    await expectNoHorizontalScroll(page);
    await expectNoViLeaks(page);
    await expectAxeClean(page);

    await gotoHash(page, '/roadmaps/rq/edit');
    await expect(page.getByRole('heading', { level: 1, name: ROADMAP_VI.ed.titleEdit })).toBeVisible();
    await page.getByRole('button', { name: 'Sửa Solving systems: elimination, row echelon form, rank' }).click();
    await expect(page.getByTestId('item-form-edit')).toBeVisible();
    await expectNoHorizontalScroll(page);
    await expectNoViLeaks(page);
    await expectAxeClean(page);

    await gotoHash(page, '/roadmaps/new');
    await expect(page.getByRole('heading', { level: 1, name: ROADMAP_VI.new.title })).toBeVisible();
    await expect(page.getByRole('form', { name: ROADMAP_VI.new.srForm })).toBeVisible();
    await expectNoHorizontalScroll(page);
    await expectNoViLeaks(page);
    await expectAxeClean(page);

    // Desktop width too: the two-column detail layout
    await page.setViewportSize({ width: 1440, height: 900 });
    await gotoHash(page, '/roadmaps/rq');
    await expect(page.getByTestId('done-value')).toHaveText('1/21');
    await expectNoHorizontalScroll(page);
    await expectAxeClean(page);
  });

  test('M19-D1 (regression): a 40-char milestone label without spaces wraps — no horizontal scroll at 360 px on the list and the detail (en + vi)', async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 740 });
    const backup = JSON.parse(readFileSync(fixturePath('q1-roadmap-backup.json'), 'utf8')) as { roadmaps: Array<{ milestoneLabel: string }> };
    const label = 'M'.repeat(40);
    backup.roadmaps[0]!.milestoneLabel = label;
    await gotoHash(page, '/settings');
    await page.getByTestId('import-file').setInputFiles({ name: 'long-label.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(backup)) });
    await page.getByRole('dialog').getByRole('button', { name: EN.import.confirm }).click();
    await expect(toast(page)).toContainText('Backup imported');
    for (const lang of ['en', 'vi'] as const) {
      if (lang === 'vi') await switchToVi(page);
      await gotoHash(page, '/roadmaps');
      await expect(page.getByTestId('roadmap-milestone')).toContainText(label);
      await expectNoHorizontalScroll(page);
      await gotoHash(page, '/roadmaps/rq');
      await expect(page.getByTestId('metric-milestone').locator('.eyebrow')).toHaveText(label);
      await expectNoHorizontalScroll(page);
      // the label wraps inside its own cell instead of overflowing it
      const cell = await page.getByTestId('metric-milestone').evaluate((el) => ({ cell: el.getBoundingClientRect().width, eyebrow: (el.querySelector('.eyebrow') as HTMLElement).scrollWidth }));
      expect(cell.eyebrow).toBeLessThanOrEqual(Math.ceil(cell.cell));
    }
  });

  test('M19-AC8: the roadmap screens are one lazy chunk (`Roadmaps-*.js`, vite.config.ts) requested on the first roadmap route only; nothing roadmap-related on the cold load', async ({ page }) => {
    const requested: string[] = [];
    page.on('request', (r) => requested.push(r.url()));
    await gotoHash(page, '/today');
    await expect(page.getByRole('heading', { level: 1, name: EN.today.title })).toBeVisible();
    expect(requested.filter((u) => /Roadmap|roadmap/.test(u))).toEqual([]);
    await chooseBackupFile(page, 'q1-roadmap-backup.json');
    await page.getByRole('dialog').getByRole('button', { name: EN.import.confirm }).click();
    await expect(toast(page)).toContainText('Backup imported');
    expect(requested.filter((u) => /\/assets\/Roadmaps-.*\.js$/.test(u))).toEqual([]);
    await gotoHash(page, '/roadmaps/rq');
    await expect(page.getByTestId('done-value')).toHaveText('1/21');
    const chunk = requested.filter((u) => /\/assets\/Roadmaps-.*\.js$/.test(u));
    expect(chunk, requested.join('\n')).toHaveLength(1);
    const before = requested.length;
    await page.getByTestId('detail-edit').click();
    await expect(page.getByRole('heading', { level: 1, name: ROADMAP_EN.ed.titleEdit })).toBeVisible();
    // The editor came from the same chunk: no further JS request.
    expect(requested.slice(before).filter((u) => /\.js$/.test(u))).toEqual([]);
  });
});

export type { Locator };
