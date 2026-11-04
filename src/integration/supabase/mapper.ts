// Row mapping for the cloud tables (ARCHITECTURE §4.3, §5.10): snake_case ↔ camelCase, timestamps
// normalised to `YYYY-MM-DDTHH:mm:ss.sssZ`, zod per row with the domain limits. Invalid rows are
// dropped and counted (NFR-05); nothing from the cloud reaches IndexedDB unchecked.
// No `@supabase/*` import here: the FakeRemoteStore and the mock share these rules.
import { z } from 'zod';
import {
  CHECKPOINT_NOTE_MAX,
  CHECKPOINT_SCORE_MAX,
  CHECKPOINT_TITLE_MAX,
  DAILY_MINUTES_MAX,
  DAILY_MINUTES_MIN,
  ENTRY_MINUTES_MAX,
  ENTRY_MINUTES_MIN,
  ENTRY_NOTE_MAX,
  GOAL_NAME_MAX,
  GOAL_WHY_MAX,
  ID_MAX,
  ITEM_NOTE_MAX,
  ITEM_SPAN_MAX_DAYS,
  ITEM_TITLE_MAX,
  PHASE_NOTE_MAX,
  PHASE_TITLE_MAX,
  ROADMAP_MILESTONE_LABEL_MAX,
  ROADMAP_NOTE_MAX,
  ROADMAP_TITLE_MAX,
  TOTAL_HOURS_MAX,
  TOTAL_HOURS_MIN,
  WEEKLY_TARGET_MAX,
  WEEKLY_TARGET_MIN,
} from '../../config/constants';
import { daysInclusive, isValidISODate } from '../../domain/dates';
import { isValidReminderTime } from '../../domain/reminder';
import type { Roadmap, RoadmapCheckpoint, RoadmapItem, RoadmapPhase } from '../../domain/roadmap';
import type { Goal, ISODateTime, LogEntry } from '../../domain/types';
import type { LocalTable, RemoteTable } from '../../data/sync-tables';
import type { RemotePrefs, SyncRecord } from '../../data/repositories';
import { isLocale } from '../../i18n/types';

/** `timestamptz` as PostgREST returns it (`2026-10-09T03:00:00+00:00`, sometimes without ms) → canonical ISO. */
export function normalizeTimestamp(value: unknown): ISODateTime | null {
  if (typeof value !== 'string' || !value.trim()) return null;
  const ms = Date.parse(value);
  if (Number.isNaN(ms)) return null;
  return new Date(ms).toISOString();
}

const timestamp = z.unknown().transform((v, ctx) => {
  const t = normalizeTimestamp(v);
  if (!t) {
    ctx.addIssue({ code: 'custom', message: 'timestamp' });
    return z.NEVER;
  }
  return t;
});
const nullableTimestamp = z.unknown().transform((v, ctx) => {
  if (v === null || v === undefined) return null;
  const t = normalizeTimestamp(v);
  if (!t) {
    ctx.addIssue({ code: 'custom', message: 'timestamp' });
    return z.NEVER;
  }
  return t;
});
const isoDate = z.string().refine(isValidISODate, 'YYYY-MM-DD');
// String limits count code points (zod), like `domain/text.ts` `charLength` in the forms and SQL `char_length` (M10-D1).
const id = z.string().min(1).max(ID_MAX);

