// QC M6 round 1 — independent exploratory/acceptance checks of the auth flows against the mock Supabase (project `cloud`).
// Uses the dev fixture (per-worker mock partition). Tests inside a file run sequentially.
import type { Page } from '@playwright/test';
import { expect, test } from '../../../e2e/cloud/fixtures';
import { accountCard, CLOUD_BASE_URL, kvSync, MOCK_SUPABASE_URL, recordRequests, signInAsMinh, signInButton, signInViaMock, signOutDialog, storedSession } from '../../../e2e/cloud/helpers';
import { createGoal, EN, freezeClock, goalCard, gotoHash, kvGet, logTime, startTimer, timerCard, toast, VI } from '../../../e2e/helpers/app';

const READ = { name: 'Read', targetValue: 30, startDate: '2026-10-01', endDate: '2026-10-31' };
const APP = new URL(CLOUD_BASE_URL);

test.beforeEach(async ({ page, mock }) => {
  await mock.reset();
  await freezeClock(page);
});

async function signInAndGrabSession(page: Page): Promise<{ access: string; refresh: string }> {
  await page.goto('#/settings');
  await signInViaMock(page, 'Minh Test');
  await expect(accountCard(page)).toHaveAttribute('data-state', 'signed-in');
  const parsed = JSON.parse((await storedSession(page)) ?? '{}') as { access_token: string; refresh_token: string };
  return { access: parsed.access_token, refresh: parsed.refresh_token };
}

