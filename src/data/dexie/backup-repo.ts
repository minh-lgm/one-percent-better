import { normalizeSettings } from '../../domain/settings';
import { nextUpdatedAt } from '../../domain/sync';
import { isLive, normalizePrefsSync, toDomain, type BackupData, type BackupRepository, type EntryRow, type GoalRow, type PrefsSyncState } from '../repositories';
import type { AppDatabase } from './db';
import { liveGoalIds } from './entry-repo';

/**
 * Whole-database export and atomic replace (M3, ADR-08). v2 (ADR-20, A-28, A-37): the export
 * carries live rows only, as domain objects; `replaceAll` soft-deletes every live row that is not
 * in the file, writes the file's rows live + dirty, marks the reminder preference group as chosen
 * now, keeps kv `locale` / `sync` / `loginPrompt` and the locale marker, removes `activeTimer`.
 * Still one readwrite transaction over goals + entries + kv: any failure rolls everything back.
 */
export class DexieBackupRepository implements BackupRepository {
  constructor(
    private readonly db: AppDatabase,
    private readonly clock: () => Date = () => new Date(),
  ) {}

  exportAll(): Promise<BackupData> {
    return this.db.transaction('r', this.db.goals, this.db.entries, this.db.kv, async () => {
      const goalIds = await liveGoalIds(this.db);
      const goals = (await this.db.goals.filter(isLive).toArray()).map(toDomain);
      const entries = (await this.db.entries.filter((e) => isLive(e) && goalIds.has(e.goalId)).toArray()).map(toDomain);
      const settingsRow = await this.db.kv.get('settings');
      return { goals, entries, settings: normalizeSettings(settingsRow?.value) };
    });
  }

  replaceAll(data: BackupData): Promise<void> {
    const now = this.clock();
    return this.db.transaction('rw', this.db.goals, this.db.entries, this.db.kv, async () => {
      const keepGoals = new Set(data.goals.map((g) => g.id));
      const keepEntries = new Set(data.entries.map((e) => e.id));
      await this.db.goals
        .filter((g) => isLive(g) && !keepGoals.has(g.id))
        .modify((g: GoalRow) => {
          const stamp = nextUpdatedAt(now, g.updatedAt);
          g.updatedAt = stamp;
          g.deletedAt = stamp;
          g.dirty = 1;
        });
      await this.db.entries
        .filter((e) => isLive(e) && !keepEntries.has(e.id))
        .modify((e: EntryRow) => {
          const stamp = nextUpdatedAt(now, e.updatedAt);
          e.updatedAt = stamp;
          e.deletedAt = stamp;
          e.dirty = 1;
        });
      // Rows with an id from the file are replaced outright (a tombstone with that id comes back to life);
      // `bulkAdd` after the delete keeps rejecting duplicate ids inside the file (M3-AC9).
      await this.db.goals.bulkDelete([...keepGoals]);
      await this.db.entries.bulkDelete([...keepEntries]);
      await this.db.goals.bulkAdd(data.goals.map((g): GoalRow => ({ ...g, deletedAt: null, dirty: 1 })));
      await this.db.entries.bulkAdd(data.entries.map((e): EntryRow => ({ ...e, deletedAt: null, dirty: 1 })));
      await this.db.kv.put({ key: 'settings', value: data.settings });
      await this.db.kv.delete('activeTimer');
      const prefs = normalizePrefsSync((await this.db.kv.get('prefsSync'))?.value);
      const next: PrefsSyncState = { ...prefs, reminder: { updatedAt: nextUpdatedAt(now, prefs.reminder.updatedAt), dirty: 1 } };
      await this.db.kv.put({ key: 'prefsSync', value: next });
    });
  }
}
