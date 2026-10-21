// QC M12 round 1 — the native build driven as if it ran inside the iOS WebView.
// The Capacitor runtime decides "ios" from `window.webkit.messageHandlers.bridge` and routes plugin calls
// to `Capacitor.nativePromise/nativeCallback` for plugins listed in `Capacitor.PluginHeaders`. We install
// exactly that (a recording fake bridge) before the app loads, so the REAL adapters in
// `src/integration/native/**` (Filesystem.writeFile -> Share.share, App.resume) and the REAL Settings UI run.
// Nothing here touches a real iPhone: the share sheet itself stays NOT VERIFIED (NV-18).
import { expect, test, type Page } from '@playwright/test';
import { createGoal, EN, expectAxeClean, expectNoHorizontalScroll, expectNoViLeaks, freezeClock, gotoHash, logTime, toast, VI } from '../../../e2e/helpers/app';

type Mode = 'ok' | 'cancel-error' | 'cancel-object' | 'write-fail' | 'share-fail';

interface BridgeCall {
  plugin: string;
  method: string;
  options: Record<string, unknown>;
}

declare global {
  interface Window {
    __qc: { calls: BridgeCall[]; mode: Mode; fire: (event: string) => void; listeners: Array<{ id: number; event: string }> };
  }
}

async function emulateIos(page: Page, mode: Mode = 'ok'): Promise<void> {
  await page.addInitScript((initialMode) => {
    const w = window as unknown as Record<string, unknown>;
    const calls: BridgeCall[] = [];
    const callbacks = new Map<number, { event: string; cb: (data: unknown) => void }>();
    let nextId = 1;
    const qc = {
      calls,
      mode: initialMode,
      listeners: [] as Array<{ id: number; event: string }>,
      fire(event: string) {
        for (const l of callbacks.values()) if (l.event === event) l.cb({});
      },
    };
    w.__qc = qc;
    w.webkit = { messageHandlers: { bridge: { postMessage() {} } } };
    w.Capacitor = {
      PluginHeaders: [
        { name: 'Filesystem', methods: [{ name: 'writeFile', rtype: 'promise' }] },
        { name: 'Share', methods: [{ name: 'share', rtype: 'promise' }] },
        {
          name: 'App',
          methods: [
            { name: 'addListener', rtype: 'callback' },
            { name: 'removeListener', rtype: 'promise' },
          ],
        },
      ],
      nativePromise(plugin: string, method: string, options: Record<string, unknown>) {
        calls.push({ plugin, method, options: JSON.parse(JSON.stringify(options ?? {})) });
        if (plugin === 'Filesystem' && method === 'writeFile') {
          if (qc.mode === 'write-fail') return Promise.reject(new Error('No space left on device'));
          return Promise.resolve({ uri: `file:///var/mobile/Containers/Data/Application/QC/Library/Caches/${String(options.path)}` });
        }
        if (plugin === 'Share' && method === 'share') {
          if (qc.mode === 'cancel-error') return Promise.reject(new Error('Share canceled'));
          // The native bridge rejects with a plain object, not an Error instance.
          if (qc.mode === 'cancel-object') return Promise.reject({ message: 'Share canceled', code: 'UNIMPLEMENTED' });
          if (qc.mode === 'share-fail') return Promise.reject(new Error('Unable to present the share sheet'));
          return Promise.resolve({ activityType: 'com.apple.CloudDocsUI.AddToiCloudDrive' });
        }
        return Promise.resolve({});
      },
      nativeCallback(plugin: string, method: string, options: Record<string, unknown>, cb: (data: unknown) => void) {
        calls.push({ plugin, method, options: JSON.parse(JSON.stringify(options ?? {})) });
        const id = nextId++;
        const event = String(options.eventName);
        callbacks.set(id, { event, cb });
        qc.listeners.push({ id, event });
        return id;
      },
    };
  }, mode);
}

async function bridgeCalls(page: Page, plugin?: string): Promise<BridgeCall[]> {
  const all = await page.evaluate(() => window.__qc.calls);
  return plugin ? all.filter((c) => c.plugin === plugin) : all;
}

function watchErrors(page: Page) {
  const errors: string[] = [];
  const external: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  page.on('request', (r) => {
    if (!r.url().startsWith('http://localhost:4175')) external.push(r.url());
  });
  return { errors, external };
}

async function seed(page: Page, copy: typeof EN | typeof VI = EN, name = 'Read') {
  await freezeClock(page);
  await createGoal(page, { name, targetValue: 30 }, copy);
  await gotoHash(page, '/today');
  await logTime(page, name, 20, '', copy);
}

