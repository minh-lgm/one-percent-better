import { describe, expect, it } from 'vitest';
import { parseEnv } from './env';

describe('parseEnv', () => {
  it('uses defaults when nothing is set', () => {
    expect(parseEnv({})).toEqual({ dbName: 'one-percent-better', reminderCheckIntervalMs: 60_000 });
  });

  it('reads valid values', () => {
    expect(parseEnv({ VITE_DB_NAME: 'my-db', VITE_REMINDER_CHECK_INTERVAL_MS: '5000' })).toEqual({
      dbName: 'my-db',
      reminderCheckIntervalMs: 5000,
    });
  });

  it('falls back to defaults for invalid values', () => {
    expect(parseEnv({ VITE_DB_NAME: '', VITE_REMINDER_CHECK_INTERVAL_MS: 'abc' })).toEqual({
      dbName: 'one-percent-better',
      reminderCheckIntervalMs: 60_000,
    });
    expect(parseEnv({ VITE_DB_NAME: 'bad name!', VITE_REMINDER_CHECK_INTERVAL_MS: '10' })).toEqual({
      dbName: 'one-percent-better',
      reminderCheckIntervalMs: 60_000,
    });
    expect(parseEnv({ VITE_REMINDER_CHECK_INTERVAL_MS: '99999999' }).reminderCheckIntervalMs).toBe(60_000);
  });
});
