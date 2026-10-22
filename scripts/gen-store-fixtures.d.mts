// Types for scripts/gen-store-fixtures.mjs (used by src/test/store-fixtures.test.ts and store/screenshots.spec.ts).
export const DEMO_TODAY: '2026-10-09';
export const DEMO_EXPORTED_AT: string;
export const DEMO_LAST_BACKUP_AT: string;
export const DEMO_GOALS: ReadonlyArray<{ id: string; name: { en: string; vi: string }; why: { en: string; vi: string }; targetMinutes: number; startDate: string; endDate: string | null }>;
export function demoMinutes(goalId: string, date: string): number | null;
export function buildDemoBackup(locale: 'en' | 'vi'): {
  app: 'one-percent-better';
  schemaVersion: 1;
  exportedAt: string;
  goals: Array<{ id: string; name: string; why: string; targetType: 'daily'; targetMinutes: number; startDate: string; endDate: string | null; archived: boolean; createdAt: string; updatedAt: string }>;
  entries: Array<{ id: string; goalId: string; date: string; minutes: number; note: string; source: 'manual'; createdAt: string; updatedAt: string }>;
  settings: { reminderEnabled: boolean; reminderTime: string; lastReminderDate: null; lastBackupAt: string; plusOneShown: Record<string, never> };
};
