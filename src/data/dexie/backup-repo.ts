import { normalizeSettings } from '../../domain/settings';
import type { BackupData, BackupRepository } from '../repositories';
import type { AppDatabase } from './db';

/**
 * Whole-database export and atomic replace (M3, ADR-08). `replaceAll` runs in
 * one readwrite transaction over goals + entries + kv: any failure rolls the
 * whole import back. kv `locale` is never touched (ADR-12); `activeTimer` is removed.
 */
export class DexieBackupRepository implements BackupRepository {
  constructor(private readonly db: AppDatabase) {}

  async exportAll(): Promise<BackupData> {
    const [goals, entries, settingsRow] = await Promise.all([this.db.goals.toArray(), this.db.entries.toArray(), this.db.kv.get('settings')]);
    return { goals, entries, settings: normalizeSettings(settingsRow?.value) };
  }

  replaceAll(data: BackupData): Promise<void> {
    return this.db.transaction('rw', this.db.goals, this.db.entries, this.db.kv, async () => {
      await this.db.goals.clear();
      await this.db.entries.clear();
      await this.db.goals.bulkAdd(data.goals);
      await this.db.entries.bulkAdd(data.entries);
      await this.db.kv.put({ key: 'settings', value: data.settings });
      await this.db.kv.delete('activeTimer');
    });
  }
}
