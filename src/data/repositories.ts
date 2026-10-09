import type { ActiveTimer, Goal, ISODate, LogEntry, Settings } from '../domain/types';

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

export type KvKey = 'settings' | 'activeTimer' | 'locale';

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
