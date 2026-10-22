// Port for notifications (implemented in src/integration/notifications.ts for the browser and in
// src/integration/native/local-notifications.ts for the iOS app, faked in tests). Services depend on this
// interface only (ARCHITECTURE §3, §5.6).
import type { NotificationPermissionState } from '../domain/reminder';

export interface ReminderNotification {
  title: string;
  body: string;
  /** BCP 47 language of the text (`en` / `vi`). */
  lang: string;
  /** Replaces an earlier notification with the same tag. */
  tag: string;
  /** Hash route to open on click (`#/today`). */
  url: string;
  icon?: string;
}

/** v5.0 (M15, ARCH §5.6 v5.0): one notification the OS delivers at `at`, app closed or not. */
export interface ScheduledReminder {
  /** `REMINDER_NOTIFICATION_ID_BASE + dayIndex` (1000 … 1013). */
  id: number;
  /** Local wall-clock time of the day being reminded. */
  at: Date;
  title: string;
  body: string;
  url: '#/today';
}

export interface NotificationPort {
  permission(): NotificationPermissionState;
  requestPermission(): Promise<NotificationPermissionState>;
  /** Resolves `true` when the notification was handed to the browser, `false` when it could not be shown. Not used on native. */
  show(notification: ReminderNotification): Promise<boolean>;
  /** v5.0: `true` = the OS delivers scheduled notifications while the app is closed (native); web adapters: `false`. */
  readonly canSchedule: boolean;
  /** v5.0: replace the app's whole pending reminder schedule with `items` (an empty list clears it). `false` on failure. */
  schedule(items: ScheduledReminder[]): Promise<boolean>;
  /** v5.0: cancel every pending reminder of the app. */
  cancelAll(): Promise<void>;
  /**
   * v5.0 (native): `permission()` is synchronous but the plugin answers asynchronously; the adapter caches the state
   * and this refreshes the cache (called before planning and when the app comes back from the iOS Settings).
   */
  refreshPermission?(): Promise<NotificationPermissionState>;
}
