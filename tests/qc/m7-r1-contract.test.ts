// QC M7 round 1 — boundary consistency between what the app accepts locally (backup importer, domain validators)
// and what the cloud boundary (mapper zod = SQL check constraints) accepts, plus exact `skippedInvalid` counting.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseBackup } from '../../src/domain/backup';
import type { Goal, LogEntry } from '../../src/domain/types';
import { entryRowSchema, entryToRow, goalRowSchema, goalToRow, mapEntryRows, mapGoalRows, mapPrefsRow } from '../../src/integration/supabase/mapper';

const SAMPLE = readFileSync(new URL('../../e2e/fixtures/sample-backup.json', import.meta.url), 'utf8');
const sample = () => JSON.parse(SAMPLE) as { goals: Goal[]; entries: LogEntry[]; [k: string]: unknown };
const parse = (obj: unknown) => {
  const text = JSON.stringify(obj);
  return parseBackup(text, new TextEncoder().encode(text).length);
};

describe('QC: every row the importer accepts must be pushable (SQL: id/goal_id 1..64 chars)', () => {
  it('sample rows round-trip through the cloud schema', () => {
    const s = sample();
    for (const g of s.goals) expect(goalRowSchema.safeParse(goalToRow({ ...g, deletedAt: null }, 'u')).success, g.id).toBe(true);
    for (const e of s.entries) expect(entryRowSchema.safeParse(entryToRow({ ...e, deletedAt: null }, 'u')).success, e.id).toBe(true);
  });

  it.fails('M7-D1: a goal id longer than 64 characters is accepted by the importer but refused by the cloud schema', () => {
    const s = sample();
    const longId = 'x'.repeat(65);
    const g = { ...s.goals[0]!, id: longId };
    const entries = s.entries.map((e) => (e.goalId === s.goals[0]!.id ? { ...e, goalId: longId } : e));
    const parsed = parse({ ...s, goals: [g, ...s.goals.slice(1)], entries });
    // The importer must either reject such a file (consistency) or the cloud must accept the row.
    expect(parsed.ok).toBe(false);
  });

  it.fails('M7-D1: an entry id longer than 64 characters is accepted by the importer but refused by the cloud schema', () => {
    const s = sample();
    const parsed = parse({ ...s, entries: [{ ...s.entries[0]!, id: 'e'.repeat(65) }, ...s.entries.slice(1)] });
    expect(parsed.ok).toBe(false);
  });

  it('boundary: 64-character ids are accepted by both sides', () => {
    const s = sample();
    const id = 'x'.repeat(64);
    const parsed = parse({ ...s, goals: [{ ...s.goals[0]!, id }, ...s.goals.slice(1)], entries: s.entries.map((e) => (e.goalId === s.goals[0]!.id ? { ...e, goalId: id } : e)) });
    expect(parsed.ok).toBe(true);
    expect(goalRowSchema.safeParse(goalToRow({ ...s.goals[0]!, id, deletedAt: null }, 'u')).success).toBe(true);
  });

  it('timestamps in other ISO/RFC forms accepted by the importer normalise to canonical instants on the way back', () => {
    const s = sample();
    for (const stamp of ['2026-10-05', '2026-10-05T01:00:00+07:00', '2026-10-05T01:00:00.123456Z', 'Mon, 05 Oct 2026 01:00:00 GMT']) {
      const parsed = parse({ ...s, goals: [{ ...s.goals[0]!, createdAt: stamp, updatedAt: stamp }, ...s.goals.slice(1)] });
      expect(parsed.ok, stamp).toBe(true);
      const row = goalRowSchema.safeParse(goalToRow({ ...s.goals[0]!, createdAt: stamp, updatedAt: stamp, deletedAt: null }, 'u'));
      expect(row.success, stamp).toBe(true);
      if (row.success) expect(row.data.updated_at).toMatch(/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/);
    }
  });
});

