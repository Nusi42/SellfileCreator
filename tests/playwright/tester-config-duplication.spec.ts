import { expect, test } from './fixtures'
import { APP_GOTO_OPTIONS, prepareApp } from './app-init'
import { openContextMenu } from './context-menu'
import { dismissBlockingDialogs } from './dialog-helpers'
import { PREVIEW_MODE_STORAGE_KEY } from '../../src/lib/constants'
import { PLAYWRIGHT_TIMEOUTS } from './timeouts'
import { ensureTesterMode } from './tester-mode'
import {
  RULES_FILTER_OPEN_STORAGE_KEY,
  RULES_FILTER_STATE_STORAGE_KEY,
  cloneDefaultRulesFilterState,
} from '../../src/state/rulesFilterPersistence'
import { SAMPLE_SMALL_HSFC_PATH, SAMPLE_SMALL_DB_PATH } from './fixture-paths'
import { warmupAppShell } from './app-warmup'

// Use the slim HSFC fixture so config duplication stays fast across browsers.
const HSFC_PATH = SAMPLE_SMALL_HSFC_PATH
// Use the slim DB fixture to keep tester setup fast across browsers.
const DB_PATH = SAMPLE_SMALL_DB_PATH
const TARGET_CONFIG_INDEX = 2 // zero-based: config #3

type GridSnapshot = Array<{ id: number; outcome: string }>

const seedTesterFilters = async (page: Parameters<typeof test>[0]['page']) => {
  // Preload tester mode and default filters so the grid uses all rows in the sample DB.
  const rulesFilters = cloneDefaultRulesFilterState()
  // Keep the tester filters aligned with defaults so we do not depend on a specific set/slot presence.
  const testerFilters = cloneDefaultRulesFilterState()
  // Store both filter views together so the UI boots in a deterministic state.
  const filterState = { rules: rulesFilters, tester: testerFilters }
  // Open the tester filter panel so the grid uses the correct view right away.
  const filterOpen = { rules: false, tester: true }
  await page.addInitScript(
    ({ previewKey, previewMode, filterKey, filterValue, filterOpenKey, filterOpenValue }) => {
      try {
        window.localStorage.setItem(previewKey, previewMode)
        window.localStorage.setItem(filterKey, filterValue)
        window.localStorage.setItem(filterOpenKey, filterOpenValue)
      } catch {
        /* ignore storage failures so the test can still proceed */
      }
    },
    {
      previewKey: PREVIEW_MODE_STORAGE_KEY,
      previewMode: 'tester',
      filterKey: RULES_FILTER_STATE_STORAGE_KEY,
      filterValue: JSON.stringify(filterState),
      filterOpenKey: RULES_FILTER_OPEN_STORAGE_KEY,
      filterOpenValue: JSON.stringify(filterOpen),
    },
  )
}

const waitForTesterGrid = async (page: Parameters<typeof test>[0]['page']) => {
  // Cards expose stable data-match-* attrs; wait until the filtered set is populated and annotated.
  await page.waitForFunction(
    () => document.querySelectorAll('[data-tester-grid-card="true"]').length > 0,
    undefined,
    { timeout: PLAYWRIGHT_TIMEOUTS.expectLong },
  )
}

const waitForMatchingResults = async (page: Parameters<typeof test>[0]['page']) => {
  // Ensure at least one card has a keep/sell result before snapshotting.
  await page.waitForFunction(() => (
    Array.from(document.querySelectorAll('[data-tester-grid-card="true"]'))
      .some((card) => {
        const outcome = card.getAttribute('data-match-outcome')
        return outcome === 'keep' || outcome === 'sell'
      })
  ), undefined, { timeout: PLAYWRIGHT_TIMEOUTS.expectLong })
}

