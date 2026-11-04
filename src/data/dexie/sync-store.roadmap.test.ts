// M18-AC1 (FR-78, NFR-27, ADR-50): `DexieSyncStore` over the six synced tables with dataset Q1.
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Roadmap, RoadmapCheckpoint, RoadmapItem, RoadmapPhase } from '../../domain/roadmap';
import { datasetQ1, FIXED_NOW_Q1 } from '../../test/builders';
import { createTestDatabase } from '../../test/db';
import { normalizeSyncMeta, type SyncRecord } from '../repositories';
import { openDatabase, type AppDatabase } from './db';
import { DexieRoadmapRepository } from './roadmap-repo';
import { DexieSyncStore } from './sync-store';

let db: AppDatabase;
let store: DexieSyncStore;

beforeEach(async () => {
  db = createTestDatabase();
  await openDatabase(db);
  store = new DexieSyncStore(db, () => FIXED_NOW_Q1);
});

afterEach(async () => {
  await db.delete();
});

const Q1_STAMP = '2026-10-27T01:00:00.000Z';
const LATER = '2026-11-04T03:00:00.000Z';
const EARLIER = '2026-10-20T00:00:00.000Z';
const rec = <T extends Roadmap | RoadmapPhase | RoadmapItem | RoadmapCheckpoint>(x: T, patch: Partial<T> & { deletedAt?: string | null } = {}): SyncRecord<T> => ({ ...x, deletedAt: null, ...patch });

/** Q1 as stored rows (dirty flag chosen by the test). */
async function seedQ1(dirty: 0 | 1 = 1) {
  const d = datasetQ1();
  await db.goals.bulkPut(d.goals.map((g) => ({ ...g, deletedAt: null, dirty })));
  await db.entries.bulkPut(d.entries.map((e) => ({ ...e, deletedAt: null, dirty })));
  await db.roadmaps.bulkPut(d.roadmaps.map((r) => ({ ...r, deletedAt: null, dirty })));
  await db.roadmapPhases.bulkPut(d.phases.map((p) => ({ ...p, deletedAt: null, dirty })));
  await db.roadmapItems.bulkPut(d.items.map((i) => ({ ...i, deletedAt: null, dirty })));
  await db.roadmapCheckpoints.bulkPut(d.checkpoints.map((c) => ({ ...c, deletedAt: null, dirty })));
  return d;
}

const liveCount = async () => ({
  roadmaps: (await db.roadmaps.toArray()).filter((r) => r.deletedAt === null).length,
  phases: (await db.roadmapPhases.toArray()).filter((r) => r.deletedAt === null).length,
  items: (await db.roadmapItems.toArray()).filter((r) => r.deletedAt === null).length,
  checkpoints: (await db.roadmapCheckpoints.toArray()).filter((r) => r.deletedAt === null).length,
});

describe('getDirty / countDirty / markAllDirty over six tables', () => {
  it('Q1 → countDirty 6 + 29 + 32; getDirty(500) carries roadmaps before phases before items before checkpoints; a group reads only its tables', async () => {
    await seedQ1(1);
    expect(await store.countDirty()).toBe(6 + 29 + 1 + 5 + 21 + 5);
    expect(await store.countDirty('core')).toBe(35);
    expect(await store.countDirty('roadmap')).toBe(32);
    const d = await store.getDirty(500);
    expect(Object.keys(d)).toEqual(['goals', 'entries', 'roadmaps', 'roadmapPhases', 'roadmapItems', 'roadmapCheckpoints']);
    expect(d.roadmaps.map((r) => r.id)).toEqual(['rq']);
    expect(d.roadmapPhases).toHaveLength(5);
    expect(d.roadmapItems).toHaveLength(21);
    expect(d.roadmapCheckpoints).toHaveLength(5);
    expect(Object.keys(d.roadmapItems[0])).not.toContain('dirty');
    expect(d.roadmapItems[0].deletedAt).toBeNull();
    const core = await store.getDirty(500, 'core');
    expect(core.goals).toHaveLength(6);
    expect(core.roadmaps).toEqual([]);
    expect(core.roadmapItems).toEqual([]);
    const roadmap = await store.getDirty(500, 'roadmap');
    expect(roadmap.goals).toEqual([]);
    expect(roadmap.entries).toEqual([]);
    expect(roadmap.roadmapItems).toHaveLength(21);
    expect((await store.getDirty(3, 'roadmap')).roadmapItems).toHaveLength(3);
  });

  it('markAllDirty flags the live rows of the four roadmap tables too (FR-47)', async () => {
    await seedQ1(0);
    await db.roadmapItems.update('wq21', { deletedAt: LATER, updatedAt: LATER, dirty: 0 });
    expect(await store.countDirty()).toBe(0);
    expect(await store.markAllDirty()).toBe(6 + 29 + 1 + 5 + 20 + 5);
    expect(await store.countDirty('roadmap')).toBe(31);
    expect((await db.roadmapItems.get('wq21'))?.dirty).toBe(0);
  });

  it('watchPendingCount rises by 32 when Q1 is written through the roadmap repository', async () => {
    const seen: number[] = [];
    const stop = store.watchPendingCount().subscribe((n) => seen.push(n));
    await new Promise((r) => setTimeout(r, 20));
    const d = datasetQ1();
    await new DexieRoadmapRepository(db, { clock: () => FIXED_NOW_Q1 }).putMany({ roadmaps: d.roadmaps, phases: d.phases, items: d.items, checkpoints: d.checkpoints });
    await new Promise((r) => setTimeout(r, 50));
    stop();
    expect(seen[0]).toBe(0);
    expect(seen[seen.length - 1]).toBe(32);
    expect(await store.countDirty()).toBe(32);
  });
});

