// Derived values of a roadmap (phase 8, M17; ARCHITECTURE §4.8 c; FR-71, FR-72, FR-75; A-77, A-80 … A-85).
// Pure functions that take `today`; nothing here is stored. Oracle: dataset Q1 (§4.8 d).
// v8.3 (M21, A-80 v8.3, A-93, A-95, ADR-54): the roadmap total is every minute logged on the linked goal (the Goal
// detail figure); item hours still follow the item windows (one day → one item) and the rest is `outsideMinutes`.
import { dayNumber } from './dates';
import { isItemDone, sortCheckpoints, sortItems, sortPhases, type Roadmap, type RoadmapAggregate, type RoadmapCheckpoint, type RoadmapItem, type RoadmapPhase } from './roadmap';
import type { Goal, ISODate, LogEntry } from './types';

export type LinkState = 'none' | 'missing' | 'archived' | 'linked';

/** `goal` = the linked goal as this device sees it (`undefined`/`null` when it does not exist or is a tombstone). */
export function linkState(roadmap: Pick<Roadmap, 'goalId'>, goal: Pick<Goal, 'archived'> | null | undefined): LinkState {
  if (roadmap.goalId === null) return 'none';
  if (!goal) return 'missing';
  return goal.archived ? 'archived' : 'linked';
}

/** Calendar days from `a` to `b` (negative when `b` is earlier). */
export const days = (a: ISODate, b: ISODate): number => dayNumber(b) - dayNumber(a);
/** Inclusive span in days. */
export const span = (a: ISODate, b: ISODate): number => days(a, b) + 1;

export interface ItemWindow {
  start: ISODate;
  end: ISODate;
  /** `end < start`: the item gets no minutes (A-82). */
  empty: boolean;
  /** Has an actual start or end (wins the day over planned-only neighbours). */
  explicit: boolean;
}

/** `[S_i, E_i]` of ARCHITECTURE §4.8 (c): actual dates first; an item in progress runs until max(plannedEnd, today) (A-77). */
export function itemWindow(item: RoadmapItem, today: ISODate): ItemWindow {
  const start = item.actualStart ?? item.plannedStart;
  const end = item.actualEnd ?? (item.actualStart ? (item.plannedEnd > today ? item.plannedEnd : today) : item.plannedEnd);
  return { start, end, empty: end < start, explicit: item.actualStart !== null || item.actualEnd !== null };
}

interface Attribution {
  byItem: Map<string, number>;
  /** Minutes given to an item (= Σ byItem). */
  total: number;
  /** Days that fall in no item window: date → minutes. */
  outside: Map<string, number>;
}

function attribute(items: readonly RoadmapItem[], entries: readonly Pick<LogEntry, 'date' | 'minutes'>[], today: ISODate): Attribution {
  const perDay = new Map<string, number>();
  for (const e of entries) perDay.set(e.date, (perDay.get(e.date) ?? 0) + e.minutes);
  const windows = items.map((i) => itemWindow(i, today));
  const byItem = new Map<string, number>();
  for (const i of items) byItem.set(i.id, 0);
  const outside = new Map<string, number>();
  let total = 0;
  for (const [date, minutes] of perDay) {
    let best = -1;
    for (let k = 0; k < items.length; k += 1) {
      const w = windows[k];
      if (w.empty || date < w.start || date > w.end) continue;
      if (best === -1) {
        best = k;
        continue;
      }
      const b = windows[best];
      if (w.explicit !== b.explicit) {
        if (w.explicit) best = k;
      } else if (w.start > b.start) best = k;
      // same explicitness and start: the earlier `ord` (already `best`) keeps the day
    }
    if (best === -1) {
      outside.set(date, minutes);
      continue;
    }
    const id = items[best].id;
    byItem.set(id, byItem.get(id)! + minutes);
    total += minutes;
  }
  return { byItem, total, outside };
}

/**
 * Minutes per item (A-80: one day → one item). `items` must be in item order `ord`. Every day with entries goes
 * to exactly one candidate window: explicit first, then the later start, then the earlier `ord`. Days outside every
 * window go to no item (v8.3: they still count in the roadmap total, `RoadmapView.outsideMinutes`). Returns a map
 * item id → minutes (every item present) and `total` = the minutes given to items (= Σ byItem).
 */
