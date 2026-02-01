import type { Page, Locator } from '@playwright/test'
import { test, expect } from './fixtures'
import { APP_GOTO_OPTIONS, prepareApp } from './app-init'
import { openContextMenu } from './context-menu'
import { dismissBlockingDialogs } from './dialog-helpers'
import { PLAYWRIGHT_TIMEOUTS } from './timeouts'
import { SAMPLE_SMALL_HSFC_PATH } from './fixture-paths'
import { warmupAppShell } from './app-warmup'
import { HSFC_LOAD_INPUT_SELECTOR } from './ui-selectors'

// Load the slim HSFC snapshot so the config names are stable and rebuilds stay fast.
const HSFC_PATH = SAMPLE_SMALL_HSFC_PATH
// Target config names used throughout the auto-apply checks.
const MARIUS_CONFIG_NAME = 'Optional: Marius Sets'
const BASICS_CONFIG_NAME = 'Basics'
const SELL_LOW_VALUE_CONFIG_NAME = 'Sell - Low Value'
// Base stat labels used for the dirty builder edits.
const MAIN_STAT_LABEL = 'SPD'
const SUBSTAT_LABEL = 'ACC'

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
  // Load the app shell without waiting for full load.
  await page.goto('/', APP_GOTO_OPTIONS)

  // Import the HSFC snapshot that includes the Marius config.
  // Use the stable test selector so the localized label can change safely.
  const hsfcInput = page.locator(HSFC_LOAD_INPUT_SELECTOR).first()
  // Ensure the file input is attached before setting files.
  await hsfcInput.waitFor({ state: 'attached', timeout: PLAYWRIGHT_TIMEOUTS.appGoto })
  // Use the file input so the normal import path runs.
  await hsfcInput.setInputFiles(HSFC_PATH)

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

test.beforeAll(async ({ browser }) => {
  // Allow the long timeout so the cold Vite compile can finish during warmup.
  test.setTimeout(PLAYWRIGHT_TIMEOUTS.testLong)
  // Preload the shell once so the first test does not pay the compile cost.
  await warmupAppShell(browser)
})

test('auto apply stays on the moved config for move up/down', async ({ page }) => {
  // Allow time for HSFC parsing and the rebuild it triggers.
  test.setTimeout(PLAYWRIGHT_TIMEOUTS.testLong)
  // Prime the config state and dirty builder for the move checks.
  await setupAutoApplyScenario(page)

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
  test.setTimeout(PLAYWRIGHT_TIMEOUTS.testLong)
  // Prime the config state and dirty builder for the move checks.
  await setupAutoApplyScenario(page)

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
  test.setTimeout(PLAYWRIGHT_TIMEOUTS.testLong)
  // Prime the config state and dirty builder for the move checks.
  await setupAutoApplyScenario(page)

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
