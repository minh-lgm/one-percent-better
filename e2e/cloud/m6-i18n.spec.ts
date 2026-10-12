import { expect, test } from './fixtures';
import { createGoal, expectAxeClean, expectNoHorizontalScroll, expectNoViLeaks, freezeClock, gotoHash, toast, VI } from '../helpers/app';
import { accountCard, CLOUD_BASE_URL, signInButton, signInViaMock, signOutDialog } from './helpers';

const READ = { name: 'Read', targetValue: 30, startDate: '2026-10-01', endDate: '2026-10-31' };

test.describe('M6-AC11 Vietnamese, a11y, 360 px, keyboard', () => {
  test.use({ locale: 'vi-VN' });

  test.beforeEach(async ({ page, mock }) => {
    await mock.reset();
    await freezeClock(page);
  });

  test('sign-in flow in vi: card copy, toast, About, no English leaks, axe clean', async ({ page }) => {
    await createGoal(page, READ, VI);
    await gotoHash(page, '/settings');
    await expect(page.locator('html')).toHaveAttribute('lang', 'vi');
    await expect(page.getByRole('heading', { level: 2, name: VI.settings.account.title })).toBeVisible();
    await expect(page.getByText(VI.settings.account.descSignedOut)).toBeVisible();
    await expect(page.getByText(VI.settings.account.privacyNote)).toBeVisible();
    await expect(page.getByText(VI.settings.about.descCloud)).toBeVisible();
    await expect(page.getByText(VI.settings.about.privacy)).toBeVisible();
    await expectNoViLeaks(page);
    await expectAxeClean(page);

    await signInViaMock(page, 'Minh Test', VI);
    expect(page.url()).toBe(`${CLOUD_BASE_URL}#/settings`);
    await expect(accountCard(page)).toHaveAttribute('data-state', 'signed-in');
    await expect(accountCard(page).getByTestId('account-email')).toHaveText('minh.test@example.com');
    await expect(accountCard(page)).toContainText(VI.settings.account.provider);
    // M7 (DESIGN F11): the device had a goal, so the first sign-in merges it and the merge toast is the one shown.
    await expect(toast(page)).toHaveText('Đã đăng nhập. Tài khoản của bạn hiện có 1 mục tiêu, 0 lần ghi.');
    await expect(page.getByText(VI.settings.about.descSignedIn)).toBeVisible();
    await expectNoViLeaks(page);
    await expectAxeClean(page);

    // Cancelled attempt after signing out: Alert in vi.
    await accountCard(page).getByRole('button', { name: VI.settings.account.signOut }).click();
    await expect(signOutDialog(page)).toBeVisible();
    await expectNoViLeaks(page);
    await expectAxeClean(page);
    await page.getByTestId('signout-confirm').click();
    await expect(accountCard(page)).toHaveAttribute('data-state', 'signed-out');
    await signInViaMock(page, 'Cancel', VI);
    await expect(accountCard(page).getByRole('alert')).toContainText(VI.errors.AUTH_CANCELLED);
    await expect(page.getByRole('button', { name: VI.common.dismiss })).toBeVisible();
    await expectNoViLeaks(page);
  });

  test('360 px: Settings (signed-out, signed-in, expired-like) and D4 do not scroll horizontally', async ({ page, context }) => {
    await page.setViewportSize({ width: 360, height: 740 });
    await gotoHash(page, '/settings');
    await expect(signInButton(page, VI)).toBeVisible();
    await expectNoHorizontalScroll(page);
    await context.setOffline(true);
    await expect(page.getByTestId('offline-hint')).toBeVisible();
    await expectNoHorizontalScroll(page);
    await context.setOffline(false);
    await signInViaMock(page, 'Minh Test', VI);
    await expect(accountCard(page)).toHaveAttribute('data-state', 'signed-in');
    await expectNoHorizontalScroll(page);
    await accountCard(page).getByRole('button', { name: VI.settings.account.signOut }).click();
    await expect(signOutDialog(page)).toBeVisible();
    await signOutDialog(page).getByRole('radio', { name: VI.auth.signOut.remove }).check();
    await expectNoHorizontalScroll(page);
    const box = await signOutDialog(page).boundingBox();
    expect(box!.width).toBeLessThanOrEqual(360);
  });

  test('keyboard: Tab stays inside D4, arrows change the choice, Escape closes and returns focus to Sign out', async ({ page }) => {
    await gotoHash(page, '/settings');
    await signInViaMock(page, 'Minh Test', VI);
    const signOut = accountCard(page).getByRole('button', { name: VI.settings.account.signOut });
    await signOut.focus();
    await page.keyboard.press('Enter');
    const dialog = signOutDialog(page);
    await expect(dialog).toBeVisible();
    const keep = dialog.getByRole('radio', { name: VI.auth.signOut.keep });
    const remove = dialog.getByRole('radio', { name: VI.auth.signOut.remove });
    await expect(keep).toBeFocused();
    await page.keyboard.press('ArrowDown');
    await expect(remove).toBeChecked();
    await expect(page.getByTestId('signout-confirm')).toHaveText(VI.auth.signOut.confirmRemove);
    await page.keyboard.press('ArrowUp');
    await expect(keep).toBeChecked();
    // Native showModal(): the rest of the page is inert, so Tab only ever lands inside the dialog
    // (or on the browser UI, where activeElement is <body>) — never on page content behind it.
    for (let i = 0; i < 6; i += 1) {
      await page.keyboard.press('Tab');
      const where = await page.evaluate(() => {
        const el = document.activeElement;
        if (!el || el === document.body) return 'body';
        return el.closest('[data-testid="signout-dialog"]') ? 'dialog' : `outside:${el.tagName}`;
      });
      expect(['dialog', 'body']).toContain(where);
    }
    await expect(dialog).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
    await expect(accountCard(page)).toHaveAttribute('data-state', 'signed-in');
    await expect(signOut).toBeFocused();
  });
});
