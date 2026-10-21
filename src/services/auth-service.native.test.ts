// M14-AC1: native sign-in in AuthService (FR-59, FR-60; ARCH §5.9 v5.0, ADR-36). FakeIdTokenProvider + FakeAuthPort
// + Dexie fake. The web flow (no `idTokens`) must behave exactly as in M6 (M6-AC6 / M6-AC7 stay green).
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { startSyncScheduler } from '../app/sync-scheduler';
import { DexieKvRepository } from '../data/dexie/kv-repo';
import { DexieLocalDataRepository } from '../data/dexie/local-data-repo';
import { openDatabase, type AppDatabase } from '../data/dexie/db';
import { normalizeSyncMeta, type Subscribable } from '../data/repositories';
import type { SyncStatus } from '../domain/sync';
import { createTestDatabase } from '../test/db';
import { fakeAuthLoader, FakeAuthPort, MemoryReturnTo, USER1 } from '../test/fake-auth-port';
import { FakeIdTokenProvider } from '../test/fake-id-token-provider';
import { AuthService, type AuthOutcome, type AuthState } from './auth-service';
import type { SyncReason } from './sync-service';

const REDIRECT = 'http://localhost:4174/one-percent-better/?auth=callback';

let db: AppDatabase;

beforeEach(async () => {
  db = createTestDatabase();
  await openDatabase(db);
});

afterEach(async () => {
  await db.delete();
});

function build(options: { idTokens?: FakeIdTokenProvider | null; online?: boolean; port?: FakeAuthPort; stored?: boolean } = {}) {
  const port = options.port ?? new FakeAuthPort();
  const loader = fakeAuthLoader(port, { stored: options.stored });
  const returnTo = new MemoryReturnTo();
  const online = { value: options.online ?? true };
  const idTokens = options.idTokens === undefined ? new FakeIdTokenProvider() : options.idTokens;
  const service = new AuthService({
    loadAuth: loader.loadAuth,
    storedSession: loader.storedSession,
    clearStoredSession: loader.clearStoredSession,
    local: new DexieLocalDataRepository(db),
    kv: new DexieKvRepository(db),
    connectivity: { isOnline: () => online.value },
    returnTo,
    redirectUrl: REDIRECT,
    ...(idTokens ? { idTokens } : {}),
  });
  const states: AuthState[] = [];
  service.watch().subscribe((s) => states.push(s));
  const outcomes: AuthOutcome[] = [];
  service.onOutcome((o) => outcomes.push(o));
  return { service, loader, port, returnTo, online, idTokens, states, outcomes };
}

/** The real scheduler with a spy sync: proves the native flow lands in the same `handleSignedIn` as the callback flow. */
function schedulerSpy(service: AuthService) {
  const calls: string[] = [];
  const reasons: SyncReason[] = [];
  const status: SyncStatus = { kind: 'idle', pending: 0, lastSyncedAt: null };
  const stop = startSyncScheduler({
    sync: {
      start: () => undefined,
      syncNow: async (reason: SyncReason) => {
        reasons.push(reason);
        return { status: 'ran', ok: true } as const;
      },
      handleSignedIn: async (userId: string) => {
        calls.push(`handleSignedIn:${userId}`);
        reasons.push('sign-in');
        return 'merge-silently' as const;
      },
      reset: async () => {
        calls.push('reset');
      },
      pause: () => {
        calls.push('pause');
      },
      watchStatus: (): Subscribable<SyncStatus> => ({ subscribe: (onNext) => (onNext(status), () => undefined) }),
    },
    auth: service,
    intervalMs: 300_000,
    deps: { setTimeout: () => 0, clearTimeout: () => undefined, setInterval: () => 0, clearInterval: () => undefined },
  });
  return { calls, reasons, stop };
}

const syncMeta = async () => normalizeSyncMeta((await db.kv.get('sync'))?.value);

