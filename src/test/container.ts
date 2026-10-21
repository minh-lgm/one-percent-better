import type { i18n } from 'i18next';
import { createContainer, type AppContainer } from '../app/container';
import type { CloudConfig } from '../config/env';
import type { NotificationPermissionState } from '../domain/reminder';
import { createI18n } from '../i18n/instance';
import type { Locale } from '../i18n/types';
import type { NativePlatform } from '../integration/platform';
import type { PersistState } from '../integration/storage';
import type { FileExportOutcome, FileExportPort } from '../services/file-export-port';
import { noLocks } from '../services/lock-port';
import { fakeAuthLoader, FakeAuthPort, MemoryReturnTo } from './fake-auth-port';
import { FakeRemoteServer, FakeRemoteStore } from './fake-remote-store';
import { fakeNotifications, type FakeNotifications } from './notifications';

export interface TestAuth {
  port: FakeAuthPort;
  /** `stored` = fake localStorage['opb-auth'] presence; `loads` = loader calls (M6-AC5). */
  state: { stored: boolean; loads: number; cleared: number };
  returnTo: MemoryReturnTo;
  online: { value: boolean };
  /** M7: the fake cloud behind `syncService` (shared between containers when `remoteServer` is passed). */
  server: FakeRemoteServer;
  remote: FakeRemoteStore;
}

export interface TestContainer {
  container: AppContainer;
  i18n: i18n;
  notifications: FakeNotifications;
  /** Present when the container was created with `cloud`. */
  auth: TestAuth | null;
  /** v5.0: the fake export port: the platform's on a `native` container, or the one injected by `exportOutcome`; `null` = real web download. */
  fileExport: FakeFileExport | null;
  /** v5.0: present when the container was created with `native`. */
  native: FakeNativePlatform | null;
  dispose(): Promise<void>;
}

export interface FakeFileExport extends FileExportPort {
  /** What the next `saveText` resolves to (default `'saved'`); set to an Error to reject. */
  next: FileExportOutcome | Error;
  calls: Array<{ fileName: string; content: string; mimeType: string }>;
}

/** In-memory `FileExportPort` (ARCH §5.15) that records every call. */
export function fakeFileExport(next: FileExportOutcome = 'saved'): FakeFileExport {
  const fake: FakeFileExport = {
    next,
    calls: [],
    async saveText(fileName, content, mimeType) {
      fake.calls.push({ fileName, content, mimeType });
      if (fake.next instanceof Error) throw fake.next;
      return fake.next;
    },
  };
  return fake;
}

export interface FakeNativePlatform extends NativePlatform {
  fileExport: FakeFileExport;
  /** Fires the `resume` listeners (the Capacitor `resume` event). */
  resume(): void;
  resumeListeners(): number;
}

/** A fake Capacitor runtime (ARCH §5.12): `fileExport` records calls, `lifecycle.onResume` can be fired by the test. */
export function fakeNativePlatform(platform: 'ios' | 'android' = 'ios', exportOutcome: FileExportOutcome = 'shared'): FakeNativePlatform {
  const listeners = new Set<() => void>();
  return {
    platform,
    fileExport: fakeFileExport(exportOutcome),
    lifecycle: {
      onResume(cb) {
        listeners.add(cb);
        return () => {
          listeners.delete(cb);
        };
      },
    },
    resume: () => listeners.forEach((l) => l()),
    resumeListeners: () => listeners.size,
  };
}

export const TEST_CLOUD: CloudConfig = { url: 'http://127.0.0.1:54321', key: 'sb_publishable_mock' };
export const TEST_REDIRECT_URL = 'http://localhost:4174/one-percent-better/?auth=callback';

let n = 0;

