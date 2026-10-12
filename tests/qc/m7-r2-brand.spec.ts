// QC M7 round 2 - brand follow-up: the sidebar brand shows the FULL product name as visible text next to the
// logo (round 1 showed only "Better per Day"), and 360 px stays free of horizontal scroll.
import { expect, test } from '@playwright/test';
import { expectNoHorizontalScroll, freezeClock, gotoHash } from '../../e2e/helpers/app';

for (const scheme of ['light', 'dark'] as const) {
  test.describe(`QC brand text (${scheme})`, () => {
    test.use({ colorScheme: scheme });

    test('1440 px: visible brand text is exactly "1% Better per Day" beside the logo; accessible name unchanged', async ({ page }, testInfo) => {
      await page.setViewportSize({ width: 1440, height: 900 });
      await freezeClock(page);
      await gotoHash(page, '/today');
      const brand = page.locator('nav .brand');
      await expect(brand).toBeVisible();
      await expect(brand.locator('span').last()).toHaveText('1% Better per Day');
      await expect(brand).toHaveAccessibleName('1% Better per Day');
      const box = await brand.boundingBox();
      expect(box!.height).toBeLessThan(80);
      // The text must fit inside the sidebar (no clipping / ellipsis overflow).
      const fit = await brand.evaluate((el) => {
        const text = el.querySelector('span:last-child') as HTMLElement;
        return { overflow: text.scrollWidth - text.clientWidth, navRight: (el.closest('nav') as HTMLElement).getBoundingClientRect().right, textRight: text.getBoundingClientRect().right };
      });
      expect(fit.overflow).toBeLessThanOrEqual(1);
      expect(fit.textRight).toBeLessThanOrEqual(fit.navRight);
      await page.screenshot({ path: testInfo.outputPath(`brand-text-1440-${scheme}.png`), clip: { x: 0, y: 0, width: 420, height: 160 } });
    });

    test('360 px: no horizontal scroll on Today, Goals, Settings; no brand tile in the tab bar', async ({ page }) => {
      await page.setViewportSize({ width: 360, height: 740 });
      await freezeClock(page);
      for (const route of ['/today', '/goals', '/settings']) {
        await gotoHash(page, route);
        await expectNoHorizontalScroll(page);
      }
      expect(await page.locator('.mark').isVisible()).toBe(false);
    });
  });
}
