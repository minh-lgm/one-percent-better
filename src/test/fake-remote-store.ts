// In-memory `RemoteStore` for service tests (ARCHITECTURE §8, ADR-23). One `FakeRemoteServer`
// plays the Postgres side for every user (same LWW rules as the SQL triggers: a write wins only
// when strictly newer, tie → server; `server_updated_at` set by the server, strictly increasing);
// a `FakeRemoteStore` is one client bound to one user (RLS = keyed by user id). Rows are stored in
// the cloud's snake_case shape and validated on the way out with the real mapper, so a seeded
// invalid row behaves exactly like one on Supabase.
import type { PullCursor, RemoteChanges, RemotePrefs } from '../data/repositories';
import { compareStamps } from '../domain/sync';
import type { Goal, ISODateTime, LogEntry } from '../domain/types';
import { entryRowSchema, entryToRow, goalRowSchema, goalToRow, mapEntryRows, mapGoalRows, mapPrefsRow, prefsToRow } from '../integration/supabase/mapper';
import { chunk, FETCH_IDS_BATCH_MAX, NO_REJECTS, PUSH_BATCH_MAX, RemoteError, type FetchedRows, type PulledPrefs, type PullPage, type PushResult, type RemoteStore, type RemoteTable } from '../services/remote-store';
import type { Mapped } from '../integration/supabase/mapper';

type Row = Record<string, unknown> & { id: string; user_id: string; updated_at: string; server_updated_at: string };
type PrefRow = Record<string, unknown> & { user_id: string; server_updated_at: string };

export interface FakeCall {
  method: 'push' | 'fetchByIds' | 'pull' | 'pushPrefs' | 'pullPrefs';
  user: string;
  size: number;
  /** `pull` only (v4.0, ADR-33 tests): which table and the cursor the client asked for. */
  table?: RemoteTable;
  cursor?: PullCursor | null;
}

/**
 * The check constraints of the SQL schema that a raw write can violate (M6 + v4.0 migration): the
 * returned string names the constraint, like Postgres SQLSTATE 23514 does. `null` = row accepted.
 */
export function violatedCheck(table: RemoteTable, row: Record<string, unknown>): string | null {
  if (table !== 'goals') return null;
  if (row.end_date === null || row.end_date === undefined) return row.target_type === 'daily' ? null : 'goals_open_ended_daily_check';
  return String(row.end_date) < String(row.start_date) ? 'goals_period_check' : null;
}

/** The "Postgres" of the tests. `now` is the server clock. */
export class FakeRemoteServer {
  readonly tables: Record<RemoteTable, Map<string, Map<string, Row>>> = { goals: new Map(), entries: new Map() };
  readonly settings = new Map<string, PrefRow>();
  readonly calls: FakeCall[] = [];
  private lastStamp = 0;

  constructor(public now: () => Date = () => new Date()) {}

  /** Strictly increasing server timestamp (clock_timestamp() in the trigger). */
  private stamp(): ISODateTime {
    const t = Math.max(this.now().getTime(), this.lastStamp + 1);
    this.lastStamp = t;
    return new Date(t).toISOString();
  }

  private userTable(table: RemoteTable, user: string): Map<string, Row> {
    let m = this.tables[table].get(user);
    if (!m) {
      m = new Map();
      this.tables[table].set(user, m);
    }
    return m;
  }

  /** `sync_before_write`: insert, or update only when strictly newer. Check constraints first (whole batch fails, like Postgres). */
  upsert(table: RemoteTable, user: string, incoming: Record<string, unknown>): void {
    const violated = violatedCheck(table, incoming);
    if (violated) throw new RemoteError('SYNC_UNREACHABLE', `HTTP 400 23514: new row for relation "${table}" violates check constraint "${violated}"`);
    const rows = this.userTable(table, user);
    const id = String(incoming.id);
    const old = rows.get(id);
    if (old) {
      if (compareStamps(String(incoming.updated_at), old.updated_at) <= 0) return;
      rows.set(id, { ...old, ...incoming, user_id: old.user_id, created_at: old.created_at, server_updated_at: this.stamp() } as Row);
      return;
    }
    rows.set(id, { ...incoming, user_id: user, server_updated_at: this.stamp() } as Row);
  }

