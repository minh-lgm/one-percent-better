// M8-AC2 / AC4, project `chromium` (cloud OFF): no sign-in prompt anywhere, phase-1 copy, BackupBanner as in M3-AC10.
import { expect, test } from '@playwright/test';
import { BASE_URL } from '../playwright.config';
import { EN, freezeClock, gotoHash, importBackup, toast } from './helpers/app';

test('cloud off: S1 imported → BackupBanner on Today, never the login banner; Export → toast only, no hint; Settings copy is phase 1', async ({ page }) => {
  const external: string[] = [];
  page.on('request', (req) => {
    if (!req.url().startsWith(BASE_URL)) external.push(req.url());
  });
  await freezeClock(page);
  await importBackup(page);
  await gotoHash(page, '/today');
  await expect(page.getByTestId('backup-banner')).toBeVisible();
  await expect(page.getByTestId('login-prompt-banner')).toHaveCount(0);
  await expect(page.getByRole('button', { name: EN.auth.signInGoogle })).toHaveCount(0);
  await expect(page.getByRole('button', { name: EN.loginPrompt.notNow })).toHaveCount(0);
  await gotoHash(page, '/settings');
  await expect(page.getByTestId('backup-desc')).toHaveText(EN.settings.backup.desc);
  await expect(page.getByTestId('storage-desc')).not.toContainText(EN.settings.storage.notProtectedSignIn);
  await expect(page.getByTestId('storage-go-to-account')).toHaveCount(0);
  await expect(page.getByText(EN.settings.about.desc)).toBeVisible();
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: EN.settings.backup.export }).click();
  await download;
  await expect(toast(page)).toHaveText(EN.toast.backupExported);
  await expect(page.getByTestId('export-sign-in-hint')).toHaveCount(0);
  expect(external).toEqual([]);
});
