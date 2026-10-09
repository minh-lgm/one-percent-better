import { describe, expect, it } from 'vitest';
import { addDays, compareISODate, dayNumber, daysInclusive, endOfYearOf, isoFromDayNumber, isValidISODate, isWithin, parseISODate, toISODate, weekdayIndex, yearOf } from './dates';

describe('dates', () => {
  it('toISODate uses the local calendar day', () => {
    expect(toISODate(new Date(2026, 9, 9, 23, 59))).toBe('2026-10-09');
    expect(toISODate(new Date(2026, 0, 1, 0, 0))).toBe('2026-01-01');
  });

  it('parseISODate accepts real dates only', () => {
    expect(parseISODate('2026-10-09')?.getDate()).toBe(9);
    expect(parseISODate('2028-02-29')).not.toBeNull(); // leap year
    expect(parseISODate('2026-02-29')).toBeNull();
    expect(parseISODate('2026-13-40')).toBeNull();
    expect(parseISODate('abc')).toBeNull();
    expect(parseISODate('2026-1-9')).toBeNull();
    expect(parseISODate('')).toBeNull();
    expect(isValidISODate('2026-10-09')).toBe(true);
  });

  it('addDays crosses month/year boundaries', () => {
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2028-02-28', 1)).toBe('2028-02-29');
    expect(addDays('2026-01-01', -1)).toBe('2025-12-31');
  });

  it('daysInclusive counts both ends', () => {
    expect(daysInclusive('2026-10-01', '2026-10-31')).toBe(31);
    expect(daysInclusive('2026-01-01', '2026-12-31')).toBe(365);
    expect(daysInclusive('2028-01-01', '2028-12-31')).toBe(366);
    expect(daysInclusive('2026-10-09', '2026-10-09')).toBe(1);
    expect(daysInclusive('2026-01-01', '2031-01-01')).toBe(1827);
    expect(daysInclusive('2026-01-01', '2031-01-02')).toBe(1828);
  });

  it('compare / within / endOfYear / year', () => {
    expect(compareISODate('2026-10-01', '2026-10-02')).toBe(-1);
    expect(compareISODate('2026-10-02', '2026-10-02')).toBe(0);
    expect(isWithin('2026-10-09', '2026-10-01', '2026-10-31')).toBe(true);
    expect(isWithin('2026-11-01', '2026-10-01', '2026-10-31')).toBe(false);
    expect(endOfYearOf('2026-03-05')).toBe('2026-12-31');
    expect(yearOf('2028-02-29')).toBe(2028);
  });
});

describe('dayNumber / isoFromDayNumber / weekdayIndex (M4, NFR-03 hot paths)', () => {
  it('round-trips and matches addDays across month, year and leap boundaries', () => {
    for (const d of ['1970-01-01', '2026-01-01', '2026-10-09', '2026-12-31', '2027-01-01', '2028-02-28', '2028-02-29', '2028-03-01', '2100-02-28']) {
      expect(isoFromDayNumber(dayNumber(d))).toBe(d);
      expect(isoFromDayNumber(dayNumber(d) + 1)).toBe(addDays(d, 1));
      expect(isoFromDayNumber(dayNumber(d) - 1)).toBe(addDays(d, -1));
    }
    expect(dayNumber('1970-01-01')).toBe(0);
    expect(dayNumber('2026-10-09') - dayNumber('2026-10-01')).toBe(8);
  });

  it('weekdayIndex: Monday = 0 … Sunday = 6', () => {
    expect(weekdayIndex('2026-10-05')).toBe(0); // Monday
    expect(weekdayIndex('2026-10-09')).toBe(4); // Friday
    expect(weekdayIndex('2026-10-11')).toBe(6); // Sunday
    expect(weekdayIndex('2026-01-01')).toBe(3); // Thursday
    expect(weekdayIndex('2028-01-01')).toBe(5); // Saturday
    expect(weekdayIndex('1970-01-01')).toBe(3); // Thursday
  });
});
