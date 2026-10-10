/**
 * Final QC: NFR-03 measured on the preview. Cold first load of #/today: sum of gzip
 * sizes of every JS/CSS/HTML response must stay <= 250 kB and no Recharts chunk may
 * be requested; Review and Goal detail load the charts lazily.
 */
import { expect, test } from '@playwright/test';
import { gzipSync } from 'node:zlib';
import { BASE_URL } from '../../playwright.config';
import { freezeClock, gotoHash, importBackup } from '../../e2e/helpers/app';

interface Hit {
  url: string;
  type: string;
  gzip: number;
  raw: number;
}

test('NFR-03: cold #/today transfers <= 250 kB gzip and never fetches Recharts; charts are lazy', async ({ page }) => {
  const hits: Hit[] = [];
  const external: string[] = [];
  const pending: Promise<void>[] = [];
  page.on('request', (r) => {
    if (!r.url().startsWith(BASE_URL)) external.push(r.url());
  });
  page.on('response', (res) => {
    const url = res.url();
    if (!url.startsWith(BASE_URL)) return;
    pending.push(
      (async () => {
        const type = res.headers()['content-type'] ?? '';
        if (!/javascript|css|html/.test(type)) return;
        const body = await res.body().catch(() => Buffer.alloc(0));
        hits.push({ url: url.replace(BASE_URL, ''), type, raw: body.length, gzip: gzipSync(body, { level: 9 }).length });
      })(),
    );
  });
  await freezeClock(page);
  await gotoHash(page, '/today');
  await expect(page.getByRole('heading', { level: 1, name: 'Today' })).toBeVisible();
  await page.waitForLoadState('networkidle');
  await Promise.all(pending);
  const first = hits.filter((h) => !/^\/(sw|workbox)/.test(h.url));
  const total = first.reduce((s, h) => s + h.gzip, 0);
  const js = first.filter((h) => /javascript/.test(h.type)).reduce((s, h) => s + h.gzip, 0);
  console.log('[nfr] cold today requests:', JSON.stringify(first.map((h) => `${h.url} ${(h.gzip / 1000).toFixed(1)}kB`)));
  console.log(`[nfr] cold today JS gzip ${(js / 1000).toFixed(1)} kB, all text assets gzip ${(total / 1000).toFixed(1)} kB`);
  expect(total).toBeLessThanOrEqual(250_000);
  expect(first.some((h) => /useRechartsWidth|BarChart|CurveChart/.test(h.url))).toBe(false);

  // Lazy chunks appear only on Review / Goal detail.
  hits.length = 0;
  await importBackup(page);
  await gotoHash(page, '/review');
  await expect(page.getByTestId('chart-weekly').locator('svg.recharts-surface')).toBeVisible();
  await Promise.all(pending);
  expect(hits.some((h) => /useRechartsWidth/.test(h.url))).toBe(true);
  expect(external).toEqual([]);
});
