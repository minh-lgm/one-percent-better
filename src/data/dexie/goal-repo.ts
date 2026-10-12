import { nextUpdatedAt } from '../../domain/sync';
import type { Goal } from '../../domain/types';
import { isLive, toDomain, type EntryRow, type GoalRepository, type GoalRow, type Subscribable } from '../repositories';
import { fromLiveQuery, type AppDatabase } from './db';

/** Live goals of a table (tombstones out), as domain objects. */
export async function liveGoals(db: AppDatabase): Promise<Goal[]> {
  return (await db.goals.filter(isLive).toArray()).map(toDomain);
}

/**
 * Goals on Dexie v2 (ADR-20): reads skip tombstones, writes set `dirty = 1`, deletes are soft
 * (`deletedAt = updatedAt`, one stamp for the goal and all its live entries, in one transaction).
 */
export class DexieGoalRepository implements GoalRepository {
  constructor(
    private readonly db: AppDatabase,
    private readonly clock: () => Date = () => new Date(),
  ) {}

  getAll(): Promise<Goal[]> {
    return liveGoals(this.db);
  }

  async getById(id: string): Promise<Goal | undefined> {
    const row = await this.db.goals.get(id);
    return isLive(row) ? toDomain(row!) : undefined;
  }

  async put(goal: Goal): Promise<void> {
    const row: GoalRow = { ...goal, deletedAt: null, dirty: 1 };
    await this.db.goals.put(row);
  }

  async deleteWithEntries(id: string): Promise<void> {
    const now = this.clock();
    await this.db.transaction('rw', this.db.goals, this.db.entries, async () => {
      const goal = await this.db.goals.get(id);
      if (!isLive(goal)) return;
      const entries = (await this.db.entries.where('goalId').equals(id).toArray()).filter(isLive);
      let latest = goal!.updatedAt;
      for (const e of entries) if (Date.parse(e.updatedAt) > Date.parse(latest)) latest = e.updatedAt;
      const stamp = nextUpdatedAt(now, latest);
      await this.db.goals.put({ ...goal!, updatedAt: stamp, deletedAt: stamp, dirty: 1 });
      if (entries.length > 0) {
        const rows: EntryRow[] = entries.map((e) => ({ ...e, updatedAt: stamp, deletedAt: stamp, dirty: 1 }));
        await this.db.entries.bulkPut(rows);
      }
    });
  }

  watchAll(): Subscribable<Goal[]> {
    return fromLiveQuery(() => liveGoals(this.db));
  }
}
