import { test, expect } from './fixtures'
import { APP_GOTO_OPTIONS, prepareApp } from './app-init'

test.describe('substat targets dialog', () => {
  test('Tab/Shift+Tab hops between value inputs and wraps', async ({ page }) => {
    // Firefox on Windows can take longer to warm the dev server before DOMContentLoaded.
    test.setTimeout(60_000)
    // Ensure the builder shell is ready without tutorial/readme overlays.
    await prepareApp(page)
    // Load the app shell without waiting for full asset load.
    await page.goto('/', APP_GOTO_OPTIONS)

    // Open the "Substat Targets" modal (aka the Substat Values popout).
    await page.getByRole('button').filter({ hasText: 'Substat Targets' }).click()

    // Scope to the dialog so future UI additions do not affect the selector.
    const dialog = page.getByRole('dialog', { name: 'Manage Substat Targets' })
    await expect(dialog).toBeVisible()

    // The dialog renders a dense grid, and each value input carries stable keys.
    const inputs = dialog.locator('input[data-substat-target-input="true"]')
    await expect(inputs.first()).toBeVisible()

    const readActiveKey = async (): Promise<string | null> => page.evaluate(() => {
      const el = document.activeElement
      if (!el) return null
      if (!(el instanceof HTMLInputElement)) return null
      if (el.getAttribute('data-substat-target-input') !== 'true') return null
      const star = el.getAttribute('data-substat-target-star')
      const variant = el.getAttribute('data-substat-target-variant')
      if (!star || !variant) return null
      return `${star}:${variant}`
    })

    // Tab from a value cell should land on another value cell (not the spinner buttons).
    await inputs.first().focus()
    const firstKey = await readActiveKey()
    expect(firstKey).not.toBeNull()

    await page.keyboard.press('Tab')
    const nextKey = await readActiveKey()
    expect(nextKey).not.toBeNull()
    expect(nextKey).not.toBe(firstKey)

    // Wrapping: Shift+Tab from the first cell should wrap to the end, then Tab returns.
    await inputs.first().focus()
    await page.keyboard.press('Shift+Tab')
    const wrappedKey = await readActiveKey()
    expect(wrappedKey).not.toBeNull()
    expect(wrappedKey).not.toBe(firstKey)

    await page.keyboard.press('Tab')
    const returnedKey = await readActiveKey()
    expect(returnedKey).toBe(firstKey)
  })
})
