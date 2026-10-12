// Helpers for the `cloud` Playwright project (ARCHITECTURE §8, §5.11): app under /one-percent-better/
// on port 4174, mock Supabase on 127.0.0.1:54321, no real Google.
import { expect, type Locator, type Page } from '@playwright/test';
import { CLOUD_BASE_URL, MOCK_SUPABASE_URL } from '../../playwright.config';
import { EN, FIXED_TIME } from '../helpers/app';

export { CLOUD_BASE_URL, MOCK_SUPABASE_URL };
export const APP_ORIGIN = new URL(CLOUD_BASE_URL).origin;
export const ALLOWED_ORIGINS = [APP_ORIGIN, MOCK_SUPABASE_URL];
export const SDK_CHUNK = /supabase-client-[^/]*\.js$/;

/** Collect every request the page makes (navigation included) for the origin assertions (M6-AC12). */
export function recordRequests(page: Page): { urls: string[]; external: () => string[]; sdk: () => string[]; mock: () => string[] } {
  const urls: string[] = [];
  page.on('request', (req) => urls.push(req.url()));
  return {
    urls,
    external: () => urls.filter((u) => !ALLOWED_ORIGINS.some((o) => u.startsWith(o))),
    sdk: () => urls.filter((u) => SDK_CHUNK.test(new URL(u).pathname)),
    mock: () => urls.filter((u) => u.startsWith(MOCK_SUPABASE_URL)),
  };
}

export const accountCard = (page: Page): Locator => page.getByTestId('account-card');
export const signInButton = (page: Page, copy: { auth: { signInGoogle: string } } = EN): Locator => page.getByRole('button', { name: copy.auth.signInGoogle });
export const signOutDialog = (page: Page): Locator => page.getByTestId('signout-dialog');

export type MockUser = 'Minh Test' | 'Other User' | 'Cancel';

/** From a screen with the Google button: click it, pick a user on the mock chooser, wait to be back in the app. */
export async function signInViaMock(page: Page, user: MockUser = 'Minh Test', copy: { auth: { signInGoogle: string } } = EN): Promise<void> {
  await signInButton(page, copy).click();
  await page.waitForURL((u) => u.origin === MOCK_SUPABASE_URL && u.pathname === '/auth/v1/authorize');
  await page.getByRole('button', { name: user, exact: true }).click();
  // Back in the app: bootstrap reads the callback and replaces the URL with `<BASE_URL>#<returnTo>`.
  await page.waitForURL((u) => u.origin === APP_ORIGIN && !u.searchParams.has('auth') && !u.searchParams.has('code'));
}

/** Sign in u1 from Settings and wait for the signed-in card. */
export async function signInAsMinh(page: Page): Promise<void> {
  await page.goto('#/settings');
  await expect(accountCard(page)).toHaveAttribute('data-state', 'signed-out');
  await signInViaMock(page, 'Minh Test');
  await expect(accountCard(page)).toHaveAttribute('data-state', 'signed-in');
  await expect(accountCard(page).getByTestId('account-email')).toHaveText('minh.test@example.com');
}

export async function storedSession(page: Page): Promise<string | null> {
  return page.evaluate(() => localStorage.getItem('opb-auth'));
}

export async function kvSync(page: Page): Promise<{ userId: string | null; account: { email: string; name: string } | null } | null> {
  return page.evaluate(
    () =>
      new Promise((resolve, reject) => {
        const req = indexedDB.open('one-percent-better');
        req.onerror = () => reject(req.error);
        req.onsuccess = () => {
          const db = req.result;
          const get = db.transaction('kv', 'readonly').objectStore('kv').get('sync');
          get.onsuccess = () => {
            resolve(get.result ? get.result.value : null);
            db.close();
          };
          get.onerror = () => reject(get.error);
        };
      }),
  );
}

export const FIXED_MS = FIXED_TIME.getTime();

// ---- M7 ----

/** Dataset C1 (TASKS phase 2): one cloud goal + two entries for u1. */
export const C1 = {
  goals: [{ id: 'c1-goal', name: 'Cloud goal', why: '', targetType: 'daily', targetMinutes: 15, startDate: '2026-10-01', endDate: '2026-12-31', archived: false, createdAt: '2026-10-05T01:00:00.000Z', updatedAt: '2026-10-05T01:00:00.000Z' }],
  entries: [
    { id: 'c1-e1', goalId: 'c1-goal', date: '2026-10-06', minutes: 15, note: '', source: 'manual', createdAt: '2026-10-05T01:00:00.000Z', updatedAt: '2026-10-05T01:00:00.000Z' },
    { id: 'c1-e2', goalId: 'c1-goal', date: '2026-10-07', minutes: 15, note: '', source: 'manual', createdAt: '2026-10-05T01:00:00.000Z', updatedAt: '2026-10-05T01:00:00.000Z' },
  ],
};

export const syncIndicator = (page: Page): Locator => page.getByTestId('sync-indicator');
export const statusRow = (page: Page): Locator => page.getByTestId('status-row');

/** Wait until the indicator reports `state` (`synced`, `pending`, `offline`, `error`, `expired`, `syncing`, `signing-in`). */
export async function expectSyncState(page: Page, state: string, timeout = 15_000): Promise<void> {
  await expect(syncIndicator(page)).toHaveAttribute('data-state', state, { timeout });
}

/** Press "Sync now" on the Account card (Settings) and wait for the indicator to come back to `synced`. */
export async function syncNow(page: Page): Promise<void> {
  if (!page.url().includes('#/settings')) await page.goto('#/settings');
  await expect(page.getByTestId('sync-now')).toBeEnabled();
  await page.getByTestId('sync-now').click();
  await expectSyncState(page, 'synced');
}

/** Pending count shown on the Account card (`N changes`). */
export async function pendingCount(page: Page): Promise<number> {
  const text = await page.getByTestId('pending-count').textContent();
  return Number((text ?? '').replace(/[^0-9]/g, ''));
}

/** Collect pageerror + unhandledrejection (M7-AC13). Call before navigating. */
export function collectErrors(page: Page): { list: string[] } {
  const list: string[] = [];
  page.on('pageerror', (e) => list.push(`pageerror: ${e.message}`));
  page.on('console', (m) => {
    if (m.type() === 'error' && /unhandled/i.test(m.text())) list.push(`console: ${m.text()}`);
  });
  return { list };
}
