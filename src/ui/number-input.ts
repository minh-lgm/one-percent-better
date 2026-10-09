/**
 * Parse a user-typed number field strictly (M1-D3).
 *
 * Only plain decimal notation is accepted: optional surrounding whitespace,
 * digits, and at most one fractional part (`30`, `30.0`, `12.5`). Everything
 * JavaScript's `Number()` would also accept (`1e1`, `0x1E`, `0b11`, `+30`,
 * `Infinity`, empty string) is rejected and returns `NaN`, so the domain layer
 * then reports the field as invalid.
 */
const PLAIN_DECIMAL = /^\d+(\.\d+)?$/;

export function parseDecimalInput(value: string): number {
  const trimmed = value.trim();
  return PLAIN_DECIMAL.test(trimmed) ? Number(trimmed) : Number.NaN;
}