test.describe('M6-AC6 extra: callback + returnTo + hash routing on the sub-path', () => {
  test('returnTo #/goals present at callback time → ends on <base>#/goals, URL clean, Goals screen, signed in', async ({ page }) => {
    await createGoal(page, READ);
    await page.addInitScript(() => {
      if (location.search.includes('auth=callback')) sessionStorage.setItem('opb-auth-return', '#/goals');
    });
    await gotoHash(page, '/settings');
    await signInViaMock(page, 'Minh Test');
    expect(page.url()).toBe(`${CLOUD_BASE_URL}#/goals`);
    await expect(page.getByRole('heading', { level: 1, name: EN.goals.title })).toBeVisible();
    await expect(toast(page)).toHaveText('Signed in as minh.test@example.com');
    await gotoHash(page, '/settings');
    await expect(accountCard(page)).toHaveAttribute('data-state', 'signed-in');
    expect(page.url()).not.toContain('code=');
  });

  for (const hostile of ['https://evil.example/', '#//evil.example/x', 'javascript:alert(1)', '#/settings<script>', '']) {
    test(`hostile returnTo ${JSON.stringify(hostile)} falls back to #/settings (no off-site redirect)`, async ({ page }) => {
      await page.addInitScript((v) => {
        if (location.search.includes('auth=callback')) sessionStorage.setItem('opb-auth-return', v);
      }, hostile);
      await page.goto(`${CLOUD_BASE_URL}?auth=callback&error=access_denied&error_description=x`);
      await expect(page.getByRole('heading', { level: 1, name: EN.settings.title })).toBeVisible();
      expect(new URL(page.url()).origin).toBe(APP.origin);
      expect(page.url()).toBe(`${CLOUD_BASE_URL}#/settings`);
    });
  }

  test('callback params are never rendered as HTML (XSS probe in error_description / code)', async ({ page }) => {
    const dialogs: string[] = [];
    page.on('dialog', (d) => {
      dialogs.push(d.message());
      void d.dismiss();
    });
    await page.goto(`${CLOUD_BASE_URL}?auth=callback&error=server_error&error_description=${encodeURIComponent('<img src=x onerror="window.__xss=1">')}`);
    await expect(accountCard(page).getByRole('alert')).toContainText(EN.errors.AUTH_FAILED);
    expect(await page.evaluate(() => (window as unknown as { __xss?: number }).__xss)).toBeUndefined();
    await expect(page.locator('img[src="x"]')).toHaveCount(0);
    expect(await accountCard(page).textContent()).not.toContain('onerror');
    await page.goto(`${CLOUD_BASE_URL}?auth=callback&code=${encodeURIComponent('"><svg onload=alert(1)>')}`);
    await expect(accountCard(page).getByRole('alert')).toContainText(EN.errors.AUTH_FAILED);
    expect(dialogs).toEqual([]);
  });

  test('callback with neither code nor error → AUTH_FAILED, not blank', async ({ page }) => {
    await page.goto(`${CLOUD_BASE_URL}?auth=callback`);
    await expect(accountCard(page).getByRole('alert')).toContainText(EN.errors.AUTH_FAILED);
    expect(page.url()).toBe(`${CLOUD_BASE_URL}#/settings`);
  });

  test('a URL WITHOUT auth=callback (e.g. ?code=abc#/today) is ignored and left alone', async ({ page, mock }) => {
    await page.goto(`${CLOUD_BASE_URL}?code=abc#/today`);
    await expect(page.getByRole('heading', { level: 1, name: EN.today.title })).toBeVisible();
    expect(page.url()).toBe(`${CLOUD_BASE_URL}?code=abc#/today`);
    expect((await mock.log()).exchanges).toBe(0);
  });

  test('replaying a stale callback URL while a valid session exists must not downgrade the signed-in session (M6-D1: currently fails → expected-fail marker)', async ({ page }) => {
    test.fail(true, 'M6-D1: bogus/stale callback with a valid stored session leaves the card in "expired"; remove this marker once fixed');
    await signInAsMinh(page);
    await page.goto(`${CLOUD_BASE_URL}?auth=callback&code=already-used-or-bogus`);
    await expect(page.getByRole('heading', { level: 1, name: EN.settings.title })).toBeVisible();
    await expect.poll(async () => (await accountCard(page).getAttribute('data-state')) !== 'signing-in', { timeout: 15_000 }).toBe(true);
    // The stored session is untouched on the device...
    expect(await storedSession(page)).not.toBeNull();
    // ...so the card must still say signed-in (a bad callback must not hide a valid session).
    expect(await accountCard(page).getAttribute('data-state'), 'card state after replaying a bogus callback with a valid stored session').toBe('signed-in');
  });

  test('double-click on the Google button starts exactly one authorize flow', async ({ page, mock }) => {
    await gotoHash(page, '/settings');
    await signInButton(page).dblclick();
    await page.waitForURL((u) => u.origin === MOCK_SUPABASE_URL);
    const authorize = (await mock.log()).log.filter((l) => l.path === '/auth/v1/authorize');
    expect(authorize).toHaveLength(1);
  });

  test('Cancel on the chooser, then retry with a real account works and clears the error', async ({ page }) => {
    await createGoal(page, READ);
    await gotoHash(page, '/settings');
    await signInViaMock(page, 'Cancel');
    await expect(accountCard(page).getByRole('alert')).toContainText(EN.errors.AUTH_CANCELLED);
    await signInViaMock(page, 'Minh Test');
    await expect(accountCard(page)).toHaveAttribute('data-state', 'signed-in');
    await expect(accountCard(page).getByRole('alert')).toHaveCount(0);
  });

  test('token endpoint network failure (request aborted) → AUTH_FAILED, no session stored', async ({ page }) => {
    await gotoHash(page, '/settings');
    await page.route('**/auth/v1/token**', (r) => r.abort('failed'));
    await signInViaMock(page, 'Minh Test');
    await expect(accountCard(page).getByRole('alert')).toContainText(EN.errors.AUTH_FAILED, { timeout: 40_000 });
    expect(await storedSession(page)).toBeNull();
    expect(await kvSync(page)).toBeNull();
  });
});

