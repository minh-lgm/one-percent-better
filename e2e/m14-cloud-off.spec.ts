// M14-AC6 (chromium, cloud OFF) and DoD 13: no "Delete account" / no Apple button anywhere without a cloud
// configuration, and the web builds contain none of the native sign-in plugin.
import { expect, test } from '@playwright/test';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { EN, freezeClock, gotoHash, importBackup } from './helpers/app';

test('cloud off: Settings has no Account card, no Delete account, no Sign in with Apple; Today has no sign-in banner', async ({ page }) => {
  await freezeClock(page);
  await importBackup(page);
  await gotoHash(page, '/settings');
  await expect(page.getByRole('heading', { level: 1, name: EN.settings.title })).toBeVisible();
  await expect(page.getByTestId('account-card')).toHaveCount(0);
  await expect(page.getByRole('button', { name: EN.settings.account.delete })).toHaveCount(0);
  await expect(page.getByRole('button', { name: EN.auth.signInApple })).toHaveCount(0);
  await expect(page.getByRole('button', { name: EN.auth.signInGoogle })).toHaveCount(0);
  await expect(page.getByTestId('delete-account-dialog')).toHaveCount(0);
  await gotoHash(page, '/today');
  await expect(page.getByTestId('login-prompt-banner')).toHaveCount(0);
  await expect(page.getByRole('button', { name: EN.auth.signInApple })).toHaveCount(0);
});

test('DoD 13: the web builds (dist, dist-cloud-e2e) ship no native plugin code (SocialLogin, Filesystem, LocalNotifications, SplashScreen)', () => {
  for (const dist of ['dist', 'dist-cloud-e2e']) {
    const assets = join(process.cwd(), dist, 'assets');
    test.skip(!existsSync(assets), `${dist} not built`);
    const offenders = readdirSync(assets)
      .filter((f) => f.endsWith('.js'))
      .filter((f) => /SocialLogin|Filesystem|LocalNotifications|SplashScreen|capacitor-social-login/.test(readFileSync(join(assets, f), 'utf8')));
    expect(offenders, dist).toEqual([]);
  }
});
