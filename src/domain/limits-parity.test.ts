// M10-AC2 (ADR-27): the form validators (plain TypeScript) and the backup schema (zod, lazy) must agree
// on every business limit, so a file the importer accepts is one the forms would accept and vice
// versa (the M7-D1 lesson: two validators drifting apart). Each case flips exactly one value of S1.
import { describe, expect, it } from 'vitest';
import { parseBackup } from './backup';
import { validateEntryFields } from './entry';
import { validateGoalInput, type GoalInput } from './goal';
import { goalRowSchema, entryRowSchema } from '../integration/supabase/mapper';
import { addDays } from './dates';
import type { Goal, LogEntry } from './types';
import { charLength } from './text';
import { datasetS1, FIXED_NOW } from '../test/builders';

function fileWith(goals: Goal[], entries: LogEntry[]): boolean {
  const text = JSON.stringify({ app: 'one-percent-better', schemaVersion: 1, exportedAt: FIXED_NOW.toISOString(), goals, entries, settings: {} });
  return parseBackup(text, text.length).ok;
}

/** S1 with one goal field changed; `accepted` by the importer. */
function fileWithGoal(id: string, patch: Partial<Goal>): boolean {
  const s1 = datasetS1();
  return fileWith(
    s1.goals.map((g) => (g.id === id ? { ...g, ...patch } : g)),
    s1.entries,
  );
}

function fileWithEntry(patch: Partial<LogEntry>): boolean {
  const s1 = datasetS1();
  const target = s1.entries.find((e) => e.goalId === 'g1')!;
  return fileWith(
    s1.goals,
    s1.entries.map((e) => (e.id === target.id ? { ...e, ...patch } : e)),
  );
}

const toInput = (g: Goal): GoalInput => ({
  name: g.name,
  why: g.why,
  targetType: g.targetType,
  targetValue: g.targetType === 'daily' ? g.targetMinutes : g.targetMinutes / 60,
  startDate: g.startDate,
  endDate: g.endDate,
});

function formAcceptsGoal(id: string, patch: Partial<Goal>): boolean {
  const g = datasetS1().goals.find((x) => x.id === id)!;
  return validateGoalInput(toInput({ ...g, ...patch })).ok;
}

const formAcceptsEntry = (patch: Partial<LogEntry>): boolean => validateEntryFields({ minutes: patch.minutes ?? 30, note: patch.note ?? '' }).ok;

describe('limits parity: form validators ↔ parseBackup (M10-AC2)', () => {
  const goalCases: Array<[string, string, Partial<Goal>, boolean]> = [
    ['name 60 chars', 'g1', { name: 'a'.repeat(60) }, true],
    ['name 61 chars', 'g1', { name: 'a'.repeat(61) }, false],
    ['name only whitespace', 'g1', { name: '   ' }, false],
    ['why 280 chars', 'g1', { why: 'w'.repeat(280) }, true],
    ['why 281 chars', 'g1', { why: 'w'.repeat(281) }, false],
    ['daily 1 min', 'g1', { targetMinutes: 1 }, true],
    ['daily 1440 min', 'g1', { targetMinutes: 1440 }, true],
    ['daily 0 min', 'g1', { targetMinutes: 0 }, false],
    ['daily 1441 min', 'g1', { targetMinutes: 1441 }, false],
    // G3 is the total goal; a 1096-day period keeps the derived daily target under 1440 for 10,000 h.
    ['total 1 h', 'g3', { targetMinutes: 60, startDate: '2024-01-01' }, true],
    ['total 10000 h', 'g3', { targetMinutes: 10_000 * 60, startDate: '2024-01-01' }, true],
    ['total 10001 h', 'g3', { targetMinutes: 10_001 * 60, startDate: '2024-01-01' }, false],
    ['total 0 h', 'g3', { targetMinutes: 0, startDate: '2024-01-01' }, false],
    ['total with derived daily > 1440', 'g3', { targetMinutes: 10_000 * 60, startDate: '2026-01-01' }, false],
    ['period 1827 days', 'g4', { startDate: '2026-11-01', endDate: addDays('2026-11-01', 1826) }, true],
    ['period 1828 days', 'g4', { startDate: '2026-11-01', endDate: addDays('2026-11-01', 1827) }, false],
  ];

  for (const [label, id, patch, expected] of goalCases) {
    it(`goal: ${label} → form ${expected ? 'accepts' : 'rejects'} and so does the importer`, () => {
      expect(formAcceptsGoal(id, patch), 'form').toBe(expected);
      expect(fileWithGoal(id, patch), 'file').toBe(expected);
    });
  }

  const entryCases: Array<[string, Partial<LogEntry>, boolean]> = [
    ['minutes 1', { minutes: 1 }, true],
    ['minutes 1440', { minutes: 1440 }, true],
    ['minutes 1441', { minutes: 1441 }, false],
    ['minutes 0', { minutes: 0 }, false],
    ['minutes 12.5', { minutes: 12.5 }, false],
    ['note 280 chars', { note: 'n'.repeat(280) }, true],
    ['note 281 chars', { note: 'n'.repeat(281) }, false],
  ];

  for (const [label, patch, expected] of entryCases) {
    it(`entry: ${label} → form ${expected ? 'accepts' : 'rejects'} and so does the importer`, () => {
      expect(formAcceptsEntry(patch), 'form').toBe(expected);
      expect(fileWithEntry(patch), 'file').toBe(expected);
    });
  }
});

