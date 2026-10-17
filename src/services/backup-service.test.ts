import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { IMPORT_MAX_BYTES } from '../config/constants';
import { DexieBackupRepository } from '../data/dexie/backup-repo';
import { openDatabase, type AppDatabase } from '../data/dexie/db';
import { DexieKvRepository } from '../data/dexie/kv-repo';
import { DEFAULT_SETTINGS } from '../domain/types';
import { buildEntry, buildGoal, datasetS1, FIXED_NOW } from '../test/builders';
import { createTestDatabase } from '../test/db';
import { BackupService, type BackupSchemaModule } from './backup-service';
import { SettingsService } from './settings-service';

let db: AppDatabase;
let service: BackupService;
let settings: SettingsService;

function wire(database: AppDatabase) {
  const s = new SettingsService(new DexieKvRepository(database));
  return { settings: s, service: new BackupService(new DexieBackupRepository(database), s) };
}

async function seedS1(database: AppDatabase = db) {
  const s1 = datasetS1();
  await database.goals.bulkPut(s1.goals);
  await database.entries.bulkPut(s1.entries);
  return s1;
}

beforeEach(async () => {
  db = createTestDatabase();
  await openDatabase(db);
  ({ settings, service } = wire(db));
});

afterEach(async () => {
  await db.delete();
});

describe('BackupService.export (M3-AC6, M3-AC13)', () => {
  it('names the file by the local date, writes schemaVersion 1 and updates lastBackupAt', async () => {
    await seedS1();
    await db.kv.put({ key: 'locale', value: 'vi' });
    const { fileName, json } = await service.export(FIXED_NOW);
    expect(fileName).toBe('1percent-better-backup-2026-10-09.json');
    const file = JSON.parse(json) as Record<string, unknown>;
    expect(file.app).toBe('one-percent-better');
    expect(file.schemaVersion).toBe(1);
    expect(file.exportedAt).toBe(FIXED_NOW.toISOString());
    expect(file.goals).toHaveLength(5);
    expect(file.entries).toHaveLength(23);
    expect(file.settings).toEqual({ ...DEFAULT_SETTINGS, lastBackupAt: FIXED_NOW.toISOString() });
    expect(json).not.toContain('locale');
    expect(JSON.stringify(Object.keys(file))).not.toContain('locale');
    // M10-D2: building the file does not count as a backup; recordExport does.
    expect((await settings.get()).lastBackupAt).toBeNull();
    await service.recordExport(FIXED_NOW);
    expect((await settings.get()).lastBackupAt).toBe(FIXED_NOW.toISOString());
  });
});

