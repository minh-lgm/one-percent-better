import type { KvKey, LocalDataRepository } from '../repositories';
import type { AppDatabase } from './db';

/** kv rows removed by "sign out and remove data"; `locale` and `loginPrompt` survive (ARCH §5.2, A-37). */
export const CLEARED_KV_KEYS: readonly KvKey[] = ['settings', 'activeTimer', 'sync', 'prefsSync'];

/** Dexie implementation of `LocalDataRepository` (M6-T2). */
export class DexieLocalDataRepository implements LocalDataRepository {
  constructor(private readonly db: AppDatabase) {}

  clearUserData(): Promise<void> {
    return this.db.transaction('rw', this.db.goals, this.db.entries, this.db.kv, async () => {
      await this.db.goals.clear();
      await this.db.entries.clear();
      await this.db.kv.bulkDelete([...CLEARED_KV_KEYS]);
    });
  }

  async countLive(): Promise<{ goals: number; entries: number }> {
    const [goals, entries] = await Promise.all([this.db.goals.count(), this.db.entries.count()]);
    return { goals, entries };
  }
}
