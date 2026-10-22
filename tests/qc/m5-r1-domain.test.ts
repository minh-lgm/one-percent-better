// QC round 1 (M5), re-targeted in M9 round 1 (FR-27 v3.0, ARCH section 4.5): independent brute-force oracle for the 1% curve.
// Written from the PRD/TASKS rule only, with plain UTC Date arithmetic and EXACT rational arithmetic (BigInt fractions); it shares
// no code with src/domain/curve.ts or stats.ts. M5's oracle (1.01^n, n = days on target) was superseded by the user's decision of
// 2026-10-13 (TASKS "Test cũ bị thay thế").
//   ideal(d)  = 1.01^(k-1)  (k = ordinal of d in the period, startDate = 1; day 1 = +0%, user decision 2026-10-22)
//   m(d)      = total minutes of all entries of the goal on d, only d in [startDate, min(today, endDate)]
//   logged day: m(d) > 0; baseline f = first logged day; each logged day after f multiplies the line by m(d)/m(previous logged day);
//   days without time keep the line flat; before f the line is 1. Compounded here as a real running product of fractions.
//   headline  = (line(last) - 1) * 100, one decimal, rounded half away from zero, -0 -> 0
import { describe, expect, it } from 'vitest';
import { curve, pct } from '../../src/domain/curve';
import { markPlusOneShown, newlyMetGoals } from '../../src/domain/plusone';
import type { Goal, LogEntry } from '../../src/domain/types';

const D = (s: string) => new Date(`${s}T00:00:00Z`);
const S = (d: Date) => d.toISOString().slice(0, 10);
const add = (s: string, n: number) => S(new Date(D(s).getTime() + n * 86_400_000));
const diff = (a: string, b: string) => Math.round((D(b).getTime() - D(a).getTime()) / 86_400_000);
const pow101 = (n: number) => {
  let v = 1;
  for (let i = 0; i < n; i++) v *= 1.01;
  return v;
};

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

const gcd = (a: bigint, b: bigint): bigint => (b === 0n ? a : gcd(b, a % b));
interface Frac {
  n: bigint;
  d: bigint;
}
const frac = (n: number | bigint, d: number | bigint): Frac => {
  const nn = BigInt(n);
  const dd = BigInt(d);
  const g = gcd(nn < 0n ? -nn : nn, dd);
  return g === 0n ? { n: nn, d: dd } : { n: nn / g, d: dd / g };
};
const mul = (a: Frac, b: Frac): Frac => frac(a.n * b.n, a.d * b.d);
const toNum = (f: Frac) => Number(f.n) / Number(f.d);
/** (a/b - 1) * 100 rounded to one decimal, half away from zero, exact. */
function pctOfFrac(f: Frac): number {
  const t = (f.n - f.d) * 1000n;
  const neg = t < 0n;
  const abs = neg ? -t : t;
  let q = abs / f.d;
  if ((abs % f.d) * 2n >= f.d) q += 1n;
  const r = Number(q) / 10;
  return neg && q !== 0n ? -r : r;
}

interface OPoint {
  date: string;
  minutes: number;
  value: number;
  percent: number;
  change: number | null;
}
interface Ref {
  date: string;
  minutes: number;
}
interface Oracle {
  ideal: Array<{ date: string; v: number }>;
  actual: OPoint[];
  headline: number;
  loggedDays: number;
  baseline: Ref | null;
  latest: Ref | null;
  previous: Ref | null;
  factor: number;
}
function oracle(g: Goal, entries: LogEntry[], today: string): Oracle {
  const days = diff(g.startDate, endOf(g)) + 1;
  const ideal = [];
  for (let k = 1; k <= days; k++) ideal.push({ date: add(g.startDate, k - 1), v: pow101(k - 1) });
  const actual: OPoint[] = [];
  const last = today < g.startDate ? null : today < endOf(g) ? today : endOf(g);
  let line: Frac = frac(1, 1);
  let baseline: Ref | null = null;
  let latest: Ref | null = null;
  let previous: Ref | null = null;
  let loggedDays = 0;
  if (last) {
    for (let d = g.startDate; d <= last; d = add(d, 1)) {
      const m = entries.filter((e) => e.goalId === g.id && e.date === d).reduce((a, e) => a + e.minutes, 0);
      let change: number | null = null;
      if (m > 0) {
        loggedDays++;
        if (latest) {
          line = mul(line, frac(m, latest.minutes)); // the day-over-day ratio, compounded
          change = pctOfFrac(frac(m, latest.minutes));
        } else baseline = { date: d, minutes: m };
        previous = latest;
        latest = { date: d, minutes: m };
      }
      actual.push({ date: d, minutes: m, value: toNum(line), percent: pctOfFrac(line), change });
    }
  }
  return { ideal, actual, headline: pctOfFrac(line), loggedDays, baseline, latest, previous, factor: toNum(line) };
}

