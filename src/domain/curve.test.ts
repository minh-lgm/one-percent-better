import { describe, expect, it } from 'vitest';
import { addDays } from './dates';
import { buildEntry, buildGoal, datasetS1, TODAY } from '../test/builders';
import { curve, growth, growthPercent, lastElapsedDay } from './curve';
import type { LogEntry } from './types';

const s1 = datasetS1();
const g1 = s1.goals.find((g) => g.id === 'g1')!;
const g1Entries = s1.entries.filter((e) => e.goalId === 'g1');

/** `count` daily entries of `minutes` from `from` (ids unique per call). */
function daily(goalId: string, from: string, count: number, minutes: number): LogEntry[] {
  return Array.from({ length: count }, (_, i) => buildEntry({ id: `${goalId}-${from}-${i}`, goalId, date: addDays(from, i), minutes }));
}

describe('curve (M5-AC1, FR-27) — S1 "Read" at 2026-10-09 (oracle: mockup 07)', () => {
  const c = curve(g1, g1Entries, TODAY);

  it('ideal at 2026-10-09 (k = 9) = 1.0937, actual (n = 8) = 1.0829, headline 8.3', () => {
    const idealToday = c.ideal.find((p) => p.date === TODAY)!;
    expect(idealToday.k).toBe(9);
    expect(idealToday.value).toBeCloseTo(1.0937, 4);
    const actualToday = c.actual.at(-1)!;
    expect(actualToday.date).toBe(TODAY);
    expect(actualToday.n).toBe(8);
    expect(actualToday.met).toBe(false);
    expect(actualToday.value).toBeCloseTo(1.0829, 4);
    expect(c.headlinePercent).toBe(8.3);
    expect(c.idealPercent).toBe(9.4);
    expect(c.daysOnTarget).toBe(8);
    expect(c.elapsedDays).toBe(9);
    expect(c.periodDays).toBe(31);
  });

  it('ideal has 31 points (whole period), actual has 9 (10-01 → 10-09)', () => {
    expect(c.ideal).toHaveLength(31);
    expect(c.ideal[0]).toMatchObject({ date: '2026-10-01', k: 1 });
    expect(c.ideal[0].value).toBeCloseTo(1.01, 10);
    expect(c.ideal[30]).toMatchObject({ date: '2026-10-31', k: 31 });
    expect(c.actual).toHaveLength(9);
    expect(c.actual.map((p) => p.date)).toEqual(c.ideal.slice(0, 9).map((p) => p.date));
    // Step shape: n rises by one on each met day and stays flat on the missed one.
    expect(c.actual.map((p) => p.n)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 8]);
    expect(c.actual[7].value).toBeCloseTo(c.actual[8].value, 12);
  });

  it('the series values follow 1.01^k and 1.01^n exactly (first 9 days, mockup formula)', () => {
    for (let i = 0; i < 9; i++) {
      expect(c.ideal[i].value).toBeCloseTo(Math.pow(1.01, i + 1), 12);
      expect(c.actual[i].value).toBeCloseTo(Math.pow(1.01, c.actual[i].n), 12);
    }
  });
});

