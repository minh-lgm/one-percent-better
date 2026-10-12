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

export interface RemoteStore {
  /** Upsert in batches (≤ 500 rows per table), goals before entries, `onConflict 'user_id,id'`. The server trigger decides LWW. */
  push(changes: RemoteChanges): Promise<void>;
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
  constructor(
    readonly code: Exclude<SyncErrorCode, 'SYNC_REMOTE_INVALID'>,
    message: string,
    options?: { cause?: unknown },
  ) {
    super(message, options);
    this.name = 'RemoteError';
  }
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
