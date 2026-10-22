// Browser Notification API behind the `NotificationPort` (ARCHITECTURE §5.6).
// Notifications are shown through the service-worker registration (required on
// Android Chrome); `new Notification()` is deliberately not used.
import type { NotificationPermissionState } from '../domain/reminder';
import type { NotificationPort, ReminderNotification } from '../services/notification-port';

/** The subset of `window` we touch (injectable for tests). */
export interface NotificationWindowLike {
  Notification?: {
    permission: string;
    requestPermission(): Promise<string>;
  };
}

export interface RegistrationLike {
  showNotification(title: string, options?: Record<string, unknown>): Promise<void>;
}

export interface BrowserNotificationOptions {
  win?: NotificationWindowLike;
  /** Resolves the active service-worker registration, or `undefined` when there is none (dev server). */
  getRegistration?: () => Promise<RegistrationLike | undefined>;
}

function toState(value: string | undefined): NotificationPermissionState {
  return value === 'granted' || value === 'denied' ? value : 'default';
}

async function defaultGetRegistration(): Promise<RegistrationLike | undefined> {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return undefined;
  try {
    return (await navigator.serviceWorker.getRegistration()) ?? undefined;
  } catch {
    return undefined;
  }
}

export function createBrowserNotifications({
  win = typeof window !== 'undefined' ? (window as unknown as NotificationWindowLike) : {},
  getRegistration = defaultGetRegistration,
}: BrowserNotificationOptions = {}): NotificationPort {
  const api = () => win.Notification;
  return {
    // v5.0 (M15): the browser cannot deliver while the app is closed (NFR-07); scheduling is a native-only feature.
    canSchedule: false,
    schedule: async () => false,
    cancelAll: async () => undefined,
    permission() {
      const n = api();
      return n ? toState(n.permission) : 'unsupported';
    },
    async requestPermission() {
      const n = api();
      if (!n) return 'unsupported';
      try {
        return toState(await n.requestPermission());
      } catch {
        return toState(n.permission);
      }
    },
    async show(notification: ReminderNotification) {
      if (this.permission() !== 'granted') return false;
      const registration = await getRegistration();
      if (!registration) return false;
      try {
        await registration.showNotification(notification.title, {
          body: notification.body,
          lang: notification.lang,
          tag: notification.tag,
          data: { url: notification.url },
          icon: notification.icon,
        });
        return true;
      } catch {
        return false;
      }
    },
  };
}

/**
 * A runtime with neither the browser API nor the local-notifications plugin (the native build in a browser, or a
 * native platform without the adapter): the Reminders card shows "Not supported" and the in-app banner still works
 * (DESIGN 7.8.1 row 6). From M15 the real iOS runtime uses src/integration/native/local-notifications.ts instead.
 */
export function unsupportedNotifications(): NotificationPort {
  return {
    permission: () => 'unsupported',
    requestPermission: async () => 'unsupported',
    show: async () => false,
    canSchedule: false,
    schedule: async () => false,
    cancelAll: async () => undefined,
  };
}
