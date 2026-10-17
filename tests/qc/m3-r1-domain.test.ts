// QC round 1 (M3): independent service / data-layer checks for backup import (hostile input),
// atomic timer save (two "tabs" on one database), and the retargeted M2-D3 fault-injection ideas.
import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { IMPORT_MAX_BYTES } from '../../src/config/constants';
import { openDatabase, type AppDatabase } from '../../src/data/dexie/db';
import { DexieEntryRepository } from '../../src/data/dexie/entry-repo';
import { DexieGoalRepository } from '../../src/data/dexie/goal-repo';
import { DexieKvRepository } from '../../src/data/dexie/kv-repo';
import { DexieTimerRepository } from '../../src/data/dexie/timer-repo';
import { parseBackup } from '../../src/domain/backup';
import type { ActiveTimer, Goal, LogEntry } from '../../src/domain/types';
import { EntryService } from '../../src/services/entry-service';
import { TimerService } from '../../src/services/timer-service';
import { createTestContainer, type TestContainer } from '../../src/test/container';
import { createTestDatabase } from '../../src/test/db';

const SAMPLE = readFileSync(new URL('../../e2e/fixtures/sample-backup.json', import.meta.url), 'utf8');
const sample = () => JSON.parse(SAMPLE) as { goals: Goal[]; entries: LogEntry[]; settings: Record<string, unknown>; [k: string]: unknown };
const NOW = new Date('2026-10-09T10:00:00+07:00');
const bytes = (text: string) => new TextEncoder().encode(text).length;
const parse = (obj: unknown) => {
  const text = typeof obj === 'string' ? obj : JSON.stringify(obj);
  return parseBackup(text, bytes(text));
};
const code = (r: ReturnType<typeof parseBackup>) => (r.ok ? 'OK' : r.errors[0]?.code);

const toDispose: Array<() => Promise<void>> = [];
afterEach(async () => {
  vi.restoreAllMocks();
  while (toDispose.length) await toDispose.pop()!();
});
async function container(): Promise<TestContainer> {
  const tc = await createTestContainer({ permission: 'granted' });
  toDispose.push(() => tc.dispose());
  return tc;
}

describe('sample-backup.json is dataset S1 (independent check against the TASKS table)', () => {
  it('5 goals / 23 entries with the documented per-goal counts and minutes', () => {
    const f = sample();
    expect(f.goals.map((g) => [g.name, g.targetType, g.startDate, g.endDate])).toEqual([
      ['Read', 'daily', '2026-10-01', '2026-10-31'],
      ['Guitar', 'daily', '2026-09-01', '2026-12-31'],
      ['Spanish', 'total', '2026-01-01', '2026-12-31'],
      ['Marathon prep', 'daily', '2026-11-01', '2026-11-30'],
      ['Old course', 'daily', '2026-01-01', '2026-06-30'],
    ]);
    const per = (name: string) => {
      const g = f.goals.find((x) => x.name === name)!;
      const es = f.entries.filter((e) => e.goalId === g.id);
      return [es.length, es.reduce((a, e) => a + e.minutes, 0)];
    };
    expect(per('Read')).toEqual([8, 240]);
    expect(per('Guitar')).toEqual([13, 250]);
    expect(per('Spanish')).toEqual([1, 60]);
    expect(per('Marathon prep')).toEqual([0, 0]);
    expect(per('Old course')).toEqual([1, 15]);
    expect(f.entries).toHaveLength(23);
    expect(parse(SAMPLE).ok).toBe(true);
  });
});

