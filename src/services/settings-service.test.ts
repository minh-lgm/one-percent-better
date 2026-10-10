import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { openDatabase, type AppDatabase } from '../data/dexie/db';
import { DexieKvRepository } from '../data/dexie/kv-repo';
import { DEFAULT_SETTINGS } from '../domain/types';
import { createTestDatabase } from '../test/db';
import { normalizeSettings, SettingsService } from './settings-service';

let db: AppDatabase;
let kv: DexieKvRepository;
let service: SettingsService;

beforeEach(async () => {
  db = createTestDatabase();
  await openDatabase(db);
  kv = new DexieKvRepository(db);
  service = new SettingsService(kv);
});

afterEach(async () => {
  await db.delete();
});

describe('SettingsService (FR-13)', () => {
  it('returns defaults when nothing is stored: reminder off, 20:00', async () => {
    expect(await service.get()).toEqual(DEFAULT_SETTINGS);
    expect(await kv.get('settings')).toBeUndefined();
  });

  it('update persists and merges with defaults', async () => {
    await service.setReminderEnabled(true);
    expect(await service.get()).toEqual({ ...DEFAULT_SETTINGS, reminderEnabled: true });
    await service.setReminderTime('07:30');
    expect(await kv.get('settings')).toEqual({ ...DEFAULT_SETTINGS, reminderEnabled: true, reminderTime: '07:30' });
    await service.update({ lastReminderDate: '2026-10-09' });
    expect((await service.get()).lastReminderDate).toBe('2026-10-09');
  });

  it('rejects a malformed reminder time at the boundary', async () => {
    await expect(service.setReminderTime('25:00')).rejects.toBeInstanceOf(RangeError);
    await expect(service.update({ reminderTime: '' })).rejects.toBeInstanceOf(RangeError);
    expect(await service.get()).toEqual(DEFAULT_SETTINGS);
  });

  it('normalises corrupt stored values instead of failing', async () => {
    await kv.set('settings', { reminderEnabled: 'yes', reminderTime: 'noon', lastReminderDate: 42, plusOneShown: null });
    expect(await service.get()).toEqual(DEFAULT_SETTINGS);
    expect(normalizeSettings(null)).toEqual(DEFAULT_SETTINGS);
    expect(normalizeSettings({ reminderEnabled: true, reminderTime: '21:15', lastBackupAt: '2026-10-01T00:00:00.000Z' })).toEqual({
      ...DEFAULT_SETTINGS,
      reminderEnabled: true,
      reminderTime: '21:15',
      lastBackupAt: '2026-10-01T00:00:00.000Z',
    });
  });

  it('claimReminderDay is atomic: concurrent claims yield exactly one winner; release restores the previous value', async () => {
    const results = await Promise.all(Array.from({ length: 10 }, () => service.claimReminderDay('2026-10-09')));
    expect(results.filter(Boolean)).toHaveLength(1);
    expect((await service.get()).lastReminderDate).toBe('2026-10-09');
    await service.releaseReminderDay('2026-10-09', null);
    expect((await service.get()).lastReminderDate).toBeNull();
    // Releasing a day that is not the current claim is a no-op.
    expect(await service.claimReminderDay('2026-10-10')).toBe(true);
    await service.releaseReminderDay('2026-10-09', null);
    expect((await service.get()).lastReminderDate).toBe('2026-10-10');
  });

  it('watch emits normalised settings on every change', async () => {
    const seen: unknown[] = [];
    const unsubscribe = service.watch().subscribe((s) => seen.push(s));
    await new Promise((r) => setTimeout(r, 50));
    await service.setReminderEnabled(true);
    await new Promise((r) => setTimeout(r, 50));
    unsubscribe();
    expect(seen[0]).toEqual(DEFAULT_SETTINGS);
    expect(seen[seen.length - 1]).toEqual({ ...DEFAULT_SETTINGS, reminderEnabled: true });
  });
});

describe('SettingsService.claimPlusOne (FR-29, M5-AC3)', () => {
  it('first claim wins and persists plusOneShown; a second claim for the same day loses; another day wins again', async () => {
    expect(await service.claimPlusOne('g1', '2026-10-09')).toBe(true);
    expect((await service.get()).plusOneShown).toEqual({ g1: '2026-10-09' });
    expect(await service.claimPlusOne('g1', '2026-10-09')).toBe(false);
    expect(await service.claimPlusOne('g2', '2026-10-09')).toBe(true);
    expect((await service.get()).plusOneShown).toEqual({ g1: '2026-10-09', g2: '2026-10-09' });
    expect(await service.claimPlusOne('g1', '2026-10-10')).toBe(true);
    // Stale days are dropped; other settings survive.
    await service.setReminderTime('07:30');
    expect(await service.claimPlusOne('g3', '2026-10-10')).toBe(true);
    expect((await service.get()).plusOneShown).toEqual({ g1: '2026-10-10', g3: '2026-10-10' });
    expect((await service.get()).reminderTime).toBe('07:30');
  });

  it('20 concurrent claims for the same goal/day: exactly one wins', async () => {
    const results = await Promise.all(Array.from({ length: 20 }, () => service.claimPlusOne('g1', '2026-10-09')));
    expect(results.filter(Boolean)).toHaveLength(1);
  });
});
