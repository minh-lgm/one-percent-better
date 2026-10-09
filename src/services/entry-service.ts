import type { EntryRepository, GoalRepository } from '../data/repositories';
import { toISODate } from '../domain/dates';
import { checkDayLimit, validateEntryDate, validateEntryFields } from '../domain/entry';
import { fail, ok, type EntrySource, type ISODate, type LogEntry, type Result } from '../domain/types';
import { defaultIdGenerator, type IdGenerator } from './goal-service';

export interface AddEntryInput {
  goalId: string;
  date: ISODate;
  minutes: number;
  note: string;
  source: EntrySource;
}

export interface UpdateEntryInput {
  minutes: number;
  note: string;
}

export class EntryService {
  constructor(
    private readonly entries: EntryRepository,
    private readonly goals: GoalRepository,
    private readonly newId: IdGenerator = defaultIdGenerator,
  ) {}

  async add(input: AddEntryInput, now: Date): Promise<Result<LogEntry>> {
    const goal = await this.goals.getById(input.goalId);
    if (!goal) return fail({ code: 'GOAL_NOT_FOUND', message: `goal ${input.goalId} not found` });

    const fields = validateEntryFields({ minutes: input.minutes, note: input.note });
    if (!fields.ok) return fields;

    const dateError = validateEntryDate(input.date, goal, toISODate(now));
    if (dateError) return fail(dateError);

    const existing = await this.entries.sumMinutes(input.goalId, input.date);
    const limitError = checkDayLimit(existing, fields.value.minutes);
    if (limitError) return fail(limitError);

    const stamp = now.toISOString();
    const entry: LogEntry = {
      id: this.newId(),
      goalId: input.goalId,
      date: input.date,
      minutes: fields.value.minutes,
      note: fields.value.note,
      source: input.source,
      createdAt: stamp,
      updatedAt: stamp,
    };
    await this.entries.put(entry);
    return ok(entry);
  }

  async update(id: string, input: UpdateEntryInput, now: Date): Promise<Result<LogEntry>> {
    const existing = await this.findById(id);
    if (!existing) return fail({ code: 'ENTRY_NOT_FOUND', message: `entry ${id} not found` });

    const fields = validateEntryFields(input);
    if (!fields.ok) return fields;

    const others = await this.entries.sumMinutes(existing.goalId, existing.date, id);
    const limitError = checkDayLimit(others, fields.value.minutes);
    if (limitError) return fail(limitError);

    const entry: LogEntry = { ...existing, ...fields.value, updatedAt: now.toISOString() };
    await this.entries.put(entry);
    return ok(entry);
  }

  async remove(id: string): Promise<Result<void>> {
    const existing = await this.findById(id);
    if (!existing) return fail({ code: 'ENTRY_NOT_FOUND', message: `entry ${id} not found` });
    await this.entries.delete(id);
    return ok(undefined);
  }

  watchByDateRange(from: ISODate, to: ISODate) {
    return this.entries.watchByDateRange(from, to);
  }

  private async findById(id: string): Promise<LogEntry | undefined> {
    // Repository has no getById by design (not needed elsewhere); entries are few per day.
    const all = await this.entries.getByDateRange('0000-01-01', '9999-12-31');
    return all.find((e) => e.id === id);
  }
}
