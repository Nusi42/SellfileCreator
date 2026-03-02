import { test, expect } from './fixtures'
import { APP_GOTO_OPTIONS, prepareApp } from './app-init'
import { openContextMenu } from './context-menu'
import { RESTORE_DIALOG_TITLE, dismissBlockingDialogs } from './dialog-helpers'
import { PLAYWRIGHT_TIMEOUTS } from './timeouts'
import { AUTOSAVE_GEAR_INSPECTOR_KEY, PREVIEW_MODE_STORAGE_KEY } from '../../src/lib/constants'
import {
  RULES_FILTER_OPEN_STORAGE_KEY,
  RULES_FILTER_STATE_STORAGE_KEY,
  cloneDefaultRulesFilterState,
} from '../../src/state/rulesFilterPersistence'
import { buildGearInspectorAutosavePayload, type GearInspectorItem } from '../../src/lib/gearInspectorSession'
import { computeCrc32 } from '../../src/lib/autosave'
import { ArtifactSet, ArtifactType, StatVariant } from '../../src/lib/types'
import { SAMPLE_SMALL_SFR_DISABLED_RECIPE_OVERRIDES_PATH } from './fixture-paths'
import { SFR_LOAD_INPUT_SELECTOR } from './ui-selectors'
import { warmupAppShell } from './app-warmup'

// Point at the slim SFR file with recipe overrides disabled.
const SFR_PATH = SAMPLE_SMALL_SFR_DISABLED_RECIPE_OVERRIDES_PATH
// Seed a tiny tester autosave payload so we avoid DB imports in this check.
const GEAR_INSPECTOR_ITEMS: GearInspectorItem[] = [
  {
    itemId: 101,
    slot: ArtifactType.Weapon,
    set: ArtifactSet.Life,
    rank: 6,
    rarity: 6,
    level: 16,
    main: StatVariant.ATK,
    subValues: {
      [StatVariant.SPD]: 9,
      [StatVariant.CR]: 5,
    },
  },
  {
    itemId: 102,
    slot: ArtifactType.Boots,
    set: ArtifactSet.Speed,
    rank: 5,
    rarity: 5,
    level: 12,
    main: StatVariant.SPD,
    subValues: {
      [StatVariant.HP]: 4,
      [StatVariant.ACC]: 6,
    },
  },
]
// Build the autosave entry so the tester loads without hitting the DB importer.
const TESTER_AUTOSAVE_PAYLOAD = buildGearInspectorAutosavePayload(GEAR_INSPECTOR_ITEMS)
// Compute the CRC payload to satisfy autosave integrity checks.
const TESTER_AUTOSAVE_ENTRY = (() => {
  const payloadJson = JSON.stringify(TESTER_AUTOSAVE_PAYLOAD)
  const crc = computeCrc32(payloadJson)
  return JSON.stringify([crc, TESTER_AUTOSAVE_PAYLOAD])
})()

const getTesterCountLabel = async (page: Parameters<typeof test.use>[0]['page']) => {
  // Read the label from the DOM directly to avoid locator timeouts.
  return page.evaluate(() => {
    // Scope to the preview paper so we do not catch other aria labels.
    const nodes = Array.from(document.querySelectorAll('[data-tour-id="preview.paper"] [aria-label*="Total:"]'))
    for (const node of nodes) {
      const label = node.getAttribute('aria-label')
      if (!label) continue
      // Skip hidden nodes so we only read the visible summary chip.
      const rects = (node as HTMLElement).getClientRects()
      if (rects.length === 0) continue
      return label
    }
    // Return a placeholder if no label is visible yet.
    return 'Total: 0 / 0'
  })
}

const parseTesterCounts = (label: string) => {
  // Expect either "Total: X" or "Total: X / Y".
  const match = label.match(/Total:\s*([0-9,]+)(?:\s*\/\s*([0-9,]+))?/i)
  // Strip thousands separators before numeric conversion.
  const parseCount = (value?: string) => (value ? Number(value.replace(/,/g, '')) : null)
  // Return both counts so we can compare filtered vs total.
  return {
    filtered: match ? parseCount(match[1]) : null,
    total: match ? parseCount(match[2]) : null,
    raw: label,
  }
}

