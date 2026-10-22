// QC M14 round 1 - exploratory checks of Delete account (D6) against the mock Supabase: busy state, forced failures,
// aborted network, expired session, two tabs, dark + vi + 360 px, the web having no Apple UI, and sign-in after deletion.
import { mkdirSync } from 'node:fs';
import type { Page } from '@playwright/test';
import { expect, test } from '../../../e2e/cloud/fixtures';
import { accountCard, C1, expectSyncState, MOCK_SUPABASE_URL, signInAsMinh, signInViaMock, signOutDialog } from '../../../e2e/cloud/helpers';
import { EN, expectAxeClean, expectNoHorizontalScroll, expectNoViLeaks, freezeClock, goalCard, gotoHash, toast, VI } from '../../../e2e/helpers/app';

const SHOTS = process.env.QC_SHOTS ?? '';
const shot = async (page: Page, name: string) => {
  if (!SHOTS) return;
  mkdirSync(SHOTS, { recursive: true });
  await page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: false });
};
const dialog = (page: Page) => page.getByTestId('delete-account-dialog');
const confirm = (page: Page) => dialog(page).getByTestId('delete-account-confirm');
const openD6 = async (page: Page, copy: { settings: { account: { delete: string } } } = EN) => {
  await accountCard(page).getByRole('button', { name: copy.settings.account.delete }).click();
  await expect(dialog(page)).toBeVisible();
};

test.beforeEach(async ({ page, mock }) => {
  await mock.reset();
  await freezeClock(page);
  await mock.seed('u1', C1);
});

