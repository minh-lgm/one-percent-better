// SyncService (M7-AC6 d/f, M7-AC8 backoff, M7-AC13 errors, ARCHITECTURE §5.10).
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { normalizeSyncMeta, type KvKey, type KvRepository } from '../data/repositories';
import { rewindCursor, type SyncStatus } from '../domain/sync';
import { PULL_RESET_VERSION } from '../config/constants';
import { buildEntry, buildGoal } from '../test/builders';
import { FakeRemoteServer, offlineError, unauthorizedError, unreachableError } from '../test/fake-remote-store';
import { createDevice, MemoryLockPort, serverSnapshot, U1, U2, type Device } from '../test/two-devices';
import { noLocks } from './lock-port';
import type { SyncEvent } from './sync-service';

const T = (s: string) => new Date(s);
const NOW = T('2026-10-09T03:00:00.000Z');

/** Captures scheduled retries instead of running them (fake timers for the service only). */
function fakeTimers() {
  const scheduled: Array<{ fn: () => void; ms: number; id: number }> = [];
  let seq = 0;
  return {
    scheduled,
    timers: {
      setTimeout: (fn: () => void, ms: number) => {
        const id = ++seq;
        scheduled.push({ fn, ms, id });
        return id;
      },
      clearTimeout: (id: unknown) => {
        const i = scheduled.findIndex((s) => s.id === id);
        if (i !== -1) scheduled.splice(i, 1);
      },
    },
  };
}

let server: FakeRemoteServer;
let devices: Device[] = [];

beforeEach(() => {
  server = new FakeRemoteServer(() => NOW);
});

afterEach(async () => {
  for (const d of devices) await d.dispose();
  devices = [];
});

async function device(name: string, options: Parameters<typeof createDevice>[2] = {}) {
  const d = await createDevice(name, server, { now: NOW, ...options });
  devices.push(d);
  return d;
}

const statuses = (d: Device) => {
  const seen: SyncStatus[] = [];
  d.sync.watchStatus().subscribe((s) => seen.push(s));
  return seen;
};

describe('one cycle', () => {
  it('push → read back (dirty cleared) → pull → cursor stored → prefs → lastSyncedAt; status idle, pending 0', async () => {
    const a = await device('A');
    await a.goalService.create({ name: 'Read', why: '', targetType: 'daily', targetValue: 30, startDate: '2026-10-01', endDate: '2026-10-31' }, NOW);
    await a.localeService.set('vi');
    const seen = statuses(a);
    const outcome = await a.sync.syncNow('manual');
    expect(outcome).toEqual({ status: 'ran', ok: true });
    expect(seen.map((s) => s.kind)).toContain('syncing');
    const last = seen[seen.length - 1];
    expect(last).toMatchObject({ kind: 'idle', pending: 0, lastSyncedAt: NOW.toISOString() });
    expect(server.live('goals', U1)).toHaveLength(1);
    expect(await a.store.countDirty()).toBe(0);
    const meta = normalizeSyncMeta((await a.kv.get('sync')) ?? undefined);
    expect(meta.cursor.goals).toMatchObject({ id: expect.any(String), serverUpdatedAt: expect.any(String) });
    expect(meta.lastSyncedAt).toBe(NOW.toISOString());
    expect(meta.lastError).toBeNull();
    expect(server.settings.get(U1)).toMatchObject({ locale: 'vi' });
    expect(server.calls.map((c) => c.method)).toEqual(['push', 'fetchByIds', 'pull', 'pull', 'pushPrefs']);
    expect(server.calls.filter((c) => c.method === 'push')).toHaveLength(1); // nothing new after the pull: no second push
  });

  it('pull applies rows from the account, rows from the server win on tie, invalid rows are counted (remoteInvalid)', async () => {
    const a = await device('A');
    server.seedRow('goals', U1, { id: 'g1', name: 'Cloud', why: '', target_type: 'daily', target_minutes: 15, start_date: '2026-10-01', end_date: '2026-12-31', archived: false, created_at: '2026-10-05T01:00:00.000Z', updated_at: '2026-10-05T01:00:00.000Z', deleted_at: null });
    server.seedRow('entries', U1, { id: 'bad', goal_id: 'g1', date: '2026-10-06', minutes: 5000, note: '', source: 'manual', created_at: '2026-10-05T01:00:00.000Z', updated_at: '2026-10-05T01:00:00.000Z', deleted_at: null });
    server.seedRow('entries', U1, { id: 'ok', goal_id: 'g1', date: '2026-10-06', minutes: 15, note: '', source: 'manual', created_at: '2026-10-05T01:00:00.000Z', updated_at: '2026-10-05T01:00:00.000Z', deleted_at: null });
    await a.sync.syncNow('manual');
    expect((await a.goals.getAll()).map((g) => g.name)).toEqual(['Cloud']);
    expect((await a.entries.getByGoal('g1')).map((e) => e.id)).toEqual(['ok']);
    expect(a.sync.current()).toMatchObject({ kind: 'idle', remoteInvalid: true });
    // A clean cycle clears the flag.
    server.tables.entries.get(U1)!.delete('bad');
    await a.sync.syncNow('manual');
    expect(a.sync.current().remoteInvalid).toBeUndefined();
  });

  it('not signed in → paused, nothing called; offline → offline status, nothing called', async () => {
    const a = await device('A');
    a.user.id = null;
    expect(await a.sync.syncNow('manual')).toEqual({ status: 'skipped', why: 'paused' });
    expect(a.sync.current().kind).toBe('paused');
    a.user.id = U1;
    a.online.value = false;
    expect(await a.sync.syncNow('change')).toEqual({ status: 'skipped', why: 'offline' });
    expect(a.sync.current().kind).toBe('offline');
    expect(server.calls).toEqual([]);
  });

  it('signing out mid-cycle aborts the cycle at the next checkpoint: outcome skipped/aborted, status paused, no error (M7-D2)', async () => {
    const a = await device('A');
    await a.goalService.create({ name: 'Read', why: '', targetType: 'daily', targetValue: 30, startDate: '2026-10-01', endDate: '2026-10-31' }, NOW);
    a.remote.delayMs = 5;
    const p = a.sync.syncNow('manual');
    a.user.id = null;
    const r = await p;
    expect(r).toEqual({ status: 'skipped', why: 'aborted' });
    expect(a.sync.current()).toMatchObject({ kind: 'paused' });
    expect(a.sync.current().error).toBeUndefined();
  });
});

