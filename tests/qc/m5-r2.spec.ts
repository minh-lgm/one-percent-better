// QC round 2 (M5): verification of the round-1 fixes M5-D1 (no "Goal not found" flash when deleting from
// Goal detail) and M5-D3 (Range segments have horizontal padding), plus a few extra probes around the fixes.
import { expect, test, type Page } from '@playwright/test';
import { EN, expectNoHorizontalScroll, gotoHash, importBackup, toast, VI } from '../../e2e/helpers/app';

const NOT_FOUND = [EN.notFound.goalTitle, VI.notFound.goalTitle];

async function installFlashSampler(page: Page): Promise<void> {
  await page.evaluate((titles) => {
    const w = window as unknown as { __seen: string[] };
    w.__seen = [];
    const check = () => {
      for (const h of Array.from(document.querySelectorAll('h1'))) if (titles.includes(h.textContent ?? '')) w.__seen.push(`${h.textContent}@${location.hash}`);
    };
    new MutationObserver(check).observe(document.body, { childList: true, subtree: true, characterData: true });
    const tick = () => {
      check();
      requestAnimationFrame(tick);
    };
    tick();
  }, NOT_FOUND);
}

test.describe('M5-D1 delete from Goal detail', () => {
  for (const rate of [1, 4, 6]) {
    test(`en: no "Goal not found" frame or DOM mutation, toast shown, lands on Goals (CPU x${rate})`, async ({ page }) => {
      const errors: string[] = [];
      page.on('pageerror', (e) => errors.push(e.message));
      page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
      await importBackup(page);
      await gotoHash(page, '/goals/g1');
      await expect(page.getByTestId('headline')).toBeVisible();
      const cdp = await page.context().newCDPSession(page);
      await cdp.send('Emulation.setCPUThrottlingRate', { rate });
      await installFlashSampler(page);
      await page.getByRole('button', { name: EN.common.delete }).click();
      await page.getByRole('dialog').getByRole('button', { name: EN.goal.delete.confirm }).click();
      await expect(page).toHaveURL(/#\/goals$/);
      await expect(page.getByRole('heading', { level: 1, name: EN.goals.title })).toBeVisible();
      await expect(toast(page)).toHaveText(EN.toast.goalDeleted);
      await page.waitForTimeout(400);
      expect(await page.evaluate(() => (window as unknown as { __seen: string[] }).__seen)).toEqual([]);
      const focusInfo = await page.evaluate(() => document.activeElement?.tagName ?? 'none');
      expect(['H1', 'MAIN', 'BODY']).toContain(focusInfo);
      expect(errors).toEqual([]);
    });
  }

  test('vi: no "Không tìm thấy" flash when deleting (CPU x4)', async ({ browser }) => {
    const ctx = await browser.newContext({ timezoneId: 'Asia/Ho_Chi_Minh', locale: 'vi-VN', baseURL: 'http://localhost:4173' });
    const page = await ctx.newPage();
    await importBackup(page, 'sample-backup.json', VI);
    await gotoHash(page, '/goals/g1');
    await expect(page.getByTestId('headline')).toBeVisible();
    const cdp = await ctx.newCDPSession(page);
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
    await installFlashSampler(page);
    await page.getByRole('button', { name: VI.common.delete }).click();
    await page.getByRole('dialog').getByRole('button', { name: VI.goal.delete.confirm }).click();
    await expect(page).toHaveURL(/#\/goals$/);
    await expect(page.getByRole('heading', { level: 1, name: VI.goals.title })).toBeVisible();
    await page.waitForTimeout(400);
    expect(await page.evaluate(() => (window as unknown as { __seen: string[] }).__seen)).toEqual([]);
    await ctx.close();
  });

  test('opening a deleted goal URL afterwards still shows Goal not found (the flag is not sticky)', async ({ page }) => {
    await importBackup(page);
    await gotoHash(page, '/goals/g1');
    await page.getByRole('button', { name: EN.common.delete }).click();
    await page.getByRole('dialog').getByRole('button', { name: EN.goal.delete.confirm }).click();
    await expect(page).toHaveURL(/#\/goals$/);
    await gotoHash(page, '/goals/g1');
    await expect(page.getByRole('heading', { level: 1, name: EN.notFound.goalTitle })).toBeVisible();
  });

  test('cancel in D2 keeps the goal; a later deletion from another tab shows Goal not found here (deleting flag not stuck)', async ({ page }) => {
    await importBackup(page);
    await gotoHash(page, '/goals/g1');
    await page.getByRole('button', { name: EN.common.delete }).click();
    await page.getByRole('dialog').getByRole('button', { name: EN.common.cancel }).click();
    await expect(page.getByTestId('headline')).toBeVisible();
    const other = await page.context().newPage();
    await other.goto('/#/goals/g1');
    await other.getByRole('button', { name: EN.common.delete }).click();
    await other.getByRole('dialog').getByRole('button', { name: EN.goal.delete.confirm }).click();
    await expect(other).toHaveURL(/#\/goals$/);
    await expect(page.getByRole('heading', { level: 1, name: EN.notFound.goalTitle })).toBeVisible();
  });
});

test.describe('M5-D3 Range segment padding', () => {
  for (const [label, locale, copy] of [['en', 'en-US', EN], ['vi', 'vi-VN', VI]] as const) {
    for (const width of [360, 768, 1440]) {
      test(`${label} ${width}px: each Range segment has 14px side padding, label fits, no horizontal scroll`, async ({ browser }) => {
        const ctx = await browser.newContext({ timezoneId: 'Asia/Ho_Chi_Minh', locale, baseURL: 'http://localhost:4173', viewport: { width, height: 800 } });
        const page = await ctx.newPage();
        await importBackup(page, 'sample-backup.json', copy);
        await gotoHash(page, '/goals/g1');
        await expect(page.getByTestId('headline')).toBeVisible();
        const spans = page.locator('.seg.range span');
        expect(await spans.count()).toBe(2);
        const rows = await spans.evaluateAll((els) =>
          els.map((el) => {
            const cs = getComputedStyle(el);
            const r = document.createRange();
            r.selectNodeContents(el);
            const text = r.getBoundingClientRect();
            const box = el.getBoundingClientRect();
            return {
              text: el.textContent,
              pl: parseFloat(cs.paddingLeft),
              pr: parseFloat(cs.paddingRight),
              scrollWidth: el.scrollWidth,
              clientWidth: el.clientWidth,
              boxW: Math.round(box.width * 10) / 10,
              gapL: Math.round((text.left - box.left) * 10) / 10,
              gapR: Math.round((box.right - text.right) * 10) / 10,
            };
          }),
        );
        console.log(`[D3 ${label} ${width}] ${JSON.stringify(rows)}`);
        for (const r of rows) {
          expect(r.pl).toBeGreaterThanOrEqual(14);
          expect(r.pr).toBeGreaterThanOrEqual(14);
          expect(r.scrollWidth).toBeLessThanOrEqual(r.clientWidth);
          expect(r.gapL).toBeGreaterThanOrEqual(13);
          expect(r.gapR).toBeGreaterThanOrEqual(13);
        }
        await expectNoHorizontalScroll(page);
        await page.getByRole('radio', { name: copy.goal.detail.rangeSoFar }).check();
        await page.getByRole('radio', { name: copy.goal.detail.rangeWhole }).check();
        await ctx.close();
      });
    }
  }
});
