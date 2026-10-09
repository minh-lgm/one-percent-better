import { expect, test } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import {
  chooseBackupFile,
  EN,
  expectAmount,
  expectAxeClean,
  expectNoHorizontalScroll,
  expectNoViLeaks,
  freezeClock,
  goalCard,
  gotoHash,
  importBackup,
  kvGet,
  toast,
  VI,
} from './helpers/app';

// Chromium's ICU may differ slightly from Node's ("8 tháng 10, 2026" vs "8 tháng 10 năm 2026"): match the parts.
const VI_DAY_HEADING = /8 tháng 10.*2026/;

test.describe('M3-AC13: Day, history and backup in Vietnamese; import keeps the language', () => {
  test.use({ locale: 'vi-VN', viewport: { width: 360, height: 740 } });

  test('choose Tiếng Việt, back-fill on Day, history, export, import (valid and invalid) — all Vietnamese, also after reload', async ({ page }) => {
    await freezeClock(page);
    await gotoHash(page, '/settings');
    // The vi-VN browser already shows Vietnamese (nothing stored, A-16). Pick English, then
    // Tiếng Việt explicitly so the choice is persisted and an import must leave it alone.
    await page.getByRole('radio', { name: 'English' }).check();
    await expect(toast(page)).toHaveText(EN.toast.languageChanged);
    await page.getByRole('radio', { name: 'Tiếng Việt' }).check();
    await expect(toast(page)).toHaveText(VI.toast.languageChanged);
    await expect(page.getByRole('heading', { level: 1, name: VI.settings.title })).toBeVisible();
    expect(await kvGet(page, 'locale')).toBe('vi');

    // Import S1 through D3 in Vietnamese.
    await chooseBackupFile(page, 'sample-backup.json');
    const dialog = page.getByRole('dialog');
    await expect(dialog.getByRole('heading', { level: 2, name: VI.import.title })).toBeVisible();
    await expect(dialog).toContainText('Bản sao lưu này có 5 mục tiêu, 23 lần ghi, xuất ngày 09/10/2026. Nhập sẽ thay thế toàn bộ dữ liệu hiện có trên thiết bị này (0 mục tiêu, 0 lần ghi). Bạn không thể hoàn tác.');
    await expectNoViLeaks(page);
    await expectAxeClean(page);
    await dialog.getByRole('button', { name: VI.import.confirm }).click();
    await expect(toast(page)).toHaveText('Đã nhập bản sao lưu: 5 mục tiêu, 23 lần ghi');
    await expect(page.locator('html')).toHaveAttribute('lang', 'vi');
    expect(await kvGet(page, 'locale')).toBe('vi');
    await expect(page.getByTestId('last-backup')).toHaveText(VI.settings.backup.lastNever);
    await expect(page.getByTestId('backup-banner')).toContainText(VI.backup.banner.never);
    await expectNoViLeaks(page);
    await expectNoHorizontalScroll(page);

    // Today in Vietnamese with the past-day link.
    await gotoHash(page, '/today');
    await expectAmount(page, 'Read', '0/30');
    await expect(page.getByTestId('backup-banner').getByRole('link', { name: VI.backup.banner.action })).toBeVisible();
    await expectNoViLeaks(page);
    await page.getByRole('link', { name: VI.today.pastDayLink }).click();

    // Day 2026-10-08 (vi heading with year), back-fill for Spanish.
    await expect(page).toHaveURL(/#\/day\/2026-10-08$/);
    await expect(page.getByRole('heading', { level: 1, name: VI.day.title })).toBeVisible();
    await expect(page).toHaveTitle('Ngày — 1% Better');
    await expect(page.locator('.date-title')).toHaveText(VI_DAY_HEADING);
    await expect(page.getByRole('group', { name: VI.day.navLabel })).toBeVisible();
    await expect(page.getByRole('button', { name: VI.day.next })).toBeEnabled();
    const spanish = goalCard(page, 'Spanish');
    await expect(spanish).toContainText(VI.empty.day.noEntries);
    await expect(spanish.getByRole('progressbar', { name: 'Spanish ngày 08/10/2026' })).toBeVisible();
    await expect(goalCard(page, 'Read').getByText(VI.entry.source.manual)).toBeVisible();
    await expectNoViLeaks(page);
    await expectAxeClean(page);
    await expectNoHorizontalScroll(page);
    await spanish.getByRole('button', { name: VI.goalCard.addEntry }).click();
    const form = spanish.getByRole('form', { name: 'Thêm lần ghi cho Spanish ngày 08/10/2026' });
    await form.getByLabel(/^Số phút/).fill('20');
    await form.getByLabel(/^Ghi chú/).fill('Verbos');
    await form.getByRole('button', { name: VI.entry.form.save }).click();
    await expect(toast(page)).toHaveText(VI.toast.entrySaved);
    await expectAmount(page, 'Spanish', '20/17');
    await expectNoViLeaks(page);
    await expectNoHorizontalScroll(page);

    // Future and invalid day in Vietnamese.
    await gotoHash(page, '/day/2026-10-10');
    await expect(page.getByText(VI.errors.DATE_IN_FUTURE)).toBeVisible();
    await expectNoViLeaks(page);
    await gotoHash(page, '/day/abc');
    await expect(page.getByText(VI.day.invalid)).toBeVisible();
    await expect(page.getByRole('link', { name: VI.day.invalidAction })).toBeVisible();
    await expectNoViLeaks(page);

    // Goal detail history: dd/MM/yyyy, vi column names and sources.
    await gotoHash(page, '/goals');
    await page.getByRole('link', { name: 'Spanish' }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Spanish' })).toBeVisible();
    await expect(page.getByText('17 phút/ngày (tổng 100 giờ) · 01/01/2026 – 31/12/2026')).toBeVisible();
    await expect(page.getByRole('heading', { level: 2, name: VI.goal.detail.historyTitle })).toBeVisible();
    const rows = page.getByTestId('history-row');
    await expect(rows).toHaveCount(2);
    await expect(rows.nth(0)).toContainText('08/10/2026');
    await expect(rows.nth(0)).toContainText('20 phút');
    await expect(rows.nth(0)).toContainText(VI.entry.source.manual);
    await expectNoViLeaks(page);
    await expectAxeClean(page);
    await expectNoHorizontalScroll(page);
    await gotoHash(page, '/goals/g4');
    await expect(page.getByRole('heading', { level: 3, name: VI.empty.detail.history })).toBeVisible();
    await expectNoViLeaks(page);

    // Export in Vietnamese: same file name, "Lần sao lưu gần nhất: 09/10/2026".
    await gotoHash(page, '/settings');
    const downloadPromise = page.waitForEvent('download');
    await page.getByRole('button', { name: VI.settings.backup.export }).click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toBe('1percent-better-backup-2026-10-09.json');
    await expect(toast(page)).toHaveText(VI.toast.backupExported);
    const file = JSON.parse(await readFile((await download.path())!, 'utf8')) as { goals: unknown[]; entries: unknown[] };
    expect(file.goals).toHaveLength(5);
    expect(file.entries).toHaveLength(24);
    await expect(page.getByTestId('last-backup')).toHaveText('Lần sao lưu gần nhất: 09/10/2026');
    await expect(page.getByTestId('backup-banner')).toHaveCount(0);
    await expectNoViLeaks(page);

    // Invalid file → Vietnamese alert.
    await chooseBackupFile(page, 'invalid-json.json');
    await expect(page.getByRole('alert')).toHaveText(VI.errors.IMPORT_INVALID_JSON);
    await expectNoViLeaks(page);
    await expectAxeClean(page);
    await expectNoHorizontalScroll(page);

    // Import again (valid) and reload: still Vietnamese.
    await importBackup(page, 'sample-backup.json', VI);
    await page.reload();
    await expect(page.locator('html')).toHaveAttribute('lang', 'vi');
    await expect(page.getByRole('heading', { level: 1, name: VI.settings.title })).toBeVisible();
    await expect(page.getByRole('radio', { name: 'Tiếng Việt' })).toBeChecked();
    expect(await kvGet(page, 'locale')).toBe('vi');
    await gotoHash(page, '/today');
    await expect(page.getByRole('heading', { level: 1, name: VI.today.title })).toBeVisible();
    await expectAmount(page, 'Read', '0/30');
    await expectNoViLeaks(page);
    // Switching back to English still works after an import.
    await gotoHash(page, '/settings');
    await page.getByRole('radio', { name: 'English' }).check();
    await expect(page.getByRole('heading', { level: 1, name: EN.settings.title })).toBeVisible();
  });
});
