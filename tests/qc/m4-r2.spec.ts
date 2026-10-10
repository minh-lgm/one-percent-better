// QC round 2 (M4): verify the round-1 fixes (D2 widths, D4 separator, D3 title in the real browser) and
// guard against regressions around them. Data arrives through the real Import UI.
import { expect, test } from '@playwright/test';
import { EN, expectNoHorizontalScroll, gotoHash, importBackup } from '../../e2e/helpers/app';

test.describe('M4 round 2: fixes', () => {
  test('M4-D4: "In 2026 · Whole goal: 4.0 h" has a real space on both sides of the dot, at 360 and 768 px (en)', async ({ page }) => {
    for (const width of [360, 768]) {
      await page.setViewportSize({ width, height: 900 });
      await importBackup(page);
      await gotoHash(page, '/review?goal=g1&year=2026');
      const sub = page.getByTestId('stat-time').locator('.sub');
      await expect(sub).toContainText('Whole goal: 4.0 h');
      const text = await sub.evaluate((el) => (el as HTMLElement).innerText);
      expect(text.replace(/\s+/g, ' ').trim(), `width ${width}`).toBe('In 2026 · Whole goal: 4.0 h');
      const textContent = await sub.evaluate((el) => el.textContent ?? '');
      expect(textContent).toContain('2026 · Whole goal');
    }
  });

  for (const [width, label] of [[1200, '1200'], [1280, '1280'], [1440, '1440'], [1920, '1920']] as const) {
    test(`M4-D2: ${label}px heatmap fits without scrolling, main is class wide and <= 960 px, other screens are not wide`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await importBackup(page);
      await gotoHash(page, '/review');
      await expect(page.getByTestId('heatmap-scroll')).toBeVisible();
      const m = await page.evaluate(() => {
        const s = document.querySelector('[data-testid="heatmap-scroll"]')!;
        const main = document.querySelector('main')!;
        return { cls: main.className, w: main.getBoundingClientRect().width, hidden: s.scrollWidth - s.clientWidth, scrollLeft: s.scrollLeft };
      });
      expect(m.cls).toContain('wide');
      expect(m.w).toBeLessThanOrEqual(960);
      expect(m.hidden).toBeLessThanOrEqual(2);
      await expectNoHorizontalScroll(page);
      for (const hash of ['/today', '/goals', '/settings']) {
        await gotoHash(page, hash);
        expect(await page.evaluate(() => document.querySelector('main')!.className)).not.toContain('wide');
      }
      // leaving and coming back keeps (and re-adds) the wide class
      await gotoHash(page, '/review');
      await expect(page.locator('main.wide')).toHaveCount(1);
    });
  }

  // 1024-1191 px: sidebar 232 px leaves < 960 px of content, so the heatmap scrolls inside its own box (DESIGN 6: "tablet vẫn có thể cuộn"); page must not scroll.
  test('M4-D2: below 1200 px (1024, 768, 360) the narrow heatmap still scrolls internally only and the page does not scroll sideways', async ({ page }) => {
    for (const width of [360, 768, 1024, 1100]) {
      await page.setViewportSize({ width, height: 900 });
      await importBackup(page);
      await gotoHash(page, '/review');
      await expect(page.getByTestId('heatmap-scroll')).toBeVisible();
      await expectNoHorizontalScroll(page);
    }
  });

  test('M4-D3 (browser side): document.title follows every route including Review and its goal select', async ({ page }) => {
    await importBackup(page);
    await gotoHash(page, '/review');
    await expect(page).toHaveTitle(`${EN.review.title} — 1% Better`);
    await gotoHash(page, '/review?goal=g1&year=2026');
    await expect(page).toHaveTitle(`${EN.review.title} — 1% Better`);
    await gotoHash(page, '/goals/g2');
    await expect(page).toHaveTitle('Guitar — 1% Better');
  });
});
