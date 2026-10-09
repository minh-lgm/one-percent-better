import { expect, test } from '@playwright/test';
import { createGoal, EN, expectAmount, freezeClock, goalCard, gotoHash, logTime, plusOne, toast } from './helpers/app';

test.beforeEach(async ({ page }) => {
  await freezeClock(page);
});

test.describe('M1 today', () => {
  test('M1-AC6 + M1-AC7: log, +1%, edit and delete update totals without reload', async ({ page }) => {
    await createGoal(page, { name: 'Read', why: 'Be smarter', targetValue: 30, startDate: '2026-10-01', endDate: '2026-10-31' });
    await gotoHash(page, '/today');

    await logTime(page, 'Read', 20, 'Ch. 3');
    await expect(toast(page)).toHaveText(EN.toast.entrySaved);
    await expectAmount(page, 'Read', '20/30');
    await expect(plusOne(page, 'Read')).toHaveCount(0);
    await expect(goalCard(page, 'Read')).toContainText('10 min to go');
    await expect(goalCard(page, 'Read').getByRole('button', { name: EN.goalCard.logTime })).toBeFocused();

    await logTime(page, 'Read', 10);
    await expectAmount(page, 'Read', '30/30');
    await expect(plusOne(page, 'Read')).toBeVisible();
    await expect(goalCard(page, 'Read')).toContainText(EN.goalCard.reached);
    await expect(page.getByText('Goal on target — a little better than yesterday.')).toBeVisible();

    // AC7: edit 20 → 5
    const card = goalCard(page, 'Read');
    await card.getByRole('button', { name: 'Edit entry: 20 min, Ch. 3' }).click();
    const minutes = card.getByRole('form', { name: 'Edit entry for Read' }).getByLabel(/^Minutes/);
    await expect(minutes).toHaveValue('20');
    await minutes.fill('5');
    await card.getByRole('button', { name: EN.entry.form.saveChanges }).click();
    await expectAmount(page, 'Read', '15/30');
    await expect(plusOne(page, 'Read')).toHaveCount(0);
    await expect(toast(page)).toHaveText(EN.toast.entryUpdated);

    // delete the 5-minute entry
    await card.getByRole('button', { name: 'Delete entry: 5 min, Ch. 3' }).click();
    const confirm = card.getByRole('group', { name: 'Confirm delete: 5 min, Ch. 3' });
    await expect(confirm.getByRole('button', { name: EN.common.keep })).toBeFocused();
    await confirm.getByRole('button', { name: EN.common.delete }).click();
    await expectAmount(page, 'Read', '10/30');
    await expect(toast(page)).toHaveText(EN.toast.entryDeleted);
  });

  test('M1-AC6: entry validation errors', async ({ page }) => {
    await createGoal(page, { name: 'Read', targetValue: 30 });
    await gotoHash(page, '/today');
    const card = goalCard(page, 'Read');
    await card.getByRole('button', { name: EN.goalCard.logTime }).click();
    await card.getByLabel(/^Minutes/).fill('0');
    await card.getByRole('button', { name: EN.entry.form.save }).click();
    await expect(card.getByText(EN.errors.ENTRY_MINUTES_INVALID)).toBeVisible();
    await expect(card.getByLabel(/^Minutes/)).toBeFocused();
    await card.getByLabel(/^Minutes/).fill('1400');
    await card.getByRole('button', { name: EN.entry.form.save }).click();
    await expectAmount(page, 'Read', '1,400/30');
    await expect(card).toContainText('Target reached · 1,370 min extra');
    await card.getByRole('button', { name: EN.goalCard.logTime }).click();
    await card.getByLabel(/^Minutes/).fill('41');
    await card.getByRole('button', { name: EN.entry.form.save }).click();
    await expect(card.getByText('A goal can have at most 1,440 minutes in one day. You can add up to 40 more for this day.')).toBeVisible();
    await card.getByLabel(/^Minutes/).fill('40');
    await card.getByRole('button', { name: EN.entry.form.save }).click();
    await expectAmount(page, 'Read', '1,440/30');
  });

  test('M1-AC10: data survives reload and a new page in the same context', async ({ page, context }) => {
    await createGoal(page, { name: 'Read', targetValue: 30 });
    await gotoHash(page, '/today');
    await logTime(page, 'Read', 20, 'Ch. 3');
    await expectAmount(page, 'Read', '20/30');
    await page.reload();
    await expectAmount(page, 'Read', '20/30');
    await expect(goalCard(page, 'Read')).toContainText('Ch. 3');
    await page.close();
    const page2 = await context.newPage();
    await freezeClock(page2);
    await gotoHash(page2, '/today');
    await expectAmount(page2, 'Read', '20/30');
    await expect(page2.getByRole('status').filter({ hasText: EN.common.loading })).toHaveCount(0);
  });
});
