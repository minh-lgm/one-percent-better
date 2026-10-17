import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { DexieEntryRepository } from '../data/dexie/entry-repo';
import { DexieGoalRepository } from '../data/dexie/goal-repo';
import { DexieKvRepository } from '../data/dexie/kv-repo';
import type { AppDatabase } from '../data/dexie/db';
import { EMPTY_LOGIN_PROMPT } from '../domain/login-prompt';
import { buildEntry, buildGoal } from '../test/builders';
import { createTestDatabase } from '../test/db';
import { LoginPromptService } from './login-prompt-service';

// M8-AC1 service part: now = 2026-10-09T10:00+07:00.
const NOW = new Date('2026-10-09T10:00:00+07:00');
const DAY = 86_400_000;
const ago = (ms: number) => new Date(NOW.getTime() - ms).toISOString();

let db: AppDatabase;
let service: LoginPromptService;

function serviceOn(database: AppDatabase): LoginPromptService {
  const clock = () => NOW;
  return new LoginPromptService(new DexieKvRepository(database), new DexieGoalRepository(database, clock), new DexieEntryRepository(database, clock));
}

beforeEach(async () => {
  db = createTestDatabase();
  await db.open();
  service = serviceOn(db);
});

afterEach(async () => {
  await db.delete();
});

describe('LoginPromptService data facts', () => {
  it('firstDataAt = smallest createdAt over live goals and entries; a soft-deleted goal with an older createdAt is ignored', async () => {
    await db.goals.bulkPut([
      { ...buildGoal({ id: 'old', name: 'Old', createdAt: ago(30 * DAY) }), deletedAt: ago(2 * DAY), dirty: 0 },
      { ...buildGoal({ id: 'g1', name: 'Read', createdAt: ago(3 * DAY) }), deletedAt: null, dirty: 0 },
    ]);
    await db.entries.bulkPut([
      { ...buildEntry({ id: 'e-old', goalId: 'old', createdAt: ago(29 * DAY) }), deletedAt: null, dirty: 0 },
      { ...buildEntry({ id: 'e1', goalId: 'g1', date: '2026-10-08', createdAt: ago(1 * DAY) }), deletedAt: null, dirty: 0 },
      { ...buildEntry({ id: 'e2', goalId: 'g1', date: '2026-10-09', createdAt: ago(5 * DAY) }), deletedAt: ago(DAY), dirty: 0 },
    ]);
    const data = await service.loadData();
    // "old" (tombstone) and its live entry (goal gone) are out; the deleted entry e2 is out.
    expect(data).toEqual({ firstDataAt: ago(3 * DAY), entryCount: 1 });
    expect((await service.state(NOW, { auth: 'signed-out', online: true })).banner).toBe(false);
  });

  it('state(): 7-day-old data → banner; 10 entries today → banner; export hint only while signed out', async () => {
    await db.goals.put(buildGoal({ id: 'g1', createdAt: ago(7 * DAY) }));
    expect(await service.state(NOW, { auth: 'signed-out', online: true })).toEqual({ banner: true, exportHint: true });
    expect(await service.state(NOW, { auth: 'signed-out', online: false })).toEqual({ banner: false, exportHint: false });
    expect(await service.state(NOW, { auth: 'signed-in', online: true })).toEqual({ banner: false, exportHint: false });
    expect(await service.state(NOW, { auth: 'expired', online: true })).toEqual({ banner: false, exportHint: false });
    expect(await service.state(NOW, { auth: 'unavailable', online: true })).toEqual({ banner: false, exportHint: false });
  });

  it('a fresh database with one goal created today and no entries → no banner', async () => {
    await db.goals.put(buildGoal({ id: 'g1', createdAt: NOW.toISOString() }));
    expect((await service.state(NOW, { auth: 'signed-out', online: true })).banner).toBe(false);
    await db.entries.bulkPut(Array.from({ length: 10 }, (_, i) => buildEntry({ id: `e${i}`, goalId: 'g1', date: '2026-10-09', createdAt: NOW.toISOString() })));
    expect((await service.state(NOW, { auth: 'signed-out', online: true })).banner).toBe(true);
  });

  it('watchData/watchState emit the normalised shapes and follow writes', async () => {
    const seen: Array<{ firstDataAt: string | null; entryCount: number }> = [];
    const states: Array<{ dismissCount: number }> = [];
    const stopData = service.watchData().subscribe((d) => seen.push(d));
    const stopState = service.watchState().subscribe((s) => states.push(s));
    await new Promise((r) => setTimeout(r, 30));
    expect(seen.at(-1)).toEqual({ firstDataAt: null, entryCount: 0 });
    expect(states.at(-1)).toEqual(EMPTY_LOGIN_PROMPT);
    await db.goals.put(buildGoal({ id: 'g1', createdAt: ago(DAY) }));
    await service.dismiss(NOW);
    await new Promise((r) => setTimeout(r, 60));
    expect(seen.at(-1)).toEqual({ firstDataAt: ago(DAY), entryCount: 0 });
    expect(states.at(-1)?.dismissCount).toBe(1);
    stopData();
    stopState();
  });
});