describe('M3-AC9 hostile import files (domain.parseBackup)', () => {
  it('not JSON / not an object', () => {
    expect(code(parse(''))).toBe('IMPORT_INVALID_JSON');
    expect(code(parse('{abc'))).toBe('IMPORT_INVALID_JSON');
    expect(code(parse('{"a":1,}'))).toBe('IMPORT_INVALID_JSON');
    for (const t of ['null', '[]', '42', '"x"', 'true']) expect(code(parse(t)), t).toBe('IMPORT_INVALID_SCHEMA');
  });
  it('100000-deep nesting does not crash the parser (reported as invalid JSON or schema)', () => {
    const deep = '['.repeat(100_000) + ']'.repeat(100_000);
    expect(['IMPORT_INVALID_JSON', 'IMPORT_INVALID_SCHEMA']).toContain(code(parse(deep)));
  });
  it('app / schemaVersion variants', () => {
    const base = sample();
    expect(code(parse({ ...base, app: 'other' }))).toBe('IMPORT_INVALID_SCHEMA');
    const { app: _drop, ...noApp } = base;
    void _drop;
    expect(code(parse(noApp))).toBe('IMPORT_INVALID_SCHEMA');
    const v2 = parseBackup(JSON.stringify({ ...base, schemaVersion: 2 }), 10);
    expect(!v2.ok && v2.errors[0]?.code).toBe('IMPORT_UNSUPPORTED_VERSION');
    expect(!v2.ok && v2.errors[0]?.params).toEqual({ v: '2' });
    for (const v of [0, -1, 1.5, '1', null, 99]) expect(parse({ ...base, schemaVersion: v }).ok, String(v)).toBe(false);
    const { schemaVersion: _sv, ...noV } = base;
    void _sv;
    expect(code(parse(noV))).toBe('IMPORT_INVALID_SCHEMA');
  });
  it('size boundary: exactly 5 MiB passes the size check, +1 byte is IMPORT_FILE_TOO_LARGE', () => {
    expect(parseBackup(SAMPLE, IMPORT_MAX_BYTES).ok).toBe(true);
    const r = parseBackup(SAMPLE, IMPORT_MAX_BYTES + 1);
    expect(!r.ok && r.errors[0]?.code).toBe('IMPORT_FILE_TOO_LARGE');
  });
  it('entry field violations are IMPORT_INVALID_SCHEMA', () => {
    const base = sample();
    const mutate = (patch: Record<string, unknown>) => ({ ...base, entries: [{ ...base.entries[0], ...patch }, ...base.entries.slice(1)] });
    for (const patch of [
      { minutes: 0 },
      { minutes: -5 },
      { minutes: 1.5 },
      { minutes: 1441 },
      { minutes: '30' },
      { minutes: null },
      { date: '2026-02-30' },
      { date: '2026-1-5' },
      { date: '2026-10-05T10:00:00Z' },
      { date: '' },
      { note: 'x'.repeat(281) },
      { note: 5 },
      { source: 'import' },
      { goalId: '' },
      { id: 'x'.repeat(201) },
      { unexpectedField: 1 },
      { createdAt: 'yesterday' },
    ]) {
      expect(code(parse(mutate(patch))), JSON.stringify(patch)).toBe('IMPORT_INVALID_SCHEMA');
    }
  });
  it('goal field violations are IMPORT_INVALID_SCHEMA', () => {
    const base = sample();
    const mutate = (patch: Record<string, unknown>) => ({ ...base, goals: [{ ...base.goals[0], ...patch }, ...base.goals.slice(1)] });
    for (const patch of [
      { name: '' },
      { name: '   ' },
      { name: 'n'.repeat(61) },
      { why: 'w'.repeat(281) },
      { targetType: 'weekly' },
      { targetMinutes: 0 },
      { targetMinutes: 600_001 },
      { targetMinutes: 1.5 },
      { archived: 'no' },
      { startDate: '2026-13-01' },
      { extra: true },
    ]) {
      expect(code(parse(mutate(patch))), JSON.stringify(patch)).toBe('IMPORT_INVALID_SCHEMA');
    }
    expect(code(parse({ ...base, settings: { ...base.settings, reminderTime: '25:99' } }))).toBe('IMPORT_INVALID_SCHEMA');
    expect(code(parse({ ...base, goals: 'nope' }))).toBe('IMPORT_INVALID_SCHEMA');
    const { entries: _e, ...noEntries } = base;
    void _e;
    expect(code(parse(noEntries))).toBe('IMPORT_INVALID_SCHEMA');
  });
  it('integrity: duplicate ids, orphan entry, outside period, > 1440 per goal/day (exactly 1440 is fine)', () => {
    const base = sample();
    const g1 = base.goals[0]!;
    const e0 = base.entries[0]!;
    const dupGoal = { ...base, goals: [...base.goals, { ...g1 }] };
    expect(code(parse(dupGoal))).toBe('IMPORT_INTEGRITY');
    expect(code(parse({ ...base, entries: [...base.entries, { ...e0 }] }))).toBe('IMPORT_INTEGRITY');
    expect(code(parse({ ...base, entries: [...base.entries, { ...e0, id: 'orphan', goalId: 'ghost' }] }))).toBe('IMPORT_INTEGRITY');
    expect(code(parse({ ...base, entries: [...base.entries, { ...e0, id: 'early', date: '2026-09-30' }] }))).toBe('IMPORT_INTEGRITY');
    expect(code(parse({ ...base, entries: [...base.entries, { ...e0, id: 'late', date: '2026-11-01' }] }))).toBe('IMPORT_INTEGRITY');
    expect(code(parse({ ...base, goals: [{ ...g1, endDate: '2026-09-01' }, ...base.goals.slice(1)], entries: [] }))).toBe('IMPORT_INTEGRITY');
    const day = (id: string, minutes: number) => ({ ...e0, id, date: '2026-10-20', minutes });
    const only = (entries: unknown[]) => ({ ...base, entries });
    expect(code(parse(only([day('a', 1000), day('b', 440)])))).toBe('OK');
    expect(code(parse(only([day('a', 1000), day('b', 441)])))).toBe('IMPORT_INTEGRITY');
  });
  it('prototype pollution attempt through settings.plusOneShown does not touch Object.prototype', () => {
    const text = JSON.stringify(sample()).replace('"plusOneShown":{}', '"plusOneShown":{"__proto__":"2026-01-01","constructor":"2026-01-02"}');
    const r = parseBackup(text, bytes(text));
    expect(({} as Record<string, unknown>)['2026-01-01']).toBeUndefined();
    expect(Object.getPrototypeOf({})).toBe(Object.prototype);
    expect(typeof r.ok).toBe('boolean');
  });
  it('unicode / HTML in names and notes is accepted verbatim (rendering safety is covered in the E2E spec)', () => {
    const base = sample();
    const name = '<img src=x onerror=alert(1)> 日本語 😀 ‮evil';
    const r = parse({ ...base, goals: [{ ...base.goals[0], name }, ...base.goals.slice(1)] });
    expect(r.ok && r.value.goals[0]?.name).toBe(name.trim());
  });
  // Observations that are not part of the written AC but matter for data quality (reported as findings):
  it('OBSERVATION: values the app itself would reject at goal creation are accepted by import', () => {
    const base = sample();
    const goal = { ...base.goals[0], targetType: 'daily', targetMinutes: 600_000 };
    const longGoal = { ...base.goals[0], startDate: '2000-01-01', endDate: '2099-12-31' };
    const futureEntry = { ...base.entries[0], id: 'future', date: '2026-10-31' };
    const accepted = {
      dailyTargetOver1440: parse({ ...base, goals: [goal, ...base.goals.slice(1)] }).ok,
      periodOver1827Days: parse({ ...base, goals: [longGoal, ...base.goals.slice(1)], entries: [] }).ok,
      entryAfterToday: parse({ ...base, entries: [...base.entries, futureEntry] }).ok,
    };
    console.log('M3-QC OBSERVATION accepted-by-import', JSON.stringify(accepted));
    expect(accepted).toBeDefined();
  });
});

