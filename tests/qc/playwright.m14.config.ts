// QC M14 round 1 - Playwright config for the iOS-in-a-browser emulation (tests/qc/m14-r1-ios-emulation.pw.ts).
// Needs the native build with the cloud ON against the mock Supabase on 54399 (the spec starts the mock itself):
//   VITE_SUPABASE_URL=http://127.0.0.1:54399 VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_mock \
//   VITE_GOOGLE_WEB_CLIENT_ID=111111111111-web.apps.googleusercontent.com VITE_GOOGLE_IOS_CLIENT_ID=222222222222-ios.apps.googleusercontent.com \
//   npx vite build --mode native-e2e --outDir dist-qc-native
// The preview server below serves that folder on 4176.
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: '.',
  testMatch: ['m14-r1-ios-emulation.pw.ts'],
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: [['list']],
  use: { ...devices['Desktop Chrome'], baseURL: 'http://localhost:4176/', timezoneId: 'Asia/Ho_Chi_Minh', locale: 'en-US', trace: 'retain-on-failure' },
  webServer: { cwd: '../..', command: 'npx vite preview --mode native-e2e --outDir dist-qc-native --port 4176 --strictPort', url: 'http://localhost:4176/', reuseExistingServer: true, timeout: 60_000 },
});
