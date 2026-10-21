// M14-AC3: `SupabaseAuthPort.signInWithIdToken` / `setDisplayName` and `SupabaseAccountDeletionPort` against the
// in-process mock Supabase (ARCHITECTURE §5.9 v5.0, §5.11, §5.16). No Google, no Apple, no real project.
import { createHash } from 'node:crypto';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { signMockIdToken, startMockSupabase, USERS, type MockSupabase } from '../../../e2e/mock-supabase/server.mjs';
import type { AuthEvent } from '../../services/auth-port';
import { AUTH_STORAGE_KEY } from './loader';
import { createSupabaseAccountDeletionPort, createSupabaseAuthPort, SupabaseAccountDeletionPort, SupabaseAuthPort } from './supabase-client';

let mock: MockSupabase;

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

beforeAll(async () => {
  mock = await startMockSupabase(0);
});
afterAll(async () => {
  await mock.close();
});
afterEach(async () => {
  vi.useRealTimers();
  await fetch(`${mock.url}/__test/reset`);
});

const sha256hex = (s: string) => createHash('sha256').update(s).digest('hex');
const RAW = 'a'.repeat(64);

function makePort(storage = memoryStorage()) {
  const port = createSupabaseAuthPort({ url: mock.url, key: 'sb_publishable_mock' }, storage, { navigate: () => undefined }) as SupabaseAuthPort;
  const events: AuthEvent[] = [];
  port.onEvent((e) => events.push(e));
  return { port, storage, events };
}

const idTokenRequests = () => mock.state.log.filter((l) => l.method === 'POST' && l.path === '/auth/v1/token' && l.query.grant_type === 'id_token');
const userPuts = () => mock.state.log.filter((l) => l.method === 'PUT' && l.path === '/auth/v1/user');

describe('signInWithIdToken (ADR-36)', () => {
  it('POST /auth/v1/token?grant_type=id_token with provider, id_token and the RAW nonce; a session for the verified email; getSession returns it; stored under opb-auth', async () => {
    const { port, storage } = makePort();
    const token = signMockIdToken({ sub: 'apple-sub-1', email: 'new.person@privaterelay.appleid.com', nonce: sha256hex(RAW) });
    const session = await port.signInWithIdToken({ provider: 'apple', token, nonce: RAW });
    expect(session).toMatchObject({ email: 'new.person@privaterelay.appleid.com', providers: ['apple'] });
    expect(session.userId).toMatch(/^[0-9a-f-]{36}$/);
    expect(session.name).toBe('new.person'); // no name in the token → email prefix (A-21)
    const req = idTokenRequests();
    expect(req).toHaveLength(1);
    expect(req[0].body).toEqual(expect.arrayContaining(['provider', 'id_token', 'nonce']));
    expect((await port.getSession())?.email).toBe('new.person@privaterelay.appleid.com');
    expect(storage.getItem(AUTH_STORAGE_KEY)).toBeTruthy();
    expect(await port.accessToken()).toBeTruthy();
  });

  it('a nonce that does not hash to the token claim → the mock answers 400 → the port throws, nothing stored', async () => {
    const { port, storage } = makePort();
    const token = signMockIdToken({ sub: 'g-1', email: 'x@example.com', nonce: sha256hex(RAW) });
    await expect(port.signInWithIdToken({ provider: 'google', token, nonce: 'b'.repeat(64) })).rejects.toBeTruthy();
    await expect(port.signInWithIdToken({ provider: 'google', token: 'not.a.jwt', nonce: RAW })).rejects.toBeTruthy();
    expect(storage.getItem(AUTH_STORAGE_KEY)).toBeNull();
    expect(await port.getSession()).toBeNull();
  });

  it('Apple first sign-in with a name and no stored name → setDisplayName makes exactly one PUT /auth/v1/user with data.full_name "Given Family"; the name is then on the session', async () => {
    const { port } = makePort();
    const token = signMockIdToken({ sub: 'apple-sub-2', email: 'hidden@privaterelay.appleid.com', nonce: sha256hex(RAW) });
    await port.signInWithIdToken({ provider: 'apple', token, nonce: RAW });
    await port.setDisplayName('Given Family');
    expect(userPuts()).toHaveLength(1);
    const user = [...mock.state.users.values()].find((u) => u.email === 'hidden@privaterelay.appleid.com');
    expect(user?.meta).toEqual({ full_name: 'Given Family' });
    expect((await port.getSession())?.name).toBe('Given Family');
    // Second call (e.g. a later sign-in with a name again): the account already has one → no request.
    await port.setDisplayName('Someone Else');
    expect(userPuts()).toHaveLength(1);
  });

  it('an account that already has a name (Google sign-in earlier) → setDisplayName makes 0 requests', async () => {
    const { port } = makePort();
    const token = signMockIdToken({ sub: 'g-u1', email: USERS.u1.email, nonce: sha256hex(RAW) });
    const session = await port.signInWithIdToken({ provider: 'google', token, nonce: RAW });
    expect(session.name).toBe('Minh Test');
    await port.setDisplayName('Given Family');
    expect(userPuts()).toHaveLength(0);
    expect((await port.getSession())?.name).toBe('Minh Test');
  });

  it('same verified email as an existing Google account → same userId and providers contains both (linking, A-60)', async () => {
    const { port } = makePort();
    const token = signMockIdToken({ sub: 'apple-sub-u1', email: USERS.u1.email, nonce: sha256hex(RAW) });
    const session = await port.signInWithIdToken({ provider: 'apple', token, nonce: RAW });
    expect(session.userId).toBe(USERS.u1.id);
    expect(session.providers).toEqual(['google', 'apple']);
  });

  it('no SIGNED_IN event is emitted for the port’s own exchange (the service applies the result itself)', async () => {
    const { port, events } = makePort();
    const token = signMockIdToken({ sub: 'g-2', email: 'two@example.com', nonce: sha256hex(RAW) });
    await port.signInWithIdToken({ provider: 'google', token, nonce: RAW });
    expect(events.filter((e) => e.type === 'signed-in')).toHaveLength(0);
  });
});

