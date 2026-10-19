// Year heatmap grid (ARCHITECTURE §4 heatmap levels; DESIGN S6, §8). Pure.
// Columns are ISO weeks (Monday first), rows Monday … Sunday.
import { dayNumber, daysInclusive, isoFromDayNumber, weekdayIndex, yearOf } from './dates';
import { dailyTarget, isWithinGoal } from './goal';
import { entriesByGoal, isDayMet, minutesByDate } from './stats';
import type { Goal, ISODate, LogEntry } from './types';

export type HeatLevel = 0 | 1 | 2 | 3 | 4;

/** "All goals" thresholds by total minutes (ARCH §4). */
export const ALL_GOALS_THRESHOLDS = { level2: 30, level3: 60, level4: 120 } as const;

/** Level for one goal by share of its daily target. */
export function goalLevel(minutes: number, target: number): HeatLevel {
  if (minutes <= 0) return 0;
  const share = minutes / target;
  if (share < 0.5) return 1;
  if (share < 1) return 2;
  if (share < 2) return 3;
  return 4;
}

/** Level for "All goals" by total minutes. */
export function allGoalsLevel(minutes: number): HeatLevel {
  if (minutes <= 0) return 0;
  if (minutes < ALL_GOALS_THRESHOLDS.level2) return 1;
  if (minutes < ALL_GOALS_THRESHOLDS.level3) return 2;
  if (minutes < ALL_GOALS_THRESHOLDS.level4) return 3;
  return 4;
}

export type CellState = 'logged' | 'none' | 'future' | 'outside';

export interface HeatmapCell {
  date: ISODate;
  /** Week column, 0-based. */
  col: number;
  /** Weekday row, 0 = Monday … 6 = Sunday. */
  row: number;
  state: CellState;
  level: HeatLevel;
  minutes: number;
  /** Target met (one goal: this goal; all goals: at least one goal). */
  met: boolean;
  today: boolean;
  /** Can be opened on the Day screen (past/today and not `outside`). */
  navigable: boolean;
}

export interface HeatmapMonth {
  /** 1 … 12 */
  month: number;
  date: ISODate;
  col: number;
}

export interface HeatmapGrid {
  year: number;
  columns: number;
  cells: HeatmapCell[];
  months: HeatmapMonth[];
  /** Index (in `cells`) of the initial tab stop: today, or the last past day of the year, or the first cell. */
  focusIndex: number;
}

export interface HeatmapInput {
  year: number;
  /** `null` = "All goals". */
  goal: Goal | null;
  goals: readonly Goal[];
  entries: readonly LogEntry[];
  today: ISODate;
}

/** Build the year grid. For one goal, `entries` may contain other goals' entries; they are ignored. */
export function buildHeatmap({ year, goal, goals, entries, today }: HeatmapInput): HeatmapGrid {
  const first: ISODate = `${year}-01-01`;
  const last: ISODate = `${year}-12-31`;
  const offset = weekdayIndex(first);
  const days = daysInclusive(first, last);
  const columns = Math.ceil((offset + days) / 7);
  const firstDay = dayNumber(first);

  const byGoal = entriesByGoal(entries);
  const relevantGoals = goal ? [goal] : goals;
  const perGoal = relevantGoals.map((g) => ({ goal: g, target: dailyTarget(g), minutes: minutesByDate(byGoal.get(g.id) ?? []) }));
  const target = goal ? dailyTarget(goal) : 0;

  const cells: HeatmapCell[] = [];
  const months: HeatmapMonth[] = [];
  for (let i = 0; i < days; i++) {
    const date = isoFromDayNumber(firstDay + i);
    const col = Math.floor((offset + i) / 7);
    const row = (offset + i) % 7;
    if (date.endsWith('-01')) months.push({ month: Number(date.slice(5, 7)), date, col });

    let minutes = 0;
    let met = false;
    for (const g of perGoal) {
      const m = g.minutes.get(date) ?? 0;
      minutes += m;
      if (m > 0 && isDayMet(g.goal, date, m, g.target)) met = true;
    }

    let state: CellState;
    if (date > today) state = 'future';
    else if (goal && !isWithinGoal(date, goal)) state = 'outside'; // open-ended goal: only days before it starts (A-51)
    else state = minutes > 0 ? 'logged' : 'none';

    const level: HeatLevel = state === 'logged' ? (goal ? goalLevel(minutes, target) : allGoalsLevel(minutes)) : 0;
    cells.push({ date, col, row, state, level, minutes: state === 'logged' ? minutes : 0, met: state === 'logged' && met, today: date === today, navigable: state === 'logged' || state === 'none' });
  }
  // Tab stop: today; a past year focuses its last day, a future year its first.
  const todayYear = yearOf(today);
  const focusIndex = todayYear === year ? daysInclusive(first, today) - 1 : todayYear > year ? cells.length - 1 : 0;

  return { year, columns, cells, months, focusIndex };
}
