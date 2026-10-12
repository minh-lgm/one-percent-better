// Mock Supabase for E2E and integration tests (ARCHITECTURE §5.11, ADR-23).
// Plain Node `http`, no dependencies, in-memory state. It imitates exactly what the
// app needs from Supabase Auth (OAuth PKCE with a fake account chooser, token
// exchange, refresh, logout) plus `/__test/*` controls. REST (`/rest/v1/*`) is M7.
//
// Run standalone: `node e2e/mock-supabase/server.mjs [--port 54321]`
// In Vitest:      `const mock = await startMockSupabase(0)` (random port).
import { createHash, createHmac, randomBytes, randomUUID } from 'node:crypto';
import http from 'node:http';
import { pathToFileURL } from 'node:url';

export const USERS = {
  u1: { id: '00000000-0000-4000-8000-000000000001', email: 'minh.test@example.com', name: 'Minh Test' },
  u2: { id: '00000000-0000-4000-8000-000000000002', email: 'other.user@example.com', name: 'Other User' },
};

const JWT_SECRET = 'mock-supabase-jwt-secret-not-a-real-secret';
const DEFAULT_TOKEN_TTL_S = 3600;
const ALLOWED_REDIRECT = /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?\//;

const b64url = (buf) => Buffer.from(buf).toString('base64url');

function signJwt(payload) {
  const header = b64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const body = b64url(JSON.stringify(payload));
  const sig = createHmac('sha256', JWT_SECRET).update(`${header}.${body}`).digest('base64url');
  return `${header}.${body}.${sig}`;
}

function verifyJwt(token) {
  const parts = String(token ?? '').split('.');
  if (parts.length !== 3) return null;
  const sig = createHmac('sha256', JWT_SECRET).update(`${parts[0]}.${parts[1]}`).digest('base64url');
  if (sig !== parts[2]) return null;
  try {
    return JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
  } catch {
    return null;
  }
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}

function appendQuery(url, params) {
  const sep = url.includes('?') ? '&' : '?';
  return `${url}${sep}${new URLSearchParams(params).toString()}`;
}

/**
 * Creates the mock. `listen(port)` resolves with the bound port; `close()` stops it.
 *
 * State is partitioned by the request's `User-Agent` (or `?scope=` / `x-opb-scope` on
 * `/__test/*`): Playwright workers run in parallel against one mock, so each worker gets its
 * own browser UA (e2e/cloud/fixtures.ts) and its own flows, tokens, toggles and log.
 */
