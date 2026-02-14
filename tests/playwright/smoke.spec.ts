import { test, expect } from './fixtures'
import { APP_GOTO_OPTIONS, prepareApp } from './app-init'
import { PLAYWRIGHT_TIMEOUTS } from './timeouts'
import { SUBSTAT_TARGETS_BUTTON_SELECTOR } from './ui-selectors'

test.describe('smoke', () => {
  test('app boots and shows the builder shell', async ({ page }) => {
    // Allow extra time for Firefox/WebKit to finish the initial shell render.
    test.setTimeout(PLAYWRIGHT_TIMEOUTS.testLong)
    // Seed localStorage so overlays do not block the shell.
    await prepareApp(page)
    // Avoid waiting for the full load event during dev-server startup.
    await page.goto('/', APP_GOTO_OPTIONS)
    // Confirm the builder header renders to prove the shell is ready.
    // Allow slower engines to finish the shell render before asserting.
    await expect(page.getByRole('heading', { name: 'Recipe Builder' })).toBeVisible({ timeout: PLAYWRIGHT_TIMEOUTS.expectLong })
    // Capture the toolbar action by accessible name so it survives layout changes.
    // Use the stable test hook so the label can stay localized/ellipsized.
    const substatTargetsButton = page.locator(SUBSTAT_TARGETS_BUTTON_SELECTOR)
    // Confirm the toolbar renders without extending the default timeout.
    await expect(substatTargetsButton).toBeVisible()
  })
})
