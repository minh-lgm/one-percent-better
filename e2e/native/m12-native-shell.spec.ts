// M12-AC9 / M12-AC11: the native build (`--mode native-e2e`, base '/', no PWA plugin) opened in Chromium.
// `Capacitor.getPlatform()` is 'web' here, so the adapters fall back to the web ones, but every compile-time
// branch of the native build applies: no service worker, no manifest, no update toast, no "Add to Home Screen".
import { expect, test, type Page } from '@playwright/test';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { NATIVE_BASE_URL } from '../../playwright.config';
import { createGoal, EN, expectAmount, expectAxeClean, expectNoHorizontalScroll, expectNoViLeaks, freezeClock, goalCard, gotoHash, logTime, VI } from '../helpers/app';

const ORIGIN = 'http://localhost:4175';

function watchRequests(page: Page) {
  const external: string[] = [];
  const pwa: string[] = [];
  page.on('request', (req) => {
    const url = req.url();
    if (!url.startsWith(ORIGIN)) external.push(url);
    if (/\/sw\.js$|manifest\.webmanifest$/.test(new URL(url).pathname)) pwa.push(url);
  });
  return { external, pwa };
}

async function expectNoPwa(page: Page) {
  expect(await page.evaluate(async () => (await navigator.serviceWorker.getRegistrations()).length)).toBe(0);
  expect(await page.locator('link[rel=manifest]').count()).toBe(0);
  expect(await page.evaluate(() => navigator.serviceWorker.controller)).toBeNull();
}

test.describe('M12 native shell in Chromium', () => {
  test('M12-AC9 (en): goal + entry at base /, persists across reload; no sw.js / manifest / registration; 0 external requests; no Home Screen hint', async ({ page }) => {
    const { external, pwa } = watchRequests(page);
    await freezeClock(page);
    await page.goto('/');
    await expect(page).toHaveURL(`${NATIVE_BASE_URL}#/today`);
    expect(page.url().startsWith(`${ORIGIN}/#/`)).toBe(true);
    await createGoal(page, { name: 'Read', targetValue: 30 });
    await gotoHash(page, '/today');
    await logTime(page, 'Read', 20);
    await expectAmount(page, 'Read', '20/30');
    await page.reload();
    await expectAmount(page, 'Read', '20/30');
    await expect(goalCard(page, 'Read')).toBeVisible();

    await expectNoPwa(page);
    // The served HTML has no manifest link and the build emitted no sw.js at all.
    const html = await (await page.request.get('/')).text();
    expect(html).not.toContain('rel="manifest"');
    expect(html).toMatch(/<script type="module" crossorigin src="\/assets\/index-[^"]+\.js">/);
    // `vite preview` answers unknown paths with the SPA fallback (index.html, 200), so look at what comes back
    // and at the build output: neither file exists in dist-native-e2e.
    for (const path of ['/sw.js', '/manifest.webmanifest']) {
      const res = await page.request.get(path);
      expect(res.headers()['content-type'] ?? '', path).not.toMatch(/javascript|manifest|json/);
      expect(await res.text(), path).not.toMatch(/precacheAndRoute|"short_name"/);
    }
    const out = join(process.cwd(), 'dist-native-e2e');
    expect(existsSync(join(out, 'sw.js'))).toBe(false);
    expect(existsSync(join(out, 'manifest.webmanifest'))).toBe(false);
    expect(existsSync(join(out, 'index.html'))).toBe(true);

    await gotoHash(page, '/settings');
    await expect(page.getByRole('heading', { level: 1, name: EN.settings.title })).toBeVisible();
    await expect(page.getByText(EN.settings.reminders.ios)).toHaveCount(0);
    await expect(page.getByText(EN.settings.reminders.limit)).toBeVisible();
    // Phase-1 shape: no account card (cloud off in native-e2e), About keeps the phase-1 copy, privacy link stays relative-to-site.
    await expect(page.getByTestId('account-card')).toHaveCount(0);
    await expect(page.getByText(EN.settings.about.desc)).toBeVisible();
    await expect(page.getByText(EN.update.message)).toHaveCount(0);

    expect(pwa).toEqual([]);
    expect(external).toEqual([]);
  });

  test('the native bundle really contains the Capacitor plugins (control for the web-dist check, M12-AC3)', async ({ page }) => {
    const html = await (await page.request.get('/')).text();
    const entry = /src="(\/assets\/index-[^"]+\.js)"/.exec(html)?.[1];
    expect(entry).toBeTruthy();
    const js = await (await page.request.get(entry!)).text();
    // The platform chunk is lazy (import() in platform.ts); the entry only references it.
    const nativeChunk = /["'](\.\/)?(assets\/)?(native-[^"']+\.js)["']/.exec(js)?.[3];
    expect(nativeChunk, 'entry references the native chunk').toBeTruthy();
    const native = await (await page.request.get(`/assets/${nativeChunk}`)).text();
    expect(native).toContain('Filesystem');
    expect(native).toContain('Share');
  });
});

test.describe('M12-AC9 / AC11 (vi-VN, 360×740)', () => {
  test.use({ locale: 'vi-VN', viewport: { width: 360, height: 740 } });

  test('Vietnamese UI, no leaks, axe clean, no horizontal scroll on Today and Settings', async ({ page }) => {
    const { external, pwa } = watchRequests(page);
    await freezeClock(page);
    await createGoal(page, { name: 'Đọc sách', targetValue: 30 }, VI);
    await gotoHash(page, '/today');
    await logTime(page, 'Đọc sách', 20, '', VI);
    await expectAmount(page, 'Đọc sách', '20/30');
    await expectNoViLeaks(page);
    await expectAxeClean(page);
    await expectNoHorizontalScroll(page);

    await gotoHash(page, '/settings');
    await expect(page.getByRole('heading', { level: 1, name: VI.settings.title })).toBeVisible();
    await expect(page.getByText(VI.settings.reminders.ios)).toHaveCount(0);
    await expect(page.getByText(EN.settings.reminders.ios)).toHaveCount(0);
    await expectNoViLeaks(page);
    await expectAxeClean(page);
    await expectNoHorizontalScroll(page);
    await expectNoPwa(page);
    expect(pwa).toEqual([]);
    expect(external).toEqual([]);
  });
});
