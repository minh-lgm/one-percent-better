// QC round 1 (M5), re-targeted in M9 round 1 (v3.0) and again for the v6.0 curve (FR-27 v6.0, ARCH section 4.5, ADR-46,
// user decision 2026-11-02): independent brute-force oracle for the 1% curve, a BURN-UP of minutes against a compounding target.
// Written from the PRD/TASKS rule only, with plain UTC Date arithmetic and EXACT rational arithmetic (BigInt fractions); it shares
// no code with src/domain/curve.ts, goal.ts or stats.ts. The v3 oracle (ratio to the first logged day, compounded) was superseded by
// the user's decision of 2026-11-02 (TASKS, "superseded tests" section).
//   T          = plan start (v6.1, ADR-47): targetMinutes for a daily goal; for a total goal the EXACT fraction
//                targetMinutes * (1/100) / ((101/100)^N - 1) = targetMinutes * 100^(N-1) / (101^N - 100^N), N = period days,
//                so that ideal(N) equals the total the user typed exactly (was ceil(targetMinutes / N) in v6.0)
//   target(k)  = T * (101/100)^(k-1)            (k = ordinal of the day in the period, startDate = 1)
//   ideal(k)   = T * sum_{i<k} (101/100)^i = T * (101^k - 100^k) / 100^(k-1)   -- exact fraction, never a float running sum
//   m(d)       = total minutes of all entries of the goal on d, only d in [startDate, min(today, endDate)]
//   actual(k)  = integer running sum of m(d) over the elapsed days <= k; days without time keep the line flat (never down)
//   percent(k) = (actual(k) / ideal(k) - 1) * 100, one decimal, rounded half away from zero, -0 -> 0 (-100 while nothing is logged)
//   headline   = percent(last elapsed day); 0 when the goal has not started
import { describe, expect, it } from 'vitest';
import { curve, pct } from '../../src/domain/curve';
import { markPlusOneShown, newlyMetGoals } from '../../src/domain/plusone';
import type { Goal, LogEntry } from '../../src/domain/types';

const D = (s: string) => new Date(`${s}T00:00:00Z`);
const S = (d: Date) => d.toISOString().slice(0, 10);
const add = (s: string, n: number) => S(new Date(D(s).getTime() + n * 86_400_000));
const diff = (a: string, b: string) => Math.round((D(b).getTime() - D(a).getTime()) / 86_400_000);

/** M11 (QC r1 re-target): `Goal.endDate` is `ISODate | null`; this oracle models finite goals only (open-ended: tests/qc/m11-r1-open-ended.test.ts). */
const endOf = (g: Goal): string => {
  if (g.endDate === null) throw new Error('oracle models finite goals only');
  return g.endDate;
};
function goal(p: Partial<Goal> & Pick<Goal, 'startDate' | 'endDate'>): Goal {
  return { id: 'g', name: 'G', why: '', targetType: 'daily', targetMinutes: 30, archived: false, createdAt: '2020-01-01T00:00:00.000Z', updatedAt: '2020-01-01T00:00:00.000Z', ...p };
}
function entry(goalId: string, date: string, minutes: number, id = `${goalId}-${date}-${minutes}`): LogEntry {
  return { id, goalId, date, minutes, note: '', source: 'manual', createdAt: '2020-01-01T00:00:00.000Z', updatedAt: '2020-01-01T00:00:00.000Z' };
}

