// `npm run test:db` — SQL/RLS/trigger tests against Supabase local (Docker). Not part of `npm test`.
// `scripts/test-db.mjs` checks that a local instance is reachable first and prints "skipped" otherwise.
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    name: 'db',
    environment: 'node',
    include: ['tests/db/**/*.test.ts'],
    testTimeout: 60_000,
    hookTimeout: 120_000,
    fileParallelism: false,
  },
});
