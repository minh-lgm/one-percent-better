// QC M11 round 1 - independent checks for open-ended goals (endDate = null, daily only; ARCH 4.6, ADR-31 .. ADR-33).
// The oracle below is written from the ARCH 4.6 table with plain UTC Date arithmetic and brute force; it shares no code
// with src/domain. Also: cross-layer parity grid (form / backup file / cloud row), entry-date boundaries through the real
// services on fake-indexeddb, and a static audit of the migration file.
import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { openDatabase, type AppDatabase } from '../../src/data/dexie/db';
import { DexieEntryRepository } from '../../src/data/dexie/entry-repo';
import { DexieGoalRepository } from '../../src/data/dexie/goal-repo';
import { parseBackup } from '../../src/domain/backup';
import { curve } from '../../src/domain/curve';
import { goalStatus, groupGoals, validateGoalInput, type GoalInput } from '../../src/domain/goal';
import { isValidISODate } from '../../src/domain/dates';
import { buildHeatmap } from '../../src/domain/heatmap';
import { goalStats } from '../../src/domain/stats';
import { validateEntryDate } from '../../src/domain/entry';
import type { Goal, LogEntry } from '../../src/domain/types';
import { goalRowSchema } from '../../src/integration/supabase/mapper';
import { EntryService } from '../../src/services/entry-service';
import { GoalService } from '../../src/services/goal-service';
import { buildEntry, buildGoal, datasetO1, datasetS1O1, FIXED_NOW } from '../../src/test/builders';
import { createTestDatabase } from '../../src/test/db';
import { errorMessage } from '../../src/ui/error-messages';

// ---------- oracle (UTC, brute force) ----------
const D = (s: string) => new Date(`${s}T00:00:00Z`);
const S = (d: Date) => d.toISOString().slice(0, 10);
const add = (s: string, n: number) => S(new Date(D(s).getTime() + n * 86_400_000));
const diff = (a: string, b: string) => Math.round((D(b).getTime() - D(a).getTime()) / 86_400_000);

function rng(seed: number) {
  let x = seed >>> 0;
  return () => {
    x = (Math.imul(x, 1664525) + 1013904223) >>> 0;
    return x / 2 ** 32;
  };
}

function randomOpen(seed: number, today: string) {
  const r = rng(seed);
  const pick = (n: number) => Math.floor(r() * n);
  const startOffset = pick(5) === 0 ? -pick(2500) : pick(4) === 0 ? pick(40) : -pick(120); // old, upcoming, or recent
  const start = add(today, startOffset);
  const target = 5 + pick(90);
  const goal: Goal = buildGoal({ id: 'o', name: 'O', targetType: 'daily', targetMinutes: target, startDate: start, endDate: null, archived: false });
  const entries: LogEntry[] = [];
  const hit = 0.3 + r() * 0.6;
  for (let d = start; d <= today; d = add(d, 1)) {
    if (r() < hit) {
      const m = r() < 0.55 ? target + pick(30) : Math.max(1, Math.floor(target * r()));
      entries.push(buildEntry({ id: `e-${d}`, goalId: 'o', date: d, minutes: Math.min(m, 800), note: '' }));
      if (r() < 0.15) entries.push(buildEntry({ id: `e2-${d}`, goalId: 'o', date: d, minutes: 1 + pick(20), note: '' }));
    }
  }
  return { goal, entries };
}

const minutesOn = (entries: LogEntry[], d: string) => entries.filter((e) => e.date === d).reduce((a, e) => a + e.minutes, 0);

function streaks(isMet: (d: string) => boolean, from: string, today: string) {
  let longest = 0;
  let run = 0;
  for (let d = from; d <= today; d = add(d, 1)) {
    if (isMet(d)) {
      run++;
      longest = Math.max(longest, run);
    } else run = 0;
  }
  let cur = 0;
  let d = isMet(today) ? today : add(today, -1);
  while (d >= from && isMet(d)) {
    cur++;
    d = add(d, -1);
  }
  return { cur, longest };
}

const TODAYS = ['2026-10-09', '2028-02-29', '2027-01-01', '2031-10-02'];