// ---------- exact rational arithmetic ----------
/** Unreduced fraction n/d (d > 0). Reduction is skipped on purpose: 101^k grows to thousands of digits and gcd would dominate. */
interface Frac {
  n: bigint;
  d: bigint;
}
const frac = (n: number | bigint, d: number | bigint): Frac => ({ n: BigInt(n), d: BigInt(d) });
/** Nearest double of n/d, safe for numerators far above Number.MAX_VALUE (scaled integer division, 15 decimals). */
const toNum = (f: Frac) => Number((f.n * 10n ** 15n) / f.d) / 1e15;
/** (a/b - 1) * 100 rounded to one decimal, half away from zero, exact; -0 never escapes. */
function pctOfFrac(f: Frac): number {
  const t = (f.n - f.d) * 1000n;
  const neg = t < 0n;
  const abs = neg ? -t : t;
  let q = abs / f.d;
  if ((abs % f.d) * 2n >= f.d) q += 1n;
  const r = Number(q) / 10;
  return neg && q !== 0n ? -r : r;
}
/** pct(a, ideal) with an integer a and an exact ideal fraction: (a * d) / n. */
const pctVs = (a: number, ideal: Frac): number => pctOfFrac({ n: BigInt(a) * ideal.d, d: ideal.n });
/** a/b * c/d, unreduced. */
const mul = (a: Frac, b: Frac): Frac => ({ n: a.n * b.n, d: a.d * b.d });
/** True when the fraction equals the integer `v` exactly. */
const equalsInt = (f: Frac, v: number): boolean => f.n === BigInt(v) * f.d;
/** 101^N - 100^N. */
const grown = (N: number): bigint => 101n ** BigInt(N) - 100n ** BigInt(N);

// ---------- oracle ----------
interface OIdeal {
  date: string;
  target: Frac;
  cumulative: Frac;
}
interface OPoint {
  date: string;
  minutes: number;
  cumulative: number;
  percent: number;
}
interface Ref {
  date: string;
  minutes: number;
}
interface Oracle {
  ideal: OIdeal[];
  actual: OPoint[];
  periodDays: number;
  elapsedDays: number;
  loggedDays: number;
  /** T, the plan start (exact; an integer for a daily goal). */
  startTarget: Frac;
  latest: Ref | null;
  totalMinutes: number;
  idealMinutes: Frac;
  headline: number;
}
function oracle(g: Goal, entries: LogEntry[], today: string): Oracle {
  const days = diff(g.startDate, endOf(g)) + 1;
  // v6.1: T = targetMinutes (daily) or targetMinutes * 100^(N-1) / (101^N - 100^N) (total) -- exact
  const T: Frac = g.targetType === 'daily' ? frac(g.targetMinutes, 1) : frac(BigInt(g.targetMinutes) * 100n ** BigInt(days - 1), grown(days));
  const ideal: OIdeal[] = [];
  let p101 = 1n; // 101^(k-1)
  let p100 = 1n; // 100^(k-1)
  for (let k = 1; k <= days; k++) {
    const target = mul(T, frac(p101, p100));
    const cumulative = mul(T, frac(p101 * 101n - p100 * 100n, p100)); // T * (101^k - 100^k) / 100^(k-1)
    ideal.push({ date: add(g.startDate, k - 1), target, cumulative });
    p101 *= 101n;
    p100 *= 100n;
  }
  const actual: OPoint[] = [];
  const last = today < g.startDate ? null : today < endOf(g) ? today : endOf(g);
  let latest: Ref | null = null;
  let loggedDays = 0;
  let sum = 0;
  if (last) {
    for (let d = g.startDate; d <= last; d = add(d, 1)) {
      const m = entries.filter((e) => e.goalId === g.id && e.date === d).reduce((a, e) => a + e.minutes, 0);
      if (m > 0) {
        loggedDays++;
        latest = { date: d, minutes: m };
      }
      sum += m;
      actual.push({ date: d, minutes: m, cumulative: sum, percent: pctVs(sum, ideal[actual.length].cumulative) });
    }
  }
  const elapsedDays = actual.length;
  const idealMinutes = elapsedDays > 0 ? ideal[elapsedDays - 1].cumulative : frac(0, 1);
  return {
    ideal,
    actual,
    periodDays: days,
    elapsedDays,
    loggedDays,
    startTarget: T,
    latest,
    totalMinutes: sum,
    idealMinutes,
    headline: elapsedDays > 0 ? pctVs(sum, idealMinutes) : 0,
  };
}

/** Relative tolerance 1e-9 (src computes the ideal line with floats; the oracle is exact). */
const closeRel = (got: number, want: number, label: string) => {
  const scale = Math.max(1, Math.abs(want));
  expect(Math.abs(got - want) / scale, `${label}: got ${got}, want ${want}`).toBeLessThan(1e-9);
};

