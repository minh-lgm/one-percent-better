// M14-AC5: `AuthService.deleteAccount` (FR-61, A-61, A-62; ARCH §4.7 b) on a real container: FakeAuthPort,
// FakeIdTokenProvider, FakeAccountDeletionPort, the real SyncService over a FakeRemoteStore, Dexie fake.
import { afterEach, describe, expect, it } from 'vitest';
import { normalizeSyncMeta } from '../data/repositories';
import { buildEntry, buildGoal } from '../test/builders';
import { createTestContainer, setTestOnline, type TestContainer } from '../test/container';
import { USER1 } from '../test/fake-auth-port';
import { FakeIdTokenProvider } from '../test/fake-id-token-provider';

let tc: TestContainer | undefined;

afterEach(async () => {
  await tc?.dispose();
  tc = undefined;
});

type Options = Parameters<typeof createTestContainer>[0];

/** Signed in (stored session + kv account), with one goal and one entry on the device, locale `vi` saved. */
async function signedIn(options: Options = {}, providers: Array<'google' | 'apple'> = ['google']) {
  tc = await createTestContainer({ cloud: true, authStored: true, ...options });
  tc.auth!.port.session = { ...USER1, providers };
  await tc.container.db.kv.put({ key: 'sync', value: { userId: USER1.userId, lastUserId: USER1.userId, account: { email: USER1.email, name: USER1.name, ...(options.native ? { provider: providers[0] } : {}) } } });
  await tc.container.db.kv.put({ key: 'locale', value: 'vi' });
  await tc.container.db.goals.put(buildGoal({ id: 'g1', name: 'Read' }));
  await tc.container.db.entries.put(buildEntry({ id: 'e1', goalId: 'g1', minutes: 20 }));
  await tc.container.authService.init();
  await tc.container.authService.settled();
  expect(tc.container.authService.state()).toMatchObject({ kind: 'signed-in', userId: USER1.userId, providers });
  return tc;
}

const meta = async () => normalizeSyncMeta((await tc!.container.db.kv.get('sync'))?.value);
const counts = async () => ({ goals: await tc!.container.db.goals.count(), entries: await tc!.container.db.entries.count(), locale: (await tc!.container.db.kv.get('locale'))?.value });

describe('deleteAccount — success (web, Google account)', () => {
  it('keepData false: port called once without a code → port.signOut → sync.reset(forgetLastUser) → clearUserData → signed-out; kv sync gone, goal/entry gone, locale kept', async () => {
    await signedIn();
    const { port, deletion } = tc!.auth!;
    const r = await tc!.container.authService.deleteAccount({ keepData: false });
    expect(r).toEqual({ ok: true, value: { appleRevoked: 'not-applicable', hadApple: false, keepData: false } });
    expect(deletion.calls).toEqual([{}]);
    expect(port.calls.signOut).toBe(1);
    expect(tc!.container.authService.state()).toEqual({ kind: 'signed-out' });
    expect(await meta()).toMatchObject({ userId: null, lastUserId: null, account: null });
    expect(await counts()).toEqual({ goals: 0, entries: 0, locale: 'vi' });
    expect(tc!.container.syncService!.isPausedForDeletion()).toBe(false);
  });

  it('keepData true: goal/entry stay and are usable signed out; kv sync.userId / lastUserId are null; prepareFirstSignIn after it → merge-silently', async () => {
    await signedIn();
    const r = await tc!.container.authService.deleteAccount({ keepData: true });
    expect(r.ok).toBe(true);
    expect(tc!.container.authService.state()).toEqual({ kind: 'signed-out' });
    expect(await counts()).toEqual({ goals: 1, entries: 1, locale: 'vi' });
    expect(await meta()).toMatchObject({ userId: null, lastUserId: null, account: null, lastSyncedAt: null });
    expect(await tc!.container.goalService.getById('g1')).toMatchObject({ id: 'g1', name: 'Read' });
    // A-61: the device is no longer bound to the dead account → a new sign-in merges silently, no D5.
    expect(await tc!.container.syncService!.prepareFirstSignIn('00000000-0000-4000-8000-00000000abcd')).toBe('merge-silently');
  });

  it('during the deletion syncNow() is skipped (nothing is pushed), afterwards the sync engine is reset', async () => {
    await signedIn();
    const { deletion, server } = tc!.auth!;
    let release: () => void = () => undefined;
    deletion.gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const pending = tc!.container.authService.deleteAccount({ keepData: true });
    await new Promise((r) => setTimeout(r, 10));
    expect(tc!.container.syncService!.isPausedForDeletion()).toBe(true);
    const during = await tc!.container.syncService!.syncNow('manual');
    expect(during).toEqual({ status: 'skipped', why: 'paused' });
    const pushesBefore = server.calls.filter((c) => c.method === 'push').length;
    release();
    expect((await pending).ok).toBe(true);
    expect(server.calls.filter((c) => c.method === 'push').length).toBe(pushesBefore);
    expect(tc!.container.syncService!.isPausedForDeletion()).toBe(false);
  });
});

