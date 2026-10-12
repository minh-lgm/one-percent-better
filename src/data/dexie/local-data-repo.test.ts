import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_SETTINGS } from '../../domain/types';
import { datasetS1 } from '../../test/builders';
import { createTestDatabase } from '../../test/db';
import { openDatabase, type AppDatabase } from './db';
import { DexieLocalDataRepository } from './local-data-repo';

let db: AppDatabase;
let repo: DexieLocalDataRepository;

const SYNC = { userId: 'u1', lastUserId: 'u1', account: { email: 'minh.test@example.com', name: 'Minh Test' }, cursor: { goals: null, entries: null }, lastSyncedAt: null, lastError: null };
const LOGIN_PROMPT = { dismissCount: 1, lastDismissedAt: '2026-10-01T00:00:00.000Z', lastExportHintAt: null };

async function seed() {
  const s1 = datasetS1();
  await db.goals.bulkPut(s1.goals);
  await db.entries.bulkPut(s1.entries);
  await db.kv.bulkPut([
    { key: 'activeTimer', value: { goalId: s1.goals[0].id, startedAt: '2026-10-09T02:00:00.000Z' } },
    { key: 'settings', value: { ...DEFAULT_SETTINGS, reminderEnabled: true, reminderTime: '07:30' } },
    { key: 'locale', value: 'vi' },
    { key: 'sync', value: SYNC },
    { key: 'loginPrompt', value: LOGIN_PROMPT },
    { key: 'prefsSync', value: { reminder: { updatedAt: null, dirty: 0 }, locale: { updatedAt: null, dirty: 0 } } },
  ]);
}

beforeEach(async () => {
  db = createTestDatabase();
  await openDatabase(db);
  repo = new DexieLocalDataRepository(db);
});

afterEach(async () => {
  await db.delete();
});

describe('DexieLocalDataRepository (M6-AC9, FR-41)', () => {
  it('countLive counts goals and entries', async () => {
    expect(await repo.countLive()).toEqual({ goals: 0, entries: 0 });
    await seed();
    expect(await repo.countLive()).toEqual({ goals: 5, entries: 23 });
  });

  it('clearUserData empties goals/entries and the user kv rows, keeping only locale and loginPrompt', async () => {
    await seed();
    await repo.clearUserData();
    expect(await db.goals.count()).toBe(0);
    expect(await db.entries.count()).toBe(0);
    const keys = (await db.kv.toArray()).map((r) => r.key).sort();
    expect(keys).toEqual(['locale', 'loginPrompt']);
    expect(await db.kv.get('locale')).toEqual({ key: 'locale', value: 'vi' });
    expect(await db.kv.get('loginPrompt')).toEqual({ key: 'loginPrompt', value: LOGIN_PROMPT });
  });

  it('is a no-op on an empty database', async () => {
    await repo.clearUserData();
    expect(await db.kv.count()).toBe(0);
  });

  it('rolls back everything when something fails mid-transaction', async () => {
    await seed();
    const spy = vi.spyOn(db.kv, 'bulkDelete').mockRejectedValueOnce(new Error('disk full'));
    await expect(repo.clearUserData()).rejects.toThrow('disk full');
    spy.mockRestore();
    expect(await db.goals.count()).toBe(5);
    expect(await db.entries.count()).toBe(23);
    expect((await db.kv.toArray()).map((r) => r.key).sort()).toEqual(['activeTimer', 'locale', 'loginPrompt', 'prefsSync', 'settings', 'sync']);
    expect(await db.kv.get('sync')).toEqual({ key: 'sync', value: SYNC });
  });
});
