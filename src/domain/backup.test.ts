import { describe, expect, it } from 'vitest';
import { IMPORT_MAX_BYTES } from '../config/constants';
import { buildEntry, buildGoal, datasetS1, FIXED_NOW } from '../test/builders';
import { backupFileName, backupReminder, buildBackup, checkIntegrity, parseBackup, type BackupFile } from './backup';
import { DEFAULT_SETTINGS } from './types';

function sampleFile(): BackupFile {
  const s1 = datasetS1();
  return buildBackup({ goals: s1.goals, entries: s1.entries, settings: { ...DEFAULT_SETTINGS } }, FIXED_NOW);
}

const text = (v: unknown) => JSON.stringify(v);
const codeOf = (text: string, size = text.length) => {
  const r = parseBackup(text, size);
  return r.ok ? 'ok' : r.errors[0].code;
};

describe('buildBackup / backupFileName (M3-AC6)', () => {
  it('produces schemaVersion 1 with app, exportedAt and the three collections; no locale anywhere', () => {
    const file = sampleFile();
    expect(file.app).toBe('one-percent-better');
    expect(file.schemaVersion).toBe(1);
    expect(file.exportedAt).toBe(FIXED_NOW.toISOString());
    expect(file.goals).toHaveLength(5);
    expect(file.entries).toHaveLength(23);
    expect(file.settings).toEqual(DEFAULT_SETTINGS);
    expect(JSON.stringify(file)).not.toContain('locale');
    expect(backupFileName('2026-10-09')).toBe('1percent-better-backup-2026-10-09.json');
  });
});

