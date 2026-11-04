// M17-AC7 (FR-77, ADR-49, ARCH §4.8 f): parseBackup reads schemaVersion 1 and 2, validates the roadmap rows strictly
// and checks their referential integrity.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { datasetQ1, TODAY_Q1 } from '../test/builders';
import { parseBackup } from './backup';
import { buildBackup, type BackupFile } from './backup-file';
import { DEFAULT_SETTINGS } from './types';

const fixture = (name: string) => readFileSync(new URL(`../../e2e/fixtures/${name}`, import.meta.url), 'utf8');

function q1File(): BackupFile {
  const d = datasetQ1();
  return buildBackup({ goals: d.goals, entries: d.entries, settings: DEFAULT_SETTINGS, roadmaps: d.roadmaps, roadmapPhases: d.phases, roadmapItems: d.items, roadmapCheckpoints: d.checkpoints }, new Date('2026-11-04T03:00:00.000Z'));
}

function parse(file: unknown, today: string | undefined = TODAY_Q1) {
  const text = JSON.stringify(file);
  return parseBackup(text, text.length, today);
}

function codeOf(file: unknown): { code: string; variant?: unknown; v?: unknown } {
  const r = parse(file);
  if (r.ok) return { code: 'ok' };
  return { code: r.errors[0].code, variant: r.errors[0].params?.variant, v: r.errors[0].params?.v };
}

