// M14-AC6: Delete account on the web against the mock Supabase (FR-61, ARCH §4.7, DESIGN S7 D6).
import { expect, test } from './fixtures';
import { createGoal, EN, expectAxeClean, expectNoHorizontalScroll, expectNoViLeaks, freezeClock, goalCard, gotoHash, toast, VI } from '../helpers/app';
import { accountCard, C1, expectSyncState, MOCK_SUPABASE_URL, recordRequests, signInAsMinh, signInButton, syncNow } from './helpers';

const READ = { name: 'Read', targetValue: 30, startDate: '2026-10-01', endDate: '2026-10-31' };
const DELETE_PATH = '/functions/v1/delete-account';

test.beforeEach(async ({ page, mock }) => {
  await mock.reset();
  await freezeClock(page);
});

const deleteButton = (page: Parameters<typeof accountCard>[0], copy: { settings: { account: { delete: string } } } = EN) => accountCard(page).getByRole('button', { name: copy.settings.account.delete });
const dialog = (page: Parameters<typeof accountCard>[0]) => page.getByTestId('delete-account-dialog');

async function deleteCalls(mock: { log(): Promise<{ log: Array<{ path: string; method: string }> }> }) {
  return (await mock.log()).log.filter((l) => l.path === DELETE_PATH && l.method === 'POST');
}

