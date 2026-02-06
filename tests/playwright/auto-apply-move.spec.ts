import fs from 'node:fs'
import type { Page, Locator } from '@playwright/test'
import { test, expect } from './fixtures'
import { APP_GOTO_OPTIONS, APP_VERSION, prepareApp } from './app-init'
import { openContextMenu } from './context-menu'
import { dismissBlockingDialogs, RESTORE_DIALOG_TITLE } from './dialog-helpers'
import { PLAYWRIGHT_TIMEOUTS } from './timeouts'
import { SAMPLE_SMALL_HSFC_PATH } from './fixture-paths'
import { warmupAppShell } from './app-warmup'
import { AUTOSAVE_KEY } from '../../src/lib/constants'
import { computeCrc32 } from '../../src/lib/autosave'

// Load the slim HSFC snapshot so the config names are stable and rebuilds stay fast.
const HSFC_PATH = SAMPLE_SMALL_HSFC_PATH
// Target config names used throughout the auto-apply checks.
const MARIUS_CONFIG_NAME = 'Optional: Marius Sets'
const BASICS_CONFIG_NAME = 'Basics'
const SELL_LOW_VALUE_CONFIG_NAME = 'Sell - Low Value'
// Base stat labels used for the dirty builder edits.
const MAIN_STAT_LABEL = 'SPD'
const SUBSTAT_LABEL = 'ACC'

const AUTO_APPLY_AUTOSAVE_ENTRY = (() => {
  // Read the HSFC fixture so we can seed autosave without file upload latency.
  const raw = fs.readFileSync(HSFC_PATH, 'utf-8')
  // Parse the HSFC JSON into a payload we can attach autosave metadata to.
  const payload = JSON.parse(raw) as Record<string, unknown>
  // Ensure the payload uses the current app version for restore dialogs.
  const autosavePayload = {
    ...payload,
    Version: APP_VERSION,
    AutosaveSavedAt: '2024-12-12T00:00:00.000Z',
  }
  // Serialize once so we can compute the CRC in the same format as the app.
  const serialized = JSON.stringify(autosavePayload)
  // Compute the autosave CRC so the restore prompt accepts the payload.
  const crc = computeCrc32(serialized)
  return JSON.stringify([crc, autosavePayload])
})()

const getConfigChipByName = (page: Page, name: string): Locator => {
  // Scope to config chips to avoid matching menus or preview rows.
  return page.locator('[data-config-chip="true"]', { hasText: name }).first()
}

const getConfigChipByIndex = (page: Page, index: number): Locator => {
  // Read by data attribute so the selector stays stable after reorders.
  return page.locator(`[data-config-chip-index="${index}"]`).first()
}

const getConfigNameInput = (page: Page): Locator => {
  // Use the textbox role to avoid matching the clear-name button.
  return page.getByRole('textbox', { name: 'Config Name' })
}

const ensureChipSelected = async (chip: Locator): Promise<void> => {
  // Skip clicking when the chip already reports the selected tour id.
  const selected = await chip.getAttribute('data-tour-id')
  if (selected === 'chip.selected') return
  // Click the chip to activate its config.
  await chip.click()
}

const getMainStatGroup = (page: Page): Locator => {
  // Scope to the main stat panel so buttons are unambiguous.
  return page.locator('[data-tour-id="builder.mainstat"]')
}

const getSubstatGroup = (page: Page): Locator => {
  // Scope to the substat panel so buttons are unambiguous.
  return page.locator('[data-tour-id="builder.substats"]')
}

