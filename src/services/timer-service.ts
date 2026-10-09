import { DAY_MINUTES_LIMIT } from '../config/constants';
import type { GoalRepository, KvRepository, Subscribable, TimerRepository } from '../data/repositories';
import { toISODate } from '../domain/dates';
import { checkDayLimit } from '../domain/entry';
import { goalStatus } from '../domain/goal';
import { previewTimer, type TimerPreview } from '../domain/timer';
import { fail, ok, type ActiveTimer, type LogEntry, type Result } from '../domain/types';
import type { EntryService } from './entry-service';
import { Mutex } from './mutex';

export interface SaveTimerInput {
  minutes: number;
  note: string;
}

/**
 * One timer at a time, stored as kv `activeTimer` (FR-11, FR-12). Elapsed time is
 * always `now - startedAt`, so it survives reloads and closed tabs.
 */
export class TimerService {
  constructor(
    private readonly kv: KvRepository,
    private readonly goals: GoalRepository,
    private readonly entries: EntryService,
    /** M3 (ADR-16): entry write + timer removal in one transaction, atomic across tabs. */
    private readonly timers: TimerRepository,
  ) {}

  /** start/save/discard are check-then-write sequences: run one at a time (M2-D3). */
  private readonly lock = new Mutex();

  async current(): Promise<ActiveTimer | undefined> {
    const timer = await this.kv.get<ActiveTimer>('activeTimer');
    if (!timer || typeof timer.goalId !== 'string' || typeof timer.startedAt !== 'string') return undefined;
    return timer;
  }

  start(goalId: string, now: Date): Promise<Result<ActiveTimer>> {
    return this.lock.run(() => this.doStart(goalId, now));
  }

  private async doStart(goalId: string, now: Date): Promise<Result<ActiveTimer>> {
    const goal = await this.goals.getById(goalId);
    if (!goal) return fail({ code: 'GOAL_NOT_FOUND', message: `goal ${goalId} not found` });
    if (goalStatus(goal, toISODate(now)) !== 'active') return fail({ code: 'GOAL_NOT_ACTIVE', message: `goal ${goalId} is not active` });

    const existing = await this.current();
    if (existing && (await this.goals.getById(existing.goalId))) {
      return fail({ code: 'TIMER_ALREADY_RUNNING', message: `timer already running for ${existing.goalId}` });
    }
    // An orphaned timer (its goal no longer exists) is silently replaced.
    const timer: ActiveTimer = { goalId, startedAt: now.toISOString() };
    await this.kv.set('activeTimer', timer);
    return ok(timer);
  }

  /** Preview for the Stop dialog. The timer keeps running until `save` or `discard`. */
  async stop(now: Date): Promise<Result<TimerPreview>> {
    const timer = await this.current();
    if (!timer) return fail({ code: 'TIMER_NOT_RUNNING', message: 'no active timer' });
    return ok(previewTimer(timer, now));
  }

  /**
   * Create the entry on the day the timer started and clear the timer, atomically
   * (ADR-16). Field/date validation runs first (`EntryService.prepareAdd`); the
   * conditions another tab could change meanwhile (same timer still stored, goal
   * still exists, day limit) are re-checked inside the repository transaction.
   */
  save(input: SaveTimerInput, now: Date): Promise<Result<LogEntry>> {
    return this.lock.run(() => this.doSave(input, now));
  }

  private async doSave(input: SaveTimerInput, now: Date): Promise<Result<LogEntry>> {
    const timer = await this.current();
    if (!timer) return fail({ code: 'TIMER_NOT_RUNNING', message: 'no active timer' });
    const preview = previewTimer(timer, now);
    const prepared = await this.entries.prepareAdd({ goalId: timer.goalId, date: preview.date, minutes: input.minutes, note: input.note, source: 'timer' }, now);
    if (!prepared.ok) return prepared;
    const entry = prepared.value;

    const outcome = await this.timers.saveTimerEntry(timer, entry, DAY_MINUTES_LIMIT);
    switch (outcome.status) {
      case 'saved':
        return ok(entry);
      case 'timer-changed':
        return fail({ code: 'TIMER_NOT_RUNNING', message: 'the timer was saved, discarded or replaced meanwhile' });
      case 'goal-missing':
        return fail({ code: 'GOAL_NOT_FOUND', message: `goal ${entry.goalId} was deleted meanwhile` });
      case 'day-limit': {
        const limitError = checkDayLimit(outcome.existingMinutes, entry.minutes);
        return fail(limitError ?? { code: 'ENTRY_DAY_LIMIT_EXCEEDED', field: 'minutes', message: 'day limit exceeded', params: { remaining: 0 } });
      }
    }
  }

  discard(): Promise<Result<void>> {
    return this.lock.run(async () => {
      const timer = await this.current();
      if (!timer) return fail({ code: 'TIMER_NOT_RUNNING', message: 'no active timer' });
      await this.kv.delete('activeTimer');
      return ok(undefined);
    });
  }

  watch(): Subscribable<ActiveTimer | undefined> {
    const source = this.kv.watch<ActiveTimer>('activeTimer');
    return {
      subscribe: (onNext, onError) =>
        source.subscribe((value) => onNext(value && typeof value.goalId === 'string' && typeof value.startedAt === 'string' ? value : undefined), onError),
    };
  }
}
