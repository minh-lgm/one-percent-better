import type { AuthProvider } from '../services/auth-port';
import type { IdTokenProvider, IdTokenResult } from '../services/id-token-port';

/** In-memory `IdTokenProvider` (ARCH §5.9 v5.0) for service / component tests: scripted results, counted calls. */
export class FakeIdTokenProvider implements IdTokenProvider {
  /** Providers `available()` says yes to (default: iOS — both). */
  providers: Set<AuthProvider>;
  /** Per-provider script: a result, an Error (→ reject) or a function. Default: a token for the provider. */
  results: Partial<Record<AuthProvider, IdTokenResult | Error | (() => IdTokenResult | Error)>> = {};
  calls: Array<{ method: 'getIdToken' | 'logout'; provider: AuthProvider }> = [];
  private seq = 0;

  constructor(providers: AuthProvider[] = ['google', 'apple']) {
    this.providers = new Set(providers);
  }

  available(provider: AuthProvider): boolean {
    return this.providers.has(provider);
  }

  async getIdToken(provider: AuthProvider): Promise<IdTokenResult> {
    this.calls.push({ method: 'getIdToken', provider });
    const scripted = this.results[provider];
    const r = typeof scripted === 'function' ? scripted() : scripted;
    if (r instanceof Error) throw r;
    if (r) return r;
    this.seq += 1;
    return { kind: 'ok', idToken: `${provider}-id-token-${this.seq}`, rawNonce: `raw-nonce-${this.seq}`, ...(provider === 'apple' ? { authorizationCode: `apple-code-${this.seq}` } : {}) };
  }

  async logout(provider: AuthProvider): Promise<void> {
    this.calls.push({ method: 'logout', provider });
  }

  count(method: 'getIdToken' | 'logout', provider?: AuthProvider): number {
    return this.calls.filter((c) => c.method === method && (!provider || c.provider === provider)).length;
  }
}
