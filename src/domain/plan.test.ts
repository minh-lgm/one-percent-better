// The "+1 % a day" plan (FR-27 v6.0 / FR-24 v6.1; ARCH §4.5, ADR-46, ADR-47) — pure arithmetic shared
// by the curve (ideal line) and the stats. v6.1 (ADR-47): expected/total follow the +1 % plan, so
// `planStart` of a total goal is scaled to make the plan add up to exactly the total.
import { describe, expect, it } from 'vitest';
import { cumulativeTarget, DAILY_GROWTH, dayTarget, GROWTH_RATE, growth, growthPercent, PLAN_MAX, planStart } from './plan';

describe('plan — growth', () => {
  it('constants: 1 % a day', () => {
    expect(GROWTH_RATE).toBe(0.01);
    expect(DAILY_GROWTH).toBe(1.01);
  });

  it('growth(d) = 1.01^d: 0 → 1, 1 → 1.01, 70 → ≈ 2.0068, 365 → ≈ 37.78, 1827 → finite', () => {
    expect(growth(0)).toBe(1);
    expect(growth(1)).toBeCloseTo(1.01, 12);
    expect(growth(2)).toBeCloseTo(1.0201, 12);
    expect(growth(70)).toBeCloseTo(2.00676, 4);
    expect(growth(365)).toBeCloseTo(37.7834, 3);
    expect(Number.isFinite(growth(1827))).toBe(true);
    expect(growth(-1)).toBeCloseTo(1 / 1.01, 12);
  });

  it('growthPercent: (factor − 1) × 100 to one decimal; 1 → 0 (not −0)', () => {
    expect(growthPercent(1)).toBe(0);
    expect(Object.is(growthPercent(1), -0)).toBe(false);
    expect(growthPercent(1.0829)).toBe(8.3);
    expect(growthPercent(1.01)).toBe(1);
    expect(growthPercent(2.00676)).toBe(100.7);
    expect(growthPercent(0.5)).toBe(-50);
  });
});

describe('plan — dayTarget / cumulativeTarget', () => {
  it('dayTarget(T₀, k) = T₀ × 1.01^(k−1): day 1 is exactly T₀, day 2 +1 %, day 4 30.90903', () => {
    expect(dayTarget(30, 1)).toBe(30);
    expect(dayTarget(30, 2)).toBeCloseTo(30.3, 12);
    expect(dayTarget(30, 4)).toBeCloseTo(30.90903, 9);
    expect(dayTarget(1, 4)).toBeCloseTo(1.030301, 9);
    expect(dayTarget(10, 9)).toBeCloseTo(10 * Math.pow(1.01, 8), 12);
    expect(dayTarget(1.631169059881809, 61)).toBeCloseTo(2.9633, 4);
  });

  it('cumulativeTarget(T₀, k) = T₀ × (1.01^k − 1) / 0.01; 0 for k ≤ 0 (0, −1, −3, −Infinity)', () => {
    expect(cumulativeTarget(30, 0)).toBe(0);
    expect(cumulativeTarget(30, -1)).toBe(0);
    expect(cumulativeTarget(30, -3)).toBe(0);
    expect(cumulativeTarget(30, Number.NEGATIVE_INFINITY)).toBe(0);
    expect(cumulativeTarget(30, 1)).toBeCloseTo(30, 9);
    expect(cumulativeTarget(30, 2)).toBeCloseTo(60.3, 9);
    expect(cumulativeTarget(30, 4)).toBeCloseTo(30 + 30.3 + 30.603 + 30.90903, 9);
    expect(cumulativeTarget(30, 9)).toBeCloseTo(281.0558, 3);
    expect(cumulativeTarget(30, 31)).toBeCloseTo(1083.98, 2);
    expect(cumulativeTarget(10, 9)).toBeCloseTo(93.6853, 3);
    expect(cumulativeTarget(10, 1828) / 1e10).toBeCloseTo(7.9336, 3);
    expect(cumulativeTarget(30, 1827) / 1e11).toBeCloseTo(2.3565, 3);
    expect(cumulativeTarget(0, 10)).toBe(0);
  });

  it('closed form = day-by-day sum of dayTarget (k = 1, 2, 9, 31, 365, 1827; T₀ 30, 1 and the scaled 1.6312)', () => {
    for (const start of [30, 1, 1.631169059881809]) {
      let sum = 0;
      let k = 0;
      const checkpoints = new Set([1, 2, 9, 31, 365, 1827]);
      while (k < 1827) {
        k++;
        sum += dayTarget(start, k);
        if (checkpoints.has(k)) expect(cumulativeTarget(start, k)).toBeCloseTo(sum, 9 - Math.floor(Math.log10(Math.max(1, sum))));
      }
    }
  });

  it('the cumulative line is strictly increasing and each step is the day target', () => {
    for (let k = 1; k <= 400; k++) {
      expect(cumulativeTarget(20, k)).toBeGreaterThan(cumulativeTarget(20, k - 1));
      expect(cumulativeTarget(20, k) - cumulativeTarget(20, k - 1)).toBeCloseTo(dayTarget(20, k), 7);
    }
  });
});

