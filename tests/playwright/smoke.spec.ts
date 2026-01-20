import { test, expect } from './fixtures'
import { APP_GOTO_OPTIONS, prepareApp } from './app-init'

test.describe('smoke', () => {
  test('app boots and shows the builder shell', async ({ page }) => {
    // Firefox on Windows can be slower to render the toolbar on cold starts.
    test.setTimeout(60_000)
    // Seed localStorage so overlays do not block the shell.
    await prepareApp(page)
    // Avoid waiting for the full load event during dev-server startup.
    await page.goto('/', APP_GOTO_OPTIONS)
    // Confirm the builder header renders to prove the shell is ready.
    await expect(page.getByRole('heading', { name: 'Configs Builder' })).toBeVisible()
    // Capture the toolbar action by accessible name so it survives layout changes.
    const substatTargetsButton = page.getByRole('button', { name: 'Substat Targets' })
    // Allow extra time for Firefox to paint the toolbar entries.
    await expect(substatTargetsButton).toBeVisible({ timeout: 15_000 })
  })
})
