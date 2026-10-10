import type { BackupRepository } from '../data/repositories';
import { backupFileName, buildBackup, parseBackup, type BackupFile } from '../domain/backup';
import { toISODate } from '../domain/dates';
import { normalizeSettings } from '../domain/settings';
import { ok, type ISODate, type ISODateTime, type Result } from '../domain/types';
import type { SettingsService } from './settings-service';

export interface BackupExport {
  fileName: string;
  json: string;
}

/** A validated file, ready to be confirmed by the user (D3). */
export interface BackupPreview {
  goals: number;
  entries: number;
  exportedAt: ISODateTime;
  file: BackupFile;
}

export interface BackupCounts {
  goals: number;
  entries: number;
}

/** Export / parse / import JSON backups (FR-19, FR-20; ARCHITECTURE §5.3, §5.5). */
export class BackupService {
  constructor(
    private readonly backups: BackupRepository,
    private readonly settings: SettingsService,
  ) {}

  /** Serialise everything and remember `lastBackupAt = now` (also inside the file). */
  async export(now: Date): Promise<BackupExport> {
    const data = await this.backups.exportAll();
    const lastBackupAt = now.toISOString();
    const file = buildBackup({ ...data, settings: { ...data.settings, lastBackupAt } }, now);
    await this.settings.update({ lastBackupAt });
    return { fileName: backupFileName(toISODate(now)), json: JSON.stringify(file, null, 2) };
  }

  /**
   * Validate an uploaded file (size, JSON, schema, version, integrity) without
   * touching the database. `today` rejects entries dated in the future (M3-D3).
   */
  parse(text: string, sizeBytes: number, today?: ISODate): Result<BackupPreview> {
    const parsed = parseBackup(text, sizeBytes, today);
    if (!parsed.ok) return parsed;
    return ok({ goals: parsed.value.goals.length, entries: parsed.value.entries.length, exportedAt: parsed.value.exportedAt, file: parsed.value });
  }

  /**
   * Replace everything with the parsed file in one transaction (ADR-08). Clears the
   * running timer and `lastReminderDate`; never touches the device language (ADR-12).
   */
  async import(preview: BackupPreview): Promise<Result<BackupCounts>> {
    const { file } = preview;
    const settings = normalizeSettings({ ...file.settings, lastReminderDate: null });
    await this.backups.replaceAll({ goals: file.goals, entries: file.entries, settings });
    return ok({ goals: file.goals.length, entries: file.entries.length });
  }

  /** Current goal/entry counts, for the "replaces … (a goals, b entries)" line of D3. */
  async counts(): Promise<BackupCounts> {
    const data = await this.backups.exportAll();
    return { goals: data.goals.length, entries: data.entries.length };
  }
}
