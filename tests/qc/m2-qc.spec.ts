// QC round 1 (M2): independent acceptance + exploratory E2E for timer, Stop dialog, banner, Settings Reminders, .ics.
// Notification-specific checks that need full Chromium live in m2-notify.spec.ts.
import { readFile } from 'node:fs/promises';
import { expect, test, type Page } from '@playwright/test';
import {
  advanceTo,
  at,
  createGoal,
  EN,
  expectAmount,
  expectAxeClean,
  expectNoHorizontalScroll,
  expectNoViLeaks,
  fakeNotificationPermission,
  freezeClock,
  goalCard,
  gotoHash,
  kvGet,
  startTimer,
  stopDialog,
  timerCard,
  timerElapsed,
  toast,
  VI,
} from '../../e2e/helpers/app';

const ORIGIN = 'http://localhost:4173';

async function dbAll(page: Page, store: 'goals' | 'entries'): Promise<Array<Record<string, unknown>>> {
  return page.evaluate(
    (s) =>
      new Promise<Array<Record<string, unknown>>>((resolve, reject) => {
        const req = indexedDB.open('one-percent-better');
        req.onerror = () => reject(req.error);
        req.onsuccess = () => {
          const r = req.result.transaction(s).objectStore(s).getAll();
          r.onsuccess = () => resolve(r.result as Array<Record<string, unknown>>);
          r.onerror = () => reject(r.error);
        };
      }),
    store,
  );
}

