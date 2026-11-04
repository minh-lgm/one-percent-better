// Checkpoint scores as typed and shown (phase 8, M20; DESIGN 7.9.0 "Điểm checkpoint", A-91). Lazy-only (ADR-53): kept
// out of `i18n/format.ts` so the cold load of #/today does not carry it.
import { parseDecimalInput } from '../../number-input';

type Locale = 'en' | 'vi';
const TAG: Record<Locale, string> = { en: 'en-US', vi: 'vi-VN' };
const cache = new Map<string, Intl.NumberFormat>();
const nf = (locale: Locale, grouping: boolean, style: 'decimal' | 'percent' = 'decimal') => {
  const key = `${locale}|${grouping}|${style}`;
  let f = cache.get(key);
  if (!f) {
    f = new Intl.NumberFormat(TAG[locale], { style, maximumFractionDigits: style === 'percent' ? 0 : 1, useGrouping: grouping });
    cache.set(key, f);
  }
  return f;
};

/** `5`, `7.5` / `7,5`, `32`, `10,000` / `10.000` — at most one decimal, no trailing `.0`. */
export function formatScore(locale: Locale, n: number): string {
  return nf(locale, true).format(n);
}

/** The value of a score input: like `formatScore` without grouping, so it reads back with `parseScore`. */
export function scoreInputValue(locale: Locale, n: number | null): string {
  return n === null ? '' : nf(locale, false).format(n);
}

/** `50%` — the percent axis of the chart. */
export function formatPercent(locale: Locale, fraction: number): string {
  return nf(locale, false, 'percent').format(fraction);
}

/** Signed difference to the threshold (`−2`, `+1`, `+0`, `+0.5`; U+2212 like `signed0`). */
export function signedScore(locale: Locale, n: number): string {
  return n < 0 ? `−${formatScore(locale, -n)}` : `+${formatScore(locale, Math.abs(n))}`;
}

/**
 * A typed score: `''` → `null` (no score / no threshold), `7,5` or `7.5` → `7.5`, anything else → `NaN` (the domain
 * reports it as `ROADMAP_SCORE_INVALID`). Plain decimals only, like every number field of the app (M1-D3).
 */
export function parseScore(text: string): number | null {
  const trimmed = text.trim();
  if (trimmed === '') return null;
  return parseDecimalInput(trimmed.replace(',', '.'));
}
