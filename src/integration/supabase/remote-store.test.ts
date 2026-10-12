// `SupabaseRemoteStore` against the mock Supabase started in-process (ARCHITECTURE §8, M7-AC5,
// M7-AC19): the same contract as the fake, plus error mapping (5xx/429/401/network/timeout).
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { startMockSupabase, USERS, type MockSupabase } from '../../../e2e/mock-supabase/server.mjs';
import { describeRemoteStoreContract, goalRaw, type ContractHarness } from '../../services/remote-store.contract';
import { createSupabase, SupabaseRemoteStore } from './supabase-client';

let mock: MockSupabase;

beforeAll(async () => {
  mock = await startMockSupabase(0);
});

afterAll(async () => {
  await mock.close();
});

function memoryStorage() {
  const data = new Map<string, string>();
  return {
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, v),
    removeItem: (k: string) => void data.delete(k),
    key: (i: number) => [...data.keys()][i] ?? null,
    get length() {
      return data.size;
    },
    clear: () => data.clear(),
  } as unknown as Storage;
}

/** A store signed in as `user` through `/__test/token` (no PKCE round-trip). `restFetch` replaces fetch for `/rest/` only. */
async function storeFor(user: 'u1' | 'u2', restFetch?: typeof fetch, timeoutMs = 0): Promise<SupabaseRemoteStore> {
  const fetchImpl: typeof fetch | undefined = restFetch ? (input, init) => (String(input).includes('/rest/') ? restFetch(input, init) : fetch(input, init)) : undefined;
  const client = createSupabase({ url: mock.url, key: 'sb_publishable_mock' }, { storage: memoryStorage(), ...(fetchImpl ? { fetch: fetchImpl } : {}) });
  const session = (await (await fetch(`${mock.url}/__test/token?user=${user}`)).json()) as { access_token: string; refresh_token: string };
  const { error } = await client.auth.setSession({ access_token: session.access_token, refresh_token: session.refresh_token });
  if (error) throw error;
  return new SupabaseRemoteStore(client, async () => USERS[user].id, { timeoutMs });
}

describeRemoteStoreContract('SupabaseRemoteStore → mock Supabase', async (): Promise<ContractHarness> => {
  const stores = { u1: await storeFor('u1'), u2: await storeFor('u2') };
  return {
    as: (user) => stores[user],
    reset: async () => {
      // Reset keeps the issued tokens valid: only rows/log/toggles are cleared, tokens are re-verified by signature.
      await fetch(`${mock.url}/__test/reset`);
    },
    seedRaw: async (user, table, rows) => {
      await fetch(`${mock.url}/__test/seed`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ user, [table]: rows }) });
    },
  };
});

describe('SupabaseRemoteStore error mapping (M7-AC5, NFR-15)', () => {
  it('HTTP 500 / 503 / 429 → SYNC_UNREACHABLE', async () => {
    const store = await storeFor('u1');
    for (const status of [500, 503, 429]) {
      // 503 is retried by the SDK itself (a few attempts): keep failing until it gives up.
      await fetch(`${mock.url}/__test/fail?path=rest&status=${status}&times=10`);
      await expect(store.pullPrefs()).rejects.toMatchObject({ name: 'RemoteError', code: 'SYNC_UNREACHABLE' });
      await fetch(`${mock.url}/__test/reset`);
    }
  });

  it('HTTP 401 / 403 → SYNC_UNAUTHORIZED', async () => {
    const store = await storeFor('u1');
    for (const status of [401, 403]) {
      await fetch(`${mock.url}/__test/fail?path=rest&status=${status}&times=1`);
      await expect(store.pull('goals', null, 10)).rejects.toMatchObject({ code: 'SYNC_UNAUTHORIZED' });
    }
  });

  it('network failure (TypeError: Failed to fetch) → SYNC_OFFLINE', async () => {
    const failing: typeof fetch = async () => {
      throw new TypeError('Failed to fetch');
    };
    const store = await storeFor('u1', failing);
    await expect(store.pullPrefs()).rejects.toMatchObject({ code: 'SYNC_OFFLINE' });
  });

  it('a request that never answers is aborted after the timeout → SYNC_UNREACHABLE', async () => {
    const hanging: typeof fetch = (_input, init) =>
      new Promise((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' })));
      });
    const store = await storeFor('u1', hanging, 50);
    await expect(store.pullPrefs()).rejects.toMatchObject({ code: 'SYNC_UNREACHABLE' });
  });

  it('pushes rows with exactly the columns of ARCHITECTURE §4.3 and reads batches ≤ 500 / ≤ 100 ids', async () => {
    await fetch(`${mock.url}/__test/reset`);
    const store = await storeFor('u1');
    const goals = Array.from({ length: 3 }, (_, i) => ({ ...goalRaw(`g${i}`, '2026-10-09T03:00:00.000Z') }));
    await store.push({
      goals: goals.map((g) => ({
        id: String(g.id),
        name: String(g.name),
        why: '',
        targetType: 'daily' as const,
        targetMinutes: 30,
        startDate: '2026-10-01',
        endDate: '2026-10-31',
        archived: false,
        createdAt: '2026-10-01T00:00:00.000Z',
        updatedAt: '2026-10-09T03:00:00.000Z',
        deletedAt: null,
      })),
      entries: Array.from({ length: 1100 }, (_, i) => ({
        id: `e${i}`,
        goalId: 'g0',
        date: '2026-10-05',
        minutes: 5,
        note: '',
        source: 'manual' as const,
        createdAt: '2026-10-05T00:00:00.000Z',
        updatedAt: '2026-10-09T03:00:00.000Z',
        deletedAt: null,
      })),
    });
    const rows = (await (await fetch(`${mock.url}/__test/rows?user=u1`)).json()) as { goals: Record<string, unknown>[]; entries: Record<string, unknown>[] };
    expect(Object.keys(rows.goals[0]).sort()).toEqual(['archived', 'created_at', 'deleted_at', 'end_date', 'id', 'name', 'server_updated_at', 'start_date', 'target_minutes', 'target_type', 'updated_at', 'user_id', 'why']);
    expect(rows.goals[0].user_id).toBe(USERS.u1.id);
    expect(rows.entries).toHaveLength(1100);
    const log = mock.state.log.filter((l) => l.method === 'POST' && l.path === '/rest/v1/entries');
    expect(log.map((l) => l.rows)).toEqual([500, 500, 100]);
    await store.fetchByIds({ goals: [], entries: Array.from({ length: 250 }, (_, i) => `e${i}`) });
    const gets = mock.state.log.filter((l) => l.method === 'GET' && l.path === '/rest/v1/entries');
    expect(gets).toHaveLength(3);
    for (const g of gets) expect((g.query.id.match(/,/g) ?? []).length + 1).toBeLessThanOrEqual(100);
  });

  it('settings row: only the 7 columns of §4.3, no device-only fields', async () => {
    await fetch(`${mock.url}/__test/reset`);
    const store = await storeFor('u1');
    await store.pushPrefs({ reminder: { enabled: true, time: '07:30', updatedAt: '2026-10-09T03:00:00.000Z' }, locale: null });
    const rows = (await (await fetch(`${mock.url}/__test/rows?user=u1`)).json()) as { settings: Record<string, unknown>[] };
    expect(Object.keys(rows.settings[0]).sort()).toEqual(['locale', 'locale_updated_at', 'reminder_enabled', 'reminder_time', 'reminder_updated_at', 'server_updated_at', 'user_id']);
    vi.restoreAllMocks();
  });
});
