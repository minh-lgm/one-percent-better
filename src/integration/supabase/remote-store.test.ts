// `SupabaseRemoteStore` against the mock Supabase started in-process (ARCHITECTURE §8, M7-AC5,
// M7-AC19): the same contract as the fake, plus error mapping (5xx/429/401/network/timeout).
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { startMockSupabase, USERS, type MockSupabase } from '../../../e2e/mock-supabase/server.mjs';
import { describeRemoteStoreContract, goalRaw, type ContractHarness } from '../../services/remote-store.contract';
import { createSupabase, quoteInValue, SupabaseRemoteStore, toRemoteError } from './supabase-client';

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
    setRoadmapTables: async (on) => {
      await fetch(`${mock.url}/__test/config`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ roadmapTables: on }) });
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

  it('(M7-D1) a batch the server rejects with a constraint error (400 / 23514) is split: only the bad row is reported, the rest is stored', async () => {
    // The row passes the client schema; only the server refuses it (a constraint the mapper does not mirror).
    const rejecting: typeof fetch = async (input, init) => {
      const body = typeof init?.body === 'string' ? init.body : '';
      if (init?.method === 'POST' && String(input).includes('/rest/v1/goals') && body.includes('"id":"server-no"')) {
        return new Response(JSON.stringify({ code: '23514', message: 'new row for relation "goals" violates check constraint', details: null, hint: null }), { status: 400, headers: { 'content-type': 'application/json' } });
      }
      return fetch(input, init);
    };
    const store = await storeFor('u1', rejecting);
    const goals = ['a1', 'server-no', 'a3', 'a4', 'a5'].map((id) => ({ ...goalRaw(id, '2026-10-09T03:00:00.000Z') }));
    const r = await store.push({ goals: goals.map((g) => ({ id: String(g.id), name: String(g.name), why: '', targetType: 'daily' as const, targetMinutes: 30, startDate: '2026-10-01', endDate: '2026-10-31', archived: false, createdAt: '2026-10-01T00:00:00.000Z', updatedAt: '2026-10-09T03:00:00.000Z', deletedAt: null })), entries: [] });
    expect(r.rejected).toEqual({ goals: ['server-no'], entries: [] });
    expect((await store.pull('goals', null, 100)).rows.map((g) => g.id).sort()).toEqual(['a1', 'a3', 'a4', 'a5']);
    // Other 400s (not a data/constraint SQLSTATE) are still a failure of the cycle, never a silent rejection.
    const broken: typeof fetch = async (input, init) =>
      init?.method === 'POST' && String(input).includes('/rest/v1/entries') ? new Response(JSON.stringify({ code: 'PGRST102', message: 'bad body' }), { status: 400, headers: { 'content-type': 'application/json' } }) : fetch(input, init);
    const store2 = await storeFor('u1', broken);
    await expect(store2.push({ goals: [], entries: [{ id: 'e1', goalId: 'a1', date: '2026-10-05', minutes: 5, note: '', source: 'manual', createdAt: '2026-10-05T00:00:00.000Z', updatedAt: '2026-10-09T03:00:00.000Z', deletedAt: null }] })).rejects.toMatchObject({ code: 'SYNC_UNREACHABLE', status: 400, pgCode: 'PGRST102' });
    await fetch(`${mock.url}/__test/reset`);
  });

  it('(v4.0, M11-AC6) the mock enforces the v4.0 constraints on raw rows: total + NULL → 400 23514, daily + NULL stored and pulled back with endDate null', async () => {
    const session = (await (await fetch(`${mock.url}/__test/token?user=u1`)).json()) as { access_token: string };
    const post = (row: Record<string, unknown>) =>
      fetch(`${mock.url}/rest/v1/goals?on_conflict=user_id,id`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', apikey: 'sb_publishable_mock', authorization: `Bearer ${session.access_token}`, prefer: 'resolution=merge-duplicates,return=minimal' },
        body: JSON.stringify([{ ...row, user_id: USERS.u1.id }]),
      });
    const bad = await post(goalRaw('bad-total', '2026-10-09T03:00:00.000Z', { target_type: 'total', target_minutes: 6000, end_date: null }));
    expect(bad.status).toBe(400);
    expect(((await bad.json()) as { code: string }).code).toBe('23514');
    const before = await post(goalRaw('bad-order', '2026-10-09T03:00:00.000Z', { end_date: '2026-09-01' }));
    expect(before.status).toBe(400);
    const good = await post(goalRaw('o1', '2026-10-09T03:00:00.000Z', { target_minutes: 10, end_date: null }));
    expect(good.status).toBeLessThan(300);
    const store = await storeFor('u1');
    const page = await store.pull('goals', null, 100);
    expect(page.rows.map((g) => g.id)).toEqual(['o1']);
    expect(page.rows[0].endDate).toBeNull();
    expect(page.skippedInvalid).toBe(0);
    await fetch(`${mock.url}/__test/reset`);
  });

  it('(NV-8) ids with quotes, backslashes, commas and parentheses round-trip through fetchByIds (`in.(…)` quoting)', async () => {
    const store = await storeFor('u1');
    const ids = ['plain', 'with,comma', 'with(paren)', 'with"quote', 'back\\slash', 'mix",\\(x)'];
    expect(quoteInValue('a"b\\c')).toBe('"a\\"b\\\\c"');
    await store.push({ goals: ids.map((id) => ({ id, name: 'N', why: '', targetType: 'daily' as const, targetMinutes: 30, startDate: '2026-10-01', endDate: '2026-10-31', archived: false, createdAt: '2026-10-01T00:00:00.000Z', updatedAt: '2026-10-09T03:00:00.000Z', deletedAt: null })), entries: [] });
    const fetched = await store.fetchByIds({ goals: ids, entries: [] });
    expect(fetched.goals.map((g) => g.id).sort()).toEqual([...ids].sort());
    expect((await store.fetchByIds({ goals: ['with"quote'], entries: [] })).goals.map((g) => g.id)).toEqual(['with"quote']);
    await fetch(`${mock.url}/__test/reset`);
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

// ---- v8.0 (M18-AC2, ADR-52): "table missing" is told apart from a lost session, per table ----
describe('toRemoteError — roadmap tables missing on the project (M18-AC2, ADR-52)', () => {
  const missing = (status: number, code: string | undefined) => ({ status, ...(code === undefined ? {} : { pgCode: code }) });
  it('404 PGRST205 / 42P01 and 403 42501 on a roadmap table → tableMissing (SYNC_UNREACHABLE, never SYNC_UNAUTHORIZED)', () => {
    for (const [status, code] of [
      [404, 'PGRST205'],
      [404, '42P01'],
      [403, '42501'],
      [404, undefined],
    ] as const) {
      for (const table of ['roadmaps', 'roadmap_phases', 'roadmap_items', 'roadmap_checkpoints'] as const) {
        const e = toRemoteError(status, code === undefined ? { message: 'x' } : { code, message: 'x' }, undefined, table);
        expect(e, `${status} ${code} ${table}`).toMatchObject({ code: 'SYNC_UNREACHABLE', tableMissing: true, ...missing(status, code) });
      }
    }
  });
  it('the same answers on goals / entries / settings keep the M7 mapping: 403 → SYNC_UNAUTHORIZED, 404 → SYNC_UNREACHABLE without tableMissing; 401 on a roadmap table is still a lost session', () => {
    expect(toRemoteError(403, { code: '42501', message: 'x' }, undefined, 'goals')).toMatchObject({ code: 'SYNC_UNAUTHORIZED' });
    expect(toRemoteError(403, { code: '42501', message: 'x' }, undefined, 'goals').tableMissing).toBeUndefined();
    expect(toRemoteError(404, { code: 'PGRST205', message: 'x' }, undefined, 'entries')).toMatchObject({ code: 'SYNC_UNREACHABLE' });
    expect(toRemoteError(404, { code: 'PGRST205', message: 'x' }, undefined, 'settings').tableMissing).toBeUndefined();
    expect(toRemoteError(404, { code: 'PGRST205', message: 'x' }).tableMissing).toBeUndefined();
    expect(toRemoteError(401, { code: 'PGRST301', message: 'x' }, undefined, 'roadmaps')).toMatchObject({ code: 'SYNC_UNAUTHORIZED' });
    expect(toRemoteError(403, { code: 'PGRST301', message: 'x' }, undefined, 'roadmaps')).toMatchObject({ code: 'SYNC_UNAUTHORIZED' });
    expect(toRemoteError(500, { message: 'boom' }, undefined, 'roadmap_items')).toMatchObject({ code: 'SYNC_UNREACHABLE' });
    expect(toRemoteError(500, { message: 'boom' }, undefined, 'roadmap_items').tableMissing).toBeUndefined();
  });
  it('through the store: a 403 42501 answer on roadmaps → tableMissing; the same answer on goals → SYNC_UNAUTHORIZED', async () => {
    const forbid = (table: string): typeof fetch => async (input, init) =>
      String(input).includes(`/rest/v1/${table}`) ? new Response(JSON.stringify({ code: '42501', message: `permission denied for table ${table}`, details: null, hint: null }), { status: 403, headers: { 'content-type': 'application/json' } }) : fetch(input, init);
    const onRoadmaps = await storeFor('u1', forbid('roadmaps'));
    await expect(onRoadmaps.pull('roadmaps', null, 10)).rejects.toMatchObject({ name: 'RemoteError', tableMissing: true, status: 403, pgCode: '42501' });
    const onGoals = await storeFor('u1', forbid('goals'));
    const e = await onGoals.pull('goals', null, 10).catch((err: unknown) => err);
    expect(e).toMatchObject({ code: 'SYNC_UNAUTHORIZED' });
    expect((e as { tableMissing?: boolean }).tableMissing).toBeUndefined();
  });
});
