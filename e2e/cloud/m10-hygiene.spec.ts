/**
 * M10-AC6 (2) (M6-P1): the single-use PKCE code verifier the SDK stores in localStorage is removed
 * once the OAuth callback has settled — after a successful sign-in, after "Cancel" on the provider
 * page, and after a failed token exchange — while the session itself (`opb-auth`) is untouched.
 * Reproduces QC M6 r1 §9.3 (before M10 the key survived until sign-out).
 */
import { expect, test } from './fixtures';
import { EN, freezeClock, gotoHash } from '../helpers/app';
import { accountCard, signInViaMock, storedSession } from './helpers';

const VERIFIER_KEY = 'opb-auth-code-verifier';
const verifier = (page: import('@playwright/test').Page) => page.evaluate((k) => localStorage.getItem(k), VERIFIER_KEY);

test.beforeEach(async ({ page, mock }) => {
  await mock.reset();
  await freezeClock(page);
});

test('successful sign-in: verifier gone, session kept', async ({ page }) => {
  await gotoHash(page, '/settings');
  await signInViaMock(page, 'Minh Test');
  await expect(accountCard(page)).toHaveAttribute('data-state', 'signed-in');
  expect(await verifier(page)).toBeNull();
  expect(await storedSession(page)).not.toBeNull();
});

test('"Cancel" on the provider page: verifier gone, Alert AUTH_CANCELLED', async ({ page }) => {
  await gotoHash(page, '/settings');
  await signInViaMock(page, 'Cancel');
  await expect(accountCard(page).getByRole('alert')).toContainText(EN.errors.AUTH_CANCELLED.split('.')[0]);
  expect(await verifier(page)).toBeNull();
  expect(await storedSession(page)).toBeNull();
});

test('token endpoint 500: Alert AUTH_FAILED and the verifier is gone', async ({ page, mock }) => {
  await gotoHash(page, '/settings');
  await mock.fail('token', 500, 1);
  await signInViaMock(page, 'Minh Test');
  await expect(accountCard(page)).toHaveAttribute('data-state', 'signed-out');
  await expect(accountCard(page).getByRole('alert')).toContainText(EN.errors.AUTH_FAILED);
  expect(await verifier(page)).toBeNull();
  expect(await storedSession(page)).toBeNull();
});
