import { describe, expect, it } from 'vitest';
import integrity from '../../e2e/fixtures/invalid-integrity.json';
import sample from '../../e2e/fixtures/sample-backup.json';
import schema from '../../e2e/fixtures/invalid-schema.json';
import version from '../../e2e/fixtures/unsupported-version.json';
import xss from '../../e2e/fixtures/xss-note.json';
import { parseBackup } from '../domain/backup';
import { datasetS1 } from './builders';

const code = (v: unknown) => {
  const r = parseBackup(JSON.stringify(v), 1000);
  return r.ok ? 'ok' : r.errors[0].code;
};

describe('e2e fixtures (M3-T5)', () => {
  it('sample-backup.json is exactly dataset S1 (5 goals, 23 entries, schemaVersion 1)', () => {
    const s1 = datasetS1();
    expect(sample.app).toBe('one-percent-better');
    expect(sample.schemaVersion).toBe(1);
    expect(sample.goals).toEqual(s1.goals);
    expect(sample.entries).toEqual(s1.entries);
    expect(sample.settings).toEqual({ reminderEnabled: false, reminderTime: '20:00', lastReminderDate: null, lastBackupAt: null, plusOneShown: {} });
    expect(code(sample)).toBe('ok');
  });

  it('the invalid fixtures fail with the intended codes', () => {
    expect(code(schema)).toBe('IMPORT_INVALID_SCHEMA');
    expect(code(version)).toBe('IMPORT_UNSUPPORTED_VERSION');
    expect(code(integrity)).toBe('IMPORT_INTEGRITY');
    expect(code(xss)).toBe('ok');
    expect(xss.entries[0].note).toBe('<script>alert(1)</script>');
  });
});