  /** Test seed: a raw cloud row (snake_case), bypassing LWW. Missing `server_updated_at` is assigned. */
  seedRow(table: RemoteTable, user: string, row: Record<string, unknown>): void {
    this.userTable(table, user).set(String(row.id), { ...row, user_id: user, server_updated_at: (row.server_updated_at as string | undefined) ?? this.stamp() } as Row);
  }

  seedPrefsRow(user: string, row: Record<string, unknown>): void {
    this.settings.set(user, { ...row, user_id: user, server_updated_at: this.stamp() } as PrefRow);
  }

  rows(table: RemoteTable, user: string): Row[] {
    return [...this.userTable(table, user).values()];
  }

  live(table: RemoteTable, user: string): Row[] {
    return this.rows(table, user).filter((r) => r.deleted_at == null);
  }

  /** `settings_before_write`: per-group LWW, `null` group keeps the old values. */
  upsertPrefs(user: string, incoming: Record<string, unknown>): PrefRow {
    const old = this.settings.get(user);
    if (!old) {
      const row = { ...incoming, user_id: user, server_updated_at: this.stamp() } as PrefRow;
      this.settings.set(user, row);
      return row;
    }
    let changed = false;
    const next: PrefRow = { ...old };
    const newer = (a: unknown, b: unknown) => typeof a === 'string' && (b == null || compareStamps(a, String(b)) > 0);
    if (newer(incoming.reminder_updated_at, old.reminder_updated_at)) {
      next.reminder_enabled = incoming.reminder_enabled;
      next.reminder_time = incoming.reminder_time;
      next.reminder_updated_at = incoming.reminder_updated_at;
      changed = true;
    }
    if (newer(incoming.locale_updated_at, old.locale_updated_at)) {
      next.locale = incoming.locale;
      next.locale_updated_at = incoming.locale_updated_at;
      changed = true;
    }
    if (!changed) return old;
    next.server_updated_at = this.stamp();
    this.settings.set(user, next);
    return next;
  }

  /** Keyset page after `cursor`: (server_updated_at, id) ascending. */
  page(table: RemoteTable, user: string, cursor: PullCursor | null, limit: number): { rows: Row[]; hasMore: boolean } {
    const all = this.rows(table, user)
      .filter((r) => !cursor || compareStamps(r.server_updated_at, cursor.serverUpdatedAt) > 0 || (compareStamps(r.server_updated_at, cursor.serverUpdatedAt) === 0 && r.id > cursor.id))
      .sort((a, b) => compareStamps(a.server_updated_at, b.server_updated_at) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
    return { rows: all.slice(0, limit), hasMore: all.length > limit };
  }
}

/** One client of the fake server, bound to one user. */
export class FakeRemoteStore implements RemoteStore {
  /** Set to make every call throw (offline, 5xx, 401). `null` = healthy. */
  failure: RemoteError | null = null;
  /** Fail only the next `n` calls with `failure` (then recover). `null` = always while `failure` is set. */
  failTimes: number | null = null;
  /** Artificial latency per call (ms), for concurrency tests. */
  delayMs = 0;
  /**
   * v4.0 (ADR-33 tests): behave like a client built before M11, whose mapper treated `end_date`
   * NULL as an invalid row — the goal is skipped and counted, the cursor still moves past it.
   */
  legacyMapper = false;

  constructor(
    readonly server: FakeRemoteServer,
    readonly userId: string,
  ) {}

  /** The pre-M11 mapper, when `legacyMapper` is on: drop open-ended goals as "invalid". */
  private mapGoals(rows: Row[]): Mapped<Goal> {
    const m = mapGoalRows(rows);
    if (!this.legacyMapper) return m;
    const kept = m.rows.filter((g) => g.endDate !== null);
    return { rows: kept, serverUpdatedAt: m.serverUpdatedAt, skippedInvalid: m.skippedInvalid + (m.rows.length - kept.length) };
  }

