import { test, expect } from './fixtures'
import { APP_GOTO_OPTIONS, prepareApp } from './app-init'
import { PLAYWRIGHT_TIMEOUTS } from './timeouts'
import { warmupAppShell } from './app-warmup'
import { dismissBlockingDialogs } from './dialog-helpers'
import { EXAMPLE_NUSI_SFC_PATH } from './fixture-paths'

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

test('safeguard chip label contains a literal NBSP (U+00A0) between count and word', async ({ page }) => {
  // Load the example SFC which ships with safeguard rules so the chip label populates.
  const sfcInput = page.locator('[data-tour-id="sfc.load"] input[type="file"]').first()
  await sfcInput.waitFor({ state: 'attached', timeout: PLAYWRIGHT_TIMEOUTS.appGoto })
  await sfcInput.setInputFiles(EXAMPLE_NUSI_SFC_PATH)
  await dismissBlockingDialogs(page)
  // Switch to safeguard builder mode so the safeguard chip toggles surface.
  await page.getByRole('button', { name: 'Safeguard Builder' }).click()
  // The chip we care about is the global "N Safeguards" or "N Safeguard" pill near the toggle.
  // Search the whole page for an element with text matching /\d+ \S+/ — that's the regression
  // signature: the count, a literal NBSP, then the noun.
  const matched = await page.evaluate(() => {
    const NBSP = String.fromCharCode(0xa0)
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT)
    let node: Node | null
    while ((node = walker.nextNode())) {
      const text = node.nodeValue ?? ''
      if (/^\s*\d+ \S/.test(text)) return true
      // Also accept a count-word concatenation anywhere in the text (some renders inline more).
      if (text.includes(NBSP) && /\d/.test(text)) return true
    }
    return false
  })
  expect(matched, 'expected a visible label to contain "<digits>\\u00a0<word>"').toBe(true)
})