// ---- M10-D1: characters, not UTF-16 units — form, importer and cloud mapper must agree, astral or not ----
const mapperAcceptsGoal = (g: Goal): boolean =>
  goalRowSchema.safeParse({ id: g.id, name: g.name, why: g.why, target_type: g.targetType, target_minutes: g.targetMinutes, start_date: g.startDate, end_date: g.endDate, archived: g.archived, created_at: g.createdAt, updated_at: g.updatedAt, deleted_at: null }).success;
const mapperAcceptsEntry = (e: LogEntry): boolean =>
  entryRowSchema.safeParse({ id: e.id, goal_id: e.goalId, date: e.date, minutes: e.minutes, note: e.note, source: e.source, created_at: e.createdAt, updated_at: e.updatedAt, deleted_at: null }).success;

describe('limits parity with astral characters (M10-D1): form = importer = cloud mapper', () => {
  const g1 = () => datasetS1().goals[0];
  const cases: Array<[string, Partial<Goal>, boolean]> = [
    ['name 60 emoji', { name: '😀'.repeat(60) }, true],
    ['name 61 emoji', { name: '😀'.repeat(61) }, false],
    ['name 60 U+20BB7', { name: '𠮷'.repeat(60) }, true],
    ['why 280 emoji', { why: '😀'.repeat(280) }, true],
    ['why 281 emoji', { why: '😀'.repeat(281) }, false],
  ];
  for (const [label, patch, expected] of cases) {
    it(`goal: ${label} → form ${expected ? 'accepts' : 'rejects'}, importer and mapper agree`, () => {
      expect(formAcceptsGoal('g1', patch), 'form').toBe(expected);
      expect(fileWithGoal('g1', patch), 'file').toBe(expected);
      expect(mapperAcceptsGoal({ ...g1(), ...patch }), 'mapper').toBe(expected);
    });
  }
  it('entry: note 280 emoji accepted, 281 rejected, by form, importer and mapper', () => {
    const e = datasetS1().entries.find((x) => x.goalId === 'g1')!;
    for (const [n, expected] of [[280, true], [281, false]] as const) {
      const note = '😀'.repeat(n);
      expect(formAcceptsEntry({ note }), `form ${n}`).toBe(expected);
      expect(fileWithEntry({ note }), `file ${n}`).toBe(expected);
      expect(mapperAcceptsEntry({ ...e, note }), `mapper ${n}`).toBe(expected);
    }
  });

  it('fuzz: 4000 random goals and 4000 random entries (BMP + astral alphabet, seeded) — no disagreement between form, importer and mapper', () => {
    let seed = 20261017;
    const rand = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
    const pick = <T>(xs: readonly T[]): T => xs[Math.floor(rand() * xs.length)]!;
    const alphabet = ['a', 'é', 'あ', '😀', '𠮷'] as const;
    const text = (n: number) => {
      const body = pick(alphabet);
      const pad = pick(['', '', ' ', '	']);
      return pad + body.repeat(n) + pad;
    };
    // One tiny file per sample (1 goal, 1 entry) keeps 8 000 parses well under a second even under load.
    const template = datasetS1().goals[0];
    const entryTemplate = datasetS1().entries.find((x) => x.goalId === 'g1')!;
    const fileAccepts = (goals: Goal[], entries: LogEntry[]) => {
      const t = JSON.stringify({ app: 'one-percent-better', schemaVersion: 1, exportedAt: FIXED_NOW.toISOString(), goals, entries, settings: {} });
      return parseBackup(t, t.length).ok;
    };
    const mismatches: string[] = [];
    for (let i = 0; i < 4000; i += 1) {
      const name = text(pick([0, 1, 59, 60, 61, 62, 100]));
      const why = text(pick([0, 1, 279, 280, 281, 282, 600]));
      const form = validateGoalInput(toInput({ ...template, name, why })).ok;
      const file = fileAccepts([{ ...template, name, why }], []);
      // The mapper does not trim: compare on the trimmed value the form/file would store.
      const mapper = mapperAcceptsGoal({ ...template, name: name.trim(), why: why.trim() });
      if (form !== file || form !== mapper) mismatches.push(`goal #${i} form=${form} file=${file} mapper=${mapper} name=${charLength(name)} why=${charLength(why)}`);
    }
    for (let i = 0; i < 4000; i += 1) {
      const note = pick(alphabet).repeat(pick([0, 1, 279, 280, 281, 282, 1000]));
      const minutes = pick([0, 1, 30, 1440, 1441, 12.5]);
      const form = validateEntryFields({ minutes, note }).ok;
      const file = fileAccepts([template], [{ ...entryTemplate, note, minutes }]);
      const mapper = mapperAcceptsEntry({ ...entryTemplate, note, minutes });
      if (form !== file || form !== mapper) mismatches.push(`entry #${i} form=${form} file=${file} mapper=${mapper} note=${charLength(note)} minutes=${minutes}`);
    }
    expect(mismatches.slice(0, 5)).toEqual([]);
  });
});

