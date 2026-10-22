// QC M14 round 2 - Playwright config for tests/qc/m14-r2-ios-emulation.pw.ts. Three native-e2e builds against the mock on 54399
// (the spec starts the mock itself), each served by `vite preview` on its own port; QC_VARIANT picks which one is used.
//   common : VITE_SUPABASE_URL=http://127.0.0.1:54399 VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_mock npx vite build --mode native-e2e --outDir <dir>
//   ids    : + VITE_GOOGLE_WEB_CLIENT_ID=111111111111-web.apps.googleusercontent.com VITE_GOOGLE_IOS_CLIENT_ID=222222222222-ios.apps.googleusercontent.com -> dist-qc-native (port 4176)
//   noid   : neither Google id                                                                                                                         -> dist-qc-native-noid (port 4177)
//   webonly: only VITE_GOOGLE_WEB_CLIENT_ID                                                                                                            -> dist-qc-native-webonly (port 4178)
// Run: QC_VARIANT=noid npx playwright test -c tests/qc/playwright.m14r2.config.ts   (PLAYWRIGHT_BROWSERS_PATH=0 when the browser lives in node_modules)
import { defineConfig, devices } from '@playwright/test';

const variant = process.env.QC_VARIANT ?? 'ids';
const dists: Record<string, [string, number]> = { ids: ['dist-qc-native', 4176], noid: ['dist-qc-native-noid', 4177], webonly: ['dist-qc-native-webonly', 4178] };
const dist = dists[variant];
if (!dist) throw new Error(`unknown QC_VARIANT ${variant}`);
const [outDir, port] = dist;

export default defineConfig({
  testDir: '.',
  testMatch: ['m14-r2-ios-emulation.pw.ts'],
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: [['list']],
  use: { ...devices['Desktop Chrome'], baseURL: `http://localhost:${port}/`, timezoneId: 'Asia/Ho_Chi_Minh', locale: 'en-US', trace: 'retain-on-failure' },
  webServer: { cwd: '../..', command: `npx vite preview --mode native-e2e --outDir ${outDir} --port ${port} --strictPort`, url: `http://localhost:${port}/`, reuseExistingServer: true, timeout: 60_000 },
});
