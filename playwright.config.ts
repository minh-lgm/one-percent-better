import { defineConfig, devices } from '@playwright/test';

const PORT = 4173;
export const BASE_URL = `http://localhost:${PORT}`;

/** Cloud project (ARCHITECTURE §8): build `--mode cloud-e2e` on the GitHub Pages sub-path, mock Supabase on 54321. */
export const CLOUD_PORT = 4174;
export const CLOUD_BASE_URL = `http://localhost:${CLOUD_PORT}/one-percent-better/`;
export const MOCK_SUPABASE_URL = 'http://127.0.0.1:54321';

/** Native project (v5.0, ARCHITECTURE §8): the Capacitor build (`--mode native-e2e`, base '/', no SW) opened in Chromium. */
export const NATIVE_PORT = 4175;
export const NATIVE_BASE_URL = `http://localhost:${NATIVE_PORT}/`;

export default defineConfig({
  testDir: '.',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: 0,
  // 8 workers: with 12+ the heavy specs (axe on every screen, large datasets) hit their timeouts (QC M7 r1 §9.2).
  workers: process.env.CI ? 1 : 8,
  reporter: [['list'], ['html', { open: 'never' }]],
  timeout: 60_000,
  expect: { timeout: 10_000 },
  use: {
    timezoneId: 'Asia/Ho_Chi_Minh',
    locale: 'en-US',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      // Phase-1 app: build `--mode e2e` (cloud OFF even when the machine has a `.env.local`).
      name: 'chromium',
      testMatch: ['e2e/**/*.spec.ts', 'tests/qc/**/*.spec.ts'],
      testIgnore: ['e2e/cloud/**', 'tests/qc/cloud/**'],
      use: { ...devices['Desktop Chrome'], baseURL: BASE_URL },
    },
    {
      // Cloud ON against the mock Supabase, served under /one-percent-better/ like GitHub Pages.
      name: 'cloud',
      testMatch: ['e2e/cloud/**/*.spec.ts', 'tests/qc/cloud/**/*.spec.ts'],
      // Files run in parallel workers, tests within a file in order: the mock keeps state per
      // worker (User-Agent fixture in e2e/cloud/fixtures.ts), so a test's reset never hits a neighbour.
      fullyParallel: false,
      use: { ...devices['Desktop Chrome'], baseURL: CLOUD_BASE_URL },
    },
    {
      // The native build in a browser: `Capacitor.getPlatform()` is 'web' (web adapters), but every compile-time
      // branch of the native build applies (no service worker, no manifest, no update toast, no PWA hints).
      name: 'native-web',
      testMatch: ['e2e/native/**/*.spec.ts', 'tests/qc/native/**/*.spec.ts'],
      use: { ...devices['Desktop Chrome'], baseURL: NATIVE_BASE_URL },
    },
  ],
  webServer: [
    {
      command: 'npm run build:e2e && npm run preview',
      url: BASE_URL,
      reuseExistingServer: !process.env.CI,
      timeout: 180_000,
    },
    {
      command: 'npm run build:cloud-e2e && npm run preview:cloud-e2e',
      url: CLOUD_BASE_URL,
      reuseExistingServer: !process.env.CI,
      timeout: 180_000,
    },
    {
      command: 'npm run build:native-e2e && npm run preview:native-e2e',
      url: NATIVE_BASE_URL,
      reuseExistingServer: !process.env.CI,
      timeout: 180_000,
    },
    {
      command: 'npm run mock:supabase',
      url: `${MOCK_SUPABASE_URL}/auth/v1/health`,
      reuseExistingServer: !process.env.CI,
      timeout: 30_000,
    },
  ],
});
