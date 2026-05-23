import path from 'node:path'
import { test, expect } from './fixtures'
import { APP_GOTO_OPTIONS, prepareApp } from './app-init'
import { PLAYWRIGHT_TIMEOUTS } from './timeouts'
import { warmupAppShell } from './app-warmup'
import { dismissBlockingDialogs } from './dialog-helpers'

// Path to the broken DB fixture — loading it triggers an error Snackbar through the central showToast path.
const BROKEN_DB_PATH = path.resolve(process.cwd(), 'tests', 'data', 'broken.db')

test.beforeAll(async ({ browser }) => {
  test.setTimeout(PLAYWRIGHT_TIMEOUTS.testLong)
  await warmupAppShell(browser)
})

test.beforeEach(async ({ page }) => {
  test.setTimeout(PLAYWRIGHT_TIMEOUTS.testLong)
  await prepareApp(page)
  await page.goto('/', APP_GOTO_OPTIONS)
  await expect(page.getByRole('button', { name: 'Recipe Builder' })).toBeVisible({ timeout: PLAYWRIGHT_TIMEOUTS.expectLong })
  await dismissBlockingDialogs(page)
})

test('error Snackbar appears after loading a broken gear DB', async ({ page }) => {
  const dbInput = page.locator('input[type="file"][accept*=".db"]').first()
  await dbInput.waitFor({ state: 'attached', timeout: PLAYWRIGHT_TIMEOUTS.appGoto })
  await dbInput.setInputFiles(BROKEN_DB_PATH)
  // MUI Snackbar wraps an Alert with role="alert" — assert it appears.
  await expect(page.locator('[role="alert"]').first()).toBeVisible({ timeout: PLAYWRIGHT_TIMEOUTS.expectLong })
})

test('error Snackbar auto-hides within ~4 s (autoHideDuration=3000)', async ({ page }) => {
  const dbInput = page.locator('input[type="file"][accept*=".db"]').first()
  await dbInput.waitFor({ state: 'attached', timeout: PLAYWRIGHT_TIMEOUTS.appGoto })
  await dbInput.setInputFiles(BROKEN_DB_PATH)
  const alert = page.locator('[role="alert"]').first()
  await expect(alert).toBeVisible({ timeout: PLAYWRIGHT_TIMEOUTS.expectLong })
  // The Snackbar autoHideDuration is 3000 ms — give the alert up to 4 s to disappear.
  await expect(alert).toBeHidden({ timeout: 4500 })
})
