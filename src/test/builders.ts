import type { Goal, LogEntry } from '../domain/types';
import { addDays } from '../domain/dates';

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