describe('rows the cloud refuses (M7-D1)', () => {
  it('a goal with a 70-char id does not block the others: cycle ok, 4 goals + their entries land, the row stays local as dirty 2, remoteInvalid, pending 0, no re-push', async () => {
    const a = await device('A');
    const long = 'x'.repeat(70);
    const stamp = NOW.toISOString();
    await a.db.goals.bulkPut([
      ...['g1', 'g2', 'g3', 'g4', long].map((id) => ({ ...buildGoal({ id, name: `Goal ${id.slice(0, 4)}`, createdAt: stamp, updatedAt: stamp }), deletedAt: null, dirty: 1 as const })),
    ]);
    await a.db.entries.bulkPut([
      { ...buildEntry({ id: 'e1', goalId: 'g1', updatedAt: stamp }), deletedAt: null, dirty: 1 as const },
      { ...buildEntry({ id: 'e2', goalId: long, updatedAt: stamp }), deletedAt: null, dirty: 1 as const },
    ]);
    const r = await a.sync.syncNow('manual');
    expect(r).toEqual({ status: 'ran', ok: true });
    expect(a.sync.current()).toMatchObject({ kind: 'idle', pending: 0, remoteInvalid: true });
    expect(a.sync.current().error).toBeUndefined();
    expect(server.live('goals', U1).map((g) => g.id).sort()).toEqual(['g1', 'g2', 'g3', 'g4']);
    expect(server.live('entries', U1).map((e) => e.id)).toEqual(['e1']);
    expect((await a.db.goals.get(long))!.dirty).toBe(2);
    expect((await a.db.entries.get('e2'))!.dirty).toBe(2);
    expect(await a.store.countRejected()).toBe(2);
    // Next cycle: nothing is re-pushed, the flag stays visible.
    const pushes = server.calls.filter((c) => c.method === 'push').length;
    await a.sync.syncNow('manual');
    expect(server.calls.filter((c) => c.method === 'push').length).toBe(pushes);
    expect(a.sync.current()).toMatchObject({ kind: 'idle', pending: 0, remoteInvalid: true });
  });
});