test.describe('M12 QC: native build as iOS (en)', () => {
  test('Settings shows the native variants; Today shows the native backup banner; no PWA remnants', async ({ page }) => {
    const watch = watchErrors(page);
    await emulateIos(page);
    await seed(page);

    // Today: backup banner (never) in its native wording.
    await gotoHash(page, '/today');
    await expect(page.getByTestId('backup-banner')).toContainText(EN.backup.banner.neverNative);
    await expect(page.getByText(EN.backup.banner.never, { exact: true })).toHaveCount(0);

    await gotoHash(page, '/settings');
    const body = page.locator('body');
    // DESIGN 7.8.1 rows 2, 6, 7, 9, 12, 13, 14.
    await expect(body).not.toContainText(EN.settings.reminders.ios);
    await expect(body).not.toContainText('Install the app');
    await expect(body).not.toContainText('Add to Home Screen');
    await expect(body).not.toContainText('browser');
    await expect(page.getByTestId('permission-desc')).toHaveText(EN.settings.permission.nativeUnsupportedDesc);
    await expect(page.getByText(EN.settings.permission.unsupported, { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: EN.settings.reminders.allow })).toHaveCount(0);
    await expect(page.getByText(EN.settings.language.nativeNote)).toBeVisible();
    await expect(page.getByTestId('share-hint')).toHaveText(EN.settings.backup.shareHint);
    await expect(page.getByText(EN.settings.storage.nativeLabel)).toBeVisible();
    await expect(page.getByText(EN.settings.storage.nativeChip, { exact: true })).toBeVisible();
    await expect(page.getByTestId('storage-desc')).toHaveText(EN.settings.storage.nativeDesc);
    await expect(page.getByText(EN.settings.about.descNative)).toBeVisible();
    await expect(page.getByTestId('account-card')).toHaveCount(0);

    // Privacy link: absolute, Safari, hidden "(opens in Safari)" in the accessible name.
    const link = page.getByTestId('privacy-link');
    await expect(link).toHaveAttribute('href', 'https://minh-lgm.github.io/one-percent-better/privacy.html');
    await expect(link).toHaveAttribute('target', '_blank');
    await expect(link).toHaveAttribute('rel', /noopener/);
    await expect(page.getByRole('link', { name: `${EN.settings.about.privacyLink} ${EN.a11y.opensExternal}` })).toBeVisible();

    // No service worker, no manifest, no update toast, even when the page is told a new version exists.
    expect(await page.evaluate(async () => (await navigator.serviceWorker.getRegistrations()).length)).toBe(0);
    expect(await page.locator('link[rel=manifest]').count()).toBe(0);
    await expect(page.getByText(EN.update.message)).toHaveCount(0);

    await expectAxeClean(page);
    // The runtime really was "ios" and the lifecycle adapter registered exactly one resume listener.
    const listeners = await page.evaluate(() => window.__qc.listeners);
    expect(listeners.filter((l) => l.event === 'resume')).toHaveLength(1);
    expect(watch.errors).toEqual([]);
    expect(watch.external).toEqual([]);
  });

  test('Export: writeFile (Cache, utf8, dated name, valid backup JSON) then Share with that uri; Last backup updates; banner clears', async ({ page }) => {
    const watch = watchErrors(page);
    await emulateIos(page, 'ok');
    await seed(page);
    await gotoHash(page, '/settings');
    await expect(page.getByTestId('last-backup')).toHaveText(EN.settings.backup.lastNever);

    await page.getByRole('button', { name: EN.settings.backup.export }).click();
    await expect(toast(page)).toContainText(EN.toast.backupExported);

    const fs = await bridgeCalls(page, 'Filesystem');
    const share = await bridgeCalls(page, 'Share');
    expect(fs).toHaveLength(1);
    expect(share).toHaveLength(1);
    expect(fs[0].options.path).toBe('1percent-better-backup-2026-10-09.json');
    expect(fs[0].options.directory).toBe('CACHE');
    expect(fs[0].options.encoding).toBe('utf8');
    const parsed = JSON.parse(String(fs[0].options.data)) as { schemaVersion: number; goals: Array<{ name: string }>; entries: unknown[] };
    expect(parsed.schemaVersion).toBe(1);
    expect(parsed.goals.map((g) => g.name)).toEqual(['Read']);
    expect(parsed.entries).toHaveLength(1);
    expect(share[0].options.files).toEqual(['file:///var/mobile/Containers/Data/Application/QC/Library/Caches/1percent-better-backup-2026-10-09.json']);
    expect(String(share[0].options.title)).toContain('1percent-better-backup-2026-10-09.json');

    await expect(page.getByTestId('last-backup')).not.toHaveText(EN.settings.backup.lastNever);
    await gotoHash(page, '/today');
    await expect(page.getByTestId('backup-banner')).toHaveCount(0);
    expect(watch.errors).toEqual([]);
  });

  for (const mode of ['cancel-error', 'cancel-object'] as const) {
    test(`Export, share sheet dismissed (${mode}): no toast, no Alert, Last backup unchanged, banner still there`, async ({ page }) => {
      const watch = watchErrors(page);
      await emulateIos(page, mode);
      await seed(page);
      await gotoHash(page, '/settings');
      await page.getByRole('button', { name: EN.settings.backup.export }).click();
      await expect.poll(async () => (await bridgeCalls(page, 'Share')).length).toBe(1);
      // Give React the time to (wrongly) toast.
      await page.waitForTimeout(600);
      await expect(toast(page)).toHaveCount(0);
      await expect(page.getByRole('alert')).toHaveCount(0);
      await expect(page.getByTestId('last-backup')).toHaveText(EN.settings.backup.lastNever);
      // The button is usable again.
      await expect(page.getByRole('button', { name: EN.settings.backup.export })).toBeEnabled();
      await gotoHash(page, '/today');
      await expect(page.getByTestId('backup-banner')).toBeVisible();
      expect(watch.errors).toEqual([]);
    });
  }

  test('Export, file cannot be written: native Alert, no share sheet, Last backup unchanged', async ({ page }) => {
    await emulateIos(page, 'write-fail');
    await seed(page);
    await gotoHash(page, '/settings');
    await page.getByRole('button', { name: EN.settings.backup.export }).click();
    await expect(page.getByRole('alert')).toContainText(EN.errors.EXPORT_FAILED_native);
    await expect(page.getByRole('alert')).not.toContainText('download');
    expect(await bridgeCalls(page, 'Share')).toHaveLength(0);
    await expect(page.getByTestId('last-backup')).toHaveText(EN.settings.backup.lastNever);
    await expect(toast(page)).toHaveCount(0);
  });

  test('Export, share sheet fails for another reason: Alert (not silent), nothing recorded', async ({ page }) => {
    await emulateIos(page, 'share-fail');
    await seed(page);
    await gotoHash(page, '/settings');
    await page.getByRole('button', { name: EN.settings.backup.export }).click();
    await expect(page.getByRole('alert')).toContainText(EN.errors.EXPORT_FAILED_native);
    await expect(page.getByTestId('last-backup')).toHaveText(EN.settings.backup.lastNever);
  });

  test('Export, repeated: dismissed once then done -> exactly one backup recorded; a fast double click does not open two share sheets', async ({ page }) => {
    await emulateIos(page, 'cancel-error');
    await seed(page);
    await gotoHash(page, '/settings');
    const exportBtn = page.getByRole('button', { name: EN.settings.backup.export });
    await exportBtn.click();
    await expect.poll(async () => (await bridgeCalls(page, 'Share')).length).toBe(1);
    await expect(exportBtn).toBeEnabled();
    await page.evaluate(() => {
      window.__qc.mode = 'ok';
    });
    // A real double tap: two separate input events (React commits `busy` between them, so the 2nd one hits a disabled button).
    await exportBtn.dblclick();
    await expect(toast(page)).toContainText(EN.toast.backupExported);
    expect(await bridgeCalls(page, 'Share')).toHaveLength(2); // 1 cancelled + 1 shared, not 3
    expect(await bridgeCalls(page, 'Filesystem')).toHaveLength(2);
  });

  test('.ics goes through the same port: ics file, share, "Calendar file shared"; dismissed = silent', async ({ page }) => {
    await emulateIos(page, 'ok');
    await seed(page);
    await gotoHash(page, '/settings');
    await page.getByRole('button', { name: EN.settings.reminders.ics }).click();
    await expect(toast(page)).toContainText(EN.toast.icsShared);
    const fs = await bridgeCalls(page, 'Filesystem');
    expect(fs).toHaveLength(1);
    expect(fs[0].options.path).toBe('1percent-better-reminder.ics');
    expect(String(fs[0].options.data)).toContain('BEGIN:VCALENDAR');
    expect(String(fs[0].options.data)).toContain('RRULE:FREQ=DAILY');
    // Backup state untouched by a calendar export.
    await expect(page.getByTestId('last-backup')).toHaveText(EN.settings.backup.lastNever);

    await page.evaluate(() => {
      window.__qc.mode = 'cancel-error';
    });
    await expect(toast(page)).toHaveCount(0, { timeout: 8000 });
    await page.getByRole('button', { name: EN.settings.reminders.ics }).click();
    await expect.poll(async () => (await bridgeCalls(page, 'Share')).length).toBe(2);
    await page.waitForTimeout(500);
    await expect(toast(page)).toHaveCount(0);
    await expect(page.getByRole('alert')).toHaveCount(0);
  });

  test('Import still works through the file input (Files picker)', async ({ page }) => {
    await emulateIos(page, 'ok');
    await freezeClock(page);
    await page.goto('/#/settings');
    await page.getByTestId('import-file').setInputFiles(new URL('../../../e2e/fixtures/sample-backup.json', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await dialog.getByRole('button', { name: EN.import.confirm }).click();
    await expect(toast(page)).toContainText(EN.toast.backupImported.split(':')[0]);
  });

  test('resume event: handled without error and the app keeps working', async ({ page }) => {
    const watch = watchErrors(page);
    await emulateIos(page);
    await seed(page);
    await gotoHash(page, '/today');
    for (let i = 0; i < 5; i++) await page.evaluate(() => window.__qc.fire('resume'));
    await page.waitForTimeout(300);
    await expect(page.getByRole('article', { name: 'Read' }).locator('.amount')).toContainText('20/30');
    expect(watch.errors).toEqual([]);
  });
});

test.describe('M12 QC: native build as iOS (vi, 360x740)', () => {
  test.use({ locale: 'vi-VN', viewport: { width: 360, height: 740 } });

  test('Settings + Today in Vietnamese: native copy, no leaks, axe, no horizontal scroll, Export hint/Alert in vi', async ({ page }) => {
    const watch = watchErrors(page);
    await emulateIos(page, 'write-fail');
    await seed(page, VI, 'Đọc sách');
    await gotoHash(page, '/today');
    await expect(page.getByTestId('backup-banner')).toContainText(VI.backup.banner.neverNative);
    await expectNoViLeaks(page);
    await expectAxeClean(page);
    await expectNoHorizontalScroll(page);

    await gotoHash(page, '/settings');
    const body = page.locator('body');
    await expect(body).not.toContainText(VI.settings.reminders.ios);
    await expect(body).not.toContainText(EN.settings.reminders.ios);
    await expect(body).not.toContainText('trình duyệt');
    await expect(page.getByText(VI.settings.language.nativeNote)).toBeVisible();
    await expect(page.getByTestId('permission-desc')).toHaveText(VI.settings.permission.nativeUnsupportedDesc);
    await expect(page.getByTestId('share-hint')).toHaveText(VI.settings.backup.shareHint);
    await expect(page.getByTestId('storage-desc')).toHaveText(VI.settings.storage.nativeDesc);
    await expect(page.getByText(VI.settings.about.descNative)).toBeVisible();
    await expect(page.getByRole('link', { name: `${VI.settings.about.privacyLink} ${VI.a11y.opensExternal}` })).toBeVisible();
    await expectNoViLeaks(page);
    await expectAxeClean(page);
    await expectNoHorizontalScroll(page);

    await page.getByRole('button', { name: VI.settings.backup.export }).click();
    await expect(page.getByRole('alert')).toContainText(VI.errors.EXPORT_FAILED_native);
    await expectNoViLeaks(page);
    await expectNoHorizontalScroll(page);
    expect(watch.errors).toEqual([]);
  });
});

test.describe('M12 QC: native build in plain Chromium (platform web)', () => {
  test('records what Settings shows for Storage when the runtime is absent (DESIGN 7.8.1 row 12 keys it on native platform)', async ({ page }, testInfo) => {
    await freezeClock(page);
    await page.goto('/#/settings');
    const storage = await page.getByTestId('storage-desc').textContent().catch(() => null);
    await testInfo.attach('storage-desc', { body: String(storage), contentType: 'text/plain' });
    // Observation only (not a defect): DESIGN 7.8.1 row 12 keys the Storage variant on platform !== 'web', so the native build
    // opened in a browser (runtime absent) still shows the web Storage copy. On a device Capacitor reports 'ios' (NV-13).
    testInfo.annotations.push({ type: 'observation', description: `native build without runtime shows web Storage copy: ${String(storage)}` });
    expect(storage).toBeTruthy();
  });
});
