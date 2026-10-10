import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import large from '../../e2e/fixtures/large-backup.json';
import { createDatabase, openDatabase, type AppDatabase } from '../data/dexie/db';
import { DexieEntryRepository } from '../data/dexie/entry-repo';
import { DexieGoalRepository } from '../data/dexie/goal-repo';
import { parseBackup } from '../domain/backup';
import { buildHeatmap } from '../domain/heatmap';
import { monthlySeries, weeklySeries } from '../domain/stats';
import type { Goal, LogEntry } from '../domain/types';
import { buildEntry, buildGoal, datasetS1, TODAY } from '../test/builders';
import { availableYears, goalsDateRange, StatsService, type StatsData } from './stats-service';

let db: AppDatabase;
let service: StatsService;
let n = 0;

beforeEach(async () => {
  db = createDatabase(`stats-test-${Date.now()}-${++n}`);
  await openDatabase(db);
  service = new StatsService(new DexieGoalRepository(db), new DexieEntryRepository(db));
});

afterEach(async () => {
  await db.delete();
});

async function seedS1() {
  const { goals, entries } = datasetS1();
  await db.goals.bulkPut(goals);
  await db.entries.bulkPut(entries);
}

describe('StatsService (M4-T3, M4-AC4, M4-AC5)', () => {
  it('goalStats / overallStats with S1 at 2026-10-09 return the expected numbers (TASKS §0)', async () => {
    await seedS1();
    const g1 = (await service.goalStats('g1', 2026, TODAY))!;
    expect(g1).toMatchObject({ minutesTotal: 240, totalTarget: 930, progressPercent: 25.8, pace: -30, currentStreak: 8, longestStreak: 8, daysOnTarget: 8 });
    const g2 = (await service.goalStats('g2', 2026, TODAY))!;
    expect(g2).toMatchObject({ minutesTotal: 250, progressPercent: 10.2, pace: -530, currentStreak: 2, longestStreak: 10 });
    const g3 = (await service.goalStats('g3', 2026, TODAY))!;
    expect(g3).toMatchObject({ minutesTotal: 60, progressPercent: 1, pace: -4734 });
    expect((await service.goalStats('g4', 2026, TODAY))!.pace).toBe(0);
    expect(await service.goalStats('nope', 2026, TODAY)).toBeUndefined();
    const all = await service.overallStats(2026, TODAY);
    expect(all).toMatchObject({ minutesInYear: 565, daysOnTarget: 20, currentStreak: 8, longestStreak: 10 });
  });

  it('load() reads entries over the goals\' date range (no sentinel dates)', async () => {
    await seedS1();
    const data = await service.load();
    expect(data.goals).toHaveLength(5);
    expect(data.entries).toHaveLength(23);
    expect(goalsDateRange(data.goals)).toEqual(['2026-01-01', '2026-12-31']);
    expect(goalsDateRange([])).toBeNull();
    await db.goals.clear();
    expect(await service.load()).toEqual({ goals: [], entries: [] });
  });

  it('watch() emits goals + entries, follows writes, and widens the range when an earlier goal appears', async () => {
    await seedS1();
    const seen: StatsData[] = [];
    const unsubscribe = service.watch().subscribe((d) => seen.push(d));
    await expect.poll(() => seen.length).toBeGreaterThan(0);
    expect(seen.at(-1)!.entries).toHaveLength(23);
    expect(seen.at(-1)!.goals).toHaveLength(5);

    await db.entries.put(buildEntry({ id: 'new', goalId: 'g1', date: TODAY, minutes: 30 }));
    await expect.poll(() => seen.at(-1)!.entries.length).toBe(24);

    // A goal starting in 2025 widens the watched range; its 2025 entry becomes visible.
    await db.entries.put(buildEntry({ id: 'old', goalId: 'g6', date: '2025-12-20', minutes: 30 }));
    await db.goals.put(buildGoal({ id: 'g6', name: 'Older', startDate: '2025-12-01', endDate: '2026-01-31' }));
    await expect.poll(() => seen.at(-1)!.goals.length).toBe(6);
    await expect.poll(() => seen.at(-1)!.entries.some((e) => e.id === 'old')).toBe(true);
    unsubscribe();
    const count = seen.length;
    await db.entries.put(buildEntry({ id: 'after', goalId: 'g1', date: TODAY, minutes: 1 }));
    await new Promise((r) => setTimeout(r, 30));
    expect(seen.length).toBe(count);
  });

  it('watch() with no goals emits an empty snapshot', async () => {
    const seen: StatsData[] = [];
    const unsubscribe = service.watch().subscribe((d) => seen.push(d));
    await expect.poll(() => seen.length).toBeGreaterThan(0);
    expect(seen[0]).toEqual({ goals: [], entries: [] });
    unsubscribe();
  });

  it('currentStreak helper and availableYears', async () => {
    await seedS1();
    const data = await service.load();
    expect(StatsService.currentStreak(data, TODAY)).toBe(8);
    expect(StatsService.allGoalStats(data, 2026, TODAY).get('g2')?.longestStreak).toBe(10);
    expect(availableYears(data.goals, data.entries, 2026)).toEqual([2026]);
    expect(availableYears([buildGoal({ startDate: '2024-03-01', endDate: '2024-12-31' })], [], 2026)).toEqual([2026, 2025, 2024]);
    expect(availableYears([], [buildEntry({ date: '2025-05-05' })], 2026)).toEqual([2026, 2025]);
    expect(availableYears([], [], 2026)).toEqual([2026]);
  });
});