describe('SupabaseAccountDeletionPort (ARCH §5.16)', () => {
  async function signedIn() {
    const { port, storage } = makePort();
    const token = signMockIdToken({ sub: 'g-del', email: USERS.u2.email, nonce: sha256hex(RAW) });
    await port.signInWithIdToken({ provider: 'google', token, nonce: RAW });
    return { port, storage, deletion: createSupabaseAccountDeletionPort(port) as SupabaseAccountDeletionPort };
  }

  it('POST /functions/v1/delete-account with the Bearer token, JSON body; 200 → deleted + appleRevoked; the user is gone from the mock and its JWT is refused afterwards', async () => {
    const { port, deletion } = await signedIn();
    const r = await deletion.deleteAccount({});
    expect(r).toEqual({ kind: 'deleted', appleRevoked: 'not-applicable' });
    const call = mock.state.log.find((l) => l.path === '/functions/v1/delete-account');
    expect(call?.method).toBe('POST');
    expect(mock.state.users.has(USERS.u2.id)).toBe(false);
    expect(mock.state.deleted.has(USERS.u2.id)).toBe(true);
    // The same session is now invalid: a second call is 401 → session-expired (idempotent retry, §4.7 f).
    expect(await deletion.deleteAccount({})).toEqual({ kind: 'session-expired' });
    expect((await (await fetch(`${mock.url}/auth/v1/user`, { headers: { Authorization: `Bearer ${await port.accessToken()}` } })).status)).toBe(401);
  });

  it('appleAuthorizationCode is sent in the body; an Apple account without a code → manual-required', async () => {
    const { port } = makePort();
    const token = signMockIdToken({ sub: 'a-del', email: 'apple.del@example.com', nonce: sha256hex(RAW) });
    await port.signInWithIdToken({ provider: 'apple', token, nonce: RAW });
    const deletion = createSupabaseAccountDeletionPort(port);
    expect(await deletion.deleteAccount({ appleAuthorizationCode: 'c0de' })).toEqual({ kind: 'deleted', appleRevoked: 'revoked' });
    expect(mock.state.log.find((l) => l.path === '/functions/v1/delete-account')?.body).toEqual(['appleAuthorizationCode']);

    const second = makePort();
    await second.port.signInWithIdToken({ provider: 'apple', token: signMockIdToken({ sub: 'a-del-2', email: 'apple.del2@example.com', nonce: sha256hex(RAW) }), nonce: RAW });
    expect(await createSupabaseAccountDeletionPort(second.port).deleteAccount({})).toEqual({ kind: 'deleted', appleRevoked: 'manual-required' });
  });

  it('without a session → session-expired (401), nothing deleted', async () => {
    const { port } = makePort();
    const deletion = createSupabaseAccountDeletionPort(port);
    expect(await deletion.deleteAccount({})).toEqual({ kind: 'session-expired' });
    expect(mock.state.users.size).toBe(2);
  });

  it('500 from the function → failed, user still there; the next call succeeds (no automatic retry inside the port)', async () => {
    const { deletion } = await signedIn();
    await fetch(`${mock.url}/__test/fail?path=delete-account&status=500&times=1`);
    expect(await deletion.deleteAccount({})).toEqual({ kind: 'failed' });
    expect(mock.state.users.has(USERS.u2.id)).toBe(true);
    expect(await deletion.deleteAccount({})).toEqual({ kind: 'deleted', appleRevoked: 'not-applicable' });
    expect(mock.state.log.filter((l) => l.path === '/functions/v1/delete-account')).toHaveLength(2);
  });

  it('network failure → offline; timeout → failed; unexpected body → failed', async () => {
    const { port } = await signedIn();
    const client = port.client;
    const original = client.functions;
    // Network error: a fetch that rejects → FunctionsFetchError → offline.
    const offline = new SupabaseAccountDeletionPort(
      Object.create(client, { functions: { get: () => ({ invoke: async () => ({ data: null, error: Object.assign(new Error('Failed to fetch'), { name: 'FunctionsFetchError' }) }) }) } }) as typeof client,
    );
    expect(await offline.deleteAccount({})).toEqual({ kind: 'offline' });
    // Timeout: the invoke only settles when aborted → failed (not offline).
    const slow = new SupabaseAccountDeletionPort(
      Object.create(client, {
        functions: {
          get: () => ({
            invoke: (_n: string, o: { signal: AbortSignal }) => new Promise((resolve) => o.signal.addEventListener('abort', () => resolve({ data: null, error: Object.assign(new Error('aborted'), { name: 'FunctionsFetchError' }) }))),
          }),
        },
      }) as typeof client,
      20,
    );
    expect(await slow.deleteAccount({})).toEqual({ kind: 'failed' });
    // Unexpected body
    const odd = new SupabaseAccountDeletionPort(Object.create(client, { functions: { get: () => ({ invoke: async () => ({ data: { deleted: 'yes' }, error: null }) }) } }) as typeof client);
    expect(await odd.deleteAccount({})).toEqual({ kind: 'failed' });
    expect(original).toBeTruthy();
    expect(mock.state.users.has(USERS.u2.id)).toBe(true);
  });
});
