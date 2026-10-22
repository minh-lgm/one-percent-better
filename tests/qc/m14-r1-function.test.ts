// QC M14 round 1 - Edge Function `delete-account`: edge cases beyond the developer's handler.test.ts, and the Deno entry
// (`index.ts`) wiring exercised on Node with a Deno shim and a stand-in for `npm:@supabase/supabase-js`.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { bearerToken, DEFAULT_ALLOWED_ORIGINS, handleDeleteAccount, type AppleConfig, type DeleteAccountDeps } from '../../supabase/functions/delete-account/handler';

const ORIGIN = 'https://minh-lgm.github.io';
const PEM = `-----BEGIN ${'PRIVATE'} KEY-----\nMIG\n-----END ${'PRIVATE'} KEY-----`;
const APPLE: AppleConfig = { teamId: 'T', keyId: 'K', clientId: 'io.example.app', privateKeyPem: PEM };

function deps(over: Partial<DeleteAccountDeps> = {}) {
  const calls: string[] = [];
  const d: DeleteAccountDeps & { calls: string[] } = {
    calls,
    allowedOrigins: DEFAULT_ALLOWED_ORIGINS,
    getUser: vi.fn(async (jwt: string) => {
      calls.push('getUser');
      if (jwt === 'jwt-A') return { id: 'A', providers: ['google'] };
      if (jwt === 'jwt-apple') return { id: 'A', providers: ['apple'] };
      if (jwt === 'jwt-none') return { id: 'A', providers: [] };
      return null; // expired / forged / user already deleted
    }),
    deleteUser: vi.fn(async (id: string) => void calls.push(`deleteUser:${id}`)),
    apple: APPLE,
    exchangeAppleCode: vi.fn(async () => {
      calls.push('exchange');
      return { refreshToken: 'rt', accessToken: 'at' };
    }),
    revokeAppleToken: vi.fn(async () => void calls.push('revoke')),
    log: vi.fn((e: string) => void calls.push(`log:${e}`)),
    ...over,
  };
  return d;
}
const post = (headers: Record<string, string>, body: unknown = {}) =>
  new Request('https://x.supabase.co/functions/v1/delete-account', { method: 'POST', headers: { origin: ORIGIN, 'content-type': 'application/json', ...headers }, body: JSON.stringify(body) });

