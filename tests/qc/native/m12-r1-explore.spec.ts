// QC M12 round 1 — exploratory checks of the native build driven as if it ran inside the iOS WebView
// (same recording fake bridge as m12-r1-ios-emulation.spec.ts: the real adapters in src/integration/native/** run).
import { expect, test, type Page } from '@playwright/test';
import { advanceTo, at, createGoal, EN, expectAxeClean, expectNoHorizontalScroll, expectNoViLeaks, freezeClock, gotoHash, toast, VI } from '../../../e2e/helpers/app';

interface BridgeCall {
  plugin: string;
  method: string;
}

declare global {
  interface Window {
    __qc2: { calls: BridgeCall[]; hold: boolean; release: () => void; fire: (event: string) => void };
  }
}

/** `hold` keeps Share.share pending (the share sheet is "open") until `release()`. */
async function emulateIos(page: Page, { hold = false, noIndexedDb = false } = {}): Promise<void> {
  await page.addInitScript(
    ({ hold: holdInit, noIndexedDb: noIdb }) => {
      const w = window as unknown as Record<string, unknown>;
      if (noIdb) Object.defineProperty(window, 'indexedDB', { value: undefined, configurable: true });
      const calls: BridgeCall[] = [];
      const callbacks = new Map<number, { event: string; cb: (d: unknown) => void }>();
      let next = 1;
      let pending: Array<() => void> = [];
      const qc2 = {
        calls,
        hold: holdInit,
        release() {
          qc2.hold = false;
          pending.forEach((f) => f());
          pending = [];
        },
        fire(event: string) {
          for (const l of callbacks.values()) if (l.event === event) l.cb({});
        },
      };
      w.__qc2 = qc2;
      w.webkit = { messageHandlers: { bridge: { postMessage() {} } } };
      w.Capacitor = {
        PluginHeaders: [
          { name: 'Filesystem', methods: [{ name: 'writeFile', rtype: 'promise' }] },
          { name: 'Share', methods: [{ name: 'share', rtype: 'promise' }] },
          { name: 'App', methods: [{ name: 'addListener', rtype: 'callback' }, { name: 'removeListener', rtype: 'promise' }] },
        ],
        nativePromise(plugin: string, method: string, options: Record<string, unknown>) {
          calls.push({ plugin, method });
          if (plugin === 'Filesystem') return Promise.resolve({ uri: `file:///cache/${String(options.path)}` });
          if (plugin === 'Share') {
            if (qc2.hold) return new Promise((resolve) => pending.push(() => resolve({ activityType: 'x' })));
            return Promise.resolve({ activityType: 'x' });
          }
          return Promise.resolve({});
        },
        nativeCallback(plugin: string, method: string, options: Record<string, unknown>, cb: (d: unknown) => void) {
          calls.push({ plugin, method });
          const id = next++;
          callbacks.set(id, { event: String(options.eventName), cb });
          return id;
        },
      };
    },
    { hold, noIndexedDb },
  );
}

const count = (page: Page, plugin: string) => page.evaluate((p) => window.__qc2.calls.filter((c) => c.plugin === p && c.method !== 'addListener').length, plugin);

