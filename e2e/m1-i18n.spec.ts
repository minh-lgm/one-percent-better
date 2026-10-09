import { expect, test } from '@playwright/test';
import { createGoal, EN, expectAmount, expectAxeClean, expectNoHorizontalScroll, expectNoViLeaks, freezeClock, goalCard, gotoHash, logTime, plusOne, toast, VI } from './helpers/app';

const VI_DATE_LONG = new Intl.DateTimeFormat('vi-VN', { weekday: 'long', month: 'long', day: 'numeric' }).format(new Date(2026, 9, 9));

async function kvLocale(page: Parameters<typeof freezeClock>[0]): Promise<unknown> {
  return page.evaluate(
    () =>
      new Promise((resolve, reject) => {
        const req = indexedDB.open('one-percent-better');
        req.onerror = () => reject(req.error);
        req.onsuccess = () => {
          const db = req.result;
          const tx = db.transaction('kv', 'readonly');
          const get = tx.objectStore('kv').get('locale');
          get.onsuccess = () => {
            resolve(get.result ? get.result.value : null);
            db.close();
          };
          get.onerror = () => reject(get.error);
        };
      }),
  );
}

test.describe('M1-AC15: default language follows the browser', () => {
  test.describe('vi-VN', () => {
    test.use({ locale: 'vi-VN' });
    test('fresh DB → Vietnamese UI, nothing written to kv', async ({ page }) => {
      await freezeClock(page);
      await gotoHash(page, '/today');
      await expect(page.locator('html')).toHaveAttribute('lang', 'vi');
      await expect(page.getByRole('link', { name: VI.nav.today })).toBeVisible();
      await expect(page.getByRole('heading', { level: 2, name: VI.empty.today.noGoals })).toBeVisible();
      await expect(page).toHaveTitle('Hôm nay — 1% Better');
      await expectNoViLeaks(page);
      await gotoHash(page, '/settings');
      await expect(page.getByRole('radio', { name: 'Tiếng Việt' })).toBeChecked();
      expect(await kvLocale(page)).toBeNull();
    });

    test('M1-AC16: choosing English in a vi-VN browser persists', async ({ page }) => {
      await freezeClock(page);
      await gotoHash(page, '/settings');
      await page.getByRole('radio', { name: 'English' }).check();
      await expect(page.getByRole('heading', { level: 1, name: EN.settings.title })).toBeVisible();
      await page.reload();
      await expect(page.getByRole('heading', { level: 1, name: EN.settings.title })).toBeVisible();
      await expect(page.locator('html')).toHaveAttribute('lang', 'en');
    });
  });

  test.describe('en-US', () => {
    test('fresh DB → English UI', async ({ page }) => {
      await freezeClock(page);
      await gotoHash(page, '/today');
      await expect(page.locator('html')).toHaveAttribute('lang', 'en');
      await expect(page.getByRole('link', { name: 'Today' })).toBeVisible();
      await expect(page.getByRole('heading', { level: 2, name: 'Start with one small goal' })).toBeVisible();
      await gotoHash(page, '/settings');
      expect(await kvLocale(page)).toBeNull();
    });
  });

  test.describe('fr-FR', () => {
    test.use({ locale: 'fr-FR' });
    test('unsupported browser language → English', async ({ page }) => {
      await freezeClock(page);
      await gotoHash(page, '/today');
      await expect(page.locator('html')).toHaveAttribute('lang', 'en');
      await expect(page.getByRole('heading', { level: 2, name: 'Start with one small goal' })).toBeVisible();
    });
  });
});

