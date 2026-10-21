// QC M13 round 1 — the native shell (status bar, launch image, keyboard class, safe area) driven through a recording
// fake of the Capacitor iOS bridge, with the REAL adapters in src/integration/native/** and the REAL CSS.
// Nothing here touches a real iPhone: how it looks and feels stays NOT VERIFIED (NV-13).
import { expect, test, type Page } from '@playwright/test';
import { createGoal, EN, expectAxeClean, expectNoHorizontalScroll, freezeClock, gotoHash, VI } from '../../../e2e/helpers/app';

interface BridgeCall {
  plugin: string;
  method: string;
  options: Record<string, unknown>;
  at: number;
  rootChildren: number;
  rootText: number;
}

declare global {
  interface Window {
    __qc13: { calls: BridgeCall[]; fire: (event: string) => void; listeners: Array<{ id: number; event: string; plugin: string }>; removed: number[] };
  }
}

/** Plugins present on the fake runtime: StatusBar, SplashScreen, Keyboard (optional), App (resume). */
async function emulateIos(page: Page, opts: { keyboardPlugin?: boolean } = {}): Promise<void> {
  await page.addInitScript(
    (o) => {
      const w = window as unknown as Record<string, unknown>;
      const calls: BridgeCall[] = [];
      const callbacks = new Map<number, { event: string; plugin: string; cb: (data: unknown) => void }>();
      let nextId = 1;
      const record = (plugin: string, method: string, options: Record<string, unknown>) => {
        const root = document.getElementById('root');
        calls.push({
          plugin,
          method,
          options: JSON.parse(JSON.stringify(options ?? {})),
          at: Math.round(performance.now()),
          rootChildren: root ? root.childElementCount : -1,
          rootText: root ? (root.textContent ?? '').length : -1,
        });
      };
      const qc = {
        calls,
        removed: [] as number[],
        listeners: [] as Array<{ id: number; event: string; plugin: string }>,
        fire(event: string) {
          for (const l of callbacks.values()) if (l.event === event) l.cb({});
        },
      };
      w.__qc13 = qc;
      w.webkit = { messageHandlers: { bridge: { postMessage() {} } } };
      const headers: unknown[] = [
        { name: 'StatusBar', methods: [{ name: 'setStyle', rtype: 'promise' }] },
        { name: 'SplashScreen', methods: [{ name: 'hide', rtype: 'promise' }] },
        {
          name: 'App',
          methods: [
            { name: 'addListener', rtype: 'callback' },
            { name: 'removeListener', rtype: 'promise' },
          ],
        },
      ];
      if (o.keyboardPlugin) {
        headers.push({
          name: 'Keyboard',
          methods: [
            { name: 'addListener', rtype: 'callback' },
            { name: 'removeListener', rtype: 'promise' },
          ],
        });
      }
      w.Capacitor = {
        PluginHeaders: headers,
        nativePromise(plugin: string, method: string, options: Record<string, unknown>) {
          record(plugin, method, options);
          if (method === 'removeListener') qc.removed.push(Number((options as { callbackId?: number }).callbackId));
          return Promise.resolve({});
        },
        nativeCallback(plugin: string, method: string, options: Record<string, unknown>, cb: (data: unknown) => void) {
          record(plugin, method, options);
          const id = nextId++;
          const event = String(options.eventName);
          callbacks.set(id, { event, plugin, cb });
          qc.listeners.push({ id, event, plugin });
          return id;
        },
      };
    },
    { keyboardPlugin: opts.keyboardPlugin ?? true },
  );
}

const calls = (page: Page, plugin: string, method?: string) =>
  page.evaluate(([p, m]) => window.__qc13.calls.filter((c) => c.plugin === p && (!m || c.method === m)), [plugin, method ?? ''] as const);

function watchErrors(page: Page) {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  return errors;
}

