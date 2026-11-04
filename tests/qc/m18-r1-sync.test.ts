// QC M18 round 1 — independent probes of the roadmap sync (AC1 store, AC2 mapper/remote, AC3 service, AC4 two devices,
// AC5 merge/sign-out). Written without reading the developer's tests; uses only public helpers (datasetQ1, two-devices).
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { DexieSyncStore } from '../../src/data/dexie/sync-store';
import { openDatabase, type AppDatabase } from '../../src/data/dexie/db';
import { normalizeSyncMeta } from '../../src/data/repositories';
import {
  mapRoadmapCheckpointRows,
  mapRoadmapItemRows,
  mapRoadmapPhaseRows,
  mapRoadmapRows,
  roadmapCheckpointToRow,
  roadmapItemToRow,
  roadmapPhaseToRow,
  roadmapToRow,
} from '../../src/integration/supabase/mapper';
import { datasetQ1, FIXED_NOW_Q1 } from '../../src/test/builders';
import { createTestDatabase } from '../../src/test/db';
import { FakeRemoteServer } from '../../src/test/fake-remote-store';
import { createDevice, serverSnapshotAll, U1, U2, type Device } from '../../src/test/two-devices';

const NOW = new Date('2026-11-04T03:00:00.000Z');

describe('AC1 store (independent)', () => {
  let db: AppDatabase;
  let store: DexieSyncStore;
  beforeEach(async () => {
    db = createTestDatabase();
    await openDatabase(db);
    store = new DexieSyncStore(db, () => FIXED_NOW_Q1);
    const d = datasetQ1();
    await db.goals.bulkPut(d.goals.map((g) => ({ ...g, deletedAt: null, dirty: 0 as const })));
    await db.roadmaps.bulkPut(d.roadmaps.map((r) => ({ ...r, deletedAt: null, dirty: 1 as const })));
    await db.roadmapPhases.bulkPut(d.phases.map((r) => ({ ...r, deletedAt: null, dirty: 1 as const })));
    await db.roadmapItems.bulkPut(d.items.map((r) => ({ ...r, deletedAt: null, dirty: 1 as const })));
    await db.roadmapCheckpoints.bulkPut(d.checkpoints.map((r) => ({ ...r, deletedAt: null, dirty: 1 as const })));
  });
  afterEach(async () => db.delete());

  it('32 dirty roadmap rows, parents first', async () => {
    expect(await store.countDirty()).toBe(32);
    const d = await store.getDirty(500);
    expect(Object.entries(d as unknown as Record<string, unknown[]>).filter(([, v]) => v.length > 0).map(([k]) => k)).toEqual(['roadmaps', 'roadmapPhases', 'roadmapItems', 'roadmapCheckpoints']);
  });

  it('remote tombstone of rq newer -> 31 children soft-deleted dirty; idempotent; older tombstone keeps local and does not cascade', async () => {
    const rq = (await db.roadmaps.get('rq'))!;
    const older = { ...rq, deletedAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' };
    const r0 = await store.applyRemote({ roadmaps: [older] } as never);
    expect(r0.keptLocal).toBe(1);
    expect((await db.roadmapItems.toArray()).filter((i) => i.deletedAt === null)).toHaveLength(21);
    const newer = { ...rq, deletedAt: '2026-11-05T00:00:00.000Z', updatedAt: '2026-11-05T00:00:00.000Z' };
    const r1 = await store.applyRemote({ roadmaps: [newer] } as never);
    expect(r1.applied).toBe(1);
    for (const t of ['roadmapPhases', 'roadmapItems', 'roadmapCheckpoints'] as const) {
      const rows = await db[t].toArray();
      expect(rows.every((r) => r.deletedAt !== null && r.dirty === 1)).toBe(true);
    }
    expect((await db.roadmaps.get('rq'))!.dirty).toBe(0);
    await store.applyRemote({ roadmaps: [newer] } as never);
    expect(await db.roadmapItems.count()).toBe(21);
  });

  it('phase tombstone cascades only to its own items; orphan cleanup counts', async () => {
    const phs = await db.roadmapPhases.toArray();
    const ph = phs[0]!;
    const own = (await db.roadmapItems.toArray()).filter((i) => i.phaseId === ph.id).length;
    await store.applyRemote({ roadmapPhases: [{ ...ph, deletedAt: '2026-11-05T00:00:00.000Z', updatedAt: '2026-11-05T00:00:00.000Z' }] } as never);
    const gone = (await db.roadmapItems.toArray()).filter((i) => i.deletedAt !== null);
    expect(gone).toHaveLength(own);
    expect(gone.every((i) => i.phaseId === ph.id)).toBe(true);
    const ph2 = phs[1]!;
    await db.roadmapPhases.update(ph2.id, { deletedAt: '2026-11-05T00:00:00.000Z', dirty: 1 });
    const n = await store.tombstoneOrphanEntries(FIXED_NOW_Q1);
    expect(n).toBe((await db.roadmapItems.toArray()).filter((i) => i.phaseId === ph2.id).length);
    expect(await store.tombstoneOrphanEntries(FIXED_NOW_Q1)).toBe(0);
  });

  it('markAllDirty reaches all 4 roadmap tables; normalizeSyncMeta fills the four cursors', async () => {
    await db.roadmaps.toCollection().modify({ dirty: 0 });
    await db.roadmapPhases.toCollection().modify({ dirty: 0 });
    await db.roadmapItems.toCollection().modify({ dirty: 0 });
    await db.roadmapCheckpoints.toCollection().modify({ dirty: 0 });
    await store.markAllDirty();
    expect(await store.countDirty('roadmap')).toBe(32);
    const m = normalizeSyncMeta({ cursor: { goals: { a: 1 }, entries: { b: 2 } } } as never) as unknown as { cursor: Record<string, unknown> };
    expect(Object.keys(m.cursor).sort()).toEqual(['entries', 'goals', 'roadmap_checkpoints', 'roadmap_items', 'roadmap_phases', 'roadmaps']);
    expect(m.cursor.roadmaps).toBeNull();
    expect(m.cursor.roadmap_checkpoints).toBeNull();
  });
});

describe('AC2 mapper / error mapping (independent)', () => {
  const sync = { created_at: '2026-10-27T01:00:00.000Z', updated_at: '2026-10-27T01:00:00.000Z', deleted_at: null, server_updated_at: '2026-10-27T01:00:01.000Z' };
  const cp = { id: 'c1', roadmap_id: 'r', title: 'T', note: '', date: '2026-11-01', max_score: '32.0', threshold: null, score: 5, ...sync };
  const item = { id: 'i1', roadmap_id: 'r', phase_id: 'p', title: 'W1', note: '', position: 1, planned_start: '2026-11-01', planned_end: '2026-11-07', actual_start: null, actual_end: null, ...sync };

  it('numeric string/number -> 32; NaN position, reversed planned, 201-char title dropped; extra checks', () => {
    expect(mapRoadmapCheckpointRows([cp]).rows[0]!.maxScore).toBe(32);
    expect(mapRoadmapCheckpointRows([{ ...cp, max_score: 32 }]).rows[0]!.maxScore).toBe(32);
    expect(mapRoadmapCheckpointRows([{ ...cp, max_score: 'abc' }]).skippedInvalid).toBe(1);
    expect(mapRoadmapCheckpointRows([{ ...cp, score: 33 }]).skippedInvalid).toBe(1);
    expect(mapRoadmapItemRows([{ ...item, position: 'NaN' }]).skippedInvalid).toBe(1);
    expect(mapRoadmapItemRows([{ ...item, planned_start: '2026-11-08' }]).skippedInvalid).toBe(1);
    expect(mapRoadmapItemRows([{ ...item, title: 'x'.repeat(201) }]).skippedInvalid).toBe(1);
    expect(mapRoadmapItemRows([{ ...item, actual_start: '2026-11-05', actual_end: '2026-11-04' }]).skippedInvalid).toBe(1);
    expect(mapRoadmapItemRows([{ ...item, planned_end: '2027-12-31' }]).skippedInvalid).toBe(1);
    expect(mapRoadmapItemRows([item]).rows).toHaveLength(1);
    expect(mapRoadmapPhaseRows([{ id: 'p', roadmap_id: 'r', title: 'P', note: 'x'.repeat(121), position: 1, ...sync }]).skippedInvalid).toBe(1);
    expect(mapRoadmapRows([{ id: 'r', title: 'R', note: '', goal_id: null, weekly_target_minutes: 29, milestone_label: '', milestone_date: null, ...sync }]).skippedInvalid).toBe(1);
    expect(mapRoadmapRows([{ id: 'r', title: 'R', note: '', goal_id: null, weekly_target_minutes: 120, milestone_label: '', milestone_date: '2026-02-30', ...sync }]).skippedInvalid).toBe(1);
  });

  it('round trip through *ToRow for all 4 Q1 tables', () => {
    const q = datasetQ1();
    const wrap = (x: object) => ({ ...x, deletedAt: null }) as never;
    const back = (rows: Record<string, unknown>[]) => rows.map((r) => ({ ...r, server_updated_at: '2026-11-04T00:00:00.000Z' }));
    expect(mapRoadmapRows(back(q.roadmaps.map((r) => roadmapToRow(wrap(r), U1)))).rows).toEqual(q.roadmaps.map(wrap));
    expect(mapRoadmapPhaseRows(back(q.phases.map((r) => roadmapPhaseToRow(wrap(r), U1)))).rows).toEqual(q.phases.map(wrap));
    expect(mapRoadmapItemRows(back(q.items.map((r) => roadmapItemToRow(wrap(r), U1)))).rows).toEqual(q.items.map(wrap));
    expect(mapRoadmapCheckpointRows(back(q.checkpoints.map((r) => roadmapCheckpointToRow(wrap(r), U1)))).rows).toEqual(q.checkpoints.map(wrap));
  });

  it('403 42501 on roadmaps -> tableMissing; on goals -> SYNC_UNAUTHORIZED; 404 PGRST205 on entries is NOT tableMissing', async () => {
    // eslint-disable-next-line no-restricted-syntax -- QC unit probe of the pure error mapper (no SDK is created)
    const { toRemoteError } = await import('../../src/integration/supabase/supabase-client');
    const e1 = toRemoteError(403, { code: '42501', message: 'permission denied' } as never, undefined, 'roadmaps');
    expect(e1.tableMissing).toBe(true);
    expect(e1.code).not.toBe('SYNC_UNAUTHORIZED');
    const e2 = toRemoteError(403, { code: '42501', message: 'permission denied' } as never, undefined, 'goals');
    expect(e2.code).toBe('SYNC_UNAUTHORIZED');
    expect(e2.tableMissing).toBeFalsy();
    const e3 = toRemoteError(404, { code: 'PGRST205', message: 'x' } as never, undefined, 'entries');
    expect(e3.tableMissing).toBeFalsy();
    const e4 = toRemoteError(401, { code: 'PGRST301', message: 'jwt' } as never, undefined, 'roadmap_items');
    expect(e4.code).toBe('SYNC_UNAUTHORIZED');
    expect(toRemoteError(500, { code: 'XX000', message: 'boom' } as never, undefined, 'roadmap_items').tableMissing).toBeFalsy();
  });
});

describe('AC3-5 service + two devices (independent)', () => {
  let server: FakeRemoteServer;
  let devices: Device[] = [];
  beforeEach(() => {
    server = new FakeRemoteServer(() => NOW);
  });
  afterEach(async () => {
    for (const d of devices) await d.dispose();
    devices = [];
  });
  const mk = async (name: string, o: Parameters<typeof createDevice>[2] = {}) => {
    const d = await createDevice(name, server, { now: NOW, signedIn: true, ...o });
    devices.push(d);
    return d;
  };
  const seed = async (d: Device) => {
    const q = datasetQ1();
    await d.db.goals.bulkPut(q.goals.map((g) => ({ ...g, deletedAt: null, dirty: 1 as const })));
    await d.db.entries.bulkPut(q.entries.map((e) => ({ ...e, deletedAt: null, dirty: 1 as const })));
    await d.seedRoadmap(q);
    return q;
  };

  it('missing tables: ok, core clean, 32 dirty, flag on, later edit stays dirty; re-enable -> clean and flag off', async () => {
    server.roadmapTables = false;
    const a = await mk('A');
    await seed(a);
    const r = await a.sync.syncNow('manual');
    expect(r).toMatchObject({ status: 'ran', ok: true });
    expect(await a.store.countDirty('core')).toBe(0);
    expect(await a.store.countDirty('roadmap')).toBe(32);
    expect(a.sync.current().roadmapsUnavailable).toBe(true);
    expect(a.sync.current().kind).not.toBe('expired');
    await a.roadmapService.setItemDone('wq1', true, '2026-11-04');
    await a.sync.syncNow('manual');
    expect(await a.store.countDirty('roadmap')).toBe(32);
    server.roadmapTables = true;
    await a.sync.syncNow('manual');
    expect(await a.store.countDirty()).toBe(0);
    expect(a.sync.current().roadmapsUnavailable).toBeFalsy();
    expect(server.live('roadmap_items', U1)).toHaveLength(21);
  });

  it('A creates Q1 -> B identical (all 6 tables, every field)', async () => {
    const a = await mk('A');
    const b = await mk('B');
    await seed(a);
    await a.sync.syncNow('manual');
    await b.sync.syncNow('manual');
    const sa = await a.snapshotAll();
    expect(sa.roadmapItems).toHaveLength(21);
    expect(await b.snapshotAll()).toEqual(sa);
    expect(serverSnapshotAll(server, U1)).toEqual(sa);
  });

  it('A deletes roadmap while B (offline) adds an item to it -> both converge, nothing live left', async () => {
    const a = await mk('A');
    const b = await mk('B');
    await seed(a);
    await a.sync.syncNow('manual');
    await b.sync.syncNow('manual');
    a.clock.now = new Date(NOW.getTime() + 60_000);
    await a.roadmapService.remove('rq');
    b.clock.now = new Date(NOW.getTime() + 120_000);
    const p = (await b.db.roadmapPhases.toArray())[0]!;
    await b.roadmapService.addItem(p.id, { title: 'late', note: '', plannedStart: '2026-11-04', plannedEnd: '2026-11-05' } as never, '2026-11-04');
    for (const d of [a, b, a, b, a]) {
      d.clock.now = new Date(NOW.getTime() + 300_000);
      await d.sync.syncNow('manual');
    }
    const sa = await a.snapshotAll();
    expect(await b.snapshotAll()).toEqual(sa);
    expect(serverSnapshotAll(server, U1)).toEqual(sa);
    expect(sa.roadmapItems).toHaveLength(0);
    expect(await a.store.countDirty()).toBe(0);
    expect(await b.store.countDirty()).toBe(0);
  });

  it('markAllDirty carries the 32 roadmap rows; clearUserData empties the 4 tables', async () => {
    const a = await mk('A', { userId: U2, signedIn: false });
    await seed(a);
    await a.db.roadmaps.toCollection().modify({ dirty: 0 });
    await a.db.roadmapPhases.toCollection().modify({ dirty: 0 });
    await a.db.roadmapItems.toCollection().modify({ dirty: 0 });
    await a.db.roadmapCheckpoints.toCollection().modify({ dirty: 0 });
    await a.store.markAllDirty();
    expect(await a.store.countDirty('roadmap')).toBe(32);
    await a.localData.clearUserData();
    for (const t of ['roadmaps', 'roadmapPhases', 'roadmapItems', 'roadmapCheckpoints'] as const) expect(await a.db[t].count()).toBe(0);
  });
});