export function attributeMinutes(items: readonly RoadmapItem[], entries: readonly Pick<LogEntry, 'date' | 'minutes'>[], today: ISODate): { byItem: Map<string, number>; total: number } {
  const { byItem, total } = attribute(items, entries, today);
  return { byItem, total };
}

export type ItemState = 'done' | 'overdue' | 'current' | 'upcoming';

export function itemState(item: RoadmapItem, today: ISODate): ItemState {
  if (isItemDone(item)) return 'done';
  if (item.plannedEnd < today) return 'overdue';
  if (item.plannedStart <= today) return 'current';
  return 'upcoming';
}

/** Early/on-time/late label of a finished item, or "in progress" (FR-73). `null` when the item has no actual dates. */
export type ItemLabel = { kind: 'onTime' | 'early' | 'late'; days: number; studiedDays: number | null } | { kind: 'inProgress' } | null;

export function itemLabel(item: RoadmapItem): ItemLabel {
  if (item.actualEnd !== null) {
    const diff = days(item.plannedEnd, item.actualEnd);
    const studiedDays = item.actualStart !== null ? span(item.actualStart, item.actualEnd) : null;
    return { kind: diff === 0 ? 'onTime' : diff < 0 ? 'early' : 'late', days: Math.abs(diff), studiedDays };
  }
  if (item.actualStart !== null) return { kind: 'inProgress' };
  return null;
}

export type PaceSeverity = 'good' | 'warn' | 'crit' | 'idle';

export interface Pace {
  kind: 'empty' | 'notStarted' | 'completed' | 'onTrack' | 'behind';
  overdueCount: number;
  weekBased: boolean;
  severity: PaceSeverity;
}

export interface RoadmapOverview {
  itemCount: number;
  doneCount: number;
  overdueCount: number;
  /** ≥ 1 item and every item spans exactly 7 days. */
  weekBased: boolean;
  /** `null` when the roadmap has no items. */
  start: ISODate | null;
  end: ISODate | null;
  totalWeeks: number;
  weeksElapsed: number;
  /** `weeklyTargetMinutes × weeksElapsed`; `null` without a target. */
  plannedMinutesToDate: number | null;
  pace: Pace;
  /** First item (by `ord`) whose planned range contains today, done or not. */
  currentItemId: string | null;
}

export function roadmapOverview(roadmap: Pick<Roadmap, 'weeklyTargetMinutes'>, items: readonly RoadmapItem[], today: ISODate): RoadmapOverview {
  const itemCount = items.length;
  let doneCount = 0;
  let overdueCount = 0;
  let weekBased = itemCount > 0;
  let start: ISODate | null = null;
  let end: ISODate | null = null;
  let currentItemId: string | null = null;
  for (const i of items) {
    if (isItemDone(i)) doneCount += 1;
    else if (i.plannedEnd < today) overdueCount += 1;
    if (span(i.plannedStart, i.plannedEnd) !== 7) weekBased = false;
    if (start === null || i.plannedStart < start) start = i.plannedStart;
    if (end === null || i.plannedEnd > end) end = i.plannedEnd;
    if (currentItemId === null && i.plannedStart <= today && today <= i.plannedEnd) currentItemId = i.id;
  }
  const totalWeeks = start && end ? Math.ceil(span(start, end) / 7) : 0;
  const weeksElapsed = start === null || today < start ? 0 : Math.min(totalWeeks, Math.floor(days(start, today) / 7) + 1);
  const plannedMinutesToDate = roadmap.weeklyTargetMinutes === null ? null : roadmap.weeklyTargetMinutes * weeksElapsed;
  let pace: Pace;
  if (itemCount === 0) pace = { kind: 'empty', overdueCount, weekBased, severity: 'idle' };
  else if (today < start!) pace = { kind: 'notStarted', overdueCount, weekBased, severity: 'idle' };
  else if (doneCount === itemCount) pace = { kind: 'completed', overdueCount, weekBased, severity: 'good' };
  else if (overdueCount === 0) pace = { kind: 'onTrack', overdueCount, weekBased, severity: 'good' };
  else pace = { kind: 'behind', overdueCount, weekBased, severity: overdueCount === 1 ? 'warn' : 'crit' };
  return { itemCount, doneCount, overdueCount, weekBased, start, end, totalWeeks, weeksElapsed, plannedMinutesToDate, pace, currentItemId };
}

