// M17-AC1: validation, limits and ordering of the roadmap domain (ARCH §4.8 a, §5.4 v8.0).
import { describe, expect, it } from 'vitest';
import { datasetQ1 } from '../test/builders';
import {
  addDaysOrNull,
  checkLimit,
  checkRoadmapSpan,
  hasOneDecimal,
  LAST_ISO_DATE,
  needsRenumber,
  positionBetween,
  sortCheckpoints,
  sortItems,
  sortPhases,
  validateCheckpointInput,
  validateItemInput,
  validatePhaseInput,
  validateRoadmapInput,
  type CheckpointInput,
  type ItemInput,
  type RoadmapInput,
} from './roadmap';
import type { DomainError } from './types';

const TODAY = '2026-11-04';

const roadmapInput = (patch: Partial<RoadmapInput> = {}): RoadmapInput => ({ title: 'QPT 21 tuần', note: '', goalId: null, weeklyTargetHours: null, milestoneLabel: '', milestoneDate: null, ...patch });
const itemInput = (patch: Partial<ItemInput> = {}): ItemInput => ({ title: 'W1', note: '', plannedStart: '2026-10-27', plannedEnd: '2026-11-02', actualStart: null, actualEnd: null, ...patch });
const cpInput = (patch: Partial<CheckpointInput> = {}): CheckpointInput => ({ title: 'Checkpoint 2', note: '', date: '2027-02-15', maxScore: 32, threshold: 20, score: null, ...patch });

function firstError<T>(r: { ok: true; value: T } | { ok: false; errors: DomainError[] }): DomainError {
  if (r.ok) throw new Error('expected a failure');
  return r.errors[0];
}

describe('validateRoadmapInput (FR-69)', () => {
  it('blank title → ROADMAP_TITLE_REQUIRED on field title; 81 chars → ROADMAP_TEXT_TOO_LONG max 80; 80 ok and trimmed', () => {
    expect(firstError(validateRoadmapInput(roadmapInput({ title: '  ' })))).toMatchObject({ code: 'ROADMAP_TITLE_REQUIRED', field: 'title' });
    expect(firstError(validateRoadmapInput(roadmapInput({ title: 'a'.repeat(81) })))).toMatchObject({ code: 'ROADMAP_TEXT_TOO_LONG', field: 'title', params: { max: 80 } });
    const r = validateRoadmapInput(roadmapInput({ title: ` ${'a'.repeat(80)} ` }));
    expect(r.ok && r.value.title).toBe('a'.repeat(80));
  });

  it('note > 2000 and milestone label > 40 → ROADMAP_TEXT_TOO_LONG with the field; bad milestone date → ROADMAP_DATE_INVALID format', () => {
    expect(firstError(validateRoadmapInput(roadmapInput({ note: 'n'.repeat(2001) })))).toMatchObject({ code: 'ROADMAP_TEXT_TOO_LONG', field: 'note', params: { max: 2000 } });
    expect(firstError(validateRoadmapInput(roadmapInput({ milestoneLabel: 'm'.repeat(41) })))).toMatchObject({ code: 'ROADMAP_TEXT_TOO_LONG', field: 'milestoneLabel', params: { max: 40 } });
    expect(firstError(validateRoadmapInput(roadmapInput({ milestoneDate: '2027-02-30' })))).toMatchObject({ code: 'ROADMAP_DATE_INVALID', field: 'milestoneDate', params: { variant: 'format' } });
    expect(validateRoadmapInput(roadmapInput({ note: 'n'.repeat(2000), milestoneLabel: 'Thi QPT', milestoneDate: '2027-03-09' })).ok).toBe(true);
  });

  it('weekly target: 0.25 h / 168.5 h / 7.3 h → ROADMAP_TARGET_INVALID; 8 h → 480 minutes; 0.5 and 168 ok; null stays null', () => {
    for (const hours of [0.25, 168.5, 7.3, 0, -1, Number.NaN]) {
      expect(firstError(validateRoadmapInput(roadmapInput({ weeklyTargetHours: hours }))), String(hours)).toMatchObject({ code: 'ROADMAP_TARGET_INVALID' });
    }
    const r = validateRoadmapInput(roadmapInput({ weeklyTargetHours: 8 }));
    expect(r.ok && r.value.weeklyTargetMinutes).toBe(480);
    expect(validateRoadmapInput(roadmapInput({ weeklyTargetHours: 0.5 })).ok).toBe(true);
    expect(validateRoadmapInput(roadmapInput({ weeklyTargetHours: 168 })).ok).toBe(true);
    const none = validateRoadmapInput(roadmapInput());
    expect(none.ok && none.value.weeklyTargetMinutes).toBeNull();
  });
});

describe('validatePhaseInput', () => {
  it('title required, ≤ 80; note ≤ 120', () => {
    expect(firstError(validatePhaseInput({ title: '', note: '' }))).toMatchObject({ code: 'ROADMAP_TITLE_REQUIRED' });
    expect(firstError(validatePhaseInput({ title: 'p', note: 'x'.repeat(121) }))).toMatchObject({ code: 'ROADMAP_TEXT_TOO_LONG', field: 'note', params: { max: 120 } });
    expect(validatePhaseInput({ title: 'Phase 1 · Linear Algebra', note: 'Course 1 · 34h' }).ok).toBe(true);
  });
});

