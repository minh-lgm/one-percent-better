// QC M14 round 1 - the iOS app in a browser: the REAL native build (`vite build --mode native-e2e`, cloud ON against a mock
// Supabase this file starts on 54399) with a recording fake of the Capacitor iOS bridge, including the SocialLogin plugin.
// Real adapters (src/integration/native/**, supabase-client) and the real CSS run; only the OS sheet is faked. NOT a
// substitute for NV-14 / NV-15 / NV-16 (real Google / Apple / Supabase).
// File name `.pw.ts` on purpose: the main playwright.config.ts does not pick it up; run it with
//   npx playwright test -c tests/qc/playwright.m14.config.ts
import { expect, test, type Page } from '@playwright/test';
import { startMockSupabase, signMockIdToken } from '../../e2e/mock-supabase/server.mjs';
import { createGoal, EN, expectAxeClean, expectNoHorizontalScroll, freezeClock, gotoHash, VI } from '../../e2e/helpers/app';

const MOCK_PORT = 54399;
const SHOTS = process.env.QC_SHOTS ?? '';

let mock: Awaited<ReturnType<typeof startMockSupabase>>;
test.beforeAll(async () => {
  mock = await startMockSupabase(MOCK_PORT);
});
test.afterAll(async () => {
  await mock.close();
});

interface Sheet {
  provider: string;
  method: string;
  options: Record<string, unknown>;
}
declare global {
  interface Window {
    __qc14: { sheets: Sheet[]; next: Record<string, unknown>; reply: (provider: string, r: unknown) => void };
    qcSign: (claims: Record<string, unknown>) => Promise<string>;
  }
}

/** What the fake SocialLogin plugin answers for the next `login` of a provider. */
type Reply = { email: string; givenName?: string; familyName?: string; code?: string | null; cancel?: boolean; fail?: string; noNonce?: boolean };

async function emulateIos(page: Page): Promise<void> {
  await page.exposeFunction('qcSign', (claims: Record<string, unknown>) => signMockIdToken(claims));
  await page.addInitScript(() => {
    const w = window as unknown as Record<string, unknown>;
    const sheets: Sheet[] = [];
    const replies: Record<string, Reply | undefined> = {};
    w.__qc14 = {
      sheets,
      next: replies,
      reply: (provider: string, r: unknown) => {
        replies[provider] = r as Reply;
      },
    } as Window['__qc14'];
    w.webkit = { messageHandlers: { bridge: { postMessage() {} } } };
    let nextId = 1;
    const plugins = [
      { name: 'StatusBar', methods: [{ name: 'setStyle', rtype: 'promise' }] },
      { name: 'SplashScreen', methods: [{ name: 'hide', rtype: 'promise' }] },
      { name: 'App', methods: [{ name: 'addListener', rtype: 'callback' }, { name: 'removeListener', rtype: 'promise' }] },
      { name: 'Keyboard', methods: [{ name: 'addListener', rtype: 'callback' }, { name: 'removeListener', rtype: 'promise' }] },
      { name: 'SocialLogin', methods: [{ name: 'initialize', rtype: 'promise' }, { name: 'login', rtype: 'promise' }, { name: 'logout', rtype: 'promise' }] },
    ];
    w.Capacitor = {
      PluginHeaders: plugins,
      async nativePromise(plugin: string, method: string, options: Record<string, unknown>) {
        if (plugin !== 'SocialLogin') return {};
        sheets.push({ provider: String((options as { provider?: string }).provider ?? ''), method, options: JSON.parse(JSON.stringify(options ?? {})) });
        if (method !== 'login') return {};
        const provider = String((options as { provider: string }).provider);
        const r = replies[provider];
        if (!r) throw Object.assign(new Error('no scripted reply'), { code: 'UNKNOWN' });
        if (r.cancel) throw Object.assign(new Error('The user canceled the sign-in flow.'), { code: 'USER_CANCELLED' });
        if (r.fail) throw new Error(r.fail);
        const nonce = (options as { options?: { nonce?: string } }).options?.nonce;
        const idToken = await (window as unknown as Window).qcSign({ email: r.email, // Apple identity tokens carry no name claim (the name arrives in the sheet response only, first time).
          name: provider === 'apple' ? undefined : [r.givenName, r.familyName].filter(Boolean).join(' ') || undefined, ...(r.noNonce ? {} : { nonce }), aud: provider === 'apple' ? 'io.github.minhlgm.onepercentbetter' : 'web-client' });
        return provider === 'apple'
          ? { provider, result: { idToken, accessToken: null, authorizationCode: r.code === null ? undefined : (r.code ?? 'apple-auth-code-1'), profile: { user: 'apple-user', email: r.email, givenName: r.givenName ?? null, familyName: r.familyName ?? null } } }
          : { provider, result: { idToken, accessToken: { token: 'at' }, profile: { email: r.email, givenName: r.givenName ?? null, familyName: r.familyName ?? null } } };
      },
      nativeCallback() {
        return nextId++;
      },
    };
  });
}

