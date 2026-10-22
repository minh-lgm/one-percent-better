// M15-AC1: `planReminderDates` (ARCH §5.6 v5.0, ADR-40) on dataset S1 / O1, local time Asia/Ho_Chi_Minh (setup.ts).
import { describe, expect, it } from 'vitest';
import { REMINDER_PLAN_DAYS } from '../config/constants';
import { buildGoal, datasetO1, datasetS1 } from '../test/builders';
import { addDays } from './dates';
import type { GoalProgress } from './reminder';
import { planReminderDates, reminderDateTime } from './reminder-plan';
import type { Goal } from './types';

const at = (time: string, date = '2026-10-09') => new Date(`${date}T${time}+07:00`);
const range = (from: string, days: number) => Array.from({ length: days }, (_, i) => addDays(from, i));
const s1 = () => datasetS1().goals;
/** Today's progress of S1's active goals (Read 30, Guitar 20, Spanish 17 min/day), nothing logged. */
const pending = (): GoalProgress[] => [
  { id: 'g1', name: 'Read', current: 0, target: 30 },
  { id: 'g2', name: 'Guitar', current: 0, target: 20 },
  { id: 'g3', name: 'Spanish', current: 0, target: 17 },
];
const reached = (): GoalProgress[] => pending().map((p) => ({ ...p, current: p.target }));

function plan(goals: readonly Goal[], now: Date, todayProgress: GoalProgress[] = pending(), extra: { reminderEnabled?: boolean; reminderTime?: string; days?: number } = {}) {
  return planReminderDates({ now, reminderEnabled: extra.reminderEnabled ?? true, reminderTime: extra.reminderTime ?? '20:00', goals, todayProgress, days: extra.days });
}

describe('planReminderDates (M15-AC1)', () => {
  it('S1 at 10:00 with three active goals not yet on target → 14 days from today', () => {
    expect(plan(s1(), at('10:00:00'))).toEqual(range('2026-10-09', 14));
    expect(REMINDER_PLAN_DAYS).toBe(14);
  });

  it('exactly at the reminder time (20:00:00) today is still planned; one minute later it is dropped (13 days)', () => {
    expect(plan(s1(), at('20:00:00'))).toEqual(range('2026-10-09', 14));
    expect(plan(s1(), at('20:00:59'))).toEqual(range('2026-10-09', 14));
    expect(plan(s1(), at('20:01:00'))).toEqual(range('2026-10-10', 13));
  });

  it('every active goal already on target today → the plan starts tomorrow', () => {
    expect(plan(s1(), at('10:00:00'), reached())).toEqual(range('2026-10-10', 13));
    // One goal short of its target keeps today.
    const partial = reached();
    partial[1] = { ...partial[1], current: 19 };
    expect(plan(s1(), at('10:00:00'), partial)[0]).toBe('2026-10-09');
    // A goal with no progress item counts as not reached.
    expect(plan(s1(), at('10:00:00'), reached().slice(1))[0]).toBe('2026-10-09');
  });

  it('reminders off → nothing; malformed time → nothing', () => {
    expect(plan(s1(), at('10:00:00'), pending(), { reminderEnabled: false })).toEqual([]);
    expect(plan(s1(), at('10:00:00'), pending(), { reminderTime: '8pm' })).toEqual([]);
  });

  it('only an ended goal (G5) and an archived goal → nothing', () => {
    const goals = [s1()[4], buildGoal({ id: 'ga', name: 'Archived', archived: true, startDate: '2026-10-01', endDate: '2026-12-31' })];
    expect(plan(goals, at('10:00:00'), [])).toEqual([]);
  });

  it('only the upcoming goal G4 (from 2026-11-01): nothing inside the window from 10-09; from 10-25 → 11-01 … 11-07', () => {
    const g4 = [s1()[3]];
    expect(plan(g4, at('10:00:00'), [])).toEqual([]);
    expect(plan(g4, at('10:00:00', '2026-10-25'), [])).toEqual(range('2026-11-01', 7));
  });

  it('a daily goal ending 2026-10-15 as the only goal → 10-09 … 10-15', () => {
    const short = [buildGoal({ id: 'gs', name: 'Short', targetMinutes: 10, startDate: '2026-10-01', endDate: '2026-10-15' })];
    expect(plan(short, at('10:00:00'), [{ id: 'gs', name: 'Short', current: 0, target: 10 }])).toEqual(range('2026-10-09', 7));
  });

  it('O1 (no end date) as the only goal → the full 14 days', () => {
    expect(plan(datasetO1().goals, at('10:00:00'), [{ id: 'o1', name: 'Meditate', current: 0, target: 10 }])).toEqual(range('2026-10-09', 14));
  });

  it('an archived goal is ignored when deciding "every goal reached today"', () => {
    const goals = s1().map((g) => (g.id === 'g1' ? { ...g, archived: true } : g));
    const progress = reached().filter((p) => p.id !== 'g1');
    expect(plan(goals, at('10:00:00'), progress)[0]).toBe('2026-10-10');
    // … and G1 not on target does not bring today back while archived.
    expect(plan(goals, at('10:00:00'), [...progress, { id: 'g1', name: 'Read', current: 0, target: 30 }])[0]).toBe('2026-10-10');
  });

  it('days without any active goal inside the window are skipped (gap between two goals)', () => {
    const goals = [
      buildGoal({ id: 'a', name: 'A', startDate: '2026-10-01', endDate: '2026-10-10' }),
      buildGoal({ id: 'b', name: 'B', startDate: '2026-10-15', endDate: '2026-12-31' }),
    ];
    expect(plan(goals, at('10:00:00'), [{ id: 'a', name: 'A', current: 0, target: 30 }])).toEqual(['2026-10-09', '2026-10-10', ...range('2026-10-15', 8)]);
  });

  it('the window length is configurable and the result is ascending without duplicates', () => {
    const out = plan(s1(), at('10:00:00'), pending(), { days: 3 });
    expect(out).toEqual(['2026-10-09', '2026-10-10', '2026-10-11']);
    const full = plan(s1(), at('10:00:00'));
    expect([...full].sort()).toEqual(full);
    expect(new Set(full).size).toBe(full.length);
  });
});

describe('reminderDateTime', () => {
  it('builds the local wall-clock Date of a day at HH:MM', () => {
    const d = reminderDateTime('2026-10-09', '20:00');
    expect([d.getFullYear(), d.getMonth(), d.getDate(), d.getHours(), d.getMinutes(), d.getSeconds()]).toEqual([2026, 9, 9, 20, 0, 0]);
    expect(d.getTime()).toBe(at('20:00:00').getTime());
    const e = reminderDateTime('2026-11-01', '07:05');
    expect([e.getMonth(), e.getDate(), e.getHours(), e.getMinutes()]).toEqual([10, 1, 7, 5]);
  });
});