describe('BackupService on a real container', () => {
  it('import keeps kv locale, clears activeTimer and lastReminderDate; export has no locale/activeTimer anywhere', async () => {
    const tc = await container();
    const { db, backupService, localeService } = tc.container;
    await localeService.set('vi');
    await db.kv.put({ key: 'activeTimer', value: { goalId: 'x', startedAt: NOW.toISOString() } });
    await db.kv.put({ key: 'settings', value: { reminderEnabled: true, reminderTime: '07:00', lastReminderDate: '2026-10-08', lastBackupAt: null, plusOneShown: {} } });
    const preview = await backupService.parse(SAMPLE, bytes(SAMPLE));
    expect(preview.ok).toBe(true);
    if (!preview.ok) return;
    expect(await backupService.import(preview.value)).toEqual({ ok: true, value: { goals: 5, entries: 23 } });
    expect((await db.kv.get('locale'))?.value).toBe('vi');
    expect(await db.kv.get('activeTimer')).toBeUndefined();
    expect(((await db.kv.get('settings'))?.value as { lastReminderDate: unknown }).lastReminderDate).toBeNull();
    const out = await backupService.export(NOW);
    expect(out.fileName).toBe('1percent-better-backup-2026-10-09.json');
    expect(out.json).not.toMatch(/locale|activeTimer|startedAt/i);
    const back = JSON.parse(out.json) as { app: string; schemaVersion: number; goals: unknown[]; entries: unknown[]; settings: { lastBackupAt: string } };
    expect([back.app, back.schemaVersion, back.goals.length, back.entries.length]).toEqual(['one-percent-better', 1, 5, 23]);
    expect(back.settings.lastBackupAt).toBe(NOW.toISOString());
  });

  it('round trip with awkward text (emoji, quotes, newlines, tabs, RTL) is deep-equal for goals and entries', async () => {
    const a = await container();
    const when = new Date(NOW.getTime() + 1000);
    const g = await a.container.goalService.create(
      { name: 'Q"uote\' <b>bold</b> 😀', why: 'line1\nline2\ttab \\ backslash', targetType: 'daily', targetValue: 25, startDate: '2026-10-01', endDate: '2026-10-31' },
      when,
    );
    if (!g.ok) throw new Error(JSON.stringify(g.errors));
    const e = await a.container.entryService.add({ goalId: g.value.id, date: '2026-10-05', minutes: 25, note: '  spaced  \n‮evil 日本語 "x"  ', source: 'manual' }, when);
    expect(e.ok).toBe(true);
    const out = await a.container.backupService.export(NOW);
    const b = await container();
    const preview = await b.container.backupService.parse(out.json, bytes(out.json));
    if (!preview.ok) throw new Error(JSON.stringify(preview.errors));
    await b.container.backupService.import(preview.value);
    expect(await b.container.db.goals.toArray()).toEqual(await a.container.db.goals.toArray());
    expect(await b.container.db.entries.toArray()).toEqual(await a.container.db.entries.toArray());
  });

  it('a failure in the middle of replaceAll leaves goals, entries, settings and the running timer untouched', async () => {
    const tc = await container();
    const { db, backupService } = tc.container;
    const g = await tc.container.goalService.create({ name: 'Keep me', why: '', targetType: 'daily', targetValue: 10, startDate: '2026-10-01', endDate: '2026-10-31' }, NOW);
    if (!g.ok) throw new Error('setup');
    const timer: ActiveTimer = { goalId: g.value.id, startedAt: NOW.toISOString() };
    await db.kv.put({ key: 'activeTimer', value: timer });
    const before = { goals: await db.goals.toArray(), entries: await db.entries.toArray(), settings: await db.kv.get('settings') };
    const preview = await backupService.parse(SAMPLE, bytes(SAMPLE));
    if (!preview.ok) throw new Error('parse');
    for (const table of ['entries', 'kv'] as const) {
      const spy = vi.spyOn(db[table], table === 'entries' ? 'bulkAdd' : 'put').mockRejectedValueOnce(new Error('boom') as never);
      await expect(backupService.import(preview.value)).rejects.toThrow();
      spy.mockRestore();
      expect(await db.goals.toArray()).toEqual(before.goals);
      expect(await db.entries.toArray()).toEqual(before.entries);
      expect(await db.kv.get('settings')).toEqual(before.settings);
      expect((await db.kv.get('activeTimer'))?.value).toEqual(timer);
    }
  });

  it('import racing a timer save never leaves an entry that points to a deleted goal (20 rounds)', async () => {
    for (let i = 0; i < 20; i++) {
      const tc = await container();
      const { db, backupService, timerService, goalService } = tc.container;
      const g = await goalService.create({ name: 'Racer', why: '', targetType: 'daily', targetValue: 10, startDate: '2026-10-01', endDate: '2026-10-31' }, NOW);
      if (!g.ok) throw new Error('setup');
      await timerService.start(g.value.id, new Date(NOW.getTime() - 30 * 60_000));
      const preview = await backupService.parse(SAMPLE, bytes(SAMPLE));
      if (!preview.ok) throw new Error('parse');
      await Promise.allSettled([backupService.import(preview.value), timerService.save({ minutes: 30, note: '' }, NOW)]);
      // M7 (soft delete, ADR-20): "orphan" = a LIVE entry whose goal is not live; the replaced "Racer" stays as a tombstone.
      const rawGoals = await db.goals.toArray();
      const liveGoalIds = new Set(rawGoals.filter((x) => x.deletedAt === null).map((x) => x.id));
      const orphans = (await db.entries.toArray()).filter((e) => e.deletedAt === null && !liveGoalIds.has(e.goalId));
      expect(orphans, `round ${i}`).toEqual([]);
      expect(liveGoalIds.size, `round ${i}`).toBe(5);
      expect(rawGoals.filter((x) => x.deletedAt !== null).map((x) => x.name), `round ${i}`).toEqual(['Racer']);
      expect((await new DexieGoalRepository(db).getAll()).length, `round ${i}`).toBe(5);
    }
  });

  it('a file just under the 5 MiB limit (~15k entries) parses and imports in reasonable time', async () => {
    const base = sample();
    const goals: Goal[] = Array.from({ length: 20 }, (_, i) => ({ ...base.goals[1]!, id: `big-g${i}`, name: `Big ${i}`, startDate: '2020-01-01', endDate: '2024-12-31' }));
    const entries: LogEntry[] = [];
    const start = new Date('2020-01-01T00:00:00Z').getTime();
    for (let d = 0; d < 760 && entries.length < 15_000; d++) {
      const date = new Date(start + d * 86_400_000).toISOString().slice(0, 10);
      for (const g of goals) entries.push({ ...base.entries[0]!, id: `be-${g.id}-${d}`, goalId: g.id, date, minutes: 20, note: 'n'.repeat(40) });
    }
    const text = JSON.stringify({ ...base, goals, entries }, null, 2);
    const size = bytes(text);
    console.log(`M3-QC big file: ${entries.length} entries, ${(size / 1024 / 1024).toFixed(2)} MiB`);
    expect(size).toBeLessThanOrEqual(IMPORT_MAX_BYTES);
    const tc = await container();
    const t0 = performance.now();
    const preview = await tc.container.backupService.parse(text, size);
    const t1 = performance.now();
    if (!preview.ok) throw new Error(JSON.stringify(preview.errors));
    await tc.container.backupService.import(preview.value);
    const t2 = performance.now();
    console.log(`M3-QC big file parse ${(t1 - t0).toFixed(0)} ms, import ${(t2 - t1).toFixed(0)} ms`);
    expect(await tc.container.db.entries.count()).toBe(entries.length);
    expect(t2 - t0).toBeLessThan(15_000);
  });
});

