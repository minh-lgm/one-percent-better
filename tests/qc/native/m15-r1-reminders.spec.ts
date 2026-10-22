// QC M15 round 1 — native reminders driven through a recording fake of the iOS bridge that includes the
// LocalNotifications plugin. The REAL adapter (src/integration/native/local-notifications.ts), the REAL
// ReminderService/scheduler and the REAL Settings UI run; only the native side is faked. The notification actually
// arriving on a phone stays NOT VERIFIED (NV-17).
import { expect, test, type Page } from '@playwright/test';
import { at, createGoal, EN, expectAxeClean, expectNoHorizontalScroll, expectNoViLeaks, freezeClock, gotoHash, logTime, VI } from '../../../e2e/helpers/app';

type Perm = 'prompt' | 'prompt-with-rationale' | 'granted' | 'denied';

interface Call {
  plugin: string;
  method: string;
  options: Record<string, unknown>;
}
interface Opts {
  perm?: Perm;
  /** What `requestPermissions` answers. */
  afterRequest?: Perm;
  pending?: number[];
  scheduleFails?: boolean;
}

declare global {
  interface Window {
    __qcm15: {
      calls: Call[];
      perm: Perm;
      afterRequest: Perm;
      pending: number[];
      scheduleFails: boolean;
      listeners: Array<{ id: number; event: string; plugin: string }>;
      fire: (plugin: string, event: string, data: unknown) => void;
    };
  }
}

async function bridge(page: Page, opts: Opts = {}): Promise<void> {
  await page.addInitScript((o) => {
    const w = window as unknown as Record<string, unknown>;
    const calls: Array<{ plugin: string; method: string; options: unknown }> = [];
    const callbacks = new Map<number, { plugin: string; event: string; cb: (d: unknown) => void }>();
    let next = 1;
    const st = {
      calls,
      perm: o.perm ?? 'prompt',
      afterRequest: o.afterRequest ?? 'granted',
      pending: o.pending ?? [],
      scheduleFails: o.scheduleFails ?? false,
      listeners: [] as Array<{ id: number; event: string; plugin: string }>,
      fire(plugin: string, event: string, data: unknown) {
        for (const l of callbacks.values()) if (l.plugin === plugin && l.event === event) l.cb(data);
      },
    };
    w.__qcm15 = st;
    w.webkit = { messageHandlers: { bridge: { postMessage() {} } } };
    const hdr = (name: string, promises: string[], callbacksM: string[] = []) => ({
      name,
      methods: [...promises.map((n) => ({ name: n, rtype: 'promise' })), ...callbacksM.map((n) => ({ name: n, rtype: 'callback' }))],
    });
    w.Capacitor = {
      PluginHeaders: [
        hdr('App', ['removeListener'], ['addListener']),
        hdr('LocalNotifications', ['checkPermissions', 'requestPermissions', 'getPending', 'cancel', 'schedule', 'removeListener'], ['addListener']),
      ],
      nativePromise(plugin: string, method: string, options: Record<string, unknown>) {
        calls.push({ plugin, method, options: JSON.parse(JSON.stringify(options ?? {})) });
        if (plugin !== 'LocalNotifications') return Promise.resolve({});
        switch (method) {
          case 'checkPermissions':
            return Promise.resolve({ display: st.perm });
          case 'requestPermissions':
            st.perm = st.afterRequest;
            return Promise.resolve({ display: st.perm });
          case 'getPending':
            return Promise.resolve({ notifications: st.pending.map((id: number) => ({ id })) });
          case 'cancel': {
            const ids = ((options as { notifications: Array<{ id: number }> }).notifications).map((n) => n.id);
            st.pending = st.pending.filter((id: number) => !ids.includes(id));
            return Promise.resolve();
          }
          case 'schedule': {
            if (st.scheduleFails) return Promise.reject(new Error('Notification scheduling failed (QC)'));
            const ns = ((options as { notifications: Array<{ id: number }> }).notifications).map((n) => n.id);
            st.pending = [...new Set([...st.pending, ...ns])];
            return Promise.resolve({ notifications: ns.map((id: number) => ({ id })) });
          }
          default:
            return Promise.resolve({});
        }
      },
      nativeCallback(plugin: string, method: string, options: Record<string, unknown>, cb: (d: unknown) => void) {
        calls.push({ plugin, method, options: JSON.parse(JSON.stringify(options ?? {})) });
        const id = next++;
        const event = String(options.eventName);
        callbacks.set(id, { plugin, event, cb });
        st.listeners.push({ id, event, plugin });
        return id;
      },
    };
  }, opts);
}

