// M9-AC1 / M9-AC2 (FR-27 v3.0, ratio to the first logged day) superseded by the v6.0 burn-up
// (FR-27 v6.0, user decision 2026-11-02; ARCH §4.5, ADR-46): "Ideal" = the daily target growing
// 1 % a day, added up; "You" = minutes logged, added up; headline = signed % vs the ideal line.
import { describe, expect, it } from 'vitest';
import { addDays } from './dates';
import { buildEntry, buildGoal, datasetO1, datasetR1, datasetR3, datasetR4, datasetS1, TODAY, TODAY_R1 } from '../test/builders';
import { cumulativeTarget, curve, curveYDomain, curveYScale, dayTarget, growth, growthPercent, lastElapsedDay, pct } from './curve';
import type { LogEntry } from './types';

const s1 = datasetS1();
const goalOf = (id: string) => s1.goals.find((g) => g.id === id)!;
const entriesOf = (id: string) => s1.entries.filter((e) => e.goalId === id);
const r1 = datasetR1();
const closeAll = (actual: number[], expected: number[], digits = 9) => {
  expect(actual).toHaveLength(expected.length);
  actual.forEach((v, i) => expect(v).toBeCloseTo(expected[i], digits));
};

/** `count` daily entries of `minutes` from `from` (ids unique per call). */
function daily(goalId: string, from: string, count: number, minutes: number): LogEntry[] {
  return Array.from({ length: count }, (_, i) => buildEntry({ id: `${goalId}-${from}-${i}`, goalId, date: addDays(from, i), minutes }));
}

