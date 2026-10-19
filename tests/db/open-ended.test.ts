// v4.0 (M11-AC8, FR-43 v4.0, ADR-33): behaviour of `20261019000000_goal_open_ended.sql` on a real Postgres,
// through PostgREST as the app uses it. Runs only via `npm run test:db` against Supabase local (Docker), which
// applies both migrations in order (`npm run db:reset`). The machine of record has no Docker (OQ-08): reported
// as NOT VERIFIED (NV-9) and checked by hand at U12 (including "run the file twice", which needs SQL access).
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { SupabaseRemoteStore } from '../../src/integration/supabase/supabase-client';

const URL_ = (process.env.SUPABASE_TEST_URL ?? '').replace(/\/$/, '');
const PUBLISHABLE = process.env.SUPABASE_TEST_PUBLISHABLE_KEY ?? '';
const SECRET = process.env.SUPABASE_TEST_SECRET_KEY ?? '';
const available = Boolean(URL_ && PUBLISHABLE && SECRET);

if (!available) console.log('skipped: Supabase local not running (set SUPABASE_TEST_URL / _PUBLISHABLE_KEY / _SECRET_KEY)');

const stamp = Date.now();
const email = `open-${stamp}@example.com`;
const PASSWORD = 'test-password-123!';
const T0 = '2026-10-09T03:00:00.000Z';

let admin: SupabaseClient;
let a: SupabaseClient;
let idA = '';

const goalRow = (id: string, extra: Record<string, unknown> = {}) => ({
  id,
  name: `Goal ${id}`,
  why: '',
  target_type: 'daily',
  target_minutes: 10,
  start_date: '2026-10-01',
  end_date: '2026-10-31',
  archived: false,
  created_at: '2026-10-01T00:00:00.000Z',
  updated_at: T0,
  deleted_at: null,
  ...extra,
});

describe.skipIf(!available)('goals.end_date nullable (20261019000000_goal_open_ended.sql)', () => {
  beforeAll(async () => {
    const noPersist = { auth: { persistSession: false, autoRefreshToken: false } };
    admin = createClient(URL_, SECRET, noPersist);
    const { error } = await admin.auth.admin.createUser({ email, password: PASSWORD, email_confirm: true });
    if (error) throw error;
    a = createClient(URL_, PUBLISHABLE, noPersist);
    const r = await a.auth.signInWithPassword({ email, password: PASSWORD });
    if (r.error) throw r.error;
    idA = r.data.user!.id;
  });

  afterAll(async () => {
    if (idA) await admin.auth.admin.deleteUser(idA);
  });

  it('a finite goal (old shape) still inserts; a daily goal with end_date NULL inserts and reads back as null', async () => {
    const old = await a.from('goals').insert({ ...goalRow('finite'), user_id: idA });
    expect(old.error).toBeNull();
    const open = await a.from('goals').insert({ ...goalRow('o1', { end_date: null }), user_id: idA });
    expect(open.error).toBeNull();
    const rows = await a.from('goals').select('id,end_date,target_type').order('id');
    expect(rows.error).toBeNull();
    expect(rows.data).toEqual([
      { id: 'finite', end_date: '2026-10-31', target_type: 'daily' },
      { id: 'o1', end_date: null, target_type: 'daily' },
    ]);
  });

  it('total + NULL → 23514 (goals_open_ended_daily_check); end_date < start_date → 23514 (goals_period_check); nothing stored', async () => {
    const total = await a.from('goals').insert({ ...goalRow('bad-total', { target_type: 'total', target_minutes: 6000, end_date: null }), user_id: idA });
    expect(total.error).not.toBeNull();
    expect(total.error?.code).toBe('23514');
    expect(total.error?.message).toContain('goals_open_ended_daily_check');
    const order = await a.from('goals').insert({ ...goalRow('bad-order', { end_date: '2026-09-01' }), user_id: idA });
    expect(order.error).not.toBeNull();
    expect(order.error?.code).toBe('23514');
    expect(order.error?.message).toContain('goals_period_check');
    const ids = await a.from('goals').select('id').in('id', ['bad-total', 'bad-order']);
    expect(ids.data).toEqual([]);
  });

  it('switching an existing goal to NULL and back is an ordinary LWW update; the mapper reads endDate null through the real store', async () => {
    const toOpen = await a.from('goals').upsert({ ...goalRow('finite', { end_date: null, updated_at: '2026-10-09T04:00:00.000Z' }), user_id: idA }, { onConflict: 'user_id,id' });
    expect(toOpen.error).toBeNull();
    const store = new SupabaseRemoteStore(a, async () => idA, { timeoutMs: 0 });
    const fetched = await store.fetchByIds({ goals: ['finite', 'o1'], entries: [] });
    expect(fetched.skippedInvalid).toBe(0);
    expect(fetched.goals.map((g) => [g.id, g.endDate])).toEqual([
      ['finite', null],
      ['o1', null],
    ]);
    const back = await a.from('goals').upsert({ ...goalRow('finite', { end_date: '2026-12-31', updated_at: '2026-10-09T05:00:00.000Z' }), user_id: idA }, { onConflict: 'user_id,id' });
    expect(back.error).toBeNull();
    expect((await store.fetchByIds({ goals: ['finite'], entries: [] })).goals[0].endDate).toBe('2026-12-31');
    // A stale write cannot sneak NULL past LWW either.
    const stale = await a.from('goals').upsert({ ...goalRow('finite', { end_date: null, updated_at: T0 }), user_id: idA }, { onConflict: 'user_id,id' });
    expect(stale.error).toBeNull();
    expect((await store.fetchByIds({ goals: ['finite'], entries: [] })).goals[0].endDate).toBe('2026-12-31');
  });
});