describe('BackupService.parse / import (M3-AC7, M3-AC8, M3-AC9, M3-AC13)', () => {
  it('round-trip: export → new database → import → goals and entries deep-equal', async () => {
    const s1 = await seedS1();
    const { json } = await service.export(FIXED_NOW);

    const db2 = createTestDatabase();
    await openDatabase(db2);
    try {
      const other = wire(db2);
      const preview = await other.service.parse(json, json.length);
      expect(preview.ok).toBe(true);
      if (!preview.ok) return;
      expect(preview.value).toMatchObject({ goals: 5, entries: 23, exportedAt: FIXED_NOW.toISOString() });
      const r = await other.service.import(preview.value);
      expect(r).toEqual({ ok: true, value: { goals: 5, entries: 23 } });
      const byId = <T extends { id: string }>(xs: T[]) => [...xs].sort((a, b) => a.id.localeCompare(b.id));
      const again = await new DexieBackupRepository(db2).exportAll();
      expect(byId(again.goals)).toEqual(byId(s1.goals));
      expect(byId(again.entries)).toEqual(byId(s1.entries));
    } finally {
      await db2.delete();
    }
  });

  it('import replaces everything, clears the timer, resets lastReminderDate and keeps the locale', async () => {
    await db.goals.put(buildGoal({ id: 'temp', name: 'Temp' }));
    await db.entries.put(buildEntry({ id: 'temp-e', goalId: 'temp' }));
    await db.kv.bulkPut([
      { key: 'locale', value: 'vi' },
      { key: 'activeTimer', value: { goalId: 'temp', startedAt: FIXED_NOW.toISOString() } },
    ]);
    const s1 = datasetS1();
    const json = JSON.stringify({
      app: 'one-percent-better',
      schemaVersion: 1,
      exportedAt: FIXED_NOW.toISOString(),
      goals: s1.goals,
      entries: s1.entries,
      settings: { reminderEnabled: true, reminderTime: '07:30', lastReminderDate: '2026-10-09', lastBackupAt: '2026-10-01T00:00:00.000Z' },
    });
    const preview = await service.parse(json, json.length);
    expect(preview.ok).toBe(true);
    if (!preview.ok) return;
    expect(await service.counts()).toEqual({ goals: 1, entries: 1 });
    await service.import(preview.value);
    expect(await db.goals.filter((g) => g.deletedAt == null).count()).toBe(5);
    expect((await db.goals.get('temp'))?.deletedAt).toBeTruthy(); // v2: soft-deleted (ADR-20)
    expect(await db.entries.filter((e) => e.deletedAt == null).count()).toBe(23);
    expect(await db.kv.get('activeTimer')).toBeUndefined();
    expect(await settings.get()).toEqual({ reminderEnabled: true, reminderTime: '07:30', lastReminderDate: null, lastBackupAt: '2026-10-01T00:00:00.000Z', plusOneShown: {} });
    expect(await db.kv.get('locale')).toEqual({ key: 'locale', value: 'vi' });
    expect(await service.counts()).toEqual({ goals: 5, entries: 23 });
  });

  it('every parse error leaves the data untouched and maps to the right code', async () => {
    await db.goals.put(buildGoal({ id: 'temp', name: 'Temp' }));
    const s1 = datasetS1();
    const base = { app: 'one-percent-better', schemaVersion: 1, exportedAt: FIXED_NOW.toISOString(), goals: s1.goals, entries: s1.entries, settings: {} };
    const cases: Array<[string, string, number?]> = [
      ['IMPORT_FILE_TOO_LARGE', JSON.stringify(base), IMPORT_MAX_BYTES + 1],
      ['IMPORT_INVALID_JSON', '{abc'],
      ['IMPORT_INVALID_SCHEMA', JSON.stringify({ ...base, goals: undefined })],
      ['IMPORT_INVALID_SCHEMA', JSON.stringify({ ...base, app: 'nope' })],
      ['IMPORT_INVALID_SCHEMA', JSON.stringify({ ...base, entries: [{ ...s1.entries[0], minutes: '30' }] })],
      ['IMPORT_UNSUPPORTED_VERSION', JSON.stringify({ ...base, schemaVersion: 2 })],
      ['IMPORT_INTEGRITY', JSON.stringify({ ...base, entries: [buildEntry({ id: 'x', goalId: 'ghost', date: '2026-10-05' })] })],
      ['IMPORT_INTEGRITY', JSON.stringify({ ...base, entries: [s1.entries[0], s1.entries[0]] })],
      ['IMPORT_INTEGRITY', JSON.stringify({ ...base, entries: [buildEntry({ id: 'a', goalId: 'g1', date: '2026-10-05', minutes: 1000 }), buildEntry({ id: 'b', goalId: 'g1', date: '2026-10-05', minutes: 441 })] })],
      ['IMPORT_INTEGRITY', JSON.stringify({ ...base, entries: [buildEntry({ id: 'o', goalId: 'g1', date: '2026-09-30' })] })],
    ];
    for (const [code, text, size] of cases) {
      const r = await service.parse(text, size ?? text.length);
      expect(r.ok, code).toBe(false);
      if (!r.ok) expect(r.errors[0].code).toBe(code);
    }
    expect(await db.goals.toArray()).toEqual([expect.objectContaining({ id: 'temp' })]);
    expect(await db.entries.count()).toBe(0);
  });
});

