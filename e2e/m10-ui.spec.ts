/**
 * M10-AC8: (1) M9-D1 — while a keyboard reading is shown, the first mouse click on "Show data as table"
 * opens the table (vi 360 px, en 360 px, en 1440 px); after the chart loses focus the reading line is
 * empty within 1 s. (2) M5-P1 — after losing the Save race to another tab, the Stop dialog closes and
 * the page heading gets focus, 12 times out of 12.
 */
import { expect, test, type Page } from '@playwright/test';
import { createGoal, EN, freezeClock, gotoHash, importBackup, startTimer, stopDialog, timerCard, toast, VI } from './helpers/app';

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

async function firstClickOpensTable(page: Page, copy: typeof EN | typeof VI, readingText: RegExp) {
  await chart(page).focus();
  await page.keyboard.press('ArrowLeft');
  await page.keyboard.press('ArrowLeft');
  await expect(reading(page)).toHaveText(readingText);
  await expect(page.getByTestId('curve-table')).toHaveCount(0);
  await page.getByText(copy.goal.detail.showTable).click();
  // One click: the table is open right away (before M10 the first click was lost at 360 px vi).
  await expect(page.getByTestId('curve-table')).toBeVisible({ timeout: 2000 });
  // The chart lost focus with that click: the reading line empties within a second.
  await expect(chart(page)).not.toBeFocused();
  await expect(reading(page)).toHaveText('', { timeout: 1000 });
}

test.describe('M9-D1 fixed: vi, 360 px', () => {
  test.use({ viewport: { width: 360, height: 740 }, locale: 'vi-VN' });
  test('first click on "Xem dữ liệu dạng bảng" opens the table while a 3-line reading is shown', async ({ page }) => {
    await openR1(page, VI);
    await firstClickOpensTable(page, VI, /12 thg 10.*14 phút/);
  });
});

test.describe('M10-D4: the press may be held as long as the user likes (vi, 360 px)', () => {
  test.use({ viewport: { width: 360, height: 740 }, locale: 'vi-VN' });
  for (const holdMs of [400, 900]) {
    test(`mouse held ${holdMs} ms on "Xem dữ liệu dạng bảng" while a 3-line reading is shown → the table opens`, async ({ page }) => {
      await openR1(page, VI);
      await chart(page).focus();
      await page.keyboard.press('ArrowLeft');
      await page.keyboard.press('ArrowLeft');
      await expect(reading(page)).toHaveText(/12 thg 10.*14 phút/);
      await page.getByText(VI.goal.detail.showTable).click({ delay: holdMs });
      await expect(page.getByTestId('curve-table')).toBeVisible({ timeout: 2000 });
      await expect(reading(page)).toHaveText('', { timeout: 1000 });
    });
  }
});

test.describe('M9-D1 fixed: en, 360 px', () => {
  test.use({ viewport: { width: 360, height: 740 } });
  test('first click opens the table', async ({ page }) => {
    await openR1(page, EN);
    await firstClickOpensTable(page, EN, /Oct 12.*14 min/);
  });
});

test.describe('M9-D1 fixed: en, 1440 px', () => {
  test.use({ viewport: { width: 1440, height: 900 } });
  test('first click opens the table', async ({ page }) => {
    await openR1(page, EN);
    await firstClickOpensTable(page, EN, /Oct 12.*14 min/);
  });

  test('Escape still clears the reading at once; Tab away clears it within 1 s', async ({ page }) => {
    await openR1(page, EN);
    await chart(page).focus();
    await page.keyboard.press('ArrowRight');
    await expect(reading(page)).toContainText('Oct 13');
    await page.keyboard.press('Escape');
    await expect(reading(page)).toHaveText('');
    await page.keyboard.press('ArrowRight');
    await expect(reading(page)).toContainText('Oct 13');
    await page.keyboard.press('Tab');
    await expect(chart(page)).not.toBeFocused();
    await expect(reading(page)).toHaveText('', { timeout: 1000 });
  });
});

test('M5-P1 fixed: the tab that loses the Save race closes its dialog and focuses the heading, 12/12 times', async ({ context }) => {
  test.setTimeout(120_000);
  const a = await context.newPage();
  const b = await context.newPage();
  await freezeClock(a);
  await freezeClock(b);
  await createGoal(a, { name: 'Read', why: 'Be smarter', targetValue: 30, startDate: '2026-10-01', endDate: '2026-10-31' });
  await gotoHash(a, '/today');
  await gotoHash(b, '/today');
  let focused = 0;
  for (let i = 0; i < 12; i += 1) {
    await startTimer(a, 'Read');
    await expect(timerCard(b)).toBeVisible();
    await timerCard(a).getByRole('button', { name: /^Stop timer for Read/ }).click();
    await expect(stopDialog(a)).toBeVisible();
    await timerCard(b).getByRole('button', { name: /^Stop timer for Read/ }).click();
    await expect(stopDialog(b)).toBeVisible();
    await stopDialog(b).getByLabel(/^Minutes/).fill('1');
    await stopDialog(b).getByRole('button', { name: EN.entry.form.save }).click();
    await expect(toast(b)).toContainText(EN.toast.entrySaved);
    await expect(timerCard(a)).toHaveCount(0);
    await stopDialog(a).getByLabel(/^Minutes/).fill('1');
    await stopDialog(a).getByRole('button', { name: EN.entry.form.save }).click();
    await expect(stopDialog(a)).toBeHidden();
    await expect(a.getByRole('alert')).toContainText(EN.errors.TIMER_NOT_RUNNING);
    await expect(a.locator('main h1')).toBeFocused();
    if (await a.evaluate(() => document.activeElement?.tagName === 'H1')) focused += 1;
  }
  expect(focused).toBe(12);
});
