// M14 (ARCH §4.7 b.3, A-61): `SyncService.pauseForAccountDeletion()` / `resumeAfterAccountDeletion()` /
// `reset({ forgetLastUser: true })`.
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { normalizeSyncMeta } from '../data/repositories';
import { FakeRemoteServer } from '../test/fake-remote-store';
import { createDevice, U1, type Device } from '../test/two-devices';

const NOW = new Date('2026-10-09T03:00:00.000Z');
let server: FakeRemoteServer;
let devices: Device[] = [];

beforeEach(() => {
  server = new FakeRemoteServer(() => NOW);
});
afterEach(async () => {
  for (const d of devices) await d.dispose();
  devices = [];
});

async function device(options: Parameters<typeof createDevice>[2] = {}) {
  const d = await createDevice('A', server, { now: NOW, signedIn: true, ...options });
  devices.push(d);
  return d;
}

const meta = async (d: Device) => normalizeSyncMeta((await d.kv.get('sync')) ?? undefined);

describe('pauseForAccountDeletion', () => {
  it('after the pause every syncNow is skipped (paused) whatever the reason; status paused; resume lets it run again', async () => {
    const d = await device();
    await d.sync.pauseForAccountDeletion();
    expect(d.sync.isPausedForDeletion()).toBe(true);
    for (const reason of ['manual', 'change', 'sign-in', 'online', 'retry'] as const) expect(await d.sync.syncNow(reason)).toEqual({ status: 'skipped', why: 'paused' });
    expect(d.sync.current().kind).toBe('paused');
    expect(server.calls).toEqual([]);
    d.sync.resumeAfterAccountDeletion();
    expect(d.sync.isPausedForDeletion()).toBe(false);
    expect(await d.sync.syncNow('manual')).toEqual({ status: 'ran', ok: true });
  });

  it('a cycle already running is waited for (it aborts at its next checkpoint, nothing more is pushed)', async () => {
    let release: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const d = await device({ ready: () => gate });
    await d.goalService.create({ name: 'Read', why: '', targetType: 'daily', targetValue: 30, startDate: '2026-10-01', endDate: '2026-10-31' }, NOW);
    const running = d.sync.syncNow('manual');
    let paused = false;
    const pausing = d.sync.pauseForAccountDeletion().then(() => {
      paused = true;
    });
    await new Promise((r) => setTimeout(r, 5));
    expect(paused).toBe(false); // still waiting for the running cycle
    release();
    await pausing;
    expect(paused).toBe(true);
    // The generation changed under the cycle: it aborted before pushing (M7-D2 checkpoint) → nothing on the server.
    expect(await running).toEqual({ status: 'skipped', why: 'aborted' });
    expect(server.live('goals', U1)).toHaveLength(0);
  });

  it('bounded wait: a cycle that never finishes does not block the pause beyond the timeout', async () => {
    const scheduled: Array<{ fn: () => void }> = [];
    const timers = { setTimeout: (fn: () => void) => (scheduled.push({ fn }), scheduled.length), clearTimeout: () => undefined };
    const d = await device({ ready: () => new Promise<void>(() => undefined), timers });
    void d.sync.syncNow('manual');
    let paused = false;
    const pausing = d.sync.pauseForAccountDeletion(10).then(() => {
      paused = true;
    });
    await new Promise((r) => setTimeout(r, 5));
    expect(paused).toBe(false);
    expect(scheduled).toHaveLength(1);
    scheduled[0].fn(); // the 10 s guard fires
    await pausing;
    expect(paused).toBe(true);
  });
});

describe('reset({ forgetLastUser })', () => {
  it('true: userId, account and lastUserId cleared, cursor/lastSyncedAt reset, deletion flag off; false (default): lastUserId kept as in M7', async () => {
    const d = await device();
    await d.sync.syncNow('manual');
    expect((await meta(d)).lastSyncedAt).toBe(NOW.toISOString());
    await d.sync.pauseForAccountDeletion();
    await d.sync.reset({ forgetLastUser: true });
    expect(await meta(d)).toMatchObject({ userId: null, account: null, lastUserId: null, lastSyncedAt: null, lastError: null, cursor: { goals: null, entries: null } });
    expect(d.sync.isPausedForDeletion()).toBe(false);

    const e = await device();
    await e.sync.reset();
    expect((await meta(e)).lastUserId).toBe(U1);
    expect((await meta(e)).userId).toBe(U1); // AuthService clears userId on sign-out, not reset()
  });

  it('M14-D3: forgetLastUser re-marks every live row and preference group dirty (acknowledged rows included), tombstones untouched; plain reset() does not', async () => {
    const d = await device();
    await d.goalService.create({ name: 'Read', why: '', targetType: 'daily', targetValue: 30, startDate: '2026-10-01', endDate: '2026-10-31' }, NOW);
    await d.localeService.set('vi');
    await d.sync.syncNow('manual');
    expect(await d.store.countDirty()).toBe(0);
    await d.sync.reset();
    expect(await d.store.countDirty()).toBe(0);
    await d.sync.reset({ forgetLastUser: true });
    const dirty = await d.store.getDirty(10);
    expect(dirty.goals.map((g) => g.name)).toEqual(['Read']);
    expect(dirty.entries).toEqual([]);
    expect(await d.prefs.getDirty()).not.toBeNull();
  });
});
