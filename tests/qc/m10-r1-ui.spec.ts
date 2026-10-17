// QC M10 round 1 - exploratory UI checks around M10-AC8 / AC9 / AC10 / AC11 (chromium, cloud off).
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { createGoal, EN, expectNoHorizontalScroll, fixturePath, freezeClock, gotoHash, importBackup, scanVi, startTimer, stopDialog, timerCard, toast, VI } from '../../e2e/helpers/app';

const CLOCK_R1 = new Date('2026-10-13T10:00:00+07:00');
const chart = (page: Page) => page.getByTestId('curve-chart');
const reading = (page: Page) => page.getByTestId('curve-reading');

async function openR1(page: Page, copy: typeof EN | typeof VI) {
  await freezeClock(page, CLOCK_R1);
  await gotoHash(page, '/today');
  await importBackup(page, 'r1-real-backup.json', copy);
  await gotoHash(page, '/goals/r1');
  await expect(chart(page)).toBeVisible();
}

// ---------------------------------------------------------------------------------------------------------------
// M9-D1 fix: fast click is covered by the developer's spec; here the SLOW press and other pointer shapes.
// ---------------------------------------------------------------------------------------------------------------
test.describe('M9-D1 fix, slow and unusual pointer input (vi 360 px, 3-line reading)', () => {
  test.use({ viewport: { width: 360, height: 900 }, locale: 'vi-VN' });

  // M10-D4 (FIXED in round 2): the reading is kept while any pointer is down, so a slow press still lands on the summary.
  for (const holdMs of [0, 100, 200, 400, 900]) {
    test(`mouse held ${holdMs} ms on "Show data as table" while a keyboard reading is shown, then released: the table opens`, async ({ page }) => {
      await openR1(page, VI);
      await chart(page).focus();
      await page.keyboard.press('ArrowLeft');
      await page.keyboard.press('ArrowLeft');
      await expect(reading(page)).toContainText('14 phút');
      // click({ delay }) = mousedown, wait `delay` ms, mouseup on the same element (the summary is below the fold at 360 px).
      await page.getByText(VI.goal.detail.showTable).click({ delay: holdMs });
      await expect(page.getByTestId('curve-table')).toBeVisible({ timeout: 2000 });
    });
  }

  test('leaving the page right after the chart loses focus raises no error (pending blur timer is cleaned up)', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    page.on('console', (m) => {
      if (m.type() === 'error' || /unmounted|act\(/.test(m.text())) errors.push(m.text());
    });
    await openR1(page, VI);
    await chart(page).focus();
    await page.keyboard.press('ArrowLeft');
    await page.keyboard.press('Tab');
    await gotoHash(page, '/goals');
    await page.waitForTimeout(600);
    expect(errors).toEqual([]);
  });
});

test.describe('M9-D1 fix, touch', () => {
  test.use({ viewport: { width: 360, height: 900 }, locale: 'vi-VN', hasTouch: true });
  test('tap on the summary with a reading shown opens the table at the first tap', async ({ page }) => {
    await openR1(page, VI);
    await chart(page).focus();
    await page.keyboard.press('ArrowLeft');
    await page.keyboard.press('ArrowLeft');
    await expect(reading(page)).toContainText('14 phút');
    await page.getByText(VI.goal.detail.showTable).tap();
    await expect(page.getByTestId('curve-table')).toBeVisible({ timeout: 2000 });
  });
});