describe('account context changes while a cycle runs (M7-D2)', () => {
  it('handleSignedIn for another account aborts the cycle of the previous one before its first request: nothing of u1 is pushed with the new context', async () => {
    let release: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const a = await device('A', { ready: () => gate });
    await a.kv.set('sync', { userId: U1, lastUserId: U1, cursor: { goals: null, entries: null }, lastSyncedAt: null, lastError: null, account: null });
    await a.goalService.create({ name: 'Read', why: '', targetType: 'daily', targetValue: 30, startDate: '2026-10-01', endDate: '2026-10-31' }, NOW);
    const first = a.sync.syncNow('startup'); // u1's cycle, parked at the gate (SDK still loading / session being verified)
    a.user.id = U2;
    const decision = a.sync.handleSignedIn(U2, 'u2@example.com'); // the OAuth callback brought another account
    release();
    expect(await first).toEqual({ status: 'skipped', why: 'aborted' });
    expect(await decision).toBe('confirm-merge');
    expect(server.calls.filter((c) => c.method === 'push')).toEqual([]);
    expect(server.live('goals', U1)).toEqual([]);
    expect(server.live('goals', U2)).toEqual([]);
    expect(a.sync.current()).toMatchObject({ kind: 'paused' });
  });

  it('pause() (session expired / signing in) and reset() abort a running cycle', async () => {
    for (const stop of ['pause', 'reset'] as const) {
      let release: () => void = () => undefined;
      const gate = new Promise<void>((resolve) => {
        release = resolve;
      });
      const a = await device(`A-${stop}`, { ready: () => gate });
      await a.goalService.create({ name: 'Read', why: '', targetType: 'daily', targetValue: 30, startDate: '2026-10-01', endDate: '2026-10-31' }, NOW);
      const before = server.calls.length;
      const p = a.sync.syncNow('manual');
      if (stop === 'pause') a.sync.pause();
      else await a.sync.reset();
      release();
      expect(await p).toEqual({ status: 'skipped', why: 'aborted' });
      expect(server.calls.length).toBe(before);
    }
  });

  it('willAnnounceMerge resolves false when the merge cycle fails (M7-D4), true once it has pushed', async () => {
    const a = await device('A');
    await a.goalService.create({ name: 'Read', why: '', targetType: 'daily', targetValue: 30, startDate: '2026-10-01', endDate: '2026-10-31' }, NOW);
    a.remote.failure = unreachableError();
    const events: SyncEvent[] = [];
    a.sync.onEvent((e) => events.push(e));
    const handled = a.sync.handleSignedIn(U1, 'u1@example.com');
    expect(await a.sync.willAnnounceMerge()).toBe(false);
    await handled;
    expect(events).toEqual([]);
    a.remote.failure = null;
    await a.sync.reset();
    await a.kv.set('sync', { userId: U1, lastUserId: null, cursor: { goals: null, entries: null }, lastSyncedAt: null, lastError: null, account: null });
    await a.sync.handleSignedIn(U1, 'u1@example.com');
    expect(await a.sync.willAnnounceMerge()).toBe(true);
    expect(events.map((e) => e.type)).toEqual(['merge-done']);
  });
});

