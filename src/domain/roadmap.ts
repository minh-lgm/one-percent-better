// Big goals / roadmaps (phase 8, M17; ARCHITECTURE §4.8 a, §5.4 v8.0; FR-69, FR-75; ADR-48, ADR-51).
// Pure: types, validation and ordering. Lazy-only module (ADR-53): nothing on the cold-load path may
// import values from here (`import type` is fine); see eslint.config.js ROADMAP_LAZY_RULE.
import {
  CHECKPOINT_NOTE_MAX,
  CHECKPOINT_SCORE_MAX,
  CHECKPOINT_TITLE_MAX,
  ITEM_NOTE_MAX,
  ITEM_SPAN_MAX_DAYS,
  ITEM_TITLE_MAX,
  PERIOD_DAYS_MAX,
  PHASE_NOTE_MAX,
  PHASE_TITLE_MAX,
  ROADMAP_CHECKPOINT_MAX,
  ROADMAP_ITEM_MAX,
  ROADMAP_MAX,
  ROADMAP_MILESTONE_LABEL_MAX,
  ROADMAP_NOTE_MAX,
  ROADMAP_PHASE_MAX,
  ROADMAP_TITLE_MAX,
  WEEKLY_TARGET_MAX,
  WEEKLY_TARGET_MIN,
  WEEKLY_TARGET_STEP,
} from '../config/constants';
import { addDays, daysInclusive, isValidISODate } from './dates';
import { charLength } from './text';
import { fail, ok, type DomainError, type ISODate, type ISODateTime, type Result } from './types';

export interface Roadmap {
  id: string;
  /** 1–80 characters after trim. */
  title: string;
  /** 0–2000, multi-line, shown as plain text. */
  note: string;
  /** Linked goal (at most one, A-78); `null` = not linked. */
  goalId: string | null;
  /** Weekly target in whole minutes, 30–10080 (UI: hours in steps of 0.5); `null` = none. */
  weeklyTargetMinutes: number | null;
  /** 0–40; `''` = the UI's default label. */
  milestoneLabel: string;
  /** `null` = no countdown. */
  milestoneDate: ISODate | null;
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
}

export interface RoadmapPhase {
  id: string;
  roadmapId: string;
  title: string;
  /** 0–120. */
  note: string;
  /** Finite number, ascending (ADR-51). */
  position: number;
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
}

export interface RoadmapItem {
  id: string;
  roadmapId: string;
  phaseId: string;
  /** 1–200. */
  title: string;
  /** 0–1000. */
  note: string;
  position: number;
  plannedStart: ISODate;
  /** ≥ plannedStart, span ≤ 366 days. */
  plannedEnd: ISODate;
  /** ≤ today when written. */
  actualStart: ISODate | null;
  /** ≤ today, ≥ actualStart; non-null ⇔ the item is done (A-81). */
  actualEnd: ISODate | null;
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
}

export interface RoadmapCheckpoint {
  id: string;
  roadmapId: string;
  title: string;
  /** 0–280. */
  note: string;
  date: ISODate;
  /** > 0, ≤ 10000, at most one decimal. */
  maxScore: number;
  /** 0 … maxScore; `null` = no threshold. */
  threshold: number | null;
  /** 0 … maxScore; `null` = no score yet. */
  score: number | null;
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
}

/** One roadmap with its live children (ARCHITECTURE §4.8 b). */
export interface RoadmapAggregate {
  roadmap: Roadmap;
  phases: RoadmapPhase[];
  items: RoadmapItem[];
  checkpoints: RoadmapCheckpoint[];
}

export const isItemDone = (i: Pick<RoadmapItem, 'actualEnd'>): boolean => i.actualEnd !== null;

/** The last date the app can store (ISO dates have 4-digit years). */
export const LAST_ISO_DATE = '9999-12-31';

/** M20-D1: `date + days`, or `null` when the input is not a date or the result would leave 0001 … 9999. */
export function addDaysOrNull(date: string, days: number): ISODate | null {
  if (!isValidISODate(date)) return null;
  try {
    return addDays(date, days);
  } catch {
    return null;
  }
}

