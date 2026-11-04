// M18-AC3 / AC5 (FR-78, FR-79, FR-47, ADR-50, ADR-52): the sync cycle over the roadmap group — missing tables on the
// cloud, pre-phase-8 cursors, a 500 on a roadmap table, merge into another account.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { normalizeSyncMeta } from '../data/repositories';
import { rewindCursor } from '../domain/sync';
import { datasetQ1 } from '../test/builders';
import { FakeRemoteServer, unreachableError } from '../test/fake-remote-store';
import { createDevice, serverSnapshot, U1, U2, type Device } from '../test/two-devices';

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

async function device(name: string, options: Parameters<typeof createDevice>[2] = {}) {
  const d = await createDevice(name, server, { now: NOW, signedIn: true, ...options });
  devices.push(d);
  return d;
}

/** Q1 on a device: goals + entries through the tables (dirty 1), the roadmap through the repository. */
async function seedQ1(d: Device) {
  const q1 = datasetQ1();
  await d.db.goals.bulkPut(q1.goals.map((g) => ({ ...g, deletedAt: null, dirty: 1 as const })));
  await d.db.entries.bulkPut(q1.entries.map((e) => ({ ...e, deletedAt: null, dirty: 1 as const })));
  await d.seedRoadmap(q1);
  return q1;
}

const dirtyRoadmapRows = (d: Device) => d.store.countDirty('roadmap');

describe('cloud without the roadmap tables (M18-AC3, ADR-52)', () => {
  it('syncNow is ok: goals/entries land and clear, the 32 roadmap rows stay dirty 1, roadmapsUnavailable true, no expired session, markRejected never called for them; once the tables exist the next cycle uploads them and clears the flag', async () => {
    server.roadmapTables = false;
    const a = await device('A');
    const onUnauthorized = vi.fn();
    (a.sync as unknown as { deps: { auth: { onUnauthorized?: () => void } } }).deps.auth.onUnauthorized = onUnauthorized;
    const markRejected = vi.spyOn(a.store, 'markRejected');
    await seedQ1(a);
    expect(await a.store.countDirty()).toBe(35 + 32);

    const r = await a.sync.syncNow('manual');
    expect(r).toEqual({ status: 'ran', ok: true });
    expect(await a.store.countDirty('core')).toBe(0);
    expect(await dirtyRoadmapRows(a)).toBe(32);
    expect(server.live('goals', U1)).toHaveLength(6);
    expect(server.live('entries', U1)).toHaveLength(29);
    expect(server.live('roadmaps', U1)).toEqual([]);
    expect(a.sync.current()).toMatchObject({ kind: 'idle', roadmapsUnavailable: true, pending: 32, lastSyncedAt: NOW.toISOString() });
    expect(a.sync.current().error).toBeUndefined();
    expect(a.sync.current().nextRetryAt).toBeUndefined();
    expect(onUnauthorized).not.toHaveBeenCalled();
    expect(markRejected).not.toHaveBeenCalled();
    // Exactly one roadmap request per cycle (the first push), then the group is skipped: no pull of the four tables.
    const roadmapCalls = server.calls.filter((c) => c.table && c.table.startsWith('roadmap'));
    expect(roadmapCalls).toHaveLength(1);
    expect(roadmapCalls[0]).toMatchObject({ method: 'push', table: 'roadmaps' });
    const meta = normalizeSyncMeta(await a.kv.get('sync'));
    expect(meta.cursor.goals).not.toBeNull();
    expect(meta.cursor.roadmaps).toBeNull();
    expect(meta.lastError).toBeNull();

    // A second cycle while the tables are still missing: same outcome, the goals pull still runs.
    server.calls.length = 0;
    expect(await a.sync.syncNow('manual')).toEqual({ status: 'ran', ok: true });
    expect(server.calls.filter((c) => c.method === 'pull' && c.table === 'goals')).toHaveLength(1);
    expect(a.sync.current().roadmapsUnavailable).toBe(true);

    // The user runs the migration (U31).
    server.roadmapTables = true;
    expect(await a.sync.syncNow('manual')).toEqual({ status: 'ran', ok: true });
    expect(await dirtyRoadmapRows(a)).toBe(0);
    expect(await a.store.countDirty()).toBe(0);
    expect(a.sync.current().roadmapsUnavailable).toBeUndefined();
    expect(a.sync.current()).toMatchObject({ kind: 'idle', pending: 0 });
    expect(server.live('roadmaps', U1)).toHaveLength(1);
    expect(server.live('roadmap_phases', U1)).toHaveLength(5);
    expect(server.live('roadmap_items', U1)).toHaveLength(21);
    expect(server.live('roadmap_checkpoints', U1)).toHaveLength(5);
    expect(normalizeSyncMeta(await a.kv.get('sync')).cursor.roadmap_items).toMatchObject({ id: expect.any(String) });
  });

  it('with nothing to push, the missing tables are discovered on the pull and the cycle is still ok', async () => {
    server.roadmapTables = false;
    const a = await device('A');
    await a.goalService.create({ name: 'Read', why: '', targetType: 'daily', targetValue: 30, startDate: '2026-10-01', endDate: null }, NOW);
    expect(await a.sync.syncNow('manual')).toEqual({ status: 'ran', ok: true });
    expect(a.sync.current()).toMatchObject({ kind: 'idle', roadmapsUnavailable: true, pending: 0 });
    const pulls = server.calls.filter((c) => c.method === 'pull').map((c) => c.table);
    expect(pulls).toEqual(['goals', 'entries', 'roadmaps']);
  });

  it('reset() clears the flag', async () => {
    server.roadmapTables = false;
    const a = await device('A');
    await a.sync.syncNow('manual');
    expect(a.sync.current().roadmapsUnavailable).toBe(true);
    await a.sync.reset();
    expect(a.sync.current().roadmapsUnavailable).toBeUndefined();
  });
});