/** A real container on a fresh fake-indexeddb database, strict i18n, fake notifications. */
export async function createTestContainer(
  options: {
    locale?: Locale;
    persist?: PersistState;
    permission?: NotificationPermissionState;
    /** `true` = cloud on with a FakeAuthPort; omitted/false = phase-1 container (`authService` unavailable). */
    cloud?: boolean;
    authPort?: FakeAuthPort;
    /** Simulate a persisted SDK session (`localStorage['opb-auth']`). */
    authStored?: boolean;
    online?: boolean;
    /** M7: share a fake cloud between containers (two devices). */
    remoteServer?: FakeRemoteServer;
    /** M7: which user the fake RemoteStore writes as (defaults to USER1). */
    remoteUserId?: string;
    clock?: () => Date;
    /** v5.0: run as the native app (`'ios'` | `'android'`, or a prepared fake); the share sheet resolves `exportOutcome` (default `'shared'`). */
    native?: 'ios' | 'android' | FakeNativePlatform;
    /** v5.0: inject a fake `FileExportPort` resolving this value (web containers use the real download otherwise). */
    exportOutcome?: FileExportOutcome;
    /** v5.0: `__OPB_NATIVE__` of the build (defaults: true with `native`, false otherwise). */
    nativeBuild?: boolean;
  } = {},
): Promise<TestContainer> {
  const i18n = createI18n({ locale: options.locale ?? 'en', strictMissingKeys: true });
  const persistResult = options.persist ?? 'persisted';
  const storage = persistResult === 'unsupported' ? undefined : { persist: async () => persistResult === 'persisted' };
  const notifications = fakeNotifications(options.permission ?? 'default');
  const online = { value: options.online ?? true };
  const listeners = new Set<() => void>();
  const connectivity = {
    isOnline: () => online.value,
    subscribe(l: () => void) {
      listeners.add(l);
      return () => {
        listeners.delete(l);
      };
    },
    notify: () => listeners.forEach((l) => l()),
  };
  const loader = options.cloud ? fakeAuthLoader(options.authPort ?? new FakeAuthPort(), { stored: options.authStored }) : null;
  const returnTo = new MemoryReturnTo();
  const server = options.remoteServer ?? new FakeRemoteServer();
  const remote = new FakeRemoteStore(server, options.remoteUserId ?? '00000000-0000-4000-8000-000000000001');
  const native = options.native ? (typeof options.native === 'string' ? fakeNativePlatform(options.native, options.exportOutcome ?? 'shared') : options.native) : null;
  const fileExport = native ? native.fileExport : options.exportOutcome ? fakeFileExport(options.exportOutcome) : null;
  const container = await createContainer({
    i18n,
    dbName: `test-app-${Date.now()}-${++n}-${Math.random().toString(36).slice(2)}`,
    storage,
    indexedDbAvailable: true,
    // A native container gets the real "unsupported" port (M12 … M14) unless the test asks for a permission state.
    notifications: native && options.permission === undefined ? undefined : notifications,
    notificationIconUrl: '/icons/pwa-192.png',
    cloud: options.cloud ? TEST_CLOUD : null,
    authStorage: null,
    loadAuth: loader?.loadAuth,
    loadRemote: async () => remote,
    locks: noLocks,
    connectivity,
    returnTo,
    redirectUrl: TEST_REDIRECT_URL,
    clock: options.clock,
    native,
    nativeBuild: options.nativeBuild,
    baseUrl: '/',
    fileExport: fileExport ?? undefined,
  });
  // v5.0: on a native container the cloud is ignored (M12 … M13) and `authService` is the `unavailable` stub.
  if (loader && container.authService.isAvailable()) {
    // The real container reads localStorage; the test container uses the fake loader's flag instead.
    const svc = container.authService as unknown as { deps: { storedSession: () => boolean; clearStoredSession?: () => void } };
    svc.deps.storedSession = loader.storedSession;
    svc.deps.clearStoredSession = loader.clearStoredSession;
  }
  return {
    container,
    i18n,
    notifications,
    auth: loader ? { port: loader.port, state: loader.state, returnTo, online, server, remote } : null,
    fileExport,
    native,
    async dispose() {
      container.dispose();
      await container.db.delete();
    },
  };
}

/** Flip the fake network state and notify `useOnline` subscribers. */
export function setTestOnline(tc: TestContainer, value: boolean): void {
  if (!tc.auth) throw new Error('setTestOnline needs a cloud container');
  tc.auth.online.value = value;
  (tc.container.connectivity as unknown as { notify?: () => void }).notify?.();
}
