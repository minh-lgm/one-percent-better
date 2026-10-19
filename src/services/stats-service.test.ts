import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import large from '../../e2e/fixtures/large-backup.json';
import { createDatabase, openDatabase, type AppDatabase } from '../data/dexie/db';
import { DexieEntryRepository } from '../data/dexie/entry-repo';
import { DexieGoalRepository } from '../data/dexie/goal-repo';
import { parseBackup } from '../domain/backup';
import { buildHeatmap } from '../domain/heatmap';
import { monthlySeries, weeklySeries } from '../domain/stats';
import type { Goal, LogEntry } from '../domain/types';
import { buildEntry, buildGoal, datasetO1, datasetS1, datasetS1O1, TODAY } from '../test/builders';
import { OPEN_END_QUERY_MAX } from '../config/constants';
import { addDays } from '../domain/dates';
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
  const fixtureGoals = parsed.value.goals as Goal[];
  const fixtureEntries = parsed.value.entries as LogEntry[];
  // v4.0 (M11-AC3, NFR-03): plus one open-ended goal running for 3,650 days with an entry every day.
  const OPEN_START = addDays(TODAY, -3649);
  const openGoal = buildGoal({ id: 'o-bench', name: 'Open', why: '', targetType: 'daily', targetMinutes: 10, startDate: OPEN_START, endDate: null, createdAt: '2016-10-11T01:00:00.000Z', updatedAt: '2016-10-11T01:00:00.000Z' });
  const openEntries: LogEntry[] = Array.from({ length: 3650 }, (_, i) => buildEntry({ id: `o-bench-${i}`, goalId: 'o-bench', date: addDays(OPEN_START, i), minutes: 5 + (i % 20), note: '' }));
  const goals = [...fixtureGoals, openGoal];
  const entries = [...fixtureEntries, ...openEntries];

  it('fixture: 5 goals, ≈ 5 500 entries, 2023-10-10 → 2026-10-09, under 5 MB; bench adds an open-ended goal of 3,650 days', () => {
    expect(fixtureGoals).toHaveLength(5);
    expect(fixtureEntries.length).toBeGreaterThan(5000);
    expect(fixtureEntries.length).toBeLessThan(6000);
    expect(goalsDateRange(fixtureGoals)).toEqual(['2023-10-10', '2026-10-09']);
    expect(JSON.stringify(large).length).toBeLessThan(5 * 1024 * 1024);
    expect(openEntries).toHaveLength(3650);
    expect(openEntries[3649].date).toBe(TODAY);
    expect(goalsDateRange(goals)).toEqual([OPEN_START, OPEN_END_QUERY_MAX]);
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

  // Timing is only asserted when `BENCH_ASSERT=1` (`npm run bench`, which runs this
  // file alone). Inside the full suite dozens of workers share the CPU, so a
  // wall-clock threshold would be flaky (M5-D2); the numbers are still logged.
  const assertBench = (medianMs: number) => {
    if (process.env.BENCH_ASSERT) expect(medianMs).toBeLessThan(200);
    else expect(medianMs).toBeLessThan(60_000);
  };

  it('StatsService.overallStats + goalStats for 5 goals + 1 open-ended goal (in-memory repositories): median of 5 runs (< 200 ms under npm run bench)', async () => {
    const svc = memoryService();
    const times: number[] = [];
    for (let run = 0; run < 5; run++) {
      const start = performance.now();
      await svc.overallStats(2026, TODAY);
      for (const g of goals) await svc.goalStats(g.id, 2026, TODAY);
      times.push(performance.now() - start);
    }
    console.log(`[bench] service overallStats + 6×goalStats (in-memory repos): median ${median(times).toFixed(1)} ms, runs ${times.map((t) => t.toFixed(1)).join(' / ')}`);
    assertBench(median(times));
  });

  it('(v4.0) curve of the open-ended goal (3,650 ideal + 3,650 actual points) + its goalStats: median of 5 runs (< 200 ms under npm run bench)', async () => {
    const svc = memoryService();
    const times: number[] = [];
    let points = 0;
    for (let run = 0; run < 5; run++) {
      const start = performance.now();
      const c = (await svc.curve('o-bench', TODAY))!;
      const s = (await svc.goalStats('o-bench', 2026, TODAY))!;
      times.push(performance.now() - start);
      points = c.ideal.length;
      expect(c.actual).toHaveLength(3650);
      expect(s.elapsedDays).toBe(3650);
      expect(s.totalTarget).toBe(36_500);
    }
    expect(points).toBe(3650);
    console.log(`[bench] open-ended goal curve (3,650 days) + goalStats: median ${median(times).toFixed(1)} ms, runs ${times.map((t) => t.toFixed(1)).join(' / ')}`);
    assertBench(median(times));
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
    console.log(`[bench] service overallStats + 6×goalStats (fake-indexeddb): median ${median(times).toFixed(1)} ms, runs ${times.map((t) => t.toFixed(1)).join(' / ')}`);
    expect(times.length).toBe(5);
  });

  it('pure Review computation (stats + heatmap + 2 series, all goals + 5 goals): median of 5 runs (< 200 ms under npm run bench)', () => {
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
    console.log(`[bench] pure review model (all + 6 goals): median ${median(times).toFixed(1)} ms, runs ${times.map((t) => t.toFixed(1)).join(' / ')}`);
    assertBench(median(times));
  });
});

