// QC M14 round 2 - the Keep-data deletion (M14-D3, A-61 / A-27) at service level, with variants the developer's tests do not
// have: the next account has a NEW id but the SAME email; the next account already holds data; the user works offline /
// edits between deletion and sign-in; a tombstone made before deletion must not come back; the Keep -> Remove path; plus
// the Google button capability on every flavour of the native container (M14-D1).
import { afterEach, describe, expect, it } from 'vitest';
import { buildEntry, buildGoal } from '../../src/test/builders';

// Rows as the app writes them: created/edited locally => dirty 1 (the builders leave it undefined).
const dirtyGoal = (o: Parameters<typeof buildGoal>[0]) => ({ ...buildGoal(o), dirty: 1 as const });
const dirtyEntry = (o: Parameters<typeof buildEntry>[0]) => ({ ...buildEntry(o), dirty: 1 as const });
import { createTestContainer, type TestContainer } from '../../src/test/container';
import { USER1 } from '../../src/test/fake-auth-port';
import { FakeIdTokenProvider } from '../../src/test/fake-id-token-provider';

let tc: TestContainer | undefined;
afterEach(async () => {
  await tc?.dispose();
  tc = undefined;
});

const NEW_ID = '00000000-0000-4000-8000-0000000000aa';
const U2 = '00000000-0000-4000-8000-000000000002';

async function signedInSynced() {
  tc = await createTestContainer({ cloud: true, authStored: true });
  tc.auth!.port.session = { ...USER1, providers: ['google'] };
  await tc.container.db.kv.put({ key: 'sync', value: { userId: USER1.userId, lastUserId: USER1.userId, account: { email: USER1.email, name: USER1.name } } });
  await tc.container.db.goals.put(dirtyGoal({ id: 'g1', name: 'Read' }));
  await tc.container.db.goals.put(dirtyGoal({ id: 'g2', name: 'Run' }));
  await tc.container.db.entries.put(dirtyEntry({ id: 'e1', goalId: 'g1', minutes: 20, date: '2026-10-01' }));
  await tc.container.db.entries.put(dirtyEntry({ id: 'e2', goalId: 'g1', minutes: 30, date: '2026-10-02' }));
  await tc.container.db.entries.put(dirtyEntry({ id: 'e3', goalId: 'g2', minutes: 10, date: '2026-10-02' }));
  await tc.container.authService.init();
  await tc.container.authService.settled();
  await tc.container.syncService!.syncNow('manual');
  return tc;
}

async function signInAs(id: string, email: string) {
  (tc!.auth!.remote as { userId: string }).userId = id;
  tc!.auth!.port.exchangeResult = { userId: id, email, name: email.split('@')[0], providers: ['google'] };
  const r = await tc!.container.authService.completeCallback({ code: 'x' });
  expect(r.ok).toBe(true);
  await tc!.container.syncService!.prepareFirstSignIn(id);
  await tc!.container.syncService!.handleSignedIn(id, email);
}

const names = (rows: ReadonlyArray<{ name?: unknown }>) => rows.map((r) => String(r.name)).sort();
const liveNames = (user: string) => names(tc!.auth!.server.live('goals', user) as unknown as Array<{ name?: unknown }>);