export const goalRowSchema = z
  .object({
    id,
    name: z.string().min(1).max(GOAL_NAME_MAX),
    why: z.string().max(GOAL_WHY_MAX),
    target_type: z.enum(['daily', 'total']),
    target_minutes: z.number().int().min(1).max(TOTAL_HOURS_MAX * 60),
    start_date: isoDate,
    // v4.0 (M11, ADR-33): NULL = open-ended, only for `daily` — the same two check constraints as
    // `20261019000000_goal_open_ended.sql` (`goals_period_check`, `goals_open_ended_daily_check`).
    end_date: isoDate.nullable(),
    archived: z.boolean(),
    created_at: timestamp,
    updated_at: timestamp,
    deleted_at: nullableTimestamp,
    server_updated_at: timestamp.optional(),
  })
  .refine((g) => g.end_date === null || g.end_date >= g.start_date, 'end before start')
  .refine((g) => g.end_date !== null || g.target_type === 'daily', 'open-ended goals must be daily')
  .refine((g) => (g.target_type === 'daily' ? g.target_minutes >= DAILY_MINUTES_MIN && g.target_minutes <= DAILY_MINUTES_MAX : g.target_minutes >= TOTAL_HOURS_MIN * 60), 'target');

export const entryRowSchema = z.object({
  id,
  goal_id: id,
  date: isoDate,
  minutes: z.number().int().min(ENTRY_MINUTES_MIN).max(ENTRY_MINUTES_MAX),
  note: z.string().max(ENTRY_NOTE_MAX),
  source: z.enum(['manual', 'timer']),
  created_at: timestamp,
  updated_at: timestamp,
  deleted_at: nullableTimestamp,
  server_updated_at: timestamp.optional(),
});

export type GoalRowRemote = z.input<typeof goalRowSchema>;
export type EntryRowRemote = z.input<typeof entryRowSchema>;

export function goalToRow(g: SyncRecord<Goal>, userId: string): Record<string, unknown> {
  return {
    user_id: userId,
    id: g.id,
    name: g.name,
    why: g.why,
    target_type: g.targetType,
    target_minutes: g.targetMinutes,
    start_date: g.startDate,
    end_date: g.endDate,
    archived: g.archived,
    created_at: g.createdAt,
    updated_at: g.updatedAt,
    deleted_at: g.deletedAt,
  };
}

export function entryToRow(e: SyncRecord<LogEntry>, userId: string): Record<string, unknown> {
  return {
    user_id: userId,
    id: e.id,
    goal_id: e.goalId,
    date: e.date,
    minutes: e.minutes,
    note: e.note,
    source: e.source,
    created_at: e.createdAt,
    updated_at: e.updatedAt,
    deleted_at: e.deletedAt,
  };
}

export interface Mapped<T> {
  rows: SyncRecord<T>[];
  serverUpdatedAt: Record<string, ISODateTime>;
  skippedInvalid: number;
}

/** Validate and convert goal rows from the cloud; invalid ones are dropped and counted. */
export function mapGoalRows(raw: unknown[]): Mapped<Goal> {
  const out: Mapped<Goal> = { rows: [], serverUpdatedAt: {}, skippedInvalid: 0 };
  for (const item of raw) {
    const r = goalRowSchema.safeParse(item);
    if (!r.success) {
      out.skippedInvalid += 1;
      continue;
    }
    const g = r.data;
    out.rows.push({
      id: g.id,
      name: g.name,
      why: g.why,
      targetType: g.target_type,
      targetMinutes: g.target_minutes,
      startDate: g.start_date,
      endDate: g.end_date,
      archived: g.archived,
      createdAt: g.created_at,
      updatedAt: g.updated_at,
      deletedAt: g.deleted_at,
    });
    if (g.server_updated_at) out.serverUpdatedAt[g.id] = g.server_updated_at;
  }
  return out;
}

export function mapEntryRows(raw: unknown[]): Mapped<LogEntry> {
  const out: Mapped<LogEntry> = { rows: [], serverUpdatedAt: {}, skippedInvalid: 0 };
  for (const item of raw) {
    const r = entryRowSchema.safeParse(item);
    if (!r.success) {
      out.skippedInvalid += 1;
      continue;
    }
    const e = r.data;
    out.rows.push({
      id: e.id,
      goalId: e.goal_id,
      date: e.date,
      minutes: e.minutes,
      note: e.note,
      source: e.source,
      createdAt: e.created_at,
      updatedAt: e.updated_at,
      deletedAt: e.deleted_at,
    });
    if (e.server_updated_at) out.serverUpdatedAt[e.id] = e.server_updated_at;
  }
  return out;
}