describe('M11 QC oracle: open-ended goal on random data (stats, status, curve, heatmap, entry dates)', () => {
  for (const today of TODAYS) {
    for (let seed = 1; seed <= 25; seed++) {
      it(`today ${today} seed ${seed}`, () => {
        const { goal, entries } = randomOpen(seed * 104729 + Number(today.slice(0, 4)), today);
        const started = today >= goal.startDate;
        // status: never ended
        expect(goalStatus(goal, today)).toBe(started ? 'active' : 'upcoming');
        expect(goalStatus(goal, add(today, 4000))).toBe(started ? 'active' : add(today, 4000) >= goal.startDate ? 'active' : 'upcoming');
        expect(goalStatus({ ...goal, archived: true }, today)).toBe('archived');
        // stats
        const elapsed = started ? diff(goal.startDate, today) + 1 : 0;
        const total = entries.reduce((a, e) => a + e.minutes, 0);
        const target = goal.targetMinutes * elapsed;
        for (const year of [Number(today.slice(0, 4)), Number(today.slice(0, 4)) - 1, Number(goal.startDate.slice(0, 4)) - 1]) {
          const s = goalStats(goal, entries, year, today);
          expect(s.elapsedDays).toBe(elapsed);
          expect(s.totalTarget).toBe(target);
          expect(s.minutesTotal).toBe(total);
          expect(s.expectedMinutes).toBe(target);
          expect(s.pace).toBe(elapsed === 0 ? 0 : total - target);
          expect(s.progressPercent).toBeCloseTo(target === 0 ? 0 : Math.round((total / target) * 1000) / 10, 9);
          expect(s.outsideYear).toBe(Number(goal.startDate.slice(0, 4)) > year);
          const met = (d: string) => d >= goal.startDate && d <= today && minutesOn(entries, d) >= goal.targetMinutes && minutesOn(entries, d) > 0;
          if (year === Number(today.slice(0, 4))) {
            const o = streaks(met, goal.startDate, today);
            expect({ c: s.currentStreak, l: s.longestStreak }).toEqual({ c: o.cur, l: o.longest });
          }
        }
        // curve: only startDate .. today, nothing in the future, nothing before the start
        const c = curve(goal, entries, today);
        expect(c.periodDays).toBe(elapsed);
        expect(c.ideal).toHaveLength(elapsed);
        expect(c.actual).toHaveLength(elapsed);
        expect(c.elapsedDays).toBe(elapsed);
        if (elapsed > 0) {
          expect(c.ideal[0]!.date).toBe(goal.startDate);
          expect(c.ideal[elapsed - 1]!.date).toBe(today);
          expect(c.actual.every((p) => p.date <= today && p.date >= goal.startDate)).toBe(true);
          const logged = [...new Set(entries.map((e) => e.date))].sort();
          expect(c.loggedDays).toBe(logged.length);
          if (logged.length > 0) {
            const first = minutesOn(entries, logged[0]!);
            const last = minutesOn(entries, logged[logged.length - 1]!);
            const exact = ((last - first) * 1000) / first;
            const headline = (Math.sign(exact) * Math.round(Math.abs(exact))) / 10;
            expect(c.headlinePercent).toBeCloseTo(headline === 0 ? 0 : headline, 9);
          } else expect(c.headlinePercent).toBe(0);
        } else {
          expect(c.ideal).toEqual([]);
          expect(c.actual).toEqual([]);
          expect(c.headlinePercent).toBe(0);
          expect(c.idealPercent).toBe(0);
        }
        // entry dates: start..today valid, outside refused with end null, future refused as DATE_IN_FUTURE
        expect(validateEntryDate(goal.startDate, goal, goal.startDate)).toBeNull();
        const dayBefore = add(goal.startDate, -1);
        if (dayBefore <= today) {
          expect(validateEntryDate(dayBefore, goal, today)?.code).toBe('DATE_OUTSIDE_GOAL_PERIOD');
          expect(validateEntryDate(dayBefore, goal, today)?.params?.end).toBeNull();
        } else expect(validateEntryDate(dayBefore, goal, today)?.code).toBe('DATE_IN_FUTURE'); // future wins over the period check
        expect(validateEntryDate(add(today, 1), goal, today)?.code).toBe('DATE_IN_FUTURE');
        if (started) expect(validateEntryDate(today, goal, today)).toBeNull();
        // heatmap of the goal's year: cells before the start are outside, everything after is not
        const year = Number(today.slice(0, 4));
        const grid = buildHeatmap({ year, goal, goals: [goal], entries, today });
        for (const cell of grid.cells) {
          if (cell.date > today) expect(cell.state).toBe('future');
          else if (cell.date < goal.startDate) expect(cell.state).toBe('outside');
          else {
            expect(cell.state).toBe(minutesOn(entries, cell.date) > 0 ? 'logged' : 'none');
            expect(cell.minutes).toBe(minutesOn(entries, cell.date));
          }
        }
      });
    }
  }

  it('groupGoals: an open-ended goal that ran for 6 years is still Active and never Ended', () => {
    const { goals } = datasetS1O1();
    const g = groupGoals(goals, '2032-12-31');
    expect(g.active.map((x) => x.id)).toContain('o1');
    expect(g.ended.map((x) => x.id)).not.toContain('o1');
    expect(groupGoals(goals, '2026-09-30').upcoming.map((x) => x.id)).toContain('o1');
  });
});

