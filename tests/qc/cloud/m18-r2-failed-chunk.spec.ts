// QC M18 round 2 — M18-D1 at e2e level: the sync-engine chunk fails (route abort) exactly while another account signs in
// on a device that holds U1 data. Result: the sign-in fails safe, a retry asks D5.
import { expect, test } from '../../../e2e/cloud/fixtures';
import { accountCard, APP_ORIGIN, MOCK_SUPABASE_URL, signInAsMinh, signInButton, signInViaMock, storedSession } from '../../../e2e/cloud/helpers';
import { EN, importBackup } from '../../../e2e/helpers/app';

// The service worker would answer the chunk from its precache and bypass page.route.
test.use({ serviceWorkers: 'block' });

test.beforeEach(async ({ mock }) => {
  await mock.reset();
});

test('engine chunk aborted at the OAuth callback of another account: sign-in fails safe (nothing uploaded); retry with the chunk reachable asks D5 first', async ({ page, mock }) => {
  await importBackup(page);
  await signInAsMinh(page);
  await expect(accountCard(page).getByTestId('account-email')).toBeVisible();
  await accountCard(page).getByRole('button', { name: EN.settings.account.signOut }).click();
  await page.getByTestId('signout-confirm').click();
  await expect(accountCard(page)).toHaveAttribute('data-state', 'signed-out');
  expect((await mock.liveRows('u1')).goals.length).toBeGreaterThan(0);

  await page.reload(); // forget the already-loaded engine module
  await expect(accountCard(page)).toHaveAttribute('data-state', 'signed-out');
  // Pressing Sign in loads the engine (prepareFirstSignIn) before leaving for the provider; the failure window is the
  // OAuth callback page load, so the chunk is let through until the provider page is reached and aborted from then on.
  let blocked = 0;
  let abort = false;
  await page.route(/sync-engine-[^/]*\.js/, (route) => {
    if (!abort) return route.continue();
    blocked += 1;
    return route.abort('failed');
  });
  await signInButton(page, EN).click();
  await page.waitForURL((u) => u.origin === MOCK_SUPABASE_URL && u.pathname === '/auth/v1/authorize');
  abort = true;
  await page.getByRole('button', { name: 'Other User', exact: true }).click();
  await page.waitForURL((u) => u.origin === APP_ORIGIN && !u.searchParams.has('auth') && !u.searchParams.has('code'));
  await page.waitForTimeout(2500);
  expect(blocked).toBeGreaterThan(0);
  // Observed: the auth flow itself fails safe when the chunk cannot load at the callback ("Couldn't sign you in. Nothing on
  // this device changed."): signed out, no session kept, nothing uploaded, no D5. (The handleSignedIn-only failure is covered
  // by the unit probes in tests/qc/m18-r1-lazy.test.ts.)
  await expect(accountCard(page)).toHaveAttribute('data-state', 'signed-out');
  await expect(accountCard(page)).toContainText("Couldn't sign you in");
  expect(await storedSession(page)).toBeNull();
  expect((await mock.liveRows('u2')).goals).toHaveLength(0);
  await expect(page.getByTestId('merge-dialog')).not.toHaveAttribute('open');

  // Chunk reachable again: signing in as the other account now asks (D5) before anything is uploaded; Cancel leaves u2 empty.
  await page.unroute(/sync-engine-[^/]*\.js/);
  await signInViaMock(page, 'Other User');
  const d5 = page.getByTestId('merge-dialog');
  await expect(d5).toHaveAttribute('open', { timeout: 15_000 });
  expect((await mock.liveRows('u2')).goals).toHaveLength(0);
  await d5.getByRole('button', { name: EN.common.cancel }).click();
  await expect(accountCard(page)).toHaveAttribute('data-state', 'signed-out');
  expect((await mock.liveRows('u2')).goals).toHaveLength(0);
});