describe('errors, backoff and retry (M7-AC8, M7-AC13, NFR-15)', () => {
  it('SYNC_UNREACHABLE → error status with nextRetryAt; retries at 30, 60, 120, 240, 480, 900, 900 s; manual bypasses the backoff; success resets', async () => {
    const ft = fakeTimers();
    const a = await device('A', { timers: ft.timers });
    a.remote.failure = unreachableError();
    const delays: number[] = [];
    for (let i = 0; i < 7; i += 1) {
      const r = await a.sync.syncNow(i === 0 ? 'change' : 'retry');
      expect(r).toEqual({ status: 'ran', ok: false, error: 'SYNC_UNREACHABLE' });
      expect(a.sync.current()).toMatchObject({ kind: 'error', error: 'SYNC_UNREACHABLE' });
      const timer = ft.scheduled[ft.scheduled.length - 1];
      delays.push(timer.ms);
      expect(a.sync.current().nextRetryAt).toBe(new Date(NOW.getTime() + timer.ms).toISOString());
    }
    expect(delays).toEqual([30, 60, 120, 240, 480, 900, 900].map((s) => s * 1000));
    // While the retry is pending, change/interval triggers are skipped; manual runs now.
    expect(await a.sync.syncNow('change')).toEqual({ status: 'skipped', why: 'backoff' });
    expect(await a.sync.syncNow('interval')).toEqual({ status: 'skipped', why: 'backoff' });
    const before = server.calls.length;
    a.remote.failure = null;
    expect(await a.sync.syncNow('manual')).toEqual({ status: 'ran', ok: true });
    expect(server.calls.length).toBeGreaterThan(before);
    expect(a.sync.current()).toMatchObject({ kind: 'idle' });
    expect(a.sync.current().nextRetryAt).toBeUndefined();
    expect(ft.scheduled).toHaveLength(0);
    // The next failure starts the ladder again at 30 s.
    a.remote.failure = unreachableError();
    await a.sync.syncNow('change');
    expect(ft.scheduled[ft.scheduled.length - 1].ms).toBe(30_000);
    expect(normalizeSyncMeta((await a.kv.get('sync')) ?? undefined).lastError).toMatchObject({ code: 'SYNC_UNREACHABLE' });
  });

  it('the scheduled retry runs a cycle by itself', async () => {
    const ft = fakeTimers();
    const a = await device('A', { timers: ft.timers });
    a.remote.failure = offlineError();
    await a.sync.syncNow('change');
    expect(a.sync.current()).toMatchObject({ kind: 'offline', error: 'SYNC_OFFLINE' });
    a.remote.failure = null;
    const calls = server.calls.length;
    ft.scheduled[0].fn();
    await new Promise((r) => setTimeout(r, 20));
    expect(server.calls.length).toBeGreaterThan(calls);
    expect(a.sync.current().kind).toBe('idle');
  });

  it('SYNC_UNAUTHORIZED → paused, onUnauthorized called, no retry scheduled, data untouched', async () => {
    const ft = fakeTimers();
    const a = await device('A', { timers: ft.timers });
    let expired = 0;
    (a.sync as unknown as { deps: { auth: { onUnauthorized?: () => void } } }).deps.auth.onUnauthorized = () => {
      expired += 1;
    };
    await a.goalService.create({ name: 'Read', why: '', targetType: 'daily', targetValue: 30, startDate: '2026-10-01', endDate: '2026-10-31' }, NOW);
    a.remote.failure = unauthorizedError();
    expect(await a.sync.syncNow('change')).toEqual({ status: 'ran', ok: false, error: 'SYNC_UNAUTHORIZED' });
    expect(a.sync.current()).toMatchObject({ kind: 'paused', error: 'SYNC_UNAUTHORIZED' });
    expect(expired).toBe(1);
    expect(ft.scheduled).toHaveLength(0);
    expect(await a.store.countDirty()).toBe(1);
    expect(await a.goals.getAll()).toHaveLength(1);
  });

  it('a non-RemoteError failure (e.g. the SDK chunk could not load) is reported as unreachable, never thrown', async () => {
    const a = await device('A');
    (a.sync as unknown as { deps: { loadRemote: () => Promise<unknown> } }).deps.loadRemote = () => Promise.reject(new Error('chunk failed'));
    (a.sync as unknown as { remote: unknown }).remote = null;
    expect(await a.sync.syncNow('manual')).toEqual({ status: 'ran', ok: false, error: 'SYNC_UNREACHABLE' });
  });
});

describe('single-flight and cross-tab lock (M7-AC6 f)', () => {
  it('a second syncNow while one runs is skipped (busy) and re-run once afterwards; manual waits for the running cycle', async () => {
    const a = await device('A');
    a.remote.delayMs = 10;
    const first = a.sync.syncNow('change');
    expect(await a.sync.syncNow('change')).toEqual({ status: 'skipped', why: 'busy' });
    await first;
    await new Promise((r) => setTimeout(r, 120));
    const pulls = server.calls.filter((c) => c.method === 'pushPrefs' || c.method === 'pullPrefs').length;
    expect(pulls).toBe(2); // first cycle + the remembered re-run
    const second = a.sync.syncNow('change');
    const manual = await a.sync.syncNow('manual');
    expect(manual).toEqual({ status: 'ran', ok: true });
    await second;
  });

  it('two services on the same database with a shared LockPort: one runs, the other is skipped; without locks both run and nothing is duplicated', async () => {
    const locks = new MemoryLockPort();
    const a = await device('A', { locks });
    const b = await device('B', { locks, dbName: a.db.name });
    await a.goalService.create({ name: 'Read', why: '', targetType: 'daily', targetValue: 30, startDate: '2026-10-01', endDate: '2026-10-31' }, NOW);
    a.remote.delayMs = 10;
    b.remote.delayMs = 10;
    const [ra, rb] = await Promise.all([a.sync.syncNow('manual'), b.sync.syncNow('manual')]);
    const ran = [ra, rb].filter((r) => r.status === 'ran');
    const skipped = [ra, rb].filter((r) => r.status === 'skipped');
    expect(ran).toHaveLength(1);
    expect(skipped).toEqual([{ status: 'skipped', why: 'busy' }]);

    const c = await device('C', { locks: noLocks });
    const d = await device('D', { locks: noLocks, dbName: c.db.name });
    await c.entryService.add({ goalId: (await c.goalService.create({ name: 'G', why: '', targetType: 'daily', targetValue: 10, startDate: '2026-10-01', endDate: '2026-10-31' }, NOW)).ok ? (await c.goals.getAll())[0].id : '', date: '2026-10-05', minutes: 10, note: '', source: 'manual' }, NOW);
    c.remote.delayMs = 5;
    d.remote.delayMs = 5;
    const [rc, rd] = await Promise.all([c.sync.syncNow('manual'), d.sync.syncNow('manual')]);
    expect([rc, rd]).toEqual([
      { status: 'ran', ok: true },
      { status: 'ran', ok: true },
    ]);
    expect(server.live('goals', U1)).toHaveLength(2);
    expect(server.live('entries', U1)).toHaveLength(1);
    expect(await c.store.countDirty()).toBe(0);
    const snap = await c.snapshot();
    expect(snap.goals).toHaveLength(2);
    expect(snap.entries).toHaveLength(1);
    const remote = serverSnapshot(server, U1);
    expect(remote.goals).toEqual(snap.goals);
    expect(remote.entries).toEqual(snap.entries);
  });
});

