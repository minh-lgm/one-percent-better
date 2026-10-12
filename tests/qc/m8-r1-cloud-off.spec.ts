// QC M8 round 1 (project `chromium`, cloud OFF): even with plenty of old data nothing about accounts appears, in en and vi:
// no banner, no hint, no Account card, phase-1 Backup/About copy, no loginPrompt kv row written, no request outside the origin.
import { expect, test } from '@playwright/test';
import { BASE_URL } from '../../playwright.config';
import { at, EN, expectNoViLeaks, freezeClock, gotoHash, importBackup, kvGet, VI } from '../../e2e/helpers/app';

for (const loc of ['en-US', 'vi-VN'] as const) {
  test.describe(`cloud off, ${loc}`, () => {
    test.use({ locale: loc });
    const copy = (loc === 'vi-VN' ? VI : EN) as typeof EN;

    test('large old dataset, 1 year later: no banner/hint/Account card; Backup + About + Storage are the phase-1 strings; kv untouched', async ({ page }) => {
      const external: string[] = [];
      page.on('request', (req) => {
        if (!req.url().startsWith(BASE_URL) && !req.url().startsWith('data:') && !req.url().startsWith('blob:')) external.push(req.url());
      });
      await freezeClock(page);
      await page.goto('#/settings');
      await importBackup(page, 'large-backup.json', copy);
      await freezeClock(page, at('2027-10-10T10:00:00'));
      await page.goto('#/today');
      await page.reload();
      await expect(page.getByRole('heading', { level: 1, name: copy.today.title })).toBeVisible();
      await expect(page.getByTestId('login-prompt-banner')).toHaveCount(0);
      await expect(page.getByRole('button', { name: copy.auth.signInGoogle })).toHaveCount(0);
      await gotoHash(page, '/settings');
      await expect(page.getByTestId('account-card')).toHaveCount(0);
      await expect(page.getByTestId('backup-desc')).toHaveText(copy.settings.backup.desc);
      await expect(page.getByTestId('import-hint')).toHaveText(copy.settings.backup.importHint);
      await expect(page.getByText(copy.settings.about.desc, { exact: true })).toBeVisible();
      await expect(page.getByText(copy.settings.about.privacy, { exact: true })).toHaveCount(0);
      await expect(page.getByTestId('storage-go-to-account')).toHaveCount(0);
      await expect(page.getByText(copy.settings.storage.notProtectedSignIn)).toHaveCount(0);
      const download = page.waitForEvent('download');
      await page.getByRole('button', { name: copy.settings.backup.export }).click();
      await download;
      await expect(page.getByTestId('toast')).toHaveText(copy.toast.backupExported);
      await expect(page.getByTestId('export-sign-in-hint')).toHaveCount(0);
      expect(await kvGet(page, 'loginPrompt')).toBeNull();
      if (loc === 'vi-VN') await expectNoViLeaks(page);
      expect(external).toEqual([]);
    });
  });
}
