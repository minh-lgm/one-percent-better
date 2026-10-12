import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildEntry, buildGoal, datasetS1 } from '../../test/builders';
import { createTestDatabase } from '../../test/db';
import { openDatabase, type AppDatabase } from './db';
import { DexieEntryRepository } from './entry-repo';
import { DexieGoalRepository } from './goal-repo';
import { DexieKvRepository } from './kv-repo';

let db: AppDatabase;
let goals: DexieGoalRepository;
let entries: DexieEntryRepository;
let kv: DexieKvRepository;

beforeEach(async () => {
  db = createTestDatabase();
  await openDatabase(db);
  goals = new DexieGoalRepository(db);
  entries = new DexieEntryRepository(db);
  kv = new DexieKvRepository(db);
});

afterEach(async () => {
  await db.delete();
});

async function seedS1() {
  const data = datasetS1();
  await db.goals.bulkPut(data.goals);
  await db.entries.bulkPut(data.entries);
  return data;
}

describe('DexieGoalRepository', () => {
  it('put / getById / getAll', async () => {
    const g = buildGoal({ id: 'g-1', name: 'Read' });
    await goals.put(g);
    expect(await goals.getById('g-1')).toEqual(g);
    expect(await goals.getAll()).toHaveLength(1);
    expect(await goals.getById('nope')).toBeUndefined();
  });

  it('deleteWithEntries removes the goal and its entries only (M1-AC9)', async () => {
    await seedS1();
    await goals.deleteWithEntries('g2');
    expect(await goals.getById('g2')).toBeUndefined();
    expect(await entries.getByGoal('g2')).toEqual([]);
    expect((await goals.getAll()).length).toBe(4);
    expect((await entries.getByDateRange('2026-01-01', '2026-12-31')).length).toBe(23 - 13);
    // v2 (ADR-20): the rows are tombstones, not gone; one stamp for the goal and its entries.
    const g2 = (await db.goals.get('g2'))!;
    expect(g2.deletedAt).toBe(g2.updatedAt);
    expect(g2.dirty).toBe(1);
    const rows = await db.entries.where('goalId').equals('g2').toArray();
    expect(rows).toHaveLength(13);
    for (const e of rows) expect(e).toMatchObject({ deletedAt: g2.deletedAt, updatedAt: g2.deletedAt, dirty: 1 });
  });

  it('deleteWithEntries rolls back when the entry write fails (M1-AC9)', async () => {
    await seedS1();
    const spy = vi.spyOn(db.entries, 'bulkPut').mockRejectedValueOnce(new Error('boom'));
    await expect(goals.deleteWithEntries('g1')).rejects.toThrow('boom');
    spy.mockRestore();
    expect(await goals.getById('g1')).toBeDefined();
    expect((await db.goals.get('g1'))?.deletedAt ?? null).toBeNull();
    expect(await entries.getByGoal('g1')).toHaveLength(8);
  });

  it('watchAll emits on changes', async () => {
    const seen: number[] = [];
    const unsubscribe = goals.watchAll().subscribe((list) => seen.push(list.length));
    await vi.waitFor(() => expect(seen).toContain(0));
    await goals.put(buildGoal({ id: 'g-1' }));
    await vi.waitFor(() => expect(seen).toContain(1));
    unsubscribe();
  });
});

describe('DexieEntryRepository', () => {
  it('queries by goal, by date range and sums per day', async () => {
    await seedS1();
    expect(await entries.getByGoal('g1')).toHaveLength(8);
    expect(await entries.getByDateRange('2026-10-08', '2026-10-08')).toHaveLength(2);
    expect(await entries.getByDateRange('2026-10-01', '2026-10-31')).toHaveLength(10);
    expect(await entries.sumMinutes('g1', '2026-10-08')).toBe(30);
    expect(await entries.sumMinutes('g1', '2026-10-09')).toBe(0);
  });

  it('sumMinutes can exclude one entry (M1-AC7)', async () => {
    await entries.put(buildEntry({ id: 'e1', goalId: 'g', date: '2026-10-09', minutes: 20 }));
    await entries.put(buildEntry({ id: 'e2', goalId: 'g', date: '2026-10-09', minutes: 10 }));
    expect(await entries.sumMinutes('g', '2026-10-09')).toBe(30);
    expect(await entries.sumMinutes('g', '2026-10-09', 'e1')).toBe(10);
  });

  it('delete and watch', async () => {
    await goals.put(buildGoal({ id: 'g' }));
    await entries.put(buildEntry({ id: 'e1', goalId: 'g', date: '2026-10-09', minutes: 20 }));
    const seen: number[] = [];
    const unsubscribe = entries.watchByDateRange('2026-10-09', '2026-10-09').subscribe((list) => seen.push(list.length));
    await vi.waitFor(() => expect(seen).toContain(1));
    await entries.delete('e1');
    await vi.waitFor(() => expect(seen).toContain(0));
    unsubscribe();
    const byGoal: number[] = [];
    const unsub2 = entries.watchByGoal('g').subscribe((list) => byGoal.push(list.length));
    await vi.waitFor(() => expect(byGoal).toContain(0));
    unsub2();
  });
});

describe('DexieKvRepository', () => {
  it('get / set / delete / watch', async () => {
    expect(await kv.get('locale')).toBeUndefined();
    await kv.set('locale', 'vi');
    expect(await kv.get<string>('locale')).toBe('vi');
    const seen: Array<string | undefined> = [];
    const unsubscribe = kv.watch<string>('locale').subscribe((v) => seen.push(v));
    await vi.waitFor(() => expect(seen).toContain('vi'));
    await kv.delete('locale');
    await vi.waitFor(() => expect(seen).toContain(undefined));
    unsubscribe();
  });
});

describe('DexieKvRepository.update (atomic read-modify-write)', () => {
  it('applies fn inside one transaction; concurrent updates do not lose increments; undefined leaves the row untouched', async () => {
    const db = createTestDatabase();
    await openDatabase(db);
    const kv = new DexieKvRepository(db);
    await Promise.all(Array.from({ length: 20 }, () => kv.update<number>('settings', (n) => (n ?? 0) + 1)));
    expect(await kv.get('settings')).toBe(20);
    const r = await kv.update<number>('settings', () => undefined);
    expect(r).toEqual({ previous: 20, written: false });
    expect(await kv.get('settings')).toBe(20);
    const first = await kv.update<string>('activeTimer', (cur) => (cur === undefined ? 'claimed' : undefined));
    const second = await kv.update<string>('activeTimer', (cur) => (cur === undefined ? 'claimed' : undefined));
    expect(first.written).toBe(true);
    expect(second).toEqual({ previous: 'claimed', written: false });
    await db.delete();
  });
});