describe('applyRemote: LWW and cascades over the roadmap tables', () => {
  it('a newer remote roadmap tombstone soft-deletes its 31 live children with dirty 1, in one transaction', async () => {
    const d = await seedQ1(0);
    const r = await store.applyRemote({ goals: [], entries: [], roadmaps: [rec(d.roadmap, { updatedAt: LATER, deletedAt: LATER })] });
    expect(r).toEqual({ applied: 1, keptLocal: 0, skippedInvalid: 0 });
    expect(await liveCount()).toEqual({ roadmaps: 0, phases: 0, items: 0, checkpoints: 0 });
    expect((await db.roadmaps.get('rq'))).toMatchObject({ deletedAt: LATER, dirty: 0 });
    const children = [...(await db.roadmapPhases.toArray()), ...(await db.roadmapItems.toArray()), ...(await db.roadmapCheckpoints.toArray())];
    expect(children).toHaveLength(31);
    for (const c of children) {
      expect(c.dirty).toBe(1);
      expect(c.deletedAt).toBe(LATER);
      expect(c.updatedAt).toBe(LATER);
    }
    expect(await store.countDirty()).toBe(31);
  });

  it('is atomic: a failure while cascading leaves the roadmap and every child untouched', async () => {
    const d = await seedQ1(0);
    let n = 0;
    db.roadmapItems.hook('updating', function updating() {
      n += 1;
      if (n === 10) throw new Error('simulated failure at item 10');
    });
    await expect(store.applyRemote({ goals: [], entries: [], roadmaps: [rec(d.roadmap, { updatedAt: LATER, deletedAt: LATER })] })).rejects.toThrow('item 10');
    expect(await liveCount()).toEqual({ roadmaps: 1, phases: 5, items: 21, checkpoints: 5 });
    expect((await db.roadmaps.get('rq'))?.deletedAt).toBeNull();
  });

  it('a phase tombstone soft-deletes the 4 items of that phase only; a tombstone for a phase this device never held still cascades', async () => {
    const d = await seedQ1(0);
    const p1 = d.phases[0];
    const r = await store.applyRemote({ goals: [], entries: [], roadmapPhases: [rec(p1, { updatedAt: LATER, deletedAt: LATER })] });
    expect(r.applied).toBe(1);
    const items = await db.roadmapItems.toArray();
    const gone = items.filter((i) => i.deletedAt !== null);
    expect(gone.map((i) => i.id).sort()).toEqual(['wq1', 'wq2', 'wq3', 'wq4']);
    for (const i of gone) expect(i).toMatchObject({ dirty: 1, deletedAt: LATER });
    expect(items.filter((i) => i.deletedAt === null)).toHaveLength(17);
    expect(await liveCount()).toEqual({ roadmaps: 1, phases: 4, items: 17, checkpoints: 5 });
    // A phase the device never stored: nothing to write for it, its items still go.
    await db.roadmapPhases.delete('pq2');
    await store.applyRemote({ goals: [], entries: [], roadmapPhases: [rec(d.phases[1], { updatedAt: LATER, deletedAt: LATER })] });
    expect((await db.roadmapItems.toArray()).filter((i) => i.deletedAt === null)).toHaveLength(13);
  });

  it('a remote row older than the local one is kept (keep-local, still dirty); an equal version only clears dirty; a newer one replaces the row with dirty 0', async () => {
    const d = await seedQ1(1);
    const w2 = d.items[1];
    const r = await store.applyRemote({ goals: [], entries: [], roadmapItems: [rec(w2, { updatedAt: EARLIER, note: 'old' }), rec(d.items[2], { updatedAt: Q1_STAMP }), rec(d.items[3], { updatedAt: LATER, note: 'new', actualEnd: '2026-11-03' })] });
    expect(r).toEqual({ applied: 2, keptLocal: 1, skippedInvalid: 0 });
    expect(await db.roadmapItems.get('wq2')).toMatchObject({ note: '', dirty: 1, updatedAt: Q1_STAMP });
    expect(await db.roadmapItems.get('wq3')).toMatchObject({ dirty: 0, updatedAt: Q1_STAMP });
    expect(await db.roadmapItems.get('wq4')).toMatchObject({ dirty: 0, note: 'new', actualEnd: '2026-11-03', updatedAt: LATER });
    // Only the stored fields land (nothing the cloud might add).
    expect(Object.keys((await db.roadmapItems.get('wq4'))!).sort()).toEqual(['actualEnd', 'actualStart', 'createdAt', 'deletedAt', 'dirty', 'id', 'note', 'phaseId', 'plannedEnd', 'plannedStart', 'position', 'roadmapId', 'title', 'updatedAt']);
  });

  it('a remote checkpoint and roadmap row for a device without them are stored as given (new rows)', async () => {
    const d = datasetQ1();
    const r = await store.applyRemote({ goals: [], entries: [], roadmaps: [rec(d.roadmap)], roadmapCheckpoints: [rec(d.checkpoints[0])] });
    expect(r).toEqual({ applied: 2, keptLocal: 0, skippedInvalid: 0 });
    expect(await db.roadmaps.get('rq')).toMatchObject({ title: 'QPT 21 tuần', goalId: 'gq', weeklyTargetMinutes: 480, dirty: 0 });
    expect(await db.roadmapCheckpoints.get('cq1')).toMatchObject({ title: 'Diagnostic', date: '2026-09-24', score: 5, maxScore: 32, threshold: null, dirty: 0 });
  });
});