// ---- M3-T7 / M3-AC15 --------------------------------------------------------------------------

async function twoTabsSetup() {
  const db: AppDatabase = createTestDatabase();
  await openDatabase(db);
  toDispose.push(() => db.delete());
  const s = sample();
  await db.goals.bulkPut(s.goals);
  await db.entries.bulkPut(s.entries);
  const started = '2026-10-09T09:30:00+07:00';
  const timer: ActiveTimer = { goalId: 'g1', startedAt: new Date(started).toISOString() };
  const tab = () => {
    const goals = new DexieGoalRepository(db);
    const entries = new DexieEntryRepository(db);
    const kv = new DexieKvRepository(db);
    const es = new EntryService(entries, goals);
    return { svc: new TimerService(kv, goals, es, new DexieTimerRepository(db)), entries, kv };
  };
  const today = () => db.entries.where('[goalId+date]').equals(['g1', '2026-10-09']).toArray();
  return { db, timer, tab, today };
}

describe('M3-AC15 atomic timer save (QC-owned re-implementation of the two-tab recipe)', () => {
  it('2 and 3 tabs saving at once: exactly one entry, the others TIMER_NOT_RUNNING (30 rounds)', async () => {
    const { db, timer, tab, today } = await twoTabsSetup();
    for (let i = 0; i < 30; i++) {
      await db.entries.where('[goalId+date]').equals(['g1', '2026-10-09']).delete();
      await db.kv.put({ key: 'activeTimer', value: timer });
      const n = i % 2 === 0 ? 2 : 3;
      const results = await Promise.all(Array.from({ length: n }, (_, k) => tab().svc.save({ minutes: 30, note: `tab${k}` }, NOW)));
      expect(results.filter((r) => r.ok), `round ${i}`).toHaveLength(1);
      for (const r of results.filter((x) => !x.ok)) expect(!r.ok && r.errors[0]?.code).toBe('TIMER_NOT_RUNNING');
      const rows = await today();
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({ source: 'timer', minutes: 30, goalId: 'g1' });
      expect(await db.kv.get('activeTimer')).toBeUndefined();
    }
  });

  it('Save racing Discard in another tab: 0 or 1 entry, never a timer left behind, never 2 entries (30 rounds)', async () => {
    const { db, timer, tab, today } = await twoTabsSetup();
    const seen = new Set<number>();
    for (let i = 0; i < 30; i++) {
      await db.entries.where('[goalId+date]').equals(['g1', '2026-10-09']).delete();
      await db.kv.put({ key: 'activeTimer', value: timer });
      const [s, d] = await Promise.all([tab().svc.save({ minutes: 30, note: '' }, NOW), tab().svc.discard()]);
      const rows = await today();
      seen.add(rows.length);
      expect(rows.length).toBeLessThanOrEqual(1);
      expect(await db.kv.get('activeTimer')).toBeUndefined();
      expect(s.ok === d.ok ? 'both-or-neither' : 'one', `round ${i}`).toBe('one');
      expect(rows.length).toBe(s.ok ? 1 : 0);
    }
    console.log('M3-QC save-vs-discard outcomes seen (entry counts):', [...seen].join(','));
  });

  it('Save racing deletion of the goal in another tab: no orphan entry (20 rounds)', async () => {
    const { db, timer, tab } = await twoTabsSetup();
    for (let i = 0; i < 20; i++) {
      const s = sample();
      await db.goals.clear();
      await db.entries.clear();
      await db.goals.bulkPut(s.goals);
      await db.entries.bulkPut(s.entries);
      await db.kv.put({ key: 'activeTimer', value: timer });
      const other = tab();
      const goals = new DexieGoalRepository(db);
      await Promise.allSettled([tab().svc.save({ minutes: 30, note: '' }, NOW), goals.deleteWithEntries('g1'), other.svc.discard()]);
      // M7 (soft delete): the goal row and all its entries end as tombstones; no LIVE entry may survive the deletion.
      const rows = await db.entries.where('goalId').equals('g1').toArray();
      expect(rows.filter((e) => e.deletedAt === null), `round ${i}`).toEqual([]);
      expect((await db.goals.get('g1'))?.deletedAt, `round ${i}`).toBeTruthy();
      expect(await new DexieEntryRepository(db).getByGoal('g1'), `round ${i}`).toEqual([]);
    }
  });

  it('day limit is enforced for the timer path with the real remaining value (1420 logged earlier, 30 requested)', async () => {
    const { db, timer, tab } = await twoTabsSetup();
    await db.entries.put({ ...sample().entries[0]!, id: 'big', goalId: 'g1', date: '2026-10-09', minutes: 1420, note: '', source: 'manual' });
    await db.kv.put({ key: 'activeTimer', value: timer });
    const r = await tab().svc.save({ minutes: 30, note: '' }, NOW);
    expect(!r.ok && r.errors[0]?.code).toBe('ENTRY_DAY_LIMIT_EXCEEDED');
    expect(!r.ok && r.errors[0]?.params).toEqual({ remaining: 20 });
    expect(await db.kv.get('activeTimer')).toBeDefined();
    expect(await db.entries.where('[goalId+date]').equals(['g1', '2026-10-09']).count()).toBe(1);
    expect((await tab().svc.save({ minutes: 20, note: '' }, NOW)).ok).toBe(true);
  });
});

