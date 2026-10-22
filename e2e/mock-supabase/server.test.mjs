// M14-D9 regression: an account created by `grant_type=id_token` (a user id that is not `u1` / `u2`) can write and read
// REST rows — before the fix `upsertRow` / `upsertSettings` read `USERS[userKey].id` with the user id as key → TypeError → 500.
import { createHash } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { signMockIdToken, startMockSupabase, USERS } from './server.mjs';

let mock;
const SCOPE = 'vitest-m14-d9';
const headers = (token) => ({ 'content-type': 'application/json', apikey: 'sb_publishable_mock', authorization: `Bearer ${token}`, 'x-opb-scope': SCOPE });

beforeAll(async () => {
  mock = await startMockSupabase(0);
});
afterAll(async () => {
  await mock.close();
});

async function signInWithIdToken(email, nonce = 'raw-nonce-1') {
  const id_token = signMockIdToken({ email, name: 'Again Example', nonce: createHash('sha256').update(nonce).digest('hex') });
  const res = await fetch(`${mock.url}/auth/v1/token?grant_type=id_token`, { method: 'POST', headers: headers(''), body: JSON.stringify({ provider: 'google', id_token, nonce }) });
  expect(res.status).toBe(200);
  const session = await res.json();
  expect(typeof session.access_token).toBe('string');
  expect(session.user.email).toBe(email);
  return session;
}

const goalRow = (id) => ({ id, name: 'Read', why: '', target_type: 'daily', target_minutes: 30, start_date: '2026-10-01', end_date: '2026-10-31', archived: false, created_at: '2026-10-09T01:00:00.000Z', updated_at: '2026-10-09T01:00:00.000Z', deleted_at: null });

describe('mock Supabase REST for accounts created by id_token (M14-D9)', () => {
  it('upserts goals, entries and settings under the new user id (201, not 500) and reads them back with the RLS-like filter', async () => {
    const session = await signInWithIdToken('again@example.com');
    const userId = session.user.id;
    expect(Object.values(USERS).map((u) => u.id)).not.toContain(userId);

    const goals = await fetch(`${mock.url}/rest/v1/goals?on_conflict=user_id,id`, { method: 'POST', headers: { ...headers(session.access_token), prefer: 'resolution=merge-duplicates,return=representation' }, body: JSON.stringify([goalRow('g-new')]) });
    expect(goals.status).toBe(201);
    const stored = await goals.json();
    expect(stored).toHaveLength(1);
    expect(stored[0].user_id).toBe(userId);

    const entries = await fetch(`${mock.url}/rest/v1/entries?on_conflict=user_id,id`, {
      method: 'POST',
      headers: { ...headers(session.access_token), prefer: 'resolution=merge-duplicates' },
      body: JSON.stringify([{ id: 'e-new', goal_id: 'g-new', date: '2026-10-09', minutes: 20, note: '', source: 'manual', created_at: '2026-10-09T02:00:00.000Z', updated_at: '2026-10-09T02:00:00.000Z', deleted_at: null }]),
    });
    expect(entries.status).toBe(201);

    const settings = await fetch(`${mock.url}/rest/v1/settings?on_conflict=user_id`, {
      method: 'POST',
      headers: { ...headers(session.access_token), prefer: 'resolution=merge-duplicates,return=representation' },
      body: JSON.stringify([{ reminder_enabled: true, reminder_time: '20:00', reminder_updated_at: '2026-10-09T03:00:00.000Z', locale: null, locale_updated_at: null }]),
    });
    expect(settings.status).toBe(201);
    expect((await settings.json())[0].user_id).toBe(userId);

    const read = await fetch(`${mock.url}/rest/v1/goals?select=*&order=server_updated_at.asc`, { headers: headers(session.access_token) });
    expect(read.status).toBe(200);
    const rows = await read.json();
    expect(rows.map((r) => r.id)).toEqual(['g-new']);
    expect(rows[0].user_id).toBe(userId);

    // The test control endpoint sees the rows under the user id too.
    const dump = await (await fetch(`${mock.url}/__test/rows?user=${userId}`, { headers: { 'x-opb-scope': SCOPE } })).json();
    expect(dump.goals.map((g) => g.id)).toEqual(['g-new']);
    expect(dump.entries.map((e) => e.id)).toEqual(['e-new']);
  });

  it('the fixed users keep their rows under u1 / u2 with the fixed ids (no regression)', async () => {
    const seed = await fetch(`${mock.url}/__test/seed`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-opb-scope': SCOPE }, body: JSON.stringify({ user: 'u2', goals: [goalRow('g-u2')] }) });
    expect(seed.status).toBe(200);
    const dump = await (await fetch(`${mock.url}/__test/rows?user=u2`, { headers: { 'x-opb-scope': SCOPE } })).json();
    expect(dump.goals).toHaveLength(1);
    expect(dump.goals[0].user_id).toBe(USERS.u2.id);
  });
});
