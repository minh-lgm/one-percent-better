// iCalendar file for the daily reminder (FR-16; ARCHITECTURE §5.7, RFC 5545).
// Pure string building; the caller supplies translated SUMMARY/DESCRIPTION,
// the UID and the DTSTAMP so the output is deterministic in tests.
import { addDays } from './dates';
import type { ISODate } from './types';

export const ICS_FILE_NAME = '1percent-better-reminder.ics';
export const ICS_PRODID = '-//1% Better//EN';
/** MIME type of the generated file (v5.0: lives in the domain so the UI needs no integration import). */
export const ICS_MIME_TYPE = 'text/calendar;charset=utf-8';
const CRLF = '\r\n';
const MAX_LINE_OCTETS = 75;

export interface ReminderIcsInput {
  /** `HH:MM` local reminder time. */
  reminderTime: string;
  /** Today (local); DTSTART is tomorrow at `reminderTime`. */
  today: ISODate;
  /** Translated `ics.summary`. */
  summary: string;
  /** Translated `ics.alarm`. */
  alarmDescription: string;
  uid: string;
  /** Current instant for DTSTAMP (UTC). */
  now: Date;
}

/** Escape a TEXT value (RFC 5545 §3.3.11): `\`, `;`, `,` and line breaks. */
export function escapeIcsText(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r\n|\r|\n/g, '\\n');
}

const encoder = new TextEncoder();
const decoder = new TextDecoder();

/**
 * Fold a content line to at most 75 octets per physical line (RFC 5545 §3.1),
 * never splitting inside a UTF-8 sequence. Continuation lines start with a space.
 */
export function foldIcsLine(line: string): string[] {
  const bytes = encoder.encode(line);
  if (bytes.length <= MAX_LINE_OCTETS) return [line];
  const out: string[] = [];
  let start = 0;
  let first = true;
  while (start < bytes.length) {
    const budget = first ? MAX_LINE_OCTETS : MAX_LINE_OCTETS - 1; // continuation lines carry a leading space
    let end = Math.min(start + budget, bytes.length);
    // Step back to a UTF-8 character boundary (continuation bytes are 10xxxxxx).
    while (end < bytes.length && end > start && (bytes[end] & 0xc0) === 0x80) end--;
    const chunk = decoder.decode(bytes.subarray(start, end));
    out.push(first ? chunk : ` ${chunk}`);
    start = end;
    first = false;
  }
  return out;
}

function dtstampUtc(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getUTCFullYear()}${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}T${p(d.getUTCHours())}${p(d.getUTCMinutes())}${p(d.getUTCSeconds())}Z`;
}

/** Floating local date-time `YYYYMMDDTHHMMSS` (no `Z`). */
function floatingDateTime(date: ISODate, reminderTime: string): string {
  const [hh, mm] = reminderTime.split(':');
  return `${date.replace(/-/g, '')}T${hh}${mm}00`;
}

/** Build the calendar text. Every line ends with CRLF; long lines are folded. */
export function buildReminderIcs(input: ReminderIcsInput): string {
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    `PRODID:${ICS_PRODID}`,
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${escapeIcsText(input.uid)}`,
    `DTSTAMP:${dtstampUtc(input.now)}`,
    `DTSTART:${floatingDateTime(addDays(input.today, 1), input.reminderTime)}`,
    'DURATION:PT15M',
    'RRULE:FREQ=DAILY',
    `SUMMARY:${escapeIcsText(input.summary)}`,
    'BEGIN:VALARM',
    'TRIGGER:PT0M',
    'ACTION:DISPLAY',
    `DESCRIPTION:${escapeIcsText(input.alarmDescription)}`,
    'END:VALARM',
    'END:VEVENT',
    'END:VCALENDAR',
  ];
  return lines.flatMap(foldIcsLine).join(CRLF) + CRLF;
}