describe('QC: invalid cloud rows are dropped and counted exactly', () => {
  const T = '2026-10-05T01:00:00.000Z';
  const good = { id: 'g', name: 'N', why: '', target_type: 'daily', target_minutes: 15, start_date: '2026-10-01', end_date: '2026-10-31', archived: false, created_at: T, updated_at: T, deleted_at: null };

  it('goals', () => {
    const bad: unknown[] = [
      null,
      'x',
      42,
      [],
      {},
      { ...good, id: '' },
      { ...good, id: 'x'.repeat(65) },
      { ...good, name: '' },
      { ...good, name: 'x'.repeat(61) },
      { ...good, why: 'y'.repeat(281) },
      { ...good, target_type: 'weekly' },
      { ...good, target_minutes: 0 },
      { ...good, target_minutes: 1441 },
      { ...good, target_minutes: 1.5 },
      { ...good, target_minutes: '15' },
      { ...good, start_date: '2026-02-30' },
      { ...good, end_date: '2026-09-30' },
      { ...good, archived: 'no' },
      { ...good, updated_at: 'nope' },
      { ...good, created_at: null },
      { ...good, deleted_at: 'nope' },
    ];
    const r = mapGoalRows([good, ...bad, { ...good, id: 'g2', deleted_at: T }]);
    expect(r.rows.map((x) => x.id)).toEqual(['g', 'g2']);
    expect(r.skippedInvalid).toBe(bad.length);
  });

  it('entries', () => {
    const e = { id: 'e', goal_id: 'g', date: '2026-10-08', minutes: 5, note: '', source: 'manual', created_at: T, updated_at: T, deleted_at: null };
    const bad: unknown[] = [
      null,
      {},
      { ...e, minutes: 0 },
      { ...e, minutes: 1441 },
      { ...e, minutes: -1 },
      { ...e, minutes: 1.5 },
      { ...e, minutes: '5' },
      { ...e, minutes: null },
      { ...e, note: 'n'.repeat(281) },
      { ...e, source: 'x' },
      { ...e, date: '2026-13-01' },
      { ...e, goal_id: '' },
      { ...e, id: 'e'.repeat(65) },
      { ...e, updated_at: undefined },
    ];
    const r = mapEntryRows([e, ...bad, { ...e, id: 'e2', minutes: 1440, note: 'n'.repeat(280) }]);
    expect(r.rows.map((x) => x.id)).toEqual(['e', 'e2']);
    expect(r.skippedInvalid).toBe(bad.length);
  });

  it('timestamps with an offset are normalised to Z with milliseconds', () => {
    const r = mapGoalRows([{ ...good, created_at: '2026-10-09T03:00:00+00:00', updated_at: '2026-10-09T10:00:00+07:00', server_updated_at: '2026-10-09T03:00:00.5+00:00' }]);
    expect(r.rows[0]).toMatchObject({ createdAt: '2026-10-09T03:00:00.000Z', updatedAt: '2026-10-09T03:00:00.000Z' });
    expect(r.serverUpdatedAt.g).toBe('2026-10-09T03:00:00.500Z');
  });

  it('prefs: each broken group counts once and reads as null; half-filled groups count; empty row is fine', () => {
    const T2 = '2026-10-05T01:00:00.000Z';
    expect(mapPrefsRow(null)).toEqual({ prefs: { reminder: null, locale: null }, skippedInvalid: 0 });
    expect(mapPrefsRow({ reminder_enabled: true, reminder_time: '25:00', reminder_updated_at: T2, locale: 'fr', locale_updated_at: T2 })).toEqual({ prefs: { reminder: null, locale: null }, skippedInvalid: 2 });
    expect(mapPrefsRow({ reminder_enabled: true, reminder_time: '07:30', reminder_updated_at: T2, locale: 'vi', locale_updated_at: T2 })).toEqual({
      prefs: { reminder: { enabled: true, time: '07:30', updatedAt: T2 }, locale: { value: 'vi', updatedAt: T2 } },
      skippedInvalid: 0,
    });
    expect(mapPrefsRow({ reminder_enabled: true, reminder_time: '07:30', reminder_updated_at: null, locale: null, locale_updated_at: null }).skippedInvalid).toBe(1);
    expect(mapPrefsRow({ reminder_enabled: 'yes', reminder_time: '07:30', reminder_updated_at: T2 }).prefs.reminder).toBeNull();
    expect(mapPrefsRow({ reminder_enabled: false, reminder_time: '7:30', reminder_updated_at: T2 }).prefs.reminder).toBeNull();
    expect(mapPrefsRow({ reminder_enabled: false, reminder_time: '00:00', reminder_updated_at: T2 }).prefs.reminder).toEqual({ enabled: false, time: '00:00', updatedAt: T2 });
    expect(mapPrefsRow({ reminder_enabled: false, reminder_time: '23:59', reminder_updated_at: T2 }).prefs.reminder?.time).toBe('23:59');
  });
});
