// M17-AC5 (NFR-27, ADR-48): a Dexie v2 database (S1 + kv sync + timer + locale) opened by the v3 app keeps
// every row byte for byte, reports `verno 3`, and the four roadmap tables exist and are empty.
import Dexie, { type Table } from 'dexie';
import { describe, expect, it } from 'vitest';
import type { Goal, LogEntry } from '../../domain/types';
import { datasetS1 } from '../../test/builders';
import { AppDatabase, openDatabase, ROADMAP_TABLES, upgradeToV2, type KvRecord } from './db';
import { DexieEntryRepository } from './entry-repo';
import { DexieGoalRepository } from './goal-repo';
import type { EntryRow, GoalRow } from '../repositories';

/** The schema the M7 … M15 builds shipped (versions 1 and 2, IndexedDB version 20). */
class V2Database extends Dexie {
  goals!: Table<GoalRow, string, Goal & Partial<GoalRow>>;
  entries!: Table<EntryRow, string, LogEntry & Partial<EntryRow>>;
  kv!: Table<KvRecord, string>;
  constructor(name: string) {
    super(name);
    this.version(1).stores({ goals: 'id', entries: 'id, goalId, date, [goalId+date]', kv: 'key' });
    this.version(2)
      .stores({ goals: 'id, dirty', entries: 'id, goalId, date, [goalId+date], dirty', kv: 'key' })
      .upgrade((tx) => upgradeToV2(tx));
  }
}

let n = 0;
const freshName = () => `v3-test-${Date.now()}-${++n}`;
const SYNC = { userId: 'u1', lastUserId: 'u1', account: { email: 'minh.test@example.com', name: 'Minh Test' }, cursor: { goals: null, entries: { serverUpdatedAt: '2026-10-09T00:00:00.000Z', id: 'e-g1-8' } }, lastSyncedAt: '2026-10-09T00:00:00.000Z', lastError: null };
const TIMER = { goalId: 'g1', startedAt: '2026-10-09T02:00:00.000Z' };
const byId = <T extends { id: string }>(xs: T[]) => [...xs].sort((a, b) => a.id.localeCompare(b.id));

describe('v2 → v3 (M17-AC5)', () => {
  it('S1 + kv sync/timer/locale survive; verno 3 (IndexedDB 30); the four roadmap tables exist and are empty', async () => {
    const name = freshName();
    const v2 = new V2Database(name);
    await v2.open();
    expect(v2.verno).toBe(2);
    const s1 = datasetS1();
    await v2.goals.bulkAdd(s1.goals.map((g) => ({ ...g, deletedAt: null, dirty: 0 })));
    await v2.entries.bulkAdd(s1.entries.map((e) => ({ ...e, deletedAt: null, dirty: 0 })));
    await v2.kv.bulkAdd([
      { key: 'sync', value: SYNC },
      { key: 'activeTimer', value: TIMER },
      { key: 'locale', value: 'vi' },
    ]);
    const goalsBefore = await v2.goals.toArray();
    const entriesBefore = await v2.entries.toArray();
    v2.close();

    const db = new AppDatabase(name);
    await openDatabase(db);
    expect(db.verno).toBe(3);
    expect(db.backendDB().version).toBe(30);
    expect(byId(await db.goals.toArray())).toEqual(byId(goalsBefore));
    expect(byId(await db.entries.toArray())).toEqual(byId(entriesBefore));
    expect(await new DexieGoalRepository(db).getAll()).toHaveLength(5);
    expect((await new DexieEntryRepository(db).getByDateRange('2026-01-01', '2026-12-31')).length).toBe(23);
    expect((await db.kv.get('sync'))?.value).toEqual(SYNC);
    expect((await db.kv.get('activeTimer'))?.value).toEqual(TIMER);
    expect((await db.kv.get('locale'))?.value).toBe('vi');
    expect(await db.kv.get('prefsSync')).toBeUndefined(); // no v2 upgrade ran: the row was never written
    for (const t of ROADMAP_TABLES) {
      expect(db.tables.map((x) => x.name)).toContain(t);
      expect(await db[t].count()).toBe(0);
    }
    db.close();
  });

  it('a v1 database still goes v1 → v2 → v3 in one open (rows live + dirty, prefsSync written)', async () => {
    const name = freshName();
    const v1 = new Dexie(name);
    v1.version(1).stores({ goals: 'id', entries: 'id, goalId, date, [goalId+date]', kv: 'key' });
    await v1.open();
    const s1 = datasetS1();
    await v1.table('goals').bulkAdd(s1.goals);
    await v1.table('entries').bulkAdd(s1.entries);
    await v1.table('kv').add({ key: 'locale', value: 'vi' });
    v1.close();
    const db = new AppDatabase(name);
    await openDatabase(db);
    expect(db.verno).toBe(3);
    expect((await db.goals.toArray()).every((g) => g.deletedAt === null && g.dirty === 1)).toBe(true);
    expect(await db.kv.get('prefsSync')).toBeDefined();
    expect(await db.roadmaps.count()).toBe(0);
    db.close();
  });

  it('a fresh database opens straight at v3', async () => {
    const db = new AppDatabase(freshName());
    await openDatabase(db);
    expect(db.verno).toBe(3);
    expect(db.tables.map((t) => t.name).sort()).toEqual(['entries', 'goals', 'kv', 'roadmapCheckpoints', 'roadmapItems', 'roadmapPhases', 'roadmaps']);
    db.close();
  });
});
