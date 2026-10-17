// QC M10 round 2 - M10-D1 verification. One counting unit (Unicode code points) at every boundary:
//   form validators (src/domain/text.ts charLength) = importer (zod, parseBackup) = cloud mapper (zod rows) = zod `.max()` = Array.from(s).length.
// Postgres `char_length` is also code points (documented); no Postgres is available here (no Docker), see the round 2 report, section 8.
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { parseBackup } from '../../src/domain/backup';
import { validateEntryFields } from '../../src/domain/entry';
import { validateGoalInput, type GoalInput } from '../../src/domain/goal';
import { charLength } from '../../src/domain/text';
import type { Goal, LogEntry } from '../../src/domain/types';
import { entryRowSchema, goalRowSchema } from '../../src/integration/supabase/mapper';

function prng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// [text, code points]. ZWJ family = 5 code points, flag = 2 regional indicators, "e + U+0301" = 2, keycap = 3, skin tone = 2.
const ATOMS: ReadonlyArray<readonly [string, number]> = [
  ['a', 1],
  ['é', 1],
  ['あ', 1],
  ['😀', 1],
  ['𠮷', 1],
  ['\u{1F9D1}\u{1F3FD}', 2],
  ['👨‍👩‍👧', 5],
  ['🇻🇳', 2],
  ['é', 2],
  ['1️⃣', 3],
  ['‍', 1],
  ['\u{10FFFF}', 1],
];
const cp = (s: string) => Array.from(s).length;

/** A string of exactly `n` code points assembled from random atoms. */
function exactly(n: number, rand: () => number): string {
  let out = '';
  let left = n;
  while (left > 0) {
    const fit = ATOMS.filter(([, c]) => c <= left);
    const [t, c] = fit[Math.floor(rand() * fit.length)]!;
    out += t;
    left -= c;
  }
  return out;
}

const STAMP = '2026-01-01T00:00:00.000Z';
const goalOf = (patch: Partial<Goal>): Goal => ({ id: 'g', name: 'n', why: '', targetType: 'daily', targetMinutes: 30, startDate: '2026-10-01', endDate: '2026-10-31', archived: false, createdAt: STAMP, updatedAt: STAMP, ...patch });
const entryOf = (patch: Partial<LogEntry>): LogEntry => ({ id: 'e', goalId: 'g', date: '2026-10-05', minutes: 30, note: '', source: 'manual', createdAt: STAMP, updatedAt: STAMP, ...patch });
function importer(goals: Goal[], entries: LogEntry[]): boolean {
  const text = JSON.stringify({ app: 'one-percent-better', schemaVersion: 1, exportedAt: '2026-10-09T03:00:00.000Z', goals, entries, settings: {} });
  return parseBackup(text, text.length, '2026-10-09').ok;
}
const mapperGoal = (g: Goal) =>
  goalRowSchema.safeParse({ id: g.id, name: g.name, why: g.why, target_type: g.targetType, target_minutes: g.targetMinutes, start_date: g.startDate, end_date: g.endDate, archived: g.archived, created_at: g.createdAt, updated_at: g.updatedAt, deleted_at: null }).success;
const mapperEntry = (e: LogEntry) =>
  entryRowSchema.safeParse({ id: e.id, goal_id: e.goalId, date: e.date, minutes: e.minutes, note: e.note, source: e.source, created_at: e.createdAt, updated_at: e.updatedAt, deleted_at: null }).success;
const input = (g: Goal): GoalInput => ({
  name: g.name,
  why: g.why,
  targetType: g.targetType,
  targetValue: g.targetType === 'daily' ? g.targetMinutes : g.targetMinutes / 60,
  startDate: g.startDate,
  endDate: g.endDate,
});
const CASES: Array<[string, string]> = ATOMS.map(([t]) => [JSON.stringify(t), t]);
const build = (atom: string, n: number) => atom.repeat(Math.floor(n / cp(atom))) + 'a'.repeat(n % cp(atom));

