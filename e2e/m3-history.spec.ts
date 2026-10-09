import { expect, test } from '@playwright/test';
import { at, EN, expectAxeClean, expectNoHorizontalScroll, freezeClock, gotoHash, importBackup, startTimer, stopDialog, timerCard } from './helpers/app';

test.beforeEach(async ({ page }) => {
  await freezeClock(page);
});

test.describe('M3 Goal detail / history', () => {
  test('M3-AC5: 13 entries newest first with a source column; a timer entry shows "Timer"; unknown id → Not found', async ({ page }) => {
    await importBackup(page);
    await gotoHash(page, '/goals');
    await page.getByRole('link', { name: 'Guitar' }).click();
    await expect(page).toHaveURL(/#\/goals\/g2$/);
    await expect(page.getByRole('heading', { level: 1, name: 'Guitar' })).toBeVisible();
    await expect(page.getByRole('heading', { level: 1, name: 'Guitar' })).toBeFocused();
    await expect(page).toHaveTitle('Guitar — 1% Better');
    await expect(page.getByText(EN.goal.status.active)).toBeVisible();
    await expect(page.getByText('Play a full song by Christmas')).toBeVisible();
    await expect(page.getByText('20 min/day · 2026-09-01 – 2026-12-31')).toBeVisible();
    await expect(page.getByRole('heading', { level: 2, name: EN.goal.detail.historyTitle })).toBeVisible();
    await expect(page.getByRole('columnheader', { name: EN.goal.detail.colSource })).toBeVisible();
    const rows = page.getByTestId('history-row');
    await expect(rows).toHaveCount(13);
    await expect(rows.nth(0)).toContainText('2026-10-08');
    await expect(rows.nth(0)).toContainText('20 min');
    await expect(rows.nth(0)).toContainText(EN.entry.source.manual);
    await expect(rows.nth(12)).toContainText('2026-09-01');
    await expect(page.getByRole('link', { name: EN.common.edit })).toHaveAttribute('href', '#/goals/g2/edit');
    await expectAxeClean(page);

    // A timer session (M2) shows up with the "Timer" source.
    await gotoHash(page, '/today');
    await startTimer(page, 'Guitar');
    await freezeClock(page, at('00:25:31'));
    await timerCard(page).getByRole('button', { name: /^Stop timer for Guitar/ }).click();
    await stopDialog(page).getByRole('button', { name: EN.entry.form.save }).click();
    await expect(timerCard(page)).toHaveCount(0);
    await gotoHash(page, '/goals/g2');
    await expect(rows).toHaveCount(14);
    await expect(rows.nth(0)).toContainText('2026-10-09');
    await expect(rows.nth(0)).toContainText('26 min');
    await expect(rows.nth(0)).toContainText(EN.entry.source.timer);
    await expect(rows.nth(0)).toContainText('—');

    // Dates link to the Day screen.
    await rows.nth(1).getByRole('link', { name: '2026-10-08' }).click();
    await expect(page).toHaveURL(/#\/day\/2026-10-08$/);
    await expect(page.getByText('Thursday, October 8, 2026')).toBeVisible();

    await gotoHash(page, '/goals/khong-ton-tai');
    await expect(page.getByRole('heading', { level: 1, name: EN.notFound.goalTitle })).toBeVisible();
    await expect(page.getByRole('link', { name: EN.notFound.goalAction })).toHaveAttribute('href', '#/goals');
  });

  test('empty history, Delete from the detail page, 360 px layout', async ({ page }) => {
    await importBackup(page);
    await page.setViewportSize({ width: 360, height: 740 });
    await gotoHash(page, '/goals/g4');
    await expect(page.getByRole('heading', { level: 1, name: 'Marathon prep' })).toBeVisible();
    await expect(page.getByText(EN.goal.status.upcoming)).toBeVisible();
    await expect(page.getByRole('heading', { level: 3, name: EN.empty.detail.history })).toBeVisible();
    await expectNoHorizontalScroll(page);
    await gotoHash(page, '/goals/g2');
    await expect(page.getByTestId('history-row')).toHaveCount(13);
    await expectNoHorizontalScroll(page);
    await expectAxeClean(page);

    await page.getByRole('button', { name: EN.common.delete }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toContainText('Delete "Guitar"?');
    await expect(dialog).toContainText('This permanently deletes the goal and its 13 entries.');
    await dialog.getByRole('button', { name: EN.common.cancel }).click();
    await expect(dialog).toBeHidden();
    await page.getByRole('button', { name: EN.common.delete }).click();
    await dialog.getByRole('button', { name: EN.goal.delete.confirm }).click();
    await expect(page).toHaveURL(/#\/goals$/);
    await expect(page.getByTestId('goal-row')).toHaveCount(4);
    await expect(page.getByRole('link', { name: 'Guitar' })).toHaveCount(0);
  });

  test('M3-AC11: an imported note containing a <script> tag is shown literally', async ({ page }) => {
    let dialogs = 0;
    page.on('dialog', (d) => {
      dialogs++;
      void d.dismiss();
    });
    await importBackup(page, 'xss-note.json');
    await gotoHash(page, '/goals/g1');
    const row = page.getByTestId('history-row');
    await expect(row).toHaveCount(1);
    await expect(row.first().getByRole('cell').nth(2)).toHaveText('<script>alert(1)</script>');
    expect(await page.evaluate(() => Array.from(document.querySelectorAll('script')).some((s) => s.textContent?.includes('alert(1)')))).toBe(false);
    await gotoHash(page, '/day/2026-10-08');
    await expect(page.getByRole('article', { name: 'Read' })).toContainText('<script>alert(1)</script>');
    expect(dialogs).toBe(0);
  });
});
