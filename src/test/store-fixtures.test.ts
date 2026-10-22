// M15-T5 / M15-AC9: the demo datasets (store/fixtures/demo-{en,vi}.json) are valid `schemaVersion: 1` backups that
// import cleanly, and carry the check values of DESIGN v5.0 7.8.8 (entry rules, today's entries, goal states).
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseBackup } from '../domain/backup';
import { goalStatus } from '../domain/goal';
import { minutesByGoal } from '../domain/entry';
import type { BackupFile } from '../domain/backup-file';

const read = (locale: 'en' | 'vi') => readFileSync(join(process.cwd(), 'store', 'fixtures', `demo-${locale}.json`), 'utf8');
const TODAY = '2026-10-09';

function parsed(locale: 'en' | 'vi'): BackupFile {
  const text = read(locale);
  const result = parseBackup(text, Buffer.byteLength(text), TODAY);
  if (!result.ok) throw new Error(`demo-${locale}.json: ${result.errors.map((e) => `${e.code} ${e.message}`).join('; ')}`);
  return result.value;
}

const minutes = (b: BackupFile, goalId: string, date: string) => b.entries.find((e) => e.goalId === goalId && e.date === date)?.minutes ?? null;

describe.each(['en', 'vi'] as const)('store/fixtures/demo-%s.json (DESIGN 7.8.8)', (locale) => {
  const b = parsed(locale);

  it('is a plain schemaVersion 1 backup with the five demo goals in the DESIGN states as of 2026-10-09', () => {
    expect(b.schemaVersion).toBe(1);
    expect(b.exportedAt).toBe('2026-10-09T12:30:00.000Z');
    expect(b.goals.map((g) => g.id)).toEqual(['demo-read', 'demo-guitar', 'demo-spanish', 'demo-piano', 'demo-stretch']);
    const status = Object.fromEntries(b.goals.map((g) => [g.id, goalStatus(g, TODAY)]));
    expect(status).toEqual({ 'demo-read': 'active', 'demo-guitar': 'active', 'demo-spanish': 'active', 'demo-piano': 'upcoming', 'demo-stretch': 'ended' });
    expect(b.goals.find((g) => g.id === 'demo-spanish')?.endDate).toBeNull();
    expect(b.goals.every((g) => g.targetType === 'daily' && !g.archived)).toBe(true);
    expect(b.goals.map((g) => g.targetMinutes)).toEqual([30, 20, 15, 25, 10]);
  });

  it('names and why per locale (≤ 60 / ≤ 280), notes of today per locale', () => {
    const names = b.goals.map((g) => g.name);
    expect(names).toEqual(locale === 'en' ? ['Read', 'Guitar', 'Spanish', 'Piano', 'Stretch'] : ['Đọc sách', 'Guitar', 'Tiếng Tây Ban Nha', 'Piano', 'Giãn cơ']);
    expect(b.goals.find((g) => g.id === 'demo-spanish')?.why).toBe(locale === 'en' ? 'Talk with Ana in Spanish' : 'Trò chuyện với Ana bằng tiếng Tây Ban Nha');
    expect(b.goals.every((g) => g.name.length <= 60 && g.why.length <= 280)).toBe(true);
    const today = b.entries.filter((e) => e.date === TODAY);
    expect(today.map((e) => [e.goalId, e.minutes, e.note])).toEqual(
      locale === 'en'
        ? [['demo-read', 30, 'Chapter 12'], ['demo-guitar', 22, 'Scales and chorus'], ['demo-spanish', 10, 'Lesson 8']]
        : [['demo-read', 30, 'Chương 12'], ['demo-guitar', 22, 'Gam và điệp khúc'], ['demo-spanish', 10, 'Bài 8']],
    );
    expect(b.entries.filter((e) => e.date !== TODAY).every((e) => e.note === '')).toBe(true);
  });

  it('check values of DESIGN 7.8.8', () => {
    expect(minutes(b, 'demo-read', '2026-01-01')).toBe(20);
    expect(minutes(b, 'demo-read', '2026-01-03')).toBeNull();
    expect(minutes(b, 'demo-read', '2026-10-08')).toBe(40);
    expect(minutes(b, 'demo-guitar', '2026-08-01')).toBe(8);
    expect(minutes(b, 'demo-guitar', '2026-08-06')).toBeNull();
    expect(minutes(b, 'demo-guitar', '2026-10-08')).toBe(21);
    expect(minutes(b, 'demo-guitar', '2026-10-09')).toBe(22);
    expect(minutes(b, 'demo-spanish', '2026-06-01')).toBe(10);
    expect(minutes(b, 'demo-spanish', '2026-06-05')).toBeNull();
    expect(minutes(b, 'demo-spanish', '2026-10-09')).toBe(10);
    expect(minutes(b, 'demo-stretch', '2026-09-01')).toBe(10);
    expect(minutes(b, 'demo-stretch', '2026-09-04')).toBeNull();
    expect(b.entries.some((e) => e.goalId === 'demo-piano')).toBe(false);
    expect(b.entries.some((e) => e.goalId === 'demo-stretch' && e.date > '2026-09-30')).toBe(false);
  });

  it('every entry is inside its goal period, 1 … 1440 min, no future dates, ids stable, one per goal per day', () => {
    const byId = new Map(b.goals.map((g) => [g.id, g]));
    const seen = new Set<string>();
    for (const e of b.entries) {
      const g = byId.get(e.goalId)!;
      expect(e.date >= g.startDate && (g.endDate === null || e.date <= g.endDate), e.id).toBe(true);
      expect(e.minutes >= 1 && e.minutes <= 1440, e.id).toBe(true);
      expect(e.date <= TODAY, e.id).toBe(true);
      expect(e.id).toBe(`e-${e.goalId}-${e.date.replace(/-/g, '')}`);
      expect(e.source).toBe('manual');
      expect(seen.has(`${e.goalId}|${e.date}`), e.id).toBe(false);
      seen.add(`${e.goalId}|${e.date}`);
    }
    // Today: Read 30/30 and Guitar 22/20 on target, Spanish 10/15 not → "2 of 3 goals on target" (screenshot 1).
    const today = minutesByGoal(b.entries.filter((e) => e.date === TODAY));
    expect([today.get('demo-read')! >= 30, today.get('demo-guitar')! >= 20, today.get('demo-spanish')! >= 15]).toEqual([true, true, false]);
  });

  it('settings: reminders off, last backup 2026-10-05 (no banner), nothing device-specific', () => {
    expect(b.settings).toEqual({ reminderEnabled: false, reminderTime: '20:00', lastReminderDate: null, lastBackupAt: '2026-10-05T12:00:00.000Z', plusOneShown: {} });
  });

  it('is byte-identical to what scripts/gen-store-fixtures.mjs produces (deterministic)', async () => {
    const { buildDemoBackup } = await import('../../scripts/gen-store-fixtures.mjs');
    expect(read(locale)).toBe(`${JSON.stringify(buildDemoBackup(locale), null, 2)}\n`);
  });
});

it('en and vi differ only in names, why and notes (same ids, dates, minutes)', () => {
  const en = parsed('en');
  const vi = parsed('vi');
  expect(vi.goals.map((g) => ({ ...g, name: '', why: '' }))).toEqual(en.goals.map((g) => ({ ...g, name: '', why: '' })));
  expect(vi.entries.map((e) => ({ ...e, note: '' }))).toEqual(en.entries.map((e) => ({ ...e, note: '' })));
  expect(en.entries.length).toBe(vi.entries.length);
});