// M5-AC1 superseded by M9-AC1 / M9-AC2 (FR-27 v3.0): headline = minutes of the last logged day vs the first.
describe('StatsService.curve (M9-T1, M9-AC1/AC2)', () => {
  it('returns the S1 "Read" curve: 31 ideal points, 9 actual points, headline 0 (30 min every logged day), loggedDays 8; unknown goal → undefined', async () => {
    await seedS1();
    const c = (await service.curve('g1', TODAY))!;
    expect(c.ideal).toHaveLength(31);
    expect(c.actual).toHaveLength(9);
    expect(c.headlinePercent).toBe(0);
    expect(c.idealPercent).toBe(9.4);
    expect(c.loggedDays).toBe(8);
    expect(c.baseline).toEqual({ date: '2026-10-01', minutes: 30 });
    expect(c.latest).toEqual({ date: '2026-10-08', minutes: 30 });
    expect(await service.curve('nope', TODAY)).toBeUndefined();
    const g4 = (await service.curve('g4', TODAY))!;
    expect(g4.actual).toEqual([]);
    expect(g4.headlinePercent).toBe(0);
  });
});

// ---- v4.0 (M11): reading entries over a range that includes an open-ended goal (ARCH §4.6 d) ----
describe('StatsService with S1 + O1 (M11-AC2)', () => {
  it('goalsDateRange(S1+O1) = [2026-01-01, 9999-12-31] (query bound only); load() returns all 27 entries; O1 alone', async () => {
    const { goals, entries } = datasetS1O1();
    expect(goalsDateRange(goals)).toEqual(['2026-01-01', OPEN_END_QUERY_MAX]);
    expect(goalsDateRange(datasetO1().goals)).toEqual(['2026-10-01', OPEN_END_QUERY_MAX]);
    expect(goalsDateRange(datasetS1().goals)).toEqual(['2026-01-01', '2026-12-31']);
    await db.goals.bulkPut(goals);
    await db.entries.bulkPut(entries);
    const data = await service.load();
    expect(data.goals).toHaveLength(6);
    expect(data.entries).toHaveLength(27);
    const o1 = (await service.goalStats('o1', 2026, TODAY))!;
    expect(o1).toMatchObject({ minutesTotal: 55, totalTarget: 90, progressPercent: 61.1, pace: -35, currentStreak: 1, longestStreak: 2 });
    const c = (await service.curve('o1', TODAY))!;
    expect(c.ideal).toHaveLength(9);
    expect(c.headlinePercent).toBe(100);
    // Nothing with the sentinel ever reaches storage: only the goals' own dates are stored.
    expect((await db.goals.toArray()).map((g) => g.endDate)).not.toContain(OPEN_END_QUERY_MAX);
  });

  it('watch() keeps following entries after an open-ended goal appears (range widens to the query bound)', async () => {
    const { goals, entries } = datasetS1();
    await db.goals.bulkPut(goals);
    await db.entries.bulkPut(entries);
    const seen: StatsData[] = [];
    const unsubscribe = service.watch().subscribe((d) => seen.push(d));
    await expect.poll(() => seen.length).toBeGreaterThan(0);
    const o1 = datasetO1();
    await db.goals.put(o1.goals[0]);
    await db.entries.bulkPut(o1.entries);
    await expect.poll(() => seen.at(-1)!.entries.length).toBe(27);
    await db.entries.put(buildEntry({ id: 'far', goalId: 'o1', date: '2031-10-02', minutes: 10 }));
    await expect.poll(() => seen.at(-1)!.entries.some((e) => e.id === 'far')).toBe(true);
    unsubscribe();
  });
});
