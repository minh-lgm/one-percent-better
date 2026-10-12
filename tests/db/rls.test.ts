// SQL migration behaviour on a real Postgres (M6-AC10, FR-43, ADR-21): RLS between two users,
// anon access, LWW trigger, no DELETE. Runs only through `npm run test:db` against Supabase local.
// The machine of record has no Docker (OQ-08): this file is written to run when Docker is available
// and is otherwise reported as NOT VERIFIED (NV-2), checked by hand at U10.
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const URL_ = (process.env.SUPABASE_TEST_URL ?? '').replace(/\/$/, '');
const PUBLISHABLE = process.env.SUPABASE_TEST_PUBLISHABLE_KEY ?? '';
const SECRET = process.env.SUPABASE_TEST_SECRET_KEY ?? '';
const available = Boolean(URL_ && PUBLISHABLE && SECRET);

if (!available) console.log('skipped: Supabase local not running (set SUPABASE_TEST_URL / _PUBLISHABLE_KEY / _SECRET_KEY)');

const stamp = Date.now();
const emailA = `rls-a-${stamp}@example.com`;
const emailB = `rls-b-${stamp}@example.com`;
const PASSWORD = 'test-password-123!';

let admin: SupabaseClient;
let a: SupabaseClient;
let b: SupabaseClient;
let anon: SupabaseClient;
let idA = '';
let idB = '';

const goalRow = (id: string, updatedAt: string, name = 'Read') => ({
  id,
  name,
  why: '',
  target_type: 'daily',
  target_minutes: 30,
  start_date: '2026-10-01',
  end_date: '2026-10-31',
  archived: false,
  created_at: '2026-10-01T00:00:00.000Z',
  updated_at: updatedAt,
  deleted_at: null,
});

