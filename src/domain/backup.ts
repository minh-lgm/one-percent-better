// Backup file format, schemaVersion 1 and 2 (ARCHITECTURE §5.5, §4.8 f; FR-19, FR-20, FR-21, FR-77, NFR-04, NFR-05; ADR-49).
// Pure: parsing and validation only. The file is untrusted input: size limit,
// JSON.parse in try/catch, strict zod schema, referential integrity. No eval.
// v3.1 (ADR-27): this is one of the two zod boundaries and is loaded lazily (Import only).
import { z } from 'zod';
import { BACKUP_APP, BACKUP_SCHEMA_VERSION, type BackupFile, type RoadmapBackupContent } from './backup-file';
import {
  CHECKPOINT_NOTE_MAX,
  CHECKPOINT_SCORE_MAX,
  CHECKPOINT_TITLE_MAX,
  DAILY_MINUTES_MAX,
  DAILY_MINUTES_MIN,
  DAY_MINUTES_LIMIT,
  ENTRY_MINUTES_MAX,
  ENTRY_MINUTES_MIN,
  ENTRY_NOTE_MAX,
  GOAL_NAME_MAX,
  GOAL_WHY_MAX,
  ID_MAX,
  IMPORT_MAX_BYTES,
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
  TOTAL_HOURS_MAX,
  TOTAL_HOURS_MIN,
  WEEKLY_TARGET_MAX,
  WEEKLY_TARGET_MIN,
  WEEKLY_TARGET_STEP,
} from '../config/constants';
import { daysInclusive, isValidISODate } from './dates';
import { dailyTarget, isWithinGoal } from './goal';
import { isValidReminderTime } from './reminder';
import { fail, ok, type DomainError, type Goal, type ISODate, type LogEntry, type Result, type Settings } from './types';

// The schema-free part (constants, types, `buildBackup`, `backupReminder`) lives in `./backup-file.ts`
// and is re-exported here so older imports keep working (ADR-27). Application code must not import
// this module statically (ESLint): `BackupService.parse` loads it with `import()`.
export { BACKUP_APP, BACKUP_MIME_TYPE, BACKUP_REMINDER_DAYS, BACKUP_SCHEMA_VERSION, backupFileName, backupReminder, buildBackup } from './backup-file';
export type { BackupContent, BackupFile, BackupReminder } from './backup-file';

// `params.structural`: a malformed/impossible date is a format problem (generic sentence), not an out-of-range value.
const isoDate = z.string().refine(isValidISODate, { message: 'YYYY-MM-DD', params: { structural: true } });
const isoDateTime = z.string().refine((v) => !Number.isNaN(Date.parse(v)), 'ISO date-time');
// Same limit as the cloud (mapper.ts / SQL): a row the importer accepts must be pushable (M7-D1).
// zod's `.min()/.max()` on strings count code points, the same unit as `domain/text.ts` `charLength` and SQL `char_length` (M10-D1).
const id = z.string().min(1).max(ID_MAX);

