/**
 * M10-AC3 (ADR-27): the zod schema chunk is fetched only when a backup is imported, Import still
 * works (D3 counts, Today after Confirm as in M3-AC7) and it works offline through the service
 * worker precache (the schema chunk is precached at install).
 */
import { expect, test, type Page } from '@playwright/test';
import { BASE_URL } from '../playwright.config';
import { chooseBackupFile, EN, expectAmount, freezeClock, gotoHash, importBackup, toast } from './helpers/app';

/** Record every JS response of the app and whether its body contains `ZodError`. */
function trackJs(page: Page): { pending: Promise<void>[]; zod: string[]; all: string[] } {
  const zod: string[] = [];
  const all: string[] = [];
  const pending: Promise<void>[] = [];
  page.on('response', (res) => {
    const url = res.url();
    if (!url.startsWith(BASE_URL) || !/javascript/.test(res.headers()['content-type'] ?? '')) return;
    pending.push(
      (async () => {
        const body = await res.body().catch(() => Buffer.alloc(0));
        all.push(url);
        if (body.includes('ZodError')) zod.push(url.replace(BASE_URL, ''));
      })(),
    );
  });
  return { pending, zod, all };
}

test('M10-AC3: #/settings transfers no chunk containing ZodError; choosing a file fetches it; D3 and Today are as before', async ({ page }) => {
  const js = trackJs(page);
  await freezeClock(page);
  await gotoHash(page, '/settings');
  await expect(page.getByRole('heading', { level: 1, name: EN.settings.title })).toBeVisible();
  await page.waitForLoadState('networkidle');
  await Promise.all(js.pending);
  expect(js.zod).toEqual([]);
  expect(js.all.length).toBeGreaterThan(0);

  await chooseBackupFile(page, 'sample-backup.json');
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText('This backup has 5 goals, 23 entries');
  await Promise.all(js.pending);
  console.log('[import] chunks containing ZodError after choosing a file:', JSON.stringify(js.zod));
  expect(js.zod.length).toBeGreaterThanOrEqual(1);

  await dialog.getByRole('button', { name: EN.import.confirm }).click();
  await expect(dialog).toBeHidden();
  await expect(toast(page)).toHaveText('Backup imported: 5 goals, 23 entries');
  await gotoHash(page, '/today');
  await expectAmount(page, 'Read', '0/30');
  await expectAmount(page, 'Guitar', '0/20');
  await expectAmount(page, 'Spanish', '0/17');
});

test('M10-AC3: Import works offline once the service worker controls the page (schema chunk precached)', async ({ page, context }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await freezeClock(page);
  await gotoHash(page, '/today');
  await expect(page.getByRole('heading', { level: 1, name: 'Today' })).toBeVisible();
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload();
  await expect.poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller))).toBe(true);
  // Give the install step time to finish precaching (the controller exists once activated).
  await expect.poll(() => page.evaluate(async () => (await caches.keys()).length), { timeout: 15_000 }).toBeGreaterThan(0);

  await context.setOffline(true);
  await page.reload();
  await expect(page.getByRole('heading', { level: 1, name: 'Today' })).toBeVisible();
  await importBackup(page);
  await expect(toast(page)).toHaveText('Backup imported: 5 goals, 23 entries');
  await gotoHash(page, '/today');
  await expectAmount(page, 'Read', '0/30');
  await context.setOffline(false);
  expect(errors).toEqual([]);
});