function expectMatches(g: Goal, entries: LogEntry[], today: string) {
  const c = curve(g, entries, today);
  const o = oracle(g, entries, today);
  expect(c.ideal).toHaveLength(o.ideal.length);
  expect(c.actual).toHaveLength(o.actual.length);
  expect(c.periodDays).toBe(o.periodDays);
  expect(c.elapsedDays).toBe(o.elapsedDays);
  closeRel(c.startTarget, toNum(o.startTarget), 'startTarget');
  if (g.targetType === 'daily') expect(c.startTarget).toBe(g.targetMinutes);
  else {
    // v6.1 (ADR-47): a total goal's plan adds up to exactly the total -- exact in the oracle, within float tolerance in src
    expect(equalsInt(o.ideal[o.ideal.length - 1].cumulative, g.targetMinutes), 'oracle ideal(N) = total exactly').toBe(true);
    closeRel(c.ideal[c.ideal.length - 1].cumulative, g.targetMinutes, 'ideal(N) = total');
    expect(c.startTarget).toBeLessThanOrEqual(g.targetMinutes);
  }
  let prevIdeal = -1;
  c.ideal.forEach((p, i) => {
    const q = o.ideal[i];
    expect(p.date).toBe(q.date);
    expect(p.k).toBe(i + 1);
    closeRel(p.target, toNum(q.target), `target ${p.date}`);
    closeRel(p.cumulative, toNum(q.cumulative), `ideal cumulative ${p.date}`);
    expect(p.cumulative, `ideal strictly increasing ${p.date}`).toBeGreaterThan(prevIdeal);
    prevIdeal = p.cumulative;
  });
  let prevYou = -1;
  c.actual.forEach((p, i) => {
    const q = o.actual[i];
    expect(p.date).toBe(q.date);
    expect(p.k).toBe(i + 1);
    expect(p.minutes, `minutes ${p.date}`).toBe(q.minutes);
    expect(p.logged).toBe(q.minutes > 0);
    expect(p.cumulative, `cumulative ${p.date}`).toBe(q.cumulative);
    expect(p.cumulative, `you never goes down ${p.date}`).toBeGreaterThanOrEqual(prevYou);
    prevYou = p.cumulative;
    closeRel(p.gap, q.cumulative - toNum(o.ideal[i].cumulative), `gap ${p.date}`);
    expect(p.percent, `percent ${p.date}`).toBe(q.percent);
    expect(Object.is(p.percent, -0)).toBe(false);
  });
  expect(c.headlinePercent).toBe(o.headline);
  expect(Object.is(c.headlinePercent, -0)).toBe(false);
  expect(c.loggedDays).toBe(o.loggedDays);
  expect(c.latest).toEqual(o.latest);
  expect(c.totalMinutes).toBe(o.totalMinutes);
  closeRel(c.idealMinutes, toNum(o.idealMinutes), 'idealMinutes');
  closeRel(c.gapMinutes, o.totalMinutes - toNum(o.idealMinutes), 'gapMinutes');
  expect(Object.is(c.gapMinutes, -0)).toBe(false);
  return { c, o };
}

