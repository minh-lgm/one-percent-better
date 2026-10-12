// QC M7 round 1 (project `chromium`, cloud OFF) — brand assets of commit 01898c2: manifest icons, favicon links,
// apple-touch-icon, precache, the sidebar brand mark in both themes, and phase-1 invariants of the cloud-off build.
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type APIRequestContext, type Page } from '@playwright/test';
import { EN, expectNoHorizontalScroll, freezeClock, gotoHash } from '../../e2e/helpers/app';

interface Png { width: number; height: number; colorType: number; bytes: number }
function readPng(buf: Buffer): Png {
  expect(buf.subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a');
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20), colorType: buf[25]!, bytes: buf.length };
}
async function png(request: APIRequestContext, url: string): Promise<Png> {
  const res = await request.get(url);
  expect(res.status(), url).toBe(200);
  expect(res.headers()['content-type'], url).toContain('image/png');
  return readPng(await res.body());
}

test.describe('QC brand: icons, manifest, favicon', () => {
  test('manifest icons point at real PNGs of the declared sizes (192, 512, maskable 512); maskable purpose set; background/theme colours unchanged', async ({ page, request }) => {
    await page.goto('/');
    const href = await page.locator('link[rel="manifest"]').getAttribute('href');
    expect(href).toBeTruthy();
    const manifest = (await (await request.get(new URL(href!, page.url()).toString())).json()) as {
      name: string; short_name: string; theme_color: string; background_color: string; display: string;
      icons: Array<{ src: string; sizes: string; type: string; purpose?: string }>;
    };
    expect(manifest.name).toBe('1% Better per Day');
    expect(manifest.display).toBe('standalone');
    expect(manifest.icons.map((i) => i.src)).toEqual(['icons/pwa-192.png', 'icons/pwa-512.png', 'icons/pwa-maskable-512.png']);
    for (const icon of manifest.icons) {
      const p = await png(request, new URL(icon.src, page.url()).toString());
      expect(`${p.width}x${p.height}`, icon.src).toBe(icon.sizes);
      expect(icon.type).toBe('image/png');
      // The old generated icons were 1-4 KB flat shapes; the product logo is a real image.
      expect(p.bytes, icon.src).toBeGreaterThan(10_000);
    }
    expect(manifest.icons.filter((i) => i.purpose === 'maskable')).toHaveLength(1);
    expect(manifest.icons.find((i) => i.purpose === 'maskable')!.src).toContain('maskable');
  });

  test('favicon (svg + 32 px png) and apple-touch-icon are linked, served, and have the right dimensions/alpha', async ({ page, request }) => {
    await page.goto('/');
    const links = await page.locator('link[rel~="icon"], link[rel="apple-touch-icon"]').evaluateAll((els) => els.map((e) => ({ rel: e.getAttribute('rel'), href: (e as HTMLLinkElement).href, type: e.getAttribute('type'), sizes: e.getAttribute('sizes') })));
    expect(links.map((l) => `${l.rel}|${l.type ?? ''}|${l.sizes ?? ''}`).sort()).toEqual(['apple-touch-icon||', 'icon|image/png|32x32', 'icon|image/svg+xml|'].sort());
    const svg = links.find((l) => l.type === 'image/svg+xml')!;
    const svgRes = await request.get(svg.href);
    expect(svgRes.status()).toBe(200);
    expect(svgRes.headers()['content-type']).toContain('image/svg+xml');
    expect(await svgRes.text()).toContain('<svg');
    const fav = await png(request, links.find((l) => l.sizes === '32x32')!.href);
    expect({ w: fav.width, h: fav.height }).toEqual({ w: 32, h: 32 });
    expect(fav.colorType).toBe(6); // RGBA: transparent background
    const touch = await png(request, links.find((l) => l.rel === 'apple-touch-icon')!.href);
    expect({ w: touch.width, h: touch.height }).toEqual({ w: 180, h: 180 });
    expect(touch.colorType === 2 || touch.colorType === 6).toBe(true);
    const mark = await png(request, new URL('/brand-mark-96.png', page.url()).toString());
    expect({ w: mark.width, h: mark.height }).toEqual({ w: 96, h: 96 });
    expect(mark.colorType).toBe(6);
  });

  test('the service worker precaches every brand file and the shell works offline with the mark visible', async ({ page, context, request }) => {
    const sw = await (await request.get('/sw.js')).text();
    for (const f of ['icons/pwa-192.png', 'icons/pwa-512.png', 'icons/pwa-maskable-512.png', 'apple-touch-icon.png', 'favicon.svg', 'favicon-32.png', 'brand-mark-96.png']) expect(sw, f).toContain(f);
    await page.setViewportSize({ width: 1440, height: 900 });
    await freezeClock(page);
    await gotoHash(page, '/today');
    await page.evaluate(() => navigator.serviceWorker.ready);
    await page.waitForFunction(() => Boolean(navigator.serviceWorker.controller), undefined, { timeout: 30_000 }).catch(async () => {
      await page.reload();
      await page.waitForFunction(() => Boolean(navigator.serviceWorker.controller), undefined, { timeout: 30_000 });
    });
    const cached = await page.evaluate(async () => {
      const urls: string[] = [];
      for (const name of await caches.keys()) for (const req of await (await caches.open(name)).keys()) urls.push(new URL(req.url).pathname);
      return urls;
    });
    for (const f of ['/brand-mark-96.png', '/favicon-32.png', '/apple-touch-icon.png', '/icons/pwa-512.png', '/icons/pwa-192.png', '/icons/pwa-maskable-512.png']) expect(cached, f).toContain(f);
    await context.setOffline(true);
    await page.reload();
    const img = page.locator('.mark img');
    await expect(img).toBeVisible();
    expect(await img.evaluate((i: HTMLImageElement) => i.complete && i.naturalWidth)).toBe(96);
    await context.setOffline(false);
  });
});

