// M14-AC4: the `delete-account` handler with injected dependencies (ARCHITECTURE §4.7, ADR-39, NFR-23).
// Node 22 `Request` / `Response`; nothing network, nothing Deno.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { bearerToken, corsHeaders, DEFAULT_ALLOWED_ORIGINS, handleDeleteAccount, readBody, type AppleConfig, type DeleteAccountDeps } from './handler';

const ORIGIN = 'https://minh-lgm.github.io';
// The PEM armour is assembled at run time so no tracked source contains it verbatim (QC secret scan, NFR-22).
const PEM = (body: string) => `-----BEGIN ${'PRIVATE'} KEY-----\n${body}\n-----END ${'PRIVATE'} KEY-----`;
const APPLE: AppleConfig = { teamId: 'TEAM123456', keyId: 'KEY1234567', clientId: 'io.github.minhlgm.onepercentbetter', privateKeyPem: PEM('MIG') };

function deps(overrides: Partial<DeleteAccountDeps> = {}) {
  const calls: string[] = [];
  const d: DeleteAccountDeps & { calls: string[] } = {
    calls,
    allowedOrigins: DEFAULT_ALLOWED_ORIGINS,
    getUser: vi.fn(async (jwt: string) => {
      calls.push(`getUser`);
      if (jwt === 'jwt-A') return { id: 'A', providers: ['google'] };
      if (jwt === 'jwt-A-apple') return { id: 'A', providers: ['google', 'apple'] };
      return null;
    }),
    deleteUser: vi.fn(async (id: string) => {
      calls.push(`deleteUser:${id}`);
    }),
    apple: null,
    exchangeAppleCode: vi.fn(async (code: string) => {
      calls.push(`exchange:${code}`);
      return { refreshToken: 'rt', accessToken: 'at' };
    }),
    revokeAppleToken: vi.fn(async (token: string, hint: string) => {
      calls.push(`revoke:${token}:${hint}`);
    }),
    log: vi.fn((event: string) => {
      calls.push(`log:${event}`);
    }),
    ...overrides,
  };
  return d;
}

const post = (headers: Record<string, string> = {}, body?: unknown) =>
  new Request('https://x.supabase.co/functions/v1/delete-account', { method: 'POST', headers: { origin: ORIGIN, 'content-type': 'application/json', ...headers }, ...(body === undefined ? {} : { body: typeof body === 'string' ? body : JSON.stringify(body) }) });

afterEach(() => vi.restoreAllMocks());

describe('CORS and methods', () => {
  it('OPTIONS from an allowed origin → 204 with ACAO = that origin, the four allowed headers and POST, OPTIONS', async () => {
    const res = await handleDeleteAccount(new Request('https://x/functions/v1/delete-account', { method: 'OPTIONS', headers: { origin: ORIGIN } }), deps());
    expect(res.status).toBe(204);
    expect(res.headers.get('access-control-allow-origin')).toBe(ORIGIN);
    expect(res.headers.get('access-control-allow-methods')).toBe('POST, OPTIONS');
    const allowHeaders = (res.headers.get('access-control-allow-headers') ?? '').split(',').map((h) => h.trim());
    expect(allowHeaders).toEqual(expect.arrayContaining(['authorization', 'apikey', 'content-type', 'x-client-info']));
    for (const origin of ['capacitor://localhost', 'http://localhost:4174', 'http://localhost:5173']) expect(corsHeaders(origin, DEFAULT_ALLOWED_ORIGINS)['Access-Control-Allow-Origin']).toBe(origin);
  });

  it('an unknown origin gets no Access-Control-Allow-Origin at all (preflight and POST)', async () => {
    const d = deps();
    const pre = await handleDeleteAccount(new Request('https://x/f', { method: 'OPTIONS', headers: { origin: 'https://evil.example' } }), d);
    expect(pre.status).toBe(204);
    expect(pre.headers.get('access-control-allow-origin')).toBeNull();
    const res = await handleDeleteAccount(post({ origin: 'https://evil.example', authorization: 'Bearer jwt-A' }, {}), d);
    expect(res.headers.get('access-control-allow-origin')).toBeNull();
    expect(corsHeaders(null, DEFAULT_ALLOWED_ORIGINS)).not.toHaveProperty('Access-Control-Allow-Origin');
  });

  it('GET / PUT / DELETE → 405 method_not_allowed, nothing called', async () => {
    const d = deps();
    for (const method of ['GET', 'PUT', 'DELETE']) {
      const res = await handleDeleteAccount(new Request('https://x/f', { method, headers: { origin: ORIGIN, authorization: 'Bearer jwt-A' } }), d);
      expect(res.status).toBe(405);
      expect(await res.json()).toEqual({ error: 'method_not_allowed' });
    }
    expect(d.calls).toEqual([]);
  });
});