export type RoadmapEntityKind = 'roadmap' | 'phase' | 'item' | 'checkpoint';

export const ROADMAP_LIMITS: Record<RoadmapEntityKind, number> = {
  roadmap: ROADMAP_MAX,
  phase: ROADMAP_PHASE_MAX,
  item: ROADMAP_ITEM_MAX,
  checkpoint: ROADMAP_CHECKPOINT_MAX,
};

/** `ROADMAP_LIMIT_REACHED` when `count` live rows of `kind` already exist (so one more would exceed the limit). */
export function checkLimit(kind: RoadmapEntityKind, count: number): DomainError | null {
  const max = ROADMAP_LIMITS[kind];
  if (count < max) return null;
  return { code: 'ROADMAP_LIMIT_REACHED', message: `${kind} limit ${max} reached`, params: { kind, max } };
}

// ---- Validation (FR-69, FR-75, A-81, A-91) ----

const tooLong = (field: string, max: number): DomainError => ({ code: 'ROADMAP_TEXT_TOO_LONG', field, message: `${field} longer than ${max}`, params: { max } });
const dateError = (field: string, variant: 'format' | 'order' | 'itemTooLong' | 'roadmapTooLong'): DomainError => ({
  code: 'ROADMAP_DATE_INVALID',
  field,
  message: `${field}: ${variant}`,
  params: { variant },
});
const scoreError = (field: string, variant: 'max' | 'range' | 'precision'): DomainError => ({ code: 'ROADMAP_SCORE_INVALID', field, message: `${field}: ${variant}`, params: { variant } });

function checkTitle(title: string, max: number, errors: DomainError[]): string {
  const trimmed = title.trim();
  if (trimmed === '') errors.push({ code: 'ROADMAP_TITLE_REQUIRED', field: 'title', message: 'title is empty' });
  else if (charLength(trimmed) > max) errors.push(tooLong('title', max));
  return trimmed;
}

function checkNote(note: string, field: string, max: number, errors: DomainError[]): void {
  if (charLength(note) > max) errors.push(tooLong(field, max));
}

/** At most one decimal place (A-91): `7.5` ok, `7.25` not. */
export function hasOneDecimal(n: number): boolean {
  return Number.isFinite(n) && Math.abs(n * 10 - Math.round(n * 10)) < 1e-9;
}

export interface RoadmapInput {
  title: string;
  note: string;
  goalId: string | null;
  /** Hours per week from the form (steps of 0.5, 0.5 … 168); `null` = no target. */
  weeklyTargetHours: number | null;
  milestoneLabel: string;
  milestoneDate: string | null;
}

export type RoadmapFields = Pick<Roadmap, 'title' | 'note' | 'goalId' | 'weeklyTargetMinutes' | 'milestoneLabel' | 'milestoneDate'>;

export function validateRoadmapInput(input: RoadmapInput): Result<RoadmapFields> {
  const errors: DomainError[] = [];
  const title = checkTitle(input.title, ROADMAP_TITLE_MAX, errors);
  checkNote(input.note, 'note', ROADMAP_NOTE_MAX, errors);
  const milestoneLabel = input.milestoneLabel.trim();
  if (charLength(milestoneLabel) > ROADMAP_MILESTONE_LABEL_MAX) errors.push(tooLong('milestoneLabel', ROADMAP_MILESTONE_LABEL_MAX));
  if (input.milestoneDate !== null && !isValidISODate(input.milestoneDate)) errors.push(dateError('milestoneDate', 'format'));
  let weeklyTargetMinutes: number | null = null;
  if (input.weeklyTargetHours !== null) {
    const minutes = Math.round(input.weeklyTargetHours * 60);
    const valid = Number.isFinite(input.weeklyTargetHours) && Math.abs(input.weeklyTargetHours * 60 - minutes) < 1e-6 && minutes >= WEEKLY_TARGET_MIN && minutes <= WEEKLY_TARGET_MAX && minutes % WEEKLY_TARGET_STEP === 0;
    if (!valid) errors.push({ code: 'ROADMAP_TARGET_INVALID', field: 'weeklyTarget', message: `weekly target ${input.weeklyTargetHours} h is not 0.5 … 168 in steps of 0.5` });
    weeklyTargetMinutes = minutes;
  }
  if (errors.length > 0) return fail(errors);
  return ok({ title, note: input.note, goalId: input.goalId, weeklyTargetMinutes, milestoneLabel, milestoneDate: input.milestoneDate });
}

