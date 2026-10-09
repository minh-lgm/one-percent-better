import { z } from 'zod';

const DEFAULT_DB_NAME = 'one-percent-better';
const DEFAULT_REMINDER_INTERVAL_MS = 60_000;

const envSchema = z.object({
  VITE_DB_NAME: z
    .string()
    .trim()
    .min(1)
    .max(100)
    .regex(/^[A-Za-z0-9_-]+$/)
    .catch(DEFAULT_DB_NAME),
  VITE_REMINDER_CHECK_INTERVAL_MS: z.coerce
    .number()
    .int()
    .min(1000)
    .max(3_600_000)
    .catch(DEFAULT_REMINDER_INTERVAL_MS),
});

export interface AppEnv {
  dbName: string;
  reminderCheckIntervalMs: number;
}

/**
 * Parse raw environment values. Invalid or missing values fall back to defaults
 * so the app always starts (ARCHITECTURE §7: no variable is required).
 */
export function parseEnv(raw: Record<string, unknown> = {}): AppEnv {
  const parsed = envSchema.parse({
    VITE_DB_NAME: raw.VITE_DB_NAME ?? undefined,
    VITE_REMINDER_CHECK_INTERVAL_MS: raw.VITE_REMINDER_CHECK_INTERVAL_MS ?? undefined,
  });
  return {
    dbName: parsed.VITE_DB_NAME,
    reminderCheckIntervalMs: parsed.VITE_REMINDER_CHECK_INTERVAL_MS,
  };
}

export const env: AppEnv = parseEnv(import.meta.env as unknown as Record<string, unknown>);
