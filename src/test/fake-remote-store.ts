// In-memory `RemoteStore` for service tests (ARCHITECTURE §8, ADR-23). One `FakeRemoteServer`
// plays the Postgres side for every user (same LWW rules as the SQL triggers: a write wins only
// when strictly newer, tie → server; `server_updated_at` set by the server, strictly increasing);
// a `FakeRemoteStore` is one client bound to one user (RLS = keyed by user id). Rows are stored in
// the cloud's snake_case shape and validated on the way out with the real mapper, so a seeded
// invalid row behaves exactly like one on Supabase. v8.0 (M18, ADR-50/52): the six tables of
// `SYNC_TABLES`, and a "roadmap tables not migrated yet" mode (`server.roadmapTables = false`).
import { emptyChanges, type IdsByTable, type PullCursor, type RemoteChanges, type RemotePrefs, type SyncRecord } from '../data/repositories';
import { isRoadmapTable, SYNC_TABLES } from '../data/sync-tables';
import { compareStamps } from '../domain/sync';
import type { Goal, ISODateTime } from '../domain/types';
import { mapGoalRows, mapPrefsRow, prefsToRow, TABLE_CODECS, type Mapped } from '../integration/supabase/mapper';
import { addRejected, chunk, FETCH_IDS_BATCH_MAX, NO_REJECTS, PUSH_BATCH_MAX, RemoteError, type FetchedRows, type PulledPrefs, type PullPage, type PushResult, type RemoteRecordByTable, type RemoteStore, type RemoteTable } from '../services/remote-store';

type Row = Record<string, unknown> & { id: string; user_id: string; updated_at: string; server_updated_at: string };
type PrefRow = Record<string, unknown> & { user_id: string; server_updated_at: string };

export interface FakeCall {
  method: 'push' | 'fetchByIds' | 'pull' | 'pushPrefs' | 'pullPrefs';
  user: string;
  size: number;
  /** Which table the request was for (`pull` always; `push`/`fetchByIds` since v8.0). */
  table?: RemoteTable;
  /** `pull` only (v4.0, ADR-33 tests): the cursor the client asked for. */
  cursor?: PullCursor | null;
}

/**
 * The check constraints of the SQL schema that a raw write can violate (M6 + v4.0 + v8.0 migrations): the
 * returned string names the constraint, like Postgres SQLSTATE 23514 does. `null` = row accepted.
 */
export function violatedCheck(table: RemoteTable, row: Record<string, unknown>): string | null {
  if (table === 'goals') {
    if (row.end_date === null || row.end_date === undefined) return row.target_type === 'daily' ? null : 'goals_open_ended_daily_check';
    return String(row.end_date) < String(row.start_date) ? 'goals_period_check' : null;
  }
  if (table === 'roadmap_items') {
    if (String(row.planned_end) < String(row.planned_start)) return 'roadmap_items_planned_check';
    if (row.actual_start != null && row.actual_end != null && String(row.actual_end) < String(row.actual_start)) return 'roadmap_items_actual_check';
  }
  if (table === 'roadmap_checkpoints') {
    const max = Number(row.max_score);
    if (!(max > 0 && max <= 10000)) return 'roadmap_checkpoints_max_score_check';
    if (row.threshold != null && (Number(row.threshold) < 0 || Number(row.threshold) > max)) return 'roadmap_checkpoints_threshold_check';
    if (row.score != null && (Number(row.score) < 0 || Number(row.score) > max)) return 'roadmap_checkpoints_score_check';
  }
  return null;
}

const emptyTables = (): Record<RemoteTable, Map<string, Map<string, Row>>> => {
  const t = {} as Record<RemoteTable, Map<string, Map<string, Row>>>;
  for (const spec of SYNC_TABLES) t[spec.remote] = new Map();
  return t;
};

/** What PostgREST answers for a table that is not in the schema (`roadmapTables = false`). */
export const tableMissingError = (table: RemoteTable) => new RemoteError('SYNC_UNREACHABLE', `HTTP 404: Could not find the table 'public.${table}' in the schema cache`, { status: 404, pgCode: 'PGRST205', tableMissing: true });

