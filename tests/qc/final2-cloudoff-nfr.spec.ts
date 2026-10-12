/**
 * Final QC phase 2, project `chromium` (cloud-OFF build `--mode e2e`, port 4173):
 *  - cloud-off sweep: en/vi x 360/1440, every route with plenty of data and the clock 30 days later:
 *    no Account card, no sync chip, no sign-in banner/hint, phase-1 copy, 0 requests outside the origin,
 *    no Supabase chunk; axe, no horizontal scroll, vi scan.
 *  - NFR-03: entry + modulepreload chunks (gzip -9) of BOTH builds (cloud off: 4173, cloud on: 4174) <= 250 kB;
 *    cold #/today never fetches Recharts or the Supabase SDK chunk; cloud-on signed-out never contacts the mock.
 */
import { expect, test, type Page } from '@playwright/test';
import { gzipSync } from 'node:zlib';
import { BASE_URL, CLOUD_BASE_URL, MOCK_SUPABASE_URL } from '../../playwright.config';
import { at, EN, expectAxeClean, expectNoHorizontalScroll, expectNoViLeaks, freezeClock, gotoHash, importBackup, VI } from '../../e2e/helpers/app';

const CONFIGS = [
  { name: 'en-US 360px', locale: 'en-US', copy: EN, viewport: { width: 360, height: 740 } },
  { name: 'en-US 1440px', locale: 'en-US', copy: EN, viewport: { width: 1440, height: 900 } },
  { name: 'vi-VN 360px', locale: 'vi-VN', copy: VI, viewport: { width: 360, height: 740 } },
  { name: 'vi-VN 1440px', locale: 'vi-VN', copy: VI, viewport: { width: 1440, height: 900 } },
] as const;

for (const cfg of CONFIGS) {
  test.describe(`Final2 cloud-off sweep - ${cfg.name}`, () => {
    test.use({ locale: cfg.locale, viewport: cfg.viewport });

    test('phase-1 behaviour with a lot of data, 30 days later', async ({ page }) => {
      test.setTimeout(180_000);
      const vi = cfg.locale === 'vi-VN';
      const external: string[] = [];
      const errors: string[] = [];
      page.on('request', (r) => {
        if (!r.url().startsWith(BASE_URL)) external.push(r.url());
      });
      page.on('pageerror', (e) => errors.push(String(e)));
      await freezeClock(page);
      await importBackup(page, 'sample-backup.json', cfg.copy);
      await freezeClock(page, at('2026-11-08T10:00:00'));
      await page.reload();

      const routes = ['/today', '/goals', '/goals/new', '/review', '/settings', '/day/2026-11-07'];
      for (const route of routes) {
        await gotoHash(page, route);
        await expect(page.locator('main h1')).toBeVisible();
        await expect(page.locator('[data-testid="plus-one"][data-animate]')).toHaveCount(0, { timeout: 6_000 });
        // Nothing of phase 2 exists in this build.
        await expect(page.getByTestId('account-card')).toHaveCount(0);
        await expect(page.getByTestId('sync-indicator')).toHaveCount(0);
        await expect(page.getByTestId('login-prompt-banner')).toHaveCount(0);
        await expect(page.getByTestId('export-sign-in-hint')).toHaveCount(0);
        await expectNoHorizontalScroll(page);
        if (vi) await expectNoViLeaks(page);
        await expectAxeClean(page);
      }
      // Export does not offer sign-in either; phase-1 copy ("No account, no tracking") is kept.
      await gotoHash(page, '/settings');
      const dl = page.waitForEvent('download');
      await page.getByRole('button', { name: cfg.copy.settings.backup.export }).click();
      await dl;
      await expect(page.getByTestId('export-sign-in-hint')).toHaveCount(0);
      await expect(page.getByTestId('login-prompt-banner')).toHaveCount(0);
      const body = await page.locator('main').innerText();
      expect(body).not.toMatch(/Google|Sign in|Đăng nhập/);
      expect(external, 'requests outside the app origin').toEqual([]);
      expect(errors).toEqual([]);
    });
  });
}

