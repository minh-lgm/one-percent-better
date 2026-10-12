// Soft delete is invisible to phase-1 behaviour (M7-AC2, FR-48, ADR-20).
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS } from '../../domain/types';
import { buildEntry, buildGoal, datasetS1 } from '../../test/builders';
import { createTestDatabase } from '../../test/db';
import { DexieBackupRepository } from './backup-repo';
import { openDatabase, type AppDatabase } from './db';
import { DexieEntryRepository } from './entry-repo';
import { DexieGoalRepository } from './goal-repo';
import { DexieLocalDataRepository } from './local-data-repo';
import { DexieTimerRepository } from './timer-repo';

let db: AppDatabase;
const NOW = new Date('2026-10-09T03:00:00.000Z');
let goals: DexieGoalRepository;
let entries: DexieEntryRepository;

beforeEach(async () => {
  db = createTestDatabase();
  await openDatabase(db);
  goals = new DexieGoalRepository(db, () => NOW);
  entries = new DexieEntryRepository(db, () => NOW);
  const s1 = datasetS1();
  await db.goals.bulkPut(s1.goals);
  await db.entries.bulkPut(s1.entries);
});

afterEach(async () => {
  await db.delete();
});

describe('soft delete (M7-AC2)', () => {
  it('deleteWithEntries: goal and its 8 entries carry deletedAt = updatedAt = clock, dirty = 1; every read hides them', async () => {
    await goals.deleteWithEntries('g1');
    expect((await goals.getAll()).map((g) => g.id)).not.toContain('g1');
    expect(await entries.getByGoal('g1')).toEqual([]);
    expect((await entries.getByDateRange('2026-10-01', '2026-10-31')).filter((e) => e.goalId === 'g1')).toEqual([]);
    const g1 = (await db.goals.get('g1'))!;
    expect(g1).toMatchObject({ deletedAt: NOW.toISOString(), updatedAt: NOW.toISOString(), dirty: 1 });
    const rows = await db.entries.where('goalId').equals('g1').toArray();
    expect(rows).toHaveLength(8);
    for (const e of rows) expect(e).toMatchObject({ deletedAt: NOW.toISOString(), dirty: 1 });
    expect(await entries.sumMinutes('g1', '2026-10-01')).toBe(0);
  });

  it('EntryRepository.delete tombstones the row; getById returns undefined; sumMinutes skips it', async () => {
    await entries.delete('e-g1-1');
    expect(await entries.getById('e-g1-1')).toBeUndefined();
    expect(await db.entries.get('e-g1-1')).toMatchObject({ deletedAt: NOW.toISOString(), dirty: 1 });
    expect(await entries.sumMinutes('g1', '2026-10-01')).toBe(0);
    // Deleting again is a no-op (no second stamp).
    await entries.delete('e-g1-1');
    expect(await db.entries.get('e-g1-1')).toMatchObject({ updatedAt: NOW.toISOString() });
  });

  it('a live entry of a deleted goal (raw write) is hidden from every query, watch and export', async () => {
    await goals.deleteWithEntries('g5');
    await db.entries.put({ ...buildEntry({ id: 'ghost', goalId: 'g5', date: '2026-06-30', minutes: 5 }), deletedAt: null, dirty: 0 });
    expect(await entries.getByDateRange('2026-06-30', '2026-06-30')).toEqual([]);
    expect(await entries.getByGoal('g5')).toEqual([]);
    const seen: number[] = [];
    const stop = entries.watchByDateRange('2026-06-30', '2026-06-30').subscribe((list) => seen.push(list.length));
    await new Promise((r) => setTimeout(r, 50));
    stop();
    expect(seen).toEqual([0]);
    const data = await new DexieBackupRepository(db).exportAll();
    expect(data.goals.map((g) => g.id)).toEqual(['g1', 'g2', 'g3', 'g4']);
    expect(data.entries).toHaveLength(22);
    expect(JSON.stringify(data)).not.toMatch(/deletedAt|dirty/);
  });

  it('saveTimerEntry on a soft-deleted goal → goal-missing', async () => {
    await goals.deleteWithEntries('g1');
    await db.kv.put({ key: 'activeTimer', value: { goalId: 'g1', startedAt: '2026-10-09T02:00:00.000Z' } });
    const r = await new DexieTimerRepository(db).saveTimerEntry({ goalId: 'g1', startedAt: '2026-10-09T02:00:00.000Z' }, buildEntry({ id: 't', goalId: 'g1', date: '2026-10-09', source: 'timer' }), 1440);
    expect(r).toEqual({ status: 'goal-missing' });
  });

  it('replaceAll on a database with a stray goal soft-deletes it and leaves exactly S1 visible (round-trip deep-equal)', async () => {
    await goals.put(buildGoal({ id: 'temp', name: 'Temp' }));
    const s1 = datasetS1();
    const repo = new DexieBackupRepository(db, () => NOW);
    await repo.replaceAll({ goals: s1.goals, entries: s1.entries, settings: DEFAULT_SETTINGS });
    const byId = <T extends { id: string }>(xs: T[]) => [...xs].sort((a, b) => a.id.localeCompare(b.id));
    expect(byId(await goals.getAll())).toEqual(byId(s1.goals));
    expect(await db.goals.get('temp')).toMatchObject({ deletedAt: NOW.toISOString(), dirty: 1 });
    expect(await new DexieLocalDataRepository(db).countLive()).toEqual({ goals: 5, entries: 23 });
  });

  it('countLive ignores tombstones and entries of deleted goals; clearUserData also removes tombstones', async () => {
    await goals.deleteWithEntries('g2');
    expect(await new DexieLocalDataRepository(db).countLive()).toEqual({ goals: 4, entries: 10 });
    await new DexieLocalDataRepository(db).clearUserData();
    expect(await db.goals.count()).toBe(0);
    expect(await db.entries.count()).toBe(0);
  });
});
