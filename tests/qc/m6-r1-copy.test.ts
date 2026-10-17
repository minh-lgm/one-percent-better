// QC M6 round 1: every copy row that DESIGN.md v2.0 assigns to milestone M6 must exist, verbatim, in en.json and vi.json
// (M6-AC11: copy follows DESIGN §7.2 / 7.3 / 7.7). Parsed from the markdown tables; shares no code with the app.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import en from '../../src/i18n/resources/en.json';
import vi from '../../src/i18n/resources/vi.json';

const design = readFileSync(new URL('../../docs/design/DESIGN.md', import.meta.url), 'utf8');

function lookup(obj: unknown, key: string): unknown {
  return key.split('.').reduce<unknown>((acc, part) => (acc && typeof acc === 'object' ? (acc as Record<string, unknown>)[part] : undefined), obj);
}

const unwrap = (cell: string): string => cell.trim().replace(/^`/, '').replace(/`$/, '');

interface Row {
  key: string;
  en: string;
  vi: string;
}

const rows: Row[] = [];
for (const line of design.split(/\r?\n/)) { // CRLF-safe: a Windows clone (core.autocrlf) has CRLF in DESIGN.md
  const m = /^\| `([A-Za-z0-9_.]+)` \| M6 \|/.exec(line);
  if (!m) continue;
  const cells = line.split(/ \| /).map((c) => c.replace(/^\| /, '').replace(/ \|$/, ''));
  // key | MS | context | en | vi
  if (cells.length < 5) continue;
  rows.push({ key: m[1] as string, en: unwrap(cells[cells.length - 2] as string), vi: unwrap(cells[cells.length - 1] as string) });
}

describe('QC M6: DESIGN §7 M6 copy is in the resource files verbatim', () => {
  it('found the expected number of M6 rows (>= 36)', () => {
    expect(rows.length).toBeGreaterThanOrEqual(36);
  });
  for (const r of rows) {
    it(`${r.key}`, () => {
      expect(lookup(en, r.key), `en ${r.key}`).toBe(r.en);
      expect(lookup(vi, r.key), `vi ${r.key}`).toBe(r.vi);
    });
  }
});

describe('QC M6: key parity and phase-1 copy untouched', () => {
  const flat = (o: unknown, p = ''): string[] =>
    Object.entries(o as Record<string, unknown>).flatMap(([k, v]) => (v && typeof v === 'object' ? flat(v, `${p}${k}.`) : [`${p}${k}`]));
  it('en and vi have identical key sets', () => {
    const noOne = (k: string) => !k.endsWith('_one'); // vi has no singular plural form
    expect(flat(vi).sort()).toEqual(flat(en).filter(noOne).sort());
  });
  it('settings.about.desc is still the phase-1 sentence (FR-38)', () => {
    expect((en as { settings: { about: { desc: string } } }).settings.about.desc).toBe('Everything you log stays on this device. No account, no tracking.');
  });
  it('every en.json key now has a DESIGN row (privacyLink was added to DESIGN S7.7.5 in v3.1; re-targeted in M10 round 1)', () => {
    const designKeys = new Set(
      [...design.matchAll(/^\| `([A-Za-z0-9_.]+)` \|/gm)].map((m) => m[1] as string),
    );
    const extra = flat(en).filter((k) => !designKeys.has(k) && !/_(one|other|zero|few|many)$/.test(k));
    // Keys that exist in the app but in no DESIGN table row (excluding plural suffix forms). DESIGN v3.1 documents
    // settings.about.privacyLink, so the list must now be empty: any new key without a DESIGN row is a deviation.
    expect(extra.sort()).toEqual([]);
    expect(designKeys.has('settings.about.privacyLink')).toBe(true);
  });
});