export interface PhaseInput {
  title: string;
  note: string;
}

export type PhaseFields = Pick<RoadmapPhase, 'title' | 'note'>;

export function validatePhaseInput(input: PhaseInput): Result<PhaseFields> {
  const errors: DomainError[] = [];
  const title = checkTitle(input.title, PHASE_TITLE_MAX, errors);
  checkNote(input.note, 'note', PHASE_NOTE_MAX, errors);
  return errors.length > 0 ? fail(errors) : ok({ title, note: input.note });
}

export interface ItemInput {
  title: string;
  note: string;
  plannedStart: string;
  plannedEnd: string;
  actualStart: string | null;
  actualEnd: string | null;
}

export type ItemFields = Pick<RoadmapItem, 'title' | 'note' | 'plannedStart' | 'plannedEnd' | 'actualStart' | 'actualEnd'>;

/** `today` bounds the actual dates (A-81; `DATE_IN_FUTURE` reused, ARCHITECTURE §5.4 v8.0). */
export function validateItemInput(input: ItemInput, today: ISODate): Result<ItemFields> {
  const errors: DomainError[] = [];
  const title = checkTitle(input.title, ITEM_TITLE_MAX, errors);
  checkNote(input.note, 'note', ITEM_NOTE_MAX, errors);
  const startOk = isValidISODate(input.plannedStart);
  const endOk = isValidISODate(input.plannedEnd);
  if (!startOk) errors.push(dateError('plannedStart', 'format'));
  if (!endOk) errors.push(dateError('plannedEnd', 'format'));
  if (startOk && endOk) {
    if (input.plannedEnd < input.plannedStart) errors.push(dateError('plannedEnd', 'order'));
    else if (daysInclusive(input.plannedStart, input.plannedEnd) > ITEM_SPAN_MAX_DAYS) errors.push(dateError('plannedEnd', 'itemTooLong'));
  }
  const actual = (value: string | null, field: 'actualStart' | 'actualEnd'): boolean => {
    if (value === null) return true;
    if (!isValidISODate(value)) {
      errors.push(dateError(field, 'format'));
      return false;
    }
    if (value > today) {
      errors.push({ code: 'DATE_IN_FUTURE', field, message: `${field} ${value} is after today ${today}` });
      return false;
    }
    return true;
  };
  const aStart = actual(input.actualStart, 'actualStart');
  const aEnd = actual(input.actualEnd, 'actualEnd');
  if (aStart && aEnd && input.actualStart !== null && input.actualEnd !== null && input.actualEnd < input.actualStart) errors.push(dateError('actualEnd', 'order'));
  if (errors.length > 0) return fail(errors);
  return ok({ title, note: input.note, plannedStart: input.plannedStart, plannedEnd: input.plannedEnd, actualStart: input.actualStart, actualEnd: input.actualEnd });
}

/** The whole roadmap (first planned start → last planned end) may cover at most `PERIOD_DAYS_MAX` days. */
export function checkRoadmapSpan(items: readonly Pick<RoadmapItem, 'plannedStart' | 'plannedEnd'>[]): DomainError | null {
  if (items.length === 0) return null;
  let start = items[0].plannedStart;
  let end = items[0].plannedEnd;
  for (const i of items) {
    if (i.plannedStart < start) start = i.plannedStart;
    if (i.plannedEnd > end) end = i.plannedEnd;
  }
  return daysInclusive(start, end) > PERIOD_DAYS_MAX ? dateError('plannedEnd', 'roadmapTooLong') : null;
}

