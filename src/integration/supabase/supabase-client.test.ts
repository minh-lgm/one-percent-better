// Integration test of SupabaseAuthPort against the mock Supabase (ARCHITECTURE §8, M6-T3),
// started in-process on a random port. No Google, no real project.
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { startMockSupabase, USERS, type MockSupabase } from '../../../e2e/mock-supabase/server.mjs';
import type { AuthEvent } from '../../services/auth-port';
import { AUTH_STORAGE_KEY } from './loader';
import { createSupabaseAuthPort, SupabaseAuthPort } from './supabase-client';

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
    data,
  } as unknown as Storage & { data: Map<string, string> };
}

beforeAll(async () => {
  mock = await startMockSupabase(0);
});

afterAll(async () => {
  await mock.close();
});

afterEach(async () => {
  await fetch(`${mock.url}/__test/reset`);
});

const REDIRECT = 'http://localhost:4174/one-percent-better/?auth=callback';

function makePort(storage = memoryStorage()) {
  const navigated: string[] = [];
  const port = createSupabaseAuthPort({ url: mock.url, key: 'sb_publishable_mock' }, storage, { navigate: (url) => navigated.push(url) }) as SupabaseAuthPort;
  const events: AuthEvent[] = [];
  port.onEvent((e) => events.push(e));
  return { port, storage, navigated, events };
}

/** Follow the provider URL to the mock chooser and pick a user; returns the callback URL the browser would land on. */
async function chooseAccount(authorizeUrl: string, user: 'u1' | 'u2' | 'cancel'): Promise<URL> {
  const page = await fetch(authorizeUrl);
  expect(page.status).toBe(200);
  const html = await page.text();
  const flow = /name="flow" value="([^"]+)"/.exec(html)?.[1];
  expect(flow).toBeTruthy();
  const res = await fetch(`${mock.url}/auth/v1/__choose?flow=${flow}&user=${user}`, { redirect: 'manual' });
  expect(res.status).toBe(302);
  return new URL(res.headers.get('location')!);
}

