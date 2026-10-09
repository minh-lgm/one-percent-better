/**
 * Parity checks between translation files (ARCHITECTURE §8, NFR-11a).
 * Pure functions so they can be unit-tested with fixtures.
 */

export type FlatMessages = Record<string, string>;

export function flattenMessages(obj: unknown, prefix = ''): FlatMessages {
  const out: FlatMessages = {};
  if (obj && typeof obj === 'object') {
    for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
      const key = prefix ? `${prefix}.${k}` : k;
      if (typeof v === 'string') out[key] = v;
      else Object.assign(out, flattenMessages(v, key));
    }
  }
  return out;
}

/** Strip an i18next plural suffix (`_one`, `_other`). */
export function pluralBase(key: string): string {
  return key.replace(/_(one|other)$/, '');
}

export function variablesOf(value: string): string[] {
  return [...value.matchAll(/\{\{\s*([^}\s]+)\s*\}\}/g)].map((m) => m[1]).sort();
}

/** Strings without letters (numbers, symbols) don't need translation. */
export function hasNoLetters(value: string): boolean {
  return !/\p{L}/u.test(value.replace(/\{\{[^}]*\}\}/g, ''));
}

export interface ParityOptions {
  /** Keys whose `vi` value is allowed to equal `en` (brand names, endonyms). */
  sameValueAllowlist?: readonly string[];
}

/**
 * Returns a list of problems (empty when both files are in parity).
 * - every base key in `en` must exist in `vi` (as `_other` when plural) and vice versa
 * - no empty values
 * - same interpolation variables per key (`_other` compared with `_other`)
 * - `vi` must differ from `en` unless allow-listed or letter-free
 */
export function checkParity(en: FlatMessages, vi: FlatMessages, options: ParityOptions = {}): string[] {
  const problems: string[] = [];
  const allow = new Set(options.sameValueAllowlist ?? []);

  for (const [key, value] of Object.entries(en)) {
    if (value.trim() === '') problems.push(`en: empty value for "${key}"`);
  }
  for (const [key, value] of Object.entries(vi)) {
    if (value.trim() === '') problems.push(`vi: empty value for "${key}"`);
  }

  const enBases = new Set(Object.keys(en).map(pluralBase));
  const viBases = new Set(Object.keys(vi).map(pluralBase));

  for (const base of enBases) {
    if (!viBases.has(base)) problems.push(`vi: missing key "${base}"`);
  }
  for (const base of viBases) {
    if (!enBases.has(base)) problems.push(`vi: extra key "${base}" not in en`);
  }
  for (const key of Object.keys(vi)) {
    if (key.endsWith('_one')) problems.push(`vi: plural "_one" form is not used in Vietnamese ("${key}")`);
  }

  for (const [key, enValue] of Object.entries(en)) {
    if (key.endsWith('_one')) continue; // vi has no _one form
    const viValue = vi[key];
    if (viValue === undefined) continue; // already reported as missing
    const ev = variablesOf(enValue);
    const vv = variablesOf(viValue);
    if (ev.join(',') !== vv.join(',')) {
      problems.push(`variables differ for "${key}": en {${ev.join(',')}} vs vi {${vv.join(',')}}`);
    }
    if (enValue === viValue && !allow.has(key) && !hasNoLetters(enValue)) {
      problems.push(`vi: value equals en for "${key}" (not allow-listed)`);
    }
  }

  return problems;
}
