import { test, expect } from './fixtures'
import { APP_GOTO_OPTIONS, prepareApp } from './app-init'
import { PLAYWRIGHT_TIMEOUTS } from './timeouts'
import { warmupAppShell } from './app-warmup'

test.beforeAll(async ({ browser }) => {
  // Allow the long timeout so the cold Vite compile can finish during warmup.
  test.setTimeout(PLAYWRIGHT_TIMEOUTS.testLong)
  // Preload the shell once so the smoke checks avoid the first-compile cost.
  await warmupAppShell(browser)
})

test('app renders the builder shell', async ({ page }) => {
  // Allow the long timeout so the initial app boot does not flake.
  test.setTimeout(PLAYWRIGHT_TIMEOUTS.testLong)
  // Seed storage so the README dialog does not block the shell.
  await prepareApp(page)
  // Load the app shell without waiting on the full load event.
  await page.goto('/', APP_GOTO_OPTIONS)
  // Confirm the builder heading is present to validate the shell is mounted.
  // Allow slower engines to finish the shell render before asserting.
  await expect(page.getByRole('heading', { name: 'Recipe Builder' })).toBeVisible({ timeout: PLAYWRIGHT_TIMEOUTS.expectLong })
})

test('help entry point remains visible', async ({ page }) => {
  // Allow the long timeout so the initial app boot does not flake.
  test.setTimeout(PLAYWRIGHT_TIMEOUTS.testLong)
  // Seed storage so the README dialog does not block the header.
  await prepareApp(page)
  // Load the app shell without waiting on the full load event.
  await page.goto('/', APP_GOTO_OPTIONS)
  // Wait for the builder heading before asserting on header controls.
  // Allow slower engines to finish the shell render before asserting.
  await expect(page.getByRole('heading', { name: 'Recipe Builder' })).toBeVisible({ timeout: PLAYWRIGHT_TIMEOUTS.expectLong })
  // Ensure the Help button remains accessible for guidance.
  await expect(page.getByRole('button', { name: 'Help / README' })).toBeVisible()
})
