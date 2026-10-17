import { describe, expect, it } from 'vitest';
import { callbackRedirectUrl, cleanCallbackUrl, readAuthCallback, RETURN_TO_KEY, sanitizeReturnTo, sessionReturnTo, clearPkceVerifier, PKCE_VERIFIER_KEY } from './auth-callback';

describe('readAuthCallback (M6-AC6, ADR-19)', () => {
  it('?auth=callback&code=abc → { code }', () => {
    expect(readAuthCallback({ search: '?auth=callback&code=abc' })).toEqual({ code: 'abc' });
  });

  it('?auth=callback&error=access_denied&error_description=x → { error, description }', () => {
    expect(readAuthCallback({ search: '?auth=callback&error=access_denied&error_description=x' })).toEqual({ error: 'access_denied', description: 'x' });
    expect(readAuthCallback({ search: '?auth=callback&error=server_error' })).toEqual({ error: 'server_error', description: '' });
  });

  it('?code=abc without auth=callback → null; no query → null', () => {
    expect(readAuthCallback({ search: '?code=abc' })).toBeNull();
    expect(readAuthCallback({ search: '' })).toBeNull();
    expect(readAuthCallback({ search: '?auth=other&code=abc' })).toBeNull();
  });

  it('auth=callback without code or error → treated as an error', () => {
    expect(readAuthCallback({ search: '?auth=callback' })).toEqual({ error: 'invalid_callback', description: 'callback without code or error' });
  });
});

describe('cleanCallbackUrl + returnTo', () => {
  function fakeHistory() {
    const calls: string[] = [];
    return { calls, replaceState: (_d: unknown, _u: string, url: string) => calls.push(url) };
  }

  it('saved #/today → <BASE_URL>#/today; nothing saved → <BASE_URL>#/settings', () => {
    const h = fakeHistory();
    expect(cleanCallbackUrl(h, '/one-percent-better/', '#/today')).toBe('/one-percent-better/#/today');
    expect(cleanCallbackUrl(h, '/one-percent-better/', null)).toBe('/one-percent-better/#/settings');
    expect(cleanCallbackUrl(h, '/', null)).toBe('/#/settings');
    expect(h.calls).toEqual(['/one-percent-better/#/today', '/one-percent-better/#/settings', '/#/settings']);
  });

  it('rejects return targets that are not our own hashes', () => {
    expect(sanitizeReturnTo('#/goals/abc?x=1')).toBe('#/goals/abc?x=1');
    expect(sanitizeReturnTo('https://evil.example')).toBeNull();
    expect(sanitizeReturnTo('#//evil')).toBeNull();
    expect(sanitizeReturnTo('/today')).toBeNull();
    expect(sanitizeReturnTo('#/today<script>')).toBeNull();
    const h = fakeHistory();
    expect(cleanCallbackUrl(h, '/', 'https://evil.example')).toBe('/#/settings');
  });

  it('sessionReturnTo stores under opb-auth-return and take() clears it; tolerates a blocked storage', () => {
    const data = new Map<string, string>();
    const storage = { getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => void data.set(k, v), removeItem: (k: string) => void data.delete(k) };
    const store = sessionReturnTo(storage);
    store.save('#/today');
    expect(data.get(RETURN_TO_KEY)).toBe('#/today');
    expect(store.take()).toBe('#/today');
    expect(store.take()).toBeNull();
    expect(data.has(RETURN_TO_KEY)).toBe(false);
    const blocked = sessionReturnTo({ getItem: () => { throw new Error('blocked'); }, setItem: () => { throw new Error('blocked'); }, removeItem: () => {} });
    expect(() => blocked.save('#/today')).not.toThrow();
    expect(blocked.take()).toBeNull();
    expect(sessionReturnTo(null).take()).toBeNull();
  });
});

describe('callbackRedirectUrl', () => {
  it('builds <origin><BASE_URL>?auth=callback without a hash', () => {
    expect(callbackRedirectUrl('https://minh-lgm.github.io', '/one-percent-better/')).toBe('https://minh-lgm.github.io/one-percent-better/?auth=callback');
    expect(callbackRedirectUrl('http://localhost:5173', '/')).toBe('http://localhost:5173/?auth=callback');
    expect(callbackRedirectUrl('http://localhost:4174', '/one-percent-better/')).not.toContain('#');
  });
});

describe('clearPkceVerifier (M10-T3, M6-P1)', () => {
  it('removes exactly opb-auth-code-verifier and nothing else; tolerates a missing or throwing storage', () => {
    const data = new Map<string, string>([
      [PKCE_VERIFIER_KEY, 'verifier/'],
      ['opb-auth', '{"access_token":"a","refresh_token":"r"}'],
      ['opb-auth-return', '#/today'],
      ['other', 'keep'],
    ]);
    clearPkceVerifier({ removeItem: (k) => void data.delete(k) });
    expect([...data.keys()]).toEqual(['opb-auth', 'opb-auth-return', 'other']);
    expect(PKCE_VERIFIER_KEY).toBe('opb-auth-code-verifier');
    expect(() => clearPkceVerifier(null)).not.toThrow();
    expect(() => clearPkceVerifier(undefined)).not.toThrow();
    expect(() =>
      clearPkceVerifier({
        removeItem: () => {
          throw new Error('blocked');
        },
      }),
    ).not.toThrow();
  });
});
