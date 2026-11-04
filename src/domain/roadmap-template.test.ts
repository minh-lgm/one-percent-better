// M20-AC1 (FR-76, A-86): the "QPT 21 weeks" template — content verbatim from the tracker (vi) and DESIGN §7.9.3 (en),
// dates of ARCHITECTURE §4.8 e, across a year boundary and the 2028 leap day.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { daysInclusive } from './dates';
import { validateCheckpointInput, validateItemInput, validatePhaseInput, validateRoadmapInput } from './roadmap';
import { roadmapView, roadmapWeekOf } from './roadmap-progress';
import { buildQptTemplate, QPT_TEMPLATE, qptWeekEnd, qptWeekStart, type TemplateIds } from './roadmap-template';

const tracker = readFileSync(new URL('../../docs/plan/ref/qpt-tracker.html', import.meta.url), 'utf8');
const design = readFileSync(new URL('../../docs/design/DESIGN.md', import.meta.url), 'utf8');

/** The tracker's `PHASES` literal (plain JS data: name, course, weeks) evaluated as-is. */
function trackerPhases(): Array<{ name: string; course: string; weeks: string[] }> {
  const start = tracker.indexOf('const PHASES = [');
  const end = tracker.indexOf('];', start);
  const literal = tracker.slice(start + 'const PHASES = '.length, end + 1);
  return new Function(`return ${literal};`)() as Array<{ name: string; course: string; weeks: string[] }>;
}

/** DESIGN §7.9.3 table cell by row label (first column) → [vi, en] with the backticks removed. */
function designRow(label: string): { vi: string; en: string } {
  const section = design.slice(design.indexOf('#### 7.9.3'), design.indexOf('#### 7.9.4'));
  const line = section.split('\n').find((l) => l.startsWith(`| ${label} |`));
  if (!line) throw new Error(`no DESIGN 7.9.3 row ${label}`);
  const cells = line.split('|').slice(1, -1).map((c) => c.trim());
  const strip = (c: string) => c.replace(/^`|`$/g, '');
  const vi = strip(cells[1]!);
  const en = cells[2] === 'giống' ? vi : strip(cells[2]!);
  return { vi, en };
}

const ids: TemplateIds = (kind, n) => `${kind}-${n}`;
const NOW = '2026-11-04T03:00:00.000Z';