describe('validateItemInput (FR-69, A-81)', () => {
  it('plannedEnd < plannedStart → ROADMAP_DATE_INVALID order on plannedEnd; 367 days → itemTooLong; 366 ok', () => {
    expect(firstError(validateItemInput(itemInput({ plannedEnd: '2026-10-26' }), TODAY))).toMatchObject({ code: 'ROADMAP_DATE_INVALID', field: 'plannedEnd', params: { variant: 'order' } });
    expect(firstError(validateItemInput(itemInput({ plannedStart: '2026-01-01', plannedEnd: '2027-01-02' }), TODAY))).toMatchObject({ code: 'ROADMAP_DATE_INVALID', params: { variant: 'itemTooLong' } });
    expect(validateItemInput(itemInput({ plannedStart: '2026-01-01', plannedEnd: '2027-01-01' }), TODAY).ok).toBe(true);
    expect(firstError(validateItemInput(itemInput({ plannedStart: 'nope' }), TODAY))).toMatchObject({ code: 'ROADMAP_DATE_INVALID', field: 'plannedStart', params: { variant: 'format' } });
  });

  it('actual dates: after today → DATE_IN_FUTURE; actualEnd < actualStart → order on actualEnd; title ≤ 200, note ≤ 1000', () => {
    expect(firstError(validateItemInput(itemInput({ actualEnd: '2026-11-05' }), TODAY))).toMatchObject({ code: 'DATE_IN_FUTURE', field: 'actualEnd' });
    expect(firstError(validateItemInput(itemInput({ actualStart: '2026-11-05' }), TODAY))).toMatchObject({ code: 'DATE_IN_FUTURE', field: 'actualStart' });
    expect(firstError(validateItemInput(itemInput({ actualStart: '2026-10-29', actualEnd: '2026-10-28' }), TODAY))).toMatchObject({ code: 'ROADMAP_DATE_INVALID', field: 'actualEnd', params: { variant: 'order' } });
    expect(validateItemInput(itemInput({ actualStart: '2026-10-27', actualEnd: '2026-11-04' }), TODAY).ok).toBe(true);
    expect(firstError(validateItemInput(itemInput({ title: 't'.repeat(201) }), TODAY))).toMatchObject({ code: 'ROADMAP_TEXT_TOO_LONG', params: { max: 200 } });
    expect(firstError(validateItemInput(itemInput({ note: 'n'.repeat(1001) }), TODAY))).toMatchObject({ code: 'ROADMAP_TEXT_TOO_LONG', field: 'note', params: { max: 1000 } });
  });

  it('checkRoadmapSpan: first start → last end ≤ 1827 days, else roadmapTooLong', () => {
    expect(checkRoadmapSpan([])).toBeNull();
    expect(checkRoadmapSpan([{ plannedStart: '2026-11-01', plannedEnd: '2026-11-07' }, { plannedStart: '2031-10-26', plannedEnd: '2031-11-02' }])).toMatchObject({ code: 'ROADMAP_DATE_INVALID', params: { variant: 'roadmapTooLong' } }); // 1828 days
    expect(checkRoadmapSpan([{ plannedStart: '2026-11-01', plannedEnd: '2026-11-07' }, { plannedStart: '2031-10-26', plannedEnd: '2031-11-01' }])).toBeNull(); // exactly 1827 days
  });
});

describe('validateCheckpointInput (FR-75, A-91)', () => {
  it('maxScore 0 → ROADMAP_SCORE_INVALID max; score 33 of 32 → range; 7.25 → precision; 7.5 ok', () => {
    expect(firstError(validateCheckpointInput(cpInput({ maxScore: 0 })))).toMatchObject({ code: 'ROADMAP_SCORE_INVALID', field: 'maxScore', params: { variant: 'max' } });
    expect(firstError(validateCheckpointInput(cpInput({ maxScore: 10001 })))).toMatchObject({ code: 'ROADMAP_SCORE_INVALID', params: { variant: 'max' } });
    expect(firstError(validateCheckpointInput(cpInput({ score: 33 })))).toMatchObject({ code: 'ROADMAP_SCORE_INVALID', field: 'score', params: { variant: 'range' } });
    expect(firstError(validateCheckpointInput(cpInput({ threshold: -1 })))).toMatchObject({ code: 'ROADMAP_SCORE_INVALID', field: 'threshold', params: { variant: 'range' } });
    expect(firstError(validateCheckpointInput(cpInput({ score: 7.25 })))).toMatchObject({ code: 'ROADMAP_SCORE_INVALID', field: 'score', params: { variant: 'precision' } });
    expect(firstError(validateCheckpointInput(cpInput({ maxScore: 10.55 })))).toMatchObject({ code: 'ROADMAP_SCORE_INVALID', field: 'maxScore', params: { variant: 'precision' } });
    expect(validateCheckpointInput(cpInput({ score: 7.5 })).ok).toBe(true);
    expect(validateCheckpointInput(cpInput({ score: 32, threshold: 0 })).ok).toBe(true);
    expect(validateCheckpointInput(cpInput({ maxScore: 10000, threshold: null, score: null })).ok).toBe(true);
    expect(firstError(validateCheckpointInput(cpInput({ date: '2027-13-01' })))).toMatchObject({ code: 'ROADMAP_DATE_INVALID', field: 'date' });
    expect(firstError(validateCheckpointInput(cpInput({ note: 'n'.repeat(281) })))).toMatchObject({ code: 'ROADMAP_TEXT_TOO_LONG', params: { max: 280 } });
  });

  it('hasOneDecimal', () => {
    expect(hasOneDecimal(7.5)).toBe(true);
    expect(hasOneDecimal(0.1)).toBe(true);
    expect(hasOneDecimal(32)).toBe(true);
    expect(hasOneDecimal(7.25)).toBe(false);
    expect(hasOneDecimal(Number.NaN)).toBe(false);
  });
});

