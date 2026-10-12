// QC M7 round 1 — Dexie v1 → v2 (M7-AC1, M7-AC17, NFR-14) from the QC side: the data comes from the shipped
// fixture e2e/fixtures/sample-backup.json (not the dev builders), the v1 schema is re-declared here, an
// interrupted upgrade is retried, and the migrated database is exercised through the real services.
import { readFileSync } from 'node:fs';
import Dexie from 'dexie';
import { afterEach, describe, expect, it } from 'vitest';
import { AppDatabase, openDatabase, PHASE1_PREF_STAMP } from '../../src/data/dexie/db';
import { DexieBackupRepository } from '../../src/data/dexie/backup-repo';
import { DexieGoalRepository } from '../../src/data/dexie/goal-repo';
import { DexieSyncStore } from '../../src/data/dexie/sync-store';
import { StorageError, type Goal, type LogEntry } from '../../src/domain/types';

interface Sample { goals: Goal[]; entries: LogEntry[]; settings: Record<string, unknown> }
const SAMPLE = JSON.parse(readFileSync(new URL('../../e2e/fixtures/sample-backup.json', import.meta.url), 'utf8')) as Sample;

class V1 extends Dexie {
  goals!: Dexie.Table<Goal, string>;
  entries!: Dexie.Table<LogEntry, string>;
  kv!: Dexie.Table<{ key: string; value: unknown }, string>;
  constructor(name: string) {
    super(name);
    this.version(1).stores({ goals: 'id', entries: 'id, goalId, date, [goalId+date]', kv: 'key' });
  }
}

const names: string[] = [];
let n = 0;
const fresh = () => {
  const name = `qc-m7-mig-${Date.now()}-${++n}`;
  names.push(name);
  return name;
};
afterEach(async () => {
  for (const name of names.splice(0)) await Dexie.delete(name);
});

const TIMER = { goalId: 'g1', startedAt: '2026-10-09T02:30:00.000Z' };
const SETTINGS = { reminderEnabled: true, reminderTime: '07:30', lastReminderDate: '2026-10-08', lastBackupAt: '2026-10-01T00:00:00.000Z', plusOneShown: { g1: '2026-10-07' } };
const sortById = <T extends { id: string }>(xs: T[]) => [...xs].sort((a, b) => a.id.localeCompare(b.id));

async function seed(name: string) {
  const v1 = new V1(name);
  await v1.open();
  await v1.goals.bulkAdd(SAMPLE.goals);
  await v1.entries.bulkAdd(SAMPLE.entries);
  await v1.kv.bulkAdd([
    { key: 'activeTimer', value: TIMER },
    { key: 'settings', value: SETTINGS },
    { key: 'locale', value: 'vi' },
  ]);
  v1.close();
}