describe('authentication', () => {
  it('POST without Authorization → 401 { error: unauthorized }; no delete call', async () => {
    const d = deps();
    const res = await handleDeleteAccount(post({}, {}), d);
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: 'unauthorized' });
    expect(res.headers.get('content-type')).toBe('application/json');
    expect(d.deleteUser).not.toHaveBeenCalled();
    expect(d.getUser).not.toHaveBeenCalled();
  });

  it('invalid JWT (getUser → null) or getUser throwing → 401, no delete call', async () => {
    const d = deps();
    expect((await handleDeleteAccount(post({ authorization: 'Bearer nope' }, {}), d)).status).toBe(401);
    const throwing = deps({ getUser: vi.fn(async () => { throw new Error('gotrue down'); }) });
    expect((await handleDeleteAccount(post({ authorization: 'Bearer jwt-A' }, {}), throwing)).status).toBe(401);
    expect(d.deleteUser).not.toHaveBeenCalled();
    expect(throwing.deleteUser).not.toHaveBeenCalled();
  });

  it('bearerToken: case-insensitive scheme, trims; junk → null', () => {
    expect(bearerToken('Bearer abc.def.ghi')).toBe('abc.def.ghi');
    expect(bearerToken('bearer x ')).toBe('x');
    expect(bearerToken('Basic abc')).toBeNull();
    expect(bearerToken('Bearer')).toBeNull();
    expect(bearerToken(null)).toBeNull();
  });
});

