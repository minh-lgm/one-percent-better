import { describe, expect, it } from 'vitest';
import { IMPORT_MAX_BYTES } from '../config/constants';
import { buildEntry, buildGoal, datasetO1, datasetS1, datasetS1O1, FIXED_NOW } from '../test/builders';
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

describe('M3-D3: import applies the goal/entry limits of the app (IMPORT_INVALID_SCHEMA / IMPORT_INTEGRITY)', () => {
  const withGoal = (overrides: Partial<ReturnType<typeof buildGoal>>, entries: ReturnType<typeof buildEntry>[] = []) => {
    const file = sampleFile();
    return text({ ...file, goals: [{ ...file.goals[0], ...overrides }, ...file.goals.slice(1)], entries: [...file.entries, ...entries] });
  };

  it('daily goal with targetMinutes 600,000 or 1,441 → IMPORT_INVALID_SCHEMA; 1,440 ok', () => {
    expect(codeOf(withGoal({ targetType: 'daily', targetMinutes: 600_000 }))).toBe('IMPORT_INVALID_SCHEMA');
    expect(codeOf(withGoal({ targetType: 'daily', targetMinutes: 1441 }))).toBe('IMPORT_INVALID_SCHEMA');
    expect(codeOf(withGoal({ targetType: 'daily', targetMinutes: 1440 }))).toBe('ok');
  });

  it('total goal outside 1–10,000 hours or with a derived daily target above 1,440 → IMPORT_INVALID_SCHEMA', () => {
    expect(codeOf(withGoal({ targetType: 'total', targetMinutes: 30 }))).toBe('IMPORT_INVALID_SCHEMA');
    expect(codeOf(withGoal({ targetType: 'total', targetMinutes: 600_060 }))).toBe('IMPORT_INVALID_SCHEMA');
    expect(codeOf(withGoal({ targetType: 'total', targetMinutes: 600_000, startDate: '2026-10-01', endDate: '2026-10-31' }))).toBe('IMPORT_INVALID_SCHEMA');
    expect(codeOf(withGoal({ targetType: 'total', targetMinutes: 6000, startDate: '2026-01-01', endDate: '2026-12-31' }))).toBe('ok');
  });

  it('period longer than 1,827 days → IMPORT_INVALID_SCHEMA; 1,827 ok; end before start stays IMPORT_INTEGRITY', () => {
    const only = (overrides: Partial<ReturnType<typeof buildGoal>>) => text({ ...sampleFile(), goals: [{ ...sampleFile().goals[0], ...overrides }], entries: [] });
    expect(codeOf(only({ startDate: '2000-01-01', endDate: '2099-12-31' }))).toBe('IMPORT_INVALID_SCHEMA');
    expect(codeOf(only({ startDate: '2022-01-01', endDate: '2027-01-01' }))).toBe('ok');
    expect(codeOf(only({ startDate: '2026-10-31', endDate: '2026-10-01' }))).toBe('IMPORT_INTEGRITY');
  });

  it('an entry dated after today → IMPORT_INTEGRITY when today is given; today itself is fine', () => {
    const future = buildEntry({ id: 'future', goalId: 'g1', date: '2026-10-31', minutes: 10 });
    const todayEntry = buildEntry({ id: 'today', goalId: 'g1', date: '2026-10-09', minutes: 10 });
    const r = parseBackup(withGoal({}, [future]), 1000, '2026-10-09');
    expect(r.ok ? 'ok' : r.errors[0].code).toBe('IMPORT_INTEGRITY');
    expect(parseBackup(withGoal({}, [todayEntry]), 1000, '2026-10-09').ok).toBe(true);
    // Without `today` (pure format checks) the date rule is not applied.
    expect(parseBackup(withGoal({}, [future]), 1000).ok).toBe(true);
    expect(checkIntegrity(sampleFile().goals, [future], '2026-10-09')?.code).toBe('IMPORT_INTEGRITY');
    expect(checkIntegrity(sampleFile().goals, [future])).toBeNull();
  });
});

