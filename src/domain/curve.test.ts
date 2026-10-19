// M5-AC1 superseded by M9-AC1 / M9-AC2 (FR-27 v3.0): the "You" line is the ratio of minutes
// to the previous logged day, compounded from the first logged day (ARCH §4.5 oracle).
import { describe, expect, it } from 'vitest';
import { addDays } from './dates';
import { buildEntry, buildGoal, datasetO1, datasetR1, datasetR3, datasetR4, datasetS1, TODAY, TODAY_R1 } from '../test/builders';
import { curve, curveYDomain, curveYScale, growth, growthPercent, lastElapsedDay, pct } from './curve';
import type { LogEntry } from './types';

const s1 = datasetS1();
const goalOf = (id: string) => s1.goals.find((g) => g.id === id)!;
const entriesOf = (id: string) => s1.entries.filter((e) => e.goalId === id);
const r1 = datasetR1();
const closeAll = (actual: number[], expected: number[]) => {
  expect(actual).toHaveLength(expected.length);
  actual.forEach((v, i) => expect(v).toBeCloseTo(expected[i], 12));
};

/** `count` daily entries of `minutes` from `from` (ids unique per call). */
function daily(goalId: string, from: string, count: number, minutes: number): LogEntry[] {
  return Array.from({ length: count }, (_, i) => buildEntry({ id: `${goalId}-${from}-${i}`, goalId, date: addDays(from, i), minutes }));
}

