// QC round 2 (M2): verify M2-D1 (real keystrokes in the Reminder time field), M2-D2 (long names at 360 px),
// double-click Start (M2-D3 UI side), plus exploratory probes around the new ReminderTimeField.
import { expect, test, type Locator, type Page } from '@playwright/test';
import { createGoal, EN, expectAxeClean, expectNoHorizontalScroll, expectNoViLeaks, freezeClock, goalCard, gotoHash, kvGet, stopDialog, timerCard, toast, VI } from '../../e2e/helpers/app';

type Copy = typeof EN | typeof VI;

async function openSettingsReminders(page: Page, copy: Copy = EN) {
  await freezeClock(page);
  await gotoHash(page, '/settings');
  const sw = page.getByRole('switch', { name: copy.settings.reminders.switch });
  await sw.click();
  await expect(sw).toBeChecked();
  return page.getByLabel(copy.settings.reminders.time);
}
const stored = async (page: Page) => ((await kvGet(page, 'settings')) as { reminderTime: string }).reminderTime;
const hourSegment = (time: Locator) => time.click({ position: { x: 8, y: 10 } });

test.describe('M2-D1 verify — real keystrokes, en-US', () => {
  test.use({ locale: 'en-US' });

  const cases: Array<[string, string]> = [
    ['0730AM', '07:30'],
    ['1245PM', '12:45'],
    ['1200AM', '00:00'],
    ['1159PM', '23:59'],
    ['0100PM', '13:00'],
    ['0945PM', '21:45'],
    ['1200PM', '12:00'],
  ];
  for (const [keys, expected] of cases) {
    test(`typing ${keys} -> ${expected} (field, kv, one toast, survives reload)`, async ({ page }) => {
      const time = await openSettingsReminders(page);
      await hourSegment(time);
      const trace: string[] = [];
      for (const ch of keys) {
        await page.keyboard.press(ch); // one real key per call, no delay
        trace.push(`${ch}: input=${await time.inputValue()} kv=${await stored(page)}`);
      }
      await expect(time).toHaveValue(expected);
      await expect.poll(() => stored(page), { message: trace.join(' | ') }).toBe(expected);
      await expect(toast(page)).toHaveText(EN.toast.reminderTime); // strict: exactly one toast element
      await page.reload();
      await expect(page.getByLabel(EN.settings.reminders.time)).toHaveValue(expected);
      expect(await stored(page)).toBe(expected);
    });
  }

  test('keyboard.type with a delay (slow typist) gives the same result', async ({ page }) => {
    const time = await openSettingsReminders(page);
    await hourSegment(time);
    await page.keyboard.type('0815PM', { delay: 120 });
    await expect(time).toHaveValue('20:15');
    await expect.poll(() => stored(page)).toBe('20:15');
  });

  test('pressSequentially on the locator (what a Playwright user would write)', async ({ page }) => {
    const time = await openSettingsReminders(page);
    await time.pressSequentially('0630AM');
    await expect(time).toHaveValue('06:30');
    await expect.poll(() => stored(page)).toBe('06:30');
  });

  test('rapid ArrowDown x5 on the minutes segment moves exactly 5 (r1: only 2 registered)', async ({ page }) => {
    const time = await openSettingsReminders(page);
    await hourSegment(time);
    await page.keyboard.type('0530PM');
    await page.keyboard.press('Shift+Tab'); // minutes
    for (let i = 0; i < 5; i++) await page.keyboard.press('ArrowDown');
    await expect(time).toHaveValue('17:25');
    await expect.poll(() => stored(page)).toBe('17:25');
  });

  test('rapid ArrowUp x7 on the hour segment', async ({ page }) => {
    const time = await openSettingsReminders(page);
    await hourSegment(time);
    await page.keyboard.type('0300PM'); // 15:00, focus now on AM/PM
    await page.keyboard.press('Shift+Tab');
    await page.keyboard.press('Shift+Tab'); // hours
    for (let i = 0; i < 7; i++) await page.keyboard.press('ArrowUp');
    await expect(time).toHaveValue('22:00');
    await expect.poll(() => stored(page)).toBe('22:00');
  });

  test('clearing segments with Backspace shows empty while focused, saves nothing, blur restores the stored value (no toast)', async ({ page }) => {
    const time = await openSettingsReminders(page);
    await hourSegment(time);
    await page.keyboard.press('Backspace');
    await expect(time).toHaveValue('');
    await page.waitForTimeout(900); // longer than the 700 ms settle window
    expect(await stored(page)).toBe('20:00');
    await expect(toast(page)).toHaveCount(0);
    await page.keyboard.press('Tab');
    await page.keyboard.press('Backspace');
    await page.keyboard.press('Tab');
    await page.keyboard.press('Backspace');
    await time.blur();
    await expect(time).toHaveValue('20:00');
    expect(await stored(page)).toBe('20:00');
    await expect(toast(page)).toHaveCount(0);
  });

  test('Delete key and Ctrl+A/Backspace do not corrupt the stored value', async ({ page }) => {
    const time = await openSettingsReminders(page);
    await hourSegment(time);
    await page.keyboard.press('Delete');
    await page.keyboard.press('Control+a');
    await page.keyboard.press('Backspace');
    await page.waitForTimeout(900);
    expect(await stored(page)).toBe('20:00');
    await time.blur();
    await expect(time).toHaveValue('20:00');
  });

  test('only the hour typed, then blur: the stored value is a valid HH:MM and equals what the field shows', async ({ page }) => {
    const time = await openSettingsReminders(page);
    await hourSegment(time);
    await page.keyboard.type('09');
    await time.blur();
    await page.waitForTimeout(300);
    const s = await stored(page);
    expect(s).toMatch(/^([01]\d|2[0-3]):[0-5]\d$/);
    await expect(time).toHaveValue(s);
  });

  test('Escape in the field changes nothing and does not navigate', async ({ page }) => {
    const time = await openSettingsReminders(page);
    await hourSegment(time);
    await page.keyboard.type('0945PM');
    await expect.poll(() => stored(page)).toBe('21:45');
    await page.keyboard.press('Escape');
    await expect(time).toHaveValue('21:45');
    await expect(page).toHaveURL(/#\/settings$/);
    expect(await stored(page)).toBe('21:45');
  });

  test('set by script like a paste/picker (native setter + input/change events): valid saved, invalid ignored', async ({ page }) => {
    const time = await openSettingsReminders(page);
    const setNative = (v: string) =>
      time.evaluate((el, value) => {
        const input = el as HTMLInputElement;
        const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
        setter.call(input, value);
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.dispatchEvent(new Event('change', { bubbles: true }));
      }, v);
    await time.focus();
    await setNative('06:15');
    await expect.poll(() => stored(page)).toBe('06:15');
    await setNative('25:99'); // the browser sanitises this to ''
    await setNative('7:5');
    await setNative('abc');
    await page.waitForTimeout(300);
    expect(await stored(page)).toBe('06:15');
    await time.fill('23:59');
    await expect.poll(() => stored(page)).toBe('23:59');
    await time.fill('00:00');
    await expect.poll(() => stored(page)).toBe('00:00');
    await time.blur();
    await expect(time).toHaveValue('00:00');
  });

  test('typing the value that is already stored does not save again or show a toast', async ({ page }) => {
    const time = await openSettingsReminders(page);
    await hourSegment(time);
    await page.keyboard.type('0800PM');
    await page.waitForTimeout(900);
    await expect(toast(page)).toHaveCount(0);
    expect(await stored(page)).toBe('20:00');
  });

  test('blur flushes the toast promptly and a second edit still works', async ({ page }) => {
    const time = await openSettingsReminders(page);
    await hourSegment(time);
    await page.keyboard.type('0730AM');
    await page.keyboard.press('Tab');
    await page.keyboard.press('Tab');
    await expect(toast(page)).toHaveText(EN.toast.reminderTime);
    await hourSegment(time);
    await page.keyboard.type('0915AM');
    await expect.poll(() => stored(page)).toBe('09:15');
    await expect(time).toHaveValue('09:15');
  });

  test('label association, type=time, disabled when reminder is off, axe clean (light and dark)', async ({ page }) => {
    const time = await openSettingsReminders(page);
    expect(await time.getAttribute('type')).toBe('time');
    expect(await time.evaluate((el) => (el as HTMLInputElement).labels?.[0]?.textContent)).toBe(EN.settings.reminders.time);
    await expectAxeClean(page);
    await page.emulateMedia({ colorScheme: 'dark' });
    await expectAxeClean(page);
    await page.getByRole('switch', { name: EN.settings.reminders.switch }).click();
    await expect(time).toBeDisabled();
    await expect(time).toHaveValue('20:00');
  });

  test('another tab changes the time while this tab edits: this tab ends with its own typed value', async ({ page, context }) => {
    const time = await openSettingsReminders(page);
    const other = await context.newPage();
    await freezeClock(other);
    await gotoHash(other, '/settings');
    await other.getByLabel(EN.settings.reminders.time).fill('05:05');
    await expect.poll(() => stored(other)).toBe('05:05');
    await hourSegment(time);
    await page.keyboard.type('0610AM');
    await expect.poll(() => stored(page)).toBe('06:10');
    await time.blur();
    await expect(time).toHaveValue('06:10');
  });

  test('keyboard-only: Tab from the switch lands on the time field', async ({ page }) => {
    const time = await openSettingsReminders(page);
    await page.getByRole('switch', { name: EN.settings.reminders.switch }).focus();
    await page.keyboard.press('Tab');
    await expect(time).toBeFocused();
  });
});

test.describe('M2-D1 verify — real keystrokes, vi-VN', () => {
  test.use({ locale: 'vi-VN', viewport: { width: 360, height: 740 } });

  test('vi-VN picker is 12 h: typing hhmm + toggling SA/CH with the keyboard gives the right 24 h value', async ({ page }) => {
    const time = await openSettingsReminders(page, VI);
    const info: string[] = [];
    for (const [keys, expected] of [['0730', '07:30'], ['0745', '19:45'], ['1200', '00:00'], ['1159', '23:59'], ['1200', '12:00']] as const) {
      await hourSegment(time);
      await page.keyboard.type(keys);
      info.push(`${keys}->${await time.inputValue()}`);
      if ((await time.inputValue()) !== expected) await page.keyboard.press('ArrowUp'); // toggles the SA/CH segment (focus moves there after 4 digits)
      await expect(time, info.join(' ')).toHaveValue(expected);
      await expect.poll(() => stored(page), { message: info.join(' ') }).toBe(expected);
      await time.blur();
    }
    await page.reload();
    await expect(page.getByLabel(VI.settings.reminders.time)).toHaveValue('12:00');
    await expectNoViLeaks(page);
    await expectNoHorizontalScroll(page);
    test.info().annotations.push({ type: 'observed', description: info.join(' ') });
  });

  test('vi: clear + blur restores the stored value; scan + axe clean', async ({ page }) => {
    const time = await openSettingsReminders(page, VI);
    await hourSegment(time);
    await page.keyboard.press('Backspace');
    await expect(time).toHaveValue('');
    await time.blur();
    await expect(time).toHaveValue('20:00');
    expect(await stored(page)).toBe('20:00');
    await expectNoViLeaks(page);
    await expectAxeClean(page);
  });
});

test.describe('M2-D2 verify — long goal names at 360 px', () => {
  const names: Array<[string, string]> = [
    ['W x60', 'W'.repeat(60)],
    ['url 56', 'https://example.com/a/very/long/path/without/spaces/1234'],
    ['wide diacritics x60', 'Ế'.repeat(60)],
    ['vi no-space word', 'Nghiêncứukhoahọcvềtrítuệnhântạoứngdụngtronggiáodục'],
    ['CJK x60', '漢'.repeat(60)],
    ['underscores x60', '_'.repeat(60)],
  ];
  for (const [label, name] of names) {
    for (const [loc, copy] of [['en-US', EN], ['vi-VN', VI]] as const) {
      test(`${label} (${loc}): Today, TimerCard, Stop dialog, Goals — no horizontal scroll`, async ({ browser }) => {
        const ctx = await browser.newContext({ locale: loc, viewport: { width: 360, height: 740 }, timezoneId: 'Asia/Ho_Chi_Minh' });
        const page = await ctx.newPage();
        await freezeClock(page);
        await createGoal(page, { name, targetValue: 30, startDate: '2026-10-01', endDate: '2026-10-31' }, copy);
        await gotoHash(page, '/today');
        await expectNoHorizontalScroll(page);
        await goalCard(page, name).getByRole('button', { name: copy.goalCard.startTimer }).click();
        await expect(timerCard(page)).toBeVisible();
        await expectNoHorizontalScroll(page);
        await timerCard(page).getByRole('button').first().click();
        const dlg = stopDialog(page);
        await expect(dlg).toBeVisible();
        const box = await dlg.boundingBox();
        expect(box!.x).toBeGreaterThanOrEqual(0);
        expect(box!.x + box!.width).toBeLessThanOrEqual(360);
        await expectNoHorizontalScroll(page);
        await dlg.getByRole('button', { name: copy.timer.discard }).click();
        await gotoHash(page, '/goals');
        await expectNoHorizontalScroll(page);
        await ctx.close();
      });
    }
  }
});

test.describe('M2-D3 UI side — double click Start', () => {
  for (const delay of [0, 15, 40, 80, 150]) {
    test(`two clicks ${delay} ms apart: one timer, no error alert, no page error`, async ({ page }) => {
      const errors: string[] = [];
      page.on('pageerror', (e) => errors.push(e.message));
      await freezeClock(page);
      await createGoal(page, { name: 'Read', targetValue: 30, startDate: '2026-10-01', endDate: '2026-10-31' });
      await gotoHash(page, '/today');
      const btn = goalCard(page, 'Read').getByRole('button', { name: EN.goalCard.startTimer });
      const box = (await btn.boundingBox())!;
      const x = box.x + box.width / 2;
      const y = box.y + box.height / 2;
      await page.mouse.click(x, y);
      if (delay) await page.waitForTimeout(delay);
      await page.mouse.click(x, y);
      await expect(timerCard(page)).toBeVisible();
      await page.waitForTimeout(300);
      expect(await kvGet(page, 'activeTimer')).toMatchObject({ goalId: expect.any(String) });
      await expect(page.getByRole('alert')).toHaveCount(0);
      expect(errors).toEqual([]);
    });
  }
});
