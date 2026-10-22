// M15-AC4: the native reminder schedule triggers (ARCH §5.6 v5.0): startup, resume, reminder settings, locale,
// goal / entry changes (debounced 2 s). Unit level with fake sources + injected timers, then composition level
// (`startApp` on a native container with a scheduling port, real Dexie liveQuery).
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Subscribable } from '../data/repositories';
import { buildEntry, datasetS1 } from '../test/builders';
import { createTestContainer, fakeNativePlatform, type TestContainer } from '../test/container';
import { pendingSchedule } from '../test/notifications';
import { REPLAN_DEBOUNCE_MS, startNativeReminderScheduler, startReminderScheduler } from './reminder-scheduler';
import { startApp, type StartDeps } from './start';
import { startSyncScheduler } from './sync-scheduler';

/** A hand-driven Subscribable. */
function source<T>(initial?: T) {
  const subs = new Set<(v: T) => void>();
  return {
    subscribe(onNext: (v: T) => void) {
      subs.add(onNext);
      if (initial !== undefined) onNext(initial);
      return () => {
        subs.delete(onNext);
      };
    },
    emit: (v: T) => subs.forEach((s) => s(v)),
    size: () => subs.size,
  } satisfies Subscribable<T> & { emit(v: T): void; size(): number };
}

/** Manual timers: `fire()` runs the pending debounce callback. */
function timers() {
  let pending: (() => void) | null = null;
  let scheduled = 0;
  let cleared = 0;
  return {
    deps: {
      setTimeout: (fn: () => void, ms: number) => {
        expect(ms).toBe(REPLAN_DEBOUNCE_MS);
        scheduled += 1;
        pending = fn;
        return scheduled;
      },
      clearTimeout: () => {
        cleared += 1;
        pending = null;
      },
      now: () => new Date('2026-10-09T10:00:00+07:00'),
    },
    fire: () => {
      const fn = pending;
      pending = null;
      fn?.();
    },
    hasPending: () => pending !== null,
    counts: () => ({ scheduled, cleared }),
  };
}

const settle = () => new Promise((r) => setTimeout(r, 0));

describe('startNativeReminderScheduler (unit)', () => {
  it('replans at startup, on resume, on a reminder-settings change, on a locale change; ignores unrelated settings fields', async () => {
    const replan = vi.fn(async () => 'scheduled' as const);
    const native = fakeNativePlatform('ios');
    const settings = source({ reminderEnabled: false, reminderTime: '20:00' });
    const locale = source<string | undefined>('en');
    const t = timers();
    const stop = startNativeReminderScheduler({ replan, resume: (cb) => native.lifecycle.onResume(cb), settings, locale, changes: [], deps: t.deps });
    expect(replan).toHaveBeenCalledTimes(1);
    expect(replan).toHaveBeenCalledWith(new Date('2026-10-09T10:00:00+07:00'));
    native.resume();
    expect(replan).toHaveBeenCalledTimes(2);
    settings.emit({ reminderEnabled: true, reminderTime: '20:00' }); // turned on
    expect(replan).toHaveBeenCalledTimes(3);
    settings.emit({ reminderEnabled: true, reminderTime: '20:00' }); // same values (e.g. lastBackupAt changed) → nothing
    expect(replan).toHaveBeenCalledTimes(3);
    settings.emit({ reminderEnabled: true, reminderTime: '21:30' }); // time changed
    expect(replan).toHaveBeenCalledTimes(4);
    locale.emit('en'); // unchanged
    expect(replan).toHaveBeenCalledTimes(4);
    locale.emit('vi');
    expect(replan).toHaveBeenCalledTimes(5);
    expect(t.hasPending()).toBe(false);
    stop();
    expect(native.resumeListeners()).toBe(0);
    expect(settings.size()).toBe(0);
    expect(locale.size()).toBe(0);
    native.resume();
    settings.emit({ reminderEnabled: false, reminderTime: '21:30' });
    expect(replan).toHaveBeenCalledTimes(5);
  });

  it('goal / entry changes: the first emission of a source is ignored, later ones replan once after a 2 s debounce', () => {
    const replan = vi.fn(async () => 'scheduled' as const);
    const goals = source<unknown>([]);
    const entries = source<unknown>([]);
    const t = timers();
    const stop = startNativeReminderScheduler({ replan, resume: () => () => {}, settings: source(), locale: source(), changes: [goals, entries], deps: t.deps });
    expect(replan).toHaveBeenCalledTimes(1);
    expect(t.hasPending()).toBe(false);
    for (let i = 0; i < 10; i += 1) entries.emit([i]); // 10 writes in a row
    goals.emit([1]);
    expect(replan).toHaveBeenCalledTimes(1);
    expect(t.hasPending()).toBe(true);
    expect(t.counts().scheduled).toBe(11);
    expect(t.counts().cleared).toBe(10);
    t.fire();
    expect(replan).toHaveBeenCalledTimes(2);
    expect(t.hasPending()).toBe(false);
    entries.emit([99]);
    stop();
    expect(t.hasPending()).toBe(false); // the pending debounce is cleared on stop
    expect(goals.size()).toBe(0);
    expect(entries.size()).toBe(0);
  });

  it('a failing replan does not stop the schedule', async () => {
    const replan = vi.fn(async () => {
      throw new Error('boom');
    });
    const native = fakeNativePlatform('ios');
    startNativeReminderScheduler({ replan, resume: (cb) => native.lifecycle.onResume(cb), settings: source(), locale: source(), changes: [], deps: timers().deps });
    await settle();
    native.resume();
    await settle();
    expect(replan).toHaveBeenCalledTimes(2);
  });
});