// ---------- parity grid ----------
describe('M11 QC: form / backup file / cloud row agree on every (type, startDate, endDate) combination', () => {
  const starts = ['2026-10-01', '2000-01-01', '2026-02-29x', ''];
  const ends: Array<string | null> = [null, '2026-12-31', '2026-09-30', '2099-12-31', '', '2026-02-30'];
  for (const targetType of ['daily', 'total'] as const) {
    for (const startDate of starts) {
      for (const endDate of ends) {
        it(`${targetType} start=${JSON.stringify(startDate)} end=${JSON.stringify(endDate)}`, () => {
          const input: GoalInput = { name: 'P', why: '', targetType, targetValue: targetType === 'daily' ? 10 : 100, startDate, endDate };
          const form = validateGoalInput(input).ok;
          const goal = buildGoal({ id: 'p', name: 'P', why: '', targetType, targetMinutes: targetType === 'daily' ? 10 : 6000, startDate, endDate } as Partial<Goal>);
          const text = JSON.stringify({ app: 'one-percent-better', schemaVersion: 1, exportedAt: FIXED_NOW.toISOString(), goals: [goal], entries: [], settings: {} });
          const file = parseBackup(text, text.length).ok;
          const row = goalRowSchema.safeParse({
            user_id: '00000000-0000-0000-0000-000000000001', id: 'p', name: 'P', why: '', target_type: targetType, target_minutes: goal.targetMinutes,
            start_date: startDate, end_date: endDate, archived: false, created_at: goal.createdAt, updated_at: goal.updatedAt, deleted_at: null, server_updated_at: goal.updatedAt,
          }).success;
          // Pre-existing (M6, not M11): the cloud row schema has no 1,827-day cap (the SQL has none either), so it is
          // more lenient than the form/file for a FINITE period that is too long. Everything else must agree.
          const tooLong = endDate !== null && isValidISODate(startDate) && isValidISODate(endDate) && endDate >= startDate && diff(startDate, endDate) + 1 > 1827;
          expect({ form, file, row }, JSON.stringify({ targetType, startDate, endDate })).toEqual({ form, file: form, row: tooLong ? true : form });
        });
      }
    }
  }
});

// ---------- services on fake-indexeddb ----------
describe('M11 QC: entry dates and goal edits through the real services', () => {
  let db: AppDatabase;
  let goals: GoalService;
  let entries: EntryService;
  beforeEach(async () => {
    db = createTestDatabase();
    await openDatabase(db);
    const goalRepo = new DexieGoalRepository(db);
    const entryRepo = new DexieEntryRepository(db);
    goals = new GoalService(goalRepo, entryRepo);
    entries = new EntryService(entryRepo, goalRepo);
  });
  afterEach(async () => {
    await db.delete();
  });

  it('O1: add on start day ok, day before start refused, today ok, tomorrow refused; 2031 clock still accepts', async () => {
    const { goals: gs } = datasetO1();
    await db.goals.put({ ...gs[0]!, dirty: 0 } as never);
    const ok = (date: string, now = FIXED_NOW) => entries.add({ goalId: 'o1', date, minutes: 10, note: '', source: 'manual' } as never, now);
    expect((await ok('2026-10-01')).ok).toBe(true);
    const before = await ok('2026-09-30');
    expect(before.ok).toBe(false);
    if (!before.ok) {
      expect(before.errors[0]!.code).toBe('DATE_OUTSIDE_GOAL_PERIOD');
      expect(errorMessage(before.errors[0]!, { dateShort: (d: string) => d, date: (d: string) => d, number: (n: number) => String(n), count: (_k: string, n: number) => String(n) } as never).key).toBe('errors.DATE_OUTSIDE_GOAL_PERIOD_openEnded');
    }
    expect((await ok('2026-10-09')).ok).toBe(true);
    const tomorrow = await ok('2026-10-10');
    expect(tomorrow.ok).toBe(false);
    if (!tomorrow.ok) expect(tomorrow.errors[0]!.code).toBe('DATE_IN_FUTURE');
    expect((await ok('2031-10-02', new Date('2031-10-02T10:00:00+07:00'))).ok).toBe(true);
  });

  it('create open-ended -> raw row has endDate null (not undefined / not a string); update to finite below an entry is refused; update back to null ok', async () => {
    const created = await goals.create({ name: 'Open', why: '', targetType: 'daily', targetValue: 10, startDate: '2026-10-01', endDate: null }, FIXED_NOW);
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const raw = (await db.goals.get(created.value.id)) as unknown as Record<string, unknown>;
    expect('endDate' in raw).toBe(true);
    expect(raw.endDate).toBeNull();
    await db.entries.put({ ...buildEntry({ id: 'x1', goalId: created.value.id, date: '2026-10-05', minutes: 10 }), dirty: 0 } as never);
    const refuse = await goals.update(created.value.id, { name: 'Open', why: '', targetType: 'daily', targetValue: 10, startDate: '2026-10-01', endDate: '2026-10-04' }, FIXED_NOW);
    expect(refuse.ok).toBe(false);
    expect(((await db.goals.get(created.value.id)) as unknown as Record<string, unknown>).endDate).toBeNull();
    const fin = await goals.update(created.value.id, { name: 'Open', why: '', targetType: 'daily', targetValue: 10, startDate: '2026-10-01', endDate: '2026-10-05' }, FIXED_NOW);
    expect(fin.ok).toBe(true);
    const open = await goals.update(created.value.id, { name: 'Open', why: '', targetType: 'daily', targetValue: 10, startDate: '2026-10-01', endDate: null }, FIXED_NOW);
    expect(open.ok).toBe(true);
    // moving the start after an entry is refused for an open-ended goal too
    const later = await goals.update(created.value.id, { name: 'Open', why: '', targetType: 'daily', targetValue: 10, startDate: '2026-10-06', endDate: null }, FIXED_NOW);
    expect(later.ok).toBe(false);
  });
});