interface Hit {
  url: string;
  type: string;
  gzip: number;
}

async function measureEntry(page: Page, base: string): Promise<{ entryKb: number; cssKb: number; chunks: string[] }> {
  const html = await (await page.request.get(base)).text();
  const refs = new Set<string>();
  for (const m of html.matchAll(/<script[^>]+type="module"[^>]+src="([^"]+)"/g)) refs.add(m[1]);
  for (const m of html.matchAll(/<link[^>]+rel="modulepreload"[^>]+href="([^"]+)"/g)) refs.add(m[1]);
  for (const m of html.matchAll(/<link[^>]+href="([^"]+\.css)"/g)) refs.add(m[1]);
  let total = 0;
  let css = 0;
  const chunks: string[] = [];
  for (const ref of refs) {
    const url = new URL(ref, base).toString();
    const body = await (await page.request.get(url)).body();
    const gz = gzipSync(body, { level: 9 }).length;
    if (/\.css$/.test(ref)) css += gz;
    else total += gz;
    chunks.push(`${ref} ${(gz / 1000).toFixed(1)}kB`);
  }
  return { entryKb: total / 1000, cssKb: css / 1000, chunks };
}

for (const [label, base, cloud] of [
  ['cloud OFF (4173)', BASE_URL, false],
  ['cloud ON (4174)', CLOUD_BASE_URL, true],
] as const) {
  test(`NFR-03 ${label}: entry + preload <= 250 kB gzip; cold Today fetches neither Recharts nor the SDK`, async ({ page }) => {
    const entry = await measureEntry(page, base);
    console.log(`[nfr2] ${label} entry+modulepreload JS gzip-9: ${entry.entryKb.toFixed(1)} kB (+ css ${entry.cssKb.toFixed(1)} kB) :: ${entry.chunks.join(' | ')}`);
    expect(entry.entryKb).toBeLessThanOrEqual(250);

    const hits: Hit[] = [];
    const urls: string[] = [];
    const pending: Promise<void>[] = [];
    page.on('request', (r) => urls.push(r.url()));
    page.on('response', (res) => {
      const url = res.url();
      if (!url.startsWith(base)) return;
      pending.push(
        (async () => {
          const type = res.headers()['content-type'] ?? '';
          if (!/javascript|css|html/.test(type)) return;
          const body = await res.body().catch(() => Buffer.alloc(0));
          hits.push({ url: url.replace(base, '/'), type, gzip: gzipSync(body, { level: 9 }).length });
        })(),
      );
    });
    await freezeClock(page);
    await page.goto(`${base}#/today`);
    await expect(page.locator('main h1')).toBeVisible();
    await page.waitForLoadState('networkidle');
    await Promise.all(pending);
    const first = hits.filter((h) => !/^\/(sw|workbox)/.test(h.url));
    const total = first.reduce((s, h) => s + h.gzip, 0) / 1000;
    console.log(`[nfr2] ${label} cold Today text assets gzip ${total.toFixed(1)} kB :: ${first.map((h) => `${h.url} ${(h.gzip / 1000).toFixed(1)}`).join(' | ')}`);
    expect(total).toBeLessThanOrEqual(250);
    expect(first.some((h) => /useRechartsWidth|BarChart|CurveChart/.test(h.url))).toBe(false);
    expect(urls.some((u) => /supabase-client-[^/]*\.js/.test(u)), 'SDK chunk requested on cold Today').toBe(false);
    expect(urls.filter((u) => u.startsWith(MOCK_SUPABASE_URL)), 'mock contacted while signed out').toEqual([]);
    const origin = new URL(base).origin;
    expect(urls.filter((u) => !u.startsWith(origin) && !u.startsWith('data:') && !u.startsWith('blob:')), 'requests outside the origin').toEqual([]);
    void cloud;
  });
}