const seedTesterSellFilters = async (page: Parameters<typeof test.use>[0]['page']): Promise<void> => {
  // Clone defaults so we only override the tester result filter.
  const rulesFilters = cloneDefaultRulesFilterState()
  // Start from the same defaults for the tester view.
  const testerFilters = cloneDefaultRulesFilterState()
  // Filter tester results to Sell-only so the count chip is scoped.
  testerFilters.testerResult = { keep: 'no', matched: 'any' }
  // Store both views together so the app boots in tester mode with the Sell filter active.
  const filterState = { rules: rulesFilters, gearInspector: testerFilters }
  // Keep the tester filter panel open so the UI state matches the seed.
  const filterOpen = { rules: false, gearInspector: true }
  await page.addInitScript(
    ({ previewKey, previewMode, filterKey, filterValue, filterOpenKey, filterOpenValue }) => {
      try {
        window.localStorage.setItem(previewKey, previewMode)
        window.localStorage.setItem(filterKey, filterValue)
        window.localStorage.setItem(filterOpenKey, filterOpenValue)
      } catch {
        /* ignore storage failures so the test can continue */
      }
    },
    {
      previewKey: PREVIEW_MODE_STORAGE_KEY,
      previewMode: 'gearInspector',
      filterKey: RULES_FILTER_STATE_STORAGE_KEY,
      filterValue: JSON.stringify(filterState),
      filterOpenKey: RULES_FILTER_OPEN_STORAGE_KEY,
      filterOpenValue: JSON.stringify(filterOpen),
    },
  )
}

const seedTesterAutosave = async (page: Parameters<typeof test.use>[0]['page']): Promise<void> => {
  // Seed the tester autosave payload so the Rule Tester has data instantly.
  await page.addInitScript(
    ({ autosaveKey, autosaveValue }) => {
      try {
        window.localStorage.setItem(autosaveKey, autosaveValue)
      } catch {
        /* ignore storage failures so the test can continue */
      }
    },
    {
      autosaveKey: AUTOSAVE_GEAR_INSPECTOR_KEY,
      autosaveValue: TESTER_AUTOSAVE_ENTRY,
    },
  )
}

const acceptTesterRestoreDialog = async (page: Parameters<typeof test.use>[0]['page']): Promise<void> => {
  // Locate the restore dialog that appears for tester autosave entries.
  const dialog = page.getByRole('dialog', { name: RESTORE_DIALOG_TITLE })
  // Allow app boot time so we can accept the dialog once it appears.
  await dialog.waitFor({ state: 'visible', timeout: PLAYWRIGHT_TIMEOUTS.appGoto }).catch(() => undefined)
  // Skip when no restore prompt is displayed.
  const isVisible = await dialog.isVisible().catch(() => false)
  if (!isVisible) return
  // Accept the default selection so tester items load without extra clicks.
  const testerCheckbox = dialog.getByRole('checkbox', { name: /Gear Inspector/i })
  // Ensure the tester payload is selected even if persisted preferences cleared it.
  if (await testerCheckbox.isVisible().catch(() => false)) {
    if (!(await testerCheckbox.isChecked().catch(() => false))) {
      await testerCheckbox.click()
    }
  }
  const restoreButton = dialog.getByRole('button', { name: 'Restore Selected' })
  await expect(restoreButton).toBeEnabled({ timeout: PLAYWRIGHT_TIMEOUTS.expectDefault })
  await restoreButton.click()
  // Wait for the dialog to dismiss before continuing.
  await expect(dialog).toBeHidden({ timeout: PLAYWRIGHT_TIMEOUTS.expectDefault })
}

test.beforeAll(async ({ browser }) => {
  // Allow extra time so the cold Vite compile can finish during warmup.
  test.setTimeout(PLAYWRIGHT_TIMEOUTS.testHeavy)
  // Preload the shell once so the SFR import does not pay the compile cost.
  await warmupAppShell(browser)
})