describe('curve — R1, the user\'s real data (M9-AC1, ARCH §4.5)', () => {
  const c = curve(r1.goals[0], r1.entries, TODAY_R1);

  it('4 actual points: minutes 5/10/14/27 → value 1/2/2.8/5.4, percent 0/100/180/440, change null/100/40/92.9', () => {
    expect(c.actual).toHaveLength(4);
    expect(c.actual.map((p) => p.date)).toEqual(['2026-10-10', '2026-10-11', '2026-10-12', '2026-10-13']);
    expect(c.actual.map((p) => p.k)).toEqual([1, 2, 3, 4]);
    expect(c.actual.map((p) => p.minutes)).toEqual([5, 10, 14, 27]);
    closeAll(c.actual.map((p) => p.value), [1, 2, 2.8, 5.4]);
    expect(c.actual.map((p) => p.percent)).toEqual([0, 100, 180, 440]);
    expect(c.actual.map((p) => p.changePercent)).toEqual([null, 100, 40, 92.9]);
    expect(c.actual.every((p) => p.logged)).toBe(true);
  });

  it('headline 440, factor 5.4, baseline/latest/previous, loggedDays 4, elapsed 4 of 83, ideal 1/2/3/4.1 → idealPercent 4.1', () => {
    expect(c.headlinePercent).toBe(440);
    expect(c.actualFactor).toBeCloseTo(5.4, 12);
    expect(c.baseline).toEqual({ date: '2026-10-10', minutes: 5 });
    expect(c.latest).toEqual({ date: '2026-10-13', minutes: 27 });
    expect(c.previous).toEqual({ date: '2026-10-12', minutes: 14 });
    expect(c.latestChangePercent).toBe(92.9);
    expect(c.loggedDays).toBe(4);
    expect(c.elapsedDays).toBe(4);
    expect(c.periodDays).toBe(83);
    expect(c.ideal).toHaveLength(83);
    expect(c.ideal.slice(0, 4).map((p) => growthPercent(p.value))).toEqual([1, 2, 3, 4.1]);
    expect(c.idealPercent).toBe(4.1);
    expect(c.idealFactor).toBeCloseTo(Math.pow(1.01, 4), 12);
    // The daily target (30) is above every logged day and plays no part (A-42).
    expect(curve({ ...r1.goals[0], targetMinutes: 1 }, r1.entries, TODAY_R1)).toEqual(c);
  });

  it('(a) today 10-14 without a new entry → 5 points, last one flat {0 min, not logged, 5.4, 440, null}; headline 440; latest stays 10-13; ideal 5.1', () => {
    const a = curve(r1.goals[0], r1.entries, '2026-10-14');
    expect(a.actual).toHaveLength(5);
    expect(a.actual[4]).toMatchObject({ date: '2026-10-14', minutes: 0, logged: false, percent: 440, changePercent: null });
    expect(a.actual[4].value).toBeCloseTo(5.4, 12);
    expect(a.headlinePercent).toBe(440);
    expect(a.latest).toEqual({ date: '2026-10-13', minutes: 27 });
    expect(a.previous).toEqual({ date: '2026-10-12', minutes: 14 });
    expect(a.elapsedDays).toBe(5);
    expect(a.loggedDays).toBe(4);
    expect(a.idealPercent).toBe(5.1);
  });

  it('(b) the 27 minutes of 10-13 split into 20 + 7 → identical result (entries of a day add up, ADR-04)', () => {
    const split = r1.entries.filter((e) => e.date !== '2026-10-13');
    split.push(buildEntry({ id: 's1', goalId: 'r1', date: '2026-10-13', minutes: 20 }), buildEntry({ id: 's2', goalId: 'r1', date: '2026-10-13', minutes: 7, source: 'timer' }));
    expect(curve(r1.goals[0], split, TODAY_R1)).toEqual(c);
  });

  it('(c) without the 10-12 entry → 10-12 flat {0, 2, 100, null}, 10-13 change +170 vs 10-11, previous = 10-11, headline 440, loggedDays 3', () => {
    const cc = curve(r1.goals[0], r1.entries.filter((e) => e.date !== '2026-10-12'), TODAY_R1);
    expect(cc.actual[2]).toMatchObject({ date: '2026-10-12', minutes: 0, logged: false, value: 2, percent: 100, changePercent: null });
    expect(cc.actual[3]).toMatchObject({ date: '2026-10-13', minutes: 27, logged: true, percent: 440, changePercent: 170 });
    expect(cc.previous).toEqual({ date: '2026-10-11', minutes: 10 });
    expect(cc.latestChangePercent).toBe(170);
    expect(cc.headlinePercent).toBe(440);
    expect(cc.loggedDays).toBe(3);
  });

  it('(d) today 10-14 with 3 minutes → headline −40, 10-14 change −88.9, latest = 10-14, previous = 10-13 (A-39)', () => {
    const d = curve(r1.goals[0], [...r1.entries, buildEntry({ id: 'd', goalId: 'r1', date: '2026-10-14', minutes: 3 })], '2026-10-14');
    expect(d.headlinePercent).toBe(-40);
    expect(d.actual[4]).toMatchObject({ date: '2026-10-14', minutes: 3, logged: true, percent: -40, changePercent: -88.9 });
    expect(d.actual[4].value).toBeCloseTo(0.6, 12);
    expect(d.actualFactor).toBeCloseTo(0.6, 12);
    expect(d.latest).toEqual({ date: '2026-10-14', minutes: 3 });
    expect(d.previous).toEqual({ date: '2026-10-13', minutes: 27 });
    expect(d.latestChangePercent).toBe(-88.9);
  });

  it('(e) today 10-12 → 3 points, headline 180; entries after today are ignored', () => {
    const e = curve(r1.goals[0], r1.entries, '2026-10-12');
    expect(e.actual).toHaveLength(3);
    expect(e.headlinePercent).toBe(180);
    expect(e.latest).toEqual({ date: '2026-10-12', minutes: 14 });
    expect(e.loggedDays).toBe(3);
  });
});

