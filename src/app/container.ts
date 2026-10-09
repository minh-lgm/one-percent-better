// Composition root (ARCHITECTURE §3): the only place that wires concrete
// implementations (Dexie repositories, Intl, workbox, Notification API) to services and UI.
import type { i18n } from 'i18next';
import { createDatabase, openDatabase, type AppDatabase } from '../data/dexie/db';
import { DexieBackupRepository } from '../data/dexie/backup-repo';
import { DexieEntryRepository } from '../data/dexie/entry-repo';
import { DexieGoalRepository } from '../data/dexie/goal-repo';
import { DexieKvRepository } from '../data/dexie/kv-repo';
import { DexieTimerRepository } from '../data/dexie/timer-repo';
import { StorageError } from '../domain/types';
import { createTranslator, currentLocale, setLocale } from '../i18n/instance';
import type { Locale, Translator } from '../i18n/types';
import { createBrowserNotifications } from '../integration/notifications';
import { isIndexedDbAvailable, requestPersistentStorage, type PersistState } from '../integration/storage';
import { BackupService } from '../services/backup-service';
import { EntryService } from '../services/entry-service';
import { GoalService, defaultIdGenerator } from '../services/goal-service';
import { LocaleService } from '../services/locale-service';
import type { NotificationPort } from '../services/notification-port';
import { ReminderService } from '../services/reminder-service';
import { SettingsService } from '../services/settings-service';
import { StatsService } from '../services/stats-service';
import { TimerService } from '../services/timer-service';
import { createUpdateStore, type UpdateStore } from './updates';

export interface LocaleControl {
  current(): Locale;
  /** Apply immediately (i18next + <html lang>) and persist; rejects if persisting fails. */
  change(locale: Locale): Promise<void>;
}

export interface AppContainer {
  i18n: i18n;
  translator: Translator;
  db: AppDatabase;
  goalService: GoalService;
  entryService: EntryService;
  localeService: LocaleService;
  settingsService: SettingsService;
  timerService: TimerService;
  reminderService: ReminderService;
  backupService: BackupService;
  statsService: StatsService;
  notifications: NotificationPort;
  locale: LocaleControl;
  /** Result of `navigator.storage.persist()`, requested once at startup. */
  storagePersistence: Promise<PersistState>;
  /** Service-worker update notifications (UpdateToast). */
  updates: UpdateStore;
}

export interface ContainerOptions {
  i18n: i18n;
  dbName: string;
  storage?: Parameters<typeof requestPersistentStorage>[0];
  indexedDbAvailable?: boolean;
  notifications?: NotificationPort;
  /** URL of the 192 px icon used in notifications. */
  notificationIconUrl?: string;
}

export async function createContainer({
  i18n,
  dbName,
  storage,
  indexedDbAvailable = isIndexedDbAvailable(),
  notifications = createBrowserNotifications(),
  notificationIconUrl,
}: ContainerOptions): Promise<AppContainer> {
  if (!indexedDbAvailable) throw new StorageError('IndexedDB is not available in this browser');

  const db = createDatabase(dbName);
  await openDatabase(db);

  const goalRepo = new DexieGoalRepository(db);
  const entryRepo = new DexieEntryRepository(db);
  const kvRepo = new DexieKvRepository(db);
  const timerRepo = new DexieTimerRepository(db);

  const localeService = new LocaleService(kvRepo);
  const translator = createTranslator(i18n);
  const entryService = new EntryService(entryRepo, goalRepo);
  const settingsService = new SettingsService(kvRepo);

  return {
    i18n,
    translator,
    db,
    goalService: new GoalService(goalRepo, entryRepo, defaultIdGenerator, kvRepo),
    entryService,
    localeService,
    settingsService,
    timerService: new TimerService(kvRepo, goalRepo, entryService, timerRepo),
    reminderService: new ReminderService(settingsService, goalRepo, entryRepo, notifications, translator, notificationIconUrl),
    backupService: new BackupService(new DexieBackupRepository(db), settingsService),
    statsService: new StatsService(goalRepo, entryRepo),
    notifications,
    locale: {
      current: () => currentLocale(i18n),
      async change(locale) {
        setLocale(i18n, locale);
        await localeService.set(locale);
      },
    },
    storagePersistence: requestPersistentStorage(storage),
    updates: createUpdateStore(),
  };
}
