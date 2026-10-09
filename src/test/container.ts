import type { i18n } from 'i18next';
import { createContainer, type AppContainer } from '../app/container';
import type { NotificationPermissionState } from '../domain/reminder';
import { createI18n } from '../i18n/instance';
import type { Locale } from '../i18n/types';
import type { PersistState } from '../integration/storage';
import { fakeNotifications, type FakeNotifications } from './notifications';

export interface TestContainer {
  container: AppContainer;
  i18n: i18n;
  notifications: FakeNotifications;
  dispose(): Promise<void>;
}

let n = 0;

/** A real container on a fresh fake-indexeddb database, strict i18n, fake notifications. */
export async function createTestContainer(options: { locale?: Locale; persist?: PersistState; permission?: NotificationPermissionState } = {}): Promise<TestContainer> {
  const i18n = createI18n({ locale: options.locale ?? 'en', strictMissingKeys: true });
  const persistResult = options.persist ?? 'persisted';
  const storage = persistResult === 'unsupported' ? undefined : { persist: async () => persistResult === 'persisted' };
  const notifications = fakeNotifications(options.permission ?? 'default');
  const container = await createContainer({
    i18n,
    dbName: `test-app-${Date.now()}-${++n}-${Math.random().toString(36).slice(2)}`,
    storage,
    indexedDbAvailable: true,
    notifications,
    notificationIconUrl: '/icons/pwa-192.png',
  });
  return {
    container,
    i18n,
    notifications,
    async dispose() {
      await container.db.delete();
    },
  };
}
