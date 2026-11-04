// M17-AC6 (FR-70, A-78, A-81, ADR-51): RoadmapService on the real Dexie repository (fake-indexeddb).
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { DexieEntryRepository } from '../data/dexie/entry-repo';
import { DexieGoalRepository } from '../data/dexie/goal-repo';
import { DexieRoadmapRepository } from '../data/dexie/roadmap-repo';
import type { AppDatabase } from '../data/dexie/db';
import type { ItemInput, RoadmapInput } from '../domain/roadmap';
import type { RoadmapView } from '../domain/roadmap-progress';
import { buildEntry, buildGoal, datasetQ1, FIXED_NOW_Q1, TODAY_Q1 } from '../test/builders';
import { createTestDatabase } from '../test/db';
import { RoadmapService } from './roadmap-service';

let db: AppDatabase;
let repo: DexieRoadmapRepository;
let goals: DexieGoalRepository;
let service: RoadmapService;
let ids = 0;
let now = FIXED_NOW_Q1;

const roadmapInput = (patch: Partial<RoadmapInput> = {}): RoadmapInput => ({ title: 'Spanish B1', note: '', goalId: null, weeklyTargetHours: null, milestoneLabel: '', milestoneDate: null, ...patch });
const itemInput = (patch: Partial<ItemInput> = {}): ItemInput => ({ title: 'Item', note: '', plannedStart: '2027-03-23', plannedEnd: '2027-03-29', actualStart: null, actualEnd: null, ...patch });

async function seedQ1(variant?: 'b' | 'c' | 'e') {
  const d = datasetQ1(variant);
  await db.goals.bulkPut(d.goals);
  await db.entries.bulkPut(d.entries);
  await repo.putMany({ roadmaps: [d.roadmap], phases: d.phases, items: d.items, checkpoints: d.checkpoints });
  return d;
}

function expectOk<T>(r: { ok: true; value: T } | { ok: false; errors: unknown[] }): T {
  if (!r.ok) throw new Error(`expected ok, got ${JSON.stringify(r.errors)}`);
  return r.value;
}

function expectFail(r: { ok: boolean; errors?: Array<{ code: string; params?: unknown; field?: string }> }) {
  if (r.ok) throw new Error('expected a failure');
  return r.errors![0];
}

beforeEach(async () => {
  db = createTestDatabase();
  await db.open();
  now = FIXED_NOW_Q1;
  ids = 0;
  repo = new DexieRoadmapRepository(db, { clock: () => now });
  goals = new DexieGoalRepository(db, () => now);
  service = new RoadmapService({ roadmaps: repo, goals, clock: () => now, newId: () => `id-${++ids}` });
});
afterEach(() => db.delete());

describe('goal link (A-78)', () => {
  it('setGoalLink(rq, gq) ok (no-op when already linked); a second roadmap linking gq → ROADMAP_GOAL_ALREADY_LINKED with the title; "nope" → GOAL_NOT_FOUND; unlink → null', async () => {
    await seedQ1();
    expectOk(await service.setGoalLink('rq', 'gq'));
    const r2 = expectOk(await service.create(roadmapInput()));
    const err = expectFail(await service.setGoalLink(r2.id, 'gq'));
    expect(err).toMatchObject({ code: 'ROADMAP_GOAL_ALREADY_LINKED', field: 'goalId', params: { title: 'QPT 21 tuần' } });
    expect((await repo.getAggregate(r2.id))?.roadmap.goalId).toBeNull();
    expect(expectFail(await service.setGoalLink(r2.id, 'nope'))).toMatchObject({ code: 'GOAL_NOT_FOUND' });
    expect(expectFail(await service.create(roadmapInput({ goalId: 'gq' })))).toMatchObject({ code: 'ROADMAP_GOAL_ALREADY_LINKED' });
    expect(expectFail(await service.update(r2.id, roadmapInput({ goalId: 'gq' })))).toMatchObject({ code: 'ROADMAP_GOAL_ALREADY_LINKED' });
    const unlinked = expectOk(await service.setGoalLink('rq', null));
    expect(unlinked.goalId).toBeNull();
    // Now the second roadmap may take the goal; a goal of another kind (g1) is fine too.
    expect(expectOk(await service.setGoalLink(r2.id, 'gq')).goalId).toBe('gq');
    expect(expectOk(await service.update('rq', roadmapInput({ title: 'QPT', goalId: 'g1', weeklyTargetHours: 8 }))).weeklyTargetMinutes).toBe(480);
  });

  it('an archived goal keeps the link and watchDetail still counts its hours; a deleted goal → missing, hours null', async () => {
    const d = seedQ1();
    await d;
    await goals.put({ ...(await goals.getById('gq'))!, archived: true });
    const view = await first(service.watchDetail('rq', TODAY_Q1));
    expect(view?.linkState).toBe('archived');
    expect(view?.hoursDoneMinutes).toBe(345);
    await goals.deleteWithEntries('gq');
    const after = await first(service.watchDetail('rq', TODAY_Q1));
    expect(after?.linkState).toBe('none'); // unlinked on this device (A-79)
    expect(after?.hoursDoneMinutes).toBeNull();
  });
});

