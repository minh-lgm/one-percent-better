import type { ActiveTimer, LogEntry } from '../../domain/types';
import type { SaveTimerEntryOutcome, TimerRepository } from '../repositories';
import type { AppDatabase } from './db';

/**
 * Atomic "save timer as entry" (ADR-16). Everything runs inside one Dexie
 * readwrite transaction over goals + entries + kv; no non-Dexie promise is
 * awaited inside it (that would auto-commit the transaction early).
 */
export class DexieTimerRepository implements TimerRepository {
  constructor(private readonly db: AppDatabase) {}

  saveTimerEntry(expected: ActiveTimer, entry: LogEntry, maxDayMinutes: number): Promise<SaveTimerEntryOutcome> {
    return this.db.transaction('rw', this.db.goals, this.db.entries, this.db.kv, async (): Promise<SaveTimerEntryOutcome> => {
      const current = (await this.db.kv.get('activeTimer'))?.value as Partial<ActiveTimer> | undefined;
      if (!current || current.goalId !== expected.goalId || current.startedAt !== expected.startedAt) return { status: 'timer-changed' };
      if (!(await this.db.goals.get(entry.goalId))) return { status: 'goal-missing' };
      const sameDay = await this.db.entries.where('[goalId+date]').equals([entry.goalId, entry.date]).toArray();
      const existingMinutes = sameDay.reduce((acc, e) => acc + e.minutes, 0);
      if (existingMinutes + entry.minutes > maxDayMinutes) return { status: 'day-limit', existingMinutes };
      await this.db.entries.put(entry);
      await this.db.kv.delete('activeTimer');
      return { status: 'saved' };
    });
  }
}
