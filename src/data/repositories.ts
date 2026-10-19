import type { PrefGroupMeta, SyncErrorCode } from '../domain/sync';
import type { ActiveTimer, Goal, ISODate, ISODateTime, LogEntry, Settings } from '../domain/types';
import type { Locale } from '../i18n/types';

export interface Subscribable<T> {
  subscribe(onNext: (value: T) => void, onError?: (e: unknown) => void): () => void;
}

export interface GoalRepository {
  getAll(): Promise<Goal[]>;
  getById(id: string): Promise<Goal | undefined>;
  put(goal: Goal): Promise<void>;
  /** Deletes the goal and all its entries in one transaction. */
  deleteWithEntries(id: string): Promise<void>;
  watchAll(): Subscribable<Goal[]>;
}

export interface EntryRepository {
  /** Primary-key lookup (M3-T7): never scans. */
  getById(id: string): Promise<LogEntry | undefined>;
  getByGoal(goalId: string): Promise<LogEntry[]>;
  getByDateRange(from: ISODate, to: ISODate): Promise<LogEntry[]>;
  sumMinutes(goalId: string, date: ISODate, excludeEntryId?: string): Promise<number>;
  put(entry: LogEntry): Promise<void>;
  delete(id: string): Promise<void>;
  watchByDateRange(from: ISODate, to: ISODate): Subscribable<LogEntry[]>;
  watchByGoal(goalId: string): Subscribable<LogEntry[]>;
}

export type KvKey = 'settings' | 'activeTimer' | 'locale' | 'sync' | 'loginPrompt' | 'prefsSync';

/** Keyset cursor for pulling rows from the cloud (M7). */
export interface PullCursor {
  serverUpdatedAt: ISODateTime;
  id: string;
}

/** kv key `sync` (ARCHITECTURE §4.1). M6 uses `userId`, `lastUserId`, `account`; the rest is for M7. */
export interface SyncMeta {
  /** Account currently signed in on this device (null after sign-out). */
  userId: string | null;
  /** Last account that synced on this device (FR-47, kept across sign-outs). */
  lastUserId: string | null;
  /** Shown immediately while offline / before the SDK loads (FR-40). */
  account: { email: string; name: string } | null;
  cursor: { goals: PullCursor | null; entries: PullCursor | null };
  lastSyncedAt: ISODateTime | null;
  lastError: { code: SyncErrorCode; at: ISODateTime } | null;
  /**
   * v4.0 (M11, ADR-33): the schema generation this device last re-pulled `goals` for. Missing = 0;
   * below `PULL_RESET_VERSION` → `SyncService` resets `cursor.goals` once at the start of its next cycle.
   */
  pullResetVersion?: number;
}

export const EMPTY_SYNC_META: SyncMeta = {
  userId: null,
  lastUserId: null,
  account: null,
  cursor: { goals: null, entries: null },
  lastSyncedAt: null,
  lastError: null,
};

/** Normalise whatever is stored under kv `sync` into a complete `SyncMeta` (corrupt → defaults). */
export function normalizeSyncMeta(raw: unknown): SyncMeta {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Partial<Record<keyof SyncMeta, unknown>>;
  const account = r.account && typeof r.account === 'object' ? (r.account as { email?: unknown; name?: unknown }) : null;
  const cursor = r.cursor && typeof r.cursor === 'object' ? (r.cursor as { goals?: unknown; entries?: unknown }) : null;
  const isCursor = (c: unknown): c is PullCursor =>
    !!c && typeof c === 'object' && typeof (c as PullCursor).serverUpdatedAt === 'string' && typeof (c as PullCursor).id === 'string';
  const lastError = r.lastError && typeof r.lastError === 'object' ? (r.lastError as { code?: unknown; at?: unknown }) : null;
  return {
    userId: typeof r.userId === 'string' ? r.userId : null,
    lastUserId: typeof r.lastUserId === 'string' ? r.lastUserId : null,
    account: account && typeof account.email === 'string' ? { email: account.email, name: typeof account.name === 'string' ? account.name : '' } : null,
    cursor: { goals: isCursor(cursor?.goals) ? cursor.goals : null, entries: isCursor(cursor?.entries) ? cursor.entries : null },
    lastSyncedAt: typeof r.lastSyncedAt === 'string' ? r.lastSyncedAt : null,
    lastError: lastError && typeof lastError.code === 'string' && typeof lastError.at === 'string' ? { code: lastError.code as SyncErrorCode, at: lastError.at } : null,
    ...(typeof r.pullResetVersion === 'number' && Number.isFinite(r.pullResetVersion) ? { pullResetVersion: r.pullResetVersion } : {}),
  };
}