export function createMockSupabase() {
  const partitions = new Map();
  const partitionOf = (req, url) => {
    // Only Playwright workers (UA tagged `opb-e2e-…` by e2e/cloud/fixtures.ts) get their own partition;
    // everything else (in-process Vitest, manual demo, QC specs without the fixture) shares `default`.
    const ua = req.headers['user-agent'] ?? '';
    const key = url.searchParams.get('scope') || req.headers['x-opb-scope'] || /opb-e2e-[A-Za-z0-9_-]+/.exec(ua)?.[0] || 'default';
    let state = partitions.get(key);
    if (!state) {
      state = freshState();
      partitions.set(key, state);
    }
    return state;
  };

  function freshState() {
    return {
      log: [],
      flows: new Map(), // flowId → { challenge, method, redirectTo }
      codes: new Map(), // code → { challenge, userKey, used }
      refreshTokens: new Map(), // refresh_token → userKey
      tokenTtlS: DEFAULT_TOKEN_TTL_S,
      /** Fixed "now" (ms) for issued tokens; null = real clock. Lets E2E with a frozen page clock expire tokens. */
      now: null,
      refreshMode: 'ok', // 'ok' | 'invalid_grant'
      fail: [], // { path, status, times }
      rows: { goals: new Map(), entries: new Map(), settings: new Map() }, // per-user seeds (M7 REST)
      exchanges: 0,
      refreshes: 0,
    };
  }

  const nowS = (state) => Math.floor((state.now ?? Date.now()) / 1000);

  function issueSession(state, userKey) {
    const user = USERS[userKey];
    const iat = nowS(state);
    const exp = iat + state.tokenTtlS;
    const sessionId = randomUUID();
    const access_token = signJwt({
      iss: 'mock-supabase/auth/v1',
      sub: user.id,
      aud: 'authenticated',
      role: 'authenticated',
      email: user.email,
      exp,
      iat,
      session_id: sessionId,
      is_anonymous: false,
      app_metadata: { provider: 'google', providers: ['google'] },
      user_metadata: { email: user.email, email_verified: true, full_name: user.name, name: user.name },
    });
    const refresh_token = b64url(randomBytes(24));
    state.refreshTokens.set(refresh_token, userKey);
    return {
      access_token,
      token_type: 'bearer',
      expires_in: state.tokenTtlS,
      expires_at: exp,
      refresh_token,
      user: userJson(state, user),
    };
  }

  function userJson(state, user) {
    const t = new Date((state.now ?? Date.now()) - 86_400_000).toISOString();
    return {
      id: user.id,
      aud: 'authenticated',
      role: 'authenticated',
      email: user.email,
      email_confirmed_at: t,
      phone: '',
      confirmed_at: t,
      last_sign_in_at: new Date(state.now ?? Date.now()).toISOString(),
      app_metadata: { provider: 'google', providers: ['google'] },
      user_metadata: { email: user.email, email_verified: true, full_name: user.name, name: user.name },
      identities: [],
      created_at: t,
      updated_at: t,
      is_anonymous: false,
    };
  }

  function readBody(req) {
    return new Promise((resolve) => {
      const chunks = [];
      req.on('data', (c) => chunks.push(c));
      req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    });
  }

  function send(res, status, body, headers = {}) {
    const isText = typeof body === 'string';
    res.writeHead(status, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': '*',
      'Access-Control-Allow-Methods': 'GET,POST,PUT,PATCH,DELETE,OPTIONS',
      'Access-Control-Expose-Headers': '*',
      'Cache-Control': 'no-store',
      'Content-Type': isText ? 'text/html; charset=utf-8' : 'application/json',
      ...headers,
    });
    res.end(isText ? body : JSON.stringify(body ?? null));
  }

  function authError(res, status, error, description) {
    send(res, status, { error, error_description: description, code: status, msg: description, error_code: error });
  }

  function bearerUser(state, req) {
    const auth = req.headers.authorization ?? '';
    const token = auth.replace(/^Bearer\s+/i, '');
    const claims = verifyJwt(token);
    if (!claims || typeof claims.exp !== 'number' || claims.exp <= nowS(state)) return null;
    return Object.values(USERS).find((u) => u.id === claims.sub) ?? null;
  }

  /** `/__test/fail?path=token&status=500&times=1`: the next `times` requests whose path contains `path` fail. */
  function takeFailure(state, pathname) {
    const i = state.fail.findIndex((f) => pathname.includes(f.path) && f.times > 0);
    if (i === -1) return null;
    const rule = state.fail[i];
    rule.times -= 1;
    if (rule.times === 0) state.fail.splice(i, 1);
    return rule;
  }

  function chooserPage(flowId) {
    const button = (user, label) => `<form method="get" action="/auth/v1/__choose"><input type="hidden" name="flow" value="${escapeHtml(flowId)}"><button type="submit" name="user" value="${user}">${escapeHtml(label)}</button></form>`;
    return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Mock Google sign-in</title>
<style>body{font:16px system-ui;margin:40px;max-width:420px}button{display:block;width:100%;margin:8px 0;padding:12px;font:inherit}</style></head>
<body><h1>Choose an account (mock)</h1><p>This page stands in for Google. Nothing leaves your machine.</p>
${button('u1', USERS.u1.name)}${button('u2', USERS.u2.name)}${button('cancel', 'Cancel')}</body></html>`;
  }

  async function handle(req, res) {
    const url = new URL(req.url, 'http://mock');
    const { pathname } = url;
    const state = partitionOf(req, url);
    const q = Object.fromEntries(url.searchParams.entries());
    const rawBody = req.method === 'POST' || req.method === 'PATCH' || req.method === 'PUT' ? await readBody(req) : '';
    let body = null;
    if (rawBody) {
      try {
        body = JSON.parse(rawBody);
      } catch {
        body = rawBody;
      }
    }
    if (!pathname.startsWith('/__test')) {
      state.log.push({ method: req.method, path: pathname, query: q, body: body && typeof body === 'object' ? Object.keys(body) : null, at: Date.now() });
    }

    if (req.method === 'OPTIONS') return send(res, 204, '');

    const failure = takeFailure(state, pathname);
    if (failure) return authError(res, failure.status, 'server_error', `forced failure (${failure.status})`);

    // ---- Auth ----
    if (pathname === '/auth/v1/health') return send(res, 200, { name: 'mock-supabase', version: 'mock', ok: true });

    if (pathname === '/auth/v1/authorize' && req.method === 'GET') {
      if (q.provider !== 'google') return send(res, 400, `<p>unsupported provider: ${escapeHtml(q.provider)}</p>`);
      if (q.code_challenge_method !== 's256' || !q.code_challenge) return send(res, 400, '<p>PKCE (S256) is required</p>');
      if (!q.redirect_to || !ALLOWED_REDIRECT.test(q.redirect_to)) return send(res, 400, `<p>redirect_to not allowed: ${escapeHtml(q.redirect_to ?? '')}</p>`);
      const flowId = randomUUID();
      state.flows.set(flowId, { challenge: q.code_challenge, redirectTo: q.redirect_to, scopes: q.scopes ?? '' });
      return send(res, 200, chooserPage(flowId));
    }

    if (pathname === '/auth/v1/__choose' && req.method === 'GET') {
      const flow = state.flows.get(q.flow);
      if (!flow) return send(res, 400, '<p>unknown flow</p>');
      state.flows.delete(q.flow);
      let location;
      if (q.user === 'cancel') {
        location = appendQuery(flow.redirectTo, { error: 'access_denied', error_code: 'user_cancelled', error_description: 'The user cancelled the sign-in' });
      } else if (USERS[q.user]) {
        const code = randomUUID();
        state.codes.set(code, { challenge: flow.challenge, userKey: q.user, used: false });
        location = appendQuery(flow.redirectTo, { code });
      } else {
        return send(res, 400, '<p>unknown user</p>');
      }
      res.writeHead(302, { Location: location, 'Cache-Control': 'no-store' });
      return res.end();
    }

    if (pathname === '/auth/v1/token' && req.method === 'POST') {
      const grant = q.grant_type;
      if (grant === 'pkce') {
        state.exchanges += 1;
        const entry = state.codes.get(body?.auth_code);
        if (!entry || entry.used) return authError(res, 400, 'invalid_grant', 'invalid or expired auth code');
        const expected = createHash('sha256').update(String(body?.code_verifier ?? '')).digest('base64url');
        if (expected !== entry.challenge) return authError(res, 400, 'invalid_grant', 'code verifier does not match');
        entry.used = true;
        return send(res, 200, issueSession(state, entry.userKey));
      }
      if (grant === 'refresh_token') {
        state.refreshes += 1;
        if (state.refreshMode === 'invalid_grant') return authError(res, 400, 'invalid_grant', 'Invalid Refresh Token: Already Used');
        const userKey = state.refreshTokens.get(body?.refresh_token);
        if (!userKey) return authError(res, 400, 'invalid_grant', 'Invalid Refresh Token: Refresh Token Not Found');
        state.refreshTokens.delete(body.refresh_token);
        return send(res, 200, issueSession(state, userKey));
      }
      return authError(res, 400, 'unsupported_grant_type', `unsupported grant_type ${grant}`);
    }

    if (pathname === '/auth/v1/user' && req.method === 'GET') {
      const user = bearerUser(state, req);
      if (!user) return authError(res, 401, 'invalid_token', 'invalid JWT');
      return send(res, 200, userJson(state, user));
    }

    if (pathname === '/auth/v1/logout' && req.method === 'POST') {
      if (!bearerUser(state, req)) return authError(res, 401, 'invalid_token', 'invalid JWT');
      return send(res, 204, '');
    }

    // ---- Test controls ----
    if (pathname === '/__test/reset') {
      Object.assign(state, freshState());
      return send(res, 200, { ok: true, partitions: partitions.size });
    }
    if (pathname === '/__test/log') return send(res, 200, { log: state.log, exchanges: state.exchanges, refreshes: state.refreshes });
    if (pathname === '/__test/fail') {
      state.fail.push({ path: q.path ?? 'token', status: Number(q.status ?? 500), times: Number(q.times ?? 1) });
      return send(res, 200, { ok: true, fail: state.fail });
    }
    if (pathname === '/__test/session') {
      if (q.ttl !== undefined) state.tokenTtlS = Number(q.ttl);
      if (q.refresh !== undefined) state.refreshMode = q.refresh === 'invalid_grant' ? 'invalid_grant' : 'ok';
      if (q.now !== undefined) state.now = q.now === '' ? null : Number(q.now);
      return send(res, 200, { ok: true, tokenTtlS: state.tokenTtlS, refreshMode: state.refreshMode, now: state.now });
    }
    if (pathname === '/__test/seed' && req.method === 'POST') {
      const userKey = body?.user ?? 'u1';
      for (const table of ['goals', 'entries', 'settings']) {
        if (!Array.isArray(body?.[table])) continue;
        const map = state.rows[table].get(userKey) ?? new Map();
        for (const row of body[table]) map.set(row.id ?? userKey, row);
        state.rows[table].set(userKey, map);
      }
      return send(res, 200, { ok: true });
    }
    if (pathname === '/__test/rows') {
      const userKey = q.user ?? 'u1';
      const out = {};
      for (const table of ['goals', 'entries', 'settings']) out[table] = [...(state.rows[table].get(userKey)?.values() ?? [])];
      return send(res, 200, out);
    }

    return send(res, 404, { message: `mock-supabase: no route for ${req.method} ${pathname}` });
  }

  const server = http.createServer((req, res) => {
    handle(req, res).catch((e) => {
      send(res, 500, { message: String(e?.message ?? e) });
    });
  });

  return {
    server,
    /** State of the default partition (in-process tests use one plain `fetch` UA). */
    get state() {
      return partitionOf({ headers: {} }, new URL('http://mock/'));
    },
    partitions,
    listen(port = 54321, host = '127.0.0.1') {
      return new Promise((resolve, reject) => {
        server.once('error', reject);
        server.listen(port, host, () => {
          const address = server.address();
          const bound = typeof address === 'object' && address ? address.port : port;
          resolve({ port: bound, url: `http://${host}:${bound}` });
        });
      });
    },
    close() {
      return new Promise((resolve) => {
        server.closeAllConnections?.();
        server.close(() => resolve());
      });
    },
  };
}

/** Convenience for tests: start on `port` (0 = random) and return `{ url, port, state, close }`. */
export async function startMockSupabase(port = 0) {
  const mock = createMockSupabase();
  const { url, port: bound } = await mock.listen(port);
  return { url, port: bound, state: mock.state, close: () => mock.close() };
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  const portArg = process.argv.indexOf('--port');
  const port = portArg !== -1 ? Number(process.argv[portArg + 1]) : Number(process.env.MOCK_SUPABASE_PORT ?? 54321);
  const mock = createMockSupabase();
  mock
    .listen(port)
    .then(({ url }) => console.log(`[mock-supabase] listening on ${url} (users: ${USERS.u1.email}, ${USERS.u2.email})`))
    .catch((e) => {
      console.error(`[mock-supabase] cannot listen on ${port}: ${e.message}`);
      process.exit(1);
    });
}
