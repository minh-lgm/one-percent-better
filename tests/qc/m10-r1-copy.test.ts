// QC M10 round 1 - M10-AC11: copy in en.json / vi.json equals DESIGN.md v3.1 verbatim. Own parser (does not reuse the developer's
// src/i18n/design-copy.test.ts): every table row `| `key` | milestone | where | `en` | `vi` |` of DESIGN section 7 is compared.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import en from '../../src/i18n/resources/en.json';
import vi from '../../src/i18n/resources/vi.json';

const design = readFileSync(new URL('../../docs/design/DESIGN.md', import.meta.url), 'utf8');

function lookup(tree: unknown, key: string): string | undefined {
  let node: unknown = tree;
  for (const part of key.split('.')) {
    if (node && typeof node === 'object' && part in (node as Record<string, unknown>)) node = (node as Record<string, unknown>)[part];
    else return undefined;
  }
  return typeof node === 'string' ? node : undefined;
}

interface Row {
  key: string;
  en: string | null;
  vi: string | null;
}
/** Cells are split on ` | ` outside backticks; the copy cells are the last two and are wrapped in single backticks (or `—`). */
function rows(): Row[] {
  const out: Row[] = [];
  for (const line of design.split(/\r?\n/)) {
    const m = /^\| `([A-Za-z][A-Za-z0-9_.]*)` \|/.exec(line);
    if (!m) continue;
    const cells = line.split(/ \| (?=(?:[^`]*`[^`]*`)*[^`]*$)/).map((c) => c.trim().replace(/^\|\s*/, '').replace(/\s*\|$/, ''));
    if (cells.length < 5) continue;
    const unwrap = (c: string): string | null => {
      const t = c.trim();
      if (t === '—' || t === '-' || t === '') return null;
      const w = /^`([\s\S]*)`$/.exec(t);
      return w ? w[1]! : null;
    };
    out.push({ key: m[1]!, en: unwrap(cells[cells.length - 2]!), vi: unwrap(cells[cells.length - 1]!) });
  }
  return out;
}

const KEYS_V31 = [
  'errors.IMPORT_INVALID_SCHEMA_outOfRange',
  'errors.EXPORT_FAILED',
  'auth.signOut.rejectedKeep',
  'auth.signOut.rejectedRemove',
  'auth.signOut.rejected_other',
  'auth.signOut.rejected_one',
  'auth.signOut.removeDescRejected',
  'settings.account.localRejected_other',
  'settings.account.localRejected_one',
  'settings.about.privacyLink',
  'empty.day.noGoals',
];

describe('DESIGN v3.1 copy rows are in the resource files verbatim', () => {
  const all = rows();
  it('the parser finds the table rows (sanity)', () => {
    expect(all.length).toBeGreaterThan(300);
  });
  for (const key of KEYS_V31) {
    it(`${key}`, () => {
      const row = all.find((r) => r.key === key);
      expect(row, `row for ${key} in DESIGN.md`).toBeTruthy();
      expect(row!.en, `${key} en cell`).not.toBeNull();
      expect(lookup(en, key)).toBe(row!.en);
      if (row!.vi !== null) expect(lookup(vi, key)).toBe(row!.vi);
    });
  }
  it('the two reworded en strings no longer contain the number-sensitive words ("It stays", "these items")', () => {
    expect(lookup(en, 'auth.signOut.rejectedKeep')).not.toMatch(/^It stays/);
    expect(lookup(en, 'auth.signOut.rejectedRemove')).not.toMatch(/these items/);
  });
  it('the vi strings of the two reworded keys did not change (DESIGN: vi giữ nguyên)', () => {
    expect(lookup(vi, 'auth.signOut.rejectedKeep')).toBe('Chúng vẫn nằm trên thiết bị này nếu bạn giữ dữ liệu ở đây. Hãy xuất bản sao lưu để giữ một bản sao.');
    expect(lookup(vi, 'auth.signOut.rejectedRemove')).toBe('Nếu xóa dữ liệu khỏi thiết bị này, các mục đó sẽ mất. Hãy xuất bản sao lưu trước để giữ chúng.');
  });
  it('global sweep: how many DESIGN rows differ from en.json (recorded for the report; only the documented ones may differ)', () => {
    const diffs: string[] = [];
    for (const r of all) {
      const have = lookup(en, r.key);
      if (have === undefined || r.en === null) continue;
      if (have !== r.en) diffs.push(r.key);
    }
    console.log(`QC M10 DESIGN vs en.json rows that differ (${diffs.length}): ${diffs.slice(0, 40).join(', ')}`);
    expect(diffs.filter((k) => KEYS_V31.includes(k))).toEqual([]);
  });
});
