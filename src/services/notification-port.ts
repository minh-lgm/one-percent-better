// Port for the browser Notification API (implemented in src/integration/notifications.ts,
// faked in tests). Services depend on this interface only (ARCHITECTURE §3).
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

export interface NotificationPort {
  permission(): NotificationPermissionState;
  requestPermission(): Promise<NotificationPermissionState>;
  /** Resolves `true` when the notification was handed to the browser, `false` when it could not be shown. */
  show(notification: ReminderNotification): Promise<boolean>;
}
