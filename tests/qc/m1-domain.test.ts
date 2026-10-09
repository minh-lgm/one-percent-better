// QC-owned unit/service tests for M1 (round 1). Written from TASKS.md acceptance criteria, not from the dev tests.
import { describe, expect, it } from 'vitest';
import { createDatabase } from '../../src/data/dexie/db';
import { DexieEntryRepository } from '../../src/data/dexie/entry-repo';
import { DexieGoalRepository } from '../../src/data/dexie/goal-repo';
import { DexieKvRepository } from '../../src/data/dexie/kv-repo';
import { checkDayLimit, validateEntryDate, validateEntryFields } from '../../src/domain/entry';
import { dailyTarget, entriesOutsidePeriod, goalStatus, totalTarget, validateGoalInput, type GoalInput } from '../../src/domain/goal';
import type { Goal } from '../../src/domain/types';
import { detectLocale } from '../../src/i18n/detect';
import { createFormatters } from '../../src/i18n/format';
import { createI18n, createTranslator } from '../../src/i18n/instance';
import { EntryService } from '../../src/services/entry-service';
import { GoalService } from '../../src/services/goal-service';
import { LocaleService } from '../../src/services/locale-service';

const base: GoalInput = { name: 'Read', why: '', targetType: 'daily', targetValue: 30, startDate: '2026-10-01', endDate: '2026-10-31' };
const codes = (i: Partial<GoalInput>) => {
  const r = validateGoalInput({ ...base, ...i });
  return r.ok ? [] : r.errors.map((e) => e.code);
};

describe('M1-AC3 goal validation', () => {
  it('name', () => {
    expect(codes({ name: '' })).toContain('GOAL_NAME_REQUIRED');
    expect(codes({ name: '   \t ' })).toContain('GOAL_NAME_REQUIRED');
    expect(codes({ name: 'x'.repeat(61) })).toContain('GOAL_NAME_TOO_LONG');
    expect(codes({ name: 'x'.repeat(60) })).toEqual([]);
    expect(codes({ name: `  ${'x'.repeat(60)}  ` })).toEqual([]); // trimmed first
  });
  it('why', () => {
    expect(codes({ why: 'y'.repeat(281) })).toContain('GOAL_WHY_TOO_LONG');
    expect(codes({ why: 'y'.repeat(280) })).toEqual([]);
  });
  it('daily target', () => {
    for (const v of [0, 1441, 12.5, -1, Number.NaN, Infinity]) expect(codes({ targetValue: v })).toContain('GOAL_TARGET_INVALID');
    for (const v of [1, 1440]) expect(codes({ targetValue: v })).toEqual([]);
  });
  it('total target', () => {
    const t = { targetType: 'total' as const, startDate: '2026-01-01', endDate: '2026-12-31' };
    for (const v of [0, 10001, 1.5, Number.NaN]) expect(codes({ ...t, targetValue: v })).toContain('GOAL_TARGET_INVALID');
    expect(codes({ ...t, targetValue: 100 })).toEqual([]);
    expect(codes({ ...t, targetValue: 100, startDate: '2026-10-09', endDate: '2026-10-09' })).toContain('GOAL_TARGET_INVALID'); // 6000/day
    expect(codes({ ...t, targetValue: 24, startDate: '2026-10-09', endDate: '2026-10-09' })).toEqual([]); // exactly 1440/day
    expect(codes({ ...t, targetValue: 25, startDate: '2026-10-09', endDate: '2026-10-09' })).toContain('GOAL_TARGET_INVALID');
  });
  it('period', () => {
    expect(codes({ startDate: '2026-10-09', endDate: '2026-10-08' })).toContain('GOAL_PERIOD_INVALID');
    expect(codes({ startDate: '2026-10-09', endDate: '2026-10-09' })).toEqual([]);
    expect(codes({ startDate: '2026-01-01', endDate: '2031-01-01' })).toEqual([]); // 1827 days
    expect(codes({ startDate: '2026-01-01', endDate: '2031-01-02' })).toContain('GOAL_PERIOD_INVALID'); // 1828 days
    for (const bad of ['', 'abc', '2026-02-30', '2026-13-01', '26-01-01', '2026-1-1']) {
      expect(codes({ startDate: bad })).toContain('GOAL_PERIOD_INVALID');
      expect(codes({ endDate: bad })).toContain('GOAL_PERIOD_INVALID');
    }
  });
  it('reports every invalid field at once with field names', () => {
    const r = validateGoalInput({ ...base, name: '', why: 'y'.repeat(300), targetValue: 0, endDate: '2026-09-01' });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(new Set(r.errors.map((e) => e.field))).toEqual(new Set(['name', 'why', 'target', 'endDate']));
  });
});