describe('startApp picks the schedule per capabilities (composition, M15-AC4)', () => {
  let tc: TestContainer | undefined;
  afterEach(async () => {
    await tc?.dispose();
    tc = undefined;
  });

  const base = { reminderCheckIntervalMs: 60_000, syncIntervalMs: 300_000, baseUrl: '/', prod: true };
  /** `triggers` counts the scheduler's own calls; the service's coalescing may call `replan` once more internally. */
  const realDeps = (t: ReturnType<typeof timers>, triggers: { n: number }): StartDeps => ({
    registerServiceWorker: async () => null,
    listenForNavigation: () => () => {},
    startMaintenance: async () => undefined,
    startReminderScheduler,
    startNativeReminderScheduler: (o) =>
      startNativeReminderScheduler({
        ...o,
        replan: (now) => {
          triggers.n += 1;
          return o.replan(now);
        },
        deps: t.deps,
      }),
    startSyncScheduler,
  });

  /** Poll until `fn()` is truthy (Dexie liveQuery emits asynchronously). */
  async function until(fn: () => boolean, label = '', ms = 4000) {
    // Date is faked by setup.ts; count real timer ticks instead.
    for (let waited = 0; !fn(); waited += 10) {
      if (waited > ms) throw new Error(`timed out: ${label}`);
      await new Promise((r) => setTimeout(r, 10));
    }
  }

  it('native + scheduling port: startup replan, resume, settings, locale, entries (debounced) — today drops once every goal is done; web: no replan', async () => {
    const native = fakeNativePlatform('ios');
    tc = await createTestContainer({ native, scheduledNotifications: true, permission: 'granted' });
    const { container } = tc;
    const s1 = datasetS1();
    await container.db.goals.bulkPut(s1.goals);
    await container.db.entries.bulkPut(s1.entries);
    await container.settingsService.update({ reminderEnabled: true, reminderTime: '20:00' });
    expect(container.capabilities.scheduledNotifications).toBe(true);
    const fake = tc.notifications;
    const t = timers();
    const triggers = { n: 0 };
    const check = vi.spyOn(container.reminderService, 'check');

    const stop = startApp({ ...base, container, deps: realDeps(t, triggers) });
    await until(() => fake.scheduled.length === 1, 'startup');
    expect(triggers.n).toBe(1);
    expect(check).not.toHaveBeenCalled();
    expect(pendingSchedule(fake)).toHaveLength(14);
    expect(pendingSchedule(fake)[0].at.getDate()).toBe(9);
    // Dexie's first liveQuery emissions (goals, entries, settings, locale) must not count as changes.
    await settle();
    await settle();
    expect(triggers.n).toBe(1);
    expect(t.hasPending()).toBe(false);

    native.resume();
    await until(() => triggers.n === 2, 'resume');

    await container.settingsService.setReminderTime('21:00');
    await until(() => triggers.n === 3, 'time');
    await until(() => pendingSchedule(fake)[0]?.at.getHours() === 21, '21:00');

    await container.locale.change('vi');
    await until(() => triggers.n === 4, 'locale');
    await until(() => pendingSchedule(fake)[0]?.body.startsWith('Hãy ghi'), 'vi body');

    // Entries that put every active goal on target → one debounced replan, and today is gone from the plan.
    await container.db.entries.bulkPut([
      buildEntry({ id: 'r1', goalId: 'g1', date: '2026-10-09', minutes: 30 }),
      buildEntry({ id: 'r2', goalId: 'g2', date: '2026-10-09', minutes: 20 }),
      buildEntry({ id: 'r3', goalId: 'g3', date: '2026-10-09', minutes: 17 }),
    ]);
    await until(() => t.hasPending(), 'debounce');
    expect(triggers.n).toBe(4);
    t.fire();
    await until(() => triggers.n === 5, 'after entries');
    await until(() => pendingSchedule(fake).length === 13, '13 days');
    expect(pendingSchedule(fake)[0].at.getDate()).toBe(10);

    // 10 entries in a row (today: inside the watched range; past days cannot change the plan) → one debounce, one replan.
    for (let i = 0; i < 10; i += 1) await container.db.entries.put(buildEntry({ id: `burst-${i}`, goalId: 'g1', date: '2026-10-09', minutes: 1 }));
    await until(() => t.hasPending(), 'burst');
    await settle();
    expect(triggers.n).toBe(5);
    t.fire();
    await until(() => triggers.n === 6, 'burst replan');
    await settle();
    expect(triggers.n).toBe(6);
    expect(check).not.toHaveBeenCalled();
    stop();
    expect(native.resumeListeners()).toBe(0);
  });

  it('web container: the interval check runs as in M2 and replan is never called', async () => {
    tc = await createTestContainer();
    const replan = vi.spyOn(tc.container.reminderService, 'replan');
    const check = vi.spyOn(tc.container.reminderService, 'check');
    const stop = startApp({ ...base, prod: false, container: tc.container, deps: realDeps(timers(), { n: 0 }) });
    await settle();
    expect(check).toHaveBeenCalledTimes(1);
    expect(replan).not.toHaveBeenCalled();
    expect(tc.container.capabilities.scheduledNotifications).toBe(false);
    stop();
  });

  it('native container without a scheduling adapter (M12 … M14 runtime): the interval check path is kept', async () => {
    tc = await createTestContainer({ native: 'ios' });
    const replan = vi.spyOn(tc.container.reminderService, 'replan');
    const stop = startApp({ ...base, container: tc.container, deps: realDeps(timers(), { n: 0 }) });
    await settle();
    expect(replan).not.toHaveBeenCalled();
    expect(tc.container.capabilities.scheduledNotifications).toBe(false);
    stop();
  });
});