describe('limits (ROADMAP_LIMIT_REACHED)', () => {
  it('21st phase → kind phase, max 20; 21st live roadmap → kind roadmap; 200 items / 50 checkpoints are the caps', () => {
    expect(checkLimit('phase', 19)).toBeNull();
    expect(checkLimit('phase', 20)).toMatchObject({ code: 'ROADMAP_LIMIT_REACHED', params: { kind: 'phase', max: 20 } });
    expect(checkLimit('roadmap', 20)).toMatchObject({ code: 'ROADMAP_LIMIT_REACHED', params: { kind: 'roadmap', max: 20 } });
    expect(checkLimit('item', 199)).toBeNull();
    expect(checkLimit('item', 200)).toMatchObject({ params: { kind: 'item', max: 200 } });
    expect(checkLimit('checkpoint', 50)).toMatchObject({ params: { kind: 'checkpoint', max: 50 } });
  });
});

describe('ordering (ADR-51)', () => {
  it('positionBetween: (null, null) = 0, (1, 2) = 1.5, (null, 0) = −1, (3, null) = 4', () => {
    expect(positionBetween(null, null)).toBe(0);
    expect(positionBetween(1, 2)).toBe(1.5);
    expect(positionBetween(null, 0)).toBe(-1);
    expect(positionBetween(3, null)).toBe(4);
  });

  it('needsRenumber when two neighbours are closer than 1e-6 or a position is not finite', () => {
    expect(needsRenumber([0, 1, 2])).toBe(false);
    expect(needsRenumber([0, 0.0000001, 1])).toBe(true);
    expect(needsRenumber([0, Number.POSITIVE_INFINITY])).toBe(true);
    expect(needsRenumber([])).toBe(false);
  });

  it('sortPhases (position, id); sortItems (phase order, position, id); sortCheckpoints (date, createdAt, id)', () => {
    const q1 = datasetQ1();
    const phases = [...q1.phases].reverse();
    expect(sortPhases(phases).map((p) => p.id)).toEqual(['pq1', 'pq2', 'pq3', 'pq4', 'pq5']);
    const shuffled = [...q1.items].sort((a, b) => (a.id < b.id ? 1 : -1));
    expect(sortItems(shuffled, phases).map((i) => i.id)).toEqual(q1.items.map((i) => i.id));
    // Same position inside a phase → id breaks the tie; unknown phase → last.
    const tie = sortItems([{ ...q1.items[1], id: 'b', position: 0 }, { ...q1.items[0], id: 'a', position: 0 }, { ...q1.items[2], id: 'z', phaseId: 'ghost' }], q1.phases);
    expect(tie.map((i) => i.id)).toEqual(['a', 'b', 'z']);
    const cps = sortCheckpoints([...q1.checkpoints].reverse());
    expect(cps.map((c) => c.id)).toEqual(['cq1', 'cq2', 'cq3', 'cq4', 'cq5']);
    const sameDate = sortCheckpoints([
      { ...q1.checkpoints[0], id: 'y', date: '2027-01-01', createdAt: '2026-01-02T00:00:00.000Z' },
      { ...q1.checkpoints[0], id: 'x', date: '2027-01-01', createdAt: '2026-01-02T00:00:00.000Z' },
      { ...q1.checkpoints[0], id: 'w', date: '2027-01-01', createdAt: '2026-01-01T00:00:00.000Z' },
    ]);
    expect(sameDate.map((c) => c.id)).toEqual(['w', 'x', 'y']);
  });
});

describe('addDaysOrNull (M20-D1)', () => {
  it('returns the date, or null for a non-date or a result past 9999-12-31', () => {
    expect(addDaysOrNull('2026-10-27', 146)).toBe('2027-03-22');
    expect(addDaysOrNull('9999-08-07', 146)).toBe(LAST_ISO_DATE);
    expect(addDaysOrNull('9999-08-08', 146)).toBeNull();
    expect(addDaysOrNull('', 0)).toBeNull();
    expect(addDaysOrNull('2026-02-30', 0)).toBeNull();
  });
});
