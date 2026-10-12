import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { DexieKvRepository } from '../data/dexie/kv-repo';
import { DexieLocalDataRepository } from '../data/dexie/local-data-repo';
import { openDatabase, type AppDatabase } from '../data/dexie/db';
import { normalizeSyncMeta } from '../data/repositories';
import { datasetS1 } from '../test/builders';
import { createTestDatabase } from '../test/db';
import { fakeAuthLoader, FakeAuthPort, MemoryReturnTo, USER1, USER2 } from '../test/fake-auth-port';
import { AuthService, type AuthState } from './auth-service';

const REDIRECT = 'http://localhost:4174/one-percent-better/?auth=callback';

let db: AppDatabase;

beforeEach(async () => {
  db = createTestDatabase();
  await openDatabase(db);
});

afterEach(async () => {
  await db.delete();
});

function build(options: { stored?: boolean; online?: boolean; failLoad?: boolean; port?: FakeAuthPort } = {}) {
  const loader = fakeAuthLoader(options.port ?? new FakeAuthPort(), { stored: options.stored, failLoad: options.failLoad });
  const returnTo = new MemoryReturnTo();
  const online = { value: options.online ?? true };
  const service = new AuthService({
    loadAuth: loader.loadAuth,
    storedSession: loader.storedSession,
    clearStoredSession: loader.clearStoredSession,
    local: new DexieLocalDataRepository(db),
    kv: new DexieKvRepository(db),
    connectivity: { isOnline: () => online.value },
    returnTo,
    redirectUrl: REDIRECT,
  });
  const states: AuthState[] = [];
  service.watch().subscribe((s) => states.push(s));
  return { service, loader, port: loader.port, returnTo, online, states };
}

const syncMeta = async () => normalizeSyncMeta((await db.kv.get('sync'))?.value);

describe('AuthService — unavailable (FR-38)', () => {
  it('cloud = null → state unavailable, every call is a no-op', async () => {
    const service = AuthService.unavailable();
    expect(service.state()).toEqual({ kind: 'unavailable' });
    expect(service.isAvailable()).toBe(false);
    await service.init();
    expect(service.state()).toEqual({ kind: 'unavailable' });
    expect((await service.signIn('#/today')).ok).toBe(false);
    expect((await service.completeCallback({ code: 'x' })).ok).toBe(false);
    expect((await service.signOut({ keepData: true })).ok).toBe(false);
  });
});