function expectMatches(g: Goal, entries: LogEntry[], today: string) {
  const c = curve(g, entries, today);
  const o = oracle(g, entries, today);
  expect(c.ideal).toHaveLength(o.ideal.length);
  expect(c.actual).toHaveLength(o.actual.length);
  c.ideal.forEach((p, i) => {
    expect(p.date).toBe(o.ideal[i].date);
    expect(p.k).toBe(i + 1);
    expect(Math.abs(p.value - o.ideal[i].v) / o.ideal[i].v).toBeLessThan(1e-9);
  });
  c.actual.forEach((p, i) => {
    const q = o.actual[i];
    expect(p.date).toBe(q.date);
    expect(p.k).toBe(i + 1);
    expect(p.minutes, `minutes ${p.date}`).toBe(q.minutes);
    expect(p.logged).toBe(q.minutes > 0);
    expect(Math.abs(p.value - q.value) / q.value, `value ${p.date}`).toBeLessThan(1e-12);
    expect(p.percent, `percent ${p.date}`).toBe(q.percent);
    expect(Object.is(p.percent, -0)).toBe(false);
    expect(p.changePercent, `change ${p.date}`).toBe(q.change);
  });
  expect(c.headlinePercent).toBe(o.headline);
  expect(Object.is(c.headlinePercent, -0)).toBe(false);
  expect(c.loggedDays).toBe(o.loggedDays);
  expect(c.baseline).toEqual(o.baseline);
  expect(c.latest).toEqual(o.latest);
  expect(c.previous).toEqual(o.previous);
  expect(Math.abs(c.actualFactor - o.factor) / o.factor).toBeLessThan(1e-12);
  return { c, o };
}

