// Cloud side of the sync protocol (ARCHITECTURE §5.10, M7). Implemented by
// `integration/supabase/supabase-client.ts` (PostgREST) and `test/fake-remote-store.ts`.
// Services only see this interface; every implementation passes `remote-store.contract.ts`.
import type { PullCursor, RemoteChanges, RemotePrefs, SyncRecord } from '../data/repositories';
import type { SyncErrorCode } from '../domain/sync';
import type { Goal, ISODateTime, LogEntry } from '../domain/types';

export type RemoteTable = 'goals' | 'entries';

export interface PullPage<T> {
  rows: SyncRecord<T>[];
  /** `server_updated_at` per returned row id. */
  serverUpdatedAt: Record<string, ISODateTime>;
  /** Cursor of the last row returned (`null` when the page is empty). */
  next: PullCursor | null;
  hasMore: boolean;
  /** Rows that failed validation and were dropped (NFR-05). */
  skippedInvalid: number;
}

export interface PulledPrefs {
  prefs: RemotePrefs | null;
  /** Groups of the row that failed validation and read as `null` (NFR-05). */
  skippedInvalid: number;
}

export interface FetchedRows extends RemoteChanges {
  /** `server_updated_at` per id (goals and entries share the map; ids are unique per table in practice). */
  serverUpdatedAt: Record<string, ISODateTime>;
  skippedInvalid: number;
}

/** Rows the cloud will never take (schema / check constraint): left on the device, flagged, never retried as they are (M7-D1). */
export interface PushResult {
  rejected: { goals: string[]; entries: string[] };
}

export const NO_REJECTS = (): PushResult => ({ rejected: { goals: [], entries: [] } });

export function rejectedCount(r: PushResult): number {
  return r.rejected.goals.length + r.rejected.entries.length;
}

export interface RemoteStore {
  /**
   * Upsert in batches (≤ 500 rows per table), goals before entries, `onConflict 'user_id,id'`. The server
   * trigger decides LWW. Rows that fail the cloud schema are not sent (or are isolated when the server
   * rejects a batch with a constraint error) and come back in `rejected`; the other rows still land.
   */
  push(changes: RemoteChanges): Promise<PushResult>;
  /** The canonical server rows for the given ids (batches of ≤ 100 ids per request). */
  fetchByIds(ids: { goals: string[]; entries: string[] }): Promise<FetchedRows>;
  /** Keyset page after `cursor` (`server_updated_at`, then `id`), ascending, at most `limit` rows. */
  pull(table: 'goals', cursor: PullCursor | null, limit: number): Promise<PullPage<Goal>>;
  pull(table: 'entries', cursor: PullCursor | null, limit: number): Promise<PullPage<LogEntry>>;
  /** v2.1: upsert the user's `settings` row (`onConflict 'user_id'`); a `null` group is not sent. Returns the row after the write. */
  pushPrefs(prefs: RemotePrefs): Promise<RemotePrefs>;
  /** v2.1: the user's `settings` row; `prefs: null` when there is none. An invalid group reads as `null` and is counted. */
  pullPrefs(): Promise<PulledPrefs>;
}

/** Failure of a remote call, already mapped to a `SyncErrorCode` (NFR-15). */
export class RemoteError extends Error {
  /** HTTP status (0 = network), when known. */
  readonly status?: number;
  /** Postgres SQLSTATE or PostgREST code, when the server sent one. */
  readonly pgCode?: string;

  constructor(
    readonly code: Exclude<SyncErrorCode, 'SYNC_REMOTE_INVALID'>,
    message: string,
    options?: { cause?: unknown; status?: number; pgCode?: string },
  ) {
    super(message, options?.cause !== undefined ? { cause: options.cause } : undefined);
    this.name = 'RemoteError';
    if (options?.status !== undefined) this.status = options.status;
    if (options?.pgCode !== undefined) this.pgCode = options.pgCode;
  }
}

/** A 400 whose SQLSTATE is a data exception (22xxx) or an integrity-constraint violation (23xxx): the row, not the network. */
export function isConstraintRejection(e: unknown): boolean {
  return isRemoteError(e) && e.status === 400 && /^2[23]/.test(e.pgCode ?? '');
}

export function isRemoteError(e: unknown): e is RemoteError {
  return e instanceof RemoteError || (!!e && typeof e === 'object' && (e as { name?: string }).name === 'RemoteError');
}

/** Batch sizes of the protocol (ARCHITECTURE §5.10). */
export const PUSH_BATCH_MAX = 500;
export const FETCH_IDS_BATCH_MAX = 100;
export const REMOTE_TIMEOUT_MS = 20_000;

export function chunk<T>(items: readonly T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}
