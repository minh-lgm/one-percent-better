// Sign in with Apple server-side helpers for `delete-account` (ARCHITECTURE §4.7 d, A-62; Apple TN3194).
// Web Crypto only (available in Deno and Node 22) so Vitest can run it. No Deno / npm imports.
import type { AppleConfig, AppleTokens } from './handler';

export const APPLE_TOKEN_URL = 'https://appleid.apple.com/auth/token';
export const APPLE_REVOKE_URL = 'https://appleid.apple.com/auth/revoke';
export const APPLE_AUDIENCE = 'https://appleid.apple.com';
/** Client secret lifetime (Apple allows up to 6 months; 5 minutes is all one request needs). */
export const CLIENT_SECRET_TTL_S = 300;
export const APPLE_REQUEST_TIMEOUT_MS = 10_000;

const encoder = new TextEncoder();

export function base64url(bytes: ArrayBuffer | Uint8Array): string {
  const view = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let binary = '';
  for (const b of view) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64ToBytes(b64: string): Uint8Array<ArrayBuffer> {
  const binary = atob(b64);
  const out = new Uint8Array(new ArrayBuffer(binary.length));
  for (let i = 0; i < binary.length; i += 1) out[i] = binary.charCodeAt(i);
  return out;
}

/** The `.p8` file: PKCS#8 PEM → DER bytes (header/footer/whitespace stripped). */
export function pemToPkcs8(pem: string): Uint8Array<ArrayBuffer> {
  const body = pem
    .replace(/-----BEGIN [A-Z ]*PRIVATE KEY-----/g, '')
    .replace(/-----END [A-Z ]*PRIVATE KEY-----/g, '')
    .replace(/\s+/g, '');
  if (!body) throw new Error('APPLE_PRIVATE_KEY is not a PEM private key');
  return base64ToBytes(body);
}

/**
 * Apple client secret: JWT ES256 signed with the team's Sign in with Apple key.
 * header `{ alg: 'ES256', kid }`, payload `{ iss: teamId, iat, exp: iat + 300, aud: 'https://appleid.apple.com', sub: clientId }`.
 * Web Crypto ECDSA signatures are already `r || s` (IEEE P1363), which is what JWS expects.
 */
export async function createClientSecret(cfg: AppleConfig, now: Date = new Date(), subtle: SubtleCrypto = crypto.subtle): Promise<string> {
  const iat = Math.floor(now.getTime() / 1000);
  const header = base64url(encoder.encode(JSON.stringify({ alg: 'ES256', kid: cfg.keyId })));
  const payload = base64url(encoder.encode(JSON.stringify({ iss: cfg.teamId, iat, exp: iat + CLIENT_SECRET_TTL_S, aud: APPLE_AUDIENCE, sub: cfg.clientId })));
  const signingInput = `${header}.${payload}`;
  const key = await subtle.importKey('pkcs8', pemToPkcs8(cfg.privateKeyPem), { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
  const signature = await subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, encoder.encode(signingInput));
  return `${signingInput}.${base64url(signature)}`;
}

export type FetchLike = (url: string, init: { method: string; headers: Record<string, string>; body: string; signal?: AbortSignal }) => Promise<{ ok: boolean; status: number; json(): Promise<unknown> }>;

async function postForm(url: string, params: Record<string, string>, fetchImpl: FetchLike, timeoutMs: number): Promise<{ ok: boolean; status: number; json(): Promise<unknown> }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetchImpl(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
      body: new URLSearchParams(params).toString(),
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }
}

/** `POST /auth/token` (grant_type=authorization_code) → the refresh/access tokens Apple issued for this authorization. */
export async function exchangeCode(code: string, cfg: AppleConfig, fetchImpl: FetchLike = fetch as unknown as FetchLike, timeoutMs = APPLE_REQUEST_TIMEOUT_MS): Promise<AppleTokens> {
  const client_secret = await createClientSecret(cfg);
  const res = await postForm(APPLE_TOKEN_URL, { client_id: cfg.clientId, client_secret, code, grant_type: 'authorization_code' }, fetchImpl, timeoutMs);
  if (!res.ok) throw new Error(`Apple token endpoint answered ${res.status}`);
  const body = (await res.json()) as { refresh_token?: unknown; access_token?: unknown };
  return {
    refreshToken: typeof body.refresh_token === 'string' && body.refresh_token ? body.refresh_token : null,
    accessToken: typeof body.access_token === 'string' && body.access_token ? body.access_token : null,
  };
}

/** `POST /auth/revoke`: Apple then removes the app from the user's "Sign in with Apple" list (TN3194). */
export async function revokeToken(token: string, hint: 'refresh_token' | 'access_token', cfg: AppleConfig, fetchImpl: FetchLike = fetch as unknown as FetchLike, timeoutMs = APPLE_REQUEST_TIMEOUT_MS): Promise<void> {
  const client_secret = await createClientSecret(cfg);
  const res = await postForm(APPLE_REVOKE_URL, { client_id: cfg.clientId, client_secret, token, token_type_hint: hint }, fetchImpl, timeoutMs);
  if (!res.ok) throw new Error(`Apple revoke endpoint answered ${res.status}`);
}

/** The four function secrets (TASKS U23); any missing/blank one → `null` → the handler answers `manual-required`. */
export function appleConfigFromEnv(get: (key: string) => string | undefined): AppleConfig | null {
  const teamId = get('APPLE_TEAM_ID')?.trim();
  const keyId = get('APPLE_KEY_ID')?.trim();
  const clientId = get('APPLE_CLIENT_ID')?.trim();
  const privateKeyPem = get('APPLE_PRIVATE_KEY')?.trim();
  if (!teamId || !keyId || !clientId || !privateKeyPem) return null;
  return { teamId, keyId, clientId, privateKeyPem };
}
