// M17-AC2 / AC3 / AC4: derived values against oracle Q1 and its variants (ARCH §4.8 c, d).
import { describe, expect, it } from 'vitest';
import { buildEntry, buildQptRoadmap, datasetQ1, TODAY_Q1 } from '../test/builders';
import { addDays } from './dates';
import { goalStats } from './stats';
import { attributeMinutes, checkpointState, chartScale, itemLabel, itemState, itemWindow, linkState, milestoneDays, roadmapOverview, roadmapView, thisWeek, toListRow } from './roadmap-progress';
import type { RoadmapItem } from './roadmap';
import type { LogEntry } from './types';

const gqEntries = (d = datasetQ1()): LogEntry[] => d.entries.filter((e) => e.goalId === 'gq');
const gq = (d = datasetQ1()) => d.goals.find((g) => g.id === 'gq') ?? null;
const viewQ1 = (variant?: 'b' | 'c' | 'e', today = TODAY_Q1) => {
  const d = datasetQ1(variant);
  return roadmapView(d, gq(d), gqEntries(d), today);
};

describe('hours (FR-71, A-77, A-80, A-82; v8.3 A-93, A-95) — M17-AC2, M21-AC1', () => {
  it('Q1: windows W1 [10-27, 11-01], W2 [11-03, 11-09], W3 [11-10, 11-16]; W1 270, W2 75, W3 0; total 395 = goal; 10-20 outside (50, before start)', () => {
    const v = viewQ1();
    const [w1, w2, w3] = v.items;
    expect(itemWindow(w1, TODAY_Q1)).toMatchObject({ start: '2026-10-27', end: '2026-11-01', empty: false, explicit: true });
    expect(itemWindow(w2, TODAY_Q1)).toMatchObject({ start: '2026-11-03', end: '2026-11-09', explicit: false });
    expect(itemWindow(w3, TODAY_Q1)).toMatchObject({ start: '2026-11-10', end: '2026-11-16' });
    expect(v.itemMinutes.get('wq1')).toBe(270);
    expect(v.itemMinutes.get('wq2')).toBe(75);
    expect(v.itemMinutes.get('wq3')).toBe(0);
    expect(v.hoursDoneMinutes).toBe(395);
    expect(v.outsideMinutes).toBe(50);
    expect(v.beforeStartMinutes).toBe(50);
    expect(v.linkState).toBe('linked');
  });

  it('Q1b: W1 in progress → window [10-27, 11-04]; 11-03/11-04 go to W1 (explicit) → W1 345, W2 0', () => {
    const v = viewQ1('b');
    expect(itemWindow(v.items[0], TODAY_Q1)).toMatchObject({ start: '2026-10-27', end: '2026-11-04', explicit: true });
    expect(v.itemMinutes.get('wq1')).toBe(345);
    expect(v.itemMinutes.get('wq2')).toBe(0);
    expect(v.hoursDoneMinutes).toBe(395);
    expect(v.outsideMinutes).toBe(50);
    expect(v.beforeStartMinutes).toBe(50);
  });

  it('Q1c: W2 also started 11-04 → two explicit candidates on 11-04, the later start wins → W1 315, W2 30', () => {
    const v = viewQ1('c');
    expect(v.itemMinutes.get('wq1')).toBe(315);
    expect(v.itemMinutes.get('wq2')).toBe(30);
    expect(v.hoursDoneMinutes).toBe(395);
    expect(v.outsideMinutes).toBe(50);
    expect(v.beforeStartMinutes).toBe(50);
  });

  it('empty window (only actualEnd before plannedStart) → 0 minutes, no error; the early label still shows', () => {
    const d = datasetQ1();
    const w1: RoadmapItem = { ...d.items[0], actualStart: null, actualEnd: '2026-10-20' };
    const items = [w1, ...d.items.slice(1)];
    expect(itemWindow(w1, TODAY_Q1)).toMatchObject({ start: '2026-10-27', end: '2026-10-20', empty: true });
    const { byItem, total } = attributeMinutes(items, gqEntries(d), TODAY_Q1);
    expect(byItem.get('wq1')).toBe(0);
    expect(byItem.get('wq2')).toBe(75);
    expect(total).toBe(75);
    expect(itemLabel(w1)).toEqual({ kind: 'early', days: 13, studiedDays: null });
  });

  it('planned-only overlap: the item that starts later gets the day; same start → the earlier item in order', () => {
    const d = datasetQ1();
    const a: RoadmapItem = { ...d.items[0], id: 'a', actualStart: null, actualEnd: null, plannedStart: '2026-11-01', plannedEnd: '2026-11-10' };
    const b: RoadmapItem = { ...d.items[1], id: 'b', plannedStart: '2026-11-03', plannedEnd: '2026-11-06' };
    const c: RoadmapItem = { ...d.items[2], id: 'c', plannedStart: '2026-11-03', plannedEnd: '2026-11-20' };
    const { byItem } = attributeMinutes([a, b, c], gqEntries(d), TODAY_Q1);
    expect(byItem.get('a')).toBe(120); // 11-01
    expect(byItem.get('b')).toBe(75); // 11-03, 11-04: b and c both start 11-03 → b (earlier ord)
    expect(byItem.get('c')).toBe(0);
  });

  it('property: 200 seeded random roadmaps → Σ itemMinutes = hoursDoneMinutes and every entry counted at most once', () => {
    let seed = 20261104;
    const rnd = () => {
      seed = (seed * 1664525 + 1013904223) % 4294967296;
      return seed / 4294967296;
    };
    const base = datasetQ1();
    for (let n = 0; n < 200; n += 1) {
      const count = 1 + Math.floor(rnd() * 12);
      const items: RoadmapItem[] = [];
      for (let k = 0; k < count; k += 1) {
        const start = addDays('2026-10-01', Math.floor(rnd() * 60));
        const end = addDays(start, Math.floor(rnd() * 14));
        const explicit = rnd();
        const actualStart = explicit < 0.3 ? addDays(start, Math.floor(rnd() * 5) - 2) : null;
        const actualEndRaw = explicit > 0.7 ? addDays(end, Math.floor(rnd() * 5) - 2) : null;
        const actualEnd = actualEndRaw && actualEndRaw > TODAY_Q1 ? TODAY_Q1 : actualEndRaw;
        items.push({ ...base.items[0], id: `i${k}`, phaseId: 'pq1', position: k, plannedStart: start, plannedEnd: end, actualStart: actualStart && actualStart > TODAY_Q1 ? TODAY_Q1 : actualStart, actualEnd });
      }
      const entries: LogEntry[] = [];
      const entryCount = Math.floor(rnd() * 40);
      for (let k = 0; k < entryCount; k += 1) entries.push(buildEntry({ id: `e${k}`, goalId: 'gq', date: addDays('2026-09-25', Math.floor(rnd() * 75)), minutes: 1 + Math.floor(rnd() * 120) }));
      const { byItem, total } = attributeMinutes(items, entries, TODAY_Q1);
      let sum = 0;
      for (const v of byItem.values()) sum += v;
      expect(sum).toBe(total);
      expect(total).toBeLessThanOrEqual(entries.reduce((s, e) => s + e.minutes, 0));
      expect(byItem.size).toBe(items.length);
    }
  });

  it('linkState none/missing → hoursDoneMinutes null and every itemMinutes null; archived counts like linked', () => {
    const d = datasetQ1();
    const none = roadmapView({ ...d, roadmap: { ...d.roadmap, goalId: null } }, null, gqEntries(d), TODAY_Q1);
    expect(none.linkState).toBe('none');
    expect(none.hoursDoneMinutes).toBeNull();
    expect(none.outsideMinutes).toBeNull();
    expect(none.beforeStartMinutes).toBeNull();
    expect([...none.itemMinutes.values()].every((m) => m === null)).toBe(true);
    const missing = viewQ1('e');
    expect(missing.linkState).toBe('missing');
    expect(missing.hoursDoneMinutes).toBeNull();
    expect(missing.outsideMinutes).toBeNull();
    expect(missing.beforeStartMinutes).toBeNull();
    expect([...missing.itemMinutes.values()].every((m) => m === null)).toBe(true);
    expect(missing.goal).toBeNull();
    expect(missing.overview.doneCount).toBe(1);
    const archived = roadmapView(d, { ...gq(d)!, archived: true }, gqEntries(d), TODAY_Q1);
    expect(archived.linkState).toBe('archived');
    expect(archived.hoursDoneMinutes).toBe(395);
    expect(archived.outsideMinutes).toBe(50);
    expect(archived.beforeStartMinutes).toBe(50);
    expect(linkState({ goalId: 'x' }, undefined)).toBe('missing');
  });
});

