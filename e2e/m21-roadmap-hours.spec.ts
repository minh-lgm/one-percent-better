// M21-AC2 / AC3 / AC4 — the roadmap total is every minute of the linked goal (FR-71 v8.3, A-80, A-93, A-95; ARCH
// §4.8 d "Oracle v8.3"; DESIGN v8.3 S13 "Dòng hours-outside"). chromium, Q1 fixture through the real import UI,
// "today" 2026-11-04 10:00 +07:00. vi-VN at 360 px, en-US at 1440 px. No reload between the steps (liveQuery).
import { expect, test, type Page } from '@playwright/test';
import { EN, expectAxeClean, expectNoHorizontalScroll, expectNoViLeaks, FIXED_TIME_Q1, freezeClock, gotoHash, importBackup, logTime, toast, VI } from './helpers/app';

const item = (page: Page, id: string) => page.locator(`[data-testid="roadmap-item"][data-item="${id}"]`);
const overview = (page: Page) => page.getByTestId('overview');

test.describe('M21 roadmap hours = goal total', () => {
  test.beforeEach(async ({ page }) => {
    await freezeClock(page, FIXED_TIME_Q1);
  });

  test.describe('vi-VN 360', () => {
    test.use({ locale: 'vi-VN', viewport: { width: 360, height: 800 } });

    test('M21-AC2/AC4 (vi, 360): list "Đã học 6,6 giờ / 16 giờ"; detail 6,6 giờ + "Gồm 0,8 giờ từ trước ngày bắt đầu lộ trình.", plan 16 giờ; W1 4,5 / W2 1,3 / W3 0; 75/480; scan, axe light + dark', async ({ page }) => {
      await importBackup(page, 'q1-roadmap-backup.json', VI);
      await gotoHash(page, '/roadmaps');
      await expect(page.getByTestId('roadmap-row').getByTestId('roadmap-hours')).toHaveText('Đã học 6,6 giờ / 16 giờ');
      await page.getByTestId('roadmap-row').getByRole('link').click();
      const ov = overview(page);
      await expect(ov.getByTestId('hours-value')).toHaveText('6,6 giờ');
      await expect(ov.getByTestId('hours-outside')).toHaveText('Gồm 0,8 giờ từ trước ngày bắt đầu lộ trình.');
      await expect(ov.getByTestId('hours-sub')).toHaveText('Kế hoạch đến hết tuần này: 16 giờ');
      await expect(item(page, 'wq1').getByTestId('item-hours')).toHaveText('4,5 giờ');
      await expect(item(page, 'wq2').getByTestId('item-hours')).toHaveText('1,3 giờ');
      await expect(item(page, 'wq3').getByTestId('item-hours')).toHaveText('0 giờ');
      await expect(page.getByTestId('this-week').getByTestId('this-week-minutes')).toHaveText('75/480 phút');
      await page.getByTestId('how-hours').locator('summary').click();
      await expect(page.getByTestId('how-hours')).toContainText('Tổng giờ học là toàn bộ thời gian đã ghi ở mục tiêu được liên kết');
      await expectNoViLeaks(page);
      await expectNoHorizontalScroll(page);
      for (const scheme of ['light', 'dark'] as const) {
        await page.emulateMedia({ colorScheme: scheme });
        await expectAxeClean(page);
      }
    });
  });

  test.describe('en-US 1440', () => {
    test.use({ locale: 'en-US', viewport: { width: 1440, height: 900 } });

    test('M21-AC2/AC3 (en, 1440): 6.6 h = Goal detail 395; +30 min today → 425 / 7.1 h / W2 1.8 h / 105/480, outside still 0.8 h; archive → 7.1 h + archived note; delete → "—"', async ({ page }) => {
      await importBackup(page, 'q1-roadmap-backup.json', EN);
      await gotoHash(page, '/roadmaps');
      await expect(page.getByTestId('roadmap-row').getByTestId('roadmap-hours')).toHaveText('Studied 6.6 h of 16 h');
      // Goal detail total = roadmap total
      await gotoHash(page, '/goals/gq');
      await expect(page.getByTestId('stat-progress')).toContainText('395');
      await gotoHash(page, '/roadmaps/rq');
      const ov = overview(page);
      await expect(ov.getByTestId('hours-value')).toHaveText('6.6 h'); // 395 / 60 = 6.58
      await expect(ov.getByTestId('hours-outside')).toHaveText("Includes 0.8 h from before the roadmap's start date.");
      await expect(ov.getByTestId('hours-sub')).toHaveText('Planned through this week: 16 h');
      await expect(item(page, 'wq1').getByTestId('item-hours')).toHaveText('4.5 h');
      await expect(item(page, 'wq2').getByTestId('item-hours')).toHaveText('1.3 h');
      await expect(item(page, 'wq3').getByTestId('item-hours')).toHaveText('0 h');
      await expect(page.getByTestId('this-week').getByTestId('this-week-minutes')).toHaveText('75/480 min');
      await expectAxeClean(page);

      // AC3: log 30 min for "QPT study" today (2026-11-04) through Today
      await gotoHash(page, '/today');
      await logTime(page, 'QPT study', 30);
      await expect(toast(page)).toBeVisible();
      await gotoHash(page, '/goals/gq');
      await expect(page.getByTestId('stat-progress')).toContainText('425');
      await gotoHash(page, '/roadmaps/rq');
      await expect(ov.getByTestId('hours-value')).toHaveText('7.1 h');
      await expect(item(page, 'wq2').getByTestId('item-hours')).toHaveText('1.8 h');
      await expect(page.getByTestId('this-week').getByTestId('this-week-minutes')).toHaveText('105/480 min');
      await expect(ov.getByTestId('hours-outside')).toHaveText("Includes 0.8 h from before the roadmap's start date.");
      await gotoHash(page, '/roadmaps');
      await expect(page.getByTestId('roadmap-row').getByTestId('roadmap-hours')).toHaveText('Studied 7.1 h of 16 h');

      // Archive gq → hours still count, archived note
      await gotoHash(page, '/goals/gq');
      await page.getByRole('button', { name: EN.goals.archive }).click();
      await expect(toast(page)).toHaveText(EN.toast.goalArchived);
      await gotoHash(page, '/roadmaps/rq');
      await expect(ov.getByTestId('hours-value')).toHaveText('7.1 h');
      await expect(ov.getByTestId('hours-outside')).toHaveText("Includes 0.8 h from before the roadmap's start date.");
      await expect(ov.getByTestId('hours-sub')).toHaveText('The linked goal is archived. Its time still counts. Planned through this week: 16 h');
      await expect(page.getByTestId('detail-goal')).toContainText('archived');

      // Delete gq → unlinked on this device: "—", no hours-outside line
      await gotoHash(page, '/goals/gq');
      await page.getByRole('button', { name: EN.common.delete }).click();
      const dialog = page.getByRole('dialog');
      await dialog.getByRole('button', { name: EN.goal.delete.confirm }).click();
      await expect(toast(page)).toHaveText(EN.toast.goalDeleted);
      await gotoHash(page, '/roadmaps/rq');
      await expect(ov.getByTestId('hours-value')).toHaveText('—');
      await expect(ov.getByTestId('hours-outside')).toHaveCount(0);
      await expect(item(page, 'wq2').getByTestId('item-hours')).toHaveText('—');
    });
  });
});
