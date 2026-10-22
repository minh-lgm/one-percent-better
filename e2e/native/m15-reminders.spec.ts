// M15-AC3/AC4/AC5 end to end in Chromium with an emulated iOS bridge (the same technique as QC's iOS emulation):
// `window.Capacitor` + `webkit.messageHandlers.bridge` make the native build run its iOS adapters; the fake
// LocalNotifications plugin records every call. Checks: the schedule written at startup / on toggle / on time change,
// the ids 1000 … 1013, `extra.url`, permission prompt once, cancel on switch-off, the native Reminders card (3 states,
// iOS Settings guidance, no .ics), vi scan, axe, 360 px, About links.
import { expect, test, type Page } from '@playwright/test';
import { EN, expectAxeClean, expectNoHorizontalScroll, expectNoViLeaks, freezeClock, VI } from '../helpers/app';

interface Recorded {
  calls: Array<{ method: string; options: unknown }>;
  pending: Array<{ id: number; title: string; body: string; schedule?: { at?: string }; extra?: { url?: string } }>;
  permission: 'prompt' | 'granted' | 'denied';
  requestAnswer: 'granted' | 'denied';
}

declare global {
  interface Window {
    __m15: Recorded;
  }
}

async function emulateIos(page: Page, permission: Recorded['permission'] = 'prompt', requestAnswer: Recorded['requestAnswer'] = 'granted') {
  await page.addInitScript(
    ({ permission, requestAnswer }) => {
      const w = window as unknown as Record<string, unknown>;
      const rec: Recorded = { calls: [], pending: [], permission, requestAnswer };
      (window as unknown as { __m15: Recorded }).__m15 = rec;
      w.webkit = { messageHandlers: { bridge: { postMessage() {} } } };
      let nextId = 1;
      const plugins = [
        { name: 'StatusBar', methods: [{ name: 'setStyle', rtype: 'promise' }] },
        { name: 'SplashScreen', methods: [{ name: 'hide', rtype: 'promise' }] },
        { name: 'App', methods: [{ name: 'addListener', rtype: 'callback' }, { name: 'removeListener', rtype: 'promise' }] },
        { name: 'Keyboard', methods: [{ name: 'addListener', rtype: 'callback' }, { name: 'removeListener', rtype: 'promise' }] },
        { name: 'SocialLogin', methods: [{ name: 'initialize', rtype: 'promise' }, { name: 'login', rtype: 'promise' }, { name: 'logout', rtype: 'promise' }] },
        {
          name: 'LocalNotifications',
          methods: [
            { name: 'checkPermissions', rtype: 'promise' },
            { name: 'requestPermissions', rtype: 'promise' },
            { name: 'getPending', rtype: 'promise' },
            { name: 'cancel', rtype: 'promise' },
            { name: 'schedule', rtype: 'promise' },
            { name: 'addListener', rtype: 'callback' },
            { name: 'removeListener', rtype: 'promise' },
          ],
        },
      ];
      w.Capacitor = {
        PluginHeaders: plugins,
        async nativePromise(plugin: string, method: string, options: Record<string, unknown>) {
          if (plugin !== 'LocalNotifications') return {};
          rec.calls.push({ method, options: JSON.parse(JSON.stringify(options ?? null)) });
          switch (method) {
            case 'checkPermissions':
              return { display: rec.permission };
            case 'requestPermissions':
              rec.permission = rec.requestAnswer;
              return { display: rec.permission };
            case 'getPending':
              return { notifications: rec.pending.map((n) => ({ ...n })) };
            case 'cancel': {
              const ids = new Set(((options as { notifications: Array<{ id: number }> }).notifications ?? []).map((n) => n.id));
              rec.pending = rec.pending.filter((n) => !ids.has(n.id));
              return {};
            }
            case 'schedule': {
              const list = (options as { notifications: Recorded['pending'] }).notifications ?? [];
              rec.pending.push(...JSON.parse(JSON.stringify(list)));
              return { notifications: list.map((n) => ({ id: n.id })) };
            }
            default:
              return {};
          }
        },
        nativeCallback() {
          return nextId++;
        },
      };
    },
    { permission, requestAnswer },
  );
}

const rec = (page: Page) => page.evaluate(() => window.__m15);
const calls = async (page: Page, method: string) => (await rec(page)).calls.filter((c) => c.method === method);
const remindersCard = (page: Page, copy: typeof EN | typeof VI = EN) => page.locator('section', { has: page.getByRole('heading', { level: 2, name: copy.settings.reminders.title }) });

