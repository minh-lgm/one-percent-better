import { describe, expect, it } from 'vitest';
import { buildGoal, datasetO1, datasetS1, datasetS1O1 } from '../test/builders';
import { activeGoals, byCreatedAt, byId, dailyTarget, daysElapsed, entriesOutsidePeriod, goalStatus, groupGoals, isOpenEnded, isWithinGoal, periodDays, totalTarget, validateGoalInput, type GoalInput } from './goal';
import type { Goal } from './types';

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

describe('stable ordering with id tie-break (M1-P1, M5-AC13)', () => {
  const today = '2026-10-09';
  const stamp = '2026-09-30T01:00:00.000Z';
  const pair = (overrides: Partial<Goal>): [Goal, Goal] => [buildGoal({ id: 'b', ...overrides }), buildGoal({ id: 'a', ...overrides })];

  it('active: same createdAt → [a, b] whatever the input order', () => {
    const [b, a] = pair({ createdAt: stamp, startDate: '2026-10-01', endDate: '2026-10-31' });
    expect(activeGoals([b, a], today).map((g) => g.id)).toEqual(['a', 'b']);
    expect(activeGoals([a, b], today).map((g) => g.id)).toEqual(['a', 'b']);
    expect(groupGoals([b, a], today).active.map((g) => g.id)).toEqual(['a', 'b']);
    expect(groupGoals([a, b], today).active.map((g) => g.id)).toEqual(['a', 'b']);
  });

  it('upcoming (same startDate), ended (same endDate), archived (same updatedAt) → [a, b]', () => {
    const [ub, ua] = pair({ startDate: '2026-11-01', endDate: '2026-11-30' });
    const [eb, ea] = pair({ startDate: '2026-01-01', endDate: '2026-06-30' });
    const [ab, aa] = pair({ archived: true, updatedAt: stamp });
    for (const order of [
      [ub, ua, eb, ea, ab, aa],
      [ua, ub, ea, eb, aa, ab],
    ]) {
      const groups = groupGoals(order, today);
      expect(groups.upcoming.map((g) => g.id)).toEqual(['a', 'b']);
      expect(groups.ended.map((g) => g.id)).toEqual(['a', 'b']);
      expect(groups.archived.map((g) => g.id)).toEqual(['a', 'b']);
    }
  });

  it('the primary key still wins over the id', () => {
    const early = buildGoal({ id: 'z', createdAt: '2026-09-01T00:00:00.000Z' });
    const late = buildGoal({ id: 'a', createdAt: '2026-09-02T00:00:00.000Z' });
    expect(activeGoals([late, early], today).map((g) => g.id)).toEqual(['z', 'a']);
    expect([{ id: 'b', createdAt: stamp }, { id: 'a', createdAt: stamp }].sort(byCreatedAt).map((x) => x.id)).toEqual(['a', 'b']);
    expect(byId({ id: 'a' }, { id: 'a' })).toBe(0);
  });
});

// ---- v4.0 (M11): open-ended goals, ARCH §4.6 (a)(b), oracle O1 ----
describe('open-ended goals — validateGoalInput (M11-AC1, FR-01, FR-56, A-48, A-49)', () => {
  it('daily + endDate null is valid, value.endDate === null, and the 1827-day limit does not apply', () => {
    const r = validateGoalInput({ ...valid, targetValue: 10, endDate: null });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value).toEqual({ name: 'Read', why: 'Be smarter', targetType: 'daily', targetMinutes: 10, startDate: '2026-10-01', endDate: null });
    expect(codes({ ...valid, startDate: '2000-01-01', endDate: null })).toEqual([]);
  });

  it('total + endDate null → exactly one GOAL_PERIOD_INVALID on endDate with variant openEndedTotal (no tooMuch, no tooLong)', () => {
    const r = validateGoalInput({ ...valid, targetType: 'total', targetValue: 100, endDate: null });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.errors).toHaveLength(1);
    expect(r.errors[0]).toMatchObject({ code: 'GOAL_PERIOD_INVALID', field: 'endDate', params: { variant: 'openEndedTotal' } });
    expect(codes({ ...valid, targetType: 'total', targetValue: 100, startDate: '2000-01-01', endDate: null })).toEqual(['endDate:GOAL_PERIOD_INVALID:openEndedTotal']);
  });

  it('an empty or impossible end date is still the plain GOAL_PERIOD_INVALID (different from null), for daily and total', () => {
    expect(codes({ ...valid, endDate: '' })).toEqual(['endDate:GOAL_PERIOD_INVALID']);
    expect(codes({ ...valid, endDate: '2026-02-30' })).toEqual(['endDate:GOAL_PERIOD_INVALID']);
    expect(codes({ ...valid, targetType: 'total', targetValue: 100, endDate: '' })).toEqual(['endDate:GOAL_PERIOD_INVALID']);
    expect(codes({ ...valid, targetType: 'total', targetValue: 100, endDate: '2026-02-30' })).toEqual(['endDate:GOAL_PERIOD_INVALID']);
  });

  it('null with an invalid start date reports only the start date (the open end is fine)', () => {
    expect(codes({ ...valid, startDate: 'nope', endDate: null })).toEqual(['startDate:GOAL_PERIOD_INVALID']);
  });
});