describe('BackupService.import when signed in (M7-AC11, FR-51, A-29)', () => {
  it('stamps every imported goal/entry with updatedAt = nextUpdatedAt(now, …) so the file wins at the next sync; signed out keeps the stamps', async () => {
    const signedIn = { value: true };
    const service2 = new BackupService(new DexieBackupRepository(db), settings, () => signedIn.value);
    const s1 = datasetS1();
    const future = { ...s1.goals[0], updatedAt: '2026-10-09T05:00:00.000Z' };
    const json = JSON.stringify({ app: 'one-percent-better', schemaVersion: 1, exportedAt: FIXED_NOW.toISOString(), goals: [future, ...s1.goals.slice(1)], entries: s1.entries, settings: {} });
    const preview = await service2.parse(json, json.length);
    if (!preview.ok) throw new Error('setup');
    await service2.import(preview.value, FIXED_NOW);
    const rows = await db.goals.toArray();
    expect(rows.find((g) => g.id === 'g2')?.updatedAt).toBe(FIXED_NOW.toISOString());
    expect(rows.find((g) => g.id === 'g1')?.updatedAt).toBe('2026-10-09T05:00:00.001Z');
    expect((await db.entries.get('e-g1-1'))?.updatedAt).toBe(FIXED_NOW.toISOString());
    for (const g of rows) expect(g.dirty).toBe(1);

    signedIn.value = false;
    const again = await service2.parse(JSON.stringify({ app: 'one-percent-better', schemaVersion: 1, exportedAt: FIXED_NOW.toISOString(), goals: s1.goals, entries: s1.entries, settings: {} }), 10);
    if (!again.ok) throw new Error('setup');
    await service2.import(again.value, new Date('2026-10-09T06:00:00.000Z'));
    expect((await db.goals.get('g1'))?.updatedAt).toBe(s1.goals[0].updatedAt);
  });
});

describe('BackupService.parse loads the schema lazily (M10-AC3, ADR-27)', () => {
  function counting() {
    const calls = { n: 0 };
    const loader = async (): Promise<BackupSchemaModule> => {
      calls.n += 1;
      return import('../domain/backup');
    };
    return { calls, service: new BackupService(new DexieBackupRepository(db), settings, () => false, loader) };
  }

  it('returns a Promise; an oversized file is rejected before the schema module is loaded', async () => {
    const { calls, service: svc } = counting();
    const p = svc.parse('{}', IMPORT_MAX_BYTES + 1);
    expect(p).toBeInstanceOf(Promise);
    const r = await p;
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors[0].code).toBe('IMPORT_FILE_TOO_LARGE');
    expect(calls.n).toBe(0);
  });

  it('two parses load the module once; a failed load is retried on the next parse', async () => {
    const { calls, service: svc } = counting();
    const s1 = datasetS1();
    const json = JSON.stringify({ app: 'one-percent-better', schemaVersion: 1, exportedAt: FIXED_NOW.toISOString(), goals: s1.goals, entries: s1.entries, settings: {} });
    expect((await svc.parse(json, json.length)).ok).toBe(true);
    expect((await svc.parse(json, json.length)).ok).toBe(true);
    expect(calls.n).toBe(1);

    let fail = true;
    const flaky = { n: 0 };
    const svc2 = new BackupService(new DexieBackupRepository(db), settings, () => false, async () => {
      flaky.n += 1;
      if (fail) throw new TypeError('Failed to fetch dynamically imported module');
      return import('../domain/backup');
    });
    await expect(svc2.parse(json, json.length)).rejects.toThrow('dynamically imported');
    fail = false;
    expect((await svc2.parse(json, json.length)).ok).toBe(true);
    expect(flaky.n).toBe(2);
  });
});
