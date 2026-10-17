// Sync rules (ARCHITECTURE §4.2, §4.4, §5.10; ADR-21, ADR-25; FR-49, FR-55). Pure functions,
// shared by the local store, the fake remote store and (in spirit) the SQL triggers, so every
// side applies the same total order: last-write-wins per record, compared as instants, tie → server.
import type { ISODateTime } from './types';

/** Error codes a sync cycle can end with (ARCHITECTURE §5.4). */
export type SyncErrorCode = 'SYNC_OFFLINE' | 'SYNC_UNREACHABLE' | 'SYNC_UNAUTHORIZED' | 'SYNC_REMOTE_INVALID';

/** What the UI sees (ARCHITECTURE §5.3). `paused` = not signed in, expired, or waiting for the merge decision. */
export interface SyncStatus {
  kind: 'idle' | 'syncing' | 'offline' | 'error' | 'paused';
  pending: number;
  lastSyncedAt: ISODateTime | null;
  error?: SyncErrorCode;
  nextRetryAt?: ISODateTime;
  /** Something was skipped during the last cycle: rows from the account that failed validation and/or rows the cloud refused (DESIGN A9). */
  remoteInvalid?: boolean;
  /** Rows coming from the account failed validation and were skipped (the "couldn't be read" wording). */
  remoteSkipped?: boolean;
  /** Rows on this device the cloud refused (`dirty = 2`): kept locally, exported, not in the account (M7-D1/D5). */
  rejected?: number;
}

/** Epoch milliseconds of an ISO timestamp; `NaN` when unparsable. */
export function stampMs(value: ISODateTime | null | undefined): number {
  if (typeof value !== 'string') return Number.NaN;
  return Date.parse(value);
}

/** Compare two timestamps as instants: negative when `a` is earlier. Unparsable values sort first. */
export function compareStamps(a: ISODateTime | null | undefined, b: ISODateTime | null | undefined): number {
  const ma = stampMs(a);
  const mb = stampMs(b);
  const na = Number.isNaN(ma) ? Number.NEGATIVE_INFINITY : ma;
  const nb = Number.isNaN(mb) ? Number.NEGATIVE_INFINITY : mb;
  return na === nb ? 0 : na < nb ? -1 : 1;
}

/** `true` when `a` is strictly later than `b` (as instants). */
export function isNewer(a: ISODateTime | null | undefined, b: ISODateTime | null | undefined): boolean {
  return compareStamps(a, b) > 0;
}

/**
 * Monotonic `updatedAt` (FR-49, ADR-21): a local edit must always be newer than the version the
 * device already holds, even when its clock runs behind. `now ≥ previous` → `now`; else `previous + 1 ms`.
 */
export function nextUpdatedAt(now: Date, previous: ISODateTime | null | undefined): ISODateTime {
  const prev = stampMs(previous);
  if (Number.isNaN(prev) || now.getTime() >= prev) return now.toISOString();
  return new Date(prev + 1).toISOString();
}

export interface Versioned {
  updatedAt: ISODateTime;
  deletedAt: ISODateTime | null;
}

export type IncomingDecision = 'apply' | 'keep-local';

/**
 * Client-side last-write-wins (ADR-21). The server keeps its row on a tie (trigger `updated_at <=`),
 * so the client takes the server row on a tie: both sides then agree. A tombstone is just an edit.
 */
export function resolveIncoming(local: Versioned | undefined, remote: Versioned): IncomingDecision {
  if (!local) return 'apply';
  return compareStamps(remote.updatedAt, local.updatedAt) >= 0 ? 'apply' : 'keep-local';
}

/** `true` when two versioned rows carry the same `updatedAt` instant and the same deleted-ness. */
export function sameVersion(a: Versioned, b: Versioned): boolean {
  return compareStamps(a.updatedAt, b.updatedAt) === 0 && (a.deletedAt === null) === (b.deletedAt === null);
}

export interface PrefGroupMeta {
  /** `null` = this device never chose a value for the group (the cloud value wins, FR-55 a). */
  updatedAt: ISODateTime | null;
  dirty: 0 | 1;
}

export type PrefDecision = 'apply' | 'keep-local' | 'none';

/**
 * Per-group rule for synced preferences (ARCHITECTURE §4.4 table, FR-55, ADR-25):
 * device never chose + cloud has a value → apply; device chose + cloud empty → keep (push);
 * both empty → nothing; both set → the later wins, tie → cloud.
 */
export function resolvePrefGroup(local: PrefGroupMeta, remote: { updatedAt: ISODateTime } | null): PrefDecision {
  if (!remote) return local.updatedAt === null ? 'none' : 'keep-local';
  if (local.updatedAt === null) return 'apply';
  return compareStamps(remote.updatedAt, local.updatedAt) >= 0 ? 'apply' : 'keep-local';
}

/** Pull window (ARCHITECTURE §5.10): re-read rows committed up to this long before the stored cursor. */
export const PULL_WINDOW_MS = 120_000;

export interface PullCursorLike {
  serverUpdatedAt: ISODateTime;
  id: string;
}

/**
 * The cursor a cycle starts a pull from: the stored cursor moved back by `PULL_WINDOW_MS`
 * (id reset, so every row inside the window is re-read; re-applying is idempotent).
 */
export function rewindCursor(cursor: PullCursorLike | null, windowMs = PULL_WINDOW_MS): PullCursorLike | null {
  if (!cursor) return null;
  const ms = stampMs(cursor.serverUpdatedAt);
  if (Number.isNaN(ms)) return null;
  return { serverUpdatedAt: new Date(ms - windowMs).toISOString(), id: '' };
}

/** Retry delays after a failed cycle, seconds (FR-46): 30, 60, 120, 240, 480, 900, 900, … */
export const BACKOFF_STEPS_S = [30, 60, 120, 240, 480, 900] as const;

export function backoffMs(failures: number): number {
  const i = Math.min(Math.max(failures, 1), BACKOFF_STEPS_S.length) - 1;
  return BACKOFF_STEPS_S[i] * 1000;
}

/** The sync markers of a stored row (`dirty`: 0 synced, 1 waiting, 2 refused by the cloud — ADR-28). */
export interface TombstoneCandidate {
  deletedAt: ISODateTime | null;
  dirty: 0 | 1 | 2;
}

export interface PurgeRule {
  /** The device never synced: kv `sync` missing, or `userId` and `lastUserId` both null (nobody needs its tombstones). */
  neverSynced: boolean;
  /** `TOMBSTONE_RETENTION_DAYS`. */
  retentionDays: number;
}

/**
 * ADR-29: a tombstone may be hard-deleted locally once it is at least `retentionDays` old AND the
 * cloud cannot still need it from this device: `dirty = 0` (the server holds its own tombstone),
 * `dirty = 2` (the cloud never accepted the row), or the device never synced. A `dirty = 1`
 * tombstone of a device that did sync must stay so that signing in again can push the deletion
 * (A-33). Live rows and unparsable `deletedAt` values are never purged.
 */
export function isPurgeableTombstone(row: TombstoneCandidate, now: Date, rule: PurgeRule): boolean {
  if (row.deletedAt === null) return false;
  const deleted = stampMs(row.deletedAt);
  if (Number.isNaN(deleted)) return false;
  if (now.getTime() - deleted < rule.retentionDays * 86_400_000) return false;
  return row.dirty !== 1 || rule.neverSynced;
}
