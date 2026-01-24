import path from 'node:path'
import type { Page, Locator } from '@playwright/test'
import { test, expect } from './fixtures'
import { APP_GOTO_OPTIONS, prepareApp } from './app-init'

// Load the shared HSFC snapshot so the config names are stable.
const HSFC_PATH = path.resolve(process.cwd(), 'tests', 'data', 'sample.hsfc')
// Wait past the auto-apply debounce so pending saves can flush.
const AUTO_APPLY_WAIT_MS = 700

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

const dismissNoteDialogIfPresent = async (page: Page): Promise<void> => {
  // The HSFC import can auto-open the note dialog after a short delay.
  const noteDialog = page.getByRole('dialog', { name: 'Note & Config Options' })
  // Wait briefly for the dialog to appear without failing if it does not.
  const opened = await noteDialog.waitFor({ state: 'visible', timeout: 10_000 }).then(() => true).catch(() => false)
  // Bail out when the dialog never appears.
  if (!opened) return
  // Close the dialog so it does not intercept pointer events.
  await noteDialog.getByRole('button', { name: 'Close' }).click()
  // Confirm the dialog is fully dismissed before continuing.
  await expect(noteDialog).toBeHidden({ timeout: 10_000 })
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
  await expect(applyButton).toBeVisible({ timeout: 15_000 })
  // Dispatch a contextmenu event so disabled state does not block the menu.
  await applyButton.dispatchEvent('contextmenu')
}

const enableAutoApply = async (page: Page): Promise<void> => {
  // Open the Apply button menu so we can toggle auto-apply.
  await openApplyContextMenu(page)
  // Click the menu entry that enables auto apply.
  const menuItem = page.getByRole('menuitem', { name: 'Auto Apply to Selected Config' })
  // Ensure the item is visible before interacting.
  await expect(menuItem).toBeVisible({ timeout: 10_000 })
  // Toggle the checkbox entry on.
  await menuItem.click()
  // Close the menu explicitly so the dialog does not linger.
  await page.keyboard.press('Escape')
  // Ensure the menu closes after the action.
  await expect(menuItem).toBeHidden({ timeout: 10_000 })
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
  await chip.click({ button: 'right' })
  // Choose the Move to Top entry from the menu.
  await page.getByRole('menuitem', { name: 'Move to Top' }).click()
}

