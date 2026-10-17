// QC round 1 (M9): copy and formatter checks written from DESIGN.md v3.0 §7.1 / §7.6.4 and ARCH §4.5, independent of the dev's tests.
//  - every goal.detail.* / empty.detail.curve string equals the DESIGN table verbatim (en + vi)
//  - removed keys are gone from both files and from src/
//  - en/vi use the same {{placeholders}}
//  - signed % / factor / axis labels (7.1) incl. U+2212, -0 and the compact forms
//  - curveYDomain properties (M9-AC2) on random data
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { curveYDomain } from '../../src/domain/curve';
import { createFormatters } from '../../src/i18n/format';
import { createI18n, createTranslator } from '../../src/i18n/instance';

const root = join(__dirname, '..', '..');
const read = (p: string) => readFileSync(join(root, p), 'utf8');
type Json = { [k: string]: string | Json };
const flatten = (o: Json, prefix = ''): Record<string, string> =>
  Object.entries(o).reduce<Record<string, string>>((acc, [k, v]) => {
    if (typeof v === 'string') acc[prefix + k] = v;
    else Object.assign(acc, flatten(v, `${prefix}${k}.`));
    return acc;
  }, {});
const en = flatten(JSON.parse(read('src/i18n/resources/en.json')) as Json);
const vi = flatten(JSON.parse(read('src/i18n/resources/vi.json')) as Json);