// ---- v8.0 (M18, FR-79, ADR-50): the four roadmap tables of `20261104000000_roadmaps.sql` (ARCH §4.8 g) ----

/** `numeric(7,1)` as PostgREST may return it: a number, or a numeric string → `number` (finite). */
const numeric = z
  .union([z.number(), z.string().regex(/^-?\d+(\.\d+)?$/)])
  .transform((v) => Number(v))
  .pipe(z.number());
/** At most one decimal place (A-91; `numeric(7,1)` holds nothing finer). */
const oneDecimal = (n: number) => Math.abs(n * 10 - Math.round(n * 10)) < 1e-9;
/** `double precision` position: finite, |x| < 1e15 (the SQL check), never NaN (`z.number()` rejects NaN / ±Infinity). */
const position = z.number().refine((n) => Math.abs(n) < 1e15, 'position');
const syncColumns = { created_at: timestamp, updated_at: timestamp, deleted_at: nullableTimestamp, server_updated_at: timestamp.optional() };

export const roadmapRowSchema = z.object({
  id,
  title: z.string().min(1).max(ROADMAP_TITLE_MAX),
  note: z.string().max(ROADMAP_NOTE_MAX),
  goal_id: id.nullable(),
  weekly_target_minutes: z.number().int().min(WEEKLY_TARGET_MIN).max(WEEKLY_TARGET_MAX).nullable(),
  milestone_label: z.string().max(ROADMAP_MILESTONE_LABEL_MAX),
  milestone_date: isoDate.nullable(),
  ...syncColumns,
});

export const roadmapPhaseRowSchema = z.object({
  id,
  roadmap_id: id,
  title: z.string().min(1).max(PHASE_TITLE_MAX),
  note: z.string().max(PHASE_NOTE_MAX),
  position,
  ...syncColumns,
});

export const roadmapItemRowSchema = z
  .object({
    id,
    roadmap_id: id,
    phase_id: id,
    title: z.string().min(1).max(ITEM_TITLE_MAX),
    note: z.string().max(ITEM_NOTE_MAX),
    position,
    planned_start: isoDate,
    planned_end: isoDate,
    actual_start: isoDate.nullable(),
    actual_end: isoDate.nullable(),
    ...syncColumns,
  })
  .refine((i) => i.planned_end >= i.planned_start && daysInclusive(i.planned_start, i.planned_end) <= ITEM_SPAN_MAX_DAYS, 'planned period')
  .refine((i) => i.actual_start === null || i.actual_end === null || i.actual_end >= i.actual_start, 'actual period');

export const roadmapCheckpointRowSchema = z
  .object({
    id,
    roadmap_id: id,
    title: z.string().min(1).max(CHECKPOINT_TITLE_MAX),
    note: z.string().max(CHECKPOINT_NOTE_MAX),
    date: isoDate,
    max_score: numeric.refine((n) => n > 0 && n <= CHECKPOINT_SCORE_MAX && oneDecimal(n), 'max_score'),
    threshold: numeric.refine((n) => n >= 0 && oneDecimal(n), 'threshold').nullable(),
    score: numeric.refine((n) => n >= 0 && oneDecimal(n), 'score').nullable(),
    ...syncColumns,
  })
  .refine((c) => c.threshold === null || c.threshold <= c.max_score, 'threshold <= max')
  .refine((c) => c.score === null || c.score <= c.max_score, 'score <= max');

export function roadmapToRow(r: SyncRecord<Roadmap>, userId: string): Record<string, unknown> {
  return {
    user_id: userId,
    id: r.id,
    title: r.title,
    note: r.note,
    goal_id: r.goalId,
    weekly_target_minutes: r.weeklyTargetMinutes,
    milestone_label: r.milestoneLabel,
    milestone_date: r.milestoneDate,
    created_at: r.createdAt,
    updated_at: r.updatedAt,
    deleted_at: r.deletedAt,
  };
}

