// Types for server.mjs (used by Vitest integration tests that start the mock in-process).
export interface MockUser {
  id: string;
  email: string;
  name: string;
}

export declare const USERS: { u1: MockUser; u2: MockUser };

/** v5.0 (M14): an account in the mock's auth table (fixed users + accounts created by `grant_type=id_token`). */
export interface MockAccount extends MockUser {
  providers: Array<'google' | 'apple'>;
  meta: Record<string, unknown>;
}

/** v5.0 (M14): a fake provider ID token (HS256 with the mock secret) for `signInWithIdToken` tests. */
export declare function signMockIdToken(claims: Record<string, unknown>): string;

export interface MockLogEntry {
  method: string;
  path: string;
  query: Record<string, string>;
  body: string[] | null;
  /** Rows in the request body (batch size of an upsert). */
  rows: number;
  at: number;
}

export interface MockState {
  log: MockLogEntry[];
  tokenTtlS: number;
  now: number | null;
  refreshMode: 'ok' | 'invalid_grant';
  fail: Array<{ path: string; status: number; times: number; delay?: number }>;
  rows: { goals: Map<string, Map<string, Record<string, unknown>>>; entries: Map<string, Map<string, Record<string, unknown>>>; settings: Map<string, Record<string, unknown>> };
  exchanges: number;
  refreshes: number;
  /** v5.0 (M14) */
  users: Map<string, MockAccount>;
  deleted: Set<string>;
  idTokenSignIns?: number;
  userUpdates?: number;
  deletions?: number;
}

export interface MockSupabase {
  url: string;
  port: number;
  state: MockState;
  close(): Promise<void>;
}

export declare function startMockSupabase(port?: number): Promise<MockSupabase>;
