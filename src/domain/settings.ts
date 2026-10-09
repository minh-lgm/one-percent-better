import { isValidReminderTime } from './reminder';
import { DEFAULT_SETTINGS, type Settings } from './types';

/** Normalise whatever is stored under kv `settings` (or found in a backup) into a complete, valid `Settings`. */
export function normalizeSettings(raw: unknown): Settings {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Partial<Record<keyof Settings, unknown>>;
  return {
    reminderEnabled: r.reminderEnabled === true,
    reminderTime: isValidReminderTime(r.reminderTime) ? r.reminderTime : DEFAULT_SETTINGS.reminderTime,
    lastReminderDate: typeof r.lastReminderDate === 'string' ? r.lastReminderDate : null,
    lastBackupAt: typeof r.lastBackupAt === 'string' ? r.lastBackupAt : null,
    plusOneShown: r.plusOneShown && typeof r.plusOneShown === 'object' ? (r.plusOneShown as Record<string, string>) : {},
  };
}
