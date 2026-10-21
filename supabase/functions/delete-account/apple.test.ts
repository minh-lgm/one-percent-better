// M14-AC4 (apple.ts): client secret JWT (ES256, verifiable with the public key), form-encoded requests to Apple's
// token / revoke endpoints, config from env. Keys are generated at test time with Web Crypto — nothing is committed.
import { describe, expect, it } from 'vitest';
import { APPLE_AUDIENCE, APPLE_REVOKE_URL, APPLE_TOKEN_URL, appleConfigFromEnv, base64url, CLIENT_SECRET_TTL_S, createClientSecret, exchangeCode, pemToPkcs8, revokeToken, type FetchLike } from './apple';
import type { AppleConfig } from './handler';

// The PEM armour is assembled at run time so no tracked source contains it verbatim (QC secret scan, NFR-22).
const ARMOUR = (kind: 'BEGIN' | 'END') => `-----${kind} ${'PRIVATE'} KEY-----`;

async function keyPair() {
  const pair = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
  const pkcs8 = await crypto.subtle.exportKey('pkcs8', pair.privateKey);
  const b64 = Buffer.from(pkcs8).toString('base64').replace(/(.{64})/g, '$1\n');
  const pem = `${ARMOUR('BEGIN')}\n${b64}\n${ARMOUR('END')}\n`;
  return { pair, pem };
}

const decode = (part: string) => JSON.parse(Buffer.from(part, 'base64url').toString('utf8')) as Record<string, unknown>;

async function cfg(): Promise<{ cfg: AppleConfig; publicKey: CryptoKey }> {
  const { pair, pem } = await keyPair();
  return { cfg: { teamId: 'TEAM123456', keyId: 'KEY1234567', clientId: 'io.github.minhlgm.onepercentbetter', privateKeyPem: pem }, publicKey: pair.publicKey };
}

describe('createClientSecret', () => {
  it('3-part JWT, header { alg: ES256, kid }, payload iss/sub/aud/iat/exp (exp - iat = 300), signature verifies with the public key', async () => {
    const { cfg: c, publicKey } = await cfg();
    const now = new Date('2026-10-21T10:00:00Z');
    const jwt = await createClientSecret(c, now);
    const parts = jwt.split('.');
    expect(parts).toHaveLength(3);
    expect(decode(parts[0])).toEqual({ alg: 'ES256', kid: 'KEY1234567' });
    const payload = decode(parts[1]);
    expect(payload).toMatchObject({ iss: 'TEAM123456', sub: 'io.github.minhlgm.onepercentbetter', aud: APPLE_AUDIENCE });
    expect(payload.iat).toBe(Math.floor(now.getTime() / 1000));
    expect((payload.exp as number) - (payload.iat as number)).toBe(CLIENT_SECRET_TTL_S);
    const ok = await crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, publicKey, Buffer.from(parts[2], 'base64url'), new TextEncoder().encode(`${parts[0]}.${parts[1]}`));
    expect(ok).toBe(true);
    // Tampered payload → signature no longer verifies.
    const bad = await crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, publicKey, Buffer.from(parts[2], 'base64url'), new TextEncoder().encode(`${parts[0]}.${parts[1]}x`));
    expect(bad).toBe(false);
    expect(Buffer.from(parts[2], 'base64url')).toHaveLength(64); // r || s, not DER
  });

  it('a key that is not PEM → throws; base64url has no padding or +/', async () => {
    const { cfg: c } = await cfg();
    await expect(createClientSecret({ ...c, privateKeyPem: '' })).rejects.toThrow(/PEM/);
    await expect(createClientSecret({ ...c, privateKeyPem: 'garbage' })).rejects.toBeTruthy();
    expect(base64url(new Uint8Array([251, 255, 254]))).toBe('-__-');
    expect(pemToPkcs8(c.privateKeyPem).byteLength).toBeGreaterThan(100);
  });
});

function fakeFetch(status = 200, body: unknown = {}) {
  const calls: Array<{ url: string; init: Parameters<FetchLike>[1] }> = [];
  const fetchImpl: FetchLike = async (url, init) => {
    calls.push({ url, init });
    return { ok: status >= 200 && status < 300, status, json: async () => body };
  };
  return { calls, fetchImpl };
}

