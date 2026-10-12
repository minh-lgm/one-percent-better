// Playwright fixtures for the `cloud` project. One mock Supabase serves every worker, so each
// worker gets its own browser User-Agent and the mock keeps separate state per UA
// (e2e/mock-supabase/server.mjs). Tests in a file run sequentially (fullyParallel: false for
// the project), so `mock.reset()` in beforeEach never disturbs another test of the same worker.
import { test as base, type APIRequestContext } from '@playwright/test';
import { MOCK_SUPABASE_URL } from '../../playwright.config';

export interface MockLog {
  log: Array<{ method: string; path: string; query: Record<string, string>; body: string[] | null }>;
  exchanges: number;
  refreshes: number;
}

/** Test controls of the mock, bound to this worker's partition. */
export class MockApi {
  constructor(
    private readonly request: APIRequestContext,
    readonly scope: string,
  ) {}

  private get(path: string) {
    return this.request.get(`${MOCK_SUPABASE_URL}${path}`, { headers: { 'x-opb-scope': this.scope } });
  }

  reset() {
    return this.get('/__test/reset');
  }

  async log(): Promise<MockLog> {
    return (await this.get('/__test/log')).json();
  }

  /** The next `times` requests whose path contains `path` fail with `status`. */
  fail(path: string, status: number, times = 1) {
    return this.get(`/__test/fail?path=${path}&status=${status}&times=${times}`);
  }

  /** Token lifetime (s), refresh behaviour and a fixed "now" (ms) for issued tokens. */
  session(o: { ttl?: number; refresh?: 'ok' | 'invalid_grant'; now?: number | '' }) {
    const q = new URLSearchParams();
    if (o.ttl !== undefined) q.set('ttl', String(o.ttl));
    if (o.refresh !== undefined) q.set('refresh', o.refresh);
    if (o.now !== undefined) q.set('now', String(o.now));
    return this.get(`/__test/session?${q.toString()}`);
  }
}

export const test = base.extend<{ mock: MockApi }, { workerScope: string }>({
  workerScope: [
    // eslint-disable-next-line no-empty-pattern -- Playwright fixture signature
    async ({}, use, workerInfo) => {
      await use(`opb-e2e-w${workerInfo.workerIndex}-${process.pid}`);
    },
    { scope: 'worker' },
  ],
  // Built-in option: the browser context's User-Agent. The mock partitions its state by it.
  userAgent: async ({ workerScope }, use) => {
    await use(`Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/140.0 Safari/537.36 ${workerScope}`);
  },
  mock: async ({ request, workerScope }, use) => {
    await use(new MockApi(request, workerScope));
  },
});

export { expect } from '@playwright/test';
