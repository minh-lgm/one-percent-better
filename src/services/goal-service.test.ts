import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { openDatabase, type AppDatabase } from '../data/dexie/db';
import { DexieEntryRepository } from '../data/dexie/entry-repo';
import { DexieGoalRepository } from '../data/dexie/goal-repo';
import { DexieKvRepository } from '../data/dexie/kv-repo';
import { buildEntry, FIXED_NOW } from '../test/builders';
import { createTestDatabase } from '../test/db';
import { GoalService } from './goal-service';
import type { GoalInput } from '../domain/goal';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

let db: AppDatabase;
let service: GoalService;
let entryRepo: DexieEntryRepository;

// v2 (M7, ADR-20): rows carry `deletedAt`/`dirty`; compare the stored row as the app reads it.
const storedGoal = async (id: string) => {
  const row = await db.goals.get(id);
  if (!row || row.deletedAt != null) return undefined;
  const { deletedAt: _d, dirty: _f, ...goal } = row;
  return goal;
};
const liveGoals = () => db.goals.filter((g) => g.deletedAt == null).count();
const liveEntries = () => db.entries.filter((e) => e.deletedAt == null).count();

const input: GoalInput = { name: 'Read', why: 'Be smarter', targetType: 'daily', targetValue: 30, startDate: '2026-10-01', endDate: '2026-10-31' };

beforeEach(async () => {
  db = createTestDatabase();
  await openDatabase(db);
  entryRepo = new DexieEntryRepository(db);
  service = new GoalService(new DexieGoalRepository(db), entryRepo);
});

afterEach(async () => {
  await db.delete();
});

describe('GoalService.create', () => {
  it('stores a goal with UUID id and timestamps (M1-AC13)', async () => {
    const r = await service.create(input, FIXED_NOW);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.id).toMatch(UUID_RE);
    expect(r.value.createdAt).toBe(FIXED_NOW.toISOString());
    expect(r.value.updatedAt).toBe(FIXED_NOW.toISOString());
    expect(r.value.archived).toBe(false);
    expect(r.value.targetMinutes).toBe(30);
    expect(await storedGoal(r.value.id)).toEqual(r.value);
  });

  it('does not store an invalid goal (M1-AC3)', async () => {
    const r = await service.create({ ...input, name: '' }, FIXED_NOW);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors[0].code).toBe('GOAL_NAME_REQUIRED');
    expect(await liveGoals()).toBe(0);
  });

  it('stores total goals in minutes', async () => {
    const r = await service.create({ ...input, targetType: 'total', targetValue: 100, startDate: '2026-01-01', endDate: '2026-12-31' }, FIXED_NOW);
    if (r.ok) expect(r.value.targetMinutes).toBe(6000);
  });
});

describe('GoalService.update (M1-AC8)', () => {
  it('rejects a period that would exclude existing entries, leaving the goal unchanged', async () => {
    const created = await service.create(input, FIXED_NOW);
    if (!created.ok) throw new Error('setup');
    await entryRepo.put(buildEntry({ goalId: created.value.id, date: '2026-10-01', minutes: 30 }));
    const r = await service.update(created.value.id, { ...input, startDate: '2026-10-02' }, new Date('2026-10-09T11:00:00+07:00'));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors[0].code).toBe('GOAL_PERIOD_EXCLUDES_ENTRIES');
    expect(await storedGoal(created.value.id)).toEqual(created.value);
  });

  it('updates name/why/target and bumps updatedAt only', async () => {
    const created = await service.create(input, FIXED_NOW);
    if (!created.ok) throw new Error('setup');
    await entryRepo.put(buildEntry({ goalId: created.value.id, date: '2026-10-01', minutes: 30 }));
    const later = new Date('2026-10-09T11:00:00+07:00');
    const r = await service.update(created.value.id, { ...input, name: 'Read more', why: 'Wiser', targetValue: 45 }, later);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.name).toBe('Read more');
    expect(r.value.why).toBe('Wiser');
    expect(r.value.targetMinutes).toBe(45);
    expect(r.value.createdAt).toBe(FIXED_NOW.toISOString());
    expect(r.value.updatedAt).toBe(later.toISOString());
    expect(await storedGoal(created.value.id)).toEqual(r.value);
  });

  it('allows widening the period and reports unknown ids', async () => {
    const created = await service.create(input, FIXED_NOW);
    if (!created.ok) throw new Error('setup');
    await entryRepo.put(buildEntry({ goalId: created.value.id, date: '2026-10-01', minutes: 30 }));
    const r = await service.update(created.value.id, { ...input, endDate: '2026-11-30' }, FIXED_NOW);
    expect(r.ok).toBe(true);
    const missing = await service.update('nope', input, FIXED_NOW);
    expect(missing.ok).toBe(false);
    if (!missing.ok) expect(missing.errors[0].code).toBe('GOAL_NOT_FOUND');
  });

  it('validation errors do not touch the stored goal', async () => {
    const created = await service.create(input, FIXED_NOW);
    if (!created.ok) throw new Error('setup');
    const r = await service.update(created.value.id, { ...input, name: 'x'.repeat(61) }, FIXED_NOW);
    expect(r.ok).toBe(false);
    expect(await storedGoal(created.value.id)).toEqual(created.value);
  });
});

