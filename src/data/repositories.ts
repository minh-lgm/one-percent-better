import type { Goal, ISODate, LogEntry, Settings } from '../domain/types';

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
  delete(key: KvKey): Promise<void>;
  watch<T>(key: KvKey): Subscribable<T | undefined>;
}

export interface BackupData {
  goals: Goal[];
  entries: LogEntry[];
  settings: Settings;
}

/** Implemented in M3. */
export interface BackupRepository {
  exportAll(): Promise<BackupData>;
  replaceAll(data: BackupData): Promise<void>;
}
