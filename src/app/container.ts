// Composition root (ARCHITECTURE §3): the only place that wires concrete
// implementations (Dexie repositories, Intl, workbox, Notification API) to services and UI.
import type { i18n } from 'i18next';
import { createDatabase, openDatabase, type AppDatabase } from '../data/dexie/db';
import { DexieBackupRepository } from '../data/dexie/backup-repo';
import { DexieEntryRepository } from '../data/dexie/entry-repo';
import { DexieGoalRepository } from '../data/dexie/goal-repo';
import { DexieKvRepository } from '../data/dexie/kv-repo';
import { DexieLocalDataRepository } from '../data/dexie/local-data-repo';
import { DexieSyncedPrefsRepository } from '../data/dexie/prefs-repo';
import { DexieSyncStore } from '../data/dexie/sync-store';
import { DexieTimerRepository } from '../data/dexie/timer-repo';
import type { CloudConfig } from '../config/env';
import { StorageError } from '../domain/types';
import { createTranslator, currentLocale, setLocale } from '../i18n/instance';
import type { Locale, Translator } from '../i18n/types';
import { callbackRedirectUrl, sessionReturnTo } from '../integration/auth-callback';
import { alwaysOnline, createConnectivity, type Connectivity } from '../integration/connectivity';
import { createBrowserNotifications } from '../integration/notifications';
import { isIndexedDbAvailable, requestPersistentStorage, type PersistState } from '../integration/storage';
import { clearPkceVerifiers, clearStoredSession, createRemoteLoader, createSupabaseLoader, hasStoredSession } from '../integration/supabase/loader';
import { createWebLocks } from '../integration/web-locks';
import type { AuthPort, ReturnToStore } from '../services/auth-port';
import { AuthService } from '../services/auth-service';
import { BackupService } from '../services/backup-service';
import { EntryService } from '../services/entry-service';
import { GoalService, defaultIdGenerator } from '../services/goal-service';
import { LocaleService } from '../services/locale-service';
import type { LockPort } from '../services/lock-port';
import { LoginPromptService } from '../services/login-prompt-service';
import type { NotificationPort } from '../services/notification-port';
import { ReminderService } from '../services/reminder-service';
import type { RemoteStore } from '../services/remote-store';
import { SettingsService } from '../services/settings-service';
import { StatsService } from '../services/stats-service';
import { SyncService } from '../services/sync-service';
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
  /** Optional Google sign-in (M6). `unavailable` when the build has no cloud configuration (FR-38). */
  authService: AuthService;
  /** Background sync (M7). `null` when the build has no cloud configuration. */
  syncService: SyncService | null;
  /** Login prompts (M8). Always present; its rules return `false` while `authService` is `unavailable`. */
  loginPromptService: LoginPromptService;
  connectivity: Connectivity;
  notifications: NotificationPort;
  locale: LocaleControl;
  /** Result of `navigator.storage.persist()`, requested once at startup. */
  storagePersistence: Promise<PersistState>;
  /** Service-worker update notifications (UpdateToast). */
  updates: UpdateStore;
  /** Stops the watchers the container started (tests). */
  dispose(): void;
}

export interface ContainerOptions {
  i18n: i18n;
  dbName: string;
  storage?: Parameters<typeof requestPersistentStorage>[0];
  indexedDbAvailable?: boolean;
  notifications?: NotificationPort;
  /** URL of the 192 px icon used in notifications. */
  notificationIconUrl?: string;
  /** Cloud configuration from `env.cloud`; `null`/omitted = no account feature, no SDK loader created. */
  cloud?: CloudConfig | null;
  /** Where the SDK keeps its session (`localStorage`); tests pass a fake. */
  authStorage?: Storage | null;
  /** Override the SDK loader (tests inject a FakeAuthPort and count calls). */
  loadAuth?: () => Promise<AuthPort>;
  /** Override the RemoteStore loader (tests inject a FakeRemoteStore). */
  loadRemote?: () => Promise<RemoteStore>;
  locks?: LockPort;
  connectivity?: Connectivity;
  returnTo?: ReturnToStore;
  /** `<origin><BASE_URL>?auth=callback`; defaults from `location` + `import.meta.env.BASE_URL`. */
  redirectUrl?: string;
  clock?: () => Date;
}

export async function createContainer({
  i18n,
  dbName,
  storage,
  indexedDbAvailable = isIndexedDbAvailable(),
  notifications = createBrowserNotifications(),
  notificationIconUrl,
  cloud = null,
  authStorage = typeof localStorage === 'undefined' ? null : localStorage,
  loadAuth,
  loadRemote,
  locks,
  connectivity = typeof window === 'undefined' ? alwaysOnline : createConnectivity(),
  returnTo = sessionReturnTo(typeof sessionStorage === 'undefined' ? null : sessionStorage),
  redirectUrl = typeof location === 'undefined' ? '' : callbackRedirectUrl(location.origin, import.meta.env.BASE_URL),
  clock = () => new Date(),
}: ContainerOptions): Promise<AppContainer> {
  if (!indexedDbAvailable) throw new StorageError('IndexedDB is not available in this browser');

  const db = createDatabase(dbName);
  await openDatabase(db);

  const goalRepo = new DexieGoalRepository(db, clock);
  const entryRepo = new DexieEntryRepository(db, clock);
  const kvRepo = new DexieKvRepository(db);
  const timerRepo = new DexieTimerRepository(db);
  const prefsRepo = new DexieSyncedPrefsRepository(db);
  const localData = new DexieLocalDataRepository(db);

  const localeService = new LocaleService(kvRepo, prefsRepo, clock);
  const translator = createTranslator(i18n);
  const entryService = new EntryService(entryRepo, goalRepo);
  const settingsService = new SettingsService(kvRepo, prefsRepo, clock);

  // Cloud off → stub; nothing here references the SDK (ADR-18). Cloud on → lazy loader, SDK untouched until needed.
  const authLoader = cloud ? (loadAuth ?? createSupabaseLoader(cloud, authStorage ?? undefined)) : null;
  const authService = cloud
    ? new AuthService({
        loadAuth: authLoader!,
        storedSession: () => hasStoredSession(authStorage),
        clearStoredSession: () => clearStoredSession(authStorage),
        clearPkceVerifier: () => clearPkceVerifiers(authStorage),
        local: localData,
        kv: kvRepo,
        connectivity,
        returnTo,
        redirectUrl,
      })
    : AuthService.unavailable();

  const syncService = cloud
    ? new SyncService({
        local: new DexieSyncStore(db),
        prefs: prefsRepo,
        localData,
        loadRemote: loadRemote ?? createRemoteLoader(authLoader!),
        kv: kvRepo,
        auth: {
          currentUserId: () => authService.currentUserId(),
          ready: () => authService.settled(),
          onUnauthorized: () => authService.expire(),
        },
        locks: locks ?? createWebLocks(),
        clock,
        connectivity,
      })
    : null;

  // Language applied from the account (FR-55): kv `locale` changes outside the switcher → apply now, no reload.
  const stopLocaleWatch = localeService.watch().subscribe((saved) => {
    if (saved && saved !== currentLocale(i18n)) setLocale(i18n, saved);
  }, () => undefined);

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
    backupService: new BackupService(new DexieBackupRepository(db, clock), settingsService, () => authService.currentUserId() !== null),
    statsService: new StatsService(goalRepo, entryRepo),
    authService,
    syncService,
    loginPromptService: new LoginPromptService(kvRepo, goalRepo, entryRepo),
    connectivity,
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
    dispose() {
      stopLocaleWatch();
      syncService?.stop();
    },
  };
}
