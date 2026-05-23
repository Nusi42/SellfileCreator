import { test, expect } from './fixtures'
import { APP_GOTO_OPTIONS, prepareApp } from './app-init'
import { PLAYWRIGHT_TIMEOUTS } from './timeouts'
import { warmupAppShell } from './app-warmup'
import { dismissBlockingDialogs } from './dialog-helpers'

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

test('Recipe / Safeguard ToggleButtonGroup switches mode', async ({ page }) => {
  // The two toggles are buttons with the localized text inside the builder header.
  const recipeToggle = page.getByRole('button', { name: 'Recipe Builder' })
  const safeguardToggle = page.getByRole('button', { name: 'Safeguard Builder' })
  await expect(recipeToggle).toBeVisible({ timeout: PLAYWRIGHT_TIMEOUTS.expectLong })
  await expect(safeguardToggle).toBeVisible()
  // Initially Recipe is the active mode.
  await expect(recipeToggle).toHaveAttribute('aria-pressed', 'true')
  await safeguardToggle.click()
  // After click, the safeguard side becomes pressed.
  await expect(safeguardToggle).toHaveAttribute('aria-pressed', 'true', { timeout: PLAYWRIGHT_TIMEOUTS.expectDefault })
  await expect(recipeToggle).toHaveAttribute('aria-pressed', 'false')
})

test('ToggleButton retains the Mui-selected class after activation', async ({ page }) => {
  // MUI's `.Mui-selected` global class survives MUI v7 → v9 — this is a class-name parity sanity check.
  const safeguardToggle = page.getByRole('button', { name: 'Safeguard Builder' })
  await expect(safeguardToggle).toBeVisible({ timeout: PLAYWRIGHT_TIMEOUTS.expectLong })
  await safeguardToggle.click()
  await expect(safeguardToggle).toHaveClass(/Mui-selected/, { timeout: PLAYWRIGHT_TIMEOUTS.expectDefault })
})