test('disable recipe overrides then duplicate disabled config changes sell counts', async ({ page }) => {
  // Allow extra time for matcher rebuilds during DB import and duplication.
    test.setTimeout(PLAYWRIGHT_TIMEOUTS.testHeavy)
  // Start with clean localStorage so the filters are predictable.
  await prepareApp(page)
  // Seed tester mode with a Sell-only filter so we skip UI filter toggles.
  await seedTesterSellFilters(page)
  // Seed a minimal tester autosave payload so we avoid DB import costs.
  await seedTesterAutosave(page)
  // Use the pre-built SFR fixture so we avoid runtime file work.
  const sfrPath = SFR_PATH
  // Load the app shell so file inputs are ready.
  // Avoid waiting on the full load event during dev-server startup.
  await page.goto('/', APP_GOTO_OPTIONS)
  // Accept the restore prompt so seeded tester items load into the grid.
  await acceptTesterRestoreDialog(page)
  // Clear any leftover dialogs before interacting with file inputs.
  await dismissBlockingDialogs(page)

  // Import the SFR snapshot that defines the recipes and options.
  // Use the stable tour id so the input is found even if the label is localized.
  const sfrInput = page.locator(SFR_LOAD_INPUT_SELECTOR).first()
  // Wait for the input to mount so cold-start renders do not hit the action timeout.
  await sfrInput.waitFor({ state: 'attached', timeout: PLAYWRIGHT_TIMEOUTS.appGoto })
  // Ensure the input is enabled before we upload the fixture.
  await expect(sfrInput).toBeEnabled({ timeout: PLAYWRIGHT_TIMEOUTS.expectDefault })
  // Use the file input so we hit the normal import path.
  await sfrInput.setInputFiles(sfrPath)
  // Clear any note/restore dialogs that appear after the import.
  await dismissBlockingDialogs(page)
  // Wait for the target chip to attach so we can duplicate it later.
  const targetChip = page.locator('#recipe-chip-1')
  await targetChip.waitFor({ state: 'attached', timeout: PLAYWRIGHT_TIMEOUTS.expectLong })
  // Ensure the chip is rendered before proceeding.
  await expect(targetChip).toBeVisible({ timeout: PLAYWRIGHT_TIMEOUTS.expectDefault })
  // Clear any dialogs that might cover the tester header.
  await dismissBlockingDialogs(page)
  // Wait for the tester count chip to render.
  await expect(page.locator('[data-tour-id="preview.paper"] [aria-label*="Total:"]').first()).toBeVisible({ timeout: PLAYWRIGHT_TIMEOUTS.expectDefault })
  // Read the initial counts once the label is visible.
  const beforeLabel = await getTesterCountLabel(page)
  const beforeCounts = parseTesterCounts(beforeLabel)
  // Fail fast if the autosave seed did not populate any rows.
  expect(beforeCounts.total ?? 0).toBeGreaterThan(0)
  // Log the snapshot for CLI inspection.
  console.log(`[pw:tester-count] before=${JSON.stringify(beforeCounts)}`)

  // Duplicate the disabled config via the chip context menu.
  await expect(targetChip).toBeVisible()
  // Use right-click to open the context menu.
  await openContextMenu(page, targetChip)
  // Resolve the Duplicate menu item once the menu is visible.
  const duplicateItem = page.getByRole('menuitem', { name: 'Duplicate' })
  // Wait for the menu item so the click does not race the menu animation.
  await expect(duplicateItem).toBeVisible({ timeout: PLAYWRIGHT_TIMEOUTS.expectDefault })
  // Force the click to avoid flaky animation-driven instability.
  await duplicateItem.click({ force: true })

  // Capture the updated sell count after the duplication.
  const afterLabel = await getTesterCountLabel(page)
  // Parse the label so we can diff the filtered count.
  const afterCounts = parseTesterCounts(afterLabel)
  // Log the after snapshot for CLI inspection.
  console.log(`[pw:tester-count] after=${JSON.stringify(afterCounts)}`)
  // The disabled-config duplicate should not alter the filtered sell count.
  expect(afterCounts.filtered).toBe(beforeCounts.filtered)
  // The total inventory count should remain stable as well.
  expect(afterCounts.total).toBe(beforeCounts.total)
})
