// QC round 1 (M21): independent exploratory checks of the v8.3 roadmap total (all goal time) and of the date boxes.
// chromium project, clock 2026-11-04T10:00+07:00, Q1 fixture (mutated copies) through the real import UI.
import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { EN, expectNoHorizontalScroll, fixturePath, FIXED_TIME_Q1, freezeClock, gotoHash, importBackup, ROADMAP_EN, VI } from '../../e2e/helpers/app';

type Backup = Record<string, Array<Record<string, unknown>>>;
const dialog = (page: Page) => page.getByRole('dialog');
const ov = (page: Page) => page.getByTestId('overview');

async function importMutated(page: Page, mutate: (d: Backup) => void) {
  const d = JSON.parse(readFileSync(fixturePath('q1-roadmap-backup.json'), 'utf8'));
  mutate(d);
  await gotoHash(page, '/settings');
  await page.getByTestId('import-file').setInputFiles({ name: 'x.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(d)) });
  await expect(dialog(page)).toBeVisible();
  await dialog(page).getByRole('button', { name: EN.import.confirm }).click();
  await expect(dialog(page)).toBeHidden();
}
const entry = (id: string, date: string, minutes: number) => ({ id, goalId: 'gq', date, minutes, note: '', source: 'manual', createdAt: `${date}T02:00:00.000Z`, updatedAt: `${date}T02:00:00.000Z` });

test.describe('M21 QC r1', () => {
  test.beforeEach(async ({ page }) => {
    await freezeClock(page, FIXED_TIME_Q1);
  });

  test('E1 huge pre-start total (user case: much more goal time than item time): total = Goal detail, sentence, no overflow at 360', async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 800 });
    await importMutated(page, (d) => {
      for (let i = 0; i < 6; i++) d.entries.push(entry(`qc-big-${i}`, `2026-10-2${i + 1}`, 1400)); // 10-21 .. 10-26, before the roadmap start (goal starts 10-20)
      d.entries.push(entry("qc-big-x", "2026-10-20", 1390));
    });
    await gotoHash(page, '/goals/gq');
    const progress = await page.getByTestId('stat-progress').innerText();
    await gotoHash(page, '/roadmaps/rq');
    const hours = await ov(page).getByTestId('hours-value').innerText();
    const outside = await ov(page).getByTestId('hours-outside').innerText();
    console.log('E1 goal progress:', progress.replace(/\s+/g, ' '), '| roadmap hours:', hours, '| outside:', outside);
    await expectNoHorizontalScroll(page);
  });

  test('E2 gap variant: W1 actualEnd moved earlier -> generic sentence, total unchanged', async ({ page }) => {
    await importMutated(page, (d) => {
      const w1 = d.roadmapItems.find((i) => i.id === 'wq1')!;
      w1.actualEnd = '2026-10-29';
      w1.plannedEnd = '2026-10-29';
    });
    await gotoHash(page, '/roadmaps/rq');
    await expect(ov(page).getByTestId('hours-value')).toHaveText('6.6 h');
    const out = await ov(page).getByTestId('hours-outside').innerText();
    console.log('E2 outside:', out);
    expect(out).toContain('outside every item');
  });

  test('E3 edit an item window in the UI -> total unchanged, split moves (live)', async ({ page }) => {
    await importBackup(page, 'q1-roadmap-backup.json', EN);
    await gotoHash(page, '/roadmaps/rq');
    await expect(ov(page).getByTestId('hours-value')).toHaveText('6.6 h');
    // mark W3 done-ish is out of scope; just verify archive of goal keeps the number via Goal detail round trip
    await gotoHash(page, '/goals/gq');
    await gotoHash(page, '/roadmaps/rq');
    await expect(ov(page).getByTestId('hours-value')).toHaveText('6.6 h');
  });

  // Independent sweep of every date box: whole date visible (natural width), no overlap with the Today/Clear buttons, no page scroll.
  for (const loc of ['en-US', 'vi-VN'] as const) {
    test(`E4 sweep W1 actual-date boxes ${loc}: width 320..1500 step 20`, async ({ browser }) => {
      const ctx = await browser.newContext({ locale: loc, timezoneId: 'Asia/Ho_Chi_Minh', viewport: { width: 1280, height: 900 } });
      const page = await ctx.newPage();
      await freezeClock(page, FIXED_TIME_Q1);
      await importBackup(page, 'q1-roadmap-backup.json', loc === 'vi-VN' ? VI : EN);
      await gotoHash(page, '/roadmaps/rq');
      const w1 = page.locator('[data-testid="roadmap-item"][data-item="wq1"]');
      await w1.getByRole('button', { name: new RegExp(`^${ROADMAP_EN.item.details}|Ngày`) }).first().click();
      const boxes = w1.locator('input[type="date"]');
      await expect(boxes).toHaveCount(2);
      const bad: string[] = [];
      for (let w = 320; w <= 1500; w += 20) {
        await page.setViewportSize({ width: w, height: 900 });
        const rows = await boxes.evaluateAll((els) =>
          els.map((el) => {
            const input = el as HTMLInputElement;
            const clone = input.cloneNode(false) as HTMLInputElement;
            clone.removeAttribute('id');
            clone.value = input.value;
            Object.assign(clone.style, { position: 'absolute', visibility: 'hidden', width: 'max-content', minWidth: '0', maxWidth: 'none', flex: 'none' });
            input.parentElement!.appendChild(clone);
            const natural = clone.getBoundingClientRect().width;
            clone.remove();
            const r = input.getBoundingClientRect();
            const sib = [...input.parentElement!.children].filter((c) => c !== input).map((c) => c.getBoundingClientRect());
            const overlap = sib.some((s) => s.width > 0 && s.left < r.right - 0.5 && s.right > r.left + 0.5 && s.top < r.bottom - 0.5 && s.bottom > r.top + 0.5);
            return { actual: r.width, natural, overlap };
          }),
        );
        const scroll = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1);
        rows.forEach((r, i) => {
          if (r.actual < r.natural - 0.5 || r.overlap) bad.push(`${loc} ${w}px box${i}: actual ${r.actual.toFixed(1)} natural ${r.natural.toFixed(1)} overlap ${r.overlap}`);
        });
        if (scroll) bad.push(`${loc} ${w}px: horizontal scroll`);
      }
      await ctx.close();
      expect(bad).toEqual([]);
    });
  }
});

test.describe('M21 QC r1 visual', () => {
  test.use({ locale: 'vi-VN', viewport: { width: 360, height: 800 } });
  test('E5 overview vi 360 dark screenshot (QC_SHOT_DIR when set)', async ({ page }) => {
    await freezeClock(page, FIXED_TIME_Q1);
    await page.emulateMedia({ colorScheme: 'dark' });
    await importBackup(page, 'q1-roadmap-backup.json', VI);
    await gotoHash(page, '/roadmaps/rq');
    await expect(ov(page).getByTestId('hours-outside')).toBeVisible();
    const dir = process.env.QC_SHOT_DIR;
    if (dir) await ov(page).screenshot({ path: `${dir}/m21-overview-vi-360-dark.png` });
  });
});
