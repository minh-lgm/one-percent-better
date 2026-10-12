// QC M7 round 2 - independent check of the D1 batch-splitting path of SupabaseRemoteStore.push against the
// in-process mock, with a SERVER-SIDE rejection the client schema does not know about (simulated by a fetch
// wrapper that answers 400 / 23514 to any POST whose body contains a "poison" id), so the isolation by
// bisection is exercised for real, not only the client-side pre-validation.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { startMockSupabase, USERS, type MockSupabase } from '../../e2e/mock-supabase/server.mjs';
import type { Goal } from '../../src/domain/types';
// eslint-disable-next-line no-restricted-imports -- QC test of the integration layer itself (same as src/integration/supabase/remote-store.test.ts)
import { createSupabase, SupabaseRemoteStore } from '../../src/integration/supabase/supabase-client';

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

const goal = (id: string): Goal & { deletedAt: null } => ({
  id,
  name: `Goal ${id}`,
  why: '',
  targetType: 'daily',
  targetMinutes: 30,
  startDate: '2026-10-01',
  endDate: '2026-10-31',
  archived: false,
  createdAt: '2026-10-01T00:00:00.000Z',
  updatedAt: '2026-10-05T00:00:00.000Z',
  deletedAt: null,
});

async function storeWith(rule: (body: string) => { status: number; code: string } | null) {
  const posts: number[] = [];
  const restFetch: typeof fetch = async (input, init) => {
    if (String(input).includes('/rest/') && init?.method === 'POST') {
      const body = typeof init.body === 'string' ? init.body : '';
      posts.push(JSON.parse(body).length);
      const hit = rule(body);
      if (hit) return new Response(JSON.stringify({ code: hit.code, message: 'rejected by test', details: null, hint: null }), { status: hit.status, headers: { 'content-type': 'application/json' } });
    }
    return fetch(input, init);
  };
  const client = createSupabase({ url: mock.url, key: 'sb_publishable_mock' }, { storage: memoryStorage(), fetch: restFetch });
  const session = (await (await fetch(`${mock.url}/__test/token?user=u1`)).json()) as { access_token: string; refresh_token: string };
  const { error } = await client.auth.setSession({ access_token: session.access_token, refresh_token: session.refresh_token });
  if (error) throw error;
  return { store: new SupabaseRemoteStore(client, async () => USERS.u1.id, { timeoutMs: 0 }), posts };
}

const rows = async () => (await (await fetch(`${mock.url}/__test/rows?user=u1`)).json()) as { goals: Array<{ id: string }> };

describe('QC M7 r2: push isolates a server-rejected row by bisection (D1)', () => {
  it('one poison row among 40: the other 39 land, only the poison is reported, request count stays logarithmic', async () => {
    await fetch(`${mock.url}/__test/reset`);
    const { store, posts } = await storeWith((b) => (b.includes('"poison-1"') ? { status: 400, code: '23514' } : null));
    const goals = Array.from({ length: 40 }, (_, i) => goal(i === 17 ? 'poison-1' : `g${i}`));
    const res = await store.push({ goals, entries: [] });
    expect(res.rejected.goals).toEqual(['poison-1']);
    expect(res.rejected.entries).toEqual([]);
    const ids = (await rows()).goals.map((g) => g.id);
    expect(ids).toHaveLength(39);
    expect(ids).not.toContain('poison-1');
    expect(posts.length).toBeLessThanOrEqual(2 * Math.ceil(Math.log2(40)) + 3);
  });

  it('two poison rows, and a whole batch of poison: nothing hangs, every good row lands', async () => {
    await fetch(`${mock.url}/__test/reset`);
    const { store } = await storeWith((b) => (/"poison-/.test(b) ? { status: 400, code: '22001' } : null));
    const goals = [goal('a'), goal('poison-a'), goal('b'), goal('c'), goal('poison-b'), goal('d')];
    const res = await store.push({ goals, entries: [] });
    expect(res.rejected.goals.sort()).toEqual(['poison-a', 'poison-b']);
    expect((await rows()).goals.map((g) => g.id).sort()).toEqual(['a', 'b', 'c', 'd']);
    const all = await store.push({ goals: [goal('poison-x'), goal('poison-y')], entries: [] });
    expect(all.rejected.goals.sort()).toEqual(['poison-x', 'poison-y']);
  });

  it('a 400 WITHOUT a data/constraint SQLSTATE (e.g. PGRST102, or no code) is a cycle error, not a per-row rejection', async () => {
    await fetch(`${mock.url}/__test/reset`);
    for (const code of ['PGRST102', '']) {
      const { store } = await storeWith(() => ({ status: 400, code }));
      await expect(store.push({ goals: [goal('x'), goal('y')], entries: [] })).rejects.toMatchObject({ name: 'RemoteError' });
    }
    expect((await rows()).goals).toHaveLength(0);
  });

  it('constraint code on a non-400 status (409 + 23505) is not treated as a row problem', async () => {
    await fetch(`${mock.url}/__test/reset`);
    const { store } = await storeWith(() => ({ status: 409, code: '23505' }));
    await expect(store.push({ goals: [goal('x')], entries: [] })).rejects.toMatchObject({ name: 'RemoteError' });
  });

  it('client-side pre-validation: id of 65 characters and an empty name never reach the network', async () => {
    await fetch(`${mock.url}/__test/reset`);
    const { store, posts } = await storeWith(() => null);
    const res = await store.push({ goals: [goal('x'.repeat(65)), { ...goal('ok'), name: '' }, goal('fine')], entries: [] });
    expect(res.rejected.goals.sort()).toEqual(['ok', 'x'.repeat(65)].sort());
    expect(posts).toEqual([1]);
    expect((await rows()).goals.map((g) => g.id)).toEqual(['fine']);
  });
});
