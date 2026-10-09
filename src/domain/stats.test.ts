import { describe, expect, it } from 'vitest';
import { buildEntry, buildGoal, datasetS1, TODAY } from '../test/builders';
import { currentStreak, elapsedDays, entriesByGoal, goalMetDays, goalStats, longestStreak, monthlySeries, overallMetDays, overallStats, weeklySeries, weekStart } from './stats';

const s1 = datasetS1();
const byGoal = entriesByGoal(s1.entries);
const goal = (id: string) => s1.goals.find((g) => g.id === id)!;
const entriesOf = (id: string) => byGoal.get(id) ?? [];

describe('streaks (M4-AC4, FR-23)', () => {
  it('S1 at 2026-10-09 (today not logged): G1 8/8, G2 2/10, overall 8/10', () => {
    const g1 = goalStats(goal('g1'), entriesOf('g1'), 2026, TODAY);
    expect([g1.currentStreak, g1.longestStreak]).toEqual([8, 8]);
    const g2 = goalStats(goal('g2'), entriesOf('g2'), 2026, TODAY);
    expect([g2.currentStreak, g2.longestStreak]).toEqual([2, 10]);
    const all = overallStats(s1.goals, s1.entries, 2026, TODAY);
    expect([all.currentStreak, all.longestStreak]).toEqual([8, 10]);
  });

  it('logging 30 min for G1 today makes G1 and overall current streak 9', () => {
    const entries = [...s1.entries, buildEntry({ id: 'x', goalId: 'g1', date: TODAY, minutes: 30 })];
    const g1 = goalStats(goal('g1'), entriesByGoal(entries).get('g1')!, 2026, TODAY);
    expect(g1.currentStreak).toBe(9);
    expect(overallStats(s1.goals, entries, 2026, TODAY).currentStreak).toBe(9);
  });

  it('at 2026-10-10 with nothing on 10-09 the G1 current streak is 0 (longest stays 8)', () => {
    const g1 = goalStats(goal('g1'), entriesOf('g1'), 2026, '2026-10-10');
    expect(g1.currentStreak).toBe(0);
    expect(g1.longestStreak).toBe(8);
  });

  it('a day with minutes below the target or outside the period does not count', () => {
    const g2 = goalMetDays(goal('g2'), entriesOf('g2'));
    expect(g2.has('2026-09-15')).toBe(false); // 10 < 20
    expect(g2.has('2026-09-10')).toBe(true);
    const g = buildGoal({ id: 'x', startDate: '2026-10-05', endDate: '2026-10-31', targetMinutes: 30 });
    const met = goalMetDays(g, [buildEntry({ goalId: 'x', date: '2026-10-04', minutes: 30 }), buildEntry({ goalId: 'x', date: '2026-10-05', minutes: 30 })]);
    expect([...met]).toEqual(['2026-10-05']);
  });

  it('streaks cross the year boundary and leap day', () => {
    const met = new Set(['2026-12-30', '2026-12-31', '2027-01-01', '2027-01-02']);
    expect(currentStreak(met, '2027-01-02')).toBe(4);
    expect(currentStreak(met, '2027-01-03')).toBe(4); // today not met yet → ends yesterday
    expect(currentStreak(met, '2027-01-04')).toBe(0);
    expect(longestStreak(met)).toBe(4);
    const leap = new Set(['2028-02-28', '2028-02-29', '2028-03-01']);
    expect(longestStreak(leap)).toBe(3);
    expect(currentStreak(leap, '2028-03-01')).toBe(3);
    const noLeap = new Set(['2027-02-28', '2027-03-01']);
    expect(longestStreak(noLeap)).toBe(2);
    expect(longestStreak(new Set())).toBe(0);
    expect(currentStreak(new Set(), TODAY)).toBe(0);
  });

  it('overall met days = union over goals', () => {
    const met = overallMetDays(s1.goals, s1.entries);
    expect(met.size).toBe(8 + 10 + 2 + 1 + 1 - 2); // G1 8, G2 12 (10-07/08 overlap G1), G3 1, G5 1
    expect(met.has('2026-03-02')).toBe(true);
    expect(met.has('2026-06-30')).toBe(true);
    expect(met.has('2026-09-15')).toBe(false);
  });
});