describe('AuthService.init — lazy loading (M6-AC5, ADR-18)', () => {
  it('no stored session and no kv account → signed-out, loader never called', async () => {
    const { service, loader } = build({ stored: false });
    await service.init();
    await service.settled();
    expect(service.state()).toEqual({ kind: 'signed-out' });
    expect(loader.state.loads).toBe(0);
  });

  it('stored session → loader called exactly once, saved account shown immediately, then verified', async () => {
    await db.kv.put({ key: 'sync', value: { userId: USER1.userId, account: { email: USER1.email, name: USER1.name } } });
    const port = new FakeAuthPort();
    port.session = USER1;
    const { service, loader, states } = build({ stored: true, port });
    await service.init();
    // Before the SDK resolves the UI already shows the saved account (no flash of A1).
    expect(service.state()).toEqual({ kind: 'signed-in', ...USER1 });
    await service.settled();
    expect(loader.state.loads).toBe(1);
    expect(port.calls.getSession).toBe(1);
    expect(service.state()).toEqual({ kind: 'signed-in', ...USER1 });
    expect(states.filter((s) => s.kind === 'signed-out')).toHaveLength(1); // only the constructor default
    await service.init();
    await service.settled();
    expect(loader.state.loads).toBe(1);
  });

  it('stored session but kv has no account → signing-in while verifying, then signed-in and kv written', async () => {
    const port = new FakeAuthPort();
    port.session = USER1;
    const { service } = build({ stored: true, port });
    await service.init();
    expect(service.state()).toEqual({ kind: 'signing-in' });
    await service.settled();
    expect(service.state()).toEqual({ kind: 'signed-in', ...USER1 });
    expect(await syncMeta()).toMatchObject({ userId: USER1.userId, account: { email: USER1.email, name: USER1.name } });
  });

  it('stored session that the SDK rejects → expired (email from kv), data untouched', async () => {
    await db.goals.bulkPut(datasetS1().goals);
    await db.kv.put({ key: 'sync', value: { userId: USER1.userId, account: { email: USER1.email, name: USER1.name } } });
    const port = new FakeAuthPort();
    port.session = null;
    const { service } = build({ stored: true, port });
    await service.init();
    await service.settled();
    expect(service.state()).toEqual({ kind: 'expired', email: USER1.email });
    expect(await db.goals.count()).toBe(5);
    expect((await syncMeta()).account).toEqual({ email: USER1.email, name: USER1.name });
  });

  it('kv names an account but the SDK session is gone (expired earlier) → expired without loading the SDK', async () => {
    await db.kv.put({ key: 'sync', value: { userId: USER1.userId, account: { email: USER1.email, name: USER1.name } } });
    const { service, loader } = build({ stored: false });
    await service.init();
    expect(service.state()).toEqual({ kind: 'expired', email: USER1.email });
    expect(loader.state.loads).toBe(0);
  });

  it('SDK chunk fails to load (offline, not cached) → keeps the saved account, no error state', async () => {
    await db.kv.put({ key: 'sync', value: { userId: USER1.userId, account: { email: USER1.email, name: USER1.name } } });
    const { service } = build({ stored: true, failLoad: true });
    await service.init();
    await service.settled();
    expect(service.state()).toEqual({ kind: 'signed-in', ...USER1 });
  });
});

describe('AuthService.signIn (FR-39, M6-AC7)', () => {
  it('offline → AUTH_OFFLINE, loader not called, state carries lastError', async () => {
    const { service, loader } = build({ online: false });
    await service.init();
    const r = await service.signIn('#/today');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors[0].code).toBe('AUTH_OFFLINE');
    expect(loader.state.loads).toBe(0);
    expect(service.state()).toEqual({ kind: 'signed-out', lastError: 'AUTH_OFFLINE' });
    service.dismissError();
    expect(service.state()).toEqual({ kind: 'signed-out' });
  });

  it('online → saves returnTo, signing-in, hands the redirect URL to the port', async () => {
    const { service, port, returnTo } = build();
    await service.init();
    const r = await service.signIn('#/today');
    expect(r.ok).toBe(true);
    expect(returnTo.value).toBe('#/today');
    expect(port.calls.signIn).toBe(1);
    expect(port.lastRedirectTo).toBe(REDIRECT);
    expect(service.state()).toEqual({ kind: 'signing-in' });
  });

  it('port cannot start the flow → AUTH_FAILED, back to signed-out', async () => {
    const port = new FakeAuthPort();
    port.signInError = new Error('boom');
    const { service } = build({ port });
    await service.init();
    const r = await service.signIn('#/settings');
    expect(r.ok).toBe(false);
    expect(service.state()).toEqual({ kind: 'signed-out', lastError: 'AUTH_FAILED' });
  });
});

