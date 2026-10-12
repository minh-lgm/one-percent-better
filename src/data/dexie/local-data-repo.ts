import { isLive, type KvKey, type LocalDataRepository } from '../repositories';
import type { AppDatabase } from './db';
import { liveGoalIds } from './entry-repo';

/** kv rows removed by "sign out and remove data"; `locale` and `loginPrompt` survive (ARCH §5.2, A-37). */
export const CLEARED_KV_KEYS: readonly KvKey[] = ['settings', 'activeTimer', 'sync', 'prefsSync'];

/** Dexie implementation of `LocalDataRepository` (M6-T2; v2: hard-deletes tombstones too, counts live rows only). */
export class DexieLocalDataRepository implements LocalDataRepository {
  constructor(private readonly db: AppDatabase) {}

  clearUserData(): Promise<void> {
    return this.db.transaction('rw', this.db.goals, this.db.entries, this.db.kv, async () => {
      await this.db.goals.clear();
      await this.db.entries.clear();
      await this.db.kv.bulkDelete([...CLEARED_KV_KEYS]);
    });
  }

  countLive(): Promise<{ goals: number; entries: number }> {
    return this.db.transaction('r', this.db.goals, this.db.entries, async () => {
      const goalIds = await liveGoalIds(this.db);
      const entries = await this.db.entries.filter((e) => isLive(e) && goalIds.has(e.goalId)).count();
      return { goals: goalIds.size, entries };
    });
  }
}