export function roadmapPhaseToRow(p: SyncRecord<RoadmapPhase>, userId: string): Record<string, unknown> {
  return { user_id: userId, id: p.id, roadmap_id: p.roadmapId, title: p.title, note: p.note, position: p.position, created_at: p.createdAt, updated_at: p.updatedAt, deleted_at: p.deletedAt };
}

export function roadmapItemToRow(i: SyncRecord<RoadmapItem>, userId: string): Record<string, unknown> {
  return {
    user_id: userId,
    id: i.id,
    roadmap_id: i.roadmapId,
    phase_id: i.phaseId,
    title: i.title,
    note: i.note,
    position: i.position,
    planned_start: i.plannedStart,
    planned_end: i.plannedEnd,
    actual_start: i.actualStart,
    actual_end: i.actualEnd,
    created_at: i.createdAt,
    updated_at: i.updatedAt,
    deleted_at: i.deletedAt,
  };
}

export function roadmapCheckpointToRow(c: SyncRecord<RoadmapCheckpoint>, userId: string): Record<string, unknown> {
  return {
    user_id: userId,
    id: c.id,
    roadmap_id: c.roadmapId,
    title: c.title,
    note: c.note,
    date: c.date,
    max_score: c.maxScore,
    threshold: c.threshold,
    score: c.score,
    created_at: c.createdAt,
    updated_at: c.updatedAt,
    deleted_at: c.deletedAt,
  };
}

type RowWithStamp = { id: string; server_updated_at?: ISODateTime };

function mapWith<T, S extends RowWithStamp>(raw: unknown[], schema: z.ZodType<S>, convert: (row: S) => SyncRecord<T>): Mapped<T> {
  const out: Mapped<T> = { rows: [], serverUpdatedAt: {}, skippedInvalid: 0 };
  for (const item of raw) {
    const r = schema.safeParse(item);
    if (!r.success) {
      out.skippedInvalid += 1;
      continue;
    }
    out.rows.push(convert(r.data));
    if (r.data.server_updated_at) out.serverUpdatedAt[r.data.id] = r.data.server_updated_at;
  }
  return out;
}

export function mapRoadmapRows(raw: unknown[]): Mapped<Roadmap> {
  return mapWith(raw, roadmapRowSchema, (r) => ({
    id: r.id,
    title: r.title,
    note: r.note,
    goalId: r.goal_id,
    weeklyTargetMinutes: r.weekly_target_minutes,
    milestoneLabel: r.milestone_label,
    milestoneDate: r.milestone_date,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    deletedAt: r.deleted_at,
  }));
}

export function mapRoadmapPhaseRows(raw: unknown[]): Mapped<RoadmapPhase> {
  return mapWith(raw, roadmapPhaseRowSchema, (p) => ({
    id: p.id,
    roadmapId: p.roadmap_id,
    title: p.title,
    note: p.note,
    position: p.position,
    createdAt: p.created_at,
    updatedAt: p.updated_at,
    deletedAt: p.deleted_at,
  }));
}

export function mapRoadmapItemRows(raw: unknown[]): Mapped<RoadmapItem> {
  return mapWith(raw, roadmapItemRowSchema, (i) => ({
    id: i.id,
    roadmapId: i.roadmap_id,
    phaseId: i.phase_id,
    title: i.title,
    note: i.note,
    position: i.position,
    plannedStart: i.planned_start,
    plannedEnd: i.planned_end,
    actualStart: i.actual_start,
    actualEnd: i.actual_end,
    createdAt: i.created_at,
    updatedAt: i.updated_at,
    deletedAt: i.deleted_at,
  }));
}

