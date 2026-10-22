// M15-AC2: `ReminderService.replan` (ARCH §5.6 v5.0, ADR-40) with a fake NotificationPort; `check()` (M2) untouched.
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { openDatabase, type AppDatabase } from '../data/dexie/db';
import { DexieEntryRepository } from '../data/dexie/entry-repo';
import { DexieGoalRepository } from '../data/dexie/goal-repo';
import { DexieKvRepository } from '../data/dexie/kv-repo';
import { createI18n, createTranslator } from '../i18n/instance';
import en from '../i18n/resources/en.json';
import vi from '../i18n/resources/vi.json';
import type { Locale } from '../i18n/types';
import { buildEntry, datasetS1 } from '../test/builders';
import { createTestDatabase } from '../test/db';
import { fakeNotifications, pendingSchedule, type FakeNotifications } from '../test/notifications';
import type { NotificationPermissionState } from '../domain/reminder';
import { ReminderService } from './reminder-service';
import { SettingsService } from './settings-service';

let db: AppDatabase;
let settings: SettingsService;
let notifications: FakeNotifications;

const at = (hhmm: string, date = '2026-10-09') => new Date(`${date}T${hhmm}+07:00`);
const local = (date: string, hh: number, mm: number) => {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(y, m - 1, d, hh, mm, 0, 0);
};

function makeService(locale: Locale, permission: NotificationPermissionState = 'granted', canSchedule = true) {
  notifications = fakeNotifications(permission, { canSchedule });
  const i18n = createI18n({ locale, strictMissingKeys: true });
  return new ReminderService(settings, new DexieGoalRepository(db), new DexieEntryRepository(db), notifications, createTranslator(i18n), '/icons/pwa-192.png');
}

/** Entries that put G1, G2, G3 on target today (Spanish: 6000 min over 365 days → 17 min/day). */
const reachToday = () => [
  buildEntry({ id: 'r1', goalId: 'g1', date: '2026-10-09', minutes: 30 }),
  buildEntry({ id: 'r2', goalId: 'g2', date: '2026-10-09', minutes: 20 }),
  buildEntry({ id: 'r3', goalId: 'g3', date: '2026-10-09', minutes: 17 }),
];

beforeEach(async () => {
  db = createTestDatabase();
  await openDatabase(db);
  settings = new SettingsService(new DexieKvRepository(db));
  const s1 = datasetS1();
  await db.goals.bulkPut(s1.goals);
  await db.entries.bulkPut(s1.entries);
  await settings.update({ reminderEnabled: true, reminderTime: '20:00' });
});

afterEach(async () => {
  await db.delete();
});

