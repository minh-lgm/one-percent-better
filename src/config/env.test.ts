import { describe, expect, it } from 'vitest';
import { parseCloud, parseCloudUrl, parseEnv } from './env';

describe('parseEnv', () => {
  it('uses defaults when nothing is set', () => {
    expect(parseEnv({})).toEqual({ dbName: 'one-percent-better', reminderCheckIntervalMs: 60_000, syncIntervalMs: 300_000, cloud: null });
  });

  it('reads valid values', () => {
    expect(parseEnv({ VITE_DB_NAME: 'my-db', VITE_REMINDER_CHECK_INTERVAL_MS: '5000' })).toEqual({
      dbName: 'my-db',
      reminderCheckIntervalMs: 5000,
      syncIntervalMs: 300_000,
      cloud: null,
    });
  });

  it('falls back to defaults for invalid values', () => {
    expect(parseEnv({ VITE_DB_NAME: '', VITE_REMINDER_CHECK_INTERVAL_MS: 'abc' })).toMatchObject({
      dbName: 'one-percent-better',
      reminderCheckIntervalMs: 60_000,
    });
    expect(parseEnv({ VITE_DB_NAME: 'bad name!', VITE_REMINDER_CHECK_INTERVAL_MS: '10' })).toMatchObject({
      dbName: 'one-percent-better',
      reminderCheckIntervalMs: 60_000,
    });
    expect(parseEnv({ VITE_REMINDER_CHECK_INTERVAL_MS: '99999999' }).reminderCheckIntervalMs).toBe(60_000);
  });
});

describe('parseEnv — cloud (M6-AC2, FR-38)', () => {
  it('{} → cloud = null', () => {
    expect(parseEnv({}).cloud).toBeNull();
  });

  it('https URL + publishable key → { url, key }', () => {
    expect(parseEnv({ VITE_SUPABASE_URL: 'https://abc.supabase.co', VITE_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_x' }).cloud).toEqual({
      url: 'https://abc.supabase.co',
      key: 'sb_publishable_x',
    });
  });

  it('only the legacy anon key → key = anon key', () => {
    expect(parseEnv({ VITE_SUPABASE_URL: 'https://abc.supabase.co', VITE_SUPABASE_ANON_KEY: 'eyJx' }).cloud).toEqual({ url: 'https://abc.supabase.co', key: 'eyJx' });
  });

  it('both keys → the publishable key wins', () => {
    expect(parseEnv({ VITE_SUPABASE_URL: 'https://abc.supabase.co', VITE_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_x', VITE_SUPABASE_ANON_KEY: 'eyJx' }).cloud).toEqual({
      url: 'https://abc.supabase.co',
      key: 'sb_publishable_x',
    });
  });

  it('rejects http (non-local), javascript: and bare host URLs', () => {
    for (const url of ['http://abc.supabase.co', 'javascript:alert(1)', 'abc', 'ftp://abc.supabase.co', 'https://user:pw@abc.supabase.co', 'https://abc.supabase.co/rest', '']) {
      expect(parseEnv({ VITE_SUPABASE_URL: url, VITE_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_x' }).cloud, url).toBeNull();
    }
  });

  it('accepts http://127.0.0.1:54321 and http://localhost:54321 (mock / Supabase local)', () => {
    expect(parseCloud({ VITE_SUPABASE_URL: 'http://127.0.0.1:54321', VITE_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_mock' })).toEqual({ url: 'http://127.0.0.1:54321', key: 'sb_publishable_mock' });
    expect(parseCloud({ VITE_SUPABASE_URL: 'http://localhost:54321', VITE_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_mock' })).toEqual({ url: 'http://localhost:54321', key: 'sb_publishable_mock' });
    expect(parseCloudUrl('https://abc.supabase.co/')).toBe('https://abc.supabase.co');
  });

  it('valid URL without any key → null; key with whitespace → null', () => {
    expect(parseEnv({ VITE_SUPABASE_URL: 'https://abc.supabase.co' }).cloud).toBeNull();
    expect(parseEnv({ VITE_SUPABASE_URL: 'https://abc.supabase.co', VITE_SUPABASE_PUBLISHABLE_KEY: '' }).cloud).toBeNull();
    expect(parseEnv({ VITE_SUPABASE_URL: 'https://abc.supabase.co', VITE_SUPABASE_PUBLISHABLE_KEY: 'bad key' }).cloud).toBeNull();
  });

  it('VITE_SYNC_INTERVAL_MS: missing → 300000; 59999 or abc → 300000; 60000 → 60000', () => {
    expect(parseEnv({}).syncIntervalMs).toBe(300_000);
    expect(parseEnv({ VITE_SYNC_INTERVAL_MS: '59999' }).syncIntervalMs).toBe(300_000);
    expect(parseEnv({ VITE_SYNC_INTERVAL_MS: 'abc' }).syncIntervalMs).toBe(300_000);
    expect(parseEnv({ VITE_SYNC_INTERVAL_MS: '60000' }).syncIntervalMs).toBe(60_000);
    expect(parseEnv({ VITE_SYNC_INTERVAL_MS: '3600001' }).syncIntervalMs).toBe(300_000);
  });
});