describe('QC: v1 → v2 with the shipped sample (5 goals, 23 entries)', () => {
  it('fixture is what the AC says', () => {
    expect(SAMPLE.goals).toHaveLength(5);
    expect(SAMPLE.entries).toHaveLength(23);
  });

  it('every field of every goal/entry survives; rows are live + dirty; kv untouched except the new prefsSync; backup export equals the fixture', async () => {
    const name = fresh();
    await seed(name);
    const db = new AppDatabase(name);
    await openDatabase(db);
    const rawGoals = sortById(await db.goals.toArray());
    const rawEntries = sortById(await db.entries.toArray());
    expect(rawGoals).toHaveLength(5);
    expect(rawEntries).toHaveLength(23);
    // Strip the two new markers: what remains is byte-for-byte the phase-1 row.
    expect(rawGoals.map(({ deletedAt: _d, dirty: _x, ...rest }) => rest)).toEqual(sortById(SAMPLE.goals));
    expect(rawEntries.map(({ deletedAt: _d, dirty: _x, ...rest }) => rest)).toEqual(sortById(SAMPLE.entries));
    for (const r of [...rawGoals, ...rawEntries]) expect({ deletedAt: r.deletedAt, dirty: r.dirty }).toEqual({ deletedAt: null, dirty: 1 });
    expect((await db.kv.get('activeTimer'))?.value).toEqual(TIMER);
    expect((await db.kv.get('settings'))?.value).toEqual(SETTINGS);
    expect((await db.kv.get('locale'))?.value).toBe('vi');
    expect((await db.kv.get('prefsSync'))?.value).toEqual({
      reminder: { updatedAt: PHASE1_PREF_STAMP, dirty: 1 },
      locale: { updatedAt: PHASE1_PREF_STAMP, dirty: 1 },
    });
    expect(await db.kv.count()).toBe(4);
    // Through the repositories (what the UI reads): identical to the fixture, tombstone-free.
    expect(sortById(await new DexieGoalRepository(db).getAll())).toEqual(sortById(SAMPLE.goals));
    const exported = await new DexieBackupRepository(db).exportAll();
    expect(sortById(exported.goals)).toEqual(sortById(SAMPLE.goals));
    expect(sortById(exported.entries)).toEqual(sortById(SAMPLE.entries));
    expect(await new DexieSyncStore(db).countDirty()).toBe(5 + 23 + 2);
    db.close();
  });

  it('an upgrade that fails after rewriting every row rolls back completely (NFR-14) and the next launch upgrades fine', async () => {
    const name = fresh();
    await seed(name);
    const broken = new AppDatabase(name, {
      upgradeProbe: () => {
        throw new Error('simulated crash at the end of the upgrade');
      },
    });
    const err = await openDatabase(broken).then(
      () => null,
      (e: unknown) => e,
    );
    expect(err).toBeInstanceOf(StorageError);
    broken.close();
    // Data seen by a v1 reader: untouched, no markers, no prefsSync.
    const v1 = new V1(name);
    await v1.open();
    expect(v1.verno).toBe(1);
    expect(sortById(await v1.goals.toArray())).toEqual(sortById(SAMPLE.goals));
    expect(sortById(await v1.entries.toArray())).toEqual(sortById(SAMPLE.entries));
    expect(await v1.kv.get('prefsSync')).toBeUndefined();
    expect((await v1.kv.get('locale'))?.value).toBe('vi');
    expect((await v1.kv.get('activeTimer'))?.value).toEqual(TIMER);
    v1.close();
    // Retry (next app launch): works and keeps everything.
    const ok = new AppDatabase(name);
    await openDatabase(ok);
    expect(await ok.goals.count()).toBe(5);
    expect(await ok.entries.count()).toBe(23);
    expect((await ok.kv.get('activeTimer'))?.value).toEqual(TIMER);
    ok.close();
  });

  it('upgrading twice (reopen after success) does not touch rows again: a clean row stays clean', async () => {
    const name = fresh();
    await seed(name);
    const a = new AppDatabase(name);
    await openDatabase(a);
    await a.goals.update('g1', { dirty: 0 });
    a.close();
    const b = new AppDatabase(name);
    await openDatabase(b);
    expect((await b.goals.get('g1'))?.dirty).toBe(0);
    expect(await b.goals.where('dirty').equals(1).count()).toBe(4);
    b.close();
  });

  it('empty phase-1 database (never used): upgrade is a no-op with default pref markers', async () => {
    const name = fresh();
    const v1 = new V1(name);
    await v1.open();
    v1.close();
    const db = new AppDatabase(name);
    await openDatabase(db);
    expect(await db.goals.count()).toBe(0);
    expect(await db.entries.count()).toBe(0);
    expect((await db.kv.get('prefsSync'))?.value).toEqual({ reminder: { updatedAt: null, dirty: 0 }, locale: { updatedAt: null, dirty: 0 } });
    expect(await new DexieSyncStore(db).countDirty()).toBe(0);
    db.close();
  });

  it('a phase-1 row with an unexpected extra field or corrupt kv settings does not abort the upgrade', async () => {
    const name = fresh();
    const v1 = new V1(name);
    await v1.open();
    await v1.goals.add({ ...SAMPLE.goals[0]!, extra: 'x' } as unknown as Goal);
    await v1.kv.bulkAdd([
      { key: 'settings', value: 'not-an-object' },
      { key: 'locale', value: 'fr' },
    ]);
    v1.close();
    const db = new AppDatabase(name);
    await openDatabase(db);
    expect(await db.goals.count()).toBe(1);
    expect((await db.kv.get('prefsSync'))?.value).toEqual({ reminder: { updatedAt: null, dirty: 0 }, locale: { updatedAt: null, dirty: 0 } });
    db.close();
  });
});
