import { test, expect } from './fixtures'
import { APP_GOTO_OPTIONS, prepareApp } from './app-init'
import { PLAYWRIGHT_TIMEOUTS } from './timeouts'
import { warmupAppShell } from './app-warmup'
import { dismissBlockingDialogs, openDialogByTrigger } from './dialog-helpers'
import { SUBSTAT_TARGETS_BUTTON_SELECTOR } from './ui-selectors'

const NOTE_TOGGLE_SELECTOR = '[data-tour-id="note.toggle"]'

// Boot the shell once so each test only pays for navigation, not cold compile.
test.beforeAll(async ({ browser }) => {
  test.setTimeout(PLAYWRIGHT_TIMEOUTS.testHeavy)
  await warmupAppShell(browser)
})

test.beforeEach(async ({ page }) => {
  test.setTimeout(PLAYWRIGHT_TIMEOUTS.testHeavy)
  await prepareApp(page)
  await page.goto('/', APP_GOTO_OPTIONS)
  await expect(page.getByRole('button', { name: 'Recipe Builder' })).toBeVisible({ timeout: PLAYWRIGHT_TIMEOUTS.expectLong })
  await dismissBlockingDialogs(page)
})

test('LogicHub dialog opens via tools button and closes via X', async ({ page }) => {
  const dialog = await openDialogByTrigger(page, SUBSTAT_TARGETS_BUTTON_SELECTOR, 'Tools')
  // LogicHubDialog ships an explicit close button with the localized "Close" label.
  await dialog.getByRole('button', { name: 'Close' }).first().click()
  await expect(dialog).toBeHidden({ timeout: PLAYWRIGHT_TIMEOUTS.expectDefault })
})

test('LogicHub dialog closes via Escape key', async ({ page }) => {
  const dialog = await openDialogByTrigger(page, SUBSTAT_TARGETS_BUTTON_SELECTOR, 'Tools')
  await page.keyboard.press('Escape')
  await expect(dialog).toBeHidden({ timeout: PLAYWRIGHT_TIMEOUTS.expectDefault })
})

test('Help dialog opens via header button and closes via Escape', async ({ page }) => {
  const helpButton = page.getByRole('button', { name: 'Help / README' })
  await helpButton.click()
  const dialog = page.getByRole('dialog').first()
  await expect(dialog).toBeVisible({ timeout: PLAYWRIGHT_TIMEOUTS.expectLong })
  await page.keyboard.press('Escape')
  await expect(dialog).toBeHidden({ timeout: PLAYWRIGHT_TIMEOUTS.expectDefault })
})

test('Note dialog opens via note toggle and closes via Close button', async ({ page }) => {
  // The toggle is visible once the shell is rendered; it opens the NoteDialog.
  const toggle = page.locator(NOTE_TOGGLE_SELECTOR)
  await expect(toggle).toBeVisible({ timeout: PLAYWRIGHT_TIMEOUTS.expectLong })
  await toggle.click()
  const dialog = page.getByRole('dialog').first()
  await expect(dialog).toBeVisible({ timeout: PLAYWRIGHT_TIMEOUTS.expectLong })
  // Close via the Close button inside the dialog.
  await dialog.getByRole('button', { name: 'Close' }).first().click()
  await expect(dialog).toBeHidden({ timeout: PLAYWRIGHT_TIMEOUTS.expectDefault })
})

test('Note dialog closes via Escape', async ({ page }) => {
  const toggle = page.locator(NOTE_TOGGLE_SELECTOR)
  await expect(toggle).toBeVisible({ timeout: PLAYWRIGHT_TIMEOUTS.expectLong })
  await toggle.click()
  const dialog = page.getByRole('dialog').first()
  await expect(dialog).toBeVisible({ timeout: PLAYWRIGHT_TIMEOUTS.expectLong })
  await page.keyboard.press('Escape')
  await expect(dialog).toBeHidden({ timeout: PLAYWRIGHT_TIMEOUTS.expectDefault })
})

test('dialog role and aria-modal are set on LogicHub', async ({ page }) => {
  const dialog = await openDialogByTrigger(page, SUBSTAT_TARGETS_BUTTON_SELECTOR, 'Tools')
  // MUI Dialog v9 sets role="dialog" and aria-modal="true" via the underlying Modal primitive.
  await expect(dialog).toHaveAttribute('role', 'dialog')
  await expect(dialog).toHaveAttribute('aria-modal', 'true')
})

