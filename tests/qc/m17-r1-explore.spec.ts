// QC round 1 (M17), project `chromium` (cloud OFF): Big goals list, nav, tab bar, lazy loading, hostile import, dark mode.
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { chooseBackupFile, EN, expectAxeClean, expectNoHorizontalScroll, expectNoViLeaks, FIXED_TIME_Q1, freezeClock, gotoHash, importBackup, ROADMAP_EN, ROADMAP_VI, toast, VI } from '../../e2e/helpers/app';
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

const navItems = (page: Page) => page.locator('.nav .item');

async function setLocale(page: Page, which: 'vi' | 'en'): Promise<void> {
  await gotoHash(page, '/settings');
  const copy = which === 'vi' ? EN : VI;
  await page.getByRole('radio', { name: (copy.settings.language.option as Record<string, string>)[which] }).check();
  await expect(page.locator('html')).toHaveAttribute('lang', which);
}

test.beforeEach(async ({ page }) => {
  await freezeClock(page, FIXED_TIME_Q1);
});

test.describe('M17 QC: list numbers, empty state, a11y, layout', () => {
  test('empty state (fresh install): explanation only, no create button, axe clean, en and vi', async ({ page }) => {
    await gotoHash(page, '/roadmaps');
    await expect(page.getByRole('heading', { level: 1, name: ROADMAP_EN.list.title })).toBeVisible();
    await expect(page.getByTestId('roadmaps-empty')).toContainText(ROADMAP_EN.list.empty);
    await expect(page.getByTestId('roadmaps-empty')).toContainText(ROADMAP_EN.list.emptyBody);
    await expect(page.getByRole('button')).toHaveCount(0);
    await expectAxeClean(page);
    await setLocale(page, 'vi');
    await gotoHash(page, '/roadmaps');
    await expect(page.getByRole('heading', { level: 1, name: ROADMAP_VI.list.title })).toBeVisible();
    await expect(page.getByTestId('roadmaps-empty')).toContainText(ROADMAP_VI.list.emptyBody);
    await expectNoViLeaks(page);
  });

  for (const [w, h] of [[360, 740], [1440, 900]] as const) {
    for (const loc of ['en', 'vi'] as const) {
      test(`Q1 list ${w}x${h} ${loc}: numbers 1/21, 5.8 h of 16 h, 125 days, no horizontal scroll, axe light+dark, nav 5 items`, async ({ page }) => {
        await page.setViewportSize({ width: w, height: h });
        await importBackup(page, 'q1-roadmap-backup.json');
        if (loc === 'vi') await setLocale(page, 'vi');
        await gotoHash(page, '/roadmaps');
        const row = page.getByTestId('roadmap-row');
        await expect(row).toHaveCount(1);
        if (loc === 'en') {
          await expect(row.getByTestId('roadmap-progress')).toHaveText('Done 1/21');
          await expect(row.getByTestId('roadmap-hours')).toHaveText('Studied 5.8 h of 16 h');
          await expect(row.getByTestId('roadmap-milestone')).toHaveText('Thi QPT: 125 days left');
          await expect(row.getByTestId('pace-chip')).toHaveText('On track');
        } else {
          await expect(row.getByTestId('roadmap-hours')).toContainText('5,8 giờ');
          await expect(row.getByTestId('roadmap-hours')).toContainText('16 giờ');
          await expect(row.getByTestId('roadmap-milestone')).toContainText('125');
          await expect(row.getByTestId('roadmap-progress')).toContainText('1/21');
          await expectNoViLeaks(page);
        }
        await expect(navItems(page)).toHaveCount(5);
        await expect(navItems(page).nth(2)).toHaveAttribute('aria-current', 'page');
        await expectNoHorizontalScroll(page);
        await expectAxeClean(page);
        await page.emulateMedia({ colorScheme: 'dark' });
        await gotoHash(page, '/roadmaps');
        await expect(row).toHaveCount(1);
        await expectNoHorizontalScroll(page);
        await expectAxeClean(page);
        // contrast of the nav labels specifically, over each main screen, dark theme
        for (const hash of ['/today', '/goals', '/review', '/settings']) {
          await gotoHash(page, hash);
          await expect(page.locator('main h1').first()).toBeVisible();
          const r = await new AxeBuilder({ page }).include('.nav').withRules(['color-contrast']).analyze();
          expect(r.violations.map((v) => v.id), `${hash} ${loc} dark`).toEqual([]);
        }
        const dir = join('test-results', 'qc-m17');
        mkdirSync(dir, { recursive: true });
        await page.screenshot({ path: join(dir, `list-${w}-${loc}-dark.png`) });
      });
    }
  }

  test('360 px vi tab bar: five labels, every label inside its tab (no clipping), at most 2 lines, height 64-65', async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 740 });
    await setLocale(page, 'vi');
    await gotoHash(page, '/today');
    const info = await page.evaluate(() => {
      const nav = document.querySelector('.nav') as HTMLElement;
      const items = Array.from(document.querySelectorAll('.nav .item')) as HTMLElement[];
      return {
        navH: nav.getBoundingClientRect().height,
        navW: nav.scrollWidth,
        clientW: nav.clientWidth,
        items: items.map((it) => {
          const r = it.getBoundingClientRect();
          const label = (it.querySelector('span:not(.ic), .label') ?? it) as HTMLElement;
          const lr = label.getBoundingClientRect();
          const lh = parseFloat(getComputedStyle(label).lineHeight) || 14;
          return { text: it.textContent?.trim(), w: r.width, lw: lr.width, overflowX: label.scrollWidth - label.clientWidth, lines: Math.round(lr.height / lh), left: r.left, right: r.right, lleft: lr.left, lright: lr.right };
        }),
      };
    });
    console.log('M17 tabbar', JSON.stringify(info));
    expect(info.navH).toBeGreaterThanOrEqual(64);
    expect(info.navH).toBeLessThanOrEqual(65);
    expect(info.navW).toBeLessThanOrEqual(info.clientW);
    expect(info.items).toHaveLength(5);
    for (const it of info.items) {
      expect(it.lines, it.text ?? '').toBeLessThanOrEqual(2);
      expect(it.lleft, it.text ?? '').toBeGreaterThanOrEqual(it.left - 0.5);
      expect(it.lright, it.text ?? '').toBeLessThanOrEqual(it.right + 0.5);
      expect(it.overflowX, it.text ?? '').toBeLessThanOrEqual(1);
    }
    expect(info.items[2].text).toBe('Mục tiêu lớn');
    await expectNoHorizontalScroll(page);
  });

  test('1024 px sidebar shows five items with Big goals third; unknown #/roadmaps/xyz and #/roadmaps/ do not crash', async ({ page }) => {
    await page.setViewportSize({ width: 1024, height: 800 });
    await gotoHash(page, '/today');
    await expect(navItems(page)).toHaveText([EN.nav.today, EN.nav.goals, EN.nav.roadmaps, EN.nav.review, EN.nav.settings]);
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    for (const h of ['/roadmaps/xyz', '/roadmaps/', '/roadmaps?x=1', '/roadmaps/new']) {
      await gotoHash(page, h);
      await expect(page.locator('main, [role="alert"]').first()).toBeVisible();
      await expect(page.locator('body')).not.toBeEmpty();
    }
    expect(errors).toEqual([]);
  });
});

