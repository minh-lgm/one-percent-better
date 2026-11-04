// QC round 1 (M20): independent oracle for the QPT template (AC1) and RoadmapService.createFromQptTemplate (AC2).
// Oracles are read from the reference files (tracker HTML, DESIGN 7.9.3), plus hand-written dates from TASKS.
import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { DexieGoalRepository } from '../../src/data/dexie/goal-repo';
import { DexieRoadmapRepository } from '../../src/data/dexie/roadmap-repo';
import type { AppDatabase } from '../../src/data/dexie/db';
import { isValidISODate } from '../../src/domain/dates';
import { buildQptTemplate } from '../../src/domain/roadmap-template';
import { RoadmapService } from '../../src/services/roadmap-service';
import { buildGoal, FIXED_NOW_Q1 } from '../../src/test/builders';
import { createTestDatabase } from '../../src/test/db';

const HTML = readFileSync(new URL('../../docs/plan/ref/qpt-tracker.html', import.meta.url), 'utf8');
const DESIGN = readFileSync(new URL('../../docs/design/DESIGN.md', import.meta.url), 'utf8');
const phasesLiteral = /const PHASES = (\[[\s\S]*?\n\]);/.exec(HTML)![1]!;
const PHASES = new Function(`return ${phasesLiteral}`)() as Array<{ name: string; course: string; weeks: string[] }>;
const ids = (kind: string, n: number) => `${kind[0]}${n}`;
const NOW = '2026-11-04T03:00:00.000Z';

const noteRow = DESIGN.split('\n').find((l) => l.startsWith('| Ghi chú lộ trình (nhịp học'))!;
const noteCells = noteRow.split('|').map((c) => c.trim());
const cellLines = (c: string) => c.split(' / ').map((s) => s.replace(/^`|`$/g, ''));
const days = (a: string, b: string) => (Date.parse(b) - Date.parse(a)) / 864e5;

