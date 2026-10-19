import { describe, expect, it } from 'vitest';
import { buildEntry, buildGoal, datasetO1, datasetS1, TODAY } from '../test/builders';
import { currentStreak, elapsedDays, entriesByGoal, goalMetDays, goalStats, isDayMet, longestStreak, monthlySeries, overallMetDays, overallStats, weeklySeries, weekStart } from './stats';

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

  it('M4-D1: an archived goal that has not started has 0 elapsed days and pace 0, like an upcoming one', () => {
    const base = buildGoal({ id: 'x', targetMinutes: 45, startDate: '2026-11-01', endDate: '2026-11-30' });
    expect(elapsedDays({ ...base, archived: true }, TODAY)).toBe(0);
    const archived = goalStats({ ...base, archived: true }, [], 2026, TODAY);
    expect(archived).toMatchObject({ elapsedDays: 0, expectedMinutes: 0, pace: 0 });
    expect(archived.pace).toBe(goalStats(base, [], 2026, TODAY).pace);
    // Archived goals that are running or ended keep the normal elapsed days.
    expect(elapsedDays({ startDate: '2026-10-01', endDate: '2026-10-31', archived: true }, TODAY)).toBe(9);
    expect(elapsedDays({ startDate: '2026-01-01', endDate: '2026-06-30', archived: true }, TODAY)).toBe(181);
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

// ---- v4.0 (M11): statistics of an open-ended goal are measured up to today (A-51, ARCH §4.6 c) ----
describe('open-ended goal O1 (M11-AC2, FR-22, FR-24)', () => {
  const o1 = datasetO1();
  const g = o1.goals[0];

  it('at 2026-10-09: 55/90 min → 61.1 %, pace −35, 4 days on target, 4 logged, streak 1 / 2, not outside 2026', () => {
    const s = goalStats(g, o1.entries, 2026, TODAY);
    expect(s).toMatchObject({ minutesTotal: 55, minutesInYear: 55, totalTarget: 90, dailyTarget: 10, progressPercent: 61.1, elapsedDays: 9, expectedMinutes: 90, pace: -35, daysOnTarget: 4, daysLogged: 4, currentStreak: 1, longestStreak: 2, outsideYear: false });
    expect(elapsedDays(g, TODAY)).toBe(9);
  });

  it('year 2025 is outside (before the start); 2027 and 2099 are not (no end date)', () => {
    expect(goalStats(g, o1.entries, 2025, TODAY).outsideYear).toBe(true);
    expect(goalStats(g, o1.entries, 2027, '2027-03-01').outsideYear).toBe(false);
    expect(goalStats(g, o1.entries, 2099, '2099-03-01').outsideYear).toBe(false);
  });

  it('not started yet (start 2026-11-01 at 2026-10-09): elapsed 0, totalTarget 0, progress 0, pace 0, expected 0', () => {
    const upcoming = { ...g, startDate: '2026-11-01' };
    const s = goalStats(upcoming, [], 2026, TODAY);
    expect(s).toMatchObject({ elapsedDays: 0, totalTarget: 0, progressPercent: 0, pace: 0, expectedMinutes: 0, currentStreak: 0, longestStreak: 0 });
  });

  it('keeps counting past 1,827 days: at 2031-10-02 elapsed 1828, totalTarget 18,280, progress 0.3 %', () => {
    const s = goalStats(g, o1.entries, 2031, '2031-10-02');
    expect(s.elapsedDays).toBe(1828);
    expect(s.totalTarget).toBe(18_280);
    expect(s.progressPercent).toBe(0.3);
    expect(s.pace).toBe(55 - 18_280);
  });

  it('isDayMet / goalMetDays only exclude days before the start', () => {
    expect(isDayMet(g, '2026-09-30', 10)).toBe(false);
    expect(isDayMet(g, '2026-10-01', 10)).toBe(true);
    expect(isDayMet(g, '2031-10-02', 10)).toBe(true);
    expect([...goalMetDays(g, o1.entries)].sort()).toEqual(['2026-10-01', '2026-10-02', '2026-10-05', '2026-10-08']);
    // Progress can exceed 100 % (A-51): 20 min on each of the first 2 days at day 2.
    const ahead = goalStats(g, o1.entries.slice(0, 2).map((e) => ({ ...e, minutes: 20 })), 2026, '2026-10-02');
    expect(ahead.progressPercent).toBe(200);
    expect(ahead.pace).toBe(20);
  });

  it('overallStats over S1 + O1 counts O1 like any other goal', () => {
    const { goals, entries } = datasetS1();
    const all = overallStats([...goals, g], [...entries, ...o1.entries], 2026, TODAY);
    expect(all.minutesInYear).toBe(565 + 55);
    expect(all.daysOnTarget).toBe(20); // every O1 met day is already a met day of G1/G2
  });
});
