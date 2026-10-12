import { describe, expect, it } from 'vitest';
import { describeRemoteStoreContract, type ContractHarness } from '../services/remote-store.contract';
import { FakeRemoteServer, FakeRemoteStore, offlineError } from './fake-remote-store';
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