describe('GoalService.remove (M1-AC9)', () => {
  it('deletes goal and entries; unknown id reports GOAL_NOT_FOUND', async () => {
    const created = await service.create(input, FIXED_NOW);
    if (!created.ok) throw new Error('setup');
    await entryRepo.put(buildEntry({ goalId: created.value.id, date: '2026-10-01', minutes: 30 }));
    expect(await service.entryCount(created.value.id)).toBe(1);
    expect(await service.entryDateRange(created.value.id)).toEqual({ first: '2026-10-01', last: '2026-10-01' });
    const r = await service.remove(created.value.id);
    expect(r.ok).toBe(true);
    expect(await liveGoals()).toBe(0);
    expect(await liveEntries()).toBe(0);
    // v2: tombstones remain so the deletion reaches the account (ADR-20).
    expect((await db.goals.get(created.value.id))?.deletedAt).toBeTruthy();
    expect(await db.entries.count()).toBe(1);
    const missing = await service.remove('nope');
    expect(missing.ok).toBe(false);
    expect(await service.entryDateRange('nope')).toBeNull();
  });

  it('uses the injected id generator', async () => {
    const s = new GoalService(new DexieGoalRepository(db), entryRepo, () => 'fixed-id');
    const r = await s.create(input, FIXED_NOW);
    if (r.ok) expect(r.value.id).toBe('fixed-id');
    vi.restoreAllMocks();
  });
});

describe('GoalService.setArchived (FR-30, M5-AC4)', () => {
  const later = new Date('2026-10-09T11:00:00+07:00');

  it('archives and restores, bumping updatedAt; unknown id → GOAL_NOT_FOUND', async () => {
    const created = await service.create(input, FIXED_NOW);
    if (!created.ok) throw new Error('setup');
    const archived = await service.setArchived(created.value.id, true, later);
    expect(archived.ok).toBe(true);
    const stored = await storedGoal(created.value.id);
    expect(stored).toMatchObject({ archived: true, updatedAt: later.toISOString(), createdAt: FIXED_NOW.toISOString() });
    const restored = await service.setArchived(created.value.id, false, new Date('2026-10-09T12:00:00+07:00'));
    expect(restored.ok && restored.value.archived).toBe(false);
    expect((await storedGoal(created.value.id))?.updatedAt).toBe('2026-10-09T05:00:00.000Z');
    const missing = await service.setArchived('nope', true, later);
    expect(!missing.ok && missing.errors[0].code).toBe('GOAL_NOT_FOUND');
  });

  it('refuses to archive the goal whose timer is running (GOAL_TIMER_RUNNING) and leaves it unchanged', async () => {
    const kv = new DexieKvRepository(db);
    const withKv = new GoalService(new DexieGoalRepository(db), entryRepo, undefined, kv);
    const created = await withKv.create(input, FIXED_NOW);
    if (!created.ok) throw new Error('setup');
    await kv.set('activeTimer', { goalId: created.value.id, startedAt: FIXED_NOW.toISOString() });
    const r = await withKv.setArchived(created.value.id, true, later);
    expect(!r.ok && r.errors[0].code).toBe('GOAL_TIMER_RUNNING');
    expect(await storedGoal(created.value.id)).toEqual(created.value);
    // A timer on another goal does not block, and restoring never checks the timer.
    await kv.set('activeTimer', { goalId: 'other', startedAt: FIXED_NOW.toISOString() });
    expect((await withKv.setArchived(created.value.id, true, later)).ok).toBe(true);
    await kv.set('activeTimer', { goalId: created.value.id, startedAt: FIXED_NOW.toISOString() });
    expect((await withKv.setArchived(created.value.id, false, later)).ok).toBe(true);
  });
});