describe('curve — R1, the user\'s real data (ARCH §4.5 oracle, v6.0)', () => {
  const c = curve(r1.goals[0], r1.entries, TODAY_R1);

  it('4 actual points: minutes 5/10/14/27 → cumulative 5/15/29/56, gap vs 30/60.3/90.903/121.812, percent −83.3/−75.1/−68.1/−54', () => {
    expect(c.actual).toHaveLength(4);
    expect(c.actual.map((p) => p.date)).toEqual(['2026-10-10', '2026-10-11', '2026-10-12', '2026-10-13']);
    expect(c.actual.map((p) => p.k)).toEqual([1, 2, 3, 4]);
    expect(c.actual.map((p) => p.minutes)).toEqual([5, 10, 14, 27]);
    expect(c.actual.map((p) => p.cumulative)).toEqual([5, 15, 29, 56]);
    closeAll(c.actual.map((p) => p.gap), [-25, -45.3, -61.903, -65.81203]);
    expect(c.actual.map((p) => p.percent)).toEqual([-83.3, -75.1, -68.1, -54]);
    expect(c.actual.every((p) => p.logged)).toBe(true);
  });

  it('ideal: 83 points, target 30 × 1.01^(k−1), cumulative 30/60.3/90.903/121.812; headline −54, totals, latest, loggedDays 4, elapsed 4 of 83', () => {
    expect(c.ideal).toHaveLength(83);
    expect(c.ideal[0]).toMatchObject({ date: '2026-10-10', k: 1, target: 30 });
    expect(c.ideal[0].cumulative).toBeCloseTo(30, 9);
    closeAll(c.ideal.slice(0, 4).map((p) => p.target), [30, 30.3, 30.603, 30.90903]);
    closeAll(c.ideal.slice(0, 4).map((p) => p.cumulative), [30, 60.3, 90.903, 121.81203]);
    expect(c.ideal[82]).toMatchObject({ date: '2026-12-31', k: 83 });
    expect(c.headlinePercent).toBe(-54);
    expect(c.totalMinutes).toBe(56);
    expect(c.idealMinutes).toBeCloseTo(121.81203, 9);
    expect(c.gapMinutes).toBeCloseTo(-65.81203, 9);
    expect(c.dailyTarget).toBe(30);
    expect(c.latest).toEqual({ date: '2026-10-13', minutes: 27 });
    expect(c.loggedDays).toBe(4);
    expect(c.elapsedDays).toBe(4);
    expect(c.periodDays).toBe(83);
  });

  it('the daily target drives the ideal line (A-42 reversed): targetMinutes 1 → ideal 1.0303/4.0604, headline +1279.2', () => {
    const t1 = curve({ ...r1.goals[0], targetMinutes: 1 }, r1.entries, TODAY_R1);
    expect(t1.dailyTarget).toBe(1);
    expect(t1.ideal[3].target).toBeCloseTo(1.030301, 9);
    expect(t1.idealMinutes).toBeCloseTo(4.060401, 9);
    expect(t1.headlinePercent).toBe(1279.2);
    expect(t1.actual.map((p) => p.cumulative)).toEqual(c.actual.map((p) => p.cumulative));
  });

  it('(a) today 10-14 without a new entry → 5 points, last one flat {0 min, not logged, cumulative 56, −63.4}; headline −63.4; latest stays 10-13', () => {
    const a = curve(r1.goals[0], r1.entries, '2026-10-14');
    expect(a.actual).toHaveLength(5);
    expect(a.actual[4]).toMatchObject({ date: '2026-10-14', k: 5, minutes: 0, logged: false, cumulative: 56, percent: -63.4 });
    expect(a.actual[4].gap).toBeCloseTo(56 - 153.0301503, 6);
    expect(a.headlinePercent).toBe(-63.4);
    expect(a.totalMinutes).toBe(56);
    expect(a.idealMinutes).toBeCloseTo(153.0301503, 6);
    expect(a.latest).toEqual({ date: '2026-10-13', minutes: 27 });
    expect(a.elapsedDays).toBe(5);
    expect(a.loggedDays).toBe(4);
  });

  it('(b) the 27 minutes of 10-13 split into 20 + 7 → identical result (entries of a day add up, ADR-04)', () => {
    const split = r1.entries.filter((e) => e.date !== '2026-10-13');
    split.push(buildEntry({ id: 's1', goalId: 'r1', date: '2026-10-13', minutes: 20 }), buildEntry({ id: 's2', goalId: 'r1', date: '2026-10-13', minutes: 7, source: 'timer' }));
    expect(curve(r1.goals[0], split, TODAY_R1)).toEqual(c);
  });

  it('(c) without the 10-12 entry → 10-12 flat {0, cumulative 15, −83.5}, 10-13 {cumulative 42, −65.5}; headline −65.5; loggedDays 3', () => {
    const cc = curve(r1.goals[0], r1.entries.filter((e) => e.date !== '2026-10-12'), TODAY_R1);
    expect(cc.actual[2]).toMatchObject({ date: '2026-10-12', minutes: 0, logged: false, cumulative: 15, percent: -83.5 });
    expect(cc.actual[3]).toMatchObject({ date: '2026-10-13', minutes: 27, logged: true, cumulative: 42, percent: -65.5 });
    expect(cc.headlinePercent).toBe(-65.5);
    expect(cc.totalMinutes).toBe(42);
    expect(cc.loggedDays).toBe(3);
  });

  it('(d) today 10-14 with 3 minutes → counts at once (A-39): cumulative 59, headline −61.4, latest = 10-14', () => {
    const d = curve(r1.goals[0], [...r1.entries, buildEntry({ id: 'd', goalId: 'r1', date: '2026-10-14', minutes: 3 })], '2026-10-14');
    expect(d.headlinePercent).toBe(-61.4);
    expect(d.actual[4]).toMatchObject({ date: '2026-10-14', minutes: 3, logged: true, cumulative: 59, percent: -61.4 });
    expect(d.latest).toEqual({ date: '2026-10-14', minutes: 3 });
    expect(d.loggedDays).toBe(5);
  });

  it('(e) today 10-12 → 3 points, headline −68.1; entries after today are ignored', () => {
    const e = curve(r1.goals[0], r1.entries, '2026-10-12');
    expect(e.actual).toHaveLength(3);
    expect(e.headlinePercent).toBe(-68.1);
    expect(e.totalMinutes).toBe(29);
    expect(e.latest).toEqual({ date: '2026-10-12', minutes: 14 });
    expect(e.loggedDays).toBe(3);
  });

  it('(f) only the 10-10 entry → You flat at 5 from day 1, headline −95.9; no entries → You at 0 everywhere, percent −100, headline −100, latest null', () => {
    const one = curve(r1.goals[0], r1.entries.filter((e) => e.date === '2026-10-10'), TODAY_R1);
    expect(one.actual.map((p) => p.cumulative)).toEqual([5, 5, 5, 5]);
    expect(one.headlinePercent).toBe(-95.9);
    expect(one.latest).toEqual({ date: '2026-10-10', minutes: 5 });
    const none = curve(r1.goals[0], [], TODAY_R1);
    expect(none.actual.map((p) => p.cumulative)).toEqual([0, 0, 0, 0]);
    expect(none.actual.every((p) => p.percent === -100 && !p.logged && p.minutes === 0)).toBe(true);
    expect(none.headlinePercent).toBe(-100);
    expect(none.totalMinutes).toBe(0);
    expect(none.idealMinutes).toBeCloseTo(121.81203, 9);
    expect(none.latest).toBeNull();
    expect(none.loggedDays).toBe(0);
  });
});

