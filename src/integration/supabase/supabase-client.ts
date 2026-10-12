// The ONLY module (with its tests) that imports @supabase/* (ARCHITECTURE §3, ADR-18).
// Reached exclusively through `loader.ts` (dynamic import) so the SDK is its own chunk.
import { createClient, type AuthChangeEvent, type Session, type SupabaseClient, type SupportedStorage } from '@supabase/supabase-js';
import type { CloudConfig } from '../../config/env';
import type { PullCursor, RemoteChanges, RemotePrefs } from '../../data/repositories';
import type { Goal, LogEntry } from '../../domain/types';
import { displayName, type AuthEvent, type AuthPort, type AuthSession } from '../../services/auth-port';
import { chunk, FETCH_IDS_BATCH_MAX, isConstraintRejection, NO_REJECTS, PUSH_BATCH_MAX, REMOTE_TIMEOUT_MS, RemoteError, type FetchedRows, type PulledPrefs, type PullPage, type PushResult, type RemoteStore, type RemoteTable } from '../../services/remote-store';
import { AUTH_STORAGE_KEY, clearPkceVerifiers, clearStoredSession } from './loader';
import { entryRowSchema, entryToRow, goalRowSchema, goalToRow, mapEntryRows, mapGoalRows, mapPrefsRow, prefsToRow } from './mapper';

export interface SupabaseClientOptions {
  /** Defaults to `localStorage`; tests pass an in-memory adapter. */
  storage?: Storage | SupportedStorage;
  /** Called with the provider URL instead of navigating (tests). In a browser the SDK navigates itself. */
  navigate?: (url: string) => void;
  fetch?: typeof fetch;
}

/** PKCE, no implicit tokens in the hash, our own callback handling (ADR-19). */
export function createSupabase(cloud: CloudConfig, options: SupabaseClientOptions = {}): SupabaseClient {
  return createClient(cloud.url, cloud.key, {
    auth: {
      flowType: 'pkce',
      detectSessionInUrl: false,
      persistSession: true,
      autoRefreshToken: true,
      storageKey: AUTH_STORAGE_KEY,
      ...(options.storage ? { storage: options.storage as SupportedStorage } : {}),
    },
    ...(options.fetch ? { global: { fetch: options.fetch } } : {}),
  });
}

function toSession(session: Session): AuthSession {
  const email = session.user.email ?? '';
  return { userId: session.user.id, email, name: displayName(session.user.user_metadata as { full_name?: unknown; name?: unknown }, email) };
}

/** Errors the SDK marks as transient network failures (offline, DNS, 5xx retried). */
function isRetryable(error: unknown): boolean {
  return !!error && typeof error === 'object' && (error as { name?: string }).name === 'AuthRetryableFetchError';
}

/** `AuthPort` over `supabase.auth` (ARCHITECTURE §5.9). */
export class SupabaseAuthPort implements AuthPort {
  private signingOut = false;
  private exchanging = false;
  private readonly listeners = new Set<(e: AuthEvent) => void>();
  private readonly storage: SupportedStorage | Storage | undefined;

  constructor(
    readonly client: SupabaseClient,
    private readonly options: SupabaseClientOptions = {},
  ) {
    this.storage = options.storage ?? (typeof localStorage === 'undefined' ? undefined : localStorage);
    client.auth.onAuthStateChange((event: AuthChangeEvent, session: Session | null) => {
      let mapped: AuthEvent | null = null;
      if (event === 'SIGNED_IN' && session && !this.exchanging) mapped = { type: 'signed-in', session: toSession(session) };
      else if (event === 'SIGNED_OUT') mapped = this.signingOut ? { type: 'signed-out' } : { type: 'session-expired' };
      if (mapped) this.listeners.forEach((l) => l(mapped));
    });
  }