describe('LoginPromptService kv `loginPrompt`', () => {
  it('dismiss(): count + 1, lastDismissedAt = now; the banner is snoozed 14 days and gone for good after 3', async () => {
    await db.goals.put(buildGoal({ id: 'g1', createdAt: ago(10 * DAY) }));
    const ctx = { auth: 'signed-out' as const, online: true };
    expect((await service.state(NOW, ctx)).banner).toBe(true);
    expect(await service.dismiss(NOW)).toEqual({ dismissCount: 1, lastDismissedAt: NOW.toISOString(), lastExportHintAt: null });
    expect((await service.state(NOW, ctx)).banner).toBe(false);
    expect((await service.state(new Date(NOW.getTime() + 13 * DAY), ctx)).banner).toBe(false);
    expect((await service.state(new Date(NOW.getTime() + 14 * DAY), ctx)).banner).toBe(true);
    await service.dismiss(new Date(NOW.getTime() + 14 * DAY));
    await service.dismiss(new Date(NOW.getTime() + 28 * DAY));
    expect(await service.getState()).toMatchObject({ dismissCount: 3 });
    expect((await service.state(new Date(NOW.getTime() + 200 * DAY), ctx)).banner).toBe(false);
  });

  it('claimExportHint(): once per 30 days, only online, only signed out; two concurrent claims on the same DB → exactly one true', async () => {
    const ctx = { auth: 'signed-out' as const, online: true };
    const other = serviceOn(db);
    const results = await Promise.all([service.claimExportHint(NOW, ctx), other.claimExportHint(NOW, ctx)]);
    expect(results.filter(Boolean)).toHaveLength(1);
    expect((await service.getState()).lastExportHintAt).toBe(NOW.toISOString());
    expect(await service.claimExportHint(new Date(NOW.getTime() + 29 * DAY), ctx)).toBe(false);
    expect(await service.claimExportHint(new Date(NOW.getTime() + 30 * DAY), { ...ctx, online: false })).toBe(false);
    expect((await service.getState()).lastExportHintAt).toBe(NOW.toISOString()); // offline did not burn the slot (OQ-D12)
    expect(await service.claimExportHint(new Date(NOW.getTime() + 30 * DAY), { auth: 'signed-in', online: true })).toBe(false);
    expect(await service.claimExportHint(new Date(NOW.getTime() + 30 * DAY), ctx)).toBe(true);
  });

  it('a corrupt kv row is treated as the empty state', async () => {
    await db.kv.put({ key: 'loginPrompt', value: 'junk' });
    expect(await service.getState()).toEqual(EMPTY_LOGIN_PROMPT);
    await service.dismiss(NOW);
    expect(await service.getState()).toMatchObject({ dismissCount: 1 });
  });
});

describe('dismiss() does not count while already snoozed (M10-AC7, A-46, M8-P1)', () => {
  it('two LoginPromptService instances on the same DB dismiss concurrently → dismissCount grows by exactly 1; a later dismiss inside 14 days changes nothing', async () => {
    const other = serviceOn(db);
    await Promise.all([service.dismiss(NOW), other.dismiss(NOW)]);
    const after = await service.getState();
    expect(after.dismissCount).toBe(1);
    expect(after.lastDismissedAt).toBe(NOW.toISOString());

    const later = new Date(NOW.getTime() + 13 * DAY);
    const returned = await service.dismiss(later);
    expect(returned).toEqual(after);
    expect(await service.getState()).toEqual(after);

    // After the snooze the next "Not now" counts again.
    const much = new Date(NOW.getTime() + 14 * DAY);
    expect((await service.dismiss(much)).dismissCount).toBe(2);
    expect((await service.getState()).lastDismissedAt).toBe(much.toISOString());
  });

  it('a "Not now" stamped in the future (clock skew) is not a snooze: the next dismiss writes normally', async () => {
    await db.kv.put({ key: 'loginPrompt', value: { dismissCount: 1, lastDismissedAt: '2099-01-01T00:00:00.000Z', lastExportHintAt: null } });
    const next = await service.dismiss(NOW);
    expect(next).toEqual({ dismissCount: 2, lastDismissedAt: NOW.toISOString(), lastExportHintAt: null });
  });
});