describe('totals, progress, pace (M4-AC5, FR-24)', () => {
  it('S1 at 2026-10-09', () => {
    const g1 = goalStats(goal('g1'), entriesOf('g1'), 2026, TODAY);
    expect(g1.minutesInYear).toBe(240);
    expect(g1.minutesTotal).toBe(240);
    expect(g1.totalTarget).toBe(930);
    expect(g1.progressPercent).toBe(25.8);
    expect(g1.expectedMinutes).toBe(270);
    expect(g1.pace).toBe(-30);
    expect(g1.daysOnTarget).toBe(8);
    expect(g1.daysLogged).toBe(8);
    expect(g1.outsideYear).toBe(false);

    const g2 = goalStats(goal('g2'), entriesOf('g2'), 2026, TODAY);
    expect(g2.minutesTotal).toBe(250);
    expect(g2.progressPercent).toBe(10.2);
    expect(g2.pace).toBe(-530);

    const g3 = goalStats(goal('g3'), entriesOf('g3'), 2026, TODAY);
    expect(g3.minutesTotal).toBe(60);
    expect(g3.progressPercent).toBe(1);
    expect(g3.pace).toBe(-4734);

    const g4 = goalStats(goal('g4'), entriesOf('g4'), 2026, TODAY);
    expect(g4.pace).toBe(0);
    expect(g4.elapsedDays).toBe(0);
    expect(g4.progressPercent).toBe(0);

    const g5 = goalStats(goal('g5'), entriesOf('g5'), 2026, TODAY);
    expect(g5.elapsedDays).toBe(181); // ended: whole period
    expect(g5.pace).toBe(15 - 15 * 181);
  });

  it('overall totals for 2026 and another year', () => {
    const all = overallStats(s1.goals, s1.entries, 2026, TODAY);
    expect(all.minutesInYear).toBe(240 + 250 + 60 + 15);
    expect(all.daysOnTarget).toBe(20);
    expect(all.daysLogged).toBe(8 + 10 + 1 + 1 + 1);
    const prev = overallStats(s1.goals, s1.entries, 2025, TODAY);
    expect(prev.minutesInYear).toBe(0);
    expect(prev.daysOnTarget).toBe(0);
    expect(prev.currentStreak).toBe(8); // streak is not per year
  });

  it('progress can exceed 100 and is rounded to one decimal', () => {
    const g = buildGoal({ id: 'x', startDate: '2026-10-01', endDate: '2026-10-03', targetMinutes: 10 });
    const stats = goalStats(g, [buildEntry({ goalId: 'x', date: '2026-10-01', minutes: 40 })], 2026, '2026-10-02');
    expect(stats.progressPercent).toBe(133.3);
    expect(stats.pace).toBe(20);
  });

  it('elapsedDays counts both ends and includes today', () => {
    expect(elapsedDays({ startDate: '2026-10-01', endDate: '2026-10-31', archived: false }, '2026-10-01')).toBe(1);
    expect(elapsedDays({ startDate: '2026-10-01', endDate: '2026-10-31', archived: false }, '2026-10-09')).toBe(9);
    expect(elapsedDays({ startDate: '2026-10-01', endDate: '2026-10-31', archived: false }, '2026-11-15')).toBe(31);
    expect(elapsedDays({ startDate: '2026-11-01', endDate: '2026-11-30', archived: false }, '2026-10-09')).toBe(0);
  });

  it('outsideYear is true when the period does not touch the year', () => {
    expect(goalStats(goal('g1'), entriesOf('g1'), 2025, TODAY).outsideYear).toBe(true);
    expect(goalStats(goal('g1'), entriesOf('g1'), 2027, TODAY).outsideYear).toBe(true);
    const span = buildGoal({ id: 'x', startDate: '2026-12-01', endDate: '2027-01-31' });
    expect(goalStats(span, [], 2027, TODAY).outsideYear).toBe(false);
  });
});

describe('weekly / monthly series (M4-AC6, FR-25)', () => {
  it('weekStart is Monday', () => {
    expect(weekStart('2026-10-09')).toBe('2026-10-05');
    expect(weekStart('2026-10-05')).toBe('2026-10-05');
    expect(weekStart('2026-10-11')).toBe('2026-10-05');
    expect(weekStart('2027-01-01')).toBe('2026-12-28');
  });

  it('12 weeks ending with the current week; week of 2026-10-05 = 160 min', () => {
    const weeks = weeklySeries(s1.entries, TODAY);
    expect(weeks).toHaveLength(12);
    const last = weeks[11];
    expect(last.start).toBe('2026-10-05');
    expect(last.end).toBe('2026-10-11');
    expect(last.current).toBe(true);
    expect(last.minutes).toBe(160);
    expect(weeks[10]).toMatchObject({ start: '2026-09-28', minutes: 120 }); // 10-01..10-04 G1 only
    expect(weeks[0].start).toBe('2026-07-20');
    expect(weeks.filter((w) => w.current)).toHaveLength(1);
  });

  it('entries after today or before the window are ignored', () => {
    const entries = [buildEntry({ goalId: 'g1', date: '2026-10-10', minutes: 99 }), buildEntry({ goalId: 'g1', date: '2026-07-19', minutes: 99 }), buildEntry({ goalId: 'g1', date: '2026-07-20', minutes: 5 })];
    const weeks = weeklySeries(entries, TODAY);
    expect(weeks.reduce((a, w) => a + w.minutes, 0)).toBe(5);
  });

  it('12 months of 2026: Mar 60, Jun 15, Sep 210, Oct 280, others 0', () => {
    const months = monthlySeries(s1.entries, 2026, TODAY);
    expect(months.map((m) => m.minutes)).toEqual([0, 0, 60, 0, 0, 15, 0, 0, 210, 280, 0, 0]);
    expect(months[9]).toMatchObject({ month: 10, date: '2026-10-01', current: true });
    expect(months.filter((m) => m.current)).toHaveLength(1);
    expect(monthlySeries(s1.entries, 2025, TODAY).every((m) => m.minutes === 0 && !m.current)).toBe(true);
  });
});
