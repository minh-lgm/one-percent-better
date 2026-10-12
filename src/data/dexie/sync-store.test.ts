// `DexieSyncStore` (M7-AC4, ARCHITECTURE §5.2 LocalSyncStore).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Goal, LogEntry } from '../../domain/types';
import { buildEntry, buildGoal, datasetS1 } from '../../test/builders';
import { createTestDatabase } from '../../test/db';
import type { SyncRecord } from '../repositories';
import { openDatabase, type AppDatabase } from './db';
import { DexieEntryRepository } from './entry-repo';
import { DexieGoalRepository } from './goal-repo';
import { DexieSyncStore } from './sync-store';

let db: AppDatabase;
let store: DexieSyncStore;

beforeEach(async () => {
  db = createTestDatabase();
  await openDatabase(db);
  store = new DexieSyncStore(db);
});

afterEach(async () => {
  await db.delete();
});

const T0 = '2026-10-09T03:00:00.000Z';
const T1 = '2026-10-09T03:01:00.000Z';
const T2 = '2026-10-09T03:02:00.000Z';
const rec = <T extends Goal | LogEntry>(x: T, deletedAt: string | null = null): SyncRecord<T> => ({ ...x, deletedAt });

async function seedLive(dirty: 0 | 1 = 1) {
  const s1 = datasetS1();
  await db.goals.bulkPut(s1.goals.map((g) => ({ ...g, deletedAt: null, dirty })));
  await db.entries.bulkPut(s1.entries.map((e) => ({ ...e, deletedAt: null, dirty })));
  return s1;
}

describe('getDirty / countDirty / markAllDirty', () => {
  it('getDirty(2) returns goals before entries, at most 2 per table, including tombstones; countDirty counts rows + dirty pref groups', async () => {
    await seedLive(1);
    await db.goals.update('g5', { deletedAt: T1, updatedAt: T1, dirty: 1 });
    const d = await store.getDirty(2);
    expect(d.goals).toHaveLength(2);
    expect(d.entries).toHaveLength(2);
    expect(Object.keys(d.goals[0])).not.toContain('dirty');
    expect(await store.countDirty()).toBe(28);
    await db.kv.put({ key: 'prefsSync', value: { reminder: { updatedAt: T0, dirty: 1 }, locale: { updatedAt: null, dirty: 0 } } });
    expect(await store.countDirty()).toBe(29);
    const all = await store.getDirty(500);
    expect(all.goals.find((g) => g.id === 'g5')?.deletedAt).toBe(T1);
  });

  it('markAllDirty flags every live row (not tombstones) and reports the count', async () => {
    await seedLive(0);
    await db.goals.update('g5', { deletedAt: T1, updatedAt: T1, dirty: 0 });
    expect(await store.countDirty()).toBe(0);
    expect(await store.markAllDirty()).toBe(4 + 23);
    expect(await db.goals.where('dirty').equals(1).count()).toBe(4);
    expect((await db.goals.get('g5'))?.dirty).toBe(0);
    expect(await store.countDirty()).toBe(27);
  });
});