describe('open-ended goals — helpers and status (M11-AC2, ARCH §4.6 b/c)', () => {
  const o1 = datasetO1().goals[0];
  const g1 = datasetS1().goals[0];

  it('isOpenEnded / isWithinGoal', () => {
    expect(isOpenEnded(o1)).toBe(true);
    expect(isOpenEnded(g1)).toBe(false);
    expect(isWithinGoal('2026-09-30', o1)).toBe(false);
    expect(isWithinGoal('2026-10-01', o1)).toBe(true);
    expect(isWithinGoal('2099-12-31', o1)).toBe(true);
    expect(isWithinGoal('2026-10-31', g1)).toBe(true);
    expect(isWithinGoal('2026-11-01', g1)).toBe(false);
  });

  it('periodDays null; dailyTarget 10; daysElapsed 9 at 2026-10-09 (0 before the start, 1828 at 2031-10-02)', () => {
    expect(periodDays(o1)).toBeNull();
    expect(periodDays(g1)).toBe(31);
    expect(dailyTarget(o1)).toBe(10);
    expect(daysElapsed(o1, '2026-10-09')).toBe(9);
    expect(daysElapsed(o1, '2026-09-30')).toBe(0);
    expect(daysElapsed(o1, '2026-10-01')).toBe(1);
    expect(daysElapsed(o1, '2031-10-02')).toBe(1828);
    expect(daysElapsed(g1, '2026-12-01')).toBe(31);
  });

  it('totalTarget(o1, today) = dailyTarget × elapsed days; without today it is a programming error (RangeError); finite goals ignore today', () => {
    expect(totalTarget(o1, '2026-10-09')).toBe(90);
    expect(totalTarget(o1, '2026-09-30')).toBe(0);
    expect(() => totalTarget(o1)).toThrow(RangeError);
    expect(totalTarget(g1)).toBe(930);
    expect(totalTarget(g1, '2026-10-09')).toBe(930);
    expect(totalTarget({ targetType: 'total', targetMinutes: 6000, startDate: '2026-01-01', endDate: '2026-12-31' }, '2026-10-09')).toBe(6000);
  });

  it('a total goal without an end date breaks the invariant: dailyTarget throws instead of dividing by nothing', () => {
    expect(() => dailyTarget({ targetType: 'total', targetMinutes: 6000, startDate: '2026-01-01', endDate: null })).toThrow(RangeError);
  });

  it('goalStatus: upcoming before the start, active from the start on and for ever (never ended); archived wins', () => {
    expect(goalStatus(o1, '2026-09-30')).toBe('upcoming');
    expect(goalStatus(o1, '2026-10-01')).toBe('active');
    expect(goalStatus(o1, '2026-10-09')).toBe('active');
    expect(goalStatus(o1, '2031-10-02')).toBe('active');
    expect(goalStatus({ ...o1, archived: true }, '2031-10-02')).toBe('archived');
  });

  it('groupGoals(S1+O1, 2031-10-02): o1 in active (sorted by createdAt, last), never in ended; activeGoals agrees', () => {
    const { goals } = datasetS1O1();
    const groups = groupGoals(goals, '2031-10-02');
    expect(groups.active.map((g) => g.id)).toEqual(['o1']);
    expect(groups.ended.map((g) => g.id)).toEqual(['g2', 'g3', 'g4', 'g1', 'g5']);
    expect(groups.ended.some((g) => g.id === 'o1')).toBe(false);
    expect(activeGoals(goals, '2031-10-02').map((g) => g.id)).toEqual(['o1']);
    const at2026 = groupGoals(goals, '2026-10-09');
    expect(at2026.active.map((g) => g.id)).toEqual(['g1', 'g2', 'g3', 'o1']);
    expect(groupGoals(goals, '2026-09-30').upcoming.map((g) => g.id)).toEqual(['g1', 'o1', 'g4']); // same start: id tie-break
  });

  it('entriesOutsidePeriod with a null end only flags days before the start', () => {
    expect(entriesOutsidePeriod(['2026-09-30', '2026-10-01', '2099-01-01'], '2026-10-01', null)).toEqual(['2026-09-30']);
    expect(entriesOutsidePeriod(['2026-10-01', '2026-10-08'], '2026-10-01', '2026-10-07')).toEqual(['2026-10-08']);
  });
});
