// QC M7 round 1 — brand assets under the GitHub Pages sub-path (/one-percent-better/), cloud build.
import { expect, test } from '../../../e2e/cloud/fixtures';
import { CLOUD_BASE_URL } from '../../../e2e/cloud/helpers';

test('index.html, manifest and the service worker reference the brand files under the sub-path and all of them are served', async ({ page, request }) => {
  await page.goto('');
  const urls = await page.locator('link[rel~="icon"], link[rel="apple-touch-icon"], link[rel="manifest"]').evaluateAll((els) => els.map((e) => (e as HTMLLinkElement).href));
  expect(urls.length).toBe(4);
  for (const u of urls) {
    expect(u.startsWith(CLOUD_BASE_URL), u).toBe(true);
    expect((await request.get(u)).status(), u).toBe(200);
  }
  const manifest = (await (await request.get(new URL('manifest.webmanifest', CLOUD_BASE_URL).toString())).json()) as { start_url: string; scope: string; icons: Array<{ src: string }> };
  expect(manifest.start_url).toBe('/one-percent-better/');
  expect(manifest.scope).toBe('/one-percent-better/');
  for (const i of manifest.icons) expect((await request.get(new URL(i.src, CLOUD_BASE_URL).toString())).status(), i.src).toBe(200);
  expect((await request.get(new URL('brand-mark-96.png', CLOUD_BASE_URL).toString())).status()).toBe(200);
  const sw = await (await request.get(new URL('sw.js', CLOUD_BASE_URL).toString())).text();
  for (const f of ['brand-mark-96.png', 'favicon-32.png', 'icons/pwa-512.png']) expect(sw, f).toContain(f);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('#/today');
  const img = page.locator('.mark img');
  await expect(img).toBeVisible();
  expect(await img.evaluate((i: HTMLImageElement) => i.src)).toBe(`${CLOUD_BASE_URL}brand-mark-96.png`);
  expect(await img.evaluate((i: HTMLImageElement) => i.complete && i.naturalWidth)).toBe(96);
});
