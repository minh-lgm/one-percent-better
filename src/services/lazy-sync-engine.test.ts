// M18 (ARCH §10 "lazy sync"): `LazySyncEngine` loads the real engine only on demand and forwards everything after.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FakeRemoteServer } from '../test/fake-remote-store';
import { createDevice, type Device } from '../test/two-devices';
import { LazySyncEngine } from './lazy-sync-engine';
import type { SyncService } from './sync-service';

const NOW = new Date('2026-11-04T03:00:00.000Z');
let server: FakeRemoteServer;
let devices: Device[] = [];

beforeEach(() => {
  server = new FakeRemoteServer(() => NOW);
});
afterEach(async () => {
  for (const d of devices) await d.dispose();
  devices = [];
});

/** A lazy front over a device's real `SyncService`, counting loads. */
async function lazyDevice(failLoads = 0) {
  const d = await createDevice('A', server, { now: NOW, signedIn: true });
  devices.push(d);
  let loads = 0;
  const lazy = new LazySyncEngine(async () => {
    loads += 1;
    if (loads <= failLoads) throw new Error('chunk failed to load');
    return d.sync;
  });
  return { d, lazy, loads: () => loads };
}

describe('LazySyncEngine', () => {
  it('observation never loads: current() is paused/0/null, watchStatus and watchMergePrompt emit that, onEvent/pause/cancelMerge/isPausedForDeletion are no-ops', async () => {
    const { lazy, loads } = await lazyDevice();
    const seen: unknown[] = [];
    lazy.watchStatus().subscribe((s) => seen.push(s));
    lazy.watchMergePrompt().subscribe((p) => seen.push(p));
    lazy.onEvent(() => undefined);
    lazy.pause();
    lazy.cancelMerge();
    lazy.resumeAfterAccountDeletion();
    expect(lazy.current()).toEqual({ kind: 'paused', pending: 0, lastSyncedAt: null });
    expect(seen).toEqual([{ kind: 'paused', pending: 0, lastSyncedAt: null }, null]);
    expect(lazy.isPausedForDeletion()).toBe(false);
    expect(await lazy.willAnnounceMerge()).toBe(false);
    expect(await lazy.countRejected()).toBe(0);
    expect(await lazy.finalSyncBeforeSignOut()).toEqual({ pending: 0 });
    expect(await lazy.confirmMerge()).toEqual({ status: 'skipped', why: 'paused' });
    await lazy.reset();
    await lazy.pauseForAccountDeletion();
    expect(loads()).toBe(0);
    expect(lazy.loaded()).toBeNull();
  });

  it('syncNow loads the engine once, runs the cycle and forwards status + lastSyncedAt to the earlier subscriber', async () => {
    const { d, lazy, loads } = await lazyDevice();
    await d.goalService.create({ name: 'Read', why: '', targetType: 'daily', targetValue: 30, startDate: '2026-10-01', endDate: null }, NOW);
    const kinds: string[] = [];
    lazy.watchStatus().subscribe((s) => kinds.push(s.kind));
    const r = await lazy.syncNow('manual');
    expect(r).toEqual({ status: 'ran', ok: true });
    expect(loads()).toBe(1);
    expect(lazy.loaded()).toBe(d.sync);
    expect(kinds).toContain('syncing');
    expect(lazy.current()).toMatchObject({ kind: 'idle', pending: 0, lastSyncedAt: NOW.toISOString() });
    expect(server.live('goals', d.user.id!)).toHaveLength(1);
    await lazy.syncNow('manual');
    expect(loads()).toBe(1);
    // After loading, the pending count is live (the engine is started because a subscriber exists).
    await d.goalService.create({ name: 'Run', why: '', targetType: 'daily', targetValue: 30, startDate: '2026-10-01', endDate: null }, NOW);
    await new Promise((res) => setTimeout(res, 50));
    expect(lazy.current().pending).toBe(1);
  });

  it('handleSignedIn / prepareFirstSignIn load the engine; events and the merge prompt are forwarded', async () => {
    const { d, lazy, loads } = await lazyDevice();
    const events: unknown[] = [];
    const prompts: unknown[] = [];
    lazy.onEvent((e) => events.push(e));
    lazy.watchMergePrompt().subscribe((p) => prompts.push(p));
    await d.goalService.create({ name: 'Read', why: '', targetType: 'daily', targetValue: 30, startDate: '2026-10-01', endDate: null }, NOW);
    // Another account on a device bound to U1 with data → D5 prompt through the lazy front.
    d.user.id = '00000000-0000-4000-8000-000000000002';
    expect(await lazy.prepareFirstSignIn(d.user.id)).toBe('confirm-merge');
    expect(loads()).toBe(1);
    expect(await lazy.handleSignedIn(d.user.id, 'other.user@example.com')).toBe('confirm-merge');
    expect(prompts[prompts.length - 1]).toMatchObject({ userId: d.user.id, goals: 1, entries: 0 });
    lazy.cancelMerge();
    expect(prompts[prompts.length - 1]).toBeNull();
    expect(events).toEqual([]);
  });

  it('a failed load is reported as SYNC_UNREACHABLE (no throw, no unhandled rejection) and retried on the next call', async () => {
    const { lazy, loads } = await lazyDevice(1);
    const seen: unknown[] = [];
    lazy.watchStatus().subscribe((s) => seen.push(s));
    expect(await lazy.syncNow('manual')).toEqual({ status: 'ran', ok: false, error: 'SYNC_UNREACHABLE' });
    expect(lazy.current()).toMatchObject({ kind: 'error', error: 'SYNC_UNREACHABLE' });
    expect(seen[seen.length - 1]).toMatchObject({ kind: 'error' });
    expect(lazy.loaded()).toBeNull();
    // The next call retries the load; this time it succeeds and the real decision comes back.
    expect(await lazy.handleSignedIn('00000000-0000-4000-8000-000000000001', 'minh.test@example.com')).toBe('same-user');
    expect(loads()).toBe(2);
    expect(lazy.loaded()).not.toBeNull();
    // A load that keeps failing on handleSignedIn: no throw either.
    const { lazy: broken } = await lazyDevice(99);
    expect(await broken.handleSignedIn('u', 'e')).toBe('same-user');
    expect(broken.current()).toMatchObject({ kind: 'error', error: 'SYNC_UNREACHABLE' });
  });

  it('start()/stop() are applied to the engine when it arrives; stop() keeps forwarding for a later restart', async () => {
    const { d, lazy } = await lazyDevice();
    const start = vi.spyOn(d.sync, 'start');
    const stop = vi.spyOn(d.sync, 'stop');
    lazy.stop();
    await lazy.load();
    // Nobody subscribed: the engine's DB watchers are not left running.
    expect(stop).toHaveBeenCalled();
    lazy.start();
    expect(start).toHaveBeenCalled();
    lazy.stop();
    const kinds: string[] = [];
    lazy.watchStatus().subscribe((s) => kinds.push(s.kind));
    await lazy.syncNow('manual');
    expect(kinds).toContain('idle');
  });

  it('is what the container exposes with the cloud on: nothing loaded while signed out, loaded after sign-in', async () => {
    const { createTestContainer } = await import('../test/container');
    const tc = await createTestContainer({ cloud: true });
    try {
      const engine = tc.container.syncService as LazySyncEngine;
      expect(engine).toBeInstanceOf(LazySyncEngine);
      await tc.container.authService.init();
      expect(engine.loaded()).toBeNull();
      expect(engine.current()).toEqual({ kind: 'paused', pending: 0, lastSyncedAt: null });
      // A session arrives (the fake port signs in u1): the container's auth watch loads the engine.
      const { USER1 } = await import('../test/fake-auth-port');
      tc.auth!.port.session = USER1;
      await tc.container.authService.completeCallback({ code: 'c' });
      await vi.waitFor(() => expect(engine.loaded()).not.toBeNull());
      expect(await engine.syncNow('manual')).toMatchObject({ status: 'ran' });
    } finally {
      await tc.dispose();
    }
  });
});

// Type-level: the lazy front is a `SyncEngine` and a `SyncService` is one too (the UI accepts either).
const _assign: (s: SyncService) => import('./lazy-sync-engine').SyncEngine = (s) => s;
void _assign;