describe('goal link helpers for the editor and Goal detail (M19; A-78, FR-80)', () => {
  it('linkableGoals(rq) lists gq (its own goal) and the free, unarchived goals; archived goals and goals of other roadmaps are left out; the own archived goal stays', async () => {
    await seedQ1();
    await goals.put({ ...(await goals.getById('g2'))!, archived: true });
    const r2 = expectOk(await service.create(roadmapInput({ title: 'Other', goalId: 'g1' })));
    const forRq = (await service.linkableGoals('rq')).map((g) => g.id);
    expect(forRq).toContain('gq');
    expect(forRq).not.toContain('g1'); // linked to r2
    expect(forRq).not.toContain('g2'); // archived
    expect(forRq).toEqual(expect.arrayContaining(['g3', 'g4', 'g5']));
    // A new roadmap: gq (rq's) and g1 (r2's) are taken.
    const forNew = (await service.linkableGoals(null)).map((g) => g.id);
    expect(forNew).not.toContain('gq');
    expect(forNew).not.toContain('g1');
    // The roadmap's own goal stays listed even once archived (shown as "(archived)" by the picker).
    await goals.put({ ...(await goals.getById('gq'))!, archived: true });
    expect((await service.linkableGoals('rq')).map((g) => g.id)).toContain('gq');
    expect((await service.linkableGoals(r2.id)).map((g) => g.id)).not.toContain('gq');
  });

  it('findByGoal(gq) → [rq]; oldest first when two roadmaps point at one goal (sync convergence, A-D92); unlinked → []', async () => {
    await seedQ1();
    expect((await service.findByGoal('gq')).map((r) => r.id)).toEqual(['rq']);
    expect(await service.findByGoal('g3')).toEqual([]);
    // Two roadmaps on one goal can only arise from sync; write the second row directly.
    const later = new Date('2026-11-04T04:00:00.000Z');
    await repo.putRoadmap({ id: 'r-dup', title: 'Dup', note: '', goalId: 'gq', weeklyTargetMinutes: null, milestoneLabel: '', milestoneDate: null, createdAt: later.toISOString(), updatedAt: later.toISOString() });
    expect((await service.findByGoal('gq')).map((r) => r.id)).toEqual(['rq', 'r-dup']);
  });
});

