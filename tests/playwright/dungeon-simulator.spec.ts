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
  test.setTimeout(PLAYWRIGHT_TIMEOUTS.testHeavy)
  await prepareApp(page)
  await page.goto('/', APP_GOTO_OPTIONS)
  await expect(page.getByRole('button', { name: 'Recipe Builder' })).toBeVisible({ timeout: PLAYWRIGHT_TIMEOUTS.expectLong })
  await dismissBlockingDialogs(page)
})

test('dungeon sim detail popout opens and generic-stats tooltip appears on row hover', async ({ page }) => {
  test.setTimeout(PLAYWRIGHT_TIMEOUTS.testHeavy)

  // Open the Logic Hub dialog and navigate to the dungeon simulator.
  const dialog = await openDialogByTrigger(page, SUBSTAT_TARGETS_BUTTON_SELECTOR, 'Tools')
  await dialog.getByRole('tab', { name: 'Dungeon Drops Simulator' }).click()

  // Wait for the WASM-backed simulation to produce at least one percentage cell.
  // Cells start as "—" and fill in as batches complete; we look for the first non-empty one.
  const simulatedCell = dialog.getByRole('button').filter({ hasText: /\d+\.\d+%/ }).first()
  await expect(simulatedCell).toBeVisible({ timeout: PLAYWRIGHT_TIMEOUTS.expectLong })

  // Click the cell to open the detail popout.
  await simulatedCell.click()

  // The popout carries a stable testid; wait for it to appear.
  const popout = page.getByTestId('dungeon-sim-detail-popout')
  await expect(popout).toBeVisible({ timeout: PLAYWRIGHT_TIMEOUTS.expectDefault })

  // Find the first slot+main breakdown row (each wraps a MarkdownTooltip that fires
  // a generic-stats query when the user hovers). With the null-caching fix applied,
  // a "worker not ready" response no longer blocks future retries.
  const firstGenericRow = page.getByTestId('dungeon-sim-generic-row').first()
  await expect(firstGenericRow).toBeVisible({ timeout: PLAYWRIGHT_TIMEOUTS.expectDefault })
  await firstGenericRow.hover()

  // MUI Tooltip fires after enterDelay (1500 ms for informational intent) then renders
  // with role="tooltip". The expectLong budget covers the delay + worker round-trip.
  const tooltip = page.locator('[role="tooltip"]').first()
  await expect(tooltip).toBeVisible({ timeout: PLAYWRIGHT_TIMEOUTS.expectLong })

  // Once the simulation session is warmed up the tooltip should show the generic stats
  // header rather than staying on the loading placeholder indefinitely.
  await expect(tooltip).toContainText('Specific substat odds', { timeout: PLAYWRIGHT_TIMEOUTS.expectLong })
})
