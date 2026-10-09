import { describe, expect, it } from 'vitest';
import { clockTime, elapsedMs, previewTimer, roundedMinutes, splitMinSec, timerDate } from './timer';

const at = (iso: string) => new Date(iso);

describe('elapsedMs', () => {
  it('is now - startedAt, never negative', () => {
    expect(elapsedMs('2026-10-09T03:00:00.000Z', at('2026-10-09T03:25:31.000Z'))).toBe(25 * 60_000 + 31_000);
    expect(elapsedMs('2026-10-09T03:00:00.000Z', at('2026-10-09T02:59:00.000Z'))).toBe(0);
    expect(elapsedMs('not-a-date', at('2026-10-09T02:59:00.000Z'))).toBe(0);
  });
});

describe('roundedMinutes (M2-AC3)', () => {
  it.each([
    [25 * 60_000 + 29_000, 25],
    [25 * 60_000 + 30_000, 26],
    [10_000, 1],
    [0, 1],
    [1500 * 60_000, 1440],
    [65_000, 1],
    [90_000, 2],
  ])('%i ms → %i min', (ms, expected) => {
    expect(roundedMinutes(ms)).toBe(expected);
  });
});

describe('splitMinSec', () => {
  it('splits whole minutes and seconds', () => {
    expect(splitMinSec(25 * 60_000 + 31_900)).toEqual({ m: 25, s: 31 });
    expect(splitMinSec(0)).toEqual({ m: 0, s: 0 });
  });
});

describe('timerDate / previewTimer (M2-AC4)', () => {
  it('uses the local day the timer started on, even across midnight', () => {
    const startedAt = new Date('2026-10-09T23:50:00+07:00').toISOString();
    expect(timerDate(startedAt)).toBe('2026-10-09');
    const preview = previewTimer({ goalId: 'g1', startedAt }, new Date('2026-10-10T00:20:00+07:00'));
    expect(preview).toEqual({ goalId: 'g1', startedAt, date: '2026-10-09', elapsedMs: 30 * 60_000, minutes: 30 });
  });
});

describe('clockTime', () => {
  it('formats local HH:MM', () => {
    expect(clockTime(new Date('2026-10-09T10:05:00+07:00').toISOString())).toBe('10:05');
    expect(clockTime('garbage')).toBe('--:--');
  });
});