test.describe('M1-AC16: switching language in Settings', () => {
  test('changes the whole app immediately, without reload, and persists', async ({ page, context }) => {
    await freezeClock(page);
    await createGoal(page, { name: 'Read', why: 'Be smarter', targetValue: 30 });
    await gotoHash(page, '/today');
    await logTime(page, 'Read', 20, 'Ch. 3');
    await expectAmount(page, 'Read', '20/30');

    await gotoHash(page, '/settings');
    await page.evaluate(() => {
      (window as unknown as { __noReload: boolean }).__noReload = true;
    });
    const viOption = page.getByRole('radio', { name: 'Tiếng Việt' });
    await viOption.check();
    await expect(page.getByRole('heading', { level: 1, name: VI.settings.title })).toBeVisible();
    await expect(page.getByRole('link', { name: VI.nav.today })).toBeVisible();
    await expect(page.locator('html')).toHaveAttribute('lang', 'vi');
    await expect(page).toHaveTitle('Cài đặt — 1% Better');
    await expect(toast(page)).toHaveText(VI.toast.languageChanged);
    await expect(viOption).toBeFocused();
    expect(await page.evaluate(() => (window as unknown as { __noReload?: boolean }).__noReload)).toBe(true);
    await expect(page.getByRole('radio', { name: 'English' })).toBeVisible();
    await expect(page.getByRole('radio', { name: 'Tiếng Việt' })).toBeVisible();
    await expectNoViLeaks(page);

    await page.getByRole('link', { name: VI.nav.today }).click();
    await expect(page.getByRole('heading', { level: 1, name: VI.today.title })).toBeVisible();
    await expect(page.getByText(VI_DATE_LONG)).toBeVisible();
    await expect(goalCard(page, 'Read')).toContainText('Ch. 3');
    await expect(goalCard(page, 'Read')).toContainText('Còn 10 phút');
    await expectNoViLeaks(page);

    await page.getByRole('link', { name: VI.nav.goals }).click();
    await expect(page.getByRole('heading', { level: 1, name: VI.goals.title })).toBeVisible();
    await expect(page.getByText('30 phút/ngày · 09/10/2026 – 31/12/2026')).toBeVisible();
    await expect(page.getByText('Be smarter')).toBeVisible();
    await expectNoViLeaks(page);

    await page.getByRole('link', { name: VI.common.edit }).click();
    await expect(page.getByRole('heading', { level: 1, name: VI.goal.form.titleEdit })).toBeVisible();
    await expect(page.getByLabel(/^Tên/)).toHaveValue('Read');
    await expect(page.getByLabel(/^Lý do/)).toHaveValue('Be smarter');
    await expectNoViLeaks(page);

    await page.reload();
    await expect(page.getByRole('heading', { level: 1, name: VI.goal.form.titleEdit })).toBeVisible();
    await expect(page.locator('html')).toHaveAttribute('lang', 'vi');
    await page.close();
    const page2 = await context.newPage();
    await freezeClock(page2);
    await gotoHash(page2, '/today');
    await expect(page2.getByRole('heading', { level: 1, name: VI.today.title })).toBeVisible();

    await gotoHash(page2, '/settings');
    await page2.getByRole('radio', { name: 'English' }).check();
    await expect(page2.getByRole('heading', { level: 1, name: EN.settings.title })).toBeVisible();
    await expect(page2.locator('html')).toHaveAttribute('lang', 'en');
    await page2.reload();
    await expect(page2.getByRole('heading', { level: 1, name: EN.settings.title })).toBeVisible();
  });

  test('keyboard: arrow keys switch the language', async ({ page }) => {
    await freezeClock(page);
    await gotoHash(page, '/settings');
    await page.getByRole('radio', { name: 'English' }).focus();
    await page.keyboard.press('ArrowRight');
    await expect(page.getByRole('heading', { level: 1, name: VI.settings.title })).toBeVisible();
    await expect(page.getByRole('radio', { name: 'Tiếng Việt' })).toBeFocused();
    await page.keyboard.press('ArrowLeft');
    await expect(page.getByRole('heading', { level: 1, name: EN.settings.title })).toBeVisible();
  });
});

