import { nextUpdatedAt, resolveIncoming, sameVersion } from '../../domain/sync';
import type { Goal, LogEntry } from '../../domain/types';
import {
  isLive,
  normalizePrefsSync,
  toSyncRecord,
  type ApplyResult,
  type EntryRow,
  type GoalRow,
  type LocalSyncStore,
  type RemoteChanges,
  type Subscribable,
  type SyncRecord,
} from '../repositories';
import { fromLiveQuery, type AppDatabase } from './db';

/**
 * `LocalSyncStore` on Dexie v2 (ARCHITECTURE §5.2, §5.10, ADR-20/21). `applyRemote` is one
 * readwrite transaction over goals + entries (atomic per batch, serialised across tabs); no
 * non-Dexie promise is awaited inside (ADR-16).
 */
export class DexieSyncStore implements LocalSyncStore {
  constructor(private readonly db: AppDatabase) {}

  getDirty(limit: number): Promise<RemoteChanges> {
    return this.db.transaction('r', this.db.goals, this.db.entries, async () => {
      const goals = await this.db.goals.where('dirty').equals(1).limit(limit).toArray();
      const entries = await this.db.entries.where('dirty').equals(1).limit(limit).toArray();
      return { goals: goals.map(toSyncRecord), entries: entries.map(toSyncRecord) };
    });
  }

  applyRemote(changes: RemoteChanges): Promise<ApplyResult> {
    return this.db.transaction('rw', this.db.goals, this.db.entries, async () => {
      const result: ApplyResult = { applied: 0, keptLocal: 0, skippedInvalid: 0 };
      const goalsToWrite: GoalRow[] = [];
      const tombstonedGoals: Array<{ id: string; deletedAt: string }> = [];
      const goalIds = changes.goals.map((g) => g.id);
      const localGoals = await this.db.goals.bulkGet(goalIds);
      changes.goals.forEach((remote, i) => {
        const local = localGoals[i];
        const canonical = asGoalRow(remote);
        if (local && sameVersion(local, remote)) {
          // Same version: the server copy is the canonical one; usually identical → only `dirty` drops.
          if (local.dirty === 1 || !equalRows(local, canonical)) goalsToWrite.push(canonical);
          result.applied += 1;
          return;
        }
        if (resolveIncoming(local, remote) === 'keep-local') {
          result.keptLocal += 1;
          return;
        }
        goalsToWrite.push(canonical);
        result.applied += 1;
        if (remote.deletedAt !== null) tombstonedGoals.push({ id: remote.id, deletedAt: remote.deletedAt });
      });
      if (goalsToWrite.length > 0) await this.db.goals.bulkPut(goalsToWrite);

      const entriesToWrite: EntryRow[] = [];
      const entryIds = changes.entries.map((e) => e.id);
      const localEntries = await this.db.entries.bulkGet(entryIds);
      const written = new Set<string>();
      changes.entries.forEach((remote, i) => {
        const local = localEntries[i];
        const canonical = asEntryRow(remote);
        if (local && sameVersion(local, remote)) {
          if (local.dirty === 1 || !equalRows(local, canonical)) entriesToWrite.push(canonical);
          result.applied += 1;
          written.add(remote.id);
          return;
        }
        if (resolveIncoming(local, remote) === 'keep-local') {
          result.keptLocal += 1;
          return;
        }
        entriesToWrite.push(canonical);
        written.add(remote.id);
        result.applied += 1;
      });

      // Cascade: a goal tombstone takes its live entries with it (ADR-20). Entries already written
      // in this batch keep the batch's version (the remote row is the canonical one).
      for (const { id, deletedAt } of tombstonedGoals) {
        const live = (await this.db.entries.where('goalId').equals(id).toArray()).filter((e) => isLive(e) && !written.has(e.id));
        for (const e of live) {
          const stamp = nextUpdatedAt(new Date(deletedAt), e.updatedAt);
          entriesToWrite.push({ ...e, updatedAt: stamp, deletedAt: stamp, dirty: 1 });
        }
      }
      if (entriesToWrite.length > 0) await this.db.entries.bulkPut(entriesToWrite);
      return result;
    });
  }

