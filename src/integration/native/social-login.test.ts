// M14-AC2: the native sign-in adapter (ARCH §5.9 v5.0, ADR-36) with `@capgo/capacitor-social-login` mocked.
// Nonce: raw = 32 random bytes as 64 hex chars (to Supabase), digest = SHA-256 hex of the raw (to the plugin).
import { createHash } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@capgo/capacitor-social-login', () => ({
  SocialLogin: { initialize: vi.fn(async () => {}), login: vi.fn(), logout: vi.fn(async () => {}) },
}));

import { SocialLogin } from '@capgo/capacitor-social-login';
import { createNonce, createSocialLogin, isUserCancelled, toIdTokenResult, USER_CANCELLED_CODE } from './social-login';

const WEB_ID = '1234-web.apps.googleusercontent.com';
const IOS_ID = '1234-ios.apps.googleusercontent.com';
const sha256hex = (s: string) => createHash('sha256').update(s).digest('hex');

const plugin = SocialLogin as unknown as { initialize: ReturnType<typeof vi.fn>; login: ReturnType<typeof vi.fn>; logout: ReturnType<typeof vi.fn> };

function ios(overrides: Partial<Parameters<typeof createSocialLogin>[0]> = {}) {
  return createSocialLogin({ platform: 'ios', googleWebClientId: WEB_ID, googleIosClientId: IOS_ID, ...overrides });
}

function googleResponse(idToken: string | null = 'google.jwt', names: { givenName?: string | null; familyName?: string | null } = {}) {
  return { provider: 'google', result: { accessToken: null, idToken, responseType: 'online', profile: { email: 'a@b.c', familyName: null, givenName: null, id: '1', name: null, imageUrl: null, ...names } } };
}

function appleResponse(extra: Record<string, unknown> = {}) {
  return { provider: 'apple', result: { accessToken: null, idToken: 'apple.jwt', profile: { user: 'sub', email: 'a@privaterelay.appleid.com', givenName: 'Given', familyName: 'Family' }, authorizationCode: 'c0de', ...extra } };
}

afterEach(() => {
  vi.clearAllMocks();
});

describe('createNonce', () => {
  it('raw = 64 hex chars, digest = SHA-256(raw) hex, fresh every time', async () => {
    const a = await createNonce();
    const b = await createNonce();
    expect(a.raw).toMatch(/^[0-9a-f]{64}$/);
    expect(a.digest).toBe(sha256hex(a.raw));
    expect(b.raw).not.toBe(a.raw);
  });
});

describe('available()', () => {
  it('iOS with both client IDs: google and apple', () => {
    const p = ios();
    expect(p.available('google')).toBe(true);
    expect(p.available('apple')).toBe(true);
  });
  it('a missing client ID disables Google; Apple stays available on iOS', () => {
    for (const p of [ios({ googleWebClientId: null }), ios({ googleIosClientId: null }), ios({ googleWebClientId: null, googleIosClientId: null })]) {
      expect(p.available('google')).toBe(false);
      expect(p.available('apple')).toBe(true);
    }
  });
  it('android: Google only (Apple is iOS-only, OQ-15 / ADR-37)', () => {
    const p = createSocialLogin({ platform: 'android', googleWebClientId: WEB_ID, googleIosClientId: IOS_ID });
    expect(p.available('google')).toBe(true);
    expect(p.available('apple')).toBe(false);
    expect(createSocialLogin({ platform: 'android', googleWebClientId: null, googleIosClientId: IOS_ID }).available('google')).toBe(false);
  });
});