  private async guard(method: FakeCall['method'], size: number, pull?: { table: RemoteTable; cursor: PullCursor | null }): Promise<void> {
    this.server.calls.push(pull ? { method, user: this.userId, size, table: pull.table, cursor: pull.cursor } : { method, user: this.userId, size });
    if (this.delayMs > 0) await new Promise((r) => setTimeout(r, this.delayMs));
    if (this.failure) {
      if (this.failTimes === null) throw this.failure;
      if (this.failTimes > 0) {
        this.failTimes -= 1;
        throw this.failure;
      }
      this.failure = null;
    }
  }

  async push(changes: RemoteChanges): Promise<PushResult> {
    const result = NO_REJECTS();
    // Same rule as `SupabaseRemoteStore`: rows the cloud schema refuses are reported, never stored (M7-D1).
    const goals = changes.goals.map((g) => goalToRow(g, this.userId)).filter((row) => goalRowSchema.safeParse(row).success || !result.rejected.goals.push(String(row.id)));
    const entries = changes.entries.map((e) => entryToRow(e, this.userId)).filter((row) => entryRowSchema.safeParse(row).success || !result.rejected.entries.push(String(row.id)));
    for (const batch of chunk(goals, PUSH_BATCH_MAX)) {
      await this.guard('push', batch.length);
      for (const row of batch) this.server.upsert('goals', this.userId, row);
    }
    for (const batch of chunk(entries, PUSH_BATCH_MAX)) {
      await this.guard('push', batch.length);
      for (const row of batch) this.server.upsert('entries', this.userId, row);
    }
    return result;
  }

  async fetchByIds(ids: { goals: string[]; entries: string[] }): Promise<FetchedRows> {
    const out: FetchedRows = { goals: [], entries: [], serverUpdatedAt: {}, skippedInvalid: 0 };
    for (const batch of chunk(ids.goals, FETCH_IDS_BATCH_MAX)) {
      await this.guard('fetchByIds', batch.length);
      const rows = batch.map((id) => this.server.rows('goals', this.userId).find((r) => r.id === id)).filter((r): r is Row => !!r);
      const m = this.mapGoals(rows);
      out.goals.push(...m.rows);
      Object.assign(out.serverUpdatedAt, m.serverUpdatedAt);
      out.skippedInvalid += m.skippedInvalid;
    }
    for (const batch of chunk(ids.entries, FETCH_IDS_BATCH_MAX)) {
      await this.guard('fetchByIds', batch.length);
      const rows = batch.map((id) => this.server.rows('entries', this.userId).find((r) => r.id === id)).filter((r): r is Row => !!r);
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
    await this.guard('pull', limit, { table, cursor });
    const { rows, hasMore } = this.server.page(table, this.userId, cursor, limit);
    const last = rows[rows.length - 1];
    const next = last ? { serverUpdatedAt: last.server_updated_at, id: last.id } : null;
    const m = table === 'goals' ? this.mapGoals(rows) : mapEntryRows(rows);
    return { rows: m.rows as never, serverUpdatedAt: m.serverUpdatedAt, next, hasMore, skippedInvalid: m.skippedInvalid };
  }

  async pushPrefs(prefs: RemotePrefs): Promise<RemotePrefs> {
    await this.guard('pushPrefs', 1);
    const row = this.server.upsertPrefs(this.userId, prefsToRow(prefs, this.userId));
    return mapPrefsRow(row).prefs;
  }

  async pullPrefs(): Promise<PulledPrefs> {
    await this.guard('pullPrefs', 1);
    const row = this.server.settings.get(this.userId);
    if (!row) return { prefs: null, skippedInvalid: 0 };
    return mapPrefsRow(row);
  }
}

export const offlineError = () => new RemoteError('SYNC_OFFLINE', 'TypeError: Failed to fetch');
export const unreachableError = () => new RemoteError('SYNC_UNREACHABLE', 'HTTP 503');
export const unauthorizedError = () => new RemoteError('SYNC_UNAUTHORIZED', 'HTTP 401');