/** The "This week" card (FR-73; v8.2 `gap`). `null` when the roadmap has no items. */
export type ThisWeek =
  | { kind: 'notStarted'; start: ISODate; firstItemId: string }
  | { kind: 'finished'; end: ISODate }
  | { kind: 'gap' }
  | {
      kind: 'current';
      itemId: string;
      /** 1-based position in item order (the "W{{n}}" of the eyebrow). */
      index: number;
      /** `null` when the roadmap has no linked goal. */
      itemMinutes: number | null;
      /** `weeklyTargetMinutes × ceil(span / 7)`; `null` without a target. */
      itemTargetMinutes: number | null;
      daysLeft: number;
      done: boolean;
    }
  | null;

export function thisWeek(roadmap: Pick<Roadmap, 'weeklyTargetMinutes'>, items: readonly RoadmapItem[], overview: RoadmapOverview, itemMinutes: ReadonlyMap<string, number> | null, today: ISODate): ThisWeek {
  if (items.length === 0 || overview.start === null || overview.end === null) return null;
  if (overview.currentItemId === null) {
    if (today < overview.start) return { kind: 'notStarted', start: overview.start, firstItemId: items[0].id };
    if (today > overview.end) return { kind: 'finished', end: overview.end };
    return { kind: 'gap' };
  }
  const index = items.findIndex((i) => i.id === overview.currentItemId);
  const item = items[index];
  const target = roadmap.weeklyTargetMinutes;
  return {
    kind: 'current',
    itemId: item.id,
    index: index + 1,
    itemMinutes: itemMinutes ? (itemMinutes.get(item.id) ?? 0) : null,
    itemTargetMinutes: target === null ? null : target * Math.ceil(span(item.plannedStart, item.plannedEnd) / 7),
    daysLeft: Math.max(0, days(today, item.plannedEnd)),
    done: isItemDone(item),
  };
}

/** Calendar days until the milestone (A-85): `> 0` left, `0` today, `< 0` passed; `null` without a milestone. */
export function milestoneDays(roadmap: Pick<Roadmap, 'milestoneDate'>, today: ISODate): number | null {
  return roadmap.milestoneDate === null ? null : days(today, roadmap.milestoneDate);
}

export type CheckpointState = { kind: 'pending' } | { kind: 'recorded' } | { kind: 'pass' | 'below'; delta: number };

export function checkpointState(c: Pick<RoadmapCheckpoint, 'score' | 'threshold'>): CheckpointState {
  if (c.score === null) return { kind: 'pending' };
  if (c.threshold === null) return { kind: 'recorded' };
  const delta = Math.round((c.score - c.threshold) * 10) / 10;
  return { kind: c.score >= c.threshold ? 'pass' : 'below', delta };
}

/**
 * A-91: the roadmap week ("W8") containing `date` — 7-day blocks from the roadmap start, like `weeksElapsed` — or
 * `null` when the date is outside [start, end] (the table then shows the full date, e.g. the Diagnostic of Q1).
 */
export function roadmapWeekOf(overview: Pick<RoadmapOverview, 'start' | 'end'>, date: ISODate): number | null {
  if (overview.start === null || overview.end === null || date < overview.start || date > overview.end) return null;
  return Math.floor(days(overview.start, date) / 7) + 1;
}

export type ChartScale = 'raw' | 'percent';

/** Raw score axis when every checkpoint shares one `maxScore`, otherwise percent of each maximum. */
export function chartScale(checkpoints: readonly Pick<RoadmapCheckpoint, 'maxScore'>[]): ChartScale {
  return checkpoints.every((c) => c.maxScore === checkpoints[0]?.maxScore) ? 'raw' : 'percent';
}

