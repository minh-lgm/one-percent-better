// M12-AC4: the post-render wiring (ARCH §5.12 "Thứ tự khởi động"). Native build: no service worker, no SW
// message listener; the Capacitor `resume` event drives the reminder check and the sync like `visibilitychange`.
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AuthState } from '../services/auth-service';
import { createTestContainer, fakeNativePlatform, type TestContainer } from '../test/container';
import { startReminderScheduler } from './reminder-scheduler';
import { startApp, type StartDeps } from './start';
import { startSyncScheduler } from './sync-scheduler';

let tc: TestContainer | undefined;
afterEach(async () => {
  await tc?.dispose();
  tc = undefined;
});

function deps(): StartDeps & { stopNavigation: ReturnType<typeof vi.fn> } {
  const stopNavigation = vi.fn();
  return {
    registerServiceWorker: vi.fn(async () => ({ applyUpdate: () => {} })),
    listenForNavigation: vi.fn(() => stopNavigation),
    startMaintenance: vi.fn(() => Promise.resolve()),
    startReminderScheduler: vi.fn(() => () => {}),
    startSyncScheduler: vi.fn(() => () => {}),
    stopNavigation,
  };
}

const base = { reminderCheckIntervalMs: 60_000, syncIntervalMs: 300_000, baseUrl: '/', prod: true };

describe('startApp', () => {
  it('web production build: registers the service worker and the SW message listener, starts maintenance + reminders', async () => {
    tc = await createTestContainer();
    const d = deps();
    const stop = startApp({ ...base, container: tc.container, deps: d });
    expect(d.registerServiceWorker).toHaveBeenCalledTimes(1);
    expect(d.registerServiceWorker).toHaveBeenCalledWith({ swUrl: '/sw.js', onUpdateAvailable: expect.any(Function) });
    expect(d.listenForNavigation).toHaveBeenCalledTimes(1);
    expect(d.startMaintenance).toHaveBeenCalledTimes(1);
    expect(d.startReminderScheduler).toHaveBeenCalledTimes(1);
    expect(vi.mocked(d.startReminderScheduler).mock.calls[0][0].resume).toBeUndefined();
    expect(d.startSyncScheduler).toHaveBeenCalledTimes(0); // cloud off
    stop();
    expect(d.stopNavigation).toHaveBeenCalledTimes(1);
  });

  it('web dev build (prod = false): no service worker, listener still on', async () => {
    tc = await createTestContainer();
    const d = deps();
    startApp({ ...base, prod: false, container: tc.container, deps: d });
    expect(d.registerServiceWorker).toHaveBeenCalledTimes(0);
    expect(d.listenForNavigation).toHaveBeenCalledTimes(1);
  });

  it('native build: registerServiceWorker and listenForNavigation are never called; resume feeds the schedulers', async () => {
    const native = fakeNativePlatform('ios');
    tc = await createTestContainer({ native, cloud: true, authStored: true });
    const d = deps();
    startApp({ ...base, container: tc.container, deps: d }); // capabilities.serviceWorker is false (native runtime present)
    expect(d.registerServiceWorker).toHaveBeenCalledTimes(0);
    expect(d.listenForNavigation).toHaveBeenCalledTimes(0);
    expect(d.startMaintenance).toHaveBeenCalledTimes(1);
    expect(d.startReminderScheduler).toHaveBeenCalledTimes(1);
    expect(typeof vi.mocked(d.startReminderScheduler).mock.calls[0][0].resume).toBe('function');
    // M12: the account is unavailable on native, so there is no sync service to schedule.
    expect(d.startSyncScheduler).toHaveBeenCalledTimes(0);
  });

  it('native build flag without a runtime (the native build in a browser): still no service worker', async () => {
    tc = await createTestContainer({ nativeBuild: true });
    const d = deps();
    startApp({ ...base, container: tc.container, deps: d });
    expect(d.registerServiceWorker).toHaveBeenCalledTimes(0);
    expect(d.listenForNavigation).toHaveBeenCalledTimes(0);
  });
});

describe('resume trigger on the schedulers (ARCH §5.12)', () => {
  const settle = () => new Promise((r) => setTimeout(r, 0));

  it('reminder scheduler: a resume runs the check once more; stopping unsubscribes', async () => {
    const native = fakeNativePlatform('ios');
    const check = vi.fn(async () => true);
    const stop = startReminderScheduler({
      check,
      intervalMs: 60_000,
      deps: { setInterval: () => 'id', clearInterval: () => {}, document: undefined, now: () => new Date() },
      resume: (cb) => native.lifecycle.onResume(cb),
    });
    expect(check).toHaveBeenCalledTimes(1);
    await settle();
    native.resume();
    expect(check).toHaveBeenCalledTimes(2);
    expect(native.resumeListeners()).toBe(1);
    stop();
    expect(native.resumeListeners()).toBe(0);
    native.resume();
    expect(check).toHaveBeenCalledTimes(2);
  });

  it('sync scheduler: a resume while signed in syncs with reason "visible"; stopping unsubscribes', async () => {
    const native = fakeNativePlatform('ios');
    const reasons: string[] = [];
    const sync = {
      start: () => {},
      syncNow: async (reason: string) => {
        reasons.push(reason);
        return { status: 'ran', ok: true } as const;
      },
      handleSignedIn: async () => 'merge-silently' as const,
      reset: async () => {},
      pause: () => {},
      watchStatus: () => ({ subscribe: () => () => {} }),
    };
    const stop = startSyncScheduler({
      sync: sync as unknown as Parameters<typeof startSyncScheduler>[0]['sync'],
      auth: { watch: () => ({ subscribe: (onNext: (s: AuthState) => void) => (onNext({ kind: 'signed-in', userId: 'u1', email: 'a@b.c', name: 'A' }), () => {}) }) },
      intervalMs: 300_000,
      deps: { setTimeout: () => 't', clearTimeout: () => {}, setInterval: () => 'i', clearInterval: () => {}, window: undefined, document: undefined },
      resume: (cb) => native.lifecycle.onResume(cb),
    });
    native.resume();
    expect(reasons).toEqual(['visible']);
    stop();
    expect(native.resumeListeners()).toBe(0);
  });
});
