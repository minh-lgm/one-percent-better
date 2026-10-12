import { z } from 'zod';

const DEFAULT_DB_NAME = 'one-percent-better';
const DEFAULT_REMINDER_INTERVAL_MS = 60_000;
const DEFAULT_SYNC_INTERVAL_MS = 300_000;

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
  VITE_SYNC_INTERVAL_MS: z.coerce
    .number()
    .int()
    .min(60_000)
    .max(3_600_000)
    .catch(DEFAULT_SYNC_INTERVAL_MS),
});

/** Cloud (Supabase) configuration. `null` = cloud features are off (FR-38). */
export interface CloudConfig {
  /** Project URL without a trailing slash, e.g. `https://abc.supabase.co`. */
  url: string;
  /** Publishable (or legacy anon) key — public by design, RLS protects the data. */
  key: string;
}

export interface AppEnv {
  dbName: string;
  reminderCheckIntervalMs: number;
  syncIntervalMs: number;
  cloud: CloudConfig | null;
}

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1']);

/**
 * Accepts `https://<host>[:port]` or, for local testing only, `http://localhost[:port]`
 * and `http://127.0.0.1[:port]` (ARCHITECTURE §7). Anything else → `null`.
 */
export function parseCloudUrl(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const text = raw.trim();
  if (!text) return null;
  let url: URL;
  try {
    url = new URL(text);
  } catch {
    return null;
  }
  if (url.username || url.password || url.search || url.hash) return null;
  if (url.pathname !== '/' && url.pathname !== '') return null;
  if (url.protocol === 'https:') return url.origin;
  if (url.protocol === 'http:' && LOCAL_HOSTS.has(url.hostname)) return url.origin;
  return null;
}

function parseKey(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const text = raw.trim();
  // Keys are printable ASCII without whitespace (sb_publishable_… or a JWT).
  if (!text || text.length > 2000 || !/^[\x21-\x7e]+$/.test(text)) return null;
  return text;
}

/** `VITE_SUPABASE_PUBLISHABLE_KEY` wins; `VITE_SUPABASE_ANON_KEY` is the fallback. Missing/invalid parts → `null`. */
export function parseCloud(raw: Record<string, unknown>): CloudConfig | null {
  const url = parseCloudUrl(raw.VITE_SUPABASE_URL);
  if (!url) return null;
  const key = parseKey(raw.VITE_SUPABASE_PUBLISHABLE_KEY) ?? parseKey(raw.VITE_SUPABASE_ANON_KEY);
  if (!key) return null;
  return { url, key };
}

/**
 * Parse raw environment values. Invalid or missing values fall back to defaults
 * so the app always starts (ARCHITECTURE §7: no variable is required).
 */
export function parseEnv(raw: Record<string, unknown> = {}): AppEnv {
  const parsed = envSchema.parse({
    VITE_DB_NAME: raw.VITE_DB_NAME ?? undefined,
    VITE_REMINDER_CHECK_INTERVAL_MS: raw.VITE_REMINDER_CHECK_INTERVAL_MS ?? undefined,
    VITE_SYNC_INTERVAL_MS: raw.VITE_SYNC_INTERVAL_MS ?? undefined,
  });
  return {
    dbName: parsed.VITE_DB_NAME,
    reminderCheckIntervalMs: parsed.VITE_REMINDER_CHECK_INTERVAL_MS,
    syncIntervalMs: parsed.VITE_SYNC_INTERVAL_MS,
    cloud: parseCloud(raw),
  };
}

export const env: AppEnv = parseEnv(import.meta.env as unknown as Record<string, unknown>);
