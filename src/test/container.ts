import type { i18n } from 'i18next';
import { createContainer, type AppContainer } from '../app/container';
import type { CloudConfig } from '../config/env';
import type { NotificationPermissionState } from '../domain/reminder';
import { createI18n } from '../i18n/instance';
import type { Locale } from '../i18n/types';
import type { PersistState } from '../integration/storage';
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
  dispose(): Promise<void>;
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
  const container = await createContainer({
    i18n,
    dbName: `test-app-${Date.now()}-${++n}-${Math.random().toString(36).slice(2)}`,
    storage,
    indexedDbAvailable: true,
    notifications,
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
  });
  if (loader) {
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
