import { describe, expect, it } from 'vitest';
import { buildEntry, buildGoal } from '../test/builders';
import { checkDayLimit, minutesByGoal, sumMinutes, validateEntryDate, validateEntryFields } from './entry';

describe('validateEntryFields (M1-AC6)', () => {
  it('rejects invalid minutes', () => {
    for (const minutes of [0, 1441, 12.5, Number.NaN]) {
      const r = validateEntryFields({ minutes, note: '' });
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.errors.map((e) => e.code)).toEqual(['ENTRY_MINUTES_INVALID']);
    }
  });

  it('rejects a long note and accepts 280 chars', () => {
    const long = validateEntryFields({ minutes: 10, note: 'a'.repeat(281) });
    expect(long.ok).toBe(false);
    if (!long.ok) expect(long.errors.map((e) => e.code)).toEqual(['ENTRY_NOTE_TOO_LONG']);
    expect(validateEntryFields({ minutes: 10, note: 'a'.repeat(280) }).ok).toBe(true);
  });

  it('accepts valid input and trims the note', () => {
    const r = validateEntryFields({ minutes: 20, note: ' Ch. 3 ' });
    expect(r).toEqual({ ok: true, value: { minutes: 20, note: 'Ch. 3' } });
  });

  it('reports both errors together', () => {
    const r = validateEntryFields({ minutes: 0, note: 'a'.repeat(281) });
    if (!r.ok) expect(r.errors.map((e) => e.code)).toEqual(['ENTRY_MINUTES_INVALID', 'ENTRY_NOTE_TOO_LONG']);
  });
});

describe('validateEntryDate', () => {
  const goal = buildGoal({ startDate: '2026-10-01', endDate: '2026-10-31' });
  it('future dates are rejected', () => {
    expect(validateEntryDate('2026-10-10', goal, '2026-10-09')?.code).toBe('DATE_IN_FUTURE');
  });
  it('dates outside the goal are rejected with the period in params', () => {
    const err = validateEntryDate('2026-09-30', goal, '2026-10-09');
    expect(err?.code).toBe('DATE_OUTSIDE_GOAL_PERIOD');
    expect(err?.params).toEqual({ start: '2026-10-01', end: '2026-10-31' });
  });
  it('today and boundaries are accepted', () => {
    expect(validateEntryDate('2026-10-09', goal, '2026-10-09')).toBeNull();
    expect(validateEntryDate('2026-10-01', goal, '2026-10-09')).toBeNull();
    expect(validateEntryDate('2026-10-31', goal, '2026-11-05')).toBeNull();
  });
});

describe('checkDayLimit', () => {
  it('1400 + 41 exceeds; 1400 + 40 is allowed', () => {
    const err = checkDayLimit(1400, 41);
    expect(err?.code).toBe('ENTRY_DAY_LIMIT_EXCEEDED');
    expect(err?.params).toEqual({ remaining: 40 });
    expect(checkDayLimit(1400, 40)).toBeNull();
    expect(checkDayLimit(1440, 1)?.params).toEqual({ remaining: 0 });
  });
});

describe('sums', () => {
  it('sumMinutes and minutesByGoal', () => {
    const entries = [buildEntry({ goalId: 'a', minutes: 20 }), buildEntry({ goalId: 'a', minutes: 10 }), buildEntry({ goalId: 'b', minutes: 5 })];
    expect(sumMinutes(entries)).toBe(35);
    expect(minutesByGoal(entries).get('a')).toBe(30);
    expect(minutesByGoal(entries).get('b')).toBe(5);
    expect(minutesByGoal([]).size).toBe(0);
  });
});