describe('M1-AC4/AC5 derived values and status', () => {
  const g = (o: Partial<Goal>): Goal => ({ id: 'x', name: 'g', why: '', targetType: 'daily', targetMinutes: 30, startDate: '2026-10-01', endDate: '2026-10-31', archived: false, createdAt: '', updatedAt: '', ...o });
  it('dailyTarget', () => {
    expect(dailyTarget(g({ targetType: 'total', targetMinutes: 6000, startDate: '2026-01-01', endDate: '2026-12-31' }))).toBe(17);
    expect(dailyTarget(g({ targetType: 'total', targetMinutes: 6000, startDate: '2028-01-01', endDate: '2028-12-31' }))).toBe(17); // leap year, 366 days
    expect(dailyTarget(g({ targetType: 'daily', targetMinutes: 30 }))).toBe(30);
    expect(dailyTarget(g({ targetType: 'total', targetMinutes: 60, startDate: '2026-10-01', endDate: '2026-10-07' }))).toBe(9);
    expect(totalTarget(g({ targetType: 'daily', targetMinutes: 30 }))).toBe(930);
  });
  it('status on 2026-10-09 incl. boundaries', () => {
    const today = '2026-10-09';
    expect(goalStatus(g({}), today)).toBe('active');
    expect(goalStatus(g({ startDate: '2026-11-01', endDate: '2026-11-30' }), today)).toBe('upcoming');
    expect(goalStatus(g({ startDate: '2026-01-01', endDate: '2026-06-30' }), today)).toBe('ended');
    expect(goalStatus(g({ startDate: today, endDate: '2026-12-31' }), today)).toBe('active');
    expect(goalStatus(g({ startDate: '2026-01-01', endDate: today }), today)).toBe('active');
    expect(goalStatus(g({ startDate: '2026-10-10' }), today)).toBe('upcoming');
    expect(goalStatus(g({ endDate: '2026-10-08' }), today)).toBe('ended');
    expect(goalStatus(g({ archived: true }), today)).toBe('archived');
  });
});

describe('M1-AC6/AC7 entry rules', () => {
  const fields = (minutes: number, note = '') => {
    const r = validateEntryFields({ minutes, note });
    return r.ok ? [] : r.errors.map((e) => e.code);
  };
  it('minutes and note', () => {
    for (const m of [0, 1441, 12.5, Number.NaN, -1]) expect(fields(m)).toContain('ENTRY_MINUTES_INVALID');
    expect(fields(1)).toEqual([]);
    expect(fields(1440)).toEqual([]);
    expect(fields(5, 'n'.repeat(281))).toContain('ENTRY_NOTE_TOO_LONG');
    expect(fields(5, 'n'.repeat(280))).toEqual([]);
  });
  it('day limit', () => {
    expect(checkDayLimit(1400, 41)?.code).toBe('ENTRY_DAY_LIMIT_EXCEEDED');
    expect(checkDayLimit(1400, 40)).toBeNull();
    expect(checkDayLimit(1400, 41)?.params?.remaining).toBe(40);
  });
  it('date rules', () => {
    const goal = { startDate: '2026-10-01', endDate: '2026-10-31' };
    expect(validateEntryDate('2026-10-10', goal, '2026-10-09')?.code).toBe('DATE_IN_FUTURE');
    expect(validateEntryDate('2026-09-30', goal, '2026-10-09')?.code).toBe('DATE_OUTSIDE_GOAL_PERIOD');
    expect(validateEntryDate('2026-10-09', goal, '2026-10-09')).toBeNull();
    expect(validateEntryDate('2026-10-01', goal, '2026-10-09')).toBeNull();
  });
  it('entriesOutsidePeriod', () => {
    expect(entriesOutsidePeriod(['2026-10-01'], '2026-10-02', '2026-10-31')).toEqual(['2026-10-01']);
    expect(entriesOutsidePeriod(['2026-10-01'], '2026-10-01', '2026-10-31')).toEqual([]);
  });
});

