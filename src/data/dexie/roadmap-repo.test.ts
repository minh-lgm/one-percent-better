// M17-AC5 (NFR-27, A-79, ADR-29): DexieRoadmapRepository + the eager roadmap extensions of goal-repo,
// local-data-repo, sync-store (purge) and the pending count, on fake-indexeddb.
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { FIXED_NOW_Q1, datasetQ1 } from '../../test/builders';
import { createTestDatabase } from '../../test/db';
import { isLive } from '../repositories';
import type { AppDatabase } from './db';
import { DexieGoalRepository } from './goal-repo';
import { DexieLocalDataRepository } from './local-data-repo';
import { DexieRoadmapRepository } from './roadmap-repo';
import { DexieSyncStore } from './sync-store';

let db: AppDatabase;
const clock = () => FIXED_NOW_Q1;

async function seedQ1(variant?: 'b' | 'c' | 'e') {
  const d = datasetQ1(variant);
  await db.goals.bulkPut(d.goals.map((g) => ({ ...g, deletedAt: null, dirty: 0 as const })));
  await db.entries.bulkPut(d.entries.map((e) => ({ ...e, deletedAt: null, dirty: 0 as const })));
  await new DexieRoadmapRepository(db, { clock }).putMany({ roadmaps: [d.roadmap], phases: d.phases, items: d.items, checkpoints: d.checkpoints });
  await db.roadmaps.toCollection().modify({ dirty: 0 });
  await db.roadmapPhases.toCollection().modify({ dirty: 0 });
  await db.roadmapItems.toCollection().modify({ dirty: 0 });
  await db.roadmapCheckpoints.toCollection().modify({ dirty: 0 });
  return d;
}

const firstValue = <T>(s: { subscribe(next: (v: T) => void, error?: (e: unknown) => void): () => void }): Promise<T> =>
  new Promise((resolve, reject) => {
    const stop = s.subscribe(
      (v) => {
        resolve(v);
        setTimeout(stop, 0);
      },
      (e) => reject(e as Error),
    );
  });

beforeEach(async () => {
  db = createTestDatabase();
  await db.open();
});
afterEach(() => db.delete());

describe('reads', () => {
  it('putMany writes 32 rows live + dirty; listLive / getAggregate / findByGoal read them back as domain objects', async () => {
    const d = datasetQ1();
    const repo = new DexieRoadmapRepository(db, { clock });
    await repo.putMany({ roadmaps: [d.roadmap], phases: d.phases, items: d.items, checkpoints: d.checkpoints });
    expect(await db.roadmapItems.where('dirty').equals(1).count()).toBe(21);
    expect((await db.roadmaps.get('rq'))?.deletedAt).toBeNull();
    expect(await repo.listLive()).toEqual([d.roadmap]);
    const agg = await repo.getAggregate('rq');
    expect(agg?.roadmap).toEqual(d.roadmap);
    expect(agg?.phases).toHaveLength(5);
    expect(agg?.items).toHaveLength(21);
    expect(agg?.checkpoints).toHaveLength(5);
    expect(agg?.items[0]).not.toHaveProperty('dirty');
    expect(await repo.findByGoal('gq')).toEqual([d.roadmap]);
    expect(await repo.findByGoal('g1')).toEqual([]);
    expect(await repo.getAggregate('nope')).toBeNull();
  });

  it('watchList carries the linked goals and their live entries; watchDetail the one goal; both skip tombstones and children of deleted phases', async () => {
    await seedQ1();
    const repo = new DexieRoadmapRepository(db, { clock });
    const list = await firstValue(repo.watchList());
    expect(list.roadmaps.map((r) => r.id)).toEqual(['rq']);
    expect(list.goals.map((g) => g.id)).toEqual(['gq']);
    expect(list.entries).toHaveLength(6);
    expect(list.roadmapItems).toHaveLength(21);
    const detail = await firstValue(repo.watchDetail('rq'));
    expect(detail?.goal?.name).toBe('QPT study');
    expect(detail?.entries).toHaveLength(6);
    await repo.deletePhase('pq1');
    const after = await firstValue(repo.watchDetail('rq'));
    expect(after?.phases.map((p) => p.id)).toEqual(['pq2', 'pq3', 'pq4', 'pq5']);
    expect(after?.items).toHaveLength(17);
    expect(await firstValue(repo.watchDetail('nope'))).toBeNull();
  });
});