const calls = (page: Page, plugin: string, method: string): Promise<Call[]> =>
  page.evaluate(([p, m]) => window.__qcm15.calls.filter((c) => c.plugin === p && c.method === m), [plugin, method] as const);
const schedules = (page: Page) => calls(page, 'LocalNotifications', 'schedule');
const cancels = (page: Page) => calls(page, 'LocalNotifications', 'cancel');
const resume = (page: Page) => page.evaluate(() => window.__qcm15.fire('App', 'resume', {}));
const lastSchedule = async (page: Page) => (await schedules(page)).at(-1);
const dayOf = (iso: string) => new Date(iso).toLocaleDateString('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' });
const timeOf = (iso: string) => new Date(iso).toLocaleTimeString('en-GB', { timeZone: 'Asia/Ho_Chi_Minh', hour: '2-digit', minute: '2-digit' });

function watch(page: Page) {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  return errors;
}

const sw = (page: Page) => page.getByRole('switch', { name: EN.settings.reminders.switch });

test.describe('M15 QC: native reminders on the emulated iOS runtime', () => {
  test('first enable: asks once, Allowed chip, 14 notifications id 1000..1013 at 20:00 local with the en copy; tap -> #/today', async ({ page }) => {
    const errors = watch(page);
    await bridge(page, { perm: 'prompt', afterRequest: 'granted' });
    await freezeClock(page);
    await createGoal(page, { name: 'Read', targetValue: 30 });
    await createGoal(page, { name: 'Guitar', targetValue: 20 });
    await gotoHash(page, '/settings');
    await page.waitForTimeout(2600); // let the debounced replan caused by creating the goals (2 s) run before counting calls

    await expect(page.getByTestId('permission-desc')).toHaveText(EN.settings.permission.nativeDefaultDesc);
    await expect(page.getByText(EN.settings.permission.default, { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: EN.settings.reminders.allow })).toBeVisible();
    // Nothing is asked or scheduled while the switch is off.
    expect(await calls(page, 'LocalNotifications', 'requestPermissions')).toHaveLength(0);
    expect(await schedules(page)).toHaveLength(0);

    await sw(page).click();
    await expect(page.getByTestId('permission-desc')).toHaveText(EN.settings.permission.nativeGrantedDesc);
    await expect(page.getByText(EN.settings.permission.granted, { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: EN.settings.reminders.allow })).toHaveCount(0);
    // The fake answers the permission prompt instantly, so both the settings trigger and the UI's post-grant replan
    // can write a plan (idempotent: cancel + schedule each time). On a phone the first one sees `prompt` and skips.
    await expect.poll(async () => await page.evaluate(() => window.__qcm15.pending.length)).toBe(14);
    expect((await schedules(page)).length).toBeLessThanOrEqual(2);
    expect(await calls(page, 'LocalNotifications', 'requestPermissions')).toHaveLength(1);

    const s = (await lastSchedule(page))!;
    const ns = s.options.notifications as Array<{ id: number; title: string; body: string; schedule: { at: string; allowWhileIdle: boolean }; extra: { url: string }; sound?: unknown; actionTypeId?: unknown; badge?: unknown }>;
    expect(ns).toHaveLength(14);
    expect(ns.map((n) => n.id)).toEqual(Array.from({ length: 14 }, (_, i) => 1000 + i));
    expect(ns.map((n) => dayOf(n.schedule.at))).toEqual(Array.from({ length: 14 }, (_, i) => `2026-10-${String(9 + i).padStart(2, '0')}`));
    for (const n of ns) {
      expect(timeOf(n.schedule.at)).toBe('20:00');
      expect(n.schedule.allowWhileIdle).toBe(true);
      expect(n.title).toBe(EN.notification.nativeTitle);
      expect(n.body).toBe(EN.notification.nativeBody);
      expect(n.extra.url).toBe('#/today');
      expect(n.sound).toBeUndefined();
      expect(n.actionTypeId).toBeUndefined();
      expect(n.badge).toBeUndefined();
    }
    // No .ics button, no web limit text, no browser wording.
    const body = page.locator('body');
    await expect(page.getByRole('button', { name: EN.settings.reminders.ics })).toHaveCount(0);
    await expect(body).not.toContainText(EN.settings.reminders.icsHint.replace('{{time}}', '20:00'));
    await expect(body).not.toContainText(EN.settings.reminders.limit);
    await expect(body).not.toContainText(EN.settings.reminders.ios);
    await expect(page.getByTestId('reminders-native-info')).toHaveText(EN.settings.reminders.nativeInfo);

    // Tapping the notification (event from the OS) opens Today, wherever the app was.
    await gotoHash(page, '/goals');
    await page.evaluate(() => window.__qcm15.fire('LocalNotifications', 'localNotificationActionPerformed', { actionId: 'tap', notification: { id: 1000, extra: { url: '#/today' } } }));
    await expect(page).toHaveURL(/#\/today$/);
    await gotoHash(page, '/review');
    // A tap without `extra` (older pending notification) still lands on Today.
    await page.evaluate(() => window.__qcm15.fire('LocalNotifications', 'localNotificationActionPerformed', { actionId: 'tap', notification: { id: 1001 } }));
    await expect(page).toHaveURL(/#\/today$/);
    expect(errors).toEqual([]);
  });

  test('only ids 1000..1013 are cancelled; foreign pending ids survive every replan and switch-off', async ({ page }) => {
    await bridge(page, { perm: 'granted', pending: [42, 999, 1000, 1005, 1013, 1014, 2000] });
    await freezeClock(page);
    await createGoal(page, { name: 'Read', targetValue: 30 });
    await gotoHash(page, '/settings');
    await sw(page).click();
    await expect.poll(async () => (await schedules(page)).length).toBe(1);
    const c1 = await cancels(page);
    expect(c1).toHaveLength(1);
    expect((c1[0].options.notifications as Array<{ id: number }>).map((n) => n.id).sort()).toEqual([1000, 1005, 1013]);
    await sw(page).click(); // off
    await expect.poll(async () => (await cancels(page)).length).toBe(2);
    const pending = await page.evaluate(() => window.__qcm15.pending.sort((a, b) => a - b));
    expect(pending).toEqual([42, 999, 1014, 2000]);
  });

  test('switch off cancels everything and schedules nothing; switching on again re-plans 14', async ({ page }) => {
    await bridge(page, { perm: 'granted' });
    await freezeClock(page);
    await createGoal(page, { name: 'Read', targetValue: 30 });
    await gotoHash(page, '/settings');
    await sw(page).click();
    await expect.poll(async () => (await schedules(page)).length).toBe(1);
    await sw(page).click();
    await expect.poll(async () => (await page.evaluate(() => window.__qcm15.pending.length))).toBe(0);
    expect(await schedules(page)).toHaveLength(1);
    await sw(page).click();
    await expect.poll(async () => (await schedules(page)).length).toBe(2);
    expect(((await lastSchedule(page))!.options.notifications as unknown[]).length).toBe(14);
  });

  test('denied: Blocked chip + guidance, switch never schedules or re-asks, banner still shows after the reminder time', async ({ page }) => {
    await bridge(page, { perm: 'denied' });
    await freezeClock(page);
    await createGoal(page, { name: 'Read', targetValue: 30 });
    await gotoHash(page, '/settings');
    await expect(page.getByText(EN.settings.permission.denied, { exact: true })).toBeVisible();
    await expect(page.getByTestId('permission-desc')).toHaveText(EN.settings.permission.nativeDeniedDesc);
    await expect(page.getByRole('button', { name: EN.settings.reminders.allow })).toHaveCount(0);
    await sw(page).click();
    await expect(sw(page)).toBeChecked();
    await page.waitForTimeout(500);
    expect(await schedules(page)).toHaveLength(0);
    expect(await calls(page, 'LocalNotifications', 'requestPermissions')).toHaveLength(0);
    // FR-15: the in-app banner is the fallback the denied copy promises.
    await gotoHash(page, '/today');
    await freezeClock(page, at('2026-10-09T20:30:00'));
    await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
    await expect(page.getByTestId('reminder-banner')).toBeVisible({ timeout: 15_000 });
  });

  test('permission revoked in iOS Settings while away: coming back (visibilitychange) flips Allowed -> Blocked and the next replan schedules nothing new; granting again flips back without reload', async ({ page }) => {
    await bridge(page, { perm: 'granted' });
    await freezeClock(page);
    await createGoal(page, { name: 'Read', targetValue: 30 });
    await gotoHash(page, '/settings');
    await sw(page).click();
    await expect(page.getByText(EN.settings.permission.granted, { exact: true })).toBeVisible();
    await expect.poll(async () => (await schedules(page)).length).toBe(1);

    await page.evaluate(() => { window.__qcm15.perm = 'denied'; });
    await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
    await expect(page.getByText(EN.settings.permission.denied, { exact: true })).toBeVisible();
    await expect(page.getByTestId('permission-desc')).toHaveText(EN.settings.permission.nativeDeniedDesc);
    await resume(page);
    await page.waitForTimeout(600);
    expect(await schedules(page)).toHaveLength(1);

    await page.evaluate(() => { window.__qcm15.perm = 'granted'; });
    await page.evaluate(() => window.dispatchEvent(new Event('focus')));
    await expect(page.getByText(EN.settings.permission.granted, { exact: true })).toBeVisible();
  });

  test('"Allow notifications" with the reminder already on (A-64): one prompt, then the plan is written', async ({ page }) => {
    await bridge(page, { perm: 'prompt-with-rationale', afterRequest: 'granted' });
    await freezeClock(page);
    await createGoal(page, { name: 'Read', targetValue: 30 });
    await gotoHash(page, '/settings');
    await page.waitForTimeout(2600);
    await sw(page).click(); // asks (switch-on) and is granted... so reset to emulate "reminder on, never asked"
    await expect.poll(async () => await page.evaluate(() => window.__qcm15.pending.length)).toBe(14);
    await page.evaluate(() => { window.__qcm15.perm = 'prompt'; window.__qcm15.calls.length = 0; });
    await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
    await expect(page.getByTestId('permission-desc')).toHaveText(EN.settings.permission.nativeDefaultOnDesc);
    await page.getByRole('button', { name: EN.settings.reminders.allow }).click();
    await expect(page.getByText(EN.settings.permission.granted, { exact: true })).toBeVisible();
    expect(await calls(page, 'LocalNotifications', 'requestPermissions')).toHaveLength(1);
    await expect.poll(async () => (await schedules(page)).length).toBeGreaterThanOrEqual(1);
    expect(((await lastSchedule(page))!.options.notifications as unknown[]).length).toBe(14);
  });

  test('time change -> cancel + reschedule at the new time; time after now keeps today, before now drops it', async ({ page }) => {
    await bridge(page, { perm: 'granted' });
    await freezeClock(page); // 10:00
    await createGoal(page, { name: 'Read', targetValue: 30 });
    await gotoHash(page, '/settings');
    await sw(page).click();
    await expect.poll(async () => (await schedules(page)).length).toBe(1);
    const time = page.getByLabel(EN.settings.reminders.time);
    await time.fill('09:30'); // already past at 10:00 -> today dropped
    await time.blur();
    await expect.poll(async () => (await schedules(page)).length).toBeGreaterThanOrEqual(2);
    let ns = (await lastSchedule(page))!.options.notifications as Array<{ id: number; schedule: { at: string } }>;
    expect(ns).toHaveLength(13);
    expect(dayOf(ns[0].schedule.at)).toBe('2026-10-10');
    expect(timeOf(ns[0].schedule.at)).toBe('09:30');
    expect(ns[0].id).toBe(1000);
    await time.fill('10:01');
    await time.blur();
    await expect.poll(async () => {
      const l = (await lastSchedule(page))!.options.notifications as unknown[];
      return l.length;
    }).toBe(14);
    ns = (await lastSchedule(page))!.options.notifications as typeof ns;
    expect(dayOf(ns[0].schedule.at)).toBe('2026-10-09');
    expect(timeOf(ns[0].schedule.at)).toBe('10:01');
  });

  test('logging enough minutes for every active goal drops today; one goal short keeps it; debounce coalesces rapid logs', async ({ page }) => {
    await bridge(page, { perm: 'granted' });
    await freezeClock(page);
    await createGoal(page, { name: 'Read', targetValue: 30 });
    await createGoal(page, { name: 'Guitar', targetValue: 20 });
    await gotoHash(page, '/settings');
    await sw(page).click();
    await expect.poll(async () => (await schedules(page)).length).toBe(1);
    await gotoHash(page, '/today');
    await logTime(page, 'Read', 30);
    await page.waitForTimeout(3500);
    // Read reached, Guitar not: today is still planned.
    let l = (await lastSchedule(page))!.options.notifications as Array<{ schedule: { at: string } }>;
    expect(dayOf(l[0].schedule.at)).toBe('2026-10-09');
    const before = (await schedules(page)).length;
    await logTime(page, 'Guitar', 20);
    await expect.poll(async () => (await schedules(page)).length, { timeout: 8000 }).toBe(before + 1);
    l = (await lastSchedule(page))!.options.notifications as typeof l;
    expect(l).toHaveLength(13);
    expect(dayOf(l[0].schedule.at)).toBe('2026-10-10');
    // Settling: no extra schedule afterwards.
    await page.waitForTimeout(3000);
    expect((await schedules(page)).length).toBe(before + 1);
  });

  test('archiving the last active goal leaves an empty plan (a cancel, never a schedule call with zero items... or one with an empty list)', async ({ page }) => {
    const errors = watch(page);
    await bridge(page, { perm: 'granted' });
    await freezeClock(page);
    await createGoal(page, { name: 'Read', targetValue: 30 });
    await gotoHash(page, '/settings');
    await sw(page).click();
    await expect.poll(async () => await page.evaluate(() => window.__qcm15.pending.length)).toBe(14);
    await gotoHash(page, '/goals');
    await page.getByTestId('goal-row').filter({ hasText: 'Read' }).getByRole('button', { name: EN.goals.archive }).click();
    await expect.poll(async () => await page.evaluate(() => window.__qcm15.pending.length), { timeout: 10_000 }).toBe(0);
    expect(errors).toEqual([]);
    // Restore: the plan comes back (14 days).
    await page.getByTestId('goal-row').filter({ hasText: 'Read' }).getByRole('button', { name: EN.goals.restore }).click();
    await expect.poll(async () => await page.evaluate(() => window.__qcm15.pending.length), { timeout: 10_000 }).toBe(14);
  });

  test('plugin refuses to schedule: no page error, UI stays usable, the next trigger retries and succeeds', async ({ page }) => {
    const errors = watch(page);
    await bridge(page, { perm: 'granted', scheduleFails: true });
    await freezeClock(page);
    await createGoal(page, { name: 'Read', targetValue: 30 });
    await gotoHash(page, '/settings');
    await sw(page).click();
    await expect(sw(page)).toBeChecked();
    await expect.poll(async () => (await schedules(page)).length).toBeGreaterThanOrEqual(1);
    await page.evaluate(() => { window.__qcm15.scheduleFails = false; });
    await resume(page);
    await expect.poll(async () => await page.evaluate(() => window.__qcm15.pending.length)).toBe(14);
    expect(errors.filter((e) => !/Notification scheduling failed/.test(e))).toEqual([]);
  });

  test('language switch re-plans with the Vietnamese copy; midnight + resume re-plans from the new day', async ({ page }) => {
    await bridge(page, { perm: 'granted' });
    await freezeClock(page);
    await createGoal(page, { name: 'Read', targetValue: 30 });
    await gotoHash(page, '/settings');
    await sw(page).click();
    await expect.poll(async () => (await schedules(page)).length).toBe(1);
    await page.getByRole('radio', { name: 'Tiếng Việt' }).check();
    await expect.poll(async () => (await schedules(page)).length).toBe(2);
    let ns = (await lastSchedule(page))!.options.notifications as Array<{ title: string; body: string; schedule: { at: string } }>;
    expect(ns[0].body).toBe(VI.notification.nativeBody);
    expect(ns[0].title).toBe(VI.notification.nativeTitle);
    expect(ns).toHaveLength(14);

    // Next morning, the app is resumed: the window starts on 10-10 and slides to 10-23.
    await freezeClock(page, at('2026-10-10T00:00:30'));
    await resume(page);
    await expect.poll(async () => (await schedules(page)).length).toBe(3);
    ns = (await lastSchedule(page))!.options.notifications as typeof ns;
    expect(dayOf(ns[0].schedule.at)).toBe('2026-10-10');
    expect(dayOf(ns.at(-1)!.schedule.at)).toBe('2026-10-23');
  });

  test('resume registers one shared listener and many resumes coalesce into non-overlapping plans', async ({ page }) => {
    await bridge(page, { perm: 'granted' });
    await freezeClock(page);
    await createGoal(page, { name: 'Read', targetValue: 30 });
    await gotoHash(page, '/settings');
    await sw(page).click();
    await expect.poll(async () => (await schedules(page)).length).toBe(1);
    const before = (await schedules(page)).length;
    await page.evaluate(() => { for (let i = 0; i < 8; i += 1) window.__qcm15.fire('App', 'resume', {}); });
    await page.waitForTimeout(1500);
    const added = (await schedules(page)).length - before;
    expect(added).toBeGreaterThanOrEqual(1);
    expect(added).toBeLessThanOrEqual(2);
    const resumeListeners = await page.evaluate(() => window.__qcm15.listeners.filter((l) => l.plugin === 'App' && l.event === 'resume').length);
    expect(resumeListeners).toBe(1);
  });
});

test.describe('M15 QC: Settings native 360 px vi', () => {
  test.use({ locale: 'vi-VN', viewport: { width: 360, height: 740 } });
  for (const state of ['prompt', 'granted', 'denied'] as const) {
    test(`vi 360 ${state}: copy, no leaks, no horizontal scroll, axe`, async ({ page }) => {
      await bridge(page, { perm: state });
      await freezeClock(page);
      await createGoal(page, { name: 'Đọc sách', targetValue: 30 }, VI);
      await gotoHash(page, '/settings');
      const s = page.getByRole('switch', { name: VI.settings.reminders.switch });
      if (state === 'granted') await s.click();
      const desc = { prompt: VI.settings.permission.nativeDefaultDesc, granted: VI.settings.permission.nativeGrantedDesc, denied: VI.settings.permission.nativeDeniedDesc }[state];
      await expect(page.getByTestId('permission-desc')).toHaveText(desc);
      await expect(page.getByTestId('reminders-native-info')).toHaveText(VI.settings.reminders.nativeInfo);
      await expect(page.getByRole('button', { name: VI.settings.reminders.ics })).toHaveCount(0);
      await expectNoViLeaks(page);
      await expectNoHorizontalScroll(page);
      await expectAxeClean(page);
      if (process.env.QC_SHOT_DIR) await page.screenshot({ path: `${process.env.QC_SHOT_DIR}/settings-vi-360-${state}.png`, fullPage: true });
      // About: Support link under Privacy, native = absolute + Safari.
      const support = page.getByRole('link', { name: new RegExp(`^${VI.settings.about.supportLink}`) });
      await expect(support).toHaveAttribute('href', 'https://minh-lgm.github.io/one-percent-better/support.html');
      await expect(support).toHaveAttribute('target', '_blank');
      await expect(support).toHaveAttribute('rel', /noopener/);
      const boxes = await page.evaluate(() => {
        const privacy = document.querySelector('[data-testid="privacy-link"]')!.getBoundingClientRect();
        const sup = [...document.querySelectorAll('a')].find((a) => a.getAttribute('href')?.endsWith('support.html'))!.getBoundingClientRect();
        return { privacyBottom: privacy.bottom, supportTop: sup.top, supportH: sup.height, supportLeft: sup.left, privacyLeft: privacy.left };
      });
      // "dưới privacyLink" = after it in reading order: either below, or to its right on the same row when it fits.
      expect(boxes.supportTop >= boxes.privacyBottom - 1 || boxes.supportLeft > boxes.privacyLeft).toBe(true);
      expect(boxes.supportH).toBeGreaterThanOrEqual(40);
    });
  }
});
