// Row mapping for the cloud tables (ARCHITECTURE §4.3, §5.10): snake_case ↔ camelCase, timestamps
// normalised to `YYYY-MM-DDTHH:mm:ss.sssZ`, zod per row with the domain limits. Invalid rows are
// dropped and counted (NFR-05); nothing from the cloud reaches IndexedDB unchecked.
// No `@supabase/*` import here: the FakeRemoteStore and the mock share these rules.
import { z } from 'zod';
import { DAILY_MINUTES_MAX, DAILY_MINUTES_MIN, ENTRY_MINUTES_MAX, ENTRY_MINUTES_MIN, ENTRY_NOTE_MAX, GOAL_NAME_MAX, GOAL_WHY_MAX, ID_MAX, TOTAL_HOURS_MAX, TOTAL_HOURS_MIN } from '../../config/constants';
import { isValidISODate } from '../../domain/dates';
import { isValidReminderTime } from '../../domain/reminder';
import type { Goal, ISODateTime, LogEntry } from '../../domain/types';
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
    end_date: isoDate,
    archived: z.boolean(),
    created_at: timestamp,
    updated_at: timestamp,
    deleted_at: nullableTimestamp,
    server_updated_at: timestamp.optional(),
  })
  .refine((g) => g.end_date >= g.start_date, 'end before start')
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
