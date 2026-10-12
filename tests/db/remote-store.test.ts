// `SupabaseRemoteStore` against a real Postgres (M7-AC5, M7-AC19, NV-2): the same contract as the
// fake and the mock (`src/services/remote-store.contract.ts`), run through `npm run test:db` on
// Supabase local (Docker). The machine of record has no Docker (OQ-08), so this file is written to
// run when Docker is available and is otherwise reported as NOT VERIFIED, checked by hand at U10 (6).
//
// Differences from the fake/mock harness, by design of the SQL (ARCHITECTURE §4.3):
// - no `seedRaw`: triggers stamp `user_id`/`server_updated_at` on every write and check constraints
//   reject invalid rows, so the contract parts that seed raw rows are skipped here and replaced by
//   the "server rejects invalid rows" test below;
// - `reset()` deletes through the service-role client (clients never get DELETE, ADR-20).
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { SupabaseRemoteStore } from '../../src/integration/supabase/supabase-client';
import { RemoteError } from '../../src/services/remote-store';
import { describeRemoteStoreContract, entryRaw, goalRaw, type ContractHarness } from '../../src/services/remote-store.contract';

const URL_ = (process.env.SUPABASE_TEST_URL ?? '').replace(/\/$/, '');
const PUBLISHABLE = process.env.SUPABASE_TEST_PUBLISHABLE_KEY ?? '';
const SECRET = process.env.SUPABASE_TEST_SECRET_KEY ?? '';
const available = Boolean(URL_ && PUBLISHABLE && SECRET);

if (!available) console.log('skipped: Supabase local not running (set SUPABASE_TEST_URL / _PUBLISHABLE_KEY / _SECRET_KEY)');

const stamp = Date.now();
const PASSWORD = 'test-password-123!';
const users = { u1: { email: `rs-u1-${stamp}@example.com`, id: '' }, u2: { email: `rs-u2-${stamp}@example.com`, id: '' } };
const noPersist = { auth: { persistSession: false, autoRefreshToken: false } };
const T0 = '2026-10-09T03:00:00.000Z';

let admin: SupabaseClient;
const clients: Partial<Record<'u1' | 'u2', SupabaseClient>> = {};

async function signIn(user: 'u1' | 'u2'): Promise<SupabaseClient> {
  const client = createClient(URL_, PUBLISHABLE, noPersist);
  const r = await client.auth.signInWithPassword({ email: users[user].email, password: PASSWORD });
  if (r.error) throw r.error;
  users[user].id = r.data.user!.id;
  return client;
}

async function harness(): Promise<ContractHarness> {
  return {
    as: (user) => new SupabaseRemoteStore(clients[user]!, async () => users[user].id, { timeoutMs: 0 }),
    reset: async () => {
      for (const table of ['entries', 'goals', 'settings'] as const) {
        const { error } = await admin.from(table).delete().in('user_id', [users.u1.id, users.u2.id]);
        if (error) throw error;
      }
    },
  };
}

describe.skipIf(!available)('SupabaseRemoteStore → Supabase local (Postgres, RLS, triggers)', () => {
  beforeAll(async () => {
    admin = createClient(URL_, SECRET, noPersist);
    for (const user of ['u1', 'u2'] as const) {
      const { error } = await admin.auth.admin.createUser({ email: users[user].email, password: PASSWORD, email_confirm: true });
      if (error) throw error;
      clients[user] = await signIn(user);
    }
  });

  afterAll(async () => {
    for (const user of ['u1', 'u2'] as const) if (users[user].id) await admin.auth.admin.deleteUser(users[user].id);
  });

  describeRemoteStoreContract('SupabaseRemoteStore → Supabase local', harness);

  it('the server rejects rows the domain never produces (check constraints); nothing is stored', async () => {
    const h = await harness();
    await h.reset();
    const u1 = h.as('u1');
    const bad = [
      { ...entryRaw('e-zero', 'g1', T0), minutes: 0 },
      { ...entryRaw('e-note', 'g1', T0), note: 'x'.repeat(281) },
      { ...entryRaw('e-src', 'g1', T0), source: 'x' },
      { ...goalRaw('g-name', T0), name: '' },
    ];
    for (const row of bad) {
      const table = 'goal_id' in row ? 'entries' : 'goals';
      const { error, status } = await clients.u1!.from(table).upsert({ ...row, user_id: users.u1.id }, { onConflict: 'user_id,id' });
      expect(error, JSON.stringify(row)).not.toBeNull();
      expect(status, JSON.stringify(row)).toBe(400);
    }
    expect((await u1.pull('entries', null, 500)).rows).toEqual([]);
    expect((await u1.pull('goals', null, 500)).rows).toEqual([]);
    for (const row of [
      { reminder_enabled: true, reminder_time: '25:00', reminder_updated_at: T0 },
      { locale: 'fr', locale_updated_at: T0 },
    ]) {
      const { error, status } = await clients.u1!.from('settings').upsert({ ...row, user_id: users.u1.id }, { onConflict: 'user_id' });
      expect(error, JSON.stringify(row)).not.toBeNull();
      expect(status, JSON.stringify(row)).toBe(400);
    }
    expect((await u1.pullPrefs()).prefs).toBeNull();
  });

  it('a push the server rejects surfaces as RemoteError SYNC_UNREACHABLE, never as a raw SDK error', async () => {
    const h = await harness();
    await h.reset();
    const u1 = h.as('u1');
    const row = { id: 'e-zero', goalId: 'g1', date: '2026-10-05', minutes: 0, note: '', source: 'manual' as const, createdAt: '2026-10-05T00:00:00.000Z', updatedAt: T0, deletedAt: null };
    const attempt = u1.push({ goals: [], entries: [row] });
    await expect(attempt).rejects.toBeInstanceOf(RemoteError);
    await expect(u1.push({ goals: [], entries: [row] })).rejects.toMatchObject({ code: 'SYNC_UNREACHABLE' });
  });
});
