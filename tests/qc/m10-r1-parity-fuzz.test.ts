// QC M10 round 1 - M10-AC2 / ADR-27: the form validators (plain TS) and the backup schema (zod) must accept exactly the same
// goals and entries. The developer's limits-parity test pins ~23 boundary pairs; this one fuzzes thousands of random inputs
// (seeded) around every limit, including padded whitespace and astral characters (UTF-16 length), and also checks the round trip
// "created through the form -> exported -> imported".
import { describe, expect, it } from 'vitest';
import { parseBackup } from '../../src/domain/backup';
import { validateEntryFields } from '../../src/domain/entry';
import { validateGoalInput, type GoalInput } from '../../src/domain/goal';
import { addDays } from '../../src/domain/dates';
import type { Goal, LogEntry } from '../../src/domain/types';

function prng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const STAMP = '2026-01-01T00:00:00.000Z';
function file(goals: Goal[], entries: LogEntry[]) {
  const text = JSON.stringify({ app: 'one-percent-better', schemaVersion: 1, exportedAt: '2026-10-09T03:00:00.000Z', goals, entries, settings: {} });
  return parseBackup(text, text.length, '2026-10-09');
}

// M10-D1 (Major, open): the plain-TS form validators count UTF-16 code units (`string.length`), the zod schema of the importer (and
// the cloud mapper / SQL char_length) counts code points. Before M10 both were zod, so 60 emoji were a valid goal name; since
// ADR-27 the form rejects them (and any text whose astral characters push it over the limit in UTF-16 units) while the importer
// accepts it. `it.fails` = EXPECTED to fail while open; QC flips it to `it` when fixed.
const BMP = ['a', 'é', 'あ'] as const;
const ASTRAL = ['😀', '𠮷'] as const;

for (const [label, alphabet, runner] of [['BMP characters only', BMP, it], ['astral characters (emoji, U+20BB7)', [...BMP, ...ASTRAL], it.fails]] as const) {
describe(`goal: form validator and importer agree - ${label}`, () => {
  runner('4000 random goals around every limit', () => {
    const rand = prng(20261017);
    const pick = <T>(xs: readonly T[]): T => xs[Math.floor(rand() * xs.length)]!;
    const text = (n: number) => {
      const pad = pick(['', '', ' ', '   ', '\t', ' ']);
      const body = pick(alphabet);
      // n code units of the body (an emoji counts as 2)
      const unit = body.length;
      return pad + body.repeat(Math.max(0, Math.floor(n / unit))) + (n % unit ? 'x' : '') + pad;
    };
    const mismatches: string[] = [];
    let accepted = 0;
    for (let i = 0; i < 4000; i += 1) {
      const targetType = pick(['daily', 'total'] as const);
      const startOffset = Math.floor(rand() * 3000) - 1500;
      const startDate = addDays('2026-10-09', startOffset);
      const days = pick([0, 1, 2, 30, 365, 1825, 1826, 1827, 1828, 1829, 3000]) + Math.floor(rand() * 3);
      const endDate = rand() < 0.05 ? addDays(startDate, -1 - Math.floor(rand() * 5)) : addDays(startDate, Math.max(0, days - 1));
      const value = targetType === 'daily' ? pick([-1, 0, 1, 2, 60, 1439, 1440, 1441, 2000, 12.5, Number.NaN]) : pick([-1, 0, 1, 2, 24, 100, 9999, 10_000, 10_001, 50_000, 0.5, Number.NaN]);
      const input: GoalInput = {
        name: text(pick([0, 1, 59, 60, 61, 62, 100])),
        why: text(pick([0, 1, 279, 280, 281, 282, 600])),
        targetType,
        targetValue: value,
        startDate,
        endDate,
      };
      const form = validateGoalInput(input);
      if (form.ok) accepted += 1;
      // File value for the same goal: the importer stores minutes, so total hours are converted; NaN cannot exist in JSON.
      const minutes = targetType === 'daily' ? value : value * 60;
      if (Number.isNaN(minutes)) {
        expect(form.ok, 'NaN target must be rejected by the form').toBe(false);
        continue;
      }
      const goal: Goal = { id: 'g', name: input.name, why: input.why, targetType, targetMinutes: minutes, startDate, endDate, archived: false, createdAt: STAMP, updatedAt: STAMP };
      const imported = file([goal], []);
      // An importer failure for ordering (endDate < startDate) is an integrity error, not a limit: both reject.
      if (form.ok !== imported.ok) mismatches.push(`#${i} form=${form.ok} file=${imported.ok} ${JSON.stringify({ ...input, name: `[${input.name.length}]`, why: `[${input.why.length}]` })} ${imported.ok ? '' : JSON.stringify(imported.errors[0])}`);
      // Round trip: whatever the form produced must be importable verbatim.
      if (form.ok) {
        const g2: Goal = { id: 'g', ...form.value, archived: false, createdAt: STAMP, updatedAt: STAMP };
        const again = file([g2], []);
        if (!again.ok) mismatches.push(`#${i} ROUND TRIP failed ${JSON.stringify(again.errors[0])}`);
      }
    }
    console.log(`QC M10 goal parity fuzz: 4000 cases, ${accepted} accepted by the form, ${mismatches.length} mismatches`);
    expect(mismatches.slice(0, 5)).toEqual([]);
    expect(accepted).toBeGreaterThan(200);
  });
});

describe(`entry: form validator and importer agree - ${label}`, () => {
  runner('4000 random entries around the minute and note limits', () => {
    const rand = prng(777);
    const pick = <T>(xs: readonly T[]): T => xs[Math.floor(rand() * xs.length)]!;
    const goal: Goal = { id: 'g', name: 'G', why: '', targetType: 'daily', targetMinutes: 30, startDate: '2026-01-01', endDate: '2026-12-31', archived: false, createdAt: STAMP, updatedAt: STAMP };
    const mismatches: string[] = [];
    let accepted = 0;
    for (let i = 0; i < 4000; i += 1) {
      const minutes = pick([-1, 0, 1, 2, 30, 1439, 1440, 1441, 5000, 12.5, 0.1, Number.MAX_SAFE_INTEGER]);
      const noteLen = pick([0, 1, 279, 280, 281, 282, 1000]);
      const note = pick(alphabet).repeat(noteLen); // no padding: the importer does not trim notes, the form does (not a limit difference)
      const form = validateEntryFields({ minutes, note });
      const entry: LogEntry = { id: 'e', goalId: 'g', date: '2026-03-03', minutes, note, source: 'manual', createdAt: STAMP, updatedAt: STAMP };
      const imported = file([goal], [entry]);
      if (form.ok) accepted += 1;
      if (form.ok !== imported.ok) mismatches.push(`#${i} form=${form.ok} file=${imported.ok} minutes=${minutes} noteUnits=${note.length} ${imported.ok ? '' : JSON.stringify(imported.errors[0])}`);
    }
    console.log(`QC M10 entry parity fuzz: 4000 cases, ${accepted} accepted, ${mismatches.length} mismatches`);
    expect(mismatches.slice(0, 5)).toEqual([]);
    expect(accepted).toBeGreaterThan(200);
  });
});
}

