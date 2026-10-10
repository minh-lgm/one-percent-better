// QC round 1 (M5): independent brute-force oracle for the 1% curve (FR-27). Written from the PRD/TASKS rule only, with
// plain UTC Date arithmetic and repeated multiplication; it shares no code with src/domain/curve.ts or stats.ts.
//   ideal(d)  = 1.01^k  (k = ordinal of d in the period, startDate = 1)
//   actual(d) = 1.01^n  (n = days on target from startDate to d), only for d <= min(today, endDate)
//   headline  = (1.01^n - 1) * 100, one decimal
import { describe, expect, it } from 'vitest';
import { curve } from '../../src/domain/curve';
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

function goal(p: Partial<Goal> & Pick<Goal, 'startDate' | 'endDate'>): Goal {
  return { id: 'g', name: 'G', why: '', targetType: 'daily', targetMinutes: 30, archived: false, createdAt: '2020-01-01T00:00:00.000Z', updatedAt: '2020-01-01T00:00:00.000Z', ...p };
}
function entry(goalId: string, date: string, minutes: number, id = `${goalId}-${date}-${minutes}`): LogEntry {
  return { id, goalId, date, minutes, note: '', source: 'manual', createdAt: '2020-01-01T00:00:00.000Z', updatedAt: '2020-01-01T00:00:00.000Z' };
}
const dailyOf = (g: Goal) => (g.targetType === 'daily' ? g.targetMinutes : Math.ceil(g.targetMinutes / (diff(g.startDate, g.endDate) + 1)));

interface Oracle {
  ideal: Array<{ date: string; v: number }>;
  actual: Array<{ date: string; v: number; n: number }>;
  headline: number;
}
function oracle(g: Goal, entries: LogEntry[], today: string): Oracle {
  const days = diff(g.startDate, g.endDate) + 1;
  const ideal = [];
  for (let k = 1; k <= days; k++) ideal.push({ date: add(g.startDate, k - 1), v: pow101(k) });
  const actual = [];
  const last = today < g.startDate ? null : today < g.endDate ? today : g.endDate;
  let n = 0;
  if (last) {
    for (let d = g.startDate; d <= last; d = add(d, 1)) {
      const m = entries.filter((e) => e.goalId === g.id && e.date === d).reduce((a, e) => a + e.minutes, 0);
      if (m > 0 && m >= dailyOf(g)) n++;
      actual.push({ date: d, v: pow101(n), n });
    }
  }
  return { ideal, actual, headline: Math.round((pow101(n) - 1) * 1000) / 10 };
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
    expect(p.date).toBe(o.actual[i].date);
    expect(p.n).toBe(o.actual[i].n);
    expect(Math.abs(p.value - o.actual[i].v) / o.actual[i].v).toBeLessThan(1e-9);
  });
  expect(c.headlinePercent).toBeCloseTo(o.headline, 5);
  return { c, o };
}

