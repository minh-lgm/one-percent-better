import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { openDatabase, type AppDatabase } from '../data/dexie/db';
import { DexieEntryRepository } from '../data/dexie/entry-repo';
import { DexieGoalRepository } from '../data/dexie/goal-repo';
import { DexieKvRepository } from '../data/dexie/kv-repo';
import { createI18n, createTranslator } from '../i18n/instance';
import vi from '../i18n/resources/vi.json';
import type { Locale } from '../i18n/types';
import { buildEntry, buildGoal, datasetS1 } from '../test/builders';
import { createTestDatabase } from '../test/db';
import { fakeNotifications, type FakeNotifications } from '../test/notifications';
import { ReminderService } from './reminder-service';
import { SettingsService } from './settings-service';

let db: AppDatabase;
let settings: SettingsService;
let notifications: FakeNotifications;

const at = (hhmm: string, date = '2026-10-09') => new Date(`${date}T${hhmm}+07:00`);

function makeService(locale: Locale, permission: Parameters<typeof fakeNotifications>[0] = 'granted') {
  notifications = fakeNotifications(permission);
  const i18n = createI18n({ locale, strictMissingKeys: true });
  return new ReminderService(settings, new DexieGoalRepository(db), new DexieEntryRepository(db), notifications, createTranslator(i18n), '/icons/pwa-192.png');
}

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

describe('ReminderService.check (M2-AC7, M2-AC8)', () => {
  it('sends one notification with count and per-goal progress in en, then not again today', async () => {
    const service = makeService('en');
    expect(await service.check(at('20:00:30'))).toBe(true);
    expect(notifications.shown).toHaveLength(1);
    const n = notifications.shown[0];
    expect(n.title).toBe('1% Better');
    expect(n.body).toBe('3 goals left today: Read 0/30 min, Guitar 0/20 min, Spanish 0/17 min');
    expect(n.body).toContain('3 goals left today');
    expect(n).toMatchObject({ lang: 'en', tag: 'daily-reminder', url: '#/today', icon: '/icons/pwa-192.png' });
    expect((await settings.get()).lastReminderDate).toBe('2026-10-09');

    for (const time of ['20:01:30', '20:02:30', '20:03:30']) expect(await service.check(at(time))).toBe(false);
    expect(notifications.shown).toHaveLength(1);
  });

  it('sends again the next day', async () => {
    const service = makeService('en');
    await service.check(at('20:00:30'));
    expect(await service.check(at('20:00:30', '2026-10-10'))).toBe(true);
    expect(notifications.shown).toHaveLength(2);
    expect((await settings.get()).lastReminderDate).toBe('2026-10-10');
  });

  it('does nothing before the time, when disabled, when permission is missing, or when all goals are met', async () => {
    const service = makeService('en');
    expect(await service.check(at('19:59:00'))).toBe(false);
    await settings.setReminderEnabled(false);
    expect(await service.check(at('20:00:30'))).toBe(false);
    await settings.setReminderEnabled(true);
    notifications.state = 'denied';
    expect(await service.check(at('20:00:30'))).toBe(false);
    notifications.state = 'granted';
    await db.entries.bulkPut([
      buildEntry({ id: 'm1', goalId: 'g1', minutes: 30 }),
      buildEntry({ id: 'm2', goalId: 'g2', minutes: 20 }),
      buildEntry({ id: 'm3', goalId: 'g3', minutes: 17 }),
    ]);
    expect(await service.check(at('20:00:30'))).toBe(false);
    expect(notifications.shown).toHaveLength(0);
    expect((await settings.get()).lastReminderDate).toBeNull();
  });

  it('does not record lastReminderDate when the browser could not show the notification', async () => {
    const service = makeService('en');
    notifications.canShow = false;
    expect(await service.check(at('20:00:30'))).toBe(false);
    expect((await settings.get()).lastReminderDate).toBeNull();
  });

  it('uses the singular form for one goal and "and k more" beyond three', async () => {
    const service = makeService('en');
    await db.entries.bulkPut([buildEntry({ id: 'm2', goalId: 'g2', minutes: 20 }), buildEntry({ id: 'm3', goalId: 'g3', minutes: 17 })]);
    await service.check(at('20:00:30'));
    expect(notifications.shown[0].body).toBe('1 goal left today: Read 0/30 min');

    await db.entries.bulkDelete(['m2', 'm3']);
    await db.goals.bulkPut([buildGoal({ id: 'x1', name: 'Yoga', targetMinutes: 10 }), buildGoal({ id: 'x2', name: 'Piano', targetMinutes: 15 })]);
    await settings.update({ lastReminderDate: null });
    await service.check(at('20:00:30'));
    expect(notifications.shown[1].body).toBe('5 goals left today: Read 0/30 min, Guitar 0/20 min, Spanish 0/17 min, and 2 more');
  });

  it('translates body at send time in vi and sets lang (M2-AC13)', async () => {
    const service = makeService('vi');
    await service.check(at('20:00:30'));
    const n = notifications.shown[0];
    expect(n.lang).toBe('vi');
    expect(n.title).toBe(vi.notification.title);
    const expected = vi.notification.body_other
      .replace('{{count}}', '3')
      .replace('{{list}}', ['Read', 'Guitar', 'Spanish'].map((g, i) => vi.notification.item.replace('{{goal}}', g).replace('{{current}}', '0').replace('{{target}}', ['30', '20', '17'][i])).join(', '));
    expect(n.body).toBe(expected);
    expect(n.body).toContain('Read');
    expect(n.body).toContain('Guitar');
    expect(n.body).toContain('Spanish');
    expect(n.body).not.toContain('goals left today');
  });
});

describe('ReminderService.getBannerState / progress', () => {
  it('reports banner data (no permission needed)', async () => {
    const service = makeService('en', 'denied');
    expect(await service.getBannerState(at('20:01:00'))).toEqual({ show: true, count: 3, time: '20:00' });
    expect(await service.getBannerState(at('19:59:00'))).toEqual({ show: false, count: 3, time: '20:00' });
    const progress = await service.progress(at('10:00:00'));
    expect(progress.map((g) => [g.name, g.current, g.target])).toEqual([
      ['Read', 0, 30],
      ['Guitar', 0, 20],
      ['Spanish', 0, 17],
    ]);
  });
});