describe('M10-D1 deterministic cases (form behaviour before M10, when it used zod: limits count characters, not UTF-16 units)', () => {
  const base: GoalInput = { name: 'x', why: '', targetType: 'daily', targetValue: 30, startDate: '2026-10-01', endDate: '2026-10-31' };
  it.fails('a goal name of 60 emoji (60 characters, 120 UTF-16 units) is accepted by the form, as it is by the importer', () => {
    expect(validateGoalInput({ ...base, name: '😀'.repeat(60) }).ok).toBe(true);
  });
  it.fails('a why of 280 emoji is accepted by the form', () => {
    expect(validateGoalInput({ ...base, why: '😀'.repeat(280) }).ok).toBe(true);
  });
  it.fails('an entry note of 280 emoji is accepted by the form', () => {
    expect(validateEntryFields({ minutes: 30, note: '😀'.repeat(280) }).ok).toBe(true);
  });
  it('the importer accepts exactly these values (so form and file disagree)', () => {
    const goal: Goal = { id: 'g', name: '😀'.repeat(60), why: '😀'.repeat(280), targetType: 'daily', targetMinutes: 30, startDate: '2026-10-01', endDate: '2026-10-31', archived: false, createdAt: STAMP, updatedAt: STAMP };
    const entry: LogEntry = { id: 'e', goalId: 'g', date: '2026-10-05', minutes: 30, note: '😀'.repeat(280), source: 'manual', createdAt: STAMP, updatedAt: STAMP };
    expect(file([goal], [entry]).ok).toBe(true);
  });
  it('61 emoji are rejected by both (the limit itself is unchanged)', () => {
    expect(validateGoalInput({ ...base, name: '😀'.repeat(61) }).ok).toBe(false);
    const goal: Goal = { id: 'g', name: '😀'.repeat(61), why: '', targetType: 'daily', targetMinutes: 30, startDate: '2026-10-01', endDate: '2026-10-31', archived: false, createdAt: STAMP, updatedAt: STAMP };
    expect(file([goal], []).ok).toBe(false);
  });
});
