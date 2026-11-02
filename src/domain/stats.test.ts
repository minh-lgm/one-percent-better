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

// v6.1 (ADR-47): expected/total follow the +1 % plan — `expectedMinutes = plannedMinutes(goal, elapsedDays)`
// (T₀ × (1.01^k − 1) / 0.01, whole minutes) and `totalTarget` = the plan over the whole period (a total goal
// gives back exactly its total; an open-ended goal the plan up to today). Was dailyTarget × days (M4).
describe('totals, progress, pace (M4-AC5, FR-24; v6.1 ADR-47: expected/total follow the +1 % plan)', () => {
  it('S1 at 2026-10-09: G1 1084 / 22.1 % / expected 281 / −41; G2 4733 / 5.3 / 948 / −698; G3 6000 / 1.0 / 2535 / −2475; G4 1565 / 0; G5 7584 / 0.2 / −7569', () => {
    const g1 = goalStats(goal('g1'), entriesOf('g1'), 2026, TODAY);
    expect(g1.minutesInYear).toBe(240);
    expect(g1.minutesTotal).toBe(240);
    expect(g1.totalTarget).toBe(1084); // 30 × (1.01^31 − 1) / 0.01 = 1083.98 (was 930 = 30 × 31)
    expect(g1.progressPercent).toBe(22.1); // was 25.8
    expect(g1.expectedMinutes).toBe(281); // 30 × (1.01^9 − 1) / 0.01 = 281.06 (was 270 = 30 × 9)
    expect(g1.pace).toBe(-41); // was −30
    expect(g1.dailyTarget).toBe(30); // the +1 % rule does not touch the met-day threshold
    expect(g1.daysOnTarget).toBe(8);
    expect(g1.daysLogged).toBe(8);
    expect(g1.outsideYear).toBe(false);

    const g2 = goalStats(goal('g2'), entriesOf('g2'), 2026, TODAY);
    expect(g2.minutesTotal).toBe(250);
    expect(g2.totalTarget).toBe(4733); // was 2440
    expect(g2.progressPercent).toBe(5.3); // was 10.2
    expect(g2.expectedMinutes).toBe(948); // was 780
    expect(g2.pace).toBe(-698); // was −530

    // A total goal: the plan is scaled so that it adds up to the total → totalTarget stays 6000.
    const g3 = goalStats(goal('g3'), entriesOf('g3'), 2026, TODAY);
    expect(g3.minutesTotal).toBe(60);
    expect(g3.totalTarget).toBe(6000);
    expect(g3.dailyTarget).toBe(17);
    expect(g3.progressPercent).toBe(1);
    expect(g3.expectedMinutes).toBe(2535); // 1.631169 × (1.01^282 − 1) / 0.01 (was 4794 = 17 × 282)
    expect(g3.pace).toBe(-2475); // was −4734

    const g4 = goalStats(goal('g4'), entriesOf('g4'), 2026, TODAY);
    expect(g4.totalTarget).toBe(1565); // was 1350
    expect(g4.expectedMinutes).toBe(0);
    expect(g4.pace).toBe(0);
    expect(g4.elapsedDays).toBe(0);
    expect(g4.progressPercent).toBe(0);

    const g5 = goalStats(goal('g5'), entriesOf('g5'), 2026, TODAY);
    expect(g5.elapsedDays).toBe(181); // ended: whole period
    expect(g5.totalTarget).toBe(7584); // was 2715
    expect(g5.expectedMinutes).toBe(7584);
    expect(g5.progressPercent).toBe(0.2); // was 0.6
    expect(g5.pace).toBe(15 - 7584);
  });

  it('v6.1: the expected minutes depend on the day only — G1 without entries → expected 281, pace −281; at 2027-01-05 (ended) expected = totalTarget = 1084, pace −844; 5 min/day over October → 181 / 47', () => {
    const none = goalStats(goal('g1'), [], 2026, TODAY);
    expect(none).toMatchObject({ minutesTotal: 0, totalTarget: 1084, expectedMinutes: 281, pace: -281, progressPercent: 0 });
    const ended = goalStats(goal('g1'), entriesOf('g1'), 2026, '2027-01-05');
    expect(ended).toMatchObject({ elapsedDays: 31, totalTarget: 1084, expectedMinutes: 1084, pace: -844, progressPercent: 22.1 });
    const g6 = buildGoal({ id: 'g6', targetMinutes: 5, startDate: '2026-10-01', endDate: '2026-10-31' });
    expect(goalStats(g6, [], 2026, TODAY)).toMatchObject({ totalTarget: 181, expectedMinutes: 47, pace: -47, progressPercent: 0 });
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

  it('progress can exceed 100 and is rounded to one decimal (v6.1: 3-day plan 10/10.1/10.201 → total 30, expected 20 on day 2)', () => {
    const g = buildGoal({ id: 'x', startDate: '2026-10-01', endDate: '2026-10-03', targetMinutes: 10 });
    const stats = goalStats(g, [buildEntry({ goalId: 'x', date: '2026-10-01', minutes: 40 })], 2026, '2026-10-02');
    expect(stats.totalTarget).toBe(30);
    expect(stats.expectedMinutes).toBe(20);
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
// v6.1 (ADR-47): expected/total follow the +1 % plan — for an open-ended goal both equal `plannedMinutes(goal, elapsedDays)`.
describe('open-ended goal O1 (M11-AC2, FR-22, FR-24; v6.1 ADR-47)', () => {
  const o1 = datasetO1();
  const g = o1.goals[0];

  it('at 2026-10-09: 55/94 min → 58.5 %, pace −39 (was 90 / 61.1 / −35), 4 days on target, 4 logged, streak 1 / 2, not outside 2026', () => {
    const s = goalStats(g, o1.entries, 2026, TODAY);
    expect(s).toMatchObject({ minutesTotal: 55, minutesInYear: 55, totalTarget: 94, dailyTarget: 10, progressPercent: 58.5, elapsedDays: 9, expectedMinutes: 94, pace: -39, daysOnTarget: 4, daysLogged: 4, currentStreak: 1, longestStreak: 2, outsideYear: false });
    expect(elapsedDays(g, TODAY)).toBe(9);
    // The denominator grows with the plan: 2026-10-20 → 220 min expected, 25.0 %, pace −165. 30 more minutes today → 85/94 = 90.4 %, −9.
    expect(goalStats(g, o1.entries, 2026, '2026-10-20')).toMatchObject({ elapsedDays: 20, totalTarget: 220, expectedMinutes: 220, progressPercent: 25, pace: -165 });
    const more = [...o1.entries, buildEntry({ id: 'more', goalId: 'o1', date: TODAY, minutes: 30 })];
    expect(goalStats(g, more, 2026, TODAY)).toMatchObject({ minutesTotal: 85, totalTarget: 94, progressPercent: 90.4, pace: -9 });
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

  it('keeps counting past 1,827 days: at 2031-10-02 elapsed 1828, totalTarget = expected = 79,336,177,010 (10 × (1.01^1828 − 1) / 0.01), progress 0.0 %', () => {
    const s = goalStats(g, o1.entries, 2031, '2031-10-02');
    expect(s.elapsedDays).toBe(1828);
    expect(s.totalTarget).toBe(79_336_177_010);
    expect(s.expectedMinutes).toBe(79_336_177_010);
    expect(Number.isSafeInteger(s.totalTarget)).toBe(true);
    expect(s.progressPercent).toBe(0);
    expect(s.pace).toBe(55 - 79_336_177_010);
  });

  it('first day (start = today, 10 min): 10 of 10, 100 %, pace 0', () => {
    const first = goalStats({ ...g, startDate: TODAY }, [buildEntry({ id: 'f', goalId: 'o1', date: TODAY, minutes: 10 })], 2026, TODAY);
    expect(first).toMatchObject({ elapsedDays: 1, totalTarget: 10, expectedMinutes: 10, progressPercent: 100, pace: 0 });
  });

  it('isDayMet / goalMetDays only exclude days before the start', () => {
    expect(isDayMet(g, '2026-09-30', 10)).toBe(false);
    expect(isDayMet(g, '2026-10-01', 10)).toBe(true);
    expect(isDayMet(g, '2031-10-02', 10)).toBe(true);
    expect([...goalMetDays(g, o1.entries)].sort()).toEqual(['2026-10-01', '2026-10-02', '2026-10-05', '2026-10-08']);
    // Progress can exceed 100 % (A-51): 20 min on each of the first 2 days at day 2 (plan 10 + 10.1 → 20).
    const ahead = goalStats(g, o1.entries.slice(0, 2).map((e) => ({ ...e, minutes: 20 })), 2026, '2026-10-02');
    expect(ahead.totalTarget).toBe(20);
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
