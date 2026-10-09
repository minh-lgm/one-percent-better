import { describe, expect, it, vi } from 'vitest';
import { isIndexedDbAvailable, requestPersistentStorage } from './storage';

describe('requestPersistentStorage', () => {
  it('returns persisted when granted and calls persist once', async () => {
    const persist = vi.fn().mockResolvedValue(true);
    expect(await requestPersistentStorage({ persist })).toBe('persisted');
    expect(persist).toHaveBeenCalledTimes(1);
  });

  it('returns not-persisted when refused', async () => {
    expect(await requestPersistentStorage({ persist: async () => false })).toBe('not-persisted');
  });

  it('returns unsupported when the API is missing or throws', async () => {
    expect(await requestPersistentStorage(undefined)).toBe('unsupported');
    expect(await requestPersistentStorage({})).toBe('unsupported');
    expect(await requestPersistentStorage({ persist: async () => { throw new Error('x'); } })).toBe('unsupported');
  });
});

describe('isIndexedDbAvailable', () => {
  it('detects presence', () => {
    expect(isIndexedDbAvailable({ indexedDB: {} })).toBe(true);
    expect(isIndexedDbAvailable({})).toBe(false);
    expect(isIndexedDbAvailable({ indexedDB: null })).toBe(false);
  });
});