// M3-D3: a backup must obey the same goal limits as the form (ARCH §4): daily
// 1–1440 min, total 1–10,000 h (stored in minutes), period ≤ 1827 days, derived
// daily target ≤ 1440. `endDate < startDate` stays an integrity error (M3-AC9).
// v4.0 (M11, ADR-32): `endDate` may be `null` (open-ended goal, daily only); the key itself is still
// required — a missing key is a structural error like any other missing field. `schemaVersion` stays 1.
const goalSchema = z
  .object({
    id,
    name: z.string().trim().min(1).max(GOAL_NAME_MAX),
    why: z.string().trim().max(GOAL_WHY_MAX),
    targetType: z.enum(['daily', 'total']),
    targetMinutes: z.number().int().min(1).max(TOTAL_HOURS_MAX * 60),
    startDate: isoDate,
    endDate: isoDate.nullable(),
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
    // v4.0 (A-48): a total goal needs a period to derive its daily target → a business-limit issue (outOfRange).
    if (g.endDate === null && g.targetType === 'total') {
      ctx.addIssue({ code: 'custom', path: ['endDate'], message: 'a total goal needs an end date' });
    }
    // M10-D3: the date refinements above may already have failed; never compute with an impossible date.
    // Open-ended goals (`endDate === null`) have no period limit (A-49).
    if (g.endDate !== null && isValidISODate(g.startDate) && isValidISODate(g.endDate) && g.endDate >= g.startDate) {
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

// v8.0 (ADR-49): the four roadmap collections of a schemaVersion 2 file, strict rows, the limits of ARCH §4.8 (a).
// One decimal place at most for scores (A-91); `position` finite (ADR-51); actual dates ≤ today are checked in
// `checkRoadmapIntegrity` (needs `today`).
const oneDecimal = (n: number) => Math.abs(n * 10 - Math.round(n * 10)) < 1e-9;
const title = (max: number) => z.string().trim().min(1).max(max);
const note = (max: number) => z.string().max(max);
const finite = z.number().refine(Number.isFinite, 'finite');
const roadmapSchema = z
  .object({
    id,
    title: title(ROADMAP_TITLE_MAX),
    note: note(ROADMAP_NOTE_MAX),
    goalId: id.nullable(),
    weeklyTargetMinutes: z.number().int().min(WEEKLY_TARGET_MIN).max(WEEKLY_TARGET_MAX).multipleOf(WEEKLY_TARGET_STEP).nullable(),
    milestoneLabel: z.string().trim().max(ROADMAP_MILESTONE_LABEL_MAX),
    milestoneDate: isoDate.nullable(),
    createdAt: isoDateTime,
    updatedAt: isoDateTime,
  })
  .strict();
const phaseSchema = z.object({ id, roadmapId: id, title: title(PHASE_TITLE_MAX), note: note(PHASE_NOTE_MAX), position: finite, createdAt: isoDateTime, updatedAt: isoDateTime }).strict();
const itemSchema = z
  .object({
    id,
    roadmapId: id,
    phaseId: id,
    title: title(ITEM_TITLE_MAX),
    note: note(ITEM_NOTE_MAX),
    position: finite,
    plannedStart: isoDate,
    plannedEnd: isoDate,
    actualStart: isoDate.nullable(),
    actualEnd: isoDate.nullable(),
    createdAt: isoDateTime,
    updatedAt: isoDateTime,
  })
  .strict()
  .superRefine((i, ctx) => {
    if (!isValidISODate(i.plannedStart) || !isValidISODate(i.plannedEnd)) return;
    if (i.plannedEnd < i.plannedStart) ctx.addIssue({ code: 'custom', path: ['plannedEnd'], message: 'plannedEnd before plannedStart' });
    else if (daysInclusive(i.plannedStart, i.plannedEnd) > ITEM_SPAN_MAX_DAYS) ctx.addIssue({ code: 'custom', path: ['plannedEnd'], message: `item longer than ${ITEM_SPAN_MAX_DAYS} days` });
    if (i.actualStart !== null && i.actualEnd !== null && isValidISODate(i.actualStart) && isValidISODate(i.actualEnd) && i.actualEnd < i.actualStart) {
      ctx.addIssue({ code: 'custom', path: ['actualEnd'], message: 'actualEnd before actualStart' });
    }
  });
const score = finite.min(0).refine(oneDecimal, 'one decimal place');
const checkpointSchema = z
  .object({
    id,
    roadmapId: id,
    title: title(CHECKPOINT_TITLE_MAX),
    note: note(CHECKPOINT_NOTE_MAX),
    date: isoDate,
    maxScore: finite.gt(0).max(CHECKPOINT_SCORE_MAX).refine(oneDecimal, 'one decimal place'),
    threshold: score.nullable(),
    score: score.nullable(),
    createdAt: isoDateTime,
    updatedAt: isoDateTime,
  })
  .strict()
  .superRefine((c, ctx) => {
    for (const f of ['threshold', 'score'] as const) if (c[f] !== null && c[f] > c.maxScore) ctx.addIssue({ code: 'custom', path: [f], message: `${f} above maxScore` });
  });

const baseFile = {
  app: z.literal(BACKUP_APP),
  exportedAt: isoDateTime,
  goals: z.array(goalSchema).max(10_000),
  entries: z.array(entrySchema).max(200_000),
  settings: settingsSchema,
};
// Not strict at the root on purpose: a v1 file carrying stray roadmap keys has them dropped (ARCH §4.8 f).
const fileSchemaV1 = z.object({ ...baseFile, schemaVersion: z.literal(1) });
const fileSchemaV2 = z.object({
  ...baseFile,
  schemaVersion: z.literal(2),
  roadmaps: z.array(roadmapSchema).max(10_000),
  roadmapPhases: z.array(phaseSchema).max(100_000),
  roadmapItems: z.array(itemSchema).max(200_000),
  roadmapCheckpoints: z.array(checkpointSchema).max(100_000),
});

const schemaError = (message: string): DomainError => ({ code: 'IMPORT_INVALID_SCHEMA', message });
/** Same code, `params.variant = 'outOfRange'` (ARCH §5.4 v3.1, M5-P1): the file is well-formed but a value breaks a business limit. */
const outOfRangeError = (message: string): DomainError => ({ code: 'IMPORT_INVALID_SCHEMA', message, params: { variant: 'outOfRange' } });

/** Fields whose limits are business rules (name/why/note length, targets, minutes, period; v8.0: roadmap text, dates, scores); `id` length and structure are not. */
const RANGE_FIELDS = new Set(['name', 'why', 'note', 'targetMinutes', 'minutes', 'startDate', 'endDate', 'title', 'milestoneLabel', 'weeklyTargetMinutes', 'plannedStart', 'plannedEnd', 'actualStart', 'actualEnd', 'maxScore', 'threshold', 'score']);

/** A zod issue that only says "right type, value outside the app's limits". */
function isRangeIssue(issue: z.core.$ZodIssue): boolean {
  const field = issue.path[issue.path.length - 1];
  if (typeof field !== 'string' || !RANGE_FIELDS.has(field)) return false;
  if ((issue as { params?: { structural?: boolean } }).params?.structural) return false;
  if (issue.code === 'too_big' || issue.code === 'too_small' || issue.code === 'custom' || issue.code === 'not_multiple_of') return true;
  // `12.5` for an integer field: zod reports invalid_type with expected 'int'.
  return issue.code === 'invalid_type' && issue.expected === 'int';
}
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
  // v8.0 (ADR-49): 1 (older files, no roadmaps) and 2 (current) are read; anything else is unsupported.
  if (obj.schemaVersion !== 1 && obj.schemaVersion !== BACKUP_SCHEMA_VERSION) {
    const v = typeof obj.schemaVersion === 'number' || typeof obj.schemaVersion === 'string' ? String(obj.schemaVersion) : '?';
    return fail({ code: 'IMPORT_UNSUPPORTED_VERSION', message: `schemaVersion ${v}`, params: { v } });
  }
  const parsed = obj.schemaVersion === 1 ? fileSchemaV1.safeParse(obj) : fileSchemaV2.safeParse(obj);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const message = `${issue?.path.join('.') ?? ''}: ${issue?.message ?? 'invalid'}`;
    return fail(parsed.error.issues.every(isRangeIssue) ? outOfRangeError(message) : schemaError(message));
  }
  const integrity = checkIntegrity(parsed.data.goals, parsed.data.entries, today);
  if (integrity) return fail(integrity);
  const roadmaps: Partial<RoadmapBackupContent> = parsed.data.schemaVersion === 2 ? { roadmaps: parsed.data.roadmaps, roadmapPhases: parsed.data.roadmapPhases, roadmapItems: parsed.data.roadmapItems, roadmapCheckpoints: parsed.data.roadmapCheckpoints } : {};
  if (parsed.data.schemaVersion === 2) {
    const problem = checkRoadmapIntegrity(parsed.data, parsed.data.goals, today);
    if (problem) return fail(problem);
  }

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
    schemaVersion: parsed.data.schemaVersion,
    exportedAt: parsed.data.exportedAt,
    goals: parsed.data.goals,
    entries: parsed.data.entries,
    settings,
    ...roadmaps,
  });
}