describe('AuthService.completeCallback (FR-39)', () => {
  it('code → exchange → signed-in, kv sync.userId/account written; state is signing-in synchronously', async () => {
    const { service, port, states } = build();
    await service.init();
    const promise = service.completeCallback({ code: 'abc' });
    expect(service.state()).toEqual({ kind: 'signing-in' });
    const r = await promise;
    expect(r.ok).toBe(true);
    expect(port.lastCode).toBe('abc');
    expect(service.state()).toEqual({ kind: 'signed-in', ...USER1 });
    expect(await syncMeta()).toMatchObject({ userId: USER1.userId, lastUserId: null, account: { email: USER1.email, name: USER1.name } });
    expect(states.map((s) => s.kind)).toEqual(['signed-out', 'signed-out', 'signing-in', 'signed-in']);
  });

  it('error=access_denied → AUTH_CANCELLED; other error → AUTH_FAILED; exchange throws → AUTH_FAILED', async () => {
    const { service, port } = build();
    await service.init();
    let r = await service.completeCallback({ error: 'access_denied', description: 'user cancelled' });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors[0].code).toBe('AUTH_CANCELLED');
    expect(service.state()).toEqual({ kind: 'signed-out', lastError: 'AUTH_CANCELLED' });
    expect(port.calls.exchange).toBe(0);

    r = await service.completeCallback({ error: 'server_error', description: 'x' });
    if (!r.ok) expect(r.errors[0].code).toBe('AUTH_FAILED');

    port.exchangeResult = new Error('code verifier missing');
    r = await service.completeCallback({ code: 'bogus' });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors[0].code).toBe('AUTH_FAILED');
    expect(service.state()).toEqual({ kind: 'signed-out', lastError: 'AUTH_FAILED' });
    expect((await syncMeta()).userId).toBeNull();
  });

  it('cancelled while the previous session had expired → back to expired (kv still names the account)', async () => {
    await db.kv.put({ key: 'sync', value: { userId: USER1.userId, account: { email: USER1.email, name: USER1.name } } });
    const { service } = build({ stored: false });
    await service.init();
    expect(service.state().kind).toBe('expired');
    await service.completeCallback({ error: 'access_denied', description: '' });
    expect(service.state()).toEqual({ kind: 'expired', email: USER1.email, lastError: 'AUTH_CANCELLED' });
  });
});

describe('AuthService — events (FR-40, M6-AC8)', () => {
  it('session-expired → expired, kv sync.account kept, nothing deleted', async () => {
    await db.goals.bulkPut(datasetS1().goals);
    const { service, port } = build();
    await service.init();
    await service.completeCallback({ code: 'abc' });
    port.emit({ type: 'session-expired' });
    await new Promise((r) => setTimeout(r, 0));
    await new Promise((r) => setTimeout(r, 10));
    expect(service.state()).toEqual({ kind: 'expired', email: USER1.email });
    expect(await syncMeta()).toMatchObject({ userId: USER1.userId, account: { email: USER1.email, name: USER1.name } });
    expect(await db.goals.count()).toBe(5);
  });

  it('signed-in from another tab → mirrored; signed-out from another tab → signed-out', async () => {
    const { service, port } = build();
    await service.init();
    await service.signIn('#/settings'); // loads the port, subscribes to events
    port.emit({ type: 'signed-in', session: USER2 });
    await new Promise((r) => setTimeout(r, 10));
    // Our own flow is in progress (signing-in): the foreign event is ignored until the callback completes.
    expect(service.state()).toEqual({ kind: 'signing-in' });
    await service.completeCallback({ code: 'abc' });
    port.emit({ type: 'signed-in', session: USER2 });
    await new Promise((r) => setTimeout(r, 10));
    expect(service.state()).toEqual({ kind: 'signed-in', ...USER2 });
    await db.kv.put({ key: 'sync', value: { userId: null, account: null } });
    port.emit({ type: 'signed-out' });
    await new Promise((r) => setTimeout(r, 10));
    expect(service.state()).toEqual({ kind: 'signed-out' });
  });
});

