import { DAY_MINUTES_LIMIT, ENTRY_MINUTES_MAX, ENTRY_MINUTES_MIN, ENTRY_NOTE_MAX } from '../config/constants';
import { isIntInRange, isWithinGoal } from './goal';
import { charLength } from './text';
import { fail, ok, type DomainError, type Goal, type ISODate, type LogEntry, type Result } from './types';

export interface EntryFieldsInput {
  minutes: number;
  note: string;
}

export interface EntryFields {
  minutes: number;
  note: string;
}

/** Validate minutes and note (FR-07). Plain checks (v3.1, ADR-27): integer 1–1440, trimmed note ≤ 280. */
export function validateEntryFields(input: EntryFieldsInput): Result<EntryFields> {
  const errors: DomainError[] = [];
  const minutesOk = isIntInRange(input.minutes, ENTRY_MINUTES_MIN, ENTRY_MINUTES_MAX);
  if (!minutesOk) errors.push({ code: 'ENTRY_MINUTES_INVALID', field: 'minutes', message: 'minutes must be an integer 1–1440' });
  const note = typeof input.note === 'string' ? input.note.trim() : '';
  const noteOk = charLength(note) <= ENTRY_NOTE_MAX; // code points, like the importer/cloud (M10-D1)
  if (!noteOk) errors.push({ code: 'ENTRY_NOTE_TOO_LONG', field: 'note', message: `note longer than ${ENTRY_NOTE_MAX}` });
  if (errors.length > 0) return fail(errors);
  return ok({ minutes: minutesOk ? input.minutes : 0, note: noteOk ? note : '' });
}

/**
 * Date rules: not in the future, inside the goal period (FR-07, FR-17). v4.0: for an open-ended goal
 * the period is `startDate → today`; the error then carries `params.end = null` (the UI picks the
 * sentence without an end date, DESIGN §7.3).
 */
export function validateEntryDate(date: ISODate, goal: Pick<Goal, 'startDate' | 'endDate'>, today: ISODate): DomainError | null {
  if (date > today) return { code: 'DATE_IN_FUTURE', field: 'date', message: `date ${date} is after today ${today}` };
  if (!isWithinGoal(date, goal)) {
    return {
      code: 'DATE_OUTSIDE_GOAL_PERIOD',
      field: 'date',
      message: `date ${date} outside ${goal.startDate}–${goal.endDate ?? 'open'}`,
      params: { start: goal.startDate, end: goal.endDate },
    };
  }
  return null;
}

/** A goal may have at most 1440 minutes per day (ADR-04). */
export function checkDayLimit(existingMinutes: number, adding: number): DomainError | null {
  if (existingMinutes + adding > DAY_MINUTES_LIMIT) {
    const remaining = Math.max(0, DAY_MINUTES_LIMIT - existingMinutes);
    return {
      code: 'ENTRY_DAY_LIMIT_EXCEEDED',
      field: 'minutes',
      message: `day limit exceeded: ${existingMinutes} + ${adding} > ${DAY_MINUTES_LIMIT}`,
      params: { remaining },
    };
  }
  return null;
}

export function sumMinutes(entries: readonly Pick<LogEntry, 'minutes'>[]): number {
  return entries.reduce((acc, e) => acc + e.minutes, 0);
}

export function minutesByGoal(entries: readonly Pick<LogEntry, 'goalId' | 'minutes'>[]): Map<string, number> {
  const map = new Map<string, number>();
  for (const e of entries) map.set(e.goalId, (map.get(e.goalId) ?? 0) + e.minutes);
  return map;
}