describe('applyRemote', () => {
  it('is atomic per batch: a failure at row 300 of 500 leaves nothing changed', async () => {
    const goal = buildGoal({ id: 'g', updatedAt: T0 });
    await db.goals.put({ ...goal, deletedAt: null, dirty: 0 });
    const entries = Array.from({ length: 500 }, (_, i) => rec(buildEntry({ id: `e${String(i).padStart(3, '0')}`, goalId: 'g', date: '2026-10-05', minutes: 1, updatedAt: T0 })));
    let n = 0;
    db.entries.hook('creating', function creating() {
      n += 1;
      if (n === 300) throw new Error('simulated failure at row 300');
    });
    await expect(store.applyRemote({ goals: [], entries })).rejects.toThrow('row 300');
    expect(await db.entries.count()).toBe(0);
  });

  it('newer local dirty row is kept (still dirty); equal version only clears dirty; older local is replaced with dirty = 0', async () => {
    await db.goals.bulkPut([
      { ...buildGoal({ id: 'newer', name: 'Local newer', updatedAt: T2 }), deletedAt: null, dirty: 1 },
      { ...buildGoal({ id: 'same', name: 'Same', updatedAt: T1 }), deletedAt: null, dirty: 1 },
      { ...buildGoal({ id: 'older', name: 'Local older', updatedAt: T0 }), deletedAt: null, dirty: 1 },
    ]);
    const r = await store.applyRemote({
      goals: [rec(buildGoal({ id: 'newer', name: 'Remote', updatedAt: T1 })), rec(buildGoal({ id: 'same', name: 'Same', updatedAt: T1 })), rec(buildGoal({ id: 'older', name: 'Remote newer', updatedAt: T1 })), rec(buildGoal({ id: 'new', name: 'Brand new', updatedAt: T0 }))],
      entries: [],
    });
    expect(r).toEqual({ applied: 3, keptLocal: 1, skippedInvalid: 0 });
    expect(await db.goals.get('newer')).toMatchObject({ name: 'Local newer', dirty: 1 });
    expect(await db.goals.get('same')).toMatchObject({ name: 'Same', dirty: 0, updatedAt: T1 });
    expect(await db.goals.get('older')).toMatchObject({ name: 'Remote newer', dirty: 0, updatedAt: T1 });
    expect(await db.goals.get('new')).toMatchObject({ name: 'Brand new', dirty: 0, deletedAt: null });
    // Equal instant, different spelling and different content → the server copy is canonical.
    await store.applyRemote({ goals: [rec(buildGoal({ id: 'same', name: 'Server tie', updatedAt: '2026-10-09T03:01:00+00:00' }))], entries: [] });
    expect(await db.goals.get('same')).toMatchObject({ name: 'Server tie', dirty: 0 });
  });

  it('applying a goal tombstone soft-deletes its live entries with dirty = 1 (cascade)', async () => {
    const s1 = await seedLive(0);
    const g1 = s1.goals[0];
    const r = await store.applyRemote({ goals: [rec({ ...g1, updatedAt: T2 }, T2)], entries: [] });
    expect(r.applied).toBe(1);
    expect(await db.goals.get('g1')).toMatchObject({ deletedAt: T2, dirty: 0 });
    const rows = await db.entries.where('goalId').equals('g1').toArray();
    expect(rows).toHaveLength(8);
    for (const e of rows) expect(e).toMatchObject({ deletedAt: T2, updatedAt: T2, dirty: 1 });
    // The entries are invisible to the app and visible to the next push.
    expect(await new DexieEntryRepository(db).getByGoal('g1')).toEqual([]);
    expect((await store.getDirty(500)).entries).toHaveLength(8);
  });

  it('a remote entry carrying the same version as a cascaded tombstone is accepted without a second write', async () => {
    const s1 = await seedLive(0);
    const g1 = s1.goals[0];
    await store.applyRemote({ goals: [rec({ ...g1, updatedAt: T2 }, T2)], entries: [] });
    const e = s1.entries[0];
    const r = await store.applyRemote({ goals: [], entries: [rec({ ...e, updatedAt: T2 }, T2)] });
    expect(r.applied).toBe(1);
    expect(await db.entries.get(e.id)).toMatchObject({ deletedAt: T2, dirty: 0 });
  });

  it('two stores on the same database applying overlapping batches concurrently end like a sequential run', async () => {
    const other = new DexieSyncStore(db);
    const a = Array.from({ length: 200 }, (_, i) => rec(buildGoal({ id: `g${i}`, name: 'A', updatedAt: T1 })));
    const b = Array.from({ length: 200 }, (_, i) => rec(buildGoal({ id: `g${i + 100}`, name: 'B', updatedAt: T2 })));
    await Promise.all([store.applyRemote({ goals: a, entries: [] }), other.applyRemote({ goals: b, entries: [] })]);
    expect(await db.goals.count()).toBe(300);
    for (let i = 0; i < 300; i += 1) {
      const row = (await db.goals.get(`g${i}`))!;
      expect(row.name).toBe(i >= 100 ? 'B' : 'A');
      expect(row.dirty).toBe(0);
    }
  });
});

describe('tombstoneOrphanEntries and watchPendingCount', () => {
  it('only touches live entries whose goal is soft-deleted', async () => {
    const s1 = await seedLive(0);
    await db.goals.update('g1', { deletedAt: T1, updatedAt: T1 });
    // A raw live entry of the deleted goal (e.g. arrived from the cloud after the tombstone), plus one of a live goal.
    await db.entries.put({ ...buildEntry({ id: 'orphan', goalId: 'g1', date: '2026-10-03', updatedAt: T0 }), deletedAt: null, dirty: 0 });
    await db.entries.put({ ...buildEntry({ id: 'fine', goalId: 'g2', date: '2026-10-03', updatedAt: T0 }), deletedAt: null, dirty: 0 });
    const n = await store.tombstoneOrphanEntries(new Date(T2));
    expect(n).toBe(8 + 1);
    expect(await db.entries.get('orphan')).toMatchObject({ deletedAt: T2, dirty: 1 });
    expect(await db.entries.get('fine')).toMatchObject({ deletedAt: null, dirty: 0 });
    expect(await db.entries.get(s1.entries[0].id)).toMatchObject({ deletedAt: T2, dirty: 1 });
    expect(await store.tombstoneOrphanEntries(new Date(T2))).toBe(0);
  });

  it('watchPendingCount emits after every write and apply', async () => {
    const seen: number[] = [];
    const unsubscribe = store.watchPendingCount().subscribe((n) => seen.push(n));
    await vi.waitFor(() => expect(seen).toContain(0));
    const goals = new DexieGoalRepository(db, () => new Date(T1));
    await goals.put(buildGoal({ id: 'g', updatedAt: T0 }));
    await vi.waitFor(() => expect(seen).toContain(1));
    await new DexieEntryRepository(db).put(buildEntry({ id: 'e', goalId: 'g', updatedAt: T0 }));
    await vi.waitFor(() => expect(seen).toContain(2));
    await store.applyRemote({ goals: [rec(buildGoal({ id: 'g', updatedAt: T0 }))], entries: [rec(buildEntry({ id: 'e', goalId: 'g', updatedAt: T0 }))] });
    await vi.waitFor(() => expect(seen[seen.length - 1]).toBe(0));
    unsubscribe();
  });
});
