// The 1% curve v6 — a burn-up of minutes against a compounding target (FR-27 v6.0; ARCHITECTURE
// §4.5, ADR-46). Pure functions over one goal and its entries; `today` is passed in.
//
// Let T = `dailyTarget(goal)` and k = ordinal of the day in the period (startDate = 1).
// target(k) = T × 1.01^(k−1): the daily target starts at T on day 1 and grows 1% a day (user
// decision 2026-11-02, replacing the "ratio to the first logged day" curve of v3.0, ADR-26).
// ideal(k)  = Σ_{i≤k} target(i) = T × (1.01^k − 1) / 0.01 — cumulative target minutes (closed form,
//             never a running float sum).
// actual(k) = Σ minutes logged on days ≤ k inside the period — cumulative logged minutes.
// Both lines are in minutes, start at 0 and never go down; days without time keep "You" flat.
// headlinePercent = pct(actual(last), ideal(last)): signed % of the cumulative target reached
// minus 100 (−100 while nothing is logged; 0 when the goal has not started).
//
// v4.0 (M11, A-52): an open-ended goal (`endDate = null`) has no future days — the ideal line runs
// startDate → today only (`periodDays` = `elapsedDays`), and before it starts there is nothing to draw.
import { dayNumber, daysInclusive, isoFromDayNumber } from './dates';
import { dailyTarget } from './goal';
import type { Goal, ISODate, LogEntry } from './types';

export const GROWTH_RATE = 0.01;
export const DAILY_GROWTH = 1 + GROWTH_RATE;

export interface IdealPoint {
  date: ISODate;
  /** Ordinal of the day in the period, 1-based. */
  k: number;
  /** target(k) = T × 1.01^(k−1): the target of that one day, in minutes (not rounded). */
  target: number;
  /** ideal(k): cumulative target minutes from day 1 to k (not rounded). */
  cumulative: number;
}

export interface ActualPoint {
  date: ISODate;
  /** Ordinal of the day in the period, 1-based. */
  k: number;
  /** m(d): minutes logged that day (0 when nothing was logged). */
  minutes: number;
  /** m(d) > 0 */
  logged: boolean;
  /** actual(k): cumulative logged minutes from day 1 to k. */
  cumulative: number;
  /** `cumulative − ideal(k)`, minutes (negative = behind the ideal line). */
  gap: number;
  /** `pct(cumulative, ideal(k))`: signed % vs the ideal line, one decimal (−100 while nothing is logged). */
  percent: number;
}

export interface LoggedDayRef {
  date: ISODate;
  minutes: number;
}

export interface CurveData {
  /** One point per day of the whole period (`periodDays` points); open-ended goal: one per elapsed day. */
  ideal: IdealPoint[];
  /** One point per elapsed day, startDate → min(today, endDate); empty before the goal starts. */
  actual: ActualPoint[];
  /** Days of the period; for an open-ended goal equal to `elapsedDays` (0 when upcoming). */
  periodDays: number;
  /** Days of the period elapsed up to today (0 when upcoming). */
  elapsedDays: number;
  /** Days with time logged inside the elapsed part of the period. */
  loggedDays: number;
  /** T: the daily target the ideal line starts from (minutes). */
  dailyTarget: number;
  /** The most recent logged day; null when nothing is logged yet. */
  latest: LoggedDayRef | null;
  /** actual(last): all minutes logged in the elapsed part of the period (0 when upcoming). */
  totalMinutes: number;
  /** ideal(last): cumulative target minutes up to the last elapsed day (0 when upcoming). */
  idealMinutes: number;
  /** `totalMinutes − idealMinutes` (0 when upcoming). */
  gapMinutes: number;
  /** Signed headline percent, one decimal: pct(totalMinutes, idealMinutes); 0 when upcoming. */
  headlinePercent: number;
}

export function growth(days: number): number {
  return Math.pow(DAILY_GROWTH, days);
}

/** `(factor − 1) × 100` rounded to one decimal. */
export function growthPercent(factor: number): number {
  return Math.round((factor - 1) * 1000) / 10;
}

/** target(k) = T × 1.01^(k−1). */
export function dayTarget(daily: number, k: number): number {
  return daily * growth(k - 1);
}

/** ideal(k) = Σ_{i=1..k} target(i) = T × (1.01^k − 1) / 0.01; 0 for k ≤ 0. */
export function cumulativeTarget(daily: number, k: number): number {
  if (k <= 0) return 0;
  return (daily * (growth(k) - 1)) / GROWTH_RATE;
}

/**
 * Signed percent change from `b` to `a` (`b` > 0), one decimal, rounded half away from zero so
 * gains and losses round symmetrically; −0 → 0. `pct(17, 16) = 6.3`, `pct(15, 16) = −6.3`, `pct(27, 14) = 92.9`.
 */
export function pct(a: number, b: number): number {
  const y = ((a - b) * 1000) / b;
  const r = Math.sign(y) * Math.round(Math.abs(y));
  const out = r / 10;
  return out === 0 ? 0 : out;
}

