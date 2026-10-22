// Native `NotificationPort` (TASKS M15-T2; ARCHITECTURE §5.6 v5.0, ADR-40): @capacitor/local-notifications schedules
// one notification per planned day (ids 1000 … 1013) that iOS delivers even when the app is closed; a tap opens
// Today. Permission is asked only by `requestPermission()` (the user turned the reminder on or pressed "Allow
// notifications", A-64). Everything the plugin does is injectable so the unit tests run without a runtime.
import type { PermissionState, PluginListenerHandle } from '@capacitor/core';
import { LocalNotifications, type ActionPerformed, type LocalNotificationSchema } from '@capacitor/local-notifications';
import { REMINDER_NOTIFICATION_ID_BASE, REMINDER_PLAN_DAYS } from '../../config/constants';
import type { NotificationPermissionState } from '../../domain/reminder';
import type { NotificationPort, ScheduledReminder } from '../../services/notification-port';

/** Inclusive id range owned by the reminder plan; other ids (none today) are never touched. */
export const REMINDER_ID_MIN = REMINDER_NOTIFICATION_ID_BASE;
export const REMINDER_ID_MAX = REMINDER_NOTIFICATION_ID_BASE + REMINDER_PLAN_DAYS - 1;

export interface LocalNotificationsDeps {
  checkPermissions: () => Promise<{ display?: PermissionState }>;
  requestPermissions: () => Promise<{ display?: PermissionState }>;
  getPending: () => Promise<{ notifications?: Array<{ id: number }> }>;
  cancel: (ids: number[]) => Promise<void>;
  schedule: (notifications: LocalNotificationSchema[]) => Promise<unknown>;
  addActionListener: (cb: (action: ActionPerformed) => void) => Promise<PluginListenerHandle>;
  /** Where a tapped notification sends the app (`#/today`); defaults to the hash of the current location. */
  navigate: (url: string) => void;
}

export interface NativeNotifications extends NotificationPort {
  /** Start forwarding taps on reminders to `navigate`; returns the stop function. */
  listen(): () => void;
}

/** Plugin → app permission state (ARCH §5.6 v5.0): `prompt` / `prompt-with-rationale` / unknown → `default`. */
export function toPermissionState(display: PermissionState | undefined): NotificationPermissionState {
  return display === 'granted' || display === 'denied' ? display : 'default';
}

export function isReminderId(id: number): boolean {
  return Number.isInteger(id) && id >= REMINDER_ID_MIN && id <= REMINDER_ID_MAX;
}

const defaultDeps = (): LocalNotificationsDeps => ({
  checkPermissions: () => LocalNotifications.checkPermissions(),
  requestPermissions: () => LocalNotifications.requestPermissions(),
  getPending: () => LocalNotifications.getPending(),
  cancel: (ids) => LocalNotifications.cancel({ notifications: ids.map((id) => ({ id })) }),
  schedule: (notifications) => LocalNotifications.schedule({ notifications }),
  addActionListener: (cb) => LocalNotifications.addListener('localNotificationActionPerformed', cb),
  navigate: (url) => {
    if (typeof location !== 'undefined') location.hash = url.startsWith('#') ? url : `#${url}`;
  },
});

export function createLocalNotifications(deps: LocalNotificationsDeps = defaultDeps()): NativeNotifications {
  // The port's `permission()` is synchronous; the plugin is not. The cache starts at `default` and is refreshed by
  // `refreshPermission()` (before every replan, and by Settings when the app comes back to the foreground).
  let cached: NotificationPermissionState = 'default';

  const refresh = async (): Promise<NotificationPermissionState> => {
    try {
      cached = toPermissionState((await deps.checkPermissions()).display);
    } catch {
      // A runtime without the plugin keeps the cached value; nothing is scheduled without `granted`.
    }
    return cached;
  };

  /** Cancel every pending notification of the plan (and only those). */
  const cancelPlanned = async (): Promise<void> => {
    const pending = (await deps.getPending()).notifications ?? [];
    const ids = pending.map((n) => n.id).filter(isReminderId);
    if (ids.length > 0) await deps.cancel(ids);
  };

  return {
    canSchedule: true,
    permission: () => cached,
    refreshPermission: refresh,
    async requestPermission() {
      try {
        cached = toPermissionState((await deps.requestPermissions()).display);
      } catch {
        return refresh();
      }
      return cached;
    },
    // Not used on native: the OS delivers the scheduled notifications (ARCH §5.6 v5.0).
    show: async () => false,
    async schedule(items: ScheduledReminder[]) {
      try {
        await cancelPlanned();
        if (items.length > 0) {
          await deps.schedule(
            items.map((item) => ({
              id: item.id,
              title: item.title,
              body: item.body,
              schedule: { at: item.at, allowWhileIdle: true },
              extra: { url: item.url },
            })),
          );
        }
        return true;
      } catch {
        return false;
      }
    },
    async cancelAll() {
      try {
        await cancelPlanned();
      } catch {
        // Nothing to do: without the plugin there is no schedule to cancel.
      }
    },
    listen() {
      let active = true;
      const handle = deps
        .addActionListener((action) => {
          if (!active) return;
          const url = (action.notification.extra as { url?: unknown } | undefined)?.url;
          deps.navigate(typeof url === 'string' && url.length > 0 ? url : '#/today');
        })
        .catch(() => null);
      return () => {
        active = false;
        void handle.then((h) => h?.remove()).catch(() => undefined);
      };
    },
  };
}
