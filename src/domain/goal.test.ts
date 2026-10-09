import { describe, expect, it } from 'vitest';
import { buildGoal, datasetS1 } from '../test/builders';
import { activeGoals, dailyTarget, entriesOutsidePeriod, goalStatus, groupGoals, periodDays, totalTarget, validateGoalInput, type GoalInput } from './goal';

const valid: GoalInput = {
  name: 'Read',
  why: 'Be smarter',
  targetType: 'daily',
  targetValue: 30,
  startDate: '2026-10-01',
  endDate: '2026-10-31',
};

function codes(input: GoalInput) {
  const r = validateGoalInput(input);
  return r.ok ? [] : r.errors.map((e) => `${e.field}:${e.code}${e.params?.variant ? ':' + e.params.variant : ''}`);
}

describe('validateGoalInput (M1-AC3)', () => {
  it('accepts a valid goal and trims text', () => {
    const r = validateGoalInput({ ...valid, name: '  Read ', why: ' x ' });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value).toEqual({ name: 'Read', why: 'x', targetType: 'daily', targetMinutes: 30, startDate: '2026-10-01', endDate: '2026-10-31' });
  });

  it('name', () => {
    expect(codes({ ...valid, name: '' })).toEqual(['name:GOAL_NAME_REQUIRED']);
    expect(codes({ ...valid, name: '   ' })).toEqual(['name:GOAL_NAME_REQUIRED']);
    expect(codes({ ...valid, name: 'a'.repeat(61) })).toEqual(['name:GOAL_NAME_TOO_LONG']);
    expect(codes({ ...valid, name: 'a'.repeat(60) })).toEqual([]);
  });

  it('why', () => {
    expect(codes({ ...valid, why: 'a'.repeat(281) })).toEqual(['why:GOAL_WHY_TOO_LONG']);
    expect(codes({ ...valid, why: 'a'.repeat(280) })).toEqual([]);
    expect(codes({ ...valid, why: '' })).toEqual([]);
  });

  it('daily target', () => {
    for (const v of [0, 1441, 12.5, Number.NaN]) {
      expect(codes({ ...valid, targetValue: v })).toEqual(['target:GOAL_TARGET_INVALID:daily']);
    }
    expect(codes({ ...valid, targetValue: 1 })).toEqual([]);
    expect(codes({ ...valid, targetValue: 1440 })).toEqual([]);
  });

  it('total target', () => {
    const total = { ...valid, targetType: 'total' as const, startDate: '2026-01-01', endDate: '2026-12-31' };
    expect(codes({ ...total, targetValue: 0 })).toEqual(['target:GOAL_TARGET_INVALID:total']);
    expect(codes({ ...total, targetValue: 10001 })).toEqual(['target:GOAL_TARGET_INVALID:total']);
    expect(codes({ ...total, targetValue: 2.5 })).toEqual(['target:GOAL_TARGET_INVALID:total']);
    expect(codes({ ...total, targetValue: 100 })).toEqual([]);
    // 100 h in one day → dailyTarget 6000 > 1440
    expect(codes({ ...total, targetValue: 100, startDate: '2026-10-09', endDate: '2026-10-09' })).toEqual(['target:GOAL_TARGET_INVALID:tooMuch']);
    expect(codes({ ...total, targetValue: 24, startDate: '2026-10-09', endDate: '2026-10-09' })).toEqual([]);
    const r = validateGoalInput({ ...total, targetValue: 100 });
    if (r.ok) expect(r.value.targetMinutes).toBe(6000);
  });

  it('period', () => {
    expect(codes({ ...valid, endDate: '2026-09-30' })).toEqual(['endDate:GOAL_PERIOD_INVALID:endBeforeStart']);
    expect(codes({ ...valid, startDate: '2026-01-01', endDate: '2031-01-02' })).toEqual(['endDate:GOAL_PERIOD_INVALID:tooLong']); // 1828 days
    expect(codes({ ...valid, startDate: '2026-01-01', endDate: '2031-01-01' })).toEqual([]); // 1827 days
    expect(codes({ ...valid, startDate: '' })).toEqual(['startDate:GOAL_PERIOD_INVALID']);
    expect(codes({ ...valid, endDate: 'abc' })).toEqual(['endDate:GOAL_PERIOD_INVALID']);
    expect(codes({ ...valid, startDate: '2026-02-30' })).toEqual(['startDate:GOAL_PERIOD_INVALID']);
    expect(codes({ ...valid, startDate: '2026-10-09', endDate: '2026-10-09' })).toEqual([]);
  });

  it('collects several errors at once, in field order', () => {
    expect(codes({ name: '', why: 'a'.repeat(281), targetType: 'daily', targetValue: 0, startDate: 'x', endDate: 'y' })).toEqual([
      'name:GOAL_NAME_REQUIRED',
      'why:GOAL_WHY_TOO_LONG',
      'target:GOAL_TARGET_INVALID:daily',
      'startDate:GOAL_PERIOD_INVALID',
      'endDate:GOAL_PERIOD_INVALID',
    ]);
  });
});