/** Last day of the period that has already happened (open-ended goal: today), or `null` before the goal starts. */
export function lastElapsedDay(goal: Pick<Goal, 'startDate' | 'endDate'>, today: ISODate): ISODate | null {
  if (today < goal.startDate) return null;
  return goal.endDate === null || today < goal.endDate ? today : goal.endDate;
}

/** Build the ideal and actual series of one goal (`goalEntries` must belong to `goal`). */
export function curve(goal: Goal, goalEntries: readonly LogEntry[], today: ISODate): CurveData {
  const lastDay = lastElapsedDay(goal, today);
  const daily = dailyTarget(goal);
  // Finite goal: the whole period (future days included). Open-ended: startDate → today, nothing before the start.
  const periodDays = goal.endDate !== null ? daysInclusive(goal.startDate, goal.endDate) : lastDay ? daysInclusive(goal.startDate, lastDay) : 0;
  const start = dayNumber(goal.startDate);
  const ideal: IdealPoint[] = new Array(periodDays);
  for (let i = 0; i < periodDays; i++) {
    const k = i + 1;
    ideal[i] = { date: isoFromDayNumber(start + i), k, target: dayTarget(daily, k), cumulative: cumulativeTarget(daily, k) };
  }

  const actual: ActualPoint[] = [];
  let latest: LoggedDayRef | null = null;
  let loggedDays = 0;
  let total = 0;
  if (lastDay) {
    const elapsed = daysInclusive(goal.startDate, lastDay);
    // m(d) for the elapsed days only; entries outside the window are ignored (A-41).
    const minutesByDay = new Map<ISODate, number>();
    for (const e of goalEntries) {
      if (e.date < goal.startDate || e.date > lastDay) continue;
      minutesByDay.set(e.date, (minutesByDay.get(e.date) ?? 0) + e.minutes);
    }
    for (let i = 0; i < elapsed; i++) {
      const { date, k, cumulative: idealCum } = ideal[i];
      const minutes = minutesByDay.get(date) ?? 0;
      const logged = minutes > 0;
      if (logged) {
        loggedDays++;
        latest = { date, minutes };
      }
      total += minutes;
      actual.push({ date, k, minutes, logged, cumulative: total, gap: total - idealCum, percent: pct(total, idealCum) });
    }
  }
  const elapsedDays = actual.length;
  const idealMinutes = elapsedDays > 0 ? ideal[elapsedDays - 1].cumulative : 0;
  return {
    ideal,
    actual,
    periodDays,
    elapsedDays,
    loggedDays,
    dailyTarget: daily,
    latest,
    totalMinutes: total,
    idealMinutes,
    gapMinutes: total - idealMinutes,
    headlinePercent: elapsedDays > 0 ? pct(total, idealMinutes) : 0,
  };
}

/** Round `x` up to the next "nice" step (1, 2, 5 × 10^n), never below 1 (whole-minute ticks). */
function niceStep(x: number): number {
  if (!(x > 0)) return 1;
  const p = Math.pow(10, Math.floor(Math.log10(x)));
  const m = x / p;
  const step = (m <= 1 ? 1 : m <= 2 ? 2 : m <= 5 ? 5 : 10) * p;
  return Math.max(1, step);
}

export interface CurveYScale {
  domain: [number, number];
  /** Tick values from `domain[0]` to `domain[1]` in steps of `step` (always includes 0). */
  ticks: number[];
  step: number;
}

/**
 * Linear Y scale (unit: minutes) for the points on screen, after the Range filter (ARCH §4.5,
 * DESIGN S4 "Biểu đồ v6" rule 3). `yMin = min(0, min You)`, `yMax = max(1, max Ideal, max You)`;
 * 5 % padding on the top and — only when something is negative (never, for cumulative minutes) —
 * on the bottom, then both ends are rounded outwards to a multiple of a nice step (1, 2, 5 × 10^n, ≥ 1).
 */
export function curveYScale(idealValues: readonly number[], youValues: readonly number[]): CurveYScale {
  let min = 0;
  let max = 1;
  for (const v of youValues) {
    if (v < min) min = v;
    if (v > max) max = v;
  }
  for (const v of idealValues) if (v > max) max = v;
  const pad = (max - min) * 0.05;
  const lo = min < 0 ? min - pad : 0;
  const hi = max + pad;
  const step = niceStep((hi - lo) / 5);
  const domain: [number, number] = [Math.floor(lo / step) * step, Math.ceil(hi / step) * step];
  const ticks: number[] = [];
  for (let v = domain[0]; v <= domain[1] + 1e-9; v += step) ticks.push(Math.round(v * 1e6) / 1e6);
  return { domain, ticks, step };
}

/** Y domain (unit: minutes) for the points on screen; see `curveYScale`. */
export function curveYDomain(idealValues: readonly number[], youValues: readonly number[]): [number, number] {
  return curveYScale(idealValues, youValues).domain;
}
