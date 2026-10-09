import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ActiveTimer, LogEntry } from '../../domain/types';
import { buildEntry, datasetS1 } from '../../test/builders';
import { createTestDatabase } from '../../test/db';
import { openDatabase, type AppDatabase } from './db';
import { DexieEntryRepository } from './entry-repo';
import { DexieGoalRepository } from './goal-repo';
import { DexieKvRepository } from './kv-repo';
import { DexieTimerRepository } from './timer-repo';

let db: AppDatabase;
let timers: DexieTimerRepository;
let kv: DexieKvRepository;

const TIMER_G1: ActiveTimer = { goalId: 'g1', startedAt: '2026-10-09T02:30:00.000Z' }; // 09:30 +07:00
const timerEntry = (overrides: Partial<LogEntry> = {}): LogEntry =>
  buildEntry({ id: 'timer-entry', goalId: 'g1', date: '2026-10-09', minutes: 30, note: 'A', source: 'timer', ...overrides });

beforeEach(async () => {
  db = createTestDatabase();
  await openDatabase(db);
  timers = new DexieTimerRepository(db);
  kv = new DexieKvRepository(db);
  const s1 = datasetS1();
  await db.goals.bulkPut(s1.goals);
  await db.entries.bulkPut(s1.entries);
  await kv.set('activeTimer', TIMER_G1);
});

afterEach(async () => {
  await db.delete();
});

describe('DexieEntryRepository.getById (M3-AC14)', () => {
  it('returns the stored entry deep-equal, undefined for unknown ids and after delete', async () => {
    const entries = new DexieEntryRepository(db);
    const e = (await db.entries.get('e-g1-5'))!;
    expect(e.date).toBe('2026-10-05');
    expect(await entries.getById('e-g1-5')).toEqual(e);
    expect(await entries.getById('khong-ton-tai')).toBeUndefined();
    await entries.delete('e-g1-5');
    expect(await entries.getById('e-g1-5')).toBeUndefined();
  });
});

describe('DexieTimerRepository.saveTimerEntry (M3-AC15, ADR-16)', () => {
  it('saved: writes the entry and removes activeTimer in one go', async () => {
    const entry = timerEntry();
    expect(await timers.saveTimerEntry(TIMER_G1, entry, 1440)).toEqual({ status: 'saved' });
    expect(await db.entries.get('timer-entry')).toEqual(entry);
    expect(await kv.get('activeTimer')).toBeUndefined();
  });

  it('timer-changed: a different timer (another goal) is stored → nothing written, the new timer stays', async () => {
    const g2Timer: ActiveTimer = { goalId: 'g2', startedAt: '2026-10-09T03:00:00.000Z' };
    await kv.set('activeTimer', g2Timer);
    expect(await timers.saveTimerEntry(TIMER_G1, timerEntry(), 1440)).toEqual({ status: 'timer-changed' });
    expect(await db.entries.get('timer-entry')).toBeUndefined();
    expect(await kv.get('activeTimer')).toEqual(g2Timer);
  });

  it('timer-changed: the timer was already cleared (saved/discarded elsewhere)', async () => {
    await kv.delete('activeTimer');
    expect(await timers.saveTimerEntry(TIMER_G1, timerEntry(), 1440)).toEqual({ status: 'timer-changed' });
    expect(await db.entries.get('timer-entry')).toBeUndefined();
  });

  it('timer-changed: same goal but a different startedAt', async () => {
    await kv.set('activeTimer', { goalId: 'g1', startedAt: '2026-10-09T02:45:00.000Z' });
    expect(await timers.saveTimerEntry(TIMER_G1, timerEntry(), 1440)).toEqual({ status: 'timer-changed' });
    expect(await db.entries.get('timer-entry')).toBeUndefined();
  });

  it('day-limit: the limit is re-checked inside the transaction; nothing written, timer kept', async () => {
    // 1420 minutes were written after the entry was prepared.
    await db.entries.put(buildEntry({ id: 'late', goalId: 'g1', date: '2026-10-09', minutes: 1420 }));
    expect(await timers.saveTimerEntry(TIMER_G1, timerEntry({ minutes: 30 }), 1440)).toEqual({ status: 'day-limit', existingMinutes: 1420 });
    expect(await db.entries.get('timer-entry')).toBeUndefined();
    expect(await kv.get('activeTimer')).toEqual(TIMER_G1);
    // Exactly at the limit is fine.
    expect(await timers.saveTimerEntry(TIMER_G1, timerEntry({ minutes: 20 }), 1440)).toEqual({ status: 'saved' });
  });

  it('goal-missing: goal deleted with its entries while the timer was still stored → no orphan entry', async () => {
    await new DexieGoalRepository(db).deleteWithEntries('g1');
    expect(await kv.get('activeTimer')).toEqual(TIMER_G1); // the repository alone does not touch kv
    expect(await timers.saveTimerEntry(TIMER_G1, timerEntry(), 1440)).toEqual({ status: 'goal-missing' });
    expect(await db.entries.where('goalId').equals('g1').count()).toBe(0);
  });

  it('rolls back when the entry put fails: no entry, activeTimer untouched', async () => {
    const spy = vi.spyOn(db.entries, 'put').mockRejectedValueOnce(new Error('boom'));
    await expect(timers.saveTimerEntry(TIMER_G1, timerEntry(), 1440)).rejects.toThrow('boom');
    spy.mockRestore();
    expect(await db.entries.get('timer-entry')).toBeUndefined();
    expect(await kv.get('activeTimer')).toEqual(TIMER_G1);
  });

  it('rolls back when the kv delete fails: the entry is not left behind', async () => {
    const spy = vi.spyOn(db.kv, 'delete').mockRejectedValueOnce(new Error('kv boom'));
    await expect(timers.saveTimerEntry(TIMER_G1, timerEntry(), 1440)).rejects.toThrow('kv boom');
    spy.mockRestore();
    expect(await db.entries.get('timer-entry')).toBeUndefined();
    expect(await kv.get('activeTimer')).toEqual(TIMER_G1);
  });

  it('two repositories on the same database (two tabs): concurrent saves write exactly one entry, 20/20 runs', async () => {
    for (let run = 0; run < 20; run++) {
      await db.entries.where('goalId').equals('g1').and((e) => e.date === '2026-10-09').delete();
      await kv.set('activeTimer', TIMER_G1);
      const tabA = new DexieTimerRepository(db);
      const tabB = new DexieTimerRepository(db);
      const [a, b] = await Promise.all([
        tabA.saveTimerEntry(TIMER_G1, timerEntry({ id: `a-${run}`, note: 'A' }), 1440),
        tabB.saveTimerEntry(TIMER_G1, timerEntry({ id: `b-${run}`, note: 'B' }), 1440),
      ]);
      expect([a.status, b.status].sort()).toEqual(['saved', 'timer-changed']);
      expect(await db.entries.where('[goalId+date]').equals(['g1', '2026-10-09']).count()).toBe(1);
      expect(await kv.get('activeTimer')).toBeUndefined();
    }
  });
});