describe.skipIf(!available)('RLS + LWW trigger on Supabase local', () => {
  beforeAll(async () => {
    const noPersist = { auth: { persistSession: false, autoRefreshToken: false } };
    admin = createClient(URL_, SECRET, noPersist);
    for (const email of [emailA, emailB]) {
      const { error } = await admin.auth.admin.createUser({ email, password: PASSWORD, email_confirm: true });
      if (error) throw error;
    }
    a = createClient(URL_, PUBLISHABLE, noPersist);
    b = createClient(URL_, PUBLISHABLE, noPersist);
    anon = createClient(URL_, PUBLISHABLE, noPersist);
    const ra = await a.auth.signInWithPassword({ email: emailA, password: PASSWORD });
    const rb = await b.auth.signInWithPassword({ email: emailB, password: PASSWORD });
    if (ra.error || rb.error) throw ra.error ?? rb.error;
    idA = ra.data.user!.id;
    idB = rb.data.user!.id;
  });

  afterAll(async () => {
    for (const id of [idA, idB]) if (id) await admin.auth.admin.deleteUser(id);
  });

  it('A inserts a goal → A reads 1 row, B reads 0 rows', async () => {
    const ins = await a.from('goals').insert({ ...goalRow('g1', '2026-10-09T03:00:00.000Z'), user_id: idA });
    expect(ins.error).toBeNull();
    const ownA = await a.from('goals').select('id,user_id');
    expect(ownA.error).toBeNull();
    expect(ownA.data).toEqual([{ id: 'g1', user_id: idA }]);
    const ownB = await b.from('goals').select('id');
    expect(ownB.error).toBeNull();
    expect(ownB.data).toEqual([]);
  });

  it('B cannot update A\'s row (0 rows changed); B inserting with user_id = A ends up owned by B', async () => {
    const upd = await b.from('goals').update({ name: 'Hacked', updated_at: '2026-10-09T09:00:00.000Z' }).eq('id', 'g1').select();
    expect(upd.data ?? []).toEqual([]);
    const check = await a.from('goals').select('name').eq('id', 'g1').single();
    expect(check.data?.name).toBe('Read');

    const ins = await b.from('goals').insert({ ...goalRow('g1', '2026-10-09T03:00:00.000Z', 'Mine'), user_id: idA }).select('user_id,name');
    // Either rejected by RLS (with check) or accepted with the owner rewritten by the trigger — never owned by A.
    if (!ins.error) expect(ins.data).toEqual([{ user_id: idB, name: 'Mine' }]);
    const stillA = await a.from('goals').select('id,name');
    expect(stillA.data).toEqual([{ id: 'g1', name: 'Read' }]);
  });

  it('anon (no session) cannot select or insert', async () => {
    const sel = await anon.from('goals').select('id');
    expect(sel.error !== null || (sel.data ?? []).length === 0).toBe(true);
    const ins = await anon.from('goals').insert(goalRow('anon-1', '2026-10-09T03:00:00.000Z'));
    expect(ins.error).not.toBeNull();
    const selS = await anon.from('settings').select('user_id');
    expect(selS.error !== null || (selS.data ?? []).length === 0).toBe(true);
  });

  it('LWW: older or equal updated_at keeps the row; newer replaces it and bumps server_updated_at', async () => {
    const before = await a.from('goals').select('server_updated_at,name').eq('id', 'g1').single();
    const older = await a.from('goals').upsert({ ...goalRow('g1', '2026-10-09T02:00:00.000Z', 'Older'), user_id: idA }, { onConflict: 'user_id,id' });
    expect(older.error).toBeNull();
    const equal = await a.from('goals').upsert({ ...goalRow('g1', '2026-10-09T03:00:00.000Z', 'Equal'), user_id: idA }, { onConflict: 'user_id,id' });
    expect(equal.error).toBeNull();
    const mid = await a.from('goals').select('server_updated_at,name').eq('id', 'g1').single();
    expect(mid.data?.name).toBe('Read');
    expect(mid.data?.server_updated_at).toBe(before.data?.server_updated_at);
    const newer = await a.from('goals').upsert({ ...goalRow('g1', '2026-10-09T04:00:00.000Z', 'Newer'), user_id: idA }, { onConflict: 'user_id,id' });
    expect(newer.error).toBeNull();
    const after = await a.from('goals').select('server_updated_at,name').eq('id', 'g1').single();
    expect(after.data?.name).toBe('Newer');
    expect(new Date(after.data!.server_updated_at).getTime()).toBeGreaterThan(new Date(before.data!.server_updated_at).getTime());
  });

  it('A cannot hard-delete (no DELETE policy / grant)', async () => {
    const del = await a.from('goals').delete().eq('id', 'g1').select();
    expect(del.error !== null || (del.data ?? []).length === 0).toBe(true);
    const still = await a.from('goals').select('id').eq('id', 'g1');
    expect(still.data).toEqual([{ id: 'g1' }]);
  });

  it('settings: one row per user, LWW per group (reminder vs locale), B sees nothing of A', async () => {
    const first = await a.from('settings').upsert({ user_id: idA, reminder_enabled: true, reminder_time: '07:30', reminder_updated_at: '2026-10-09T03:00:00.000Z', locale: 'vi', locale_updated_at: '2026-10-09T03:00:00.000Z' }, { onConflict: 'user_id' });
    expect(first.error).toBeNull();
    // Newer locale, older reminder → only the locale changes.
    const mixed = await a.from('settings').upsert({ user_id: idA, reminder_enabled: false, reminder_time: '20:00', reminder_updated_at: '2026-10-09T02:00:00.000Z', locale: 'en', locale_updated_at: '2026-10-09T05:00:00.000Z' }, { onConflict: 'user_id' });
    expect(mixed.error).toBeNull();
    const row = await a.from('settings').select('reminder_enabled,reminder_time,locale').eq('user_id', idA).single();
    expect(row.data).toEqual({ reminder_enabled: true, reminder_time: '07:30', locale: 'en' });
    // Null group = untouched.
    const nulls = await a.from('settings').upsert({ user_id: idA, reminder_enabled: null, reminder_time: null, reminder_updated_at: null, locale: 'vi', locale_updated_at: '2026-10-09T06:00:00.000Z' }, { onConflict: 'user_id' });
    expect(nulls.error).toBeNull();
    const row2 = await a.from('settings').select('reminder_enabled,reminder_time,locale').eq('user_id', idA).single();
    expect(row2.data).toEqual({ reminder_enabled: true, reminder_time: '07:30', locale: 'vi' });
    const other = await b.from('settings').select('user_id');
    expect(other.data).toEqual([]);
  });
});