describe('curve — S1 at 2026-10-09 and boundary rules', () => {
  it('G1 "Read" (30 min on 8 days, target 30): cumulative 30…240 then flat; day 1 exactly on the line (0), day 8 −3.4, day 9 −14.6; headline −14.6', () => {
    const c = curve(goalOf('g1'), entriesOf('g1'), TODAY);
    expect(c.actual).toHaveLength(9);
    expect(c.actual.map((p) => p.cumulative)).toEqual([30, 60, 90, 120, 150, 180, 210, 240, 240]);
    expect(c.actual.map((p) => p.logged)).toEqual([true, true, true, true, true, true, true, true, false]);
    expect(c.actual[0].percent).toBe(0);
    expect(Object.is(c.actual[0].percent, 0)).toBe(true);
    expect(c.actual[0].gap).toBeCloseTo(0, 9);
    expect(c.actual[7].percent).toBe(-3.4);
    expect(c.actual[8].percent).toBe(-14.6);
    expect(c.headlinePercent).toBe(-14.6);
    expect(c.totalMinutes).toBe(240);
    expect(c.idealMinutes).toBeCloseTo(281.0558, 3);
    expect(c.loggedDays).toBe(8);
    expect(c.elapsedDays).toBe(9);
    expect(c.periodDays).toBe(31);
    expect(c.ideal).toHaveLength(31);
    const idealToday = c.ideal.find((p) => p.date === TODAY)!;
    expect(idealToday.k).toBe(9);
    expect(idealToday.target).toBeCloseTo(30 * Math.pow(1.01, 8), 9);
    expect(idealToday.cumulative).toBeCloseTo(281.0558, 3);
    expect(c.ideal[30]).toMatchObject({ date: '2026-10-31', k: 31 });
    expect(c.latest).toEqual({ date: '2026-10-08', minutes: 30 });
  });

  it('G2 "Guitar" (target 20): 39 points, total 250 vs 948.245 → headline −73.6; 09-15 {cumulative 210, −34.8}; flat 210 until 10-06; 10-07 230 (−74.2)', () => {
    const c = curve(goalOf('g2'), entriesOf('g2'), TODAY);
    expect(c.actual).toHaveLength(39);
    const by = (date: string) => c.actual.find((p) => p.date === date)!;
    expect(by('2026-09-01')).toMatchObject({ cumulative: 20, percent: 0 });
    expect(by('2026-09-10')).toMatchObject({ cumulative: 200, percent: -4.4 });
    expect(by('2026-09-15')).toMatchObject({ minutes: 10, logged: true, cumulative: 210, percent: -34.8 });
    for (let i = 15; i <= 35; i++) expect(c.actual[i]).toMatchObject({ logged: false, cumulative: 210 });
    expect(by('2026-10-06')).toMatchObject({ percent: -75.6 });
    expect(by('2026-10-07')).toMatchObject({ minutes: 20, cumulative: 230, percent: -74.2 });
    expect(by('2026-10-08')).toMatchObject({ cumulative: 250, percent: -72.8 });
    expect(by('2026-10-09')).toMatchObject({ logged: false, cumulative: 250, percent: -73.6 });
    expect(c.headlinePercent).toBe(-73.6);
    expect(c.totalMinutes).toBe(250);
    expect(c.idealMinutes).toBeCloseTo(948.245, 3);
    expect(c.loggedDays).toBe(13);
    expect(c.periodDays).toBe(122);
    // Cumulative lines never go down.
    for (let i = 1; i < c.actual.length; i++) expect(c.actual[i].cumulative).toBeGreaterThanOrEqual(c.actual[i - 1].cumulative);
    for (let i = 1; i < c.ideal.length; i++) expect(c.ideal[i].cumulative).toBeGreaterThan(c.ideal[i - 1].cumulative);
  });

  it('G3 "Spanish" (total 6000 min over 365 days → daily target 17, one entry of 60): 282 points, headline −99.8, latest = 03-02', () => {
    const c = curve(goalOf('g3'), entriesOf('g3'), TODAY);
    expect(c.dailyTarget).toBe(17);
    expect(c.ideal[0].target).toBe(17);
    expect(c.actual).toHaveLength(282);
    expect(c.periodDays).toBe(365);
    expect(c.totalMinutes).toBe(60);
    expect(c.actual[60]).toMatchObject({ date: '2026-03-02', k: 61, minutes: 60, cumulative: 60, percent: -95.8 });
    expect(c.actual[59]).toMatchObject({ cumulative: 0, percent: -100 });
    expect(c.headlinePercent).toBe(-99.8);
    expect(c.idealMinutes).toBeCloseTo(26423.9507, 3);
    expect(c.latest).toEqual({ date: '2026-03-02', minutes: 60 });
    expect(c.loggedDays).toBe(1);
  });

  it('G5 "Old course" (ended): 181 points ending 06-30, headline −99.8; G4 upcoming: actual [], 30 ideal points, headline 0, totals 0, latest null', () => {
    const g5 = curve(goalOf('g5'), entriesOf('g5'), TODAY);
    expect(g5.actual).toHaveLength(181);
    expect(g5.actual[180]).toMatchObject({ date: '2026-06-30', k: 181, minutes: 15, cumulative: 15, percent: -99.8 });
    expect(g5.headlinePercent).toBe(-99.8);
    expect(g5.elapsedDays).toBe(181);
    expect(g5.periodDays).toBe(181);
    expect(g5.latest).toEqual({ date: '2026-06-30', minutes: 15 });

    const g4 = curve(goalOf('g4'), [], TODAY);
    expect(g4.actual).toEqual([]);
    expect(g4.ideal).toHaveLength(30);
    expect(g4.ideal[0]).toMatchObject({ date: '2026-11-01', k: 1, target: 45 });
    expect(g4.headlinePercent).toBe(0);
    expect(g4.totalMinutes).toBe(0);
    expect(g4.idealMinutes).toBe(0);
    expect(g4.gapMinutes).toBe(0);
    expect(g4.elapsedDays).toBe(0);
    expect(g4.loggedDays).toBe(0);
    expect(g4.latest).toBeNull();
  });

  it('G1 without entries → 9 points at 0, headline −100, latest null; an entry outside the period changes nothing (A-41)', () => {
    const none = curve(goalOf('g1'), [], TODAY);
    expect(none.actual).toHaveLength(9);
    expect(none.actual.every((p) => p.cumulative === 0 && p.percent === -100 && p.minutes === 0 && !p.logged)).toBe(true);
    expect(none.headlinePercent).toBe(-100);
    expect(none.latest).toBeNull();
    expect(none.loggedDays).toBe(0);
    const outside = [buildEntry({ id: 'x1', goalId: 'g1', date: '2026-09-30', minutes: 100 }), buildEntry({ id: 'x2', goalId: 'g1', date: '2026-11-01', minutes: 100 })];
    expect(curve(goalOf('g1'), outside, TODAY)).toEqual(none);
    expect(curve(goalOf('g1'), [...entriesOf('g1'), ...outside], TODAY)).toEqual(curve(goalOf('g1'), entriesOf('g1'), TODAY));
  });

  it('archived goal is computed like any other (FR-30)', () => {
    expect(curve({ ...goalOf('g1'), archived: true }, entriesOf('g1'), TODAY)).toEqual(curve(goalOf('g1'), entriesOf('g1'), TODAY));
  });

  it('pct: 17/16 → 6.3, 15/16 → −6.3, 1440/1 → 143900, 1/1440 → −99.9, 27/14 → 92.9; equal → 0 (not −0); works with a float denominator', () => {
    expect(pct(17, 16)).toBe(6.3);
    expect(pct(15, 16)).toBe(-6.3);
    expect(pct(1440, 1)).toBe(143900);
    expect(pct(1, 1440)).toBe(-99.9);
    expect(pct(27, 14)).toBe(92.9);
    expect(pct(16, 16)).toBe(0);
    expect(Object.is(pct(16, 16), -0)).toBe(false);
    expect(Object.is(pct(30, 30 + 3e-14), -0)).toBe(false);
    expect(pct(56, 121.81203)).toBe(-54);
    expect(pct(0, 30)).toBe(-100);
    // Half away from zero, symmetric.
    expect(pct(1005, 1000)).toBe(0.5);
    expect(pct(995, 1000)).toBe(-0.5);
  });

  it('R3 (5 → 3, today 10-11) → cumulative 5/8, headline −86.7; R4 (1 → 720 + 720) → cumulative 1/1441, headline +2289.7; the order of the two days does not matter', () => {
    const r3 = datasetR3();
    const c3 = curve(r3.goals[0], r3.entries, '2026-10-11');
    expect(c3.actual.map((p) => p.cumulative)).toEqual([5, 8]);
    expect(c3.actual.map((p) => p.percent)).toEqual([-83.3, -86.7]);
    expect(c3.headlinePercent).toBe(-86.7);
    const r4 = datasetR4();
    const c4 = curve(r4.goals[0], r4.entries, '2026-10-11');
    expect(c4.actual[1]).toMatchObject({ minutes: 1440, cumulative: 1441, percent: 2289.7 });
    expect(c4.actual[1].gap).toBeCloseTo(1441 - 60.3, 9);
    expect(c4.headlinePercent).toBe(2289.7);
    const rev = curve(r4.goals[0], [buildEntry({ id: 'a', goalId: 'r1', date: '2026-10-10', minutes: 1440 }), buildEntry({ id: 'b', goalId: 'r1', date: '2026-10-11', minutes: 1 })], '2026-10-11');
    expect(rev.actual.map((p) => p.cumulative)).toEqual([1440, 1441]);
    expect(rev.actual[0].percent).toBe(4700);
    expect(rev.headlinePercent).toBe(2289.7);
  });

  it('one-day goal: 1 ideal point (target = cumulative = T); logged 12 → headline −60 (12 vs 30); before its day → no actual', () => {
    const g = buildGoal({ id: 'one', targetMinutes: 30, startDate: '2026-10-09', endDate: '2026-10-09' });
    const one = curve(g, [buildEntry({ id: 'o', goalId: 'one', date: '2026-10-09', minutes: 12 })], '2026-10-09');
    expect(one.ideal).toHaveLength(1);
    expect(one.ideal[0]).toMatchObject({ k: 1, target: 30 });
    expect(one.ideal[0].cumulative).toBeCloseTo(30, 9);
    expect(one.actual).toHaveLength(1);
    expect(one.actual[0]).toMatchObject({ cumulative: 12, percent: -60 });
    expect(one.headlinePercent).toBe(-60);
    expect(curve(g, [], '2026-10-08').actual).toEqual([]);
    expect(curve(g, [], '2026-10-08').headlinePercent).toBe(0);
  });

  it('1827-day period (maximum): 1827 ideal points, cumulative(1827) = 30 × (1.01^1827 − 1) / 0.01 ≈ 2.36e11 (finite, closed form); 1500 logged days → integer running sum', () => {
    const g = buildGoal({ id: 'w', targetMinutes: 30, startDate: '2026-01-01', endDate: '2031-01-01' });
    const cw = curve(g, daily('w', '2026-01-01', 1500, 7), '2031-01-01');
    expect(cw.ideal).toHaveLength(1827);
    expect(cw.periodDays).toBe(1827);
    expect(cw.ideal.at(-1)!.cumulative).toBeCloseTo(cumulativeTarget(30, 1827), 0);
    expect(cw.ideal.at(-1)!.cumulative / 1e11).toBeCloseTo(2.3565, 3);
    expect(Number.isFinite(cw.idealMinutes)).toBe(true);
    expect(cw.actual).toHaveLength(1827);
    expect(cw.actual[1499].cumulative).toBe(10500);
    expect(cw.actual.at(-1)!.cumulative).toBe(10500);
    expect(cw.totalMinutes).toBe(10500);
    expect(cw.headlinePercent).toBe(-100);
    expect(cw.loggedDays).toBe(1500);
  });
});

