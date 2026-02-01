import { test, expect } from './fixtures'
import { APP_GOTO_OPTIONS, prepareApp } from './app-init'
import { SUBSTAT_TARGETS_BUTTON_SELECTOR } from './ui-selectors'

test.describe('smoke', () => {
  test('app boots and shows the builder shell', async ({ page }) => {
    // Seed localStorage so overlays do not block the shell.
    await prepareApp(page)
    // Avoid waiting for the full load event during dev-server startup.
    await page.goto('/', APP_GOTO_OPTIONS)
    // Confirm the builder header renders to prove the shell is ready.
    await expect(page.getByRole('heading', { name: 'Configs Builder' })).toBeVisible()
    // Capture the toolbar action by accessible name so it survives layout changes.
    // Use the stable test hook so the label can stay localized/ellipsized.
    const substatTargetsButton = page.locator(SUBSTAT_TARGETS_BUTTON_SELECTOR)
    // Confirm the toolbar renders without extending the default timeout.
    await expect(substatTargetsButton).toBeVisible()
  })
})
