// Phase 8 (M17): the Q1 E2E fixtures are generated from the builders so unit oracle and E2E data never drift.
// `WRITE_FIXTURES=1 npx vitest run src/test/fixtures-q1.test.ts` rewrites them; without the flag the test asserts
// that the files on disk equal the builder output (and parse with the lazy schema).
import { readFileSync, writeFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseBackup } from '../domain/backup';
import { buildBackup } from '../domain/backup-file';
import { DEFAULT_SETTINGS } from '../domain/types';
import { datasetQ1, datasetS1, TODAY_Q1 } from './builders';

const EXPORTED_AT = new Date('2026-11-04T03:00:00.000Z');
const dir = new URL('../../e2e/fixtures/', import.meta.url);

/** `schemaVersion 2`: S1 + goal gq + 29 entries + the Q1 roadmap (1 / 5 / 21 / 5). */
export function q1RoadmapBackup(): string {
  const d = datasetQ1();
  return JSON.stringify(buildBackup({ goals: d.goals, entries: d.entries, settings: DEFAULT_SETTINGS, roadmaps: d.roadmaps, roadmapPhases: d.phases, roadmapItems: d.items, roadmapCheckpoints: d.checkpoints }, EXPORTED_AT), null, 2) + '\n';
}

/** `schemaVersion 2`: S1 + gq + entries, no roadmap at all (M20 template flow). */
export function q1GoalOnlyBackup(): string {
  const d = datasetQ1();
  return JSON.stringify(buildBackup({ goals: d.goals, entries: d.entries, settings: DEFAULT_SETTINGS }, EXPORTED_AT), null, 2) + '\n';
}

/** `schemaVersion 1` (S1) carrying stray roadmap keys that must be ignored (ARCH §4.8 f). */
export function v1BackupWithRoadmapKeys(): string {
  const s1 = datasetS1();
  const file = { ...buildBackup({ goals: s1.goals, entries: s1.entries, settings: DEFAULT_SETTINGS }, new Date('2026-10-09T03:00:00.000Z')), schemaVersion: 1 };
  const junk = { ...file, roadmaps: [{ id: 'junk', title: 'Not a roadmap', goalId: 'g1' }], roadmapPhases: 'garbage', roadmapItems: 42, roadmapCheckpoints: null };
  return JSON.stringify(junk, null, 2) + '\n';
}

const FIXTURES: Array<[name: string, build: () => string]> = [
  ['q1-roadmap-backup.json', q1RoadmapBackup],
  ['q1-goal-only-backup.json', q1GoalOnlyBackup],
  ['v1-backup-with-roadmap-keys.json', v1BackupWithRoadmapKeys],
];

describe('Q1 fixtures (M17)', () => {
  if (process.env.WRITE_FIXTURES) {
    it('writes the fixtures', () => {
      for (const [name, build] of FIXTURES) writeFileSync(new URL(name, dir), build());
      expect(true).toBe(true);
    });
  }
  for (const [name, build] of FIXTURES) {
    it(`${name} on disk equals the builder output`, () => {
      expect(readFileSync(new URL(name, dir), 'utf8').replace(/\r\n/g, '\n')).toBe(build());
    });
  }
  it('q1-roadmap-backup parses as v2 with 6 goals, 29 entries, 1 / 5 / 21 / 5 roadmap rows', () => {
    const text = q1RoadmapBackup();
    const r = parseBackup(text, text.length, TODAY_Q1);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.schemaVersion).toBe(2);
    expect(r.value.goals).toHaveLength(6);
    expect(r.value.entries).toHaveLength(29);
    expect(r.value.roadmaps).toHaveLength(1);
    expect(r.value.roadmapPhases).toHaveLength(5);
    expect(r.value.roadmapItems).toHaveLength(21);
    expect(r.value.roadmapCheckpoints).toHaveLength(5);
  });
  it('q1-goal-only-backup parses as v2 with empty roadmap arrays; the v1 file parses with the junk keys dropped', () => {
    const only = q1GoalOnlyBackup();
    const r = parseBackup(only, only.length, TODAY_Q1);
    expect(r.ok && r.value.roadmaps).toEqual([]);
    const v1 = v1BackupWithRoadmapKeys();
    const p = parseBackup(v1, v1.length, TODAY_Q1);
    expect(p.ok).toBe(true);
    if (!p.ok) return;
    expect(p.value.schemaVersion).toBe(1);
    expect(p.value.roadmaps).toBeUndefined();
    expect('roadmapPhases' in p.value).toBe(false);
  });
});