test.describe('M13 QC: status bar follows the effective theme (M13-AC5)', () => {
  test('light scheme -> LIGHT (dark text); switching to dark -> DARK (light text); back -> LIGHT; one call per change', async ({ page }) => {
    const errors = watchErrors(page);
    await page.emulateMedia({ colorScheme: 'light' });
    await emulateIos(page);
    await freezeClock(page);
    await page.goto('/');
    await expect(page.locator('main h1')).toBeVisible();
    await expect.poll(async () => (await calls(page, 'StatusBar', 'setStyle')).length).toBe(1);
    expect((await calls(page, 'StatusBar', 'setStyle'))[0].options).toEqual({ style: 'LIGHT' });

    await page.emulateMedia({ colorScheme: 'dark' });
    await expect.poll(async () => (await calls(page, 'StatusBar', 'setStyle')).length).toBe(2);
    expect((await calls(page, 'StatusBar', 'setStyle'))[1].options).toEqual({ style: 'DARK' });
    // The page really is dark at that moment (the status bar text and the page agree).
    expect(await page.evaluate(() => getComputedStyle(document.body).backgroundColor)).toBe('rgb(18, 21, 19)'); // #121513

    await page.emulateMedia({ colorScheme: 'light' });
    await expect.poll(async () => (await calls(page, 'StatusBar', 'setStyle')).length).toBe(3);
    expect((await calls(page, 'StatusBar', 'setStyle'))[2].options).toEqual({ style: 'LIGHT' });
    expect(await page.evaluate(() => getComputedStyle(document.body).backgroundColor)).toBe('rgb(247, 246, 242)'); // #F7F6F2
    expect(errors).toEqual([]);
  });

  test('starts in dark -> first call is DARK', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'dark' });
    await emulateIos(page);
    await page.goto('/');
    await expect.poll(async () => (await calls(page, 'StatusBar', 'setStyle')).length).toBe(1);
    expect((await calls(page, 'StatusBar', 'setStyle'))[0].options).toEqual({ style: 'DARK' });
  });
});

test.describe('M13 QC: launch image is hidden once, after the first render (M13-AC4)', () => {
  test('SplashScreen.hide is called exactly once, after React has rendered, and not again', async ({ page }) => {
    const errors = watchErrors(page);
    await emulateIos(page);
    await page.goto('/');
    await expect(page.locator('main h1')).toBeVisible();
    await expect.poll(async () => (await calls(page, 'SplashScreen', 'hide')).length).toBe(1);
    const hide = (await calls(page, 'SplashScreen', 'hide'))[0];
    expect(hide.rootChildren).toBeGreaterThan(0); // the app had been committed when the launch image went away
    expect(hide.rootText).toBeGreaterThan(20);
    expect(hide.at).toBeLessThan(2900); // by the first render, not by the 3 s fallback
    // Not again: wait past the 3 s fallback, navigate inside the SPA, change theme.
    await page.waitForTimeout(3500);
    await gotoHash(page, '/settings');
    await page.emulateMedia({ colorScheme: 'dark' });
    await page.waitForTimeout(300);
    expect(await calls(page, 'SplashScreen', 'hide')).toHaveLength(1);
    expect(errors).toEqual([]);
  });

  test('web (no Capacitor runtime): no bridge at all', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('main h1')).toBeVisible();
    expect(await page.evaluate(() => (window as unknown as { __qc13?: unknown }).__qc13)).toBeUndefined();
  });

  test('M13-D1: storage unavailable (S8) on the native app — the launch image must not stay over the error page', async ({ page }) => {
    test.fail(true, 'M13-D1: main.tsx returns on the bootstrap failure before startApp, so neither SplashScreen.hide() nor the 3 s fallback is ever armed');
    await emulateIos(page);
    await page.addInitScript(() => Object.defineProperty(window, 'indexedDB', { configurable: true, get: () => undefined }));
    await page.goto('/');
    await expect(page.getByRole('heading', { level: 1, name: EN.storageError.title })).toBeVisible();
    // With launchAutoHide:false the native launch image covers the web view until SplashScreen.hide() is called.
    // The plan promises a 3 s fallback; allow 4 s.
    await expect
      .poll(async () => (await calls(page, 'SplashScreen', 'hide')).length, { timeout: 4000, message: 'SplashScreen.hide() was never called on the S8 page' })
      .toBeGreaterThanOrEqual(1);
  });
});