describe('a device that synced before phase 8 (M18-AC3)', () => {
  it('kv sync with the two M7 cursors: the first cycle pulls the four roadmap tables from null and goals/entries from their stored cursors (not reset)', async () => {
    const a = await device('A');
    const OLD_GOALS = { serverUpdatedAt: '2026-10-08T00:00:00.000Z', id: 'g-old' };
    const OLD_ENTRIES = { serverUpdatedAt: '2026-10-08T00:00:01.000Z', id: 'e-old' };
    await a.kv.set('sync', { userId: U1, lastUserId: U1, account: null, cursor: { goals: OLD_GOALS, entries: OLD_ENTRIES }, lastSyncedAt: null, lastError: null, pullResetVersion: 1 });
    const b = await device('B');
    const q1 = await seedQ1(b);
    expect(await b.sync.syncNow('manual')).toEqual({ status: 'ran', ok: true });
    server.calls.length = 0;
    expect(await a.sync.syncNow('manual')).toEqual({ status: 'ran', ok: true });
    expect(server.calls.filter((c) => c.method === 'pull').map((c) => [c.table, c.cursor])).toEqual([
      ['goals', rewindCursor(OLD_GOALS)],
      ['entries', rewindCursor(OLD_ENTRIES)],
      ['roadmaps', null],
      ['roadmap_phases', null],
      ['roadmap_items', null],
      ['roadmap_checkpoints', null],
    ]);
    const snap = await a.snapshot();
    expect(snap.roadmaps).toHaveLength(1);
    expect(snap.roadmapItems).toHaveLength(21);
    expect(snap.roadmapItems.find((i) => i.id === 'wq1')).toMatchObject({ actualEnd: '2026-11-01', title: q1.items[0].title });
    const meta = normalizeSyncMeta(await a.kv.get('sync'));
    for (const t of ['roadmaps', 'roadmap_phases', 'roadmap_items', 'roadmap_checkpoints'] as const) expect(meta.cursor[t]).toMatchObject({ id: expect.any(String) });
    // The second cycle pulls from the stored roadmap cursors.
    server.calls.length = 0;
    await a.sync.syncNow('manual');
    expect(server.calls.find((c) => c.method === 'pull' && c.table === 'roadmap_items')?.cursor).toEqual(rewindCursor(meta.cursor.roadmap_items));
  });
});