describe('M2-D3 intent re-targeted at the atomic save (dispute decision: retarget accepted)', () => {
  it('a throwing Dexie write inside the save transaction rejects that call and leaves entries empty and the timer stored', async () => {
    const tc = await container();
    const { goalService, timerService, db } = tc.container;
    const g = await goalService.create({ name: 'A', why: '', targetType: 'daily', targetValue: 30, startDate: '2026-10-01', endDate: '2026-10-31' }, NOW);
    if (!g.ok) throw new Error('setup');
    await timerService.start(g.value.id, new Date(NOW.getTime() - 25 * 60_000));
    const spy = vi.spyOn(db.entries, 'put').mockRejectedValueOnce(new Error('disk full'));
    await expect(timerService.save({ minutes: 25, note: '' }, NOW)).rejects.toThrow();
    spy.mockRestore();
    expect(await db.entries.count()).toBe(0);
    expect(await timerService.current()).toBeDefined(); // the timer survived the failed save
    expect((await timerService.save({ minutes: 25, note: '' }, NOW)).ok).toBe(true); // mutex not wedged
    expect(await timerService.current()).toBeUndefined();
    expect(await db.entries.count()).toBe(1);
  });

  it('a failing timer-row delete after the entry write rolls the entry back (all-or-nothing)', async () => {
    const tc = await container();
    const { goalService, timerService, db } = tc.container;
    const g = await goalService.create({ name: 'A', why: '', targetType: 'daily', targetValue: 30, startDate: '2026-10-01', endDate: '2026-10-31' }, NOW);
    if (!g.ok) throw new Error('setup');
    await timerService.start(g.value.id, new Date(NOW.getTime() - 25 * 60_000));
    const spy = vi.spyOn(db.kv, 'delete').mockRejectedValueOnce(new Error('disk full'));
    await expect(timerService.save({ minutes: 25, note: '' }, NOW)).rejects.toThrow();
    spy.mockRestore();
    expect(await db.entries.count()).toBe(0);
    expect(await timerService.current()).toBeDefined();
  });
});

