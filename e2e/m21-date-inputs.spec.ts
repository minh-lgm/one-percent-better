// M21-AC5 — every date box of the roadmap screens shows the whole date at 360 … 1440 px (FR-81, A-94; DESIGN v8.3
// §6.3 "Ô ngày (FR-81)"). chromium, Q1 fixture through the real import UI, clock 2026-11-04, `en-US` and `vi-VN`.
//
// Measure: `actual` = the box's rendered width; `natural` = the width of a hidden clone (same class, same parent, same
// value) with `width: max-content; min-width: 0; max-width: none; flex: none` — the browser's own content size of a date
// box, i.e. the full date plus the calendar icon (WPT `input-date-content-size`). Expect `actual ≥ natural − 0.5`.
// The spec was run on the code before the fix (fc9b547) and failed on group (1) — docs/handoff/dev-M21.md §6 AC5.
//
// Screenshots of group (1) in vi-VN at 690 and 360 px (light + dark) go to `M21_SHOTS_DIR` when set (handoff), else
// to the test output folder.
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test, type BrowserType, type Locator, type Page, type TestInfo } from '@playwright/test';
import { EN, expectNoHorizontalScroll, FIXED_TIME_Q1, freezeClock, gotoHash, importBackup, ROADMAP_EN, ROADMAP_VI, VI } from './helpers/app';

const WIDTHS = [360, 390, 690, 768, 1024, 1280, 1440] as const;
const HEIGHT = 900;
const W1 = 'Systems of linear equations: singular vs non-singular, determinant';

interface Measure {
  actual: number;
  natural: number;
  value: string;
  /** Computed `min-width` (the `--date-min` floor once fixed), for the log. */
  minWidth: string;
}

/** `actual` and `natural` width of one `<input type="date">` (see the header). */
async function measure(box: Locator): Promise<Measure> {
  return box.evaluate((el) => {
    const input = el as HTMLInputElement;
    const clone = input.cloneNode(false) as HTMLInputElement;
    clone.removeAttribute('id');
    clone.value = input.value;
    clone.setAttribute('aria-hidden', 'true');
    clone.tabIndex = -1;
    Object.assign(clone.style, { position: 'absolute', visibility: 'hidden', width: 'max-content', minWidth: '0', maxWidth: 'none', flex: 'none', left: '0', top: '0' });
    input.parentElement!.appendChild(clone);
    const natural = clone.getBoundingClientRect().width;
    clone.remove();
    return { actual: input.getBoundingClientRect().width, natural, value: input.value, minWidth: getComputedStyle(input).minWidth };
  });
}

type Copy = typeof ROADMAP_EN;

interface Group {
  name: string;
  /** Navigate and open what the group needs; returns the date boxes to measure. */
  open: (page: Page, rm: Copy) => Promise<Locator[]>;
}

const detailItem = (page: Page, id: string) => page.locator(`[data-testid="roadmap-item"][data-item="${id}"]`);

const GROUPS: Group[] = [
  {
    name: '(1) S13 W1 actual start / end',
    open: async (page, rm) => {
      await gotoHash(page, '/roadmaps/rq');
      const w1 = detailItem(page, 'wq1');
      await w1.getByRole('button', { name: new RegExp(`^${rm.item.details}`) }).click();
      const start = w1.getByLabel(rm.item.actualStart, { exact: true });
      const end = w1.getByLabel(rm.item.actualEnd, { exact: true });
      await expect(start).toHaveValue('2026-10-27');
      await expect(end).toHaveValue('2026-11-01');
      return [start, end];
    },
  },
  {
    name: '(2) editor W1 planned start / end',
    open: async (page, rm) => {
      await gotoHash(page, '/roadmaps/rq/edit');
      await page.getByRole('button', { name: rm.ed.editItemAria.replace('{{title}}', W1), exact: true }).click();
      const form = page.getByTestId('item-form-edit');
      const start = form.getByLabel(new RegExp(`^${rm.ed.plannedStart}`));
      const end = form.getByLabel(new RegExp(`^${rm.ed.plannedEnd}`));
      await expect(start).toHaveValue('2026-10-27');
      await expect(end).toHaveValue('2026-11-02');
      return [start, end];
    },
  },
  {
    name: '(3) editor checkpoint Diagnostic date',
    open: async (page, rm) => {
      await gotoHash(page, '/roadmaps/rq/edit');
      await page.getByRole('button', { name: rm.ed.editCpAria.replace('{{title}}', 'Diagnostic'), exact: true }).click();
      const date = page.getByTestId('cp-form-edit').getByLabel(new RegExp(`^${rm.ed.cpDateLabel}`));
      await expect(date).toHaveValue('2026-09-24');
      return [date];
    },
  },
  {
    name: '(4) editor milestone date',
    open: async (page, rm) => {
      await gotoHash(page, '/roadmaps/rq/edit');
      const date = page.getByLabel(new RegExp(`^${rm.ed.milestoneDateLabel.replace(/[()]/g, '\\$&')}`));
      await expect(date).toHaveValue('2027-03-09');
      return [date];
    },
  },
  {
    name: '(5) QPT template dialog start date',
    open: async (page, rm) => {
      await gotoHash(page, '/roadmaps');
      await page.getByTestId('roadmap-create-template').click();
      const date = page.getByTestId('template-dialog').getByLabel(new RegExp(`^${rm.tpl.startLabel}`));
      await expect(date).toHaveValue('2026-11-04');
      return [date];
    },
  },
];

/**
 * A page in a browser started with `--lang=<locale>`: Chromium draws the date box in its UI language (dd/mm/yyyy for
 * vi-VN), which the context `locale` alone does not change. Same context options as the project otherwise.
 */
