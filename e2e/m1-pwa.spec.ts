import { expect, test } from '@playwright/test';
import { createGoal, EN, expectAmount, expectAxeClean, expectNoHorizontalScroll, freezeClock, goalCard, gotoHash, logTime } from './helpers/app';

const ORIGIN = 'http://localhost:4173';

test.describe('M1 PWA, privacy, safety, a11y', () => {
  test('M1-AC11: manifest, service worker controls the page, app works offline', async ({ page, context }) => {
    const manifest = await page.request.get('/manifest.webmanifest');
    expect(manifest.ok()).toBe(true);
    const json = await manifest.json();
    expect(json.name).toBe('1% Better per Day');
    expect(json.short_name).toBe('1% Better');
    expect(json.start_url).toBeTruthy();
    expect(json.display).toBe('standalone');
    const sizes = json.icons.map((i: { sizes: string }) => i.sizes);
    expect(sizes).toContain('192x192');
    expect(sizes).toContain('512x512');
    expect(json.icons.some((i: { purpose?: string }) => i.purpose === 'maskable')).toBe(true);

    await freezeClock(page);
    await createGoal(page, { name: 'Read', targetValue: 30 });
    await gotoHash(page, '/today');
    await page.evaluate(() => navigator.serviceWorker.ready);
    await page.reload();
    await expect.poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller))).toBe(true);

    await context.setOffline(true);
    await page.reload();
    await expect(goalCard(page, 'Read')).toBeVisible();
    await expect(page.getByRole('status').filter({ hasText: EN.offline.chip })).toBeVisible();
    await logTime(page, 'Read', 15);
    await expectAmount(page, 'Read', '15/30');
    await context.setOffline(false);
  });

  test('M1-AC12: no cross-origin requests, safe rendering of HTML-like names, axe, no horizontal scroll', async ({ page }) => {
    const external: string[] = [];
    page.on('request', (req) => {
      if (!req.url().startsWith(ORIGIN)) external.push(req.url());
    });
    await freezeClock(page);
    await createGoal(page, { name: 'Read', why: 'Be smarter', targetValue: 30 });
    await gotoHash(page, '/today');
    await logTime(page, 'Read', 20, 'Ch. 3');
    await logTime(page, 'Read', 10);
    await expectAmount(page, 'Read', '30/30');
    expect(external).toEqual([]);

    const xss = '<img src=x onerror=alert(1)>';
    page.on('dialog', (d) => {
      throw new Error(`Unexpected dialog: ${d.message()}`);
    });
    await createGoal(page, { name: xss, targetValue: 10 });
    await expect(page.getByRole('heading', { level: 3, name: xss })).toBeVisible();
    expect(await page.locator('main img').count()).toBe(0);
    await gotoHash(page, '/today');
    await expect(page.getByRole('heading', { level: 2, name: xss })).toBeVisible();
    expect(await page.locator('main img').count()).toBe(0);

    await expectAxeClean(page);
    await gotoHash(page, '/goals');
    await expectAxeClean(page);
    await gotoHash(page, '/goals/new');
    await expectAxeClean(page);

    // M1-D1 regression: a long "why" and a 60-char name must not widen the Goals row.
    await createGoal(page, { name: 'W'.repeat(60), why: 'Be smarter and read more books every day. '.repeat(7).slice(0, 280), targetValue: 30 });

    for (const viewport of [
      { width: 360, height: 740 },
      { width: 1440, height: 900 },
    ]) {
      await page.setViewportSize(viewport);
      for (const route of ['/today', '/goals', '/goals/new', '/settings']) {
        await gotoHash(page, route);
        await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
        await expectNoHorizontalScroll(page);
      }
    }
    expect(external).toEqual([]);
  });
});
