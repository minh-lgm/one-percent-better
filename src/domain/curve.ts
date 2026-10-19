// The 1% curve (FR-27 v3.0; ARCHITECTURE §4.5, ADR-26). Pure functions over one
// goal and its entries; `today` is passed in.
//
// For day d of the period with ordinal k (startDate = 1): ideal(d) = 1.01^k.
// "You": m(d) = minutes logged on d. f = first logged day (baseline), p(d) = last
// logged day ≤ d. actual(d) = m(p(d)) / m(f) (1 before the baseline). Each logged
// day is compared with the previous logged day and the ratios compound, which
// telescopes to that direct ratio — so it is computed as one division, never as a
// running product of floats. Days without time keep the line flat; the line can
// go down. The daily target plays no part here (A-42).
//
// v4.0 (M11, A-52): an open-ended goal (`endDate = null`) has no future days — the ideal line runs
// startDate → today only (`periodDays` = `elapsedDays`), and before it starts there is nothing to draw.
import { dayNumber, daysInclusive, isoFromDayNumber } from './dates';
import type { Goal, ISODate, LogEntry } from './types';

export const DAILY_GROWTH = 1.01;

export interface IdealPoint {
  date: ISODate;
  /** Ordinal of the day in the period, 1-based. */
  k: number;
  /** `1.01^k` */
  value: number;
}

export interface ActualPoint {
  date: ISODate;
  /** Ordinal of the day in the period, 1-based. */
  k: number;
  /** m(d): minutes logged that day (0 when nothing was logged). */
  minutes: number;
  /** m(d) > 0 */
  logged: boolean;
  /** actual(d): factor relative to the baseline (1 before/at the baseline). */
  value: number;
  /** Signed percent of `value`, one decimal (`pct`); 0 before the baseline. */
  percent: number;
  /** Percent vs the previous logged day; null on unlogged days and on the baseline. */
  changePercent: number | null;
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
  /** f: the first logged day. */
  baseline: LoggedDayRef | null;
  /** p(last): the most recent logged day. */
  latest: LoggedDayRef | null;
  /** The logged day before `latest`. */
  previous: LoggedDayRef | null;
  /** pct(latest, previous); null when there is no previous. */
  latestChangePercent: number | null;
  /** actual(last): 1 when nothing is logged or the goal is upcoming. */
  actualFactor: number;
  /** `1.01^elapsedDays` (1 when upcoming) */
  idealFactor: number;
  /** Signed headline percent, one decimal: pct(m(p(last)), m(f)); 0 without a baseline. */
  headlinePercent: number;
  /** `(1.01^elapsedDays − 1) × 100`, rounded to 1 decimal. */
  idealPercent: number;
}

export function growth(days: number): number {
  return Math.pow(DAILY_GROWTH, days);
}

/** `(factor − 1) × 100` rounded to one decimal. */
export function growthPercent(factor: number): number {
  return Math.round((factor - 1) * 1000) / 10;
}

/**
 * Signed percent change from `b` to `a` (both positive minute totals), one decimal,
 * rounded half away from zero so gains and losses round symmetrically; −0 → 0.
 * `pct(17, 16) = 6.3`, `pct(15, 16) = −6.3`, `pct(27, 14) = 92.9`.
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
  // Finite goal: the whole period (future days included). Open-ended: startDate → today, nothing before the start.
  const periodDays = goal.endDate !== null ? daysInclusive(goal.startDate, goal.endDate) : lastDay ? daysInclusive(goal.startDate, lastDay) : 0;
  const start = dayNumber(goal.startDate);
  const ideal: IdealPoint[] = new Array(periodDays);
  for (let i = 0; i < periodDays; i++) {
    ideal[i] = { date: isoFromDayNumber(start + i), k: i + 1, value: growth(i + 1) };
  }

  const actual: ActualPoint[] = [];
  let baseline: LoggedDayRef | null = null;
  let latest: LoggedDayRef | null = null;
  let previous: LoggedDayRef | null = null;
  let loggedDays = 0;
  if (lastDay) {
    const elapsed = daysInclusive(goal.startDate, lastDay);
    // m(d) for the elapsed days only; entries outside the window are ignored (A-41).
    const minutesByDay = new Map<ISODate, number>();
    for (const e of goalEntries) {
      if (e.date < goal.startDate || e.date > lastDay) continue;
      minutesByDay.set(e.date, (minutesByDay.get(e.date) ?? 0) + e.minutes);
    }
    for (let i = 0; i < elapsed; i++) {
      const date = ideal[i].date;
      const minutes = minutesByDay.get(date) ?? 0;
      const logged = minutes > 0;
      let changePercent: number | null = null;
      if (logged) {
        loggedDays++;
        if (!baseline) baseline = { date, minutes };
        else if (latest) changePercent = pct(minutes, latest.minutes);
        previous = latest;
        latest = { date, minutes };
      }
      const value = baseline && latest ? latest.minutes / baseline.minutes : 1;
      const percent = baseline && latest ? pct(latest.minutes, baseline.minutes) : 0;
      actual.push({ date, k: i + 1, minutes, logged, value, percent, changePercent });
    }
  }
  const elapsedDays = actual.length;
  const actualFactor = baseline && latest ? latest.minutes / baseline.minutes : 1;
  const idealFactor = growth(elapsedDays);
  return {
    ideal,
    actual,
    periodDays,
    elapsedDays,
    loggedDays,
    baseline,
    latest,
    previous,
    latestChangePercent: latest && previous ? pct(latest.minutes, previous.minutes) : null,
    actualFactor,
    idealFactor,
    headlinePercent: baseline && latest ? pct(latest.minutes, baseline.minutes) : 0,
    idealPercent: growthPercent(idealFactor),
  };
}

/** Round `x` up to the next "nice" step (1, 2, 5 × 10^n), never below 1 (whole-percent ticks). */
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
 * Linear Y scale (unit: %) for the points on screen, after the Range filter (ARCH §4.5,
 * DESIGN S4 "Biểu đồ v3" rule 3). `yMin = min(0, min You)`, `yMax = max(1, max Ideal, max You)`;
 * 5 % padding on the top and — only when something is negative — on the bottom (OQ-D17), then
 * both ends are rounded outwards to a multiple of a nice step (1, 2, 5 × 10^n, ≥ 1).
 */
export function curveYScale(idealPercents: readonly number[], youPercents: readonly number[]): CurveYScale {
  let min = 0;
  let max = 1;
  for (const v of youPercents) {
    if (v < min) min = v;
    if (v > max) max = v;
  }
  for (const v of idealPercents) if (v > max) max = v;
  const pad = (max - min) * 0.05;
  const lo = min < 0 ? min - pad : 0;
  const hi = max + pad;
  const step = niceStep((hi - lo) / 5);
  const domain: [number, number] = [Math.floor(lo / step) * step, Math.ceil(hi / step) * step];
  const ticks: number[] = [];
  for (let v = domain[0]; v <= domain[1] + 1e-9; v += step) ticks.push(Math.round(v * 1e6) / 1e6);
  return { domain, ticks, step };
}

/** Y domain (unit: %) for the points on screen; see `curveYScale`. */
export function curveYDomain(idealPercents: readonly number[], youPercents: readonly number[]): [number, number] {
  return curveYScale(idealPercents, youPercents).domain;
}
