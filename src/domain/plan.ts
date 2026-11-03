// The "+1 % a day" plan (FR-27 v6.0 / FR-24 v6.1; ARCHITECTURE §4.5, ADR-46, ADR-47): pure arithmetic
// shared by the curve (ideal line) and the stats (expected minutes, whole-period target), so the
// three numbers on Goal detail agree. No goal types here — `goal.ts` and `curve.ts` build on it.
//
// target(k) = T₀ × 1.01^(k−1): the target of day k, starting at T₀ on day 1 and growing 1 % a day.
// cumulative(k) = Σ_{i≤k} target(i) = T₀ × (1.01^k − 1) / 0.01 (closed form, never a float running sum).
// T₀ ("plan start"): a daily goal starts at its minutes-per-day; a total goal starts at the value that
// makes cumulative(periodDays) equal the total the user typed (ADR-47).

export const GROWTH_RATE = 0.01;
export const DAILY_GROWTH = 1 + GROWTH_RATE;
/**
 * Ceiling of every planned amount (minutes). 1.01^k overflows to Infinity after ≈ 71,000 days (an
 * open-ended goal mistyped to start before ~1830, A-49 / M11-D1); every screen must still print a finite
 * number, so the plan saturates at the largest exact integer instead (v6.1 fix, 2026-11-03).
 */
export const PLAN_MAX = Number.MAX_SAFE_INTEGER;

/** `Math.min(x, PLAN_MAX)`, with Infinity/NaN (overflow) mapped to `PLAN_MAX`. */
function clamp(x: number): number {
  return Number.isFinite(x) ? Math.min(x, PLAN_MAX) : PLAN_MAX;
}

export function growth(days: number): number {
  return Math.pow(DAILY_GROWTH, days);
}

/** `(factor − 1) × 100` rounded to one decimal. */
export function growthPercent(factor: number): number {
  return Math.round((factor - 1) * 1000) / 10;
}

/** target(k) = T₀ × 1.01^(k−1), saturating at `PLAN_MAX`. */
export function dayTarget(start: number, k: number): number {
  return clamp(start * growth(k - 1));
}

/** cumulative(k) = T₀ × (1.01^k − 1) / 0.01; 0 for k ≤ 0; saturating at `PLAN_MAX` (never Infinity/NaN). */
export function cumulativeTarget(start: number, k: number): number {
  if (k <= 0) return 0;
  return clamp((start * (growth(k) - 1)) / GROWTH_RATE);
}

/**
 * T₀ of a goal's plan. `daily` → `targetMinutes`; `total` → `targetMinutes × 0.01 / (1.01^periodDays − 1)`
 * so that the plan adds up to exactly the total over the period (`periodDays` ≥ 1).
 */
export function planStart(targetType: 'daily' | 'total', targetMinutes: number, periodDays: number | null): number {
  if (targetType === 'daily') return targetMinutes;
  if (periodDays === null || periodDays < 1) throw new RangeError('a total goal must have a period');
  return (targetMinutes * GROWTH_RATE) / (growth(periodDays) - 1);
}
