import type { Goal, LogEntry } from '../domain/types';
import type { Roadmap, RoadmapAggregate } from '../domain/roadmap';
import { addDays } from '../domain/dates';
import { buildQptTemplate } from '../domain/roadmap-template';

const STAMP = '2026-10-01T03:00:00.000Z';

let seq = 0;
export const nextId = (prefix = 'id') => `${prefix}-${++seq}`;

export function buildGoal(overrides: Partial<Goal> = {}): Goal {
  return {
    id: nextId('goal'),
    name: 'Read',
    why: 'Be smarter',
    targetType: 'daily',
    targetMinutes: 30,
    startDate: '2026-10-01',
    endDate: '2026-10-31',
    archived: false,
    createdAt: STAMP,
    updatedAt: STAMP,
    ...overrides,
  };
}

export function buildEntry(overrides: Partial<LogEntry> = {}): LogEntry {
  return {
    id: nextId('entry'),
    goalId: 'goal-1',
    date: '2026-10-09',
    minutes: 30,
    note: '',
    source: 'manual',
    createdAt: STAMP,
    updatedAt: STAMP,
    ...overrides,
  };
}

function dailyEntries(goalId: string, from: string, count: number, minutes: number, prefix: string): LogEntry[] {
  return Array.from({ length: count }, (_, i) =>
    buildEntry({ id: `${prefix}-${i + 1}`, goalId, date: addDays(from, i), minutes, note: '' }),
  );
}

/** Dataset S1 (TASKS.md §0): 5 goals, 23 entries. */
export function datasetS1(): { goals: Goal[]; entries: LogEntry[] } {
  const goals: Goal[] = [
    buildGoal({ id: 'g1', name: 'Read', why: 'Be smarter', targetType: 'daily', targetMinutes: 30, startDate: '2026-10-01', endDate: '2026-10-31', createdAt: '2026-09-30T01:00:00.000Z', updatedAt: '2026-09-30T01:00:00.000Z' }),
    buildGoal({ id: 'g2', name: 'Guitar', why: 'Play a full song by Christmas', targetType: 'daily', targetMinutes: 20, startDate: '2026-09-01', endDate: '2026-12-31', createdAt: '2026-09-30T02:00:00.000Z', updatedAt: '2026-09-30T02:00:00.000Z' }),
    buildGoal({ id: 'g3', name: 'Spanish', why: 'Talk with my grandmother in her language', targetType: 'total', targetMinutes: 6000, startDate: '2026-01-01', endDate: '2026-12-31', createdAt: '2026-09-30T03:00:00.000Z', updatedAt: '2026-09-30T03:00:00.000Z' }),
    buildGoal({ id: 'g4', name: 'Marathon prep', why: '', targetType: 'daily', targetMinutes: 45, startDate: '2026-11-01', endDate: '2026-11-30', createdAt: '2026-09-30T04:00:00.000Z', updatedAt: '2026-09-30T04:00:00.000Z' }),
    buildGoal({ id: 'g5', name: 'Old course', why: '', targetType: 'daily', targetMinutes: 15, startDate: '2026-01-01', endDate: '2026-06-30', createdAt: '2026-09-30T05:00:00.000Z', updatedAt: '2026-09-30T05:00:00.000Z' }),
  ];
  const entries: LogEntry[] = [
    ...dailyEntries('g1', '2026-10-01', 8, 30, 'e-g1'),
    ...dailyEntries('g2', '2026-09-01', 10, 20, 'e-g2a'),
    buildEntry({ id: 'e-g2b-1', goalId: 'g2', date: '2026-10-07', minutes: 20 }),
    buildEntry({ id: 'e-g2b-2', goalId: 'g2', date: '2026-10-08', minutes: 20 }),
    buildEntry({ id: 'e-g2c-1', goalId: 'g2', date: '2026-09-15', minutes: 10 }),
    buildEntry({ id: 'e-g3-1', goalId: 'g3', date: '2026-03-02', minutes: 60 }),
    buildEntry({ id: 'e-g5-1', goalId: 'g5', date: '2026-06-30', minutes: 15 }),
  ];
  return { goals, entries };
}