describe('M20-AC1 buildQptTemplate', () => {
  const t = buildQptTemplate('2026-10-27', 'vi', ids, NOW);
  it('roadmap row', () => {
    expect(t.roadmap).toMatchObject({ title: 'QPT 21 tuần', weeklyTargetMinutes: 480, milestoneLabel: 'Thi QPT', milestoneDate: '2027-03-09', goalId: null });
    const lines = t.roadmap.note.split('\n');
    expect(lines).toHaveLength(7);
    expect(lines[0]).toBe('Nhịp học mỗi tuần');
    expect(lines[6]).toBe('Quiz chưa đạt 80% thì chưa sang module mới.');
    expect(lines).toEqual(cellLines(noteCells[2]!));
  });
  it('phases + 21 items verbatim from the tracker', () => {
    expect(t.phases).toHaveLength(5);
    expect(t.phases.map((p) => [p.title, p.note])).toEqual(PHASES.map((p) => [p.name, p.course]));
    const trackerWeeks = PHASES.flatMap((p) => p.weeks);
    expect(trackerWeeks).toHaveLength(21);
    expect(t.items.map((i) => i.title)).toEqual(trackerWeeks);
    const pid = t.phases.map((p) => p.id);
    expect(t.items.map((i) => pid.indexOf(i.phaseId))).toEqual([0, 0, 0, 0, 1, 1, 1, 1, 2, 2, 2, 2, 3, 3, 3, 3, 4, 4, 4, 4, 4]);
    expect(new Set(t.items.map((i) => i.id)).size).toBe(21);
  });
  it('dates', () => {
    const w = t.items;
    expect([w[0]!.plannedStart, w[0]!.plannedEnd]).toEqual(['2026-10-27', '2026-11-02']);
    expect(w[7]!.plannedEnd).toBe('2026-12-21');
    expect(w[15]!.plannedEnd).toBe('2027-02-15');
    expect(w[17]!.plannedEnd).toBe('2027-03-01');
    expect(w[18]!.plannedEnd).toBe('2027-03-08');
    expect([w[19]!.plannedStart, w[19]!.plannedEnd]).toEqual(['2027-03-09', '2027-03-15']);
    expect(w[20]!.plannedEnd).toBe('2027-03-22');
    for (const i of w) expect(days(i.plannedStart, i.plannedEnd)).toBe(6);
    for (let k = 1; k < 21; k++) expect(days(w[k - 1]!.plannedStart, w[k]!.plannedStart)).toBe(7);
    for (const i of w) expect([i.actualStart, i.actualEnd]).toEqual([null, null]);
  });
  it('5 checkpoints', () => {
    expect(t.checkpoints.map((c) => [c.title, c.date, c.maxScore, c.threshold, c.note, c.score])).toEqual([
      ['Diagnostic', '2026-10-27', 32, null, '', null],
      ['Checkpoint 1', '2026-12-21', 32, null, '≥ 3/4 mỗi mảng LA, Calc', null],
      ['Checkpoint 2', '2027-02-15', 32, 20, '', null],
      ['Mock 1', '2027-03-01', 32, 24, '', null],
      ['Mock 2', '2027-03-08', 32, 26, '', null],
    ]);
    expect(1 + t.phases.length + t.items.length + t.checkpoints.length).toBe(32);
  });
  it('en: same structure, dates, numbers; no Vietnamese', () => {
    const e = buildQptTemplate('2026-10-27', 'en', ids, NOW);
    expect(e.roadmap).toMatchObject({ title: 'QPT 21 weeks', weeklyTargetMinutes: 480, milestoneLabel: 'QPT exam', milestoneDate: '2027-03-09' });
    expect(e.roadmap.note.split('\n')).toEqual(cellLines(noteCells[3]!));
    expect(e.roadmap.note.split('\n')[0]).toBe('Weekly rhythm');
    expect(e.items.map((i) => [i.plannedStart, i.plannedEnd])).toEqual(t.items.map((i) => [i.plannedStart, i.plannedEnd]));
    expect(e.checkpoints.map((c) => [c.date, c.maxScore, c.threshold])).toEqual(t.checkpoints.map((c) => [c.date, c.maxScore, c.threshold]));
    const all = JSON.stringify(e);
    expect(all).not.toMatch(/Lấp lỗ hổng|Thi QPT chính thức|tuần|hồ sơ|Buffer Noel/);
    expect(all).not.toMatch(/[àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđ]/i);
    const rows = DESIGN.split('\n')
      .filter((l) => /^\| W\d+ \|/.test(l))
      .map((l) => l.split('|').map((c) => c.trim()));
    expect(rows).toHaveLength(21);
    expect(e.items.map((i) => i.title)).toEqual(rows.map((r, k) => (r[3] === 'giống' ? t.items[k]!.title : r[3]!.replace(/^`|`$/g, ''))));
    expect(e.phases.map((p) => [p.title, p.note])).toContainEqual(['Phase 5 · Close the gaps & sit the QPT', 'Mock + application']);
  });
  it('cross-year + leap year', () => {
    const y = buildQptTemplate('2027-12-27', 'vi', ids, NOW);
    expect([y.items[0]!.plannedStart, y.items[0]!.plannedEnd]).toEqual(['2027-12-27', '2028-01-02']);
    expect([y.items[9]!.plannedStart, y.items[9]!.plannedEnd]).toEqual(['2028-02-28', '2028-03-05']);
    expect(y.items[20]!.plannedEnd).toBe('2028-05-21');
    const leap = buildQptTemplate('2028-02-29', 'en', ids, NOW);
    expect(leap.items[0]!.plannedEnd).toBe('2028-03-06');
    expect(leap.roadmap.milestoneDate).toBe('2028-07-11');
    expect(buildQptTemplate('1999-12-31', 'vi', ids, NOW).items[0]!.plannedEnd).toBe('2000-01-06');
  });
});

