import type { Table } from 'dexie';
import { TOMBSTONE_RETENTION_DAYS } from '../../config/constants';
import { isPurgeableTombstone, nextUpdatedAt, resolveIncoming, sameVersion } from '../../domain/sync';
import {
  emptyChanges,
  isLive,
  normalizePrefsSync,
  toSyncRecord,
  type ApplyResult,
  type FullRemoteChanges,
  type IdsByTable,
  type LocalSyncStore,
  type PurgeCounts,
  type RemoteChanges,
  type Subscribable,
} from '../repositories';
import { SYNC_TABLES, syncTables, type LocalTable, type SyncGroup, type SyncTableSpec } from '../sync-tables';
import { fromLiveQuery, type AppDatabase } from './db';
import { purgeTombstones } from './purge-tombstones';

/** The shape every synced row shares; table-specific fields are carried as a record. */
type AnyRow = Record<string, unknown> & { id: string; updatedAt: string; deletedAt: string | null; dirty: 0 | 1 | 2 };
type AnyRecord = Record<string, unknown> & { id: string; updatedAt: string; deletedAt: string | null };
type AnyTable = Table<AnyRow, string>;

/**
 * The fields of each table as stored (ARCHITECTURE §4.1, §4.8 a): a remote record is reduced to exactly these, so
 * nothing the cloud adds (e.g. `server_updated_at` leftovers) reaches IndexedDB (NFR-05).
 */
const FIELDS: Record<LocalTable, readonly string[]> = {
  goals: ['id', 'name', 'why', 'targetType', 'targetMinutes', 'startDate', 'endDate', 'archived', 'createdAt', 'updatedAt', 'deletedAt'],
  entries: ['id', 'goalId', 'date', 'minutes', 'note', 'source', 'createdAt', 'updatedAt', 'deletedAt'],
  roadmaps: ['id', 'title', 'note', 'goalId', 'weeklyTargetMinutes', 'milestoneLabel', 'milestoneDate', 'createdAt', 'updatedAt', 'deletedAt'],
  roadmapPhases: ['id', 'roadmapId', 'title', 'note', 'position', 'createdAt', 'updatedAt', 'deletedAt'],
  roadmapItems: ['id', 'roadmapId', 'phaseId', 'title', 'note', 'position', 'plannedStart', 'plannedEnd', 'actualStart', 'actualEnd', 'createdAt', 'updatedAt', 'deletedAt'],
  roadmapCheckpoints: ['id', 'roadmapId', 'title', 'note', 'date', 'maxScore', 'threshold', 'score', 'createdAt', 'updatedAt', 'deletedAt'],
};

/**
 * Cascades (ADR-20, v8.0 §4.8 h): a parent tombstone takes the live children with it. `children` finds the live
 * candidates of one tombstoned parent record (the parent may be a remote record without a local row).
 */
interface Cascade {
  parent: LocalTable;
  child: LocalTable;
  children: (db: AppDatabase, parent: AnyRecord) => Promise<AnyRow[]>;
}

const byIndex = (table: AnyTable, index: string, value: unknown) => table.where(index).equals(value as string).toArray();

const CASCADES: readonly Cascade[] = [
  { parent: 'goals', child: 'entries', children: (db, g) => byIndex(db.entries as unknown as AnyTable, 'goalId', g.id) },
  { parent: 'roadmaps', child: 'roadmapPhases', children: (db, r) => byIndex(db.roadmapPhases as unknown as AnyTable, 'roadmapId', r.id) },
  { parent: 'roadmaps', child: 'roadmapItems', children: (db, r) => byIndex(db.roadmapItems as unknown as AnyTable, 'roadmapId', r.id) },
  { parent: 'roadmaps', child: 'roadmapCheckpoints', children: (db, r) => byIndex(db.roadmapCheckpoints as unknown as AnyTable, 'roadmapId', r.id) },
  // `phaseId` is not indexed: items of the phase's roadmap, filtered.
  { parent: 'roadmapPhases', child: 'roadmapItems', children: async (db, p) => (await byIndex(db.roadmapItems as unknown as AnyTable, 'roadmapId', p.roadmapId)).filter((i) => i.phaseId === p.id) },
];

