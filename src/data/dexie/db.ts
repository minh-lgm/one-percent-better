import Dexie, { liveQuery, type Table } from 'dexie';
import type { Goal, LogEntry } from '../../domain/types';
import { StorageError } from '../../domain/types';
import type { KvKey, Subscribable } from '../repositories';

export interface KvRecord {
  key: KvKey;
  value: unknown;
}

/** Dexie schema v1 (ARCHITECTURE §4). */
export class AppDatabase extends Dexie {
  goals!: Table<Goal, string>;
  entries!: Table<LogEntry, string>;
  kv!: Table<KvRecord, KvKey>;

  constructor(name: string) {
    super(name);
    this.version(1).stores({
      goals: 'id',
      entries: 'id, goalId, date, [goalId+date]',
      kv: 'key',
    });
  }
}

export function createDatabase(name: string): AppDatabase {
  return new AppDatabase(name);
}

/** Open the database, converting any failure into a `StorageError`. */
export async function openDatabase(db: AppDatabase): Promise<void> {
  try {
    await db.open();
  } catch (cause) {
    throw new StorageError('IndexedDB could not be opened', { cause });
  }
}

/** Wrap a Dexie `liveQuery` as a `Subscribable`. */
export function fromLiveQuery<T>(querier: () => Promise<T> | T): Subscribable<T> {
  return {
    subscribe(onNext, onError) {
      const sub = liveQuery(querier).subscribe({
        next: onNext,
        error: (e: unknown) => onError?.(e),
      });
      return () => sub.unsubscribe();
    },
  };
}
