import type { EntryRepository, GoalRepository, KvRepository } from '../data/repositories';
import { entriesOutsidePeriod, validateGoalInput, type GoalInput } from '../domain/goal';
import { fail, ok, type ActiveTimer, type Goal, type Result } from '../domain/types';

export type IdGenerator = () => string;

export const defaultIdGenerator: IdGenerator = () => crypto.randomUUID();

export class GoalService {
  constructor(
    private readonly goals: GoalRepository,
    private readonly entries: EntryRepository,
    private readonly newId: IdGenerator = defaultIdGenerator,
    /** Optional: lets `remove` discard a timer running on the deleted goal (M2). */
    private readonly kv?: KvRepository,
  ) {}

  async create(input: GoalInput, now: Date): Promise<Result<Goal>> {
    const validated = validateGoalInput(input);
    if (!validated.ok) return validated;
    const stamp = now.toISOString();
    const goal: Goal = { id: this.newId(), ...validated.value, archived: false, createdAt: stamp, updatedAt: stamp };
    await this.goals.put(goal);
    return ok(goal);
  }

  async update(id: string, input: GoalInput, now: Date): Promise<Result<Goal>> {
    const existing = await this.goals.getById(id);
    if (!existing) return fail({ code: 'GOAL_NOT_FOUND', message: `goal ${id} not found` });
    const validated = validateGoalInput(input);
    if (!validated.ok) return validated;

    if (validated.value.startDate !== existing.startDate || validated.value.endDate !== existing.endDate) {
      const dates = (await this.entries.getByGoal(id)).map((e) => e.date);
      if (entriesOutsidePeriod(dates, validated.value.startDate, validated.value.endDate).length > 0) {
        return fail({ code: 'GOAL_PERIOD_EXCLUDES_ENTRIES', field: 'period', message: 'entries fall outside the new period' });
      }
    }

    const goal: Goal = { ...existing, ...validated.value, updatedAt: now.toISOString() };
    await this.goals.put(goal);
    return ok(goal);
  }

  async remove(id: string): Promise<Result<void>> {
    const existing = await this.goals.getById(id);
    if (!existing) return fail({ code: 'GOAL_NOT_FOUND', message: `goal ${id} not found` });
    await this.goals.deleteWithEntries(id);
    if (this.kv) {
      const timer = await this.kv.get<ActiveTimer>('activeTimer');
      if (timer && timer.goalId === id) await this.kv.delete('activeTimer');
    }
    return ok(undefined);
  }

  getById(id: string): Promise<Goal | undefined> {
    return this.goals.getById(id);
  }

  async entryCount(goalId: string): Promise<number> {
    return (await this.entries.getByGoal(goalId)).length;
  }

  /** Date range of a goal's entries, for the edit-form hint (DESIGN S3). */
  async entryDateRange(goalId: string): Promise<{ first: string; last: string } | null> {
    const dates = (await this.entries.getByGoal(goalId)).map((e) => e.date).sort();
    if (dates.length === 0) return null;
    return { first: dates[0], last: dates[dates.length - 1] };
  }

  watchAll() {
    return this.goals.watchAll();
  }
}