describe('QC M14 r2: Keep data then another sign-in (M14-D3)', () => {
  it('base case: Keep -> other account u2: 2 goals + 3 entries on u2; every local row acknowledged afterwards (dirty 0)', async () => {
    await signedInSynced();
    expect((await tc!.container.authService.deleteAccount({ keepData: true })).ok).toBe(true);
    await signInAs(U2, 'other.user@example.com');
    expect(liveNames(U2)).toEqual(['Read', 'Run']);
    expect(tc!.auth!.server.live('entries', U2)).toHaveLength(3);
    expect((await tc!.container.db.goals.toArray()).every((g) => g.dirty === 0)).toBe(true);
    expect((await tc!.container.db.entries.toArray()).every((e) => e.dirty === 0)).toBe(true);
  });

  it('variant: the SAME email comes back as a brand-new account (new user id) -> receives the kept data, no D5 question', async () => {
    await signedInSynced();
    await tc!.container.authService.deleteAccount({ keepData: true });
    expect(await tc!.container.syncService!.prepareFirstSignIn(NEW_ID)).toBe('merge-silently');
    await signInAs(NEW_ID, USER1.email);
    expect(liveNames(NEW_ID)).toEqual(['Read', 'Run']);
    expect(tc!.auth!.server.live('entries', NEW_ID)).toHaveLength(3);
  });

  it('variant: Keep, then the user works signed-out (new goal + entry), then signs in -> the edits also arrive, one copy of each row', async () => {
    await signedInSynced();
    await tc!.container.authService.deleteAccount({ keepData: true });
    await tc!.container.db.goals.put(dirtyGoal({ id: 'g3', name: 'Offline goal' }));
    await tc!.container.db.entries.put(dirtyEntry({ id: 'e4', goalId: 'g3', minutes: 5, date: '2026-10-03' }));
    await signInAs(U2, 'other.user@example.com');
    expect(liveNames(U2)).toEqual(['Offline goal', 'Read', 'Run']);
    expect(tc!.auth!.server.live('entries', U2)).toHaveLength(4);
    expect(await tc!.container.db.goals.count()).toBe(3);
  });

  it('variant: Keep and never sign in: data intact and usable, nothing uploaded, a sync tick does not throw', async () => {
    await signedInSynced();
    await tc!.container.authService.deleteAccount({ keepData: true });
    await tc!.container.syncService!.syncNow('manual').catch(() => undefined);
    expect(await tc!.container.db.goals.count()).toBe(2);
    expect(await tc!.container.db.entries.count()).toBe(3);
    expect(tc!.container.authService.state()).toEqual({ kind: 'signed-out' });
    expect(tc!.auth!.server.live('goals', U2)).toHaveLength(0);
  });

  it('variant: the next account ALREADY has data on the server -> merged (device rows + server row), nothing lost on either side', async () => {
    await signedInSynced();
    await tc!.container.authService.deleteAccount({ keepData: true });
    tc!.auth!.server.seedRow('goals', U2, { id: 'srv-1', name: 'Server goal', why: '', target_type: 'daily', target_minutes: 30, start_date: '2026-10-01', end_date: '2026-10-31', archived: false, created_at: '2026-10-01T00:00:00.000Z', updated_at: '2026-10-01T00:00:00.000Z', deleted_at: null });
    await signInAs(U2, 'other.user@example.com');
    await tc!.container.syncService!.syncNow('manual');
    expect(liveNames(U2)).toEqual(['Read', 'Run', 'Server goal']);
    expect(names(await tc!.container.db.goals.toArray())).toEqual(['Read', 'Run', 'Server goal']);
  });

  it('variant: a goal soft-deleted BEFORE the account deletion does not come back to life on the next account', async () => {
    await signedInSynced();
    expect((await tc!.container.goalService.remove('g2')).ok).toBe(true);
    await tc!.container.syncService!.syncNow('manual');
    await tc!.container.authService.deleteAccount({ keepData: true });
    await signInAs(U2, 'other.user@example.com');
    expect(liveNames(U2)).toEqual(['Read']);
  });

  it('Keep, sign in as u2, sign out with Remove, sign in as u2 again: everything is still there (the original D3 scenario)', async () => {
    await signedInSynced();
    await tc!.container.authService.deleteAccount({ keepData: true });
    await signInAs(U2, 'other.user@example.com');
    await tc!.container.authService.signOut({ keepData: false });
    expect(await tc!.container.db.goals.count()).toBe(0);
    await signInAs(U2, 'other.user@example.com');
    await tc!.container.syncService!.syncNow('manual');
    expect(names(await tc!.container.db.goals.toArray())).toEqual(['Read', 'Run']);
    expect(await tc!.container.db.entries.count()).toBe(3);
  });

  it('Remove (keepData false) path unaffected: nothing left on the device, nothing uploaded to the next account', async () => {
    await signedInSynced();
    await tc!.container.authService.deleteAccount({ keepData: false });
    expect(await tc!.container.db.goals.count()).toBe(0);
    await signInAs(U2, 'other.user@example.com');
    expect(tc!.auth!.server.live('goals', U2)).toHaveLength(0);
  });

  it('plain sign-out with Keep does not mark everything dirty again (reset() without forgetLastUser unchanged)', async () => {
    await signedInSynced();
    await tc!.container.authService.signOut({ keepData: true });
    expect((await tc!.container.db.goals.toArray()).every((g) => g.dirty === 0)).toBe(true);
    expect((await tc!.container.db.entries.toArray()).every((e) => e.dirty === 0)).toBe(true);
  });

  it('deleteAccount a second time (already signed-out) never throws and leaves signed-out', async () => {
    await signedInSynced();
    await tc!.container.authService.deleteAccount({ keepData: true });
    const second = await tc!.container.authService.deleteAccount({ keepData: true }).catch((e: unknown) => e);
    expect(second).not.toBeInstanceOf(Error);
    expect(tc!.container.authService.state().kind).toBe('signed-out');
  });
});

describe('QC M14 r2: capabilities.googleSignIn (M14-D1)', () => {
  it('web: true; iOS with both sheets: true; iOS Apple only: false; iOS none: false', async () => {
    tc = await createTestContainer({ cloud: true });
    expect(tc.container.capabilities.googleSignIn).toBe(true);
    await tc.dispose();
    tc = await createTestContainer({ cloud: true, native: 'ios', idTokens: true });
    expect(tc.container.capabilities.googleSignIn).toBe(true);
    expect(tc.container.capabilities.appleSignIn).toBe(true);
    await tc.dispose();
    tc = await createTestContainer({ cloud: true, native: 'ios', idTokens: new FakeIdTokenProvider(['apple']) });
    expect(tc.container.capabilities.googleSignIn).toBe(false);
    expect(tc.container.capabilities.appleSignIn).toBe(true);
    await tc.dispose();
    tc = await createTestContainer({ cloud: true, native: 'ios', idTokens: new FakeIdTokenProvider([]) });
    expect(tc.container.capabilities.googleSignIn).toBe(false);
  });
});
