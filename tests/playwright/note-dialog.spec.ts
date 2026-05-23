import { test, expect } from './fixtures'
import { APP_GOTO_OPTIONS, prepareApp } from './app-init'
import { PLAYWRIGHT_TIMEOUTS } from './timeouts'
import { warmupAppShell } from './app-warmup'
import { dismissBlockingDialogs, NOTE_DIALOG_TITLES } from './dialog-helpers'

const NOTE_TOGGLE_SELECTOR = '[data-tour-id="note.toggle"]'

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

test('NoteDialog opens with one of the expected titles', async ({ page }) => {
  await page.locator(NOTE_TOGGLE_SELECTOR).click()
  // The dialog title varies based on whether overrides are enabled.
  const dialog = page.getByRole('dialog').first()
  await expect(dialog).toBeVisible({ timeout: PLAYWRIGHT_TIMEOUTS.expectLong })
  const titleText = await dialog.locator('h2, [class*="DialogTitle"]').first().innerText()
  const titles = NOTE_DIALOG_TITLES as readonly string[]
  expect(titles.some((t) => titleText.includes(t))).toBe(true)
})

test('NoteDialog hosts the @uiw markdown editor', async ({ page }) => {
  await page.locator(NOTE_TOGGLE_SELECTOR).click()
  const dialog = page.getByRole('dialog').first()
  await expect(dialog).toBeVisible({ timeout: PLAYWRIGHT_TIMEOUTS.expectLong })
  // @uiw/react-md-editor renders a container with className containing "w-md-editor".
  await expect(dialog.locator('[class*="w-md-editor"]').first()).toBeVisible({ timeout: PLAYWRIGHT_TIMEOUTS.expectLong })
})