async function markBox(page: Page) {
  return page.locator('.mark').evaluate((el) => {
    const r = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    const img = el.querySelector('img') as HTMLImageElement;
    const ir = img.getBoundingClientRect();
    return { w: r.width, h: r.height, bg: cs.backgroundColor, radius: cs.borderRadius, imgW: ir.width, imgH: ir.height, loaded: img.complete && img.naturalWidth === 96, alt: img.getAttribute('alt'), hidden: el.getAttribute('aria-hidden'), display: cs.display, visible: r.width > 0 && r.height > 0 };
  });
}

for (const scheme of ['light', 'dark'] as const) {
  test.describe(`QC brand mark (${scheme})`, () => {
    test.use({ colorScheme: scheme });

    test('1440 px: sidebar mark is a 32 px white tile with the 28 px logo (decorative, aria-hidden), nav name kept, axe clean, no h-scroll', async ({ page }, testInfo) => {
      await page.setViewportSize({ width: 1440, height: 900 });
      await freezeClock(page);
      await gotoHash(page, '/today');
      const m = await markBox(page);
      expect(m).toMatchObject({ w: 32, h: 32, bg: 'rgb(255, 255, 255)', loaded: true, alt: '', hidden: 'true', visible: true });
      expect(m.imgW).toBeGreaterThanOrEqual(27);
      expect(m.imgW).toBeLessThanOrEqual(28.5);
      expect(parseFloat(m.radius)).toBeGreaterThanOrEqual(8);
      await expect(page.getByRole('link', { name: EN.app.name })).toBeVisible(); // accessible name of the brand link
      await expect(page.locator('.mark img')).toHaveAccessibleName('');
      await expectNoHorizontalScroll(page);
      const axe = await new AxeBuilder({ page }).analyze();
      expect(axe.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical').map((v) => v.id)).toEqual([]);
      await page.screenshot({ path: testInfo.outputPath(`brand-1440-${scheme}.png`), clip: { x: 0, y: 0, width: 420, height: 160 } });
    });

    test('360 px: no brand mark in the tab-bar layout, no horizontal scroll, nav height unchanged; 1023 px still tab bar, 1024 px sidebar with the mark', async ({ page }, testInfo) => {
      await page.setViewportSize({ width: 360, height: 740 });
      await freezeClock(page);
      await gotoHash(page, '/today');
      expect(await page.locator('.mark').isVisible()).toBe(false);
      await expectNoHorizontalScroll(page);
      const nav = await page.getByRole('navigation').first().boundingBox();
      expect(nav!.height).toBeLessThanOrEqual(64);
      await page.screenshot({ path: testInfo.outputPath(`brand-360-${scheme}.png`) });
      await page.setViewportSize({ width: 1023, height: 800 });
      expect(await page.locator('.mark').isVisible()).toBe(false);
      await page.setViewportSize({ width: 1024, height: 800 });
      expect(await page.locator('.mark').isVisible()).toBe(true);
      expect((await markBox(page)).loaded).toBe(true);
    });
  });
}

test.describe('QC cloud-off build invariants after M7 (phase-1 behaviour)', () => {
  test('whole app, no network beyond the origin; no Account card, no sync chip/status row; no `sync` kv row; the soft-deleted rows never reach Export', async ({ page }) => {
    const external: string[] = [];
    page.on('request', (r) => {
      if (!r.url().startsWith('http://localhost:4173')) external.push(r.url());
    });
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await freezeClock(page);
    await gotoHash(page, '/goals/new');
    await page.getByLabel(/^Name/).fill('Read');
    await page.getByRole('textbox', { name: /^Minutes per day/ }).fill('30');
    await page.getByRole('button', { name: EN.goal.form.save }).click();
    await gotoHash(page, '/today');
    await page.getByRole('article', { name: 'Read' }).getByRole('button', { name: EN.goalCard.logTime }).click();
    await page.getByRole('article', { name: 'Read' }).getByLabel(new RegExp(`^${EN.entry.form.minutesLabel}`)).fill('10');
    await page.getByRole('article', { name: 'Read' }).getByRole('button', { name: EN.entry.form.save }).click();
    for (const route of ['/today', '/goals', '/review', '/settings']) {
      await gotoHash(page, route);
      await expect(page.getByTestId('sync-indicator')).toHaveCount(0);
      await expect(page.getByTestId('account-card')).toHaveCount(0);
      await expect(page.getByRole('button', { name: EN.auth.signInGoogle })).toHaveCount(0);
      await expect(page.getByTestId('status-row')).toHaveCount(0);
    }
    // delete the goal: soft delete keeps tombstones, Export must not show them
    await gotoHash(page, '/goals');
    await page.getByRole('button', { name: EN.common.delete }).click();
    await page.getByRole('dialog').getByRole('button', { name: EN.goal.delete.confirm }).click();
    await gotoHash(page, '/settings');
    const download = page.waitForEvent('download');
    await page.getByRole('button', { name: EN.settings.backup.export }).click();
    const text = await (await import('node:fs/promises')).readFile((await (await download).path())!, 'utf8');
    const file = JSON.parse(text) as { goals: unknown[]; entries: unknown[] };
    expect(file.goals).toEqual([]);
    expect(file.entries).toEqual([]);
    expect(await page.evaluate(() => localStorage.length)).toBe(0);
    const keys = await page.evaluate(
      () =>
        new Promise<string[]>((resolve, reject) => {
          const req = indexedDB.open('one-percent-better');
          req.onerror = () => reject(req.error);
          req.onsuccess = () => {
            const k = req.result.transaction('kv').objectStore('kv').getAllKeys();
            k.onsuccess = () => {
              req.result.close();
              resolve(k.result as string[]);
            };
          };
        }),
    );
    expect(keys).not.toContain('sync');
    expect(external).toEqual([]);
    expect(errors).toEqual([]);
  });
});
