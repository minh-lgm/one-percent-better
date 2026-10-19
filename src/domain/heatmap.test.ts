import { describe, expect, it } from 'vitest';
import { buildEntry, buildGoal, datasetO1, datasetS1, TODAY } from '../test/builders';
import { allGoalsLevel, buildHeatmap, goalLevel, type HeatmapCell } from './heatmap';

const s1 = datasetS1();
const cellOf = (cells: HeatmapCell[], date: string) => cells.find((c) => c.date === date)!;

describe('heatmap grid (M4-AC1)', () => {
  it('2026: 365 cells, 53 columns, Jan 1 on the Thursday row, Dec 31 on the Thursday row of the last column', () => {
    const grid = buildHeatmap({ year: 2026, goal: null, goals: s1.goals, entries: s1.entries, today: TODAY });
    expect(grid.cells).toHaveLength(365);
    expect(grid.columns).toBe(53);
    expect(cellOf(grid.cells, '2026-01-01')).toMatchObject({ col: 0, row: 3 });
    expect(cellOf(grid.cells, '2026-12-31')).toMatchObject({ col: 52, row: 3 });
    expect(cellOf(grid.cells, '2026-01-05')).toMatchObject({ col: 1, row: 0 }); // Monday
    expect(cellOf(grid.cells, '2026-01-04')).toMatchObject({ col: 0, row: 6 }); // Sunday
    expect(grid.months.map((m) => m.col)).toEqual([0, 4, 8, 13, 17, 22, 26, 30, 35, 39, 43, 48]);
    expect(grid.cells[grid.focusIndex].date).toBe(TODAY);
    expect(grid.cells.filter((c) => c.today)).toHaveLength(1);
  });

  it('2028 (leap): 366 cells, Jan 1 on the Saturday row, has Feb 29', () => {
    const grid = buildHeatmap({ year: 2028, goal: null, goals: [], entries: [], today: '2028-06-01' });
    expect(grid.cells).toHaveLength(366);
    expect(cellOf(grid.cells, '2028-01-01').row).toBe(5);
    expect(cellOf(grid.cells, '2028-02-29')).toBeDefined();
    expect(cellOf(grid.cells, '2028-03-01').row).toBe(2); // Wednesday
    expect(grid.columns).toBe(53);
  });

  it('focus index: a past year focuses Dec 31, a future year Jan 1', () => {
    expect(buildHeatmap({ year: 2025, goal: null, goals: [], entries: [], today: TODAY }).focusIndex).toBe(364);
    expect(buildHeatmap({ year: 2027, goal: null, goals: [], entries: [], today: TODAY }).focusIndex).toBe(0);
  });
});