function wire() {
  const db = createDatabase(`qc-${Math.random().toString(36).slice(2)}`);
  const goals = new DexieGoalRepository(db);
  const entries = new DexieEntryRepository(db);
  const kv = new DexieKvRepository(db);
  return { db, goals, entries, kv, goalService: new GoalService(goals, entries), entryService: new EntryService(entries, goals), locale: new LocaleService(kv) };
}
const NOW = new Date('2026-10-09T10:00:00+07:00');

describe('M1-AC8/AC9/AC13 services over fake IndexedDB', () => {
  it('editing the period so it excludes an entry is refused, DB unchanged; other edits keep createdAt and bump updatedAt', async () => {
    const w = wire();
    const created = await w.goalService.create(base, new Date('2026-10-01T08:00:00+07:00'));
    if (!created.ok) throw new Error('create failed');
    const id = created.value.id;
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(created.value.createdAt).toBe(created.value.updatedAt);
    const e = await w.entryService.add({ goalId: id, date: '2026-10-01', minutes: 30, note: '', source: 'manual' }, NOW);
    expect(e.ok).toBe(true);
    const before = await w.goals.getById(id);
    const refused = await w.goalService.update(id, { ...base, startDate: '2026-10-02' }, NOW);
    expect(refused.ok).toBe(false);
    if (!refused.ok) expect(refused.errors[0].code).toBe('GOAL_PERIOD_EXCLUDES_ENTRIES');
    expect(await w.goals.getById(id)).toEqual(before);
    const edited = await w.goalService.update(id, { ...base, name: 'Read more', why: 'because', targetValue: 45 }, NOW);
    expect(edited.ok).toBe(true);
    const after = await w.goals.getById(id);
    expect(after?.createdAt).toBe(before?.createdAt);
    expect(after?.updatedAt).not.toBe(before?.updatedAt);
    expect(after?.targetMinutes).toBe(45);
  });

  it('entry service enforces day limit incl. update excluding itself, future and out-of-period dates', async () => {
    const w = wire();
    const c = await w.goalService.create(base, NOW);
    if (!c.ok) throw new Error('x');
    const goalId = c.value.id;
    const add = (date: string, minutes: number) => w.entryService.add({ goalId, date, minutes, note: '', source: 'manual' }, NOW);
    const big = await add('2026-10-09', 1400);
    expect(big.ok).toBe(true);
    const over = await add('2026-10-09', 41);
    expect(!over.ok && over.errors[0].code).toBe('ENTRY_DAY_LIMIT_EXCEEDED');
    expect((await add('2026-10-09', 40)).ok).toBe(true);
    const fut = await add('2026-10-10', 5);
    expect(!fut.ok && fut.errors[0].code).toBe('DATE_IN_FUTURE');
    const out = await add('2026-09-30', 5);
    expect(!out.ok && out.errors[0].code).toBe('DATE_OUTSIDE_GOAL_PERIOD');
    if (!big.ok) throw new Error('x');
    const upd = await w.entryService.update(big.value.id, { minutes: 1400, note: 'same' }, NOW);
    expect(upd.ok).toBe(true);
    const upd2 = await w.entryService.update(big.value.id, { minutes: 1401, note: '' }, NOW);
    expect(upd2.ok).toBe(false);
    const missing = await w.entryService.update('nope', { minutes: 1, note: '' }, NOW);
    expect(!missing.ok && missing.errors[0].code).toBe('ENTRY_NOT_FOUND');
    const noGoal = await w.entryService.add({ goalId: 'nope', date: '2026-10-09', minutes: 1, note: '', source: 'manual' }, NOW);
    expect(!noGoal.ok && noGoal.errors[0].code).toBe('GOAL_NOT_FOUND');
    expect(big.value.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(big.value.createdAt).toBeTruthy();
  });

  it('deleteWithEntries removes entries of that goal only and rolls back on failure', async () => {
    const w = wire();
    const a = await w.goalService.create({ ...base, name: 'A' }, NOW);
    const b = await w.goalService.create({ ...base, name: 'B' }, NOW);
    if (!a.ok || !b.ok) throw new Error('x');
    for (const g of [a, b]) for (const d of ['2026-10-07', '2026-10-08']) await w.entryService.add({ goalId: g.value.id, date: d, minutes: 10, note: '', source: 'manual' }, NOW);
    await w.goalService.remove(a.value.id);
    expect(await w.db.entries.where('goalId').equals(a.value.id).count()).toBe(0);
    expect(await w.db.entries.where('goalId').equals(b.value.id).count()).toBe(2);
    expect(await w.db.goals.count()).toBe(1);
    // failure injection: make goals.delete throw after entries were deleted inside the same transaction
    const orig = w.db.goals.delete.bind(w.db.goals);
    w.db.goals.delete = (() => Promise.reject(new Error('boom'))) as unknown as typeof w.db.goals.delete;
    await expect(w.goalService.remove(b.value.id)).rejects.toThrow();
    w.db.goals.delete = orig;
    expect(await w.db.goals.count()).toBe(1);
    expect(await w.db.entries.where('goalId').equals(b.value.id).count()).toBe(2);
  });
});

describe('M1-AC15 locale detection and resolution', () => {
  it('detectLocale', () => {
    for (const v of ['vi', 'vi-VN', 'VI-vn', 'Vi']) expect(detectLocale(v)).toBe('vi');
    for (const v of ['en-US', 'fr-FR', '', undefined, null, 'zh-CN']) expect(detectLocale(v as string | undefined)).toBe('en');
  });
  it('LocaleService.resolve and set', async () => {
    const w = wire();
    expect(await w.locale.resolve('vi-VN')).toBe('vi');
    expect(await w.kv.get('locale')).toBeUndefined(); // resolve alone writes nothing (A-16)
    await w.kv.set('locale', 'en');
    expect(await w.locale.resolve('vi-VN')).toBe('en');
    await w.kv.set('locale', 'fr');
    expect(await w.locale.resolve('vi-VN')).toBe('vi');
    await w.kv.set('locale', 42);
    expect(await w.locale.resolve('vi-VN')).toBe('vi');
    await w.locale.set('vi');
    expect(await w.kv.get('locale')).toBe('vi');
  });
});

describe('M1-AC18 formatters', () => {
  const mk = (l: 'en' | 'vi') => createFormatters(l, createTranslator(createI18n({ locale: l, strictMissingKeys: true })));
  it('en', () => {
    const f = mk('en');
    expect(f.dateLong('2026-10-09')).toBe('Friday, October 9');
    expect(f.dateShort('2026-10-01')).toBe('2026-10-01');
    expect(f.dateRange('2026-10-01', '2026-10-31')).toBe('2026-10-01 – 2026-10-31');
    expect(f.number(1440)).toBe('1,440');
    expect(f.decimal1(15.5)).toBe('15.5');
    expect(f.percent1(25.8)).toBe('25.8%');
  });
  it('vi', () => {
    const f = mk('vi');
    const long = f.dateLong('2026-10-09');
    expect(long).toContain('9');
    expect(long).toContain('tháng 10');
    expect(f.dateShort('2026-10-01')).toBe('01/10/2026');
    expect(f.dateRange('2026-10-01', '2026-10-31')).toBe('01/10/2026 – 31/10/2026');
    expect(f.number(1440)).toBe('1.440');
    expect(f.decimal1(15.5)).toBe('15,5');
    expect(f.percent1(25.8)).toBe('25,8%');
    expect(f.hhmmss(25 * 60_000 + 31_000)).toBe(mk('en').hhmmss(25 * 60_000 + 31_000));
  });
});