describe('cascading soft deletes (one stamp, one transaction)', () => {
  it('deleteRoadmap → roadmap + 5 phases + 21 items + 5 checkpoints share deletedAt, dirty 1; nothing live remains', async () => {
    await seedQ1();
    const repo = new DexieRoadmapRepository(db, { clock });
    await repo.deleteRoadmap('rq');
    const r = await db.roadmaps.get('rq');
    expect(r?.deletedAt).toBe(FIXED_NOW_Q1.toISOString());
    expect(r?.updatedAt).toBe(r?.deletedAt);
    expect(r?.dirty).toBe(1);
    for (const t of ['roadmapPhases', 'roadmapItems', 'roadmapCheckpoints'] as const) {
      const rows = await db[t].toArray();
      expect(rows.length).toBe(t === 'roadmapItems' ? 21 : 5);
      expect(rows.every((x) => x.deletedAt === r?.deletedAt && x.dirty === 1)).toBe(true);
    }
    expect(await repo.listLive()).toEqual([]);
    expect(await repo.getAggregate('rq')).toBeNull();
    // Idempotent: deleting a tombstone changes nothing.
    await repo.deleteRoadmap('rq');
    expect((await db.roadmaps.get('rq'))?.updatedAt).toBe(FIXED_NOW_Q1.toISOString());
  });

  it('a failure in the middle rolls the whole cascade back (probe)', async () => {
    await seedQ1();
    const repo = new DexieRoadmapRepository(db, {
      clock,
      deleteProbe: () => {
        throw new Error('disk full');
      },
    });
    await expect(repo.deleteRoadmap('rq')).rejects.toThrow('disk full');
    expect((await db.roadmaps.get('rq'))?.deletedAt).toBeNull();
    expect(await db.roadmapItems.filter((i) => !isLive(i)).count()).toBe(0);
    expect(await db.roadmapPhases.where('dirty').equals(1).count()).toBe(0);
  });

  it('deletePhase(pq1) soft-deletes its 4 items and keeps the others; deleteItem / deleteCheckpoint are single soft deletes', async () => {
    await seedQ1();
    const repo = new DexieRoadmapRepository(db, { clock });
    await repo.deletePhase('pq1');
    const items = await db.roadmapItems.toArray();
    expect(items.filter((i) => !isLive(i)).map((i) => i.id).sort()).toEqual(['wq1', 'wq2', 'wq3', 'wq4']);
    expect(items.filter(isLive)).toHaveLength(17);
    expect((await db.roadmapPhases.get('pq1'))?.dirty).toBe(1);
    expect((await db.roadmapPhases.get('pq2'))?.deletedAt).toBeNull();
    await repo.deleteItem('wq5');
    expect((await db.roadmapItems.get('wq5'))).toMatchObject({ deletedAt: FIXED_NOW_Q1.toISOString(), dirty: 1 });
    await repo.deleteCheckpoint('cq1');
    expect((await db.roadmapCheckpoints.get('cq1'))).toMatchObject({ deletedAt: FIXED_NOW_Q1.toISOString(), dirty: 1 });
    expect((await repo.getAggregate('rq'))?.checkpoints).toHaveLength(4);
  });

  it('the stamp is newer than every row of the cascade (FR-49), even with a slow clock', async () => {
    await seedQ1();
    await db.roadmapItems.update('wq3', { updatedAt: '2026-12-01T00:00:00.000Z' });
    const repo = new DexieRoadmapRepository(db, { clock });
    await repo.deleteRoadmap('rq');
    expect((await db.roadmaps.get('rq'))?.deletedAt).toBe('2026-12-01T00:00:00.001Z');
  });
});

