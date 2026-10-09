import { describe, expect, it } from 'vitest';
import { createFormatters } from './format';
import { createI18n, createTranslator } from './instance';

const normalize = (s: string) => s.replace(/[\u00A0\u202F]/g, ' ');

function formatters(locale: 'en' | 'vi') {
  return createFormatters(locale, createTranslator(createI18n({ locale, strictMissingKeys: true })));
}

describe('format.ts (ARCH §5.8, M1-AC18)', () => {
  const en = formatters('en');
  const vi = formatters('vi');

  it('dateLong', () => {
    expect(en.dateLong('2026-10-09')).toBe('Friday, October 9');
    expect(en.dateLong('2026-10-08', { withYear: true })).toBe('Thursday, October 8, 2026');
    const expectedVi = new Intl.DateTimeFormat('vi-VN', { weekday: 'long', month: 'long', day: 'numeric' }).format(
      new Date(2026, 9, 9),
    );
    expect(vi.dateLong('2026-10-09')).toBe(expectedVi);
    expect(normalize(vi.dateLong('2026-10-09'))).toContain('9');
    expect(normalize(vi.dateLong('2026-10-09'))).toContain('tháng 10');
  });

  it('dateShort and dateRange', () => {
    expect(en.dateShort('2026-10-01')).toBe('2026-10-01');
    expect(vi.dateShort('2026-10-01')).toBe('01/10/2026');
    expect(en.dateRange('2026-10-01', '2026-10-31')).toBe('2026-10-01 – 2026-10-31');
    expect(vi.dateRange('2026-10-01', '2026-10-31')).toBe('01/10/2026 – 31/10/2026');
  });

  it('number / decimal1 / percent1', () => {
    expect(en.number(1440)).toBe('1,440');
    expect(vi.number(1440)).toBe('1.440');
    expect(en.decimal1(15.5)).toBe('15.5');
    expect(vi.decimal1(15.5)).toBe('15,5');
    expect(en.decimal1(4)).toBe('4.0');
    expect(vi.decimal1(4)).toBe('4,0');
    expect(en.percent1(25.8)).toBe('25.8%');
    expect(vi.percent1(25.8)).toBe('25,8%');
  });

  it('minutes and duration', () => {
    expect(en.minutes(20)).toBe('20 min');
    expect(vi.minutes(20)).toBe('20 phút');
    expect(en.duration(160)).toBe('2 h 40 min');
    expect(vi.duration(160)).toBe('2 giờ 40 phút');
    expect(en.duration(120)).toBe('2 h');
    expect(vi.duration(120)).toBe('2 giờ');
    expect(en.duration(45)).toBe('45 min');
  });

  it('M4: hours, monthLong, monthYear, dateMonthDay', () => {
    expect(en.hours(240)).toBe('4.0 h');
    expect(vi.hours(240)).toBe('4,0 giờ');
    expect(en.hours(565)).toBe('9.4 h');
    expect(en.monthLong('2026-10-01')).toBe('October');
    expect(en.monthYear('2026-10-01')).toBe('October 2026');
    expect(en.dateMonthDay('2026-10-09')).toBe('Oct 9');
    expect(vi.monthLong('2026-10-01')).toBe(new Intl.DateTimeFormat('vi-VN', { month: 'long' }).format(new Date(2026, 9, 1)));
    expect(vi.monthYear('2026-10-01')).toBe(new Intl.DateTimeFormat('vi-VN', { month: 'long', year: 'numeric' }).format(new Date(2026, 9, 1)));
    expect(vi.dateMonthDay('2026-10-09')).toBe(new Intl.DateTimeFormat('vi-VN', { month: 'short', day: 'numeric' }).format(new Date(2026, 9, 9)));
    expect(normalize(vi.dateMonthDay('2026-10-09'))).toContain('9');
  });

  it('count: plural phrase with thousands separators (M3-D2)', () => {
    expect(en.count('format.goalsCount', 1)).toBe('1 goal');
    expect(en.count('format.goalsCount', 2)).toBe('2 goals');
    expect(en.count('format.entriesCount', 16000)).toBe('16,000 entries');
    expect(en.count('format.entriesCount', 1)).toBe('1 entry');
    expect(en.count('format.daysCount', 0)).toBe('0 days');
    expect(vi.count('format.goalsCount', 1)).toBe('1 mục tiêu');
    expect(vi.count('format.entriesCount', 16000)).toBe('16.000 lần ghi');
    expect(vi.count('format.daysCount', 8)).toBe('8 ngày');
  });

  it('hhmmss is identical in both locales', () => {
    expect(en.hhmmss(25 * 60_000 + 31_000)).toBe('00:25:31');
    expect(vi.hhmmss(25 * 60_000 + 31_000)).toBe('00:25:31');
    expect(en.hhmmss(0)).toBe('00:00:00');
    expect(en.hhmmss(3_600_000 + 5_000)).toBe('01:00:05');
  });

  it('weekdayShort / monthShort use Intl', () => {
    expect(en.weekdayShort('2026-10-05')).toBe('Mon');
    expect(en.monthShort('2026-10-05')).toBe('Oct');
    expect(vi.weekdayShort('2026-10-05')).toBe(new Intl.DateTimeFormat('vi-VN', { weekday: 'short' }).format(new Date(2026, 9, 5)));
  });
});