test.describe('M13 QC: keyboard class (OQ-D25) and a runtime without the Keyboard plugin', () => {
  test('keyboardWillShow hides the tab bar, keyboardWillHide shows it; the listeners are the two Keyboard events', async ({ page }) => {
    const errors = watchErrors(page);
    await emulateIos(page);
    await page.goto('/');
    await expect(page.locator('main h1')).toBeVisible();
    const kb = await page.evaluate(() =>
      window.__qc13.listeners
        .filter((l) => l.plugin === 'Keyboard')
        .map((l) => l.event)
        .sort(),
    );
    expect(kb).toEqual(['keyboardWillHide', 'keyboardWillShow']);
    await expect(page.locator('.nav')).toBeVisible();
    await page.evaluate(() => window.__qc13.fire('keyboardWillShow'));
    await expect(page.locator('body')).toHaveClass(/keyboard-open/);
    await expect(page.locator('.nav')).toBeHidden();
    // Repeated show does not stack; one hide is enough.
    await page.evaluate(() => window.__qc13.fire('keyboardWillShow'));
    await page.evaluate(() => window.__qc13.fire('keyboardWillHide'));
    await expect(page.locator('body')).not.toHaveClass(/keyboard-open/);
    await expect(page.locator('.nav')).toBeVisible();
    expect(errors).toEqual([]);
  });

  test('Keyboard plugin missing: the app still starts, the tab bar stays, no unhandled rejection', async ({ page }) => {
    const errors = watchErrors(page);
    await emulateIos(page, { keyboardPlugin: false });
    await page.goto('/');
    await expect(page.locator('main h1')).toBeVisible();
    await page.waitForTimeout(500);
    await expect(page.locator('.nav')).toBeVisible();
    await expect.poll(async () => (await calls(page, 'SplashScreen', 'hide')).length).toBe(1);
    expect(errors).toEqual([]);
  });
});

