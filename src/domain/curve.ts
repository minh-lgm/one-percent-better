// The 1% curve (FR-27; ARCHITECTURE §4 "Đường cong"). Pure functions over one
// goal and its entries; `today` is passed in. For day d of the period with
// ordinal k (startDate = 1): ideal(d) = 1.01^k. For d ≤ today: n(d) = days on
// target from startDate to d, actual(d) = 1.01^n(d). Missed days never subtract.
import { dayNumber, daysInclusive, isoFromDayNumber } from './dates';
import { goalMetDays } from './stats';
import type { Goal, ISODate, LogEntry } from './types';

export const DAILY_GROWTH = 1.01;

export interface IdealPoint {
  date: ISODate;
  /** Ordinal of the day in the period, 1-based. */
  k: number;
  /** `1.01^k` */
  value: number;
}

export interface ActualPoint extends IdealPoint {
  /** Days on target from the start of the period up to and including this day. */
  n: number;
  /** `1.01^n` (the `value` field holds the same number). */
  met: boolean;
}

export interface CurveData {
  /** One point per day of the whole period (`periodDays` points). */
  ideal: IdealPoint[];
  /** One point per elapsed day, startDate → min(today, endDate); empty before the goal starts. */
  actual: ActualPoint[];
  periodDays: number;
  /** Days of the period elapsed up to today (k of the last actual point; 0 when upcoming). */
  elapsedDays: number;
  /** Days on target so far (n of the last actual point). */
  daysOnTarget: number;
  /** `1.01^daysOnTarget` */
  actualFactor: number;
  /** `1.01^elapsedDays` (1 when upcoming) */
  idealFactor: number;
  /** Headline `(1.01^n − 1) × 100`, rounded to 1 decimal (FR-27). */
  headlinePercent: number;
  /** `(1.01^k − 1) × 100` at today, rounded to 1 decimal. */
  idealPercent: number;
}

export function growth(days: number): number {
  return Math.pow(DAILY_GROWTH, days);
}

/** `(factor − 1) × 100` rounded to one decimal. */
export function growthPercent(factor: number): number {
  return Math.round((factor - 1) * 1000) / 10;
}

/** Last day of the period that has already happened, or `null` before the goal starts. */
export function lastElapsedDay(goal: Pick<Goal, 'startDate' | 'endDate'>, today: ISODate): ISODate | null {
  if (today < goal.startDate) return null;
  return today < goal.endDate ? today : goal.endDate;
}

/** Build the ideal and actual series of one goal (`goalEntries` must belong to `goal`). */
export function curve(goal: Goal, goalEntries: readonly LogEntry[], today: ISODate): CurveData {
  const periodDays = daysInclusive(goal.startDate, goal.endDate);
  const start = dayNumber(goal.startDate);
  const ideal: IdealPoint[] = new Array(periodDays);
  for (let i = 0; i < periodDays; i++) {
    ideal[i] = { date: isoFromDayNumber(start + i), k: i + 1, value: growth(i + 1) };
  }

  const actual: ActualPoint[] = [];
  const lastDay = lastElapsedDay(goal, today);
  let n = 0;
  if (lastDay) {
    const met = goalMetDays(goal, goalEntries);
    const elapsed = daysInclusive(goal.startDate, lastDay);
    for (let i = 0; i < elapsed; i++) {
      const date = ideal[i].date;
      const hit = met.has(date);
      if (hit) n++;
      actual.push({ date, k: i + 1, n, value: growth(n), met: hit });
    }
  }
  const elapsedDays = actual.length;
  const actualFactor = growth(n);
  const idealFactor = growth(elapsedDays);
  return {
    ideal,
    actual,
    periodDays,
    elapsedDays,
    daysOnTarget: n,
    actualFactor,
    idealFactor,
    headlinePercent: growthPercent(actualFactor),
    idealPercent: growthPercent(idealFactor),
  };
}
