// Reminder rules (FR-13 … FR-15; ARCHITECTURE §5.6). Pure: returns booleans and
// structured data only; the ReminderService / UI turn the data into text (ADR-13).
import { toISODate } from './dates';
import type { ISODate, Settings } from './types';

export type NotificationPermissionState = 'default' | 'granted' | 'denied' | 'unsupported';

/** Today's progress of one active goal. */
export interface GoalProgress {
  id: string;
  name: string;
  current: number;
  target: number;
}

export interface ReminderData {
  /** Number of active goals not on target. */
  count: number;
  /** First `REMINDER_MAX_ITEMS` goals not on target, in Today order. */
  items: GoalProgress[];
  /** How many more goals are not on target beyond `items`. */
  more: number;
}

export const REMINDER_MAX_ITEMS = 3;
export const DEFAULT_REMINDER_TIME = '20:00';

const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;

export function isValidReminderTime(value: unknown): value is string {
  return typeof value === 'string' && TIME_RE.test(value);
}

/** Minutes since midnight of an `HH:MM` string, or `null` when malformed. */
export function reminderTimeToMinutes(value: string): number | null {
  const m = TIME_RE.exec(value);
  if (!m) return null;
  return Number(m[1]) * 60 + Number(m[2]);
}

/** `hh:mm(now) >= reminderTime` in local time. Malformed times never match. */
export function isPastReminderTime(now: Date, reminderTime: string): boolean {
  const target = reminderTimeToMinutes(reminderTime);
  if (target === null) return false;
  return now.getHours() * 60 + now.getMinutes() >= target;
}

export function goalsNotOnTarget(progress: readonly GoalProgress[]): GoalProgress[] {
  return progress.filter((g) => g.current < g.target);
}

export function reminderData(progress: readonly GoalProgress[]): ReminderData {
  const pending = goalsNotOnTarget(progress);
  return { count: pending.length, items: pending.slice(0, REMINDER_MAX_ITEMS), more: Math.max(0, pending.length - REMINDER_MAX_ITEMS) };
}

/** Banner rule (FR-15): reminder on, past the time, at least one goal pending. No permission, no daily cap. */
export function shouldShowBanner(now: Date, settings: Pick<Settings, 'reminderEnabled' | 'reminderTime'>, progress: readonly GoalProgress[]): boolean {
  return settings.reminderEnabled && isPastReminderTime(now, settings.reminderTime) && goalsNotOnTarget(progress).length > 0;
}

/** Notification rule (FR-14): banner rule + permission granted + not yet sent today. */
export function shouldNotify(
  now: Date,
  settings: Pick<Settings, 'reminderEnabled' | 'reminderTime' | 'lastReminderDate'>,
  permission: NotificationPermissionState,
  progress: readonly GoalProgress[],
): boolean {
  const today: ISODate = toISODate(now);
  return permission === 'granted' && settings.lastReminderDate !== today && shouldShowBanner(now, settings, progress);
}