describe('SupabaseAuthPort + mock Supabase (PKCE)', () => {
  it('signInWithGoogle builds the authorize URL with S256 PKCE and the exact redirect_to, storing the verifier under opb-auth-code-verifier', async () => {
    const { port, storage, navigated } = makePort();
    await port.signInWithGoogle(REDIRECT);
    expect(navigated).toHaveLength(1);
    const url = new URL(navigated[0]);
    expect(url.origin).toBe(mock.url);
    expect(url.pathname).toBe('/auth/v1/authorize');
    expect(url.searchParams.get('provider')).toBe('google');
    expect(url.searchParams.get('redirect_to')).toBe(REDIRECT);
    expect(url.searchParams.get('code_challenge_method')).toBe('s256');
    expect(url.searchParams.get('code_challenge')).toMatch(/^[A-Za-z0-9_-]{20,}$/);
    expect(url.searchParams.get('scopes')).toBeNull(); // default scopes only (NFR-16)
    expect(storage.getItem(`${AUTH_STORAGE_KEY}-code-verifier`)).toBeTruthy();
    expect(storage.getItem(AUTH_STORAGE_KEY)).toBeNull();
  });

  it('exchangeCode turns the callback code into a session (u1), persisted under opb-auth; exactly one exchange', async () => {
    const { port, storage, navigated, events } = makePort();
    await port.signInWithGoogle(REDIRECT);
    const callback = await chooseAccount(navigated[0], 'u1');
    expect(callback.origin + callback.pathname).toBe('http://localhost:4174/one-percent-better/');
    expect(callback.searchParams.get('auth')).toBe('callback');
    const code = callback.searchParams.get('code')!;
    expect(code).toBeTruthy();

    const session = await port.exchangeCode(code);
    expect(session).toEqual({ userId: USERS.u1.id, email: USERS.u1.email, name: USERS.u1.name });
    expect(mock.state.exchanges).toBe(1);
    const stored = JSON.parse(storage.getItem(AUTH_STORAGE_KEY)!) as { access_token: string; refresh_token: string; user: { email: string } };
    expect(stored.access_token).toBeTruthy();
    expect(stored.user.email).toBe(USERS.u1.email);
    expect(storage.getItem(`${AUTH_STORAGE_KEY}-code-verifier`)).toBeNull();
    // Our own exchange does not echo a 'signed-in' event (the caller applies the result).
    expect(events.filter((e) => e.type === 'signed-in')).toHaveLength(0);
    expect(await port.accessToken()).toBe(stored.access_token);

    // A second client on the same storage sees the session without the network (FR-40).
    const again = makePort(storage);
    expect(await again.port.getSession()).toEqual(session);
    expect(mock.state.exchanges).toBe(1);
  });

  it('cancel at the provider → callback carries error=access_denied', async () => {
    const { port, navigated } = makePort();
    await port.signInWithGoogle(REDIRECT);
    const callback = await chooseAccount(navigated[0], 'cancel');
    expect(callback.searchParams.get('error')).toBe('access_denied');
    expect(callback.searchParams.get('code')).toBeNull();
  });

  it('exchangeCode without a stored verifier (other browser) or with a bogus code → throws', async () => {
    const { port } = makePort();
    await expect(port.exchangeCode('bogus')).rejects.toBeTruthy();
    const fresh = makePort();
    await fresh.port.signInWithGoogle(REDIRECT);
    await expect(fresh.port.exchangeCode('not-issued')).rejects.toBeTruthy();
    expect(await fresh.port.getSession()).toBeNull();
  });

  it('token endpoint returning 500 → exchange throws, no session stored', async () => {
    const { port, storage, navigated } = makePort();
    await port.signInWithGoogle(REDIRECT);
    const callback = await chooseAccount(navigated[0], 'u1');
    await fetch(`${mock.url}/__test/fail?path=token&status=500&times=1`);
    await expect(port.exchangeCode(callback.searchParams.get('code')!)).rejects.toBeTruthy();
    expect(storage.getItem(AUTH_STORAGE_KEY)).toBeNull();
  });

  it('revoked refresh token (400 invalid_grant) on an expired access token → session-expired event, getSession null', async () => {
    const { port, storage, navigated } = makePort();
    await fetch(`${mock.url}/__test/session?ttl=1&refresh=invalid_grant`);
    await port.signInWithGoogle(REDIRECT);
    const callback = await chooseAccount(navigated[0], 'u1');
    await port.exchangeCode(callback.searchParams.get('code')!);
    // The test setup freezes Date (also for the in-process mock): move it past the token lifetime.
    vi.setSystemTime(Date.now() + 2000);
    const later = makePort(storage);
    expect(await later.port.getSession()).toBeNull();
    expect(later.events).toContainEqual({ type: 'session-expired' });
    expect(storage.getItem(AUTH_STORAGE_KEY)).toBeNull();
  });

  it('signOut clears the stored session even when the logout request fails (offline)', async () => {
    const { port, storage, navigated, events } = makePort();
    await port.signInWithGoogle(REDIRECT);
    const callback = await chooseAccount(navigated[0], 'u1');
    await port.exchangeCode(callback.searchParams.get('code')!);
    storage.setItem(`${AUTH_STORAGE_KEY}-code-verifier`, 'stale');
    await fetch(`${mock.url}/__test/fail?path=logout&status=503&times=1`);
    await port.signOut();
    expect(storage.getItem(AUTH_STORAGE_KEY)).toBeNull();
    expect(storage.getItem(`${AUTH_STORAGE_KEY}-code-verifier`)).toBeNull();
    expect(events.filter((e) => e.type === 'session-expired')).toHaveLength(0);
    expect(await port.getSession()).toBeNull();
  });

  it('signOut online: scope local (never global), event signed-out (not session-expired), session gone', async () => {
    const { port, navigated, events, storage } = makePort();
    await port.signInWithGoogle(REDIRECT);
    const callback = await chooseAccount(navigated[0], 'u1');
    await port.exchangeCode(callback.searchParams.get('code')!);
    await port.signOut();
    // supabase-js 2.117 removes a `local`-scope session on the device without calling /logout
    // (other devices keep their sessions, FR-41). If a version does call it, it must not be `global`.
    const logout = mock.state.log.find((l) => l.path === '/auth/v1/logout' && l.method === 'POST');
    if (logout) expect(logout.query.scope).toBe('local');
    expect(events).toContainEqual({ type: 'signed-out' });
    expect(events).not.toContainEqual({ type: 'session-expired' });
    expect(storage.getItem(AUTH_STORAGE_KEY)).toBeNull();
  });

  it('getSession falls back to the stored session when the refresh fails with a network error (offline)', async () => {
    const { port, storage, navigated } = makePort();
    await fetch(`${mock.url}/__test/session?ttl=1`);
    await port.signInWithGoogle(REDIRECT);
    const callback = await chooseAccount(navigated[0], 'u1');
    await port.exchangeCode(callback.searchParams.get('code')!);
    vi.setSystemTime(Date.now() + 2000); // access token now past its lifetime → the SDK must refresh
    // A client whose fetch always fails (no network). The SDK retries network errors with backoff for up
    // to 30 s of wall-clock time; jumping the (frozen) clock on every attempt ends that loop immediately.
    const navigated2: string[] = [];
    const offline = createSupabaseAuthPort({ url: mock.url, key: 'sb_publishable_mock' }, storage, {
      navigate: (u) => navigated2.push(u),
      fetch: async () => {
        vi.setSystemTime(Date.now() + 31_000);
        throw new TypeError('Failed to fetch');
      },
    });
    const session = await offline.getSession();
    expect(session).toEqual({ userId: USERS.u1.id, email: USERS.u1.email, name: USERS.u1.name });
    expect(storage.getItem(AUTH_STORAGE_KEY)).toBeTruthy();
  });
});
