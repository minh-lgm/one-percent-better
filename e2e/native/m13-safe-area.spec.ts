// M13-AC5 in Chromium: the safe-area tokens are 0 in a browser (nothing moves), and emulating iPhone 16 Pro Max
// insets by overriding `--safe-top: 62px; --safe-bottom: 34px` on :root (the same trick the store screenshots use,
// DESIGN 7.8.8) grows the tab bar, pushes the header down and lifts the toasts; `body.keyboard-open` hides the
// tab bar (DESIGN "Native shell" 4–5). Static CSS checks live in src/test/safe-area.test.ts.
import { expect, test, type Page } from '@playwright/test';
import { freezeClock } from '../helpers/app';

test.use({ viewport: { width: 390, height: 844 } });

async function metrics(page: Page) {
  return page.evaluate(() => {
    const nav = document.querySelector('.nav') as HTMLElement;
    const main = document.querySelector('main') as HTMLElement;
    const html = getComputedStyle(document.documentElement);
    return {
      navHeight: nav.getBoundingClientRect().height,
      navPaddingBottom: getComputedStyle(nav).paddingBottom,
      mainPaddingTop: getComputedStyle(main).paddingTop,
      mainPaddingBottom: getComputedStyle(main).paddingBottom,
      safeTop: html.getPropertyValue('--safe-top').trim(),
      overscrollHtml: html.overscrollBehavior,
      overscrollBody: getComputedStyle(document.body).overscrollBehavior,
      navDisplay: getComputedStyle(nav).display,
    };
  });
}

test.describe('M13 safe area (native build in Chromium, 390×844)', () => {
  test('tokens are 0 in a browser; emulated insets move the tab bar, header and toast region; keyboard-open hides the tab bar', async ({ page }) => {
    await freezeClock(page);
    await page.goto('/');
    await expect(page.locator('main h1')).toBeVisible();

    const before = await metrics(page);
    expect(before.navHeight).toBeGreaterThanOrEqual(56); // 56 px items (+ 1 px top border)
    expect(before.navHeight).toBeLessThanOrEqual(57);
    expect(before.navPaddingBottom).toBe('0px');
    expect(before.mainPaddingTop).toBe('16px');
    expect(before.overscrollHtml).toBe('none');
    expect(before.overscrollBody).toBe('none');
    expect(['env(safe-area-inset-top, 0px)', '0px']).toContain(before.safeTop);

    await page.evaluate(() => {
      document.documentElement.style.setProperty('--safe-top', '62px');
      document.documentElement.style.setProperty('--safe-bottom', '34px');
    });
    const after = await metrics(page);
    expect(after.navHeight).toBe(before.navHeight + 34);
    expect(after.navPaddingBottom).toBe('34px');
    expect(after.mainPaddingTop).toBe('78px'); // 16 + 62
    expect(Number.parseFloat(after.mainPaddingBottom)).toBe(Number.parseFloat(before.mainPaddingBottom) + 34);

    // The tab bar stays fully inside the viewport and its items sit above the emulated Home indicator.
    const nav = await page.locator('.nav').boundingBox();
    expect(nav!.y + nav!.height).toBe(844);
    const firstItem = await page.locator('.nav .item').first().boundingBox();
    expect(firstItem!.y + firstItem!.height).toBeLessThanOrEqual(844 - 34);

    // Toast region bottom = tab bar (56) + inset (34) + 12.
    const toastBottom = await page.evaluate(() => {
      const el = document.createElement('div');
      el.className = 'toast-region';
      document.body.append(el);
      const value = getComputedStyle(el).bottom;
      el.remove();
      return value;
    });
    expect(toastBottom).toBe('102px');

    await page.evaluate(() => document.body.classList.add('keyboard-open'));
    expect((await metrics(page)).navDisplay).toBe('none');
    await page.evaluate(() => document.body.classList.remove('keyboard-open'));
    expect((await metrics(page)).navDisplay).not.toBe('none');
  });

  test('bottom sheet respects the top inset (max-height) and the bottom inset (padding)', async ({ page }) => {
    await freezeClock(page);
    await page.goto('/');
    await page.evaluate(() => {
      document.documentElement.style.setProperty('--safe-top', '62px');
      document.documentElement.style.setProperty('--safe-bottom', '34px');
    });
    const sheet = await page.evaluate(() => {
      const el = document.createElement('dialog');
      el.className = 'dialog';
      document.body.append(el);
      const cs = getComputedStyle(el);
      const value = { maxHeight: cs.maxHeight, paddingBottom: cs.paddingBottom };
      el.remove();
      return value;
    });
    expect(sheet.maxHeight).toBe(`${844 - 16 - 62}px`);
    expect(sheet.paddingBottom).toBe('58px'); // 24 + 34
  });
});
