import type { Goal } from '../../domain/types';
import type { GoalRepository, Subscribable } from '../repositories';
import { fromLiveQuery, type AppDatabase } from './db';

export class DexieGoalRepository implements GoalRepository {
  constructor(private readonly db: AppDatabase) {}

  getAll(): Promise<Goal[]> {
    return this.db.goals.toArray();
  }

  getById(id: string): Promise<Goal | undefined> {
    return this.db.goals.get(id);
  }

  async put(goal: Goal): Promise<void> {
    await this.db.goals.put(goal);
  }

  async deleteWithEntries(id: string): Promise<void> {
    await this.db.transaction('rw', this.db.goals, this.db.entries, async () => {
      await this.db.entries.where('goalId').equals(id).delete();
      await this.db.goals.delete(id);
    });
  }

  watchAll(): Subscribable<Goal[]> {
    return fromLiveQuery(() => this.db.goals.toArray());
  }
}