describe('sign-in, merge and sign-out (FR-47, FR-41)', () => {
  it('prepareFirstSignIn: never bound → merge-silently; same user → same-user; other user with data → confirm-merge; other user without data → merge-silently', async () => {
    const a = await device('A');
    expect(await a.sync.prepareFirstSignIn(U1)).toBe('merge-silently');
    await a.kv.set('sync', { lastUserId: U1 });
    expect(await a.sync.prepareFirstSignIn(U1)).toBe('same-user');
    expect(await a.sync.prepareFirstSignIn(U2)).toBe('merge-silently');
    await a.goalService.create({ name: 'Read', why: '', targetType: 'daily', targetValue: 30, startDate: '2026-10-01', endDate: '2026-10-31' }, NOW);
    expect(await a.sync.prepareFirstSignIn(U2)).toBe('confirm-merge');
  });

  it('handleSignedIn merges silently on a fresh device: pushes, binds lastUserId, emits merge-done with the live counts', async () => {
    const a = await device('A');
    server.seedRow('goals', U1, { id: 'c1', name: 'Cloud goal', why: '', target_type: 'daily', target_minutes: 15, start_date: '2026-10-01', end_date: '2026-12-31', archived: false, created_at: '2026-10-05T01:00:00.000Z', updated_at: '2026-10-05T01:00:00.000Z', deleted_at: null });
    await a.goalService.create({ name: 'Read', why: '', targetType: 'daily', targetValue: 30, startDate: '2026-10-01', endDate: '2026-10-31' }, NOW);
    const events: SyncEvent[] = [];
    a.sync.onEvent((e) => events.push(e));
    expect(await a.sync.handleSignedIn(U1, 'minh.test@example.com')).toBe('merge-silently');
    expect(events).toEqual([{ type: 'merge-done', goals: 2, entries: 0 }]);
    expect(normalizeSyncMeta((await a.kv.get('sync')) ?? undefined).lastUserId).toBe(U1);
    expect(server.live('goals', U1)).toHaveLength(2);
    // Same user again (startup): no merge toast.
    events.length = 0;
    expect(await a.sync.handleSignedIn(U1, 'minh.test@example.com')).toBe('same-user');
    expect(events).toEqual([]);
  });

  it('handleSignedIn with another account and local data → merge prompt, nothing uploaded; confirmMerge marks everything dirty and pushes; cancel clears the prompt', async () => {
    const a = await device('A');
    await a.kv.set('sync', { lastUserId: U1 });
    await a.localeService.set('vi');
    await a.prefs.applyRemote({ reminder: null, locale: { value: 'vi', updatedAt: NOW.toISOString() } }); // marker present but clean
    await a.goalService.create({ name: 'Read', why: '', targetType: 'daily', targetValue: 30, startDate: '2026-10-01', endDate: '2026-10-31' }, NOW);
    await a.store.applyRemote({ goals: [{ ...(await a.goals.getAll())[0], deletedAt: null }], entries: [] }); // pretend it was synced with u1 (dirty 0)
    expect(await a.store.countDirty()).toBe(0);
    a.user.id = U2;
    a.remote = Object.assign(a.remote, { userId: U2 });
    const prompts: unknown[] = [];
    a.sync.watchMergePrompt().subscribe((p) => prompts.push(p));
    expect(await a.sync.handleSignedIn(U2, 'other.user@example.com')).toBe('confirm-merge');
    expect(prompts[prompts.length - 1]).toEqual({ userId: U2, email: 'other.user@example.com', goals: 1, entries: 0 });
    expect(a.sync.current().kind).toBe('paused');
    expect(await a.sync.syncNow('change')).toEqual({ status: 'skipped', why: 'awaiting-merge' });
    expect(server.calls).toEqual([]);

    a.sync.cancelMerge();
    expect(prompts[prompts.length - 1]).toBeNull();
    expect(await a.sync.handleSignedIn(U2, 'other.user@example.com')).toBe('confirm-merge');

    const events: SyncEvent[] = [];
    a.sync.onEvent((e) => events.push(e));
    expect(await a.sync.confirmMerge()).toEqual({ status: 'ran', ok: true });
    expect(prompts[prompts.length - 1]).toBeNull();
    expect(server.live('goals', U2)).toHaveLength(1);
    expect(server.settings.get(U2)).toMatchObject({ locale: 'vi' });
    expect(events).toEqual([{ type: 'merge-done', goals: 1, entries: 0 }]);
    expect(normalizeSyncMeta((await a.kv.get('sync')) ?? undefined).lastUserId).toBe(U2);
  });

  it('finalSyncBeforeSignOut: online pushes and reports 0 pending; offline reports the pending count; a slow remote times out', async () => {
    const a = await device('A', { signOutTimeoutMs: 30, timers: { setTimeout: (fn, ms) => setTimeout(fn, ms), clearTimeout: (id) => clearTimeout(id as ReturnType<typeof setTimeout>) } });
    await a.goalService.create({ name: 'Read', why: '', targetType: 'daily', targetValue: 30, startDate: '2026-10-01', endDate: '2026-10-31' }, NOW);
    expect(await a.sync.finalSyncBeforeSignOut()).toEqual({ pending: 0 });
    await a.goalService.create({ name: 'Two', why: '', targetType: 'daily', targetValue: 30, startDate: '2026-10-01', endDate: '2026-10-31' }, NOW);
    a.online.value = false;
    expect(await a.sync.finalSyncBeforeSignOut()).toEqual({ pending: 1 });
    expect(server.live('goals', U1)).toHaveLength(1);
    a.online.value = true;
    a.remote.delayMs = 200;
    const slow = await a.sync.finalSyncBeforeSignOut();
    expect(slow.pending).toBe(1);
    await new Promise((r) => setTimeout(r, 600));
  });

  it('reset clears cursors and bookkeeping and pauses', async () => {
    const a = await device('A');
    await a.goalService.create({ name: 'Read', why: '', targetType: 'daily', targetValue: 30, startDate: '2026-10-01', endDate: '2026-10-31' }, NOW);
    await a.sync.syncNow('manual');
    await a.sync.reset();
    const meta = normalizeSyncMeta((await a.kv.get('sync')) ?? undefined);
    expect(meta.cursor).toEqual({ goals: null, entries: null });
    expect(meta.lastSyncedAt).toBeNull();
    expect(a.sync.current()).toMatchObject({ kind: 'paused', lastSyncedAt: null });
  });

  it('willAnnounceMerge: true only for a silent first sign-in with device data; false before any sign-in, for a clean device and after reset', async () => {
    const a = await device('A');
    expect(await a.sync.willAnnounceMerge()).toBe(false);
    await a.goalService.create({ name: 'Read', why: '', targetType: 'daily', targetValue: 30, startDate: '2026-10-01', endDate: '2026-10-31' }, NOW);
    const handled = a.sync.handleSignedIn(U1, 'u1@example.com');
    expect(await a.sync.willAnnounceMerge()).toBe(true);
    expect(await handled).toBe('merge-silently');
    await a.sync.reset();
    expect(await a.sync.willAnnounceMerge()).toBe(false);
    // Same user again, nothing new on the device: no merge report.
    await a.sync.handleSignedIn(U1, 'u1@example.com');
    expect(await a.sync.willAnnounceMerge()).toBe(false);
  });

  it('reset after Sign out → Remove (kv `sync` deleted by clearUserData) does not recreate the row', async () => {
    const a = await device('A');
    await a.goalService.create({ name: 'Read', why: '', targetType: 'daily', targetValue: 30, startDate: '2026-10-01', endDate: '2026-10-31' }, NOW);
    await a.sync.syncNow('manual');
    await a.kv.delete('sync');
    await a.sync.reset();
    expect(await a.kv.get('sync')).toBeUndefined();
    expect(a.sync.current()).toMatchObject({ kind: 'paused', lastSyncedAt: null });
  });

  it('prefs-applied event fires when the cloud changes a preference', async () => {
    const a = await device('A');
    server.seedPrefsRow(U1, { reminder_enabled: true, reminder_time: '07:30', reminder_updated_at: NOW.toISOString(), locale: 'vi', locale_updated_at: NOW.toISOString() });
    const events: SyncEvent[] = [];
    a.sync.onEvent((e) => events.push(e));
    await a.sync.syncNow('manual');
    expect(events).toEqual([{ type: 'prefs-applied', reminderChanged: true, localeChanged: 'vi' }]);
    expect(await a.settingsService.get()).toMatchObject({ reminderEnabled: true, reminderTime: '07:30' });
    expect(await a.kv.get('locale')).toBe('vi');
    events.length = 0;
    await a.sync.syncNow('manual');
    expect(events).toEqual([]);
  });

  it('watchStatus reflects the pending count live and lastSyncedAt written by another tab', async () => {
    const a = await device('A');
    const b = await device('B', { dbName: a.db.name });
    const seen = statuses(a);
    await a.goalService.create({ name: 'Read', why: '', targetType: 'daily', targetValue: 30, startDate: '2026-10-01', endDate: '2026-10-31' }, NOW);
    await new Promise((r) => setTimeout(r, 50));
    expect(seen[seen.length - 1].pending).toBe(1);
    await b.sync.syncNow('manual');
    await new Promise((r) => setTimeout(r, 50));
    expect(seen[seen.length - 1]).toMatchObject({ pending: 0, lastSyncedAt: NOW.toISOString() });
    expect(buildGoal).toBeDefined();
  });
});

