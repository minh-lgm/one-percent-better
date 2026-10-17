import {
  DAILY_MINUTES_MAX,
  DAILY_MINUTES_MIN,
  GOAL_NAME_MAX,
  GOAL_WHY_MAX,
  PERIOD_DAYS_MAX,
  TOTAL_HOURS_MAX,
  TOTAL_HOURS_MIN,
} from '../config/constants';
import { daysInclusive, isValidISODate, isWithin } from './dates';
import { charLength } from './text';
import { fail, ok, type DomainError, type Goal, type GoalStatus, type ISODate, type Result, type TargetType } from './types';

/** Raw form input (numbers may be NaN when the field is empty or not numeric). */
export interface GoalInput {
  name: string;
  why: string;
  targetType: TargetType;
  /** daily: minutes per day; total: hours in the period. */
  targetValue: number;
  startDate: string;
  endDate: string;
}

export interface GoalFields {
  name: string;
  why: string;
  targetType: TargetType;
  targetMinutes: number;
  startDate: ISODate;
  endDate: ISODate;
}

/** Integer in `[min, max]` (v3.1, ADR-27: plain check, no zod on the cold-load path). `NaN`/non-number → `false`. */
export function isIntInRange(value: unknown, min: number, max: number): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= min && value <= max;
}

/** `string | undefined` → trimmed text (non-strings count as empty, as the old schema did). */
function trimmed(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

export function periodDays(goal: Pick<Goal, 'startDate' | 'endDate'>): number {
  return daysInclusive(goal.startDate, goal.endDate);
}

export function dailyTarget(goal: Pick<Goal, 'targetType' | 'targetMinutes' | 'startDate' | 'endDate'>): number {
  return goal.targetType === 'daily' ? goal.targetMinutes : Math.ceil(goal.targetMinutes / periodDays(goal));
}

export function totalTarget(goal: Pick<Goal, 'targetType' | 'targetMinutes' | 'startDate' | 'endDate'>): number {
  return goal.targetType === 'daily' ? goal.targetMinutes * periodDays(goal) : goal.targetMinutes;
}

export function goalStatus(goal: Pick<Goal, 'archived' | 'startDate' | 'endDate'>, today: ISODate): GoalStatus {
  if (goal.archived) return 'archived';
  if (today < goal.startDate) return 'upcoming';
  if (today > goal.endDate) return 'ended';
  return 'active';
}

/** Validate goal input (FR-01, FR-02). Errors carry `field` and, where needed, `params.variant`. */
export function validateGoalInput(input: GoalInput): Result<GoalFields> {
  const errors: DomainError[] = [];

  // Limits count characters (code points), like the importer, the cloud mapper and SQL `char_length` (M10-D1).
  const name = trimmed(input.name);
  const nameLength = charLength(name);
  const nameOk = nameLength >= 1 && nameLength <= GOAL_NAME_MAX;
  if (!nameOk) {
    errors.push(
      nameLength > GOAL_NAME_MAX
        ? { code: 'GOAL_NAME_TOO_LONG', field: 'name', message: `name longer than ${GOAL_NAME_MAX}` }
        : { code: 'GOAL_NAME_REQUIRED', field: 'name', message: 'name is required' },
    );
  }

  const why = trimmed(input.why);
  const whyOk = charLength(why) <= GOAL_WHY_MAX;
  if (!whyOk) {
    errors.push({ code: 'GOAL_WHY_TOO_LONG', field: 'why', message: `why longer than ${GOAL_WHY_MAX}` });
  }

  let targetMinutes = 0;
  let targetOk = false;
  if (input.targetType === 'daily') {
    if (isIntInRange(input.targetValue, DAILY_MINUTES_MIN, DAILY_MINUTES_MAX)) {
      targetMinutes = input.targetValue;
      targetOk = true;
    } else {
      errors.push({ code: 'GOAL_TARGET_INVALID', field: 'target', message: 'daily minutes out of range', params: { variant: 'daily' } });
    }
  } else {
    if (isIntInRange(input.targetValue, TOTAL_HOURS_MIN, TOTAL_HOURS_MAX)) {
      targetMinutes = input.targetValue * 60;
      targetOk = true;
    } else {
      errors.push({ code: 'GOAL_TARGET_INVALID', field: 'target', message: 'total hours out of range', params: { variant: 'total' } });
    }
  }

  const startValid = isValidISODate(input.startDate);
  const endValid = isValidISODate(input.endDate);
  if (!startValid) errors.push({ code: 'GOAL_PERIOD_INVALID', field: 'startDate', message: 'invalid start date' });
  if (!endValid) errors.push({ code: 'GOAL_PERIOD_INVALID', field: 'endDate', message: 'invalid end date' });

  let periodOk = false;
  if (startValid && endValid) {
    if (input.endDate < input.startDate) {
      errors.push({ code: 'GOAL_PERIOD_INVALID', field: 'endDate', message: 'end before start', params: { variant: 'endBeforeStart' } });
    } else if (daysInclusive(input.startDate, input.endDate) > PERIOD_DAYS_MAX) {
      errors.push({ code: 'GOAL_PERIOD_INVALID', field: 'endDate', message: `period longer than ${PERIOD_DAYS_MAX} days`, params: { variant: 'tooLong' } });
    } else {
      periodOk = true;
    }
  }

  if (targetOk && periodOk && input.targetType === 'total') {
    const daily = dailyTarget({ targetType: 'total', targetMinutes, startDate: input.startDate, endDate: input.endDate });
    if (daily > DAILY_MINUTES_MAX) {
      errors.push({ code: 'GOAL_TARGET_INVALID', field: 'target', message: 'derived daily target above 1440', params: { variant: 'tooMuch' } });
    }
  }

  if (errors.length > 0) return fail(errors);
  return ok({
    name: nameOk ? name : '',
    why: whyOk ? why : '',
    targetType: input.targetType,
    targetMinutes,
    startDate: input.startDate,
    endDate: input.endDate,
  });
}

/** Dates of entries that would fall outside a new period (FR-03). */
export function entriesOutsidePeriod(entryDates: readonly ISODate[], startDate: ISODate, endDate: ISODate): ISODate[] {
  return entryDates.filter((d) => !isWithin(d, startDate, endDate));
}

export interface GroupedGoals {
  active: Goal[];
  upcoming: Goal[];
  ended: Goal[];
  archived: Goal[];
}

/** Group and sort goals for the Goals screen (DESIGN S2). */
export function groupGoals(goals: readonly Goal[], today: ISODate): GroupedGoals {
  const groups: GroupedGoals = { active: [], upcoming: [], ended: [], archived: [] };
  for (const g of goals) groups[goalStatus(g, today)].push(g);
  groups.active.sort(byCreatedAt);
  groups.upcoming.sort((a, b) => a.startDate.localeCompare(b.startDate) || byId(a, b));
  groups.ended.sort((a, b) => b.endDate.localeCompare(a.endDate) || byId(a, b));
  groups.archived.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt) || byId(a, b));
  return groups;
}

/** Stable tie-break for every goal/entry ordering: id ascending (M1-P1, M5-AC13). */
export function byId(a: { id: string }, b: { id: string }): number {
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

/** `createdAt` ascending, then id (Today cards, entries of a day). */
export function byCreatedAt(a: { id: string; createdAt: string }, b: { id: string; createdAt: string }): number {
  return a.createdAt.localeCompare(b.createdAt) || byId(a, b);
}

/** Goals shown on Today: active and not archived, by createdAt ascending (then id). */
export function activeGoals(goals: readonly Goal[], today: ISODate): Goal[] {
  return goals.filter((g) => goalStatus(g, today) === 'active').sort(byCreatedAt);
}