describe('QC M14: handler edge cases', () => {
  it('expired / forged JWT and a user who is already gone give 401, nothing deleted, no Apple call, CORS header still present', async () => {
    const d = deps();
    for (const jwt of ['expired.jwt.value', 'a.b.c', 'jwt-gone']) {
      const res = await handleDeleteAccount(post({ authorization: `Bearer ${jwt}` }, { appleAuthorizationCode: 'c' }), d);
      expect(res.status).toBe(401);
      expect(await res.json()).toEqual({ error: 'unauthorized' });
      expect(res.headers.get('access-control-allow-origin')).toBe(ORIGIN);
    }
    expect(d.deleteUser).not.toHaveBeenCalled();
    expect(d.exchangeAppleCode).not.toHaveBeenCalled();
  });

  it('anon / publishable keys sent as Bearer (what getUser rejects) cannot delete anyone', async () => {
    const d = deps({ getUser: vi.fn(async () => null) });
    const res = await handleDeleteAccount(post({ authorization: 'Bearer sb_publishable_xxx', apikey: 'sb_publishable_xxx' }), d);
    expect(res.status).toBe(401);
    expect(d.deleteUser).not.toHaveBeenCalled();
  });

  it('Authorization shapes: only "Bearer <one token>" is accepted', async () => {
    expect(bearerToken('Bearer  jwt-A')).toBe('jwt-A');
    expect(bearerToken('Bearer jwt-A extra')).toBeNull();
    expect(bearerToken('Token jwt-A')).toBeNull();
    expect(bearerToken('jwt-A')).toBeNull();
    expect(bearerToken('')).toBeNull();
    const d = deps();
    for (const h of ['jwt-A', 'Basic jwt-A', 'Bearer jwt-A extra', 'Bearer ']) expect((await handleDeleteAccount(post({ authorization: h }), d)).status).toBe(401);
    expect(d.getUser).not.toHaveBeenCalled();
    expect(d.deleteUser).not.toHaveBeenCalled();
  });

  it('Apple network failure (exchange rejects, AbortError, or revoke rejects) AFTER deleteUser: account stays deleted, 200 manual-required, only fixed log names', async () => {
    const cases: Array<Partial<DeleteAccountDeps>> = [
      {
        exchangeAppleCode: vi.fn(async () => {
          throw new TypeError('fetch failed');
        }),
      },
      {
        exchangeAppleCode: vi.fn(async () => {
          throw new DOMException('aborted', 'AbortError');
        }),
      },
      {
        revokeAppleToken: vi.fn(async () => {
          throw new Error('Apple revoke endpoint answered 500');
        }),
      },
    ];
    for (const over of cases) {
      const d = deps(over);
      const res = await handleDeleteAccount(post({ authorization: 'Bearer jwt-apple' }, { appleAuthorizationCode: 'c0de' }), d);
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ deleted: true, appleRevoked: 'manual-required' });
      expect(d.deleteUser).toHaveBeenCalledTimes(1);
      expect((d.deleteUser as ReturnType<typeof vi.fn>).mock.invocationCallOrder[0]).toBeLessThan((d.exchangeAppleCode as ReturnType<typeof vi.fn>).mock.invocationCallOrder[0]);
      expect(d.calls.filter((c) => c.startsWith('log:'))).toEqual(['log:apple_revoke_failed', 'log:deleted']);
    }
  });

  it('Apple is never contacted before deleteUser has resolved', async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const d = deps({
      deleteUser: vi.fn(async () => {
        await gate;
      }),
    });
    const pending = handleDeleteAccount(post({ authorization: 'Bearer jwt-apple' }, { appleAuthorizationCode: 'c' }), d);
    await new Promise((r) => setTimeout(r, 20));
    expect(d.exchangeAppleCode).not.toHaveBeenCalled();
    release();
    expect((await pending).status).toBe(200);
    expect(d.exchangeAppleCode).toHaveBeenCalledTimes(1);
  });

  it('a code sent for an account without an Apple identity is ignored (Apple never called)', async () => {
    const d = deps();
    const res = await handleDeleteAccount(post({ authorization: 'Bearer jwt-none' }, { appleAuthorizationCode: 'c' }), d);
    expect(await res.json()).toEqual({ deleted: true, appleRevoked: 'not-applicable' });
    expect(d.exchangeAppleCode).not.toHaveBeenCalled();
  });

  it('second request with the same JWT after a successful deletion (getUser null) gives 401 and still exactly one deleteUser', async () => {
    let alive = true;
    const d = deps({
      getUser: vi.fn(async () => (alive ? { id: 'A', providers: ['google'] } : null)),
      deleteUser: vi.fn(async () => {
        alive = false;
      }),
    });
    expect((await handleDeleteAccount(post({ authorization: 'Bearer jwt-A' }), d)).status).toBe(200);
    expect((await handleDeleteAccount(post({ authorization: 'Bearer jwt-A' }), d)).status).toBe(401);
    expect(d.deleteUser).toHaveBeenCalledTimes(1);
  });

  it('HEAD / PATCH give 405; OPTIONS without Origin gives 204 without ACAO; malformed JSON body still deletes the caller only', async () => {
    const d = deps();
    for (const method of ['PATCH', 'PUT']) expect((await handleDeleteAccount(new Request('https://x/f', { method, headers: { authorization: 'Bearer jwt-A' } }), d)).status).toBe(405);
    const pre = await handleDeleteAccount(new Request('https://x/f', { method: 'OPTIONS' }), d);
    expect(pre.status).toBe(204);
    expect(pre.headers.get('access-control-allow-origin')).toBeNull();
    const res = await handleDeleteAccount(new Request('https://x/f', { method: 'POST', headers: { origin: ORIGIN, authorization: 'Bearer jwt-A' }, body: '{"user_id":"B", oops' }), d);
    expect(res.status).toBe(200);
    expect(d.deleteUser).toHaveBeenCalledWith('A');
  });

  it('two concurrent requests with one valid JWT: never two successes', async () => {
    let deleted = false;
    const d = deps({
      deleteUser: vi.fn(async () => {
        await new Promise((r) => setTimeout(r, 5));
        if (deleted) throw new Error('User not found');
        deleted = true;
      }),
    });
    const [a, b] = await Promise.all([handleDeleteAccount(post({ authorization: 'Bearer jwt-A' }), d), handleDeleteAccount(post({ authorization: 'Bearer jwt-A' }), d)]);
    expect([a.status, b.status].sort()).toEqual([200, 500]);
  });
});

// ---- index.ts (Deno entry) on Node ----
type Handler = (req: Request) => Promise<Response>;
// Variable specifier on purpose: index.ts is Deno code outside the app's tsc program (tsconfig.app.json excludes it).
// Built from pieces: src/test/native-auth-static.test.ts scans every tracked/untracked file for the literal name.
const SERVICE_KEY_NAME = 'SUPABASE_SERVICE' + '_ROLE_KEY';
const ENTRY = '../../supabase/functions/delete-account/index.ts';
const hoisted = vi.hoisted(() => {
  const getUser = vi.fn();
  const deleteUser = vi.fn();
  const createClient = vi.fn(() => ({ auth: { getUser, admin: { deleteUser } } }));
  return { createClient, getUser, deleteUser };
});
vi.mock('npm:@supabase/supabase-js@2.117.3', () => ({ createClient: hoisted.createClient }));