/** Everything the detail screen and the list row need, computed once (ARCHITECTURE §4.8 b `RoadmapView`). */
export interface RoadmapView {
  roadmap: Roadmap;
  phases: RoadmapPhase[];
  /** In item order `ord`. */
  items: RoadmapItem[];
  checkpoints: RoadmapCheckpoint[];
  goal: Goal | null;
  linkState: LinkState;
  /**
   * v8.3 (A-80, A-95): every minute logged on the linked goal (not filtered by windows or `today`) — the Goal detail
   * total. `null` when `linkState` is `none` / `missing`.
   */
  hoursDoneMinutes: number | null;
  /** v8.3 (A-93): `hoursDoneMinutes − Σ itemMinutes` — days in no item window (all of it when there are no items). */
  outsideMinutes: number | null;
  /** v8.3: the part of `outsideMinutes` dated before the roadmap start (`min plannedStart`); 0 without items. */
  beforeStartMinutes: number | null;
  /** Item id → minutes; `null` values when hours cannot be counted. */
  itemMinutes: Map<string, number | null>;
  overview: RoadmapOverview;
  thisWeek: ThisWeek;
  milestoneDays: number | null;
  chartScale: ChartScale;
}

export function roadmapView(aggregate: RoadmapAggregate, goal: Goal | null | undefined, entries: readonly Pick<LogEntry, 'date' | 'minutes'>[], today: ISODate): RoadmapView {
  const phases = sortPhases(aggregate.phases);
  const items = sortItems(aggregate.items, phases);
  const checkpoints = sortCheckpoints(aggregate.checkpoints);
  const link = linkState(aggregate.roadmap, goal);
  const counted = link === 'linked' || link === 'archived';
  const minutes = counted ? attribute(items, entries, today) : null;
  const itemMinutes = new Map<string, number | null>();
  for (const i of items) itemMinutes.set(i.id, minutes ? (minutes.byItem.get(i.id) ?? 0) : null);
  const overview = roadmapOverview(aggregate.roadmap, items, today);
  let hoursDoneMinutes: number | null = null;
  let outsideMinutes: number | null = null;
  let beforeStartMinutes: number | null = null;
  if (minutes) {
    outsideMinutes = 0;
    beforeStartMinutes = 0;
    for (const [date, m] of minutes.outside) {
      outsideMinutes += m;
      if (overview.start !== null && date < overview.start) beforeStartMinutes += m;
    }
    hoursDoneMinutes = minutes.total + outsideMinutes;
  }
  return {
    roadmap: aggregate.roadmap,
    phases,
    items,
    checkpoints,
    goal: goal ?? null,
    linkState: link,
    hoursDoneMinutes,
    outsideMinutes,
    beforeStartMinutes,
    itemMinutes,
    overview,
    thisWeek: thisWeek(aggregate.roadmap, items, overview, minutes?.byItem ?? null, today),
    milestoneDays: milestoneDays(aggregate.roadmap, today),
    chartScale: chartScale(checkpoints),
  };
}

/** One row of the Big goals list (S11). */
export interface RoadmapListRow {
  id: string;
  title: string;
  createdAt: string;
  goalName: string | null;
  linkState: LinkState;
  doneCount: number;
  itemCount: number;
  pace: Pace;
  hoursDoneMinutes: number | null;
  plannedMinutesToDate: number | null;
  milestoneLabel: string;
  milestoneDays: number | null;
}

export function toListRow(view: RoadmapView): RoadmapListRow {
  return {
    id: view.roadmap.id,
    title: view.roadmap.title,
    createdAt: view.roadmap.createdAt,
    goalName: view.goal?.name ?? null,
    linkState: view.linkState,
    doneCount: view.overview.doneCount,
    itemCount: view.overview.itemCount,
    pace: view.overview.pace,
    hoursDoneMinutes: view.hoursDoneMinutes,
    plannedMinutesToDate: view.overview.plannedMinutesToDate,
    milestoneLabel: view.roadmap.milestoneLabel,
    milestoneDays: view.milestoneDays,
  };
}