describe('ReminderService.replan (M15-AC2)', () => {
  it("web port (canSchedule false) → 'unsupported', nothing scheduled; check() still works as in M2", async () => {
    const service = makeService('en', 'granted', false);
    expect(await service.replan(at('10:00:00'))).toBe('unsupported');
    expect(notifications.scheduled).toEqual([]);
    expect(notifications.cancels).toBe(0);
    expect(await service.check(at('20:00:30'))).toBe(true);
    expect(notifications.shown).toHaveLength(1);
  });

  it('granted + S1 at 10:00 → one schedule of 14 items in date order, ids 1000 …, local 20:00, en copy from DESIGN 7.8.4', async () => {
    const service = makeService('en');
    expect(await service.replan(at('10:00:00'))).toBe('scheduled');
    expect(notifications.scheduled).toHaveLength(1);
    expect(notifications.refreshes).toBe(1);
    const items = pendingSchedule(notifications);
    expect(items).toHaveLength(14);
    expect(items.map((i) => i.id)).toEqual(Array.from({ length: 14 }, (_, i) => 1000 + i));
    expect(items[0].at.getTime()).toBe(local('2026-10-09', 20, 0).getTime());
    expect(items[13].at.getTime()).toBe(local('2026-10-22', 20, 0).getTime());
    for (let i = 1; i < items.length; i += 1) expect(items[i].at.getTime()).toBeGreaterThan(items[i - 1].at.getTime());
    for (const item of items) {
      expect(item.title).toBe(en.notification.nativeTitle);
      expect(item.body).toBe(en.notification.nativeBody);
      expect(item.url).toBe('#/today');
      expect(item.at.getHours()).toBe(20);
      expect(item.at.getMinutes()).toBe(0);
    }
    expect(notifications.shown).toEqual([]); // never `show()` on the scheduled path
  });

  it('vi locale → vi copy; the reminder time is honoured (07:30)', async () => {
    await settings.update({ reminderTime: '07:30' });
    const service = makeService('vi');
    expect(await service.replan(at('06:00:00'))).toBe('scheduled');
    const items = pendingSchedule(notifications);
    expect(items[0].title).toBe(vi.notification.nativeTitle);
    expect(items[0].body).toBe(vi.notification.nativeBody);
    expect(items[0].at.getTime()).toBe(local('2026-10-09', 7, 30).getTime());
    // Past 07:30 today → tomorrow first.
    expect(await service.replan(at('07:31:00'))).toBe('scheduled');
    expect(pendingSchedule(notifications)[0].at.getTime()).toBe(local('2026-10-10', 7, 30).getTime());
    expect(pendingSchedule(notifications)).toHaveLength(13);
  });

  it("permission default / denied → 'no-permission', nothing scheduled, nothing asked (A-64)", async () => {
    for (const p of ['default', 'denied'] as const) {
      const service = makeService('en', p);
      expect(await service.replan(at('10:00:00'))).toBe('no-permission');
      expect(notifications.scheduled).toEqual([]);
      expect(notifications.requests).toBe(0);
    }
  });

  it("reminders off → cancelAll once, 'cancelled' (also when the permission is missing)", async () => {
    await settings.update({ reminderEnabled: false });
    const service = makeService('en', 'default');
    expect(await service.replan(at('10:00:00'))).toBe('cancelled');
    expect(notifications.cancels).toBe(1);
    expect(pendingSchedule(notifications)).toEqual([]);
  });

  it('every goal on target today → the schedule starts tomorrow; no active goal → an empty schedule replaces the old one', async () => {
    const service = makeService('en');
    await db.entries.bulkPut(reachToday());
    expect(await service.replan(at('10:00:00'))).toBe('scheduled');
    expect(pendingSchedule(notifications)[0].at.getTime()).toBe(local('2026-10-10', 20, 0).getTime());
    expect(pendingSchedule(notifications)).toHaveLength(13);

    await db.goals.toCollection().modify({ archived: true });
    expect(await service.replan(at('10:00:00'))).toBe('scheduled');
    expect(pendingSchedule(notifications)).toEqual([]);
    expect(notifications.scheduled).toHaveLength(2);
  });

  it("the adapter fails to write → 'failed'", async () => {
    const service = makeService('en');
    notifications.canScheduleNow = false;
    expect(await service.replan(at('10:00:00'))).toBe('failed');
  });

  it('5 concurrent replans → at most 2 schedules, the last one reflecting the newest data', async () => {
    const service = makeService('en');
    const runs = [1, 2, 3, 4, 5].map(() => service.replan(at('10:00:00')));
    // Data changes while the first run is in flight: by the time the coalesced run reads, today is done.
    await db.entries.bulkPut(reachToday());
    const results = await Promise.all(runs);
    expect(results.every((r) => r === 'scheduled')).toBe(true);
    expect(notifications.scheduled.length).toBeGreaterThanOrEqual(1);
    expect(notifications.scheduled.length).toBeLessThanOrEqual(2);
    expect(pendingSchedule(notifications)[0].at.getTime()).toBe(local('2026-10-10', 20, 0).getTime());
    // A later call after everything settled runs again normally.
    expect(await service.replan(at('10:00:00'))).toBe('scheduled');
    expect(notifications.scheduled.length).toBeLessThanOrEqual(3);
  });
});