test.describe('M1-AC17 + M1-AC18: main flow in vi-VN', () => {
  test.use({ locale: 'vi-VN' });

  test('create goal → log time → +1% → edit → delete, scanning every screen', async ({ page }) => {
    await freezeClock(page);
    await gotoHash(page, '/goals/new');
    await expectNoViLeaks(page);
    await page.getByRole('button', { name: VI.goal.form.save }).click();
    await expect(page.locator('#goal-name-err')).toHaveText(VI.errors.GOAL_NAME_REQUIRED);
    await expectNoViLeaks(page);

    await page.getByLabel(/^Tên/).fill('Read');
    await page.getByRole('textbox', { name: /^Phút mỗi ngày/ }).fill('30');
    await page.getByLabel(/^Ngày bắt đầu/).fill('2026-10-01');
    await page.getByRole('radio', { name: VI.goal.form.endsSpecific }).check();
    await page.getByLabel(/^Ngày kết thúc/).fill('2026-10-31');
    await expect(page.getByText('Tổng cộng 930 phút (15,5 giờ) trong 31 ngày.')).toBeVisible();
    await expectNoViLeaks(page);
    await page.getByRole('button', { name: VI.goal.form.save }).click();
    await expect(page.getByRole('heading', { level: 1, name: VI.goals.title })).toBeVisible();
    await expect(toast(page)).toHaveText(VI.toast.goalCreated);
    await expectNoViLeaks(page);
    await expect(page.getByText('30 phút/ngày · 01/10/2026 – 31/10/2026')).toBeVisible();
    await expect(page.getByTestId('goal-row').getByText(VI.goal.status.active)).toBeVisible();
    await expectAxeClean(page);

    await gotoHash(page, '/today');
    await expect(page.getByText(VI_DATE_LONG)).toBeVisible();
    await expectAmount(page, 'Read', '0/30');
    await expectNoViLeaks(page);
    await logTime(page, 'Read', 20, 'Ch. 3', VI);
    await expect(toast(page)).toHaveText(VI.toast.entrySaved);
    await expectNoViLeaks(page);
    await expectAmount(page, 'Read', '20/30');
    await expect(plusOne(page, 'Read')).toHaveCount(0);
    await logTime(page, 'Read', 10, '', VI);
    await expectAmount(page, 'Read', '30/30');
    await expect(plusOne(page, 'Read')).toBeVisible();
    await expect(goalCard(page, 'Read')).toContainText(VI.goalCard.reached);
    await expectNoViLeaks(page);
    await expectAxeClean(page);

    const card = goalCard(page, 'Read');
    await card.getByRole('button', { name: 'Sửa lần ghi: 20 phút, Ch. 3' }).click();
    await card.getByRole('form', { name: 'Sửa lần ghi của Read' }).getByLabel(/^Số phút/).fill('5');
    await card.getByRole('button', { name: VI.entry.form.saveChanges }).click();
    await expectAmount(page, 'Read', '15/30');
    await expect(plusOne(page, 'Read')).toHaveCount(0);
    await card.getByRole('button', { name: 'Xóa lần ghi: 5 phút, Ch. 3' }).click();
    await expectNoViLeaks(page);
    await card.getByRole('group', { name: 'Xác nhận xóa: 5 phút, Ch. 3' }).getByRole('button', { name: VI.common.delete }).click();
    await expectAmount(page, 'Read', '10/30');
    await expect(toast(page)).toHaveText(VI.toast.entryDeleted);

    await gotoHash(page, '/goals/new');
    await expectAxeClean(page);
    await gotoHash(page, '/settings');
    await expectNoViLeaks(page);
    await expectAxeClean(page);

    // M1-AC18: switching to English re-formats immediately
    await page.getByRole('radio', { name: 'English' }).check();
    await gotoHash(page, '/goals');
    await expect(page.getByText('30 min/day · 2026-10-01 – 2026-10-31')).toBeVisible();
    await gotoHash(page, '/today');
    await expect(page.getByText('Friday, October 9')).toBeVisible();
  });

  test('M1-AC18: 360 px layout has no horizontal scroll in vi', async ({ page }) => {
    await freezeClock(page);
    await page.setViewportSize({ width: 360, height: 740 });
    await createGoal(page, { name: 'Read', why: 'Be smarter', targetValue: 30, startDate: '2026-10-01', endDate: '2026-10-31' }, VI);
    await createGoal(page, { name: 'Marathon prep', targetValue: 45, startDate: '2026-11-01', endDate: '2026-11-30' }, VI);
    await createGoal(page, { name: 'Old course', targetValue: 15, startDate: '2026-01-01', endDate: '2026-06-30' }, VI);
    await expectNoHorizontalScroll(page);
    await gotoHash(page, '/today');
    await goalCard(page, 'Read').getByRole('button', { name: VI.goalCard.logTime }).click();
    await expectNoHorizontalScroll(page);
    await gotoHash(page, '/goals/new');
    await page.getByLabel(/^Lý do/).fill('a'.repeat(281));
    await page.getByRole('textbox', { name: /^Phút mỗi ngày/ }).fill('0');
    await page.getByRole('radio', { name: VI.goal.form.endsSpecific }).check();
    await page.getByLabel(/^Ngày kết thúc/).fill('2026-01-01');
    await page.getByRole('button', { name: VI.goal.form.save }).click();
    await expect(page.getByRole('alert')).toHaveText('Cần sửa 4 ô nhập để lưu.');
    await expectNoHorizontalScroll(page);
    await gotoHash(page, '/settings');
    await expectNoHorizontalScroll(page);
  });
});
