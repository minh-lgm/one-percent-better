// Mock Supabase for E2E and integration tests (ARCHITECTURE §5.11, ADR-23).
// Plain Node `http`, no dependencies, in-memory state. It imitates exactly what the
// app needs from Supabase Auth (OAuth PKCE with a fake account chooser, token
// exchange, refresh, logout), the PostgREST subset used by `SupabaseRemoteStore`
// (M7: upsert with merge-duplicates, select with `in`/`or`/`eq`/`order`/`limit`,
// per-user rows like RLS, last-write-wins like the SQL triggers), plus `/__test/*` controls.
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
const REST_TABLES = ['goals', 'entries', 'settings'];

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

/** Postgres `timestamptz` comparison: as instants. Unparsable → -Infinity. */
const ms = (v) => {
  const t = Date.parse(String(v ?? ''));
  return Number.isNaN(t) ? Number.NEGATIVE_INFINITY : t;
};

const userKeyOf = (id) => Object.keys(USERS).find((k) => USERS[k].id === id) ?? null;

/** Domain (camelCase) → cloud row (snake_case); accepts rows already in snake_case. */
function toSnakeGoal(r) {
  if ('target_type' in r || 'start_date' in r) return { ...r };
  return {
    id: r.id,
    name: r.name,
    why: r.why ?? '',
    target_type: r.targetType,
    target_minutes: r.targetMinutes,
    start_date: r.startDate,
    end_date: r.endDate,
    archived: r.archived ?? false,
    created_at: r.createdAt,
    updated_at: r.updatedAt,
    deleted_at: r.deletedAt ?? null,
  };
}
function toSnakeEntry(r) {
  if ('goal_id' in r) return { ...r };
  return {
    id: r.id,
    goal_id: r.goalId,
    date: r.date,
    minutes: r.minutes,
    note: r.note ?? '',
    source: r.source ?? 'manual',
    created_at: r.createdAt,
    updated_at: r.updatedAt,
    deleted_at: r.deletedAt ?? null,
  };
}

const GOAL_COLUMNS = ['user_id', 'id', 'name', 'why', 'target_type', 'target_minutes', 'start_date', 'end_date', 'archived', 'created_at', 'updated_at', 'deleted_at', 'server_updated_at'];
const ENTRY_COLUMNS = ['user_id', 'id', 'goal_id', 'date', 'minutes', 'note', 'source', 'created_at', 'updated_at', 'deleted_at', 'server_updated_at'];
const SETTINGS_COLUMNS = ['user_id', 'reminder_enabled', 'reminder_time', 'reminder_updated_at', 'locale', 'locale_updated_at', 'server_updated_at'];

/** Only the columns of ARCHITECTURE §4.3 are stored (unknown columns would be a PostgREST 400). */
function pick(row, columns) {
  const out = {};
  for (const c of columns) out[c] = row[c] === undefined ? null : row[c];
  return out;
}