describe('heatmap levels (M4-AC2)', () => {
  it('one goal with dailyTarget 30', () => {
    expect([0, 10, 14, 15, 29, 30, 59, 60].map((m) => goalLevel(m, 30))).toEqual([0, 1, 1, 2, 2, 3, 3, 4]);
  });

  it('all goals by total minutes', () => {
    expect([0, 1, 29, 30, 59, 60, 119, 120].map(allGoalsLevel)).toEqual([0, 1, 1, 2, 2, 3, 3, 4]);
  });

  it('S1 "All goals": 09-15 → 1 (10 min), 10-07 → 2 (50 min), 03-02 → 3 (60 min)', () => {
    const grid = buildHeatmap({ year: 2026, goal: null, goals: s1.goals, entries: s1.entries, today: TODAY });
    expect(cellOf(grid.cells, '2026-09-15')).toMatchObject({ level: 1, minutes: 10, met: false, state: 'logged' });
    expect(cellOf(grid.cells, '2026-10-07')).toMatchObject({ level: 2, minutes: 50, met: true });
    expect(cellOf(grid.cells, '2026-03-02')).toMatchObject({ level: 3, minutes: 60, met: true });
    expect(cellOf(grid.cells, '2026-10-09')).toMatchObject({ state: 'none', level: 0, today: true, navigable: true });
    expect(cellOf(grid.cells, '2026-10-10')).toMatchObject({ state: 'future', navigable: false });
    expect(grid.cells.some((c) => c.state === 'outside')).toBe(false);
  });

  it('one goal: days outside the period are `outside`, levels use the goal target', () => {
    const g1 = s1.goals[0];
    const grid = buildHeatmap({ year: 2026, goal: g1, goals: s1.goals, entries: s1.entries, today: TODAY });
    expect(cellOf(grid.cells, '2026-09-30').state).toBe('outside');
    expect(cellOf(grid.cells, '2026-10-01')).toMatchObject({ state: 'logged', level: 3, minutes: 30, met: true });
    expect(cellOf(grid.cells, '2026-10-07')).toMatchObject({ minutes: 30 }); // Guitar's 20 min are not counted
    expect(cellOf(grid.cells, '2026-10-09')).toMatchObject({ state: 'none', navigable: true });
    expect(cellOf(grid.cells, '2026-10-10')).toMatchObject({ state: 'future', navigable: false });
    expect(cellOf(grid.cells, '2026-11-01').state).toBe('future');
    const g2grid = buildHeatmap({ year: 2026, goal: s1.goals[1], goals: s1.goals, entries: s1.entries, today: TODAY });
    expect(cellOf(g2grid.cells, '2026-09-15')).toMatchObject({ level: 2, met: false }); // 10/20 = 50 %
  });

  it('one goal in a year it does not run: every cell `outside` or `future`', () => {
    const grid = buildHeatmap({ year: 2025, goal: s1.goals[0], goals: s1.goals, entries: s1.entries, today: TODAY });
    expect(grid.cells.every((c) => c.state === 'outside')).toBe(true);
  });

  it('met for all goals needs at least one goal at target on a day in its period', () => {
    const g = buildGoal({ id: 'x', targetMinutes: 30, startDate: '2026-10-05', endDate: '2026-10-31' });
    const entries = [buildEntry({ goalId: 'x', date: '2026-10-04', minutes: 200 }), buildEntry({ goalId: 'x', date: '2026-10-06', minutes: 29 })];
    const grid = buildHeatmap({ year: 2026, goal: null, goals: [g], entries, today: TODAY });
    expect(cellOf(grid.cells, '2026-10-04')).toMatchObject({ level: 4, met: false, minutes: 200 });
    expect(cellOf(grid.cells, '2026-10-06')).toMatchObject({ level: 1, met: false });
  });
});

// ---- v4.0 (M11): heatmap of an open-ended goal — `outside` only before the start (A-51) ----
describe('heatmap — open-ended goal O1 in 2026 (M11-AC2)', () => {
  const o1 = datasetO1();

  it('2026-09-30 outside; 2026-10-09 (today) none; 2026-10-08 logged 20 min level 4; 2026-12-31 future; no outside cell after the start', () => {
    const grid = buildHeatmap({ year: 2026, goal: o1.goals[0], goals: o1.goals, entries: o1.entries, today: TODAY });
    expect(cellOf(grid.cells, '2026-09-30').state).toBe('outside');
    expect(cellOf(grid.cells, '2026-01-01').state).toBe('outside');
    expect(cellOf(grid.cells, '2026-10-09')).toMatchObject({ state: 'none', today: true, navigable: true });
    expect(cellOf(grid.cells, '2026-10-08')).toMatchObject({ state: 'logged', minutes: 20, level: 4, met: true });
    expect(cellOf(grid.cells, '2026-10-02')).toMatchObject({ state: 'logged', minutes: 15, level: 3, met: true });
    expect(cellOf(grid.cells, '2026-12-31').state).toBe('future');
    expect(grid.cells.filter((c) => c.date >= '2026-10-01' && c.state === 'outside')).toEqual([]);
  });

  it('a later year has no outside cells at all; "All goals" with S1 + O1 is unchanged for the other goals', () => {
    const later = buildHeatmap({ year: 2027, goal: o1.goals[0], goals: o1.goals, entries: o1.entries, today: '2027-06-01' });
    expect(later.cells.filter((c) => c.state === 'outside')).toEqual([]);
    const all = buildHeatmap({ year: 2026, goal: null, goals: [...s1.goals, ...o1.goals], entries: [...s1.entries, ...o1.entries], today: TODAY });
    expect(cellOf(all.cells, '2026-10-08').minutes).toBe(30 + 20 + 20);
    expect(cellOf(all.cells, '2026-10-08').met).toBe(true);
  });
});