async function openPage(browserType: BrowserType, baseURL: string, locale: string): Promise<{ page: Page; close: () => Promise<void> }> {
  const browser = await browserType.launch({ args: [`--lang=${locale}`] });
  const context = await browser.newContext({ baseURL, locale, timezoneId: 'Asia/Ho_Chi_Minh', viewport: { width: 1280, height: HEIGHT } });
  const page = await context.newPage();
  return { page, close: () => browser.close() };
}

const opened: Array<() => Promise<void>> = [];
test.afterEach(async () => {
  while (opened.length > 0) await opened.pop()!();
});

async function shot(testInfo: TestInfo, name: string, target: Locator): Promise<void> {
  const dir = process.env.M21_SHOTS_DIR;
  const path = dir ? join(dir, name) : testInfo.outputPath(name);
  if (dir) mkdirSync(dir, { recursive: true });
  await target.screenshot({ path, animations: 'disabled' });
  await testInfo.attach(name, { path, contentType: 'image/png' });
}

for (const locale of ['en-US', 'vi-VN'] as const) {
  const vi = locale === 'vi-VN';
  const rm = (vi ? ROADMAP_VI : ROADMAP_EN) as Copy;
  test.describe(`M21-AC5 date boxes show the whole date (${locale})`, () => {
    test(`${locale}: 5 groups / 7 boxes × 360 … 1440 px → actual ≥ natural − 0.5, no horizontal scroll`, async ({ playwright, baseURL }, testInfo) => {
      test.setTimeout(180_000);
      const { page, close } = await openPage(playwright.chromium, baseURL!, locale);
      opened.push(close);
      await freezeClock(page, FIXED_TIME_Q1);
      await page.setViewportSize({ width: 1280, height: HEIGHT });
      await importBackup(page, 'q1-roadmap-backup.json', vi ? VI : EN);
      await expect(page.locator('html')).toHaveAttribute('lang', vi ? 'vi' : 'en');
      const rows: string[] = [];
      for (const group of GROUPS) {
        await page.setViewportSize({ width: 1280, height: HEIGHT });
        const boxes = await group.open(page, rm);
        await page.evaluate(() => document.fonts.ready.then(() => undefined));
        for (const width of WIDTHS) {
          await page.setViewportSize({ width, height: HEIGHT });
          // two frames: layout settles after the resize
          await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
          for (const [k, box] of boxes.entries()) {
            const m = await measure(box);
            const ok = m.actual >= m.natural - 0.5;
            rows.push(`${locale} ${width} ${group.name} #${k + 1} ${m.value}: actual ${m.actual.toFixed(1)} natural ${m.natural.toFixed(1)} min-width ${m.minWidth} ${ok ? 'ok' : 'CUT'}`);
            expect.soft(m.actual, `${locale} ${width}px ${group.name} box ${k + 1} (${m.value}) is cut`).toBeGreaterThanOrEqual(m.natural - 0.5);
          }
          await expectNoHorizontalScroll(page);
          if (vi && group.name.startsWith('(1)') && (width === 690 || width === 360)) {
            await expect(page.getByTestId('toast')).toHaveCount(0, { timeout: 15_000 });
            const w1 = detailItem(page, 'wq1');
            for (const scheme of ['light', 'dark'] as const) {
              await page.emulateMedia({ colorScheme: scheme });
              await shot(testInfo, `m21-dates-vi-${width}-${scheme}.png`, w1);
            }
            await page.emulateMedia({ colorScheme: 'light' });
          }
        }
        if (group.name.startsWith('(5)')) await page.keyboard.press('Escape');
      }
      console.log(`[M21-AC5]\n${rows.join('\n')}`);
    });
  });
}

// Also measured (not blocking M21, A-94): GoalForm start/end and DateNav at 360 / 690 / 1440 — logged for the handoff.
test.describe('M21-AC5 extra: GoalForm and DateNav date boxes (report only)', () => {
  for (const locale of ['en-US', 'vi-VN'] as const) {
    test.describe(locale, () => {
      test(`${locale}: GoalForm + DateNav widths are logged`, async ({ playwright, baseURL }) => {
        const { page, close } = await openPage(playwright.chromium, baseURL!, locale);
        opened.push(close);
        await freezeClock(page, FIXED_TIME_Q1);
        await importBackup(page, 'q1-roadmap-backup.json', locale === 'vi-VN' ? VI : EN);
        const rows: string[] = [];
        for (const [where, hash] of [
          ['GoalForm', '/goals/g1/edit'],
          ['DateNav', '/day/2026-11-03'],
        ] as const) {
          await page.setViewportSize({ width: 1280, height: HEIGHT });
          await gotoHash(page, hash);
          const boxes = page.locator('input[type="date"]');
          await expect(boxes.first()).toBeVisible();
          await page.evaluate(() => document.fonts.ready.then(() => undefined));
          for (const width of [360, 690, 1440]) {
            await page.setViewportSize({ width, height: HEIGHT });
            await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
            const n = await boxes.count();
            for (let k = 0; k < n; k += 1) {
              const m = await measure(boxes.nth(k));
              rows.push(`${locale} ${width} ${where} #${k + 1} ${m.value}: actual ${m.actual.toFixed(1)} natural ${m.natural.toFixed(1)} ${m.actual >= m.natural - 0.5 ? 'ok' : 'CUT'}`);
            }
          }
        }
        console.log(`[M21-AC5 extra]\n${rows.join('\n')}`);
        expect(rows.length).toBeGreaterThan(0);
      });
    });
  }
});