describe('plan — planStart (v6.1, ADR-47)', () => {
  it('daily goal: T₀ = minutes per day, whatever the period (finite, open-ended, 1 day)', () => {
    expect(planStart('daily', 30, 31)).toBe(30);
    expect(planStart('daily', 10, null)).toBe(10);
    expect(planStart('daily', 1, 1)).toBe(1);
    expect(planStart('daily', 1440, 1827)).toBe(1440);
  });

  it('total goal: T₀ = total × 0.01 / (1.01^days − 1) — 6000 over 365 days → 1.631169, 600 over 7 → 83.177; 1 day → the total itself', () => {
    expect(planStart('total', 6000, 365)).toBeCloseTo(1.631169059881809, 12);
    expect(planStart('total', 6000, 365)).toBeCloseTo(1.631169, 6);
    expect(planStart('total', 600, 7)).toBeCloseTo((600 * 0.01) / (Math.pow(1.01, 7) - 1), 12);
    expect(planStart('total', 600, 7)).toBeCloseTo(83.177, 3);
    expect(planStart('total', 600, 7)).toBeLessThan(600 / 7);
    expect(planStart('total', 90, 1)).toBeCloseTo(90, 9);
    expect(planStart('total', 60, 2)).toBeCloseTo(60 / 2.01, 12);
  });

  it('total goal without a period (null, 0, negative) throws RangeError', () => {
    expect(() => planStart('total', 6000, null)).toThrow(RangeError);
    expect(() => planStart('total', 6000, 0)).toThrow(RangeError);
    expect(() => planStart('total', 6000, -5)).toThrow(RangeError);
    expect(() => planStart('daily', 30, null)).not.toThrow();
  });

  it('the total plan sums to the total: cumulative(days) = total for 1, 83, 365, 1827 days (and day by day)', () => {
    for (const [total, days] of [
      [90, 1],
      [6000, 83],
      [6000, 365],
      [60_000, 1827],
      [1_440 * 1827, 1827],
      [60, 7],
    ] as Array<[number, number]>) {
      const start = planStart('total', total, days);
      expect(cumulativeTarget(start, days)).toBeCloseTo(total, 6);
      let sum = 0;
      for (let k = 1; k <= days; k++) sum += dayTarget(start, k);
      expect(sum).toBeCloseTo(total, 5);
      expect(start).toBeLessThanOrEqual(total / days + 1e-9); // never above the flat average
      expect(dayTarget(start, days)).toBeGreaterThanOrEqual(total / days - 1e-9); // the last day is at or above it
    }
  });
});

describe('overflow (A-49 / M11-D1): the plan saturates at PLAN_MAX instead of printing Infinity / NaN', () => {
  it('1.01^k overflows after ~71,000 days; cumulativeTarget / dayTarget stay finite and monotone', () => {
    expect(growth(100_000)).toBe(Infinity);
    expect(cumulativeTarget(10, 100_000)).toBe(PLAN_MAX);
    expect(dayTarget(10, 100_000)).toBe(PLAN_MAX);
    expect(Number.isSafeInteger(cumulativeTarget(10, 100_000))).toBe(true);
    // A goal mistyped to start on 1800-01-01 (≈ 82,800 days): finite everywhere.
    expect(Number.isFinite(cumulativeTarget(10, 82_800))).toBe(true);
    expect(cumulativeTarget(10, 82_800)).toBe(PLAN_MAX);
    // Below the ceiling nothing changes.
    expect(cumulativeTarget(10, 1828)).toBeCloseTo(79_336_177_009.8, 0);
    expect(cumulativeTarget(10, 1828)).toBeLessThan(PLAN_MAX);
    expect(cumulativeTarget(10, 70_000)).toBeLessThanOrEqual(PLAN_MAX);
    expect(cumulativeTarget(10, 70_001)).toBeGreaterThanOrEqual(cumulativeTarget(10, 70_000));
  });
});
