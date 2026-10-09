// Statistics (ARCHITECTURE §4 "Giá trị suy ra", FR-23 … FR-25). Pure functions
// over goals + entries; no dates from the clock (callers pass `today`).
// Hot paths use integer day numbers instead of date parsing (NFR-03).
import { dayNumber, daysInclusive, isoFromDayNumber, yearOf } from './dates';
import { dailyTarget, totalTarget } from './goal';
import type { Goal, ISODate, LogEntry } from './types';

/** Minutes per day for the given entries (all goals mixed). */
export function minutesByDate(entries: readonly Pick<LogEntry, 'date' | 'minutes'>[]): Map<ISODate, number> {
  const map = new Map<ISODate, number>();
  for (const e of entries) map.set(e.date, (map.get(e.date) ?? 0) + e.minutes);
  return map;
}

/** Entries grouped by goal id. */
export function entriesByGoal(entries: readonly LogEntry[]): Map<string, LogEntry[]> {
  const map = new Map<string, LogEntry[]>();
  for (const e of entries) {
    const list = map.get(e.goalId);
    if (list) list.push(e);
    else map.set(e.goalId, [e]);
  }
  return map;
}

/**
 * A day counts as "met" for a goal when it lies in the goal period and minutes ≥ dailyTarget.
 * Pass `target` (= `dailyTarget(goal)`) when calling in a loop.
 */
export function isDayMet(goal: Goal, date: ISODate, minutes: number, target: number = dailyTarget(goal)): boolean {
  return date >= goal.startDate && date <= goal.endDate && minutes >= target;
}

/** Days (within the goal period) on which the goal hit its daily target. */
export function goalMetDays(goal: Goal, goalEntries: readonly LogEntry[]): Set<ISODate> {
  const met = new Set<ISODate>();
  const target = dailyTarget(goal);
  for (const [date, minutes] of minutesByDate(goalEntries)) {
    if (isDayMet(goal, date, minutes, target)) met.add(date);
  }
  return met;
}

/** Days on which at least one goal hit its daily target (FR-23 "tổng"). */
export function overallMetDays(goals: readonly Goal[], entries: readonly LogEntry[]): Set<ISODate> {
  const met = new Set<ISODate>();
  const byGoal = entriesByGoal(entries);
  for (const goal of goals) {
    for (const date of goalMetDays(goal, byGoal.get(goal.id) ?? [])) met.add(date);
  }
  return met;
}

/**
 * Consecutive met days ending today (if today is met) or yesterday (FR-23:
 * an unmet today does not break the streak until the day is over).
 */
export function currentStreak(metDays: ReadonlySet<ISODate>, today: ISODate): number {
  const met = new Set<number>();
  for (const d of metDays) met.add(dayNumber(d));
  let day = dayNumber(today);
  if (!met.has(day)) day--;
  let n = 0;
  while (met.has(day)) {
    n++;
    day--;
  }
  return n;
}

/** Longest run of consecutive met days. */
export function longestStreak(metDays: ReadonlySet<ISODate>): number {
  const sorted = Array.from(metDays, dayNumber).sort((a, b) => a - b);
  let best = 0;
  let run = 0;
  let previous = Number.NaN;
  for (const day of sorted) {
    run = day === previous + 1 ? run + 1 : 1;
    if (run > best) best = run;
    previous = day;
  }
  return best;
}

export function sumMinutes(entries: readonly Pick<LogEntry, 'minutes'>[]): number {
  let total = 0;
  for (const e of entries) total += e.minutes;
  return total;
}

function inYear(year: number) {
  return (e: Pick<LogEntry, 'date'>) => yearOf(e.date) === year;
}

export interface GoalStats {
  goalId: string;
  year: number;
  /** Minutes logged in `year`. */
  minutesInYear: number;
  /** Minutes logged over the whole goal period. */
  minutesTotal: number;
  totalTarget: number;
  dailyTarget: number;
  /** Met days in `year`. */
  daysOnTarget: number;
  /** Days with ≥ 1 minute in `year`. */
  daysLogged: number;
  currentStreak: number;
  longestStreak: number;
  /** `minutesTotal / totalTarget × 100`, rounded to 1 decimal; may exceed 100. */
  progressPercent: number;
  /** Elapsed days of the period up to today (0 for upcoming goals). */
  elapsedDays: number;
  /** `dailyTarget × elapsedDays`. */
  expectedMinutes: number;
  /** `minutesTotal − expectedMinutes`; positive = ahead. 0 for upcoming goals. */
  pace: number;
  /** True when the goal period does not overlap `year`. */
  outsideYear: boolean;
}

export function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