test.describe('QC M14 D6 exploratory', () => {
  test('busy: confirm shows the working state, Esc and backdrop are ignored, Cancel and radios disabled; then a forced 500 shows the alert, focus on confirm, and a retry succeeds', async ({ page, mock }) => {
    await page.setViewportSize({ width: 360, height: 740 });
    await signInAsMinh(page);
    await expectSyncState(page, 'synced');
    await gotoHash(page, '/settings');
    await openD6(page);
    await mock.fail('delete-account', 500, 1, 2500);
    await confirm(page).click();
    const d = dialog(page);
    await expect(d).toHaveAttribute('aria-busy', 'true');
    await expect(confirm(page)).toHaveAttribute('aria-disabled', 'true');
    await expect(confirm(page)).toBeFocused();
    await expect(d.getByTestId('delete-working')).toHaveText(EN.auth.delete.workingStatus);
    await expect(d.getByRole('button', { name: EN.common.cancel })).toBeDisabled();
    await expect(d.getByRole('radio', { name: EN.auth.delete.keep })).toBeDisabled();
    await shot(page, 'd6-busy-360');
    await page.keyboard.press('Escape');
    await expect(d).toBeVisible();
    await page.mouse.click(4, 4); // backdrop
    await expect(d).toBeVisible();
    // pressing the confirm button again while busy must not send a second request
    await confirm(page).click({ force: true });
    const alert = d.getByTestId('delete-account-error');
    await expect(alert).toBeVisible({ timeout: 10_000 });
    await expect(alert).toHaveText(EN.errors.ACCOUNT_DELETE_FAILED);
    await expect(confirm(page)).toBeFocused();
    await expect(confirm(page)).not.toHaveAttribute('aria-disabled', 'true');
    await expect(accountCard(page)).toHaveAttribute('data-state', 'signed-in');
    const calls = (await mock.log()).log.filter((l) => l.path === '/functions/v1/delete-account' && l.method === 'POST');
    expect(calls).toHaveLength(1);
    await expectNoHorizontalScroll(page);
    await shot(page, 'd6-error-360');
    await confirm(page).click();
    await expect(accountCard(page)).toHaveAttribute('data-state', 'signed-out', { timeout: 15_000 });
    await expect(toast(page)).toHaveText(EN.toast.accountDeletedRemoved);
  });

  test('function answers 401 (session no longer valid) -> ACCOUNT_DELETE_SESSION_EXPIRED text in D6, still open, nothing local changed', async ({ page, mock }) => {
    await signInAsMinh(page);
    await expectSyncState(page, 'synced');
    await openD6(page);
    await mock.fail('delete-account', 401, 1);
    await confirm(page).click();
    await expect(dialog(page).getByTestId('delete-account-error')).toHaveText(EN.errors.ACCOUNT_DELETE_SESSION_EXPIRED);
    await gotoHash(page, '/today');
    await expect(goalCard(page, 'Cloud goal')).toBeVisible();
  });

  test('network aborted mid-request -> offline/failed alert (never a blank dialog), account untouched, retry works after the network returns', async ({ page, mock }) => {
    await signInAsMinh(page);
    await expectSyncState(page, 'synced');
    await openD6(page);
    await page.route('**/functions/v1/delete-account', (route) => route.abort('failed'));
    await confirm(page).click();
    const alert = dialog(page).getByTestId('delete-account-error');
    await expect(alert).toBeVisible({ timeout: 10_000 });
    const text = (await alert.textContent()) ?? '';
    expect([EN.errors.ACCOUNT_DELETE_OFFLINE, EN.errors.ACCOUNT_DELETE_FAILED]).toContain(text.trim());
    expect((await mock.rows('u1')).goals.length).toBeGreaterThan(0);
    await page.unroute('**/functions/v1/delete-account');
    await confirm(page).click();
    await expect(accountCard(page)).toHaveAttribute('data-state', 'signed-out', { timeout: 15_000 });
  });

  test('request slower than 20 s -> ACCOUNT_DELETE_FAILED (client timeout), D6 usable again', async ({ page, mock }) => {
    test.setTimeout(90_000);
    await signInAsMinh(page);
    await expectSyncState(page, 'synced');
    await openD6(page);
    await mock.fail('delete-account', 500, 1, 23_000);
    await confirm(page).click();
    await expect(dialog(page).getByTestId('delete-account-error')).toHaveText(EN.errors.ACCOUNT_DELETE_FAILED, { timeout: 30_000 });
    await expect(confirm(page)).toBeFocused();
  });

  test('two tabs: tab B deletes the account, tab A (D6 open) confirms afterwards -> a session-expired message, no crash, no second wipe of local data', async ({ page, mock, device }) => {
    await signInAsMinh(page);
    await expectSyncState(page, 'synced');
    await openD6(page);
    const b = await device();
    await b.page.goto('./#/settings');
    await signInViaMock(b.page);
    await expectSyncState(b.page, 'synced');
    await openD6(b.page);
    await confirm(b.page).click();
    await expect(accountCard(b.page)).toHaveAttribute('data-state', 'signed-out', { timeout: 15_000 });
    await confirm(page).click();
    const alert = dialog(page).getByTestId('delete-account-error');
    await expect(alert).toBeVisible({ timeout: 15_000 });
    expect([EN.errors.ACCOUNT_DELETE_SESSION_EXPIRED, EN.errors.ACCOUNT_DELETE_FAILED]).toContain(((await alert.textContent()) ?? '').trim());
    await gotoHash(page, '/today');
    await expect(goalCard(page, 'Cloud goal')).toBeVisible();
    expect(mock).toBeDefined();
  });

  test('reload while D6 is open: dialog gone, still signed in, no request to the function', async ({ page, mock }) => {
    await signInAsMinh(page);
    await expectSyncState(page, 'synced');
    await openD6(page);
    await page.reload();
    await expect(dialog(page)).toBeHidden();
    await expect(accountCard(page)).toHaveAttribute('data-state', 'signed-in');
    expect((await mock.log()).log.filter((l) => l.path === '/functions/v1/delete-account' && l.method === 'POST')).toEqual([]);
  });
});

test.describe('QC M14 look: dark, vi, 360 px', () => {
  test.use({ colorScheme: 'dark', locale: 'vi-VN' });
  test('vi + dark + 360 px: card, D6 default, D6 error - axe clean, no vi leaks, no horizontal scroll', async ({ page, mock }) => {
    await page.setViewportSize({ width: 360, height: 740 });
    await page.goto('./#/settings');
    await signInViaMock(page, 'Minh Test', VI);
    await expectSyncState(page, 'synced');
    await gotoHash(page, '/settings');
    await expectNoViLeaks(page);
    await shot(page, 'card-signed-in-vi-dark-360');
    await openD6(page, VI);
    await expectAxeClean(page);
    await expectNoViLeaks(page);
    await shot(page, 'd6-default-vi-dark-360');
    await mock.fail('delete-account', 500, 1);
    await confirm(page).click();
    await expect(dialog(page).getByTestId('delete-account-error')).toHaveText(VI.errors.ACCOUNT_DELETE_FAILED);
    await expectAxeClean(page);
    await expectNoHorizontalScroll(page);
    await shot(page, 'd6-error-vi-dark-360');
  });
});

