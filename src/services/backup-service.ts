import { IMPORT_MAX_BYTES } from '../config/constants';
import type { BackupRepository } from '../data/repositories';
import { backupFileName, buildBackup, type BackupFile } from '../domain/backup-file';
import { toISODate } from '../domain/dates';
import { normalizeSettings } from '../domain/settings';
import { nextUpdatedAt } from '../domain/sync';
import { fail, ok, type ISODate, type ISODateTime, type Result } from '../domain/types';
import type { SettingsService } from './settings-service';

/** The lazily loaded schema module (zod lives there, ADR-27). Tests inject a counting stub. */
export type BackupSchemaModule = Pick<typeof import('../domain/backup'), 'parseBackup'>;
export type BackupSchemaLoader = () => Promise<BackupSchemaModule>;

/** Default loader: the only place the app pulls `domain/backup.ts` (and zod) in, on the first Import. */
const loadBackupSchema: BackupSchemaLoader = () => import('../domain/backup');

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
    /** v2.0 (FR-51, A-29): when signed in, imported rows are stamped "now" so they replace the account's copy. */
    private readonly isSignedIn: () => boolean = () => false,
    /** v3.1 (ADR-27): how the schema module is loaded; memoised after the first success. */
    private readonly loadSchema: BackupSchemaLoader = loadBackupSchema,
  ) {}

  private schema: Promise<BackupSchemaModule> | null = null;

  /** `import()` once; a failed load (offline, chunk not cached) is retried on the next call. */
  private getSchema(): Promise<BackupSchemaModule> {
    if (!this.schema) {
      this.schema = this.loadSchema().catch((e: unknown) => {
        this.schema = null;
        throw e;
      });
    }
    return this.schema;
  }

  /**
   * Serialise everything; the file itself carries `lastBackupAt = now`. Nothing is persisted here
   * (M10-D2): the caller calls `recordExport(now)` once the file really exists / was handed to the
   * browser, so a failed download never counts as a backup.
   */
  async export(now: Date): Promise<BackupExport> {
    const data = await this.backups.exportAll();
    const lastBackupAt = now.toISOString();
    const file = buildBackup({ ...data, settings: { ...data.settings, lastBackupAt } }, now);
    return { fileName: backupFileName(toISODate(now)), json: JSON.stringify(file, null, 2) };
  }

  /** Remember `lastBackupAt = now` after the file was created and downloaded (M10-D2). */
  recordExport(now: Date): Promise<unknown> {
    return this.settings.update({ lastBackupAt: now.toISOString() });
  }

  /**
   * Validate an uploaded file (size, JSON, schema, version, integrity) without
   * touching the database. `today` rejects entries dated in the future (M3-D3).
   * v3.1 (ADR-27): async — the size check runs first (an oversized file never loads the
   * schema chunk), then `domain/backup.ts` is imported once. A failed import rejects
   * (the UI shows its generic read error).
   */
  async parse(text: string, sizeBytes: number, today?: ISODate): Promise<Result<BackupPreview>> {
    if (sizeBytes > IMPORT_MAX_BYTES) {
      return fail({ code: 'IMPORT_FILE_TOO_LARGE', message: `file is ${sizeBytes} bytes, limit ${IMPORT_MAX_BYTES}` });
    }
    const { parseBackup } = await this.getSchema();
    const parsed = parseBackup(text, sizeBytes, today);
    if (!parsed.ok) return parsed;
    return ok({ goals: parsed.value.goals.length, entries: parsed.value.entries.length, exportedAt: parsed.value.exportedAt, file: parsed.value });
  }

  /**
   * Replace everything with the parsed file in one transaction (ADR-08). Clears the
   * running timer and `lastReminderDate`; never touches the device language (ADR-12).
   * Signed in (A-29): every row gets `updatedAt = nextUpdatedAt(now, row.updatedAt)` so the
   * file wins over the account's copy at the next sync; signed out: rows are kept as they are (M3).
   */
  async import(preview: BackupPreview, now: Date = new Date()): Promise<Result<BackupCounts>> {
    const { file } = preview;
    const settings = normalizeSettings({ ...file.settings, lastReminderDate: null });
    const stamp = this.isSignedIn();
    const goals = stamp ? file.goals.map((g) => ({ ...g, updatedAt: nextUpdatedAt(now, g.updatedAt) })) : file.goals;
    const entries = stamp ? file.entries.map((e) => ({ ...e, updatedAt: nextUpdatedAt(now, e.updatedAt) })) : file.entries;
    await this.backups.replaceAll({ goals, entries, settings });
    return ok({ goals: file.goals.length, entries: file.entries.length });
  }

  /** Current goal/entry counts, for the "replaces … (a goals, b entries)" line of D3. */
  async counts(): Promise<BackupCounts> {
    const data = await this.backups.exportAll();
    return { goals: data.goals.length, entries: data.entries.length };
  }
}