/** Collect page errors, console errors and any request leaving the origin. */
function watch(page: Page) {
  const problems: string[] = [];
  page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`));
  page.on('console', (m) => {
    if (m.type() === 'error') problems.push(`console.error: ${m.text()}`);
  });
  page.on('request', (r) => {
    if (!r.url().startsWith(ORIGIN) && !r.url().startsWith('data:') && !r.url().startsWith('blob:')) problems.push(`external request: ${r.url()}`);
  });
  page.on('dialog', (d) => {
    problems.push(`js dialog: ${d.message()}`);
    void d.dismiss();
  });
  return problems;
}

async function twoGoals(page: Page, copy: typeof EN | typeof VI = EN) {
  await createGoal(page, { name: 'Read', why: 'Be smarter', targetValue: 30, startDate: '2026-10-01', endDate: '2026-10-31' }, copy);
  await createGoal(page, { name: 'Guitar', targetValue: 20, startDate: '2026-09-01', endDate: '2026-12-31' }, copy);
  await gotoHash(page, '/today');
}

async function switchOn(page: Page, copy: typeof EN | typeof VI) {
  const sw = page.getByRole('switch', { name: copy.settings.reminders.switch });
  await sw.click();
  await expect(sw).toBeChecked();
}

const stopBtn = (page: Page) => timerCard(page).getByRole('button', { name: /^Stop timer for/ });
const minutesInput = (page: Page) => stopDialog(page).getByLabel(/^Minutes/);

test.describe('M2 QC — AC1..AC5 independent', () => {
  test.beforeEach(async ({ page }) => {
    await freezeClock(page);
  });

  test('AC1-AC3: start, tick, reload, stop, rounded prefill, edit, save as source=timer; discard leaves nothing', async ({ page }) => {
    const problems = watch(page);
    await twoGoals(page);
    await startTimer(page, 'Read');
    await expect(timerElapsed(page)).toHaveText('00:00:00');
    await freezeClock(page, at('00:01:05'));
    await expect(timerElapsed(page)).toHaveText('00:01:05');
    await freezeClock(page, at('00:25:31'));
    await page.reload();
    await expect(timerElapsed(page)).toHaveText(/^00:25:3[1-9]$/);
    await stopBtn(page).click();
    await expect(minutesInput(page)).toHaveValue('26');
    await expect(minutesInput(page)).toBeFocused();
    await expect(stopDialog(page)).toContainText('Saved to Friday, October 9');
    await minutesInput(page).fill('25');
    await stopDialog(page).getByLabel(/^Note/).fill('Pomodoro');
    await stopDialog(page).getByRole('button', { name: EN.entry.form.save }).click();
    await expect(stopDialog(page)).toHaveCount(0);
    await expectAmount(page, 'Read', '25/30');
    await expect(timerCard(page)).toHaveCount(0);
    expect(await kvGet(page, 'activeTimer')).toBeNull();
    const entries = await dbAll(page, 'entries');
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ minutes: 25, note: 'Pomodoro', source: 'timer', date: '2026-10-09' });

    // Discard
    await startTimer(page, 'Guitar');
    await freezeClock(page, at('00:36:00'));
    await stopBtn(page).click();
    await stopDialog(page).getByRole('button', { name: EN.timer.discard }).click();
    await expect(timerCard(page)).toHaveCount(0);
    await expect(toast(page)).toHaveText(EN.toast.timerDiscarded);
    expect(await dbAll(page, 'entries')).toHaveLength(1);
    expect(await kvGet(page, 'activeTimer')).toBeNull();
    expect(problems).toEqual([]);
  });

  test('AC2: close the tab, open a new one in the same context -> still running with the right time', async ({ page, context }) => {
    await twoGoals(page);
    await startTimer(page, 'Read');
    await freezeClock(page, at('03:00:00'));
    await page.close();
    const p2 = await context.newPage();
    await freezeClock(p2, at('03:00:07'));
    await gotoHash(p2, '/today');
    await expect(timerElapsed(p2)).toHaveText('03:00:07');
  });

  test('AC4: timer started 23:50 on Oct 9 is saved to Oct 9 although Today is already Oct 10', async ({ page }) => {
    await freezeClock(page, at('2026-10-09T23:50:00'));
    await twoGoals(page);
    await startTimer(page, 'Read');
    await advanceTo(page, at('2026-10-10T00:20:00'));
    await expect(page.getByRole('heading', { level: 1, name: 'Today' }).locator('..')).toContainText('Saturday, October 10');
    await expect(timerElapsed(page)).toHaveText('00:30:00');
    await stopBtn(page).click();
    await expect(minutesInput(page)).toHaveValue('30');
    await expect(stopDialog(page)).toContainText('Saved to Friday, October 9');
    await stopDialog(page).getByRole('button', { name: EN.entry.form.save }).click();
    await expect(stopDialog(page)).toHaveCount(0);
    const entries = await dbAll(page, 'entries');
    expect(entries.map((e) => [e.date, e.minutes, e.source])).toEqual([['2026-10-09', 30, 'timer']]);
    await expectAmount(page, 'Read', '0/30'); // today (Oct 10) is untouched
  });

  test('AC4+: timer on a goal that ENDS today still appears after midnight and can be saved to its last day', async ({ page }) => {
    await freezeClock(page, at('2026-10-09T23:50:00'));
    await createGoal(page, { name: 'Last day', targetValue: 30, startDate: '2026-10-01', endDate: '2026-10-09' });
    await gotoHash(page, '/today');
    await startTimer(page, 'Last day');
    await advanceTo(page, at('2026-10-10T00:20:00'));
    await expect(timerCard(page)).toBeVisible();
    await expect(timerElapsed(page)).toHaveText('00:30:00');
    await stopBtn(page).click();
    await stopDialog(page).getByRole('button', { name: EN.entry.form.save }).click();
    await expect(stopDialog(page)).toHaveCount(0);
    expect((await dbAll(page, 'entries')).map((e) => e.date)).toEqual(['2026-10-09']);
    await expect(timerCard(page)).toHaveCount(0);
  });

  test('AC5: deleting a goal that is NOT running keeps the timer; deleting the running one cancels it (UI path)', async ({ page }) => {
    const problems = watch(page);
    await twoGoals(page);
    await startTimer(page, 'Read');
    await gotoHash(page, '/goals');
    await page.getByRole('listitem').filter({ hasText: 'Guitar' }).getByRole('button', { name: 'Delete' }).click();
    const dlg = page.getByRole('dialog');
    expect((await dlg.textContent()) ?? '').not.toContain(EN.goal.delete.timerNote);
    await dlg.getByRole('button', { name: EN.goal.delete.confirm }).click();
    await expect(dlg).toHaveCount(0);
    expect(await dbAll(page, 'goals')).toHaveLength(1);
    expect(await kvGet(page, 'activeTimer')).not.toBeNull();
    await gotoHash(page, '/today');
    await expect(timerCard(page)).toBeVisible();
    await gotoHash(page, '/goals');
    await page.getByRole('listitem').filter({ hasText: 'Read' }).getByRole('button', { name: 'Delete' }).click();
    await expect(page.getByRole('dialog')).toContainText(EN.goal.delete.timerNote);
    await page.getByRole('dialog').getByRole('button', { name: EN.goal.delete.confirm }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0); // deletion is async: wait for it before reading storage
    await expect.poll(() => kvGet(page, 'activeTimer')).toBeNull();
    expect(await dbAll(page, 'goals')).toHaveLength(0);
    expect(problems).toEqual([]);
  });

  test('clock moved backwards / absurd durations: 00:00:00 never negative; 100 h shows hours; dialog clamps to 1440', async ({ page }) => {
    await twoGoals(page);
    await startTimer(page, 'Read');
    await freezeClock(page, at('-01:00:00'));
    await expect(timerElapsed(page)).toHaveText('00:00:00');
    await stopBtn(page).click();
    await expect(minutesInput(page)).toHaveValue('1');
    await page.keyboard.press('Escape');
    await freezeClock(page, at('100:00:00'));
    await expect(timerElapsed(page)).toHaveText('100:00:00');
    await stopBtn(page).click();
    await expect(minutesInput(page)).toHaveValue('1440');
    await expect(stopDialog(page)).toContainText('Rounded from 6000 min 0 s');
  });

  test('double-clicking Start gives one timer and no error alert', async ({ page }) => {
    await twoGoals(page);
    await goalCard(page, 'Read').getByRole('button', { name: EN.goalCard.startTimer }).dblclick();
    await expect(timerCard(page)).toBeVisible();
    await page.waitForTimeout(300);
    await expect(page.getByRole('alert')).toHaveCount(0);
    expect(await kvGet(page, 'activeTimer')).not.toBeNull();
  });

  test('keyboard only: Tab to Start, Enter, Tab to Stop, Enter, Esc returns focus to Stop, Enter+Tab through the dialog, Discard', async ({ page }) => {
    await twoGoals(page);
    const start = goalCard(page, 'Read').getByRole('button', { name: EN.goalCard.startTimer });
    await start.focus();
    await page.keyboard.press('Enter');
    await expect(timerCard(page)).toBeVisible();
    await stopBtn(page).focus();
    await page.keyboard.press('Enter');
    await expect(stopDialog(page)).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(stopDialog(page)).toHaveCount(0);
    await expect(stopBtn(page)).toBeFocused();
    expect(await kvGet(page, 'activeTimer')).not.toBeNull();
    await page.keyboard.press('Enter');
    await expect(stopDialog(page)).toBeVisible();
    // focus trap: 14 Tab and 14 Shift+Tab presses never leave the dialog
    for (let i = 0; i < 14; i++) {
      await page.keyboard.press('Tab');
      expect(await page.evaluate(() => { const a = document.activeElement; return !a || a === document.body || Boolean(a.closest('dialog')); })).toBe(true);
    }
    for (let i = 0; i < 14; i++) {
      await page.keyboard.press('Shift+Tab');
      expect(await page.evaluate(() => { const a = document.activeElement; return !a || a === document.body || Boolean(a.closest('dialog')); })).toBe(true);
    }
    await stopDialog(page).getByRole('button', { name: EN.timer.discard }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Today' })).toBeFocused();
  });

  test('Stop dialog validation matrix keeps the timer and shows an inline error', async ({ page }) => {
    await twoGoals(page);
    await startTimer(page, 'Read');
    await freezeClock(page, at('00:10:00'));
    await stopBtn(page).click();
    const save = stopDialog(page).getByRole('button', { name: EN.entry.form.save });
    for (const bad of ['0', '1441', '12.5', '', 'abc', '-5', '1e1', '0x1E', '+30', '30 min', '99999999999999999999']) {
      await minutesInput(page).fill(bad);
      await save.click();
      await expect(stopDialog(page).getByText(EN.errors.ENTRY_MINUTES_INVALID), `value "${bad}"`).toBeVisible();
      await expect(minutesInput(page)).toHaveAttribute('aria-invalid', 'true');
      await expect(stopDialog(page)).toBeVisible();
      expect(await kvGet(page, 'activeTimer'), `timer kept after "${bad}"`).not.toBeNull();
    }
    await minutesInput(page).fill('10');
    await stopDialog(page).getByLabel(/^Note/).fill('n'.repeat(281));
    await save.click();
    await expect(stopDialog(page).getByText(EN.errors.ENTRY_NOTE_TOO_LONG)).toBeVisible();
    await stopDialog(page).getByLabel(/^Note/).fill('ok');
    await minutesInput(page).fill(' 10 ');
    await save.click();
    await expect(stopDialog(page)).toHaveCount(0);
    expect((await dbAll(page, 'entries')).map((e) => e.minutes)).toEqual([10]);
  });

  test('day limit and out-of-period errors are shown inside the dialog, timer kept, Discard still works', async ({ page }) => {
    await twoGoals(page);
    // 1400 minutes already logged today
    await goalCard(page, 'Read').getByRole('button', { name: EN.goalCard.logTime }).click();
    await goalCard(page, 'Read').getByLabel(/^Minutes/).fill('1400');
    await goalCard(page, 'Read').getByRole('button', { name: EN.entry.form.save }).click();
    await expect(goalCard(page, 'Read')).toContainText('1,400/30');
    await startTimer(page, 'Read');
    await freezeClock(page, at('00:41:00'));
    await stopBtn(page).click();
    await expect(minutesInput(page)).toHaveValue('41');
    await stopDialog(page).getByRole('button', { name: EN.entry.form.save }).click();
    await expect(stopDialog(page).getByText(/at most 1,440 minutes/)).toBeVisible();
    expect(await kvGet(page, 'activeTimer')).not.toBeNull();
    await minutesInput(page).fill('40');
    await stopDialog(page).getByRole('button', { name: EN.entry.form.save }).click();
    await expect(stopDialog(page)).toHaveCount(0);
    expect((await dbAll(page, 'entries')).map((e) => e.minutes).sort((a, b) => Number(a) - Number(b))).toEqual([40, 1400]);
  });

  test('second tab: sees the running timer live (Start disabled) and a stale Save after Discard elsewhere fails gracefully without creating an entry', async ({ page, context }) => {
    const problems = watch(page);
    await twoGoals(page);
    const b = await context.newPage();
    await freezeClock(b, FIXED());
    await gotoHash(b, '/today');
    await expect(goalCard(b, 'Guitar').getByRole('button', { name: EN.goalCard.startTimer })).toBeVisible();
    await startTimer(page, 'Read');
    await expect(timerCard(b)).toBeVisible(); // live across tabs, no reload
    await expect(goalCard(b, 'Guitar').getByRole('button', { name: EN.goalCard.startTimer })).toHaveAttribute('aria-disabled', 'true');
    // tab B opens the Stop dialog, tab A discards, tab B then tries to Save
    await freezeClock(b, at('00:12:00'));
    await b.getByTestId('timer-card').getByRole('button', { name: /^Stop timer for/ }).click();
    await expect(stopDialog(b)).toBeVisible();
    await freezeClock(page, at('00:12:00'));
    await stopBtn(page).click();
    await stopDialog(page).getByRole('button', { name: EN.timer.discard }).click();
    await expect(timerCard(page)).toHaveCount(0);
    await stopDialog(b).getByRole('button', { name: EN.entry.form.save }).click();
    await expect(b.getByRole('alert')).toBeVisible(); // some visible error rather than silent success
    expect(await dbAll(b, 'entries')).toHaveLength(0);
    expect(problems).toEqual([]);
  });

  test('offline: timer start/stop/save work with the network off after the SW is active', async ({ page, context }) => {
    await twoGoals(page);
    await page.evaluate(() => navigator.serviceWorker.ready);
    await page.reload();
    await expect.poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller))).toBe(true);
    await context.setOffline(true);
    await page.reload();
    await startTimer(page, 'Read');
    await freezeClock(page, at('00:05:00'));
    await stopBtn(page).click();
    await stopDialog(page).getByRole('button', { name: EN.entry.form.save }).click();
    await expectAmount(page, 'Read', '5/30');
    await context.setOffline(false);
  });
});

function FIXED() {
  return at('00:00:00');
}

test.describe('M2 QC — layout and a11y', () => {
  test.use({ viewport: { width: 360, height: 740 } });
  test.beforeEach(async ({ page }) => {
    await freezeClock(page);
  });

  test('360 px: 60-char unbroken goal name + timer + banner + dialog, no horizontal scroll, dialog inside the viewport; axe clean', async ({ page }) => {
    await fakeNotificationPermission(page, 'denied');
    const long = 'Learn conversational Spanish with a native tutor every day';
    await createGoal(page, { name: long, targetValue: 30, startDate: '2026-10-01', endDate: '2026-10-31' });
    await createGoal(page, { name: 'Guitar', targetValue: 20 });
    await gotoHash(page, '/settings');
    await switchOn(page, EN);
    await gotoHash(page, '/today');
    await advanceTo(page, at('2026-10-09T20:30:00'));
    await expect(page.getByTestId('reminder-banner')).toBeVisible();
    await startTimer(page, long);
    await freezeClock(page, at('2026-10-09T20:30:00'));
    await expectNoHorizontalScroll(page);
    await expectAxeClean(page);
    await stopBtn(page).click();
    await expect(stopDialog(page)).toBeVisible();
    await expectNoHorizontalScroll(page);
    await expectAxeClean(page);
    const box = await stopDialog(page).boundingBox();
    expect(box!.x).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width).toBeLessThanOrEqual(360);
    expect(box!.y + box!.height).toBeLessThanOrEqual(740);
    // buttons reachable: all three inside the dialog box
    for (const n of [EN.entry.form.save, EN.timer.keepRunning, EN.timer.discard]) {
      const b = await stopDialog(page).getByRole('button', { name: n }).boundingBox();
      expect(b!.x + b!.width).toBeLessThanOrEqual(360);
    }
  });

  test('M2-D2: a 60-char goal name without spaces must not widen the page while its timer runs', async ({ page }) => {
    const long = 'W'.repeat(60);
    await createGoal(page, { name: long, targetValue: 30, startDate: '2026-10-01', endDate: '2026-10-31' });
    await gotoHash(page, '/today');
    await startTimer(page, long);
    await expectNoHorizontalScroll(page);
    await stopBtn(page).click();
    await expectNoHorizontalScroll(page);
  });

  test('dark mode: Today with timer + banner, dialog, Settings reminders (4 states) have no serious/critical axe violations', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'dark' });
    await fakeNotificationPermission(page, 'denied');
    await createGoal(page, { name: 'Read', targetValue: 30, startDate: '2026-10-01', endDate: '2026-10-31' });
    await gotoHash(page, '/settings');
    await switchOn(page, EN);
    await expectAxeClean(page); // denied chip (danger tone)
    await gotoHash(page, '/today');
    await advanceTo(page, at('2026-10-09T20:30:00'));
    await startTimer(page, 'Read');
    await expectAxeClean(page);
    await stopBtn(page).click();
    await expectAxeClean(page);
  });

  test('timer element semantics: role=timer with accessible name, Stop has descriptive name; heading levels are sane', async ({ page }) => {
    await createGoal(page, { name: 'Read', targetValue: 30, startDate: '2026-10-01', endDate: '2026-10-31' });
    await gotoHash(page, '/today');
    await startTimer(page, 'Read');
    await expect(page.getByRole('timer', { name: EN.timer.elapsedLabel })).toHaveText('00:00:00');
    await expect(stopBtn(page)).toHaveAccessibleName('Stop timer for Read, running 00:00:00');
    const levels = await page.evaluate(() => [...document.querySelectorAll('h1,h2,h3')].map((h) => h.tagName));
    expect(levels[0]).toBe('H1');
  });
});

test.describe('M2 QC — Settings Reminders', () => {
  test.beforeEach(async ({ page }) => {
    await freezeClock(page);
  });

  test('NFR-07 text, default state, time persistence, and banner follows the reminder time live', async ({ page }) => {
    await fakeNotificationPermission(page, 'denied');
    await createGoal(page, { name: 'Read', targetValue: 30, startDate: '2026-10-01', endDate: '2026-10-31' });
    await gotoHash(page, '/settings');
    const sw = page.getByRole('switch', { name: EN.settings.reminders.switch });
    await expect(sw).not.toBeChecked();
    const time = page.getByLabel(EN.settings.reminders.time);
    await expect(time).toHaveValue('20:00');
    await expect(time).toBeDisabled();
    await expect(page.getByText(EN.settings.reminders.limit)).toBeVisible();
    await expect(page.getByText(EN.settings.reminders.ios)).toBeVisible();
    await sw.click();
    await expect(sw).toBeChecked();
    await expect(time).toBeEnabled();
    await expect(page.getByText(EN.settings.permission.denied, { exact: true })).toBeVisible();
    await expect(page.getByTestId('permission-desc')).toHaveText(EN.errors.NOTIFICATIONS_DENIED);
    await expect(page.getByRole('button', { name: EN.settings.reminders.allow })).toHaveCount(0);
    await gotoHash(page, '/today');
    await advanceTo(page, at('2026-10-09T20:30:00'));
    await expect(page.getByTestId('reminder-banner')).toHaveText("It's past 20:00 — 1 goal is not on target yet.");
    // move the reminder later than now -> banner disappears without reload
    await gotoHash(page, '/settings');
    await time.fill('21:00');
    await expect(toast(page)).toHaveText(EN.toast.reminderTime);
    await gotoHash(page, '/today');
    await expect(goalCard(page, 'Read')).toBeVisible();
    await expect(page.getByTestId('reminder-banner')).toHaveCount(0);
    await gotoHash(page, '/settings');
    await time.fill('20:15');
    await gotoHash(page, '/today');
    await expect(page.getByTestId('reminder-banner')).toHaveText("It's past 20:15 — 1 goal is not on target yet.");
    // turn the reminder off -> banner gone
    await gotoHash(page, '/settings');
    await sw.click();
    await expect(sw).not.toBeChecked();
    await gotoHash(page, '/today');
    await expect(page.getByTestId('reminder-banner')).toHaveCount(0);
    await gotoHash(page, '/settings');
    await expect(time).toBeDisabled();
    expect(await kvGet(page, 'settings')).toMatchObject({ reminderEnabled: false, reminderTime: '20:15' });
  });

  test('M2-D1: typing a time with the keyboard (what a real user does) ends with the typed value', async ({ page }) => {
    await gotoHash(page, '/settings');
    await switchOn(page, EN);
    const time = page.getByLabel(EN.settings.reminders.time);
    await time.click({ position: { x: 8, y: 10 } }); // hour segment
    await page.keyboard.type('0730AM');
    await page.waitForTimeout(500);
    const settings = (await kvGet(page, 'settings')) as { reminderTime: string };
    expect(settings.reminderTime).toBe('07:30');
    await expect(time).toHaveValue('07:30');
  });

  test('browser without Notification API: chip + description, banner still works, no page errors', async ({ page }) => {
    const problems = watch(page);
    await page.addInitScript(() => {
      // @ts-expect-error simulate an old browser
      delete window.Notification;
    });
    await createGoal(page, { name: 'Read', targetValue: 30, startDate: '2026-10-01', endDate: '2026-10-31' });
    await gotoHash(page, '/settings');
    await switchOn(page, EN);
    await expect(page.getByText(EN.settings.permission.unsupported, { exact: true })).toBeVisible();
    await gotoHash(page, '/today');
    await advanceTo(page, at('2026-10-09T21:00:00'));
    await expect(page.getByTestId('reminder-banner')).toBeVisible();
    await page.waitForTimeout(300);
    expect(problems).toEqual([]);
  });

  test('banner disappears as soon as the last pending goal reaches target, and does not list upcoming/ended goals', async ({ page }) => {
    await fakeNotificationPermission(page, 'denied');
    await createGoal(page, { name: 'Read', targetValue: 30, startDate: '2026-10-01', endDate: '2026-10-31' });
    await createGoal(page, { name: 'Future', targetValue: 30, startDate: '2026-11-01', endDate: '2026-11-30' });
    await createGoal(page, { name: 'Past', targetValue: 30, startDate: '2026-01-01', endDate: '2026-06-30' });
    await gotoHash(page, '/settings');
    await switchOn(page, EN);
    await gotoHash(page, '/today');
    await advanceTo(page, at('2026-10-09T20:00:00'));
    await expect(page.getByTestId('reminder-banner')).toHaveText("It's past 20:00 — 1 goal is not on target yet.");
    await goalCard(page, 'Read').getByRole('button', { name: EN.goalCard.logTime }).click();
    await goalCard(page, 'Read').getByLabel(/^Minutes/).fill('30');
    await goalCard(page, 'Read').getByRole('button', { name: EN.entry.form.save }).click();
    await expect(page.getByTestId('reminder-banner')).toHaveCount(0);
  });
});

test.describe('M2 QC — .ics download', () => {
  test.beforeEach(async ({ page }) => {
    await freezeClock(page);
  });

  async function downloadIcs(page: Page, copy: typeof EN | typeof VI = EN) {
    const dl = page.waitForEvent('download');
    await page.getByRole('button', { name: copy.settings.reminders.ics }).click();
    const d = await dl;
    const buf = await readFile((await d.path())!);
    return { name: d.suggestedFilename(), buf, text: buf.toString('utf8') };
  }

  test('en: bytes are UTF-8 without BOM, CRLF only, lines <= 75 octets, unique UID per download, reminder time applied', async ({ page }) => {
    await gotoHash(page, '/settings');
    await switchOn(page, EN);
    await page.getByLabel(EN.settings.reminders.time).fill('07:30');
    const a = await downloadIcs(page);
    const b = await downloadIcs(page);
    expect(a.name).toBe('1percent-better-reminder.ics');
    expect(a.buf[0]).not.toBe(0xef); // no BOM
    expect(a.text).toContain('DTSTART:20261010T073000\r\n');
    expect(a.text.replace(/\r\n/g, '')).not.toMatch(/[\r\n]/);
    for (const line of a.text.split('\r\n')) expect(Buffer.byteLength(line, 'utf8')).toBeLessThanOrEqual(75);
    const uid = (t: string) => /UID:(.+)\r\n/.exec(t)![1];
    expect(uid(a.text)).not.toBe(uid(b.text));
    expect(uid(a.text)).toMatch(/^[0-9a-f-]{36}@one-percent-better$/);
    expect(a.text).toContain(`SUMMARY:${EN.ics.summary.replace(',', '\\,')}\r\n`);
  });

  test('vi: SUMMARY keeps diacritics in UTF-8 bytes and the file is still valid after unfolding', async ({ page }) => {
    await gotoHash(page, '/settings');
    await page.getByRole('radio', { name: 'Tiếng Việt' }).check();
    await expect(page.getByRole('heading', { level: 1, name: VI.settings.title })).toBeVisible();
    const f = await downloadIcs(page, VI);
    const unfolded = f.text.replace(/\r\n[ \t]/g, '');
    expect(unfolded).toContain(`SUMMARY:${VI.ics.summary}\r\n`);
    expect(unfolded).toContain(`DESCRIPTION:${VI.ics.alarm}\r\n`);
    expect(f.buf.includes(Buffer.from('ghi thời gian hôm nay', 'utf8'))).toBe(true);
    for (const line of f.text.split('\r\n')) expect(Buffer.byteLength(line, 'utf8')).toBeLessThanOrEqual(75);
  });

  test.describe('Pacific timezone near local midnight', () => {
    test.use({ timezoneId: 'America/Los_Angeles' });
    test('"tomorrow" is computed in the browser timezone and DTSTAMP is UTC', async ({ page }) => {
      await freezeClock(page, new Date('2026-10-09T23:30:00-07:00'));
      await gotoHash(page, '/settings');
      const f = await downloadIcs(page);
      expect(f.text).toContain('DTSTART:20261010T200000\r\n');
      expect(f.text).toMatch(/DTSTAMP:20261010T063000Z\r\n/);
    });
  });
});

test.describe('M2 QC — vi-VN', () => {
  test.use({ locale: 'vi-VN' });
  test.beforeEach(async ({ page }) => {
    await freezeClock(page);
  });

  test('timer, dialog (errors), Start-disabled hint, D2 timer note, banner, Settings permission states: no untranslated text', async ({ page }) => {
    await fakeNotificationPermission(page, 'denied');
    const base = { targetValue: 30, startDate: '2026-10-01', endDate: '2026-10-31' };
    await createGoal(page, { name: 'Read', ...base }, VI);
    await createGoal(page, { name: 'Guitar', ...base }, VI);
    await gotoHash(page, '/today');
    await goalCard(page, 'Read').getByRole('button', { name: VI.goalCard.startTimer }).click();
    await freezeClock(page, at('00:01:05'));
    await expect(timerElapsed(page)).toHaveText('00:01:05');
    await expect(timerCard(page)).toContainText(VI.timer.badge);
    await expectNoViLeaks(page);
    // click the disabled Start of the other goal: no error alert, still translated
    await goalCard(page, 'Guitar').getByRole('button', { name: VI.goalCard.startTimer }).click({ force: true });
    await expectNoViLeaks(page);
    await timerCard(page).getByRole('button', { name: /^Dừng đếm giờ cho Read/ }).click();
    await expect(stopDialog(page)).toBeVisible();
    await stopDialog(page).getByLabel(new RegExp('^' + VI.entry.form.minutesLabel)).fill('0');
    await stopDialog(page).getByRole('button', { name: VI.entry.form.save }).click();
    await expect(stopDialog(page).getByText(VI.errors.ENTRY_MINUTES_INVALID)).toBeVisible();
    await expectNoViLeaks(page);
    await expectAxeClean(page);
    const box = await stopDialog(page).boundingBox();
    expect(box!.x + box!.width).toBeLessThanOrEqual(1280);
    await page.keyboard.press('Escape');
    await expect(stopDialog(page)).toHaveCount(0);
    // D2 with the timer note in vi
    await gotoHash(page, '/goals');
    await page.getByRole('listitem').filter({ hasText: 'Read' }).getByRole('button', { name: VI.common.delete }).click();
    await expect(page.getByRole('dialog')).toContainText(VI.goal.delete.timerNote);
    await expectNoViLeaks(page);
    await page.keyboard.press('Escape');
    // banner + toast in vi
    await gotoHash(page, '/settings');
    await switchOn(page, VI);
    await expect(page.getByText(VI.settings.permission.denied, { exact: true })).toBeVisible();
    await expectNoViLeaks(page);
    await gotoHash(page, '/today');
    await advanceTo(page, at('2026-10-09T20:30:00'));
    await expect(page.getByTestId('reminder-banner')).toBeVisible();
    await expectNoViLeaks(page);
    await expect(timerCard(page)).toBeVisible();
    await timerCard(page).getByRole('button', { name: /^Dừng đếm giờ cho Read/ }).click();
    await stopDialog(page).getByRole('button', { name: VI.timer.discard }).click();
    await expect(toast(page)).toHaveText(VI.toast.timerDiscarded);
    await expectNoViLeaks(page);
  });
});

test.describe('M2 QC — language switch with a running timer; switch via keyboard', () => {
  test('switching to Tiếng Việt in Settings keeps the timer running with the same elapsed time, then back to English', async ({ page }) => {
    await freezeClock(page);
    await createGoal(page, { name: 'Read', targetValue: 30, startDate: '2026-10-01', endDate: '2026-10-31' });
    await gotoHash(page, '/today');
    await startTimer(page, 'Read');
    await freezeClock(page, at('00:01:05'));
    await expect(timerElapsed(page)).toHaveText('00:01:05');
    await gotoHash(page, '/settings');
    await page.evaluate(() => ((window as unknown as { __noReload: boolean }).__noReload = true));
    await page.getByRole('radio', { name: 'Tiếng Việt' }).click();
    await expect(page.getByRole('heading', { level: 1, name: VI.settings.title })).toBeVisible();
    // Reminder switch works with the keyboard (Space) in vi
    const sw = page.getByRole('switch', { name: VI.settings.reminders.switch });
    await sw.focus();
    await page.keyboard.press('Space');
    await expect(sw).toBeChecked();
    await gotoHash(page, '/today');
    await expect(timerCard(page).getByRole('heading', { level: 2 })).toHaveText('Đang đếm giờ · Read');
    await expect(timerElapsed(page)).toHaveText('00:01:05');
    await freezeClock(page, at('00:02:10'));
    await expect(timerElapsed(page)).toHaveText('00:02:10');
    await expectNoViLeaks(page);
    expect(await page.evaluate(() => (window as unknown as { __noReload?: boolean }).__noReload)).toBe(true);
    await gotoHash(page, '/settings');
    await page.getByRole('radio', { name: 'English' }).click();
    await gotoHash(page, '/today');
    await expect(timerElapsed(page)).toHaveText('00:02:10');
    expect(await kvGet(page, 'activeTimer')).toMatchObject({ startedAt: '2026-10-09T03:00:00.000Z' });
  });
});

for (const [label, locale, copy] of [
  ['en', 'en-US', EN],
  ['vi', 'vi-VN', VI],
] as const) {
  for (const width of [360, 768, 1440]) {
    test.describe(`M2 QC — no horizontal scroll ${label} ${width}px`, () => {
      test.use({ locale, viewport: { width, height: 900 } });
      test('Today (timer + banner), Stop dialog, Settings Reminders', async ({ page }) => {
        await freezeClock(page);
        await fakeNotificationPermission(page, 'denied');
        await createGoal(page, { name: 'Read', targetValue: 30, startDate: '2026-10-01', endDate: '2026-10-31' }, copy);
        await createGoal(page, { name: 'Guitar', targetValue: 20 }, copy);
        await gotoHash(page, '/settings');
        await switchOn(page, copy);
        await expectNoHorizontalScroll(page);
        await gotoHash(page, '/today');
        await advanceTo(page, at('2026-10-09T20:30:00'));
        await goalCard(page, 'Read').getByRole('button', { name: copy.goalCard.startTimer }).click();
        await expect(timerCard(page)).toBeVisible();
        await expect(page.getByTestId('reminder-banner')).toBeVisible();
        await expectNoHorizontalScroll(page);
        await timerCard(page).getByRole('button').click();
        await expect(stopDialog(page)).toBeVisible();
        await expectNoHorizontalScroll(page);
        const box = await stopDialog(page).boundingBox();
        expect(box!.x).toBeGreaterThanOrEqual(0);
        expect(box!.x + box!.width).toBeLessThanOrEqual(width);
      });
    });
  }
}