export interface KvRepository {
  get<T>(key: KvKey): Promise<T | undefined>;
  set<T>(key: KvKey, value: T): Promise<void>;
  /**
   * Atomic read-modify-write inside one readwrite transaction (serialised across
   * tabs by IndexedDB). `fn` returns the new value, or `undefined` to leave the row
   * untouched. Resolves `{ previous, written }`.
   */
  update<T>(key: KvKey, fn: (current: T | undefined) => T | undefined): Promise<{ previous: T | undefined; written: boolean }>;
  delete(key: KvKey): Promise<void>;
  watch<T>(key: KvKey): Subscribable<T | undefined>;
}

/**
 * Outcome of `TimerRepository.saveTimerEntry` (ADR-16). Only `saved` writes anything.
 */
export type SaveTimerEntryOutcome =
  | { status: 'saved' }
  | { status: 'timer-changed' }
  | { status: 'goal-missing' }
  | { status: 'day-limit'; existingMinutes: number };

/**
 * M3 (M3-T7, ADR-16): write the timer entry and clear kv `activeTimer` in ONE
 * readwrite transaction over goals + entries + kv, serialised across tabs by
 * IndexedDB. Inside the transaction: (1) kv `activeTimer` must equal `expected`
 * (goalId + startedAt) → else `timer-changed`; (2) the goal must still exist →
 * else `goal-missing`; (3) sumMinutes(goalId, date) + entry.minutes ≤
 * `maxDayMinutes` → else `day-limit`; (4) put(entry) + delete `activeTimer`.
 */
export interface TimerRepository {
  saveTimerEntry(expected: ActiveTimer, entry: LogEntry, maxDayMinutes: number): Promise<SaveTimerEntryOutcome>;
}

export interface BackupData {
  goals: Goal[];
  entries: LogEntry[];
  settings: Settings;
}

/** M3: whole-database export and atomic replace (ADR-08). */
export interface BackupRepository {
  exportAll(): Promise<BackupData>;
  /** One transaction over goals + entries + kv; rolls back on error. Keeps kv `locale` (ADR-12), removes `activeTimer`. */
  replaceAll(data: BackupData): Promise<void>;
}

/** M6 (ARCHITECTURE §5.2): local user data as a whole, for "sign out and remove data" (FR-41). */
export interface LocalDataRepository {
  /**
   * ONE readwrite transaction over goals + entries + kv: hard-deletes every goal and
   * entry and the kv rows `settings`, `activeTimer`, `sync`, `prefsSync`. Keeps kv
   * `locale` (the UI language stays) and `loginPrompt`. Any failure rolls everything back.
   */
  clearUserData(): Promise<void>;
  /** Number of live goals/entries (sign-out / merge dialogs). */
  countLive(): Promise<{ goals: number; entries: number }>;
}

// ---- M7: sync rows, local sync store, synced preferences (ARCHITECTURE §4.1, §4.2, §5.2) ----

/** IndexedDB cannot index booleans: the "needs push" flag is 0/1. */
/** 0 = in sync, 1 = waiting to push, 2 = rejected by the cloud (kept on the device, not retried until edited; M7-D1). */
export type SyncFlag = 0 | 1 | 2;
/** What the Dexie tables hold from schema v2 on (ADR-20). Only the data layer sees these. */
export type GoalRow = Goal & { deletedAt: ISODateTime | null; dirty: SyncFlag };
export type EntryRow = LogEntry & { deletedAt: ISODateTime | null; dirty: SyncFlag };
/** Exchange format with a `RemoteStore`: domain record + tombstone marker, no `dirty`. */
export type SyncRecord<T> = T & { deletedAt: ISODateTime | null };

export interface RemoteChanges {
  goals: SyncRecord<Goal>[];
  entries: SyncRecord<LogEntry>[];
}

export interface ApplyResult {
  applied: number;
  keptLocal: number;
  skippedInvalid: number;
}

/** Strip the local-only `dirty` flag (rows → records). */
export function toSyncRecord<T extends { dirty?: SyncFlag }>(row: T): Omit<T, 'dirty'> {
  const { dirty: _dirty, ...rest } = row;
  return rest;
}

/** Strip both sync markers (rows → domain). */
export function toDomain<T extends { dirty?: SyncFlag; deletedAt?: ISODateTime | null }>(row: T): Omit<T, 'dirty' | 'deletedAt'> {
  const { dirty: _dirty, deletedAt: _deletedAt, ...rest } = row;
  return rest;
}

/** `true` for rows that are not tombstones (rows written before v2 have no `deletedAt` at all). */
export function isLive(row: { deletedAt?: ISODateTime | null } | undefined): boolean {
  return !!row && row.deletedAt == null;
}

