// QC M14 round 1 - exploratory checks of Delete account (D6) against the mock Supabase: busy state, forced failures,
// aborted network, expired session, two tabs, dark + vi + 360 px, the web having no Apple UI, and sign-in after deletion.
import { mkdirSync } from 'node:fs';
import type { Page } from '@playwright/test';
import { expect, test } from '../../../e2e/cloud/fixtures';
import { accountCard, C1, expectSyncState, MOCK_SUPABASE_URL, signInAsMinh, signInViaMock, signOutDialog } from '../../../e2e/cloud/helpers';
import { createGoal, EN, expectAxeClean, expectNoHorizontalScroll, expectNoViLeaks, freezeClock, goalCard, gotoHash, toast, VI } from '../../../e2e/helpers/app';

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

test.describe('QC M14 after deletion (M14-D3, fixed in 6e6a175)', () => {
  const keepAndDelete = async (page: Page) => {
    await signInAsMinh(page);
    await expectSyncState(page, 'synced');
    await openD6(page);
    await dialog(page).getByRole('radio', { name: EN.auth.delete.keep }).check();
    await confirm(page).click();
    await expect(accountCard(page)).toHaveAttribute('data-state', 'signed-out', { timeout: 15_000 });
  };

  test('Keep data, then sign in with another account: no D5 question (A-61), the device data is uploaded to the new account', async ({ page, mock }) => {
    await keepAndDelete(page);
    await signInViaMock(page, 'Other User');
    await expect(accountCard(page)).toHaveAttribute('data-state', 'signed-in', { timeout: 15_000 });
    await expect(page.getByTestId('merge-dialog')).toBeHidden();
    await expectSyncState(page, 'synced');
    const u2 = await mock.liveRows('u2');
    expect(u2.goals.map((g) => g.name)).toEqual(['Cloud goal']);
    expect(u2.entries.length).toBeGreaterThan(0);
    await gotoHash(page, '/today');
    await expect(goalCard(page, 'Cloud goal')).toBeVisible(); // still on the device too
  });

  test('full D3 scenario: Delete -> Keep -> sign in as B -> data on B -> Sign out Remove -> sign in as B again -> goal still there', async ({ page, mock }) => {
    await keepAndDelete(page);
    await signInViaMock(page, 'Other User');
    await expect(accountCard(page)).toHaveAttribute('data-state', 'signed-in', { timeout: 15_000 });
    await expectSyncState(page, 'synced');
    expect((await mock.liveRows('u2')).goals.map((g) => g.name)).toEqual(['Cloud goal']);
    await accountCard(page).getByRole('button', { name: EN.settings.account.signOut }).click();
    await signOutDialog(page).getByRole('radio', { name: EN.auth.signOut.remove }).check();
    await page.getByTestId('signout-confirm').click();
    await expect(accountCard(page)).toHaveAttribute('data-state', 'signed-out', { timeout: 30_000 });
    await gotoHash(page, '/today');
    await expect(goalCard(page, 'Cloud goal')).toHaveCount(0); // Remove really wiped the device
    await gotoHash(page, '/settings');
    await signInViaMock(page, 'Other User');
    await expect(accountCard(page)).toHaveAttribute('data-state', 'signed-in', { timeout: 15_000 });
    await expectSyncState(page, 'synced');
    await gotoHash(page, '/today');
    await expect(goalCard(page, 'Cloud goal')).toBeVisible({ timeout: 5000 });
  });

  test('Keep, work signed-out (new goal), then sign in as B whose account already has a goal: three goals everywhere, no D5', async ({ page, mock }) => {
    await mock.seed('u2', { goals: [{ id: 'b-goal', name: 'B goal', why: '', targetType: 'daily', targetMinutes: 20, startDate: '2026-01-01', endDate: '2026-12-31', archived: false, createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' }] });
    await keepAndDelete(page);
    await createGoal(page, { name: 'Signed-out goal', targetValue: 15, startDate: '2026-10-01', endDate: '2026-10-31' });
    await gotoHash(page, '/settings');
    await signInViaMock(page, 'Other User');
    await expect(accountCard(page)).toHaveAttribute('data-state', 'signed-in', { timeout: 15_000 });
    await expect(page.getByTestId('merge-dialog')).toBeHidden();
    await expectSyncState(page, 'synced');
    expect((await mock.liveRows('u2')).goals.map((g) => g.name).sort()).toEqual(['B goal', 'Cloud goal', 'Signed-out goal']);
    await gotoHash(page, '/today');
    for (const n of ['B goal', 'Cloud goal', 'Signed-out goal']) await expect(goalCard(page, n)).toBeVisible();
  });

  test('Keep, never sign in, reload: data intact and signed-out; Settings offers Sign in; no request to the function after the first', async ({ page, mock }) => {
    await keepAndDelete(page);
    await page.reload();
    await expect(accountCard(page)).toHaveAttribute('data-state', 'signed-out');
    await gotoHash(page, '/today');
    await expect(goalCard(page, 'Cloud goal')).toBeVisible();
    expect((await mock.log()).log.filter((l) => l.path === '/functions/v1/delete-account' && l.method === 'POST')).toHaveLength(1);
    expect((await mock.liveRows('u2')).goals).toEqual([]);
  });
});

// ---- round 2: M14-D5 (busy status look) and M14-D6 (error Alert visible above the sticky buttons at 360 x 740) ----
async function expectAlertVisibleAboveButtons(page: Page) {
  const d = dialog(page);
  const alert = d.getByTestId('delete-account-error');
  await expect(alert).toBeVisible({ timeout: 10_000 });
  await expect(alert).toBeInViewport({ ratio: 1 });
  const [a, actions, box] = [await alert.boundingBox(), await d.locator('.actions').boundingBox(), await d.boundingBox()];
  expect(a!.height).toBeGreaterThan(20);
  expect(a!.y + a!.height).toBeLessThanOrEqual(actions!.y + 1); // not covered by the sticky row
  expect(a!.y).toBeGreaterThanOrEqual(box!.y - 1); // not clipped at the top of the dialog
  const covered = await alert.evaluate((el) => {
    const r = el.getBoundingClientRect();
    const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height - 4);
    return !(top && (el === top || el.contains(top)));
  });
  expect(covered).toBe(false);
}

test.describe('QC M14 r2: D5 busy status (fixed) and D6 alert visibility (FIXED in e275393, re-targeted by QC M15 r1 from expected failures to plain tests)', () => {
  for (const [label, scheme, locale, copy] of [
    ['en light', 'light', 'en-US', EN],
    ['vi dark', 'dark', 'vi-VN', VI],
  ] as const) {
    test.describe(label, () => {
      test.use({ colorScheme: scheme, locale });
      const prepare = async (page: Page, mock: { fail: (p: string, s: number, t?: number, d?: number) => Promise<unknown> }, height: number, delay = 0) => {
        await page.setViewportSize({ width: 360, height });
        await page.goto('./#/settings');
        await signInViaMock(page, 'Minh Test', copy);
        await expectSyncState(page, 'synced');
        await gotoHash(page, '/settings');
        await openD6(page, copy);
        await mock.fail('delete-account', 500, 1, delay);
        await confirm(page).click();
      };

      test(`D5 360 x 740: busy status is plain muted text (no box, 14 px, --text-muted); error shows, focus stays on confirm, axe clean, no horizontal scroll`, async ({ page, mock }) => {
        await prepare(page, mock, 740, 1500);
        const working = dialog(page).getByTestId('delete-working');
        await expect(working).toHaveText(copy.auth.delete.workingStatus);
        const look = await working.evaluate((el) => {
          const s = getComputedStyle(el);
          const muted = getComputedStyle(document.documentElement).getPropertyValue('--text-muted').trim();
          const p = document.createElement('span');
          p.style.color = muted;
          document.body.appendChild(p);
          const probe = getComputedStyle(p).color;
          p.remove();
          return { bg: s.backgroundColor, border: s.borderTopWidth, color: s.color, cls: el.className, fontSize: s.fontSize, probe };
        });
        expect(look.cls).toContain('delete-status');
        expect(look.bg).toBe('rgba(0, 0, 0, 0)');
        expect(look.border).toBe('0px');
        expect(look.color).toBe(look.probe);
        expect(look.fontSize).toBe('14px');
        await shot(page, `r2-d5-busy-${label.replace(' ', '-')}`);
        await expect(dialog(page).getByTestId('delete-account-error')).toBeVisible({ timeout: 10_000 });
        await expect(confirm(page)).toBeFocused();
        await shot(page, `r2-d6-error-${label.replace(' ', '-')}`);
        await expectAxeClean(page);
        await expectNoHorizontalScroll(page);
      });

      // M14-D6: fixed in e275393 (QC M15 r1 confirmed: the Alert's bounding box ends above the sticky row; formerly test.fail).
      test(`D6 360 x 740: the error Alert is fully visible above the sticky buttons`, async ({ page, mock }) => {
        await prepare(page, mock, 740);
        await expectAlertVisibleAboveButtons(page);
      });
    });
  }

  test('D6 360 x 480: the error Alert is fully visible above the sticky buttons', async ({ page, mock }) => {
    await page.setViewportSize({ width: 360, height: 480 });
    await signInAsMinh(page);
    await expectSyncState(page, 'synced');
    await gotoHash(page, '/settings');
    await openD6(page);
    await mock.fail('delete-account', 500, 1);
    await confirm(page).click();
    await expectAlertVisibleAboveButtons(page);
  });
});