describe('M5 QC oracle: curve', () => {
  it('S1 G1 at 2026-10-09 matches the mockup 07 numbers (ideal +9.4%, you +8.3%, headline 8.3, factor 1.083)', () => {
    const g1 = goal({ id: 'g1', name: 'Read', startDate: '2026-10-01', endDate: '2026-10-31' });
    const entries = Array.from({ length: 8 }, (_, i) => entry('g1', add('2026-10-01', i), 30));
    const { c } = expectMatches(g1, entries, '2026-10-09');
    expect(c.ideal).toHaveLength(31);
    expect(c.actual).toHaveLength(9);
    expect(c.actual.map((p) => p.n)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 8]);
    expect(c.ideal[8].value).toBeCloseTo(1.0937, 4);
    expect(c.actual[8].value).toBeCloseTo(1.0829, 4);
    expect(c.headlinePercent).toBe(8.3);
    expect(c.idealPercent).toBe(9.4);
    expect(c.elapsedDays).toBe(9);
    expect(c.daysOnTarget).toBe(8);
    // the mockup's own formula, replicated verbatim
    const mockIdeal = (Math.pow(1.01, 8 + 1) - 1) * 100;
    const mockYou = (Math.pow(1.01, 8) - 1) * 100;
    expect(mockIdeal.toFixed(1)).toBe('9.4');
    expect(mockYou.toFixed(1)).toBe('8.3');
  });

  it('one-day goal: 1 ideal point of 1.01; met -> 1 actual point 1.01 headline 1.0; missed -> headline 0.0', () => {
    const g = goal({ startDate: '2026-10-09', endDate: '2026-10-09' });
    const met = expectMatches(g, [entry('g', '2026-10-09', 30)], '2026-10-09').c;
    expect(met.ideal).toHaveLength(1);
    expect(met.actual).toHaveLength(1);
    expect(met.headlinePercent).toBe(1);
    const missed = expectMatches(g, [entry('g', '2026-10-09', 29)], '2026-10-09').c;
    expect(missed.headlinePercent).toBe(0);
    expect(missed.actual).toHaveLength(1);
    expectMatches(g, [], '2026-10-08'); // upcoming one-day goal
    expectMatches(g, [entry('g', '2026-10-09', 30)], '2026-10-10'); // ended one-day goal
  });

  it('365-day goal, all days met: headline 3678.3 and 365 points; 366-day leap-year goal', () => {
    const g = goal({ startDate: '2026-01-01', endDate: '2026-12-31' });
    const entries = Array.from({ length: 365 }, (_, i) => entry('g', add('2026-01-01', i), 30));
    const { c } = expectMatches(g, entries, '2026-12-31');
    expect(c.ideal).toHaveLength(365);
    expect(c.actual).toHaveLength(365);
    expect(c.headlinePercent).toBe(3678.3);
    const leap = goal({ startDate: '2028-01-01', endDate: '2028-12-31' });
    const le = Array.from({ length: 366 }, (_, i) => entry('g', add('2028-01-01', i), 30));
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
    expect(up.ideal).toHaveLength(30);
    const old = goal({ startDate: '2026-01-01', endDate: '2026-06-30' });
    const oe = [entry('g', '2026-06-30', 30), entry('g', '2026-01-02', 30)];
    const ended = expectMatches(old, oe, '2026-10-09').c;
    expect(ended.actual).toHaveLength(181);
    expect(ended.actual[ended.actual.length - 1].date).toBe('2026-06-30');
    expect(ended.daysOnTarget).toBe(2);
    const arch = expectMatches({ ...g, archived: true, startDate: '2026-10-01', endDate: '2026-10-31' }, [entry('g', '2026-10-01', 30)], '2026-10-09').c;
    expect(arch.daysOnTarget).toBe(1);
    expectMatches(old, [entry('g', '2026-01-01', 30)], '2026-01-01');
    expectMatches(old, [entry('g', '2026-06-30', 30)], '2026-06-30');
  });

  it('entries outside the period are ignored; the same day split across entries sums; total goals use ceil(total/period)', () => {
    const g = goal({ targetType: 'total', targetMinutes: 6000, startDate: '2026-01-01', endDate: '2026-12-31' }); // 6000/365 -> 17
    const entries = [entry('g', '2026-03-02', 10, 'a'), entry('g', '2026-03-02', 7, 'b'), entry('g', '2026-03-03', 16), entry('g', '2025-12-31', 500), entry('g', '2027-01-01', 500)];
    const { c } = expectMatches(g, entries, '2026-10-09');
    expect(c.daysOnTarget).toBe(1);
  });

  it('1827-day maximum period works and is fast', () => {
    const g = goal({ startDate: '2022-01-01', endDate: '2026-12-31' });
    const entries = Array.from({ length: 1000 }, (_, i) => entry('g', add('2022-01-01', i), 30)).filter((_, i) => i % 3 !== 0);
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
      const g = goal({ startDate: start, endDate: add(start, len - 1), targetType: r() < 0.5 ? 'daily' : 'total', targetMinutes: 0 });
      g.targetMinutes = g.targetType === 'daily' ? 5 + Math.floor(r() * 120) : 60 * (1 + Math.floor(r() * 100));
      if (dailyOf(g) > 1440) g.targetMinutes = 60;
      const entries: LogEntry[] = [];
      for (let i = 0; i < len; i++) {
        if (r() < 0.55) entries.push(entry('g', add(start, i), Math.max(1, Math.floor(dailyOf(g) * (0.3 + r())))));
      }
      expectMatches(g, entries, today);
    });
  }

  it('headline rounding agrees with toFixed(1) for every n in 0..1827', () => {
    const diffs: number[] = [];
    for (let n = 0; n <= 1827; n++) {
      const v = (pow101(n) - 1) * 100;
      if (Math.round(v * 10) / 10 !== Number(v.toFixed(1))) diffs.push(n);
    }
    expect(diffs).toEqual([]);
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
