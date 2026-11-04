// M20 — QPT 21-week template, checkpoints, the final Q1 journey (TASKS M20-AC2 … AC4, AC6; Demo M20; "today" =
// 2026-11-04 10:00 +07:00). chromium project, en + vi, 1280×720 (default), 360×740 and 1440×900. Data: Q1 without
// a roadmap (e2e/fixtures/q1-goal-only-backup.json) through the real import UI; the roadmap comes from the template.
import { readFile } from 'node:fs/promises';
import { expect, test, type Page } from '@playwright/test';
import { EN, expectAxeClean, expectNoHorizontalScroll, expectNoViLeaks, FIXED_TIME_Q1, freezeClock, gotoHash, importBackup, ROADMAP_EN, ROADMAP_VI, toast, VI } from './helpers/app';

const items = (page: Page) => page.getByTestId('roadmap-item');
const cpRow = (page: Page, title: string) => page.getByTestId('cp-row').filter({ has: page.locator('.cp-n', { hasText: new RegExp(`^${title}$`) }) });
const ov = (page: Page) => page.getByTestId('overview');
const dialog = (page: Page) => page.getByTestId('template-dialog');

async function switchTo(page: Page, lang: 'vi' | 'en'): Promise<void> {
  await gotoHash(page, '/settings');
  const copy = lang === 'vi' ? EN : VI;
  await page.getByRole('radio', { name: copy.settings.language.option[lang] }).check();
  await expect(page.locator('html')).toHaveAttribute('lang', lang);
}

/** Type a score in the table and leave the field (saved on blur). */
async function score(page: Page, title: string, value: string): Promise<void> {
  const input = cpRow(page, title).getByTestId('cp-score');
  await input.fill(value);
  await input.blur();
}

/** The Q1 numbers of the detail (ARCH §4.8 d) after W1 10-27 → 11-01 and Diagnostic 24/09/2026 = 5, in vi. */
async function expectQ1Vi(page: Page): Promise<void> {
  await expect(ov(page).getByTestId('done-value')).toHaveText('1/21');
  await expect(ov(page).getByTestId('hours-value')).toHaveText('5,8 giờ');
  await expect(ov(page).getByTestId('hours-sub')).toHaveText('Kế hoạch đến hết tuần này: 16 giờ');
  await expect(ov(page).getByTestId('pace-chip')).toHaveText(ROADMAP_VI.pace.onTrack);
  await expect(ov(page).getByTestId('milestone-value')).toContainText('125');
  await expect(items(page).nth(0).getByTestId('item-label')).toHaveText('Sớm 1 ngày · học 6 ngày');
  await expect(items(page).nth(0).getByTestId('item-hours')).toHaveText('4,5 giờ');
  await expect(page.getByTestId('this-week-minutes')).toHaveText('75/480 phút');
  await expect(page.getByTestId('this-week-days')).toHaveText('Còn 5 ngày');
  await expect(cpRow(page, 'Diagnostic').getByTestId('cp-score')).toHaveValue('5');
  await expect(cpRow(page, 'Diagnostic').getByTestId('cp-when')).toHaveText('24/09/2026');
  await expect(cpRow(page, 'Diagnostic').getByTestId('cp-state')).toHaveText(ROADMAP_VI.cp.state.recorded);
}

