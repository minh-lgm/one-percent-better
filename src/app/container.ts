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
import { createWebFileExport, readTextFile } from '../integration/file-io';
import { createBrowserNotifications, unsupportedNotifications } from '../integration/notifications';
import type { NativePlatform } from '../integration/platform';
import { isIndexedDbAvailable, requestPersistentStorage, type PersistState } from '../integration/storage';
import { clearPkceVerifiers, clearStoredSession, createAccountDeletionLoader, createRemoteLoader, createSupabaseLoader, hasStoredSession } from '../integration/supabase/loader';
import { createWebLocks } from '../integration/web-locks';
import type { AccountDeletionPort } from '../services/account-deletion-port';
import type { AuthPort, ReturnToStore } from '../services/auth-port';
import { AuthService } from '../services/auth-service';
import { BackupService } from '../services/backup-service';
import { EntryService } from '../services/entry-service';
import type { FileExportPort } from '../services/file-export-port';
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
import { computeCapabilities, type AppCapabilities } from './capabilities';
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
  /** v3.1 (ADR-29): hard-delete old tombstones nobody can still need; run once at startup by `app/maintenance`. */
  purgeTombstones: (now: Date) => Promise<{ goals: number; entries: number }>;
  /** v5.0 (ARCH §5.12): what this build/platform can do; the UI reads this instead of importing integration code. */
  capabilities: AppCapabilities;
  /** v5.0 (ARCH §5.15): backup / .ics export: download on the web, share sheet on native. */
  fileExport: FileExportPort;
  /** Reads a user-selected file as text (Import); the UI gets it here so it never imports integration code. */
  readTextFile: (file: Blob) => Promise<string>;
  /** The Capacitor runtime when running inside the native app (`null` on the web). */
  native: NativePlatform | null;
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
  /** v5.0 (M14): override the account-deletion loader (tests inject a FakeAccountDeletionPort). */
  loadAccountDeletion?: () => Promise<AccountDeletionPort>;
  locks?: LockPort;
  connectivity?: Connectivity;
  returnTo?: ReturnToStore;
  /** `<origin><BASE_URL>?auth=callback`; defaults from `location` + `import.meta.env.BASE_URL`. */
  redirectUrl?: string;
  clock?: () => Date;
  /** v5.0: the native runtime from `loadNativePlatform()`; `null`/omitted = web adapters. */
  native?: NativePlatform | null;
  /** v5.0: `__OPB_NATIVE__` of the build (tests inject it; a non-null `native` implies it). */
  nativeBuild?: boolean;
  /** `import.meta.env.BASE_URL`; tests pass a fixed value. */
  baseUrl?: string;
  /** Override the export port (tests inject a fake). */
  fileExport?: FileExportPort;
}

export async function createContainer({
  i18n,
  dbName,
  storage,
  indexedDbAvailable = isIndexedDbAvailable(),
  notifications,
  notificationIconUrl,
  cloud = null,
  authStorage = typeof localStorage === 'undefined' ? null : localStorage,
  loadAuth,
  loadRemote,
  loadAccountDeletion,
  locks,
  connectivity = typeof window === 'undefined' ? alwaysOnline : createConnectivity(),
  returnTo = sessionReturnTo(typeof sessionStorage === 'undefined' ? null : sessionStorage),
  redirectUrl = typeof location === 'undefined' ? '' : callbackRedirectUrl(location.origin, import.meta.env.BASE_URL),
  clock = () => new Date(),
  native = null,
  nativeBuild = native !== null || __OPB_NATIVE__,
  baseUrl = import.meta.env.BASE_URL,
  fileExport,
}: ContainerOptions): Promise<AppContainer> {
  if (!indexedDbAvailable) throw new StorageError('IndexedDB is not available in this browser');

  // v5.0 (ADR-34/35): platform differences are decided here, once. Native: notifications scheduled by the OS through
  // the runtime's adapter (M15; a runtime without it → "Not supported"), export through the share sheet; the account
  // exists only when the runtime offers native sign-in (`idTokens`, M14) — a runtime without it ignores the cloud
  // configuration and never loads the SDK.
  const notificationPort = notifications ?? native?.notifications ?? (native ? unsupportedNotifications() : createBrowserNotifications());
  const capabilities = computeCapabilities({ native, nativeBuild, baseUrl, notifications: notificationPort });
  const exportPort = fileExport ?? native?.fileExport ?? createWebFileExport();
  if (native && !capabilities.nativeAuth) cloud = null;

  const db = createDatabase(dbName);
  await openDatabase(db);

  const goalRepo = new DexieGoalRepository(db, clock);
  const entryRepo = new DexieEntryRepository(db, clock);
  const kvRepo = new DexieKvRepository(db);
  const timerRepo = new DexieTimerRepository(db);
  const prefsRepo = new DexieSyncedPrefsRepository(db);
  const localData = new DexieLocalDataRepository(db);
  const syncStore = new DexieSyncStore(db, clock);

  const localeService = new LocaleService(kvRepo, prefsRepo, clock);
  const translator = createTranslator(i18n);
  const entryService = new EntryService(entryRepo, goalRepo);
  const settingsService = new SettingsService(kvRepo, prefsRepo, clock);

  // Cloud off → stub; nothing here references the SDK (ADR-18). Cloud on → lazy loader, SDK untouched until needed.
  const authLoader = cloud ? (loadAuth ?? createSupabaseLoader(cloud, authStorage ?? undefined)) : null;
  // v5.0 (M14): the sync service is built after the auth service; `deleteAccount` reaches it through this thunk.
  let syncForDeletion: SyncService | null = null;
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
        // M14 (ADR-36): the native sheets, when the runtime has them (web: undefined → PKCE redirect as before).
        ...(native?.idTokens ? { idTokens: native.idTokens } : {}),
        loadAccountDeletion: loadAccountDeletion ?? createAccountDeletionLoader(authLoader!),
        sync: () => syncForDeletion,
      })
    : AuthService.unavailable();

  const syncService = cloud
    ? new SyncService({
        local: syncStore,
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

  syncForDeletion = syncService;

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
    reminderService: new ReminderService(settingsService, goalRepo, entryRepo, notificationPort, translator, notificationIconUrl),
    backupService: new BackupService(new DexieBackupRepository(db, clock), settingsService, () => authService.currentUserId() !== null),
    statsService: new StatsService(goalRepo, entryRepo),
    authService,
    syncService,
    loginPromptService: new LoginPromptService(kvRepo, goalRepo, entryRepo),
    connectivity,
    notifications: notificationPort,
    locale: {
      current: () => currentLocale(i18n),
      async change(locale) {
        setLocale(i18n, locale);
        await localeService.set(locale);
      },
    },
    // No `persist()` story on native (DESIGN 7.8.1 row 12): the data lives inside the app container.
    storagePersistence: native ? Promise.resolve<PersistState>('unsupported') : requestPersistentStorage(storage),
    updates: createUpdateStore(),
    purgeTombstones: (now) => syncStore.purgeTombstones(now),
    capabilities,
    fileExport: exportPort,
    readTextFile,
    native,
    dispose() {
      stopLocaleWatch();
      syncService?.stop();
    },
  };
}