const moveChipToBottom = async (page: Page, chip: Locator): Promise<void> => {
  // Open the chip context menu so we can access Move to Bottom.
  await chip.click({ button: 'right' })
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

const waitForAutoApply = async (page: Page): Promise<void> => {
  // Sleep past the debounce so auto-apply can fire.
  await page.waitForTimeout(AUTO_APPLY_WAIT_MS)
}

test('auto apply stays on the moved config for move up/down/top/bottom', async ({ page }) => {
  // Allow time for the large HSFC file to load.
  test.setTimeout(240000)
  // Reset storage and seed a stable locale for selectors.
  await prepareApp(page)
  // Load the app shell without waiting for full load.
  await page.goto('/', APP_GOTO_OPTIONS)

  // Import the HSFC snapshot that includes the Marius config.
  const hsfcInput = page.getByRole('button', { name: 'Load Configs (.hsfc)' }).locator('input[type="file"]')
  // Use the file input so the normal import path runs.
  await hsfcInput.setInputFiles(HSFC_PATH)

  // Close the note dialog if it auto-opens.
  await dismissNoteDialogIfPresent(page)

  // Wait for any config chip so we know the import finished.
  await expect(page.locator('[data-config-chip="true"]').first()).toBeVisible({ timeout: 60_000 })

  // Locate the Marius chip by name and ensure it is visible.
  const mariusName = 'Optional: Marius Sets'
  // Click the chip to select config #2.
  await getConfigChipByName(page, mariusName).click()
  // Confirm the builder is showing the Marius config.
  await expect(getConfigNameInput(page)).toHaveValue(mariusName)

  // Enable auto apply so selection changes flush edits.
  await enableAutoApply(page)

  // Click a main stat and substat so the builder becomes dirty.
  const mainStatLabel = 'SPD'
  const substatLabel = 'ACC'
  // Resolve the main stat toggle and ensure it starts unselected.
  const mainStatButton = getStatButton(getMainStatGroup(page), mainStatLabel)
  await expectStatNotSelected(mainStatButton)
  // Toggle the main stat on.
  await mainStatButton.click()
  // Ensure the toggle reflects the selection.
  await expectStatSelected(mainStatButton)
  // Resolve the substat toggle and ensure it starts unselected.
  const substatButton = getStatButton(getSubstatGroup(page), substatLabel)
  await expectStatNotSelected(substatButton)
  // Toggle the substat on.
  await substatButton.click()
  // Ensure the toggle reflects the selection.
  await expectStatSelected(substatButton)

  // Move Up using the chip button while the builder is dirty.
  await moveChipUp(getConfigChipByName(page, mariusName))
  // Allow auto-apply to flush after the move.
  await waitForAutoApply(page)
  // Confirm the Marius chip is now at index 0.
  await expect(getConfigChipByName(page, mariusName)).toHaveAttribute('data-config-chip-index', '0')
  // Re-select the moved config and confirm edits persisted.
  await getConfigChipByName(page, mariusName).click()
  await expect(getConfigNameInput(page)).toHaveValue(mariusName)
  await expectBuilderStats(page, { main: mainStatLabel, substat: substatLabel, selected: true })
  // Select the config that swapped into index 1 (Basics) and ensure it stayed clean.
  await getConfigChipByIndex(page, 1).click()
  await expect(getConfigNameInput(page)).toHaveValue('Basics')
  await expectBuilderStats(page, { main: mainStatLabel, substat: substatLabel, selected: false })

  // Move Down back to index 1 using the chip button.
  await getConfigChipByName(page, mariusName).click()
  await moveChipDown(getConfigChipByName(page, mariusName))
  // Allow auto-apply to flush after the move.
  await waitForAutoApply(page)
  // Confirm the Marius chip is now at index 1.
  await expect(getConfigChipByName(page, mariusName)).toHaveAttribute('data-config-chip-index', '1')
  // Re-select the moved config and confirm edits persisted.
  await getConfigChipByName(page, mariusName).click()
  await expect(getConfigNameInput(page)).toHaveValue(mariusName)
  await expectBuilderStats(page, { main: mainStatLabel, substat: substatLabel, selected: true })
  // Ensure Basics still has no edits after swapping back.
  await getConfigChipByIndex(page, 0).click()
  await expect(getConfigNameInput(page)).toHaveValue('Basics')
  await expectBuilderStats(page, { main: mainStatLabel, substat: substatLabel, selected: false })

  // Move to Top via the context menu entry.
  await getConfigChipByName(page, mariusName).click()
  await moveChipToTop(page, getConfigChipByName(page, mariusName))
  // Allow auto-apply to flush after the move.
  await waitForAutoApply(page)
  // Confirm the Marius chip is now at index 0.
  await expect(getConfigChipByName(page, mariusName)).toHaveAttribute('data-config-chip-index', '0')
  // Re-select the moved config and confirm edits persisted.
  await getConfigChipByName(page, mariusName).click()
  await expect(getConfigNameInput(page)).toHaveValue(mariusName)
  await expectBuilderStats(page, { main: mainStatLabel, substat: substatLabel, selected: true })
  // Ensure Basics remained unchanged after moving to top.
  await getConfigChipByIndex(page, 1).click()
  await expect(getConfigNameInput(page)).toHaveValue('Basics')
  await expectBuilderStats(page, { main: mainStatLabel, substat: substatLabel, selected: false })

  // Move to Bottom via the context menu entry.
  await getConfigChipByName(page, mariusName).click()
  await moveChipToBottom(page, getConfigChipByName(page, mariusName))
  // Allow auto-apply to flush after the move.
  await waitForAutoApply(page)
  // Compute the last index so we can confirm the chip moved to the end.
  const chipCount = await page.locator('[data-config-chip="true"]').count()
  const lastIndex = Math.max(0, chipCount - 1)
  // Confirm the Marius chip is now at the last index.
  await expect(getConfigChipByName(page, mariusName)).toHaveAttribute('data-config-chip-index', String(lastIndex))
  // Re-select the moved config and confirm edits persisted.
  await getConfigChipByName(page, mariusName).click()
  await expect(getConfigNameInput(page)).toHaveValue(mariusName)
  await expectBuilderStats(page, { main: mainStatLabel, substat: substatLabel, selected: true })
  // Ensure the config now at index 1 did not inherit the edits.
  await getConfigChipByIndex(page, 1).click()
  await expect(getConfigNameInput(page)).toHaveValue('Sell - Low Value')
  await expectBuilderStats(page, { main: mainStatLabel, substat: substatLabel, selected: false })
})
