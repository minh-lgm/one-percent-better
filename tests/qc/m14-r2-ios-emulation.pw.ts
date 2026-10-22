// QC M14 round 2 - iOS-in-a-browser emulation (same fake Capacitor bridge as the round 1 file) for what round 1 could not
// reach: (variant "ids") Keep data then sign in again with the SAME email, which the mock treats as a brand-new account (new
// user id), and Delete -> Keep -> other account -> Remove -> back on the native build; (variants "noid" and "webonly") the
// build WITHOUT VITE_GOOGLE_* or with only the web id: no Google button anywhere (M14-D1).
// Run (see playwright.m14r2.config.ts for the three builds):  QC_VARIANT=ids|noid|webonly npx playwright test -c tests/qc/playwright.m14r2.config.ts
import { expect, test, type Page } from '@playwright/test';
import { startMockSupabase, signMockIdToken } from '../../e2e/mock-supabase/server.mjs';
import { createGoal, EN, expectAxeClean, expectNoHorizontalScroll, freezeClock, goalCard, gotoHash, VI } from '../../e2e/helpers/app';

const VARIANT = process.env.QC_VARIANT ?? 'ids';
const MOCK_PORT = Number(process.env.QC_MOCK_PORT ?? 54399);
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


const card = (page: Page) => page.getByTestId('account-card');
const sheets = (page: Page) => page.evaluate(() => window.__qc14.sheets);
const reply = (page: Page, provider: 'apple' | 'google', r: Reply) => page.evaluate(([p, v]) => window.__qc14.reply(p as string, v), [provider, r] as const);
const shot = async (page: Page, name: string) => {
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/${name}.png` });
};
const syncIndicator = (page: Page) => page.getByTestId('sync-indicator');
const usersOf = async () => (await (await fetch(`${mock.url}/__test/users`)).json()) as { users: Array<{ id: string; email: string }>; deleted: string[] };
const rowsOf = async (user: string) => (await (await fetch(`${mock.url}/__test/rows?user=${user}`)).json()) as { goals: Array<{ name: string; deleted_at: string | null }>; entries: unknown[] };
const liveNames = async (user: string) =>
  (await rowsOf(user)).goals
    .filter((g) => g.deleted_at === null)
    .map((g) => g.name)
    .sort();

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

test.describe('ids variant: native build with both Google client ids', () => {
  test.skip(VARIANT !== 'ids', 'needs the build with both VITE_GOOGLE_* ids');

  async function googleIn(page: Page, email: string) {
    await reply(page, 'google', { email, givenName: 'Gina', familyName: 'Google' });
    await card(page).getByRole('button', { name: EN.auth.signInGoogle }).click();
    await expect(card(page)).toHaveAttribute('data-state', 'signed-in', { timeout: 15_000 });
  }
  async function deleteKeep(page: Page) {
    await card(page).getByRole('button', { name: EN.settings.account.delete }).click();
    const d = page.getByTestId('delete-account-dialog');
    await d.getByRole('radio', { name: EN.auth.delete.keep }).check();
    await d.getByTestId('delete-account-confirm').click();
    await expect(card(page)).toHaveAttribute('data-state', 'signed-out', { timeout: 15_000 });
  }

  // NOTE (mock limitation, reported as M14-D8): the mock's REST writes fail (500) for accounts it creates through the id_token
  // grant (e2e/mock-supabase/server.mjs upsertRow/upsertSettings read USERS[userKey].id, undefined for generated ids). So the
  // "brand-new account" check below stops at "the app uploaded to the new account" (a POST /rest/v1/goals with the new token)
  // and the other tests use the two fixed mock users u1 / u2 (minh.test@ / other.user@example.com).
  const goalPosts = async () => ((await (await fetch(`${mock.url}/__test/log`)).json()) as { log: Array<{ method: string; path: string; rows: number }> }).log.filter((l) => l.method === 'POST' && l.path === '/rest/v1/goals' && l.rows > 0).length;
  const U1_ID = '00000000-0000-4000-8000-000000000001';

  test('Keep data, then the SAME email signs in again (a brand-new account with a new user id): no D5, the kept goal is uploaded to it (mock rejects the write, see NOTE)', async ({ page }) => {
    await openSettings(page);
    await createGoal(page, { name: 'Kept goal', targetValue: 30, startDate: '2026-10-01', endDate: '2026-10-31' });
    await gotoHash(page, '/settings');
    await googleIn(page, 'minh.test@example.com');
    await expect(syncIndicator(page)).toHaveAttribute('data-state', 'synced', { timeout: 15_000 });
    expect(await liveNames('u1')).toEqual(['Kept goal']);
    await deleteKeep(page);
    const afterDelete = await usersOf();
    expect(afterDelete.deleted).toContain(U1_ID);
    expect(afterDelete.users.find((u) => u.email === 'minh.test@example.com')).toBeUndefined();
    expect(await liveNames('u1')).toEqual([]); // the dead account's rows are gone
    await gotoHash(page, '/today');
    await expect(goalCard(page, 'Kept goal')).toBeVisible(); // kept on the device
    await gotoHash(page, '/settings');
    const postsBefore = await goalPosts();
    await googleIn(page, 'minh.test@example.com');
    await expect(page.getByTestId('merge-dialog')).toBeHidden();
    const second = (await usersOf()).users.find((u) => u.email === 'minh.test@example.com')!;
    expect(second.id).not.toBe(U1_ID); // new account, same email
    await expect.poll(goalPosts, { timeout: 10_000 }).toBeGreaterThan(postsBefore); // the app pushed the kept goal to the new account
    await gotoHash(page, '/today');
    await expect(goalCard(page, 'Kept goal')).toBeVisible();
    await shot(page, 'r2-ios-same-email-again');
  });

  test('Delete (Keep) -> other account -> Sign out Remove -> that account again: the goal survives', async ({ page }) => {
    await openSettings(page);
    await createGoal(page, { name: 'Survivor', targetValue: 30, startDate: '2026-10-01', endDate: '2026-10-31' });
    await gotoHash(page, '/settings');
    await googleIn(page, 'minh.test@example.com');
    await expect(syncIndicator(page)).toHaveAttribute('data-state', 'synced', { timeout: 15_000 });
    await deleteKeep(page);
    await googleIn(page, 'other.user@example.com');
    await expect(syncIndicator(page)).toHaveAttribute('data-state', 'synced', { timeout: 15_000 });
    expect(await liveNames('u2')).toEqual(['Survivor']);
    await card(page).getByRole('button', { name: EN.settings.account.signOut }).click();
    await page.getByTestId('signout-dialog').getByRole('radio', { name: EN.auth.signOut.remove }).check();
    await page.getByTestId('signout-confirm').click();
    await expect(card(page)).toHaveAttribute('data-state', 'signed-out', { timeout: 30_000 });
    await gotoHash(page, '/today');
    await expect(goalCard(page, 'Survivor')).toHaveCount(0);
    await gotoHash(page, '/settings');
    await googleIn(page, 'other.user@example.com');
    await expect(syncIndicator(page)).toHaveAttribute('data-state', 'synced', { timeout: 15_000 });
    await gotoHash(page, '/today');
    await expect(goalCard(page, 'Survivor')).toBeVisible();
  });

  test('Apple account deleted with Keep, then Google as the other user: the data follows; Apple was asked twice (sign-in + deletion reauth)', async ({ page }) => {
    await openSettings(page);
    await createGoal(page, { name: 'Apple kept', targetValue: 30, startDate: '2026-10-01', endDate: '2026-10-31' });
    await gotoHash(page, '/settings');
    await reply(page, 'apple', { email: 'minh.test@example.com', givenName: 'Minh', familyName: 'Test' });
    await card(page).getByRole('button', { name: EN.auth.signInApple }).click();
    await expect(card(page)).toHaveAttribute('data-state', 'signed-in', { timeout: 15_000 });
    await expect(syncIndicator(page)).toHaveAttribute('data-state', 'synced', { timeout: 15_000 });
    await reply(page, 'apple', { email: 'minh.test@example.com', code: 'code-1' });
    await deleteKeep(page);
    await googleIn(page, 'other.user@example.com');
    await expect(syncIndicator(page)).toHaveAttribute('data-state', 'synced', { timeout: 15_000 });
    expect(await liveNames('u2')).toEqual(['Apple kept']);
    expect((await sheets(page)).filter((x) => x.method === 'login' && x.provider === 'apple')).toHaveLength(2);
  });
});

test.describe('noid / webonly variants: native build where Google native is unavailable (M14-D1)', () => {
  test.skip(VARIANT === 'ids', 'needs a build without both VITE_GOOGLE_* ids');

  test('signed-out card: Apple only, no Google button, axe clean, no horizontal scroll; no sheet opens at load', async ({ page }) => {
    await openSettings(page);
    await expect(card(page)).toHaveAttribute('data-state', 'signed-out');
    await expect(card(page).getByRole('button', { name: EN.auth.signInApple })).toBeVisible();
    expect(await page.getByRole('button', { name: EN.auth.signInGoogle }).count()).toBe(0);
    expect(await page.getByTestId('google-sign-in').count()).toBe(0);
    expect(await card(page).getByRole('button').count()).toBe(1);
    await expectAxeClean(page);
    await expectNoHorizontalScroll(page);
    const apple = await card(page).getByRole('button', { name: EN.auth.signInApple }).boundingBox();
    expect(apple!.height).toBeGreaterThanOrEqual(44);
    expect((await sheets(page)).filter((x) => x.method === 'login')).toEqual([]);
    await shot(page, `r2-ios-${VARIANT}-signed-out`);
  });

  test('vi-VN: Apple only', async ({ browser }) => {
    const ctx = await browser.newContext({ locale: 'vi-VN', viewport: { width: 360, height: 740 }, baseURL: test.info().project.use.baseURL as string });
    const page = await ctx.newPage();
    await freezeClock(page);
    await emulateIos(page);
    await openSettings(page);
    await expect(card(page).getByRole('button', { name: VI.auth.signInApple })).toBeVisible();
    expect(await page.getByRole('button', { name: VI.auth.signInGoogle }).count()).toBe(0);
    await ctx.close();
  });

  test('after a goal exists: Today and Settings never show a Google button', async ({ page }) => {
    await page.goto('/#/today');
    await createGoal(page, { name: 'G', targetValue: 30, startDate: '2026-10-01', endDate: '2026-10-31' });
    await gotoHash(page, '/today');
    expect(await page.getByRole('button', { name: EN.auth.signInGoogle }).count()).toBe(0);
    const banner = page.getByTestId('login-prompt-banner');
    if (await banner.isVisible().catch(() => false)) await expect(banner.getByRole('button', { name: EN.auth.signInApple })).toBeVisible();
    await gotoHash(page, '/settings');
    expect(await page.getByRole('button', { name: EN.auth.signInGoogle }).count()).toBe(0);
  });

  test('Apple sign-in still works end to end on this build; initialize carries no Google config; after sign-out still no Google button', async ({ page }) => {
    await openSettings(page);
    await reply(page, 'apple', { email: 'only.apple@example.com', givenName: 'Only', familyName: 'Apple' });
    await card(page).getByRole('button', { name: EN.auth.signInApple }).click();
    await expect(card(page)).toHaveAttribute('data-state', 'signed-in', { timeout: 15_000 });
    await expect(card(page).getByTestId('account-provider')).toHaveText(EN.settings.account.providerApple);
    const s = await sheets(page);
    expect(s.filter((x) => x.method === 'initialize')).toHaveLength(1);
    expect(JSON.stringify(s.find((x) => x.method === 'initialize')!.options)).not.toContain('google');
    await card(page).getByRole('button', { name: EN.settings.account.signOut }).click();
    await page.getByTestId('signout-confirm').click();
    await expect(card(page)).toHaveAttribute('data-state', 'signed-out', { timeout: 15_000 });
    expect(await page.getByRole('button', { name: EN.auth.signInGoogle }).count()).toBe(0);
  });
});
