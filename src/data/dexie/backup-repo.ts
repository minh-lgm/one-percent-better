import { normalizeSettings } from '../../domain/settings';
import { nextUpdatedAt } from '../../domain/sync';
import { isLive, normalizePrefsSync, toDomain, type BackupExportData, type BackupReplaceData, type BackupRepository, type PrefsSyncState } from '../repositories';
import { ROADMAP_TABLES, type AppDatabase } from './db';
import { liveGoalIds } from './entry-repo';

type Row = { id: string; updatedAt: string; deletedAt: string | null; dirty: 0 | 1 | 2 };

/**
 * Whole-database export and atomic replace (M3, ADR-08). v2 (ADR-20, A-28, A-37): the export
 * carries live rows only, as domain objects; `replaceAll` soft-deletes every live row that is not
 * in the file, writes the file's rows live + dirty, marks the reminder preference group as chosen
 * now, keeps kv `locale` / `sync` / `loginPrompt` and the locale marker, removes `activeTimer`.
 * v8.0 (M17, ADR-49): the four roadmap tables travel the same way; a file without them (schemaVersion 1)
 * leaves them alone apart from unlinking goals that are no longer there (A-87).
 * Still one readwrite transaction over every table + kv: any failure rolls everything back.
 */
export class DexieBackupRepository implements BackupRepository {
  constructor(
    private readonly db: AppDatabase,
    private readonly clock: () => Date = () => new Date(),
  ) {}

  private get allTables() {
    return [this.db.goals, this.db.entries, ...ROADMAP_TABLES.map((t) => this.db[t]), this.db.kv] as const;
  }

  exportAll(): Promise<BackupExportData> {
    return this.db.transaction('r', [...this.allTables], async () => {
      const goalIds = await liveGoalIds(this.db);
      const goals = (await this.db.goals.filter(isLive).toArray()).map(toDomain);
      const entries = (await this.db.entries.filter((e) => isLive(e) && goalIds.has(e.goalId)).toArray()).map(toDomain);
      const settingsRow = await this.db.kv.get('settings');
      // Roadmaps: live rows, children of live parents only, dangling goal links written as null (§4.8 f).
      const roadmaps = (await this.db.roadmaps.filter(isLive).toArray()).map((r) => ({ ...toDomain(r), goalId: r.goalId !== null && goalIds.has(r.goalId) ? r.goalId : null }));
      const rIds = new Set(roadmaps.map((r) => r.id));
      const roadmapPhases = (await this.db.roadmapPhases.filter((p) => isLive(p) && rIds.has(p.roadmapId)).toArray()).map(toDomain);
      const pIds = new Set(roadmapPhases.map((p) => p.id));
      const roadmapItems = (await this.db.roadmapItems.filter((i) => isLive(i) && pIds.has(i.phaseId) && rIds.has(i.roadmapId)).toArray()).map(toDomain);
      const roadmapCheckpoints = (await this.db.roadmapCheckpoints.filter((c) => isLive(c) && rIds.has(c.roadmapId)).toArray()).map(toDomain);
      return { goals, entries, settings: normalizeSettings(settingsRow?.value), roadmaps, roadmapPhases, roadmapItems, roadmapCheckpoints };
    });
  }

  replaceAll(data: BackupReplaceData): Promise<void> {
    const now = this.clock();
    const stampOf = (r: Row) => nextUpdatedAt(now, r.updatedAt);
    return this.db.transaction('rw', [...this.allTables], async () => {
      // Live rows not in the file are soft-deleted; rows with an id from the file are replaced outright (a tombstone
      // with that id comes back to life); `bulkAdd` after the delete keeps rejecting duplicate ids inside the file (M3-AC9).
      const replace = async <T extends { id: string; updatedAt: string }>(table: (typeof this.allTables)[number], rows: T[]) => {
        const keep = new Set(rows.map((r) => r.id));
        await (table as unknown as { filter(f: (r: Row) => boolean): { modify(f: (r: Row) => void): Promise<number> } })
          .filter((r) => isLive(r) && !keep.has(r.id))
          .modify((r) => {
            const stamp = stampOf(r);
            r.updatedAt = stamp;
            r.deletedAt = stamp;
            r.dirty = 1;
          });
        await (table as unknown as { bulkDelete(ids: string[]): Promise<void> }).bulkDelete([...keep]);
        await (table as unknown as { bulkAdd(rows: unknown[]): Promise<unknown> }).bulkAdd(rows.map((r) => ({ ...r, deletedAt: null, dirty: 1 })));
      };
      await replace(this.db.goals, data.goals);
      await replace(this.db.entries, data.entries);
      if (data.roadmaps) {
        await replace(this.db.roadmaps, data.roadmaps);
        await replace(this.db.roadmapPhases, data.roadmapPhases ?? []);
        await replace(this.db.roadmapItems, data.roadmapItems ?? []);
        await replace(this.db.roadmapCheckpoints, data.roadmapCheckpoints ?? []);
      } else {
        // schemaVersion 1 (A-87): roadmaps stay; links to goals that are not in the file are removed.
        const keepGoals = new Set(data.goals.map((g) => g.id));
        await this.db.roadmaps
          .filter((r) => isLive(r) && r.goalId !== null && !keepGoals.has(r.goalId))
          .modify((r) => {
            r.goalId = null;
            r.updatedAt = stampOf(r);
            r.dirty = 1;
          });
      }
      await this.db.kv.put({ key: 'settings', value: data.settings });
      await this.db.kv.delete('activeTimer');
      const prefs = normalizePrefsSync((await this.db.kv.get('prefsSync'))?.value);
      const next: PrefsSyncState = { ...prefs, reminder: { updatedAt: nextUpdatedAt(now, prefs.reminder.updatedAt), dirty: 1 } };
      await this.db.kv.put({ key: 'prefsSync', value: next });
    });
  }
}