describe('M9 QC oracle: curve (FR-27 v6.0, burn-up of minutes against a compounding target)', () => {
  it('S1 G1 at 2026-10-09: 30 min every day 10-01..10-08 -> you 30..240 then flat; day 1 = 0.0 (gap 0), day 8 -3.4, day 9 -14.6', () => {
    const g1 = goal({ id: 'g1', name: 'Read', startDate: '2026-10-01', endDate: '2026-10-31' });
    const entries = Array.from({ length: 8 }, (_, i) => entry('g1', add('2026-10-01', i), 30));
    const { c } = expectMatches(g1, entries, '2026-10-09');
    expect(c.ideal).toHaveLength(31);
    expect(c.actual).toHaveLength(9);
    expect(c.actual.map((p) => p.cumulative)).toEqual([30, 60, 90, 120, 150, 180, 210, 240, 240]);
    expect(c.actual.map((p) => p.minutes)).toEqual([30, 30, 30, 30, 30, 30, 30, 30, 0]);
    expect(c.actual[0].percent).toBe(0);
    expect(Math.abs(c.actual[0].gap)).toBeLessThan(1e-9);
    expect(c.actual[7].percent).toBe(-3.4);
    expect(c.actual[8].percent).toBe(-14.6);
    expect(c.headlinePercent).toBe(-14.6);
    expect(c.idealMinutes).toBeCloseTo(281.0558, 4);
    expect(c.totalMinutes).toBe(240);
    expect(c.startTarget).toBe(30);
    expect(c.elapsedDays).toBe(9);
    expect(c.loggedDays).toBe(8);
    expect(c.ideal[0].target).toBeCloseTo(30, 9);
    expect(c.ideal[30].target).toBeCloseTo(30 * 1.01 ** 30, 9);
  });

  it("R1 (the user's real data) 5 -> 10 -> 14 -> 27: cumulative 5/15/29/56 vs ideal 30/60.3/90.903/121.81203 -> headline -54.0; the target now matters", () => {
    const g = goal({ startDate: '2026-10-10', endDate: '2026-12-31', targetMinutes: 30 });
    const r1 = [entry('g', '2026-10-10', 5), entry('g', '2026-10-11', 10), entry('g', '2026-10-12', 14), entry('g', '2026-10-13', 27)];
    const { c } = expectMatches(g, r1, '2026-10-13');
    expect(c.actual.map((p) => p.cumulative)).toEqual([5, 15, 29, 56]);
    expect(c.ideal.slice(0, 4).map((p) => p.cumulative)).toEqual([30, 60.3, 90.903, 121.81203].map((v) => expect.closeTo(v, 9)));
    expect(c.actual.map((p) => p.percent)).toEqual([-83.3, -75.1, -68.1, -54]);
    expect(c.headlinePercent).toBe(-54);
    expect(c.totalMinutes).toBe(56);
    expect(c.idealMinutes).toBeCloseTo(121.81203, 9);
    expect(c.gapMinutes).toBeCloseTo(-65.81203, 9);
    expect(c.periodDays).toBe(83);
    expect(c.latest).toEqual({ date: '2026-10-13', minutes: 27 });
    // v6: the daily target IS the ideal line (v3 A-42 "the target plays no part" is gone)
    const t1 = expectMatches({ ...g, targetMinutes: 1 }, r1, '2026-10-13').c;
    expect(t1.headlinePercent).toBe(1279.2);
    expect(t1.startTarget).toBe(1);
    expect(t1.ideal[0].cumulative).toBeCloseTo(1, 12);
    // v6.1 (ADR-47): a total goal starts at T = 99999 * 0.01 / (1.01^83 - 1) = 778.878835... (was ceil(99999 / 83) = 1205) and
    // its ideal line ends at exactly 99999; ideal(4) = 3162.5... -> 56 min is -98.2 (was -98.9)
    const total = expectMatches({ ...g, targetType: 'total', targetMinutes: 99999 }, r1, '2026-10-13').c;
    expect(total.startTarget).toBeCloseTo(778.878835, 6);
    expect(total.ideal[0].cumulative).toBeCloseTo(778.878835, 6);
    expect(total.ideal[82].cumulative).toBeCloseTo(99999, 6);
    expect(total.headlinePercent).toBe(-98.2);
    // the 10-12 entry removed: that day stays flat at 15 and 10-13 lands on 42
    const gap = expectMatches(g, r1.filter((e) => e.date !== '2026-10-12'), '2026-10-13').c;
    expect(gap.actual[2]).toMatchObject({ minutes: 0, logged: false, cumulative: 15, percent: -83.5 });
    expect(gap.actual[3]).toMatchObject({ cumulative: 42, percent: -65.5 });
    // nothing logged at all: every point is at 0 and -100, latest null
    const none = expectMatches(g, [], '2026-10-13').c;
    expect(none.actual.map((p) => p.cumulative)).toEqual([0, 0, 0, 0]);
    expect(none.actual.map((p) => p.percent)).toEqual([-100, -100, -100, -100]);
    expect(none.headlinePercent).toBe(-100);
    expect(none.latest).toBeNull();
    expect(none.loggedDays).toBe(0);
  });

  it('R3 5 -> 3 = cumulative 5, 8, headline -86.7; R4 1 -> 720+720 = 1, 1441 -> +2289.7; 1440 -> 1 gives the same headline (order does not matter)', () => {
    const g = goal({ startDate: '2026-10-10', endDate: '2026-12-31', targetMinutes: 30 });
    const r3 = expectMatches(g, [entry('g', '2026-10-10', 5), entry('g', '2026-10-11', 3)], '2026-10-11').c;
    expect(r3.actual.map((p) => p.cumulative)).toEqual([5, 8]);
    expect(r3.headlinePercent).toBe(-86.7);
    const r4 = expectMatches(g, [entry('g', '2026-10-10', 1), entry('g', '2026-10-11', 720, 'a'), entry('g', '2026-10-11', 720, 'b')], '2026-10-11').c;
    expect(r4.actual.map((p) => p.cumulative)).toEqual([1, 1441]);
    expect(r4.headlinePercent).toBe(2289.7);
    const r4r = expectMatches(g, [entry('g', '2026-10-10', 1440), entry('g', '2026-10-11', 1)], '2026-10-11').c;
    expect(r4r.actual.map((p) => p.cumulative)).toEqual([1440, 1441]);
    expect(r4r.headlinePercent).toBe(2289.7);
  });

  it('A-39: today counts immediately (an unlogged today keeps you flat at 56 -> -63.4; 3 min today -> 59, -61.4)', () => {
    const g = goal({ startDate: '2026-10-10', endDate: '2026-12-31' });
    const r1 = [entry('g', '2026-10-10', 5), entry('g', '2026-10-11', 10), entry('g', '2026-10-12', 14), entry('g', '2026-10-13', 27)];
    const flat = expectMatches(g, r1, '2026-10-14').c;
    expect(flat.actual[4]).toMatchObject({ minutes: 0, logged: false, cumulative: 56, percent: -63.4 });
    expect(flat.headlinePercent).toBe(-63.4);
    expect(flat.latest).toEqual({ date: '2026-10-13', minutes: 27 });
    const down = expectMatches(g, [...r1, entry('g', '2026-10-14', 3)], '2026-10-14').c;
    expect(down.actual[4]).toMatchObject({ minutes: 3, logged: true, cumulative: 59 });
    expect(down.headlinePercent).toBe(-61.4);
    expect(down.latest).toEqual({ date: '2026-10-14', minutes: 3 });
  });

  it('one-day goal: 1 ideal point at T; logged T -> 1 actual point at 0.0; not logged -> -100; upcoming / ended', () => {
    const g = goal({ startDate: '2026-10-09', endDate: '2026-10-09' });
    const logged = expectMatches(g, [entry('g', '2026-10-09', 30)], '2026-10-09').c;
    expect(logged.ideal).toHaveLength(1);
    expect(logged.ideal[0].cumulative).toBeCloseTo(30, 9);
    expect(logged.actual).toHaveLength(1);
    expect(logged.headlinePercent).toBe(0);
    expect(expectMatches(g, [], '2026-10-09').c.headlinePercent).toBe(-100);
    const up = expectMatches(g, [], '2026-10-08').c; // upcoming one-day goal
    expect(up.actual).toEqual([]);
    expect(up.headlinePercent).toBe(0);
    const ended = expectMatches(g, [entry('g', '2026-10-09', 30)], '2026-10-10').c; // ended one-day goal
    expect(ended.actual).toHaveLength(1);
    expect(ended.headlinePercent).toBe(0);
  });

  it('365-day goal logging 30 every day: 10,950 min vs ideal 110,350 -> -90.1; 366-day leap-year goal has 02-29', () => {
    const g = goal({ startDate: '2026-01-01', endDate: '2026-12-31' });
    const entries = Array.from({ length: 365 }, (_, i) => entry('g', add('2026-01-01', i), 30));
    const { c } = expectMatches(g, entries, '2026-12-31');
    expect(c.ideal).toHaveLength(365);
    expect(c.actual).toHaveLength(365);
    expect(c.totalMinutes).toBe(10_950);
    expect(c.idealMinutes).toBeCloseTo(110_350.303, 2);
    expect(c.headlinePercent).toBe(-90.1);
    const leap = goal({ startDate: '2028-01-01', endDate: '2028-12-31' });
    const le = Array.from({ length: 366 }, (_, i) => entry('g', add('2028-01-01', i), 30 + (i % 7)));
    const r = expectMatches(leap, le, '2028-12-31');
    expect(r.c.ideal).toHaveLength(366);
    expect(r.c.ideal.some((p) => p.date === '2028-02-29')).toBe(true);
    expect(r.c.actual[59].date).toBe('2028-02-29');
    expect(r.c.actual[60].date).toBe('2028-03-01');
    expect(r.c.totalMinutes).toBe(12_073);
    expect(r.c.headlinePercent).toBe(-89.2);
  });

  it('not started yet / ended / archived / today = first day / today = last day', () => {
    const g = goal({ startDate: '2026-11-01', endDate: '2026-11-30' });
    const up = expectMatches(g, [], '2026-10-09').c;
    expect(up.actual).toEqual([]);
    expect(up.headlinePercent).toBe(0);
    expect(up.elapsedDays).toBe(0);
    expect(up.totalMinutes).toBe(0);
    expect(up.idealMinutes).toBe(0);
    expect(up.gapMinutes).toBe(0);
    expect(up.latest).toBeNull();
    expect(up.ideal).toHaveLength(30);
    expect(up.ideal[0].cumulative).toBeCloseTo(30, 9);
    const old = goal({ startDate: '2026-01-01', endDate: '2026-06-30' });
    const oe = [entry('g', '2026-06-30', 30), entry('g', '2026-01-02', 30)];
    const ended = expectMatches(old, oe, '2026-10-09').c;
    expect(ended.actual).toHaveLength(181);
    expect(ended.actual[ended.actual.length - 1].date).toBe('2026-06-30');
    expect(ended.loggedDays).toBe(2);
    expect(ended.totalMinutes).toBe(60);
    expect(ended.headlinePercent).toBe(-99.6);
    const a = { ...g, archived: true, startDate: '2026-10-01', endDate: '2026-10-31' };
    const ae = [entry('g', '2026-10-01', 30), entry('g', '2026-10-05', 60)];
    const arch = expectMatches(a, ae, '2026-10-09').c;
    expect(arch).toEqual(curve({ ...a, archived: false }, ae, '2026-10-09'));
    expect(arch.headlinePercent).toBe(-68);
    const first = expectMatches(old, [entry('g', '2026-01-01', 30)], '2026-01-01').c;
    expect(first.actual).toHaveLength(1);
    expect(first.headlinePercent).toBe(0);
    expectMatches(old, [entry('g', '2026-06-30', 30)], '2026-06-30');
  });

  it('S1 G2 "Guitar" (20/day, 09-01 -> 12-31; today 10-09): 39 points, total 250, headline -73.6; 09-15 {210, -34.8}; 10-07 {230, -74.2}', () => {
    const g2 = goal({ id: 'g2', name: 'Guitar', targetMinutes: 20, startDate: '2026-09-01', endDate: '2026-12-31' });
    const entries = [
      ...Array.from({ length: 10 }, (_, i) => entry('g2', add('2026-09-01', i), 20)),
      entry('g2', '2026-09-15', 10),
      entry('g2', '2026-10-07', 20),
      entry('g2', '2026-10-08', 20),
    ];
    const { c } = expectMatches(g2, entries, '2026-10-09');
    expect(c.actual).toHaveLength(39);
    expect(c.totalMinutes).toBe(250);
    expect(c.headlinePercent).toBe(-73.6);
    expect(c.actual[14]).toMatchObject({ date: '2026-09-15', cumulative: 210, percent: -34.8 });
    expect(c.actual[36]).toMatchObject({ date: '2026-10-07', cumulative: 230, percent: -74.2 });
    expect(c.loggedDays).toBe(13);
  });

  it('S1 G5 "Old course" (15/day, 01-01 -> 06-30, one entry 06-30: 15; today 10-09): 181 points, headline -99.8', () => {
    const g5 = goal({ id: 'g5', name: 'Old course', targetMinutes: 15, startDate: '2026-01-01', endDate: '2026-06-30' });
    const { c } = expectMatches(g5, [entry('g5', '2026-06-30', 15)], '2026-10-09');
    expect(c.actual).toHaveLength(181);
    expect(c.ideal).toHaveLength(181);
    expect(c.headlinePercent).toBe(-99.8);
    expect(c.actual.slice(0, 180).every((p) => p.cumulative === 0 && p.percent === -100)).toBe(true);
    expect(c.actual[180]).toMatchObject({ cumulative: 15, minutes: 15, logged: true });
  });

  it('total goal (v6.1): startTarget = targetMinutes * 0.01 / (1.01^N - 1) (S1 G3 "Spanish" 6000 min / 365 d -> 1.631169, ideal(365) = 6000 exactly); entries outside the period and in the future are ignored; the same day split across entries sums', () => {
    const g = goal({ targetType: 'total', targetMinutes: 6000, startDate: '2026-01-01', endDate: '2026-12-31' });
    const spanish = expectMatches(g, [entry('g', '2026-03-02', 60)], '2026-10-09').c;
    expect(spanish.startTarget).toBeCloseTo(1.631169, 6);
    expect(spanish.ideal[0].cumulative).toBeCloseTo(1.631169, 6);
    expect(spanish.ideal[364].cumulative).toBeCloseTo(6000, 6);
    expect(spanish.actual).toHaveLength(282);
    // ideal(282) = 2535.4076... -> 60 min is -97.6 (v6.0 with T = 17: -99.8); on 03-02 (k = 61) ideal = 136.1... -> -55.9
    expect(spanish.headlinePercent).toBe(-97.6);
    expect(spanish.actual[60]).toMatchObject({ date: '2026-03-02', cumulative: 60, percent: -55.9 });
    const entries = [entry('g', '2026-03-02', 10, 'a'), entry('g', '2026-03-02', 7, 'b'), entry('g', '2026-03-03', 16), entry('g', '2025-12-31', 500), entry('g', '2027-01-01', 500), entry('g', '2026-10-10', 900)];
    const { c } = expectMatches(g, entries, '2026-10-09');
    expect(c.loggedDays).toBe(2);
    expect(c.totalMinutes).toBe(33);
    expect(c.latest).toEqual({ date: '2026-03-03', minutes: 16 });
    expect(c.actual[60]).toMatchObject({ date: '2026-03-02', minutes: 17, cumulative: 17, percent: -87.5 });
    expect(c.actual[0]).toMatchObject({ cumulative: 0, percent: -100 });
    expect(c.headlinePercent).toBe(-98.7); // 33 vs ideal(282) = 2535.4 (v6.0: -99.9)
    // the start is NOT rounded (v6.0 used ceil(total / N)): 3650 -> 0.992295, 3651 -> 0.992566, both plans end exactly at the total
    const t3650 = expectMatches({ ...g, targetMinutes: 3650 }, [], '2026-10-09').c;
    expect(t3650.startTarget).toBeCloseTo(0.992295, 6);
    expect(t3650.ideal[364].cumulative).toBeCloseTo(3650, 6);
    expect(expectMatches({ ...g, targetMinutes: 3651 }, [], '2026-10-09').c.startTarget).toBeCloseTo(0.992566, 6);
  });

  it('1827-day maximum period works and is fast; the ideal line is exact (closed form, no accumulated float error)', () => {
    const g = goal({ startDate: '2022-01-01', endDate: '2026-12-31' });
    const entries = Array.from({ length: 1000 }, (_, i) => entry('g', add('2022-01-01', i), 1 + ((i * 37) % 1440))).filter((_, i) => i % 3 !== 0);
    const t0 = performance.now();
    const { c } = expectMatches(g, entries, '2026-10-09');
    expect(c.ideal).toHaveLength(1826);
    expect(Number.isFinite(c.ideal[1825].cumulative)).toBe(true);
    expect(c.ideal[1825].cumulative).toBeGreaterThan(2e9); // 30 * (1.01^1826 - 1) / 0.01 ~ 2.3e9 minutes
    expect(performance.now() - t0).toBeLessThan(10_000);
  });

  for (let seed = 1; seed <= 40; seed++) {
    it(`randomised dataset ${seed}`, () => {
      let x = seed * 2654435761;
      const r = () => ((x = (Math.imul(x, 1664525) + 1013904223) >>> 0) / 2 ** 32);
      const startOffset = Math.floor(r() * 1200) - 600;
      const today = ['2026-10-09', '2028-02-29', '2024-02-28', '2025-12-31'][seed % 4];
      const start = add(today, startOffset);
      const len = 1 + Math.floor(r() * 700);
      const daily = r() < 0.5;
      // daily: 1..240 min a day; total: 1..60 min a day on average (any remainder -> ceil)
      const targetMinutes = daily ? 1 + Math.floor(r() * 240) : 1 + Math.floor(r() * len * 60);
      const g = goal({ startDate: start, endDate: add(start, len - 1), targetType: daily ? 'daily' : 'total', targetMinutes });
      const entries: LogEntry[] = [];
      for (let i = 0; i < len; i++) {
        // up to 3 entries a day, 1..400 minutes each (big and small days), ~45 % of days unlogged
        if (r() < 0.55) {
          const n = 1 + Math.floor(r() * 3);
          for (let j = 0; j < n; j++) entries.push(entry('g', add(start, i), 1 + Math.floor(r() * r() * 400), `e${i}-${j}`));
        }
      }
      entries.push(entry('g', add(start, -3), 77, 'before'), entry('g', add(start, len + 5), 77, 'after')); // outside the period
      expectMatches(g, entries, today);
    });
  }

  it('pct(a, b) equals the exact rational oracle (half away from zero) for every a, b in 1..160 and 30k random pairs up to 1440', () => {
    const bad: string[] = [];
    const check = (a: number, b: number) => {
      const exp = pctOfFrac(frac(a, b));
      const got = pct(a, b);
      if (got !== exp || Object.is(got, -0)) bad.push(`${a}/${b}: got ${got}, want ${exp}`);
    };
    for (let a = 1; a <= 160; a++) for (let b = 1; b <= 160; b++) check(a, b);
    let x = 12345;
    const r = () => ((x = (Math.imul(x, 1664525) + 1013904223) >>> 0) / 2 ** 32);
    for (let i = 0; i < 30_000; i++) check(1 + Math.floor(r() * 1440), 1 + Math.floor(r() * 1440));
    expect(bad.slice(0, 10)).toEqual([]);
    expect([pct(17, 16), pct(15, 16), pct(27, 14), pct(1440, 1), pct(1, 1440), pct(405, 400), pct(395, 400), pct(0, 30)]).toEqual([6.3, -6.3, 92.9, 143900, -99.9, 1.3, -1.3, -100]);
    expect(Object.is(pct(7, 7), 0)).toBe(true);
  });

  it('a 0-minute entry is not a logged day (0, 8, 0, 16 -> cumulative 0, 8, 8, 24; headline -80.3; never a division by zero)', () => {
    const g = goal({ startDate: '2026-10-10', endDate: '2026-12-31' });
    const z = expectMatches(g, [entry('g', '2026-10-10', 0), entry('g', '2026-10-11', 8), entry('g', '2026-10-12', 0), entry('g', '2026-10-13', 16)], '2026-10-13').c;
    expect(z.actual.map((p) => p.cumulative)).toEqual([0, 8, 8, 24]);
    expect(z.actual.map((p) => p.logged)).toEqual([false, true, false, true]);
    expect(z.loggedDays).toBe(2);
    expect(z.latest).toEqual({ date: '2026-10-13', minutes: 16 });
    expect(z.headlinePercent).toBe(-80.3);
    for (const p of z.actual) expect(Number.isFinite(p.gap) && Number.isFinite(p.percent)).toBe(true);
  });
});

describe('M5 QC: plus-one helpers', () => {
  it('fires only on a not-met -> met transition, never on first snapshot, never twice the same day, forgets other days', () => {
    expect(newlyMetGoals(null, new Set(['a']), {}, '2026-10-09')).toEqual([]);
    expect(newlyMetGoals(new Set(), new Set(['a']), {}, '2026-10-09')).toEqual(['a']);
    expect(newlyMetGoals(new Set(['a']), new Set(['a']), {}, '2026-10-09')).toEqual([]);
    expect(newlyMetGoals(new Set(), new Set(['a']), { a: '2026-10-09' }, '2026-10-09')).toEqual([]);
    expect(newlyMetGoals(new Set(), new Set(['a']), { a: '2026-10-08' }, '2026-10-09')).toEqual(['a']);
    expect(markPlusOneShown({ a: '2026-10-08', b: '2026-10-09' }, 'c', '2026-10-09')).toEqual({ b: '2026-10-09', c: '2026-10-09' });
  });
});