describe('M9 QC oracle: curve (FR-27 v3.0)', () => {
  it('S1 G1 at 2026-10-09: 30 min every day 10-01..10-08 -> the line stays at +0.0% (headline 0, M5 was 8.3); ideal still +8.3%', () => {
    const g1 = goal({ id: 'g1', name: 'Read', startDate: '2026-10-01', endDate: '2026-10-31' });
    const entries = Array.from({ length: 8 }, (_, i) => entry('g1', add('2026-10-01', i), 30));
    const { c } = expectMatches(g1, entries, '2026-10-09');
    expect(c.ideal).toHaveLength(31);
    expect(c.actual).toHaveLength(9);
    expect(c.actual.map((p) => p.value)).toEqual([1, 1, 1, 1, 1, 1, 1, 1, 1]);
    expect(c.actual.map((p) => p.changePercent)).toEqual([null, 0, 0, 0, 0, 0, 0, 0, null]);
    expect(c.ideal[8].value).toBeCloseTo(1.0829, 4);
    expect(Object.is(c.headlinePercent, 0)).toBe(true);
    expect(c.idealPercent).toBe(8.3);
    expect(c.elapsedDays).toBe(9);
    expect(c.loggedDays).toBe(8);
  });

  it("R1 (the user's real data) 5 -> 10 -> 14 -> 27 = +440.0% (x5.4); R3 5 -> 3 = -40.0%; R4 1 -> 1440 = +143900.0%, 1440 -> 1 = -99.9%", () => {
    const g = goal({ startDate: '2026-10-10', endDate: '2026-12-31', targetMinutes: 30 });
    const r1 = [entry('g', '2026-10-10', 5), entry('g', '2026-10-11', 10), entry('g', '2026-10-12', 14), entry('g', '2026-10-13', 27)];
    const { c } = expectMatches(g, r1, '2026-10-13');
    expect(c.actual.map((p) => p.percent)).toEqual([0, 100, 180, 440]);
    expect(c.actual.map((p) => p.changePercent)).toEqual([null, 100, 40, 92.9]);
    expect(c.headlinePercent).toBe(440);
    expect(c.periodDays).toBe(83);
    expect(c.latestChangePercent).toBe(92.9);
    expect(c.idealPercent).toBe(3);
    // A-42: the daily target plays no part
    expect(curve({ ...g, targetMinutes: 1 }, r1, '2026-10-13')).toEqual(c);
    expect(curve({ ...g, targetType: 'total', targetMinutes: 99999 }, r1, '2026-10-13')).toEqual(c);
    expect(expectMatches(g, [entry('g', '2026-10-10', 5), entry('g', '2026-10-11', 3)], '2026-10-11').c.headlinePercent).toBe(-40);
    expect(expectMatches(g, [entry('g', '2026-10-10', 1), entry('g', '2026-10-11', 720, 'a'), entry('g', '2026-10-11', 720, 'b')], '2026-10-11').c.headlinePercent).toBe(143900);
    expect(expectMatches(g, [entry('g', '2026-10-10', 1440), entry('g', '2026-10-11', 1)], '2026-10-11').c.headlinePercent).toBe(-99.9);
  });

  it('A-39: today counts immediately (27 yesterday, 3 today -> -88.9% change, headline -40); an unlogged today keeps the line flat', () => {
    const g = goal({ startDate: '2026-10-10', endDate: '2026-12-31' });
    const r1 = [entry('g', '2026-10-10', 5), entry('g', '2026-10-11', 10), entry('g', '2026-10-12', 14), entry('g', '2026-10-13', 27)];
    const flat = expectMatches(g, r1, '2026-10-14').c;
    expect(flat.actual[4]).toMatchObject({ minutes: 0, logged: false, value: 5.4, percent: 440, changePercent: null });
    const down = expectMatches(g, [...r1, entry('g', '2026-10-14', 3)], '2026-10-14').c;
    expect(down.headlinePercent).toBe(-40);
    expect(down.actual[4].changePercent).toBe(-88.9);
    expect(down.latest).toEqual({ date: '2026-10-14', minutes: 3 });
    expect(down.previous).toEqual({ date: '2026-10-13', minutes: 27 });
  });

  it('one-day goal: 1 ideal point; logged -> 1 actual point at +0.0% (baseline = itself); not logged -> +0.0%; upcoming / ended', () => {
    const g = goal({ startDate: '2026-10-09', endDate: '2026-10-09' });
    const logged = expectMatches(g, [entry('g', '2026-10-09', 30)], '2026-10-09').c;
    expect(logged.ideal).toHaveLength(1);
    expect(logged.actual).toHaveLength(1);
    expect(logged.headlinePercent).toBe(0);
    expect(expectMatches(g, [], '2026-10-09').c.headlinePercent).toBe(0);
    expectMatches(g, [], '2026-10-08'); // upcoming one-day goal
    expectMatches(g, [entry('g', '2026-10-09', 30)], '2026-10-10'); // ended one-day goal
  });

  it('365-day goal logging 30 every day stays at +0.0% (M5 had 3678.3); 366-day leap-year goal has 02-29', () => {
    const g = goal({ startDate: '2026-01-01', endDate: '2026-12-31' });
    const entries = Array.from({ length: 365 }, (_, i) => entry('g', add('2026-01-01', i), 30));
    const { c } = expectMatches(g, entries, '2026-12-31');
    expect(c.ideal).toHaveLength(365);
    expect(c.actual).toHaveLength(365);
    expect(c.headlinePercent).toBe(0);
    const leap = goal({ startDate: '2028-01-01', endDate: '2028-12-31' });
    const le = Array.from({ length: 366 }, (_, i) => entry('g', add('2028-01-01', i), 30 + (i % 7)));
    const r = expectMatches(leap, le, '2028-12-31');
    expect(r.c.ideal).toHaveLength(366);
    expect(r.c.ideal.some((p) => p.date === '2028-02-29')).toBe(true);
    expect(r.c.actual[59].date).toBe('2028-02-29');
    expect(r.c.actual[60].date).toBe('2028-03-01');
  });

  it('not started yet / ended / archived / today = first day / today = last day', () => {
    const g = goal({ startDate: '2026-11-01', endDate: '2026-11-30' });
    const up = expectMatches(g, [], '2026-10-09').c;
    expect(up.actual).toEqual([]);
    expect(up.headlinePercent).toBe(0);
    expect(up.elapsedDays).toBe(0);
    expect(up.actualFactor).toBe(1);
    expect(up.baseline).toBeNull();
    expect(up.ideal).toHaveLength(30);
    const old = goal({ startDate: '2026-01-01', endDate: '2026-06-30' });
    const oe = [entry('g', '2026-06-30', 30), entry('g', '2026-01-02', 30)];
    const ended = expectMatches(old, oe, '2026-10-09').c;
    expect(ended.actual).toHaveLength(181);
    expect(ended.actual[ended.actual.length - 1].date).toBe('2026-06-30');
    expect(ended.loggedDays).toBe(2);
    const a = { ...g, archived: true, startDate: '2026-10-01', endDate: '2026-10-31' };
    const ae = [entry('g', '2026-10-01', 30), entry('g', '2026-10-05', 60)];
    expect(expectMatches(a, ae, '2026-10-09').c).toEqual(curve({ ...a, archived: false }, ae, '2026-10-09'));
    expectMatches(old, [entry('g', '2026-01-01', 30)], '2026-01-01');
    expectMatches(old, [entry('g', '2026-06-30', 30)], '2026-06-30');
  });

  it('entries outside the period and in the future are ignored; the same day split across entries sums; unlogged first days stay at 1', () => {
    const g = goal({ targetType: 'total', targetMinutes: 6000, startDate: '2026-01-01', endDate: '2026-12-31' });
    const entries = [entry('g', '2026-03-02', 10, 'a'), entry('g', '2026-03-02', 7, 'b'), entry('g', '2026-03-03', 16), entry('g', '2025-12-31', 500), entry('g', '2027-01-01', 500), entry('g', '2026-10-10', 900)];
    const { c } = expectMatches(g, entries, '2026-10-09');
    expect(c.baseline).toEqual({ date: '2026-03-02', minutes: 17 });
    expect(c.headlinePercent).toBe(-5.9); // 16 / 17
    expect(c.actual[0].value).toBe(1);
  });

  it('1827-day maximum period works and is fast; the line is exact (no accumulated float error)', () => {
    const g = goal({ startDate: '2022-01-01', endDate: '2026-12-31' });
    const entries = Array.from({ length: 1000 }, (_, i) => entry('g', add('2022-01-01', i), 1 + ((i * 37) % 1440))).filter((_, i) => i % 3 !== 0);
    const t0 = performance.now();
    const { c } = expectMatches(g, entries, '2026-10-09');
    expect(c.ideal).toHaveLength(1826);
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
      const g = goal({ startDate: start, endDate: add(start, len - 1), targetType: r() < 0.5 ? 'daily' : 'total', targetMinutes: 30 });
      const entries: LogEntry[] = [];
      for (let i = 0; i < len; i++) {
        // up to 3 entries a day, 1..400 minutes each (big and small days -> up and down moves), ~45 % of days unlogged
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
    expect([pct(17, 16), pct(15, 16), pct(27, 14), pct(1440, 1), pct(1, 1440), pct(405, 400), pct(395, 400)]).toEqual([6.3, -6.3, 92.9, 143900, -99.9, 1.3, -1.3]);
    expect(Object.is(pct(7, 7), 0)).toBe(true);
  });

  it('a 0-minute entry is not a logged day (no baseline, no flat-line break, never a division by zero)', () => {
    const g = goal({ startDate: '2026-10-10', endDate: '2026-12-31' });
    const z = expectMatches(g, [entry('g', '2026-10-10', 0), entry('g', '2026-10-11', 8), entry('g', '2026-10-12', 0), entry('g', '2026-10-13', 16)], '2026-10-13').c;
    expect(z.baseline).toEqual({ date: '2026-10-11', minutes: 8 });
    expect(z.headlinePercent).toBe(100);
    for (const p of z.actual) expect(Number.isFinite(p.value) && Number.isFinite(p.percent)).toBe(true);
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
