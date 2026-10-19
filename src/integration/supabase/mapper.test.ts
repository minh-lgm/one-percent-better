import { describe, expect, it } from 'vitest';
import { entryToRow, goalRowSchema, goalToRow, mapEntryRows, mapGoalRows, mapPrefsRow, normalizeTimestamp, prefsToRow } from './mapper';

const goalRow = (extra: Record<string, unknown> = {}) => ({
  user_id: 'u',
  id: 'g1',
  name: 'Read',
  why: 'Be smarter',
  target_type: 'daily',
  target_minutes: 30,
  start_date: '2026-10-01',
  end_date: '2026-10-31',
  archived: false,
  created_at: '2026-10-01T00:00:00+00:00',
  updated_at: '2026-10-09T03:00:00+00:00',
  deleted_at: null,
  server_updated_at: '2026-10-09T03:00:01.5+00:00',
  ...extra,
});

const entryRow = (extra: Record<string, unknown> = {}) => ({
  user_id: 'u',
  id: 'e1',
  goal_id: 'g1',
  date: '2026-10-05',
  minutes: 20,
  note: '',
  source: 'manual',
  created_at: '2026-10-05T00:00:00Z',
  updated_at: '2026-10-09T03:00:00+00:00',
  deleted_at: null,
  server_updated_at: '2026-10-09T03:00:02+00:00',
  ...extra,
});