  async getSession(): Promise<AuthSession | null> {
    const { data, error } = await this.client.auth.getSession();
    if (data.session) return toSession(data.session);
    if (error && isRetryable(error)) {
      // Offline with an access token past its refresh margin: the SDK kept the stored session; show it (FR-40).
      const stored = await this.readStored();
      return stored ? toSession(stored) : null;
    }
    return null;
  }

  async signInWithGoogle(redirectTo: string): Promise<void> {
    const { data, error } = await this.client.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo, ...(this.options.navigate ? { skipBrowserRedirect: true } : {}) },
    });
    if (error) throw error;
    if (this.options.navigate && data.url) this.options.navigate(data.url);
  }

  async exchangeCode(code: string): Promise<AuthSession> {
    this.exchanging = true;
    try {
      const { data, error } = await this.client.auth.exchangeCodeForSession(code);
      if (error) throw error;
      if (!data.session) throw new Error('no session in token response');
      return toSession(data.session);
    } finally {
      this.exchanging = false;
      // The code verifier is single-use: drop it whether the exchange succeeded or not (M6-P1).
      clearPkceVerifiers(this.storage as Storage);
    }
  }

  /** Scope `local`. A failed server call (offline) must still clear the device session. */
  async signOut(): Promise<void> {
    this.signingOut = true;
    try {
      const { error } = await this.client.auth.signOut({ scope: 'local' });
      if (error) clearStoredSession(this.storage as Storage);
    } catch {
      clearStoredSession(this.storage as Storage);
    } finally {
      this.signingOut = false;
    }
  }

  onEvent(cb: (e: AuthEvent) => void): () => void {
    this.listeners.add(cb);
    return () => {
      this.listeners.delete(cb);
    };
  }

  async accessToken(): Promise<string | null> {
    const { data } = await this.client.auth.getSession();
    return data.session?.access_token ?? null;
  }

  private async readStored(): Promise<Session | null> {
    try {
      const raw = await this.storage?.getItem(AUTH_STORAGE_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw) as Session;
      return parsed && typeof parsed.access_token === 'string' && parsed.user ? parsed : null;
    } catch {
      return null;
    }
  }
}

/** Factory used by `loader.ts`. */
export function createSupabaseAuthPort(cloud: CloudConfig, storage?: Storage | SupportedStorage, options: Omit<SupabaseClientOptions, 'storage'> = {}): AuthPort {
  const client = createSupabase(cloud, { ...options, storage });
  return new SupabaseAuthPort(client, { ...options, storage });
}

// ---- M7: RemoteStore over PostgREST (ARCHITECTURE §5.10) ----

interface PostgrestLikeError {
  message?: string;
  code?: string;
  details?: string;
  hint?: string;
}

/** Map a PostgREST/fetch failure to a `RemoteError` (NFR-15). */
export function toRemoteError(status: number, error: PostgrestLikeError | null, cause?: unknown): RemoteError {
  const message = error?.message ?? 'unknown';
  const meta = { cause, status, pgCode: error?.code };
  if (status === 401 || status === 403 || error?.code === 'PGRST301' || error?.code === '42501') return new RemoteError('SYNC_UNAUTHORIZED', `HTTP ${status}: ${message}`, meta);
  if (status === 0) {
    const aborted = /abort/i.test(message) || /abort/i.test(error?.hint ?? '');
    if (aborted) return new RemoteError('SYNC_UNREACHABLE', `timeout: ${message}`, meta);
    return new RemoteError('SYNC_OFFLINE', `network: ${message}`, meta);
  }
  return new RemoteError('SYNC_UNREACHABLE', `HTTP ${status}: ${message}`, meta);
}

export interface SupabaseRemoteStoreOptions {
  /** Per-request timeout; `0` disables (tests). */
  timeoutMs?: number;
}