describe('goal deletion unlinks (A-79) — DexieGoalRepository.deleteWithEntries', () => {
  it('rq.goalId becomes null with a newer updatedAt and dirty 1, in the same transaction as the goal + entries', async () => {
    await seedQ1();
    const goals = new DexieGoalRepository(db, clock);
    await goals.deleteWithEntries('gq');
    const r = await db.roadmaps.get('rq');
    expect(r?.goalId).toBeNull();
    expect(Date.parse(r!.updatedAt)).toBeGreaterThan(Date.parse('2026-10-27T01:00:00.000Z'));
    expect(r?.dirty).toBe(1);
    expect(r?.deletedAt).toBeNull();
    expect((await db.goals.get('gq'))?.deletedAt).not.toBeNull();
    expect(await db.entries.where('goalId').equals('gq').filter(isLive).count()).toBe(0);
    // Other goals / roadmaps untouched.
    expect((await db.goals.get('g1'))?.deletedAt).toBeNull();
  });

  it('a probe failure leaves goal, entries and roadmap untouched', async () => {
    await seedQ1();
    const goals = new DexieGoalRepository(db, clock, () => {
      throw new Error('boom');
    });
    await expect(goals.deleteWithEntries('gq')).rejects.toThrow('boom');
    expect((await db.goals.get('gq'))?.deletedAt).toBeNull();
    expect(await db.entries.where('goalId').equals('gq').filter(isLive).count()).toBe(6);
    expect((await db.roadmaps.get('rq'))?.goalId).toBe('gq');
    expect((await db.roadmaps.get('rq'))?.dirty).toBe(0);
  });

  it('deleting an unrelated goal does not touch the roadmap; archive is not a delete', async () => {
    await seedQ1();
    await new DexieGoalRepository(db, clock).deleteWithEntries('g1');
    expect((await db.roadmaps.get('rq'))).toMatchObject({ goalId: 'gq', dirty: 0 });
  });
});

describe('local data, purge, pending count', () => {
  it('clearUserData empties the four roadmap tables and keeps locale; countLive = { goals 6, entries 29, roadmaps 1 } for Q1', async () => {
    await seedQ1();
    await db.kv.put({ key: 'locale', value: 'vi' });
    const local = new DexieLocalDataRepository(db);
    expect(await local.countLive()).toEqual({ goals: 6, entries: 29, roadmaps: 1 });
    await new DexieRoadmapRepository(db, { clock }).deleteRoadmap('rq');
    expect(await local.countLive()).toEqual({ goals: 6, entries: 29, roadmaps: 0 });
    await local.clearUserData();
    for (const t of ['roadmaps', 'roadmapPhases', 'roadmapItems', 'roadmapCheckpoints', 'goals', 'entries'] as const) expect(await db[t].count()).toBe(0);
    expect((await db.kv.get('locale'))?.value).toBe('vi');
  });

  it('purgeTombstones hard-deletes roadmap tombstones older than 30 days (ADR-29) and keeps dirty = 1 ones of a device that synced', async () => {
    await seedQ1();
    const repo = new DexieRoadmapRepository(db, { clock });
    await repo.deleteRoadmap('rq');
    const store = new DexieSyncStore(db, clock);
    const later = new Date('2026-12-05T10:00:00+07:00');
    // Never synced: everything purgeable once old enough (dirty 1 is irrelevant).
    expect(await store.purgeTombstones(FIXED_NOW_Q1)).toMatchObject({ roadmaps: 0, roadmapItems: 0 });
    expect(await store.purgeTombstones(later)).toMatchObject({ goals: 0, entries: 0, roadmaps: 1, roadmapPhases: 5, roadmapItems: 21, roadmapCheckpoints: 5 });
    expect(await db.roadmapItems.count()).toBe(0);
    // Synced device: a dirty = 1 tombstone must stay (the deletion still has to be pushed).
    await seedQ1();
    await repo.deleteRoadmap('rq');
    await db.kv.put({ key: 'sync', value: { userId: 'u1', lastUserId: 'u1' } });
    expect(await store.purgeTombstones(later)).toMatchObject({ roadmaps: 0, roadmapItems: 0 });
    await db.roadmaps.toCollection().modify({ dirty: 0 });
    expect(await store.purgeTombstones(later)).toMatchObject({ roadmaps: 1, roadmapItems: 0 });
  });

  it('watchPendingCount counts roadmap rows written by the repository (M18-AC1, FR-78)', async () => {
    await seedQ1();
    const store = new DexieSyncStore(db, clock);
    const before = await store.countDirty();
    const repo = new DexieRoadmapRepository(db, { clock });
    await repo.putRoadmap({ ...datasetQ1().roadmap, id: 'r2', title: 'Spanish B1', goalId: null });
    expect(await store.countDirty()).toBe(before + 1);
    expect(await firstValue(store.watchPendingCount())).toBe(before + 1);
  });
});
