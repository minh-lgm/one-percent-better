// Playwright fixtures for the `cloud` project. One mock Supabase serves every worker, so each
// worker gets its own browser User-Agent and the mock keeps separate state per UA
// (e2e/mock-supabase/server.mjs). Tests in a file run sequentially (fullyParallel: false for
// the project), so `mock.reset()` in beforeEach never disturbs another test of the same worker.
// M7: `device()` opens a second browser context (another "device") on the same partition.
import { test as base, type APIRequestContext, type BrowserContext, type Page } from '@playwright/test';
import { CLOUD_BASE_URL, MOCK_SUPABASE_URL } from '../../playwright.config';

export interface MockLog {
  log: Array<{ method: string; path: string; query: Record<string, string>; body: string[] | null; rows: number; at: number }>;
  exchanges: number;
  refreshes: number;
}

export interface MockRows {
  goals: Array<Record<string, unknown> & { id: string; deleted_at: string | null; updated_at: string }>;
  entries: Array<Record<string, unknown> & { id: string; goal_id: string; deleted_at: string | null; updated_at: string }>;
  settings: Array<Record<string, unknown>>;
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

  /** The next `times` requests whose path contains `path` fail with `status` (optionally after `delayMs`). */
  fail(path: string, status: number, times = 1, delayMs = 0) {
    return this.get(`/__test/fail?path=${path}&status=${status}&times=${times}${delayMs ? `&delay=${delayMs}` : ''}`);
  }

  /** Remove every pending failure rule. */
  clearFailures() {
    return this.get('/__test/fail?clear=1');
  }

  /** Token lifetime (s), refresh behaviour and a fixed "now" (ms) for issued tokens. */
  session(o: { ttl?: number; refresh?: 'ok' | 'invalid_grant'; now?: number | '' }) {
    const q = new URLSearchParams();
    if (o.ttl !== undefined) q.set('ttl', String(o.ttl));
    if (o.refresh !== undefined) q.set('refresh', o.refresh);
    if (o.now !== undefined) q.set('now', String(o.now));
    return this.get(`/__test/session?${q.toString()}`);
  }

  /** M7: seed cloud rows for a user (domain camelCase or cloud snake_case shape). */
  seed(user: 'u1' | 'u2', rows: { goals?: Record<string, unknown>[]; entries?: Record<string, unknown>[]; settings?: Record<string, unknown>[] }) {
    return this.request.post(`${MOCK_SUPABASE_URL}/__test/seed`, { headers: { 'x-opb-scope': this.scope }, data: { user, ...rows } });
  }

  /** M7: every stored row of a user (tombstones included). */
  async rows(user: 'u1' | 'u2' = 'u1'): Promise<MockRows> {
    return (await this.get(`/__test/rows?user=${user}`)).json();
  }

  async liveRows(user: 'u1' | 'u2' = 'u1'): Promise<{ goals: MockRows['goals']; entries: MockRows['entries'] }> {
    const r = await this.rows(user);
    const liveGoals = r.goals.filter((g) => g.deleted_at === null);
    const ids = new Set(liveGoals.map((g) => g.id));
    return { goals: liveGoals, entries: r.entries.filter((e) => e.deleted_at === null && ids.has(e.goal_id)) };
  }
}

export interface Device {
  context: BrowserContext;
  page: Page;
}

const UA_PREFIX = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/140.0 Safari/537.36';

export const test = base.extend<{ mock: MockApi; device: (options?: { locale?: string; viewport?: { width: number; height: number } }) => Promise<Device> }, { workerScope: string }>({
  workerScope: [
    // eslint-disable-next-line no-empty-pattern -- Playwright fixture signature
    async ({}, use, workerInfo) => {
      await use(`opb-e2e-w${workerInfo.workerIndex}-${process.pid}`);
    },
    { scope: 'worker' },
  ],
  // Built-in option: the browser context's User-Agent. The mock partitions its state by it.
  userAgent: async ({ workerScope }, use) => {
    await use(`${UA_PREFIX} ${workerScope}`);
  },
  mock: async ({ request, workerScope }, use) => {
    await use(new MockApi(request, workerScope));
  },
  // A second "device": its own context (own IndexedDB/localStorage), same mock partition.
  device: async ({ browser, workerScope }, use) => {
    const contexts: BrowserContext[] = [];
    await use(async (options = {}) => {
      const context = await browser.newContext({
        baseURL: CLOUD_BASE_URL,
        userAgent: `${UA_PREFIX} ${workerScope}`,
        timezoneId: 'Asia/Ho_Chi_Minh',
        locale: options.locale ?? 'en-US',
        viewport: options.viewport ?? { width: 1280, height: 720 },
      });
      contexts.push(context);
      const page = await context.newPage();
      return { context, page };
    });
    for (const c of contexts) await c.close();
  },
});

export { expect } from '@playwright/test';
