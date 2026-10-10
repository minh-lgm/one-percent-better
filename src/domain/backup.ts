// Backup file format, schemaVersion 1 (ARCHITECTURE §5.5; FR-19, FR-20, FR-21, NFR-04, NFR-05).
// Pure: parsing and validation only. The file is untrusted input: size limit,
// JSON.parse in try/catch, strict zod schema, referential integrity. No eval.
import { z } from 'zod';
import { DAILY_MINUTES_MAX, DAILY_MINUTES_MIN, DAY_MINUTES_LIMIT, ENTRY_MINUTES_MAX, ENTRY_MINUTES_MIN, ENTRY_NOTE_MAX, GOAL_NAME_MAX, GOAL_WHY_MAX, IMPORT_MAX_BYTES, PERIOD_DAYS_MAX, TOTAL_HOURS_MAX, TOTAL_HOURS_MIN } from '../config/constants';
import { daysInclusive, isValidISODate, isWithin } from './dates';
import { dailyTarget } from './goal';
import { isValidReminderTime } from './reminder';
import { fail, ok, type DomainError, type Goal, type ISODate, type ISODateTime, type LogEntry, type Result, type Settings } from './types';

export const BACKUP_APP = 'one-percent-better';
export const BACKUP_SCHEMA_VERSION = 1;
export const BACKUP_MIME_TYPE = 'application/json;charset=utf-8';
/** Days without a backup after which the app nags (A-12). */
export const BACKUP_REMINDER_DAYS = 30;

/** What goes into / comes out of the database. Structurally equal to `BackupData` in the data layer. */
export interface BackupContent {
  goals: Goal[];
  entries: LogEntry[];
  settings: Settings;
}

export interface BackupFile extends BackupContent {
  app: typeof BACKUP_APP;
  schemaVersion: typeof BACKUP_SCHEMA_VERSION;
  exportedAt: ISODateTime;
}

/** `1percent-better-backup-YYYY-MM-DD.json` (local export date). */
export function backupFileName(today: ISODate): string {
  return `1percent-better-backup-${today}.json`;
}

/** Build the export object. `Settings` never contains `locale` (ADR-12), so nothing has to be stripped. */
export function buildBackup(content: BackupContent, exportedAt: Date): BackupFile {
  return {
    app: BACKUP_APP,
    schemaVersion: BACKUP_SCHEMA_VERSION,
    exportedAt: exportedAt.toISOString(),
    goals: content.goals,
    entries: content.entries,
    settings: content.settings,
  };
}

const isoDate = z.string().refine(isValidISODate, 'YYYY-MM-DD');
const isoDateTime = z.string().refine((v) => !Number.isNaN(Date.parse(v)), 'ISO date-time');
const id = z.string().min(1).max(200);

// M3-D3: a backup must obey the same goal limits as the form (ARCH §4): daily
// 1–1440 min, total 1–10,000 h (stored in minutes), period ≤ 1827 days, derived
// daily target ≤ 1440. `endDate < startDate` stays an integrity error (M3-AC9).
const goalSchema = z
  .object({
    id,
    name: z.string().trim().min(1).max(GOAL_NAME_MAX),
    why: z.string().trim().max(GOAL_WHY_MAX),
    targetType: z.enum(['daily', 'total']),
    targetMinutes: z.number().int().min(1).max(TOTAL_HOURS_MAX * 60),
    startDate: isoDate,
    endDate: isoDate,
    archived: z.boolean(),
    createdAt: isoDateTime,
    updatedAt: isoDateTime,
  })
  .strict()
  .superRefine((g, ctx) => {
    if (g.targetType === 'daily' && (g.targetMinutes < DAILY_MINUTES_MIN || g.targetMinutes > DAILY_MINUTES_MAX)) {
      ctx.addIssue({ code: 'custom', path: ['targetMinutes'], message: `daily target must be ${DAILY_MINUTES_MIN}-${DAILY_MINUTES_MAX} minutes` });
    }
    if (g.targetType === 'total' && (g.targetMinutes < TOTAL_HOURS_MIN * 60 || g.targetMinutes > TOTAL_HOURS_MAX * 60)) {
      ctx.addIssue({ code: 'custom', path: ['targetMinutes'], message: `total target must be ${TOTAL_HOURS_MIN}-${TOTAL_HOURS_MAX} hours` });
    }
    if (g.endDate >= g.startDate) {
      if (daysInclusive(g.startDate, g.endDate) > PERIOD_DAYS_MAX) {
        ctx.addIssue({ code: 'custom', path: ['endDate'], message: `period longer than ${PERIOD_DAYS_MAX} days` });
      } else if (g.targetType === 'total' && dailyTarget(g) > DAILY_MINUTES_MAX) {
        ctx.addIssue({ code: 'custom', path: ['targetMinutes'], message: 'derived daily target above 1440' });
      }
    }
  });

const entrySchema = z
  .object({
    id,
    goalId: id,
    date: isoDate,
    minutes: z.number().int().min(ENTRY_MINUTES_MIN).max(ENTRY_MINUTES_MAX),
    note: z.string().max(ENTRY_NOTE_MAX),
    source: z.enum(['manual', 'timer']),
    createdAt: isoDateTime,
    updatedAt: isoDateTime,
  })
  .strict();

// Settings are lenient on purpose: a missing/odd field falls back to its default
// (same rule as `normalizeSettings` for the kv row). `plusOneShown` is optional (M5).
const settingsSchema = z.object({
  reminderEnabled: z.boolean().optional(),
  reminderTime: z.string().refine(isValidReminderTime, 'HH:MM').optional(),
  lastReminderDate: isoDate.nullable().optional(),
  lastBackupAt: isoDateTime.nullable().optional(),
  plusOneShown: z.record(z.string(), isoDate).optional(),
});