describe('buildQptTemplate (M20-AC1)', () => {
  it('vi, start 2026-10-27: one roadmap (480 min, "Thi QPT" on 2027-03-09, 7-line note headed "Nhịp học mỗi tuần"), 5 phases, 21 items, 5 checkpoints', () => {
    const t = buildQptTemplate('2026-10-27', 'vi', ids, NOW);
    expect(t.roadmap).toEqual({
      id: 'roadmap-1',
      title: 'QPT 21 tuần',
      note: 'Nhịp học mỗi tuần\nThứ 2–4: 1h/tối · video + ghi chú tay\nThứ 5: 1h · quiz, ghi câu sai vào sổ lỗi\nThứ 7: 2h · lab + 10–15 bài tập ngoài\nChủ nhật: 1h · ôn sổ lỗi, tick tuần\nThứ 6: Buffer\nQuiz chưa đạt 80% thì chưa sang module mới.',
      goalId: null,
      weeklyTargetMinutes: 480,
      milestoneLabel: 'Thi QPT',
      milestoneDate: '2027-03-09',
      createdAt: NOW,
      updatedAt: NOW,
    });
    const lines = t.roadmap.note.split('\n');
    expect(lines).toHaveLength(7);
    expect(lines[0]).toBe('Nhịp học mỗi tuần');
    expect(lines[6]).toBe('Quiz chưa đạt 80% thì chưa sang module mới.');
    // DESIGN §7.9.3 note cell, line by line (separated by " / ")
    expect(lines).toEqual(designRow('Ghi chú lộ trình (nhịp học; xuống dòng bằng `\\n`)').vi.split('` / `'));
    expect(t.phases.map((p) => [p.title, p.note, p.position])).toEqual([
      ['Phase 1 · Linear Algebra', 'Course 1 · 34h', 0],
      ['Phase 2 · Calculus', 'Course 2 · 27h', 1],
      ['Phase 3 · Probability & Statistics', 'Course 3 · 33h', 2],
      ['Phase 4 · Differential Equations', 'HKUST · Chasnov', 3],
      ['Phase 5 · Lấp lỗ hổng & thi QPT', 'Mock + hồ sơ', 4],
    ]);
    expect(t.items).toHaveLength(21);
    expect(t.items.map((i) => i.phaseId)).toEqual([1, 1, 1, 1, 2, 2, 2, 2, 3, 3, 3, 3, 4, 4, 4, 4, 5, 5, 5, 5, 5].map((p) => `phase-${p}`));
    expect(t.items.every((i) => daysInclusive(i.plannedStart, i.plannedEnd) === 7 && i.note === '' && i.actualStart === null && i.actualEnd === null)).toBe(true);
    // consecutive weeks, no gap, no overlap
    for (let k = 1; k < 21; k += 1) expect(daysInclusive(t.items[k - 1]!.plannedEnd, t.items[k]!.plannedStart)).toBe(2);
    expect([t.items[0]!.plannedStart, t.items[0]!.plannedEnd]).toEqual(['2026-10-27', '2026-11-02']);
    expect(t.items[7]!.plannedEnd).toBe('2026-12-21');
    expect(t.items[15]!.plannedEnd).toBe('2027-02-15');
    expect(t.items[17]!.plannedEnd).toBe('2027-03-01');
    expect(t.items[18]!.plannedEnd).toBe('2027-03-08');
    expect(t.items[19]).toMatchObject({ title: 'Thi QPT chính thức', plannedStart: '2027-03-09', plannedEnd: '2027-03-15' });
    expect(t.items[20]!.plannedEnd).toBe('2027-03-22');
    expect(t.checkpoints.map((c) => [c.title, c.date, c.maxScore, c.threshold, c.note, c.score])).toEqual([
      ['Diagnostic', '2026-10-27', 32, null, '', null],
      ['Checkpoint 1', '2026-12-21', 32, null, '≥ 3/4 mỗi mảng LA, Calc', null],
      ['Checkpoint 2', '2027-02-15', 32, 20, '', null],
      ['Mock 1', '2027-03-01', 32, 24, '', null],
      ['Mock 2', '2027-03-08', 32, 26, '', null],
    ]);
    // 32 rows, all stamped `now`, every child points at the roadmap
    const rows = [t.roadmap, ...t.phases, ...t.items, ...t.checkpoints];
    expect(rows).toHaveLength(32);
    expect(new Set(rows.map((r) => r.id)).size).toBe(32);
    expect(rows.every((r) => r.createdAt === NOW && r.updatedAt === NOW)).toBe(true);
    expect([...t.phases, ...t.items, ...t.checkpoints].every((r) => r.roadmapId === 'roadmap-1')).toBe(true);
  });

  it('vi item titles and phases are verbatim the PHASES[].weeks of docs/plan/ref/qpt-tracker.html (read from the file)', () => {
    const phases = trackerPhases();
    expect(phases).toHaveLength(5);
    const t = buildQptTemplate('2026-10-27', 'vi', ids, NOW);
    expect(t.items.map((i) => i.title)).toEqual(phases.flatMap((p) => p.weeks));
    expect(t.phases.map((p) => [p.title, p.note])).toEqual(phases.map((p) => [p.name, p.course]));
    expect(QPT_TEMPLATE.vi.phases.map(([, , n]) => n)).toEqual(phases.map((p) => p.weeks.length));
    // the rhythm block and the checkpoint names / note of the tracker
    for (const line of QPT_TEMPLATE.vi.noteLines.slice(1, 6)) {
      const [day, text] = line.split(': ');
      expect(tracker).toContain(`<span>${day}</span><span>${text}</span>`);
    }
    expect(tracker).toContain('<h2>Nhịp học mỗi tuần</h2>');
    expect(tracker).toContain(QPT_TEMPLATE.vi.noteLines[6]);
    expect(tracker).toContain('note:"≥ 3/4 mỗi mảng LA, Calc"');
    for (const c of t.checkpoints) expect(tracker).toContain(`name:"${c.title}"`);
  });

  it('en: same structure, dates and numbers; DESIGN §7.9.3 en text; nothing Vietnamese left', () => {
    const vi = buildQptTemplate('2026-10-27', 'vi', ids, NOW);
    const en = buildQptTemplate('2026-10-27', 'en', ids, NOW);
    expect(en.roadmap).toMatchObject({ title: 'QPT 21 weeks', milestoneLabel: 'QPT exam', weeklyTargetMinutes: 480, milestoneDate: '2027-03-09' });
    const lines = en.roadmap.note.split('\n');
    expect(lines).toHaveLength(7);
    expect(lines[0]).toBe('Weekly rhythm');
    expect(lines).toEqual(designRow('Ghi chú lộ trình (nhịp học; xuống dòng bằng `\\n`)').en.split('` / `'));
    const strip = (a: typeof vi) => ({
      phases: a.phases.map(({ title: _t, note: _n, ...rest }) => rest),
      items: a.items.map(({ title: _t, ...rest }) => rest),
      checkpoints: a.checkpoints.map(({ note: _n, ...rest }) => rest),
    });
    expect(strip(en)).toEqual(strip(vi));
    // W1 … W21 and phases against the DESIGN rows ("giống" = same as vi)
    en.items.forEach((item, i) => expect(item.title, `W${i + 1}`).toBe(designRow(`W${i + 1}`).en));
    expect(en.phases[4]).toMatchObject({ title: 'Phase 5 · Close the gaps & sit the QPT', note: 'Mock + application' });
    expect(en.checkpoints[1]!.note).toBe('≥ 3/4 per area: LA, Calc');
    expect(en.items[19]!.title).toBe('Official QPT exam');
    const text = JSON.stringify(en);
    for (const viText of ['Lấp lỗ hổng', 'Thi QPT chính thức', 'tuần', 'Nhịp học', 'hồ sơ', 'mỗi mảng']) expect(text).not.toContain(viText);
    // no Vietnamese-only letters at all
    expect(text).not.toMatch(/[ăâđêôơưàáảãạằắẳẵặầấẩẫậèéẻẽẹềếểễệìíỉĩịòóỏõọồốổỗộờớởỡợùúủũụừứửữựỳýỷỹỵ]/i);
  });

  it('start 2027-12-27 crosses the year: W1 ends 2028-01-02, the leap day 2028-02-29 falls inside W10, every item still 7 days', () => {
    const t = buildQptTemplate('2027-12-27', 'en', ids, NOW);
    expect(t.items[0]).toMatchObject({ plannedStart: '2027-12-27', plannedEnd: '2028-01-02' });
    expect(t.items[8]).toMatchObject({ plannedStart: '2028-02-21', plannedEnd: '2028-02-27' });
    expect(t.items[9]).toMatchObject({ plannedStart: '2028-02-28', plannedEnd: '2028-03-05' });
    expect(t.items[7]!.plannedEnd).toBe('2028-02-20');
    expect(t.items[15]!.plannedEnd).toBe('2028-04-16');
    expect(t.items[19]).toMatchObject({ plannedStart: '2028-05-08', plannedEnd: '2028-05-14' });
    expect(t.items[20]!.plannedEnd).toBe('2028-05-21');
    expect(t.roadmap.milestoneDate).toBe('2028-05-08'); // one day earlier in the calendar than a non-leap run
    expect(t.checkpoints.map((c) => c.date)).toEqual(['2027-12-27', '2028-02-20', '2028-04-16', '2028-04-30', '2028-05-07']);
    expect(t.items.every((i) => daysInclusive(i.plannedStart, i.plannedEnd) === 7)).toBe(true);
    expect(qptWeekStart('2027-12-27', 10)).toBe('2028-02-28');
    expect(qptWeekEnd('2027-12-27', 21)).toBe('2028-05-21');
  });

  it('every row passes the domain validation (the same limits as the form, the backup file and the cloud mapper)', () => {
    for (const locale of ['en', 'vi'] as const) {
      const t = buildQptTemplate('2026-10-27', locale, ids, NOW);
      const r = t.roadmap;
      expect(validateRoadmapInput({ title: r.title, note: r.note, goalId: null, weeklyTargetHours: r.weeklyTargetMinutes! / 60, milestoneLabel: r.milestoneLabel, milestoneDate: r.milestoneDate }).ok).toBe(true);
      for (const p of t.phases) expect(validatePhaseInput(p).ok).toBe(true);
      for (const i of t.items) expect(validateItemInput(i, '2026-11-04').ok).toBe(true);
      for (const c of t.checkpoints) expect(validateCheckpointInput(c).ok).toBe(true);
    }
  });

  it('A-91 week column: CP1 W8, CP2 W16, Mock 1 W18, Mock 2 W19, Diagnostic W1; a date outside the roadmap → null', () => {
    const t = buildQptTemplate('2026-10-27', 'vi', ids, NOW);
    const v = roadmapView(t, null, [], '2026-11-04');
    expect(v.checkpoints.map((c) => roadmapWeekOf(v.overview, c.date))).toEqual([1, 8, 16, 18, 19]);
    expect(roadmapWeekOf(v.overview, '2026-09-24')).toBeNull();
    expect(roadmapWeekOf(v.overview, '2027-03-22')).toBe(21);
    expect(roadmapWeekOf(v.overview, '2027-03-23')).toBeNull();
    expect(roadmapWeekOf({ start: null, end: null }, '2026-11-04')).toBeNull();
  });
});
