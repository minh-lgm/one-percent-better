import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { openDatabase, type AppDatabase } from '../data/dexie/db';
import { DexieEntryRepository } from '../data/dexie/entry-repo';
import { DexieGoalRepository } from '../data/dexie/goal-repo';
import { DexieKvRepository } from '../data/dexie/kv-repo';
import { buildGoal, datasetS1, FIXED_NOW } from '../test/builders';
import { createTestDatabase } from '../test/db';
import { EntryService } from './entry-service';
import { GoalService } from './goal-service';
import { TimerService } from './timer-service';

let db: AppDatabase;
let timers: TimerService;
let goalService: GoalService;
let kv: DexieKvRepository;

const at = (iso: string) => new Date(iso);

beforeEach(async () => {
  db = createTestDatabase();
  await openDatabase(db);
  const goals = new DexieGoalRepository(db);
  const entries = new DexieEntryRepository(db);
  kv = new DexieKvRepository(db);
  timers = new TimerService(kv, goals, new EntryService(entries, goals));
  goalService = new GoalService(goals, entries, undefined, kv);
  const s1 = datasetS1();
  await db.goals.bulkPut(s1.goals);
  await db.entries.bulkPut(s1.entries);
});

afterEach(async () => {
  await db.delete();
});

describe('TimerService.start (M2-AC1)', () => {
  it('stores activeTimer with the goal and start time', async () => {
    const r = await timers.start('g1', FIXED_NOW);
    expect(r).toEqual({ ok: true, value: { goalId: 'g1', startedAt: FIXED_NOW.toISOString() } });
    expect(await kv.get('activeTimer')).toEqual({ goalId: 'g1', startedAt: FIXED_NOW.toISOString() });
    expect(await timers.current()).toEqual({ goalId: 'g1', startedAt: FIXED_NOW.toISOString() });
  });

  it('rejects a second timer with TIMER_ALREADY_RUNNING', async () => {
    await timers.start('g1', FIXED_NOW);
    const r = await timers.start('g2', at('2026-10-09T10:05:00+07:00'));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors[0].code).toBe('TIMER_ALREADY_RUNNING');
    expect((await kv.get<{ goalId: string }>('activeTimer'))?.goalId).toBe('g1');
  });

  it('rejects upcoming and ended goals with GOAL_NOT_ACTIVE, unknown goals with GOAL_NOT_FOUND', async () => {
    for (const id of ['g4', 'g5']) {
      const r = await timers.start(id, FIXED_NOW);
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.errors[0].code).toBe('GOAL_NOT_ACTIVE');
    }
    const r = await timers.start('nope', FIXED_NOW);
    if (!r.ok) expect(r.errors[0].code).toBe('GOAL_NOT_FOUND');
    expect(await kv.get('activeTimer')).toBeUndefined();
  });

  it('replaces an orphaned timer whose goal no longer exists', async () => {
    await kv.set('activeTimer', { goalId: 'deleted', startedAt: FIXED_NOW.toISOString() });
    const r = await timers.start('g1', FIXED_NOW);
    expect(r.ok).toBe(true);
  });
});