describe('M20-AC2 service', () => {
  let db: AppDatabase;
  let repo: DexieRoadmapRepository;
  let goals: DexieGoalRepository;
  let service: RoadmapService;
  let n = 0;
  const counts = async () => [await db.roadmaps.count(), await db.roadmapPhases.count(), await db.roadmapItems.count(), await db.roadmapCheckpoints.count()];
  const make = (goalId: string | null, startDate = '2026-10-27', locale: 'en' | 'vi' = 'vi') => service.createFromQptTemplate({ startDate, goalId, locale }, '2026-11-04');
  beforeEach(async () => {
    db = createTestDatabase();
    await db.open();
    n = 0;
    repo = new DexieRoadmapRepository(db, { clock: () => FIXED_NOW_Q1 });
    goals = new DexieGoalRepository(db, () => FIXED_NOW_Q1);
    service = new RoadmapService({ roadmaps: repo, goals, clock: () => FIXED_NOW_Q1, newId: () => `u${++n}` });
    await db.goals.put(buildGoal({ id: 'gq', name: 'QPT study' }));
  });
  afterEach(() => db.delete());

  it('32 rows in one transaction with goal, all dirty', async () => {
    const r = await make('gq');
    expect(r.ok && r.value.goalId).toBe('gq');
    expect(await counts()).toEqual([1, 5, 21, 5]);
    expect((await db.roadmapItems.toArray()).every((x) => x.dirty === 1)).toBe(true);
  });
  it('failure probe in the checkpoint table leaves 0 rows everywhere', async () => {
    db.roadmapCheckpoints.hook('creating', () => {
      throw new Error('probe');
    });
    await expect(make(null)).rejects.toThrow();
    expect(await counts()).toEqual([0, 0, 0, 0]);
  });
  it('failure probe in the items table leaves 0 rows everywhere', async () => {
    db.roadmapItems.hook('creating', () => {
      throw new Error('probe');
    });
    await expect(make(null, '2026-10-27', 'en')).rejects.toThrow();
    expect(await counts()).toEqual([0, 0, 0, 0]);
  });
  it('A-78: goal already linked -> error, 0 new rows', async () => {
    await make('gq');
    const r = await make('gq');
    expect(!r.ok && r.errors[0]!.code).toBe('ROADMAP_GOAL_ALREADY_LINKED');
    expect(await counts()).toEqual([1, 5, 21, 5]);
  });
  it('two templates without goal both succeed', async () => {
    await make(null);
    await make(null, '2026-11-03');
    expect(await counts()).toEqual([2, 10, 42, 10]);
  });
  it('20 roadmaps -> ROADMAP_LIMIT_REACHED, nothing written; bad dates rejected', async () => {
    for (let i = 0; i < 20; i++) expect((await make(null, '2026-10-27', 'en')).ok).toBe(true);
    const r = await make(null, '2026-10-27', 'en');
    expect(!r.ok && r.errors[0]!.code).toBe('ROADMAP_LIMIT_REACHED');
    expect(await counts()).toEqual([20, 100, 420, 100]);
    await db.roadmaps.clear();
    for (const bad of ['', '2026-13-01', '2026-02-29', '2026-2-3', 'x']) {
      const b = await make(null, bad, 'en');
      expect(!b.ok && b.errors[0]!.code, bad).toBe('ROADMAP_DATE_INVALID');
    }
  });
  it('start dates at the low end and the leap day are written whole', async () => {
    for (const d of ['0001-01-01', '2028-02-29']) {
      const r = await make(null, d);
      expect(r.ok, d).toBe(true);
    }
    expect(await counts()).toEqual([2, 10, 42, 10]);
  });
  // M20-D1 (FIXED in b1e5fb6, r2 flipped from it.fails): a start date whose 21 weeks would cross into year 10000 is refused.
  it('M20-D1: start 9999-12-31 is refused (ROADMAP_DATE_INVALID, 0 rows)', async () => {
    const r = await make(null, '9999-12-31');
    expect(!r.ok && r.errors[0]!.code).toBe('ROADMAP_DATE_INVALID');
    expect(await counts()).toEqual([0, 0, 0, 0]);
  });
  it('M20-D1 boundary: 9999-08-07 is accepted with only valid ISO dates; 9999-08-08 is refused', async () => {
    const bad = await make(null, '9999-08-08');
    expect(!bad.ok && bad.errors[0]!.code).toBe('ROADMAP_DATE_INVALID');
    expect(await counts()).toEqual([0, 0, 0, 0]);
    const ok = await make(null, '9999-08-07');
    expect(ok.ok).toBe(true);
    expect(await counts()).toEqual([1, 5, 21, 5]);
    const dates = [...(await db.roadmapItems.toArray()).flatMap((i) => [i.plannedStart, i.plannedEnd]), ...(await db.roadmapCheckpoints.toArray()).map((c) => c.date), ...(await db.roadmaps.toArray()).map((x) => x.milestoneDate ?? '9999-01-01')];
    expect(dates.filter((x) => !isValidISODate(x) || !/^\d{4}-\d{2}-\d{2}$/.test(x))).toEqual([]);
    const items = await db.roadmapItems.toArray();
    expect(items.map((i) => i.plannedEnd).sort().at(-1)).toBe('9999-12-31');
  });
});