describe('parseBackup (M3-AC9)', () => {
  it('accepts its own output and round-trips every field', () => {
    const file = sampleFile();
    const r = parseBackup(text(file), 1000);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value).toEqual(file);
  });

  it('IMPORT_FILE_TOO_LARGE above 5 MB (checked before parsing)', () => {
    expect(codeOf(text(sampleFile()), IMPORT_MAX_BYTES + 1)).toBe('IMPORT_FILE_TOO_LARGE');
    expect(codeOf(text(sampleFile()), IMPORT_MAX_BYTES)).toBe('ok');
  });

  it('IMPORT_INVALID_JSON for {abc', () => {
    expect(codeOf('{abc')).toBe('IMPORT_INVALID_JSON');
    expect(codeOf('')).toBe('IMPORT_INVALID_JSON');
  });

  it('IMPORT_INVALID_SCHEMA: missing goals, wrong app, minutes as string, non-object roots, unknown fields', () => {
    const file = sampleFile();
    const { goals: _goals, ...noGoals } = file;
    expect(codeOf(text(noGoals))).toBe('IMPORT_INVALID_SCHEMA');
    expect(codeOf(text({ ...file, app: 'other-app' }))).toBe('IMPORT_INVALID_SCHEMA');
    expect(codeOf(text({ ...file, entries: [{ ...file.entries[0], minutes: '30' }] }))).toBe('IMPORT_INVALID_SCHEMA');
    expect(codeOf(text({ ...file, goals: [{ ...file.goals[0], extra: 1 }] }))).toBe('IMPORT_INVALID_SCHEMA');
    expect(codeOf(text({ ...file, goals: [{ ...file.goals[0], startDate: '2026-13-40' }] }))).toBe('IMPORT_INVALID_SCHEMA');
    expect(codeOf(text({ ...file, entries: [{ ...file.entries[0], source: 'robot' }] }))).toBe('IMPORT_INVALID_SCHEMA');
    expect(codeOf(text([]))).toBe('IMPORT_INVALID_SCHEMA');
    expect(codeOf(text(null))).toBe('IMPORT_INVALID_SCHEMA');
    expect(codeOf(text('str'))).toBe('IMPORT_INVALID_SCHEMA');
    const { schemaVersion: _v, ...noVersion } = file;
    expect(codeOf(text(noVersion))).toBe('IMPORT_INVALID_SCHEMA');
  });

  it('IMPORT_UNSUPPORTED_VERSION for schemaVersion 2 (with the version in params)', () => {
    const r = parseBackup(text({ ...sampleFile(), schemaVersion: 2 }), 100);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.errors[0].code).toBe('IMPORT_UNSUPPORTED_VERSION');
      expect(r.errors[0].params).toEqual({ v: '2' });
    }
    expect(codeOf(text({ ...sampleFile(), schemaVersion: '1' }))).toBe('IMPORT_UNSUPPORTED_VERSION');
  });

  it('IMPORT_INTEGRITY: unknown goalId, duplicate ids, 1441 minutes per day, entry outside the goal period', () => {
    const file = sampleFile();
    expect(codeOf(text({ ...file, entries: [...file.entries, buildEntry({ id: 'x', goalId: 'ghost', date: '2026-10-05' })] }))).toBe('IMPORT_INTEGRITY');
    expect(codeOf(text({ ...file, entries: [...file.entries, { ...file.entries[0] }] }))).toBe('IMPORT_INTEGRITY');
    expect(codeOf(text({ ...file, goals: [...file.goals, { ...file.goals[0] }] }))).toBe('IMPORT_INTEGRITY');
    const full = [
      buildEntry({ id: 'a', goalId: 'g1', date: '2026-10-05', minutes: 1000 }),
      buildEntry({ id: 'b', goalId: 'g1', date: '2026-10-05', minutes: 441 }),
    ];
    expect(codeOf(text({ ...file, entries: full }))).toBe('IMPORT_INTEGRITY');
    full[1].minutes = 440;
    expect(codeOf(text({ ...file, entries: full }))).toBe('ok');
    expect(codeOf(text({ ...file, entries: [buildEntry({ id: 'o', goalId: 'g1', date: '2026-09-30' })] }))).toBe('IMPORT_INTEGRITY');
    expect(codeOf(text({ ...file, goals: [buildGoal({ id: 'g9', startDate: '2026-10-10', endDate: '2026-10-01' })], entries: [] }))).toBe('IMPORT_INTEGRITY');
  });

  it('settings: missing fields fall back to defaults, plusOneShown optional; lastReminderDate kept as-is', () => {
    const file = sampleFile();
    const r = parseBackup(text({ ...file, settings: { reminderEnabled: true, reminderTime: '07:30', lastReminderDate: '2026-10-08', lastBackupAt: null } }), 100);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.settings).toEqual({ reminderEnabled: true, reminderTime: '07:30', lastReminderDate: '2026-10-08', lastBackupAt: null, plusOneShown: {} });
    expect(codeOf(text({ ...file, settings: { reminderTime: '25:00' } }))).toBe('IMPORT_INVALID_SCHEMA');
  });

  it('checkIntegrity returns null for a consistent dataset', () => {
    const s1 = datasetS1();
    expect(checkIntegrity(s1.goals, s1.entries)).toBeNull();
  });
});

describe('backupReminder (M3-AC10, A-12)', () => {
  it('never backed up + goals → never; no goals → null', () => {
    expect(backupReminder(null, 1, FIXED_NOW)).toEqual({ kind: 'never' });
    expect(backupReminder(null, 0, FIXED_NOW)).toBeNull();
    expect(backupReminder('2026-09-01T10:00:00+07:00', 0, FIXED_NOW)).toBeNull();
  });

  it('older than 30 days → old with the day count; 29 days → null; garbage date → never', () => {
    expect(backupReminder('2026-09-08T10:00:00+07:00', 2, FIXED_NOW)).toEqual({ kind: 'old', days: 31 });
    expect(backupReminder('2026-09-10T10:00:00+07:00', 2, FIXED_NOW)).toBeNull();
    expect(backupReminder('2026-09-09T10:00:00+07:00', 2, FIXED_NOW)).toBeNull(); // exactly 30 days
    expect(backupReminder('not-a-date', 2, FIXED_NOW)).toEqual({ kind: 'never' });
  });
});