/**
 * Local side of the sync protocol (ARCHITECTURE §5.2, §5.10). Every write is one IndexedDB
 * transaction, so it is atomic per batch and serialised across tabs.
 */
export interface LocalSyncStore {
  /** Up to `limit` dirty rows per table, goals first. Includes tombstones. */
  getDirty(limit: number): Promise<RemoteChanges>;
  /**
   * ONE readwrite transaction over goals + entries: `resolveIncoming(local, remote)` per row;
   * `apply` → write the remote row with `dirty = 0`; `keep-local` → untouched. A remote row equal to
   * the local one (same `updatedAt`, same deleted-ness) only clears `dirty`. Applying a goal
   * tombstone soft-deletes the goal's live entries (`dirty = 1`).
   */
  applyRemote(changes: RemoteChanges): Promise<ApplyResult>;
  /** `dirty = 1` on every live row (merge into another account, FR-47). Returns how many. */
  markAllDirty(): Promise<number>;
  /** Soft-delete live entries whose goal is soft-deleted (end-of-cycle cleanup). Returns how many. */
  tombstoneOrphanEntries(now: Date): Promise<number>;
  countDirty(): Promise<number>;
  /** Dirty goals + dirty entries + dirty preference groups (v2.1). */
  watchPendingCount(): Subscribable<number>;
  /** M7-D1: rows the cloud refused → `dirty = 2` (only rows still at `dirty = 1`). Returns how many were flagged. */
  markRejected(ids: { goals: string[]; entries: string[] }): Promise<number>;
  /** Rows (live or tombstoned) flagged `dirty = 2`. */
  countRejected(): Promise<number>;
  /**
   * v3.1 (M10, ADR-29): hard-delete the tombstones `isPurgeableTombstone` allows, in ONE readwrite
   * transaction over goals + entries + kv (kv `sync` is read inside it to know whether the device
   * ever synced). Returns how many rows went per table; a failure rolls everything back.
   */
  purgeTombstones(now: Date): Promise<{ goals: number; entries: number }>;
}

export type { PrefGroupMeta };
export type PrefGroup = 'reminder' | 'locale';

/** kv key `prefsSync`: only the sync markers; the values stay in kv `settings` / `locale`. */
export interface PrefsSyncState {
  reminder: PrefGroupMeta;
  locale: PrefGroupMeta;
}

export const EMPTY_PREFS_SYNC: PrefsSyncState = { reminder: { updatedAt: null, dirty: 0 }, locale: { updatedAt: null, dirty: 0 } };

function normalizeGroup(raw: unknown): PrefGroupMeta {
  const g = raw && typeof raw === 'object' ? (raw as { updatedAt?: unknown; dirty?: unknown }) : {};
  const updatedAt = typeof g.updatedAt === 'string' && !Number.isNaN(Date.parse(g.updatedAt)) ? g.updatedAt : null;
  return { updatedAt, dirty: g.dirty === 1 && updatedAt !== null ? 1 : 0 };
}

export function normalizePrefsSync(raw: unknown): PrefsSyncState {
  const r = raw && typeof raw === 'object' ? (raw as { reminder?: unknown; locale?: unknown }) : {};
  return { reminder: normalizeGroup(r.reminder), locale: normalizeGroup(r.locale) };
}

/** One `settings` row on the cloud (ARCHITECTURE §4.1). A `null` group = not set / not sent. */
export interface RemotePrefs {
  reminder: { enabled: boolean; time: string; updatedAt: ISODateTime } | null;
  locale: { value: Locale; updatedAt: ISODateTime } | null;
}

/** Synced user preferences (v2.1, FR-55): values + sync markers written in one transaction. */
export interface SyncedPrefsRepository {
  /** Update `settings.reminderEnabled/reminderTime` (other fields kept) + mark the reminder group. */
  setReminder(patch: { reminderEnabled?: boolean; reminderTime?: string }, now: Date): Promise<Settings>;
  /** kv `locale` + mark the locale group, in one transaction. */
  setLocale(locale: Locale, now: Date): Promise<void>;
  /** Groups that need a push, or `null` when none is dirty. */
  getDirty(): Promise<RemotePrefs | null>;
  /** `resolvePrefGroup` per group in one transaction; reports which local values changed. */
  applyRemote(remote: RemotePrefs | null): Promise<{ reminderChanged: boolean; localeChanged: Locale | null }>;
  /** Switch to another account (FR-47): every group with a marker becomes dirty. */
  markAllDirty(): Promise<void>;
  getState(): Promise<PrefsSyncState>;
  watchState(): Subscribable<PrefsSyncState>;
}
