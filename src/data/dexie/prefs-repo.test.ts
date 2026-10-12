// `DexieSyncedPrefsRepository` (M7-AC17, FR-55, ADR-25).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_SETTINGS } from '../../domain/types';
import { SettingsService } from '../../services/settings-service';
import { LocaleService } from '../../services/locale-service';
import { BackupService } from '../../services/backup-service';
import { datasetS1 } from '../../test/builders';
import { createTestDatabase } from '../../test/db';
import { DexieBackupRepository } from './backup-repo';
import { openDatabase, type AppDatabase } from './db';
import { DexieKvRepository } from './kv-repo';
import { DexieLocalDataRepository } from './local-data-repo';
import { DexieSyncedPrefsRepository } from './prefs-repo';

let db: AppDatabase;
let prefs: DexieSyncedPrefsRepository;
const NOW = new Date('2026-10-09T03:00:00.000Z');
const T0 = NOW.toISOString();
const T1 = '2026-10-09T03:01:00.000Z';

beforeEach(async () => {
  db = createTestDatabase();
  await openDatabase(db);
  prefs = new DexieSyncedPrefsRepository(db);
});

afterEach(async () => {
  await db.delete();
});

const state = async () => (await db.kv.get('prefsSync'))?.value;

describe('setLocale / setReminder write value + marker in one transaction', () => {
  it('setLocale writes kv locale and the locale marker together; a failure writing the marker leaves locale unchanged', async () => {
    await prefs.setLocale('vi', NOW);
    expect((await db.kv.get('locale'))?.value).toBe('vi');
    expect(await state()).toEqual({ reminder: { updatedAt: null, dirty: 0 }, locale: { updatedAt: T0, dirty: 1 } });

    const original = db.kv.put.bind(db.kv);
    const spy = vi.spyOn(db.kv, 'put').mockImplementation(((row: { key: string; value: unknown }) => {
      if (row.key === 'prefsSync') return Promise.reject(new Error('disk full'));
      return original(row as never);
    }) as never);
    await expect(prefs.setLocale('en', new Date(T1))).rejects.toThrow('disk full');
    spy.mockRestore();
    expect((await db.kv.get('locale'))?.value).toBe('vi');
    expect(await state()).toMatchObject({ locale: { updatedAt: T0, dirty: 1 } });
  });

  it('setReminder keeps lastReminderDate, plusOneShown, lastBackupAt and the locale marker; the stamp is monotonic', async () => {
    await db.kv.put({ key: 'settings', value: { ...DEFAULT_SETTINGS, lastReminderDate: '2026-10-08', plusOneShown: { g1: '2026-10-08' }, lastBackupAt: '2026-10-01T00:00:00.000Z' } });
    await prefs.setLocale('vi', NOW);
    const s = await prefs.setReminder({ reminderTime: '07:30' }, NOW);
    expect(s).toEqual({ reminderEnabled: false, reminderTime: '07:30', lastReminderDate: '2026-10-08', plusOneShown: { g1: '2026-10-08' }, lastBackupAt: '2026-10-01T00:00:00.000Z' });
    expect(await state()).toEqual({ reminder: { updatedAt: T0, dirty: 1 }, locale: { updatedAt: T0, dirty: 1 } });
    // A slow clock cannot move the marker backwards.
    await prefs.setReminder({ reminderEnabled: true }, new Date('2026-10-09T02:00:00.000Z'));
    expect(await state()).toMatchObject({ reminder: { updatedAt: '2026-10-09T03:00:00.001Z', dirty: 1 } });
    await expect(prefs.setReminder({ reminderTime: '25:00' }, NOW)).rejects.toBeInstanceOf(RangeError);
  });

  it('SettingsService / LocaleService route through prefs; claimReminderDay, claimPlusOne and export never mark a group', async () => {
    const kv = new DexieKvRepository(db);
    const settings = new SettingsService(kv, prefs, () => NOW);
    const locale = new LocaleService(kv, prefs, () => NOW);
    await settings.setReminderEnabled(true);
    await locale.set('vi');
    expect(await state()).toEqual({ reminder: { updatedAt: T0, dirty: 1 }, locale: { updatedAt: T0, dirty: 1 } });
    await prefs.applyRemote({ reminder: { enabled: true, time: '20:00', updatedAt: T1 }, locale: { value: 'vi', updatedAt: T1 } });
    expect(await state()).toEqual({ reminder: { updatedAt: T1, dirty: 0 }, locale: { updatedAt: T1, dirty: 0 } });
    expect(await settings.claimReminderDay('2026-10-09')).toBe(true);
    expect(await settings.claimPlusOne('g1', '2026-10-09')).toBe(true);
    await new BackupService(new DexieBackupRepository(db), settings).export(NOW);
    expect(await state()).toEqual({ reminder: { updatedAt: T1, dirty: 0 }, locale: { updatedAt: T1, dirty: 0 } });
    expect(await prefs.getDirty()).toBeNull();
  });
});