/** Rough check constraints of the migration; a violated row makes the whole batch fail (like Postgres). */
function checkRow(table, row) {
  if (table === 'goals') {
    if (typeof row.id !== 'string' || row.id.length < 1 || row.id.length > 64) return 'id';
    if (typeof row.name !== 'string' || row.name.length < 1 || row.name.length > 60) return 'name';
    if (typeof row.why !== 'string' || row.why.length > 280) return 'why';
    if (!['daily', 'total'].includes(row.target_type)) return 'target_type';
    if (!Number.isInteger(row.target_minutes) || row.target_minutes < 1 || row.target_minutes > 600000) return 'target_minutes';
    // v4.0 (20261019000000_goal_open_ended.sql): end_date NULL only for daily goals; no date comparison when NULL.
    if (row.end_date === null || row.end_date === undefined) {
      if (row.target_type !== 'daily') return 'goals_open_ended_daily_check';
    } else if (String(row.end_date) < String(row.start_date)) return 'goals_period_check';
    if (ms(row.updated_at) === Number.NEGATIVE_INFINITY || ms(row.created_at) === Number.NEGATIVE_INFINITY) return 'timestamps';
  } else if (table === 'entries') {
    if (typeof row.id !== 'string' || row.id.length < 1 || row.id.length > 64) return 'id';
    if (typeof row.goal_id !== 'string' || row.goal_id.length < 1 || row.goal_id.length > 64) return 'goal_id';
    if (!Number.isInteger(row.minutes) || row.minutes < 1 || row.minutes > 1440) return 'minutes';
    if (typeof row.note !== 'string' || row.note.length > 280) return 'note';
    if (!['manual', 'timer'].includes(row.source)) return 'source';
    if (ms(row.updated_at) === Number.NEGATIVE_INFINITY || ms(row.created_at) === Number.NEGATIVE_INFINITY) return 'timestamps';
  } else if (table === 'settings') {
    const rNull = row.reminder_enabled == null;
    if ((row.reminder_time == null) !== rNull || (row.reminder_updated_at == null) !== rNull) return 'reminder group';
    if (!rNull && !/^([01][0-9]|2[0-3]):[0-5][0-9]$/.test(String(row.reminder_time))) return 'reminder_time';
    const lNull = row.locale == null;
    if ((row.locale_updated_at == null) !== lNull) return 'locale group';
    if (!lNull && !['en', 'vi'].includes(row.locale)) return 'locale';
  }
  return null;
}