describe('signIn(returnTo, provider) — native flow (M14-AC1)', () => {
  it("apple: getIdToken('apple') once → port.signInWithIdToken({ provider, token, nonce: raw }) once → signed-in; returnTo not written; no redirect; scheduler runs handleSignedIn like the callback", async () => {
    const { service, port, returnTo, idTokens, states, outcomes } = build();
    await service.init();
    const sched = schedulerSpy(service);
    const r = await service.signIn('#/settings', 'apple');
    expect(r.ok).toBe(true);
    expect(idTokens!.count('getIdToken', 'apple')).toBe(1);
    expect(port.calls.signInWithIdToken).toBe(1);
    expect(port.idTokenCalls).toEqual([{ provider: 'apple', token: 'apple-id-token-1', nonce: 'raw-nonce-1' }]);
    expect(port.calls.signIn).toBe(0);
    expect(returnTo.value).toBeNull();
    expect(service.state()).toEqual({ kind: 'signed-in', ...USER1, providers: ['apple'] });
    expect(states.map((s) => s.kind).slice(-2)).toEqual(['signing-in', 'signed-in']);
    expect(outcomes).toEqual([{ kind: 'signed-in', email: USER1.email }]);
    expect(sched.calls.filter((c) => c !== 'pause')).toEqual([`handleSignedIn:${USER1.userId}`]);
    expect(sched.reasons).toEqual(['sign-in']);
    const meta = await syncMeta();
    expect(meta).toMatchObject({ userId: USER1.userId, account: { email: USER1.email, name: USER1.name, provider: 'apple' } });
    sched.stop();
  });

  it('google on native: same flow with the google sheet; no PKCE redirect, no returnTo', async () => {
    const { service, port, returnTo, idTokens } = build();
    await service.init();
    expect((await service.signIn('#/today', 'google')).ok).toBe(true);
    expect(idTokens!.calls).toEqual([{ method: 'getIdToken', provider: 'google' }]);
    expect(port.idTokenCalls[0]).toMatchObject({ provider: 'google' });
    expect(port.calls.signIn).toBe(0);
    expect(returnTo.value).toBeNull();
    expect(service.state()).toMatchObject({ kind: 'signed-in', providers: ['google'] });
    expect((await syncMeta()).account?.provider).toBe('google');
  });

  it('Apple with a name: port.setDisplayName("Given Family") once, the state carries the name; no name → not called', async () => {
    const { service, port, idTokens } = build({ port: Object.assign(new FakeAuthPort(), { idTokenResult: { ...USER1, name: 'minh.test', providers: ['apple' as const] } }) });
    idTokens!.results.apple = { kind: 'ok', idToken: 't', rawNonce: 'n', givenName: 'Given', familyName: 'Family' };
    await service.init();
    await service.signIn('#/settings', 'apple');
    expect(port.displayNames).toEqual(['Given Family']);
    expect(service.state()).toMatchObject({ kind: 'signed-in', name: 'Given Family' });

    const b = build();
    await b.service.init();
    await b.service.signIn('#/settings', 'apple');
    expect(b.port.calls.setDisplayName).toBe(0);
  });

  it('sheet cancelled → AUTH_CANCELLED, signed-out with lastError, error outcome, port never called, nothing in kv', async () => {
    const { service, port, idTokens, outcomes } = build();
    idTokens!.results.apple = { kind: 'cancelled' };
    await service.init();
    const r = await service.signIn('#/settings', 'apple');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors[0].code).toBe('AUTH_CANCELLED');
    expect(service.state()).toEqual({ kind: 'signed-out', lastError: 'AUTH_CANCELLED' });
    expect(port.calls.signInWithIdToken).toBe(0);
    expect(outcomes).toEqual([{ kind: 'error', code: 'AUTH_CANCELLED' }]);
    expect((await syncMeta()).userId).toBeNull();
  });

  it('sheet throws → AUTH_FAILED; signInWithIdToken throws → AUTH_FAILED and kv `sync.account` not written', async () => {
    const a = build();
    a.idTokens!.results.google = new Error('No presenting view controller found');
    await a.service.init();
    const ra = await a.service.signIn('#/settings', 'google');
    expect(ra.ok ? null : ra.errors[0].code).toBe('AUTH_FAILED');
    expect(a.service.state()).toEqual({ kind: 'signed-out', lastError: 'AUTH_FAILED' });

    const b = build({ port: Object.assign(new FakeAuthPort(), { idTokenResult: new Error('invalid_grant: nonce mismatch') }) });
    await b.service.init();
    const rb = await b.service.signIn('#/settings', 'apple');
    expect(rb.ok ? null : rb.errors[0].code).toBe('AUTH_FAILED');
    expect(b.service.state()).toEqual({ kind: 'signed-out', lastError: 'AUTH_FAILED' });
    expect(b.port.calls.signInWithIdToken).toBe(1);
    expect((await syncMeta()).account).toBeNull();
    expect(b.outcomes).toEqual([{ kind: 'error', code: 'AUTH_FAILED' }]);
  });

  it('offline → AUTH_OFFLINE, the sheet is never opened', async () => {
    const { service, idTokens } = build({ online: false });
    await service.init();
    const r = await service.signIn('#/settings', 'apple');
    expect(r.ok ? null : r.errors[0].code).toBe('AUTH_OFFLINE');
    expect(idTokens!.calls).toEqual([]);
    expect(service.state()).toEqual({ kind: 'signed-out', lastError: 'AUTH_OFFLINE' });
  });

  it("provider not offered by the sheets (Android: apple) falls through → AUTH_FAILED, port untouched", async () => {
    const { service, port, idTokens } = build({ idTokens: new FakeIdTokenProvider(['google']) });
    await service.init();
    const r = await service.signIn('#/settings', 'apple');
    expect(r.ok ? null : r.errors[0].code).toBe('AUTH_FAILED');
    expect(idTokens!.calls).toEqual([]);
    expect(port.calls.signIn + port.calls.signInWithIdToken).toBe(0);
  });

  it('signOut after a native sign-in → idTokens.logout(provider) once; the provider is forgotten with the account', async () => {
    const { service, idTokens } = build({ stored: true });
    await service.init();
    await service.signIn('#/settings', 'apple');
    expect((await service.signOut({ keepData: true })).ok).toBe(true);
    expect(idTokens!.calls.filter((c) => c.method === 'logout')).toEqual([{ method: 'logout', provider: 'apple' }]);
    expect(service.state()).toEqual({ kind: 'signed-out' });
    expect((await syncMeta()).account).toBeNull();
  });

  it('a native sign-in started while a valid session exists keeps that session when the sheet fails (M6-D1)', async () => {
    const port = new FakeAuthPort();
    port.session = USER1;
    const { service, idTokens } = build({ port, stored: true });
    await db.kv.put({ key: 'sync', value: { userId: USER1.userId, account: { email: USER1.email, name: USER1.name } } });
    await service.init();
    await service.settled();
    idTokens!.results.google = { kind: 'cancelled' };
    await service.signIn('#/settings', 'google');
    expect(service.state()).toMatchObject({ kind: 'signed-in', userId: USER1.userId });
  });
});