// ---- v4.0 (M11-AC6): the open-ended rule is one rule on all three boundaries (form, file, cloud) ----
describe('limits parity — open-ended goals (M11-AC6, ADR-31)', () => {
  const o1 = (): Goal => ({ ...datasetS1().goals[0], id: 'o1', targetType: 'daily', targetMinutes: 10, startDate: '2000-01-01', endDate: null });

  it('daily + null (start 2000-01-01, no period limit) → form, importer and mapper all accept', () => {
    const g = o1();
    expect(validateGoalInput(toInput(g)).ok, 'form').toBe(true);
    expect(fileWith([g], []), 'file').toBe(true);
    expect(mapperAcceptsGoal(g), 'mapper').toBe(true);
  });

  it('total + null → form, importer and mapper all reject', () => {
    const g: Goal = { ...o1(), targetType: 'total', targetMinutes: 6000 };
    expect(validateGoalInput(toInput(g)).ok, 'form').toBe(false);
    expect(fileWith([g], []), 'file').toBe(false);
    expect(mapperAcceptsGoal(g), 'mapper').toBe(false);
  });

  it('entries of an open-ended goal: any day from the start on is accepted by the importer (checked at today), earlier days are not', () => {
    const g = { ...o1(), startDate: '2026-10-01' };
    const e = (date: string) => ({ ...datasetS1().entries[0], id: `e-${date}`, goalId: 'o1', date });
    const text = (entries: LogEntry[]) => JSON.stringify({ app: 'one-percent-better', schemaVersion: 1, exportedAt: FIXED_NOW.toISOString(), goals: [g], entries, settings: {} });
    expect(parseBackup(text([e('2026-10-01'), e('2026-10-09')]), 1, '2026-10-09').ok).toBe(true);
    expect(parseBackup(text([e('2026-09-30')]), 1, '2026-10-09').ok).toBe(false);
    expect(parseBackup(text([e('2026-10-10')]), 1, '2026-10-09').ok).toBe(false);
  });
});

