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
      const pad = pick(['', '', ' ', '\t']);
      return pad + body.repeat(n) + pad;
    };
    const mismatches: string[] = [];
    for (let i = 0; i < 4000; i += 1) {
      const patch: Partial<Goal> = { name: text(pick([0, 1, 59, 60, 61, 62, 100])), why: text(pick([0, 1, 279, 280, 281, 282, 600])) };
      const form = formAcceptsGoal('g1', patch);
      const file = fileWithGoal('g1', patch);
      // The mapper does not trim: compare on the trimmed value the form/file would store.
      const stored = { ...g1(), name: patch.name!.trim(), why: patch.why!.trim() };
      const mapper = mapperAcceptsGoal(stored);
      if (form !== file || form !== mapper) mismatches.push(`goal #${i} form=${form} file=${file} mapper=${mapper} name=${charLength(patch.name!)} why=${charLength(patch.why!)}`);
    }
    const e = datasetS1().entries.find((x) => x.goalId === 'g1')!;
    for (let i = 0; i < 4000; i += 1) {
      const note = pick(alphabet).repeat(pick([0, 1, 279, 280, 281, 282, 1000]));
      const minutes = pick([0, 1, 30, 1440, 1441, 12.5]);
      const form = formAcceptsEntry({ note, minutes });
      const file = fileWithEntry({ note, minutes });
      const mapper = mapperAcceptsEntry({ ...e, note, minutes });
      if (form !== file || form !== mapper) mismatches.push(`entry #${i} form=${form} file=${file} mapper=${mapper} note=${charLength(note)} minutes=${minutes}`);
    }
    expect(mismatches.slice(0, 5)).toEqual([]);
  });
});