describe('roadmap CRUD and limits', () => {
  it('create validates, stamps and stores; 21st live roadmap → ROADMAP_LIMIT_REACHED kind roadmap; remove soft-deletes; unknown id → ROADMAP_NOT_FOUND', async () => {
    expect(expectFail(await service.create(roadmapInput({ title: ' ' })))).toMatchObject({ code: 'ROADMAP_TITLE_REQUIRED' });
    for (let i = 0; i < 20; i += 1) expectOk(await service.create(roadmapInput({ title: `R${i}` })));
    expect(expectFail(await service.create(roadmapInput()))).toMatchObject({ code: 'ROADMAP_LIMIT_REACHED', params: { kind: 'roadmap', max: 20 } });
    expectOk(await service.remove('id-1'));
    const created = expectOk(await service.create(roadmapInput({ title: 'Again' })));
    expect(created).toMatchObject({ title: 'Again', createdAt: now.toISOString(), updatedAt: now.toISOString(), goalId: null });
    expect(expectFail(await service.remove('id-1'))).toMatchObject({ code: 'ROADMAP_NOT_FOUND', params: { kind: 'roadmap' } });
    expect(expectFail(await service.update('ghost', roadmapInput()))).toMatchObject({ code: 'ROADMAP_NOT_FOUND' });
  });

  it('phases: add appends with the next position; 21st → limit kind phase; update/remove; unknown → ROADMAP_NOT_FOUND phase', async () => {
    const r = expectOk(await service.create(roadmapInput()));
    const p1 = expectOk(await service.addPhase(r.id, { title: 'A', note: '' }));
    const p2 = expectOk(await service.addPhase(r.id, { title: 'B', note: '' }));
    expect([p1.position, p2.position]).toEqual([0, 1]);
    for (let i = 2; i < 20; i += 1) expectOk(await service.addPhase(r.id, { title: `P${i}`, note: '' }));
    expect(expectFail(await service.addPhase(r.id, { title: 'X', note: '' }))).toMatchObject({ code: 'ROADMAP_LIMIT_REACHED', params: { kind: 'phase', max: 20 } });
    expect(expectOk(await service.updatePhase(p1.id, { title: 'A2', note: 'n' })).title).toBe('A2');
    expectOk(await service.removePhase(p2.id));
    expect(expectFail(await service.removePhase(p2.id))).toMatchObject({ code: 'ROADMAP_NOT_FOUND', params: { kind: 'phase' } });
    expect(expectFail(await service.addPhase('ghost', { title: 'X', note: '' }))).toMatchObject({ code: 'ROADMAP_NOT_FOUND', params: { kind: 'roadmap' } });
  });

  it('items: suggested dates follow the last item (A-83); add validates, checks the 1827-day span and the 200 cap; update; remove', async () => {
    await seedQ1();
    expect(await service.suggestedItemDates('rq', TODAY_Q1)).toEqual({ plannedStart: '2027-03-23', plannedEnd: '2027-03-29' });
    const empty = expectOk(await service.create(roadmapInput()));
    expect(await service.suggestedItemDates(empty.id, TODAY_Q1)).toEqual({ plannedStart: '2026-11-04', plannedEnd: '2026-11-10' });
    const w22 = expectOk(await service.addItem('pq5', itemInput(), TODAY_Q1));
    expect(w22).toMatchObject({ roadmapId: 'rq', phaseId: 'pq5', position: 5, plannedStart: '2027-03-23' });
    expect(expectFail(await service.addItem('pq5', itemInput({ plannedEnd: '2027-03-22' }), TODAY_Q1))).toMatchObject({ code: 'ROADMAP_DATE_INVALID', params: { variant: 'order' } });
    expect(expectFail(await service.addItem('pq5', itemInput({ plannedStart: '2031-10-27', plannedEnd: '2031-10-28' }), TODAY_Q1))).toMatchObject({ code: 'ROADMAP_DATE_INVALID', params: { variant: 'roadmapTooLong' } });
    expect(expectFail(await service.updateItem(w22.id, itemInput({ plannedStart: '2031-10-27', plannedEnd: '2031-10-28' }), TODAY_Q1))).toMatchObject({ params: { variant: 'roadmapTooLong' } });
    expect(expectOk(await service.updateItem(w22.id, itemInput({ title: 'Week 22' }), TODAY_Q1)).title).toBe('Week 22');
    expectOk(await service.removeItem(w22.id));
    expect(expectFail(await service.removeItem(w22.id))).toMatchObject({ code: 'ROADMAP_NOT_FOUND', params: { kind: 'item' } });
    expect(expectFail(await service.addItem('ghost', itemInput(), TODAY_Q1))).toMatchObject({ code: 'ROADMAP_NOT_FOUND', params: { kind: 'phase' } });
    for (let i = 0; i < 179; i += 1) expectOk(await service.addItem('pq5', itemInput({ plannedStart: '2027-03-23', plannedEnd: '2027-03-23' }), TODAY_Q1));
    expect(expectFail(await service.addItem('pq5', itemInput(), TODAY_Q1))).toMatchObject({ code: 'ROADMAP_LIMIT_REACHED', params: { kind: 'item', max: 200 } });
  });

  it('checkpoints: add/update/remove, validation and the 50 cap', async () => {
    await seedQ1();
    const cp = expectOk(await service.addCheckpoint('rq', { title: 'Mock 3', note: '', date: '2027-03-12', maxScore: 32, threshold: 28, score: null }));
    expect(cp).toMatchObject({ roadmapId: 'rq', threshold: 28 });
    expect(expectFail(await service.updateCheckpoint(cp.id, { title: 'Mock 3', note: '', date: '2027-03-12', maxScore: 32, threshold: 28, score: 33 }))).toMatchObject({ code: 'ROADMAP_SCORE_INVALID', params: { variant: 'range' } });
    expect(expectOk(await service.updateCheckpoint(cp.id, { title: 'Mock 3', note: '', date: '2027-03-12', maxScore: 32, threshold: 28, score: 29.5 })).score).toBe(29.5);
    expectOk(await service.removeCheckpoint(cp.id));
    expect(expectFail(await service.removeCheckpoint(cp.id))).toMatchObject({ code: 'ROADMAP_NOT_FOUND', params: { kind: 'checkpoint' } });
    for (let i = 0; i < 45; i += 1) expectOk(await service.addCheckpoint('rq', { title: `C${i}`, note: '', date: '2027-01-01', maxScore: 10, threshold: null, score: null }));
    expect(expectFail(await service.addCheckpoint('rq', { title: 'X', note: '', date: '2027-01-01', maxScore: 10, threshold: null, score: null }))).toMatchObject({ code: 'ROADMAP_LIMIT_REACHED', params: { kind: 'checkpoint', max: 50 } });
  });
});