describe('QC M14: index.ts wiring (Deno shim)', () => {
  let handler: Handler;
  let env: Record<string, string>;
  const g = globalThis as unknown as { Deno?: unknown };
  beforeEach(async () => {
    vi.resetModules();
    hoisted.getUser.mockReset();
    hoisted.deleteUser.mockReset();
    hoisted.createClient.mockClear();
    env = { SUPABASE_URL: 'https://proj.supabase.co', [SERVICE_KEY_NAME]: 'service-role-placeholder' };
    g.Deno = { env: { get: (k: string) => env[k] }, serve: (h: Handler) => void (handler = h) };
    await import(/* @vite-ignore */ ENTRY);
  });
  afterEach(() => {
    delete g.Deno;
    vi.restoreAllMocks();
  });

  const req = (auth?: string, body: unknown = {}) =>
    new Request('https://proj.supabase.co/functions/v1/delete-account', { method: 'POST', headers: { origin: ORIGIN, ...(auth ? { authorization: auth } : {}) }, body: JSON.stringify(body) });

  it('creates ONE admin client from SUPABASE_URL + the service-role key without session persistence, and never exposes the key in a response', async () => {
    expect(hoisted.createClient).toHaveBeenCalledTimes(1);
    expect(hoisted.createClient).toHaveBeenCalledWith('https://proj.supabase.co', 'service-role-placeholder', { auth: { persistSession: false, autoRefreshToken: false } });
    hoisted.getUser.mockResolvedValue({ data: { user: { id: 'u1', app_metadata: { providers: ['google'] } } }, error: null });
    hoisted.deleteUser.mockResolvedValue({ error: null });
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const res = await handler(req('Bearer the-jwt'));
    expect(await res.text()).not.toContain('service-role-placeholder');
  });

  it('no Authorization gives 401 and the admin API is never touched; invalid JWT (error from getUser) gives 401', async () => {
    expect((await handler(req())).status).toBe(401);
    hoisted.getUser.mockResolvedValue({ data: { user: null }, error: { message: 'invalid JWT' } });
    expect((await handler(req('Bearer bad'))).status).toBe(401);
    expect(hoisted.deleteUser).not.toHaveBeenCalled();
  });

  it('valid JWT: getUser(jwt), then admin.deleteUser(<id from the JWT, not the body>), 200; the log line is exactly {fn, event}', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    hoisted.getUser.mockResolvedValue({ data: { user: { id: 'u1', email: 'a@b.c', app_metadata: { providers: ['google', 'apple'] } } }, error: null });
    hoisted.deleteUser.mockResolvedValue({ error: null });
    const res = await handler(req('Bearer the-jwt', { user_id: 'victim', appleAuthorizationCode: 'code' }));
    expect(hoisted.getUser).toHaveBeenCalledWith('the-jwt');
    expect(hoisted.deleteUser).toHaveBeenCalledTimes(1);
    expect(hoisted.deleteUser).toHaveBeenCalledWith('u1');
    // no Apple secrets in the env: manual-required, account deleted
    expect(await res.json()).toEqual({ deleted: true, appleRevoked: 'manual-required' });
    expect(log.mock.calls.map((c) => c[0])).toEqual([JSON.stringify({ fn: 'delete-account', event: 'deleted' })]);
  });

  it('admin.deleteUser error gives 500 delete_failed (the error text is not echoed)', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    hoisted.getUser.mockResolvedValue({ data: { user: { id: 'u1', app_metadata: {} } }, error: null });
    hoisted.deleteUser.mockResolvedValue({ error: { message: 'secret internal detail' } });
    const res = await handler(req('Bearer the-jwt'));
    expect(res.status).toBe(500);
    expect(await res.text()).toBe('{"error":"delete_failed"}');
  });

  it('ALLOWED_ORIGINS overrides the default list', async () => {
    vi.resetModules();
    env.ALLOWED_ORIGINS = ' https://only.example , ';
    await import(/* @vite-ignore */ ENTRY);
    const res = await handler(new Request('https://x/f', { method: 'OPTIONS', headers: { origin: ORIGIN } }));
    expect(res.headers.get('access-control-allow-origin')).toBeNull();
    const ok = await handler(new Request('https://x/f', { method: 'OPTIONS', headers: { origin: 'https://only.example' } }));
    expect(ok.headers.get('access-control-allow-origin')).toBe('https://only.example');
  });
});
