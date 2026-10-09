import { expect, test } from '@playwright/test';
import { createGoal, EN, expectAmount, freezeClock, goalCard, gotoHash, toast } from './helpers/app';

test.beforeEach(async ({ page }) => {
  await freezeClock(page);
});

test.describe('M1 goals', () => {
  test('M1-AC2: create a valid goal → Goals shows it active, Today shows 0/30', async ({ page }) => {
    await createGoal(page, { name: 'Read', why: 'Be smarter', targetValue: 30 });
    await expect(toast(page)).toHaveText(EN.toast.goalCreated);
    const row = page.getByTestId('goal-row').filter({ hasText: 'Read' });
    await expect(row.getByText(EN.goal.status.active)).toBeVisible();
    await expect(row).toContainText('30 min/day · 2026-10-09 – 2026-12-31');
    await expect(row).toContainText('Be smarter');
    await gotoHash(page, '/today');
    await expect(goalCard(page, 'Read')).toBeVisible();
    await expectAmount(page, 'Read', '0/30');
    await expect(page.getByText('Friday, October 9')).toBeVisible();
    await expect(page).toHaveTitle('Today — 1% Better');
  });

  test('M1-AC3: empty name shows an inline error and nothing is saved', async ({ page }) => {
    await gotoHash(page, '/goals/new');
    await page.getByRole('textbox', { name: /^Minutes per day/ }).fill('30');
    await page.getByRole('button', { name: EN.goal.form.save }).click();
    const name = page.getByLabel(/^Name/);
    await expect(name).toHaveAttribute('aria-invalid', 'true');
    await expect(page.locator('#goal-name-err')).toHaveText(EN.errors.GOAL_NAME_REQUIRED);
    await expect(page.getByRole('alert')).toHaveText('Fix 1 field to save.');
    await expect(name).toBeFocused();
    await gotoHash(page, '/goals');
    await expect(page.getByRole('heading', { level: 2, name: EN.empty.goals })).toBeVisible();
  });

  test('M1-AC4: total goal G3 "Spanish" → Today shows 0/17', async ({ page }) => {
    await createGoal(page, { name: 'Spanish', targetType: 'total', targetValue: 100, startDate: '2026-01-01', endDate: '2026-12-31' });
    await gotoHash(page, '/today');
    await expectAmount(page, 'Spanish', '0/17');
    await expect(goalCard(page, 'Spanish')).toContainText('17 min/day · 100 h total');
  });

  test('M1-AC5: status labels on Goals; Today only shows active goals', async ({ page }) => {
    await createGoal(page, { name: 'Read', why: 'Be smarter', targetValue: 30, startDate: '2026-10-01', endDate: '2026-10-31' });
    await createGoal(page, { name: 'Marathon prep', targetValue: 45, startDate: '2026-11-01', endDate: '2026-11-30' });
    await createGoal(page, { name: 'Old course', targetValue: 15, startDate: '2026-01-01', endDate: '2026-06-30' });
    await expect(page.getByRole('heading', { level: 2, name: 'Active (1)' })).toBeVisible();
    await expect(page.getByRole('heading', { level: 2, name: 'Upcoming (1)' })).toBeVisible();
    await expect(page.getByRole('heading', { level: 2, name: 'Ended (1)' })).toBeVisible();
    await expect(page.getByTestId('goal-row').filter({ hasText: 'Marathon prep' })).toContainText('Starts 2026-11-01');
    await expect(page.getByTestId('goal-row').filter({ hasText: 'Old course' })).toContainText('Ended 2026-06-30');
    await gotoHash(page, '/today');
    await expect(goalCard(page, 'Read')).toBeVisible();
    await expect(page.getByRole('article')).toHaveCount(1);
    await expect(page.getByText('0 of 1 goal on target')).toBeVisible();
  });

  test('M1-AC8: editing keeps entries inside the period', async ({ page }) => {
    await createGoal(page, { name: 'Read', targetValue: 30, startDate: '2026-10-01', endDate: '2026-10-31' });
    await gotoHash(page, '/today');
    await goalCard(page, 'Read').getByRole('button', { name: EN.goalCard.logTime }).click();
    await goalCard(page, 'Read').getByLabel(/^Minutes/).fill('20');
    await goalCard(page, 'Read').getByRole('button', { name: EN.entry.form.save }).click();
    await expectAmount(page, 'Read', '20/30');
    await gotoHash(page, '/goals');
    await page.getByRole('link', { name: EN.common.edit }).click();
    await expect(page.getByRole('heading', { level: 1, name: EN.goal.form.titleEdit })).toBeVisible();
    await expect(page.getByText('Your entries run from 2026-10-09 to 2026-10-09, so the period must include those dates.')).toBeVisible();
    await page.getByLabel(/^Start date/).fill('2026-10-10');
    await page.getByLabel(/^End date/).fill('2026-10-31');
    await page.getByRole('button', { name: EN.goal.form.saveChanges }).click();
    await expect(page.locator('#goal-start-err')).toHaveText(EN.errors.GOAL_PERIOD_EXCLUDES_ENTRIES);
    await page.getByLabel(/^Start date/).fill('2026-10-01');
    await page.getByLabel(/^Name/).fill('Read more');
    await page.getByRole('button', { name: EN.goal.form.saveChanges }).click();
    await expect(toast(page)).toHaveText(EN.toast.goalUpdated);
    await expect(page.getByRole('heading', { level: 3, name: 'Read more' })).toBeVisible();
  });

  test('M1-AC9: delete with confirmation; Cancel keeps, Confirm removes from Goals and Today', async ({ page }) => {
    await createGoal(page, { name: 'Read', targetValue: 30 });
    const row = page.getByTestId('goal-row').filter({ hasText: 'Read' });
    await row.getByRole('button', { name: EN.common.delete }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole('heading', { name: 'Delete "Read"?' })).toBeVisible();
    await expect(dialog.getByRole('button', { name: EN.common.cancel })).toBeFocused();
    await dialog.getByRole('button', { name: EN.common.cancel }).click();
    await expect(dialog).toBeHidden();
    await expect(row).toBeVisible();
    await row.getByRole('button', { name: EN.common.delete }).click();
    await dialog.getByRole('button', { name: EN.goal.delete.confirm }).click();
    await expect(toast(page)).toHaveText(EN.toast.goalDeleted);
    await expect(page.getByRole('heading', { level: 2, name: EN.empty.goals })).toBeVisible();
    await gotoHash(page, '/today');
    await expect(page.getByRole('heading', { level: 2, name: EN.empty.today.noGoals })).toBeVisible();
  });

  test('M1-AC14: unknown route shows Not found; / redirects to /today', async ({ page }) => {
    await gotoHash(page, '/abc');
    await expect(page.getByRole('heading', { level: 1, name: EN.notFound.pageTitle })).toBeVisible();
    await page.getByRole('link', { name: EN.notFound.pageAction }).click();
    await expect(page).toHaveURL(/#\/today$/);
    await page.goto('/#/');
    await expect(page).toHaveURL(/#\/today$/);
    await page.goto('/');
    await expect(page).toHaveURL(/#\/today$/);
  });
});
