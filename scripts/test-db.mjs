// `npm run test:db` (ARCHITECTURE §9, TASKS DoD 8): runs tests/db/** against a Supabase local
// instance (Docker). Without Docker / without a running instance it prints "skipped" and exits 0,
// so CI and machines without Docker (OQ-08) are not blocked; the behaviour is then verified by hand (U10).
//
// Required (values printed by `npx supabase status` after `npm run db:start`):
//   SUPABASE_TEST_URL (default http://127.0.0.1:54321)
//   SUPABASE_TEST_PUBLISHABLE_KEY (or SUPABASE_TEST_ANON_KEY)
//   SUPABASE_TEST_SECRET_KEY (or SUPABASE_TEST_SERVICE_ROLE_KEY) — local only, used to create the two test users
import { spawn } from 'node:child_process';

const url = (process.env.SUPABASE_TEST_URL ?? 'http://127.0.0.1:54321').replace(/\/$/, '');
const publishable = process.env.SUPABASE_TEST_PUBLISHABLE_KEY ?? process.env.SUPABASE_TEST_ANON_KEY;
const secret = process.env.SUPABASE_TEST_SECRET_KEY ?? process.env.SUPABASE_TEST_SERVICE_ROLE_KEY;

function skip(reason) {
  console.log(`test:db skipped: ${reason}`);
  console.log('  Supabase local needs Docker Desktop: `npm run db:start`, then export SUPABASE_TEST_PUBLISHABLE_KEY and');
  console.log('  SUPABASE_TEST_SECRET_KEY from `npx --yes supabase@2.120.0 status` and run `npm run test:db` again.');
  console.log('  Without Docker, the RLS/trigger behaviour is verified manually (docs/plan/TASKS.md, User setup U10).');
  process.exit(0);
}

if (!publishable || !secret) skip('SUPABASE_TEST_PUBLISHABLE_KEY / SUPABASE_TEST_SECRET_KEY not set (Supabase local not running)');

let health;
try {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 3000);
  health = await fetch(`${url}/auth/v1/health`, { signal: controller.signal, headers: { apikey: publishable } });
  clearTimeout(timer);
} catch (e) {
  skip(`Supabase local not reachable at ${url} (${e?.cause?.code ?? e?.name ?? 'network error'})`);
}
if (!health.ok) skip(`Supabase local at ${url} answered ${health.status}`);
const body = await health.json().catch(() => ({}));
if (body?.name === 'mock-supabase') skip(`${url} is the E2E mock, not Supabase local`);

const vitest = process.platform === 'win32' ? 'npx.cmd' : 'npx';
const child = spawn(vitest, ['vitest', 'run', '--config', 'vitest.db.config.ts'], {
  stdio: 'inherit',
  shell: process.platform === 'win32',
  env: { ...process.env, SUPABASE_TEST_URL: url, SUPABASE_TEST_PUBLISHABLE_KEY: publishable, SUPABASE_TEST_SECRET_KEY: secret },
});
child.on('exit', (code) => process.exit(code ?? 1));
