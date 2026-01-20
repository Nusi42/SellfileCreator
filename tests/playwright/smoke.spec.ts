import { test, expect } from './fixtures'
import { prepareApp } from './app-init'

test.describe('smoke', () => {
  test('app boots and shows the builder shell', async ({ page }) => {
    await prepareApp(page)
    await page.goto('/')
    await expect(page.getByRole('heading', { name: 'Configs Builder' })).toBeVisible()
    await expect(page.getByRole('button').filter({ hasText: 'Substat Targets' })).toBeVisible()
  })
})
