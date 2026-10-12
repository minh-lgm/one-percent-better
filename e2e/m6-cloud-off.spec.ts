import { expect, test } from '@playwright/test';
import { BASE_URL } from '../playwright.config';
import { createGoal, EN, freezeClock, gotoHash } from './helpers/app';

test.describe('M6-AC3 cloud off = phase 1 (FR-37, FR-38)', () => {
  test('Settings has no Account card and no sign-in button; About keeps the phase-1 copy; 0 cross-origin requests; nothing from the SDK', async ({ page }) => {
    const external: string[] = [];
    const sdk: string[] = [];
    page.on('request', (req) => {
      if (!req.url().startsWith(BASE_URL)) external.push(req.url());
      if (/supabase/i.test(new URL(req.url()).pathname)) sdk.push(req.url());
    });
    await freezeClock(page);
    await createGoal(page, { name: 'Read', targetValue: 30 });
    for (const hash of ['/today', '/goals', '/review', '/settings']) {
      await gotoHash(page, hash);
      await expect(page.locator('main h1')).toBeVisible();
    }
    await expect(page.getByRole('heading', { level: 2, name: EN.settings.about.title })).toBeVisible();
    await expect(page.getByRole('heading', { level: 2, name: EN.settings.account.title })).toHaveCount(0);
    await expect(page.getByRole('button', { name: EN.auth.signInGoogle })).toHaveCount(0);
    await expect(page.getByTestId('account-card')).toHaveCount(0);
    await expect(page.getByText(EN.settings.about.desc)).toBeVisible();
    await expect(page.getByText(EN.settings.about.privacy)).toHaveCount(0);
    // Static privacy page (orchestrator addition 2026-10-12): linked from About, served and precached.
    const link = page.getByTestId('privacy-link');
    await expect(link).toHaveText(EN.settings.about.privacyLink);
    const href = await link.getAttribute('href');
    expect(href).toBe('/privacy.html');
    const privacy = await page.request.get(href!);
    expect(privacy.ok()).toBe(true);
    const body = await privacy.text();
    expect(body).toContain('<html lang="en">');
    expect(body).toContain('lang="vi"');
    expect(body).not.toMatch(/<script/i);
    expect(external).toEqual([]);
    expect(sdk).toEqual([]);
    expect(await page.evaluate(() => localStorage.getItem('opb-auth'))).toBeNull();

    // The phase-1 bundle does not even contain the mock/project URL.
    const html = await (await page.request.get('/')).text();
    expect(html).not.toContain('supabase');
    const entry = /src="([^"]+index-[^"]+\.js)"/.exec(html)?.[1];
    expect(entry).toBeTruthy();
    const js = await (await page.request.get(entry!)).text();
    expect(js).not.toContain('supabase.co');
    expect(js).not.toContain('127.0.0.1:54321');
  });
});