const escapeForRegex = (value: string): string => {
  // Escape user-facing labels so regex matching stays literal.
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

const getStatButton = (group: Locator, label: string): Locator => {
  // Match loosely so extra indicator text does not break selectors.
  const pattern = new RegExp(escapeForRegex(label))
  // Resolve the toggle button by visible text inside the group.
  return group.getByRole('button', { name: pattern }).first()
}

const expectStatSelected = async (button: Locator): Promise<void> => {
  // Selected toggles add the Mui-selected class in MUI.
  await expect(button).toHaveClass(/Mui-selected/)
}

const expectStatNotSelected = async (button: Locator): Promise<void> => {
  // Unselected toggles should not carry the selection class.
  await expect(button).not.toHaveClass(/Mui-selected/)
}

const openApplyContextMenu = async (page: Page): Promise<void> => {
  // The Apply button hosts the auto-apply toggle in its context menu.
  const applyButton = page.getByRole('button', { name: /Apply as Config/i }).first()
  // Wait for the button so the menu is anchored correctly.
  await expect(applyButton).toBeVisible()
  // Open the context menu with cross-browser fallbacks.
  await openContextMenu(page, applyButton)
}

const enableAutoApply = async (page: Page): Promise<void> => {
  // Open the Apply button menu so we can toggle auto-apply.
  await openApplyContextMenu(page)
  // Click the menu entry that enables auto apply.
  const menuItem = page.getByRole('menuitem', { name: 'Auto Apply to Selected Config' })
  // Ensure the item is visible before interacting.
  await expect(menuItem).toBeVisible()
  // Toggle the checkbox entry on.
  await menuItem.click()
  // Close the menu explicitly so the dialog does not linger.
  await page.keyboard.press('Escape')
  // Ensure the menu closes after the action.
  await expect(menuItem).toBeHidden()
}

const acceptConfigAutosaveRestore = async (page: Page): Promise<void> => {
  // Locate the restore dialog that appears when autosave data exists.
  const dialog = page.getByRole('dialog', { name: RESTORE_DIALOG_TITLE })
  // Allow app boot time so the dialog has a chance to render.
  await dialog.waitFor({ state: 'visible', timeout: PLAYWRIGHT_TIMEOUTS.appGoto }).catch(() => undefined)
  // Skip when no restore prompt is displayed.
  const isVisible = await dialog.isVisible().catch(() => false)
  if (!isVisible) return
  // Ensure configs are selected so the builder list is restored.
  const configsCheckbox = dialog.getByRole('checkbox', { name: /Configs/i })
  if (await configsCheckbox.isVisible().catch(() => false)) {
    if (!(await configsCheckbox.isChecked().catch(() => false))) {
      await configsCheckbox.click()
    }
  }
  // Restore the autosave so the configs become available for testing.
  const restoreButton = dialog.getByRole('button', { name: /Restore selected/i })
  await expect(restoreButton).toBeEnabled({ timeout: PLAYWRIGHT_TIMEOUTS.expectDefault })
  await restoreButton.click()
  // Wait for the dialog to dismiss before continuing.
  await expect(dialog).toBeHidden({ timeout: PLAYWRIGHT_TIMEOUTS.expectDefault })
}

const clickChipControlButton = async (chip: Locator, controlIndex: number): Promise<void> => {
  // Chip controls are ordered: Move Up, Move Down, Duplicate, Delete.
  const controls = chip.locator('[data-chip-control="true"] button')
  // Click the control at the requested index.
  await controls.nth(controlIndex).click()
}

const moveChipUp = async (chip: Locator): Promise<void> => {
  // Use the dedicated Move Up button.
  await clickChipControlButton(chip, 0)
}

const moveChipDown = async (chip: Locator): Promise<void> => {
  // Use the dedicated Move Down button.
  await clickChipControlButton(chip, 1)
}

const moveChipToTop = async (page: Page, chip: Locator): Promise<void> => {
  // Open the chip context menu so we can access Move to Top.
  await openContextMenu(page, chip)
  // Choose the Move to Top entry from the menu.
  await page.getByRole('menuitem', { name: 'Move to Top' }).click()
}

const moveChipToBottom = async (page: Page, chip: Locator): Promise<void> => {
  // Open the chip context menu so we can access Move to Bottom.
  await openContextMenu(page, chip)
  // Choose the Move to Bottom entry from the menu.
  await page.getByRole('menuitem', { name: 'Move to Bottom' }).click()
}

const expectBuilderStats = async (page: Page, options: { main: string; substat: string; selected: boolean }): Promise<void> => {
  // Resolve the main stat toggle inside the main stat group.
  const mainButton = getStatButton(getMainStatGroup(page), options.main)
  // Resolve the substat toggle inside the substat group.
  const subButton = getStatButton(getSubstatGroup(page), options.substat)
  // Assert selection state for both toggles.
  if (options.selected) {
    await expectStatSelected(mainButton)
    await expectStatSelected(subButton)
  } else {
    await expectStatNotSelected(mainButton)
    await expectStatNotSelected(subButton)
  }
}

const setupAutoApplyScenario = async (page: Page): Promise<void> => {
  // Reset storage and seed a stable locale for selectors.
  await prepareApp(page)
  // Seed the autosave payload so we can restore without file uploads.
  await page.addInitScript(
    ({ autosaveKey, autosaveValue }) => {
      try {
        window.localStorage.setItem(autosaveKey, autosaveValue)
      } catch {
        /* ignore storage failures so the test can continue */
      }
    },
    {
      autosaveKey: AUTOSAVE_KEY,
      autosaveValue: AUTO_APPLY_AUTOSAVE_ENTRY,
    },
  )
  // Load the app shell without waiting for full load.
  await page.goto('/', APP_GOTO_OPTIONS)
  // Accept the restore prompt so the autosave configs load into the builder.
  await acceptConfigAutosaveRestore(page)

  // Close any note/restore dialogs if they auto-open.
  await dismissBlockingDialogs(page)

  // Wait for any config chip so we know the import finished.
  await expect(page.locator('[data-config-chip="true"]').first()).toBeVisible({ timeout: PLAYWRIGHT_TIMEOUTS.expectLong })

  // Click the chip to select config #2.
  await ensureChipSelected(getConfigChipByName(page, MARIUS_CONFIG_NAME))
  // Confirm the builder is showing the Marius config.
  await expect(getConfigNameInput(page)).toHaveValue(MARIUS_CONFIG_NAME)

  // Enable auto apply so selection changes flush edits.
  await enableAutoApply(page)

  // Resolve the main stat toggle and ensure it starts unselected.
  const mainStatButton = getStatButton(getMainStatGroup(page), MAIN_STAT_LABEL)
  await expectStatNotSelected(mainStatButton)
  // Toggle the main stat on.
  await mainStatButton.click()
  // Ensure the toggle reflects the selection.
  await expectStatSelected(mainStatButton)
  // Resolve the substat toggle and ensure it starts unselected.
  const substatButton = getStatButton(getSubstatGroup(page), SUBSTAT_LABEL)
  await expectStatNotSelected(substatButton)
  // Toggle the substat on.
  await substatButton.click()
  // Ensure the toggle reflects the selection.
  await expectStatSelected(substatButton)
}

test.describe('auto apply move', () => {
  // Extend timeouts for all hooks/tests so autosave restore does not trip the default 15s limit.
  test.describe.configure({ timeout: PLAYWRIGHT_TIMEOUTS.testHeavy })

  test.beforeAll(async ({ browser }) => {
    // Allow the long timeout so the cold Vite compile can finish during warmup.
    test.setTimeout(PLAYWRIGHT_TIMEOUTS.testHeavy)
    // Preload the shell once so the first test does not pay the compile cost.
    await warmupAppShell(browser)
  })

  test.beforeEach(async ({ page }) => {
    // Allow the long timeout so autosave restore completes on slower hosts.
    test.setTimeout(PLAYWRIGHT_TIMEOUTS.testHeavy)
    // Reset the app state before each move test to keep scenarios isolated.
    await setupAutoApplyScenario(page)
  })

  test('auto apply stays on the moved config for move up/down', async ({ page }) => {
    // Allow time for HSFC parsing and the rebuild it triggers.
    test.setTimeout(PLAYWRIGHT_TIMEOUTS.testHeavy)

  // Move Up using the chip button while the builder is dirty.
  await moveChipUp(getConfigChipByName(page, MARIUS_CONFIG_NAME))
  // Auto-apply should persist the dirty builder state before assertions.
  // Confirm the Marius chip is now at index 0.
  await expect(getConfigChipByName(page, MARIUS_CONFIG_NAME)).toHaveAttribute('data-config-chip-index', '0')
  // Re-select the moved config and confirm edits persisted.
  await ensureChipSelected(getConfigChipByName(page, MARIUS_CONFIG_NAME))
  await expect(getConfigNameInput(page)).toHaveValue(MARIUS_CONFIG_NAME)
  await expectBuilderStats(page, { main: MAIN_STAT_LABEL, substat: SUBSTAT_LABEL, selected: true })
  // Select the config that swapped into index 1 (Basics) and ensure it stayed clean.
  await ensureChipSelected(getConfigChipByIndex(page, 1))
  await expect(getConfigNameInput(page)).toHaveValue(BASICS_CONFIG_NAME)
  await expectBuilderStats(page, { main: MAIN_STAT_LABEL, substat: SUBSTAT_LABEL, selected: false })

  // Move Down back to index 1 using the chip button.
  await ensureChipSelected(getConfigChipByName(page, MARIUS_CONFIG_NAME))
  await moveChipDown(getConfigChipByName(page, MARIUS_CONFIG_NAME))
  // Auto-apply should persist the dirty builder state before assertions.
  // Confirm the Marius chip is now at index 1.
  await expect(getConfigChipByName(page, MARIUS_CONFIG_NAME)).toHaveAttribute('data-config-chip-index', '1')
  // Re-select the moved config and confirm edits persisted.
  await ensureChipSelected(getConfigChipByName(page, MARIUS_CONFIG_NAME))
  await expect(getConfigNameInput(page)).toHaveValue(MARIUS_CONFIG_NAME)
  await expectBuilderStats(page, { main: MAIN_STAT_LABEL, substat: SUBSTAT_LABEL, selected: true })
  // Ensure Basics still has no edits after swapping back.
  await ensureChipSelected(getConfigChipByIndex(page, 0))
  await expect(getConfigNameInput(page)).toHaveValue(BASICS_CONFIG_NAME)
  await expectBuilderStats(page, { main: MAIN_STAT_LABEL, substat: SUBSTAT_LABEL, selected: false })
  })

  test('auto apply stays on the moved config for move to top', async ({ page }) => {
    // Allow time for HSFC parsing and the rebuild it triggers.
    test.setTimeout(PLAYWRIGHT_TIMEOUTS.testHeavy)

  // Move to Top via the context menu entry.
  await ensureChipSelected(getConfigChipByName(page, MARIUS_CONFIG_NAME))
  await moveChipToTop(page, getConfigChipByName(page, MARIUS_CONFIG_NAME))
  // Auto-apply should persist the dirty builder state before assertions.
  // Confirm the Marius chip is now at index 0.
  await expect(getConfigChipByName(page, MARIUS_CONFIG_NAME)).toHaveAttribute('data-config-chip-index', '0')
  // Re-select the moved config and confirm edits persisted.
  await ensureChipSelected(getConfigChipByName(page, MARIUS_CONFIG_NAME))
  await expect(getConfigNameInput(page)).toHaveValue(MARIUS_CONFIG_NAME)
  await expectBuilderStats(page, { main: MAIN_STAT_LABEL, substat: SUBSTAT_LABEL, selected: true })
  // Ensure Basics remained unchanged after moving to top.
  await ensureChipSelected(getConfigChipByIndex(page, 1))
  await expect(getConfigNameInput(page)).toHaveValue(BASICS_CONFIG_NAME)
  await expectBuilderStats(page, { main: MAIN_STAT_LABEL, substat: SUBSTAT_LABEL, selected: false })
  })

  test('auto apply stays on the moved config for move to bottom', async ({ page }) => {
    // Allow time for HSFC parsing and the rebuild it triggers.
    test.setTimeout(PLAYWRIGHT_TIMEOUTS.testHeavy)

  // Move to Bottom via the context menu entry.
  await ensureChipSelected(getConfigChipByName(page, MARIUS_CONFIG_NAME))
  await moveChipToBottom(page, getConfigChipByName(page, MARIUS_CONFIG_NAME))
  // Auto-apply should persist the dirty builder state before assertions.
  // Compute the last index so we can confirm the chip moved to the end.
  const chipCount = await page.locator('[data-config-chip="true"]').count()
  const lastIndex = Math.max(0, chipCount - 1)
  // Confirm the Marius chip is now at the last index.
  await expect(getConfigChipByName(page, MARIUS_CONFIG_NAME)).toHaveAttribute('data-config-chip-index', String(lastIndex))
  // Re-select the moved config and confirm edits persisted.
  await ensureChipSelected(getConfigChipByName(page, MARIUS_CONFIG_NAME))
  await expect(getConfigNameInput(page)).toHaveValue(MARIUS_CONFIG_NAME)
  await expectBuilderStats(page, { main: MAIN_STAT_LABEL, substat: SUBSTAT_LABEL, selected: true })
  // Ensure the config now at index 1 did not inherit the edits.
  await ensureChipSelected(getConfigChipByIndex(page, 1))
  await expect(getConfigNameInput(page)).toHaveValue(SELL_LOW_VALUE_CONFIG_NAME)
  await expectBuilderStats(page, { main: MAIN_STAT_LABEL, substat: SUBSTAT_LABEL, selected: false })
  })
})