describe('roadmap total = goal total (v8.3: FR-71, A-80, A-93, A-95; ARCH §4.8 d "Oracle v8.3") — M21-AC1', () => {
  const sumItems = (v: ReturnType<typeof viewQ1>) => [...v.itemMinutes.values()].reduce<number>((s, m) => s + (m ?? 0), 0);

  it('Q1: hoursDoneMinutes 395 equals goalStats(gq, entries of gq, 2026, today).minutesTotal (the Goal detail total)', () => {
    const d = datasetQ1();
    const v = viewQ1();
    expect(goalStats(gq(d)!, gqEntries(d), 2026, TODAY_Q1).minutesTotal).toBe(395);
    expect(v.hoursDoneMinutes).toBe(goalStats(gq(d)!, gqEntries(d), 2026, TODAY_Q1).minutesTotal);
    expect(sumItems(v) + v.outsideMinutes!).toBe(v.hoursDoneMinutes);
    // attributeMinutes keeps its contract: total = minutes given to items
    expect(attributeMinutes(v.items, gqEntries(d), TODAY_Q1).total).toBe(345);
  });

  it('Q1d (today 2026-10-26): not filtered by today → 395, Σ items 345, outside 50 / before 50', () => {
    const v = viewQ1(undefined, '2026-10-26');
    expect(v.hoursDoneMinutes).toBe(395);
    expect(sumItems(v)).toBe(345);
    expect(v.outsideMinutes).toBe(50);
    expect(v.beforeStartMinutes).toBe(50);
  });

  it('Q1 + 30 min on 11-04 → 425, W2 105, outside still 50; Q1 without the 10-20 entry → 345, outside 0', () => {
    const d = datasetQ1();
    const more = [...gqEntries(d), buildEntry({ id: 'e-more', goalId: 'gq', date: '2026-11-04', minutes: 30 })];
    const v = roadmapView(d, gq(d), more, TODAY_Q1);
    expect(v.hoursDoneMinutes).toBe(425);
    expect(v.itemMinutes.get('wq2')).toBe(105);
    expect(v.outsideMinutes).toBe(50);
    expect(v.beforeStartMinutes).toBe(50);
    const without = roadmapView(d, gq(d), gqEntries(d).filter((e) => e.date !== '2026-10-20'), TODAY_Q1);
    expect(without.hoursDoneMinutes).toBe(345);
    expect(without.outsideMinutes).toBe(0);
    expect(without.beforeStartMinutes).toBe(0);
  });

  it('rq linked to g3 "Spanish" (60 min on 2026-03-02) → 60 / 60 / 60; + 100 min on 11-03 → 160, W2 100', () => {
    const d = datasetQ1();
    const g3 = d.goals.find((g) => g.id === 'g3')!;
    const g3Entries = d.entries.filter((e) => e.goalId === 'g3');
    expect(g3Entries.map((e) => [e.date, e.minutes])).toEqual([['2026-03-02', 60]]);
    const agg = { ...d, roadmap: { ...d.roadmap, goalId: 'g3' } };
    const v = roadmapView(agg, g3, g3Entries, TODAY_Q1);
    expect(v.hoursDoneMinutes).toBe(60);
    expect(sumItems(v)).toBe(0);
    expect(v.outsideMinutes).toBe(60);
    expect(v.beforeStartMinutes).toBe(60);
    const plus = roadmapView(agg, g3, [...g3Entries, buildEntry({ id: 'e-g3-2', goalId: 'g3', date: '2026-11-03', minutes: 100 })], TODAY_Q1);
    expect(plus.hoursDoneMinutes).toBe(160);
    expect(plus.itemMinutes.get('wq2')).toBe(100);
    expect(plus.outsideMinutes).toBe(60);
  });

  it('gap (v8.2): A 11-01 – 11-03, B 11-06 – 11-12 → 395 = A 165 + B 0 + outside 230 (before 200; 11-04 in the gap)', () => {
    const d = datasetQ1();
    const a: RoadmapItem = { ...d.items[0], id: 'a', actualStart: null, actualEnd: null, plannedStart: '2026-11-01', plannedEnd: '2026-11-03' };
    const b: RoadmapItem = { ...d.items[1], id: 'b', plannedStart: '2026-11-06', plannedEnd: '2026-11-12' };
    const v = roadmapView({ ...d, items: [a, b], checkpoints: [] }, gq(d), gqEntries(d), TODAY_Q1);
    expect(v.hoursDoneMinutes).toBe(395);
    expect(v.itemMinutes.get('a')).toBe(165);
    expect(v.itemMinutes.get('b')).toBe(0);
    expect(v.outsideMinutes).toBe(230);
    expect(v.beforeStartMinutes).toBe(200);
  });

  it('property: 200 seeded random roadmaps (entries before / inside / after items, random today, linked or archived) → Σ itemMinutes + outside = total = Σ entries; 0 ≤ before ≤ outside', () => {
    let seed = 20261105;
    const rnd = () => {
      seed = (seed * 1664525 + 1013904223) % 4294967296;
      return seed / 4294967296;
    };
    const base = datasetQ1();
    for (let n = 0; n < 200; n += 1) {
      const today = addDays('2026-10-15', Math.floor(rnd() * 60));
      const count = Math.floor(rnd() * 10); // 0 … 9 items (0 = no items)
      const items: RoadmapItem[] = [];
      for (let k = 0; k < count; k += 1) {
        const start = addDays('2026-10-01', Math.floor(rnd() * 60));
        const end = addDays(start, Math.floor(rnd() * 14));
        const r = rnd();
        const actualStart = r < 0.3 ? addDays(start, Math.floor(rnd() * 5) - 2) : null;
        const actualEnd = r > 0.7 ? addDays(end, Math.floor(rnd() * 5) - 2) : null;
        items.push({ ...base.items[0], id: `i${k}`, phaseId: 'pq1', position: k, plannedStart: start, plannedEnd: end, actualStart, actualEnd });
      }
      const entries: LogEntry[] = [];
      const entryCount = Math.floor(rnd() * 40);
      for (let k = 0; k < entryCount; k += 1) entries.push(buildEntry({ id: `e${k}`, goalId: 'gq', date: addDays('2026-09-01', Math.floor(rnd() * 120)), minutes: 1 + Math.floor(rnd() * 120) }));
      const goal = { ...gq(base)!, archived: rnd() < 0.2 };
      const v = roadmapView({ ...base, items, checkpoints: [] }, goal, entries, today);
      const total = entries.reduce((s, e) => s + e.minutes, 0);
      expect(v.hoursDoneMinutes).toBe(total);
      expect(sumItems(v) + v.outsideMinutes!).toBe(total);
      expect(v.beforeStartMinutes).toBeGreaterThanOrEqual(0);
      expect(v.beforeStartMinutes!).toBeLessThanOrEqual(v.outsideMinutes!);
      if (items.length === 0) {
        expect(v.outsideMinutes).toBe(total);
        expect(v.beforeStartMinutes).toBe(0);
      }
      expect(attributeMinutes(v.items, entries, today).total).toBe(sumItems(v));
    }
  });
});

