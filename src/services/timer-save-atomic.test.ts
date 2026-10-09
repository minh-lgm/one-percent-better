/**
 * M3-AC15 — TimerService.save is atomic across tabs (ADR-16).
 *
 * "Two tabs" = two independent sets of repositories + EntryService + TimerService
 * on ONE fake-indexeddb database. They do not share a TimerService instance, so
 * the in-tab Mutex cannot hide a race; only the IndexedDB transaction can.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { openDatabase, type AppDatabase } from '../data/dexie/db';
import { DexieEntryRepository } from '../data/dexie/entry-repo';
import { DexieGoalRepository } from '../data/dexie/goal-repo';
import { DexieKvRepository } from '../data/dexie/kv-repo';
import { DexieTimerRepository } from '../data/dexie/timer-repo';
import type { EntryRepository, SaveTimerEntryOutcome, TimerRepository } from '../data/repositories';
import type { ActiveTimer } from '../domain/types';
import { buildEntry, datasetS1 } from '../test/builders';
import { createTestDatabase } from '../test/db';
import { EntryService } from './entry-service';
import { TimerService } from './timer-service';

let db: AppDatabase;
const STARTED = new Date('2026-10-09T09:30:00+07:00');
const NOW = new Date('2026-10-09T10:00:00+07:00');
const TIMER_G1: ActiveTimer = { goalId: 'g1', startedAt: STARTED.toISOString() };

/** One "tab": its own repositories and services on the shared database. */
function tab(database: AppDatabase = db) {
  const goals = new DexieGoalRepository(database);
  const entries = new DexieEntryRepository(database);
  const kv = new DexieKvRepository(database);
  const entryService = new EntryService(entries, goals);
  return { goals, entries, kv, entryService, timers: new TimerService(kv, goals, entryService, new DexieTimerRepository(database)) };
}

async function g1TimerEntries() {
  return db.entries.where('[goalId+date]').equals(['g1', '2026-10-09']).toArray();
}

beforeEach(async () => {
  db = createTestDatabase();
  await openDatabase(db);
  const s1 = datasetS1();
  await db.goals.bulkPut(s1.goals);
  await db.entries.bulkPut(s1.entries);
  await db.kv.put({ key: 'activeTimer', value: TIMER_G1 });
});

afterEach(async () => {
  await db.delete();
});

describe('TimerService.save across two tabs (M3-AC15)', () => {
  it('two simultaneous saves create exactly one timer entry; the loser gets TIMER_NOT_RUNNING — 20/20 runs', async () => {
    for (let run = 0; run < 20; run++) {
      await db.entries.where('[goalId+date]').equals(['g1', '2026-10-09']).delete();
      await db.kv.put({ key: 'activeTimer', value: TIMER_G1 });
      const tabA = tab();
      const tabB = tab();
      const [a, b] = await Promise.all([tabA.timers.save({ minutes: 30, note: 'A' }, NOW), tabB.timers.save({ minutes: 30, note: 'B' }, NOW)]);
      const results = [a, b];
      expect(results.filter((r) => r.ok)).toHaveLength(1);
      const failed = results.find((r) => !r.ok);
      expect(failed && !failed.ok ? failed.errors[0].code : null).toBe('TIMER_NOT_RUNNING');
      const saved = await g1TimerEntries();
      expect(saved).toHaveLength(1);
      expect(saved[0]).toMatchObject({ source: 'timer', minutes: 30 });
      expect(await db.kv.get('activeTimer')).toBeUndefined();
    }
  });

  it('save in tab A racing discard in tab B: 0 or 1 entry, timer gone', async () => {
    const tabA = tab();
    const tabB = tab();
    const [a, b] = await Promise.all([tabA.timers.save({ minutes: 30, note: 'A' }, NOW), tabB.timers.discard()]);
    expect([a.ok, b.ok].filter(Boolean).length).toBeGreaterThanOrEqual(1);
    const count = (await g1TimerEntries()).length;
    expect(count === 0 || count === 1).toBe(true);
    if (a.ok) expect(count).toBe(1);
    expect(await db.kv.get('activeTimer')).toBeUndefined();
  });

  it('timer replaced by another goal meanwhile → TIMER_NOT_RUNNING, no G1 entry, G2 timer intact', async () => {
    const g2Timer: ActiveTimer = { goalId: 'g2', startedAt: NOW.toISOString() };
    await db.kv.put({ key: 'activeTimer', value: g2Timer });
    const repo = new DexieTimerRepository(db);
    const entry = buildEntry({ id: 'x', goalId: 'g1', date: '2026-10-09', minutes: 30, source: 'timer' });
    expect(await repo.saveTimerEntry(TIMER_G1, entry, 1440)).toEqual({ status: 'timer-changed' });
    expect(await g1TimerEntries()).toHaveLength(0);
    expect(await db.kv.get('activeTimer')).toEqual({ key: 'activeTimer', value: g2Timer });
  });

  it('goal deleted while its timer is still stored → GOAL_NOT_FOUND and no orphan entry', async () => {
    const t = tab();
    await new DexieGoalRepository(db).deleteWithEntries('g1'); // kv activeTimer deliberately left behind
    const r = await t.timers.save({ minutes: 30, note: '' }, NOW);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors[0].code).toBe('GOAL_NOT_FOUND');
    expect(await db.entries.where('goalId').equals('g1').count()).toBe(0);
  });
});