/**
 * v8.0 (ARCH §4.8 f): unique ids per collection; every phase/item/checkpoint points at a roadmap of the file; an item's
 * phase belongs to the same roadmap; `goalId` is null or a goal of the file; no two roadmaps share a goal; actual
 * dates not after `today` (when given). Counts above the business caps are `outOfRange` (same rule as the forms).
 */
export function checkRoadmapIntegrity(file: RoadmapBackupContent, goals: readonly Goal[], today?: ISODate): DomainError | null {
  if (file.roadmaps.length > ROADMAP_MAX) return outOfRangeError(`more than ${ROADMAP_MAX} roadmaps`);
  const goalIds = new Set(goals.map((g) => g.id));
  const roadmapIds = new Set<string>();
  const linkedGoals = new Set<string>();
  for (const r of file.roadmaps) {
    if (roadmapIds.has(r.id)) return integrityError(`duplicate roadmap id ${r.id}`);
    roadmapIds.add(r.id);
    if (r.goalId !== null) {
      if (!goalIds.has(r.goalId)) return integrityError(`roadmap ${r.id} links unknown goal ${r.goalId}`);
      if (linkedGoals.has(r.goalId)) return integrityError(`goal ${r.goalId} is linked by two roadmaps`);
      linkedGoals.add(r.goalId);
    }
  }
  const phaseRoadmap = new Map<string, string>();
  const perRoadmap = new Map<string, { phases: number; items: number; checkpoints: number }>();
  const bump = (roadmapId: string, key: 'phases' | 'items' | 'checkpoints') => {
    const c = perRoadmap.get(roadmapId) ?? { phases: 0, items: 0, checkpoints: 0 };
    c[key] += 1;
    perRoadmap.set(roadmapId, c);
    return c[key];
  };
  for (const p of file.roadmapPhases) {
    if (phaseRoadmap.has(p.id)) return integrityError(`duplicate phase id ${p.id}`);
    if (!roadmapIds.has(p.roadmapId)) return integrityError(`phase ${p.id} references unknown roadmap ${p.roadmapId}`);
    phaseRoadmap.set(p.id, p.roadmapId);
    if (bump(p.roadmapId, 'phases') > ROADMAP_PHASE_MAX) return outOfRangeError(`roadmap ${p.roadmapId} has more than ${ROADMAP_PHASE_MAX} phases`);
  }
  const itemIds = new Set<string>();
  for (const i of file.roadmapItems) {
    if (itemIds.has(i.id)) return integrityError(`duplicate item id ${i.id}`);
    itemIds.add(i.id);
    if (!roadmapIds.has(i.roadmapId)) return integrityError(`item ${i.id} references unknown roadmap ${i.roadmapId}`);
    if (phaseRoadmap.get(i.phaseId) !== i.roadmapId) return integrityError(`item ${i.id} references phase ${i.phaseId} of another roadmap`);
    if (today !== undefined && ((i.actualStart !== null && i.actualStart > today) || (i.actualEnd !== null && i.actualEnd > today))) return integrityError(`item ${i.id} has an actual date after today`);
    if (bump(i.roadmapId, 'items') > ROADMAP_ITEM_MAX) return outOfRangeError(`roadmap ${i.roadmapId} has more than ${ROADMAP_ITEM_MAX} items`);
  }
  const cpIds = new Set<string>();
  for (const c of file.roadmapCheckpoints) {
    if (cpIds.has(c.id)) return integrityError(`duplicate checkpoint id ${c.id}`);
    cpIds.add(c.id);
    if (!roadmapIds.has(c.roadmapId)) return integrityError(`checkpoint ${c.id} references unknown roadmap ${c.roadmapId}`);
    if (bump(c.roadmapId, 'checkpoints') > ROADMAP_CHECKPOINT_MAX) return outOfRangeError(`roadmap ${c.roadmapId} has more than ${ROADMAP_CHECKPOINT_MAX} checkpoints`);
  }
  // The whole roadmap may cover at most PERIOD_DAYS_MAX days (first start → last end).
  const span = new Map<string, { start: string; end: string }>();
  for (const i of file.roadmapItems) {
    const s = span.get(i.roadmapId);
    if (!s) span.set(i.roadmapId, { start: i.plannedStart, end: i.plannedEnd });
    else {
      if (i.plannedStart < s.start) s.start = i.plannedStart;
      if (i.plannedEnd > s.end) s.end = i.plannedEnd;
    }
  }
  for (const [rid, s] of span) if (daysInclusive(s.start, s.end) > PERIOD_DAYS_MAX) return outOfRangeError(`roadmap ${rid} spans more than ${PERIOD_DAYS_MAX} days`);
  return null;
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
    if (g.endDate !== null && g.endDate < g.startDate) return integrityError(`goal ${g.id} ends before it starts`);
    goalById.set(g.id, g);
  }
  const entryIds = new Set<string>();
  const perDay = new Map<string, number>();
  for (const e of entries) {
    if (entryIds.has(e.id)) return integrityError(`duplicate entry id ${e.id}`);
    entryIds.add(e.id);
    const goal = goalById.get(e.goalId);
    if (!goal) return integrityError(`entry ${e.id} references unknown goal ${e.goalId}`);
    if (!isWithinGoal(e.date, goal)) return integrityError(`entry ${e.id} is outside the goal period`);
    if (today !== undefined && e.date > today) return integrityError(`entry ${e.id} is dated after today (${today})`);
    const key = `${e.goalId}\u0000${e.date}`;
    const total = (perDay.get(key) ?? 0) + e.minutes;
    if (total > DAY_MINUTES_LIMIT) return integrityError(`goal ${e.goalId} has more than ${DAY_MINUTES_LIMIT} minutes on ${e.date}`);
    perDay.set(key, total);
  }
  return null;
}