describe('mapper (M7-AC5)', () => {
  it('normalises timestamps to YYYY-MM-DDTHH:mm:ss.sssZ and keeps dates as YYYY-MM-DD', () => {
    expect(normalizeTimestamp('2026-10-09T03:00:00+00:00')).toBe('2026-10-09T03:00:00.000Z');
    expect(normalizeTimestamp('2026-10-09T10:00:00+07:00')).toBe('2026-10-09T03:00:00.000Z');
    expect(normalizeTimestamp('garbage')).toBeNull();
    expect(normalizeTimestamp(null)).toBeNull();
    const m = mapGoalRows([goalRow()]);
    expect(m.rows[0]).toEqual({
      id: 'g1',
      name: 'Read',
      why: 'Be smarter',
      targetType: 'daily',
      targetMinutes: 30,
      startDate: '2026-10-01',
      endDate: '2026-10-31',
      archived: false,
      createdAt: '2026-10-01T00:00:00.000Z',
      updatedAt: '2026-10-09T03:00:00.000Z',
      deletedAt: null,
    });
    expect(m.serverUpdatedAt.g1).toBe('2026-10-09T03:00:01.500Z');
    expect(m.skippedInvalid).toBe(0);
    expect(mapGoalRows([goalRow({ deleted_at: '2026-10-09T04:00:00+00:00' })]).rows[0].deletedAt).toBe('2026-10-09T04:00:00.000Z');
  });

  it('drops invalid rows and counts them; the valid rows are still returned', () => {
    const m = mapEntryRows([entryRow(), entryRow({ id: 'zero', minutes: 0 }), entryRow({ id: 'note', note: 'x'.repeat(281) }), entryRow({ id: 'src', source: 'x' }), entryRow({ id: 'date', date: '2026-13-40' }), 'garbage', null]);
    expect(m.rows.map((r) => r.id)).toEqual(['e1']);
    expect(m.skippedInvalid).toBe(6);
    const g = mapGoalRows([goalRow({ id: 'long', name: 'x'.repeat(61) }), goalRow({ id: 'period', end_date: '2026-09-01' }), goalRow({ id: 'type', target_type: 'weekly' }), goalRow({ id: 'tm', target_minutes: 1441 })]);
    expect(g.rows).toEqual([]);
    expect(g.skippedInvalid).toBe(4);
  });

  it('round-trips a record through the row shape (snake_case ↔ camelCase)', () => {
    const goal = { id: 'g', name: 'Read', why: '', targetType: 'total' as const, targetMinutes: 6000, startDate: '2026-01-01', endDate: '2026-12-31', archived: true, createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-10-09T03:00:00.000Z', deletedAt: null };
    expect(mapGoalRows([goalToRow(goal, 'u')]).rows[0]).toEqual(goal);
    const entry = { id: 'e', goalId: 'g', date: '2026-10-05', minutes: 1440, note: 'n', source: 'timer' as const, createdAt: '2026-10-05T00:00:00.000Z', updatedAt: '2026-10-09T03:00:00.000Z', deletedAt: '2026-10-09T03:00:00.000Z' };
    expect(mapEntryRows([entryToRow(entry, 'u')]).rows[0]).toEqual(entry);
    expect(goalToRow(goal, 'u').user_id).toBe('u');
  });

  it('prefs: null groups, invalid groups counted, row ↔ RemotePrefs', () => {
    expect(mapPrefsRow(null)).toEqual({ prefs: { reminder: null, locale: null }, skippedInvalid: 0 });
    const full = { reminder_enabled: true, reminder_time: '07:30', reminder_updated_at: '2026-10-09T03:00:00+00:00', locale: 'vi', locale_updated_at: '2026-10-09T03:01:00+00:00' };
    expect(mapPrefsRow(full)).toEqual({ prefs: { reminder: { enabled: true, time: '07:30', updatedAt: '2026-10-09T03:00:00.000Z' }, locale: { value: 'vi', updatedAt: '2026-10-09T03:01:00.000Z' } }, skippedInvalid: 0 });
    expect(mapPrefsRow({ ...full, reminder_time: '25:00', locale: 'fr' })).toEqual({ prefs: { reminder: null, locale: null }, skippedInvalid: 2 });
    expect(mapPrefsRow({ reminder_enabled: true, reminder_time: '07:30', reminder_updated_at: null, locale: null, locale_updated_at: null })).toEqual({ prefs: { reminder: null, locale: null }, skippedInvalid: 1 });
    const row = prefsToRow({ reminder: null, locale: { value: 'en', updatedAt: '2026-10-09T03:00:00.000Z' } }, 'u');
    expect(row).toEqual({ user_id: 'u', reminder_enabled: null, reminder_time: null, reminder_updated_at: null, locale: 'en', locale_updated_at: '2026-10-09T03:00:00.000Z' });
  });
});

// ---- v4.0 (M11-AC6, ADR-33): end_date NULL = open-ended, daily only ----
describe('mapper — open-ended goals (M11-AC6, FR-57)', () => {
  it('a daily row with end_date null maps to endDate null (key present); the same row as total is skipped and counted', () => {
    const ok = mapGoalRows([goalRow({ id: 'o1', target_type: 'daily', target_minutes: 10, end_date: null })]);
    expect(ok.skippedInvalid).toBe(0);
    expect(ok.rows).toHaveLength(1);
    expect(ok.rows[0].endDate).toBeNull();
    expect('endDate' in ok.rows[0]).toBe(true);
    const bad = mapGoalRows([goalRow({ id: 'bad', target_type: 'total', target_minutes: 6000, end_date: null })]);
    expect(bad.rows).toEqual([]);
    expect(bad.skippedInvalid).toBe(1);
  });

  it('an old row with an end date maps as before; end_date before start_date is still invalid; null never fails the date order', () => {
    const old = mapGoalRows([goalRow()]);
    expect(old.rows[0].endDate).toBe('2026-10-31');
    expect(mapGoalRows([goalRow({ end_date: '2026-09-01' })]).skippedInvalid).toBe(1);
    expect(mapGoalRows([goalRow({ end_date: null, start_date: '2099-01-01' })]).rows[0].endDate).toBeNull();
    // A missing end_date column value (undefined) is not the same as NULL: the row is invalid.
    const { end_date: _e, ...noColumn } = goalRow();
    expect(mapGoalRows([noColumn]).skippedInvalid).toBe(1);
  });

  it('goalToRow(o1).end_date === null and the schema accepts that row (push pre-validation lets it through)', () => {
    const o1 = { id: 'o1', name: 'Meditate', why: '', targetType: 'daily' as const, targetMinutes: 10, startDate: '2026-10-01', endDate: null, archived: false, createdAt: '2026-09-30T06:00:00.000Z', updatedAt: '2026-09-30T06:00:00.000Z', deletedAt: null };
    const row = goalToRow(o1, 'u');
    expect(row.end_date).toBeNull();
    expect('end_date' in row).toBe(true);
    expect(goalRowSchema.safeParse(row).success).toBe(true);
    expect(goalRowSchema.safeParse({ ...row, target_type: 'total', target_minutes: 6000 }).success).toBe(false);
    expect(goalRowSchema.safeParse({ ...row, end_date: '2026-12-31' }).success).toBe(true);
  });
});