const readGridSnapshot = async (page: Parameters<typeof test>[0]['page']): Promise<GridSnapshot> => {
  // Snapshot the rendered grid state so we can diff outcomes across config mutations.
  const rows = await page.evaluate(() => (
    Array.from(document.querySelectorAll('[data-tester-grid-card="true"]')).map((card) => ({
      id: Number(card.getAttribute('data-row-id')),
      outcome: card.getAttribute('data-match-outcome') ?? 'unknown',
    }))
  ))
  rows.sort((a, b) => a.id - b.id)
  return rows
}

const duplicateConfigChip = async (page: Parameters<typeof test>[0]['page'], index: number) => {
  // Right-click the target chip and fire the Duplicate action so config indices shift just like the bug report.
  const beforeCount = await page.evaluate(() => {
    const nodes = Array.from(document.querySelectorAll('[data-config-chip-index]'))
    const unique = new Set<string>()
    nodes.forEach((node) => {
      const value = node.getAttribute('data-config-chip-index')
      if (value) unique.add(value)
    })
    return unique.size
  })
  const chip = page.locator(`[data-config-chip-index="${index}"]`).first()
  await chip.scrollIntoViewIfNeeded()
  await page.keyboard.press('Escape')
  await page.evaluate(() => {
    const overlays = document.querySelectorAll('vite-plugin-checker-error-overlay')
    overlays.forEach((node) => node.remove())
  })
  await openContextMenu(page, chip)
  await page.getByRole('menuitem', { name: /Duplicate/i }).click()
  await page.waitForFunction((prev) => {
    const nodes = Array.from(document.querySelectorAll('[data-config-chip-index]'))
    const unique = new Set<string>()
    nodes.forEach((node) => {
      const value = node.getAttribute('data-config-chip-index')
      if (value) unique.add(value)
    })
    return unique.size === prev + 1
  }, beforeCount, { timeout: PLAYWRIGHT_TIMEOUTS.expectLong })
}

test.beforeAll(async ({ browser }) => {
  // Allow the long timeout so the cold Vite compile can finish during warmup.
  test.setTimeout(PLAYWRIGHT_TIMEOUTS.testLong)
  // Preload the shell once so matcher tests avoid cold-start delays.
  await warmupAppShell(browser)
})

test.describe('tester grid matches remain stable', () => {
  test('duplicating config #3 keeps tester outcomes unchanged', async ({ page }) => {
    // Allow the long timeout for matcher rebuilds during duplication.
    test.setTimeout(PLAYWRIGHT_TIMEOUTS.testLong)
    await prepareApp(page)
    await seedTesterFilters(page)
    // Load the shell without waiting for the full window load event.
    await page.goto('/', APP_GOTO_OPTIONS)
    await dismissBlockingDialogs(page)

    // Load the HSFC + gear DB pair from the shared fixtures.
    const hsfcInput = page.locator('input[type="file"][accept*=".hsfc"]').first()
    await hsfcInput.setInputFiles(HSFC_PATH)
    const dbInput = page.locator('input[type="file"][accept*=".db"]').first()
    await dbInput.setInputFiles(DB_PATH)
    await dismissBlockingDialogs(page)

    // Re-check for late dialogs before waiting on the tester grid.
    await dismissBlockingDialogs(page)
    // Ensure the tester mode toggle is active before reading grid results.
    await ensureTesterMode(page)

    await waitForTesterGrid(page)
    await waitForMatchingResults(page)
    const initialRows = await readGridSnapshot(page)
    // Ensure we actually have grid data before we mutate configs.
    expect(initialRows.length).toBeGreaterThan(0)

    await duplicateConfigChip(page, TARGET_CONFIG_INDEX)
    await waitForTesterGrid(page)
    await waitForMatchingResults(page)
    const postDuplicateRows = await readGridSnapshot(page)
    expect(postDuplicateRows.length).toBe(initialRows.length)

    // Config duplication may shift cfgIdx, but keep/sell calls for each artifact must stay consistent.
    expect(postDuplicateRows).toEqual(initialRows)
  })
})
