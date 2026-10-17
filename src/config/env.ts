// Runtime configuration (ARCHITECTURE §7). Plain TypeScript checks (v3.1, ADR-27): zod must not be
// on the cold-load path, and the rules here are only "non-empty slug" and "integer in a range".
const DEFAULT_DB_NAME = 'one-percent-better';
const DEFAULT_REMINDER_INTERVAL_MS = 60_000;
const DEFAULT_SYNC_INTERVAL_MS = 300_000;

/** Trimmed `[A-Za-z0-9_-]{1,100}`; anything else → the default. */
function parseDbName(raw: unknown): string {
  if (typeof raw !== 'string') return DEFAULT_DB_NAME;
  const text = raw.trim();
  return text.length >= 1 && text.length <= 100 && /^[A-Za-z0-9_-]+$/.test(text) ? text : DEFAULT_DB_NAME;
}

/** Coerce like `Number(raw)` (strings from `.env`), then require an integer in `[min, max]`; else the fallback. */
function parseIntInRange(raw: unknown, min: number, max: number, fallback: number): number {
  if (raw === undefined || raw === null || typeof raw === 'object' || typeof raw === 'symbol' || typeof raw === 'function') return fallback;
  const n = typeof raw === 'number' ? raw : Number(raw);
  return Number.isInteger(n) && n >= min && n <= max ? n : fallback;
}

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
  return {
    dbName: parseDbName(raw.VITE_DB_NAME),
    reminderCheckIntervalMs: parseIntInRange(raw.VITE_REMINDER_CHECK_INTERVAL_MS, 1000, 3_600_000, DEFAULT_REMINDER_INTERVAL_MS),
    syncIntervalMs: parseIntInRange(raw.VITE_SYNC_INTERVAL_MS, 60_000, 3_600_000, DEFAULT_SYNC_INTERVAL_MS),
    cloud: parseCloud(raw),
  };
}

export const env: AppEnv = parseEnv(import.meta.env as unknown as Record<string, unknown>);
