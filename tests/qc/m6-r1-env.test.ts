// QC M6 round 1: independent oracle for cloud-config parsing (M6-AC2 / FR-38) with hostile inputs beyond the dev tests.
import { describe, expect, it } from 'vitest';
import { parseEnv } from '../../src/config/env';

const cloud = (raw: Record<string, unknown>) => parseEnv(raw).cloud;

describe('QC M6-AC2 cloud config', () => {
  it('AC examples', () => {
    expect(cloud({})).toBeNull();
    expect(cloud({ VITE_SUPABASE_URL: 'https://abc.supabase.co', VITE_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_x' })).toEqual({ url: 'https://abc.supabase.co', key: 'sb_publishable_x' });
    expect(cloud({ VITE_SUPABASE_URL: 'https://abc.supabase.co', VITE_SUPABASE_ANON_KEY: 'eyJx' })).toEqual({ url: 'https://abc.supabase.co', key: 'eyJx' });
    expect(cloud({ VITE_SUPABASE_URL: 'https://abc.supabase.co', VITE_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_x', VITE_SUPABASE_ANON_KEY: 'eyJx' })?.key).toBe('sb_publishable_x');
    for (const bad of ['http://abc.supabase.co', 'javascript:alert(1)', 'abc']) expect(cloud({ VITE_SUPABASE_URL: bad, VITE_SUPABASE_PUBLISHABLE_KEY: 'k' })).toBeNull();
    expect(cloud({ VITE_SUPABASE_URL: 'http://127.0.0.1:54321', VITE_SUPABASE_PUBLISHABLE_KEY: 'k' })).toEqual({ url: 'http://127.0.0.1:54321', key: 'k' });
    expect(cloud({ VITE_SUPABASE_URL: 'http://localhost:54321', VITE_SUPABASE_PUBLISHABLE_KEY: 'k' })).toEqual({ url: 'http://localhost:54321', key: 'k' });
    expect(cloud({ VITE_SUPABASE_URL: 'https://abc.supabase.co' })).toBeNull();
    expect(parseEnv({}).syncIntervalMs).toBe(300000);
    expect(parseEnv({ VITE_SYNC_INTERVAL_MS: '59999' }).syncIntervalMs).toBe(300000);
    expect(parseEnv({ VITE_SYNC_INTERVAL_MS: 'abc' }).syncIntervalMs).toBe(300000);
    expect(parseEnv({ VITE_SYNC_INTERVAL_MS: '60000' }).syncIntervalMs).toBe(60000);
  });

  it('hostile / odd URLs are rejected', () => {
    const bad = [
      'https://user:pw@abc.supabase.co',
      'https://abc.supabase.co/rest/v1',
      'https://abc.supabase.co?x=1',
      'https://abc.supabase.co#frag',
      'http://evil.example.com',
      'http://localhost.evil.com',
      'http://127.0.0.1.evil.com',
      'http://[::1]:54321',
      'ws://localhost:54321',
      'file:///etc/passwd',
      'data:text/html,hi',
      '   ',
      '',
      'https://',
      42,
      null,
      undefined,
      {},
    ];
    for (const u of bad) expect(cloud({ VITE_SUPABASE_URL: u, VITE_SUPABASE_PUBLISHABLE_KEY: 'k' }), String(u)).toBeNull();
  });

  it('trailing slash is normalised, whitespace trimmed, keys with whitespace/control chars/oversize rejected', () => {
    expect(cloud({ VITE_SUPABASE_URL: ' https://abc.supabase.co/ ', VITE_SUPABASE_PUBLISHABLE_KEY: ' k1 ' })).toEqual({ url: 'https://abc.supabase.co', key: 'k1' });
    for (const k of ['a b', 'a\nb', 'é', '', '   ', 'x'.repeat(2001), 5, null]) expect(cloud({ VITE_SUPABASE_URL: 'https://abc.supabase.co', VITE_SUPABASE_PUBLISHABLE_KEY: k }), String(k)).toBeNull();
  });

  it('an invalid publishable key falls back to a valid anon key', () => {
    expect(cloud({ VITE_SUPABASE_URL: 'https://abc.supabase.co', VITE_SUPABASE_PUBLISHABLE_KEY: 'bad key', VITE_SUPABASE_ANON_KEY: 'eyJok' })?.key).toBe('eyJok');
  });

  it('sync interval bounds', () => {
    expect(parseEnv({ VITE_SYNC_INTERVAL_MS: '3600000' }).syncIntervalMs).toBe(3600000);
    expect(parseEnv({ VITE_SYNC_INTERVAL_MS: '3600001' }).syncIntervalMs).toBe(300000);
    expect(parseEnv({ VITE_SYNC_INTERVAL_MS: '60000.5' }).syncIntervalMs).toBe(300000);
    expect(parseEnv({ VITE_SYNC_INTERVAL_MS: '-1' }).syncIntervalMs).toBe(300000);
    expect(parseEnv({ VITE_SYNC_INTERVAL_MS: '' }).syncIntervalMs).toBe(300000);
  });
});