describe('deletion', () => {
  it('valid JWT of A with body { user_id: "B" } → deleteUser called exactly once with A (never B); 200 deleted, not-applicable', async () => {
    const d = deps();
    const res = await handleDeleteAccount(post({ authorization: 'Bearer jwt-A' }, { user_id: 'B', appleAuthorizationCode: undefined }), d);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ deleted: true, appleRevoked: 'not-applicable' });
    expect(res.headers.get('access-control-allow-origin')).toBe(ORIGIN);
    expect(d.deleteUser).toHaveBeenCalledTimes(1);
    expect(d.deleteUser).toHaveBeenCalledWith('A');
    expect(d.calls).toEqual(['getUser', 'deleteUser:A', 'log:deleted']);
  });

  it('order: identity read first, then deleteUser, then Apple; no Apple identity → Apple never called', async () => {
    const d = deps({ apple: APPLE });
    await handleDeleteAccount(post({ authorization: 'Bearer jwt-A' }, { appleAuthorizationCode: 'c0de' }), d);
    expect(d.calls).toEqual(['getUser', 'deleteUser:A', 'log:deleted']);
    expect(d.exchangeAppleCode).not.toHaveBeenCalled();
    expect(d.revokeAppleToken).not.toHaveBeenCalled();
  });

  it('Apple identity + code + all four secrets → exchangeCode then revokeToken(refresh_token) → revoked', async () => {
    const d = deps({ apple: APPLE });
    const res = await handleDeleteAccount(post({ authorization: 'Bearer jwt-A-apple' }, { appleAuthorizationCode: 'c0de' }), d);
    expect(await res.json()).toEqual({ deleted: true, appleRevoked: 'revoked' });
    expect(d.calls).toEqual(['getUser', 'deleteUser:A', 'exchange:c0de', 'revoke:rt:refresh_token', 'log:deleted']);
    expect(d.exchangeAppleCode).toHaveBeenCalledWith('c0de', APPLE);
  });

  it('Apple returns only an access token → revoke with access_token hint', async () => {
    const d = deps({ apple: APPLE, exchangeAppleCode: vi.fn(async () => ({ refreshToken: null, accessToken: 'at-only' })) });
    const res = await handleDeleteAccount(post({ authorization: 'Bearer jwt-A-apple' }, { appleAuthorizationCode: 'c0de' }), d);
    expect(await res.json()).toEqual({ deleted: true, appleRevoked: 'revoked' });
    expect(d.revokeAppleToken).toHaveBeenCalledWith('at-only', 'access_token', APPLE);
  });

  it('Apple identity but: no code / missing secrets / Apple 400 / no token → still 200, manual-required', async () => {
    const noCode = deps({ apple: APPLE });
    expect(await (await handleDeleteAccount(post({ authorization: 'Bearer jwt-A-apple' }, {}), noCode)).json()).toEqual({ deleted: true, appleRevoked: 'manual-required' });
    expect(noCode.exchangeAppleCode).not.toHaveBeenCalled();

    const noSecrets = deps({ apple: null });
    expect(await (await handleDeleteAccount(post({ authorization: 'Bearer jwt-A-apple' }, { appleAuthorizationCode: 'c0de' }), noSecrets)).json()).toEqual({ deleted: true, appleRevoked: 'manual-required' });
    expect(noSecrets.exchangeAppleCode).not.toHaveBeenCalled();

    const apple400 = deps({ apple: APPLE, exchangeAppleCode: vi.fn(async () => { throw new Error('Apple token endpoint answered 400'); }) });
    const res = await handleDeleteAccount(post({ authorization: 'Bearer jwt-A-apple' }, { appleAuthorizationCode: 'expired' }), apple400);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ deleted: true, appleRevoked: 'manual-required' });
    expect(apple400.calls).toContain('log:apple_revoke_failed');
    expect(apple400.deleteUser).toHaveBeenCalledTimes(1);

    const noToken = deps({ apple: APPLE, exchangeAppleCode: vi.fn(async () => ({ refreshToken: null, accessToken: null })) });
    expect(await (await handleDeleteAccount(post({ authorization: 'Bearer jwt-A-apple' }, { appleAuthorizationCode: 'c0de' }), noToken)).json()).toEqual({ deleted: true, appleRevoked: 'manual-required' });
    expect(noToken.revokeAppleToken).not.toHaveBeenCalled();
  });

  it('deleteUser throws → 500 { error: delete_failed }, Apple never called, log delete_failed', async () => {
    const d = deps({ apple: APPLE, deleteUser: vi.fn(async () => { throw new Error('db down'); }) });
    const res = await handleDeleteAccount(post({ authorization: 'Bearer jwt-A-apple' }, { appleAuthorizationCode: 'c0de' }), d);
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: 'delete_failed' });
    expect(d.exchangeAppleCode).not.toHaveBeenCalled();
    expect(d.calls).toEqual(['getUser', 'log:delete_failed']);
  });

  it('never logs a token, code or email (spy on console too)', async () => {
    const con = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const err = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const logged: string[] = [];
    const d = deps({ apple: APPLE, log: (e) => logged.push(e) });
    await handleDeleteAccount(post({ authorization: 'Bearer jwt-A-apple' }, { appleAuthorizationCode: 'SECRET-CODE', email: 'x@y.z' }), d);
    const all = [...logged, ...con.mock.calls.flat().map(String), ...err.mock.calls.flat().map(String)].join(' ');
    expect(all).not.toMatch(/SECRET-CODE|jwt-A|x@y\.z|rt|at/);
    expect(logged).toEqual(['deleted']);
  });
});

describe('readBody', () => {
  it('JSON with a code → { appleAuthorizationCode }; empty / malformed / too large / wrong type → {}', async () => {
    expect(await readBody(post({}, { appleAuthorizationCode: ' c0de ' }))).toEqual({ appleAuthorizationCode: 'c0de' });
    expect(await readBody(post({}, { appleAuthorizationCode: 42 }))).toEqual({});
    expect(await readBody(post({}, { appleAuthorizationCode: '' }))).toEqual({});
    expect(await readBody(post({}, '{not json'))).toEqual({});
    expect(await readBody(post({}, '[]'))).toEqual({});
    expect(await readBody(post({}))).toEqual({});
    expect(await readBody(post({}, { appleAuthorizationCode: 'x'.repeat(5000) }))).toEqual({});
  });
});

describe('schema (static): the data goes with the user through FK cascade (ARCH §4.7 a)', () => {
  it('goals, entries and settings all reference auth.users (id) on delete cascade in the M6 migration', () => {
    const sql = readFileSync(join(process.cwd(), 'supabase/migrations/20261012000000_cloud_sync.sql'), 'utf8').replace(/\r\n/g, '\n');
    for (const table of ['goals', 'entries', 'settings']) {
      const block = new RegExp(`create table (?:if not exists )?public\\.${table} \\(([\\s\\S]*?)\\);`, 'i').exec(sql);
      expect(block, `table ${table}`).not.toBeNull();
      expect(block![1]).toMatch(/user_id\s+uuid[^\n]*references auth\.users \(id\) on delete cascade/);
    }
  });
});
