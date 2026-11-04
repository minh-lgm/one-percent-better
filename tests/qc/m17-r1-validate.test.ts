// QC round 1 (M17): independent probes of AC1 (validation), AC4 (checkpoint state) and AC6 (service rules).
import { afterEach, describe, expect, it } from 'vitest';
import { positionBetween, validateCheckpointInput, validateItemInput, validateRoadmapInput } from '../../src/domain/roadmap';
import { checkpointState } from '../../src/domain/roadmap-progress';
import { createTestContainer, type TestContainer } from '../../src/test/container';

const TODAY = '2026-11-04';
const roadmap = (o: Partial<Parameters<typeof validateRoadmapInput>[0]> = {}) => validateRoadmapInput({ title: 'T', note: '', goalId: null, weeklyTargetHours: null, milestoneLabel: '', milestoneDate: null, ...o });
const item = (o: Partial<Parameters<typeof validateItemInput>[0]> = {}) => validateItemInput({ title: 'W', note: '', plannedStart: '2026-11-01', plannedEnd: '2026-11-07', actualStart: null, actualEnd: null, ...o }, TODAY);
const cp = (o: Partial<Parameters<typeof validateCheckpointInput>[0]> = {}) => validateCheckpointInput({ title: 'C', note: '', date: '2026-11-04', maxScore: 32, threshold: null, score: null, ...o });
const e = <T>(r: { ok: boolean; errors?: Array<{ code: string; field?: string; params?: Record<string, unknown> }> } & T) => (r.ok ? null : { code: r.errors![0].code, field: r.errors![0].field, params: r.errors![0].params });

describe('AC1 validation', () => {
  it('title and length', () => {
    expect(e(roadmap({ title: '  ' }))).toMatchObject({ code: 'ROADMAP_TITLE_REQUIRED', field: 'title' });
    expect(e(roadmap({ title: 'x'.repeat(81) }))).toMatchObject({ code: 'ROADMAP_TEXT_TOO_LONG', params: { max: 80 } });
    expect(roadmap({ title: 'x'.repeat(80) }).ok).toBe(true);
  });
  it('weekly target hours', () => {
    for (const h of [0.25, 168.5, 7.3, 0, -1, Number.NaN]) expect(e(roadmap({ weeklyTargetHours: h })), String(h)).toMatchObject({ code: 'ROADMAP_TARGET_INVALID' });
    const ok = roadmap({ weeklyTargetHours: 8 });
    expect(ok.ok && ok.value.weeklyTargetMinutes).toBe(480);
    expect(roadmap({ weeklyTargetHours: 0.5 }).ok).toBe(true);
    expect(roadmap({ weeklyTargetHours: 168 }).ok).toBe(true);
  });
  it('item dates', () => {
    expect(e(item({ plannedEnd: '2026-10-31' }))).toMatchObject({ code: 'ROADMAP_DATE_INVALID', params: { variant: 'order' } });
    expect(e(item({ plannedStart: '2026-01-01', plannedEnd: '2027-01-02' }))).toMatchObject({ code: 'ROADMAP_DATE_INVALID', params: { variant: 'itemTooLong' } }); // 367 days
    expect(item({ plannedStart: '2026-01-01', plannedEnd: '2026-12-31' }).ok).toBe(true); // 365 days
    expect(item({ plannedStart: '2028-01-01', plannedEnd: '2028-12-31' }).ok).toBe(true); // 366 days, leap year
    expect(e(item({ actualEnd: '2026-11-05' }))).toMatchObject({ code: 'DATE_IN_FUTURE' });
    expect(e(item({ actualStart: '2026-11-03', actualEnd: '2026-11-02' }))).toMatchObject({ code: 'ROADMAP_DATE_INVALID', field: 'actualEnd', params: { variant: 'order' } });
    expect(e(item({ plannedStart: '2026-02-30' }))).toMatchObject({ code: 'ROADMAP_DATE_INVALID', params: { variant: 'format' } });
  });
  it('checkpoint scores', () => {
    expect(e(cp({ maxScore: 0 }))).toMatchObject({ code: 'ROADMAP_SCORE_INVALID', params: { variant: 'max' } });
    expect(e(cp({ score: 33 }))).toMatchObject({ code: 'ROADMAP_SCORE_INVALID', params: { variant: 'range' } });
    expect(e(cp({ score: 7.25 }))).toMatchObject({ code: 'ROADMAP_SCORE_INVALID', params: { variant: 'precision' } });
    expect(e(cp({ score: -1 }))).toMatchObject({ code: 'ROADMAP_SCORE_INVALID' });
    expect(cp({ score: 7.5 }).ok).toBe(true);
    expect(cp({ score: 0 }).ok).toBe(true);
    expect(cp({ score: 32 }).ok).toBe(true);
  });
  it('positionBetween', () => {
    expect([positionBetween(null, null), positionBetween(1, 2), positionBetween(null, 0), positionBetween(3, null)]).toEqual([0, 1.5, -1, 4]);
  });
});