describe('TimerService.save when the repository throws (M2-D3 behaviour kept after M3-T7)', () => {
  it('a throwing saveTimerEntry rejects that call, keeps the timer and does not wedge the Mutex; a queued save then succeeds', async () => {
    const t = tab();
    const repo = new DexieTimerRepository(db);
    const original = repo.saveTimerEntry.bind(repo);
    const throwing: TimerRepository = {
      saveTimerEntry: vi.fn().mockRejectedValueOnce(new Error('disk full')).mockImplementation(original),
    };
    const timers = new TimerService(t.kv, t.goals, t.entryService, throwing);
    const [failing, queued] = await Promise.allSettled([timers.save({ minutes: 25, note: '' }, NOW), timers.save({ minutes: 25, note: 'second' }, NOW)]);
    expect(failing.status).toBe('rejected');
    expect(queued.status).toBe('fulfilled');
    expect(queued.status === 'fulfilled' && queued.value.ok).toBe(true);
    expect(await g1TimerEntries()).toHaveLength(1);
    expect(await timers.current()).toBeUndefined();
    expect((await timers.start('g1', NOW)).ok).toBe(true);
    expect((await timers.discard()).ok).toBe(true);
    expect((await timers.discard()).ok).toBe(false);
  });
});

describe('TimerService.save outcome mapping with a fake TimerRepository (M3-AC15)', () => {
  function withOutcome(outcome: SaveTimerEntryOutcome) {
    const goals = new DexieGoalRepository(db);
    const entries = new DexieEntryRepository(db);
    const kv = new DexieKvRepository(db);
    const fake: TimerRepository = { saveTimerEntry: vi.fn(async () => outcome) };
    return { fake, timers: new TimerService(kv, goals, new EntryService(entries, goals), fake) };
  }

  it('timer-changed → TIMER_NOT_RUNNING', async () => {
    const { timers } = withOutcome({ status: 'timer-changed' });
    const r = await timers.save({ minutes: 30, note: '' }, NOW);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors[0].code).toBe('TIMER_NOT_RUNNING');
  });

  it('goal-missing → GOAL_NOT_FOUND', async () => {
    const { timers } = withOutcome({ status: 'goal-missing' });
    const r = await timers.save({ minutes: 30, note: '' }, NOW);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors[0].code).toBe('GOAL_NOT_FOUND');
  });

  it('day-limit with 1430 existing → ENTRY_DAY_LIMIT_EXCEEDED with params.remaining = 10', async () => {
    const { timers } = withOutcome({ status: 'day-limit', existingMinutes: 1430 });
    const r = await timers.save({ minutes: 30, note: '' }, NOW);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.errors[0].code).toBe('ENTRY_DAY_LIMIT_EXCEEDED');
      expect(r.errors[0].params).toEqual({ remaining: 10 });
      expect(r.errors[0].field).toBe('minutes');
    }
  });

  it('saved → ok with the prepared entry; the repository receives the timer that was read', async () => {
    const { fake, timers } = withOutcome({ status: 'saved' });
    const r = await timers.save({ minutes: 30, note: 'ok' }, NOW);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value).toMatchObject({ goalId: 'g1', date: '2026-10-09', minutes: 30, note: 'ok', source: 'timer' });
    expect(fake.saveTimerEntry).toHaveBeenCalledWith(TIMER_G1, expect.objectContaining({ goalId: 'g1', minutes: 30 }), 1440);
  });

  it('validation failures never reach the repository', async () => {
    const { fake, timers } = withOutcome({ status: 'saved' });
    const r = await timers.save({ minutes: 0, note: '' }, NOW);
    expect(r.ok).toBe(false);
    expect(fake.saveTimerEntry).not.toHaveBeenCalled();
  });
});