test.describe('M6-AC5 extra: SDK lazy-load after sign-out', () => {
  test('signed-in reload loads the SDK; after Keep sign-out and reload it is never requested again', async ({ page }) => {
    const rec = recordRequests(page);
    await signInAsMinh(page);
    expect(rec.sdk().length).toBeGreaterThanOrEqual(1); // once per document: before leaving for the provider and again after the callback
    rec.urls.length = 0;
    await page.reload();
    await expect(accountCard(page)).toHaveAttribute('data-state', 'signed-in');
    await accountCard(page).getByRole('button', { name: EN.settings.account.signOut }).click();
    await page.getByTestId('signout-confirm').click();
    await expect(accountCard(page)).toHaveAttribute('data-state', 'signed-out');
    rec.urls.length = 0;
    await page.reload();
    for (const h of ['/today', '/goals', '/review', '/settings']) {
      await gotoHash(page, h);
      await expect(page.locator('main h1')).toBeVisible();
    }
    expect(rec.sdk()).toEqual([]);
    expect(rec.mock()).toEqual([]);
  });

  test('offline/online/visibility events while signed out do not load the SDK or call the mock', async ({ page, context }) => {
    const rec = recordRequests(page);
    await gotoHash(page, '/settings');
    await context.setOffline(true);
    await context.setOffline(false);
    await page.evaluate(() => {
      window.dispatchEvent(new Event('offline'));
      window.dispatchEvent(new Event('online'));
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await expect(signInButton(page)).toBeEnabled();
    expect(rec.sdk()).toEqual([]);
    expect(rec.mock()).toEqual([]);
  });
});

test.describe('M6-AC8 extra: expiry while the app stays open (real clock)', () => {
  test('4 s access token + refresh rejected → card turns "Sign in again" without reload; data kept', async ({ browser, mock }, testInfo) => {
    test.setTimeout(150_000);
    const ctx = await browser.newContext({ locale: 'en-US', timezoneId: 'Asia/Ho_Chi_Minh', baseURL: CLOUD_BASE_URL, userAgent: `Mozilla/5.0 opb-e2e-w${testInfo.workerIndex}-${process.pid}` });
    const page = await ctx.newPage(); // real clock on purpose
    await mock.session({ ttl: 4, refresh: 'invalid_grant', now: '' });
    await createGoal(page, READ);
    await gotoHash(page, '/settings');
    await signInViaMock(page, 'Minh Test');
    await expect(accountCard(page)).toHaveAttribute('data-state', /signed-in|expired/);
    await expect(accountCard(page)).toHaveAttribute('data-state', 'expired', { timeout: 100_000 });
    await expect(page.getByTestId('auth-expired')).toContainText(EN.settings.account.expiredTitle);
    expect(await kvSync(page)).toMatchObject({ account: { email: 'minh.test@example.com' } });
    await gotoHash(page, '/today');
    await expect(goalCard(page, 'Read')).toBeVisible();
    await ctx.close();
  });
});

test.describe('M6-AC9 extra: sign out edge cases', () => {
  test('sign out (Keep) while OFFLINE succeeds locally; session removed; goals kept', async ({ page, context }) => {
    await createGoal(page, READ);
    await signInAsMinh(page);
    await context.setOffline(true);
    await accountCard(page).getByRole('button', { name: EN.settings.account.signOut }).click();
    await page.getByTestId('signout-confirm').click();
    await expect(accountCard(page)).toHaveAttribute('data-state', 'signed-out');
    expect(await storedSession(page)).toBeNull();
    await context.setOffline(false);
    await gotoHash(page, '/today');
    await expect(goalCard(page, 'Read')).toBeVisible();
  });

  test('sign out (Remove) while OFFLINE: data removed, locale kept, dialog closes', async ({ page, context }) => {
    await createGoal(page, READ);
    await gotoHash(page, '/settings');
    await page.getByRole('radio', { name: 'Tiếng Việt' }).click();
    await signInViaMock(page, 'Minh Test', { auth: { signInGoogle: VI.auth.signInGoogle } });
    await expect(accountCard(page)).toHaveAttribute('data-state', 'signed-in');
    await context.setOffline(true);
    await accountCard(page).getByRole('button', { name: VI.settings.account.signOut }).click();
    await signOutDialog(page).getByRole('radio', { name: VI.auth.signOut.remove }).check();
    await page.getByTestId('signout-confirm').click();
    await expect(signOutDialog(page)).toBeHidden();
    await expect(accountCard(page)).toHaveAttribute('data-state', 'signed-out');
    expect(await storedSession(page)).toBeNull();
    expect(await kvGet(page, 'locale')).not.toBeNull();
    await context.setOffline(false);
  });

  test('running timer: Keep leaves it running; Remove clears it (no timer card, kv activeTimer null)', async ({ page }) => {
    await createGoal(page, READ);
    await gotoHash(page, '/today');
    await startTimer(page, 'Read');
    await signInAsMinh(page);
    await accountCard(page).getByRole('button', { name: EN.settings.account.signOut }).click();
    await page.getByTestId('signout-confirm').click();
    await expect(accountCard(page)).toHaveAttribute('data-state', 'signed-out');
    await gotoHash(page, '/today');
    await expect(timerCard(page)).toBeVisible();
    await gotoHash(page, '/settings');
    await signInViaMock(page, 'Minh Test');
    await accountCard(page).getByRole('button', { name: EN.settings.account.signOut }).click();
    await signOutDialog(page).getByRole('radio', { name: EN.auth.signOut.remove }).check();
    await page.getByTestId('signout-confirm').click();
    await expect(accountCard(page)).toHaveAttribute('data-state', 'signed-out');
    await gotoHash(page, '/today');
    await expect(goalCard(page, 'Read')).toHaveCount(0);
    await expect(timerCard(page)).toHaveCount(0);
    expect(await kvGet(page, 'activeTimer')).toBeNull();
  });

  test('Remove empties goals+entries stores and leaves only locale/loginPrompt in kv (real IndexedDB)', async ({ page }) => {
    await createGoal(page, READ);
    await gotoHash(page, '/today');
    await logTime(page, 'Read', 15);
    await signInAsMinh(page);
    await accountCard(page).getByRole('button', { name: EN.settings.account.signOut }).click();
    await signOutDialog(page).getByRole('radio', { name: EN.auth.signOut.remove }).check();
    await page.getByTestId('signout-confirm').click();
    await expect(accountCard(page)).toHaveAttribute('data-state', 'signed-out');
    const stores = await page.evaluate(
      () =>
        new Promise<Record<string, unknown[]>>((resolve, reject) => {
          const req = indexedDB.open('one-percent-better');
          req.onerror = () => reject(req.error);
          req.onsuccess = () => {
            const db = req.result;
            const names = Array.from(db.objectStoreNames);
            const out: Record<string, unknown[]> = {};
            let left = names.length;
            names.forEach((n) => {
              const r = db.transaction(n, 'readonly').objectStore(n).getAll();
              r.onsuccess = () => {
                out[n] = r.result;
                left -= 1;
                if (left === 0) {
                  db.close();
                  resolve(out);
                }
              };
            });
          };
        }),
    );
    expect(stores.goals).toEqual([]);
    expect(stores.entries).toEqual([]);
    const kvKeys = (stores.kv as Array<{ key: string }>).map((r) => r.key).sort();
    expect(kvKeys.filter((k) => !['locale', 'loginPrompt'].includes(k)), `kv keys left: ${kvKeys.join(',')}`).toEqual([]);
  });

  test('two tabs: sign out in tab A is reflected in tab B', async ({ page, context }) => {
    await signInAsMinh(page);
    const b = await context.newPage();
    await freezeClock(b);
    await b.goto(`${CLOUD_BASE_URL}#/settings`);
    await expect(accountCard(b)).toHaveAttribute('data-state', 'signed-in');
    await accountCard(page).getByRole('button', { name: EN.settings.account.signOut }).click();
    await page.getByTestId('signout-confirm').click();
    await expect(accountCard(page)).toHaveAttribute('data-state', 'signed-out');
    await expect(accountCard(b)).toHaveAttribute('data-state', 'signed-out', { timeout: 15_000 });
  });

  test('Esc closes D4 without signing out', async ({ page }) => {
    await signInAsMinh(page);
    await accountCard(page).getByRole('button', { name: EN.settings.account.signOut }).click();
    await expect(signOutDialog(page)).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(signOutDialog(page)).toBeHidden();
    await expect(accountCard(page)).toHaveAttribute('data-state', 'signed-in');
    expect(await storedSession(page)).not.toBeNull();
  });
});

test.describe('M6-AC12 security hygiene', () => {
  test('no token/key leaks to console, URL, history, cookies or unexpected storage; requests stay on app+mock origins', async ({ page, context }) => {
    const consoleText: string[] = [];
    page.on('console', (m) => consoleText.push(`${m.type()}: ${m.text()}`));
    page.on('pageerror', (e) => consoleText.push(`pageerror: ${e.message}`));
    const rec = recordRequests(page);
    const navUrls: string[] = [];
    page.on('framenavigated', (f) => navUrls.push(f.url()));
    await createGoal(page, READ);
    const s = await signInAndGrabSession(page);
    await page.reload();
    await expect(accountCard(page)).toHaveAttribute('data-state', 'signed-in');
    const needles = [s.access, s.refresh, 'sb_publishable_mock'];
    for (const n of needles) {
      expect(n.length).toBeGreaterThan(8);
      expect(consoleText.filter((c) => c.includes(n)), `console contains ${n.slice(0, 12)}…`).toEqual([]);
      expect(navUrls.filter((u) => u.includes(n))).toEqual([]);
      expect(rec.urls.filter((u) => u.includes(n))).toEqual([]);
    }
    expect(navUrls.filter((u) => /access_token|refresh_token|[?&]code=/.test(u) && !u.startsWith(MOCK_SUPABASE_URL) && !u.includes('auth=callback'))).toEqual([]);
    expect(await context.cookies()).toEqual([]);
    const inv = await page.evaluate(() => ({ local: Object.keys(localStorage), session: Object.keys(sessionStorage), cookie: document.cookie }));
    for (const k of inv.local) expect(k, `unexpected localStorage key ${k}`).toMatch(/^opb-auth(-flows?-.*code-verifier)?$/);
    for (const k of inv.session) expect(k, `unexpected sessionStorage key ${k}`).toMatch(/^opb-auth/);
    expect(inv.cookie).toBe('');
    const sync = JSON.stringify(await kvSync(page));
    for (const n of needles) expect(sync).not.toContain(n);
    expect(rec.external()).toEqual([]);
    console.log('console lines during flow:', consoleText.length, consoleText.slice(0, 5));
  });

  test('requests to the mock never carry service_role / secret keys', async ({ page }) => {
    const seen: string[] = [];
    page.on('request', (r) => {
      if (r.url().startsWith(MOCK_SUPABASE_URL)) seen.push(`${r.method()} ${new URL(r.url()).pathname} apikey=${r.headers().apikey ?? '-'}`);
    });
    await signInAsMinh(page);
    expect(seen.length).toBeGreaterThan(0);
    for (const a of seen) expect(a).not.toMatch(/service_role|sb_secret/);
  });
});

test.describe('M6 extra: service worker in control + signing-in state (A3)', () => {
  test('with the SW controlling the page the full round trip still works (callback URL with query is not swallowed by the precache)', async ({ page }) => {
    await createGoal(page, READ);
    await gotoHash(page, '/settings');
    await page.evaluate(() => navigator.serviceWorker.ready);
    await page.reload();
    await expect.poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller))).toBe(true);
    await signInViaMock(page, 'Minh Test');
    await expect(accountCard(page)).toHaveAttribute('data-state', 'signed-in');
    expect(page.url()).toBe(`${CLOUD_BASE_URL}#/settings`);
    expect(await page.evaluate(() => Boolean(navigator.serviceWorker.controller))).toBe(true);
    await gotoHash(page, '/today');
    await expect(goalCard(page, 'Read')).toBeVisible();
  });

  test('A3: while the code exchange is pending the card shows "Signing you in…" (role=status), button disabled+busy, no h-scroll; ends signed-in', async ({ page }) => {
    await gotoHash(page, '/settings');
    let release: () => void = () => undefined;
    const gate = new Promise<void>((r) => {
      release = r;
    });
    await page.route('**/auth/v1/token**', async (route) => {
      await gate;
      await route.continue();
    });
    await signInViaMock(page, 'Minh Test');
    const card = accountCard(page);
    await expect(card).toHaveAttribute('data-state', 'signing-in');
    await expect(card.getByRole('status')).toHaveText(EN.settings.account.signingInStatus);
    await expect(card.getByText(EN.settings.account.signingInBody)).toBeVisible();
    const btn = card.getByRole('button', { name: EN.auth.signingIn });
    await expect(btn).toBeDisabled();
    await expect(btn).toHaveAttribute('aria-busy', 'true');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
    release();
    await expect(card).toHaveAttribute('data-state', 'signed-in');
  });
});
