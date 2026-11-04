// Tombstone purge (v3.1, ADR-29), its own module since M18: `app/maintenance` runs it at every start, cloud on or
// off, so it must stay on the cold-load path while the rest of `DexieSyncStore` is loaded lazily with the sync
// engine (ARCH §10 "lazy sync"). `DexieSyncStore.purgeTombstones` delegates here.
import type { Table } from 'dexie';
import { TOMBSTONE_RETENTION_DAYS } from '../../config/constants';
import { isPurgeableTombstone } from '../../domain/sync';
import { normalizeSyncMeta, SYNC_LOCAL_TABLES, type PurgeCounts } from '../repositories';
import type { AppDatabase } from './db';

type TombstoneRow = { id: string; deletedAt: string | null; dirty: 0 | 1 | 2 };

/**
 * Hard-delete the tombstones `isPurgeableTombstone` allows, in ONE readwrite transaction over the six synced tables +
 * kv (kv `sync` is read inside it to know whether the device ever synced). Returns how many rows went per table; a
 * failure rolls everything back.
 */
export function purgeTombstones(db: AppDatabase, now: Date): Promise<PurgeCounts> {
  return db.transaction('rw', [...SYNC_LOCAL_TABLES.map((t) => db[t]), db.kv], async () => {
    const raw = await db.kv.get('sync');
    const meta = raw ? normalizeSyncMeta(raw.value) : null;
    const rule = { neverSynced: !meta || (meta.userId === null && meta.lastUserId === null), retentionDays: TOMBSTONE_RETENTION_DAYS };
    const counts = {} as PurgeCounts;
    for (const t of SYNC_LOCAL_TABLES) {
      const ids: string[] = [];
      await (db[t] as Table<TombstoneRow, string>).filter((r) => isPurgeableTombstone(r, now, rule)).each((r) => {
        ids.push(r.id);
      });
      if (ids.length > 0) await db[t].bulkDelete(ids);
      counts[t] = ids.length;
    }
    return counts;
  });
}