export interface CheckpointInput {
  title: string;
  note: string;
  date: string;
  maxScore: number;
  threshold: number | null;
  score: number | null;
}

export type CheckpointFields = Pick<RoadmapCheckpoint, 'title' | 'note' | 'date' | 'maxScore' | 'threshold' | 'score'>;

export function validateCheckpointInput(input: CheckpointInput): Result<CheckpointFields> {
  const errors: DomainError[] = [];
  const title = checkTitle(input.title, CHECKPOINT_TITLE_MAX, errors);
  checkNote(input.note, 'note', CHECKPOINT_NOTE_MAX, errors);
  if (!isValidISODate(input.date)) errors.push(dateError('date', 'format'));
  const max = input.maxScore;
  let maxOk = true;
  if (!Number.isFinite(max) || max <= 0 || max > CHECKPOINT_SCORE_MAX) {
    errors.push(scoreError('maxScore', 'max'));
    maxOk = false;
  } else if (!hasOneDecimal(max)) {
    errors.push(scoreError('maxScore', 'precision'));
    maxOk = false;
  }
  for (const field of ['threshold', 'score'] as const) {
    const v = input[field];
    if (v === null) continue;
    if (!Number.isFinite(v)) errors.push(scoreError(field, 'range'));
    else if (!hasOneDecimal(v)) errors.push(scoreError(field, 'precision'));
    else if (v < 0 || (maxOk && v > max)) errors.push(scoreError(field, 'range'));
  }
  if (errors.length > 0) return fail(errors);
  return ok({ title, note: input.note, date: input.date, maxScore: max, threshold: input.threshold, score: input.score });
}

// ---- Ordering (ADR-51) ----

/** Midpoint between two neighbours; head of list → `b − 1`, tail → `a + 1`, empty list → `0`. */
export function positionBetween(a: number | null, b: number | null): number {
  if (a === null && b === null) return 0;
  if (a === null) return b! - 1;
  if (b === null) return a + 1;
  return (a + b) / 2;
}

/** Positions too close to split (< 1e-6 apart) or no longer finite: the service renumbers 0, 1, 2, … */
export const POSITION_EPSILON = 1e-6;

export function needsRenumber(sortedPositions: readonly number[]): boolean {
  for (let i = 0; i < sortedPositions.length; i += 1) {
    const p = sortedPositions[i];
    if (!Number.isFinite(p)) return true;
    if (i > 0 && p - sortedPositions[i - 1] < POSITION_EPSILON) return true;
  }
  return false;
}

const byPositionThenId = <T extends { position: number; id: string }>(a: T, b: T): number => (a.position === b.position ? (a.id < b.id ? -1 : a.id > b.id ? 1 : 0) : a.position < b.position ? -1 : 1);

/** Phases by `(position, id)`. */
export function sortPhases<T extends RoadmapPhase>(phases: readonly T[]): T[] {
  return [...phases].sort(byPositionThenId);
}

/** Items by `(phase order, position, id)` — the item order `ord(i)` of ARCHITECTURE §4.8 (a). Items of unknown phases go last. */
export function sortItems<T extends RoadmapItem>(items: readonly T[], phases: readonly RoadmapPhase[]): T[] {
  const rank = new Map<string, number>();
  sortPhases(phases).forEach((p, i) => rank.set(p.id, i));
  const rankOf = (i: T) => rank.get(i.phaseId) ?? Number.POSITIVE_INFINITY;
  return [...items].sort((a, b) => {
    const ra = rankOf(a);
    const rb = rankOf(b);
    if (ra !== rb) return ra < rb ? -1 : 1;
    return byPositionThenId(a, b);
  });
}

/** Checkpoints by `(date, createdAt, id)`. */
export function sortCheckpoints<T extends RoadmapCheckpoint>(checkpoints: readonly T[]): T[] {
  return [...checkpoints].sort((a, b) => {
    if (a.date !== b.date) return a.date < b.date ? -1 : 1;
    if (a.createdAt !== b.createdAt) return a.createdAt < b.createdAt ? -1 : 1;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });
}