/**
 * `LocalSyncStore` on Dexie (ARCHITECTURE §5.2, §5.10, ADR-20/21; v8.0 ADR-50: six tables driven by `SYNC_TABLES`).
 * `applyRemote` is one readwrite transaction over the six tables (atomic per batch, serialised across tabs); no
 * non-Dexie promise is awaited inside (ADR-16).
 */
export class DexieSyncStore implements LocalSyncStore {
  constructor(
    private readonly db: AppDatabase,
    private readonly clock: () => Date = () => new Date(),
  ) {}

  private table(name: LocalTable): AnyTable {
    return this.db[name] as unknown as AnyTable;
  }

  private get allTables(): AnyTable[] {
    return SYNC_TABLES.map((t) => this.table(t.local));
  }

  /**
   * ADR-29 follow-up (M10 fix round 1): a remote tombstone for a record this device does not hold, old
   * enough to be purged right away, is not stored — storing it would only re-create a row the startup
   * purge just removed (the 120 s pull window re-reads the newest rows). Its cascade still runs.
   */
  private isStaleRemoteTombstone(remote: { deletedAt: string | null }): boolean {
    return remote.deletedAt !== null && isPurgeableTombstone({ deletedAt: remote.deletedAt, dirty: 0 }, this.clock(), { neverSynced: false, retentionDays: TOMBSTONE_RETENTION_DAYS });
  }

  getDirty(limit: number, group?: SyncGroup): Promise<FullRemoteChanges> {
    const specs = syncTables(group);
    return this.db.transaction('r', this.allTables, async () => {
      const out = emptyChanges();
      for (const spec of specs) {
        const rows = await this.table(spec.local).where('dirty').equals(1).limit(limit).toArray();
        (out as unknown as Record<LocalTable, unknown[]>)[spec.local] = rows.map(toSyncRecord);
      }
      return out;
    });
  }

  applyRemote(changes: RemoteChanges): Promise<ApplyResult> {
    return this.db.transaction('rw', this.allTables, async () => {
      const result: ApplyResult = { applied: 0, keptLocal: 0, skippedInvalid: 0 };
      const toWrite = {} as Record<LocalTable, AnyRow[]>;
      const written = {} as Record<LocalTable, Set<string>>;
      const tombstoned = {} as Record<LocalTable, AnyRecord[]>;

      // 1. Every table, parents first: LWW per row against the local copy.
      for (const spec of SYNC_TABLES) {
        const remoteRows = (changes[spec.local] ?? []) as unknown as AnyRecord[];
        const writes: AnyRow[] = [];
        const seen = new Set<string>();
        const stones: AnyRecord[] = [];
        const locals = remoteRows.length > 0 ? await this.table(spec.local).bulkGet(remoteRows.map((r) => r.id)) : [];
        remoteRows.forEach((remote, i) => {
          const local = locals[i];
          const canonical = asRow(spec, remote);
          if (local && sameVersion(local, remote)) {
            // Same version: the server copy is the canonical one; usually identical → only `dirty` drops.
            if (local.dirty === 1 || !equalRows(local, canonical)) writes.push(canonical);
            result.applied += 1;
            seen.add(remote.id);
            return;
          }
          if (resolveIncoming(local, remote) === 'keep-local') {
            result.keptLocal += 1;
            return;
          }
          result.applied += 1;
          seen.add(remote.id);
          if (!local && this.isStaleRemoteTombstone(remote)) {
            // Nothing to delete here and nothing worth keeping: count it, cascade, do not store (ADR-29).
            stones.push(remote);
            return;
          }
          writes.push(canonical);
          if (remote.deletedAt !== null) stones.push(remote);
        });
        toWrite[spec.local] = writes;
        written[spec.local] = seen;
        tombstoned[spec.local] = stones;
      }

      // 2. Cascades: a parent tombstone takes its live children with it (ADR-20). Children already written in this
      //    batch keep the batch's version (the remote row is the canonical one).
      for (const cascade of CASCADES) {
        for (const parent of tombstoned[cascade.parent]) {
          const live = (await cascade.children(this.db, parent)).filter((c) => isLive(c) && !written[cascade.child].has(c.id));
          for (const c of live) {
            const stamp = nextUpdatedAt(new Date(parent.deletedAt!), c.updatedAt);
            toWrite[cascade.child].push({ ...c, updatedAt: stamp, deletedAt: stamp, dirty: 1 });
            written[cascade.child].add(c.id);
          }
        }
      }

      // 3. Write, parents first.
      for (const spec of SYNC_TABLES) if (toWrite[spec.local].length > 0) await this.table(spec.local).bulkPut(toWrite[spec.local]);
      return result;
    });
  }