/** The "Postgres" of the tests. `now` is the server clock. */
export class FakeRemoteServer {
  readonly tables: Record<RemoteTable, Map<string, Map<string, Row>>> = emptyTables();
  readonly settings = new Map<string, PrefRow>();
  readonly calls: FakeCall[] = [];
  /** v8.0 (ADR-52): `false` = the project has not run the roadmap migration; every roadmap-table request fails with `tableMissing`. */
  roadmapTables = true;
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
    if (violated) throw new RemoteError('SYNC_UNREACHABLE', `HTTP 400 23514: new row for relation "${table}" violates check constraint "${violated}"`, { status: 400, pgCode: '23514' });
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

  /** The mock's `delete-account`: every row of the user in the seven tables. */
  deleteUser(user: string): void {
    for (const spec of SYNC_TABLES) this.tables[spec.remote].delete(user);
    this.settings.delete(user);
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
  /** v8.0: when set, only calls for this table fail with `failure` (e.g. a 500 on `roadmap_items` alone). */
  failTable: RemoteTable | null = null;
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

  private mapRows(table: RemoteTable, rows: Row[]): Mapped<Record<string, unknown>> {
    return table === 'goals' ? (this.mapGoals(rows) as never) : TABLE_CODECS[table].mapRows(rows);
  }

  private async guard(method: FakeCall['method'], size: number, table?: RemoteTable, pull?: { cursor: PullCursor | null }): Promise<void> {
    this.server.calls.push({ method, user: this.userId, size, ...(table ? { table } : {}), ...(pull ? { cursor: pull.cursor } : {}) });
    if (this.delayMs > 0) await new Promise((r) => setTimeout(r, this.delayMs));
    if (this.failure && (this.failTable === null || this.failTable === table)) {
      if (this.failTimes === null) throw this.failure;
      if (this.failTimes > 0) {
        this.failTimes -= 1;
        throw this.failure;
      }
      this.failure = null;
    }
    if (table && isRoadmapTable(table) && !this.server.roadmapTables) throw tableMissingError(table);
  }

  async push(changes: RemoteChanges): Promise<PushResult> {
    const result = NO_REJECTS();
    for (const spec of SYNC_TABLES) {
      const records = (changes[spec.local] ?? []) as unknown as SyncRecord<Record<string, unknown>>[];
      if (records.length === 0) continue;
      const codec = TABLE_CODECS[spec.remote];
      // Same rule as `SupabaseRemoteStore`: rows the cloud schema refuses are reported, never stored (M7-D1).
      const rows = records.map((r) => codec.toRow(r, this.userId)).filter((row) => {
        if (codec.schema.safeParse(row).success) return true;
        addRejected(result.rejected, spec.local, String(row.id));
        return false;
      });
      for (const batch of chunk(rows, PUSH_BATCH_MAX)) {
        await this.guard('push', batch.length, spec.remote);
        for (const row of batch) this.server.upsert(spec.remote, this.userId, row);
      }
    }
    return result;
  }

  async fetchByIds(ids: IdsByTable): Promise<FetchedRows> {
    const out: FetchedRows = { ...emptyChanges(), serverUpdatedAt: {}, skippedInvalid: 0 };
    for (const spec of SYNC_TABLES) {
      for (const batch of chunk(ids[spec.local] ?? [], FETCH_IDS_BATCH_MAX)) {
        await this.guard('fetchByIds', batch.length, spec.remote);
        const all = this.server.rows(spec.remote, this.userId);
        const rows = batch.map((id) => all.find((r) => r.id === id)).filter((r): r is Row => !!r);
        const m = this.mapRows(spec.remote, rows);
        (out[spec.local] as unknown[]).push(...m.rows);
        Object.assign(out.serverUpdatedAt, m.serverUpdatedAt);
        out.skippedInvalid += m.skippedInvalid;
      }
    }
    return out;
  }

  async pull<T extends RemoteTable>(table: T, cursor: PullCursor | null, limit: number): Promise<PullPage<RemoteRecordByTable[T]>> {
    await this.guard('pull', limit, table, { cursor });
    const { rows, hasMore } = this.server.page(table, this.userId, cursor, limit);
    const last = rows[rows.length - 1];
    const next = last ? { serverUpdatedAt: last.server_updated_at, id: last.id } : null;
    const m = this.mapRows(table, rows);
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
