import type { EntryRepository, GoalRepository, Subscribable } from '../data/repositories';
import { curve, type CurveData } from '../domain/curve';
import { yearOf } from '../domain/dates';
import { entriesByGoal, goalStats, overallStats, type GoalStats, type OverallStats } from '../domain/stats';
import type { Goal, ISODate, LogEntry } from '../domain/types';

/** Everything the Review screen and the streak chip compute from (ADR-07: derived on read). */
export interface StatsData {
  goals: Goal[];
  /** Every entry inside some goal's period (entries cannot exist outside a period). */
  entries: LogEntry[];
}

/** `[min startDate, max endDate]` over goals, or `null` without goals. */
export function goalsDateRange(goals: readonly Pick<Goal, 'startDate' | 'endDate'>[]): [ISODate, ISODate] | null {
  if (goals.length === 0) return null;
  let from = goals[0].startDate;
  let to = goals[0].endDate;
  for (const g of goals) {
    if (g.startDate < from) from = g.startDate;
    if (g.endDate > to) to = g.endDate;
  }
  return [from, to];
}

/** Years offered by the Review year picker: earliest goal/entry year … `currentYear`. */
export function availableYears(goals: readonly Goal[], entries: readonly LogEntry[], currentYear: number): number[] {
  let first = currentYear;
  for (const g of goals) first = Math.min(first, yearOf(g.startDate));
  for (const e of entries) first = Math.min(first, yearOf(e.date));
  const years: number[] = [];
  for (let y = currentYear; y >= first; y--) years.push(y);
  return years;
}

/**
 * Statistics use case (ARCHITECTURE §5.3). Reads through the repository
 * interfaces, computes with `domain/stats` and `domain/heatmap`.
 */
export class StatsService {
  constructor(
    private readonly goals: GoalRepository,
    private readonly entries: EntryRepository,
  ) {}

  /** Goals + all entries in one read (no sentinel dates: the range comes from the goals). */
  async load(): Promise<StatsData> {
    const goals = await this.goals.getAll();
    const range = goalsDateRange(goals);
    const entries = range ? await this.entries.getByDateRange(range[0], range[1]) : [];
    return { goals, entries };
  }

  /**
   * Live goals + entries. Re-subscribes to the entry range when the goals change,
   * emits once both are known.
   */
  watch(): Subscribable<StatsData> {
    return {
      subscribe: (onNext, onError) => {
        let goals: Goal[] | undefined;
        let entries: LogEntry[] | undefined;
        let rangeKey = '';
        let unsubscribeEntries: (() => void) | null = null;
        let closed = false;
        const emit = () => {
          if (goals && entries) onNext({ goals, entries });
        };
        const unsubscribeGoals = this.goals.watchAll().subscribe((value) => {
          if (closed) return;
          goals = value;
          const range = goalsDateRange(value);
          const key = range ? `${range[0]}|${range[1]}` : '';
          if (key !== rangeKey || !unsubscribeEntries) {
            rangeKey = key;
            unsubscribeEntries?.();
            if (range) {
              entries = undefined;
              unsubscribeEntries = this.entries.watchByDateRange(range[0], range[1]).subscribe((rows) => {
                if (closed) return;
                entries = rows;
                emit();
              }, onError);
            } else {
              unsubscribeEntries = () => {};
              entries = [];
              emit();
            }
          } else {
            emit();
          }
        }, onError);
        return () => {
          closed = true;
          unsubscribeEntries?.();
          unsubscribeGoals();
        };
      },
    };
  }

  /** Statistics of one goal (undefined when the goal does not exist). */
  async goalStats(goalId: string, year: number, today: ISODate): Promise<GoalStats | undefined> {
    const goal = await this.goals.getById(goalId);
    if (!goal) return undefined;
    const entries = await this.entries.getByGoal(goalId);
    return goalStats(goal, entries, year, today);
  }

  /** The 1% curve of one goal (FR-27; undefined when the goal does not exist). */
  async curve(goalId: string, today: ISODate): Promise<CurveData | undefined> {
    const goal = await this.goals.getById(goalId);
    if (!goal) return undefined;
    const entries = await this.entries.getByGoal(goalId);
    return curve(goal, entries, today);
  }

  async overallStats(year: number, today: ISODate): Promise<OverallStats> {
    const { goals, entries } = await this.load();
    return overallStats(goals, entries, year, today);
  }

  /** Current overall streak (Today chip, DESIGN S1 M4). */
  static currentStreak(data: StatsData, today: ISODate): number {
    return overallStats(data.goals, data.entries, yearOf(today), today).currentStreak;
  }

  /** Pure helper shared with the UI: stats of every goal from one data snapshot. */
  static allGoalStats(data: StatsData, year: number, today: ISODate): Map<string, GoalStats> {
    const byGoal = entriesByGoal(data.entries);
    const out = new Map<string, GoalStats>();
    for (const g of data.goals) out.set(g.id, goalStats(g, byGoal.get(g.id) ?? [], year, today));
    return out;
  }
}