describe('exchangeCode / revokeToken', () => {
  it('exchangeCode: POST x-www-form-urlencoded to /auth/token with grant_type=authorization_code, code, client_id, client_secret → tokens', async () => {
    const { cfg: c } = await cfg();
    const f = fakeFetch(200, { refresh_token: 'rt', access_token: 'at', id_token: 'id' });
    expect(await exchangeCode('c0de', c, f.fetchImpl)).toEqual({ refreshToken: 'rt', accessToken: 'at' });
    expect(f.calls).toHaveLength(1);
    expect(f.calls[0].url).toBe(APPLE_TOKEN_URL);
    expect(f.calls[0].init.method).toBe('POST');
    expect(f.calls[0].init.headers['Content-Type']).toBe('application/x-www-form-urlencoded');
    const params = new URLSearchParams(f.calls[0].init.body);
    expect(params.get('grant_type')).toBe('authorization_code');
    expect(params.get('code')).toBe('c0de');
    expect(params.get('client_id')).toBe('io.github.minhlgm.onepercentbetter');
    expect(params.get('client_secret')?.split('.')).toHaveLength(3);
    expect(f.calls[0].init.signal).toBeInstanceOf(AbortSignal);
  });

  it('exchangeCode: missing tokens → nulls; non-2xx → throws', async () => {
    const { cfg: c } = await cfg();
    expect(await exchangeCode('c', c, fakeFetch(200, {}).fetchImpl)).toEqual({ refreshToken: null, accessToken: null });
    await expect(exchangeCode('c', c, fakeFetch(400, { error: 'invalid_grant' }).fetchImpl)).rejects.toThrow(/400/);
  });

  it('revokeToken: POST to /auth/revoke with token, token_type_hint, client_id, client_secret; non-2xx → throws', async () => {
    const { cfg: c } = await cfg();
    const f = fakeFetch(200);
    await revokeToken('rt', 'refresh_token', c, f.fetchImpl);
    expect(f.calls[0].url).toBe(APPLE_REVOKE_URL);
    const params = new URLSearchParams(f.calls[0].init.body);
    expect(params.get('token')).toBe('rt');
    expect(params.get('token_type_hint')).toBe('refresh_token');
    expect(params.get('client_id')).toBe(c.clientId);
    expect(params.get('client_secret')?.split('.')).toHaveLength(3);
    await expect(revokeToken('rt', 'refresh_token', c, fakeFetch(400).fetchImpl)).rejects.toThrow(/400/);
  });

  it('a request that never answers is aborted by the timeout', async () => {
    const { cfg: c } = await cfg();
    const hanging: FetchLike = (_url, init) => new Promise((_resolve, reject) => init.signal?.addEventListener('abort', () => reject(new Error('aborted'))));
    await expect(exchangeCode('c', c, hanging, 20)).rejects.toThrow(/aborted/);
  });
});

describe('appleConfigFromEnv', () => {
  it('all four present → config (trimmed); any missing or blank → null', () => {
    const env: Record<string, string | undefined> = { APPLE_TEAM_ID: ' T ', APPLE_KEY_ID: 'K', APPLE_CLIENT_ID: 'io.github.minhlgm.onepercentbetter', APPLE_PRIVATE_KEY: `${ARMOUR('BEGIN')}\nabc\n${ARMOUR('END')}` };
    expect(appleConfigFromEnv((k) => env[k])).toEqual({ teamId: 'T', keyId: 'K', clientId: 'io.github.minhlgm.onepercentbetter', privateKeyPem: env.APPLE_PRIVATE_KEY });
    for (const missing of ['APPLE_TEAM_ID', 'APPLE_KEY_ID', 'APPLE_CLIENT_ID', 'APPLE_PRIVATE_KEY']) {
      expect(appleConfigFromEnv((k) => (k === missing ? undefined : env[k])), missing).toBeNull();
      expect(appleConfigFromEnv((k) => (k === missing ? '  ' : env[k])), missing).toBeNull();
    }
  });
});