test.describe('M13 QC: safe area through the REAL env() (CDP Emulation.setSafeAreaInsetsOverride), 360 px, vi', () => {
  test.use({ viewport: { width: 360, height: 780 }, locale: 'vi-VN' });

  test('iPhone-like insets (top 59, bottom 34) flow through env() -> tokens -> nav, main, toast region, sheet, error page', async ({ page, context }) => {
    await emulateIos(page);
    await freezeClock(page);
    const cdp = await context.newCDPSession(page);
    let supported = true;
    await cdp.send('Emulation.setSafeAreaInsetsOverride', { insets: { top: 59, bottom: 34, left: 0, right: 0 } }).catch(() => {
      supported = false;
    });
    test.skip(!supported, 'Chromium without Emulation.setSafeAreaInsetsOverride');
    await page.goto('/');
    await expect(page.locator('main h1')).toBeVisible();
    await expect(page.locator('body')).toContainText(VI.nav.today);

    const m = await page.evaluate(() => {
      const nav = document.querySelector('.nav') as HTMLElement;
      const main = document.querySelector('main') as HTMLElement;
      const probe = (cls: string, tag = 'div') => {
        const el = document.createElement(tag);
        el.className = cls;
        document.body.append(el);
        const cs = getComputedStyle(el);
        const v = { bottom: cs.bottom, maxHeight: cs.maxHeight, paddingBottom: cs.paddingBottom, paddingTop: cs.paddingTop };
        el.remove();
        return v;
      };
      const probeEl = document.createElement('div');
      probeEl.style.cssText = 'position:fixed;top:0;padding-top:env(safe-area-inset-top,0px);padding-bottom:env(safe-area-inset-bottom,0px)';
      document.body.append(probeEl);
      const envNow = { top: getComputedStyle(probeEl).paddingTop, bottom: getComputedStyle(probeEl).paddingBottom };
      probeEl.remove();
      return {
        env: envNow,
        navBottom: nav.getBoundingClientRect().bottom,
        navPadB: getComputedStyle(nav).paddingBottom,
        itemBottom: (nav.querySelector('.item') as HTMLElement).getBoundingClientRect().bottom,
        mainPadT: getComputedStyle(main).paddingTop,
        toast: probe('toast-region'),
        sheet: probe('dialog', 'dialog'),
        errorPage: probe('error-page'),
        vh: window.innerHeight,
        docScrollW: document.documentElement.scrollWidth,
      };
    });
    expect(m.env).toEqual({ top: '59px', bottom: '34px' });
    expect(m.navPadB).toBe('34px');
    expect(m.navBottom).toBe(m.vh);
    expect(m.itemBottom).toBeLessThanOrEqual(m.vh - 34);
    expect(m.mainPadT).toBe('75px'); // 16 + 59
    expect(m.toast.bottom).toBe('102px'); // tab bar 56 + 34 + 12
    expect(m.sheet.paddingBottom).toBe('58px');
    expect(m.sheet.maxHeight).toBe(`${m.vh - 16 - 59}px`);
    expect(m.errorPage.paddingTop).not.toBe('0px');
    expect(m.docScrollW).toBeLessThanOrEqual(360);
    await expectNoHorizontalScroll(page);
    await expectAxeClean(page);

    // The content really clears the bar: scrolled to the very bottom, the last block ends above the nav.
    await createGoal(page, { name: 'Đọc sách', targetValue: 30 }, VI);
    await gotoHash(page, '/goals');
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    const clear = await page.evaluate(() => {
      const nav = (document.querySelector('.nav') as HTMLElement).getBoundingClientRect();
      const main = document.querySelector('main') as HTMLElement;
      const last = main.lastElementChild as HTMLElement;
      return { lastBottom: last.getBoundingClientRect().bottom, navTop: nav.top };
    });
    expect(clear.lastBottom).toBeLessThanOrEqual(clear.navTop);
  });

  test('left/right insets (44 px) are applied to main and nav', async ({ page, context }) => {
    await emulateIos(page);
    await freezeClock(page);
    const cdp = await context.newCDPSession(page);
    let supported = true;
    await cdp.send('Emulation.setSafeAreaInsetsOverride', { insets: { top: 0, bottom: 21, left: 44, right: 44 } }).catch(() => {
      supported = false;
    });
    test.skip(!supported, 'Chromium without Emulation.setSafeAreaInsetsOverride');
    await page.goto('/');
    await expect(page.locator('main h1')).toBeVisible();
    const m = await page.evaluate(() => {
      const nav = document.querySelector('.nav') as HTMLElement;
      const main = document.querySelector('main') as HTMLElement;
      return { navL: getComputedStyle(nav).paddingLeft, navR: getComputedStyle(nav).paddingRight, mainL: getComputedStyle(main).paddingLeft, mainR: getComputedStyle(main).paddingRight };
    });
    expect(m.navL).toBe('44px');
    expect(m.navR).toBe('44px');
    expect(parseFloat(m.mainL)).toBeGreaterThanOrEqual(44);
    expect(parseFloat(m.mainR)).toBeGreaterThanOrEqual(44);
  });
});

test.describe('M13 QC: crypto.randomUUID missing (non-secure context fallback)', () => {
  test('a goal can be created and an entry logged when crypto.randomUUID is undefined; ids are UUID v4 and unique', async ({ page }) => {
    const errors = watchErrors(page);
    await page.addInitScript(() => {
      Object.defineProperty(crypto, 'randomUUID', { configurable: true, value: undefined });
    });
    await freezeClock(page);
    await page.goto('/');
    expect(await page.evaluate(() => typeof crypto.randomUUID)).toBe('undefined');
    await createGoal(page, { name: 'Read', targetValue: 30 }, EN);
    await createGoal(page, { name: 'Write', targetValue: 20 }, EN);
    await gotoHash(page, '/today');
    const ids = await page.evaluate(
      () =>
        new Promise<string[]>((resolve, reject) => {
          const req = indexedDB.open('one-percent-better');
          req.onerror = () => reject(req.error);
          req.onsuccess = () => {
            const tx = req.result.transaction('goals', 'readonly');
            const all = tx.objectStore('goals').getAll();
            all.onsuccess = () => resolve((all.result as Array<{ id: string }>).map((g) => g.id));
          };
        }),
    );
    expect(ids).toHaveLength(2);
    expect(new Set(ids).size).toBe(2);
    for (const id of ids) expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(errors).toEqual([]);
  });
});
