import Dexie, { liveQuery, type Table, type Transaction } from 'dexie';
import { normalizeSettings } from '../../domain/settings';
import { DEFAULT_SETTINGS, StorageError } from '../../domain/types';
import { isLocale } from '../../i18n/types';
import type { Goal, LogEntry } from '../../domain/types';
import type { EntryRow, GoalRow, KvKey, PrefsSyncState, Subscribable } from '../repositories';

export interface KvRecord {
  key: KvKey;
  value: unknown;
}

/** Marker for preferences chosen before sync existed (A-36): older than any cloud value. */
export const PHASE1_PREF_STAMP = '1970-01-01T00:00:00.000Z';

export interface AppDatabaseOptions {
  /** Test seam: runs inside the v1 → v2 upgrade transaction after the rows were rewritten (throw to simulate a failure). */
  upgradeProbe?: () => void;
}

/**
 * Dexie schema (ARCHITECTURE §4, §4.2). v1: plain goals/entries/kv. v2 (M7, ADR-20): every
 * goal/entry row carries `deletedAt` (soft delete) and `dirty` (indexed: rows waiting to be pushed);
 * kv gains `prefsSync`. Dexie runs `upgrade` in the `versionchange` transaction: any failure rolls
 * IndexedDB back to v1 untouched (NFR-14).
 */
export class AppDatabase extends Dexie {
  /** Insert type accepts plain domain objects (tests seed rows without the sync markers; such rows read as live). */
  goals!: Table<GoalRow, string, Goal & Partial<GoalRow>>;
  entries!: Table<EntryRow, string, LogEntry & Partial<EntryRow>>;
  kv!: Table<KvRecord, KvKey>;

  constructor(name: string, options: AppDatabaseOptions = {}) {
    super(name);
    this.version(1).stores({
      goals: 'id',
      entries: 'id, goalId, date, [goalId+date]',
      kv: 'key',
    });
    this.version(2)
      .stores({
        goals: 'id, dirty',
        entries: 'id, goalId, date, [goalId+date], dirty',
        kv: 'key',
      })
      .upgrade((tx) => upgradeToV2(tx, options.upgradeProbe));
  }
}

/** v1 → v2 (ARCHITECTURE §4.2): existing rows become live + dirty (first sign-in pushes = merge); pref markers per A-36. */
export async function upgradeToV2(tx: Transaction, probe?: () => void): Promise<void> {
  await tx.table('goals').toCollection().modify((row: Partial<GoalRow>) => {
    row.deletedAt = null;
    row.dirty = 1;
  });
  await tx.table('entries').toCollection().modify((row: Partial<EntryRow>) => {
    row.deletedAt = null;
    row.dirty = 1;
  });
  const kv = tx.table<KvRecord, KvKey>('kv');
  const locale = (await kv.get('locale'))?.value;
  const settings = normalizeSettings((await kv.get('settings'))?.value);
  const chosenReminder = settings.reminderEnabled !== DEFAULT_SETTINGS.reminderEnabled || settings.reminderTime !== DEFAULT_SETTINGS.reminderTime;
  const prefsSync: PrefsSyncState = {
    reminder: chosenReminder ? { updatedAt: PHASE1_PREF_STAMP, dirty: 1 } : { updatedAt: null, dirty: 0 },
    locale: isLocale(locale) ? { updatedAt: PHASE1_PREF_STAMP, dirty: 1 } : { updatedAt: null, dirty: 0 },
  };
  await kv.put({ key: 'prefsSync', value: prefsSync });
  probe?.();
}

export function createDatabase(name: string, options?: AppDatabaseOptions): AppDatabase {
  return new AppDatabase(name, options);
}

/** Open the database, converting any failure (including a failed upgrade) into a `StorageError`. */
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