export const FIXED_NOW = new Date('2026-10-09T10:00:00+07:00');
export const TODAY = '2026-10-09';

// ---- Phase 5 (M11, v4.0): dataset O1 — an open-ended goal (ARCH §4.6 c) ----

const O1_STAMP = '2026-09-30T06:00:00.000Z';

/**
 * Dataset O1: goal `o1` "Meditate", 10 min/day from 2026-10-01 with **no end date**; manual entries
 * 10-01 10, 10-02 15, 10-05 10, 10-08 20 minutes. Oracle at today 2026-10-09: 9 elapsed days,
 * totalTarget 90, minutesTotal 55 -> 61.1 %, pace -35, streak 1/2, curve headline +100.0 % (x2).
 */
export function datasetO1(): { goals: Goal[]; entries: LogEntry[] } {
  const goal = buildGoal({ id: 'o1', name: 'Meditate', why: '', targetType: 'daily', targetMinutes: 10, startDate: '2026-10-01', endDate: null, createdAt: O1_STAMP, updatedAt: O1_STAMP });
  const days: Array<[string, number]> = [['2026-10-01', 10], ['2026-10-02', 15], ['2026-10-05', 10], ['2026-10-08', 20]];
  const entries = days.map(([date, minutes], i) =>
    buildEntry({ id: `e-o1-${i + 1}`, goalId: 'o1', date, minutes, note: '', source: 'manual', createdAt: `${date}T02:00:00.000Z`, updatedAt: `${date}T02:00:00.000Z` }),
  );
  return { goals: [goal], entries };
}

/** Dataset S1 + O1 (6 goals, 27 entries): finite and open-ended goals side by side. */
export function datasetS1O1(): { goals: Goal[]; entries: LogEntry[] } {
  const s1 = datasetS1();
  const o1 = datasetO1();
  return { goals: [...s1.goals, ...o1.goals], entries: [...s1.entries, ...o1.entries] };
}

// ---- Phase 3 (M9, FR-27 v3.0): datasets R1 / R3 / R4 (TASKS "Phase 3") ----

/** Clock for the R-datasets: 2026-10-13 10:00 Asia/Ho_Chi_Minh. */
export const FIXED_NOW_R1 = new Date('2026-10-13T10:00:00+07:00');
export const TODAY_R1 = '2026-10-13';

const R_STAMP = '2026-10-10T01:00:00.000Z';

function goalR(): Goal {
  return buildGoal({ id: 'r1', name: 'Đọc sách', why: '', targetType: 'daily', targetMinutes: 30, startDate: '2026-10-10', endDate: '2026-12-31', createdAt: R_STAMP, updatedAt: R_STAMP });
}

function entriesR(days: Array<[date: string, minutes: number]>): LogEntry[] {
  return days.map(([date, minutes], i) => buildEntry({ id: `e-r-${i + 1}`, goalId: 'r1', date, minutes, note: '', source: 'manual', createdAt: `${date}T02:00:00.000Z`, updatedAt: `${date}T02:00:00.000Z` }));
}

/**
 * Dataset R1 — the user's real data: "Đọc sách", 30 min/day, 2026-10-10 → 2026-12-31 (83 days);
 * 5 → 10 → 14 → 27 minutes on 10-10 … 10-13. Oracle (ARCH §4.5): +440.0 %, ×5.4, today +92.9 % vs 14.
 */
export function datasetR1(): { goals: Goal[]; entries: LogEntry[] } {
  return { goals: [goalR()], entries: entriesR([['2026-10-10', 5], ['2026-10-11', 10], ['2026-10-12', 14], ['2026-10-13', 27]]) };
}

/** Dataset R3 — going down: 5 then 3 minutes (clock 2026-10-11) → −40.0 %. */
export function datasetR3(): { goals: Goal[]; entries: LogEntry[] } {
  return { goals: [goalR()], entries: entriesR([['2026-10-10', 5], ['2026-10-11', 3]]) };
}

/** Dataset R4 — extreme: 1 minute then 1440 minutes as two entries of 720 (clock 2026-10-11) → +143900.0 %. */
export function datasetR4(): { goals: Goal[]; entries: LogEntry[] } {
  return { goals: [goalR()], entries: entriesR([['2026-10-10', 1], ['2026-10-11', 720], ['2026-10-11', 720]]) };
}