describe('AuthService.signOut (FR-41, M6-AC9)', () => {
  async function signedIn(options: Parameters<typeof build>[0] = {}) {
    const s1 = datasetS1();
    await db.goals.bulkPut(s1.goals);
    await db.entries.bulkPut(s1.entries);
    await db.kv.bulkPut([
      { key: 'locale', value: 'vi' },
      { key: 'settings', value: { reminderEnabled: true, reminderTime: '07:00' } },
      { key: 'activeTimer', value: { goalId: s1.goals[0].id, startedAt: '2026-10-09T02:00:00.000Z' } },
    ]);
    const built = build(options);
    await built.service.init();
    await built.service.completeCallback({ code: 'abc' });
    built.loader.state.stored = true;
    return built;
  }

  it('keepData: port signed out, kv userId/account cleared, lastUserId kept, data untouched', async () => {
    const { service, port } = await signedIn();
    const r = await service.signOut({ keepData: true });
    expect(r.ok).toBe(true);
    expect(port.calls.signOut).toBe(1);
    expect(service.state()).toEqual({ kind: 'signed-out' });
    expect(await syncMeta()).toMatchObject({ userId: null, account: null, lastUserId: USER1.userId });
    expect(await db.goals.count()).toBe(5);
    expect(await db.entries.count()).toBe(23);
    expect(await db.kv.get('settings')).toEqual({ key: 'settings', value: { reminderEnabled: true, reminderTime: '07:00' } });
    expect(await db.kv.get('locale')).toEqual({ key: 'locale', value: 'vi' });
  });

  it('remove: clearUserData (goals, entries, settings, timer, sync) but locale stays', async () => {
    const { service, port } = await signedIn();
    const r = await service.signOut({ keepData: false });
    expect(r.ok).toBe(true);
    expect(port.calls.signOut).toBe(1);
    expect(await db.goals.count()).toBe(0);
    expect(await db.entries.count()).toBe(0);
    expect((await db.kv.toArray()).map((k) => k.key)).toEqual(['locale']);
    expect(service.state()).toEqual({ kind: 'signed-out' });
  });

  it('port sign-out failure (offline) does not block the local sign-out; stored session is cleared directly', async () => {
    const port = new FakeAuthPort();
    port.signOutError = new Error('network');
    const { service, loader } = await signedIn({ port });
    const r = await service.signOut({ keepData: true });
    expect(r.ok).toBe(true);
    expect(service.state()).toEqual({ kind: 'signed-out' });
    // The service falls back to removing the stored SDK session itself (ARCH §5.9: network never blocks sign-out).
    expect(loader.state.cleared).toBe(1);
    expect(loader.state.stored).toBe(false);
  });

  it('remove: a storage failure aborts the sign-out and keeps the session', async () => {
    const { service, port } = await signedIn();
    const local = new DexieLocalDataRepository(db);
    const broken = new AuthService({
      loadAuth: async () => port,
      storedSession: () => true,
      local: { ...local, clearUserData: async () => { throw new Error('disk full'); }, countLive: () => local.countLive() },
      kv: new DexieKvRepository(db),
      connectivity: { isOnline: () => true },
      returnTo: new MemoryReturnTo(),
      redirectUrl: REDIRECT,
    });
    await broken.init();
    await broken.settled();
    expect(broken.state().kind).toBe('signed-in');
    await expect(broken.signOut({ keepData: false })).rejects.toThrow('disk full');
    expect(broken.state().kind).toBe('signed-in');
    expect(await db.goals.count()).toBe(5);
    expect(port.calls.signOut).toBe(0);
    expect(service.state().kind).toBe('signed-in');
  });
});

describe('AuthService.onOutcome (UI feedback for the OAuth round-trip)', () => {
  it('delivers an outcome that happened before the listener subscribed, exactly once', async () => {
    const { service } = build();
    await service.init();
    await service.completeCallback({ error: 'access_denied', description: '' });
    const seen: unknown[] = [];
    const off = service.onOutcome((o) => seen.push(o));
    expect(seen).toEqual([{ kind: 'error', code: 'AUTH_CANCELLED' }]);
    off();
    service.onOutcome((o) => seen.push(o));
    expect(seen).toHaveLength(1);
  });

  it('delivers live outcomes to subscribed listeners (signed-in with the email)', async () => {
    const { service } = build();
    await service.init();
    const seen: unknown[] = [];
    service.onOutcome((o) => seen.push(o));
    await service.completeCallback({ code: 'abc' });
    expect(seen).toEqual([{ kind: 'signed-in', email: USER1.email }]);
  });
});

