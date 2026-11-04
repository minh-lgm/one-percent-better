// v8.0 (M18-AC6, FR-79, ARCH §4.8 g): behaviour of `20261104000000_roadmaps.sql` on a real Postgres, through
// PostgREST as the app uses it. Runs only via `npm run test:db` against Supabase local (Docker), which applies the
// three migrations in order (`npm run db:reset`). The machine of record has no Docker (OQ-08): reported as
// NOT VERIFIED (NV-22) and checked by hand at U31 — including "run the file a second time", which needs SQL access
// (the static test src/data/cloud-migration-roadmaps.test.ts checks the idempotence on paper).
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { SupabaseRemoteStore } from '../../src/integration/supabase/supabase-client';
import { roadmapItemRaw, roadmapRaw } from '../../src/services/remote-store.contract';

const URL_ = (process.env.SUPABASE_TEST_URL ?? '').replace(/\/$/, '');
const PUBLISHABLE = process.env.SUPABASE_TEST_PUBLISHABLE_KEY ?? '';
const SECRET = process.env.SUPABASE_TEST_SECRET_KEY ?? '';
const available = Boolean(URL_ && PUBLISHABLE && SECRET);

if (!available) console.log('skipped: Supabase local not running (set SUPABASE_TEST_URL / _PUBLISHABLE_KEY / _SECRET_KEY)');

const stamp = Date.now();
const PASSWORD = 'test-password-123!';
const T0 = '2026-10-27T01:00:00.000Z';
const T1 = '2026-11-04T03:00:00.000Z';
const TABLES = ['roadmaps', 'roadmap_phases', 'roadmap_items', 'roadmap_checkpoints'] as const;

let admin: SupabaseClient;
let a: SupabaseClient;
let b: SupabaseClient;
let anon: SupabaseClient;
let idA = '';
let idB = '';