describe('deleteAccount — Apple confirmation on iOS', () => {
  it("account with 'apple' + idTokens.available('apple'): getIdToken('apple') before the port, authorizationCode passed through; hadApple true", async () => {
    await signedIn({ native: 'ios', idTokens: true }, ['apple']);
    const { deletion, idTokens } = tc!.auth!;
    deletion.next = { kind: 'deleted', appleRevoked: 'revoked' };
    const r = await tc!.container.authService.deleteAccount({ keepData: true });
    expect(r).toEqual({ ok: true, value: { appleRevoked: 'revoked', hadApple: true, keepData: true } });
    expect(idTokens!.calls[0]).toEqual({ method: 'getIdToken', provider: 'apple' });
    expect(deletion.calls).toEqual([{ appleAuthorizationCode: 'apple-code-1' }]);
    // The provider session is forgotten too (same as sign-out).
    expect(idTokens!.calls).toContainEqual({ method: 'logout', provider: 'apple' });
    expect(tc!.container.authService.state()).toEqual({ kind: 'signed-out' });
  });

  it('Apple sheet cancelled → ACCOUNT_DELETE_CANCELLED, port never called, still signed-in, data untouched', async () => {
    await signedIn({ native: 'ios', idTokens: true }, ['apple', 'google']);
    const { deletion, idTokens } = tc!.auth!;
    idTokens!.results.apple = { kind: 'cancelled' };
    const r = await tc!.container.authService.deleteAccount({ keepData: false });
    expect(r.ok ? null : r.errors[0].code).toBe('ACCOUNT_DELETE_CANCELLED');
    expect(deletion.calls).toEqual([]);
    expect(tc!.container.authService.state()).toMatchObject({ kind: 'signed-in', userId: USER1.userId });
    expect(await counts()).toEqual({ goals: 1, entries: 1, locale: 'vi' });
    expect(tc!.container.syncService!.isPausedForDeletion()).toBe(false);
  });

  it("Google-only account on iOS: no Apple sheet; Apple account on the web (no idTokens): no sheet, no code", async () => {
    await signedIn({ native: 'ios', idTokens: true }, ['google']);
    await tc!.container.authService.deleteAccount({ keepData: true });
    expect(tc!.auth!.idTokens!.count('getIdToken')).toBe(0);
    expect(tc!.auth!.deletion.calls).toEqual([{}]);
    await tc!.dispose();

    await signedIn({}, ['apple']);
    const r = await tc!.container.authService.deleteAccount({ keepData: true });
    expect(r).toEqual({ ok: true, value: { appleRevoked: 'not-applicable', hadApple: true, keepData: true } });
    expect(tc!.auth!.deletion.calls).toEqual([{}]);
  });
});

describe('deleteAccount — failures leave everything as it was', () => {
  it('offline → ACCOUNT_DELETE_OFFLINE, port not called', async () => {
    await signedIn();
    setTestOnline(tc!, false);
    const r = await tc!.container.authService.deleteAccount({ keepData: false });
    expect(r.ok ? null : r.errors[0].code).toBe('ACCOUNT_DELETE_OFFLINE');
    expect(tc!.auth!.deletion.calls).toEqual([]);
    expect(tc!.container.authService.state().kind).toBe('signed-in');
  });

  it('expired → ACCOUNT_DELETE_SESSION_EXPIRED; signed-out → AUTH_FAILED', async () => {
    await signedIn();
    tc!.container.authService.expire();
    const r = await tc!.container.authService.deleteAccount({ keepData: false });
    expect(r.ok ? null : r.errors[0].code).toBe('ACCOUNT_DELETE_SESSION_EXPIRED');
    expect(tc!.auth!.deletion.calls).toEqual([]);
    await tc!.container.authService.signOut({ keepData: true });
    const r2 = await tc!.container.authService.deleteAccount({ keepData: false });
    expect(r2.ok ? null : r2.errors[0].code).toBe('AUTH_FAILED');
  });

  for (const [kind, code] of [
    ['failed', 'ACCOUNT_DELETE_FAILED'],
    ['session-expired', 'ACCOUNT_DELETE_SESSION_EXPIRED'],
    ['offline', 'ACCOUNT_DELETE_OFFLINE'],
  ] as const) {
    it(`port → ${kind}: ${code}, still signed-in, local data untouched, sync resumed`, async () => {
      await signedIn();
      tc!.auth!.deletion.next = { kind };
      const r = await tc!.container.authService.deleteAccount({ keepData: false });
      expect(r.ok ? null : r.errors[0].code).toBe(code);
      expect(tc!.container.authService.state()).toMatchObject({ kind: 'signed-in', userId: USER1.userId });
      expect(tc!.auth!.port.calls.signOut).toBe(0);
      expect(await counts()).toEqual({ goals: 1, entries: 1, locale: 'vi' });
      expect(await meta()).toMatchObject({ userId: USER1.userId, lastUserId: USER1.userId });
      expect(tc!.container.syncService!.isPausedForDeletion()).toBe(false);
      expect((await tc!.container.syncService!.syncNow('manual')).status).toBe('ran');
    });
  }

  it('the port cannot even be loaded/called (throws) → ACCOUNT_DELETE_FAILED, still signed-in', async () => {
    await signedIn();
    tc!.auth!.deletion.next = new Error('chunk failed to load');
    const r = await tc!.container.authService.deleteAccount({ keepData: false });
    expect(r.ok ? null : r.errors[0].code).toBe('ACCOUNT_DELETE_FAILED');
    expect(tc!.container.authService.state().kind).toBe('signed-in');
    expect(await counts()).toEqual({ goals: 1, entries: 1, locale: 'vi' });
  });

  it('Apple sheet throws (not a cancel) → ACCOUNT_DELETE_FAILED, port not called', async () => {
    const sheets = new FakeIdTokenProvider(['google', 'apple']);
    sheets.results.apple = new Error('ASAuthorizationError 1000');
    await signedIn({ native: 'ios', idTokens: sheets }, ['apple']);
    const r = await tc!.container.authService.deleteAccount({ keepData: true });
    expect(r.ok ? null : r.errors[0].code).toBe('ACCOUNT_DELETE_FAILED');
    expect(tc!.auth!.deletion.calls).toEqual([]);
    expect(tc!.container.authService.state().kind).toBe('signed-in');
  });
});