describe('curve — S1 at 2026-10-09 and boundary rules (M9-AC2)', () => {
  it('G1 "Read" (30 min on 8 days): 9 points all value 1 / percent 0; change null, 0 ×7, null; headline 0; loggedDays 8; ideal 9.4', () => {
    const c = curve(goalOf('g1'), entriesOf('g1'), TODAY);
    expect(c.actual).toHaveLength(9);
    expect(c.actual.every((p) => p.value === 1 && p.percent === 0)).toBe(true);
    expect(c.actual.map((p) => p.changePercent)).toEqual([null, 0, 0, 0, 0, 0, 0, 0, null]);
    expect(c.actual.map((p) => p.logged)).toEqual([true, true, true, true, true, true, true, true, false]);
    expect(c.headlinePercent).toBe(0);
    expect(Object.is(c.headlinePercent, 0)).toBe(true);
    expect(c.loggedDays).toBe(8);
    expect(c.elapsedDays).toBe(9);
    expect(c.periodDays).toBe(31);
    expect(c.idealPercent).toBe(9.4);
    expect(c.ideal).toHaveLength(31);
    const idealToday = c.ideal.find((p) => p.date === TODAY)!;
    expect(idealToday.k).toBe(9);
    expect(idealToday.value).toBeCloseTo(1.0937, 4);
    expect(c.ideal[0].value).toBeCloseTo(1.01, 10);
    expect(c.ideal[30]).toMatchObject({ date: '2026-10-31', k: 31 });
    expect(c.baseline).toEqual({ date: '2026-10-01', minutes: 30 });
    expect(c.latest).toEqual({ date: '2026-10-08', minutes: 30 });
    expect(c.previous).toEqual({ date: '2026-10-07', minutes: 30 });
    expect(c.latestChangePercent).toBe(0);
    expect(c.actualFactor).toBe(1);
  });

  it('G2 "Guitar": 39 points; 09-15 −50 (10 vs 20), flat −50 until 10-06, 10-07 back to 0 with +100; headline 0; loggedDays 13; ideal 47.4', () => {
    const c = curve(goalOf('g2'), entriesOf('g2'), TODAY);
    expect(c.actual).toHaveLength(39);
    const by = (date: string) => c.actual.find((p) => p.date === date)!;
    for (let i = 0; i < 14; i++) expect(c.actual[i].percent).toBe(0);
    expect(by('2026-09-15')).toMatchObject({ minutes: 10, logged: true, value: 0.5, percent: -50, changePercent: -50 });
    for (let i = 15; i <= 35; i++) expect(c.actual[i]).toMatchObject({ logged: false, percent: -50, changePercent: null });
    expect(by('2026-10-06').date).toBe(c.actual[35].date);
    expect(by('2026-10-07')).toMatchObject({ minutes: 20, value: 1, percent: 0, changePercent: 100 });
    expect(by('2026-10-08')).toMatchObject({ percent: 0, changePercent: 0 });
    expect(by('2026-10-09')).toMatchObject({ logged: false, percent: 0, changePercent: null });
    expect(c.headlinePercent).toBe(0);
    expect(c.loggedDays).toBe(13);
    expect(c.idealPercent).toBe(47.4);
  });

  it('G3 "Spanish" (one entry): 282 points, headline 0, baseline = latest, previous null, latestChangePercent null', () => {
    const c = curve(goalOf('g3'), entriesOf('g3'), TODAY);
    expect(c.actual).toHaveLength(282);
    expect(c.headlinePercent).toBe(0);
    expect(c.baseline).toEqual({ date: '2026-03-02', minutes: 60 });
    expect(c.latest).toEqual({ date: '2026-03-02', minutes: 60 });
    expect(c.previous).toBeNull();
    expect(c.latestChangePercent).toBeNull();
    expect(c.loggedDays).toBe(1);
  });

  it('G5 "Old course" (ended): 181 points ending 06-30, headline 0; G4 upcoming: actual [], headline 0, factor 1, baseline null', () => {
    const g5 = curve(goalOf('g5'), entriesOf('g5'), TODAY);
    expect(g5.actual).toHaveLength(181);
    expect(g5.actual.at(-1)).toMatchObject({ date: '2026-06-30', minutes: 15, logged: true, percent: 0 });
    expect(g5.headlinePercent).toBe(0);
    expect(g5.latest).toEqual({ date: '2026-06-30', minutes: 15 });
    expect(lastElapsedDay(goalOf('g5'), TODAY)).toBe('2026-06-30');

    const g4 = curve(goalOf('g4'), [], TODAY);
    expect(g4.actual).toEqual([]);
    expect(g4.ideal).toHaveLength(30);
    expect(g4.headlinePercent).toBe(0);
    expect(g4.idealPercent).toBe(0);
    expect(g4.elapsedDays).toBe(0);
    expect(g4.loggedDays).toBe(0);
    expect(g4.actualFactor).toBe(1);
    expect(g4.idealFactor).toBe(1);
    expect(g4.baseline).toBeNull();
    expect(g4.latest).toBeNull();
    expect(g4.previous).toBeNull();
    expect(g4.latestChangePercent).toBeNull();
    expect(lastElapsedDay(goalOf('g4'), TODAY)).toBeNull();
  });

  it('G1 without entries → 9 points value 1, headline 0, baseline null, loggedDays 0; an entry outside the period changes nothing (A-41)', () => {
    const none = curve(goalOf('g1'), [], TODAY);
    expect(none.actual).toHaveLength(9);
    expect(none.actual.every((p) => p.value === 1 && p.percent === 0 && p.minutes === 0 && !p.logged && p.changePercent === null)).toBe(true);
    expect(none.headlinePercent).toBe(0);
    expect(none.baseline).toBeNull();
    expect(none.latest).toBeNull();
    expect(none.loggedDays).toBe(0);
    expect(none.actualFactor).toBe(1);
    const outside = [...entriesOf('g1'), buildEntry({ id: 'out', goalId: 'g1', date: '2026-09-30', minutes: 120 })];
    expect(curve(goalOf('g1'), outside, TODAY)).toEqual(curve(goalOf('g1'), entriesOf('g1'), TODAY));
    const future = [...entriesOf('g1'), buildEntry({ id: 'fut', goalId: 'g1', date: '2026-10-10', minutes: 120 })];
    expect(curve(goalOf('g1'), future, TODAY)).toEqual(curve(goalOf('g1'), entriesOf('g1'), TODAY));
  });

  it('archived goal is computed like any other (FR-30)', () => {
    expect(curve({ ...goalOf('g1'), archived: true }, entriesOf('g1'), TODAY)).toEqual(curve(goalOf('g1'), entriesOf('g1'), TODAY));
  });

  it('pct: 17/16 → 6.3, 15/16 → −6.3, 1440/1 → 143900, 1/1440 → −99.9, 27/14 → 92.9; equal minutes → 0 (not −0)', () => {
    expect(pct(17, 16)).toBe(6.3);
    expect(pct(15, 16)).toBe(-6.3);
    expect(pct(1440, 1)).toBe(143900);
    expect(pct(1, 1440)).toBe(-99.9);
    expect(pct(27, 14)).toBe(92.9);
    expect(pct(3, 27)).toBe(-88.9);
    expect(Object.is(pct(30, 30), 0)).toBe(true);
    // Half away from zero on both sides: 1.25 % → 1.3, −1.25 % → −1.3.
    expect(pct(405, 400)).toBe(1.3);
    expect(pct(395, 400)).toBe(-1.3);
    const same = curve(goalOf('g1'), daily('g1', '2026-10-01', 2, 30), TODAY);
    expect(Object.is(same.headlinePercent, 0)).toBe(true);
    expect(Object.is(same.latestChangePercent, 0)).toBe(true);
  });

  it('R3 (5 → 3) → headline −40, value 0.6; R4 (1 → 720 + 720) → headline 143900, value 1440', () => {
    const r3 = datasetR3();
    const c3 = curve(r3.goals[0], r3.entries, '2026-10-11');
    expect(c3.headlinePercent).toBe(-40);
    expect(c3.actual[1]).toMatchObject({ minutes: 3, percent: -40, changePercent: -40 });
    expect(c3.actual[1].value).toBeCloseTo(0.6, 12);
    expect(c3.actualFactor).toBeCloseTo(0.6, 12);
    const r4 = datasetR4();
    const c4 = curve(r4.goals[0], r4.entries, '2026-10-11');
    expect(c4.headlinePercent).toBe(143900);
    expect(c4.actual[1]).toMatchObject({ minutes: 1440, value: 1440, percent: 143900, changePercent: 143900 });
    expect(c4.latest).toEqual({ date: '2026-10-11', minutes: 1440 });
    // Reverse extreme: 1440 → 1.
    const rev = curve(r4.goals[0], [buildEntry({ id: 'x1', goalId: 'r1', date: '2026-10-10', minutes: 1440 }), buildEntry({ id: 'x2', goalId: 'r1', date: '2026-10-11', minutes: 1 })], '2026-10-11');
    expect(rev.headlinePercent).toBe(-99.9);
  });

  it('one-day goal: 1 ideal point; logged → headline 0 with a baseline; before its day → no actual', () => {
    const goal = buildGoal({ id: 'd', startDate: TODAY, endDate: TODAY, targetMinutes: 30 });
    const one = curve(goal, [buildEntry({ goalId: 'd', date: TODAY, minutes: 12 })], TODAY);
    expect(one.ideal).toHaveLength(1);
    expect(one.actual).toHaveLength(1);
    expect(one.headlinePercent).toBe(0);
    expect(one.baseline).toEqual({ date: TODAY, minutes: 12 });
    expect(curve(goal, [], '2026-10-08').actual).toEqual([]);
  });

  it('1827-day period (maximum): 1827 ideal points, last ≈ 1.01^1827; 1500 logged days computed by direct ratio (no drift)', () => {
    const wide = buildGoal({ id: 'w', startDate: '2022-01-01', endDate: '2027-01-01', targetMinutes: 1 });
    const cw = curve(wide, [], TODAY);
    expect(cw.periodDays).toBe(1827);
    expect(cw.ideal).toHaveLength(1827);
    expect(cw.ideal.at(-1)!.value).toBeCloseTo(Math.pow(1.01, 1827), 0);
    const goal = buildGoal({ id: 'max', startDate: '2022-01-01', endDate: '2026-12-31', targetMinutes: 1 });
    const entries = daily('max', '2022-01-01', 1500, 7);
    entries[1499] = { ...entries[1499], minutes: 21 };
    const c = curve(goal, entries, TODAY);
    expect(c.periodDays).toBe(1826);
    expect(c.loggedDays).toBe(1500);
    expect(c.headlinePercent).toBe(200);
    expect(c.actualFactor).toBe(3);
    expect(c.actual.at(-1)!.value).toBe(3);
  });
});