describe('overview, pace, labels, this week, milestone (FR-72, A-84, A-85) — M17-AC3', () => {
  it('Q1: 1/21, weeksElapsed 2, planned 960, totalWeeks 21, onTrack good, weekBased, W1 early 1 · studied 6, current W2 480/5 days, milestone 125', () => {
    const v = viewQ1();
    expect(v.overview).toMatchObject({ doneCount: 1, itemCount: 21, overdueCount: 0, weeksElapsed: 2, plannedMinutesToDate: 960, totalWeeks: 21, start: '2026-10-27', end: '2027-03-22', weekBased: true, currentItemId: 'wq2' });
    expect(v.overview.pace).toEqual({ kind: 'onTrack', overdueCount: 0, weekBased: true, severity: 'good' });
    expect(itemLabel(v.items[0])).toEqual({ kind: 'early', days: 1, studiedDays: 6 });
    expect(itemState(v.items[0], TODAY_Q1)).toBe('done');
    expect(itemState(v.items[1], TODAY_Q1)).toBe('current');
    expect(itemState(v.items[2], TODAY_Q1)).toBe('upcoming');
    expect(v.thisWeek).toEqual({ kind: 'current', itemId: 'wq2', index: 2, itemMinutes: 75, itemTargetMinutes: 480, daysLeft: 5, done: false });
    expect(v.milestoneDays).toBe(125);
    expect(v.roadmap.milestoneDate).toBe('2027-03-09');
    expect(toListRow(v)).toMatchObject({ id: 'rq', title: 'QPT 21 tuần', goalName: 'QPT study', linkState: 'linked', doneCount: 1, itemCount: 21, hoursDoneMinutes: 395, plannedMinutesToDate: 960, milestoneLabel: 'Thi QPT', milestoneDays: 125 });
  });

  it('Q1b: W1 overdue → behind warn, doneCount 0, in progress label; today 2026-11-10 with W2 still open → overdueCount 2, crit', () => {
    const v = viewQ1('b');
    expect(v.overview.pace).toEqual({ kind: 'behind', overdueCount: 1, weekBased: true, severity: 'warn' });
    expect(v.overview.doneCount).toBe(0);
    expect(itemLabel(v.items[0])).toEqual({ kind: 'inProgress' });
    expect(itemState(v.items[0], TODAY_Q1)).toBe('overdue');
    const later = viewQ1('b', '2026-11-10');
    expect(later.overview.pace).toMatchObject({ kind: 'behind', overdueCount: 2, severity: 'crit' });
    expect(later.overview.weeksElapsed).toBe(3);
  });

  it('Q1d (today 2026-10-26): notStarted, weeksElapsed 0, planned 0, this-week notStarted, milestone 134', () => {
    const v = viewQ1(undefined, '2026-10-26');
    expect(v.overview.pace).toMatchObject({ kind: 'notStarted', severity: 'idle' });
    expect(v.overview.weeksElapsed).toBe(0);
    expect(v.overview.plannedMinutesToDate).toBe(0);
    expect(v.thisWeek).toEqual({ kind: 'notStarted', start: '2026-10-27', firstItemId: 'wq1' });
    expect(v.milestoneDays).toBe(134);
  });

  it('milestone: 2027-03-09 → 0 (today); 2027-03-10 → −1 (passed); null → null. today 2027-03-23 → this week finished', () => {
    expect(viewQ1(undefined, '2027-03-09').milestoneDays).toBe(0);
    expect(viewQ1(undefined, '2027-03-10').milestoneDays).toBe(-1);
    expect(milestoneDays({ milestoneDate: null }, TODAY_Q1)).toBeNull();
    const after = viewQ1(undefined, '2027-03-23');
    expect(after.thisWeek).toEqual({ kind: 'finished', end: '2027-03-22' });
    expect(after.overview.weeksElapsed).toBe(21);
    expect(after.overview.pace.kind).toBe('behind');
  });

  it('gap (v8.2): A 11-01 – 11-03, B 11-06 – 11-12: today 11-04 → gap with no current item; 11-06 → current B; 11-13 → finished', () => {
    const d = datasetQ1();
    const a: RoadmapItem = { ...d.items[0], id: 'a', actualStart: null, actualEnd: null, plannedStart: '2026-11-01', plannedEnd: '2026-11-03' };
    const b: RoadmapItem = { ...d.items[1], id: 'b', plannedStart: '2026-11-06', plannedEnd: '2026-11-12' };
    const agg = { ...d, items: [a, b], phases: d.phases, checkpoints: [] };
    const gap = roadmapView(agg, gq(d), gqEntries(d), '2026-11-04');
    expect(gap.overview.currentItemId).toBeNull();
    expect(gap.thisWeek).toEqual({ kind: 'gap' });
    expect(gap.overview.pace.kind).toBe('behind'); // A overdue
    expect(roadmapView(agg, gq(d), gqEntries(d), '2026-11-06').thisWeek).toMatchObject({ kind: 'current', itemId: 'b', index: 2, daysLeft: 6 });
    expect(roadmapView(agg, gq(d), gqEntries(d), '2026-11-13').thisWeek).toEqual({ kind: 'finished', end: '2026-11-12' });
    expect(gap.overview.weekBased).toBe(false);
  });

  it('every item done → completed; a 10-day item → weekBased false; no target → planned/itemTarget null; no items → empty; this week done flag', () => {
    const d = datasetQ1();
    const allDone = d.items.map((i) => ({ ...i, actualEnd: i.actualEnd ?? '2026-11-04' }));
    const done = roadmapOverview(d.roadmap, allDone, TODAY_Q1);
    expect(done.pace).toMatchObject({ kind: 'completed', severity: 'good' });
    expect(thisWeek(d.roadmap, allDone, done, null, TODAY_Q1)).toMatchObject({ kind: 'current', itemId: 'wq2', done: true, itemMinutes: null });
    const tenDays = roadmapOverview(d.roadmap, [{ ...d.items[1], plannedEnd: '2026-11-12' }, ...d.items.slice(2)], TODAY_Q1);
    expect(tenDays.weekBased).toBe(false);
    const noTarget = roadmapView({ ...d, roadmap: { ...d.roadmap, weeklyTargetMinutes: null } }, gq(d), gqEntries(d), TODAY_Q1);
    expect(noTarget.overview.plannedMinutesToDate).toBeNull();
    expect(noTarget.thisWeek).toMatchObject({ kind: 'current', itemTargetMinutes: null });
    const empty = roadmapView({ ...d, items: [] }, gq(d), gqEntries(d), TODAY_Q1);
    expect(empty.overview).toMatchObject({ itemCount: 0, start: null, end: null, totalWeeks: 0, weeksElapsed: 0, plannedMinutesToDate: 0, currentItemId: null });
    expect(empty.overview.pace).toMatchObject({ kind: 'empty', severity: 'idle' });
    expect(empty.thisWeek).toBeNull();
    // v8.3: a roadmap without items still shows every minute of its goal; all of it is outside, none "before start"
    expect(empty.hoursDoneMinutes).toBe(395);
    expect(empty.outsideMinutes).toBe(395);
    expect(empty.beforeStartMinutes).toBe(0);
  });

  it('labels: on time, late, early with studied days', () => {
    const w = datasetQ1().items[0];
    expect(itemLabel({ ...w, actualStart: null, actualEnd: '2026-11-02' })).toEqual({ kind: 'onTime', days: 0, studiedDays: null });
    expect(itemLabel({ ...w, actualStart: '2026-10-27', actualEnd: '2026-11-04' })).toEqual({ kind: 'late', days: 2, studiedDays: 9 });
    expect(itemLabel({ ...w, actualStart: null, actualEnd: null })).toBeNull();
  });
});

