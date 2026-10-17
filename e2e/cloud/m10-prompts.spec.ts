/**
 * M10-AC7 (A-46; M8-D1, M8-P1): stamps written while the device clock was wrong (far in the future)
 * no longer silence the sign-in banner / export hint; "Not now" re-stamps them with the real time.
 * Reproduces QC M8 r1 §4: kv `loginPrompt.lastDismissedAt = 2099-01-01` → before M10 the banner
 * stayed hidden until 2099.
 */
import type { Page } from '@playwright/test';
import { expect, test } from './fixtures';
import { EN, FIXED_TIME, freezeClock, gotoHash, importBackup, kvGet } from '../helpers/app';

const DAY = 86_400_000;
const banner = (page: Page) => page.getByTestId('login-prompt-banner');

async function putKv(page: Page, key: string, value: unknown): Promise<void> {
  await page.evaluate(
    ([k, v]) =>
      new Promise<void>((resolve, reject) => {
        const req = indexedDB.open('one-percent-better');
        req.onerror = () => reject(req.error);
        req.onsuccess = () => {
          const db = req.result;
          const tx = db.transaction('kv', 'readwrite');
          tx.objectStore('kv').put({ key: k as string, value: v });
          tx.oncomplete = () => {
            db.close();
            resolve();
          };
          tx.onerror = () => reject(tx.error);
        };
      }),
    [key, value] as [string, unknown],
  );
}

interface PromptRow {
  dismissCount: number;
  lastDismissedAt: string | null;
  lastExportHintAt: string | null;
}

test.beforeEach(async ({ page, mock }) => {
  await mock.reset();
  await freezeClock(page);
});

test('a "Not now" stamped in 2099 does not hide the banner; "Not now" counts once and re-stamps now; 14 days later it is back', async ({ page }) => {
  await gotoHash(page, '/today');
  await importBackup(page);
  await putKv(page, 'loginPrompt', { dismissCount: 1, lastDismissedAt: '2099-01-01T00:00:00.000Z', lastExportHintAt: null });
  await gotoHash(page, '/today');
  await page.reload();
  await expect(banner(page)).toBeVisible();

  await banner(page).getByTestId('login-prompt-not-now').click();
  await expect(banner(page)).toHaveCount(0);
  const after = (await kvGet(page, 'loginPrompt')) as PromptRow;
  expect(after).toEqual({ dismissCount: 2, lastDismissedAt: FIXED_TIME.toISOString(), lastExportHintAt: null });

  await freezeClock(page, new Date(FIXED_TIME.getTime() + 13 * DAY));
  await page.reload();
  await expect(page.getByRole('heading', { level: 1, name: 'Today' })).toBeVisible();
  await expect(banner(page)).toHaveCount(0);

  await freezeClock(page, new Date(FIXED_TIME.getTime() + 14 * DAY));
  await page.reload();
  await expect(banner(page)).toBeVisible();
});

test('an export hint stamped in 2099 does not block the hint; Export shows it and re-stamps now', async ({ page }) => {
  await gotoHash(page, '/today');
  await importBackup(page);
  await putKv(page, 'loginPrompt', { dismissCount: 0, lastDismissedAt: null, lastExportHintAt: '2099-01-01T00:00:00.000Z' });
  await gotoHash(page, '/settings');
  await page.reload();
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: EN.settings.backup.export }).click();
  await download;
  await expect(page.getByTestId('export-sign-in-hint')).toBeVisible();
  const row = (await kvGet(page, 'loginPrompt')) as PromptRow;
  expect(row.lastExportHintAt).toBe(FIXED_TIME.toISOString());
});