test.describe('M20 Big goals — QPT template, checkpoints, the Q1 journey', () => {
  test.beforeEach(async ({ page }) => {
    await freezeClock(page, FIXED_TIME_Q1);
  });

  test('Demo M20 + M20-AC2/AC3/AC4 (vi): empty → template 27/10/2026 + QPT study → 0/21, W20 09/03 – 15/03/2027, 125 days, 16 h; W1 + Diagnostic → every Q1 number; quick scores; export → import v2 → same; untick/tick W1 → same', async ({ page }) => {
    test.setTimeout(90_000);
    await importBackup(page, 'q1-goal-only-backup.json');
    await switchTo(page, 'vi');
    await gotoHash(page, '/roadmaps');
    const empty = page.getByTestId('roadmaps-empty');
    await expect(empty).toBeVisible();
    await empty.getByRole('button', { name: ROADMAP_VI.list.createTemplate }).click();
    const d = dialog(page);
    await expect(d.getByRole('heading', { level: 2, name: ROADMAP_VI.tpl.title })).toBeVisible();
    const start = d.getByLabel(/^Ngày bắt đầu/);
    await expect(start).toBeFocused();
    await expect(start).toHaveValue('2026-11-04');
    await expect(d).toContainText('Tuần 1: 04/11/2026. Tuần 20 (thi QPT): 17/03/2027. Tuần cuối kết thúc ngày 30/03/2027.');
    await start.fill('2026-10-27');
    await expect(d).toContainText('Tuần 1: 27/10/2026. Tuần 20 (thi QPT): 09/03/2027. Tuần cuối kết thúc ngày 22/03/2027.');
    await d.getByLabel(ROADMAP_VI.ed.goalLabel).selectOption({ label: 'QPT study' });
    await expect(d).toContainText('Tạo bằng Tiếng Việt.');
    await expectNoViLeaks(page);
    await d.getByRole('button', { name: ROADMAP_VI.ed.create }).click();
    await page.waitForURL(/#\/roadmaps\/[^/]+$/);
    await expect(toast(page)).toHaveText(ROADMAP_VI.toast.templateCreated);
    await expect(page.getByRole('heading', { level: 1, name: 'QPT 21 tuần' })).toBeFocused();
    // M20-AC2: the fresh roadmap
    await expect(ov(page).getByTestId('done-value')).toHaveText('0/21');
    await expect(page.getByTestId('phase')).toHaveCount(5);
    await expect(items(page)).toHaveCount(21);
    await expect(items(page).nth(19)).toContainText('Thi QPT chính thức');
    await expect(items(page).nth(19)).toContainText('09/03 – 15/03/2027');
    await expect(ov(page).getByTestId('milestone-value')).toContainText('125');
    await expect(ov(page).getByTestId('hours-sub')).toHaveText('Kế hoạch đến hết tuần này: 16 giờ');
    await expect(page.getByTestId('cp-row')).toHaveCount(5);
    await expect(page.getByTestId('roadmap-note')).toContainText('Nhịp học mỗi tuần');
    const roadmapId = page.url().split('/roadmaps/')[1]!;

    // M20-AC4: W1 actual start 27/10, end 01/11
    await items(page).nth(0).getByRole('button', { name: /^Ngày & ghi chú/ }).click();
    await items(page).nth(0).getByLabel(ROADMAP_VI.item.actualStart, { exact: true }).fill('2026-10-27');
    await items(page).nth(0).getByLabel(ROADMAP_VI.item.actualEnd, { exact: true }).fill('2026-11-01');
    await expect(items(page).nth(0).getByTestId('item-label')).toHaveText('Sớm 1 ngày · học 6 ngày');
    // Diagnostic dated 24/09/2026 in the editor, score 5 in the table
    await page.getByTestId('detail-edit').click();
    await page.getByRole('button', { name: 'Sửa Diagnostic' }).click();
    await page.getByTestId('cp-form-edit').getByLabel(/^Ngày/).fill('2026-09-24');
    await page.getByTestId('cp-form-edit').getByRole('button', { name: ROADMAP_VI.ed.saveCp }).click();
    await expect(page.getByTestId('cp-form-edit')).toHaveCount(0);
    await page.getByTestId('editor-done').click();
    await score(page, 'Diagnostic', '5');
    await expectQ1Vi(page);

    // M20-AC3 quick scores: CP2 18 → below −2 (survives reload), 21 → passed; Mock 1 7,5; Mock 2 33 → range; cleared → pending
    await score(page, 'Checkpoint 2', '18');
    await expect(cpRow(page, 'Checkpoint 2').getByTestId('cp-state')).toHaveText(`${ROADMAP_VI.cp.state.below}−2`);
    await page.reload();
    await expect(cpRow(page, 'Checkpoint 2').getByTestId('cp-state')).toHaveText(`${ROADMAP_VI.cp.state.below}−2`);
    await expect(cpRow(page, 'Checkpoint 2').getByTestId('cp-score')).toHaveValue('18');
    await score(page, 'Checkpoint 2', '21');
    await expect(cpRow(page, 'Checkpoint 2').getByTestId('cp-state')).toHaveText(`${ROADMAP_VI.cp.state.pass}+1`);
    await score(page, 'Mock 1', '7,5');
    await expect(cpRow(page, 'Mock 1').getByTestId('cp-state')).toHaveText(`${ROADMAP_VI.cp.state.below}−16,5`);
    await score(page, 'Mock 2', '33');
    await expect(cpRow(page, 'Mock 2').getByRole('alert')).toHaveText(ROADMAP_VI.errors.ROADMAP_SCORE_INVALID_range);
    await expect(cpRow(page, 'Mock 2').getByTestId('cp-score')).toHaveAttribute('aria-invalid', 'true');
    await score(page, 'Mock 2', '');
    await expect(cpRow(page, 'Mock 2').getByRole('alert')).toHaveCount(0);
    await expect(cpRow(page, 'Mock 2').getByTestId('cp-state')).toHaveText(ROADMAP_VI.cp.state.pending);
    // chart: 5 positions in date order, Diagnostic 5/32 high, threshold ticks on CP2 / Mock 1 / Mock 2, SR summary
    const chart = page.getByTestId('cp-chart');
    await expect(chart).toHaveAttribute('data-scale', 'raw');
    await expect(chart.getByTestId('cp-col')).toHaveCount(5);
    expect(Number(await chart.getByTestId('cp-col').nth(0).locator('rect').getAttribute('data-height'))).toBeCloseTo(5 / 32, 3);
    for (const [i, n] of [0, 0, 1, 1, 1].entries()) await expect(chart.getByTestId('cp-col').nth(i).getByTestId('cp-threshold-line')).toHaveCount(n);
    await expect(chart.getByRole('img')).toHaveAttribute(
      'aria-label',
      '5 điểm kiểm tra, theo thứ tự ngày. Diagnostic: 5 trên 32, không có ngưỡng; Checkpoint 1: chưa có điểm; Checkpoint 2: 21 trên 32, ngưỡng 20, đạt; Mock 1: 7,5 trên 32, ngưỡng 24, dưới ngưỡng; Mock 2: chưa có điểm',
    );
    await expectNoViLeaks(page);

    // Export (v2) → Import the same file → the same numbers
    await gotoHash(page, '/settings');
    const downloadPromise = page.waitForEvent('download');
    await page.getByRole('button', { name: VI.settings.backup.export }).click();
    const download = await downloadPromise;
    const text = await readFile((await download.path())!, 'utf8');
    const file = JSON.parse(text) as { schemaVersion: number; roadmaps: Array<{ id: string; goalId: string }>; roadmapItems: unknown[]; roadmapCheckpoints: Array<{ title: string; score: number | null; date: string }> };
    expect(file.schemaVersion).toBe(2);
    expect(file.roadmaps).toHaveLength(1);
    expect(file.roadmaps[0]).toMatchObject({ id: roadmapId, goalId: 'gq' });
    expect(file.roadmapItems).toHaveLength(21);
    expect(file.roadmapCheckpoints.map((c) => [c.title, c.date, c.score])).toEqual(
      expect.arrayContaining([
        ['Diagnostic', '2026-09-24', 5],
        ['Checkpoint 2', '2027-02-15', 21],
        ['Mock 1', '2027-03-01', 7.5],
        ['Mock 2', '2027-03-08', null],
      ]),
    );
    await page.getByTestId('import-file').setInputFiles({ name: 'export.json', mimeType: 'application/json', buffer: Buffer.from(text) });
    const d3 = page.getByRole('dialog');
    await expect(d3.getByTestId('confirm-note')).toContainText('Mục tiêu lớn: 1 trong bản sao lưu, hiện có 1 trên thiết bị này.');
    await d3.getByRole('button', { name: VI.import.confirm }).click();
    await expect(d3).toBeHidden();
    await gotoHash(page, `/roadmaps/${roadmapId}`);
    await expectQ1Vi(page);
    await expect(cpRow(page, 'Checkpoint 2').getByTestId('cp-score')).toHaveValue('21');
    await expect(cpRow(page, 'Mock 1').getByTestId('cp-score')).toHaveValue('7,5');

    // Untick W1, then tick it again with the end 01/11 → as before
    await items(page).nth(0).getByRole('checkbox').click();
    await expect(ov(page).getByTestId('done-value')).toHaveText('0/21');
    await expect(items(page).nth(0).getByTestId('item-label')).toHaveText(ROADMAP_VI.tag.inProgress);
    await items(page).nth(0).getByRole('button', { name: /^Ngày & ghi chú/ }).click();
    await items(page).nth(0).getByLabel(ROADMAP_VI.item.actualEnd, { exact: true }).fill('2026-11-01');
    await expectQ1Vi(page);
  });

  test('M20-AC2 (en → vi, A-86): from #/roadmaps/new without a goal → "QPT 21 weeks", hours "—"; switching to vi keeps the content; from the list header in vi → "QPT 21 tuần"; the two roadmaps live side by side', async ({ page }) => {
    await importBackup(page, 'q1-goal-only-backup.json');
    await gotoHash(page, '/roadmaps/new');
    const banner = page.getByTestId('new-template-banner');
    await expect(banner).toContainText(ROADMAP_EN.new.templateHint);
    await banner.getByRole('button', { name: ROADMAP_EN.list.createTemplate }).click();
    await dialog(page).getByLabel(/^Start date/).fill('2026-10-27');
    await expect(dialog(page)).toContainText("Created in English. Changing the app language later won't translate it.");
    await dialog(page).getByRole('button', { name: ROADMAP_EN.ed.create }).click();
    await page.waitForURL(/#\/roadmaps\/[^/]+$/);
    await expect(toast(page)).toHaveText(ROADMAP_EN.toast.templateCreated);
    await expect(page.getByRole('heading', { level: 1, name: 'QPT 21 weeks' })).toBeVisible();
    await expect(ov(page).getByTestId('hours-value')).toHaveText('—');
    await expect(page.getByTestId('detail-goal')).toHaveText(ROADMAP_EN.detail.goalNone);
    await expect(items(page).nth(19)).toContainText('Official QPT exam');
    await expect(items(page).nth(19)).toContainText('2027-03-09 – 03-15');
    await expect(page.getByTestId('roadmap-note')).toContainText('Weekly rhythm');
    const enUrl = page.url();

    await switchTo(page, 'vi');
    await page.goto(enUrl);
    await expect(page.getByRole('heading', { level: 1, name: 'QPT 21 weeks' })).toBeVisible();
    await expect(items(page).nth(19)).toContainText('Official QPT exam');
    await expect(page.getByTestId('phase').nth(4)).toContainText('Phase 5 · Close the gaps & sit the QPT');
    await expect(cpRow(page, 'Checkpoint 1').getByTestId('cp-note')).toHaveText('≥ 3/4 per area: LA, Calc');

    await gotoHash(page, '/roadmaps');
    await page.getByTestId('roadmap-create-template').click();
    await dialog(page).getByLabel(ROADMAP_VI.ed.goalLabel).selectOption({ label: 'QPT study' });
    await dialog(page).getByRole('button', { name: ROADMAP_VI.ed.create }).click();
    await page.waitForURL(/#\/roadmaps\/[^/]+$/);
    await expect(page.getByRole('heading', { level: 1, name: 'QPT 21 tuần' })).toBeVisible();
    // default start = today 04/11/2026 → W20 17/03 – 23/03/2027, 133 days
    await expect(items(page).nth(19)).toContainText('17/03 – 23/03/2027');
    await expect(ov(page).getByTestId('milestone-value')).toContainText('133');
    await gotoHash(page, '/roadmaps');
    // (the frozen clock gives both the same createdAt, so the list order falls back to the random ids)
    await expect(page.getByTestId('roadmap-row').getByRole('heading', { level: 2 })).toHaveCount(2);
    expect((await page.getByTestId('roadmap-row').getByRole('heading', { level: 2 }).allTextContents()).sort()).toEqual(['QPT 21 tuần', 'QPT 21 weeks']);
  });

  test('M20-AC3 editor (vi): add "Mock 3" 12/03/2027 max 32 threshold 28 → date order; CP2 at 18, max → 10 → range, not saved; delete via D11; a checkpoint with max 100 → percent axis', async ({ page }) => {
    await importBackup(page, 'q1-roadmap-backup.json');
    await switchTo(page, 'vi');
    await gotoHash(page, '/roadmaps/rq');
    await score(page, 'Checkpoint 2', '18');
    await expect(cpRow(page, 'Checkpoint 2').getByTestId('cp-delta')).toHaveText('−2');
    await page.getByTestId('detail-edit').click();
    const section = page.getByTestId('editor-checkpoints');
    await section.getByRole('button', { name: ROADMAP_VI.ed.addCp }).click();
    const add = page.getByTestId('cp-form-add');
    await add.getByLabel(/^Tên/).fill('Mock 3');
    await add.getByLabel(/^Ngày/).fill('2027-03-12');
    await add.getByLabel(/^Điểm tối đa/).fill('32');
    await add.getByLabel(/^Ngưỡng đạt/).fill('28');
    await add.getByRole('button', { name: ROADMAP_VI.ed.saveCp }).click();
    await expect(add).toHaveCount(0);
    await expect(section.getByTestId('editor-checkpoint').locator('b')).toHaveText(['Diagnostic', 'Checkpoint 1', 'Checkpoint 2', 'Mock 1', 'Mock 2', 'Mock 3']);
    await expect(section.getByTestId('editor-checkpoint').nth(5)).toContainText('12/03/2027 · tối đa 32 · ngưỡng 28');

    await section.getByRole('button', { name: 'Sửa Checkpoint 2' }).click();
    const edit = page.getByTestId('cp-form-edit');
    await edit.getByLabel(/^Điểm tối đa/).fill('10');
    await edit.getByRole('button', { name: ROADMAP_VI.ed.saveCp }).click();
    await expect(edit.getByLabel(/^Điểm \(không bắt buộc\)/)).toHaveAttribute('aria-invalid', 'true');
    await expect(edit).toContainText(ROADMAP_VI.errors.ROADMAP_SCORE_INVALID_range);
    await edit.getByRole('button', { name: ROADMAP_VI.ed.cancel }).click();
    await expect(section.getByTestId('editor-checkpoint').nth(2)).toContainText('15/02/2027 · tối đa 32 · ngưỡng 20');

    await section.getByRole('button', { name: 'Xóa Mock 3' }).click();
    const d11 = page.getByRole('dialog');
    await expect(d11.getByRole('heading', { name: 'Xóa "Mock 3"?' })).toBeVisible();
    await expect(d11.getByRole('button', { name: VI.common.cancel })).toBeFocused();
    await d11.getByRole('button', { name: ROADMAP_VI.ed.deleteCpConfirm }).click();
    await expect(toast(page)).toHaveText(ROADMAP_VI.toast.checkpointDeleted);
    await expect(section.getByTestId('editor-checkpoint')).toHaveCount(5);
    await expect(section.getByRole('button', { name: ROADMAP_VI.ed.addCp })).toBeFocused();

    // max 100 → the chart switches to a percent axis
    await section.getByRole('button', { name: ROADMAP_VI.ed.addCp }).click();
    await add.getByLabel(/^Tên/).fill('IELTS mock');
    await add.getByLabel(/^Ngày/).fill('2027-03-20');
    await add.getByLabel(/^Điểm tối đa/).fill('100');
    await add.getByLabel(/^Điểm \(không bắt buộc\)/).fill('75');
    await add.getByRole('button', { name: ROADMAP_VI.ed.saveCp }).click();
    await expect(add).toHaveCount(0);
    await page.getByTestId('editor-done').click();
    const chart = page.getByTestId('cp-chart');
    await expect(chart).toHaveAttribute('data-scale', 'percent');
    await expect(chart.getByTestId('cp-scale-note')).toHaveText(ROADMAP_VI.cp.scalePercent);
    await expect(chart.getByTestId('cp-col')).toHaveCount(6);
    expect(Number(await chart.getByTestId('cp-col').nth(5).locator('rect').getAttribute('data-height'))).toBeCloseTo(0.75, 3);
    await expect(cpRow(page, 'IELTS mock').getByTestId('cp-when')).toHaveText('W21');
    await expectNoViLeaks(page);
  });

  test('M20-AC6: vi at 360×740 — D7 (bottom sheet) and the checkpoint table / chart / editor form: no horizontal scroll, scan clean, axe; 1440 detail; no Recharts chunk on the roadmap screens', async ({ page }) => {
    const requested: string[] = [];
    page.on('request', (r) => requested.push(r.url()));
    await page.setViewportSize({ width: 360, height: 740 });
    await importBackup(page, 'q1-goal-only-backup.json');
    await switchTo(page, 'vi');
    await gotoHash(page, '/roadmaps');
    await page.getByTestId('roadmaps-empty').getByRole('button', { name: ROADMAP_VI.list.createTemplate }).click();
    const d = dialog(page);
    await expect(d).toBeVisible();
    // bottom sheet: full width, glued to the bottom, the button row inside the viewport
    const box = (await d.boundingBox())!;
    expect(Math.round(box.width)).toBe(360);
    expect(Math.round(box.y + box.height)).toBe(740);
    await expect(d.getByRole('button', { name: ROADMAP_VI.ed.create })).toBeInViewport();
    await expectNoHorizontalScroll(page);
    await expectNoViLeaks(page);
    await expectAxeClean(page);
    await d.getByLabel(/^Ngày bắt đầu/).fill('2026-10-27');
    await d.getByLabel(ROADMAP_VI.ed.goalLabel).selectOption({ label: 'QPT study' });
    await d.getByRole('button', { name: ROADMAP_VI.ed.create }).click();
    await page.waitForURL(/#\/roadmaps\/[^/]+$/);
    await score(page, 'Diagnostic', '5');
    await score(page, 'Checkpoint 2', '18');
    await score(page, 'Mock 2', '33');
    await expect(cpRow(page, 'Mock 2').getByRole('alert')).toBeVisible();
    await page.getByTestId('checkpoints').scrollIntoViewIfNeeded();
    await expectNoHorizontalScroll(page);
    await expectNoViLeaks(page);
    await expectAxeClean(page);
    // every score input is named after its checkpoint
    for (const title of ['Diagnostic', 'Checkpoint 1', 'Checkpoint 2', 'Mock 1', 'Mock 2']) await expect(cpRow(page, title).getByRole('textbox', { name: `Điểm của ${title} (trên 32)` })).toBeVisible();
    await page.getByTestId('detail-edit').click();
    await page.getByTestId('editor-checkpoints').getByRole('button', { name: ROADMAP_VI.ed.addCp }).click();
    await expect(page.getByTestId('cp-form-add')).toBeVisible();
    await expectNoHorizontalScroll(page);
    await expectNoViLeaks(page);
    await expectAxeClean(page);
    // banner of #/roadmaps/new at 360
    await gotoHash(page, '/roadmaps/new');
    await expect(page.getByTestId('new-template-banner')).toBeVisible();
    await expectNoHorizontalScroll(page);
    await expectNoViLeaks(page);

    await page.setViewportSize({ width: 1440, height: 900 });
    await gotoHash(page, '/roadmaps');
    // the whole row is the link at this width too (click the right half: bar + numbers)
    const row = page.getByTestId('roadmap-row').first();
    const rb = (await row.boundingBox())!;
    await page.mouse.click(rb.x + rb.width * 0.85, rb.y + rb.height / 2);
    await expect(page.getByTestId('cp-chart')).toBeVisible();
    await expectNoHorizontalScroll(page);
    await expectAxeClean(page);
    await gotoHash(page, '/roadmaps');
    await page.getByTestId('roadmap-create-template').click();
    await expect(dialog(page)).toBeVisible();
    expect(Math.round((await dialog(page).boundingBox())!.width)).toBe(480);
    await expectAxeClean(page);
    expect(requested.filter((u) => /\/assets\/(Review|BarChart|CurveChart|useRechartsWidth)-/.test(u)), requested.join('\n')).toEqual([]);
  });
});
