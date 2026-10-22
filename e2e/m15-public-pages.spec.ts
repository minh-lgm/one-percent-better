// M15-AC7: the public pages in the web build (dist/privacy.html, dist/support.html): both cards, the required
// mentions, cross links, 0 requests outside the app's origin, axe clean; the About card links to both.
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { BASE_URL } from '../playwright.config';
import { EN, freezeClock, VI } from './helpers/app';

const ORIGIN = new URL(BASE_URL).origin;

function watchExternal(page: Page): string[] {
  const external: string[] = [];
  page.on('request', (req) => {
    if (!req.url().startsWith(ORIGIN)) external.push(req.url());
  });
  return external;
}

async function expectAxeCleanStatic(page: Page) {
  const results = await new AxeBuilder({ page }).analyze();
  const serious = results.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
  expect(serious, JSON.stringify(serious.map((v) => ({ id: v.id, nodes: v.nodes.map((n) => n.target) })))).toEqual([]);
}

test.describe('M15-AC7 public pages', () => {
  test('both pages are in the build output', () => {
    expect(existsSync(join(process.cwd(), 'dist', 'privacy.html'))).toBe(true);
    expect(existsSync(join(process.cwd(), 'dist', 'support.html'))).toBe(true);
  });

  test('privacy.html: en + vi cards, Sign in with Apple, Delete account path, local notifications, iPhone app; 0 external requests; axe clean', async ({ page }) => {
    const external = watchExternal(page);
    const res = await page.goto('/privacy.html');
    expect(res?.status()).toBe(200);
    await expect(page).toHaveTitle('Privacy policy — 1% Better per Day');
    await expect(page.locator('section[aria-labelledby="en-title"] h1')).toHaveText('Privacy policy');
    await expect(page.locator('section[lang="vi"] h1')).toHaveText('Chính sách quyền riêng tư');
    const en = page.locator('section[aria-labelledby="en-title"]');
    const vi = page.locator('section[lang="vi"]');
    for (const s of ['Sign in with Apple', 'Settings → Account → Delete account', 'local notifications', 'iPhone app']) await expect(en).toContainText(s);
    for (const s of ['Đăng nhập bằng Apple', 'Cài đặt → Tài khoản → Xóa tài khoản', 'thông báo cục bộ', 'app iPhone']) await expect(vi).toContainText(s);
    await expect(en.getByRole('link', { name: 'support.html' })).toHaveAttribute('href', './support.html');
    await expect(vi.getByRole('link', { name: 'support.html' })).toHaveAttribute('href', './support.html');
    expect(external).toEqual([]);
    await expectAxeCleanStatic(page);
    await page.emulateMedia({ colorScheme: 'dark' });
    await expectAxeCleanStatic(page);
  });

  test('support.html: mailto contact, GitHub issues link, lang per card, cross link to privacy; 0 external requests; axe clean', async ({ page }) => {
    const external = watchExternal(page);
    const res = await page.goto('/support.html');
    expect(res?.status()).toBe(200);
    await expect(page).toHaveTitle('Support — 1% Better per Day');
    expect(await page.locator('html').getAttribute('lang')).toBe('en');
    expect(await page.locator('section[lang="vi"]').count()).toBe(1);
    const en = page.locator('section[aria-labelledby="en-title"]');
    const vi = page.locator('section[lang="vi"]');
    await expect(en.locator('a[href="mailto:minh.lgm@gmail.com"]').first()).toBeVisible();
    await expect(vi.locator('a[href="mailto:minh.lgm@gmail.com"]').first()).toBeVisible();
    await expect(en.locator('a[href="https://github.com/minh-lgm/one-percent-better/issues"]')).toBeVisible();
    await expect(vi.locator('a[href="https://github.com/minh-lgm/one-percent-better/issues"]')).toBeVisible();
    expect(await en.locator('h3').count()).toBe(6);
    expect(await vi.locator('h3').count()).toBe(6);
    await expect(en.getByRole('link', { name: 'Privacy policy' })).toHaveAttribute('href', './privacy.html');
    await expect(vi.getByRole('link', { name: 'Chính sách quyền riêng tư' })).toHaveAttribute('href', './privacy.html');
    expect(external).toEqual([]);
    await expectAxeCleanStatic(page);
  });

  test('About card (web): Privacy then Support, relative links that resolve to the pages', async ({ page }) => {
    await freezeClock(page);
    await page.goto('/#/settings');
    const privacy = page.getByTestId('privacy-link');
    const support = page.getByTestId('support-link');
    await expect(privacy).toHaveText(EN.settings.about.privacyLink);
    await expect(support).toHaveText(EN.settings.about.supportLink);
    expect(await privacy.evaluate((a) => (a as HTMLAnchorElement).href)).toBe(`${BASE_URL}/privacy.html`);
    expect(await support.evaluate((a) => (a as HTMLAnchorElement).href)).toBe(`${BASE_URL}/support.html`);
    const [p, s] = [await privacy.boundingBox(), await support.boundingBox()];
    expect(s!.x >= p!.x + p!.width || s!.y >= p!.y + p!.height).toBe(true); // after Privacy (same row or below)
    await support.click();
    await expect(page).toHaveURL(`${BASE_URL}/support.html`);
    await expect(page.locator('h1').first()).toHaveText('Support');
  });

  test('About card vi: Hỗ trợ link', async ({ browser }) => {
    const context = await browser.newContext({ locale: 'vi-VN', timezoneId: 'Asia/Ho_Chi_Minh', baseURL: BASE_URL });
    const page = await context.newPage();
    await freezeClock(page);
    await page.goto('/#/settings');
    await expect(page.getByTestId('support-link')).toHaveText(VI.settings.about.supportLink);
    await context.close();
  });
});
