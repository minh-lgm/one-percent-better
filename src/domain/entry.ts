import { z } from 'zod';
import { DAY_MINUTES_LIMIT, ENTRY_MINUTES_MAX, ENTRY_MINUTES_MIN, ENTRY_NOTE_MAX } from '../config/constants';
import { isWithin } from './dates';
import { fail, ok, type DomainError, type Goal, type ISODate, type LogEntry, type Result } from './types';

export interface EntryFieldsInput {
  minutes: number;
  note: string;
}

export interface EntryFields {
  minutes: number;
  note: string;
}

const minutesSchema = z.number().int().min(ENTRY_MINUTES_MIN).max(ENTRY_MINUTES_MAX);
const noteSchema = z.string().trim().max(ENTRY_NOTE_MAX);

/** Validate minutes and note (FR-07). */
export function validateEntryFields(input: EntryFieldsInput): Result<EntryFields> {
  const errors: DomainError[] = [];
  const minutes = minutesSchema.safeParse(input.minutes);
  if (!minutes.success) errors.push({ code: 'ENTRY_MINUTES_INVALID', field: 'minutes', message: 'minutes must be an integer 1–1440' });
  const note = noteSchema.safeParse(input.note ?? '');
  if (!note.success) errors.push({ code: 'ENTRY_NOTE_TOO_LONG', field: 'note', message: `note longer than ${ENTRY_NOTE_MAX}` });
  if (errors.length > 0) return fail(errors);
  return ok({ minutes: minutes.success ? minutes.data : 0, note: note.success ? note.data : '' });
}

/** Date rules: not in the future, inside the goal period (FR-07, FR-17). */
export function validateEntryDate(date: ISODate, goal: Pick<Goal, 'startDate' | 'endDate'>, today: ISODate): DomainError | null {
  if (date > today) return { code: 'DATE_IN_FUTURE', field: 'date', message: `date ${date} is after today ${today}` };
  if (!isWithin(date, goal.startDate, goal.endDate)) {
    return {
      code: 'DATE_OUTSIDE_GOAL_PERIOD',
      field: 'date',
      message: `date ${date} outside ${goal.startDate}–${goal.endDate}`,
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