test.describe('M14-AC6 delete account (web, mock)', () => {
  test('C1 in the account, signed in and synced → D6 with the DESIGN copy, Remove preselected; Cancel sends nothing; confirm → one Bearer request, rows + user gone, card signed out, Today empty, toast', async ({ page, mock }) => {
    const rec = recordRequests(page);
    await mock.seed('u1', C1);
    await signInAsMinh(page);
    await expectSyncState(page, 'synced');
    await gotoHash(page, '/today');
    await expect(goalCard(page, 'Cloud goal')).toBeVisible();
    await gotoHash(page, '/settings');

    const btn = deleteButton(page);
    await expect(btn).toBeEnabled();
    await expect(accountCard(page).getByText(EN.settings.account.deleteDesc)).toBeVisible();
    await expectAxeClean(page);
    await btn.click();
    const d = dialog(page);
    await expect(d).toBeVisible();
    await expect(d.getByRole('heading', { level: 2, name: EN.auth.delete.title })).toBeVisible();
    await expect(d.getByText(EN.auth.delete.body)).toBeVisible();
    await expect(d.getByTestId('delete-account-email')).toHaveText('Account: minh.test@example.com');
    await expect(d.getByText(EN.auth.delete.legend)).toBeVisible();
    await expect(d.getByRole('radio', { name: EN.auth.delete.remove })).toBeChecked();
    await expect(d.getByRole('radio', { name: EN.auth.delete.keep })).not.toBeChecked();
    await expect(d.getByText(EN.auth.delete.removeDesc)).toBeVisible();
    await expect(d.getByText(EN.auth.delete.keepDesc)).toBeVisible();
    await expect(d.getByTestId('delete-account-confirm')).toHaveText(EN.auth.delete.confirm);
    await expect(d.getByTestId('delete-apple-note')).toHaveCount(0);
    await expect(d.getByRole('button', { name: EN.common.cancel })).toBeFocused();
    await expectAxeClean(page);

    // Cancel: nothing reaches the function; focus returns to the button.
    await d.getByRole('button', { name: EN.common.cancel }).click();
    await expect(d).toBeHidden();
    await expect(btn).toBeFocused();
    expect(await deleteCalls(mock)).toEqual([]);
    await expect(accountCard(page)).toHaveAttribute('data-state', 'signed-in');

    // Keyboard: Escape also cancels.
    await btn.click();
    await expect(d).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(d).toBeHidden();
    expect(await deleteCalls(mock)).toEqual([]);

    // Confirm with the default (Remove).
    await btn.click();
    await d.getByTestId('delete-account-confirm').click();
    await expect(accountCard(page)).toHaveAttribute('data-state', 'signed-out', { timeout: 15_000 });
    await expect(d).toBeHidden();
    await expect(toast(page)).toHaveText(EN.toast.accountDeletedRemoved);
    await expect(page.getByRole('heading', { level: 2, name: EN.settings.account.title })).toBeFocused();
    await expect(signInButton(page)).toBeEnabled();
    await expect(page.getByTestId('apple-revoke-panel')).toHaveCount(0);
    const calls = await deleteCalls(mock);
    expect(calls).toHaveLength(1);
    const authHeaders = rec.urls.filter((u) => u.startsWith(MOCK_SUPABASE_URL + DELETE_PATH));
    expect(authHeaders.length).toBeGreaterThanOrEqual(1);
    const rows = await mock.rows('u1');
    expect(rows.goals).toEqual([]);
    expect(rows.entries).toEqual([]);
    expect(rows.settings).toEqual([]);
    const users = (await (await page.request.get(`${MOCK_SUPABASE_URL}/__test/users`, { headers: { 'x-opb-scope': mock.scope } })).json()) as { users: Array<{ id: string }>; deleted: string[] };
    expect(users.users.map((u) => u.id)).not.toContain('00000000-0000-4000-8000-000000000001');
    expect(users.deleted).toContain('00000000-0000-4000-8000-000000000001');
    expect(await page.evaluate(() => localStorage.getItem('opb-auth'))).toBeNull();

    await gotoHash(page, '/today');
    await expect(goalCard(page, 'Cloud goal')).toHaveCount(0);
    await expect(page.getByText(EN.empty.today.noGoals)).toBeVisible();
    expect(rec.external()).toEqual([]);
    expect(rec.urls.every((u) => /^http:\/\/(localhost:4174|127\.0\.0\.1:54321)\//.test(u))).toBe(true);
  });

  test('the request carries Authorization: Bearer and a JSON body without user_id', async ({ page, mock }) => {
    await mock.seed('u1', C1);
    let request: { authorization: string | undefined; body: string | null } | null = null;
    page.on('request', (req) => {
      if (req.url().endsWith(DELETE_PATH) && req.method() === 'POST') request = { authorization: req.headers()['authorization'], body: req.postData() };
    });
    await signInAsMinh(page);
    await expectSyncState(page, 'synced');
    await deleteButton(page).click();
    await dialog(page).getByTestId('delete-account-confirm').click();
    await expect(accountCard(page)).toHaveAttribute('data-state', 'signed-out', { timeout: 15_000 });
    expect(request).not.toBeNull();
    expect(request!.authorization).toMatch(/^Bearer [A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/);
    expect(JSON.parse(request!.body ?? '{}')).toEqual({});
  });

  test('Keep data on this device: the cloud goal stays on Today, usable signed out; toast "still on this device"', async ({ page, mock }) => {
    await mock.seed('u1', C1);
    await signInAsMinh(page);
    await expectSyncState(page, 'synced');
    await deleteButton(page).click();
    await dialog(page).getByRole('radio', { name: EN.auth.delete.keep }).check();
    await dialog(page).getByTestId('delete-account-confirm').click();
    await expect(accountCard(page)).toHaveAttribute('data-state', 'signed-out', { timeout: 15_000 });
    await expect(toast(page)).toHaveText(EN.toast.accountDeletedKept);
    expect((await mock.rows('u1')).goals).toEqual([]);
    await gotoHash(page, '/today');
    await expect(goalCard(page, 'Cloud goal')).toBeVisible();
    await expect(page.getByTestId('login-prompt-banner')).toHaveCount(0);
  });

  test('a second device signed in to the deleted account: Sync now → "Sign in again" (expired), its local goal stays', async ({ page, mock, device }) => {
    await mock.seed('u1', C1);
    await signInAsMinh(page);
    await expectSyncState(page, 'synced');
    const b = await device();
    await freezeClock(b.page);
    await signInAsMinh(b.page);
    await expectSyncState(b.page, 'synced');
    await expect(goalCard(b.page, 'Cloud goal').or(b.page.getByText('Cloud goal'))).toBeVisible();

    await deleteButton(page).click();
    await dialog(page).getByTestId('delete-account-confirm').click();
    await expect(accountCard(page)).toHaveAttribute('data-state', 'signed-out', { timeout: 15_000 });

    await b.page.getByTestId('sync-now').click();
    await expect(accountCard(b.page)).toHaveAttribute('data-state', 'expired', { timeout: 15_000 });
    await expect(accountCard(b.page).getByTestId('auth-expired')).toContainText(EN.settings.account.expiredTitle);
    await expect(deleteButton(b.page)).toBeDisabled();
    await expect(b.page.getByTestId('delete-account-reason')).toHaveText(EN.settings.account.deleteExpired);
    await gotoHash(b.page, '/today');
    await expect(goalCard(b.page, 'Cloud goal')).toBeVisible();
  });

  test('offline: the button is disabled with the reason; a function 500 → Alert ACCOUNT_DELETE_FAILED, still signed in, rows kept; the retry succeeds', async ({ page, mock, context }) => {
    await mock.seed('u1', C1);
    await signInAsMinh(page);
    await expectSyncState(page, 'synced');
    await context.setOffline(true);
    await expect(deleteButton(page)).toBeDisabled();
    await expect(page.getByTestId('delete-account-reason')).toHaveText(EN.settings.account.deleteOffline);
    await expect(deleteButton(page)).toHaveAttribute('aria-describedby', /./);
    await expectAxeClean(page);
    await context.setOffline(false);
    await expect(deleteButton(page)).toBeEnabled();

    await mock.fail('delete-account', 500, 1);
    await deleteButton(page).click();
    const d = dialog(page);
    await d.getByTestId('delete-account-confirm').click();
    await expect(d.getByRole('alert')).toHaveText(EN.errors.ACCOUNT_DELETE_FAILED, { timeout: 15_000 });
    await expect(d).toBeVisible();
    await expect(accountCard(page)).toHaveAttribute('data-state', 'signed-in');
    await expect(d.getByTestId('delete-account-confirm')).toBeFocused();
    expect((await mock.rows('u1')).goals).toHaveLength(1);
    await expect(toast(page)).toHaveCount(0);
    await expectAxeClean(page);

    await d.getByTestId('delete-account-confirm').click();
    await expect(accountCard(page)).toHaveAttribute('data-state', 'signed-out', { timeout: 15_000 });
    expect(await deleteCalls(mock)).toHaveLength(2);
    expect((await mock.rows('u1')).goals).toEqual([]);
  });

  test('cold load of Settings while signed in does not fetch the function chunk; the function is only called on confirm', async ({ page, mock }) => {
    await mock.seed('u1', C1);
    await signInAsMinh(page);
    await expectSyncState(page, 'synced');
    await page.reload();
    await expect(accountCard(page)).toHaveAttribute('data-state', 'signed-in');
    expect(await deleteCalls(mock)).toEqual([]);
    await deleteButton(page).click();
    await expect(dialog(page)).toBeVisible();
    expect(await deleteCalls(mock)).toEqual([]);
  });
});

test.describe('M14-AC6 vi-VN, a11y, 360 px', () => {
  test.use({ locale: 'vi-VN' });

  test('D6 and the card in vi scan clean, axe clean, keyboard-operable; 360 px without horizontal scroll', async ({ page, mock }) => {
    await page.setViewportSize({ width: 360, height: 740 });
    await mock.seed('u1', C1);
    await createGoal(page, READ, VI);
    await signInAsMinh(page);
    await syncNow(page);
    await expect(deleteButton(page, VI)).toBeVisible();
    await expect(accountCard(page).getByText(VI.settings.account.deleteDesc)).toBeVisible();
    await expectNoViLeaks(page);
    await expectNoHorizontalScroll(page);

    // Open with the keyboard, move the choice with the arrows, cancel with Escape.
    await deleteButton(page, VI).focus();
    await page.keyboard.press('Enter');
    const d = dialog(page);
    await expect(d).toBeVisible();
    await expect(d.getByRole('heading', { level: 2, name: VI.auth.delete.title })).toBeVisible();
    await expect(d.getByTestId('delete-account-email')).toHaveText('Tài khoản: minh.test@example.com');
    await expect(d.getByRole('button', { name: VI.common.cancel })).toBeFocused();
    await expectNoViLeaks(page);
    await expectAxeClean(page);
    await expectNoHorizontalScroll(page);
    await d.getByRole('radio', { name: VI.auth.delete.remove }).focus();
    await page.keyboard.press('ArrowDown');
    await expect(d.getByRole('radio', { name: VI.auth.delete.keep })).toBeChecked();
    await page.keyboard.press('Tab');
    await expect(d.getByTestId('delete-account-confirm')).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(d).toBeHidden();
    await expect(deleteButton(page, VI)).toBeFocused();

    // Error state in vi, then success in vi.
    await mock.fail('delete-account', 500, 1);
    await deleteButton(page, VI).click();
    await d.getByTestId('delete-account-confirm').click();
    await expect(d.getByRole('alert')).toHaveText(VI.errors.ACCOUNT_DELETE_FAILED, { timeout: 15_000 });
    await expectNoViLeaks(page);
    await expectAxeClean(page);
    await d.getByTestId('delete-account-confirm').click();
    await expect(accountCard(page)).toHaveAttribute('data-state', 'signed-out', { timeout: 15_000 });
    await expect(toast(page)).toHaveText(VI.toast.accountDeletedKept);
    await expectNoViLeaks(page);
    await expectNoHorizontalScroll(page);
  });
});