describe('signIn — web flow unchanged without idTokens (M6-AC6 / M6-AC7)', () => {
  it("signIn('#/settings') → returnTo saved, redirect started, signing-in", async () => {
    const { service, port, returnTo } = build({ idTokens: null });
    await service.init();
    expect((await service.signIn('#/settings')).ok).toBe(true);
    expect(returnTo.value).toBe('#/settings');
    expect(port.lastRedirectTo).toBe(REDIRECT);
    expect(port.calls.signIn).toBe(1);
    expect(port.calls.signInWithIdToken).toBe(0);
    expect(service.state()).toEqual({ kind: 'signing-in' });
  });

  it("signIn('#/settings', 'apple') on the web → AUTH_FAILED, port never called, state untouched", async () => {
    const { service, port, returnTo } = build({ idTokens: null });
    await service.init();
    const r = await service.signIn('#/settings', 'apple');
    expect(r.ok ? null : r.errors[0].code).toBe('AUTH_FAILED');
    expect(port.calls.signIn + port.calls.signInWithIdToken).toBe(0);
    expect(returnTo.value).toBeNull();
    expect(service.state()).toEqual({ kind: 'signed-out' });
  });

  it('unavailable service: signIn with any provider → AUTH_FAILED', async () => {
    const service = AuthService.unavailable();
    expect((await service.signIn('#/today', 'apple')).ok).toBe(false);
    expect((await service.deleteAccount({ keepData: true })).ok).toBe(false);
  });
});
