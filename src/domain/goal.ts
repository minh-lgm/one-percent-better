import { z } from 'zod';
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

const nameSchema = z.string().trim().min(1).max(GOAL_NAME_MAX);
const whySchema = z.string().trim().max(GOAL_WHY_MAX);
const dailySchema = z.number().int().min(DAILY_MINUTES_MIN).max(DAILY_MINUTES_MAX);
const totalHoursSchema = z.number().int().min(TOTAL_HOURS_MIN).max(TOTAL_HOURS_MAX);

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

  const name = nameSchema.safeParse(input.name ?? '');
  if (!name.success) {
    const issue = name.error.issues[0];
    errors.push(
      issue?.code === 'too_big'
        ? { code: 'GOAL_NAME_TOO_LONG', field: 'name', message: `name longer than ${GOAL_NAME_MAX}` }
        : { code: 'GOAL_NAME_REQUIRED', field: 'name', message: 'name is required' },
    );
  }

  const why = whySchema.safeParse(input.why ?? '');
  if (!why.success) {
    errors.push({ code: 'GOAL_WHY_TOO_LONG', field: 'why', message: `why longer than ${GOAL_WHY_MAX}` });
  }

  let targetMinutes = 0;
  let targetOk = false;
  if (input.targetType === 'daily') {
    const r = dailySchema.safeParse(input.targetValue);
    if (r.success) {
      targetMinutes = r.data;
      targetOk = true;
    } else {
      errors.push({ code: 'GOAL_TARGET_INVALID', field: 'target', message: 'daily minutes out of range', params: { variant: 'daily' } });
    }
  } else {
    const r = totalHoursSchema.safeParse(input.targetValue);
    if (r.success) {
      targetMinutes = r.data * 60;
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
    name: name.success ? name.data : '',
    why: why.success ? why.data : '',
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
