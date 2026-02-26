import { defineConfig, devices } from '@playwright/test';
import { PLAYWRIGHT_TIMEOUTS } from './tests/playwright/timeouts';

// Shared root for Playwright artifact output so per-browser runs stay isolated.
const PLAYWRIGHT_RESULTS_ROOT = 'test-results';

/**
 * Read environment variables from file.
 * https://github.com/motdotla/dotenv
 */
// import dotenv from 'dotenv';
// import path from 'path';
// dotenv.config({ path: path.resolve(__dirname, '.env') });

/**
 * See https://playwright.dev/docs/test-configuration.
 */
export default defineConfig({
  testDir: './tests/playwright',
  // Split HTML report output by browser so sequential runs don't overwrite.
  reportDir: `${PLAYWRIGHT_RESULTS_ROOT}/reports`,
  // Keep default timeouts tight so hung tests fail quickly.
  timeout: PLAYWRIGHT_TIMEOUTS.testDefault,
  // Align expect assertions with the default UI wait budget.
  expect: {
    // Keep expectations snappy by default.
    timeout: PLAYWRIGHT_TIMEOUTS.expectDefault,
  },
  /* Keep Playwright runs stable under the full browser matrix. */
  fullyParallel: false,
  /* Fail the build on CI if you accidentally left test.only in the source code. */
  forbidOnly: !!process.env.CI,
  /* Retry on CI only */
  retries: process.env.CI ? 2 : 0,
  /* Serialize workers to avoid Vite crashes during multi-browser runs. */
  workers: 1,
  /* Reporter to use. See https://playwright.dev/docs/test-reporters */
  // Keep console output detailed while still writing the HTML report to disk.
  reporter: [
    ['list'],
    // Never open or serve the HTML report; just write it to disk and exit.
    ['html', { open: 'never', outputFolder: `${PLAYWRIGHT_RESULTS_ROOT}/reports` }],
  ],
  /* Shared settings for all the projects below. See https://playwright.dev/docs/api/class-testoptions. */
  use: {
    /* Base URL to use in actions like `await page.goto('')`. */
    baseURL: 'http://127.0.0.1:5182',

    // Fail fast on slow actions so we spot stuck UI earlier.
    actionTimeout: PLAYWRIGHT_TIMEOUTS.action,
    // Keep navigation aligned with the app shell budget.
    navigationTimeout: PLAYWRIGHT_TIMEOUTS.navigation,

    /* Collect trace when retrying the failed test. See https://playwright.dev/docs/trace-viewer */
    trace: 'on-first-retry',
  },

  /* Configure projects for major browsers */
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
      // Keep Chromium artifacts separate so sequential runs do not overwrite.
      outputDir: `${PLAYWRIGHT_RESULTS_ROOT}/chromium`,
      // Keep Chromium HTML reports separate so sequential runs do not overwrite.
      reportDir: `${PLAYWRIGHT_RESULTS_ROOT}/reports/chromium`,
    },

    {
      name: 'firefox',
      use: { ...devices['Desktop Firefox'] },
      // Keep Firefox artifacts separate so sequential runs do not overwrite.
      outputDir: `${PLAYWRIGHT_RESULTS_ROOT}/firefox`,
      // Keep Firefox HTML reports separate so sequential runs do not overwrite.
      reportDir: `${PLAYWRIGHT_RESULTS_ROOT}/reports/firefox`,
    },

    /* Test against mobile viewports. */
    // {
    //   name: 'Mobile Chrome',
    //   use: { ...devices['Pixel 5'] },
    // },
    // {
    //   name: 'Mobile Safari',
    //   use: { ...devices['iPhone 12'] },
    // },

    /* Test against branded browsers. */
    // {
    //   name: 'Microsoft Edge',
    //   use: { ...devices['Desktop Edge'], channel: 'msedge' },
    // },
    // {
    //   name: 'Google Chrome',
    //   use: { ...devices['Desktop Chrome'], channel: 'chrome' },
    // },
  ],

  /* Run your local dev server before starting the tests */
  webServer: {
    command: 'npm run dev -- --host 127.0.0.1 --port 5182',
    url: 'http://127.0.0.1:5182/',
    reuseExistingServer: !process.env.CI,
    stdout: 'pipe',
    stderr: 'pipe',
    env: {
      // Signal Vite config to disable dev-only checkers during Playwright runs.
      // Why: e2e already runs `npm run typecheck` separately, and reducing background watchers stabilizes the harness.
      PLAYWRIGHT: '1',
    },
  },
});