describe('ordinary failures on a roadmap table are ordinary sync errors (M18-AC3)', () => {
  it('a 500 on roadmap_items → the cycle fails with SYNC_UNREACHABLE, error status with nextRetryAt (backoff); the next manual cycle succeeds', async () => {
    const a = await device('A');
    await seedQ1(a);
    a.remote.failure = unreachableError();
    a.remote.failTable = 'roadmap_items';
    a.remote.failTimes = 1;
    const r = await a.sync.syncNow('manual');
    expect(r).toEqual({ status: 'ran', ok: false, error: 'SYNC_UNREACHABLE' });
    expect(a.sync.current()).toMatchObject({ kind: 'error', error: 'SYNC_UNREACHABLE', nextRetryAt: new Date(NOW.getTime() + 30_000).toISOString() });
    expect(a.sync.current().roadmapsUnavailable).toBeUndefined();
    expect(normalizeSyncMeta(await a.kv.get('sync')).lastError).toMatchObject({ code: 'SYNC_UNREACHABLE' });
    // The roadmap and its phases were pushed before the failing table; the items are still waiting.
    expect(server.live('roadmaps', U1)).toHaveLength(1);
    expect(await dirtyRoadmapRows(a)).toBeGreaterThan(0);
    a.remote.failTable = null;
    expect(await a.sync.syncNow('manual')).toEqual({ status: 'ran', ok: true });
    expect(await a.store.countDirty()).toBe(0);
    expect(a.sync.current()).toMatchObject({ kind: 'idle', pending: 0 });
  });
});

describe('merge into another account, sign out (M18-AC5, FR-47, FR-41)', () => {
  it('"Add to account" marks the 32 roadmap rows dirty and pushes them to the new account', async () => {
    const a = await device('A');
    await seedQ1(a);
    await a.sync.syncNow('manual');
    expect(await a.store.countDirty()).toBe(0);
    expect(serverSnapshot(server, U1).roadmapItems).toHaveLength(21);
    // Another account signs in on this device: D5, then "Add to account".
    a.user.id = U2;
    a.remote = new (await import('../test/fake-remote-store')).FakeRemoteStore(server, U2);
    (a.sync as unknown as { remote: unknown }).remote = a.remote;
    expect(await a.sync.handleSignedIn(U2, 'other.user@example.com')).toBe('confirm-merge');
    const markAllDirty = vi.spyOn(a.store, 'markAllDirty');
    const r = await a.sync.confirmMerge();
    expect(r).toEqual({ status: 'ran', ok: true });
    expect(markAllDirty).toHaveBeenCalledTimes(1);
    expect(await markAllDirty.mock.results[0].value).toBe(35 + 32);
    const u2 = serverSnapshot(server, U2);
    expect(u2.roadmaps).toHaveLength(1);
    expect(u2.roadmapPhases).toHaveLength(5);
    expect(u2.roadmapItems).toHaveLength(21);
    expect(u2.roadmapCheckpoints).toHaveLength(5);
    expect(u2.goals).toHaveLength(6);
    expect(await a.store.countDirty()).toBe(0);
  });

  it('prepareFirstSignIn asks (confirm-merge) when the device holds only roadmaps for another account', async () => {
    const a = await device('A');
    await a.db.goals.clear();
    await a.db.entries.clear();
    await a.seedRoadmap(datasetQ1());
    expect(await a.localData.countLive()).toEqual({ goals: 0, entries: 0, roadmaps: 1 });
    expect(await a.sync.prepareFirstSignIn(U2)).toBe('confirm-merge');
  });

  it('"Sign out → Remove data" empties the four roadmap tables with the rest', async () => {
    const a = await device('A');
    await seedQ1(a);
    await a.sync.syncNow('manual');
    await a.localData.clearUserData();
    for (const t of ['roadmaps', 'roadmapPhases', 'roadmapItems', 'roadmapCheckpoints', 'goals', 'entries'] as const) expect(await a.db[t].count()).toBe(0);
    expect(await a.kv.get('sync')).toBeUndefined();
    // The account still has everything (sign-out never deletes in the cloud).
    expect(serverSnapshot(server, U1).roadmapItems).toHaveLength(21);
  });
});
