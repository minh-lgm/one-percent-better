import { expect, test } from './fixtures';
import { at, createGoal, EN, expectAxeClean, freezeClock, goalCard, gotoHash, logTime, toast } from '../helpers/app';
import { accountCard, CLOUD_BASE_URL, FIXED_MS, kvSync, recordRequests, signInAsMinh, signInButton, signInViaMock, signOutDialog, storedSession } from './helpers';

const READ = { name: 'Read', targetValue: 30, startDate: '2026-10-01', endDate: '2026-10-31' };

test.beforeEach(async ({ page, mock }) => {
  await mock.reset();
  await freezeClock(page);
});

test.describe('M6-AC6 sign in with Google (PKCE on the GitHub Pages sub-path)', () => {
  test('Settings → Sign in → mock chooser → back on #/settings without query; card shows the account; one exchange; survives reload', async ({ page, mock }) => {
    const rec = recordRequests(page);
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await createGoal(page, READ);
    await gotoHash(page, '/settings');
    await expect(accountCard(page)).toHaveAttribute('data-state', 'signed-out');
    await expect(page.getByText(EN.settings.about.descCloud)).toBeVisible();
    await expectAxeClean(page);

    await signInViaMock(page, 'Minh Test');
    expect(page.url()).toBe(`${CLOUD_BASE_URL}#/settings`);
    await expect(accountCard(page)).toHaveAttribute('data-state', 'signed-in');
    await expect(accountCard(page).getByTestId('account-email')).toHaveText('minh.test@example.com');
    await expect(accountCard(page).getByTestId('account-name')).toHaveText('Minh Test');
    await expect(accountCard(page).getByTestId('avatar')).toHaveText('M');
    // M7 (DESIGN F11): the device had a goal, so the first sign-in merges it and the merge toast is the one shown.
    await expect(toast(page)).toHaveText('Signed in. Your account now has 1 goal, 0 entries.');
    await expect(page.getByText(EN.settings.about.descSignedIn)).toBeVisible();
    await expect(page.getByRole('heading', { level: 1, name: EN.settings.title })).toBeVisible();
    await expectAxeClean(page);

    const log = await mock.log();
    const authorize = log.log.find((l) => l.path === '/auth/v1/authorize');
    expect(authorize?.query.code_challenge_method).toBe('s256');
    expect(authorize?.query.redirect_to).toBe('http://localhost:4174/one-percent-better/?auth=callback');
    expect(authorize?.query.provider).toBe('google');
    expect(authorize?.query.scopes).toBeUndefined();
    expect(log.log.filter((l) => l.method === 'POST' && l.path === '/auth/v1/token' && l.query.grant_type === 'pkce')).toHaveLength(1);
    expect(log.exchanges).toBe(1);

    await page.reload();
    await expect(accountCard(page)).toHaveAttribute('data-state', 'signed-in');
    await expect(accountCard(page).getByTestId('account-email')).toHaveText('minh.test@example.com');
    expect((await mock.log()).exchanges).toBe(1);
    expect(page.url()).toBe(`${CLOUD_BASE_URL}#/settings`);
    await gotoHash(page, '/today');
    await expect(goalCard(page, 'Read')).toBeVisible();

    // M6-AC12: every request stays within the app and the mock; nothing from Google; no avatar image.
    expect(rec.external()).toEqual([]);
    expect(rec.urls.filter((u) => u.includes('googleusercontent.com'))).toEqual([]);
    expect(await accountCard(page).locator('img').count()).toBe(0);
    expect(errors).toEqual([]);
    expect(await kvSync(page)).toMatchObject({ userId: '00000000-0000-4000-8000-000000000001', account: { email: 'minh.test@example.com', name: 'Minh Test' } });
  });

  test('returnTo: starting from Today (via Settings link) still returns to the screen the flow started on', async ({ page }) => {
    await createGoal(page, READ);
    await gotoHash(page, '/settings');
    await signInViaMock(page, 'Other User');
    expect(page.url()).toBe(`${CLOUD_BASE_URL}#/settings`);
    await expect(accountCard(page).getByTestId('account-email')).toHaveText('other.user@example.com');
    await expect(accountCard(page).getByTestId('account-name')).toHaveText('Other User');
  });
});

