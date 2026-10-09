import { describe, expect, it } from 'vitest';
import { datasetS1 } from '../test/builders';
import { activeGoals, dailyTarget } from './goal';
import {
  goalsNotOnTarget,
  isPastReminderTime,
  isValidReminderTime,
  reminderData,
  reminderTimeToMinutes,
  shouldNotify,
  shouldShowBanner,
  type GoalProgress,
} from './reminder';
import { DEFAULT_SETTINGS } from './types';

const TODAY = '2026-10-09';
const at = (hhmm: string, date = TODAY) => new Date(`${date}T${hhmm}+07:00`);

/** S1 at 2026-10-09: active goals G1–G3, no entries today. */
function s1Progress(overrides: Record<string, number> = {}): GoalProgress[] {
  const { goals } = datasetS1();
  return activeGoals(goals, TODAY).map((g) => ({ id: g.id, name: g.name, current: overrides[g.id] ?? 0, target: dailyTarget(g) }));
}

const settingsOn = { ...DEFAULT_SETTINGS, reminderEnabled: true, reminderTime: '20:00', lastReminderDate: null };

describe('reminder time helpers', () => {
  it('validates HH:MM 24h', () => {
    expect(isValidReminderTime('20:00')).toBe(true);
    expect(isValidReminderTime('07:30')).toBe(true);
    expect(isValidReminderTime('23:59')).toBe(true);
    expect(isValidReminderTime('24:00')).toBe(false);
    expect(isValidReminderTime('7:30')).toBe(false);
    expect(isValidReminderTime('20:60')).toBe(false);
    expect(isValidReminderTime('')).toBe(false);
    expect(isValidReminderTime(2000)).toBe(false);
  });

  it('converts to minutes since midnight', () => {
    expect(reminderTimeToMinutes('20:00')).toBe(1200);
    expect(reminderTimeToMinutes('00:00')).toBe(0);
    expect(reminderTimeToMinutes('x')).toBeNull();
  });

  it('isPastReminderTime compares local hh:mm (inclusive)', () => {
    expect(isPastReminderTime(at('20:00:00'), '20:00')).toBe(true);
    expect(isPastReminderTime(at('20:00:30'), '20:00')).toBe(true);
    expect(isPastReminderTime(at('19:59:59'), '20:00')).toBe(false);
    expect(isPastReminderTime(at('23:59:00'), '20:00')).toBe(true);
    expect(isPastReminderTime(at('00:10:00', '2026-10-10'), '20:00')).toBe(false);
    expect(isPastReminderTime(at('20:00:00'), 'bad')).toBe(false);
  });
});

describe('shouldNotify truth table (M2-AC7)', () => {
  const progress = s1Progress();

  it('is true at 20:00:30, enabled, granted, not sent today, goals pending', () => {
    expect(shouldNotify(at('20:00:30'), settingsOn, 'granted', progress)).toBe(true);
  });

  it('is false when the reminder is off', () => {
    expect(shouldNotify(at('20:00:30'), { ...settingsOn, reminderEnabled: false }, 'granted', progress)).toBe(false);
  });

  it.each(['denied', 'default', 'unsupported'] as const)('is false when permission is %s', (permission) => {
    expect(shouldNotify(at('20:00:30'), settingsOn, permission, progress)).toBe(false);
  });

  it('is false before the reminder time', () => {
    expect(shouldNotify(at('19:59:00'), settingsOn, 'granted', progress)).toBe(false);
  });

  it('is false when already sent today, true again the next day', () => {
    expect(shouldNotify(at('20:00:30'), { ...settingsOn, lastReminderDate: TODAY }, 'granted', progress)).toBe(false);
    expect(shouldNotify(at('20:00:30', '2026-10-10'), { ...settingsOn, lastReminderDate: TODAY }, 'granted', progress)).toBe(true);
  });

  it('is false when every active goal is on target', () => {
    const met = s1Progress({ g1: 30, g2: 20, g3: 17 });
    expect(goalsNotOnTarget(met)).toEqual([]);
    expect(shouldNotify(at('20:00:30'), settingsOn, 'granted', met)).toBe(false);
    expect(shouldShowBanner(at('20:00:30'), settingsOn, met)).toBe(false);
  });

  it('only counts the goals it is given (upcoming/ended goals are filtered upstream)', () => {
    expect(progress.map((g) => g.name)).toEqual(['Read', 'Guitar', 'Spanish']);
  });
});

describe('shouldShowBanner (M2-AC10)', () => {
  const progress = s1Progress();
  it('ignores permission and lastReminderDate', () => {
    expect(shouldShowBanner(at('20:01:00'), settingsOn, progress)).toBe(true);
    expect(shouldShowBanner(at('19:59:00'), settingsOn, progress)).toBe(false);
    expect(shouldShowBanner(at('20:01:00'), { ...settingsOn, reminderEnabled: false }, progress)).toBe(false);
  });
});

describe('reminderData (ADR-13)', () => {
  it('returns count, up to 3 items and the remainder', () => {
    const progress = s1Progress({ g2: 20 });
    expect(reminderData(progress)).toEqual({
      count: 2,
      items: [
        { id: 'g1', name: 'Read', current: 0, target: 30 },
        { id: 'g3', name: 'Spanish', current: 0, target: 17 },
      ],
      more: 0,
    });
    const five: GoalProgress[] = ['A', 'B', 'C', 'D', 'E'].map((name, i) => ({ id: name, name, current: i, target: 10 }));
    const data = reminderData(five);
    expect(data.count).toBe(5);
    expect(data.items.map((g) => g.name)).toEqual(['A', 'B', 'C']);
    expect(data.more).toBe(2);
  });
});