// ---- v4.0 (M11-AC7, ADR-33): reset the goals cursor once per device after a schema generation change ----
describe('pull cursor reset once (M11-AC7, ADR-33)', () => {
  const OLD_GOALS = { serverUpdatedAt: '2026-10-08T00:00:00.000Z', id: 'g-old' };
  const OLD_ENTRIES = { serverUpdatedAt: '2026-10-08T00:00:01.000Z', id: 'e-old' };
  const pulls = () => server.calls.filter((c) => c.method === 'pull');

  it('kv sync with cursors and no pullResetVersion: the first cycle pulls goals from null (entries keep their cursor) and stamps version 1; the second cycle uses the stored goals cursor', async () => {
    const a = await device('A');
    await a.kv.set('sync', { userId: U1, lastUserId: U1, account: null, cursor: { goals: OLD_GOALS, entries: OLD_ENTRIES }, lastSyncedAt: null, lastError: null });
    server.seedRow('goals', U1, { id: 'o1', name: 'Meditate', why: '', target_type: 'daily', target_minutes: 10, start_date: '2026-10-01', end_date: null, archived: false, created_at: '2026-09-30T06:00:00.000Z', updated_at: '2026-09-30T06:00:00.000Z', deleted_at: null, server_updated_at: '2026-10-01T00:00:00.000Z' });
    expect(await a.sync.syncNow('manual')).toEqual({ status: 'ran', ok: true });
    const meta = normalizeSyncMeta(await a.kv.get('sync'));
    expect(meta.pullResetVersion).toBe(PULL_RESET_VERSION);
    expect(meta.pullResetVersion).toBe(1);
    expect(pulls().map((c) => [c.table, c.cursor])).toEqual([
      ['goals', null],
      ['entries', rewindCursor(OLD_ENTRIES)],
    ]);
    // The row an older client would have skipped (server stamp before the old cursor) is now on the device.
    expect((await a.goals.getById('o1'))?.endDate).toBeNull();
    expect(meta.cursor.goals).toMatchObject({ id: 'o1' });
    server.calls.length = 0;
    expect(await a.sync.syncNow('manual')).toEqual({ status: 'ran', ok: true });
    expect(pulls()[0]).toMatchObject({ table: 'goals', cursor: rewindCursor(meta.cursor.goals) });
    expect(pulls()[0].cursor).not.toBeNull();
    expect(normalizeSyncMeta(await a.kv.get('sync')).pullResetVersion).toBe(1);
  });

  it('a device already at the current version is left alone (no reset, cursor used as stored)', async () => {
    const a = await device('A');
    await a.kv.set('sync', { userId: U1, lastUserId: U1, account: null, cursor: { goals: OLD_GOALS, entries: null }, lastSyncedAt: null, lastError: null, pullResetVersion: PULL_RESET_VERSION });
    await a.sync.syncNow('manual');
    expect(pulls()[0]).toMatchObject({ table: 'goals', cursor: rewindCursor(OLD_GOALS) });
  });

  /** Count the kv writes that stamp `pullResetVersion` for the first time (the atomic reset of ADR-33). */
  function countStamps(d: Device): () => number {
    const kv = d.kv as unknown as { update: KvRepository['update'] };
    const original = kv.update.bind(d.kv);
    let stamps = 0;
    kv.update = async <T,>(key: KvKey, fn: (current: T | undefined) => T | undefined) => {
      let stamped = false;
      const r = await original<T>(key, (cur) => {
        const out = fn(cur);
        const had = !!cur && typeof cur === 'object' && 'pullResetVersion' in (cur as object);
        if (out && typeof out === 'object' && 'pullResetVersion' in (out as object) && !had) stamped = true;
        return out;
      });
      if (r.written && stamped) stamps += 1;
      return r;
    };
    return () => stamps;
  }

  it('two SyncService instances on the same database running at once (no cross-tab lock) stamp the version exactly once, both cycles succeed', async () => {
    const a1 = await device('A1', { locks: noLocks });
    const a2 = await device('A2', { locks: noLocks, dbName: a1.db.name });
    const stamps1 = countStamps(a1);
    const stamps2 = countStamps(a2);
    await a1.kv.set('sync', { userId: U1, lastUserId: U1, account: null, cursor: { goals: OLD_GOALS, entries: null }, lastSyncedAt: null, lastError: null });
    server.seedRow('goals', U1, { id: 'g1', name: 'Cloud', why: '', target_type: 'daily', target_minutes: 15, start_date: '2026-10-01', end_date: '2026-12-31', archived: false, created_at: '2026-10-05T01:00:00.000Z', updated_at: '2026-10-05T01:00:00.000Z', deleted_at: null });
    a1.remote.delayMs = 5;
    a2.remote.delayMs = 5;
    const [r1, r2] = await Promise.all([a1.sync.syncNow('manual'), a2.sync.syncNow('manual')]);
    expect(r1).toEqual({ status: 'ran', ok: true });
    expect(r2).toEqual({ status: 'ran', ok: true });
    expect(stamps1() + stamps2()).toBe(1);
    const goalPulls = pulls().filter((c) => c.table === 'goals');
    expect(goalPulls).toHaveLength(2);
    expect(goalPulls.some((c) => c.cursor === null)).toBe(true);
    const meta = normalizeSyncMeta(await a1.kv.get('sync'));
    expect(meta.pullResetVersion).toBe(1);
    expect(meta.cursor.goals).toMatchObject({ id: 'g1' });
    expect((await a1.goals.getAll()).map((g) => g.id)).toEqual(['g1']);
    // With the cross-tab lock the second tab skips as busy; the stored state is the same.
    const locks = new MemoryLockPort();
    const b1 = await device('B1', { locks });
    const b2 = await device('B2', { locks, dbName: b1.db.name });
    await b1.kv.set('sync', { userId: U1, lastUserId: U1, account: null, cursor: { goals: OLD_GOALS, entries: null }, lastSyncedAt: null, lastError: null });
    b1.remote.delayMs = 5;
    const [s1, s2] = await Promise.all([b1.sync.syncNow('manual'), b2.sync.syncNow('change')]);
    expect(s1).toEqual({ status: 'ran', ok: true });
    expect(s2).toEqual({ status: 'skipped', why: 'busy' });
    expect(normalizeSyncMeta(await b1.kv.get('sync')).pullResetVersion).toBe(1);
  });

  it('no kv sync (never signed in): nothing is written', async () => {
    const a = await device('A');
    a.user.id = null;
    expect(await a.kv.get('sync')).toBeUndefined();
    expect(await a.sync.syncNow('manual')).toEqual({ status: 'skipped', why: 'paused' });
    expect(await a.kv.get('sync')).toBeUndefined();
  });
});
