import { test, expect } from './fixtures'
import { APP_GOTO_OPTIONS, prepareApp } from './app-init'
import { PLAYWRIGHT_TIMEOUTS } from './timeouts'
import { warmupAppShell } from './app-warmup'
import { dismissBlockingDialogs } from './dialog-helpers'
import { PRESET_LATEGAME_SFC_PATH } from './fixture-paths'

test.beforeAll(async ({ browser }) => {
  test.setTimeout(PLAYWRIGHT_TIMEOUTS.testLong)
  await warmupAppShell(browser)
})

test.beforeEach(async ({ page }) => {
  test.setTimeout(PLAYWRIGHT_TIMEOUTS.testHeavy)
  await prepareApp(page)
  await page.goto('/', APP_GOTO_OPTIONS)
  await expect(page.getByRole('button', { name: 'Recipe Builder' })).toBeVisible({ timeout: PLAYWRIGHT_TIMEOUTS.expectLong })
  await dismissBlockingDialogs(page)
  // Load an example SFC so the builder populates with recipes + metasets — that's what surfaces MUI Selects.
  const sfcInput = page.locator('[data-tour-id="sfc.load"] input[type="file"]').first()
  await sfcInput.waitFor({ state: 'attached', timeout: PLAYWRIGHT_TIMEOUTS.appGoto })
  await sfcInput.setInputFiles(PRESET_LATEGAME_SFC_PATH)
  await dismissBlockingDialogs(page)
})

test('MUI Select primitive opens a listbox after SFC load', async ({ page }) => {
  // getByRole defaults to hidden:false so this only matches comboboxes that are actually visible.
  const combobox = page.getByRole('combobox').first()
  await expect(combobox).toBeVisible({ timeout: PLAYWRIGHT_TIMEOUTS.expectLong })
  await combobox.click()
  // MUI Select listbox opens in a popover with role="listbox" and at least one role="option".
  await expect(page.locator('[role="listbox"]').first()).toBeVisible({ timeout: PLAYWRIGHT_TIMEOUTS.expectDefault })
  expect(await page.locator('[role="option"]').count()).toBeGreaterThan(0)
})

test('MUI Select listbox dismisses on Escape', async ({ page }) => {
  const combobox = page.getByRole('combobox').first()
  await expect(combobox).toBeVisible({ timeout: PLAYWRIGHT_TIMEOUTS.expectLong })
  await combobox.click()
  const listbox = page.locator('[role="listbox"]').first()
  await expect(listbox).toBeVisible({ timeout: PLAYWRIGHT_TIMEOUTS.expectDefault })
  // Use locator.press() (not page.keyboard.press) so focus lands on the listbox first.
  // Firefox occasionally leaves focus on the combobox button after the open transition,
  // and MUI Menu only listens for Escape on the listbox — page-level keys never reach the handler.
  await listbox.press('Escape')
  await expect(listbox).toBeHidden({ timeout: PLAYWRIGHT_TIMEOUTS.expectDefault })
})
