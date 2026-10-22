// M14-D6 regression (fixed in M15): at 360 x 740 and 360 x 480 the error Alert of D6 must be fully visible above the
// sticky button row after a failed deletion, in en/light and vi/dark. Measured like QC M14 r2: bounding boxes + the
// element at the Alert's bottom edge is the Alert itself (not the button row).
import type { Page } from '@playwright/test';
import { expect, test } from './fixtures';
import { EN, expectAxeClean, expectNoHorizontalScroll, freezeClock, VI } from '../helpers/app';
import { accountCard, C1, expectSyncState, signInViaMock } from './helpers';

const dialog = (page: Page) => page.getByTestId('delete-account-dialog');

async function expectAlertVisibleAboveButtons(page: Page) {
  const d = dialog(page);
  const alert = d.getByTestId('delete-account-error');
  await expect(alert).toBeVisible({ timeout: 15_000 });
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

for (const [label, scheme, locale, copy] of [
  ['en light', 'light', 'en-US', EN],
  ['vi dark', 'dark', 'vi-VN', VI],
] as const) {
  test.describe(`M14-D6 ${label}`, () => {
    test.use({ colorScheme: scheme, locale });

    for (const height of [740, 480]) {
      test(`360 x ${height}: after a function 500 the Alert is fully visible above the sticky buttons, focus on confirm`, async ({ page, mock }) => {
        await page.setViewportSize({ width: 360, height });
        await mock.reset();
        await freezeClock(page);
        await mock.seed('u1', C1);
        await page.goto('#/settings');
        await expect(accountCard(page)).toHaveAttribute('data-state', 'signed-out');
        await signInViaMock(page, 'Minh Test', copy);
        await expect(accountCard(page)).toHaveAttribute('data-state', 'signed-in');
        await expectSyncState(page, 'synced');
        await mock.fail('delete-account', 500, 1);
        await accountCard(page).getByRole('button', { name: copy.settings.account.delete }).click();
        const d = dialog(page);
        await expect(d).toBeVisible();
        await d.getByTestId('delete-account-confirm').click();
        await expect(d.getByRole('alert')).toHaveText(copy.errors.ACCOUNT_DELETE_FAILED, { timeout: 15_000 });
        await expectAlertVisibleAboveButtons(page);
        await expect(d.getByTestId('delete-account-confirm')).toBeFocused();
        await expectAxeClean(page);
        await expectNoHorizontalScroll(page);
      });
    }
  });
}