describe('M10-D1 (r2): the counting function is code points everywhere', () => {
  it('charLength = Array.from(s).length = zod max() boundary, on 5000 random strings from a hostile alphabet (incl. lone surrogates)', () => {
    const rand = prng(1017);
    const pool = [...ATOMS.map(([t]) => t), '\ud83d', '\ude00', '\ud83dx', 'x\ude00', ' ', '\t', ' '];
    let withAstral = 0;
    for (let i = 0; i < 5000; i += 1) {
      let s = '';
      const k = Math.floor(rand() * 12);
      for (let j = 0; j < k; j += 1) s += pool[Math.floor(rand() * pool.length)];
      const n = cp(s);
      if (s.length !== n) withAstral += 1;
      expect(charLength(s), JSON.stringify(s)).toBe(n);
      expect(z.string().max(n).safeParse(s).success, `zod max(${n}) ${JSON.stringify(s)}`).toBe(true);
      if (n >= 1) expect(z.string().max(n - 1).safeParse(s).success, `zod max(${n - 1}) ${JSON.stringify(s)}`).toBe(false);
    }
    expect(withAstral).toBeGreaterThan(1000);
  });

  describe('goal name 60 / 61 code points', () => {
    for (const [label, atom] of CASES) {
      it(`atom ${label}: 60 accepted, 61 rejected by form = importer = mapper`, () => {
        for (const [n, ok] of [[60, true], [61, false]] as const) {
          const name = build(atom, n);
          expect(cp(name)).toBe(n);
          const g = goalOf({ name });
          expect(validateGoalInput(input(g)).ok, `form ${n}`).toBe(ok);
          expect(importer([g], []), `importer ${n}`).toBe(ok);
          expect(mapperGoal(g), `mapper ${n}`).toBe(ok);
        }
      });
    }
  });

  describe('goal why 280 / 281 and entry note 280 / 281 code points', () => {
    for (const [label, atom] of CASES) {
      it(`atom ${label}: why and note`, () => {
        for (const [n, ok] of [[280, true], [281, false]] as const) {
          const text = build(atom, n);
          expect(cp(text)).toBe(n);
          const g = goalOf({ why: text });
          expect(validateGoalInput(input(g)).ok, `form why ${n}`).toBe(ok);
          expect(importer([g], []), `importer why ${n}`).toBe(ok);
          expect(mapperGoal(g), `mapper why ${n}`).toBe(ok);
          const e = entryOf({ note: text });
          expect(validateEntryFields({ minutes: 30, note: text }).ok, `form note ${n}`).toBe(ok);
          expect(importer([goalOf({})], [e]), `importer note ${n}`).toBe(ok);
          expect(mapperEntry(e), `mapper note ${n}`).toBe(ok);
        }
      });
    }
  });

  describe('id 64 / 65 code points (importer = mapper; the forms never take an id from the user)', () => {
    for (const [label, atom] of CASES) {
      it(`atom ${label}`, () => {
        for (const [n, ok] of [[64, true], [65, false]] as const) {
          const id = build(atom, n);
          expect(cp(id)).toBe(n);
          expect(importer([goalOf({ id })], []), `importer goal id ${n}`).toBe(ok);
          expect(importer([goalOf({})], [entryOf({ id })]), `importer entry id ${n}`).toBe(ok);
          expect(mapperGoal(goalOf({ id })), `mapper goal id ${n}`).toBe(ok);
          expect(mapperEntry(entryOf({ id })), `mapper entry id ${n}`).toBe(ok);
          expect(mapperEntry(entryOf({ goalId: id })), `mapper entry goal_id ${n}`).toBe(ok);
        }
      });
    }
  });

  it('whitespace is trimmed before counting (form and importer): 60 code points + padding accepted, 61 + padding rejected', () => {
    for (const pad of ['', ' ', '  \t', ' ', '　']) {
      const n60 = '😀'.repeat(60);
      const n61 = '😀'.repeat(61);
      expect(validateGoalInput(input(goalOf({ name: pad + n60 + pad }))).ok, `form pad ${JSON.stringify(pad)}`).toBe(true);
      expect(importer([goalOf({ name: pad + n60 + pad })], []), `importer pad ${JSON.stringify(pad)}`).toBe(true);
      expect(validateGoalInput(input(goalOf({ name: pad + n61 + pad }))).ok).toBe(false);
      expect(importer([goalOf({ name: pad + n61 + pad })], [])).toBe(false);
    }
  });

  it('fuzz: 4000 goals (name, why) in the hostile alphabet around every code-point boundary - form = importer = mapper, and the form output round-trips', () => {
    const rand = prng(20261018);
    const pick = <T,>(xs: readonly T[]): T => xs[Math.floor(rand() * xs.length)]!;
    const mismatches: string[] = [];
    let accepted = 0;
    let rejectedByLength = 0;
    let astral = 0;
    for (let i = 0; i < 4000; i += 1) {
      const nameCp = pick([1, 2, 58, 59, 60, 61, 62, 100]);
      const whyCp = pick([0, 1, 278, 279, 280, 281, 282, 500]);
      const name = exactly(nameCp, rand);
      const why = whyCp === 0 ? '' : exactly(whyCp, rand);
      if (name.length !== cp(name) || why.length !== cp(why)) astral += 1;
      const targetType = pick(['daily', 'total'] as const);
      const g = goalOf({ name, why, targetType, targetMinutes: targetType === 'daily' ? pick([1, 30, 1440]) : pick([60, 6000]), startDate: '2026-01-01', endDate: pick(['2026-12-31', '2026-06-30']) });
      const f = validateGoalInput(input(g));
      const lengthOk = nameCp <= 60 && whyCp <= 280;
      const imp = importer([g], []);
      const map = mapperGoal(g);
      if (f.ok) accepted += 1;
      else if (!lengthOk) rejectedByLength += 1;
      if (f.ok !== imp || f.ok !== map) mismatches.push(`#${i} form=${f.ok} importer=${imp} mapper=${map} nameCp=${nameCp} whyCp=${whyCp} ${JSON.stringify(f.ok ? '' : f.errors[0])}`);
      if (f.ok !== lengthOk) mismatches.push(`#${i} form=${f.ok} but the code-point rule says ${lengthOk} (nameCp=${nameCp} whyCp=${whyCp})`);
      if (f.ok && !importer([{ ...g, ...f.value }], [])) mismatches.push(`#${i} ROUND TRIP`);
    }
    console.log(`QC M10 r2 goal fuzz: 4000 cases, ${accepted} accepted, ${rejectedByLength} rejected for length, ${astral} contain non-BMP/ZWJ text, ${mismatches.length} mismatches`);
    expect(mismatches.slice(0, 5)).toEqual([]);
    expect(accepted).toBeGreaterThan(500);
    expect(rejectedByLength).toBeGreaterThan(500);
    expect(astral).toBeGreaterThan(2000);
  });

  it('fuzz: 4000 entries (note) in the hostile alphabet around 280 - form = importer = mapper', () => {
    const rand = prng(99);
    const pick = <T,>(xs: readonly T[]): T => xs[Math.floor(rand() * xs.length)]!;
    const mismatches: string[] = [];
    let accepted = 0;
    let rejected = 0;
    for (let i = 0; i < 4000; i += 1) {
      const noteCp = pick([0, 1, 278, 279, 280, 281, 282, 600]);
      const note = noteCp === 0 ? '' : exactly(noteCp, rand);
      const minutes = pick([1, 30, 1440]);
      const e = entryOf({ note, minutes });
      const f = validateEntryFields({ minutes, note });
      const imp = importer([goalOf({})], [e]);
      const map = mapperEntry(e);
      if (f.ok) accepted += 1;
      else rejected += 1;
      if (f.ok !== imp || f.ok !== map || f.ok !== noteCp <= 280) mismatches.push(`#${i} form=${f.ok} importer=${imp} mapper=${map} noteCp=${noteCp}`);
    }
    console.log(`QC M10 r2 entry fuzz: 4000 cases, ${accepted} accepted, ${rejected} rejected, ${mismatches.length} mismatches`);
    expect(mismatches.slice(0, 5)).toEqual([]);
    expect(accepted).toBeGreaterThan(1500);
    expect(rejected).toBeGreaterThan(1000);
  });
});