const fileSchema = z.object({
  app: z.literal(BACKUP_APP),
  schemaVersion: z.literal(BACKUP_SCHEMA_VERSION),
  exportedAt: isoDateTime,
  goals: z.array(goalSchema).max(10_000),
  entries: z.array(entrySchema).max(200_000),
  settings: settingsSchema,
});

const schemaError = (message: string): DomainError => ({ code: 'IMPORT_INVALID_SCHEMA', message });
const integrityError = (message: string): DomainError => ({ code: 'IMPORT_INTEGRITY', message });

/**
 * Parse and validate an uploaded backup. `sizeBytes` is the file size reported
 * by the browser (checked before any parsing). Returns the typed file or one of
 * `IMPORT_FILE_TOO_LARGE`, `IMPORT_INVALID_JSON`, `IMPORT_INVALID_SCHEMA`,
 * `IMPORT_UNSUPPORTED_VERSION`, `IMPORT_INTEGRITY`.
 */
export function parseBackup(text: string, sizeBytes: number, today?: ISODate): Result<BackupFile> {
  if (sizeBytes > IMPORT_MAX_BYTES) {
    return fail({ code: 'IMPORT_FILE_TOO_LARGE', message: `file is ${sizeBytes} bytes, limit ${IMPORT_MAX_BYTES}` });
  }
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return fail({ code: 'IMPORT_INVALID_JSON', message: 'JSON.parse failed' });
  }
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return fail(schemaError('root is not an object'));
  const obj = raw as Record<string, unknown>;
  if (obj.app !== BACKUP_APP) return fail(schemaError('app field missing or not one-percent-better'));
  if (!('schemaVersion' in obj)) return fail(schemaError('schemaVersion missing'));
  if (obj.schemaVersion !== BACKUP_SCHEMA_VERSION) {
    const v = typeof obj.schemaVersion === 'number' || typeof obj.schemaVersion === 'string' ? String(obj.schemaVersion) : '?';
    return fail({ code: 'IMPORT_UNSUPPORTED_VERSION', message: `schemaVersion ${v}`, params: { v } });
  }
  const parsed = fileSchema.safeParse(obj);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return fail(schemaError(`${issue?.path.join('.') ?? ''}: ${issue?.message ?? 'invalid'}`));
  }
  const integrity = checkIntegrity(parsed.data.goals, parsed.data.entries, today);
  if (integrity) return fail(integrity);

  const s = parsed.data.settings;
  const settings: Settings = {
    reminderEnabled: s.reminderEnabled ?? false,
    reminderTime: s.reminderTime ?? '20:00',
    lastReminderDate: s.lastReminderDate ?? null,
    lastBackupAt: s.lastBackupAt ?? null,
    plusOneShown: s.plusOneShown ?? {},
  };
  return ok({
    app: BACKUP_APP,
    schemaVersion: BACKUP_SCHEMA_VERSION,
    exportedAt: parsed.data.exportedAt,
    goals: parsed.data.goals,
    entries: parsed.data.entries,
    settings,
  });
}

/**
 * Referential integrity (FR-20): unique ids, every entry points to a goal, entry
 * dates inside the goal period, ≤ 1440 minutes per goal and day, endDate ≥ startDate,
 * and (when `today` is given, M3-D3) no entry dated after today.
 */
export function checkIntegrity(goals: readonly Goal[], entries: readonly LogEntry[], today?: ISODate): DomainError | null {
  const goalById = new Map<string, Goal>();
  for (const g of goals) {
    if (goalById.has(g.id)) return integrityError(`duplicate goal id ${g.id}`);
    if (g.endDate < g.startDate) return integrityError(`goal ${g.id} ends before it starts`);
    goalById.set(g.id, g);
  }
  const entryIds = new Set<string>();
  const perDay = new Map<string, number>();
  for (const e of entries) {
    if (entryIds.has(e.id)) return integrityError(`duplicate entry id ${e.id}`);
    entryIds.add(e.id);
    const goal = goalById.get(e.goalId);
    if (!goal) return integrityError(`entry ${e.id} references unknown goal ${e.goalId}`);
    if (!isWithin(e.date, goal.startDate, goal.endDate)) return integrityError(`entry ${e.id} is outside the goal period`);
    if (today !== undefined && e.date > today) return integrityError(`entry ${e.id} is dated after today (${today})`);
    const key = `${e.goalId}\u0000${e.date}`;
    const total = (perDay.get(key) ?? 0) + e.minutes;
    if (total > DAY_MINUTES_LIMIT) return integrityError(`goal ${e.goalId} has more than ${DAY_MINUTES_LIMIT} minutes on ${e.date}`);
    perDay.set(key, total);
  }
  return null;
}

export type BackupReminder = { kind: 'never' } | { kind: 'old'; days: number };

/**
 * Backup nag (FR-21, A-12): shown when there is at least one goal and the user
 * never exported, or the last export is more than 30 days old.
 */
export function backupReminder(lastBackupAt: ISODateTime | null, goalCount: number, now: Date): BackupReminder | null {
  if (goalCount <= 0) return null;
  if (!lastBackupAt) return { kind: 'never' };
  const last = Date.parse(lastBackupAt);
  if (Number.isNaN(last)) return { kind: 'never' };
  const days = Math.floor((now.getTime() - last) / 86_400_000);
  return days > BACKUP_REMINDER_DAYS ? { kind: 'old', days } : null;
}