describe('done / actual dates (A-81)', () => {
  it('setItemDone(W2, true) → actualEnd today; false → null with actualStart kept; setItemActual end in the future → DATE_IN_FUTURE', async () => {
    await seedQ1();
    expect(expectOk(await service.setItemDone('wq2', true, TODAY_Q1)).actualEnd).toBe('2026-11-04');
    expectOk(await service.setItemActual('wq2', 'start', '2026-11-03', TODAY_Q1));
    const undone = expectOk(await service.setItemDone('wq2', false, TODAY_Q1));
    expect(undone.actualEnd).toBeNull();
    expect(undone.actualStart).toBe('2026-11-03');
    // Ticking an item that already has an end keeps that end.
    expect(expectOk(await service.setItemDone('wq1', true, TODAY_Q1)).actualEnd).toBe('2026-11-01');
    expect(expectFail(await service.setItemActual('wq3', 'end', '2026-11-05', TODAY_Q1))).toMatchObject({ code: 'DATE_IN_FUTURE', field: 'actualEnd' });
    expect(expectFail(await service.setItemActual('wq2', 'end', '2026-11-02', TODAY_Q1))).toMatchObject({ code: 'ROADMAP_DATE_INVALID', field: 'actualEnd', params: { variant: 'order' } });
    expect(expectOk(await service.setItemActual('wq2', 'end', '2026-11-04', TODAY_Q1)).actualEnd).toBe('2026-11-04');
    expect(expectOk(await service.setItemActual('wq2', 'start', null, TODAY_Q1)).actualStart).toBeNull();
    expect(expectFail(await service.setItemDone('ghost', true, TODAY_Q1))).toMatchObject({ code: 'ROADMAP_NOT_FOUND', params: { kind: 'item' } });
    // A write stamps a newer updatedAt (FR-49).
    expect(Date.parse((await repo.getItem('wq2'))!.updatedAt)).toBeGreaterThan(Date.parse('2026-10-27T01:00:00.000Z'));
  });
});

describe('ordering (ADR-51)', () => {
  it('moveItem(W3, p1, before W1) puts W3 first in p1 and writes only W3; 30 moves into the same slot renumber 0…n in one batch with the right order', async () => {
    await seedQ1();
    const puts: string[] = [];
    const original = repo.putItem.bind(repo);
    repo.putItem = async (i) => {
      puts.push(i.id);
      return original(i);
    };
    const moved = expectOk(await service.moveItem('wq3', 'pq1', 'wq1'));
    expect(moved.position).toBe(-1);
    expect(puts).toEqual(['wq3']);
    const agg = (await repo.getAggregate('rq'))!;
    const p1 = agg.items.filter((i) => i.phaseId === 'pq1').sort((a, b) => a.position - b.position).map((i) => i.id);
    expect(p1).toEqual(['wq3', 'wq1', 'wq2', 'wq4']);
    expect((await repo.getItem('wq1'))!.updatedAt).toBe('2026-10-27T01:00:00.000Z'); // untouched

    // Squeeze: move wq5 / wq6 alternately into the slot right before wq1, thirty times. The gap halves each time
    // (1 → 2^-21 after 21 moves < 1e-6) so the list is renumbered 0 … n once in a single putMany, then halving resumes.
    const batches: number[] = [];
    const originalMany = repo.putMany.bind(repo);
    repo.putMany = async (rows) => {
      batches.push(rows.items?.length ?? 0);
      return originalMany(rows);
    };
    for (let k = 0; k < 30; k += 1) expectOk(await service.moveItem(k % 2 === 0 ? 'wq5' : 'wq6', 'pq1', 'wq1'));
    const after = (await repo.getAggregate('rq'))!;
    const inP1 = after.items.filter((i) => i.phaseId === 'pq1').sort((a, b) => a.position - b.position || (a.id < b.id ? -1 : 1));
    expect(inP1.map((i) => i.id)).toEqual(['wq3', 'wq5', 'wq6', 'wq1', 'wq2', 'wq4']);
    expect(batches).toEqual([6]); // exactly one renumbering, all six siblings in one transaction
    for (let i = 1; i < inP1.length; i += 1) expect(inP1[i].position - inP1[i - 1].position).toBeGreaterThanOrEqual(1e-6);
    expect(inP1.every((i) => Number.isInteger(i.position) || i.position > 0)).toBe(true);
    expect(after.items.filter((i) => i.phaseId === 'pq2')).toHaveLength(2);
    // Renumbering happened in a single transaction: every sibling got the same batch stamp.
    expect(new Set(inP1.map((i) => i.updatedAt)).size).toBeLessThanOrEqual(2);
  });

  it('movePhase(p5, before p1) → p5 first, only p5 written; move to the end with null; unknown beforeId → ROADMAP_NOT_FOUND', async () => {
    await seedQ1();
    const moved = expectOk(await service.movePhase('pq5', 'pq1'));
    expect(moved.position).toBe(-1);
    expect((await repo.getPhase('pq1'))!.updatedAt).toBe('2026-10-27T01:00:00.000Z');
    const last = expectOk(await service.movePhase('pq5', null));
    expect(last.position).toBe(4); // after pq4 (3)
    expect(expectFail(await service.movePhase('pq5', 'ghost'))).toMatchObject({ code: 'ROADMAP_NOT_FOUND' });
    expect(expectFail(await service.moveItem('wq1', 'ghost', null))).toMatchObject({ code: 'ROADMAP_NOT_FOUND', params: { kind: 'phase' } });
  });
});