describe('NFR-03 benchmark (M4-AC9) — large-backup.json', () => {
  const parsed = parseBackup(JSON.stringify(large), 1);
  if (!parsed.ok) throw new Error('large-backup.json must be a valid backup');
  const goals = parsed.value.goals as Goal[];
  const entries = parsed.value.entries as LogEntry[];

  it('fixture: 5 goals, ≈ 5 500 entries, 2023-10-10 → 2026-10-09, under 5 MB', () => {
    expect(goals).toHaveLength(5);
    expect(entries.length).toBeGreaterThan(5000);
    expect(entries.length).toBeLessThan(6000);
    expect(goalsDateRange(goals)).toEqual(['2023-10-10', '2026-10-09']);
    expect(JSON.stringify(large).length).toBeLessThan(5 * 1024 * 1024);
  });

  function median(times: number[]): number {
    return [...times].sort((a, b) => a - b)[Math.floor(times.length / 2)];
  }

  /** Repositories over plain arrays: measures the service + domain computation, not fake-indexeddb cloning. */
  function memoryService(): StatsService {
    const goalRepo = { getAll: async () => goals, getById: async (id: string) => goals.find((g) => g.id === id) } as unknown as import('../data/repositories').GoalRepository;
    const entryRepo = {
      getByGoal: async (goalId: string) => entries.filter((e) => e.goalId === goalId),
      getByDateRange: async (from: string, to: string) => entries.filter((e) => e.date >= from && e.date <= to),
    } as unknown as import('../data/repositories').EntryRepository;
    return new StatsService(goalRepo, entryRepo);
  }

  // Timing assertions get a retry: the suite runs many files in parallel and a
  // busy CPU can inflate one measurement (standalone medians are far below 200 ms).
  it('StatsService.overallStats + goalStats for 5 goals (in-memory repositories) < 200 ms, median of 5 runs', { retry: 2 }, async () => {
    const svc = memoryService();
    const times: number[] = [];
    for (let run = 0; run < 5; run++) {
      const start = performance.now();
      await svc.overallStats(2026, TODAY);
      for (const g of goals) await svc.goalStats(g.id, 2026, TODAY);
      times.push(performance.now() - start);
    }
    console.log(`[bench] service overallStats + 5×goalStats (in-memory repos): median ${median(times).toFixed(1)} ms, runs ${times.map((t) => t.toFixed(1)).join(' / ')}`);
    expect(median(times)).toBeLessThan(200);
  });

  it('same calls on Dexie + fake-indexeddb (informational: includes structured-clone reads of ≈ 11 000 rows)', async () => {
    await db.goals.bulkPut(goals);
    await db.entries.bulkPut(entries);
    const times: number[] = [];
    for (let run = 0; run < 5; run++) {
      const start = performance.now();
      await service.overallStats(2026, TODAY);
      for (const g of goals) await service.goalStats(g.id, 2026, TODAY);
      times.push(performance.now() - start);
    }
    console.log(`[bench] service overallStats + 5×goalStats (fake-indexeddb): median ${median(times).toFixed(1)} ms, runs ${times.map((t) => t.toFixed(1)).join(' / ')}`);
    expect(times.length).toBe(5);
  });

  it('pure Review computation (stats + heatmap + 2 series, all goals + 5 goals) < 200 ms, median of 5 runs', { retry: 2 }, () => {
    const data: StatsData = { goals, entries };
    const times: number[] = [];
    for (let run = 0; run < 5; run++) {
      const start = performance.now();
      StatsService.currentStreak(data, TODAY);
      StatsService.allGoalStats(data, 2026, TODAY);
      buildHeatmap({ year: 2026, goal: null, goals, entries, today: TODAY });
      for (const g of goals) buildHeatmap({ year: 2026, goal: g, goals, entries, today: TODAY });
      weeklySeries(entries, TODAY);
      monthlySeries(entries, 2026, TODAY);
      times.push(performance.now() - start);
    }
    console.log(`[bench] pure review model (all + 5 goals): median ${median(times).toFixed(1)} ms, runs ${times.map((t) => t.toFixed(1)).join(' / ')}`);
    expect(median(times)).toBeLessThan(200);
  });
});

describe('StatsService.curve (M5-T1, M5-AC1)', () => {
  it('returns the S1 "Read" curve: 31 ideal points, 9 actual points, headline 8.3; unknown goal → undefined', async () => {
    await seedS1();
    const c = (await service.curve('g1', TODAY))!;
    expect(c.ideal).toHaveLength(31);
    expect(c.actual).toHaveLength(9);
    expect(c.headlinePercent).toBe(8.3);
    expect(c.idealPercent).toBe(9.4);
    expect(c.daysOnTarget).toBe(8);
    expect(await service.curve('nope', TODAY)).toBeUndefined();
    const g4 = (await service.curve('g4', TODAY))!;
    expect(g4.actual).toEqual([]);
    expect(g4.headlinePercent).toBe(0);
  });
});
