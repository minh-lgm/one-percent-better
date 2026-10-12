import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { openDatabase, type AppDatabase } from '../data/dexie/db';
import { DexieEntryRepository } from '../data/dexie/entry-repo';
import { DexieGoalRepository } from '../data/dexie/goal-repo';
import { buildGoal, FIXED_NOW, TODAY } from '../test/builders';
import { createTestDatabase } from '../test/db';
import { EntryService } from './entry-service';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

let db: AppDatabase;
let service: EntryService;
const liveEntries = () => db.entries.filter((e) => e.deletedAt == null).count();
const goal = buildGoal({ id: 'g1', startDate: '2026-10-01', endDate: '2026-10-31' });

beforeEach(async () => {
  db = createTestDatabase();
  await openDatabase(db);
  await db.goals.put(goal);
  service = new EntryService(new DexieEntryRepository(db), new DexieGoalRepository(db));
});

afterEach(async () => {
  await db.delete();
});

const add = (minutes: number, note = '', date = TODAY, goalId = 'g1') =>
  service.add({ goalId, date, minutes, note, source: 'manual' }, FIXED_NOW);

describe('EntryService.add (M1-AC6)', () => {
  it('stores a valid entry with UUID and timestamps', async () => {
    const r = await add(20, 'Ch. 3');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.id).toMatch(UUID_RE);
    expect(r.value).toMatchObject({ goalId: 'g1', date: TODAY, minutes: 20, note: 'Ch. 3', source: 'manual' });
    expect(r.value.createdAt).toBe(FIXED_NOW.toISOString());
    expect(await liveEntries()).toBe(1);
  });

  it('rejects invalid minutes and long notes without storing', async () => {
    for (const minutes of [0, 1441, 12.5, Number.NaN]) {
      const r = await add(minutes);
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.errors[0].code).toBe('ENTRY_MINUTES_INVALID');
    }
    const r = await add(10, 'a'.repeat(281));
    if (!r.ok) expect(r.errors[0].code).toBe('ENTRY_NOTE_TOO_LONG');
    expect(await liveEntries()).toBe(0);
  });

  it('enforces the 1440-minute day limit', async () => {
    expect((await add(1400)).ok).toBe(true);
    const over = await add(41);
    expect(over.ok).toBe(false);
    if (!over.ok) {
      expect(over.errors[0].code).toBe('ENTRY_DAY_LIMIT_EXCEEDED');
      expect(over.errors[0].params).toEqual({ remaining: 40 });
    }
    expect((await add(40)).ok).toBe(true);
    const full = await add(1);
    if (!full.ok) expect(full.errors[0].params).toEqual({ remaining: 0 });
  });

  it('validates every date, not only today', async () => {
    const future = await add(10, '', '2026-10-10');
    if (!future.ok) expect(future.errors[0].code).toBe('DATE_IN_FUTURE');
    const outside = await add(10, '', '2026-09-30');
    expect(outside.ok).toBe(false);
    if (!outside.ok) {
      expect(outside.errors[0].code).toBe('DATE_OUTSIDE_GOAL_PERIOD');
      expect(outside.errors[0].params).toEqual({ start: '2026-10-01', end: '2026-10-31' });
    }
    expect((await add(10, '', '2026-10-05')).ok).toBe(true);
  });

  it('rejects unknown goals', async () => {
    const r = await add(10, '', TODAY, 'nope');
    if (!r.ok) expect(r.errors[0].code).toBe('GOAL_NOT_FOUND');
  });
});

describe('EntryService.update / remove (M1-AC7)', () => {
  it('update excludes the entry itself from the day limit', async () => {
    const a = await add(1400);
    const b = await add(40);
    if (!a.ok || !b.ok) throw new Error('setup');
    // Day is full (1440). Changing b from 40 to 40 must still be allowed; 41 must fail.
    expect((await service.update(b.value.id, { minutes: 40, note: 'x' }, FIXED_NOW)).ok).toBe(true);
    const over = await service.update(b.value.id, { minutes: 41, note: '' }, FIXED_NOW);
    expect(over.ok).toBe(false);
    if (!over.ok) expect(over.errors[0].params).toEqual({ remaining: 40 });
    const later = new Date('2026-10-09T12:00:00+07:00');
    const ok = await service.update(b.value.id, { minutes: 5, note: 'less' }, later);
    expect(ok.ok).toBe(true);
    if (ok.ok) {
      expect(ok.value.minutes).toBe(5);
      expect(ok.value.createdAt).toBe(FIXED_NOW.toISOString());
      expect(ok.value.updatedAt).toBe(later.toISOString());
    }
  });

  it('update validates fields and reports unknown entries', async () => {
    const a = await add(20);
    if (!a.ok) throw new Error('setup');
    const bad = await service.update(a.value.id, { minutes: 0, note: '' }, FIXED_NOW);
    if (!bad.ok) expect(bad.errors[0].code).toBe('ENTRY_MINUTES_INVALID');
    const missing = await service.update('nope', { minutes: 5, note: '' }, FIXED_NOW);
    if (!missing.ok) expect(missing.errors[0].code).toBe('ENTRY_NOT_FOUND');
  });

  it('remove deletes the entry', async () => {
    const a = await add(20);
    if (!a.ok) throw new Error('setup');
    expect((await service.remove(a.value.id)).ok).toBe(true);
    expect(await liveEntries()).toBe(0);
    const missing = await service.remove(a.value.id);
    if (!missing.ok) expect(missing.errors[0].code).toBe('ENTRY_NOT_FOUND');
  });
});