/**
 * Creates the mock. `listen(port)` resolves with the bound port; `close()` stops it.
 *
 * State is partitioned by the request's `User-Agent` (or `?scope=` / `x-opb-scope` on
 * `/__test/*`): Playwright workers run in parallel against one mock, so each worker gets its
 * own browser UA (e2e/cloud/fixtures.ts) and its own flows, tokens, toggles, rows and log.
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
      fail: [], // { path, status, times, delay }
      rows: { goals: new Map(), entries: new Map(), settings: new Map() }, // userKey → Map(id → row)
      exchanges: 0,
      refreshes: 0,
      lastServerStamp: 0,
    };
  }

  const nowS = (state) => Math.floor((state.now ?? Date.now()) / 1000);

  /** `clock_timestamp()`: strictly increasing per partition (never frozen by `now`: the DB clock is real). */
  function serverStamp(state) {
    const t = Math.max(Date.now(), state.lastServerStamp + 1);
    state.lastServerStamp = t;
    return new Date(t).toISOString();
  }

  /** `identity` (test only): override email/name of the issued session (`name: ''` = no name in metadata). */
  function issueSession(state, userKey, identity = null) {
    const base = USERS[userKey];
    const user = identity ? { ...base, email: identity.email ?? base.email, name: identity.name === undefined ? base.name : identity.name } : base;
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
      user_metadata: metadataOf(user),
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

  function metadataOf(user) {
    return user.name === '' ? { email: user.email, email_verified: true } : { email: user.email, email_verified: true, full_name: user.name, name: user.name };
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
      user_metadata: metadataOf(user),
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

  /** PostgREST-shaped error body. */
  function restError(res, status, code, message, details = null, hint = null) {
    send(res, status, { code, details, hint, message });
  }

  function bearerUser(state, req) {
    const auth = req.headers.authorization ?? '';
    const token = auth.replace(/^Bearer\s+/i, '');
    const claims = verifyJwt(token);
    if (!claims || typeof claims.exp !== 'number' || claims.exp <= nowS(state)) return null;
    return Object.values(USERS).find((u) => u.id === claims.sub) ?? null;
  }

  /** `/__test/fail?path=token&status=500&times=1[&delay=ms]`: the next `times` requests whose path contains `path` fail. */
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

  // ---- REST (M7) ----

  function userRows(state, table, userKey) {
    let map = state.rows[table].get(userKey);
    if (!map) {
      map = new Map();
      state.rows[table].set(userKey, map);
    }
    return map;
  }

  /** `sync_before_write`: insert, or update only when `updated_at` is strictly newer (tie → server). Returns the stored row or null (kept). */
  function upsertRow(state, table, userKey, incoming) {
    const columns = table === 'goals' ? GOAL_COLUMNS : ENTRY_COLUMNS;
    const rows = userRows(state, table, userKey);
    const row = pick({ ...incoming, user_id: USERS[userKey].id }, columns);
    const old = rows.get(String(row.id));
    if (old) {
      if (ms(row.updated_at) <= ms(old.updated_at)) return null;
      const next = { ...old, ...row, user_id: old.user_id, created_at: old.created_at, server_updated_at: serverStamp(state) };
      rows.set(String(row.id), next);
      return next;
    }
    const next = { ...row, server_updated_at: serverStamp(state) };
    rows.set(String(row.id), next);
    return next;
  }

  /** `settings_before_write`: per-group LWW; a `null` group keeps the stored values; nothing newer → row untouched (null). */
  function upsertSettings(state, userKey, incoming) {
    const row = pick({ ...incoming, user_id: USERS[userKey].id }, SETTINGS_COLUMNS);
    const rows = state.rows.settings;
    const old = rows.get(userKey);
    if (!old) {
      const next = { ...row, server_updated_at: serverStamp(state) };
      rows.set(userKey, next);
      return next;
    }
    let changed = false;
    const next = { ...old };
    const newer = (a, b) => a != null && (b == null || ms(a) > ms(b));
    if (newer(row.reminder_updated_at, old.reminder_updated_at)) {
      next.reminder_enabled = row.reminder_enabled;
      next.reminder_time = row.reminder_time;
      next.reminder_updated_at = row.reminder_updated_at;
      changed = true;
    }
    if (newer(row.locale_updated_at, old.locale_updated_at)) {
      next.locale = row.locale;
      next.locale_updated_at = row.locale_updated_at;
      changed = true;
    }
    if (!changed) return null;
    next.server_updated_at = serverStamp(state);
    rows.set(userKey, next);
    return next;
  }

  const unquote = (v) => String(v).replace(/^"(.*)"$/, '$1');

  /** PostgREST `in.(a,"b,c","d\"e")`: comma-separated, double-quoted values may contain `,` `(` `)` and backslash-escaped `"` / `\\`. */
  function parseInList(raw) {
    const s = String(raw).replace(/^\((.*)\)$/s, '$1');
    const out = [];
    let cur = '';
    let quoted = false;
    for (let i = 0; i < s.length; i += 1) {
      const c = s[i];
      if (quoted) {
        if (c === '\\' && i + 1 < s.length) {
          cur += s[i + 1];
          i += 1;
        } else if (c === '"') quoted = false;
        else cur += c;
      } else if (c === '"') quoted = true;
      else if (c === ',') {
        out.push(cur.trim());
        cur = '';
      } else cur += c;
    }
    if (cur !== '' || out.length > 0) out.push(cur.trim());
    return out;
  }

  /** The PostgREST filters `SupabaseRemoteStore` uses: `col=eq.v`, `id=in.(...)`, `or=(server_updated_at.gt.X,and(server_updated_at.eq.X,id.gt.Y))`. */
  function applyFilters(rows, searchParams) {
    let out = rows;
    for (const [key, value] of searchParams.entries()) {
      if (['select', 'order', 'limit', 'offset', 'on_conflict', 'columns'].includes(key)) continue;
      if (key === 'or') {
        const m = /^\(server_updated_at\.gt\.("?[^",)]+"?),and\(server_updated_at\.eq\.("?[^",)]+"?),id\.gt\.("?[^")]*"?)\)\)$/.exec(value);
        if (!m) throw new Error(`mock-supabase: unsupported or= filter ${value}`);
        const stamp = ms(unquote(m[1]));
        const id = unquote(m[3]);
        out = out.filter((r) => ms(r.server_updated_at) > stamp || (ms(r.server_updated_at) === stamp && String(r.id) > id));
        continue;
      }
      const op = /^(eq|in|gt|gte|lt|lte)\.(.*)$/s.exec(value);
      if (!op) throw new Error(`mock-supabase: unsupported filter ${key}=${value}`);
      if (op[1] === 'in') {
        const set = new Set(parseInList(op[2]));
        out = out.filter((r) => set.has(String(r[key])));
        continue;
      }
      const v = unquote(op[2]);
      out = out.filter((r) => {
        const a = r[key];
        if (op[1] === 'eq') return String(a) === v;
        const isTime = /_at$/.test(key);
        const left = isTime ? ms(a) : String(a);
        const right = isTime ? ms(v) : v;
        if (op[1] === 'gt') return left > right;
        if (op[1] === 'gte') return left >= right;
        if (op[1] === 'lt') return left < right;
        return left <= right;
      });
    }
    return out;
  }

  function applyOrder(rows, order) {
    if (!order) return rows;
    const keys = order.split(',').map((part) => {
      const [col, dir] = part.split('.');
      return { col, desc: dir === 'desc' };
    });
    return [...rows].sort((a, b) => {
      for (const { col, desc } of keys) {
        const isTime = /_at$/.test(col);
        const x = isTime ? ms(a[col]) : String(a[col]);
        const y = isTime ? ms(b[col]) : String(b[col]);
        if (x < y) return desc ? 1 : -1;
        if (x > y) return desc ? -1 : 1;
      }
      return 0;
    });
  }

  async function handleRest(state, req, res, url, body) {
    const table = url.pathname.slice('/rest/v1/'.length);
    if (!REST_TABLES.includes(table)) return restError(res, 404, 'PGRST205', `Could not find the table 'public.${table}' in the schema cache`);
    const user = bearerUser(state, req);
    if (!user) return restError(res, 401, 'PGRST301', 'JWT expired');
    const userKey = userKeyOf(user.id);
    const prefer = String(req.headers.prefer ?? '');
    const wantsRows = prefer.includes('return=representation');

    if (req.method === 'GET') {
      let rows = table === 'settings' ? [...(state.rows.settings.has(userKey) ? [state.rows.settings.get(userKey)] : [])] : [...userRows(state, table, userKey).values()];
      let filtered;
      try {
        filtered = applyFilters(rows, url.searchParams);
      } catch (e) {
        return restError(res, 400, 'PGRST100', String(e.message));
      }
      filtered = applyOrder(filtered, url.searchParams.get('order'));
      const limit = url.searchParams.get('limit');
      if (limit !== null) filtered = filtered.slice(0, Number(limit));
      return send(res, 200, filtered, { 'Content-Range': `0-${Math.max(filtered.length - 1, 0)}/*` });
    }

    if (req.method === 'POST') {
      if (!prefer.includes('resolution=merge-duplicates')) return restError(res, 400, 'PGRST102', 'mock-supabase only supports upsert (Prefer: resolution=merge-duplicates)');
      const incoming = Array.isArray(body) ? body : body && typeof body === 'object' ? [body] : [];
      for (const row of incoming) {
        const problem = checkRow(table, row);
        if (problem) return restError(res, 400, '23514', `new row for relation "${table}" violates check constraint (${problem})`);
      }
      const written = [];
      if (table === 'settings') {
        if (url.searchParams.get('on_conflict') !== 'user_id') return restError(res, 400, 'PGRST102', 'settings upsert needs on_conflict=user_id');
        for (const row of incoming) {
          const stored = upsertSettings(state, userKey, row);
          if (stored) written.push(stored);
        }
      } else {
        if (url.searchParams.get('on_conflict') !== 'user_id,id') return restError(res, 400, 'PGRST102', `${table} upsert needs on_conflict=user_id,id`);
        for (const row of incoming) {
          const stored = upsertRow(state, table, userKey, row);
          if (stored) written.push(stored);
        }
      }
      if (wantsRows) return send(res, 201, written);
      return send(res, 201, '', { 'Content-Type': 'application/json' });
    }

    if (req.method === 'DELETE' || req.method === 'PATCH') return restError(res, 401, '42501', `permission denied for table ${table}`);
    return restError(res, 405, 'PGRST105', 'method not supported');
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
      const rows = Array.isArray(body) ? body.length : body && typeof body === 'object' ? 1 : 0;
      state.log.push({ method: req.method, path: pathname, query: q, body: body && typeof body === 'object' && !Array.isArray(body) ? Object.keys(body) : null, rows, at: Date.now() });
    }

    if (req.method === 'OPTIONS') return send(res, 204, '');

    const failure = takeFailure(state, pathname);
    if (failure) {
      if (failure.delay) await new Promise((r) => setTimeout(r, failure.delay));
      if (pathname.startsWith('/rest/')) return restError(res, failure.status, failure.status === 401 ? 'PGRST301' : '', `forced failure (${failure.status})`);
      return authError(res, failure.status, 'server_error', `forced failure (${failure.status})`);
    }

    if (pathname.startsWith('/rest/v1/')) return handleRest(state, req, res, url, body);

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
      if (q.clear !== undefined) {
        state.fail = [];
        return send(res, 200, { ok: true, fail: state.fail });
      }
      state.fail.push({ path: q.path ?? 'token', status: Number(q.status ?? 500), times: Number(q.times ?? 1), delay: Number(q.delay ?? 0) });
      return send(res, 200, { ok: true, fail: state.fail });
    }
    if (pathname === '/__test/session') {
      if (q.ttl !== undefined) state.tokenTtlS = Number(q.ttl);
      if (q.refresh !== undefined) state.refreshMode = q.refresh === 'invalid_grant' ? 'invalid_grant' : 'ok';
      if (q.now !== undefined) state.now = q.now === '' ? null : Number(q.now);
      return send(res, 200, { ok: true, tokenTtlS: state.tokenTtlS, refreshMode: state.refreshMode, now: state.now });
    }
    if (pathname === '/__test/token') {
      // A ready-made session for in-process tests (contract suite): no PKCE round-trip needed.
      // `email` / `name` override the identity (name '' = no name) while `sub` stays the user's id, so REST
      // still accepts the token (a hand-forged token is rejected with 401 like on real Supabase).
      const userKey = USERS[q.user] ? q.user : 'u1';
      const identity = q.email !== undefined || q.name !== undefined ? { email: q.email, name: q.name } : null;
      return send(res, 200, issueSession(state, userKey, identity));
    }
    if (pathname === '/__test/seed' && req.method === 'POST') {
      // Rows may be given in domain (camelCase) or cloud (snake_case) shape; they bypass LWW and get a server stamp.
      const userKey = body?.user ?? 'u1';
      if (Array.isArray(body?.goals)) for (const r of body.goals) userRows(state, 'goals', userKey).set(String(r.id), { ...pick({ ...toSnakeGoal(r), user_id: USERS[userKey].id }, GOAL_COLUMNS), server_updated_at: r.server_updated_at ?? serverStamp(state) });
      if (Array.isArray(body?.entries)) for (const r of body.entries) userRows(state, 'entries', userKey).set(String(r.id), { ...pick({ ...toSnakeEntry(r), user_id: USERS[userKey].id }, ENTRY_COLUMNS), server_updated_at: r.server_updated_at ?? serverStamp(state) });
      if (Array.isArray(body?.settings)) for (const r of body.settings) state.rows.settings.set(userKey, { ...pick({ ...r, user_id: USERS[userKey].id }, SETTINGS_COLUMNS), server_updated_at: serverStamp(state) });
      return send(res, 200, { ok: true });
    }
    if (pathname === '/__test/rows') {
      const userKey = q.user ?? 'u1';
      const out = {
        goals: [...(state.rows.goals.get(userKey)?.values() ?? [])],
        entries: [...(state.rows.entries.get(userKey)?.values() ?? [])],
        settings: state.rows.settings.has(userKey) ? [state.rows.settings.get(userKey)] : [],
      };
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