// ---------------------------------------------------------------------------------------------------------------
// M5-P1 focusHeading: independent of requestAnimationFrame (rAF replaced by a function that never calls back).
// ---------------------------------------------------------------------------------------------------------------
test('M5-P1 focusHeading does not depend on requestAnimationFrame: the Save race loser gets focus on <h1> 6/6 times with rAF disabled', async ({ context }) => {
  test.setTimeout(120_000);
  const a = await context.newPage();
  const b = await context.newPage();
  await a.addInitScript(() => {
    window.requestAnimationFrame = () => 0;
  });
  await freezeClock(a);
  await freezeClock(b);
  await createGoal(a, { name: 'Read', why: '', targetValue: 30, startDate: '2026-10-01', endDate: '2026-10-31' });
  await gotoHash(a, '/today');
  await gotoHash(b, '/today');
  for (let i = 0; i < 6; i += 1) {
    await startTimer(a, 'Read');
    await expect(timerCard(b)).toBeVisible();
    await timerCard(a).getByRole('button', { name: /^Stop timer for Read/ }).click();
    await expect(stopDialog(a)).toBeVisible();
    await timerCard(b).getByRole('button', { name: /^Stop timer for Read/ }).click();
    await stopDialog(b).getByLabel(/^Minutes/).fill('1');
    await stopDialog(b).getByRole('button', { name: EN.entry.form.save }).click();
    await expect(toast(b)).toContainText(EN.toast.entrySaved);
    await expect(timerCard(a)).toHaveCount(0);
    await stopDialog(a).getByLabel(/^Minutes/).fill('1');
    await stopDialog(a).getByRole('button', { name: EN.entry.form.save }).click();
    await expect(stopDialog(a)).toBeHidden();
    await expect(a.locator('main h1')).toBeFocused();
  }
});

// ---------------------------------------------------------------------------------------------------------------
// M10-AC10 / DESIGN S7: Export failure.
// ---------------------------------------------------------------------------------------------------------------
test.describe('Export failure (DESIGN S7 v3.1)', () => {
  test('file creation fails -> Alert errors.EXPORT_FAILED in the Backup card, no toast, no download, "Last backup" unchanged, button usable, next Export clears the Alert', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    await page.addInitScript(() => {
      const real = URL.createObjectURL.bind(URL);
      (window as unknown as { __failDownload: boolean }).__failDownload = true;
      URL.createObjectURL = (obj: Blob | MediaSource) => {
        if ((window as unknown as { __failDownload: boolean }).__failDownload) throw new Error('QC: cannot create object URL');
        return real(obj);
      };
    });
    await freezeClock(page);
    await gotoHash(page, '/today');
    await importBackup(page);
    await gotoHash(page, '/settings');
    const card = page.locator('section[aria-labelledby="h-backup"]');
    await expect(card).toContainText(EN.settings.backup.lastNever);
    let downloads = 0;
    page.on('download', () => (downloads += 1));
    await page.getByRole('button', { name: EN.settings.backup.export }).click();
    await expect(card.getByRole('alert')).toHaveText(EN.errors.EXPORT_FAILED);
    await expect(page.getByTestId('toast')).toHaveCount(0);
    expect(downloads).toBe(0);
    await expect(page.getByRole('button', { name: EN.settings.backup.export })).toBeEnabled();
    // DESIGN S7: the Alert takes no focus and has no Dismiss button. (Focus itself falls to <body> because the Export button is
    // disabled while "Working..." - the same as after a successful Export and an Import since M3; noted in the report, not asserted.)
    expect(await page.evaluate(() => Boolean(document.activeElement?.closest('[role="alert"]')))).toBe(false);
    await expect(card.getByRole('button', { name: /dismiss/i })).toHaveCount(0);
    // the Alert sits after the import hint inside the card, and the page is axe-clean with it showing
    const order = await card.evaluate((el) => {
      const hint = [...el.querySelectorAll('*')].find((n) => n.textContent === 'Importing replaces everything currently on this device.');
      const alert = el.querySelector('[role="alert"]');
      return Boolean(hint && alert && (hint.compareDocumentPosition(alert) & Node.DOCUMENT_POSITION_FOLLOWING));
    });
    expect(order).toBe(true);
    const axe = await new AxeBuilder({ page }).analyze();
    expect(axe.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical')).toEqual([]);
    // Next Export clears the Alert and works once the browser allows it again.
    await page.evaluate(() => {
      (window as unknown as { __failDownload: boolean }).__failDownload = false;
    });
    const download = page.waitForEvent('download');
    await page.getByRole('button', { name: EN.settings.backup.export }).click();
    await download;
    await expect(card.getByRole('alert')).toHaveCount(0);
    expect(errors).toEqual([]);
  });

  // M10-D2 (FIXED in round 2): "Last backup" is stamped only after the file was handed to the browser.
  test('M10-D2: after a failed file creation "Last backup" still says Never and the backup reminder is not silenced', async ({ page }) => {
    await page.addInitScript(() => {
      URL.createObjectURL = () => {
        throw new Error('QC: cannot create object URL');
      };
    });
    await freezeClock(page);
    await gotoHash(page, '/today');
    await importBackup(page);
    await gotoHash(page, '/settings');
    const card = page.locator('section[aria-labelledby="h-backup"]');
    await page.getByRole('button', { name: EN.settings.backup.export }).click();
    await expect(card.getByRole('alert')).toHaveText(EN.errors.EXPORT_FAILED);
    await expect(card).toContainText(EN.settings.backup.lastNever);
  });

  test.describe('vi', () => {
    test.use({ locale: 'vi-VN' });
    test('vi sentence and no English leaks', async ({ page }) => {
      await page.addInitScript(() => {
        URL.createObjectURL = () => {
          throw new Error('QC');
        };
      });
      await freezeClock(page);
      await gotoHash(page, '/settings');
      await page.getByRole('button', { name: VI.settings.backup.export }).click();
      await expect(page.locator('section[aria-labelledby="h-backup"]').getByRole('alert')).toHaveText(VI.errors.EXPORT_FAILED);
      expect(await scanVi(page)).toEqual([]);
    });
  });
});

