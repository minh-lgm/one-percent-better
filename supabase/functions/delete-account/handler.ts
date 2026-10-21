// Edge Function `delete-account` — the request handler (ARCHITECTURE §4.7, ADR-39; M14, FR-61, NFR-23).
// Plain TypeScript with every dependency injected (`DeleteAccountDeps`), so it runs under Vitest on Node 22
// (`Request` / `Response` are the standard ones) and under Deno (`index.ts` wires the real dependencies).
// Imports nothing: this file must stay portable between the two runtimes.

export type AppleRevokeResult = 'not-applicable' | 'revoked' | 'manual-required';

export interface AppleConfig {
  teamId: string;
  keyId: string;
  /** The app's bundle id (native Sign in with Apple: the bundle id is the client id). */
  clientId: string;
  /** Contents of the `.p8` file (PKCS#8 PEM). */
  privateKeyPem: string;
}

export interface AppleTokens {
  refreshToken: string | null;
  accessToken: string | null;
}

export interface DeleteAccountDeps {
  /** Origins that get `Access-Control-Allow-Origin`; any other origin gets no CORS header (the browser blocks it). */
  allowedOrigins: string[];
  /** The user behind a JWT, or `null` when the token is invalid / expired / the user no longer exists. */
  getUser(jwt: string): Promise<{ id: string; providers: string[] } | null>;
  /** Hard delete of the auth user; `goals`, `entries`, `settings` go with it through `on delete cascade`. */
  deleteUser(userId: string): Promise<void>;
  /** `null` when any of the four Apple secrets is missing → Apple tokens cannot be revoked here (`manual-required`). */
  apple: AppleConfig | null;
  exchangeAppleCode(code: string, cfg: AppleConfig): Promise<AppleTokens>;
  revokeAppleToken(token: string, hint: 'refresh_token' | 'access_token', cfg: AppleConfig): Promise<void>;
  /** Structured log line; never receives a token, a code or an email. */
  log(event: string): void;
}

export const DEFAULT_ALLOWED_ORIGINS = ['https://minh-lgm.github.io', 'http://localhost:5173', 'http://localhost:4173', 'http://localhost:4174', 'capacitor://localhost', 'https://localhost'];
export const MAX_BODY_BYTES = 4096;

export function corsHeaders(origin: string | null, allowedOrigins: string[]): Record<string, string> {
  const headers: Record<string, string> = {
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
    'Access-Control-Max-Age': '86400',
  };
  if (origin && allowedOrigins.includes(origin)) {
    headers['Access-Control-Allow-Origin'] = origin;
    headers['Vary'] = 'Origin';
  }
  return headers;
}

export function bearerToken(header: string | null): string | null {
  const m = /^Bearer\s+(\S+)\s*$/i.exec(header ?? '');
  return m ? m[1] : null;
}

/** JSON body → `{ appleAuthorizationCode? }`. Anything unreadable, too large or malformed → `{}` (never a 400: the deletion still proceeds). */
export async function readBody(req: Request): Promise<{ appleAuthorizationCode?: string }> {
  try {
    const text = await req.text();
    if (!text || new TextEncoder().encode(text).byteLength > MAX_BODY_BYTES) return {};
    const parsed: unknown = JSON.parse(text);
    if (!parsed || typeof parsed !== 'object') return {};
    const code = (parsed as { appleAuthorizationCode?: unknown }).appleAuthorizationCode;
    return typeof code === 'string' && code.trim() !== '' && code.length <= 2048 ? { appleAuthorizationCode: code.trim() } : {};
  } catch {
    return {};
  }
}

export function json(status: number, body: unknown, headers: Record<string, string>): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...headers, 'Content-Type': 'application/json' } });
}

/**
 * 1. CORS preflight / method check. 2. The user is ALWAYS the JWT's user (a `user_id` in the body is ignored).
 * 3. `deleteUser` — one transaction on the server side (FK cascade); a failure deletes nothing → 500.
 * 4. Apple identity: revoke with the authorization code when the secrets are configured; any problem there is
 *    not an error for the user (the account is already gone) but `manual-required` (A-62).
 */
export async function handleDeleteAccount(req: Request, deps: DeleteAccountDeps): Promise<Response> {
  const cors = corsHeaders(req.headers.get('origin'), deps.allowedOrigins);
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
  if (req.method !== 'POST') return json(405, { error: 'method_not_allowed' }, cors);

  const jwt = bearerToken(req.headers.get('authorization'));
  const user = jwt ? await deps.getUser(jwt).catch(() => null) : null;
  if (!user) return json(401, { error: 'unauthorized' }, cors);

  const { appleAuthorizationCode } = await readBody(req);
  try {
    await deps.deleteUser(user.id);
  } catch {
    deps.log('delete_failed');
    return json(500, { error: 'delete_failed' }, cors);
  }

  let appleRevoked: AppleRevokeResult = 'not-applicable';
  if (user.providers.includes('apple')) {
    appleRevoked = 'manual-required';
    if (deps.apple && appleAuthorizationCode) {
      try {
        const t = await deps.exchangeAppleCode(appleAuthorizationCode, deps.apple);
        const token = t.refreshToken ?? t.accessToken;
        if (token) {
          await deps.revokeAppleToken(token, t.refreshToken ? 'refresh_token' : 'access_token', deps.apple);
          appleRevoked = 'revoked';
        }
      } catch {
        deps.log('apple_revoke_failed');
      }
    }
  }
  deps.log('deleted');
  return json(200, { deleted: true, appleRevoked }, cors);
}