test.describe('M6-AC7 cancel, failure, offline', () => {
  test('Cancel on the chooser → back on #/settings, not signed in, Alert AUTH_CANCELLED, goal untouched', async ({ page, mock }) => {
    await createGoal(page, READ);
    await gotoHash(page, '/settings');
    await signInViaMock(page, 'Cancel');
    expect(page.url()).toBe(`${CLOUD_BASE_URL}#/settings`);
    await expect(accountCard(page)).toHaveAttribute('data-state', 'signed-out');
    await expect(accountCard(page).getByRole('alert')).toHaveText(new RegExp(EN.errors.AUTH_CANCELLED.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
    await expect(signInButton(page)).toBeEnabled();
    expect(await storedSession(page)).toBeNull();
    expect((await mock.log()).exchanges).toBe(0);
    await page.getByRole('button', { name: EN.common.dismiss }).click();
    await expect(accountCard(page).getByRole('alert')).toHaveCount(0);
    await expect(signInButton(page)).toBeFocused();
    await gotoHash(page, '/today');
    await expect(goalCard(page, 'Read')).toBeVisible();
  });

  test('token endpoint 500 → Alert AUTH_FAILED, nothing changed', async ({ page, mock }) => {
    await createGoal(page, READ);
    await gotoHash(page, '/settings');
    await mock.fail('token', 500, 1);
    await signInViaMock(page, 'Minh Test');
    await expect(accountCard(page)).toHaveAttribute('data-state', 'signed-out');
    await expect(accountCard(page).getByRole('alert')).toContainText(EN.errors.AUTH_FAILED);
    expect(page.url()).toBe(`${CLOUD_BASE_URL}#/settings`);
    expect(await storedSession(page)).toBeNull();
    await gotoHash(page, '/today');
    await expect(goalCard(page, 'Read')).toBeVisible();
  });

  test('opening the callback URL directly with a bogus code (no verifier) → AUTH_FAILED, no blank page', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(`${CLOUD_BASE_URL}?auth=callback&code=bogus`);
    await expect(page.getByRole('heading', { level: 1, name: EN.settings.title })).toBeVisible();
    expect(page.url()).toBe(`${CLOUD_BASE_URL}#/settings`);
    await expect(accountCard(page).getByRole('alert')).toContainText(EN.errors.AUTH_FAILED);
    await expect(accountCard(page)).toHaveAttribute('data-state', 'signed-out');
    expect(errors).toEqual([]);
    await page.reload();
    await expect(accountCard(page)).toHaveAttribute('data-state', 'signed-out');
  });

  test('callback error while landing on Today (returnTo #/today): error toast with "Go to Account"', async ({ page }) => {
    await gotoHash(page, '/today');
    await page.evaluate(() => sessionStorage.setItem('opb-auth-return', '#/today'));
    await page.goto(`${CLOUD_BASE_URL}?auth=callback&error=access_denied&error_description=cancelled`);
    await expect(page.getByRole('heading', { level: 1, name: EN.today.title })).toBeVisible();
    expect(page.url()).toBe(`${CLOUD_BASE_URL}#/today`);
    await expect(toast(page)).toHaveText(new RegExp(`^${EN.toast.signInCancelled}`));
    await expect(toast(page)).toHaveAttribute('data-tone', 'error');
    await page.getByRole('button', { name: EN.settings.account.goTo }).click();
    await expect(page.getByRole('heading', { level: 1, name: EN.settings.title })).toBeVisible();
    await expect(accountCard(page).getByRole('alert')).toContainText(EN.errors.AUTH_CANCELLED);
  });

  test('offline: the Google button is disabled and explained', async ({ page, context }) => {
    await gotoHash(page, '/settings');
    await expect(signInButton(page)).toBeEnabled();
    await context.setOffline(true);
    await expect(signInButton(page)).toBeDisabled();
    const hint = page.getByTestId('offline-hint');
    await expect(hint).toHaveText(EN.settings.account.offlineHint);
    await expect(signInButton(page)).toHaveAttribute('aria-describedby', (await hint.getAttribute('id'))!);
    await context.setOffline(false);
    await expect(signInButton(page)).toBeEnabled();
  });
});

test.describe('M6-AC8 persistent session, offline, expiry', () => {
  test('new page in the same context is signed in; offline reload still shows the account without errors', async ({ page, context }) => {
    const errors: string[] = [];
    await createGoal(page, READ);
    await signInAsMinh(page);
    await page.evaluate(() => navigator.serviceWorker.ready);
    await page.reload();
    await expect.poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller))).toBe(true);

    const second = await context.newPage();
    await freezeClock(second);
    await second.goto(`${CLOUD_BASE_URL}#/settings`);
    await expect(accountCard(second)).toHaveAttribute('data-state', 'signed-in');
    await expect(accountCard(second).getByTestId('account-email')).toHaveText('minh.test@example.com');
    await second.close();

    page.on('pageerror', (e) => errors.push(e.message));
    await context.setOffline(true);
    await page.reload();
    await gotoHash(page, '/today');
    await expect(goalCard(page, 'Read')).toBeVisible();
    await gotoHash(page, '/settings');
    await expect(accountCard(page)).toHaveAttribute('data-state', 'signed-in');
    await expect(accountCard(page).getByTestId('account-email')).toHaveText('minh.test@example.com');
    await expect(accountCard(page).getByRole('alert')).toHaveCount(0);
    expect(errors).toEqual([]);
    await context.setOffline(false);
  });

  test('revoked refresh token + expired access token → "Sign in again" state; data kept; Sign out still works', async ({ page, mock }) => {
    await createGoal(page, READ);
    await mock.session({ ttl: 5, refresh: 'invalid_grant', now: FIXED_MS });
    await signInAsMinh(page);
    await freezeClock(page, at('00:10:00'));
    await page.reload();
    await expect(accountCard(page)).toHaveAttribute('data-state', 'expired', { timeout: 20_000 });
    const expired = page.getByTestId('auth-expired');
    await expect(expired).toContainText(EN.settings.account.expiredTitle);
    await expect(expired).toContainText(EN.errors.AUTH_SESSION_EXPIRED);
    await expect(expired).toContainText('Account: minh.test@example.com');
    await expect(signInButton(page)).toBeEnabled();
    expect(await kvSync(page)).toMatchObject({ account: { email: 'minh.test@example.com' } });
    await expectAxeClean(page);
    await gotoHash(page, '/today');
    await expect(goalCard(page, 'Read')).toBeVisible();
    await gotoHash(page, '/settings');
    await expect(accountCard(page)).toHaveAttribute('data-state', 'expired');
    await accountCard(page).getByRole('button', { name: EN.settings.account.signOut }).click();
    await expect(signOutDialog(page)).toBeVisible();
    await page.getByTestId('signout-confirm').click();
    await expect(accountCard(page)).toHaveAttribute('data-state', 'signed-out');
    await expect(toast(page)).toHaveText(EN.toast.signedOutKept);
  });
});