describe('M3-AC14 EntryService.update/remove by id', () => {
  it('getById finds an entry without any range scan and unknown ids give ENTRY_NOT_FOUND with the DB unchanged', async () => {
    const tc = await container();
    const { db, backupService, entryService } = tc.container;
    const p = await backupService.parse(SAMPLE, bytes(SAMPLE));
    if (!p.ok) throw new Error('parse');
    await backupService.import(p.value);
    const before = await db.entries.toArray();
    const target = before.find((e) => e.goalId === 'g1' && e.date === '2026-10-05')!;
    const rangeSpy = vi.spyOn(db.entries, 'where');
    const u = await entryService.update(target.id, { minutes: 25, note: 'x' }, NOW);
    expect(u.ok).toBe(true);
    // sumMinutes legitimately queries [goalId+date]; nothing may query by a full-history date range.
    const usedIndexes = rangeSpy.mock.calls.map((c) => String(c[0]));
    expect(usedIndexes.every((ix) => ix === '[goalId+date]')).toBe(true);
    rangeSpy.mockRestore();
    const missing = await entryService.update('khong-ton-tai', { minutes: 25, note: 'x' }, NOW);
    expect(!missing.ok && missing.errors[0]?.code).toBe('ENTRY_NOT_FOUND');
    const missingRemove = await entryService.remove('khong-ton-tai');
    expect(!missingRemove.ok && missingRemove.errors[0]?.code).toBe('ENTRY_NOT_FOUND');
    expect(await db.entries.count()).toBe(before.length);
    expect((await db.entries.get(target.id))?.minutes).toBe(25);
  });
});
