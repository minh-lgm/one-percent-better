// Reminder plan for the native app (v5.0, M15; FR-62, A-63, ADR-40; ARCHITECTURE §5.6 v5.0). Pure: which local
// dates get a scheduled notification in the window [today, today + days − 1]. The service turns the dates into
// notifications (time, text); the OS delivers them while the app is closed.
import { REMINDER_PLAN_DAYS } from '../config/constants';
import { addDays, toISODate } from './dates';
import { goalStatus } from './goal';
import { reminderTimeToMinutes, type GoalProgress } from './reminder';
import type { Goal, ISODate } from './types';

export interface ReminderPlanInput {
  now: Date;
  reminderEnabled: boolean;
  /** `HH:MM` local time. A malformed time plans nothing. */
  reminderTime: string;
  goals: readonly Goal[];
  /** Today's progress of the active goals (`ReminderService.progress(now)`); a goal without an item counts as 0 min. */
  todayProgress: readonly GoalProgress[];
  /** Window length in days (default `REMINDER_PLAN_DAYS`). */
  days?: number;
}

/** Some goal is active (not archived, within its period) on `date`. */
function hasActiveGoal(goals: readonly Goal[], date: ISODate): boolean {
  return goals.some((g) => goalStatus(g, date) === 'active');
}

/** Every goal active today has reached its daily target (an empty list counts as "nothing to remind" too). */
function allActiveGoalsReached(goals: readonly Goal[], today: ISODate, progress: readonly GoalProgress[]): boolean {
  const byId = new Map(progress.map((p) => [p.id, p]));
  return goals
    .filter((g) => goalStatus(g, today) === 'active')
    .every((g) => {
      const p = byId.get(g.id);
      return p !== undefined && p.current >= p.target;
    });
}

/**
 * Dates to schedule, ascending. Rules (ARCH §5.6 v5.0): nothing when reminders are off; a day is skipped when no
 * unarchived goal is active on it; today is skipped when its reminder instant is already in the past (M15-D2: the
 * plugin delivers a past `at` immediately, so `20:00:30` with a 20:00 reminder must not re-fire on every replan;
 * exactly 20:00:00 still keeps today) or when every active goal has already met its target today.
 */
export function planReminderDates({ now, reminderEnabled, reminderTime, goals, todayProgress, days = REMINDER_PLAN_DAYS }: ReminderPlanInput): ISODate[] {
  if (!reminderEnabled) return [];
  const target = reminderTimeToMinutes(reminderTime);
  if (target === null) return [];
  const today = toISODate(now);
  const todayAt = reminderDateTime(today, reminderTime).getTime();
  const out: ISODate[] = [];
  for (let i = 0; i < days; i += 1) {
    const date = addDays(today, i);
    if (!hasActiveGoal(goals, date)) continue;
    if (i === 0 && (todayAt < now.getTime() || allActiveGoalsReached(goals, today, todayProgress))) continue;
    out.push(date);
  }
  return out;
}

/** The local `Date` of `date` at `HH:MM` (the OS fires the notification at that wall-clock time, A-63). */
export function reminderDateTime(date: ISODate, reminderTime: string): Date {
  const [y, m, d] = date.split('-').map(Number);
  const minutes = reminderTimeToMinutes(reminderTime) ?? 0;
  return new Date(y, m - 1, d, Math.floor(minutes / 60), minutes % 60, 0, 0);
}