describe('AuthService — M7 additions (M6-D1 fix, expire, account switch, preserveLastUserId)', () => {
  it('M6-D1: a stale/bogus callback while a valid stored session exists keeps the signed-in state (no demotion to expired)', async () => {
    await db.kv.put({ key: 'sync', value: { userId: USER1.userId, account: { email: USER1.email, name: USER1.name } } });
    const port = new FakeAuthPort();
    port.session = USER1;
    const { service, states } = build({ stored: true, port });
    await service.init();
    await service.settled();
    expect(service.state()).toEqual({ kind: 'signed-in', ...USER1 });
    port.exchangeResult = new Error('invalid or expired auth code');
    const outcomes: unknown[] = [];
    service.onOutcome((o) => outcomes.push(o));
    const r = await service.completeCallback({ code: 'already-used-or-bogus' });
    expect(r.ok).toBe(false);
    expect(service.state()).toEqual({ kind: 'signed-in', ...USER1 });
    expect(states.some((s) => s.kind === 'expired')).toBe(false);
    expect(outcomes).toEqual([{ kind: 'error', code: 'AUTH_FAILED' }]);
    // The same holds for a provider error while signed in.
    await service.completeCallback({ error: 'access_denied', description: 'cancelled' });
    expect(service.state()).toEqual({ kind: 'signed-in', ...USER1 });
  });

  it('a failed callback while the stored session is gone still ends in expired/signed-out (unchanged behaviour)', async () => {
    const { service, loader } = build({ stored: false });
    await service.init();
    loader.port.exchangeResult = new Error('nope');
    await service.completeCallback({ code: 'bogus' });
    expect(service.state()).toEqual({ kind: 'signed-out', lastError: 'AUTH_FAILED' });
  });

  it('expire(): signed-in → expired keeping kv sync.account; no-op in other states', async () => {
    const port = new FakeAuthPort();
    port.session = USER1;
    const { service } = build({ stored: true, port });
    await service.init();
    await service.settled();
    service.expire();
    expect(service.state()).toEqual({ kind: 'expired', email: USER1.email });
    expect((await syncMeta()).account).toEqual({ email: USER1.email, name: USER1.name });
    service.expire();
    expect(service.state()).toEqual({ kind: 'expired', email: USER1.email });
  });

  it('signing in as another account without signing out remembers the previous one as lastUserId (FR-47)', async () => {
    await db.kv.put({ key: 'sync', value: { userId: USER1.userId, account: { email: USER1.email, name: USER1.name } } });
    const { service, loader } = build({ stored: false });
    await service.init();
    expect(service.state()).toEqual({ kind: 'expired', email: USER1.email });
    loader.port.exchangeResult = USER2;
    await service.completeCallback({ code: 'ok' });
    expect(service.state()).toEqual({ kind: 'signed-in', ...USER2 });
    expect(await syncMeta()).toMatchObject({ userId: USER2.userId, lastUserId: USER1.userId });
  });

  it('signOut({ keepData, preserveLastUserId }) keeps the previous lastUserId (D5 Cancel)', async () => {
    await db.kv.put({ key: 'sync', value: { userId: USER2.userId, lastUserId: USER1.userId, account: { email: USER2.email, name: USER2.name } } });
    const port = new FakeAuthPort();
    port.session = USER2;
    const { service } = build({ stored: true, port });
    await service.init();
    await service.settled();
    await service.signOut({ keepData: true, preserveLastUserId: true });
    expect(service.state()).toEqual({ kind: 'signed-out' });
    expect(await syncMeta()).toMatchObject({ userId: null, lastUserId: USER1.userId });
  });

  it('callback error with a provider error clears the PKCE verifier through the injected cleaner (M6-P1)', async () => {
    const { service } = build({ stored: false });
    let cleared = 0;
    (service as unknown as { deps: { clearPkceVerifier?: () => void } }).deps.clearPkceVerifier = () => {
      cleared += 1;
    };
    await service.init();
    await service.completeCallback({ error: 'access_denied', description: 'cancelled' });
    expect(cleared).toBe(1);
  });
});