test.describe('QC M14 web has no Apple UI', () => {
  test('signed-out Settings, Today banner and export hint never mention Apple; the Google button is the only sign-in button', async ({ page }) => {
    await page.goto('./#/settings');
    await expect(accountCard(page)).toHaveAttribute('data-state', 'signed-out');
    expect(await page.getByRole('button', { name: /apple/i }).count()).toBe(0);
    expect(((await accountCard(page).textContent()) ?? '').toLowerCase()).not.toContain('apple');
    expect(await accountCard(page).getByRole('button', { name: EN.auth.signInGoogle }).count()).toBe(1);
    await gotoHash(page, '/today');
    expect(((await page.locator('body').textContent()) ?? '').toLowerCase()).not.toContain('apple');
  });

  test('signed in: card shows Delete account, no Apple wording, and the provider row says Google', async ({ page }) => {
    await signInAsMinh(page);
    const t = ((await accountCard(page).textContent()) ?? '').toLowerCase();
    expect(t).not.toContain('apple');
    expect(t).toContain('google');
    expect(MOCK_SUPABASE_URL).toBeTruthy();
  });
});

test.describe('QC M14 after deletion', () => {
  // M14-D3 (same defect): known, kept as an expected failure.
  test.fail('Keep data, then sign in with another account: no D5 question (A-61), device data merges into the new account', async ({ page, mock }) => {
    await signInAsMinh(page);
    await expectSyncState(page, 'synced');
    await openD6(page);
    await dialog(page).getByRole('radio', { name: EN.auth.delete.keep }).check();
    await confirm(page).click();
    await expect(accountCard(page)).toHaveAttribute('data-state', 'signed-out', { timeout: 15_000 });
    await signInViaMock(page, 'Other User');
    await expect(accountCard(page)).toHaveAttribute('data-state', 'signed-in', { timeout: 15_000 });
    await expect(page.getByTestId('first-signin-dialog')).toHaveCount(0);
    await expectSyncState(page, 'synced');
    const rows = await mock.rows('u2');
    await gotoHash(page, '/today');
    await expect(goalCard(page, 'Cloud goal')).toBeVisible(); // still on the device
    expect(JSON.stringify(rows.goals.map((g) => g.name))).toBe('["Cloud goal"]'); // and now in the new account too
  });

  // M14-D3: known defect, kept as an expected failure until fixed (A-61 says the kept data is merged into the next account).
  test.fail('data kept after Delete account reaches the next account: sign out with Remove, sign back in -> the goal is still there', async ({ page }) => {
    await signInAsMinh(page);
    await expectSyncState(page, 'synced');
    await openD6(page);
    await dialog(page).getByRole('radio', { name: EN.auth.delete.keep }).check();
    await confirm(page).click();
    await expect(accountCard(page)).toHaveAttribute('data-state', 'signed-out', { timeout: 15_000 });
    await signInViaMock(page, 'Other User');
    await expect(accountCard(page)).toHaveAttribute('data-state', 'signed-in', { timeout: 15_000 });
    await expectSyncState(page, 'synced');
    await accountCard(page).getByRole('button', { name: EN.settings.account.signOut }).click();
    await signOutDialog(page).getByRole('radio', { name: EN.auth.signOut.remove }).check();
    await page.getByTestId('signout-confirm').click();
    await expect(accountCard(page)).toHaveAttribute('data-state', 'signed-out', { timeout: 30_000 });
    await signInViaMock(page, 'Other User');
    await expect(accountCard(page)).toHaveAttribute('data-state', 'signed-in', { timeout: 15_000 });
    await expectSyncState(page, 'synced');
    await gotoHash(page, '/today');
    await expect(goalCard(page, 'Cloud goal')).toBeVisible({ timeout: 5000 });
  });
});