describe('curveYDomain / curveYScale (ARCH §4.5, DESIGN S4 rule 3; unit: minutes)', () => {
  const r1so = curve(r1.goals[0], r1.entries, TODAY_R1);
  const r1Ideal = r1so.ideal.slice(0, 4).map((p) => p.cumulative);
  const r1You = r1so.actual.map((p) => p.cumulative);

  it('R1 so far: lower bound exactly 0 (nothing is ever negative), upper bound ≥ 121.8 with ≤ 5 % + nice-step padding; ticks include 0', () => {
    const s = curveYScale(r1Ideal, r1You);
    const [lo, hi] = s.domain;
    expect(lo).toBe(0);
    expect(hi).toBeGreaterThanOrEqual(121.81203);
    expect(hi).toBeLessThanOrEqual(121.81203 * 1.05 + s.step);
    expect(s.ticks[0]).toBe(0);
    expect(s.ticks.at(-1)).toBe(hi);
    expect(curveYDomain(r1Ideal, r1You)).toEqual(s.domain);
  });

  it('You above Ideal (R4: 1441 vs 60.3) → the You series sets the top; all zeros → yMax > yMin; empty input → [0, > 0]', () => {
    const r4 = datasetR4();
    const c4 = curve(r4.goals[0], r4.entries, '2026-10-11');
    const s = curveYScale(c4.ideal.slice(0, 2).map((p) => p.cumulative), c4.actual.map((p) => p.cumulative));
    expect(s.domain[0]).toBe(0);
    expect(s.domain[1]).toBeGreaterThanOrEqual(1441);
    expect(curveYDomain([0, 0, 0], [0, 0])[1]).toBeGreaterThan(0);
    const empty = curveYDomain([], []);
    expect(empty[0]).toBe(0);
    expect(empty[1]).toBeGreaterThan(0);
  });

  it('steps are 1, 2, 5 × 10^n and never below 1; the 1827-day ideal (2.4e11) stays finite with ≤ 7 ticks', () => {
    const big = curveYScale([cumulativeTarget(30, 1827)], [10500]);
    expect(Number.isFinite(big.domain[1])).toBe(true);
    expect(big.ticks.length).toBeLessThanOrEqual(7);
    for (const [ideal, you] of [
      [[30, 60.3, 90.903], [5, 15, 29]],
      [[10, 20.1], [10, 25]],
      [[1], [0]],
      [[cumulativeTarget(30, 1827)], [10500]],
    ] as Array<[number[], number[]]>) {
      const s = curveYScale(ideal, you);
      const mantissa = s.step / Math.pow(10, Math.floor(Math.log10(s.step)));
      expect([1, 2, 5]).toContain(Math.round(mantissa * 1e6) / 1e6);
      expect(s.step).toBeGreaterThanOrEqual(1);
      expect(s.ticks.length).toBeGreaterThanOrEqual(2);
      expect(s.ticks.length).toBeLessThanOrEqual(8);
      expect(s.domain[0]).toBe(0);
    }
  });
});