const counters = async () => (await (await fetch(`${mock.url}/__test/log`)).json()) as { idTokenSignIns: number; userUpdates: number; deletions: number };
const card = (page: Page) => page.getByTestId('account-card');
const sheets = (page: Page) => page.evaluate(() => window.__qc14.sheets);
const reply = (page: Page, provider: 'apple' | 'google', r: Reply) => page.evaluate(([p, v]) => window.__qc14.reply(p as string, v), [provider, r] as const);
const shot = async (page: Page, name: string) => {
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/${name}.png` });
};

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 740 });
  await freezeClock(page);
  await emulateIos(page);
  await fetch(`${mock.url}/__test/reset`);
});

async function openSettings(page: Page) {
  await page.goto('/#/settings');
  await expect(card(page)).toBeVisible();
}

test.describe('iOS emulation: buttons', () => {
  for (const scheme of ['light', 'dark'] as const) {
    test(`${scheme}: Apple above Google, same width, >= 44 px, HIG colours; web wording replaced by the iOS copy; axe clean; no horizontal scroll`, async ({ page }) => {
      await page.emulateMedia({ colorScheme: scheme });
      await openSettings(page);
      await expect(card(page)).toHaveAttribute('data-state', 'signed-out');
      const apple = card(page).getByRole('button', { name: EN.auth.signInApple });
      const google = card(page).getByRole('button', { name: EN.auth.signInGoogle });
      await expect(apple).toBeVisible();
      await expect(google).toBeVisible();
      const [a, g] = [await apple.boundingBox(), await google.boundingBox()];
      expect(a!.y + a!.height).toBeLessThanOrEqual(g!.y);
      expect(g!.y - (a!.y + a!.height)).toBeGreaterThanOrEqual(11);
      expect(Math.abs(a!.width - g!.width)).toBeLessThanOrEqual(1);
      expect(a!.height).toBeGreaterThanOrEqual(44);
      const css = await apple.evaluate((el) => {
        const s = getComputedStyle(el);
        return { bg: s.backgroundColor, color: s.color };
      });
      expect(css).toEqual(scheme === 'light' ? { bg: 'rgb(0, 0, 0)', color: 'rgb(255, 255, 255)' } : { bg: 'rgb(255, 255, 255)', color: 'rgb(0, 0, 0)' });
      await expect(card(page).getByText(EN.settings.account.descSignedOutIos)).toBeVisible();
      await expect(card(page).getByTestId('hide-email-note')).toHaveText(EN.settings.account.hideEmailNote);
      await expectAxeClean(page);
      await expectNoHorizontalScroll(page);
      await shot(page, `ios-signed-out-${scheme}`);
    });
  }
});

test.describe('iOS emulation: vi', () => {
  test.use({ locale: 'vi-VN' });
  test('vi-VN: both button labels and the iOS copy are Vietnamese, no horizontal scroll, axe clean', async ({ page }) => {
    await openSettings(page);
    await expect(card(page).getByRole('button', { name: VI.auth.signInApple })).toBeVisible();
    await expect(card(page).getByRole('button', { name: VI.auth.signInGoogle })).toBeVisible();
    await expect(card(page).getByText(VI.settings.account.descSignedOutIos)).toBeVisible();
    await expect(card(page).getByTestId('hide-email-note')).toHaveText(VI.settings.account.hideEmailNote);
    await expectNoHorizontalScroll(page);
    await expectAxeClean(page);
    await shot(page, 'ios-signed-out-vi');
  });
});

test.describe('iOS emulation: Apple sign-in end to end (mock Supabase)', () => {
  test('first sign-in with a real email: initialize once with the documented options, nonce = SHA-256 digest, name saved once, "Signed in with Apple", sync runs; sign out calls logout(apple)', async ({ page }) => {
    const c0 = await counters();
    await openSettings(page);
    await reply(page, 'apple', { email: 'apple.first@example.com', givenName: 'Ada', familyName: 'Lovelace' });
    await card(page).getByRole('button', { name: EN.auth.signInApple }).click();
    await expect(card(page)).toHaveAttribute('data-state', 'signed-in', { timeout: 15_000 });
    await expect(card(page).getByTestId('account-provider')).toHaveText(EN.settings.account.providerApple);
    await expect(card(page).getByTestId('account-email')).toHaveText('apple.first@example.com');
    await expect(card(page).getByTestId('account-name')).toHaveText('Ada Lovelace');
    const s = await sheets(page);
    const init = s.filter((x) => x.method === 'initialize');
    expect(init).toHaveLength(1);
    expect(init[0].options).toMatchObject({ apple: { useProperTokenExchange: true } });
    expect(JSON.stringify(init[0].options)).not.toContain('clientId"');
    const login = s.find((x) => x.method === 'login')!;
    expect(login.options).toMatchObject({ provider: 'apple', options: { scopes: ['name', 'email'] } });
    expect((login.options as { options: { nonce: string } }).options.nonce).toMatch(/^[0-9a-f]{64}$/);
    const c1 = await counters();
    expect(c1.idTokenSignIns - c0.idTokenSignIns).toBe(1);
    expect(c1.userUpdates - c0.userUpdates).toBe(1);
    // No OAuth redirect was started and no foreign host was contacted.
    await expect(card(page).getByTestId('sync-details')).toBeVisible();
    await shot(page, 'ios-signed-in-apple');
    await card(page).getByRole('button', { name: EN.settings.account.signOut }).click();
    await page.getByTestId('signout-confirm').click();
    await expect.poll(async () => (await sheets(page)).filter((x) => x.method === 'logout').map((x) => x.provider)).toContain('apple');
  });

  test('Hide My Email relay address gives a separate account; second Apple sign-in (no name returned) does not call PUT /user again', async ({ page }) => {
    await openSettings(page);
    await reply(page, 'apple', { email: 'abc123@privaterelay.appleid.com', givenName: 'Ada', familyName: 'L' });
    await card(page).getByRole('button', { name: EN.auth.signInApple }).click();
    await expect(card(page)).toHaveAttribute('data-state', 'signed-in', { timeout: 15_000 });
    await expect(card(page).getByTestId('account-email')).toHaveText('abc123@privaterelay.appleid.com');
    const users = (await (await fetch(`${mock.url}/__test/users`)).json()) as { users: Array<{ email: string }> };
    expect(users.users.map((u) => u.email)).toContain('abc123@privaterelay.appleid.com');
    expect(users.users).toHaveLength(3); // u1, u2 + the relay account
  });

  test('Google sheet then Apple with the same email: same account (providers google+apple), copy "Signed in with Apple or Google", same goals', async ({ page }) => {
    await openSettings(page);
    await createGoal(page, { name: 'Local goal', targetValue: 30, startDate: '2026-10-01', endDate: '2026-10-31' });
    await gotoHash(page, '/settings');
    await reply(page, 'google', { email: 'minh.test@example.com', givenName: 'Minh', familyName: 'Test' });
    await card(page).getByRole('button', { name: EN.auth.signInGoogle }).click();
    await expect(card(page)).toHaveAttribute('data-state', 'signed-in', { timeout: 15_000 });
    await expect(card(page).getByTestId('account-provider')).toHaveText(EN.settings.account.provider);
    const g = (await sheets(page)).find((x) => x.method === 'initialize')!;
    expect(g.options).toMatchObject({ google: { mode: 'online' } });
    await expect(card(page).getByTestId('sync-details')).toBeVisible();
    await card(page).getByRole('button', { name: EN.settings.account.signOut }).click();
    await page.getByTestId('signout-confirm').click(); // default: keep the data
    await expect(card(page)).toHaveAttribute('data-state', 'signed-out', { timeout: 15_000 });
    await reply(page, 'apple', { email: 'minh.test@example.com', givenName: 'Minh', familyName: 'Test' });
    await card(page).getByRole('button', { name: EN.auth.signInApple }).click();
    await expect(card(page)).toHaveAttribute('data-state', 'signed-in', { timeout: 15_000 });
    await expect(card(page).getByTestId('account-provider')).toHaveText(EN.settings.account.providerBoth);
    const users = (await (await fetch(`${mock.url}/__test/users`)).json()) as { users: Array<{ email: string; providers?: string[] }> };
    expect(users.users.filter((u) => u.email === 'minh.test@example.com')).toHaveLength(1);
  });

  test('cancel -> signed-out with the cancelled message, nothing stored; failure -> the native "Couldn\'t sign you in" message; a wrong nonce (token minted without it) is refused by Supabase and shows the failure', async ({ page }) => {
    await openSettings(page);
    await reply(page, 'apple', { email: 'x@example.com', cancel: true });
    await card(page).getByRole('button', { name: EN.auth.signInApple }).click();
    await expect(card(page)).toHaveAttribute('data-state', 'signed-out');
    await expect(page.getByText(EN.errors.AUTH_CANCELLED).first()).toBeVisible();
    await reply(page, 'apple', { email: 'x@example.com', fail: 'ASAuthorizationError 1000' });
    await card(page).getByRole('button', { name: EN.auth.signInApple }).click();
    await expect(page.getByText(EN.errors.AUTH_FAILED_native).first()).toBeVisible();
    await expect(card(page)).toHaveAttribute('data-state', 'signed-out');
    // token minted for a different nonce
    await reply(page, 'apple', { email: 'x@example.com' });
    await page.evaluate(() => {
      const orig = (window as unknown as { Capacitor: { nativePromise: (...a: unknown[]) => Promise<unknown> } }).Capacitor.nativePromise;
      (window as unknown as { Capacitor: { nativePromise: (...a: unknown[]) => Promise<unknown> } }).Capacitor.nativePromise = (plugin, method, options) => {
        const o = options as { options?: { nonce?: string } };
        if (plugin === 'SocialLogin' && method === 'login' && o.options) o.options = { ...o.options, nonce: 'f'.repeat(64) };
        return orig(plugin, method, o);
      };
    });
    await card(page).getByRole('button', { name: EN.auth.signInApple }).click();
    await expect(page.getByText(EN.errors.AUTH_FAILED_native).first()).toBeVisible();
    await expect(card(page)).toHaveAttribute('data-state', 'signed-out');
    expect(await page.evaluate(() => localStorage.getItem('opb-auth'))).toBeNull();
  });

  test('offline: both buttons disabled with the offline hint; signing in never opens a sheet', async ({ page, context }) => {
    await openSettings(page);
    await context.setOffline(true);
    await expect(card(page).getByRole('button', { name: EN.auth.signInApple })).toBeDisabled();
    await expect(card(page).getByRole('button', { name: EN.auth.signInGoogle })).toBeDisabled();
    expect((await sheets(page)).filter((x) => x.method === 'login')).toEqual([]);
    await context.setOffline(false);
  });
});

test.describe('iOS emulation: Delete account with an Apple account', () => {
  async function signInApple(page: Page, email = 'apple.del@example.com') {
    await openSettings(page);
    await reply(page, 'apple', { email, givenName: 'Ada', familyName: 'Lovelace' });
    await card(page).getByRole('button', { name: EN.auth.signInApple }).click();
    await expect(card(page)).toHaveAttribute('data-state', 'signed-in', { timeout: 15_000 });
  }

  test('D6 shows the Apple note; confirm asks Apple again, sends the authorization code, account gone, toast, no revoke panel (mock revoked)', async ({ page }) => {
    await signInApple(page);
    await card(page).getByRole('button', { name: EN.settings.account.delete }).click();
    const d = page.getByTestId('delete-account-dialog');
    await expect(d.getByTestId('delete-apple-note')).toHaveText(EN.auth.delete.appleNote);
    await shot(page, 'ios-d6-apple-note');
    let body: string | null = null;
    page.on('request', (r) => {
      if (r.url().endsWith('/functions/v1/delete-account')) body = r.postData();
    });
    const d0 = (await counters()).deletions;
    await reply(page, 'apple', { email: 'apple.del@example.com', code: 'code-from-reauth' });
    const before = (await sheets(page)).filter((x) => x.method === 'login').length;
    await d.getByTestId('delete-account-confirm').click();
    await expect(card(page)).toHaveAttribute('data-state', 'signed-out', { timeout: 15_000 });
    expect((await sheets(page)).filter((x) => x.method === 'login').length).toBe(before + 1);
    expect(JSON.parse(body ?? '{}')).toEqual({ appleAuthorizationCode: 'code-from-reauth' });
    await expect(page.getByTestId('apple-revoke-panel')).toHaveCount(0);
    await expect(page.getByTestId('toast')).toContainText(EN.toast.accountDeletedRemoved).catch(() => undefined);
    expect((await counters()).deletions - d0).toBe(1);
    expect((await sheets(page)).filter((x) => x.method === 'logout').map((x) => x.provider)).toContain('apple');
  });

  test('Apple confirmation cancelled -> ACCOUNT_DELETE_CANCELLED in D6, nothing sent, still signed in', async ({ page }) => {
    await signInApple(page);
    await card(page).getByRole('button', { name: EN.settings.account.delete }).click();
    const d0 = (await counters()).deletions;
    await reply(page, 'apple', { email: 'apple.del@example.com', cancel: true });
    await page.getByTestId('delete-account-confirm').click();
    await expect(page.getByTestId('delete-account-error')).toHaveText(EN.errors.ACCOUNT_DELETE_CANCELLED);
    expect((await counters()).deletions - d0).toBe(0);
    await expect(card(page)).toHaveAttribute('data-state', 'signed-in');
  });

  test('no authorization code from the plugin -> account deleted, manual-required -> revoke panel with the Apple support link; Dismiss returns focus to the heading', async ({ page }) => {
    await signInApple(page, 'apple.nocode@example.com');
    await card(page).getByRole('button', { name: EN.settings.account.delete }).click();
    await reply(page, 'apple', { email: 'apple.nocode@example.com', code: null });
    await page.getByTestId('delete-account-confirm').click();
    await expect(card(page)).toHaveAttribute('data-state', 'signed-out', { timeout: 15_000 });
    const panel = page.getByTestId('apple-revoke-panel');
    await expect(panel).toBeVisible();
    const link = panel.getByTestId('apple-revoke-link');
    await expect(link).toHaveAttribute('href', 'https://support.apple.com/102571');
    await expect(link).toHaveAttribute('target', '_blank');
    await expect(link).toHaveAttribute('rel', /noopener/);
    await expectAxeClean(page);
    await shot(page, 'ios-revoke-panel');
    await panel.getByTestId('apple-revoke-dismiss').click();
    await expect(panel).toHaveCount(0);
    await expect(page.getByRole('heading', { level: 2, name: EN.settings.account.title })).toBeFocused();
  });
});
