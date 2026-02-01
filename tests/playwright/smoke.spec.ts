import { test, expect } from './fixtures'
import { APP_GOTO_OPTIONS, prepareApp } from './app-init'

test.describe('smoke', () => {
  test('app boots and shows the builder shell', async ({ page }) => {
    // Seed localStorage so overlays do not block the shell.
    await prepareApp(page)
    // Avoid waiting for the full load event during dev-server startup.
    await page.goto('/', APP_GOTO_OPTIONS)
    // Confirm the builder header renders to prove the shell is ready.
    await expect(page.getByRole('heading', { name: 'Configs Builder' })).toBeVisible()
    // Capture the toolbar action by accessible name so it survives layout changes.
    const substatTargetsButton = page.getByRole('button', { name: 'Substat Targets' })
    // Confirm the toolbar renders without extending the default timeout.
    await expect(substatTargetsButton).toBeVisible()
  })
})
