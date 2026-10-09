import type { ISODate, LogEntry } from '../../domain/types';
import type { EntryRepository, Subscribable } from '../repositories';
import { fromLiveQuery, type AppDatabase } from './db';

export class DexieEntryRepository implements EntryRepository {
  constructor(private readonly db: AppDatabase) {}

  getById(id: string): Promise<LogEntry | undefined> {
    return this.db.entries.get(id);
  }

  getByGoal(goalId: string): Promise<LogEntry[]> {
    return this.db.entries.where('goalId').equals(goalId).toArray();
  }

  getByDateRange(from: ISODate, to: ISODate): Promise<LogEntry[]> {
    return this.db.entries.where('date').between(from, to, true, true).toArray();
  }

  async sumMinutes(goalId: string, date: ISODate, excludeEntryId?: string): Promise<number> {
    const rows = await this.db.entries.where('[goalId+date]').equals([goalId, date]).toArray();
    return rows.filter((r) => r.id !== excludeEntryId).reduce((acc, r) => acc + r.minutes, 0);
  }

  async put(entry: LogEntry): Promise<void> {
    await this.db.entries.put(entry);
  }

  async delete(id: string): Promise<void> {
    await this.db.entries.delete(id);
  }

  watchByDateRange(from: ISODate, to: ISODate): Subscribable<LogEntry[]> {
    return fromLiveQuery(() => this.db.entries.where('date').between(from, to, true, true).toArray());
  }

  watchByGoal(goalId: string): Subscribable<LogEntry[]> {
    return fromLiveQuery(() => this.db.entries.where('goalId').equals(goalId).toArray());
  }
}