describe('IMPORT_INVALID_SCHEMA variant outOfRange (M10-AC9, ARCH §5.4 v3.1, M5-P1)', () => {
  const variantOf = (t: string, today?: string) => {
    const r = parseBackup(t, 1000, today);
    if (r.ok) return 'ok';
    return `${r.errors[0].code}${r.errors[0].params?.variant ? `:${String(r.errors[0].params.variant)}` : ''}`;
  };
  const withGoal = (overrides: Partial<ReturnType<typeof buildGoal>>) => {
    const file = sampleFile();
    return text({ ...file, goals: [{ ...file.goals[0], ...overrides }, ...file.goals.slice(1)] });
  };
  const withEntry = (overrides: Partial<ReturnType<typeof buildEntry>>) => {
    const file = sampleFile();
    return text({ ...file, entries: [{ ...file.entries[0], ...overrides }, ...file.entries.slice(1)] });
  };

  it('value outside a business limit → IMPORT_INVALID_SCHEMA with params.variant = outOfRange', () => {
    expect(variantOf(withGoal({ targetType: 'daily', targetMinutes: 600_000 }))).toBe('IMPORT_INVALID_SCHEMA:outOfRange');
    expect(variantOf(withGoal({ startDate: '2000-01-01', endDate: '2099-12-31' }))).toBe('IMPORT_INVALID_SCHEMA:outOfRange');
    expect(variantOf(withGoal({ name: 'n'.repeat(61) }))).toBe('IMPORT_INVALID_SCHEMA:outOfRange');
    expect(variantOf(withGoal({ name: '   ' }))).toBe('IMPORT_INVALID_SCHEMA:outOfRange');
    expect(variantOf(withGoal({ why: 'w'.repeat(281) }))).toBe('IMPORT_INVALID_SCHEMA:outOfRange');
    expect(variantOf(withGoal({ targetType: 'total', targetMinutes: 600_000, startDate: '2026-10-01', endDate: '2026-10-31' }))).toBe('IMPORT_INVALID_SCHEMA:outOfRange');
    expect(variantOf(withEntry({ minutes: 1441 }))).toBe('IMPORT_INVALID_SCHEMA:outOfRange');
    expect(variantOf(withEntry({ minutes: 12.5 }))).toBe('IMPORT_INVALID_SCHEMA:outOfRange');
    expect(variantOf(withEntry({ note: 'n'.repeat(281) }))).toBe('IMPORT_INVALID_SCHEMA:outOfRange');
  });

  it('structural problems keep the plain IMPORT_INVALID_SCHEMA (no variant); integrity problems stay IMPORT_INTEGRITY', () => {
    expect(variantOf('[]')).toBe('IMPORT_INVALID_SCHEMA');
    expect(variantOf(text({ ...sampleFile(), app: 'other-app' }))).toBe('IMPORT_INVALID_SCHEMA');
    expect(variantOf(withEntry({ minutes: '30' as unknown as number }))).toBe('IMPORT_INVALID_SCHEMA');
    expect(variantOf(withGoal({ id: 'x'.repeat(65) }))).toBe('IMPORT_INVALID_SCHEMA');
    expect(variantOf(text({ ...sampleFile(), goals: undefined }))).toBe('IMPORT_INVALID_SCHEMA');
    // Range + structure in the same file → the structural message (the file is not from this app).
    expect(variantOf(text({ ...sampleFile(), goals: [{ ...sampleFile().goals[0], name: 'n'.repeat(61), bogus: 1 }] }))).toBe('IMPORT_INVALID_SCHEMA');
    const future = buildEntry({ id: 'future', goalId: 'g1', date: '2026-10-10', minutes: 10 });
    expect(variantOf(text({ ...sampleFile(), entries: [...sampleFile().entries, future] }), '2026-10-09')).toBe('IMPORT_INTEGRITY');
  });
});

describe('M10-D3: malformed calendar dates are a structured schema error, never a thrown RangeError', () => {
  const withGoal = (overrides: Partial<ReturnType<typeof buildGoal>>) => {
    const file = sampleFile();
    return text({ ...file, goals: [{ ...file.goals[0], ...overrides }], entries: [] });
  };
  for (const field of ['startDate', 'endDate'] as const) {
    for (const bad of ['2026-02-30', 'hello', '2026-1-5', '']) {
      it(`goal.${field} = ${JSON.stringify(bad)} → IMPORT_INVALID_SCHEMA without the outOfRange variant`, () => {
        const r = parseBackup(withGoal({ [field]: bad }), 1000);
        expect(r.ok).toBe(false);
        if (!r.ok) {
          expect(r.errors[0].code).toBe('IMPORT_INVALID_SCHEMA');
          expect(r.errors[0].params?.variant).toBeUndefined();
        }
      });
    }
  }
  it('a real but too long period still carries the outOfRange variant', () => {
    const r = parseBackup(withGoal({ startDate: '2000-01-01', endDate: '2099-12-31' }), 1000);
    expect(r.ok ? 'ok' : r.errors[0].params?.variant).toBe('outOfRange');
  });
});