describe('checkpoints (FR-75) — M17-AC4', () => {
  it('Diagnostic 5 without threshold → recorded; CP2 pending / 18 below −2 / 20 pass 0 / 21 pass; raw scale, percent when a max differs; order (date, createdAt, id)', () => {
    const v = viewQ1();
    expect(v.checkpoints.map((c) => c.id)).toEqual(['cq1', 'cq2', 'cq3', 'cq4', 'cq5']);
    expect(v.checkpoints[0]).toMatchObject({ title: 'Diagnostic', date: '2026-09-24', score: 5, threshold: null, maxScore: 32 });
    expect(checkpointState(v.checkpoints[0])).toEqual({ kind: 'recorded' });
    const cp2 = v.checkpoints[2];
    expect(cp2).toMatchObject({ title: 'Checkpoint 2', date: '2027-02-15', threshold: 20 });
    expect(checkpointState(cp2)).toEqual({ kind: 'pending' });
    expect(checkpointState({ ...cp2, score: 18 })).toEqual({ kind: 'below', delta: -2 });
    expect(checkpointState({ ...cp2, score: 20 })).toEqual({ kind: 'pass', delta: 0 });
    expect(checkpointState({ ...cp2, score: 21 })).toEqual({ kind: 'pass', delta: 1 });
    expect(checkpointState({ score: 7.5, threshold: 7.3 })).toEqual({ kind: 'pass', delta: 0.2 });
    expect(v.chartScale).toBe('raw');
    expect(chartScale([...v.checkpoints, { maxScore: 10 }])).toBe('percent');
    expect(chartScale([])).toBe('raw');
    expect(v.checkpoints.map((c) => [c.title, c.date, c.threshold])).toEqual([
      ['Diagnostic', '2026-09-24', null],
      ['Checkpoint 1', '2026-12-21', null],
      ['Checkpoint 2', '2027-02-15', 20],
      ['Mock 1', '2027-03-01', 24],
      ['Mock 2', '2027-03-08', 26],
    ]);
  });

  it('the hand-built QPT roadmap matches ARCH §4.8 e for start 2026-10-27: 32 rows, W20 = 2027-03-09 … 03-15, W21 ends 2027-03-22', () => {
    const agg = buildQptRoadmap('2026-10-27', null);
    expect(agg.phases).toHaveLength(5);
    expect(agg.items).toHaveLength(21);
    expect(agg.checkpoints).toHaveLength(5);
    expect(agg.items[19]).toMatchObject({ title: 'Thi QPT chính thức', plannedStart: '2027-03-09', plannedEnd: '2027-03-15', phaseId: 'pq5' });
    expect(agg.items[20].plannedEnd).toBe('2027-03-22');
    expect(agg.items[7]).toMatchObject({ plannedEnd: '2026-12-21', phaseId: 'pq2' });
    expect(agg.roadmap).toMatchObject({ title: 'QPT 21 tuần', weeklyTargetMinutes: 480, milestoneLabel: 'Thi QPT', milestoneDate: '2027-03-09', goalId: null });
    expect(agg.roadmap.note.split('\n')[0]).toBe('Nhịp học mỗi tuần');
    expect(agg.phases.map((p) => p.title)).toEqual(['Phase 1 · Linear Algebra', 'Phase 2 · Calculus', 'Phase 3 · Probability & Statistics', 'Phase 4 · Differential Equations', 'Phase 5 · Lấp lỗ hổng & thi QPT']);
  });
});