describe('tombstoneOrphanEntries over the roadmap tables', () => {
  it('soft-deletes items whose phase is deleted and checkpoints/phases/items whose roadmap is deleted, plus entries of a deleted goal; counts them', async () => {
    const d = await seedQ1(0);
    // Phase pq1 deleted on another device (cascade missed, e.g. items pulled after the tombstone): 4 orphans.
    await db.roadmapPhases.update('pq1', { deletedAt: LATER, updatedAt: LATER, dirty: 0 });
    expect(await store.tombstoneOrphanEntries(FIXED_NOW_Q1)).toBe(4);
    expect((await db.roadmapItems.toArray()).filter((i) => i.deletedAt !== null).map((i) => i.id).sort()).toEqual(['wq1', 'wq2', 'wq3', 'wq4']);
    for (const id of ['wq1', 'wq2']) expect(await db.roadmapItems.get(id)).toMatchObject({ dirty: 1, deletedAt: FIXED_NOW_Q1.toISOString() });
    // Nothing left to do.
    expect(await store.tombstoneOrphanEntries(FIXED_NOW_Q1)).toBe(0);
    // Now the roadmap itself is a tombstone: the 4 remaining phases, 17 live items and 5 checkpoints follow.
    await db.roadmaps.update('rq', { deletedAt: LATER, updatedAt: LATER, dirty: 0 });
    expect(await store.tombstoneOrphanEntries(FIXED_NOW_Q1)).toBe(4 + 17 + 5);
    expect(await liveCount()).toEqual({ roadmaps: 0, phases: 0, items: 0, checkpoints: 0 });
    // Entries of a deleted goal still work as before (M7).
    await db.goals.update('gq', { deletedAt: LATER, updatedAt: LATER, dirty: 0 });
    expect(await store.tombstoneOrphanEntries(FIXED_NOW_Q1)).toBe(d.entries.filter((e) => e.goalId === 'gq').length);
  });
});

describe('rejected rows and cursors', () => {
  it('markRejected flags roadmap rows still at dirty 1 and excludes them from getDirty/countDirty; countRejected counts six tables', async () => {
    await seedQ1(1);
    expect(await store.markRejected({ goals: [], entries: [], roadmapItems: ['wq1', 'wq2'], roadmapCheckpoints: ['cq1'], roadmaps: ['nope'] })).toBe(3);
    expect((await db.roadmapItems.get('wq1'))?.dirty).toBe(2);
    expect(await store.countDirty('roadmap')).toBe(29);
    expect((await store.getDirty(500, 'roadmap')).roadmapItems.map((i) => i.id)).not.toContain('wq1');
    expect(await store.countRejected()).toBe(3);
    await db.goals.update('g1', { dirty: 2 });
    expect(await store.countRejected()).toBe(4);
    // A second markRejected on the same rows changes nothing (only dirty 1 rows are flagged).
    expect(await store.markRejected({ goals: [], entries: [], roadmapItems: ['wq1'] })).toBe(0);
  });

  it('normalizeSyncMeta with the two M7 cursor keys yields the four roadmap cursors as null and keeps goals/entries', () => {
    const c = { serverUpdatedAt: '2026-10-08T00:00:00.000Z', id: 'x' };
    const meta = normalizeSyncMeta({ userId: 'u', lastUserId: 'u', account: null, cursor: { goals: c, entries: c }, lastSyncedAt: null, lastError: null });
    expect(meta.cursor).toEqual({ goals: c, entries: c, roadmaps: null, roadmap_phases: null, roadmap_items: null, roadmap_checkpoints: null });
  });

  it('purgeTombstones still reports the six tables (delegated to purge-tombstones.ts)', async () => {
    await seedQ1(0);
    expect(await store.purgeTombstones(FIXED_NOW_Q1)).toEqual({ goals: 0, entries: 0, roadmaps: 0, roadmapPhases: 0, roadmapItems: 0, roadmapCheckpoints: 0 });
  });
});