// ---- v4.0 (M11, ADR-32): open-ended goals in the backup file, schemaVersion stays 1 ----
describe('backup with "endDate": null (M11-AC5, FR-19, FR-20, A-54)', () => {
  const fileS1O1 = () => {
    const d = datasetS1O1();
    return buildBackup({ goals: d.goals, entries: d.entries, settings: { ...DEFAULT_SETTINGS } }, FIXED_NOW);
  };
  const fileO1 = (goalPatch: Partial<ReturnType<typeof buildGoal>> = {}, extraEntries: ReturnType<typeof buildEntry>[] = []) => {
    const d = datasetO1();
    return text({ app: 'one-percent-better', schemaVersion: 1, exportedAt: FIXED_NOW.toISOString(), goals: [{ ...d.goals[0], ...goalPatch }], entries: [...d.entries, ...extraEntries], settings: {} });
  };
  const resultOf = (t: string, today?: string) => {
    const r = parseBackup(t, t.length, today);
    if (r.ok) return 'ok';
    return `${r.errors[0].code}${r.errors[0].params?.variant ? `:${String(r.errors[0].params.variant)}` : ''}`;
  };

  it('buildBackup keeps schemaVersion 1 and writes the key with a JSON null; parse accepts it and round-trips S1 + O1 (6 goals, 27 entries)', () => {
    const file = fileS1O1();
    expect(file.schemaVersion).toBe(1);
    const json = JSON.stringify(file);
    expect(json).toContain('"endDate":null');
    const o1 = (JSON.parse(json) as { goals: Array<Record<string, unknown>> }).goals.find((g) => g.id === 'o1')!;
    expect('endDate' in o1).toBe(true);
    expect(o1.endDate).toBeNull();
    const r = parseBackup(json, json.length, '2026-10-09');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.goals).toHaveLength(6);
    expect(r.value.entries).toHaveLength(27);
    expect(r.value.goals.find((g) => g.id === 'o1')?.endDate).toBeNull();
    expect(r.value).toEqual(file);
  });

  it('total + endDate null → IMPORT_INVALID_SCHEMA with variant outOfRange (a business rule, A-48)', () => {
    expect(resultOf(fileO1({ targetType: 'total', targetMinutes: 6000 }))).toBe('IMPORT_INVALID_SCHEMA:outOfRange');
  });

  it('a goal whose endDate key is missing → IMPORT_INVALID_SCHEMA without a variant (structural, like any missing field)', () => {
    const d = datasetO1();
    const { endDate: _e, ...noKey } = d.goals[0];
    const t = text({ app: 'one-percent-better', schemaVersion: 1, exportedAt: FIXED_NOW.toISOString(), goals: [noKey], entries: [], settings: {} });
    expect(resultOf(t)).toBe('IMPORT_INVALID_SCHEMA');
    expect(resultOf(fileO1({ endDate: undefined as unknown as null }))).toBe('IMPORT_INVALID_SCHEMA');
  });

  it('no period limit for an open-ended goal: startDate 2000-01-01 is fine (a finite 2000 → 2099 goal is outOfRange)', () => {
    expect(resultOf(fileO1({ startDate: '2000-01-01' }))).toBe('ok');
    expect(resultOf(fileO1({ startDate: '2000-01-01', endDate: '2099-12-31' }))).toBe('IMPORT_INVALID_SCHEMA:outOfRange');
  });

  it('integrity: an entry before the start → IMPORT_INTEGRITY; an entry after today → IMPORT_INTEGRITY; far-future entries are fine without today', () => {
    expect(resultOf(fileO1({}, [buildEntry({ id: 'early', goalId: 'o1', date: '2026-09-30', minutes: 5 })]), '2026-10-09')).toBe('IMPORT_INTEGRITY');
    expect(resultOf(fileO1({}, [buildEntry({ id: 'future', goalId: 'o1', date: '2026-10-10', minutes: 5 })]), '2026-10-09')).toBe('IMPORT_INTEGRITY');
    expect(resultOf(fileO1({}, [buildEntry({ id: 'later', goalId: 'o1', date: '2031-10-02', minutes: 5 })]), '2031-10-02')).toBe('ok');
    const d = datasetO1();
    expect(checkIntegrity(d.goals, [...d.entries, buildEntry({ id: 'early', goalId: 'o1', date: '2026-09-30', minutes: 5 })])?.code).toBe('IMPORT_INTEGRITY');
    expect(checkIntegrity(d.goals, d.entries, '2026-10-09')).toBeNull();
  });

  it('null endDate plus an impossible start date is still the plain schema error; endDate null never counts as "ends before it starts"', () => {
    expect(resultOf(fileO1({ startDate: '2026-02-30' }))).toBe('IMPORT_INVALID_SCHEMA');
    expect(checkIntegrity([buildGoal({ id: 'x', endDate: null, startDate: '2026-10-01' })], [])).toBeNull();
  });

  it('an older backup (every goal with an end date) is read exactly as before', () => {
    const s1 = sampleFile();
    const r = parseBackup(text(s1), 1000);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.goals.every((g) => typeof g.endDate === 'string')).toBe(true);
  });
});