describe('curveYDomain / curveYScale (M9-AC2, ARCH §4.5, DESIGN S4 rule 3, OQ-D17)', () => {
  const span = (ideal: number[], you: number[]) => Math.max(1, ...ideal, ...you) - Math.min(0, ...you);

  it('R1 so far: yMin ∈ [−0.25·S, 0], yMax ∈ [440, 440 + 0.25·S]; nothing negative → yMin exactly 0', () => {
    const ideal = [1, 2, 3, 4.1];
    const you = [0, 100, 180, 440];
    const S = span(ideal, you);
    const [yMin, yMax] = curveYDomain(ideal, you);
    expect(yMin).toBeGreaterThanOrEqual(-0.25 * S);
    expect(yMin).toBeLessThanOrEqual(0);
    expect(yMin).toBe(0);
    expect(yMax).toBeGreaterThanOrEqual(440);
    expect(yMax).toBeLessThanOrEqual(440 + 0.25 * S);
    const scale = curveYScale(ideal, you);
    expect(scale.domain).toEqual([0, 500]);
    expect(scale.step).toBe(100);
    expect(scale.ticks).toEqual([0, 100, 200, 300, 400, 500]);
  });

  it('G2 so far (−50 %) → yMin ≤ −50 and the lower end is padded; ticks include 0', () => {
    const r = curve(goalOf('g2'), entriesOf('g2'), TODAY);
    const ideal = r.ideal.slice(0, r.elapsedDays).map((p) => growthPercent(p.value));
    const you = r.actual.map((p) => p.percent);
    const scale = curveYScale(ideal, you);
    expect(scale.domain[0]).toBeLessThanOrEqual(-50);
    expect(scale.domain[0]).toBeLessThan(-50);
    expect(scale.domain[1]).toBeGreaterThanOrEqual(47.4);
    expect(scale.ticks).toContain(0);
    expect(scale.ticks[0]).toBe(scale.domain[0]);
    expect(scale.ticks.at(-1)).toBe(scale.domain[1]);
  });

  it('G1 whole period (ideal up to 36.1, you all 0) → yMin ≤ 0, yMax ≥ 36.1; all zeros → yMax > yMin; empty input → [0, >0]', () => {
    const r = curve(goalOf('g1'), entriesOf('g1'), TODAY);
    const [yMin, yMax] = curveYDomain(r.ideal.map((p) => growthPercent(p.value)), r.actual.map((p) => p.percent));
    expect(yMin).toBeLessThanOrEqual(0);
    expect(yMax).toBeGreaterThanOrEqual(36.1);
    const zeros = curveYDomain([0, 0], [0, 0]);
    expect(zeros[1]).toBeGreaterThan(zeros[0]);
    expect(curveYScale([0, 0], [0, 0]).ticks.every((t) => Number.isInteger(t))).toBe(true);
    const empty = curveYDomain([], []);
    expect(empty[0]).toBe(0);
    expect(empty[1]).toBeGreaterThan(0);
  });

  it('steps are 1, 2, 5 × 10^n and never below 1; extremes (R4 +143900, 1827-day ideal) stay finite with ≤ 7 ticks', () => {
    for (const [ideal, you] of [
      [[1, 2], [0, 143900]],
      [[growthPercent(Math.pow(1.01, 1827))], [0]],
      [[1], [0, -99.9]],
      [[1, 2, 3], [0, 7]],
    ] as Array<[number[], number[]]>) {
      const s = curveYScale(ideal, you);
      const mantissa = s.step / Math.pow(10, Math.floor(Math.log10(s.step)));
      expect([1, 2, 5]).toContain(Math.round(mantissa));
      expect(s.step).toBeGreaterThanOrEqual(1);
      expect(s.ticks.length).toBeGreaterThanOrEqual(2);
      expect(s.ticks.length).toBeLessThanOrEqual(7);
      expect(Number.isFinite(s.domain[0]) && Number.isFinite(s.domain[1])).toBe(true);
      expect(s.domain[0]).toBeLessThanOrEqual(Math.min(0, ...you));
      expect(s.domain[1]).toBeGreaterThanOrEqual(Math.max(...ideal, ...you));
    }
  });
});