const stripQuotes = (v: string) => v.replace(/"/g, '');

/** PostgREST `in.(…)` element: always double-quoted, backslash and double quote escaped (NV-8: ids are free text from backups). */
export const quoteInValue = (v: string): string => `"${v.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;

/**
 * `RemoteStore` on `supabase.from(...)`. Every row sent carries `user_id`; RLS + the triggers
 * make it impossible to write someone else's row. Rows read are validated by `mapper.ts`.
 */
export class SupabaseRemoteStore implements RemoteStore {
  private readonly timeoutMs: number;

  constructor(
    readonly client: SupabaseClient,
    private readonly userId: () => Promise<string | null>,
    options: SupabaseRemoteStoreOptions = {},
  ) {
    this.timeoutMs = options.timeoutMs ?? REMOTE_TIMEOUT_MS;
  }

  private async uid(): Promise<string> {
    const id = await this.userId();
    if (!id) throw new RemoteError('SYNC_UNAUTHORIZED', 'no session');
    return id;
  }

  /** Runs one PostgREST query with the timeout; throws `RemoteError`. */
  private async run<T>(build: (signal: AbortSignal | undefined) => PromiseLike<{ data: T | null; error: PostgrestLikeError | null; status: number }>): Promise<T | null> {
    const controller = this.timeoutMs > 0 ? new AbortController() : null;
    const timer = controller ? setTimeout(() => controller.abort(), this.timeoutMs) : null;
    try {
      const res = await build(controller?.signal);
      if (res.error) throw toRemoteError(res.status, res.error);
      return res.data;
    } catch (e) {
      if (e instanceof RemoteError) throw e;
      const name = (e as { name?: string })?.name ?? '';
      if (name === 'AbortError') throw new RemoteError('SYNC_UNREACHABLE', 'timeout', { cause: e });
      throw new RemoteError('SYNC_OFFLINE', `network: ${String((e as Error)?.message ?? e)}`, { cause: e });
    } finally {
      if (timer !== null) clearTimeout(timer);
    }
  }

  async push(changes: RemoteChanges): Promise<PushResult> {
    const uid = await this.uid();
    const result = NO_REJECTS();
    // Rows the cloud schema (= SQL check constraints) refuses never leave the device (M7-D1).
    const goals = changes.goals.map((g) => goalToRow(g, uid)).filter((row) => goalRowSchema.safeParse(row).success || !result.rejected.goals.push(String(row.id)));
    const entries = changes.entries.map((e) => entryToRow(e, uid)).filter((row) => entryRowSchema.safeParse(row).success || !result.rejected.entries.push(String(row.id)));
    for (const batch of chunk(goals, PUSH_BATCH_MAX)) await this.pushRows('goals', batch, result.rejected.goals);
    for (const batch of chunk(entries, PUSH_BATCH_MAX)) await this.pushRows('entries', batch, result.rejected.entries);
    return result;
  }

  /** One upsert; a constraint rejection (400, SQLSTATE 22xxx/23xxx) splits the batch so only the bad rows are isolated. */
  private async pushRows(table: RemoteTable, rows: Array<Record<string, unknown>>, rejected: string[]): Promise<void> {
    if (rows.length === 0) return;
    try {
      await this.run((signal) => withSignal(this.client.from(table).upsert(rows, { onConflict: 'user_id,id' }), signal));
    } catch (e) {
      if (!isConstraintRejection(e)) throw e;
      if (rows.length === 1) {
        rejected.push(String(rows[0].id));
        return;
      }
      const mid = Math.ceil(rows.length / 2);
      await this.pushRows(table, rows.slice(0, mid), rejected);
      await this.pushRows(table, rows.slice(mid), rejected);
    }
  }

  async fetchByIds(ids: { goals: string[]; entries: string[] }): Promise<FetchedRows> {
    const out: FetchedRows = { goals: [], entries: [], serverUpdatedAt: {}, skippedInvalid: 0 };
    for (const batch of chunk(ids.goals, FETCH_IDS_BATCH_MAX)) {
      const rows = (await this.run<unknown[]>((signal) => withSignal(this.client.from('goals').select('*').filter('id', 'in', `(${batch.map(quoteInValue).join(',')})`), signal))) ?? [];
      const m = mapGoalRows(rows);
      out.goals.push(...m.rows);
      Object.assign(out.serverUpdatedAt, m.serverUpdatedAt);
      out.skippedInvalid += m.skippedInvalid;
    }
    for (const batch of chunk(ids.entries, FETCH_IDS_BATCH_MAX)) {
      const rows = (await this.run<unknown[]>((signal) => withSignal(this.client.from('entries').select('*').filter('id', 'in', `(${batch.map(quoteInValue).join(',')})`), signal))) ?? [];
      const m = mapEntryRows(rows);
      out.entries.push(...m.rows);
      Object.assign(out.serverUpdatedAt, m.serverUpdatedAt);
      out.skippedInvalid += m.skippedInvalid;
    }
    return out;
  }

  pull(table: 'goals', cursor: PullCursor | null, limit: number): Promise<PullPage<Goal>>;
  pull(table: 'entries', cursor: PullCursor | null, limit: number): Promise<PullPage<LogEntry>>;
  async pull(table: RemoteTable, cursor: PullCursor | null, limit: number): Promise<PullPage<Goal> | PullPage<LogEntry>> {
    const rows =
      (await this.run<Array<Record<string, unknown>>>((signal) => {
        let q = this.client.from(table).select('*');
        if (cursor) {
          // PostgREST: server_updated_at > c  OR  (server_updated_at = c AND id > c.id); values quoted.
          const stamp = stripQuotes(cursor.serverUpdatedAt);
          const id = stripQuotes(cursor.id);
          q = q.or(`server_updated_at.gt."${stamp}",and(server_updated_at.eq."${stamp}",id.gt."${id}")`);
        }
        return withSignal(q.order('server_updated_at', { ascending: true }).order('id', { ascending: true }).limit(limit + 1), signal);
      })) ?? [];
    const hasMore = rows.length > limit;
    const page = hasMore ? rows.slice(0, limit) : rows;
    const last = page[page.length - 1];
    const next = last ? { serverUpdatedAt: new Date(String(last.server_updated_at)).toISOString(), id: String(last.id) } : null;
    const m = table === 'goals' ? mapGoalRows(page) : mapEntryRows(page);
    return { rows: m.rows as never, serverUpdatedAt: m.serverUpdatedAt, next, hasMore, skippedInvalid: m.skippedInvalid };
  }

  async pushPrefs(prefs: RemotePrefs): Promise<RemotePrefs> {
    const uid = await this.uid();
    const rows = (await this.run<unknown[]>((signal) => withSignal(this.client.from('settings').upsert(prefsToRow(prefs, uid), { onConflict: 'user_id' }).select('*'), signal))) ?? [];
    if (rows.length === 0) {
      // Nothing newer (the trigger returned NULL): read the current row back.
      const pulled = await this.pullPrefs();
      return pulled.prefs ?? { reminder: null, locale: null };
    }
    return mapPrefsRow(rows[0]).prefs;
  }

  async pullPrefs(): Promise<PulledPrefs> {
    const uid = await this.uid();
    const rows = (await this.run<unknown[]>((signal) => withSignal(this.client.from('settings').select('*').eq('user_id', uid), signal))) ?? [];
    if (rows.length === 0) return { prefs: null, skippedInvalid: 0 };
    return mapPrefsRow(rows[0]);
  }
}

/** Attach an abort signal when one is given (the builder API is chainable). */
function withSignal<B extends { abortSignal(signal: AbortSignal): B }>(builder: B, signal: AbortSignal | undefined): B {
  return signal ? builder.abortSignal(signal) : builder;
}

/** Factory used by `loader.ts`: a RemoteStore sharing the auth port's SDK client. */
export function createSupabaseRemoteStore(port: AuthPort, options: SupabaseRemoteStoreOptions = {}): RemoteStore {
  const client = (port as SupabaseAuthPort).client;
  return new SupabaseRemoteStore(client, async () => (await client.auth.getSession()).data.session?.user.id ?? null, options);
}
