import { describe, expect, it } from 'vitest';
import { AUTH_STORAGE_KEY, clearStoredSession, hasStoredSession } from './loader';

function memoryStorage(init: Record<string, string> = {}) {
  const data = new Map(Object.entries(init));
  return {
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, v),
    removeItem: (k: string) => void data.delete(k),
    key: (i: number) => [...data.keys()][i] ?? null,
    get length() {
      return data.size;
    },
    data,
  };
}

describe('hasStoredSession (ADR-18): answers from localStorage without the SDK', () => {
  it('false when absent, malformed or missing tokens', () => {
    expect(hasStoredSession(memoryStorage())).toBe(false);
    expect(hasStoredSession(memoryStorage({ [AUTH_STORAGE_KEY]: 'not json' }))).toBe(false);
    expect(hasStoredSession(memoryStorage({ [AUTH_STORAGE_KEY]: JSON.stringify({ access_token: 'a' }) }))).toBe(false);
    expect(hasStoredSession(null)).toBe(false);
    expect(hasStoredSession({ getItem: () => { throw new Error('blocked'); }, removeItem: () => {}, key: () => null, length: 0 })).toBe(false);
  });

  it('true for a session with access and refresh tokens', () => {
    expect(hasStoredSession(memoryStorage({ [AUTH_STORAGE_KEY]: JSON.stringify({ access_token: 'a', refresh_token: 'r', expires_at: 1 }) }))).toBe(true);
  });

  it('clearStoredSession removes the session and PKCE verifier keys only', () => {
    const s = memoryStorage({ [AUTH_STORAGE_KEY]: '{}', [`${AUTH_STORAGE_KEY}-code-verifier`]: 'v', [`${AUTH_STORAGE_KEY}-flows-code-verifier`]: '[]', other: 'keep' });
    clearStoredSession(s);
    expect([...s.data.keys()]).toEqual(['other']);
  });
});