test.describe('M6-AC9 sign out: keep or remove data', () => {
  test('D4 defaults to Keep (focused); Cancel keeps the session; Keep signs out and keeps data; Remove empties the device but keeps the language', async ({ page }) => {
    await createGoal(page, READ);
    await gotoHash(page, '/today');
    await logTime(page, 'Read', 20);
    await gotoHash(page, '/settings');
    await page.getByRole('radio', { name: 'Tiếng Việt' }).click();
    await expect(page.locator('html')).toHaveAttribute('lang', 'vi');
    await expect(accountCard(page)).toHaveAttribute('data-state', 'signed-out');
    await signInViaMock(page, 'Minh Test', { auth: { signInGoogle: 'Đăng nhập bằng Google' } });
    await expect(accountCard(page)).toHaveAttribute('data-state', 'signed-in');

    const signOut = accountCard(page).getByRole('button', { name: 'Đăng xuất' });
    await signOut.click();
    const dialog = signOutDialog(page);
    await expect(dialog).toBeVisible();
    const keep = dialog.getByRole('radio', { name: 'Giữ dữ liệu trên thiết bị này' });
    const remove = dialog.getByRole('radio', { name: 'Xóa dữ liệu khỏi thiết bị này' });
    await expect(keep).toBeChecked();
    await expect(keep).toBeFocused();
    await expect(page.getByTestId('signout-confirm')).toHaveText('Đăng xuất');
    await expectAxeClean(page);
    await dialog.getByRole('button', { name: 'Hủy' }).click();
    await expect(dialog).toBeHidden();
    await expect(accountCard(page)).toHaveAttribute('data-state', 'signed-in');
    await expect(signOut).toBeFocused();

    await signOut.click();
    await expect(keep).toBeChecked();
    await page.getByTestId('signout-confirm').click();
    await expect(dialog).toBeHidden();
    await expect(accountCard(page)).toHaveAttribute('data-state', 'signed-out');
    await expect(toast(page)).toHaveText('Đã đăng xuất. Dữ liệu của bạn vẫn còn trên thiết bị này.');
    await expect(page.getByRole('heading', { level: 2, name: 'Tài khoản' })).toBeFocused();
    expect(await storedSession(page)).toBeNull();
    expect(await kvSync(page)).toMatchObject({ userId: null, account: null, lastUserId: '00000000-0000-4000-8000-000000000001' });
    await gotoHash(page, '/today');
    await expect(goalCard(page, 'Read')).toBeVisible();
    await expect(goalCard(page, 'Read').locator('.amount')).toContainText('20/30');

    await gotoHash(page, '/settings');
    await signInViaMock(page, 'Minh Test', { auth: { signInGoogle: 'Đăng nhập bằng Google' } });
    await expect(accountCard(page)).toHaveAttribute('data-state', 'signed-in');
    await accountCard(page).getByRole('button', { name: 'Đăng xuất' }).click();
    await remove.check();
    await expect(page.getByTestId('signout-confirm')).toHaveText('Đăng xuất và xóa dữ liệu');
    await page.getByTestId('signout-confirm').click();
    await expect(dialog).toBeHidden();
    await expect(accountCard(page)).toHaveAttribute('data-state', 'signed-out');
    await expect(toast(page)).toHaveText('Đã đăng xuất. Dữ liệu đã được xóa khỏi thiết bị này.');
    await expect(page.locator('html')).toHaveAttribute('lang', 'vi');
    expect(await storedSession(page)).toBeNull();
    expect(await kvSync(page)).toBeNull();
    await gotoHash(page, '/today');
    await expect(page.getByRole('heading', { level: 2, name: 'Bắt đầu với một mục tiêu nhỏ' })).toBeVisible();
    await expect(goalCard(page, 'Read')).toHaveCount(0);
    await page.reload();
    await expect(page.locator('html')).toHaveAttribute('lang', 'vi');
    await gotoHash(page, '/settings');
    await expect(page.getByRole('radio', { name: 'Tiếng Việt' })).toBeChecked();
    await expect(page.getByRole('switch')).not.toBeChecked();
    await expect(page.getByLabel(/^Giờ nhắc/)).toHaveValue('20:00');
  });
});