/** Days of the goal period that have elapsed up to `today` (both ends inclusive; whole period once ended). */
export function elapsedDays(goal: Pick<Goal, 'startDate' | 'endDate' | 'archived'>, today: ISODate): number {
  // Not started yet → nothing elapsed, whether or not the goal is archived (M4-D1:
  // `goalStatus` reports `archived` before `upcoming`, so do not rely on it here).
  if (today < goal.startDate) return 0;
  const end = today < goal.endDate ? today : goal.endDate;
  return daysInclusive(goal.startDate, end);
}

function countInYear(dates: Iterable<ISODate>, year: number): number {
  let n = 0;
  for (const d of dates) if (yearOf(d) === year) n++;
  return n;
}

/** Statistics of one goal for the Review screen (FR-23, FR-24). `goalEntries` must belong to `goal`. */
export function goalStats(goal: Goal, goalEntries: readonly LogEntry[], year: number, today: ISODate): GoalStats {
  const yearEntries = goalEntries.filter(inYear(year));
  const met = goalMetDays(goal, goalEntries);
  const daily = dailyTarget(goal);
  const total = totalTarget(goal);
  const minutesTotal = sumMinutes(goalEntries);
  const elapsed = elapsedDays(goal, today);
  const expected = daily * elapsed;
  return {
    goalId: goal.id,
    year,
    minutesInYear: sumMinutes(yearEntries),
    minutesTotal,
    totalTarget: total,
    dailyTarget: daily,
    daysOnTarget: countInYear(met, year),
    daysLogged: minutesByDate(yearEntries).size,
    currentStreak: currentStreak(met, today),
    longestStreak: longestStreak(met),
    progressPercent: round1((minutesTotal / total) * 100),
    elapsedDays: elapsed,
    expectedMinutes: expected,
    pace: elapsed === 0 ? 0 : minutesTotal - expected,
    outsideYear: yearOf(goal.endDate) < year || yearOf(goal.startDate) > year,
  };
}

export interface OverallStats {
  year: number;
  minutesInYear: number;
  /** Days in `year` with at least one goal on target. */
  daysOnTarget: number;
  /** Days in `year` with ≥ 1 minute logged (any goal). */
  daysLogged: number;
  currentStreak: number;
  longestStreak: number;
}

/** "All goals" statistics (FR-23 streak tổng: days with ≥ 1 goal met). */
export function overallStats(goals: readonly Goal[], entries: readonly LogEntry[], year: number, today: ISODate): OverallStats {
  const met = overallMetDays(goals, entries);
  const yearEntries = entries.filter(inYear(year));
  return {
    year,
    minutesInYear: sumMinutes(yearEntries),
    daysOnTarget: countInYear(met, year),
    daysLogged: minutesByDate(yearEntries).size,
    currentStreak: currentStreak(met, today),
    longestStreak: longestStreak(met),
  };
}

/** Monday of the ISO week containing `date`. */
export function weekStart(date: ISODate): ISODate {
  const n = dayNumber(date);
  const dow = (((n + 3) % 7) + 7) % 7; // Mon = 0 … Sun = 6
  return isoFromDayNumber(n - dow);
}

export interface WeekPoint {
  /** Monday. */
  start: ISODate;
  /** Sunday. */
  end: ISODate;
  minutes: number;
  /** The week containing `today`. */
  current: boolean;
}

/** Last `count` ISO weeks ending with the week of `today` (FR-25). Entries after `today` are ignored. */
export function weeklySeries(entries: readonly LogEntry[], today: ISODate, count = 12): WeekPoint[] {
  const first = dayNumber(weekStart(today)) - 7 * (count - 1);
  const firstIso = isoFromDayNumber(first);
  const buckets = new Array<number>(count).fill(0);
  for (const e of entries) {
    if (e.date > today || e.date < firstIso) continue;
    buckets[Math.floor((dayNumber(e.date) - first) / 7)] += e.minutes;
  }
  return buckets.map((minutes, i) => ({
    start: isoFromDayNumber(first + 7 * i),
    end: isoFromDayNumber(first + 7 * i + 6),
    minutes,
    current: i === count - 1,
  }));
}

export interface MonthPoint {
  year: number;
  /** 1 … 12 */
  month: number;
  /** First day of the month (for formatting). */
  date: ISODate;
  minutes: number;
  current: boolean;
}

/** 12 months of `year` (FR-25). Entries after `today` are ignored. */
export function monthlySeries(entries: readonly LogEntry[], year: number, today: ISODate): MonthPoint[] {
  const buckets = new Array<number>(12).fill(0);
  for (const e of entries) {
    if (e.date > today || yearOf(e.date) !== year) continue;
    buckets[Number(e.date.slice(5, 7)) - 1] += e.minutes;
  }
  const todayYear = yearOf(today);
  const todayMonth = Number(today.slice(5, 7));
  return buckets.map((minutes, i) => ({
    year,
    month: i + 1,
    date: `${year}-${String(i + 1).padStart(2, '0')}-01`,
    minutes,
    current: year === todayYear && i + 1 === todayMonth,
  }));
}