describe('growth helpers', () => {
  it('growth, growthPercent, dayTarget, cumulativeTarget', () => {
    expect(growth(0)).toBe(1);
    expect(growth(1)).toBeCloseTo(1.01, 12);
    expect(growthPercent(1.0829)).toBe(8.3);
    expect(growthPercent(1)).toBe(0);
    expect(dayTarget(30, 1)).toBe(30);
    expect(dayTarget(30, 4)).toBeCloseTo(30.90903, 9);
    expect(cumulativeTarget(30, 0)).toBe(0);
    expect(cumulativeTarget(30, -3)).toBe(0);
    expect(cumulativeTarget(30, 1)).toBeCloseTo(30, 9);
    expect(cumulativeTarget(30, 4)).toBeCloseTo(30 + 30.3 + 30.603 + 30.90903, 9);
    expect(cumulativeTarget(10, 9)).toBeCloseTo(93.6853, 3);
    // Closed form equals the day-by-day sum.
    let sum = 0;
    for (let k = 1; k <= 400; k++) sum += dayTarget(20, k);
    expect(cumulativeTarget(20, 400)).toBeCloseTo(sum, 6);
  });
});

describe('curve — open-ended goal O1 (FR-27 v4.0 + v6.0)', () => {
  const o1 = datasetO1();
  const goal = o1.goals[0];

  it('today 2026-10-09: 9 ideal + 9 actual points, periodDays = elapsedDays = 9, cumulative 10/25/25/25/35/35/35/55/55, day 2 ahead (+24.4), headline −41.3', () => {
    const c = curve(goal, o1.entries, TODAY);
    expect(c.periodDays).toBe(9);
    expect(c.elapsedDays).toBe(9);
    expect(c.ideal).toHaveLength(9);
    expect(c.actual).toHaveLength(9);
    expect(c.ideal[0]).toMatchObject({ date: '2026-10-01', k: 1, target: 10 });
    expect(c.ideal[8]).toMatchObject({ date: '2026-10-09', k: 9 });
    expect(c.ideal[8].cumulative).toBeCloseTo(93.6853, 3);
    expect(c.actual.map((p) => p.cumulative)).toEqual([10, 25, 25, 25, 35, 35, 35, 55, 55]);
    expect(c.actual.map((p) => p.percent)).toEqual([0, 24.4, -17.5, -38.4, -31.4, -43.1, -51.5, -33.6, -41.3]);
    expect(c.actual[1].gap).toBeCloseTo(4.9, 9);
    expect(c.headlinePercent).toBe(-41.3);
    expect(c.totalMinutes).toBe(55);
    expect(c.idealMinutes).toBeCloseTo(93.6853, 3);
    expect(c.gapMinutes).toBeCloseTo(-38.6853, 3);
    expect(c.loggedDays).toBe(4);
    expect(c.latest).toEqual({ date: '2026-10-08', minutes: 20 });
  });

  it('today 2026-10-20: 20 + 20 points, headline −75.0, nothing dated after today', () => {
    const c = curve(goal, o1.entries, '2026-10-20');
    expect(c.periodDays).toBe(20);
    expect(c.ideal).toHaveLength(20);
    expect(c.actual).toHaveLength(20);
    expect(c.ideal.at(-1)!.date).toBe('2026-10-20');
    expect(c.actual.at(-1)).toMatchObject({ date: '2026-10-20', cumulative: 55, percent: -75 });
    expect(c.headlinePercent).toBe(-75);
    expect(c.idealMinutes).toBeCloseTo(220.19, 2);
  });

  it('today 2031-10-02: 1,828 points (> 1,827 — no period limit for open-ended goals, A-49), ideal ≈ 7.9e10 minutes but finite, headline −100', () => {
    const c = curve(goal, o1.entries, '2031-10-02');
    expect(c.ideal).toHaveLength(1828);
    expect(c.actual).toHaveLength(1828);
    expect(c.periodDays).toBe(1828);
    expect(Number.isFinite(c.idealMinutes)).toBe(true);
    expect(c.idealMinutes / 1e10).toBeCloseTo(7.9336, 3);
    expect(c.headlinePercent).toBe(-100);
    expect(c.totalMinutes).toBe(55);
  });

  it('not started yet (start 2026-11-01): no ideal and no actual points, headline 0, totals 0', () => {
    const c = curve({ ...goal, startDate: '2026-11-01' }, [], TODAY);
    expect(c).toMatchObject({ ideal: [], actual: [], periodDays: 0, elapsedDays: 0, loggedDays: 0, headlinePercent: 0, totalMinutes: 0, idealMinutes: 0, gapMinutes: 0, latest: null });
  });

  it('first day (start = today, 10 min logged): one point per line, exactly on the ideal (0)', () => {
    const c = curve({ ...goal, startDate: TODAY }, [buildEntry({ id: 'x', goalId: 'o1', date: TODAY, minutes: 10 })], TODAY);
    expect(c.ideal).toHaveLength(1);
    expect(c.actual).toHaveLength(1);
    expect(c.actual[0]).toMatchObject({ cumulative: 10, percent: 0 });
    expect(c.headlinePercent).toBe(0);
    expect(Object.is(c.headlinePercent, -0)).toBe(false);
  });

  it('lastElapsedDay: today for a running open-ended goal, null before it starts; finite goals unchanged', () => {
    expect(lastElapsedDay(goal, TODAY)).toBe(TODAY);
    expect(lastElapsedDay(goal, '2031-10-02')).toBe('2031-10-02');
    expect(lastElapsedDay({ ...goal, startDate: '2026-11-01' }, TODAY)).toBeNull();
    expect(lastElapsedDay(goalOf('g1'), TODAY)).toBe(TODAY);
    expect(lastElapsedDay(goalOf('g5'), TODAY)).toBe('2026-06-30');
    expect(lastElapsedDay(goalOf('g4'), TODAY)).toBeNull();
  });
});
