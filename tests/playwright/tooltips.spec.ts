import { test, expect } from './fixtures'
import { APP_GOTO_OPTIONS, prepareApp } from './app-init'
import { PLAYWRIGHT_TIMEOUTS } from './timeouts'
import { warmupAppShell } from './app-warmup'
import { dismissBlockingDialogs } from './dialog-helpers'

// Warm the shell once so the per-test cost is just the page boot + the hover.
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

test('hovering the Help button shows a tooltip', async ({ page }) => {
  const helpButton = page.getByRole('button', { name: 'Help / README' })
  await expect(helpButton).toBeVisible({ timeout: PLAYWRIGHT_TIMEOUTS.expectLong })
  await helpButton.hover()
  // MUI Tooltip renders with role="tooltip" via aria-describedby wiring.
  await expect(page.locator('[role="tooltip"]').first()).toBeVisible({ timeout: PLAYWRIGHT_TIMEOUTS.expectDefault })
})

test('tooltip disappears after mouseleave', async ({ page }) => {
  const helpButton = page.getByRole('button', { name: 'Help / README' })
  await expect(helpButton).toBeVisible({ timeout: PLAYWRIGHT_TIMEOUTS.expectLong })
  await helpButton.hover()
  const tooltip = page.locator('[role="tooltip"]').first()
  await expect(tooltip).toBeVisible({ timeout: PLAYWRIGHT_TIMEOUTS.expectDefault })
  // Move the mouse away to a known empty viewport position to clear hover state.
  await page.mouse.move(0, 0)
  await expect(tooltip).toBeHidden({ timeout: PLAYWRIGHT_TIMEOUTS.expectDefault })
})