describe.skipIf(!available)('roadmap tables (20261104000000_roadmaps.sql): RLS, LWW trigger, check constraints, no delete', () => {
  beforeAll(async () => {
    const noPersist = { auth: { persistSession: false, autoRefreshToken: false } };
    admin = createClient(URL_, SECRET, noPersist);
    const emails = { a: `rm-a-${stamp}@example.com`, b: `rm-b-${stamp}@example.com` };
    for (const email of Object.values(emails)) {
      const { error } = await admin.auth.admin.createUser({ email, password: PASSWORD, email_confirm: true });
      if (error) throw error;
    }
    a = createClient(URL_, PUBLISHABLE, noPersist);
    b = createClient(URL_, PUBLISHABLE, noPersist);
    anon = createClient(URL_, PUBLISHABLE, noPersist);
    const ra = await a.auth.signInWithPassword({ email: emails.a, password: PASSWORD });
    const rb = await b.auth.signInWithPassword({ email: emails.b, password: PASSWORD });
    if (ra.error || rb.error) throw ra.error ?? rb.error;
    idA = ra.data.user!.id;
    idB = rb.data.user!.id;
  });

  afterAll(async () => {
    for (const id of [idA, idB]) if (id) await admin.auth.admin.deleteUser(id);
  });

  it('the four tables exist and are empty for a new user; the old tables are untouched (goals still answers)', async () => {
    for (const t of TABLES) {
      const r = await a.from(t).select('id');
      expect(r.error, t).toBeNull();
      expect(r.data, t).toEqual([]);
    }
    expect((await a.from('goals').select('id')).error).toBeNull();
  });

  it('A inserts a roadmap + item → A reads them, B reads nothing, anon is refused', async () => {
    const ins = await a.from('roadmaps').insert({ ...roadmapRaw('r1', T0), user_id: idA });
    expect(ins.error).toBeNull();
    const item = await a.from('roadmap_items').insert({ ...roadmapItemRaw('w1', 'r1', 'p1', T0), user_id: idA });
    expect(item.error).toBeNull();
    expect((await a.from('roadmaps').select('id,user_id')).data).toEqual([{ id: 'r1', user_id: idA }]);
    expect((await b.from('roadmaps').select('id')).data).toEqual([]);
    expect((await b.from('roadmap_items').select('id')).data).toEqual([]);
    const sel = await anon.from('roadmaps').select('id');
    expect(sel.error !== null || (sel.data ?? []).length === 0).toBe(true);
    const anonIns = await anon.from('roadmaps').insert(roadmapRaw('anon-1', T0));
    expect(anonIns.error).not.toBeNull();
  });

  it('B cannot update A\'s roadmap; B inserting with user_id = A ends up owned by B (trigger) or is refused (RLS)', async () => {
    const upd = await b.from('roadmaps').update({ title: 'Hacked', updated_at: T1 }).eq('id', 'r1').select();
    expect(upd.data ?? []).toEqual([]);
    expect((await a.from('roadmaps').select('title').eq('id', 'r1').single()).data?.title).toBe('Roadmap r1');
    const ins = await b.from('roadmaps').insert({ ...roadmapRaw('r1', T0, { title: 'Mine' }), user_id: idA }).select('user_id,title');
    if (!ins.error) expect(ins.data).toEqual([{ user_id: idB, title: 'Mine' }]);
    expect((await a.from('roadmaps').select('id,title')).data).toEqual([{ id: 'r1', title: 'Roadmap r1' }]);
  });

  it('LWW (sync_before_write): an older or equal updated_at keeps the row; a newer one wins and bumps server_updated_at', async () => {
    const before = await a.from('roadmap_items').select('server_updated_at,title').eq('id', 'w1').single();
    const older = await a.from('roadmap_items').upsert({ ...roadmapItemRaw('w1', 'r1', 'p1', '2026-10-20T00:00:00.000Z', { title: 'Older' }), user_id: idA }, { onConflict: 'user_id,id' });
    expect(older.error).toBeNull();
    const equal = await a.from('roadmap_items').upsert({ ...roadmapItemRaw('w1', 'r1', 'p1', T0, { title: 'Equal' }), user_id: idA }, { onConflict: 'user_id,id' });
    expect(equal.error).toBeNull();
    const mid = await a.from('roadmap_items').select('server_updated_at,title').eq('id', 'w1').single();
    expect(mid.data?.title).toBe('Item w1');
    expect(mid.data?.server_updated_at).toBe(before.data?.server_updated_at);
    const newer = await a.from('roadmap_items').upsert({ ...roadmapItemRaw('w1', 'r1', 'p1', T1, { title: 'Newer', actual_start: '2026-10-27', actual_end: '2026-11-01' }), user_id: idA }, { onConflict: 'user_id,id' });
    expect(newer.error).toBeNull();
    const after = await a.from('roadmap_items').select('server_updated_at,title,actual_end').eq('id', 'w1').single();
    expect(after.data).toMatchObject({ title: 'Newer', actual_end: '2026-11-01' });
    expect(new Date(after.data!.server_updated_at).getTime()).toBeGreaterThan(new Date(before.data!.server_updated_at).getTime());
  });

  it('check constraints answer 23514: planned_end < planned_start, actual_end < actual_start, title 201 chars, max_score 0, score > max_score, NaN position', async () => {
    const cases: Array<[string, Record<string, unknown>]> = [
      ['roadmap_items', roadmapItemRaw('bad-planned', 'r1', 'p1', T0, { planned_start: '2026-11-10', planned_end: '2026-11-03' })],
      ['roadmap_items', roadmapItemRaw('bad-actual', 'r1', 'p1', T0, { actual_start: '2026-11-04', actual_end: '2026-11-03' })],
      ['roadmap_items', roadmapItemRaw('bad-title', 'r1', 'p1', T0, { title: 'x'.repeat(201) })],
      ['roadmap_items', roadmapItemRaw('bad-span', 'r1', 'p1', T0, { planned_start: '2026-01-01', planned_end: '2027-01-02' })],
      ['roadmaps', roadmapRaw('bad-target', T0, { weekly_target_minutes: 29 })],
      ['roadmaps', roadmapRaw('bad-title', T0, { title: '' })],
      ['roadmap_phases', { id: 'bad-pos', roadmap_id: 'r1', title: 'P', note: '', position: 'NaN', created_at: T0, updated_at: T0, deleted_at: null }],
      ['roadmap_checkpoints', { id: 'bad-max', roadmap_id: 'r1', title: 'C', note: '', date: '2026-11-01', max_score: 0, threshold: null, score: null, created_at: T0, updated_at: T0, deleted_at: null }],
      ['roadmap_checkpoints', { id: 'bad-score', roadmap_id: 'r1', title: 'C', note: '', date: '2026-11-01', max_score: 32, threshold: null, score: 33, created_at: T0, updated_at: T0, deleted_at: null }],
    ];
    for (const [table, row] of cases) {
      const { error, status } = await a.from(table).upsert({ ...row, user_id: idA }, { onConflict: 'user_id,id' });
      expect(error, `${table} ${JSON.stringify(row)}`).not.toBeNull();
      expect(status, `${table} ${row.id as string}`).toBe(400);
      expect(error?.code, `${table} ${row.id as string}`).toBe('23514');
    }
    expect((await a.from('roadmap_items').select('id')).data?.map((r) => r.id)).toEqual(['w1']);
  });

  it('numeric(7,1) keeps one decimal and reads back as a number through the store', async () => {
    const cp = await a.from('roadmap_checkpoints').insert({ id: 'c1', roadmap_id: 'r1', title: 'Mock 1', note: '', date: '2027-02-28', max_score: 32, threshold: 24, score: 7.5, created_at: T0, updated_at: T0, deleted_at: null, user_id: idA });
    expect(cp.error).toBeNull();
    const store = new SupabaseRemoteStore(a, async () => idA, { timeoutMs: 0 });
    const page = await store.pull('roadmap_checkpoints', null, 10);
    expect(page.skippedInvalid).toBe(0);
    expect(page.rows[0]).toMatchObject({ id: 'c1', maxScore: 32, threshold: 24, score: 7.5 });
    const items = await store.pull('roadmap_items', null, 10);
    expect(items.rows.map((i) => i.id)).toEqual(['w1']);
  });

  it('A cannot hard-delete (no DELETE policy / grant) on any of the four tables', async () => {
    for (const t of TABLES) {
      const del = await a.from(t).delete().eq('id', 'r1').select();
      expect(del.error !== null || (del.data ?? []).length === 0, t).toBe(true);
    }
    expect((await a.from('roadmaps').select('id').eq('id', 'r1')).data).toEqual([{ id: 'r1' }]);
  });
});