describe('watchDetail / watchList', () => {
  it('watchDetail re-emits when an entry is added: +30 min on 11-04 for gq → W2 105 (< 100 ms)', async () => {
    await seedQ1();
    const views: Array<RoadmapView | null> = [];
    const stop = service.watchDetail('rq', TODAY_Q1).subscribe((v) => views.push(v));
    await waitFor(() => views.length >= 1);
    expect(views[0]?.itemMinutes.get('wq2')).toBe(75);
    const t0 = performance.now();
    await new DexieEntryRepository(db, () => now).put(buildEntry({ id: 'e-new', goalId: 'gq', date: '2026-11-04', minutes: 30 }));
    await waitFor(() => views.at(-1)?.itemMinutes.get('wq2') === 105);
    expect(performance.now() - t0).toBeLessThan(100);
    expect(views.at(-1)?.hoursDoneMinutes).toBe(375);
    stop();
  });

  it('watchList: rows oldest first with goal name, counts, pace, hours and milestone; unlinked and missing variants', async () => {
    await seedQ1();
    const later = new Date('2026-11-04T04:00:00.000Z');
    now = later;
    const r2 = expectOk(await service.create(roadmapInput({ title: 'Spanish B1', milestoneLabel: 'Exam', milestoneDate: '2027-06-01' })));
    await db.goals.put(buildGoal({ id: 'gx', name: 'Ghost' }));
    const r3 = expectOk(await service.create(roadmapInput({ title: 'Portfolio', goalId: 'gx' })));
    await db.goals.update('gx', { deletedAt: later.toISOString() });
    const rows = await first(service.watchList(TODAY_Q1));
    expect(rows.map((r) => r.id)).toEqual(['rq', r2.id, r3.id]);
    expect(rows[0]).toMatchObject({ title: 'QPT 21 tuần', goalName: 'QPT study', linkState: 'linked', doneCount: 1, itemCount: 21, hoursDoneMinutes: 345, plannedMinutesToDate: 960, milestoneLabel: 'Thi QPT', milestoneDays: 125 });
    expect(rows[0].pace).toMatchObject({ kind: 'onTrack', severity: 'good' });
    expect(rows[1]).toMatchObject({ linkState: 'none', goalName: null, hoursDoneMinutes: null, itemCount: 0, milestoneDays: 209 });
    expect(rows[1].pace.kind).toBe('empty');
    expect(rows[2]).toMatchObject({ linkState: 'missing', goalName: null, hoursDoneMinutes: null, milestoneDays: null });
  });
});

function first<T>(s: { subscribe(next: (v: T) => void, error?: (e: unknown) => void): () => void }): Promise<T> {
  return new Promise((resolve, reject) => {
    const stop = s.subscribe(
      (v) => {
        resolve(v);
        setTimeout(stop, 0);
      },
      (e) => reject(e as Error),
    );
  });
}

async function waitFor(pred: () => boolean, timeoutMs = 2000): Promise<void> {
  const start = Date.now();
  while (!pred()) {
    if (Date.now() - start > timeoutMs) throw new Error('timeout');
    await new Promise((r) => setTimeout(r, 5));
  }
}
