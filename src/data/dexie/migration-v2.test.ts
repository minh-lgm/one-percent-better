// Dexie v1 → v2 upgrade keeps 100 % of phase-1 data (M7-AC1, M7-AC17, NFR-14, ARCHITECTURE §4.2).
import Dexie from 'dexie';
import { afterEach, describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS, StorageError, type Goal, type LogEntry } from '../../domain/types';
import { StatsService } from '../../services/stats-service';
import { datasetS1, TODAY } from '../../test/builders';
import { AppDatabase, openDatabase, PHASE1_PREF_STAMP } from './db';
import { DexieEntryRepository } from './entry-repo';
import { DexieGoalRepository } from './goal-repo';

/** Schema v1 exactly as shipped in phase 1 (copied here on purpose: the app class no longer exposes it alone). */
class V1Database extends Dexie {
  goals!: Dexie.Table<Goal, string>;
  entries!: Dexie.Table<LogEntry, string>;
  kv!: Dexie.Table<{ key: string; value: unknown }, string>;
  constructor(name: string) {
    super(name);
    this.version(1).stores({ goals: 'id', entries: 'id, goalId, date, [goalId+date]', kv: 'key' });
  }
}

let n = 0;
const names: string[] = [];
const freshName = () => {
  const name = `migrate-${Date.now()}-${++n}`;
  names.push(name);
  return name;
};

afterEach(async () => {
  for (const name of names.splice(0)) await Dexie.delete(name);
});

const TIMER = { goalId: 'g1', startedAt: '2026-10-09T02:30:00.000Z' };
const SETTINGS = { ...DEFAULT_SETTINGS, reminderEnabled: true, reminderTime: '07:30', lastBackupAt: '2026-10-01T00:00:00.000Z' };

async function seedV1(name: string, options: { locale?: string | null; settings?: unknown } = {}) {
  const v1 = new V1Database(name);
  await v1.open();
  const s1 = datasetS1();
  await v1.goals.bulkAdd(s1.goals);
  await v1.entries.bulkAdd(s1.entries);
  await v1.kv.bulkAdd([
    { key: 'activeTimer', value: TIMER },
    ...(options.settings === undefined ? [{ key: 'settings', value: SETTINGS }] : options.settings === null ? [] : [{ key: 'settings', value: options.settings }]),
    ...(options.locale === null ? [] : [{ key: 'locale', value: options.locale ?? 'vi' }]),
  ]);
  expect(v1.verno).toBe(1);
  v1.close();
  return s1;
}

const byId = <T extends { id: string }>(xs: T[]) => [...xs].sort((a, b) => a.id.localeCompare(b.id));

describe('v1 → v2 upgrade (M7-AC1, NFR-14)', () => {
  it('keeps S1 + timer + settings + locale byte for byte; rows become live + dirty; stats unchanged', async () => {
    const name = freshName();
    const s1 = await seedV1(name);
    const db = new AppDatabase(name);
    await openDatabase(db);
    expect(db.verno).toBe(2);

    const goals = new DexieGoalRepository(db);
    const entries = new DexieEntryRepository(db);
    expect(byId(await goals.getAll())).toEqual(byId(s1.goals));
    const allEntries = await entries.getByDateRange('2026-01-01', '2026-12-31');
    expect(byId(allEntries)).toEqual(byId(s1.entries));

    for (const row of await db.goals.toArray()) {
      expect(row.deletedAt).toBeNull();
      expect(row.dirty).toBe(1);
    }
    for (const row of await db.entries.toArray()) {
      expect(row.deletedAt).toBeNull();
      expect(row.dirty).toBe(1);
    }
    expect((await db.kv.get('activeTimer'))?.value).toEqual(TIMER);
    expect((await db.kv.get('settings'))?.value).toEqual(SETTINGS);
    expect((await db.kv.get('locale'))?.value).toBe('vi');

    // M4-AC4/AC5 figures through the real StatsService (filtered reads must not drop anything).
    const stats = new StatsService(goals, entries);
    const data = await stats.load();
    expect(data.goals).toHaveLength(5);
    expect(data.entries).toHaveLength(23);
    expect(StatsService.currentStreak(data, TODAY)).toBe(8);
    const g1 = (await stats.goalStats('g1', 2026, TODAY))!;
    expect(g1).toMatchObject({ minutesTotal: 240, totalTarget: 930, progressPercent: 25.8, pace: -30, currentStreak: 8, longestStreak: 8 });
    db.close();
  });

  it('(v2.1) pref markers: locale chosen + reminder changed → both groups dirty with the 1970 stamp', async () => {
    const name = freshName();
    await seedV1(name);
    const db = new AppDatabase(name);
    await openDatabase(db);
    expect((await db.kv.get('prefsSync'))?.value).toEqual({
      reminder: { updatedAt: PHASE1_PREF_STAMP, dirty: 1 },
      locale: { updatedAt: PHASE1_PREF_STAMP, dirty: 1 },
    });
    db.close();
  });

  it('(v2.1) defaults everywhere (no locale, default settings) → both groups { null, 0 }', async () => {
    const name = freshName();
    await seedV1(name, { locale: null, settings: { ...DEFAULT_SETTINGS } });
    const db = new AppDatabase(name);
    await openDatabase(db);
    expect((await db.kv.get('prefsSync'))?.value).toEqual({ reminder: { updatedAt: null, dirty: 0 }, locale: { updatedAt: null, dirty: 0 } });
    db.close();
  });

  it('(v2.1) only the reminder time differs from the default → reminder group marked, locale not', async () => {
    const name = freshName();
    await seedV1(name, { locale: null, settings: { ...DEFAULT_SETTINGS, reminderTime: '07:30' } });
    const db = new AppDatabase(name);
    await openDatabase(db);
    expect((await db.kv.get('prefsSync'))?.value).toEqual({ reminder: { updatedAt: PHASE1_PREF_STAMP, dirty: 1 }, locale: { updatedAt: null, dirty: 0 } });
    db.close();
  });

  it('a failing upgrade rejects with StorageError and leaves the v1 database intact', async () => {
    const name = freshName();
    const s1 = await seedV1(name);
    const broken = new AppDatabase(name, {
      upgradeProbe: () => {
        throw new Error('simulated upgrade failure');
      },
    });
    await expect(openDatabase(broken)).rejects.toBeInstanceOf(StorageError);
    broken.close();

    const v1 = new V1Database(name);
    await v1.open();
    expect(v1.verno).toBe(1);
    expect(byId(await v1.goals.toArray())).toEqual(byId(s1.goals));
    expect(byId(await v1.entries.toArray())).toEqual(byId(s1.entries));
    expect((await v1.kv.get('settings'))?.value).toEqual(SETTINGS);
    expect((await v1.kv.get('locale'))?.value).toBe('vi');
    expect(await v1.kv.get('prefsSync')).toBeUndefined();
    v1.close();
  });

  it('a fresh database opens straight at v2 with the empty markers', async () => {
    const db = new AppDatabase(freshName());
    await openDatabase(db);
    expect(db.verno).toBe(2);
    expect(await db.kv.get('prefsSync')).toBeUndefined();
    db.close();
  });
});
