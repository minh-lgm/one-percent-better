import { describe, expect, it } from 'vitest';
import { markPlusOneShown, newlyMetGoals } from './plusone';

const TODAY = '2026-10-09';

describe('newlyMetGoals (FR-29, M5-AC3)', () => {
  it('fires for a goal that crossed from not met to met and was not shown today', () => {
    expect(newlyMetGoals(new Set(), new Set(['g1']), {}, TODAY)).toEqual(['g1']);
  });

  it('does not fire without a previous snapshot (first render / reload)', () => {
    expect(newlyMetGoals(null, new Set(['g1']), {}, TODAY)).toEqual([]);
  });

  it('does not fire again while the goal stays met, nor after being shown today (delete + re-add)', () => {
    expect(newlyMetGoals(new Set(['g1']), new Set(['g1']), {}, TODAY)).toEqual([]);
    expect(newlyMetGoals(new Set(), new Set(['g1']), { g1: TODAY }, TODAY)).toEqual([]);
  });

  it('fires again on another day', () => {
    expect(newlyMetGoals(new Set(), new Set(['g1']), { g1: TODAY }, '2026-10-10')).toEqual(['g1']);
  });

  it('handles several goals independently', () => {
    expect(newlyMetGoals(new Set(['g1']), new Set(['g1', 'g2', 'g3']), { g3: TODAY }, TODAY)).toEqual(['g2']);
  });
});

describe('markPlusOneShown', () => {
  it('adds today and drops stale days', () => {
    expect(markPlusOneShown({ g1: '2026-10-08', g2: TODAY }, 'g3', TODAY)).toEqual({ g2: TODAY, g3: TODAY });
  });
});
