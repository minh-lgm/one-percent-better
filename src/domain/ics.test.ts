import { describe, expect, it } from 'vitest';
import en from '../i18n/resources/en.json';
import vi from '../i18n/resources/vi.json';
import { buildReminderIcs, escapeIcsText, foldIcsLine, ICS_FILE_NAME, ICS_PRODID } from './ics';

const NOW = new Date('2026-10-09T10:00:00+07:00');
const base = { reminderTime: '20:00', today: '2026-10-09', uid: 'abc-123@one-percent-better', now: NOW };
const octets = (s: string) => new TextEncoder().encode(s).length;

/** Unfold (RFC 5545 §3.1) to read logical lines back. */
function unfold(text: string): string[] {
  return text.replace(/\r\n[ \t]/g, '').split('\r\n').filter(Boolean);
}

describe('buildReminderIcs (M2-AC11)', () => {
  const ics = buildReminderIcs({ ...base, summary: en.ics.summary, alarmDescription: en.ics.alarm });

  it('contains the required components and properties', () => {
    const lines = unfold(ics);
    expect(lines[0]).toBe('BEGIN:VCALENDAR');
    expect(lines).toContain('VERSION:2.0');
    expect(lines).toContain(`PRODID:${ICS_PRODID}`);
    expect(ICS_PRODID).toBe('-//1% Better//EN');
    expect(lines).toContain('UID:abc-123@one-percent-better');
    expect(lines).toContain('DTSTAMP:20261009T030000Z');
    expect(lines).toContain('DTSTART:20261010T200000');
    expect(lines.some((l) => l.startsWith('DTSTART:') && l.endsWith('Z'))).toBe(false);
    expect(lines).toContain('DURATION:PT15M');
    expect(lines).toContain('RRULE:FREQ=DAILY');
    expect(lines).toContain("SUMMARY:1% Better — log today's time");
    expect(lines).toContain('BEGIN:VALARM');
    expect(lines).toContain('TRIGGER:PT0M');
    expect(lines).toContain('ACTION:DISPLAY');
    expect(lines).toContain("DESCRIPTION:Log today's time in 1% Better.");
    expect(lines[lines.length - 1]).toBe('END:VCALENDAR');
  });

  it('ends every line with CRLF and uses no bare LF', () => {
    expect(ics.endsWith('\r\n')).toBe(true);
    expect(ics.replace(/\r\n/g, '')).not.toContain('\n');
    expect(ics.replace(/\r\n/g, '')).not.toContain('\r');
  });

  it('uses the configured reminder time and the day after today', () => {
    const custom = buildReminderIcs({ ...base, reminderTime: '07:30', today: '2026-12-31', summary: 'S', alarmDescription: 'A' });
    expect(unfold(custom)).toContain('DTSTART:20270101T073000');
  });

  it('file name is fixed', () => {
    expect(ICS_FILE_NAME).toBe('1percent-better-reminder.ics');
  });
});

describe('Vietnamese content (M2-AC13)', () => {
  const ics = buildReminderIcs({ ...base, summary: vi.ics.summary, alarmDescription: vi.ics.alarm });

  it('keeps UTF-8 diacritics in SUMMARY and DESCRIPTION', () => {
    const lines = unfold(ics);
    expect(lines).toContain(`SUMMARY:${vi.ics.summary}`);
    expect(lines).toContain(`DESCRIPTION:${vi.ics.alarm}`);
    expect(lines).toContain(`PRODID:${ICS_PRODID}`);
  });

  it('every physical line is ≤ 75 octets and ends with CRLF', () => {
    const physical = ics.split('\r\n');
    expect(physical[physical.length - 1]).toBe('');
    for (const line of physical) expect(octets(line)).toBeLessThanOrEqual(75);
  });
});

describe('escaping and folding (RFC 5545)', () => {
  it('escapes backslash, semicolon, comma and newlines', () => {
    expect(escapeIcsText('a;b,c\\d\ne')).toBe('a\\;b\\,c\\\\d\\ne');
    const ics = buildReminderIcs({ ...base, summary: 'Đọc; viết, học', alarmDescription: 'x' });
    expect(unfold(ics)).toContain('SUMMARY:Đọc\\; viết\\, học');
  });

  it('folds long lines at UTF-8 boundaries and unfolds back to the original', () => {
    const long = 'SUMMARY:' + 'Mỗi ngày tốt hơn một phần trăm — '.repeat(6);
    const folded = foldIcsLine(long);
    expect(folded.length).toBeGreaterThan(1);
    for (const line of folded) expect(octets(line)).toBeLessThanOrEqual(75);
    for (const line of folded.slice(1)) expect(line.startsWith(' ')).toBe(true);
    expect(folded.map((l, i) => (i === 0 ? l : l.slice(1))).join('')).toBe(long);
    expect(foldIcsLine('short')).toEqual(['short']);
  });
});
