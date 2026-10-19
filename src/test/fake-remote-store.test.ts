import { describe, expect, it } from 'vitest';
import { describeRemoteStoreContract, type ContractHarness } from '../services/remote-store.contract';
import { FakeRemoteServer, FakeRemoteStore, offlineError, violatedCheck } from './fake-remote-store';
import { goalRaw } from '../services/remote-store.contract';
import { U1, U2 } from './two-devices';

describeRemoteStoreContract('FakeRemoteStore', async (): Promise<ContractHarness> => {
  let server = new FakeRemoteServer();
  const ids = { u1: U1, u2: U2 } as const;
  return {
    as: (user) => new FakeRemoteStore(server, ids[user]),
    reset: async () => {
      server = new FakeRemoteServer();
    },
    seedRaw: async (user, table, rows) => {
      for (const row of rows) {
        if (table === 'settings') server.seedPrefsRow(ids[user], row);
        else server.seedRow(table, ids[user], row);
      }
    },
  };
});

describe('FakeRemoteStore failure injection', () => {
  it('throws the configured RemoteError for `failTimes` calls, then recovers', async () => {
    const store = new FakeRemoteStore(new FakeRemoteServer(), U1);
    store.failure = offlineError();
    store.failTimes = 2;
    await expect(store.pullPrefs()).rejects.toMatchObject({ code: 'SYNC_OFFLINE' });
    await expect(store.pullPrefs()).rejects.toMatchObject({ code: 'SYNC_OFFLINE' });
    await expect(store.pullPrefs()).resolves.toEqual({ prefs: null, skippedInvalid: 0 });
    expect(store.failure).toBeNull();
  });
});

// ---- v4.0 (M11): the fake server enforces the two v4.0 check constraints like Postgres / the mock ----
describe('FakeRemoteServer check constraints (M11-AC6, ARCH §4.6 f)', () => {
  it('violatedCheck mirrors goals_period_check and goals_open_ended_daily_check; raw upsert of a bad row throws 23514 and stores nothing', () => {
    expect(violatedCheck('goals', goalRaw('a', '2026-10-09T03:00:00.000Z', { end_date: null }))).toBeNull();
    expect(violatedCheck('goals', goalRaw('a', '2026-10-09T03:00:00.000Z', { end_date: null, target_type: 'total', target_minutes: 6000 }))).toBe('goals_open_ended_daily_check');
    expect(violatedCheck('goals', goalRaw('a', '2026-10-09T03:00:00.000Z', { end_date: '2026-09-01' }))).toBe('goals_period_check');
    expect(violatedCheck('goals', goalRaw('a', '2026-10-09T03:00:00.000Z'))).toBeNull();
    expect(violatedCheck('entries', { minutes: 0 })).toBeNull();
    const server = new FakeRemoteServer();
    expect(() => server.upsert('goals', U1, goalRaw('bad', '2026-10-09T03:00:00.000Z', { end_date: null, target_type: 'total', target_minutes: 6000 }))).toThrow(/23514.*goals_open_ended_daily_check/);
    expect(server.rows('goals', U1)).toEqual([]);
    server.upsert('goals', U1, goalRaw('o1', '2026-10-09T03:00:00.000Z', { end_date: null }));
    expect(server.rows('goals', U1)[0].end_date).toBeNull();
  });

  it('legacyMapper: pull and fetchByIds drop open-ended goals as invalid (counted), the cursor still passes them', async () => {
    const server = new FakeRemoteServer();
    const store = new FakeRemoteStore(server, U1);
    await store.push({ goals: [{ id: 'o1', name: 'Meditate', why: '', targetType: 'daily', targetMinutes: 10, startDate: '2026-10-01', endDate: null, archived: false, createdAt: '2026-10-01T00:00:00.000Z', updatedAt: '2026-10-09T03:00:00.000Z', deletedAt: null }], entries: [] });
    store.legacyMapper = true;
    const page = await store.pull('goals', null, 500);
    expect(page.rows).toEqual([]);
    expect(page.skippedInvalid).toBe(1);
    expect(page.next?.id).toBe('o1');
    expect((await store.fetchByIds({ goals: ['o1'], entries: [] })).skippedInvalid).toBe(1);
    store.legacyMapper = false;
    expect((await store.pull('goals', null, 500)).rows[0].endDate).toBeNull();
  });
});