describe('schemaVersion 2 (M17-AC7)', () => {
  it('Q1 round-trips: 1 / 5 / 21 / 5 rows, no deletedAt/dirty anywhere, deep-equal after parse', () => {
    const file = q1File();
    expect(file.schemaVersion).toBe(2);
    const json = JSON.stringify(file);
    expect(json).not.toContain('deletedAt');
    expect(json).not.toContain('dirty');
    const r = parseBackup(json, json.length, TODAY_Q1);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value).toEqual(file);
    expect(r.value.roadmapItems![0]).toMatchObject({ id: 'wq1', actualStart: '2026-10-27', actualEnd: '2026-11-01' });
  });

  it('schemaVersion 3 → IMPORT_UNSUPPORTED_VERSION v "3"; "2" as a string too', () => {
    expect(codeOf({ ...q1File(), schemaVersion: 3 })).toEqual({ code: 'IMPORT_UNSUPPORTED_VERSION', variant: undefined, v: '3' });
    expect(codeOf({ ...q1File(), schemaVersion: '2' }).code).toBe('IMPORT_UNSUPPORTED_VERSION');
  });

  it('a v2 file without the roadmap arrays is a schema error; empty arrays are fine', () => {
    const { roadmaps: _r, ...withoutRoadmaps } = q1File();
    expect(codeOf(withoutRoadmaps).code).toBe('IMPORT_INVALID_SCHEMA');
    expect(codeOf({ ...q1File(), roadmaps: [], roadmapPhases: [], roadmapItems: [], roadmapCheckpoints: [] }).code).toBe('ok');
  });

  it('integrity: item → phase of another roadmap, checkpoint → unknown roadmap, two roadmaps on one goal, goalId not in file, phase → unknown roadmap, duplicate ids', () => {
    const f = q1File();
    const second = { ...f.roadmaps![0], id: 'r2', goalId: null };
    const phaseOfR2 = { ...f.roadmapPhases![0], id: 'p-r2', roadmapId: 'r2' };
    expect(codeOf({ ...f, roadmaps: [f.roadmaps![0], second], roadmapPhases: [...f.roadmapPhases!, phaseOfR2], roadmapItems: [{ ...f.roadmapItems![0], phaseId: 'p-r2' }, ...f.roadmapItems!.slice(1)] }).code).toBe('IMPORT_INTEGRITY');
    expect(codeOf({ ...f, roadmapCheckpoints: [{ ...f.roadmapCheckpoints![0], roadmapId: 'ghost' }] }).code).toBe('IMPORT_INTEGRITY');
    expect(codeOf({ ...f, roadmaps: [f.roadmaps![0], { ...second, goalId: 'gq' }] }).code).toBe('IMPORT_INTEGRITY');
    expect(codeOf({ ...f, roadmaps: [{ ...f.roadmaps![0], goalId: 'nope' }] }).code).toBe('IMPORT_INTEGRITY');
    expect(codeOf({ ...f, roadmapPhases: [{ ...f.roadmapPhases![0], roadmapId: 'ghost' }, ...f.roadmapPhases!.slice(1)] }).code).toBe('IMPORT_INTEGRITY');
    expect(codeOf({ ...f, roadmaps: [f.roadmaps![0], { ...f.roadmaps![0], goalId: null }] }).code).toBe('IMPORT_INTEGRITY');
    expect(codeOf({ ...f, roadmapItems: [...f.roadmapItems!, f.roadmapItems![0]] }).code).toBe('IMPORT_INTEGRITY');
    expect(codeOf({ ...f, roadmapCheckpoints: [...f.roadmapCheckpoints!, f.roadmapCheckpoints![0]] }).code).toBe('IMPORT_INTEGRITY');
    // Unlinked roadmaps (goalId null) are fine, and the Q1 Diagnostic before the roadmap start is fine (A-91).
    expect(codeOf({ ...f, roadmaps: [{ ...f.roadmaps![0], goalId: null }] }).code).toBe('ok');
  });

  it('actual dates after today → IMPORT_INTEGRITY (only when today is given)', () => {
    const f = q1File();
    const late = { ...f, roadmapItems: [{ ...f.roadmapItems![0], actualEnd: '2026-11-05' }, ...f.roadmapItems!.slice(1)] };
    expect(codeOf(late).code).toBe('IMPORT_INTEGRITY');
    const text = JSON.stringify(late);
    expect(parseBackup(text, text.length).ok).toBe(true);
  });

  it('out-of-range values → IMPORT_INVALID_SCHEMA outOfRange: title 201, note 1001, label 41, target 7.3 h, 367-day item, end before start, score > max, 7.25', () => {
    const f = q1File();
    const item = (patch: object) => ({ ...f, roadmapItems: [{ ...f.roadmapItems![1], ...patch }, ...f.roadmapItems!.filter((i) => i.id !== 'wq2')] });
    const cp = (patch: object) => ({ ...f, roadmapCheckpoints: [{ ...f.roadmapCheckpoints![2], ...patch }, ...f.roadmapCheckpoints!.filter((c) => c.id !== 'cq3')] });
    expect(codeOf(item({ title: 't'.repeat(201) }))).toMatchObject({ code: 'IMPORT_INVALID_SCHEMA', variant: 'outOfRange' });
    expect(codeOf(item({ title: 't'.repeat(200) })).code).toBe('ok');
    expect(codeOf(item({ note: 'n'.repeat(1001) }))).toMatchObject({ code: 'IMPORT_INVALID_SCHEMA', variant: 'outOfRange' });
    expect(codeOf(item({ plannedEnd: '2026-11-02' }))).toMatchObject({ code: 'IMPORT_INVALID_SCHEMA', variant: 'outOfRange' });
    expect(codeOf(item({ plannedStart: '2026-01-01', plannedEnd: '2027-01-02' }))).toMatchObject({ code: 'IMPORT_INVALID_SCHEMA', variant: 'outOfRange' });
    expect(codeOf(item({ actualStart: '2026-11-04', actualEnd: '2026-11-03' }))).toMatchObject({ code: 'IMPORT_INVALID_SCHEMA', variant: 'outOfRange' });
    expect(codeOf({ ...f, roadmaps: [{ ...f.roadmaps![0], milestoneLabel: 'm'.repeat(41) }] })).toMatchObject({ code: 'IMPORT_INVALID_SCHEMA', variant: 'outOfRange' });
    expect(codeOf({ ...f, roadmaps: [{ ...f.roadmaps![0], weeklyTargetMinutes: 438 }] })).toMatchObject({ code: 'IMPORT_INVALID_SCHEMA', variant: 'outOfRange' });
    expect(codeOf({ ...f, roadmaps: [{ ...f.roadmaps![0], note: 'n'.repeat(2001) }] })).toMatchObject({ code: 'IMPORT_INVALID_SCHEMA', variant: 'outOfRange' });
    expect(codeOf({ ...f, roadmapPhases: [{ ...f.roadmapPhases![0], note: 'n'.repeat(121) }, ...f.roadmapPhases!.slice(1)] })).toMatchObject({ code: 'IMPORT_INVALID_SCHEMA', variant: 'outOfRange' });
    expect(codeOf(cp({ score: 33 }))).toMatchObject({ code: 'IMPORT_INVALID_SCHEMA', variant: 'outOfRange' });
    expect(codeOf(cp({ score: 7.25 }))).toMatchObject({ code: 'IMPORT_INVALID_SCHEMA', variant: 'outOfRange' });
    expect(codeOf(cp({ maxScore: 0 }))).toMatchObject({ code: 'IMPORT_INVALID_SCHEMA', variant: 'outOfRange' });
    expect(codeOf(cp({ threshold: -1 }))).toMatchObject({ code: 'IMPORT_INVALID_SCHEMA', variant: 'outOfRange' });
    expect(codeOf(cp({ score: 7.5 })).code).toBe('ok');
    // Too many rows for one roadmap is a business limit too.
    const manyPhases = Array.from({ length: 21 }, (_, i) => ({ ...f.roadmapPhases![0], id: `p${i}` }));
    expect(codeOf({ ...f, roadmapPhases: manyPhases, roadmapItems: [] })).toMatchObject({ code: 'IMPORT_INVALID_SCHEMA', variant: 'outOfRange' });
  });

  it('structural problems → IMPORT_INVALID_SCHEMA without variant: unknown key in an item, missing field, wrong type, bad date, infinite position', () => {
    const f = q1File();
    const item = (patch: object) => ({ ...f, roadmapItems: [{ ...f.roadmapItems![1], ...patch }, ...f.roadmapItems!.filter((i) => i.id !== 'wq2')] });
    expect(codeOf(item({ extra: 1 }))).toEqual({ code: 'IMPORT_INVALID_SCHEMA', variant: undefined, v: undefined });
    const { note: _n, ...noNote } = f.roadmapItems![1];
    expect(codeOf({ ...f, roadmapItems: [noNote, ...f.roadmapItems!.filter((i) => i.id !== 'wq2')] })).toMatchObject({ code: 'IMPORT_INVALID_SCHEMA', variant: undefined });
    expect(codeOf(item({ position: 'first' }))).toMatchObject({ code: 'IMPORT_INVALID_SCHEMA', variant: undefined });
    expect(codeOf(item({ plannedStart: '2026-13-01' }))).toMatchObject({ code: 'IMPORT_INVALID_SCHEMA', variant: undefined });
    expect(codeOf({ ...f, roadmaps: [{ ...f.roadmaps![0], goalId: 'x'.repeat(65) }] })).toMatchObject({ code: 'IMPORT_INVALID_SCHEMA', variant: undefined });
  });
});

describe('schemaVersion 1 (unchanged files, A-87)', () => {
  it('sample-backup.json parses as v1 with no roadmap arrays; stray roadmap keys in a v1 file are ignored', () => {
    const sample = fixture('sample-backup.json');
    const r = parseBackup(sample, sample.length);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.schemaVersion).toBe(1);
    expect(r.value.roadmaps).toBeUndefined();
    const junk = fixture('v1-backup-with-roadmap-keys.json');
    expect(JSON.parse(junk).roadmaps).toHaveLength(1);
    const j = parseBackup(junk, junk.length);
    expect(j.ok && j.value.roadmaps).toBeUndefined();
    expect(j.ok && j.value.goals).toHaveLength(5);
  });
});