describe('getDirty / applyRemote / markAllDirty', () => {
  it('getDirty returns only dirty groups with their values', async () => {
    expect(await prefs.getDirty()).toBeNull();
    await prefs.setReminder({ reminderEnabled: true, reminderTime: '07:30' }, NOW);
    expect(await prefs.getDirty()).toEqual({ reminder: { enabled: true, time: '07:30', updatedAt: T0 }, locale: null });
    await prefs.setLocale('vi', new Date(T1));
    expect(await prefs.getDirty()).toEqual({ reminder: { enabled: true, time: '07:30', updatedAt: T0 }, locale: { value: 'vi', updatedAt: T1 } });
  });

  it('applyRemote updates the reminder group without touching the locale group and vice versa; reports changes', async () => {
    await prefs.setLocale('vi', NOW);
    let r = await prefs.applyRemote({ reminder: { enabled: true, time: '06:00', updatedAt: T1 }, locale: null });
    expect(r).toEqual({ reminderChanged: true, localeChanged: null });
    expect((await db.kv.get('settings'))?.value).toMatchObject({ reminderEnabled: true, reminderTime: '06:00' });
    expect((await db.kv.get('locale'))?.value).toBe('vi');
    expect(await state()).toEqual({ reminder: { updatedAt: T1, dirty: 0 }, locale: { updatedAt: T0, dirty: 1 } });

    r = await prefs.applyRemote({ reminder: { enabled: true, time: '06:00', updatedAt: '2026-10-09T02:00:00.000Z' }, locale: { value: 'en', updatedAt: T1 } });
    expect(r).toEqual({ reminderChanged: false, localeChanged: 'en' });
    expect((await db.kv.get('locale'))?.value).toBe('en');
    expect((await db.kv.get('settings'))?.value).toMatchObject({ reminderTime: '06:00' });
    expect(await state()).toEqual({ reminder: { updatedAt: T1, dirty: 0 }, locale: { updatedAt: T1, dirty: 0 } });

    // Nothing on the cloud and nothing chosen locally → no-op, no marker.
    const fresh = new DexieSyncedPrefsRepository(createTestDatabase());
    expect(await fresh.applyRemote(null)).toEqual({ reminderChanged: false, localeChanged: null });
  });

  it('device never chose + cloud value → applied (cloud wins); device chose + cloud empty → kept and still dirty', async () => {
    expect(await prefs.applyRemote({ reminder: null, locale: { value: 'vi', updatedAt: T0 } })).toEqual({ reminderChanged: false, localeChanged: 'vi' });
    expect(await state()).toMatchObject({ locale: { updatedAt: T0, dirty: 0 } });
    await prefs.setReminder({ reminderTime: '07:30' }, new Date(T1));
    expect(await prefs.applyRemote(null)).toEqual({ reminderChanged: false, localeChanged: null });
    expect(await state()).toMatchObject({ reminder: { updatedAt: T1, dirty: 1 } });
  });

  it('markAllDirty flags the groups that have a marker; clearUserData removes prefsSync but keeps locale', async () => {
    await prefs.setLocale('vi', NOW);
    await prefs.applyRemote({ reminder: null, locale: { value: 'vi', updatedAt: T1 } });
    expect(await state()).toEqual({ reminder: { updatedAt: null, dirty: 0 }, locale: { updatedAt: T1, dirty: 0 } });
    await prefs.markAllDirty();
    expect(await state()).toEqual({ reminder: { updatedAt: null, dirty: 0 }, locale: { updatedAt: T1, dirty: 1 } });
    await new DexieLocalDataRepository(db).clearUserData();
    expect(await db.kv.get('prefsSync')).toBeUndefined();
    expect((await db.kv.get('locale'))?.value).toBe('vi');
    expect(await prefs.getState()).toEqual({ reminder: { updatedAt: null, dirty: 0 }, locale: { updatedAt: null, dirty: 0 } });
  });

  it('import (replaceAll) marks the reminder group at import time and leaves the locale group alone', async () => {
    await prefs.setLocale('vi', NOW);
    const s1 = datasetS1();
    const repo = new DexieBackupRepository(db, () => new Date(T1));
    await repo.replaceAll({ goals: s1.goals, entries: s1.entries, settings: { ...DEFAULT_SETTINGS, reminderTime: '07:30' } });
    expect(await state()).toEqual({ reminder: { updatedAt: T1, dirty: 1 }, locale: { updatedAt: T0, dirty: 1 } });
    expect((await db.kv.get('locale'))?.value).toBe('vi');
  });

  it('watchState emits the markers live', async () => {
    const seen: unknown[] = [];
    const stop = prefs.watchState().subscribe((s) => seen.push(s));
    await vi.waitFor(() => expect(seen.length).toBeGreaterThan(0));
    await prefs.setLocale('en', NOW);
    await vi.waitFor(() => expect(seen[seen.length - 1]).toMatchObject({ locale: { updatedAt: T0, dirty: 1 } }));
    stop();
  });
});
