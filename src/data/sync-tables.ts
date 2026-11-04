// The synced tables, as data (phase 8, M18; ARCHITECTURE §4.8 h, ADR-50). The sync engine, the local
// store, the remote stores, the fake and the mock loop over this list instead of naming goals/entries
// by hand. Order = push/pull order (parents before children). Pure data: no imports, so it costs nothing
// wherever it lands.

/** Remote (PostgREST) table names. */
export type RemoteTable = 'goals' | 'entries' | 'roadmaps' | 'roadmap_phases' | 'roadmap_items' | 'roadmap_checkpoints';
/** Local (Dexie) table names; also the keys of `RemoteChanges` / `PushResult.rejected` / `fetchByIds` ids. */
export type LocalTable = 'goals' | 'entries' | 'roadmaps' | 'roadmapPhases' | 'roadmapItems' | 'roadmapCheckpoints';
/** Pushed with separate requests so that a missing roadmap table on the cloud cannot fail the core group (ADR-52). */
export type SyncGroup = 'core' | 'roadmap';

export interface SyncParentRef {
  /** Local table of the parent. */
  table: LocalTable;
  /** Field of the child row that holds the parent id. */
  field: string;
  /** Whether `field` is a Dexie index (`where(field)`); otherwise children are found with `filter`. */
  indexed: boolean;
}

export interface SyncTableSpec {
  remote: RemoteTable;
  local: LocalTable;
  group: SyncGroup;
  /** Parents whose tombstone soft-deletes this row (cascade on apply, orphan cleanup at the end of a cycle). */
  parents: readonly SyncParentRef[];
}

export const SYNC_TABLES: readonly SyncTableSpec[] = [
  { remote: 'goals', local: 'goals', group: 'core', parents: [] },
  { remote: 'entries', local: 'entries', group: 'core', parents: [{ table: 'goals', field: 'goalId', indexed: true }] },
  { remote: 'roadmaps', local: 'roadmaps', group: 'roadmap', parents: [] },
  { remote: 'roadmap_phases', local: 'roadmapPhases', group: 'roadmap', parents: [{ table: 'roadmaps', field: 'roadmapId', indexed: true }] },
  {
    remote: 'roadmap_items',
    local: 'roadmapItems',
    group: 'roadmap',
    parents: [
      { table: 'roadmaps', field: 'roadmapId', indexed: true },
      { table: 'roadmapPhases', field: 'phaseId', indexed: false },
    ],
  },
  { remote: 'roadmap_checkpoints', local: 'roadmapCheckpoints', group: 'roadmap', parents: [{ table: 'roadmaps', field: 'roadmapId', indexed: true }] },
];

export const SYNC_GROUPS: readonly SyncGroup[] = ['core', 'roadmap'];

/** The specs of one group, or all of them, in sync order. */
export function syncTables(group?: SyncGroup): readonly SyncTableSpec[] {
  return group ? SYNC_TABLES.filter((t) => t.group === group) : SYNC_TABLES;
}

export const ROADMAP_REMOTE_TABLES: ReadonlySet<RemoteTable> = new Set(SYNC_TABLES.filter((t) => t.group === 'roadmap').map((t) => t.remote));

export function specOf(remote: RemoteTable): SyncTableSpec {
  const spec = SYNC_TABLES.find((t) => t.remote === remote);
  if (!spec) throw new Error(`unknown sync table ${remote}`);
  return spec;
}

export function isRoadmapTable(remote: RemoteTable | string): boolean {
  return ROADMAP_REMOTE_TABLES.has(remote as RemoteTable);
}