describe('AC4 checkpoint state', () => {
  it('pending / recorded / pass / below', () => {
    expect(checkpointState({ score: 5, threshold: null })).toEqual({ kind: 'recorded' });
    expect(checkpointState({ score: null, threshold: 20 })).toEqual({ kind: 'pending' });
    expect(checkpointState({ score: 18, threshold: 20 })).toEqual({ kind: 'below', delta: -2 });
    expect(checkpointState({ score: 20, threshold: 20 })).toEqual({ kind: 'pass', delta: 0 });
    expect(checkpointState({ score: 21, threshold: 20 })).toMatchObject({ kind: 'pass' });
  });
});

const disposers: Array<() => Promise<void>> = [];
afterEach(async () => {
  while (disposers.length) await disposers.pop()!();
});

describe('AC6 service rules', () => {
  it('limits: 21st roadmap refused; goal link uniqueness; unknown goal; list watch', async () => {
    const tc: TestContainer = await createTestContainer({ permission: 'granted' });
    disposers.push(() => tc.dispose());
    const { container } = tc;
    const svc = await container.loadRoadmapService();
    const g = await container.goalService.create({ name: 'G', why: '', targetType: 'daily', targetValue: 30, startDate: '2026-10-01', endDate: null }, new Date('2026-10-02T03:00:00Z'));
    expect(g.ok).toBe(true);
    if (!g.ok) return;
    const r1 = await svc.create({ title: 'One', note: '', goalId: g.value.id, weeklyTargetHours: null, milestoneLabel: '', milestoneDate: null });
    expect(r1.ok).toBe(true);
    const r2 = await svc.create({ title: 'Two', note: '', goalId: g.value.id, weeklyTargetHours: null, milestoneLabel: '', milestoneDate: null });
    expect(!r2.ok && r2.errors[0].code).toBe('ROADMAP_GOAL_ALREADY_LINKED');
    expect(!r2.ok && r2.errors[0].params).toMatchObject({ title: 'One' });
    const r3 = await svc.create({ title: 'Three', note: '', goalId: 'nope', weeklyTargetHours: null, milestoneLabel: '', milestoneDate: null });
    expect(!r3.ok && r3.errors[0].code).toBe('GOAL_NOT_FOUND');
    for (let i = 0; i < 19; i += 1) expect((await svc.create({ title: `R${i}`, note: '', goalId: null, weeklyTargetHours: null, milestoneLabel: '', milestoneDate: null })).ok).toBe(true);
    const over = await svc.create({ title: 'R21', note: '', goalId: null, weeklyTargetHours: null, milestoneLabel: '', milestoneDate: null });
    expect(!over.ok && over.errors[0]).toMatchObject({ code: 'ROADMAP_LIMIT_REACHED', params: { kind: 'roadmap', max: 20 } });
    // deleting one frees a slot (tombstones do not count)
    if (r1.ok) await svc.remove(r1.value.id);
    expect((await svc.create({ title: 'again', note: '', goalId: null, weeklyTargetHours: null, milestoneLabel: '', milestoneDate: null })).ok).toBe(true);
  });
});
