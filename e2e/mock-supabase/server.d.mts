// Types for server.mjs (used by Vitest integration tests that start the mock in-process).
export interface MockUser {
  id: string;
  email: string;
  name: string;
}

export declare const USERS: { u1: MockUser; u2: MockUser };

export interface MockState {
  log: Array<{ method: string; path: string; query: Record<string, string>; body: string[] | null; at: number }>;
  tokenTtlS: number;
  now: number | null;
  refreshMode: 'ok' | 'invalid_grant';
  fail: Array<{ path: string; status: number; times: number }>;
  exchanges: number;
  refreshes: number;
}

export interface MockSupabase {
  url: string;
  port: number;
  state: MockState;
  close(): Promise<void>;
}

export declare function startMockSupabase(port?: number): Promise<MockSupabase>;