test.describe('M17 QC: lazy loading and robustness', () => {
  test('cold #/today fetches no roadmap chunk, no roadmap namespace; /roadmaps then fetches both', async ({ page }) => {
    const urls: string[] = [];
    page.on('request', (r) => urls.push(r.url()));
    await gotoHash(page, '/today');
    await expect(page.getByRole('heading', { level: 1, name: EN.today.title })).toBeVisible();
    await page.waitForLoadState('networkidle');
    expect(urls.filter((u) => /roadmap/i.test(u) && !/\.(png|svg|ico)$/.test(u))).toEqual([]);
    await navItems(page).nth(2).click();
    await expect(page.getByRole('heading', { level: 1, name: ROADMAP_EN.list.title })).toBeVisible();
    expect(urls.some((u) => /Roadmaps-.*\.js/.test(u))).toBe(true);
    expect(urls.some((u) => /roadmap\.en-.*\.js/.test(u))).toBe(true);
  });

  test('hostile / oversized / malformed files via the real file input keep data and never crash', async ({ page }, testInfo) => {
    await importBackup(page, 'q1-roadmap-backup.json');
    const dir = testInfo.outputPath('files');
    mkdirSync(dir, { recursive: true });
    const big = join(dir, 'big.json');
    writeFileSync(big, '{"app":"one-percent-better","schemaVersion":2,"pad":"' + 'x'.repeat(5 * 1024 * 1024 + 10) + '"}');
    const bad = join(dir, 'bad.json');
    writeFileSync(bad, '{"app":"one-percent-better","schemaVersion":2,"goals":[],"entries":[],"settings":{},"roadmaps":[{"id":"r","title":"<img src=x onerror=alert(1)>"}]}');
    const v3 = join(dir, 'v3.json');
    writeFileSync(v3, JSON.stringify({ app: 'one-percent-better', schemaVersion: 3 }));
    await gotoHash(page, '/settings');
    for (const f of [big, bad, v3]) {
      await page.getByTestId('import-file').setInputFiles(f);
      await expect(page.getByRole('dialog')).toHaveCount(0);
      await expect(page.getByRole('alert').or(page.getByTestId('toast')).first()).toBeVisible();
    }
    await gotoHash(page, '/roadmaps');
    await expect(page.getByTestId('roadmap-row')).toHaveCount(1);
    void chooseBackupFile;
    void toast;
  });

  test('stored XSS: roadmap title with markup renders as text', async ({ page }, testInfo) => {
    const fs = await import('node:fs');
    const q = JSON.parse(fs.readFileSync(new URL('../../e2e/fixtures/q1-roadmap-backup.json', import.meta.url), 'utf8'));
    q.roadmaps[0].title = '<img src=x onerror="window.__xss=1"> <b>bold</b>';
    q.roadmaps[0].milestoneLabel = '<script>window.__xss=2</script>';
    const dir = testInfo.outputPath('xss');
    mkdirSync(dir, { recursive: true });
    const p = join(dir, 'xss.json');
    writeFileSync(p, JSON.stringify(q));
    await gotoHash(page, '/settings');
    await page.getByTestId('import-file').setInputFiles(p);
    await page.getByRole('dialog').getByRole('button', { name: EN.import.confirm }).click();
    await gotoHash(page, '/roadmaps');
    await expect(page.getByTestId('roadmap-row')).toHaveCount(1);
    expect(await page.evaluate(() => (window as unknown as { __xss?: number }).__xss)).toBeUndefined();
    await expect(page.getByTestId('roadmap-row').getByRole('heading', { level: 2 })).toContainText('<img src=x');
    expect(await page.locator('main b, main img').count()).toBe(0);
  });
});