function designRows(): Map<string, { en: string; vi: string }> {
  const rows = new Map<string, { en: string; vi: string }>();
  for (const line of read('docs/design/DESIGN.md').split(/\r?\n/)) {
    const m = /^\| `((?:goal\.detail|empty\.detail)\.[A-Za-z_]+)` \| (.*)$/.exec(line);
    if (!m) continue;
    // cells: MS | usage | `en` | `vi` |  (the en/vi cells are the last two backticked cells)
    const cells = m[2].replace(/ \|\s*$/, '').split(/ \| (?=`|[^|]*$)/);
    const last2 = cells.slice(-2).map((c) => c.trim().replace(/^`/, '').replace(/`$/, ''));
    rows.set(m[1], { en: last2[0], vi: last2[1] });
  }
  return rows;
}

describe('M9 QC: copy matches DESIGN v3.0 verbatim (FR-35, FR-36)', () => {
  const rows = designRows();
  const m9Keys = [
    'goal.detail.headline', 'goal.detail.headlineDown', 'goal.detail.subDay', 'goal.detail.subToday', 'goal.detail.subEarlier', 'goal.detail.subStart',
    'goal.detail.chartCaption', 'goal.detail.legendYou', 'goal.detail.legendZero', 'goal.detail.chartSummary', 'goal.detail.chartSummaryEmpty', 'goal.detail.chartNote',
    'goal.detail.tooltipChange', 'goal.detail.tooltipBase', 'goal.detail.tooltipFlat', 'goal.detail.tooltipIdeal', 'goal.detail.labelIdeal', 'goal.detail.labelYou',
    'goal.detail.tableMinutes', 'goal.detail.tableChange', 'empty.detail.curve',
  ];

  it('the DESIGN table was parsed (all 21 M9 keys found)', () => {
    for (const k of m9Keys) expect(rows.has(k), k).toBe(true);
  });

  for (const k of m9Keys) {
    it(`${k}: en and vi equal DESIGN`, () => {
      const row = rows.get(k)!;
      expect(en[k]).toBe(row.en);
      expect(vi[k]).toBe(row.vi);
    });
  }

  it('every other goal.detail.* row of DESIGN (M3/M5, unchanged) still matches too', () => {
    const bad: string[] = [];
    for (const [k, row] of rows) {
      if (en[k] !== row.en) bad.push(`en ${k}`);
      if (vi[k] !== row.vi) bad.push(`vi ${k}`);
    }
    expect(bad).toEqual([]);
  });

  it('the 3 dropped keys are gone from en.json and vi.json and from src/ (and not referenced by any spec or test of the team)', () => {
    const gone = ['goal.detail.headlineSub_one', 'goal.detail.headlineSub_other', 'goal.detail.tooltip'];
    for (const k of gone) {
      expect(en[k], k).toBeUndefined();
      expect(vi[k], k).toBeUndefined();
    }
    const hits: string[] = [];
    const walk = (dir: string) => {
      for (const name of readdirSync(join(root, dir))) {
        const p = `${dir}/${name}`;
        if (statSync(join(root, p)).isDirectory()) walk(p);
        else if (/\.(ts|tsx|json|css|html)$/.test(name) && !/^m9-r1-copy/.test(name)) {
          const text = read(p);
          if (/headlineSub|goal\.detail\.tooltip['"`]|detail\.tooltip['"`)]/.test(text)) hits.push(p);
        }
      }
    };
    walk('src');
    walk('e2e');
    expect(hits).toEqual([]);
  });

  it('en and vi use the same {{placeholders}} for the whole goal.detail / empty.detail subtree', () => {
    const vars = (s: string) => [...s.matchAll(/\{\{\s*([A-Za-z0-9_]+)/g)].map((m) => m[1]).sort().join(',');
    const bad: string[] = [];
    for (const k of Object.keys(en)) if (/^(goal\.detail|empty\.detail)\./.test(k) && vars(en[k]) !== vars(vi[k] ?? '')) bad.push(k);
    expect(bad).toEqual([]);
  });

  it('no string of the new copy contains an ASCII hyphen-minus used as a sign, and none hardcodes a sign next to a placeholder', () => {
    for (const k of m9Keys) for (const table of [en, vi]) expect(table[k], k).not.toMatch(/(^|\s)[-+]\{\{/);
  });
});

describe('M9 QC: formatters (DESIGN 7.1)', () => {
  const f = (locale: 'en' | 'vi') => createFormatters(locale, createTranslator(createI18n({ locale, strictMissingKeys: true })));
  const n = (s: string) => s.replace(new RegExp(`[${String.fromCharCode(160, 8239)}]`, "g"), " "); // NBSP / narrow NBSP -> space
  const e = f('en');
  const v = f('vi');
  const MINUS = '−';

  it('signed1: + / U+2212, one decimal, grouping per locale, -0 -> +0.0', () => {
    expect(e.signed1(440)).toBe('+440.0');
    expect(e.signed1(-40)).toBe(`${MINUS}40.0`);
    expect(e.signed1(143900)).toBe('+143,900.0');
    expect(e.signed1(-99.9)).toBe(`${MINUS}99.9`);
    expect(e.signed1(0)).toBe('+0.0');
    expect(e.signed1(-0)).toBe('+0.0');
    expect(v.signed1(440)).toBe('+440,0');
    expect(v.signed1(-40)).toBe(`${MINUS}40,0`);
    expect(n(v.signed1(143900))).toBe('+143.900,0');
    expect(v.signed1(-0)).toBe('+0,0');
    for (const s of [e.signed1(-12.3), v.signed1(-12.3)]) expect(s.includes('-')).toBe(false);
  });

  it('factor: >= 1 up to 2 decimals without trailing zeros; < 1 two significant digits', () => {
    expect([e.factor(5.4), e.factor(2.8), e.factor(1), e.factor(1440), e.factor(1.005), e.factor(1.25)]).toEqual(['5.4', '2.8', '1', '1,440', '1.01', '1.25']);
    expect([e.factor(0.6), e.factor(1 / 1440), e.factor(0.05), e.factor(0.123)]).toEqual(['0.6', '0.00069', '0.05', '0.12']);
    expect([v.factor(5.4), v.factor(0.6), v.factor(1 / 1440)]).toEqual(['5,4', '0,6', '0,00069']);
    expect(n(v.factor(1440))).toBe('1.440');
  });

  it('axisPercent: whole signed %, 0% bare, compact from |v| >= 10000 and at most 8 characters up to the maximum (+79M% for a 1827-day ideal)', () => {
    expect([e.axisPercent(0), e.axisPercent(500), e.axisPercent(-50), e.axisPercent(1000)]).toEqual(['0%', '+500%', `${MINUS}50%`, '+1,000%']);
    expect(e.axisPercent(9999)).toBe('+9,999%');
    for (const val of [10_000, 144_000, -50_000, 1_234_567, 79_000_000, -99_900]) {
      for (const fm of [e, v]) {
        const s = fm.axisPercent(val);
        expect(s.length, `${val} -> ${s}`).toBeLessThanOrEqual(8);
        expect(s.endsWith('%')).toBe(true);
        expect(/^[+−]/.test(s)).toBe(true);
      }
    }
    expect(e.axisPercent(144_000)).toBe('+144K%');
    expect(n(v.axisPercent(144_000))).toMatch(/^\+144 ?N%$/);
    expect(e.axisPercent(-0)).toBe('0%');
  });
});

describe('M9 QC: curveYDomain properties (ARCH 4.5 / M9-AC2)', () => {
  const S = (a: readonly number[], b: readonly number[]) => Math.max(0, ...a, ...b) - Math.min(0, ...a, ...b);

  it('R1 so far: yMin in [-0.25 S, 0], yMax in [440, 440 + 0.25 S]', () => {
    const ideal = [1, 2, 3, 4.1];
    const you = [0, 100, 180, 440];
    const [lo, hi] = curveYDomain(ideal, you);
    const s = S(ideal, you);
    expect(lo).toBeGreaterThanOrEqual(-0.25 * s);
    expect(lo).toBeLessThanOrEqual(0);
    expect(hi).toBeGreaterThanOrEqual(440);
    expect(hi).toBeLessThanOrEqual(440 + 0.25 * s);
  });

  it('G2 so far -> yMin <= -50; G1 whole (ideal to 36.1, you 0) -> yMin <= 0 and yMax >= 36.1; all zeros -> yMax > yMin; empty -> contains 0', () => {
    expect(curveYDomain([1, 2, 47.4], [0, -50, -50, 0])[0]).toBeLessThanOrEqual(-50);
    const g1 = curveYDomain(Array.from({ length: 31 }, (_, i) => Math.round((1.01 ** (i + 1) - 1) * 1000) / 10), Array(9).fill(0));
    expect(g1[0]).toBeLessThanOrEqual(0);
    expect(g1[1]).toBeGreaterThanOrEqual(36.1);
    const z = curveYDomain([0, 0], [0, 0]);
    expect(z[1]).toBeGreaterThan(z[0]);
    const empty = curveYDomain([], []);
    expect(empty[0]).toBeLessThanOrEqual(0);
    expect(empty[1]).toBeGreaterThan(0);
  });

  it('300 random inputs: the domain always contains every value and 0, is finite and not degenerate; extreme inputs stay finite', () => {
    let x = 99;
    const r = () => ((x = (Math.imul(x, 1664525) + 1013904223) >>> 0) / 2 ** 32);
    for (let i = 0; i < 300; i++) {
      const mag = 10 ** Math.floor(r() * 9);
      const ideal = Array.from({ length: 1 + Math.floor(r() * 50) }, () => r() * mag * 0.01);
      const you = Array.from({ length: Math.floor(r() * 50) }, () => (r() - 0.3) * mag);
      const [lo, hi] = curveYDomain(ideal, you);
      expect(Number.isFinite(lo) && Number.isFinite(hi)).toBe(true);
      expect(lo).toBeLessThanOrEqual(Math.min(0, ...you));
      expect(hi).toBeGreaterThanOrEqual(Math.max(...ideal, ...you));
      expect(hi).toBeGreaterThan(lo);
    }
    const [a, b] = curveYDomain([7.9e7], [143900, -99.9]);
    expect(Number.isFinite(a) && Number.isFinite(b) && b >= 7.9e7).toBe(true);
  });
});