test.beforeEach(async ({ page }) => {
  await freezeClock(page, new Date('2026-10-09T10:00:00+07:00'));
});

test.describe('M15 reminders on the emulated iOS runtime', () => {
  test('permission prompt: Reminders card shows "Not asked yet" + Allow; turning on asks once, then 14 notifications 1000 … 1013 at 20:00 with extra.url #/today; changing the time reschedules; off cancels', async ({ page }) => {
    await emulateIos(page, 'prompt', 'granted');
    await page.goto('/#/goals/new');
    await page.getByLabel(new RegExp(`^${EN.goal.form.nameLabel}`)).fill('Read');
    await page.getByRole('textbox', { name: new RegExp(`^${EN.goal.form.targetDaily}`) }).fill('30');
    await page.getByRole('button', { name: EN.goal.form.save }).click();
    await expect(page.getByRole('heading', { level: 1, name: EN.goals.title })).toBeVisible();

    await page.goto('/#/settings');
    const card = remindersCard(page);
    await expect(card.getByText(EN.settings.permission.default)).toBeVisible();
    await expect(page.getByTestId('permission-desc')).toHaveText(EN.settings.permission.nativeDefaultDesc);
    await expect(card.getByRole('button', { name: EN.settings.reminders.allow })).toBeVisible();
    await expect(page.getByTestId('reminders-native-info')).toHaveText(EN.settings.reminders.nativeInfo);
    await expect(card.getByText(EN.settings.reminders.limit)).toHaveCount(0);
    await expect(card.getByRole('button', { name: EN.settings.reminders.ics })).toHaveCount(0);
    await expect(page.getByText(EN.settings.permission.unsupported)).toHaveCount(0);
    // Reminders off at startup → nothing scheduled, nothing asked (A-64).
    expect(await calls(page, 'requestPermissions')).toHaveLength(0);
    expect(await calls(page, 'schedule')).toHaveLength(0);

    await page.getByRole('switch', { name: EN.settings.reminders.switch }).click();
    await expect(card.getByText(EN.settings.permission.granted)).toBeVisible();
    await expect(page.getByTestId('permission-desc')).toHaveText(EN.settings.permission.nativeGrantedDesc);
    await expect.poll(async () => (await rec(page)).pending.length, { timeout: 15_000 }).toBe(14);
    expect(await calls(page, 'requestPermissions')).toHaveLength(1);
    const pending = (await rec(page)).pending;
    expect(pending.map((n) => n.id)).toEqual(Array.from({ length: 14 }, (_, i) => 1000 + i));
    expect(pending.every((n) => n.extra?.url === '#/today')).toBe(true);
    expect(pending.every((n) => n.title === EN.notification.nativeTitle && n.body === EN.notification.nativeBody)).toBe(true);
    // Dates are serialised by the bridge; the first one is today 20:00 local (+07:00 = 13:00Z).
    expect(pending[0].schedule?.at).toBe('2026-10-09T13:00:00.000Z');
    expect(pending[13].schedule?.at).toBe('2026-10-22T13:00:00.000Z');

    // Reminder time → 07:30: the plan is rebuilt (today 10:00 is past 07:30 → from tomorrow, 13 items).
    await page.getByLabel(EN.settings.reminders.time).fill('07:30');
    await page.getByLabel(EN.settings.reminders.time).blur();
    await expect.poll(async () => (await rec(page)).pending[0]?.schedule?.at, { timeout: 15_000 }).toBe('2026-10-10T00:30:00.000Z');
    expect((await rec(page)).pending).toHaveLength(13);
    expect((await rec(page)).pending.map((n) => n.id)).toEqual(Array.from({ length: 13 }, (_, i) => 1000 + i));
    // The previous 14 were cancelled by id (getPending → cancel) before the new schedule was written (the time field may
    // commit twice — settle + blur — so there can be a second, coalesced replan; the first cancel is the one that matters).
    const cancels = await calls(page, 'cancel');
    expect(cancels.length).toBeGreaterThanOrEqual(1);
    expect(((cancels[0].options as { notifications: Array<{ id: number }> }).notifications ?? []).map((n) => n.id)).toEqual(Array.from({ length: 14 }, (_, i) => 1000 + i));

    // Off → the pending plan is cancelled, nothing re-scheduled.
    await page.getByRole('switch', { name: EN.settings.reminders.switch }).click();
    await expect.poll(async () => (await rec(page)).pending.length, { timeout: 15_000 }).toBe(0);

    await expectAxeClean(page);
    await page.setViewportSize({ width: 360, height: 740 });
    await expectNoHorizontalScroll(page);
    await expectAxeClean(page);
  });

  test('permission denied: "Blocked" + the iOS Settings guidance, no Allow button, nothing scheduled even with reminders on; About has Privacy + Support opened outside the app', async ({ page }) => {
    await emulateIos(page, 'denied');
    await page.goto('/#/settings');
    await page.getByRole('switch', { name: EN.settings.reminders.switch }).click();
    const card = remindersCard(page);
    await expect(card.getByText(EN.settings.permission.denied)).toBeVisible();
    await expect(page.getByTestId('permission-desc')).toHaveText(EN.settings.permission.nativeDeniedDesc);
    await expect(card.getByRole('button', { name: EN.settings.reminders.allow })).toHaveCount(0);
    await page.waitForTimeout(500);
    expect(await calls(page, 'schedule')).toHaveLength(0);
    expect(await calls(page, 'requestPermissions')).toHaveLength(0);

    const support = page.getByTestId('support-link');
    await expect(support).toHaveAttribute('href', 'https://minh-lgm.github.io/one-percent-better/support.html');
    await expect(support).toHaveAttribute('target', '_blank');
    await expect(page.getByTestId('privacy-link')).toHaveAttribute('href', 'https://minh-lgm.github.io/one-percent-better/privacy.html');
    await expectAxeClean(page);
  });

  test('reminder already on (as if synced) with permission granted: the schedule is written at startup; resume after midnight rebuilds it', async ({ page }) => {
    await emulateIos(page, 'granted');
    await page.goto('/#/goals/new');
    await page.getByLabel(new RegExp(`^${EN.goal.form.nameLabel}`)).fill('Read');
    await page.getByRole('textbox', { name: new RegExp(`^${EN.goal.form.targetDaily}`) }).fill('30');
    await page.getByRole('button', { name: EN.goal.form.save }).click();
    await page.goto('/#/settings');
    await page.getByRole('switch', { name: EN.settings.reminders.switch }).click();
    await expect.poll(async () => (await rec(page)).pending.length, { timeout: 15_000 }).toBe(14);
    expect(await calls(page, 'requestPermissions')).toHaveLength(0); // already granted: never asked

    // Cold start the next day: the window moves (startup replan).
    await freezeClock(page, new Date('2026-10-10T08:00:00+07:00'));
    await page.reload();
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await expect.poll(async () => (await rec(page)).pending[0]?.schedule?.at, { timeout: 15_000 }).toBe('2026-10-10T13:00:00.000Z');
    expect((await rec(page)).pending).toHaveLength(14);
    expect((await rec(page)).pending.map((n) => n.id)).toEqual(Array.from({ length: 14 }, (_, i) => 1000 + i));
    // (The fake plugin state lives in the page, so a reload starts with nothing pending; the cancel-before-schedule
    // path is asserted in the first test, where the time change replaces a live schedule.)
  });

  test('vi: native Reminders copy verbatim, no English leaks, axe clean at 360 px', async ({ browser }) => {
    const context = await browser.newContext({ locale: 'vi-VN', timezoneId: 'Asia/Ho_Chi_Minh', viewport: { width: 360, height: 740 } });
    const page = await context.newPage();
    await freezeClock(page, new Date('2026-10-09T10:00:00+07:00'));
    await emulateIos(page, 'denied');
    await page.goto('/#/settings');
    const card = remindersCard(page, VI);
    await expect(card.getByText(VI.settings.permission.denied)).toBeVisible();
    await expect(page.getByTestId('permission-desc')).toHaveText(VI.settings.permission.nativeDeniedDesc);
    await expect(page.getByTestId('reminders-native-info')).toHaveText(VI.settings.reminders.nativeInfo);
    await expect(page.getByRole('switch', { name: VI.settings.reminders.switch })).toHaveAccessibleDescription(VI.settings.reminders.nativeSwitchDesc);
    await expect(page.getByTestId('support-link')).toContainText(VI.settings.about.supportLink);
    await expectNoViLeaks(page);
    await expectNoHorizontalScroll(page);
    await expectAxeClean(page);
    await context.close();
  });
});