describe('derived values (M1-AC4)', () => {
  it('dailyTarget', () => {
    expect(dailyTarget({ targetType: 'total', targetMinutes: 6000, startDate: '2026-01-01', endDate: '2026-12-31' })).toBe(17);
    expect(dailyTarget({ targetType: 'total', targetMinutes: 6000, startDate: '2028-01-01', endDate: '2028-12-31' })).toBe(17);
    expect(dailyTarget({ targetType: 'daily', targetMinutes: 30, startDate: '2026-10-01', endDate: '2026-10-31' })).toBe(30);
    expect(dailyTarget({ targetType: 'total', targetMinutes: 60, startDate: '2026-10-01', endDate: '2026-10-07' })).toBe(9);
  });

  it('periodDays / totalTarget', () => {
    const g = buildGoal({ targetType: 'daily', targetMinutes: 30, startDate: '2026-10-01', endDate: '2026-10-31' });
    expect(periodDays(g)).toBe(31);
    expect(totalTarget(g)).toBe(930);
    expect(totalTarget({ targetType: 'total', targetMinutes: 6000, startDate: '2026-01-01', endDate: '2026-12-31' })).toBe(6000);
  });
});

describe('goalStatus (M1-AC5)', () => {
  const today = '2026-10-09';
  it('classifies dataset S1', () => {
    const { goals } = datasetS1();
    expect(goals.map((g) => goalStatus(g, today))).toEqual(['active', 'active', 'active', 'upcoming', 'ended']);
  });

  it('boundaries are inclusive', () => {
    expect(goalStatus(buildGoal({ startDate: '2026-10-09', endDate: '2026-12-31' }), today)).toBe('active');
    expect(goalStatus(buildGoal({ startDate: '2026-01-01', endDate: '2026-10-09' }), today)).toBe('active');
    expect(goalStatus(buildGoal({ startDate: '2026-10-10', endDate: '2026-12-31' }), today)).toBe('upcoming');
    expect(goalStatus(buildGoal({ startDate: '2026-01-01', endDate: '2026-10-08' }), today)).toBe('ended');
    expect(goalStatus(buildGoal({ archived: true }), today)).toBe('archived');
  });

  it('groups and sorts goals; activeGoals returns only active ones', () => {
    const { goals } = datasetS1();
    const groups = groupGoals(goals, today);
    expect(groups.active.map((g) => g.name)).toEqual(['Read', 'Guitar', 'Spanish']);
    expect(groups.upcoming.map((g) => g.name)).toEqual(['Marathon prep']);
    expect(groups.ended.map((g) => g.name)).toEqual(['Old course']);
    expect(groups.archived).toEqual([]);
    expect(activeGoals(goals, today).map((g) => g.name)).toEqual(['Read', 'Guitar', 'Spanish']);
  });
});

describe('entriesOutsidePeriod (FR-03)', () => {
  it('returns the dates that would be excluded', () => {
    expect(entriesOutsidePeriod(['2026-10-01', '2026-10-05'], '2026-10-02', '2026-10-31')).toEqual(['2026-10-01']);
    expect(entriesOutsidePeriod(['2026-10-01', '2026-10-05'], '2026-10-01', '2026-10-31')).toEqual([]);
  });
});
