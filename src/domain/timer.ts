// Timer rules (FR-11, FR-12; ARCHITECTURE §4 "Timer"). Pure functions: the
// running timer is always derived from `now - startedAt`, never counted.
import { ENTRY_MINUTES_MAX, ENTRY_MINUTES_MIN } from '../config/constants';
import { toISODate } from './dates';
import type { ActiveTimer, ISODate, ISODateTime } from './types';

const MS_PER_MINUTE = 60_000;

/** Milliseconds elapsed since `startedAt` (never negative, e.g. after a clock change). */
export function elapsedMs(startedAt: ISODateTime, now: Date): number {
  const start = Date.parse(startedAt);
  if (Number.isNaN(start)) return 0;
  return Math.max(0, now.getTime() - start);
}

/**
 * Minutes pre-filled in the Stop dialog: rounded to the nearest minute
 * (30 s rounds up), clamped to 1–1440.
 */
export function roundedMinutes(ms: number): number {
  const rounded = Math.round(Math.max(0, ms) / MS_PER_MINUTE);
  return Math.min(ENTRY_MINUTES_MAX, Math.max(ENTRY_MINUTES_MIN, rounded));
}

/** Whole minutes and remaining seconds of an elapsed duration (for the "Rounded from" hint). */
export function splitMinSec(ms: number): { m: number; s: number } {
  const totalSeconds = Math.floor(Math.max(0, ms) / 1000);
  return { m: Math.floor(totalSeconds / 60), s: totalSeconds % 60 };
}

/** The local calendar day the timer was started on — the entry goes there (FR-12, ADR-05). */
export function timerDate(startedAt: ISODateTime): ISODate {
  return toISODate(new Date(startedAt));
}

export interface TimerPreview {
  goalId: string;
  startedAt: ISODateTime;
  date: ISODate;
  elapsedMs: number;
  minutes: number;
}

/** Everything the Stop dialog needs, computed from the stored timer and `now`. */
export function previewTimer(timer: ActiveTimer, now: Date): TimerPreview {
  const elapsed = elapsedMs(timer.startedAt, now);
  return { goalId: timer.goalId, startedAt: timer.startedAt, date: timerDate(timer.startedAt), elapsedMs: elapsed, minutes: roundedMinutes(elapsed) };
}

/** `HH:MM` (24 h, local time) of an ISO timestamp — same in every locale (FR-36). */
export function clockTime(iso: ISODateTime): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '--:--';
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}
