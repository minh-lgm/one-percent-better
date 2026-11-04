// QC round 1 (M9), re-targeted to the v6.0 curve (burn-up of minutes, user decision 2026-11-02): copy and formatter checks written
// from DESIGN.md §7.1 / §7.6.4 and ARCH §4.5, independent of the dev's tests.
//  - every goal.detail.* / empty.detail.curve string equals the DESIGN table verbatim (en + vi)
//  - removed keys (M9: 3, v6: 4) are gone from both files and from src/ and e2e/
//  - en/vi use the same {{placeholders}}
//  - signed % / signed minutes / axis minute labels (7.1) incl. U+2212, -0 and the compact forms
//  - curveYDomain properties (M9-AC2) on random data, now cumulative minutes >= 0 (lower bound exactly 0)
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

describe('M9 QC: copy matches DESIGN v6.0 verbatim (FR-35, FR-36)', () => {
  const rows = designRows();
  // v6 key set: M9's 21 keys minus the 4 removed (subStart, legendZero, tooltipChange, tooltipBase) plus tooltipLogged (new) and
  // legendIdeal / tableIdeal / tableYou (text changed in v6).
  const m9Keys = [
    'goal.detail.headline', 'goal.detail.headlineDown', 'goal.detail.subDay', 'goal.detail.subToday', 'goal.detail.subEarlier',
    'goal.detail.chartCaption', 'goal.detail.legendIdeal', 'goal.detail.legendYou', 'goal.detail.chartSummary', 'goal.detail.chartSummaryEmpty', 'goal.detail.chartNote',
    'goal.detail.tooltipLogged', 'goal.detail.tooltipFlat', 'goal.detail.tooltipIdeal', 'goal.detail.labelIdeal', 'goal.detail.labelYou',
    'goal.detail.tableIdeal', 'goal.detail.tableYou', 'goal.detail.tableMinutes', 'goal.detail.tableChange', 'empty.detail.curve',
  ];

  it('the DESIGN table was parsed (all 21 v6 keys found)', () => {
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

  it('the 3 M9 + 4 v6 dropped keys are gone from en.json and vi.json and from src/ and e2e/ (not referenced by any spec or test of the team)', () => {
    const gone = [
      'goal.detail.headlineSub_one', 'goal.detail.headlineSub_other', 'goal.detail.tooltip',
      'goal.detail.subStart', 'goal.detail.legendZero', 'goal.detail.tooltipChange', 'goal.detail.tooltipBase',
    ];
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
          if (/headlineSub|goal\.detail\.tooltip['"`]|detail\.tooltip['"`)]|subStart|legendZero|tooltipChange|tooltipBase/.test(text)) hits.push(p);
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

  it('signedMinutes: whole minutes with + / U+2212 through format.minutes (`+12 min` / `−325 phút`), grouped, -0 and fractions round to a whole', () => {
    expect(e.signedMinutes(12)).toBe('+12 min');
    expect(e.signedMinutes(-325)).toBe(`${MINUS}325 min`);
    expect(e.signedMinutes(0)).toBe('+0 min');
    expect(e.signedMinutes(-0)).toBe('+0 min');
    expect(e.signedMinutes(-65.81203)).toBe(`${MINUS}66 min`); // R1 gap
    expect(e.signedMinutes(12.4)).toBe('+12 min');
    expect(e.signedMinutes(-0.4)).toBe('+0 min'); // rounds to 0 -> no minus sign
    expect(e.signedMinutes(143_900)).toBe('+143,900 min');
    expect(v.signedMinutes(12)).toBe('+12 phút');
    expect(v.signedMinutes(-325)).toBe(`${MINUS}325 phút`);
    expect(n(v.signedMinutes(143_900))).toBe('+143.900 phút');
    expect(v.signedMinutes(-0)).toBe('+0 phút');
    for (const s of [e.signedMinutes(-12), v.signedMinutes(-12)]) expect(s.includes('-')).toBe(false);
  });

  it('signed0: the table body of signedMinutes (no unit): `+12`, `−325`, `+0`, grouped per locale', () => {
    expect([e.signed0(12), e.signed0(-325), e.signed0(0), e.signed0(-0), e.signed0(1440), e.signed0(-1440)]).toEqual(['+12', `${MINUS}325`, '+0', '+0', '+1,440', `${MINUS}1,440`]);
    expect(e.signed0(-65.81203)).toBe(`${MINUS}66`);
    expect(e.signed0(0.4)).toBe('+0');
    expect([v.signed0(12), v.signed0(-325), v.signed0(-0)]).toEqual(['+12', `${MINUS}325`, '+0']);
    expect(n(v.signed0(-1440))).toBe(`${MINUS}1.440`);
    expect(n(v.signed0(143_900))).toBe('+143.900');
    for (const s of [e.signed0(-12), v.signed0(-12)]) expect(s.includes('-')).toBe(false);
  });

  it('axisMinutes: whole minutes without sign or unit, 0 bare, grouped below 10,000, compact from 10,000 and at most 6 characters up to 7.9e10 (the 1827-day ideal of a 1,440-min target)', () => {
    expect([e.axisMinutes(0), e.axisMinutes(500), e.axisMinutes(1000), e.axisMinutes(9999)]).toEqual(['0', '500', '1,000', '9,999']);
    expect([v.axisMinutes(0), v.axisMinutes(500), n(v.axisMinutes(1000)), n(v.axisMinutes(9999))]).toEqual(['0', '500', '1.000', '9.999']);
    expect(e.axisMinutes(144_000)).toBe('144K');
    expect(e.axisMinutes(10_000)).toBe('10K');
    expect(n(v.axisMinutes(144_000))).toMatch(/^144 ?N$/);
    // Note (QC, informational): `axisMinutes(-0)` prints Intl's "-0"; unreachable from `curveYScale` (ticks start at +0, step >= 1).
    const samples = [0, 1, 5, 42, 500, 999, 1000, 1441, 9999, 10_000, 10_500, 99_999, 100_000, 144_000, 999_999, 1_000_000, 1_234_567, 9_999_999, 99_999_999, 100_000_000, 999_999_999, 2_300_000_000, 7.9e10];
    for (let i = 0; i < 200; i++) samples.push(Math.floor(7.9e10 ** (i / 199)));
    for (const val of samples) {
      for (const fm of [e, v]) {
        const s = fm.axisMinutes(val);
        expect(s.length, `${fm.locale} ${val} -> ${s}`).toBeLessThanOrEqual(6);
        expect(s, `${fm.locale} ${val} -> ${s}`).not.toMatch(/[+−-]/);
        expect(s, `${fm.locale} ${val} -> ${s}`).not.toMatch(/min|phút|%/);
        expect(/^\d/.test(s), `${fm.locale} ${val} -> ${s}`).toBe(true);
      }
    }
  });
});

describe('M9 QC: curveYDomain properties (ARCH 4.5 / M9-AC2), unit = cumulative minutes >= 0', () => {
  const S = (a: readonly number[], b: readonly number[]) => Math.max(0, ...a, ...b) - Math.min(0, ...a, ...b);
  const cum = (T: number, k: number) => (T * (1.01 ** k - 1)) / 0.01;

  it('R1 so far (ideal 30..121.8, you 5..56): yMin exactly 0, yMax in [121.8, 121.8 + 0.25 S]', () => {
    const ideal = [30, 60.3, 90.903, 121.81203];
    const you = [5, 15, 29, 56];
    const [lo, hi] = curveYDomain(ideal, you);
    const s = S(ideal, you);
    expect(lo).toBe(0);
    expect(hi).toBeGreaterThanOrEqual(121.81203);
    expect(hi).toBeLessThanOrEqual(121.81203 + 0.25 * s);
  });

  it('G1 whole (ideal to 1,077, you 0..240) -> yMin = 0, yMax >= 1,077; R4 (you 1441 above ideal 60.3) -> yMax >= 1441; all zeros -> yMax > yMin; empty -> [0, > 0]', () => {
    const g1 = curveYDomain(Array.from({ length: 31 }, (_, i) => cum(30, i + 1)), [30, 60, 90, 120, 150, 180, 210, 240, 240]);
    expect(g1[0]).toBe(0);
    expect(g1[1]).toBeGreaterThanOrEqual(cum(30, 31));
    const r4 = curveYDomain([30, 60.3], [1, 1441]);
    expect(r4[0]).toBe(0);
    expect(r4[1]).toBeGreaterThanOrEqual(1441);
    const z = curveYDomain([0, 0], [0, 0]);
    expect(z[0]).toBe(0);
    expect(z[1]).toBeGreaterThan(z[0]);
    const empty = curveYDomain([], []);
    expect(empty[0]).toBe(0);
    expect(empty[1]).toBeGreaterThan(0);
  });

  it('300 random inputs (minutes >= 0): the lower bound is exactly 0, the domain contains every value, is finite and not degenerate; extreme inputs stay finite', () => {
    let x = 99;
    const r = () => ((x = (Math.imul(x, 1664525) + 1013904223) >>> 0) / 2 ** 32);
    for (let i = 0; i < 300; i++) {
      const mag = 10 ** Math.floor(r() * 11);
      const ideal = Array.from({ length: 1 + Math.floor(r() * 50) }, () => r() * mag);
      const you = Array.from({ length: Math.floor(r() * 50) }, () => Math.floor(r() * mag));
      const [lo, hi] = curveYDomain(ideal, you);
      expect(Number.isFinite(lo) && Number.isFinite(hi)).toBe(true);
      expect(lo).toBe(0);
      expect(hi).toBeGreaterThanOrEqual(Math.max(...ideal, ...you));
      expect(hi).toBeGreaterThan(lo);
      // 5 % padding, then rounded up to a nice step (1, 2, 5 x 10^n, >= 1) of at most hi/2: never beyond ~1.6 x max (+1 for tiny inputs)
      expect(hi).toBeLessThanOrEqual(Math.max(1, ...ideal, ...you) * 1.6 + 1);
    }
    const [a, b] = curveYDomain([7.9e10], [1441, 0]);
    expect(a).toBe(0);
    expect(Number.isFinite(b) && b >= 7.9e10).toBe(true);
  });
});
