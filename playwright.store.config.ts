// `npm run store:screenshots` (TASKS M15-T5, DESIGN v5.0 7.8.8, ADR-43): App Store screenshots rendered from the
// native build opened in Chromium (`--mode native-e2e`, cloud off, port 4175). Not part of `npm run test:e2e`.
// iPhone 6.9" (16 Pro Max): 440 × 956 CSS px at deviceScaleFactor 3 → 1320 × 2868 JPEG, quality 90.
import { defineConfig, devices } from '@playwright/test';
import { NATIVE_BASE_URL } from './playwright.config';

export default defineConfig({
  testDir: './store',
  testMatch: ['screenshots.spec.ts'],
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list']],
  timeout: 120_000,
  expect: { timeout: 15_000 },
  use: {
    ...devices['Desktop Chrome'],
    baseURL: NATIVE_BASE_URL,
    viewport: { width: 440, height: 956 },
    deviceScaleFactor: 3,
    isMobile: false,
    hasTouch: true,
    timezoneId: 'Asia/Ho_Chi_Minh',
    trace: 'off',
    screenshot: 'off',
  },
  webServer: {
    command: 'npm run build:native-e2e && npm run preview:native-e2e',
    url: NATIVE_BASE_URL,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
});