// ---------- migration file audit ----------
describe('M11 QC: migration 20261019000000_goal_open_ended.sql', () => {
  const sql = readFileSync(new URL('../../supabase/migrations/20261019000000_goal_open_ended.sql', import.meta.url), 'utf8');
  const code = sql.split('\n').map((l) => l.replace(/--.*$/, '')).join('\n').toLowerCase();
  it('does only what the plan allows: no grant/revoke/anon/policy/trigger/rls/delete/truncate/drop table/drop column/update/insert', () => {
    for (const bad of [/\bgrant\b/, /\brevoke\b/, /\banon\b/, /\bpolicy\b/, /\btrigger\b/, /row level security/, /\bdelete\b/, /\btruncate\b/, /drop table/, /drop column/, /\bupdate\b/, /\binsert\b/, /security definer/, /\bcreate (or replace )?function\b/, /service_role/]) {
      expect(code, String(bad)).not.toMatch(bad);
    }
  });
  it('touches only public.goals and every statement is one of: alter column drop not null, drop constraint [if exists], add constraint check, the do-block', () => {
    const statements = code.replace(/do \$\$[\s\S]*?end \$\$/, () => 'do $$ declare block end $$').split(';').map((s) => s.replace(/\s+/g, ' ').trim()).filter(Boolean);
    for (const st of statements) {
      expect(st, st).toMatch(/^(alter table public\.goals (alter column end_date drop not null|drop constraint if exists goals_(period|open_ended_daily)_check|add constraint goals_(period|open_ended_daily)_check check \(.+\))|do \$\$ declare .+ end \$\$)$/);
    }
    expect(statements.length).toBe(6);
  });
  it('the do-block only drops check constraints of public.goals whose definition has end_date >= start_date, via format %I (no string concatenation)', () => {
    expect(code).toMatch(/format\('alter table public\.goals drop constraint %i', c\.conname\)/);
    expect(code).toMatch(/conrelid = 'public\.goals'::regclass and contype = 'c'/);
  });
  it('the M6 migration file is untouched (sha256 of the file as committed at 2a632ca)', async () => {
    const { createHash } = await import('node:crypto');
    const m6 = readFileSync(new URL('../../supabase/migrations/20261012000000_cloud_sync.sql', import.meta.url));
    const h = createHash('sha256').update(m6.toString('utf8').replace(/\r\n/g, '\n')).digest('hex');
    // value computed by QC from `git show 2a632ca:supabase/migrations/20261012000000_cloud_sync.sql` (LF endings)
    expect(h).toBe(M6_SHA256_LF);
  });
});

const M6_SHA256_LF = '68927c4ce41abc28ddb36fa33080dbd3e7b7b4e03034315fc01c51e5afdb40c8';
