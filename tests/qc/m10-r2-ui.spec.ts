// QC M10 round 2 - browser verification of M10-D1 (UI side), D2, D3, D4 (chromium, cloud off).
import { expect, test, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { EN, fixturePath, freezeClock, gotoHash, importBackup, kvGet, scanVi, VI } from '../../e2e/helpers/app';

const CLOCK_R1 = new Date('2026-10-13T10:00:00+07:00');
const chart = (page: Page) => page.getByTestId('curve-chart');
const reading = (page: Page) => page.getByTestId('curve-reading');

type Backup = { goals: Array<Record<string, unknown>>; entries: Array<Record<string, unknown>>; [k: string]: unknown };
const sample = (): Backup => JSON.parse(readFileSync(fixturePath('sample-backup.json'), 'utf8')) as Backup;
async function chooseJson(page: Page, content: unknown) {
  if (!page.url().includes('#/settings')) await gotoHash(page, '/settings');
  await page.getByTestId('import-file').setInputFiles({ name: 'backup.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(content)) });
}
const backupCard = (page: Page) => page.locator('section[aria-labelledby="h-backup"]');

// ---------------------------------------------------------------------------------------------------------------
// M10-D1 in the browser
// ---------------------------------------------------------------------------------------------------------------
test.describe('M10-D1 (r2) in the browser', () => {
  test('a goal imported with a 60-emoji name, a 280-emoji why: the edit form saves it unchanged (before the fix: "too long")', async ({ page }) => {
    await freezeClock(page);
    await gotoHash(page, '/today');
    const f = sample();
    f.goals[0]!.name = '😀'.repeat(60);
    f.goals[0]!.why = '👨‍👩‍👧'.repeat(56); // 280 code points, 448 UTF-16 units
    await chooseJson(page, f);
    await page.getByRole('dialog').getByRole('button', { name: EN.import.confirm }).click();
    await expect(page.getByTestId('toast')).toContainText('Backup imported');
    await gotoHash(page, '/goals/g1/edit');
    const name = page.getByLabel(new RegExp(`^${EN.goal.form.nameLabel}`));
    await expect(name).toHaveValue('😀'.repeat(60));
    await page.getByRole('button', { name: EN.goal.form.saveChanges }).click();
    await expect(page.getByRole('heading', { level: 1, name: EN.goals.title })).toBeVisible({ timeout: 3000 });
    // the saved goal is still the same text (nothing truncated)
    await gotoHash(page, '/goals/g1/edit');
    await expect(name).toHaveValue('😀'.repeat(60));
  });

  test('a goal whose name is 12 ZWJ family emoji (60 code points, 96 UTF-16 units) is created through the form', async ({ page }) => {
    await freezeClock(page);
    await gotoHash(page, '/goals/new');
    const family = '👨‍👩‍👧';
    await page.getByLabel(new RegExp(`^${EN.goal.form.nameLabel}`)).fill(family.repeat(12));
    await page.getByRole('textbox', { name: new RegExp(`^${EN.goal.form.targetDaily}`) }).fill('30');
    await page.getByRole('button', { name: EN.goal.form.save }).click();
    await expect(page.getByRole('heading', { level: 1, name: EN.goals.title })).toBeVisible({ timeout: 3000 });
  });

  test('61 code points (13 ZWJ families, 104 units - cut by the input at 100 units, so test with 61 combining pairs instead): refused with the name error', async ({ page }) => {
    await freezeClock(page);
    await gotoHash(page, '/goals/new');
    // "e" + U+0301 is 2 code points / 2 units: 31 of them = 62 code points > 60 and 62 units, under the input's 100-unit cap
    await page.getByLabel(new RegExp(`^${EN.goal.form.nameLabel}`)).fill('é'.repeat(31));
    await page.getByRole('textbox', { name: new RegExp(`^${EN.goal.form.targetDaily}`) }).fill('30');
    await page.getByRole('button', { name: EN.goal.form.save }).click();
    await expect(page.getByRole('alert').first()).toBeVisible();
    await expect(page).toHaveURL(/goals\/new/);
  });

  // M10-D6 (Minor, open): the character counter beside the field and the input's maxLength still count UTF-16 units.
  test('M10-D6: the counter says "40/60" for 40 emoji and the input accepts 60 emoji (the validator counts characters)', async ({ page }) => {
    test.fail(true, 'M10-D6: GoalForm counter = state.name.length and maxLength = 60+40 UTF-16 units (pre-existing since M1)');
    await freezeClock(page);
    await gotoHash(page, '/goals/new');
    const name = page.getByLabel(new RegExp(`^${EN.goal.form.nameLabel}`));
    await name.fill('😀'.repeat(40));
    await expect(page.locator('.label-row').first()).toContainText('40/60');
    await name.fill('😀'.repeat(60));
    expect(Array.from(await name.inputValue()).length).toBe(60);
  });
});

// ---------------------------------------------------------------------------------------------------------------
// M10-D2
// ---------------------------------------------------------------------------------------------------------------
test.describe('M10-D2 (r2): "Last backup" follows the file, not the attempt', () => {
  async function setup(page: Page, mode: 'object-url' | 'blob') {
    await page.addInitScript((m) => {
      const w = window as unknown as { __fail: boolean };
      w.__fail = true;
      if (m === 'object-url') {
        const real = URL.createObjectURL.bind(URL);
        URL.createObjectURL = (o: Blob | MediaSource) => {
          if (w.__fail) throw new Error('QC: object URL');
          return real(o);
        };
      } else {
        const RealBlob = window.Blob;
        window.Blob = class extends RealBlob {
          constructor(parts?: BlobPart[], opts?: BlobPropertyBag) {
            if (w.__fail) throw new Error('QC: Blob');
            super(parts, opts);
          }
        } as typeof Blob;
      }
    }, mode);
    await freezeClock(page);
    await gotoHash(page, '/today');
    await importBackup(page);
  }

  for (const mode of ['object-url', 'blob'] as const) {
    test(`failure (${mode}): Alert, "Last backup: Never", kv lastBackupAt null, Today still shows the "never backed up" banner, even after reload; a later success stamps it`, async ({ page }) => {
      const errors: string[] = [];
      page.on('pageerror', (e) => errors.push(String(e)));
      await setup(page, mode);
      await gotoHash(page, '/today');
      await expect(page.getByText(EN.backup.banner.never)).toBeVisible();
      await gotoHash(page, '/settings');
      await page.getByRole('button', { name: EN.settings.backup.export }).click();
      await expect(backupCard(page).getByRole('alert')).toHaveText(EN.errors.EXPORT_FAILED);
      await expect(backupCard(page)).toContainText(EN.settings.backup.lastNever);
      expect(await kvGet(page, 'settings')).toMatchObject({ lastBackupAt: null });
      // twice in a row: still unchanged
      await page.getByRole('button', { name: EN.settings.backup.export }).click();
      await expect(backupCard(page)).toContainText(EN.settings.backup.lastNever);
      await page.reload();
      await expect(backupCard(page)).toContainText(EN.settings.backup.lastNever);
      await gotoHash(page, '/today');
      await expect(page.getByText(EN.backup.banner.never)).toBeVisible();
      // now let the browser create the file
      await gotoHash(page, '/settings');
      await page.evaluate(() => {
        (window as unknown as { __fail: boolean }).__fail = false;
      });
      const download = page.waitForEvent('download');
      await page.getByRole('button', { name: EN.settings.backup.export }).click();
      await download;
      await expect(page.getByTestId('toast')).toContainText(EN.toast.backupExported);
      await expect(backupCard(page)).not.toContainText(EN.settings.backup.lastNever);
      await expect(backupCard(page)).toContainText('2026-10');
      await expect(backupCard(page).getByRole('alert')).toHaveCount(0);
      const kv = (await kvGet(page, 'settings')) as { lastBackupAt: string | null };
      expect(kv.lastBackupAt).toMatch(/^2026-/);
      await gotoHash(page, '/today');
      await expect(page.getByText(EN.backup.banner.never)).toHaveCount(0);
      expect(errors).toEqual([]);
    });
  }

  test('success: the exported file carries lastBackupAt = the stamp stored on the device', async ({ page }) => {
    await freezeClock(page);
    await gotoHash(page, '/today');
    await importBackup(page);
    await gotoHash(page, '/settings');
    const download = page.waitForEvent('download');
    await page.getByRole('button', { name: EN.settings.backup.export }).click();
    const d = await download;
    const text = readFileSync(await d.path(), 'utf8');
    const file = JSON.parse(text) as { settings: { lastBackupAt: string } };
    const kv = (await kvGet(page, 'settings')) as { lastBackupAt: string };
    expect(file.settings.lastBackupAt).toBe(kv.lastBackupAt);
  });

  test('vi: failure keeps "Lần sao lưu cuối: Chưa có" and no English leaks', async ({ browser }) => {
    const ctx = await browser.newContext({ locale: 'vi-VN' });
    const page = await ctx.newPage();
    await page.addInitScript(() => {
      URL.createObjectURL = () => {
        throw new Error('QC');
      };
    });
    await freezeClock(page);
    await gotoHash(page, '/today');
    await importBackup(page, 'sample-backup.json', VI);
    await gotoHash(page, '/settings');
    await page.getByRole('button', { name: VI.settings.backup.export }).click();
    await expect(backupCard(page).getByRole('alert')).toHaveText(VI.errors.EXPORT_FAILED);
    await expect(backupCard(page)).toContainText(VI.settings.backup.lastNever);
    expect(await scanVi(page)).toEqual([]);
    await ctx.close();
  });
});

// ---------------------------------------------------------------------------------------------------------------
// M10-D3
// ---------------------------------------------------------------------------------------------------------------
test.describe('M10-D3 (r2): impossible dates in an imported file', () => {
  for (const bad of ['2026-02-30', '2025-02-29', '2026-13-01']) {
    for (const field of ['startDate', 'endDate'] as const) {
      test(`${field} = ${bad}: schema sentence, no dialog, no pageerror, data untouched`, async ({ page }) => {
        const errors: string[] = [];
        page.on('pageerror', (e) => errors.push(String(e)));
        await freezeClock(page);
        await gotoHash(page, '/today');
        const f = sample();
        f.goals[0]![field] = bad;
        await chooseJson(page, f);
        const alert = backupCard(page).getByRole('alert');
        await expect(alert).toHaveText(EN.errors.IMPORT_INVALID_SCHEMA);
        await expect(page.getByRole('dialog')).toHaveCount(0);
        await expect(page.getByText(EN.errors.UNKNOWN)).toHaveCount(0);
        expect(errors).toEqual([]);
        // nothing was imported
        await gotoHash(page, '/goals');
        await expect(page.getByText('Read', { exact: true })).toHaveCount(0);
      });
    }
  }

  test('vi: same sentence in Vietnamese, no English leaks', async ({ browser }) => {
    const ctx = await browser.newContext({ locale: 'vi-VN' });
    const page = await ctx.newPage();
    await freezeClock(page);
    await gotoHash(page, '/settings');
    const f = sample();
    f.goals[0]!.startDate = '2026-02-30';
    await chooseJson(page, f);
    await expect(backupCard(page).getByRole('alert')).toHaveText(VI.errors.IMPORT_INVALID_SCHEMA);
    expect(await scanVi(page)).toEqual([]);
    await ctx.close();
  });

  test('a too-long real period still gets the outOfRange sentence (AC9 unchanged)', async ({ page }) => {
    await freezeClock(page);
    await gotoHash(page, '/settings');
    const f = sample();
    f.goals[0]!.startDate = '2000-01-01';
    f.goals[0]!.endDate = '2099-12-31';
    await chooseJson(page, f);
    await expect(backupCard(page).getByRole('alert')).toHaveText(EN.errors.IMPORT_INVALID_SCHEMA_outOfRange);
  });
});

// ---------------------------------------------------------------------------------------------------------------
// M10-D4
// ---------------------------------------------------------------------------------------------------------------
async function openR1(page: Page, copy: typeof EN | typeof VI) {
  await freezeClock(page, CLOCK_R1);
  await gotoHash(page, '/today');
  await importBackup(page, 'r1-real-backup.json', copy);
  await gotoHash(page, '/goals/r1');
  await expect(chart(page)).toBeVisible();
}
async function showReading(page: Page) {
  await chart(page).focus();
  await page.keyboard.press('ArrowLeft');
  await page.keyboard.press('ArrowLeft');
  await expect(reading(page)).not.toHaveText('');
}

for (const [localeName, copy, locale] of [['en', EN, 'en-US'], ['vi', VI, 'vi-VN']] as const) {
  for (const [vw, vh] of [[360, 740], [1440, 900]] as const) {
    test.describe(`M10-D4 (r2) ${localeName} ${vw}px`, () => {
      test.use({ viewport: { width: vw, height: vh }, locale });
      for (const holdMs of [350, 700, 1500]) {
        test(`press held ${holdMs} ms on "${copy.goal.detail.showTable}": the reading stays during the press, the table opens on release, the reading clears within 1 s`, async ({ page }) => {
          await openR1(page, copy);
          await showReading(page);
          const target = page.getByText(copy.goal.detail.showTable);
          await target.scrollIntoViewIfNeeded();
          const box = (await target.boundingBox())!;
          await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
          await page.mouse.down();
          await page.waitForTimeout(holdMs);
          // still pressed: the reading is still there, so the layout did not jump under the pointer
          await expect(reading(page)).not.toHaveText('');
          const after = (await target.boundingBox())!;
          expect(Math.abs(after.y - box.y), 'the toggle did not move while pressed').toBeLessThan(1);
          await page.mouse.up();
          await expect(page.getByTestId('curve-table')).toBeVisible({ timeout: 2000 });
          await expect(reading(page)).toHaveText('', { timeout: 1000 });
        });
      }

      test('press, move away from the toggle and release on empty space: no table, the reading clears within 1 s of the release', async ({ page }) => {
        await openR1(page, copy);
        await showReading(page);
        const target = page.getByText(copy.goal.detail.showTable);
        await target.scrollIntoViewIfNeeded();
        const box = (await target.boundingBox())!;
        await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
        await page.mouse.down();
        await page.waitForTimeout(500);
        await expect(reading(page)).not.toHaveText('');
        await page.mouse.move(box.x + box.width / 2, Math.max(2, box.y - 60), { steps: 4 });
        await page.mouse.up();
        await expect(reading(page)).toHaveText('', { timeout: 1500 });
        await expect(page.getByTestId('curve-table')).toHaveCount(0);
      });

      test('keyboard unchanged: Escape clears at once, Tab away clears within 1 s, also after an earlier long mouse press (no stuck pointer state)', async ({ page }) => {
        await openR1(page, copy);
        await showReading(page);
        await page.keyboard.press('Escape');
        await expect(reading(page)).toHaveText('', { timeout: 150 });
        // long mouse press somewhere harmless, released
        await page.mouse.move(5, 5);
        await page.mouse.down();
        await page.waitForTimeout(400);
        await page.mouse.up();
        await chart(page).focus();
        await page.keyboard.press('ArrowLeft');
        await expect(reading(page)).not.toHaveText('');
        await page.keyboard.press('Tab');
        await expect(reading(page)).toHaveText('', { timeout: 1000 });
      });

      test('right-click elsewhere while a reading is shown does not leave the reading stuck (pointerup may not arrive)', async ({ page }) => {
        await openR1(page, copy);
        await showReading(page);
        await page.mouse.click(5, 5, { button: 'right' });
        await expect(reading(page)).toHaveText('', { timeout: 1500 });
      });
    });
  }
}

test.describe('M10-D4 (r2) touch', () => {
  test.use({ viewport: { width: 360, height: 740 }, locale: 'vi-VN', hasTouch: true });
  test('tap opens the table at the first tap', async ({ page }) => {
    await openR1(page, VI);
    await showReading(page);
    await page.getByText(VI.goal.detail.showTable).tap();
    await expect(page.getByTestId('curve-table')).toBeVisible({ timeout: 2000 });
  });
});
