// QC M6 round 1 — the build WITHOUT cloud configuration must behave exactly like phase 1 (M6-AC3, FR-37/38, NFR-01/03).
import { expect, test } from '@playwright/test';
import { EN, freezeClock, gotoHash } from '../../e2e/helpers/app';

const BASE = 'http://localhost:4173';

test.describe('M6 r1 — cloud OFF', () => {
  test('every screen: 0 requests outside the origin, SDK chunk never requested, no Account card/Google button/auth storage', async ({ page }) => {
    await freezeClock(page);
    const urls: string[] = [];
    const errors: string[] = [];
    page.on('request', (r) => urls.push(r.url()));
    page.on('pageerror', (e) => errors.push(e.message));
    for (const h of ['/today', '/goals', '/goals/new', '/review', '/settings', '/nope']) {
      await gotoHash(page, h);
      await expect(page.locator('main h1, main h2').first()).toBeVisible();
    }
    await gotoHash(page, '/settings');
    await expect(page.getByRole('heading', { level: 2, name: EN.settings.account.title })).toHaveCount(0);
    await expect(page.getByRole('button', { name: EN.auth.signInGoogle })).toHaveCount(0);
    await expect(page.getByTestId('account-card')).toHaveCount(0);
    expect(await page.locator('main section.card > h2').allTextContents()).toEqual([EN.settings.language.title, EN.settings.reminders.title, EN.settings.backup.title, EN.settings.storage.title, EN.settings.about.title]);
    await expect(page.getByText(EN.settings.about.desc)).toBeVisible();
    expect(urls.filter((u) => !u.startsWith(BASE))).toEqual([]);
    expect(urls.filter((u) => /supabase/i.test(u))).toEqual([]);
    expect(await page.evaluate(() => Object.keys(localStorage).filter((k) => k.startsWith('opb-auth')))).toEqual([]);
    expect(errors).toEqual([]);
  });

  test('sw.js and index.html reference no Supabase chunk; entry bundle has no project URL', async ({ request }) => {
    const sw = await (await request.get(`${BASE}/sw.js`)).text();
    const html = await (await request.get(`${BASE}/`)).text();
    expect(sw).not.toContain('supabase');
    expect(html).not.toContain('supabase');
    const entry = /src="(\/assets\/index-[^"]+\.js)"/.exec(html)?.[1];
    expect(entry).toBeTruthy();
    const js = await (await request.get(`${BASE}${entry}`)).text();
    expect(js).not.toMatch(/\.supabase\.co/);
    expect(js).not.toMatch(/127\.0\.0\.1:54321/);
    expect(js).not.toMatch(/sb_publishable_/);
  });

  test('an OAuth-looking URL on a cloud-off build does not break the app (?auth=callback&code=x)', async ({ page }) => {
    await freezeClock(page);
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    const urls: string[] = [];
    page.on('request', (r) => urls.push(r.url()));
    await page.goto(`${BASE}/?auth=callback&code=x#/today`);
    // The callback URL is consumed even when cloud is off: URL cleaned to the default returnTo (#/settings), no Account UI, no error.
    await expect(page.getByRole('heading', { level: 1, name: EN.settings.title })).toBeVisible();
    expect(page.url()).toBe(`${BASE}/#/settings`);
    await expect(page.getByTestId('account-card')).toHaveCount(0);
    expect(urls.filter((u) => !u.startsWith(BASE))).toEqual([]);
    expect(urls.filter((u) => /supabase-client/.test(u))).toEqual([]);
    expect(errors).toEqual([]);
  });

  test('Settings About (cloud off) keeps phase-1 copy; privacy link is the only addition and resolves', async ({ page, request }) => {
    await freezeClock(page);
    await gotoHash(page, '/settings');
    const about = page.locator('section[aria-labelledby="h-about"]');
    await expect(about).toContainText(EN.settings.about.desc);
    await expect(about).not.toContainText(EN.settings.about.descCloud);
    const href = await page.getByTestId('privacy-link').getAttribute('href');
    expect(href).toBe('/privacy.html');
    expect((await request.get(`${BASE}${href}`)).status()).toBe(200);
  });
});