describe('getIdToken', () => {
  it('initialize exactly once across three calls, with google { webClientId, iOSClientId, mode online } and apple without clientId, useProperTokenExchange', async () => {
    plugin.login.mockResolvedValue(googleResponse());
    const p = ios();
    await p.getIdToken('google');
    await p.getIdToken('google');
    await p.getIdToken('apple');
    expect(plugin.initialize).toHaveBeenCalledTimes(1);
    const options = plugin.initialize.mock.calls[0][0] as { google: Record<string, unknown>; apple: Record<string, unknown> };
    expect(options.google).toMatchObject({ webClientId: WEB_ID, iOSClientId: IOS_ID, mode: 'online' });
    expect(options.google.iOSServerClientId).toBe(WEB_ID);
    expect(options.apple).toEqual({ useProperTokenExchange: true });
    expect(options.apple).not.toHaveProperty('clientId');
    expect(plugin.login).toHaveBeenCalledTimes(3);
  });

  it('each call sends a NEW SHA-256 digest to the plugin and returns the matching raw nonce (64 hex)', async () => {
    plugin.login.mockResolvedValue(googleResponse());
    const p = ios();
    const raws = new Set<string>();
    for (let i = 0; i < 3; i += 1) {
      const r = await p.getIdToken('google');
      expect(r.kind).toBe('ok');
      if (r.kind !== 'ok') return;
      expect(r.rawNonce).toMatch(/^[0-9a-f]{64}$/);
      raws.add(r.rawNonce);
      const call = plugin.login.mock.calls[i][0] as { provider: string; options: { nonce: string } };
      expect(call.provider).toBe('google');
      expect(call.options.nonce).toBe(sha256hex(r.rawNonce));
      expect(call.options.nonce).not.toBe(r.rawNonce);
    }
    expect(raws.size).toBe(3);
  });

  it('google: returns idToken (+ names when present); Apple: idToken, authorizationCode, givenName, familyName and asks for name + email', async () => {
    plugin.login.mockResolvedValueOnce(googleResponse('g.jwt', { givenName: 'Minh', familyName: null })).mockResolvedValueOnce(appleResponse());
    const p = ios();
    expect(await p.getIdToken('google')).toEqual({ kind: 'ok', idToken: 'g.jwt', rawNonce: expect.any(String), givenName: 'Minh' });
    const apple = await p.getIdToken('apple');
    expect(apple).toEqual({ kind: 'ok', idToken: 'apple.jwt', rawNonce: expect.any(String), authorizationCode: 'c0de', givenName: 'Given', familyName: 'Family' });
    const call = plugin.login.mock.calls[1][0] as { provider: string; options: { scopes: string[]; nonce: string } };
    expect(call.provider).toBe('apple');
    expect(call.options.scopes).toEqual(['name', 'email']);
    expect(call.options.nonce).toMatch(/^[0-9a-f]{64}$/);
  });

  it('Apple second sign-in (no name, no code) → ok without those fields', async () => {
    plugin.login.mockResolvedValueOnce(appleResponse({ authorizationCode: undefined, profile: { user: 'sub', email: null, givenName: null, familyName: null } }));
    expect(await ios().getIdToken('apple')).toEqual({ kind: 'ok', idToken: 'apple.jwt', rawNonce: expect.any(String) });
  });

  it('no idToken in the response → throws (never a session without a token)', async () => {
    plugin.login.mockResolvedValueOnce(googleResponse(null));
    await expect(ios().getIdToken('google')).rejects.toThrow(/no ID token/);
    plugin.login.mockResolvedValueOnce(appleResponse({ idToken: '  ' }));
    await expect(ios().getIdToken('apple')).rejects.toThrow(/no identity token/);
  });

  it('a dismissed sheet (plugin code USER_CANCELLED, or a "cancelled" message) → { kind: cancelled }; other errors rethrow', async () => {
    const cancelled = Object.assign(new Error('The user canceled the sign-in flow.'), { code: USER_CANCELLED_CODE });
    plugin.login.mockRejectedValueOnce(cancelled);
    expect(await ios().getIdToken('apple')).toEqual({ kind: 'cancelled' });
    plugin.login.mockRejectedValueOnce(new Error('Login cancelled'));
    expect(await ios().getIdToken('google')).toEqual({ kind: 'cancelled' });
    plugin.login.mockRejectedValueOnce(new Error('No presenting view controller found'));
    await expect(ios().getIdToken('google')).rejects.toThrow(/presenting/);
    expect(isUserCancelled({ code: 'USER_CANCELLED', message: 'x' })).toBe(true);
    expect(isUserCancelled({ message: 'access_denied' })).toBe(true);
    expect(isUserCancelled(new Error('boom'))).toBe(false);
    expect(isUserCancelled(null)).toBe(false);
  });

  it('a provider that is not available throws before touching the plugin', async () => {
    await expect(ios({ googleWebClientId: null }).getIdToken('google')).rejects.toThrow(/not available/);
    expect(plugin.initialize).not.toHaveBeenCalled();
    expect(plugin.login).not.toHaveBeenCalled();
  });

  it('a failed initialize is retried on the next call (not memoised)', async () => {
    plugin.initialize.mockRejectedValueOnce(new Error('init failed'));
    plugin.login.mockResolvedValue(googleResponse());
    const p = ios();
    await expect(p.getIdToken('google')).rejects.toThrow(/init failed/);
    expect(await p.getIdToken('google')).toMatchObject({ kind: 'ok' });
    expect(plugin.initialize).toHaveBeenCalledTimes(2);
  });

  it('only Google on Android (no apple block at initialize)', async () => {
    plugin.login.mockResolvedValue(googleResponse());
    await createSocialLogin({ platform: 'android', googleWebClientId: WEB_ID, googleIosClientId: IOS_ID }).getIdToken('google');
    expect(plugin.initialize.mock.calls[0][0]).not.toHaveProperty('apple');
  });
});

describe('logout', () => {
  it('calls plugin.logout({ provider }) and never throws', async () => {
    const p = ios();
    await p.logout('apple');
    expect(plugin.logout).toHaveBeenCalledWith({ provider: 'apple' });
    plugin.logout.mockRejectedValueOnce(new Error('Not logged in; Cannot logout'));
    await expect(p.logout('google')).resolves.toBeUndefined();
  });
});

describe('toIdTokenResult', () => {
  it('unknown provider → throws', () => {
    expect(() => toIdTokenResult({ provider: 'facebook', result: {} }, 'raw')).toThrow(/unexpected provider/);
  });
});
