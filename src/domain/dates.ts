import { addDays as dfAddDays, differenceInCalendarDays, format, isValid, parse } from 'date-fns';
import type { ISODate } from './types';

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const ISO_FORMAT = 'yyyy-MM-dd';

/** Local calendar date of a Date as `YYYY-MM-DD` (ADR-05). */
export function toISODate(date: Date): ISODate {
  return format(date, ISO_FORMAT);
}

/** Parse `YYYY-MM-DD` to a local Date, or `null` when the string is not a real date. */
export function parseISODate(value: string): Date | null {
  if (typeof value !== 'string' || !ISO_DATE_RE.test(value)) return null;
  const parsed = parse(value, ISO_FORMAT, new Date(2000, 0, 1));
  if (!isValid(parsed)) return null;
  // Reject overflow such as 2026-02-30 (date-fns parse is strict, but keep the round-trip check).
  return format(parsed, ISO_FORMAT) === value ? parsed : null;
}

export function isValidISODate(value: string): value is ISODate {
  return parseISODate(value) !== null;
}

export function addDays(date: ISODate, days: number): ISODate {
  const d = parseISODate(date);
  if (!d) throw new RangeError(`Invalid ISO date: ${date}`);
  return toISODate(dfAddDays(d, days));
}

/** Number of calendar days from `start` to `end`, counting both ends. */
export function daysInclusive(start: ISODate, end: ISODate): number {
  const s = parseISODate(start);
  const e = parseISODate(end);
  if (!s || !e) throw new RangeError(`Invalid ISO date range: ${start} – ${end}`);
  return differenceInCalendarDays(e, s) + 1;
}

/** Compare two ISO dates (string order equals chronological order for this format). */
export function compareISODate(a: ISODate, b: ISODate): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

export function isWithin(date: ISODate, start: ISODate, end: ISODate): boolean {
  return date >= start && date <= end;
}

/** `YYYY-12-31` of the year of `date`. */
export function endOfYearOf(date: ISODate): ISODate {
  return `${date.slice(0, 4)}-12-31`;
}

export function yearOf(date: ISODate): number {
  return Number(date.slice(0, 4));
}