// ---- v8.0 (M17-AC7): roadmap fields — the form validators (domain/roadmap.ts) and the v2 importer must agree ----
import { validateCheckpointInput, validateItemInput, validatePhaseInput, validateRoadmapInput } from './roadmap';
import type { RoadmapCheckpoint, RoadmapItem, RoadmapPhase, Roadmap } from './roadmap';
import { datasetQ1, TODAY_Q1 } from '../test/builders';

function q1FileWith(patch: { roadmap?: Partial<Roadmap>; phase?: Partial<RoadmapPhase>; item?: Partial<RoadmapItem>; checkpoint?: Partial<RoadmapCheckpoint> }): boolean {
  const d = datasetQ1();
  const file = {
    app: 'one-percent-better',
    schemaVersion: 2,
    exportedAt: FIXED_NOW.toISOString(),
    goals: d.goals,
    entries: d.entries,
    settings: {},
    roadmaps: [{ ...d.roadmap, ...patch.roadmap }],
    roadmapPhases: d.phases.map((p) => (p.id === 'pq1' ? { ...p, ...patch.phase } : p)),
    roadmapItems: d.items.map((i) => (i.id === 'wq2' ? { ...i, ...patch.item } : i)),
    roadmapCheckpoints: d.checkpoints.map((c) => (c.id === 'cq3' ? { ...c, ...patch.checkpoint } : c)),
  };
  const text = JSON.stringify(file);
  return parseBackup(text, text.length, TODAY_Q1).ok;
}