export function mapRoadmapCheckpointRows(raw: unknown[]): Mapped<RoadmapCheckpoint> {
  return mapWith(raw, roadmapCheckpointRowSchema, (c) => ({
    id: c.id,
    roadmapId: c.roadmap_id,
    title: c.title,
    note: c.note,
    date: c.date,
    maxScore: c.max_score,
    threshold: c.threshold,
    score: c.score,
    createdAt: c.created_at,
    updatedAt: c.updated_at,
    deletedAt: c.deleted_at,
  }));
}

/** One table's codec: the pre-validation schema, record → row, rows → records (ADR-50). */
export interface TableCodec {
  key: LocalTable;
  schema: z.ZodType;
  toRow: (record: SyncRecord<Record<string, unknown>>, userId: string) => Record<string, unknown>;
  mapRows: (raw: unknown[]) => Mapped<Record<string, unknown>>;
}

export const TABLE_CODECS: Record<RemoteTable, TableCodec> = {
  goals: { key: 'goals', schema: goalRowSchema, toRow: goalToRow as never, mapRows: mapGoalRows as never },
  entries: { key: 'entries', schema: entryRowSchema, toRow: entryToRow as never, mapRows: mapEntryRows as never },
  roadmaps: { key: 'roadmaps', schema: roadmapRowSchema, toRow: roadmapToRow as never, mapRows: mapRoadmapRows as never },
  roadmap_phases: { key: 'roadmapPhases', schema: roadmapPhaseRowSchema, toRow: roadmapPhaseToRow as never, mapRows: mapRoadmapPhaseRows as never },
  roadmap_items: { key: 'roadmapItems', schema: roadmapItemRowSchema, toRow: roadmapItemToRow as never, mapRows: mapRoadmapItemRows as never },
  roadmap_checkpoints: { key: 'roadmapCheckpoints', schema: roadmapCheckpointRowSchema, toRow: roadmapCheckpointToRow as never, mapRows: mapRoadmapCheckpointRows as never },
};

/** `RemotePrefs` → the `settings` row to upsert. A `null` group is sent as nulls (the trigger keeps the old values). */
export function prefsToRow(p: RemotePrefs, userId: string): Record<string, unknown> {
  return {
    user_id: userId,
    reminder_enabled: p.reminder ? p.reminder.enabled : null,
    reminder_time: p.reminder ? p.reminder.time : null,
    reminder_updated_at: p.reminder ? p.reminder.updatedAt : null,
    locale: p.locale ? p.locale.value : null,
    locale_updated_at: p.locale ? p.locale.updatedAt : null,
  };
}

/** `settings` row → `RemotePrefs`; a group that fails validation reads as `null` and is counted. */
export function mapPrefsRow(raw: unknown): { prefs: RemotePrefs; skippedInvalid: number } {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  let skippedInvalid = 0;
  let reminder: RemotePrefs['reminder'] = null;
  const rAt = normalizeTimestamp(r.reminder_updated_at);
  if (r.reminder_updated_at !== null && r.reminder_updated_at !== undefined) {
    if (rAt && typeof r.reminder_enabled === 'boolean' && typeof r.reminder_time === 'string' && isValidReminderTime(r.reminder_time)) {
      reminder = { enabled: r.reminder_enabled, time: r.reminder_time, updatedAt: rAt };
    } else skippedInvalid += 1;
  } else if (r.reminder_enabled !== null && r.reminder_enabled !== undefined) skippedInvalid += 1;
  let locale: RemotePrefs['locale'] = null;
  const lAt = normalizeTimestamp(r.locale_updated_at);
  if (r.locale_updated_at !== null && r.locale_updated_at !== undefined) {
    if (lAt && isLocale(r.locale)) locale = { value: r.locale, updatedAt: lAt };
    else skippedInvalid += 1;
  } else if (r.locale !== null && r.locale !== undefined) skippedInvalid += 1;
  return { prefs: { reminder, locale }, skippedInvalid };
}
