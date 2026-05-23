import { test, expect } from './fixtures'
import { APP_GOTO_OPTIONS, prepareApp } from './app-init'
import { PLAYWRIGHT_TIMEOUTS } from './timeouts'
import { warmupAppShell } from './app-warmup'
import { dismissBlockingDialogs, openDialogByTrigger } from './dialog-helpers'
import { SUBSTAT_TARGETS_BUTTON_SELECTOR } from './ui-selectors'

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

test('LogicHub renders all five tabs', async ({ page }) => {
  const dialog = await openDialogByTrigger(page, SUBSTAT_TARGETS_BUTTON_SELECTOR, 'Tools')
  for (const label of ['Final Sell', 'Substat Targets', 'Custom Gear', 'Dungeon Drops Simulator', 'Gear Analytics']) {
    await expect(dialog.getByRole('tab', { name: label })).toBeVisible({ timeout: PLAYWRIGHT_TIMEOUTS.expectDefault })
  }
})

test('clicking a LogicHub tab updates aria-selected', async ({ page }) => {
  const dialog = await openDialogByTrigger(page, SUBSTAT_TARGETS_BUTTON_SELECTOR, 'Tools')
  const customGearTab = dialog.getByRole('tab', { name: 'Custom Gear' })
  await customGearTab.click()
  await expect(customGearTab).toHaveAttribute('aria-selected', 'true', { timeout: PLAYWRIGHT_TIMEOUTS.expectDefault })
})

test('LogicHub tabs respond to ArrowRight keyboard nav', async ({ page }) => {
  const dialog = await openDialogByTrigger(page, SUBSTAT_TARGETS_BUTTON_SELECTOR, 'Tools')
  const firstTab = dialog.getByRole('tab', { name: 'Final Sell' })
  await firstTab.focus()
  await expect(firstTab).toBeFocused()
  await page.keyboard.press('ArrowRight')
  // After ArrowRight, focus moves to the next tab (Substat Targets).
  const secondTab = dialog.getByRole('tab', { name: 'Substat Targets' })
  await expect(secondTab).toBeFocused({ timeout: PLAYWRIGHT_TIMEOUTS.expectDefault })
})
