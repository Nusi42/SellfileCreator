import { expect, test } from './fixtures'
import { APP_GOTO_OPTIONS, prepareApp } from './app-init'
import { dismissBlockingDialogs } from './dialog-helpers'
import { PREVIEW_MODE_STORAGE_KEY } from '../../src/lib/constants'
import { PLAYWRIGHT_TIMEOUTS } from './timeouts'
import { ensureGearInspectorMode } from './gear-inspector-mode'
import {
  RULES_FILTER_OPEN_STORAGE_KEY,
  RULES_FILTER_STATE_STORAGE_KEY,
  cloneDefaultRulesFilterState,
} from '../../src/state/rulesFilterPersistence'
import { SAMPLE_SMALL_SFC_PATH, SAMPLE_SMALL_DB_PATH } from './fixture-paths'
import { SFC_LOAD_INPUT_SELECTOR } from './ui-selectors'
import { warmupAppShell } from './app-warmup'

// Seed Gear Inspector mode + default filters so the grid boots populated and deterministic.
const seedGearInspector = async (page: Parameters<typeof test>[0]['page']) => {
  const filterState = { rules: cloneDefaultRulesFilterState(), tester: cloneDefaultRulesFilterState() }
  const filterOpen = { rules: false, tester: true }
  await page.addInitScript(
    ({ previewKey, previewMode, filterKey, filterValue, filterOpenKey, filterOpenValue }) => {
      try {
        window.localStorage.setItem(previewKey, previewMode)
        window.localStorage.setItem(filterKey, filterValue)
        window.localStorage.setItem(filterOpenKey, filterOpenValue)
      } catch { /* ignore storage failures so the test can still proceed */ }
    },
    {
      previewKey: PREVIEW_MODE_STORAGE_KEY, previewMode: 'gearInspector',
      filterKey: RULES_FILTER_STATE_STORAGE_KEY, filterValue: JSON.stringify(filterState),
      filterOpenKey: RULES_FILTER_OPEN_STORAGE_KEY, filterOpenValue: JSON.stringify(filterOpen),
    },
  )
}

// Load the SFC + gear DB fixtures and wait for the Gear Inspector grid to populate.
const bootGearInspectorGrid = async (page: Parameters<typeof test>[0]['page']) => {
  await prepareApp(page)
  await seedGearInspector(page)
  await page.goto('/', APP_GOTO_OPTIONS)
  await dismissBlockingDialogs(page)
  const sfcInput = page.locator(SFC_LOAD_INPUT_SELECTOR).first()
  await sfcInput.waitFor({ state: 'attached', timeout: PLAYWRIGHT_TIMEOUTS.appGoto })
  await expect(sfcInput).toBeEnabled({ timeout: PLAYWRIGHT_TIMEOUTS.expectDefault })
  await sfcInput.setInputFiles(SAMPLE_SMALL_SFC_PATH)
  const dbInput = page.locator('input[type="file"][accept*=".db"]').first()
  await dbInput.waitFor({ state: 'attached', timeout: PLAYWRIGHT_TIMEOUTS.appGoto })
  await expect(dbInput).toBeEnabled({ timeout: PLAYWRIGHT_TIMEOUTS.expectDefault })
  await dbInput.setInputFiles(SAMPLE_SMALL_DB_PATH)
  await dismissBlockingDialogs(page)
  await ensureGearInspectorMode(page)
  await page.waitForFunction(
    () => document.querySelectorAll('[data-gear-inspector-grid-card="true"]').length > 0,
    undefined, { timeout: PLAYWRIGHT_TIMEOUTS.expectLong },
  )
}

test.beforeAll(async ({ browser }) => {
  test.setTimeout(PLAYWRIGHT_TIMEOUTS.testHeavy)
  await warmupAppShell(browser)
})

test.describe('Gear Diff', () => {
  test('Diff toggle opens the before/after comparison and restores on exit', async ({ page }) => {
    test.setTimeout(PLAYWRIGHT_TIMEOUTS.testHeavy)
    await bootGearInspectorGrid(page)

    // Baseline: exactly one normal Gear Inspector grid container is mounted.
    const gridContainer = page.locator('[data-gear-inspector-grid-container="true"]')
    await expect(gridContainer).toHaveCount(1)

    // The Diff toggle lives in the preview header and is enabled in Gear Inspector mode.
    const diffToggle = page.getByRole('button', { name: 'Diff', exact: true })
    await expect(diffToggle).toBeVisible({ timeout: PLAYWRIGHT_TIMEOUTS.expectDefault })
    await expect(diffToggle).toBeEnabled()

    // Engaging diff mode pins the current state as the baseline and swaps in the split-view.
    await diffToggle.click()
    const splitView = page.locator('[data-testid="gear-diff-split-view"]')
    await expect(splitView).toBeVisible({ timeout: PLAYWRIGHT_TIMEOUTS.expectDefault })

    // With no edits since load, baseline == current, so the diff is empty.
    await expect(page.getByText('No sell/keep changes to show.')).toBeVisible({
      timeout: PLAYWRIGHT_TIMEOUTS.expectDefault,
    })

    // Toggling off exits compare mode and restores the single normal grid.
    await diffToggle.click()
    await expect(splitView).toHaveCount(0)
    await expect(gridContainer).toHaveCount(1)
  })
})

export const __gearDiffSpecMarker = true