describe('growth helpers', () => {
  it('growth and growthPercent', () => {
    expect(growth(0)).toBe(1);
    expect(growth(8)).toBeCloseTo(1.082857, 6);
    expect(growthPercent(growth(8))).toBe(8.3);
    expect(growthPercent(growth(9))).toBe(9.4);
    expect(growthPercent(1)).toBe(0);
    expect(growthPercent(growth(365))).toBe(3678.3);
  });
});

// ---- v4.0 (M11): the curve of an open-ended goal runs startDate → today (A-52, ARCH §4.6 c) ----
describe('curve — open-ended goal O1 (M11-AC3, FR-27 v4.0)', () => {
  const o1 = datasetO1();
  const g = o1.goals[0];

  it('today 2026-10-09: 9 ideal + 9 actual points, periodDays = elapsedDays = 9, no future day', () => {
    const c = curve(g, o1.entries, TODAY);
    expect(c.ideal).toHaveLength(9);
    expect(c.actual).toHaveLength(9);
    expect(c.periodDays).toBe(9);
    expect(c.elapsedDays).toBe(9);
    expect(c.ideal[0]).toEqual({ date: '2026-10-01', k: 1, value: growth(1) });
    expect(c.ideal[8].date).toBe('2026-10-09');
    expect(c.ideal.every((p) => p.date <= TODAY)).toBe(true);
    expect(c.actual.map((p) => p.percent)).toEqual([0, 50, 50, 50, 0, 0, 0, 100, 100]);
    expect(c.actual.map((p) => p.changePercent)).toEqual([null, 50, null, null, -33.3, null, null, 100, null]);
    expect(c.actual.map((p) => p.minutes)).toEqual([10, 15, 0, 0, 10, 0, 0, 20, 0]);
    expect(c.headlinePercent).toBe(100);
    expect(c.actualFactor).toBe(2);
    expect(c.baseline).toEqual({ date: '2026-10-01', minutes: 10 });
    expect(c.latest).toEqual({ date: '2026-10-08', minutes: 20 });
    expect(c.previous).toEqual({ date: '2026-10-05', minutes: 10 });
    expect(c.latestChangePercent).toBe(100);
    expect(c.loggedDays).toBe(4);
    expect(c.idealPercent).toBe(9.4);
    expect(c.idealFactor).toBeCloseTo(growth(9), 12);
  });

  it('today 2026-10-20: 20 + 20 points, headline still 100, nothing dated after today', () => {
    const c = curve(g, o1.entries, '2026-10-20');
    expect(c.ideal).toHaveLength(20);
    expect(c.actual).toHaveLength(20);
    expect(c.periodDays).toBe(20);
    expect(c.headlinePercent).toBe(100);
    expect(c.ideal.every((p) => p.date <= '2026-10-20')).toBe(true);
    expect(c.actual.every((p) => p.date <= '2026-10-20')).toBe(true);
    expect(c.actual[19]).toMatchObject({ date: '2026-10-20', k: 20, percent: 100, logged: false, changePercent: null });
  });

  it('today 2031-10-02: 1,828 points (> 1,827 — no period limit for open-ended goals, A-49)', () => {
    const c = curve(g, o1.entries, '2031-10-02');
    expect(c.ideal).toHaveLength(1828);
    expect(c.actual).toHaveLength(1828);
    expect(c.elapsedDays).toBe(1828);
    expect(c.ideal[1827]).toMatchObject({ date: '2031-10-02', k: 1828 });
    expect(c.headlinePercent).toBe(100);
  });

  it('not started yet (start 2026-11-01): no ideal and no actual points, headline 0, idealPercent 0, factors 1', () => {
    const c = curve({ ...g, startDate: '2026-11-01' }, [], TODAY);
    expect(c).toMatchObject({ ideal: [], actual: [], periodDays: 0, elapsedDays: 0, loggedDays: 0, baseline: null, latest: null, previous: null, latestChangePercent: null, actualFactor: 1, idealFactor: 1, headlinePercent: 0, idealPercent: 0 });
  });

  it('first day (start = today): one point per line', () => {
    const c = curve({ ...g, startDate: TODAY }, [buildEntry({ id: 'x', goalId: 'o1', date: TODAY, minutes: 10 })], TODAY);
    expect(c.ideal).toHaveLength(1);
    expect(c.actual).toHaveLength(1);
    expect(c.actual[0]).toMatchObject({ k: 1, logged: true, percent: 0, changePercent: null });
    expect(c.idealPercent).toBe(1);
  });

  it('lastElapsedDay: today for a running open-ended goal, null before it starts; finite goals unchanged', () => {
    expect(lastElapsedDay(g, TODAY)).toBe(TODAY);
    expect(lastElapsedDay(g, '2031-10-02')).toBe('2031-10-02');
    expect(lastElapsedDay(g, '2026-09-30')).toBeNull();
    expect(lastElapsedDay(datasetS1().goals[0], '2026-12-01')).toBe('2026-10-31');
  });
});