  markAllDirty(): Promise<number> {
    return this.db.transaction('rw', this.db.goals, this.db.entries, async () => {
      const g = await this.db.goals.filter(isLive).modify({ dirty: 1 });
      const e = await this.db.entries.filter(isLive).modify({ dirty: 1 });
      return g + e;
    });
  }

  tombstoneOrphanEntries(now: Date): Promise<number> {
    return this.db.transaction('rw', this.db.goals, this.db.entries, async () => {
      const deleted = new Set<string>();
      await this.db.goals.filter((g) => !isLive(g)).each((g) => {
        deleted.add(g.id);
      });
      if (deleted.size === 0) return 0;
      const orphans = (await this.db.entries.where('goalId').anyOf([...deleted]).toArray()).filter(isLive);
      if (orphans.length === 0) return 0;
      await this.db.entries.bulkPut(
        orphans.map((e) => {
          const stamp = nextUpdatedAt(now, e.updatedAt);
          return { ...e, updatedAt: stamp, deletedAt: stamp, dirty: 1 };
        }),
      );
      return orphans.length;
    });
  }

  countDirty(): Promise<number> {
    return this.db.transaction('r', this.db.goals, this.db.entries, this.db.kv, async () => {
      const g = await this.db.goals.where('dirty').equals(1).count();
      const e = await this.db.entries.where('dirty').equals(1).count();
      const prefs = normalizePrefsSync((await this.db.kv.get('prefsSync'))?.value);
      return g + e + prefs.reminder.dirty + prefs.locale.dirty;
    });
  }

  watchPendingCount(): Subscribable<number> {
    return fromLiveQuery(() => this.countDirty());
  }

  markRejected(ids: { goals: string[]; entries: string[] }): Promise<number> {
    return this.db.transaction('rw', this.db.goals, this.db.entries, async () => {
      let n = 0;
      if (ids.goals.length > 0) n += await this.db.goals.where('id').anyOf(ids.goals).and((g) => g.dirty === 1).modify({ dirty: 2 });
      if (ids.entries.length > 0) n += await this.db.entries.where('id').anyOf(ids.entries).and((e) => e.dirty === 1).modify({ dirty: 2 });
      return n;
    });
  }

  countRejected(): Promise<number> {
    return this.db.transaction('r', this.db.goals, this.db.entries, async () => (await this.db.goals.where('dirty').equals(2).count()) + (await this.db.entries.where('dirty').equals(2).count()));
  }
}

/** Field-by-field equality of two rows (both already normalised to the row shape). */
function equalRows<T extends object>(a: T, b: T): boolean {
  const ra = a as Record<string, unknown>;
  const rb = b as Record<string, unknown>;
  const keys = new Set([...Object.keys(ra), ...Object.keys(rb)]);
  for (const k of keys) if (ra[k] !== rb[k]) return false;
  return true;
}

function asGoalRow(remote: SyncRecord<Goal>): GoalRow {
  return {
    id: remote.id,
    name: remote.name,
    why: remote.why,
    targetType: remote.targetType,
    targetMinutes: remote.targetMinutes,
    startDate: remote.startDate,
    endDate: remote.endDate,
    archived: remote.archived,
    createdAt: remote.createdAt,
    updatedAt: remote.updatedAt,
    deletedAt: remote.deletedAt,
    dirty: 0,
  };
}

function asEntryRow(remote: SyncRecord<LogEntry>): EntryRow {
  return {
    id: remote.id,
    goalId: remote.goalId,
    date: remote.date,
    minutes: remote.minutes,
    note: remote.note,
    source: remote.source,
    createdAt: remote.createdAt,
    updatedAt: remote.updatedAt,
    deletedAt: remote.deletedAt,
    dirty: 0,
  };
}