test.describe('M12 QC explore: iOS emulation', () => {
  test('Reminders switched on: chip stays "Not supported", no browser wording anywhere, the in-app banner still works', async ({ page }) => {
    await emulateIos(page);
    await freezeClock(page);
    await createGoal(page, { name: 'Read', targetValue: 30 });
    await gotoHash(page, '/settings');
    await page.getByRole('switch', { name: EN.settings.reminders.switch }).click();
    await expect(page.getByRole('switch', { name: EN.settings.reminders.switch })).toBeChecked();
    await expect(page.getByText(EN.settings.permission.unsupported, { exact: true })).toBeVisible();
    await expect(page.getByTestId('permission-desc')).toHaveText(EN.settings.permission.nativeUnsupportedDesc);
    await expect(page.getByRole('alert')).toHaveCount(0);
    const text = (await page.locator('body').innerText()).toLowerCase();
    expect(text).not.toContain('browser');
    expect(text).not.toContain('home screen');
    // The default reminder time is 20:00; after it, Today shows the banner (the only reminder M12 promises).
    await gotoHash(page, '/today');
    await advanceTo(page, at('2026-10-09T20:30:00'));
    await expect(page.getByTestId('reminder-banner')).toBeVisible({ timeout: 15_000 });
    expect((await page.getByTestId('reminder-banner').innerText()).toLowerCase()).not.toContain('browser');
  });

  test('S9 storage error on native: native body and steps, no private-window / reload-the-page wording (en)', async ({ page }) => {
    await emulateIos(page, { noIndexedDb: true });
    await page.goto('/');
    await expect(page.getByRole('heading', { level: 1, name: EN.storageError.title })).toBeVisible();
    await expect(page.getByText(EN.storageError.bodyNative)).toBeVisible();
    await expect(page.getByText(EN.storageError.step1Native)).toBeVisible();
    await expect(page.getByText(EN.storageError.step2Native)).toBeVisible();
    await expect(page.getByText(EN.storageError.step3Native)).toBeVisible();
    const text = (await page.locator('body').innerText()).toLowerCase();
    expect(text).not.toContain('incognito');
    expect(text).not.toContain('private');
    expect(text).not.toContain('reload');
    await expectAxeClean(page);
  });

  test.describe('vi 360', () => {
    test.use({ locale: 'vi-VN', viewport: { width: 360, height: 740 } });
    test('S9 storage error on native in Vietnamese: copy, no leaks, no horizontal scroll, axe', async ({ page }) => {
      await emulateIos(page, { noIndexedDb: true });
      await page.goto('/');
      await expect(page.getByText(VI.storageError.bodyNative)).toBeVisible();
      await expect(page.getByText(VI.storageError.step1Native)).toBeVisible();
      await expectNoViLeaks(page);
      await expectNoHorizontalScroll(page);
      await expectAxeClean(page);
    });
  });

  test.describe('dark 360', () => {
    test.use({ colorScheme: 'dark', viewport: { width: 360, height: 740 } });
    test('Settings native in dark mode: axe clean, no horizontal scroll, share hint and storage chip visible', async ({ page }) => {
      await emulateIos(page);
      await freezeClock(page);
      await gotoHash(page, '/settings');
      await expect(page.getByTestId('share-hint')).toBeVisible();
      await expect(page.getByText(EN.settings.storage.nativeChip, { exact: true })).toBeVisible();
      await expectAxeClean(page);
      await expectNoHorizontalScroll(page);
    });
  });

  test('While the share sheet is open the Export button is disabled; one tap = one sheet; completing it records the backup once', async ({ page }) => {
    await emulateIos(page, { hold: true });
    await freezeClock(page);
    await createGoal(page, { name: 'Read', targetValue: 30 });
    await gotoHash(page, '/settings');
    const exportBtn = page.getByRole('button', { name: EN.settings.backup.export });
    await exportBtn.click();
    await expect.poll(() => count(page, 'Share')).toBe(1);
    await expect(page.getByRole('button', { name: EN.common.working }).first()).toBeDisabled();
    await expect(page.getByRole('button', { name: EN.settings.backup.import })).toBeDisabled();
    await page.evaluate(() => window.__qc2.release());
    await expect(toast(page)).toContainText(EN.toast.backupExported);
    expect(await count(page, 'Share')).toBe(1);
  });

  test('.ics: a fast double tap opens at most one share sheet (iOS rejects a second one with a non-cancel error)', async ({ page }) => {
    await emulateIos(page, { hold: true });
    await freezeClock(page);
    await gotoHash(page, '/settings');
    const ics = page.getByRole('button', { name: EN.settings.reminders.ics });
    await ics.dblclick(); // a real double tap: two input events, React commits `busy` in between
    await expect.poll(() => count(page, 'Share')).toBeGreaterThanOrEqual(1);
    await page.waitForTimeout(300);
    const shares = await count(page, 'Share');
    await page.evaluate(() => window.__qc2.release());
    expect(shares, 'second Share.share while the first sheet is open').toBe(1);
  });
});