describe('curve edge cases', () => {
  it('365-day goal with every day on target → headline 3678.3; actual stops at endDate once ended', () => {
    const goal = buildGoal({ id: 'y', startDate: '2025-01-01', endDate: '2025-12-31', targetMinutes: 10 });
    const entries = daily('y', '2025-01-01', 365, 10);
    const c = curve(goal, entries, TODAY);
    expect(c.periodDays).toBe(365);
    expect(c.ideal).toHaveLength(365);
    expect(c.actual).toHaveLength(365);
    expect(c.actual.at(-1)!.date).toBe('2025-12-31');
    expect(c.daysOnTarget).toBe(365);
    expect(c.headlinePercent).toBe(3678.3);
    expect(c.idealPercent).toBe(3678.3);
  });

  it('upcoming goal → actual empty, headline 0.0, elapsed 0', () => {
    const g4 = s1.goals.find((g) => g.id === 'g4')!;
    const c = curve(g4, [], TODAY);
    expect(c.actual).toEqual([]);
    expect(c.ideal).toHaveLength(30);
    expect(c.headlinePercent).toBe(0);
    expect(c.idealPercent).toBe(0);
    expect(c.elapsedDays).toBe(0);
    expect(c.daysOnTarget).toBe(0);
    expect(c.actualFactor).toBe(1);
    expect(lastElapsedDay(g4, TODAY)).toBeNull();
  });

  it('ended goal (G5, one met day on the last day) → actual ends at endDate, headline 1.0', () => {
    const g5 = s1.goals.find((g) => g.id === 'g5')!;
    const c = curve(g5, s1.entries.filter((e) => e.goalId === 'g5'), TODAY);
    expect(c.actual).toHaveLength(181);
    expect(c.actual.at(-1)).toMatchObject({ date: '2026-06-30', n: 1, met: true });
    expect(c.headlinePercent).toBe(1);
    expect(lastElapsedDay(g5, TODAY)).toBe('2026-06-30');
  });

  it('archived goal is computed like any other (archiving keeps the data, FR-30)', () => {
    const archived = { ...g1, archived: true };
    expect(curve(archived, g1Entries, TODAY)).toEqual(curve(g1, g1Entries, TODAY));
  });

  it('one-day goal: 1 ideal point; met → headline 1.0, not met → 0.0; before its day → no actual', () => {
    const goal = buildGoal({ id: 'd', startDate: TODAY, endDate: TODAY, targetMinutes: 30 });
    const met = curve(goal, [buildEntry({ goalId: 'd', date: TODAY, minutes: 30 })], TODAY);
    expect(met.ideal).toHaveLength(1);
    expect(met.actual).toHaveLength(1);
    expect(met.headlinePercent).toBe(1);
    expect(curve(goal, [buildEntry({ goalId: 'd', date: TODAY, minutes: 29 })], TODAY).headlinePercent).toBe(0);
    expect(curve(goal, [], '2026-10-08').actual).toEqual([]);
  });

  it('goal with no entries → actual points all n = 0, headline 0.0; the first met day lifts the line', () => {
    const none = curve(g1, [], TODAY);
    expect(none.actual).toHaveLength(9);
    expect(none.actual.every((p) => p.n === 0 && p.value === 1)).toBe(true);
    expect(none.headlinePercent).toBe(0);
    const one = curve(g1, [buildEntry({ goalId: 'g1', date: '2026-10-03', minutes: 30 })], TODAY);
    expect(one.actual.map((p) => p.n)).toEqual([0, 0, 1, 1, 1, 1, 1, 1, 1]);
  });

  it('missed days never subtract and a later met day continues from the same n', () => {
    const entries = [buildEntry({ goalId: 'g1', date: '2026-10-01', minutes: 30 }), buildEntry({ goalId: 'g1', date: '2026-10-09', minutes: 30 })];
    const c = curve(g1, entries, TODAY);
    expect(c.actual.map((p) => p.n)).toEqual([1, 1, 1, 1, 1, 1, 1, 1, 2]);
    expect(c.headlinePercent).toBe(2);
  });

  it('entries below the daily target do not count; entries on the same day add up', () => {
    const entries = [buildEntry({ goalId: 'g1', date: '2026-10-01', minutes: 15 }), buildEntry({ goalId: 'g1', date: '2026-10-01', minutes: 15 }), buildEntry({ goalId: 'g1', date: '2026-10-02', minutes: 29 })];
    expect(curve(g1, entries, TODAY).actual.map((p) => p.n)).toEqual([1, 1, 1, 1, 1, 1, 1, 1, 1]);
  });

  it('1827-day period (maximum): 1827 ideal points, last value 1.01^1827 (no wall-clock assertion: see npm run bench)', () => {
    const goal = buildGoal({ id: 'max', startDate: '2022-01-01', endDate: '2026-12-31', targetMinutes: 1 });
    expect(goal.endDate).toBe('2026-12-31');
    const c = curve(goal, daily('max', '2022-01-01', 1500, 1), TODAY);
    expect(c.periodDays).toBe(1826);
    const wide = buildGoal({ id: 'w', startDate: '2022-01-01', endDate: '2027-01-01', targetMinutes: 1 });
    const cw = curve(wide, [], TODAY);
    expect(cw.periodDays).toBe(1827);
    expect(cw.ideal).toHaveLength(1827);
    expect(cw.ideal.at(-1)!.value).toBeCloseTo(Math.pow(1.01, 1827), 0);
    expect(c.daysOnTarget).toBe(1500);
  });
});

describe('growth helpers', () => {
  it('growth and growthPercent', () => {
    expect(growth(0)).toBe(1);
    expect(growth(8)).toBeCloseTo(1.082857, 6);
    expect(growthPercent(growth(8))).toBe(8.3);
    expect(growthPercent(growth(9))).toBe(9.4);
    expect(growthPercent(1)).toBe(0);
    expect(growthPercent(growth(365))).toBe(3678.3);
  });
});
