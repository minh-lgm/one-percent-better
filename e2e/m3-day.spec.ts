import { expect, test } from '@playwright/test';
import { EN, expectAmount, expectAxeClean, expectNoHorizontalScroll, freezeClock, goalCard, gotoHash, importBackup, plusOne, toast } from './helpers/app';

test.beforeEach(async ({ page }) => {
  await freezeClock(page);
  await importBackup(page);
});

test.describe('M3 Day', () => {
  test('M3-AC1: back-fill 30 min for Guitar on 2026-10-05; Today unchanged; edit/delete and the 1440 limit work on Day', async ({ page }) => {
    await gotoHash(page, '/day/2026-10-05');
    await expect(page.getByRole('heading', { level: 1, name: EN.day.title })).toBeVisible();
    await expect(page.getByText('Monday, October 5, 2026')).toBeVisible();
    await expect(page.getByLabel(EN.day.dateLabel)).toHaveValue('2026-10-05');
    const guitar = goalCard(page, 'Guitar');
    await expectAmount(page, 'Guitar', '0/20');
    await expect(guitar).toContainText(EN.empty.day.noEntries);
    await guitar.getByRole('button', { name: EN.goalCard.addEntry }).click();
    const form = guitar.getByRole('form', { name: 'Add entry for Guitar on 2026-10-05' });
    await expect(form.getByLabel(/^Minutes/)).toBeFocused();
    await form.getByLabel(/^Minutes/).fill('30');
    await form.getByLabel(/^Note/).fill('Scales');
    await form.getByRole('button', { name: EN.entry.form.save }).click();
    await expect(toast(page)).toHaveText(EN.toast.entrySaved);
    await expectAmount(page, 'Guitar', '30/20');
    await expect(plusOne(page, 'Guitar')).toBeVisible();
    await expect(guitar).toContainText('Target reached · 10 min extra');
    await expect(guitar.getByText(EN.entry.source.manual)).toBeVisible();

    // Today's totals are not affected.
    await gotoHash(page, '/today');
    await expectAmount(page, 'Guitar', '0/20');
    await expect(page.getByRole('link', { name: EN.today.pastDayLink })).toHaveAttribute('href', '#/day/2026-10-08');

    // Back on that day the entry is still there; edit → 10, then the day limit.
    await gotoHash(page, '/day/2026-10-05');
    await expect(guitar.getByRole('button', { name: 'Edit entry: 30 min, Scales' })).toBeVisible();
    await guitar.getByRole('button', { name: 'Edit entry: 30 min, Scales' }).click();
    const edit = guitar.getByRole('form', { name: 'Edit entry for Guitar' });
    await edit.getByLabel(/^Minutes/).fill('1400');
    await edit.getByRole('button', { name: EN.entry.form.saveChanges }).click();
    await expectAmount(page, 'Guitar', '1,400/20');
    await guitar.getByRole('button', { name: EN.goalCard.addEntry }).click();
    await guitar.getByLabel(/^Minutes/).fill('41');
    await guitar.getByRole('button', { name: EN.entry.form.save }).click();
    await expect(guitar.getByText('A goal can have at most 1,440 minutes in one day. You can add up to 40 more for this day.')).toBeVisible();
    await guitar.getByRole('button', { name: EN.common.cancel }).click();
    await expectAxeClean(page);

    await guitar.getByRole('button', { name: 'Delete entry: 1,400 min, Scales' }).click();
    await guitar.getByRole('group', { name: /^Confirm delete/ }).getByRole('button', { name: EN.common.delete }).click();
    await expect(toast(page)).toHaveText(EN.toast.entryDeleted);
    await expectAmount(page, 'Guitar', '0/20');
  });

  test('M3-AC2: no logging for a future date; Next day is disabled on today', async ({ page }) => {
    await gotoHash(page, '/day/2026-10-10');
    await expect(page.getByText(EN.errors.DATE_IN_FUTURE)).toBeVisible();
    await expect(page.getByRole('button', { name: EN.goalCard.addEntry })).toHaveCount(0);
    await expect(page.getByRole('form')).toHaveCount(0);
    await expect(page.getByRole('button', { name: EN.day.next })).toBeDisabled();
    await page.getByRole('link', { name: EN.day.goToToday }).click();
    await expect(page.getByRole('heading', { level: 1, name: EN.today.title })).toBeVisible();

    await gotoHash(page, '/day/2026-10-09');
    await expect(page.getByText('Friday, October 9, 2026')).toBeVisible();
    await expect(page.getByRole('button', { name: EN.day.next })).toBeDisabled();
    await page.getByRole('button', { name: EN.day.prev }).click();
    await expect(page).toHaveURL(/#\/day\/2026-10-08$/);
    await expect(page.getByText('Thursday, October 8, 2026')).toBeVisible();
    await expect(page.getByRole('button', { name: EN.day.prev })).toBeFocused();
    await expect(page.getByRole('button', { name: EN.day.next })).toBeEnabled();
    await expect(goalCard(page, 'Read')).toContainText('30/30');
  });

  test('M3-AC3: only goals whose period contains the day are listed', async ({ page }) => {
    await gotoHash(page, '/day/2026-09-20');
    await expect(goalCard(page, 'Guitar')).toBeVisible();
    await expect(goalCard(page, 'Spanish')).toBeVisible();
    await expect(goalCard(page, 'Read')).toHaveCount(0);
    await expect(goalCard(page, 'Marathon prep')).toHaveCount(0);
    await expect(page.getByText(EN.day.onlyRunning)).toBeVisible();

    await gotoHash(page, '/day/2026-06-30');
    await expect(goalCard(page, 'Old course')).toContainText('15/15');
    await expect(goalCard(page, 'Guitar')).toHaveCount(0);

    await gotoHash(page, '/day/2025-12-25');
    await expect(page.getByRole('heading', { level: 2, name: EN.empty.day.noGoals })).toBeVisible();
    await expect(page.getByRole('link', { name: EN.empty.day.noGoalsAction })).toHaveAttribute('href', '#/goals');
  });

  test('M3-AC4 + M3-AC12: invalid dates show a message with a link to Today; axe and 360 px layout', async ({ page }) => {
    for (const bad of ['2026-13-40', 'abc']) {
      await gotoHash(page, `/day/${bad}`);
      await expect(page.getByText(EN.day.invalid)).toBeVisible();
      await expect(page.getByRole('link', { name: EN.day.invalidAction })).toHaveAttribute('href', '#/today');
      await expectAxeClean(page);
    }
    await page.getByRole('link', { name: EN.day.invalidAction }).click();
    await expect(page.getByRole('heading', { level: 1, name: EN.today.title })).toBeVisible();

    await page.setViewportSize({ width: 360, height: 740 });
    await gotoHash(page, '/day/2026-10-08');
    await expect(goalCard(page, 'Read')).toBeVisible();
    await goalCard(page, 'Spanish').getByRole('button', { name: EN.goalCard.addEntry }).click();
    await expectNoHorizontalScroll(page);
    await expectAxeClean(page);
  });
});
