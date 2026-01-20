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
    // Ensure the substat targets entry point is exposed in the toolbar.
    await expect(page.getByRole('button').filter({ hasText: 'Substat Targets' })).toBeVisible()
  })
})
