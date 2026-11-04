// Backup file: the part that needs no schema library (v3.1, ADR-27). Everything Today, Settings,
// the BackupBanner and `BackupService.export` need lives here so the cold-load path never pulls
// zod in; the zod schema and `parseBackup` stay in `./backup.ts`, loaded lazily on Import.
import type { Roadmap, RoadmapCheckpoint, RoadmapItem, RoadmapPhase } from './roadmap';
import type { Goal, ISODate, ISODateTime, LogEntry, Settings } from './types';

export const BACKUP_APP = 'one-percent-better';
/** v8.0 (M17, ADR-49): export writes 2 (roadmap collections); import reads 1 and 2. */
export const BACKUP_SCHEMA_VERSION = 2;
export const BACKUP_MIME_TYPE = 'application/json;charset=utf-8';
/** Days without a backup after which the app nags (A-12). */
export const BACKUP_REMINDER_DAYS = 30;

/** The four roadmap collections (schemaVersion 2). */
export interface RoadmapBackupContent {
  roadmaps: Roadmap[];
  roadmapPhases: RoadmapPhase[];
  roadmapItems: RoadmapItem[];
  roadmapCheckpoints: RoadmapCheckpoint[];
}

/**
 * What goes into / comes out of the database. Structurally equal to `BackupExportData` in the data layer; the roadmap
 * arrays are optional only so older callers (tests building a three-collection file) keep working — `buildBackup`
 * writes them as `[]`.
 */
export interface BackupContent extends Partial<RoadmapBackupContent> {
  goals: Goal[];
  entries: LogEntry[];
  settings: Settings;
}

/**
 * A parsed or built file. `schemaVersion 1` files have no roadmap arrays (`undefined`): importing one keeps the
 * device's roadmaps (A-87). Built files are always version 2 with the four arrays present.
 */
export interface BackupFile extends Partial<RoadmapBackupContent> {
  app: typeof BACKUP_APP;
  schemaVersion: 1 | 2;
  exportedAt: ISODateTime;
  goals: Goal[];
  entries: LogEntry[];
  settings: Settings;
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
    roadmaps: content.roadmaps ?? [],
    roadmapPhases: content.roadmapPhases ?? [],
    roadmapItems: content.roadmapItems ?? [],
    roadmapCheckpoints: content.roadmapCheckpoints ?? [],
  };
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
