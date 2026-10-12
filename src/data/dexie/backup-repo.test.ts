import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_SETTINGS } from '../../domain/types';
import { buildEntry, buildGoal, datasetS1 } from '../../test/builders';
import { createTestDatabase } from '../../test/db';
import { DexieBackupRepository } from './backup-repo';
import { openDatabase, type AppDatabase } from './db';

let db: AppDatabase;
let repo: DexieBackupRepository;

beforeEach(async () => {
  db = createTestDatabase();
  await openDatabase(db);
  repo = new DexieBackupRepository(db);
});

afterEach(async () => {
  await db.delete();
});

describe('DexieBackupRepository (M3-AC7, M3-AC8, M3-AC9, NFR-04)', () => {
  it('exportAll returns goals, entries and normalised settings', async () => {
    const s1 = datasetS1();
    await db.goals.bulkPut(s1.goals);
    await db.entries.bulkPut(s1.entries);
    const data = await repo.exportAll();
    expect(data.goals).toHaveLength(5);
    expect(data.entries).toHaveLength(23);
    expect(data.settings).toEqual(DEFAULT_SETTINGS);
    await db.kv.put({ key: 'settings', value: { reminderEnabled: true, reminderTime: '07:30' } });
    expect((await repo.exportAll()).settings).toEqual({ ...DEFAULT_SETTINGS, reminderEnabled: true, reminderTime: '07:30' });
  });

  it('replaceAll replaces everything, drops activeTimer and keeps locale', async () => {
    await db.goals.put(buildGoal({ id: 'temp', name: 'Temp' }));
    await db.entries.put(buildEntry({ id: 'temp-e', goalId: 'temp' }));
    await db.kv.bulkPut([
      { key: 'locale', value: 'vi' },
      { key: 'activeTimer', value: { goalId: 'temp', startedAt: '2026-10-09T03:00:00.000Z' } },
      { key: 'settings', value: { ...DEFAULT_SETTINGS, reminderEnabled: true } },
    ]);
    const s1 = datasetS1();
    const settings = { ...DEFAULT_SETTINGS, reminderTime: '21:00' };
    await repo.replaceAll({ goals: s1.goals, entries: s1.entries, settings });
    // v2 (ADR-20): rows not in the file are soft-deleted (so the deletion reaches the account); file rows are live + dirty.
    expect((await db.goals.get('temp'))?.deletedAt).toBeTruthy();
    expect((await db.entries.get('temp-e'))?.deletedAt).toBeTruthy();
    const byId = <T extends { id: string }>(xs: T[]) => [...xs].sort((a, b) => a.id.localeCompare(b.id));
    const exported = await repo.exportAll();
    expect(byId(exported.goals)).toEqual(byId(s1.goals));
    expect(byId(exported.entries)).toEqual(byId(s1.entries));
    expect(await db.goals.where('dirty').equals(1).count()).toBe(6);
    expect(await db.kv.get('settings')).toEqual({ key: 'settings', value: settings });
    expect(await db.kv.get('activeTimer')).toBeUndefined();
    expect(await db.kv.get('locale')).toEqual({ key: 'locale', value: 'vi' });
  });

  it('round-trip: exportAll → new database → replaceAll → deep-equal (every field)', async () => {
    const s1 = datasetS1();
    await db.goals.bulkPut(s1.goals);
    await db.entries.bulkPut(s1.entries);
    const data = await repo.exportAll();
    const db2 = createTestDatabase();
    await openDatabase(db2);
    try {
      const repo2 = new DexieBackupRepository(db2);
      await repo2.replaceAll(data);
      const sortById = <T extends { id: string }>(xs: T[]) => [...xs].sort((a, b) => a.id.localeCompare(b.id));
      const again = await repo2.exportAll();
      expect(sortById(again.goals)).toEqual(sortById(s1.goals));
      expect(sortById(again.entries)).toEqual(sortById(s1.entries));
      expect(JSON.stringify(again)).not.toMatch(/deletedAt|dirty/);
    } finally {
      await db2.delete();
    }
  });

  it('rolls back when something fails mid-way: old data intact, timer still there', async () => {
    await db.goals.put(buildGoal({ id: 'temp', name: 'Temp' }));
    await db.entries.put(buildEntry({ id: 'temp-e', goalId: 'temp' }));
    await db.kv.put({ key: 'activeTimer', value: { goalId: 'temp', startedAt: '2026-10-09T03:00:00.000Z' } });
    const s1 = datasetS1();
    const spy = vi.spyOn(db.entries, 'bulkAdd').mockRejectedValueOnce(new Error('disk full'));
    await expect(repo.replaceAll({ goals: s1.goals, entries: s1.entries, settings: DEFAULT_SETTINGS })).rejects.toThrow('disk full');
    spy.mockRestore();
    const goalsAfter = await db.goals.toArray();
    expect(goalsAfter).toEqual([expect.objectContaining({ id: 'temp' })]);
    expect(goalsAfter[0].deletedAt ?? null).toBeNull();
    const entriesAfter = await db.entries.toArray();
    expect(entriesAfter).toEqual([expect.objectContaining({ id: 'temp-e' })]);
    expect(entriesAfter[0].deletedAt ?? null).toBeNull();
    expect(await db.kv.get('activeTimer')).toBeDefined();
    expect(await db.kv.get('settings')).toBeUndefined();
  });

  it('rolls back on a duplicate key inside the import (bulkAdd rejects)', async () => {
    await db.goals.put(buildGoal({ id: 'temp', name: 'Temp' }));
    const dup = buildGoal({ id: 'same' });
    await expect(repo.replaceAll({ goals: [dup, { ...dup }], entries: [], settings: DEFAULT_SETTINGS })).rejects.toBeDefined();
    expect(await db.goals.toArray()).toEqual([expect.objectContaining({ id: 'temp' })]);
  });
});