describe('EntryService.update/remove use getById only (M3-AC14)', () => {
  function spied() {
    const goals = new DexieGoalRepository(db);
    const real = new DexieEntryRepository(db);
    const repo: EntryRepository = {
      getById: vi.fn((id) => real.getById(id)),
      getByGoal: vi.fn((g) => real.getByGoal(g)),
      getByDateRange: vi.fn((a, b) => real.getByDateRange(a, b)),
      sumMinutes: vi.fn((g, d, x) => real.sumMinutes(g, d, x)),
      put: vi.fn((e) => real.put(e)),
      delete: vi.fn((id) => real.delete(id)),
      watchByDateRange: (a, b) => real.watchByDateRange(a, b),
      watchByGoal: (g) => real.watchByGoal(g),
    };
    return { repo, service: new EntryService(repo, goals) };
  }

  it('update calls getById once and never getByDateRange', async () => {
    const { repo, service } = spied();
    const r = await service.update('e-g1-5', { minutes: 25, note: 'x' }, NOW);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value).toMatchObject({ id: 'e-g1-5', minutes: 25, note: 'x', date: '2026-10-05' });
    expect(repo.getById).toHaveBeenCalledTimes(1);
    expect(repo.getById).toHaveBeenCalledWith('e-g1-5');
    expect(repo.getByDateRange).not.toHaveBeenCalled();
    expect(repo.getByGoal).not.toHaveBeenCalled();
  });

  it('remove calls getById once and never getByDateRange', async () => {
    const { repo, service } = spied();
    expect((await service.remove('e-g1-5')).ok).toBe(true);
    expect(repo.getById).toHaveBeenCalledTimes(1);
    expect(repo.getByDateRange).not.toHaveBeenCalled();
    expect(await db.entries.get('e-g1-5')).toBeUndefined();
  });

  it('unknown id → ENTRY_NOT_FOUND and the database is unchanged', async () => {
    const { repo, service } = spied();
    const before = await db.entries.toArray();
    const u = await service.update('khong-ton-tai', { minutes: 5, note: '' }, NOW);
    const d = await service.remove('khong-ton-tai');
    expect(!u.ok && u.errors[0].code).toBe('ENTRY_NOT_FOUND');
    expect(!d.ok && d.errors[0].code).toBe('ENTRY_NOT_FOUND');
    expect(repo.put).not.toHaveBeenCalled();
    expect(repo.delete).not.toHaveBeenCalled();
    expect(await db.entries.toArray()).toEqual(before);
  });
});