// ---- Phase 8 (M17, v8.0): dataset Q1 — the QPT roadmap linked to a goal (ARCH §4.8 d) ----

/** Clock for phase 8: 2026-11-04 10:00 Asia/Ho_Chi_Minh (Wednesday). */
export const FIXED_NOW_Q1 = new Date('2026-11-04T10:00:00+07:00');
export const TODAY_Q1 = '2026-11-04';

const Q1_STAMP = '2026-10-27T01:00:00.000Z';

/**
 * The QPT roadmap of ARCH §4.8 e starting `startDate`, built by the real template (`buildQptTemplate`, M20) with the
 * readable ids `rq` / `pq1…5` / `wq1…21` / `cq1…5`, `vi` content, no actual dates, no scores. (M17 used a hand-built copy
 * here; M20 moved the content into `domain/roadmap-template.ts` and the rows are byte-identical — `fixtures-q1.test.ts`.)
 */
export function buildQptRoadmap(startDate: string, goalId: string | null, stamp = Q1_STAMP): RoadmapAggregate {
  const prefix = { roadmap: 'rq', phase: 'pq', item: 'wq', checkpoint: 'cq' } as const;
  const agg = buildQptTemplate(startDate, 'vi', (kind, n) => (kind === 'roadmap' ? prefix.roadmap : `${prefix[kind]}${n}`), stamp);
  return { ...agg, roadmap: { ...agg.roadmap, goalId } };
}

export type Q1Variant = 'b' | 'c' | 'e';

export interface DatasetQ1 extends RoadmapAggregate {
  goals: Goal[];
  entries: LogEntry[];
  roadmaps: Roadmap[];
}

/**
 * Dataset Q1 (TASKS phase 8, ARCH §4.8 d): S1 + goal `gq` "QPT study" (daily 60 from 2026-10-20, open-ended) with
 * entries 10-20 50, 10-27 60, 10-29 90, 11-01 120, 11-03 45, 11-04 30; roadmap `rq` from the QPT template
 * (start 2026-10-27) linked to `gq`; W1 actual 10-27 → 11-01; Diagnostic dated 2026-09-24, score 5.
 * Variants: `b` W1 has only `actualStart`; `c` = b + W2 `actualStart 11-04`; `e` goal `gq` and its entries gone
 * (link state `missing`). Oracle at today 2026-11-04: W1 270, W2 75, total 345 min; planned 960; 1/21; on track; 125 days.
 */
export function datasetQ1(variant?: Q1Variant): DatasetQ1 {
  const s1 = datasetS1();
  const gq = buildGoal({ id: 'gq', name: 'QPT study', why: 'Pass the QPT in March 2027', targetType: 'daily', targetMinutes: 60, startDate: '2026-10-20', endDate: null, createdAt: '2026-10-20T01:00:00.000Z', updatedAt: '2026-10-20T01:00:00.000Z' });
  const days: Array<[string, number]> = [['2026-10-20', 50], ['2026-10-27', 60], ['2026-10-29', 90], ['2026-11-01', 120], ['2026-11-03', 45], ['2026-11-04', 30]];
  const gqEntries = days.map(([date, minutes], i) => buildEntry({ id: `e-gq-${i + 1}`, goalId: 'gq', date, minutes, note: '', source: 'manual', createdAt: `${date}T02:00:00.000Z`, updatedAt: `${date}T02:00:00.000Z` }));
  const agg = buildQptRoadmap('2026-10-27', 'gq');
  const w1 = agg.items[0];
  const w2 = agg.items[1];
  w1.actualStart = '2026-10-27';
  w1.actualEnd = variant === 'b' || variant === 'c' ? null : '2026-11-01';
  if (variant === 'c') w2.actualStart = '2026-11-04';
  agg.checkpoints[0].date = '2026-09-24';
  agg.checkpoints[0].score = 5;
  const goals = variant === 'e' ? s1.goals : [...s1.goals, gq];
  const entries = variant === 'e' ? s1.entries : [...s1.entries, ...gqEntries];
  return { goals, entries, roadmaps: [agg.roadmap], ...agg };
}
