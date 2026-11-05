// QC round 1 (M20): independent acceptance + exploratory checks. chromium project, clock 2026-11-04T10:00+07:00.
// Q1 data comes from the real import UI (q1-goal-only-backup.json: S1 + goal gq + 6 entries, no roadmap).
import { readFileSync } from 'node:fs';
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { EN, expectAxeClean, expectNoHorizontalScroll, expectNoViLeaks, fixturePath, FIXED_TIME_Q1, freezeClock, gotoHash, importBackup, ROADMAP_EN, ROADMAP_VI, toast, VI } from '../../e2e/helpers/app';

const items = (page: Page) => page.getByTestId('roadmap-item');
const ov = (page: Page) => page.getByTestId('overview');
const cpRow = (page: Page, title: string) => page.getByTestId('cp-row').filter({ has: page.locator('.cp-n', { hasText: new RegExp(`^${title}$`) }) });
const dlg = (page: Page) => page.getByTestId('template-dialog');

async function setLang(page: Page, lang: 'vi' | 'en') {
  await gotoHash(page, '/settings');
  await page.getByRole('radio', { name: (lang === 'vi' ? EN : VI).settings.language.option[lang] }).check();
  await expect(page.locator('html')).toHaveAttribute('lang', lang);
}
async function score(page: Page, title: string, value: string) {
  const input = cpRow(page, title).getByTestId('cp-score');
  await input.fill(value);
  await input.blur();
}
/** Open the dialog from the empty state or the list header, fill, create; returns once on the detail route. */
async function createFromTemplate(page: Page, opts: { start?: string; goal?: string; copy?: typeof ROADMAP_EN }) {
  const c = opts.copy ?? ROADMAP_EN;
  await gotoHash(page, '/roadmaps');
  const btn = page.getByRole('button', { name: c.list.createTemplate });
  await btn.first().click();
  const d = dlg(page);
  if (opts.start) await d.locator('input[type="date"]').fill(opts.start);
  if (opts.goal) await d.getByLabel(c.ed.goalLabel).selectOption({ label: opts.goal });
  await d.getByRole('button', { name: c.ed.create }).click();
  await page.waitForURL(/#\/roadmaps\/[^/]+$/);
}
type Backup = Record<string, Array<Record<string, unknown>>>;
async function importMutated(page: Page, mutate: (d: Backup) => void, fixture = 'q1-roadmap-backup.json') {
  const d = JSON.parse(readFileSync(fixturePath(fixture), 'utf8'));
  mutate(d);
  await gotoHash(page, '/settings');
  await page.getByTestId('import-file').setInputFiles({ name: 'x.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(d)) });
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: EN.import.confirm }).click();
  await expect(dialog).toBeHidden();
}

test.describe('M20 QC r1', () => {
  test.beforeEach(async ({ page }) => {
    await freezeClock(page, FIXED_TIME_Q1);
  });

  test('M19-D1 + whole-row click: 40 unbroken chars at 360 px (list + detail), right half of a row at 1024/1440', async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 740 });
    await importBackup(page, 'q1-roadmap-backup.json');
    await importMutated(page, (d) => {
      d.roadmaps[0]!.milestoneLabel = 'M'.repeat(40);
      d.roadmaps[0]!.title = 'T'.repeat(80);
    });
    for (const lang of ['en', 'vi'] as const) {
      await setLang(page, lang);
      for (const h of ['/roadmaps', '/roadmaps/rq']) {
        await gotoHash(page, h);
        await page.waitForLoadState('networkidle');
        await expectNoHorizontalScroll(page);
      }
    }
    for (const w of [1024, 1440]) {
      await page.setViewportSize({ width: w, height: 900 });
      await gotoHash(page, '/roadmaps');
      for (const frac of [0.03, 0.5, 0.97]) {
        await gotoHash(page, '/roadmaps');
        const row = page.getByTestId('roadmap-row').first();
        await row.waitFor();
        await page.waitForLoadState('networkidle');
        const b = (await row.boundingBox())!;
        await page.mouse.click(b.x + b.width * frac, b.y + b.height / 2);
        await expect(page.getByTestId('overview'), `row click at ${frac} of ${w}px`).toBeVisible();
      }
    }
  });

  test('AC2+AC3+AC4 (vi) independent: empty -> template (27/10, gq) -> W1 -> Diagnostic -> Q1 numbers; scores; chart; export -> re-import', async ({ page }) => {
    test.setTimeout(120_000);
    await importBackup(page, 'q1-goal-only-backup.json');
    await setLang(page, 'vi');
    await gotoHash(page, '/roadmaps');
    await expect(page.getByTestId('roadmaps-empty')).toBeVisible();
    await expect(page.getByRole('button')).toHaveCount(1);
    await expect(page.getByRole('link', { name: ROADMAP_VI.list.createBlank })).toBeVisible();
    await page.getByRole('button', { name: 'Tạo từ mẫu QPT 21 tuần' }).click();
    const d = dlg(page);
    await expect(d.locator('input[type="date"]')).toHaveValue('2026-11-04');
    await d.locator('input[type="date"]').fill('2026-10-27');
    await d.getByLabel(ROADMAP_VI.ed.goalLabel).selectOption({ label: 'QPT study' });
    await d.getByRole('button', { name: 'Tạo lộ trình' }).click();
    await page.waitForURL(/#\/roadmaps\/[^/]+$/);
    const id = page.url().split('/roadmaps/')[1]!;
    await expect(ov(page).getByTestId('done-value')).toHaveText('0/21');
    await expect(page.getByTestId('phase')).toHaveCount(5);
    await expect(items(page).nth(19)).toContainText('Thi QPT chính thức');
    await expect(items(page).nth(19)).toContainText('09/03 – 15/03/2027');
    await expect(ov(page).getByTestId('milestone-value')).toContainText('125');
    await expect(ov(page).getByTestId('hours-sub')).toContainText('16 giờ');
    // 5 checkpoint rows, by date, Diagnostic shows W1 inside range at creation (27/10)
    await expect(page.getByTestId('cp-row').locator('.cp-n')).toHaveText(['Diagnostic', 'Checkpoint 1', 'Checkpoint 2', 'Mock 1', 'Mock 2']);
    await expect(cpRow(page, 'Checkpoint 1').getByTestId('cp-when')).toHaveText('W8');
    await expect(cpRow(page, 'Checkpoint 2').getByTestId('cp-threshold')).toContainText('≥ 20');
    // W1 actual dates
    const w1 = items(page).nth(0);
    await w1.getByRole('button', { name: /^Ngày & ghi chú/ }).click();
    await w1.getByLabel(ROADMAP_VI.item.actualStart, { exact: true }).fill('2026-10-27');
    await w1.getByLabel(ROADMAP_VI.item.actualEnd, { exact: true }).fill('2026-11-01');
    // Diagnostic date 24/09 through the editor
    await page.getByTestId('detail-edit').click();
    await page.getByRole('button', { name: 'Sửa Diagnostic' }).click();
    await page.getByTestId('cp-form-edit').getByLabel(/^Ngày/).fill('2026-09-24');
    await page.getByTestId('cp-form-edit').getByRole('button', { name: ROADMAP_VI.ed.saveCp }).click();
    await page.getByTestId('editor-done').click();
    await expect(cpRow(page, 'Diagnostic').getByTestId('cp-when')).toHaveText('24/09/2026');
    await score(page, 'Diagnostic', '5');
    const numbers = async () => ({
      done: await ov(page).getByTestId('done-value').textContent(),
      hours: await ov(page).getByTestId('hours-value').textContent(),
      plan: await ov(page).getByTestId('hours-sub').textContent(),
      pace: await ov(page).getByTestId('pace-chip').textContent(),
      days: (await ov(page).getByTestId('milestone-value').textContent())?.replace(/\D+/g, ''),
      w1: await items(page).nth(0).getByTestId('item-label').textContent(),
      week: await page.getByTestId('this-week-minutes').textContent(),
      left: await page.getByTestId('this-week-days').textContent(),
      diag: await cpRow(page, 'Diagnostic').getByTestId('cp-score').inputValue(),
    });
    const q1 = { done: '1/21', hours: '6,6 giờ', plan: 'Kế hoạch đến hết tuần này: 16 giờ', pace: ROADMAP_VI.pace.onTrack, days: '125', w1: 'Sớm 1 ngày · học 6 ngày', week: '75/480 phút', left: 'Còn 5 ngày', diag: '5' };
    expect(await numbers()).toEqual(q1);
    // scores
    await score(page, 'Checkpoint 2', '18');
    await expect(cpRow(page, 'Checkpoint 2').getByTestId('cp-state')).toContainText('Dưới ngưỡng');
    await expect(cpRow(page, 'Checkpoint 2').getByTestId('cp-delta')).toHaveText('−2');
    await page.reload();
    await expect(cpRow(page, 'Checkpoint 2').getByTestId('cp-delta')).toHaveText('−2');
    await score(page, 'Checkpoint 2', '21');
    await expect(cpRow(page, 'Checkpoint 2').getByTestId('cp-state')).toContainText('Đạt');
    await score(page, 'Mock 1', '7,5');
    await score(page, 'Mock 2', '33');
    await expect(cpRow(page, 'Mock 2').getByRole('alert')).toHaveText(ROADMAP_VI.errors.ROADMAP_SCORE_INVALID_range);
    await score(page, 'Mock 2', '');
    await expect(cpRow(page, 'Mock 2').getByTestId('cp-state')).toContainText('Chưa có điểm');
    const chart = page.getByTestId('cp-chart');
    await expect(chart.getByTestId('cp-col')).toHaveCount(5);
    const label = (await chart.getByRole('img').getAttribute('aria-label'))!;
    for (const s of ['Diagnostic: 5 trên 32', 'Checkpoint 2: 21 trên 32, ngưỡng 20', 'Mock 1: 7,5 trên 32, ngưỡng 24', 'Mock 2: chưa có điểm']) expect(label).toContain(s);
    await expect(chart.getByTestId('cp-threshold-line')).toHaveCount(3);
    // export -> re-import
    await gotoHash(page, '/settings');
    const dl = page.waitForEvent('download');
    await page.getByRole('button', { name: VI.settings.backup.export }).click();
    const file = (await (await dl).path())!;
    const text = readFileSync(file, 'utf8');
    const parsed = JSON.parse(text) as { schemaVersion: number; roadmapCheckpoints: Array<{ title: string; score: number | null }> };
    expect(parsed.schemaVersion).toBe(2);
    expect(parsed.roadmapCheckpoints.find((c) => c.title === 'Mock 1')!.score).toBe(7.5);
    await page.getByTestId('import-file').setInputFiles({ name: 'e.json', mimeType: 'application/json', buffer: Buffer.from(text) });
    await page.getByRole('dialog').getByRole('button', { name: VI.import.confirm }).click();
    await expect(page.getByRole('dialog')).toBeHidden();
    await gotoHash(page, `/roadmaps/${id}`);
    await expect(ov(page).getByTestId('done-value')).toHaveText('1/21');
    await expect.poll(numbers).toEqual(q1);
    // untick W1, tick again with the end date
    await items(page).nth(0).getByRole('checkbox').click();
    await expect(ov(page).getByTestId('done-value')).toHaveText('0/21');
    await items(page).nth(0).getByRole('button', { name: /^Ngày & ghi chú/ }).click();
    await items(page).nth(0).getByLabel(ROADMAP_VI.item.actualEnd, { exact: true }).fill('2026-11-01');
    await expect.poll(numbers).toEqual(q1);
  });

  test('exploratory: quick score entry, en and vi', async ({ page }) => {
    test.setTimeout(120_000);
    await importBackup(page, 'q1-roadmap-backup.json');
    const results: string[] = [];
    for (const lang of ['en', 'vi'] as const) {
      if (lang === 'vi') await setLang(page, 'vi');
      await gotoHash(page, '/roadmaps/rq');
      for (const v of ['7,5', '7.5', ' 12 ', '-1', '1e1', '+5', '7,25', 'abc', '0', '32', '32.0', '1,234', '1 2', '٣', '', '   ', '5,', '.5', '0.05', '１２']) {
        await score(page, 'Checkpoint 2', v);
        const row = cpRow(page, 'Checkpoint 2');
        const alert = (await row.getByRole('alert').count()) ? await row.getByRole('alert').textContent() : '';
        const shown = await row.getByTestId('cp-score').inputValue();
        await page.reload();
        const stored = await cpRow(page, 'Checkpoint 2').getByTestId('cp-score').inputValue();
        const state = await cpRow(page, 'Checkpoint 2').getByTestId('cp-state').textContent();
        results.push(`${lang} ${JSON.stringify(v)} -> alert=${JSON.stringify(alert)} shown=${JSON.stringify(shown)} persisted=${JSON.stringify(stored)} state=${state}`);
        expect(stored, `${lang} ${v}`).not.toMatch(/NaN|Infinity|undefined/);
        expect(await page.locator('body').textContent()).not.toMatch(/NaN|Infinity|undefined/);
      }
      // rapid typing + Enter
      const input = cpRow(page, 'Mock 1').getByTestId('cp-score');
      await input.click();
      await input.pressSequentially('1234567890', { delay: 0 });
      await input.press('Enter');
      await expect(cpRow(page, 'Mock 1').getByRole('alert')).toBeVisible();
      await input.fill('');
      await input.pressSequentially('2', { delay: 0 });
      await input.pressSequentially('4', { delay: 0 });
      await input.press('Enter');
      await expect(cpRow(page, 'Mock 1').getByTestId('cp-state')).toHaveAttribute('data-state', 'pass');
      await input.press('Tab');
    }
    console.log(['SCORE-RESULTS', ...results].join('\n'));
    // invariants of the documented cases
    expect(results.find((r) => r.startsWith('vi "7,5"'))).toContain('persisted="7,5"');
    expect(results.find((r) => r.startsWith('en "7.5"'))).toContain('persisted="7.5"');
    expect(results.find((r) => r.startsWith('vi "-1"'))).toMatch(/alert="[^"]+"/);
    expect(results.find((r) => r.startsWith('en "33"') ?? '')).toBeUndefined();
  });

  test('exploratory: template dialog dates (past, future, leap day, invalid), goal picker A-78, two templates, Esc/Cancel', async ({ page }) => {
    test.setTimeout(120_000);
    await importBackup(page, 'q1-goal-only-backup.json');
    // leap day: Mon 29/02/2028
    await createFromTemplate(page, { start: '2028-02-29', goal: 'QPT study' });
    await expect(items(page).nth(0)).toContainText('2028-02-29 – 03-06');
    await expect(items(page).nth(19)).toContainText('2028-07-11 – 07-17');
    await expectNoHorizontalScroll(page);
    // gq is taken now: the picker in the dialog must say so (disabled option / error), no 2nd roadmap linked
    await gotoHash(page, '/roadmaps');
    await page.getByTestId('roadmap-create-template').click();
    const picker = dlg(page).getByLabel(ROADMAP_EN.ed.goalLabel);
    const opt = await picker.locator('option', { hasText: 'QPT study' }).count();
    const disabled = opt ? await picker.locator('option', { hasText: 'QPT study' }).first().isDisabled() : null;
    console.log('picker QPT study option count', opt, 'disabled', disabled, 'options', await picker.locator('option').allTextContents());
    if (opt) expect(disabled).toBe(true);
    // far past + far future + invalid
    const d = dlg(page).locator('input[type="date"]');
    await d.fill('1990-01-01');
    await expect(dlg(page)).toContainText('Week 1: 1990-01-01');
    await d.fill('2099-12-31');
    await expect(dlg(page)).toContainText(/Week 1: 2099-12-31/);
    await d.fill('');
    await dlg(page).getByRole('button', { name: ROADMAP_EN.ed.create }).click();
    await expect(dlg(page)).toContainText('Enter a valid date.');
    await expect(dlg(page)).toBeVisible();
    // Esc closes, focus back on the opener
    await page.keyboard.press('Escape');
    await expect(dlg(page)).toBeHidden();
    await expect(page.getByTestId('roadmap-create-template')).toBeFocused();
    // second template with a far future date + no goal: both listed, names equal
    await createFromTemplate(page, { start: '2099-12-31' });
    await expect(items(page).nth(20)).toContainText('2100-05-');
    await gotoHash(page, '/roadmaps');
    await expect(page.getByTestId('roadmap-row')).toHaveCount(2);
    expect(await page.getByTestId('roadmap-row').getByRole('heading', { level: 2 }).allTextContents()).toEqual(['QPT 21 weeks', 'QPT 21 weeks']);
    // 1990 start (past)
    await createFromTemplate(page, { start: '1990-01-01' });
    await expect(page.getByTestId('done-value')).toHaveText('0/21');
    await expectNoHorizontalScroll(page);
    const html = await page.locator('body').textContent();
    expect(html).not.toMatch(/NaN|undefined|Invalid Date/);
  });

  test('exploratory: chart with all pending, max 1000, 50 cap, deleting a checkpoint with a score, percent scale', async ({ page }) => {
    test.setTimeout(120_000);
    await importBackup(page, 'q1-goal-only-backup.json');
    await createFromTemplate(page, { start: '2026-10-27' });
    // all pending: chart renders 5 pending bars, no NaN
    const chart = page.getByTestId('cp-chart');
    await expect(chart.getByTestId('cp-col')).toHaveCount(5);
    expect(await chart.innerHTML()).not.toMatch(/NaN|Infinity/);
    await expect(chart.getByRole('img')).toHaveAttribute('aria-label', /^5 checkpoints/);
    // max 1000 checkpoint with score 500 -> percent scale, bar at 0.5
    await page.getByTestId('detail-edit').click();
    const sec = page.getByTestId('editor-checkpoints');
    await sec.getByRole('button', { name: ROADMAP_EN.ed.addCp }).click();
    const add = page.getByTestId('cp-form-add');
    await add.getByLabel(/^Name/).fill('Big');
    await add.getByLabel(/^Date/).fill('2027-03-20');
    await add.getByLabel(/^Maximum score/).fill('1000');
    await add.getByLabel(/^Score \(optional\)/).fill('500');
    await add.getByRole('button', { name: ROADMAP_EN.ed.saveCp }).click();
    await expect(add).toHaveCount(0);
    // invalid: max 10001, 0, -5, 'x', 1.25
    for (const m of ['10001', '0', '-5', 'x', '1.25', '']) {
      await sec.getByRole('button', { name: ROADMAP_EN.ed.addCp }).click();
      await add.getByLabel(/^Name/).fill('Bad');
      await add.getByLabel(/^Maximum score/).fill(m);
      await add.getByRole('button', { name: ROADMAP_EN.ed.saveCp }).click();
      await expect(add, `max ${m}`).toBeVisible();
      await expect(add.getByLabel(/^Maximum score/)).toHaveAttribute('aria-invalid', 'true');
      await add.getByRole('button', { name: ROADMAP_EN.ed.cancel }).click();
    }
    await expect(sec.getByTestId('editor-checkpoint')).toHaveCount(6);
    await page.getByTestId('editor-done').click();
    await expect(chart).toHaveAttribute('data-scale', 'percent');
    expect(Number(await chart.getByTestId('cp-col').nth(5).locator('rect').getAttribute('data-height'))).toBeCloseTo(0.5, 3);
    expect(await chart.innerHTML()).not.toMatch(/NaN|Infinity/);
    // score in the table for the big one: 1000 ok, 1001 range
    await score(page, 'Big', '1000');
    await expect(cpRow(page, 'Big').getByRole('alert')).toHaveCount(0);
    await score(page, 'Big', '1001');
    await expect(cpRow(page, 'Big').getByRole('alert')).toBeVisible();
    await score(page, 'Big', '1000');
    // delete a checkpoint that has a score (D11 mentions the score is lost)
    await page.getByTestId('detail-edit').click();
    await sec.getByRole('button', { name: 'Delete Big' }).click();
    await expect(page.getByRole('dialog')).toContainText("can't be undone");
    await page.getByRole('dialog').getByRole('button', { name: ROADMAP_EN.ed.deleteCpConfirm }).click();
    await expect(sec.getByTestId('editor-checkpoint')).toHaveCount(5);
    await page.getByTestId('editor-done').click();
    await expect(chart).toHaveAttribute('data-scale', 'raw');
    // reload keeps it deleted
    await page.reload();
    await expect(page.getByTestId('cp-row')).toHaveCount(5);
  });

  test('exploratory: 50-checkpoint cap message; editor/table with 50 rows stay usable at 360 px', async ({ page }) => {
    test.setTimeout(120_000);
    await page.setViewportSize({ width: 360, height: 740 });
    await importBackup(page, 'q1-roadmap-backup.json');
    await importMutated(page, (d) => {
      const base = d.roadmapCheckpoints![0]!;
      for (let i = 0; i < 45; i++) d.roadmapCheckpoints!.push({ ...base, id: `x${i}`, title: `Extra ${i}`, date: `2027-0${(i % 9) + 1}-1${i % 9}`, score: i % 3 === 0 ? null : i % 33 });
    });
    await gotoHash(page, '/roadmaps/rq');
    await expect(page.getByTestId('cp-row')).toHaveCount(50);
    await expectNoHorizontalScroll(page);
    await page.getByTestId('detail-edit').click();
    const sec = page.getByTestId('editor-checkpoints');
    await sec.getByRole('button', { name: ROADMAP_EN.ed.addCp }).click();
    await expect(sec.getByRole('alert')).toHaveText('A roadmap can have up to 50 checkpoints.');
    await expect(page.getByTestId('cp-form-add')).toHaveCount(0);
    await expect(sec.getByTestId('editor-checkpoint')).toHaveCount(50);
    await expectNoHorizontalScroll(page);
  });

  test('offline: create from template with the network off, reload, data persists', async ({ page, context }) => {
    await importBackup(page, 'q1-goal-only-backup.json');
    await gotoHash(page, '/roadmaps');
    await expect(page.getByTestId('roadmaps-empty')).toBeVisible();
    await page.waitForLoadState('networkidle');
    await context.setOffline(true);
    await createFromTemplate(page, { start: '2026-10-27', goal: 'QPT study' });
    await score(page, 'Checkpoint 2', '18');
    await gotoHash(page, '/today');
    await gotoHash(page, '/roadmaps');
    await expect(page.getByTestId('roadmap-row')).toHaveCount(1);
    await context.setOffline(false);
    await page.reload();
    await expect(page.getByTestId('roadmap-row')).toHaveCount(1);
    await page.getByTestId('roadmap-row').click();
    await expect(page.getByRole('heading', { level: 1, name: 'QPT 21 weeks' })).toBeVisible();
    await expect(items(page)).toHaveCount(21);
    await expect(cpRow(page, 'Checkpoint 2').getByTestId('cp-score')).toHaveValue('18');
  });

  test('AC6 a11y/layout: axe light+dark on detail with checkpoints and on the dialog; vi scan; 360 px vi dialog + table', async ({ page }) => {
    test.setTimeout(120_000);
    await importBackup(page, 'q1-goal-only-backup.json');
    await createFromTemplate(page, { start: '2026-10-27', goal: 'QPT study' });
    await score(page, 'Diagnostic', '5');
    await score(page, 'Checkpoint 2', '18');
    for (const scheme of ['light', 'dark'] as const) {
      await page.emulateMedia({ colorScheme: scheme });
      const r = await new AxeBuilder({ page }).analyze();
      const bad = r.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
      expect(bad.map((v) => `${scheme} ${v.id}`)).toEqual([]);
      const minor = r.violations.filter((v) => !(v.impact === 'serious' || v.impact === 'critical')).map((v) => `${v.id}:${v.impact}`);
      if (minor.length) console.log('AXE-other', scheme, minor.join(','));
    }
    await gotoHash(page, '/roadmaps');
    await page.getByTestId('roadmap-create-template').click();
    for (const scheme of ['light', 'dark'] as const) {
      await page.emulateMedia({ colorScheme: scheme });
      await expectAxeClean(page);
    }
    await page.keyboard.press('Escape');
    await page.emulateMedia({ colorScheme: 'light' });
    await setLang(page, 'vi');
    await page.setViewportSize({ width: 360, height: 740 });
    await gotoHash(page, '/roadmaps');
    await page.getByTestId('roadmap-create-template').click();
    await expect(dlg(page)).toBeVisible();
    await expectNoViLeaks(page);
    await expectNoHorizontalScroll(page);
    await expectAxeClean(page);
    await page.keyboard.press('Escape');
    await page.getByTestId('roadmap-row').first().click();
    await expect(page.getByTestId('cp-table')).toBeVisible();
    await page.getByTestId('cp-table').scrollIntoViewIfNeeded();
    await expectNoViLeaks(page);
    await expectNoHorizontalScroll(page);
    const tb = (await page.getByTestId('cp-table').boundingBox())!;
    expect(tb.x + tb.width).toBeLessThanOrEqual(360);
    // toast copy of creation
    await gotoHash(page, '/roadmaps');
    await page.getByTestId('roadmap-create-template').click();
    await dlg(page).getByRole('button', { name: ROADMAP_VI.ed.create }).click();
    await expect(toast(page)).toHaveText(ROADMAP_VI.toast.templateCreated);
  });

  // M20-D1 (FIXED in b1e5fb6; r2 rewrite): Create with an overflowing start date is refused by design.
  test('M20-D1: far-future start date (9999-12-31) is refused inline, focus on the date field, 0 roadmaps, no NaN; 9999-08-07 round-trips', async ({ page }) => {
    await importBackup(page, 'q1-goal-only-backup.json');
    await gotoHash(page, '/roadmaps');
    await page.getByRole('button', { name: ROADMAP_EN.list.createTemplate }).click();
    const d = dlg(page);
    const date = d.locator('input[type="date"]');
    await date.fill('9999-12-31');
    await expect(d).not.toContainText('NaN');
    await expect(d).toContainText('Enter a valid date.');
    await d.getByRole('button', { name: ROADMAP_EN.ed.create }).click();
    await expect(d).toBeVisible();
    await expect(d).toContainText('Enter a valid date.');
    await expect(date).toBeFocused();
    await expect(date).toHaveAttribute('aria-invalid', 'true');
    await expect(d).not.toContainText('NaN');
    expect(page.url()).toMatch(/#\/roadmaps$/);
    expect(await page.evaluate(() => new Promise<number>((res, rej) => {
      const open = indexedDB.databases ? indexedDB.databases() : Promise.resolve([]);
      void open.then(async (dbs) => {
        const name = dbs.map((x) => x.name).find((n) => n && /better|onepercent|1/i.test(n)) ?? dbs[0]?.name;
        const rq = indexedDB.open(name!);
        rq.onerror = () => rej(rq.error);
        rq.onsuccess = () => {
          const db = rq.result;
          const tx = db.transaction('roadmaps', 'readonly').objectStore('roadmaps').count();
          tx.onsuccess = () => res(tx.result);
        };
      });
    }))).toBe(0);
    // last valid date: accepted, preview has no NaN, Export -> Import closes the loop
    await date.fill('9999-08-07');
    await expect(d).not.toContainText('Enter a valid date.');
    await expect(d).not.toContainText('NaN');
    await d.getByRole('button', { name: ROADMAP_EN.ed.create }).click();
    await page.waitForURL(/#\/roadmaps\/[^/]+$/);
    await expect(page.locator('main')).not.toContainText('NaN');
    await gotoHash(page, '/settings');
    const dl = page.waitForEvent('download');
    await page.getByRole('button', { name: EN.settings.backup.export }).click();
    const text = readFileSync((await (await dl).path())!, 'utf8');
    expect(text).not.toMatch(/"1\d{4}-\d\d-\d\d"/);
    await page.getByTestId('import-file').setInputFiles({ name: 'e.json', mimeType: 'application/json', buffer: Buffer.from(text) });
    await expect(page.getByRole('dialog')).toBeVisible();
    await expect(page.getByRole('dialog')).not.toContainText("doesn't look like");
  });
});