describe('TimerService.stop / save / discard (M2-AC3, M2-AC4)', () => {
  it('stop returns TIMER_NOT_RUNNING when nothing runs', async () => {
    const r = await timers.stop(FIXED_NOW);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors[0].code).toBe('TIMER_NOT_RUNNING');
    const d = await timers.discard();
    if (!d.ok) expect(d.errors[0].code).toBe('TIMER_NOT_RUNNING');
    const s = await timers.save({ minutes: 5, note: '' }, FIXED_NOW);
    if (!s.ok) expect(s.errors[0].code).toBe('TIMER_NOT_RUNNING');
  });

  it('stop previews rounded minutes without clearing the timer', async () => {
    await timers.start('g1', FIXED_NOW);
    const r = await timers.stop(at('2026-10-09T10:25:31+07:00'));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value).toMatchObject({ goalId: 'g1', date: '2026-10-09', minutes: 26, elapsedMs: 25 * 60_000 + 31_000 });
    expect(await timers.current()).toBeDefined();
  });

  it('save creates a timer entry on the start day and clears the timer', async () => {
    await timers.start('g1', FIXED_NOW);
    const r = await timers.save({ minutes: 25, note: 'Pomodoro' }, at('2026-10-09T10:25:31+07:00'));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value).toMatchObject({ goalId: 'g1', date: '2026-10-09', minutes: 25, note: 'Pomodoro', source: 'timer' });
    expect(await db.entries.get(r.value.id)).toEqual(r.value);
    expect(await kv.get('activeTimer')).toBeUndefined();
  });

  it('save across midnight writes to the start day (M2-AC4)', async () => {
    await timers.start('g2', at('2026-10-09T23:50:00+07:00'));
    const r = await timers.save({ minutes: 30, note: '' }, at('2026-10-10T00:20:00+07:00'));
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value).toMatchObject({ date: '2026-10-09', minutes: 30, source: 'timer' });
  });

  it('save fails with DATE_OUTSIDE_GOAL_PERIOD when the start day left the goal period; timer stays', async () => {
    await timers.start('g1', FIXED_NOW);
    // The goal was edited meanwhile to end before the timer started.
    const g1 = (await db.goals.get('g1'))!;
    await db.entries.where('goalId').equals('g1').delete();
    await db.goals.put({ ...g1, startDate: '2026-10-01', endDate: '2026-10-08' });
    const r = await timers.save({ minutes: 10, note: '' }, at('2026-10-09T10:20:00+07:00'));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors[0].code).toBe('DATE_OUTSIDE_GOAL_PERIOD');
    expect(await timers.current()).toBeDefined();
    const d = await timers.discard();
    expect(d.ok).toBe(true);
    expect(await timers.current()).toBeUndefined();
  });

  it('save validates minutes/note like a manual entry and keeps the timer on error', async () => {
    await timers.start('g1', FIXED_NOW);
    const r = await timers.save({ minutes: 0, note: '' }, at('2026-10-09T10:20:00+07:00'));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors[0].code).toBe('ENTRY_MINUTES_INVALID');
    expect(await timers.current()).toBeDefined();
    expect(await db.entries.where('goalId').equals('g1').count()).toBe(8);
  });

  it('discard removes the timer without creating an entry', async () => {
    await timers.start('g1', FIXED_NOW);
    const before = await db.entries.count();
    expect((await timers.discard()).ok).toBe(true);
    expect(await kv.get('activeTimer')).toBeUndefined();
    expect(await db.entries.count()).toBe(before);
  });

  it('watch emits the current timer and undefined after discard', async () => {
    const seen: unknown[] = [];
    const unsubscribe = timers.watch().subscribe((v) => seen.push(v));
    await new Promise((r) => setTimeout(r, 50));
    await timers.start('g1', FIXED_NOW);
    await new Promise((r) => setTimeout(r, 50));
    await timers.discard();
    await new Promise((r) => setTimeout(r, 50));
    unsubscribe();
    expect(seen).toContainEqual({ goalId: 'g1', startedAt: FIXED_NOW.toISOString() });
    expect(seen[seen.length - 1]).toBeUndefined();
  });
});

describe('concurrent calls are serialised (M2-D3 regression)', () => {
  it('two simultaneous start() calls leave exactly one timer and one TIMER_ALREADY_RUNNING', async () => {
    const [a, b] = await Promise.all([timers.start('g1', FIXED_NOW), timers.start('g2', FIXED_NOW)]);
    expect([a.ok, b.ok].filter(Boolean)).toHaveLength(1);
    const failed = [a, b].find((r) => !r.ok);
    if (failed && !failed.ok) expect(failed.errors[0].code).toBe('TIMER_ALREADY_RUNNING');
    expect((await timers.current())?.goalId).toBe('g1');
  });

  it('two simultaneous save() calls create exactly one entry; the second gets TIMER_NOT_RUNNING', async () => {
    await timers.start('g1', FIXED_NOW);
    const later = at('2026-10-09T10:25:00+07:00');
    const [r1, r2] = await Promise.all([timers.save({ minutes: 25, note: '' }, later), timers.save({ minutes: 25, note: '' }, later)]);
    expect([r1.ok, r2.ok].filter(Boolean)).toHaveLength(1);
    if (!r2.ok) expect(r2.errors[0].code).toBe('TIMER_NOT_RUNNING');
    expect(await db.entries.where('goalId').equals('g1').and((e) => e.date === '2026-10-09').count()).toBe(1);
    expect(await timers.current()).toBeUndefined();
  });

  it('save() and discard() racing: at most one of them wins', async () => {
    await timers.start('g1', FIXED_NOW);
    const later = at('2026-10-09T10:25:00+07:00');
    const [r1, r2] = await Promise.all([timers.save({ minutes: 25, note: '' }, later), timers.discard()]);
    expect([r1.ok, r2.ok].filter(Boolean)).toHaveLength(1);
    expect(await timers.current()).toBeUndefined();
  });
});

describe('GoalService.remove discards the timer of the deleted goal (M2-AC5)', () => {
  it('clears activeTimer when it belongs to the removed goal', async () => {
    await timers.start('g1', FIXED_NOW);
    expect((await goalService.remove('g1')).ok).toBe(true);
    expect(await kv.get('activeTimer')).toBeUndefined();
    expect(await db.goals.get('g1')).toBeUndefined();
  });

  it('keeps a timer that belongs to another goal', async () => {
    await timers.start('g2', FIXED_NOW);
    await goalService.remove('g1');
    expect((await kv.get<{ goalId: string }>('activeTimer'))?.goalId).toBe('g2');
  });

  it('works for a goal without a timer and without kv (M1 constructor)', async () => {
    const plain = new GoalService(new DexieGoalRepository(db), new DexieEntryRepository(db));
    await db.goals.put(buildGoal({ id: 'tmp', name: 'Tmp' }));
    expect((await plain.remove('tmp')).ok).toBe(true);
  });
});
