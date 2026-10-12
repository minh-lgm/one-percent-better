import { nextUpdatedAt } from '../../domain/sync';
import type { ISODate, LogEntry } from '../../domain/types';
import { isLive, toDomain, type EntryRepository, type EntryRow, type Subscribable } from '../repositories';
import { fromLiveQuery, type AppDatabase } from './db';

/** Ids of live goals (entries of a deleted goal are invisible even if their own row is live, ADR-20). */
export async function liveGoalIds(db: AppDatabase): Promise<Set<string>> {
  const ids = new Set<string>();
  await db.goals.filter(isLive).each((g) => {
    ids.add(g.id);
  });
  return ids;
}

/**
 * Entries on Dexie v2 (ADR-20): reads skip tombstones and entries whose goal is gone, both read
 * inside the same transaction; writes set `dirty = 1`; `delete` is a soft delete.
 */
export class DexieEntryRepository implements EntryRepository {
  constructor(
    private readonly db: AppDatabase,
    private readonly clock: () => Date = () => new Date(),
  ) {}

  private visible(query: () => Promise<EntryRow[]>): Promise<LogEntry[]> {
    return this.db.transaction('r', this.db.goals, this.db.entries, async () => {
      const goals = await liveGoalIds(this.db);
      return (await query()).filter((e) => isLive(e) && goals.has(e.goalId)).map(toDomain);
    });
  }

  async getById(id: string): Promise<LogEntry | undefined> {
    const row = await this.db.entries.get(id);
    return isLive(row) ? toDomain(row!) : undefined;
  }

  getByGoal(goalId: string): Promise<LogEntry[]> {
    return this.visible(() => this.db.entries.where('goalId').equals(goalId).toArray());
  }

  getByDateRange(from: ISODate, to: ISODate): Promise<LogEntry[]> {
    return this.visible(() => this.db.entries.where('date').between(from, to, true, true).toArray());
  }

  async sumMinutes(goalId: string, date: ISODate, excludeEntryId?: string): Promise<number> {
    const rows = await this.db.entries.where('[goalId+date]').equals([goalId, date]).toArray();
    return rows.filter((r) => isLive(r) && r.id !== excludeEntryId).reduce((acc, r) => acc + r.minutes, 0);
  }

  async put(entry: LogEntry): Promise<void> {
    const row: EntryRow = { ...entry, deletedAt: null, dirty: 1 };
    await this.db.entries.put(row);
  }

  async delete(id: string): Promise<void> {
    const now = this.clock();
    await this.db.transaction('rw', this.db.entries, async () => {
      const row = await this.db.entries.get(id);
      if (!isLive(row)) return;
      const stamp = nextUpdatedAt(now, row!.updatedAt);
      await this.db.entries.put({ ...row!, updatedAt: stamp, deletedAt: stamp, dirty: 1 });
    });
  }

  watchByDateRange(from: ISODate, to: ISODate): Subscribable<LogEntry[]> {
    return fromLiveQuery(() => this.getByDateRange(from, to));
  }

  watchByGoal(goalId: string): Subscribable<LogEntry[]> {
    return fromLiveQuery(() => this.getByGoal(goalId));
  }
}
