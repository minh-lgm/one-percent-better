// M17-AC9 (NFR-11a, ADR-53): the lazy `roadmap` namespace obeys the same parity rules as the main resources, its
// strings are the DESIGN v8.0 §7.9.2 rows verbatim, and the six main-resource keys of §7.9.1 that M17 ships match too.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { checkParity, flattenMessages } from './parity';
import en from './resources/en.json';
import vi from './resources/vi.json';
import roadmapEn from './resources/roadmap.en.json';
import roadmapVi from './resources/roadmap.vi.json';

const design = readFileSync(new URL('../../docs/design/DESIGN.md', import.meta.url), 'utf8');
const EN = flattenMessages(roadmapEn);
const VI = flattenMessages(roadmapVi);

/** DESIGN §7.0 rule 5: rows marked "(= en)". */
const SAME_VALUE_ALLOWLIST = ['noValue', 'milestone.line', 'now.eyebrowIndexed', 'cp.week'];

function cells(line: string): string[] {
  const out: string[] = [];
  let cur = '';
  let inCode = false;
  for (const ch of line) {
    if (ch === '`') inCode = !inCode;
    if (ch === '|' && !inCode) {
      out.push(cur.trim());
      cur = '';
    } else cur += ch;
  }
  out.push(cur.trim());
  return out.filter((c, i, a) => !(c === '' && (i === 0 || i === a.length - 1)));
}
const unquote = (c: string) => (c.startsWith('`') && c.endsWith('`') ? c.slice(1, -1) : c);

/** Copy row of `key` inside the section between `from` and `to` headings (namespace keys may repeat main ones). */
function designCopy(key: string, from: string, to: string): { en: string; vi: string | null } {
  const section = design.slice(design.indexOf(from), design.indexOf(to));
  const line = section.split('\n').find((l) => l.startsWith(`| \`${key}\` |`));
  if (!line) throw new Error(`DESIGN.md has no copy row for ${key} in ${from}`);
  const c = cells(line);
  const enText = unquote(c[c.length - 2]);
  const viCell = c[c.length - 1];
  if (/\(= en\)\s*$/.test(viCell)) return { en: enText, vi: enText };
  return { en: enText, vi: viCell === '—' ? null : unquote(viCell) };
}

describe('roadmap namespace parity (M17-AC9)', () => {
  it('roadmap.en.json and roadmap.vi.json are in parity', () => {
    expect(checkParity(EN, VI, { sameValueAllowlist: SAME_VALUE_ALLOWLIST })).toEqual([]);
  });

  it('no key is a dot-prefix of another (DESIGN 7.9.0 rule)', () => {
    const keys = Object.keys(EN);
    for (const k of keys) expect(keys.filter((other) => other.startsWith(`${k}.`)), k).toEqual([]);
  });

  it('every namespace key is a DESIGN 7.9.2 row, verbatim in both languages (the two D3 lines come from 7.9.1 under its budget fallback)', () => {
    const moved: Record<string, string> = { importLine: 'import.roadmaps', importLineKept: 'import.roadmapsKept' };
    for (const key of Object.keys(EN)) {
      const expected = key in moved ? designCopy(moved[key], '#### 7.9.1', '#### 7.9.2') : designCopy(key, '#### 7.9.2', '#### 7.9.3');
      expect(EN[key], `en ${key}`).toBe(expected.en);
      if (expected.vi === null) expect(VI[key], `vi ${key}`).toBeUndefined();
      else expect(VI[key], `vi ${key}`).toBe(expected.vi);
    }
  });

  it('covers every 7.9.2 row of M17, M19 and M20 (M20: cp.*, tpl.*, checkpoint editor, template entry points) — 282 en / 268 vi keys (DESIGN 7.9.4)', () => {
    const section = design.slice(design.indexOf('#### 7.9.2'), design.indexOf('#### 7.9.3'));
    const rows = section.split('\n').filter((l) => /^\| `[a-zA-Z]/.test(l)).map((l) => cells(l));
    const keys = rows.map((c) => unquote(c[0]));
    expect(keys.length).toBeGreaterThan(270);
    for (const key of keys) expect(EN[key], `missing ${key}`).toBeDefined();
    const m20 = rows.filter((c) => c[1] === 'M20').map((c) => unquote(c[0]));
    expect(m20).toEqual(expect.arrayContaining(['list.createTemplate', 'new.templateHint', 'cp.sr.intro_other', 'tpl.preview', 'ed.saveCp', 'toast.templateCreated']));
    // the two D3 lines moved from 7.9.1 (M17 budget fallback) come on top of the 282 / 268 rows of 7.9.4
    expect(Object.keys(EN).length - 2).toBe(282);
    expect(Object.keys(VI).length - 2).toBe(268);
  });

  it('(M19, FR-80) goal.detail.roadmapLabel and goal.delete.roadmapNote (7.9.1) are in the main resources verbatim', () => {
    for (const key of ['goal.detail.roadmapLabel', 'goal.delete.roadmapNote']) {
      const expected = designCopy(key, '#### 7.9.1', '#### 7.9.2');
      expect(flattenMessages(en)[key], key).toBe(expected.en);
      expect(flattenMessages(vi)[key], key).toBe(expected.vi);
    }
    expect(flattenMessages(vi)['goal.detail.roadmapLabel']).toBe('Thuộc lộ trình');
  });

  it('nav.roadmaps (7.9.1) is in the main resources verbatim', () => {
    const expected = designCopy('nav.roadmaps', '#### 7.9.1', '#### 7.9.2');
    expect(flattenMessages(en)['nav.roadmaps']).toBe(expected.en);
    expect(flattenMessages(vi)['nav.roadmaps']).toBe(expected.vi);
    expect(expected.vi).toBe('Mục tiêu lớn');
  });

  it('(M18) settings.account.roadmapsUnavailable (7.9.1) is in the main resources verbatim', () => {
    const expected = designCopy('settings.account.roadmapsUnavailable', '#### 7.9.1', '#### 7.9.2');
    expect(flattenMessages(en)['settings.account.roadmapsUnavailable']).toBe(expected.en);
    expect(flattenMessages(vi)['settings.account.roadmapsUnavailable']).toBe(expected.vi);
    expect(expected.en).toMatch(/^Big goals can't sync yet/);
  });
});
