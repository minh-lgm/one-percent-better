import { describe, expect, it } from 'vitest';
import { addDays, compareISODate, daysInclusive, endOfYearOf, isValidISODate, isWithin, parseISODate, toISODate, yearOf } from './dates';

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