describe('limits parity: roadmap form validators ↔ parseBackup v2 (M17-AC7)', () => {
  const d = datasetQ1();
  const roadmapCases: Array<[string, Partial<Roadmap>, boolean]> = [
    ['title 80', { title: 'a'.repeat(80) }, true],
    ['title 81', { title: 'a'.repeat(81) }, false],
    ['title blank', { title: '  ' }, false],
    ['note 2000', { note: 'n'.repeat(2000) }, true],
    ['note 2001', { note: 'n'.repeat(2001) }, false],
    ['milestoneLabel 40', { milestoneLabel: 'm'.repeat(40) }, true],
    ['milestoneLabel 41', { milestoneLabel: 'm'.repeat(41) }, false],
    ['weekly target 30 min (0.5 h)', { weeklyTargetMinutes: 30 }, true],
    ['weekly target 10080 min (168 h)', { weeklyTargetMinutes: 10080 }, true],
    ['weekly target 15 min', { weeklyTargetMinutes: 15 }, false],
    ['weekly target 10110 min', { weeklyTargetMinutes: 10110 }, false],
    ['weekly target 438 min (7.3 h)', { weeklyTargetMinutes: 438 }, false],
    ['weekly target null', { weeklyTargetMinutes: null }, true],
    ['milestoneDate invalid', { milestoneDate: '2027-02-30' }, false],
  ];
  for (const [label, patch, expected] of roadmapCases) {
    it(`roadmap: ${label} → form ${expected ? 'accepts' : 'rejects'} and so does the importer`, () => {
      const r = { ...d.roadmap, ...patch };
      const form = validateRoadmapInput({ title: r.title, note: r.note, goalId: r.goalId, weeklyTargetHours: r.weeklyTargetMinutes === null ? null : r.weeklyTargetMinutes / 60, milestoneLabel: r.milestoneLabel, milestoneDate: r.milestoneDate }).ok;
      expect(form, 'form').toBe(expected);
      expect(q1FileWith({ roadmap: patch }), 'file').toBe(expected);
    });
  }

  const phaseCases: Array<[string, Partial<RoadmapPhase>, boolean]> = [
    ['title 80', { title: 'p'.repeat(80) }, true],
    ['title 81', { title: 'p'.repeat(81) }, false],
    ['note 120', { note: 'n'.repeat(120) }, true],
    ['note 121', { note: 'n'.repeat(121) }, false],
  ];
  for (const [label, patch, expected] of phaseCases) {
    it(`phase: ${label} → form ${expected ? 'accepts' : 'rejects'} and so does the importer`, () => {
      const p = { ...d.phases[0], ...patch };
      expect(validatePhaseInput({ title: p.title, note: p.note }).ok, 'form').toBe(expected);
      expect(q1FileWith({ phase: patch }), 'file').toBe(expected);
    });
  }

  const itemCases: Array<[string, Partial<RoadmapItem>, boolean]> = [
    ['title 200', { title: 'i'.repeat(200) }, true],
    ['title 201', { title: 'i'.repeat(201) }, false],
    ['note 1000', { note: 'n'.repeat(1000) }, true],
    ['note 1001', { note: 'n'.repeat(1001) }, false],
    ['span 366 days', { plannedStart: '2026-11-03', plannedEnd: addDays('2026-11-03', 365) }, true],
    ['span 367 days', { plannedStart: '2026-11-03', plannedEnd: addDays('2026-11-03', 366) }, false],
    ['end before start', { plannedEnd: '2026-11-02' }, false],
    ['actualEnd before actualStart', { actualStart: '2026-11-04', actualEnd: '2026-11-03' }, false],
    ['actualEnd after today', { actualStart: '2026-11-03', actualEnd: '2026-11-05' }, false],
    ['actual dates today', { actualStart: '2026-11-03', actualEnd: '2026-11-04' }, true],
  ];
  for (const [label, patch, expected] of itemCases) {
    it(`item: ${label} → form ${expected ? 'accepts' : 'rejects'} and so does the importer`, () => {
      const i = { ...d.items[1], ...patch };
      expect(validateItemInput({ title: i.title, note: i.note, plannedStart: i.plannedStart, plannedEnd: i.plannedEnd, actualStart: i.actualStart, actualEnd: i.actualEnd }, TODAY_Q1).ok, 'form').toBe(expected);
      expect(q1FileWith({ item: patch }), 'file').toBe(expected);
    });
  }

  const cpCases: Array<[string, Partial<RoadmapCheckpoint>, boolean]> = [
    ['title 80', { title: 'c'.repeat(80) }, true],
    ['title 81', { title: 'c'.repeat(81) }, false],
    ['note 280', { note: 'n'.repeat(280) }, true],
    ['note 281', { note: 'n'.repeat(281) }, false],
    ['maxScore 10000', { maxScore: 10000, threshold: 20 }, true],
    ['maxScore 10001', { maxScore: 10001 }, false],
    ['maxScore 0', { maxScore: 0 }, false],
    ['score 32 of 32', { score: 32 }, true],
    ['score 33 of 32', { score: 33 }, false],
    ['score 7.5', { score: 7.5 }, true],
    ['score 7.25', { score: 7.25 }, false],
    ['threshold -1', { threshold: -1 }, false],
    ['threshold above max', { threshold: 32.5 }, false],
  ];
  for (const [label, patch, expected] of cpCases) {
    it(`checkpoint: ${label} → form ${expected ? 'accepts' : 'rejects'} and so does the importer`, () => {
      const c = { ...d.checkpoints[2], ...patch };
      expect(validateCheckpointInput({ title: c.title, note: c.note, date: c.date, maxScore: c.maxScore, threshold: c.threshold, score: c.score }).ok, 'form').toBe(expected);
      expect(q1FileWith({ checkpoint: patch }), 'file').toBe(expected);
    });
  }
});
