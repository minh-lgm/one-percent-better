// M18-AC2 (FR-79, ARCH §4.8 g): the four roadmap-table codecs — two-way mapping, numeric strings, invalid rows.
import { describe, expect, it } from 'vitest';
import { datasetQ1 } from '../../test/builders';
import {
  mapRoadmapCheckpointRows,
  mapRoadmapItemRows,
  mapRoadmapPhaseRows,
  mapRoadmapRows,
  roadmapCheckpointRowSchema,
  roadmapCheckpointToRow,
  roadmapItemRowSchema,
  roadmapItemToRow,
  roadmapPhaseToRow,
  roadmapRowSchema,
  roadmapToRow,
  TABLE_CODECS,
} from './mapper';

const q1 = datasetQ1();
const live = <T,>(x: T) => ({ ...x, deletedAt: null });
const U = '00000000-0000-4000-8000-000000000001';

describe('mapper — roadmap tables (M18-AC2)', () => {
  it('every table round-trips record → row → record deep-equal (snake_case ↔ camelCase), with user_id on the row and server stamps collected', () => {
    const roadmapRow = roadmapToRow(live(q1.roadmap), U);
    expect(roadmapRow).toMatchObject({ user_id: U, id: 'rq', goal_id: 'gq', weekly_target_minutes: 480, milestone_label: 'Thi QPT', milestone_date: '2027-03-09', deleted_at: null });
    const r = mapRoadmapRows([{ ...roadmapRow, server_updated_at: '2026-11-04T03:00:00+00:00' }]);
    expect(r.rows).toEqual([live(q1.roadmap)]);
    expect(r.serverUpdatedAt).toEqual({ rq: '2026-11-04T03:00:00.000Z' });
    expect(r.skippedInvalid).toBe(0);

    const phases = mapRoadmapPhaseRows(q1.phases.map((p) => roadmapPhaseToRow(live(p), U)));
    expect(phases.rows).toEqual(q1.phases.map(live));

    const items = mapRoadmapItemRows(q1.items.map((i) => roadmapItemToRow(live(i), U)));
    expect(items.rows).toEqual(q1.items.map(live));
    expect(items.rows[0]).toMatchObject({ actualStart: '2026-10-27', actualEnd: '2026-11-01' });
    expect(items.rows[1]).toMatchObject({ actualStart: null, actualEnd: null });

    const cps = mapRoadmapCheckpointRows(q1.checkpoints.map((c) => roadmapCheckpointToRow(live(c), U)));
    expect(cps.rows).toEqual(q1.checkpoints.map(live));
    expect(cps.rows[0]).toMatchObject({ maxScore: 32, score: 5, threshold: null });
  });

  it('numeric(7,1) as "32.0" and 32 both read as 32; "7.5" → 7.5; a score with two decimals, a string "NaN" or a non-numeric string is invalid', () => {
    const row = roadmapCheckpointToRow(live(q1.checkpoints[0]), U);
    const asString = mapRoadmapCheckpointRows([{ ...row, max_score: '32.0', score: '5.0', threshold: '7.5' }]);
    expect(asString.rows[0]).toMatchObject({ maxScore: 32, score: 5, threshold: 7.5 });
    const asNumber = mapRoadmapCheckpointRows([{ ...row, max_score: 32, score: 5, threshold: 7.5 }]);
    expect(asNumber.rows).toEqual(asString.rows);
    for (const bad of [{ score: 7.25 }, { score: 'NaN' }, { max_score: 'abc' }, { max_score: 0 }, { max_score: 10000.5 }, { score: 33 }, { threshold: -1 }, { threshold: 32.5 }]) {
      const m = mapRoadmapCheckpointRows([{ ...row, ...bad }]);
      expect(m.rows, JSON.stringify(bad)).toEqual([]);
      expect(m.skippedInvalid).toBe(1);
    }
    expect(roadmapCheckpointRowSchema.safeParse({ ...row, score: null, threshold: null }).success).toBe(true);
  });

  it('position: a string "NaN", NaN, Infinity or 1e15 is skipped and counted; finite numbers pass', () => {
    const row = roadmapPhaseToRow(live(q1.phases[0]), U);
    for (const position of ['NaN', Number.NaN, Number.POSITIVE_INFINITY, 1e15, '1']) {
      const m = mapRoadmapPhaseRows([{ ...row, position }]);
      expect(m.rows, String(position)).toEqual([]);
      expect(m.skippedInvalid).toBe(1);
    }
    expect(mapRoadmapPhaseRows([{ ...row, position: 1.5 }, { ...row, id: 'p2', position: -3 }]).rows.map((p) => p.position)).toEqual([1.5, -3]);
  });

  it('items: planned_end < planned_start, a span over 366 days, actual_end < actual_start, a 201-char title, a 1001-char note or a bad date are dropped; the valid rows still come back', () => {
    const row = roadmapItemToRow(live(q1.items[1]), U);
    const bad = [
      { id: 'b1', planned_start: '2026-11-10', planned_end: '2026-11-03' },
      { id: 'b2', planned_start: '2026-01-01', planned_end: '2027-01-02' },
      { id: 'b3', actual_start: '2026-11-04', actual_end: '2026-11-03' },
      { id: 'b4', title: 'x'.repeat(201) },
      { id: 'b5', note: 'x'.repeat(1001) },
      { id: 'b6', planned_end: '2026-02-30' },
      { id: 'b7', title: '' },
      { id: 'b8', phase_id: null },
    ];
    const m = mapRoadmapItemRows([row, ...bad.map((b) => ({ ...row, ...b })), { ...row, id: 'ok', planned_start: '2026-01-01', planned_end: '2027-01-01', title: 'x'.repeat(200), note: 'y'.repeat(1000) }]);
    expect(m.rows.map((i) => i.id)).toEqual(['wq2', 'ok']);
    expect(m.skippedInvalid).toBe(bad.length);
    expect(roadmapItemRowSchema.safeParse({ ...row, actual_start: '2026-11-01', actual_end: null }).success).toBe(true);
  });

  it('roadmaps: a 81-char title, a 2001-char note, a weekly target outside 30…10080 or non-integer, a 41-char milestone label, a bad milestone date are invalid; null goal/target/date are fine', () => {
    const row = roadmapToRow(live(q1.roadmap), U);
    for (const bad of [{ title: 'x'.repeat(81) }, { title: '' }, { note: 'x'.repeat(2001) }, { weekly_target_minutes: 29 }, { weekly_target_minutes: 10081 }, { weekly_target_minutes: 60.5 }, { milestone_label: 'x'.repeat(41) }, { milestone_date: '2027-13-01' }, { goal_id: '' }]) {
      expect(roadmapRowSchema.safeParse({ ...row, ...bad }).success, JSON.stringify(bad)).toBe(false);
    }
    const nulls = mapRoadmapRows([{ ...row, goal_id: null, weekly_target_minutes: null, milestone_date: null, milestone_label: '' }]);
    expect(nulls.rows[0]).toMatchObject({ goalId: null, weeklyTargetMinutes: null, milestoneDate: null, milestoneLabel: '' });
    expect(nulls.skippedInvalid).toBe(0);
  });

  it('TABLE_CODECS covers the six remote tables with the matching local keys', () => {
    expect(Object.keys(TABLE_CODECS)).toEqual(['goals', 'entries', 'roadmaps', 'roadmap_phases', 'roadmap_items', 'roadmap_checkpoints']);
    expect(Object.values(TABLE_CODECS).map((c) => c.key)).toEqual(['goals', 'entries', 'roadmaps', 'roadmapPhases', 'roadmapItems', 'roadmapCheckpoints']);
  });
});
