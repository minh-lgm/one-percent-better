// QC round 1 (M20): independent verbatim check of src/i18n/resources/roadmap.{en,vi}.json against DESIGN v8.0 §7.9.2 (all milestones M17 + M19 + M20 rows),
// plus the two FR-80 keys of §7.9.1 in the main resources. Parsed from the DESIGN table, not from the dev's parity test.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = join(__dirname, '..', '..');
const read = (p: string) => readFileSync(join(root, p), 'utf8');
type Json = { [k: string]: string | Json };
const flatten = (o: Json, prefix = ''): Record<string, string> =>
  Object.entries(o).reduce<Record<string, string>>((acc, [k, v]) => {
    if (typeof v === 'string') acc[prefix + k] = v;
    else Object.assign(acc, flatten(v, `${prefix}${k}.`));
    return acc;
  }, {});
const en = flatten(JSON.parse(read('src/i18n/resources/roadmap.en.json')) as Json);
const vi = flatten(JSON.parse(read('src/i18n/resources/roadmap.vi.json')) as Json);
const mainEn = flatten(JSON.parse(read('src/i18n/resources/en.json')) as Json);
const mainVi = flatten(JSON.parse(read('src/i18n/resources/vi.json')) as Json);

const design = read('docs/design/DESIGN.md').split(/\r?\n/);
const start = design.findIndex((l) => l.startsWith('#### 7.9.2'));
const end = design.findIndex((l, i) => i > start && /^#{2,4} /.test(l) && !l.startsWith('#### 7.9.2') && /7\.9\.3|7\.10/.test(l));
const strip = (c: string) => c.trim().replace(/^`/, '').replace(/`$/, '');

interface Row { key: string; ms: string; en: string; vi: string }
const rows: Row[] = [];
for (const line of design.slice(start, end > start ? end : undefined)) {
  const m = /^\| `([A-Za-z0-9_.]+)` \| \*{0,2}(M\d+)\b/.exec(line) // v8.3: DESIGN may bold the MS cell;
  if (!m) continue;
  const cells = line.replace(/\|\s*$/, '').split('|').map((c) => c.trim());
  const e = strip(cells[cells.length - 2]);
  let v = strip(cells[cells.length - 1]);
  if (/^— ?\(= ?en\)$|^\(= ?en\)$|^.* \(= en\)$/.test(v)) v = e.length ? e : v;
  rows.push({ key: m[1], ms: m[2], en: e, vi: cells[cells.length - 1].includes('(= en)') ? e : v });
}

describe('M20 QC: roadmap namespace == DESIGN 7.9.2 verbatim', () => {
  const live = rows.filter((r) => r.ms === 'M17' || r.ms === 'M19' || r.ms === 'M20' || r.ms === 'M21');
  it('parsed a plausible number of rows', () => {
    expect(live.length).toBeGreaterThan(150);
  });
  it('every M17/M19/M20 en value equals DESIGN', () => {
    const bad = live.filter((r) => en[r.key] !== r.en).map((r) => `${r.key}: ${JSON.stringify(en[r.key])} != ${JSON.stringify(r.en)}`);
    expect(bad).toEqual([]);
  });
  it('every M17/M19/M20 vi value equals DESIGN (rows with an empty vi cell are plural-only en keys)', () => {
    const bad = live.filter((r) => r.vi !== '' && !(r.vi === '—' && /_one$/.test(r.key)) && vi[r.key] !== r.vi).map((r) => `${r.key}: ${JSON.stringify(vi[r.key])} != ${JSON.stringify(r.vi)}`);
    expect(bad).toEqual([]);
  });
  it('no M17/M19/M20 DESIGN key is missing in the resources', () => {
    expect(live.filter((r) => !(r.key in en)).map((r) => r.key)).toEqual([]);
  });
  it('resources contain no key that DESIGN 7.9.2 does not list (extra keys)', () => {
    const known = new Set(rows.map((r) => r.key));
    expect(Object.keys(en).filter((k) => !known.has(k) && !['importLine', 'importLineKept'].includes(k)) /* M17 keys moved from 7.9.1 to the namespace (accepted at M17) */).toEqual([]);
  });
  it('M20 rows present (count) and every M20 key exists in both languages', () => {
    const m20 = rows.filter((r) => r.ms === 'M20' || r.ms === 'M21');
    expect(m20.length).toBeGreaterThan(40);
    expect(m20.filter((r) => !(r.key in en) || (!/_one$/.test(r.key) && !(r.key in vi))).map((r) => r.key)).toEqual([]);
  });
});

describe('M20 QC: FR-80 keys in the main resources (7.9.1)', () => {
  it('goal.detail.roadmapLabel / goal.delete.roadmapNote', () => {
    expect(mainEn['goal.detail.roadmapLabel']).toBe('Part of roadmap');
    expect(mainVi['goal.detail.roadmapLabel']).toBe('Thuộc lộ trình');
    expect(mainEn['goal.delete.roadmapNote']).toBe(
      'This goal is part of the roadmap "{{title}}". The roadmap stays, but it loses its link and shows study time as —.',
    );
    expect(mainVi['goal.delete.roadmapNote']).toBe(
      'Mục tiêu này thuộc lộ trình "{{title}}". Lộ trình vẫn được giữ, nhưng sẽ mất liên kết và hiện giờ học là —.',
    );
  });
});