  markAllDirty(): Promise<number> {
    return this.db.transaction('rw', this.allTables, async () => {
      let n = 0;
      for (const t of this.allTables) n += await t.filter(isLive).modify({ dirty: 1 });
      return n;
    });
  }

  tombstoneOrphanEntries(now: Date): Promise<number> {
    return this.db.transaction('rw', this.allTables, async () => {
      let n = 0;
      // Parents first: a phase tombstoned here because its roadmap is gone is seen as deleted by the items step.
      for (const spec of SYNC_TABLES) {
        if (spec.parents.length === 0) continue;
        const orphans = new Map<string, AnyRow>();
        for (const parent of spec.parents) {
          const deleted = new Set<string>();
          await this.table(parent.table)
            .filter((r) => !isLive(r))
            .each((r) => {
              deleted.add(r.id);
            });
          if (deleted.size === 0) continue;
          const children = parent.indexed
            ? await this.table(spec.local).where(parent.field).anyOf([...deleted]).toArray()
            : await this.table(spec.local).filter((r) => deleted.has(r[parent.field] as string)).toArray();
          for (const c of children) if (isLive(c)) orphans.set(c.id, c);
        }
        if (orphans.size === 0) continue;
        await this.table(spec.local).bulkPut(
          [...orphans.values()].map((c) => {
            const stamp = nextUpdatedAt(now, c.updatedAt);
            return { ...c, updatedAt: stamp, deletedAt: stamp, dirty: 1 as const };
          }),
        );
        n += orphans.size;
      }
      return n;
    });
  }

  countDirty(group?: SyncGroup): Promise<number> {
    const specs = syncTables(group);
    return this.db.transaction('r', [...this.allTables, this.db.kv], async () => {
      let n = 0;
      for (const spec of specs) n += await this.table(spec.local).where('dirty').equals(1).count();
      if (group) return n;
      const prefs = normalizePrefsSync((await this.db.kv.get('prefsSync'))?.value);
      return n + prefs.reminder.dirty + prefs.locale.dirty;
    });
  }

  watchPendingCount(): Subscribable<number> {
    return fromLiveQuery(() => this.countDirty());
  }

  markRejected(ids: IdsByTable): Promise<number> {
    return this.db.transaction('rw', this.allTables, async () => {
      let n = 0;
      for (const spec of SYNC_TABLES) {
        const list = ids[spec.local];
        if (list && list.length > 0) n += await this.table(spec.local).where('id').anyOf(list).and((r) => r.dirty === 1).modify({ dirty: 2 });
      }
      return n;
    });
  }

  countRejected(): Promise<number> {
    return this.db.transaction('r', this.allTables, async () => {
      let n = 0;
      for (const t of this.allTables) n += await t.where('dirty').equals(2).count();
      return n;
    });
  }

  purgeTombstones(now: Date): Promise<PurgeCounts> {
    return purgeTombstones(this.db, now);
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

/** The remote record reduced to the table's stored fields, `dirty = 0` (the server copy is in sync by definition). */
function asRow(spec: SyncTableSpec, remote: AnyRecord): AnyRow {
  const row = { dirty: 0 } as unknown as AnyRow;
  for (const f of FIELDS[spec.local]) row[f] = remote[f];
  return row;
}