// ---------------------------------------------------------------------------------------------------------------
// M10-D1 in the browser (FIXED in round 2): the goal form counts characters (code points), like the importer.
// ---------------------------------------------------------------------------------------------------------------
test('M10-D1: a goal named with 40 emoji (40 characters, under the limit of 60) can be created in the form, as before M10', async ({ page }) => {
  await freezeClock(page);
  await gotoHash(page, '/goals/new');
  await page.getByLabel(new RegExp(`^${EN.goal.form.nameLabel}`)).fill('😀'.repeat(40));
  await page.getByRole('textbox', { name: new RegExp(`^${EN.goal.form.targetDaily}`) }).fill('30');
  await page.getByRole('button', { name: EN.goal.form.save }).click();
  await expect(page.getByRole('heading', { level: 1, name: EN.goals.title })).toBeVisible({ timeout: 3000 });
});

// ---------------------------------------------------------------------------------------------------------------
// Import: malformed dates (M10-D3) and a mixed sequence of Alerts.
// ---------------------------------------------------------------------------------------------------------------
type Backup = { goals: Array<Record<string, unknown>>; entries: Array<Record<string, unknown>>; [k: string]: unknown };
const sample = (): Backup => JSON.parse(readFileSync(fixturePath('sample-backup.json'), 'utf8')) as Backup;
async function chooseJson(page: Page, content: unknown) {
  if (!page.url().includes('#/settings')) await gotoHash(page, '/settings');
  await page.getByTestId('import-file').setInputFiles({ name: 'backup.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(content)) });
}

test.describe('Import alerts: sequence and malformed dates', () => {
  test('one Alert at a time: outOfRange -> generic -> success clears it -> export failure replaces nothing stale', async ({ page }) => {
    await freezeClock(page);
    await gotoHash(page, '/today');
    const card = page.locator('section[aria-labelledby="h-backup"]');
    const big = sample();
    big.goals[0]!.targetMinutes = 600_000;
    await chooseJson(page, big);
    await expect(card.getByRole('alert')).toHaveText(EN.errors.IMPORT_INVALID_SCHEMA_outOfRange);
    await chooseJson(page, []);
    await expect(card.getByRole('alert')).toHaveText(EN.errors.IMPORT_INVALID_SCHEMA);
    await expect(card.getByRole('alert')).toHaveCount(1);
    await chooseJson(page, sample());
    await expect(page.getByRole('dialog')).toBeVisible();
    await expect(card.getByRole('alert')).toHaveCount(0);
  });

  test('M10-D3: a goal whose startDate is not a real date ("2026-02-30") is refused with a schema sentence, not the generic read error, and nothing changes', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    await freezeClock(page);
    await gotoHash(page, '/today');
    const bad = sample();
    bad.goals[0]!.startDate = '2026-02-30';
    await chooseJson(page, bad);
    const alert = page.locator('section[aria-labelledby="h-backup"]').getByRole('alert');
    await expect(alert).toBeVisible();
    const text = (await alert.textContent()) ?? '';
    console.log(`QC M10-D3 UI text for startDate 2026-02-30: ${JSON.stringify(text)}`);
    await expect(page.getByRole('dialog')).toHaveCount(0);
    expect([EN.errors.IMPORT_INVALID_SCHEMA, EN.errors.IMPORT_INVALID_SCHEMA_outOfRange]).toContain(text);
    expect(errors).toEqual([]);
  });
});

// ---------------------------------------------------------------------------------------------------------------
// M10-AC11 bar value labels: sweep widths, rule (chartWidth - 38) / 12 >= 30, columns >= 3 min, format, geometry, theme.
// ---------------------------------------------------------------------------------------------------------------
function dataset(): Backup {
  const base = sample();
  const g = { ...base.goals[0]!, id: 'bulk', name: 'Bulk', targetType: 'daily', targetMinutes: 1440, startDate: '2026-01-01', endDate: '2026-12-31', why: '' };
  const e = (id: string, date: string, minutes: number) => ({ ...base.entries[0]!, id, goalId: 'bulk', date, minutes, note: '' });
  const entries: Array<Record<string, unknown>> = [];
  // Sep: 30 days x 1440 min = 720 h; Oct (current month): 90 min; Aug: 2 min; Jul: 3 min; Jun: 6 min; May: 59 min;
  // Apr: 6000 min = 100 h exactly; Mar: 5997 min = 99.95 h; Feb: nothing; Jan: 1 entry of 15 min (0.25 h).
  for (let d = 1; d <= 30; d += 1) entries.push(e(`sep${d}`, `2026-09-${String(d).padStart(2, '0')}`, 1440));
  entries.push(e('oct1', '2026-10-05', 90), e('aug1', '2026-08-05', 2), e('jul1', '2026-07-05', 3), e('jun1', '2026-06-05', 6), e('may1', '2026-05-05', 59));
  for (let i = 0; i < 5; i += 1) entries.push(e(`apr${i}`, `2026-04-0${i + 1}`, 1200));
  for (let i = 0; i < 4; i += 1) entries.push(e(`mar${i}`, `2026-03-0${i + 1}`, 1200));
  entries.push(e('mar4', '2026-03-05', 1197), e('jan1', '2026-01-05', 15));
  return { ...base, goals: [g], entries };
}
const fmt1 = (n: number) => new Intl.NumberFormat('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(n);
const MONTH_MINUTES = [15, 0, 5997, 6000, 59, 6, 3, 2, 43_200, 90, 0, 0];

async function openReviewWith(page: Page, data: Backup, width: number) {
  await page.setViewportSize({ width, height: 900 });
  await freezeClock(page);
  await gotoHash(page, '/today');
  await chooseJson(page, data);
  await page.getByRole('dialog').getByRole('button', { name: EN.import.confirm }).click();
  await expect(page.getByRole('dialog')).toBeHidden();
  await gotoHash(page, '/review');
  await expect(page.getByTestId('chart-monthly').locator('svg.recharts-surface')).toBeVisible();
  await expect(page.getByTestId('chart-weekly').locator('svg.recharts-surface')).toBeVisible();
}

test.describe('BarChart value labels', () => {
  test('width sweep: labels appear exactly when (chartWidth - 38) / 12 >= 30, both charts, no horizontal scroll, labels geometry sane', async ({ page }) => {
    test.setTimeout(120_000);
    const rows: string[] = [];
    await openReviewWith(page, dataset(), 1440);
    for (const width of [360, 390, 414, 480, 600, 768, 1024, 1100, 1156, 1192, 1280, 1440, 1920]) {
      await page.setViewportSize({ width, height: 900 });
      await page.waitForTimeout(250); // ResizeObserver + render
      for (const id of ['chart-weekly', 'chart-monthly']) {
        const fig = page.getByTestId(id);
        const cw = await fig.locator('.chart').evaluate((el) => el.clientWidth);
        const fits = (cw - 38) / 12 >= 30;
        const labels = fig.getByTestId('bar-value');
        const n = await labels.count();
        rows.push(`${width}px ${id} chartWidth=${cw} fits=${fits} labels=${n}`);
        if (!fits) expect(n, `${id} at ${width}px (chart ${cw}px) must have no labels`).toBe(0);
        else expect(n, `${id} at ${width}px (chart ${cw}px) must have labels`).toBeGreaterThan(0);
        if (fits) {
          const svg = (await fig.locator('svg.recharts-surface').boundingBox())!;
          const boxes = await labels.evaluateAll((els) => els.map((el) => el.getBoundingClientRect().toJSON() as { x: number; y: number; width: number; height: number }));
          const sorted = [...boxes].sort((p, q) => p.x - q.x);
          for (const b of sorted) {
            expect(b.y, `${id}@${width} label clipped at top`).toBeGreaterThanOrEqual(svg.y - 0.5);
            expect(b.x).toBeGreaterThanOrEqual(svg.x - 0.5);
            expect(b.x + b.width).toBeLessThanOrEqual(svg.x + svg.width + 0.5);
          }
          for (let i = 1; i < sorted.length; i += 1) expect(sorted[i]!.x, `${id}@${width} labels overlap`).toBeGreaterThanOrEqual(sorted[i - 1]!.x + sorted[i - 1]!.width - 0.5);
        }
      }
      await expectNoHorizontalScroll(page);
    }
    console.log(`QC M10 bar label sweep:\n${rows.join('\n')}`);
  });

  test('monthly labels = months with >= 3 min, in column order, hours without unit (1 decimal < 100 h, integer from 100 h); aria-hidden; text-anchor middle; centred on the bar', async ({ page }) => {
    await openReviewWith(page, dataset(), 1440);
    const fig = page.getByTestId('chart-monthly');
    const labels = fig.getByTestId('bar-value');
    const expected = MONTH_MINUTES.filter((m) => m >= 3).map((m) => {
      const h = m / 60;
      return h < 100 ? fmt1(h) : new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(Math.round(h));
    });
    console.log(`QC M10 expected monthly labels ${JSON.stringify(expected)}; actual ${JSON.stringify(await labels.allTextContents())}`);
    expect(await labels.allTextContents()).toEqual(expected);
    // 0-, 1- and 2-minute columns have none; 3 minutes does.
    expect(await labels.count()).toBe(MONTH_MINUTES.filter((m) => m >= 3).length);
    const meta = await labels.evaluateAll((els) =>
      els.map((el) => ({ anchor: el.getAttribute('text-anchor'), weight: getComputedStyle(el).fontWeight, size: getComputedStyle(el).fontSize, hidden: Boolean(el.closest('[aria-hidden="true"]')) })),
    );
    for (const m of meta) expect(m).toEqual({ anchor: 'middle', weight: '600', size: '11px', hidden: true });
    // Centred on its bar and 4 px above the top of the bar (label baseline).
    const bars = await fig.locator('.recharts-bar-rectangle path, .recharts-bar-rectangle rect').evaluateAll((els) => els.map((el) => el.getBoundingClientRect().toJSON() as { x: number; width: number; y: number }));
    const lab = await labels.evaluateAll((els) => els.map((el) => el.getBoundingClientRect().toJSON() as { x: number; width: number; y: number; height: number }));
    bars.sort((p, q) => p.x - q.x);
    lab.sort((p, q) => p.x - q.x);
    expect(bars.length).toBe(lab.length + 1); // Aug (2 min) has a bar but, by rule, no label
    bars.splice(6, 1);
    bars.forEach((b, i) => {
      expect(Math.abs(b.x + b.width / 2 - (lab[i]!.x + lab[i]!.width / 2)), `label ${i} centred`).toBeLessThan(2);
      expect(lab[i]!.y + lab[i]!.height, `label ${i} above its bar`).toBeLessThanOrEqual(b.y + 2);
    });
    // Hidden table and summary are unchanged by the labels: 13 rows, no bar-value text inside.
    await expect(page.getByRole('table', { name: 'Months of 2026' }).getByRole('row')).toHaveCount(13);
    await expect(page.getByRole('table', { name: 'Months of 2026' }).getByTestId('bar-value')).toHaveCount(0);
  });

  test('current month label uses --text, other columns --text-muted (light and dark)', async ({ page }) => {
    for (const scheme of ['light', 'dark'] as const) {
      await page.emulateMedia({ colorScheme: scheme });
      await openReviewWith(page, dataset(), 1440);
      const fig = page.getByTestId('chart-monthly');
      const colors = await fig.getByTestId('bar-value').evaluateAll((els) => els.map((el) => getComputedStyle(el).fill));
      const tokens = await page.evaluate(() => {
        const probe = document.createElement('span');
        const read = (v: string) => {
          probe.style.color = `var(${v})`;
          document.body.appendChild(probe);
          const c = getComputedStyle(probe).color;
          probe.remove();
          return c;
        };
        return { text: read('--text'), muted: read('--text-muted') };
      });
      // labels are, in order: Jan, Mar, Apr, May, Jun, Jul, Sep, Oct (current month = last)
      expect(colors.at(-1), `${scheme}: current month`).toBe(tokens.text);
      for (const c of colors.slice(0, -1)) expect(c, `${scheme}: other columns`).toBe(tokens.muted);
      const axe = await new AxeBuilder({ page }).analyze();
      expect(axe.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical'), `${scheme} axe`).toEqual([]);
    }
  });

  test('live resize without reload: 1440 -> 360 removes every label, 360 -> 1440 brings them back', async ({ page }) => {
    await openReviewWith(page, dataset(), 1440);
    const labels = page.getByTestId('chart-monthly').getByTestId('bar-value');
    await expect(labels).toHaveCount(8);
    await page.setViewportSize({ width: 360, height: 800 });
    await expect(labels).toHaveCount(0);
    await expect(page.getByTestId('chart-weekly').getByTestId('bar-value')).toHaveCount(0);
    await page.setViewportSize({ width: 1440, height: 900 });
    await expect(labels).toHaveCount(8);
  });

  test.describe('vi', () => {
    test.use({ locale: 'vi-VN' });
    test('decimal comma and no English leak at 1440', async ({ page }) => {
      await page.setViewportSize({ width: 1440, height: 900 });
      await freezeClock(page);
      await gotoHash(page, '/today');
      await importBackup(page, 'sample-backup.json', VI);
      await gotoHash(page, '/review');
      const labels = page.getByTestId('chart-monthly').getByTestId('bar-value');
      await expect(labels.first()).toBeVisible();
      expect(await labels.allTextContents()).toEqual(['1,0', '0,3', '3,5', '4,7']);
      expect(await scanVi(page)).toEqual([]);
    });
  });
});

// ---------------------------------------------------------------------------------------------------------------
// privacy.html: new brand (OQ-D18)
// ---------------------------------------------------------------------------------------------------------------
test.describe('privacy.html brand', () => {
  for (const scheme of ['light', 'dark'] as const) {
    test(`logo tile + "1% Better per Day", no external request, axe clean (${scheme})`, async ({ page }) => {
      await page.emulateMedia({ colorScheme: scheme });
      const external: string[] = [];
      const failed: string[] = [];
      page.on('request', (r) => {
        if (!r.url().startsWith('http://localhost:4173')) external.push(r.url());
      });
      page.on('response', (r) => {
        if (r.status() >= 400) failed.push(`${r.status()} ${r.url()}`);
      });
      const res = await page.goto('/privacy.html');
      expect(res?.status()).toBe(200);
      const brand = page.locator('a.brand');
      await expect(brand).toContainText('1% Better per Day');
      const img = brand.locator('img');
      expect(await img.evaluate((el: HTMLImageElement) => el.complete && el.naturalWidth > 0)).toBe(true);
      const tile = await brand.locator('.mark').evaluate((el) => {
        const cs = getComputedStyle(el);
        const r = el.getBoundingClientRect();
        return { bg: cs.backgroundColor, w: r.width, h: r.height };
      });
      expect(tile).toEqual({ bg: 'rgb(255, 255, 255)', w: 32, h: 32 });
      expect(await brand.getAttribute('href')).toBe('./');
      const axe = await new AxeBuilder({ page }).analyze();
      expect(axe.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical')).toEqual([]);
      expect(external).toEqual([]);
      expect(failed).toEqual([]);
      // the old "1%" text mark is gone
      expect(await page.locator('.mark').innerText()).toBe('');
    });
  }
});
