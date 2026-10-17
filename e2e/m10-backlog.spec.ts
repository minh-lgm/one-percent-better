/**
 * M10-AC12 (M3-P1 b): regression guards QC asked for in M3 — the goal's "why" line on Goal detail is
 * the fixture text verbatim (M3-D1 was a CSS quoting bug that garbled it), and numbers ≥ 1,000 in
 * D3 and in the import toast carry the locale's thousands separator (M3-D2): `5,449` in en-US,
 * `5.449` in vi-VN.
 */
import { expect, test, type Page } from '@playwright/test';
import { chooseBackupFile, EN, freezeClock, gotoHash, importBackup, toast, VI } from './helpers/app';

async function importLarge(page: Page, copy: typeof EN | typeof VI, entries: string) {
  await chooseBackupFile(page, 'large-backup.json');
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText(entries);
  await dialog.getByRole('button', { name: copy.import.confirm }).click();
  await expect(dialog).toBeHidden();
  await expect(toast(page)).toContainText(entries);
}

test('en-US: the why line of "Read" is the fixture text; large-backup.json shows 5,449 entries in D3 and in the toast', async ({ page }) => {
  await freezeClock(page);
  await gotoHash(page, '/today');
  await importBackup(page);
  await gotoHash(page, '/goals/g1');
  await expect(page.getByRole('heading', { level: 1, name: 'Read' })).toBeVisible();
  await expect(page.locator('main .why')).toHaveText('Be smarter');
  await gotoHash(page, '/goals/g3');
  await expect(page.locator('main .why')).toHaveText('Talk with my grandmother in her language');
  await importLarge(page, EN, '5,449 entries');
  await expect(toast(page)).toHaveText('Backup imported: 5 goals, 5,449 entries');
});

test.describe('vi-VN', () => {
  test.use({ locale: 'vi-VN' });
  test('5.449 lần ghi in D3 and in the toast', async ({ page }) => {
    await freezeClock(page);
    await gotoHash(page, '/today');
    await importBackup(page, 'sample-backup.json', VI);
    await importLarge(page, VI, '5.449 lần ghi');
    await expect(toast(page)).toHaveText('Đã nhập bản sao lưu: 5 mục tiêu, 5.449 lần ghi');
  });
});
