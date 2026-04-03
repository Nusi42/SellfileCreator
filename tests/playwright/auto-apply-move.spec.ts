import fs from 'node:fs'
import type { Page, Locator } from '@playwright/test'
import { test, expect } from './fixtures'
import { APP_GOTO_OPTIONS, APP_VERSION, prepareApp } from './app-init'
import { openContextMenu } from './context-menu'
import { dismissBlockingDialogs, RESTORE_DIALOG_TITLE } from './dialog-helpers'
import { PLAYWRIGHT_TIMEOUTS } from './timeouts'
import { SAMPLE_SMALL_SFC_PATH } from './fixture-paths'
import { warmupAppShell } from './app-warmup'
import { AUTOSAVE_KEY } from '../../src/lib/constants'
import { computeCrc32 } from '../../src/lib/autosave'

// Load the slim SFC snapshot so the recipe names are stable and rebuilds stay fast.
const SFC_PATH = SAMPLE_SMALL_SFC_PATH
// Target recipe names used throughout the auto-apply checks.
const MARIUS_RECIPE_NAME = 'Optional: Marius Sets'
const BASICS_RECIPE_NAME = 'Basics'
const SELL_LOW_VALUE_RECIPE_NAME = 'Sell - Low Value'
// Base stat labels used for the dirty builder edits.
const MAIN_STAT_LABEL = 'SPD'
const SUBSTAT_LABEL = 'ACC'

const AUTO_APPLY_AUTOSAVE_ENTRY = (() => {
  // Read the SFC fixture so we can seed autosave without file upload latency.
  const raw = fs.readFileSync(SFC_PATH, 'utf-8')
  // Parse the SFC JSON into a payload we can attach autosave metadata to.
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

const getRecipeChipByName = (page: Page, name: string): Locator => {
  // Scope to recipe chips to avoid matching menus or preview rows.
  return page.locator('[data-recipe-chip="true"]', { hasText: name }).first()
}

const getRecipeChipByIndex = (page: Page, index: number): Locator => {
  // Read by data attribute so the selector stays stable after reorders.
  return page.locator(`[data-recipe-chip-index="${index}"]`).first()
}

const getRecipeNameInput = (page: Page): Locator => {
  // Use the textbox role to avoid matching the clear-name button.
  // Keep the legacy Config fallback in case old autosave/UI labels surface.
  return page.getByRole('textbox', { name: /(?:Recipe|Config) Name/i })
}

const ensureChipSelected = async (chip: Locator): Promise<void> => {
  // Skip clicking when the chip already reports the selected tour id.
  const selected = await chip.getAttribute('data-tour-id')
  if (selected === 'chip.selected') return
  // Click the chip to activate its recipe.
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
  // Keep the legacy Config fallback in case old autosave/UI labels surface.
  const applyButton = page.getByRole('button', { name: /Apply as (?:Recipe|Config)/i }).first()
  // Wait for the button so the menu is anchored correctly.
  await expect(applyButton).toBeVisible()
  // Open the context menu with cross-browser fallbacks.
  await openContextMenu(page, applyButton)
}

const enableAutoApply = async (page: Page): Promise<void> => {
  // Open the Apply button menu so we can toggle auto-apply.
  await openApplyContextMenu(page)
  // Click the menu entry that enables auto apply.
  // Keep the legacy Config fallback in case old autosave/UI labels surface.
  const menuItem = page.getByRole('menuitem', { name: /Auto Apply to Selected (?:Recipe|Config)/i })
  // Ensure the item is visible before interacting.
  await expect(menuItem).toBeVisible()
  // Toggle the checkbox entry on.
  await menuItem.click()
  // Close the menu explicitly so the dialog does not linger.
  await page.keyboard.press('Escape')
  // Ensure the menu closes after the action.
  await expect(menuItem).toBeHidden()
}

const acceptRecipeAutosaveRestore = async (page: Page): Promise<void> => {
  // Locate the restore dialog that appears when autosave data exists.
  const dialog = page.getByRole('dialog', { name: RESTORE_DIALOG_TITLE })
  // Allow app boot time so the dialog has a chance to render.
  await dialog.waitFor({ state: 'visible', timeout: PLAYWRIGHT_TIMEOUTS.appGoto }).catch(() => undefined)
  // Skip when no restore prompt is displayed.
  const isVisible = await dialog.isVisible().catch(() => false)
  if (!isVisible) return
  // Ensure recipes are selected so the builder list is restored.
  const recipesCheckbox = dialog.getByRole('checkbox', { name: /Recipes/i })
  if (await recipesCheckbox.isVisible().catch(() => false)) {
    if (!(await recipesCheckbox.isChecked().catch(() => false))) {
      await recipesCheckbox.click()
    }
  }
  // Restore the autosave so the recipes become available for testing.
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

const waitForMenuOverlayGone = async (page: Page): Promise<void> => {
  // MUI's Popover leaves a backdrop div that intercepts pointer events on Chromium.
  // Target the specific MUI Menu overlay so we don't conflict with other modals.
  const overlay = page.locator('.MuiPopover-root.MuiMenu-root')
  // Wait for the overlay to be fully removed from the DOM.
  await overlay.waitFor({ state: 'detached', timeout: PLAYWRIGHT_TIMEOUTS.expectDefault })
    .catch(() => {
      // If still present, force-dismiss with a click on a neutral spot.
      return page.mouse.click(1, 1).then(() =>
        overlay.waitFor({ state: 'detached', timeout: PLAYWRIGHT_TIMEOUTS.uiMenu }),
      )
    })
    .catch(() => undefined)
}

const moveChipToTop = async (page: Page, chip: Locator): Promise<void> => {
  // Open the chip context menu so we can access Move to Top.
  const menu = await openContextMenu(page, chip)
  // Wait for the menu item to be stable before clicking.
  const item = page.getByRole('menuitem', { name: 'Move to Top' })
  await expect(item).toBeVisible()
  await item.click()
  // Dismiss the MUI Popover backdrop that Chromium leaves behind after click.
  await page.keyboard.press('Escape')
  // Wait for the menu overlay to fully teardown before continuing.
  await menu.waitFor({ state: 'hidden', timeout: PLAYWRIGHT_TIMEOUTS.uiMenu })
    .catch(() => menu.waitFor({ state: 'detached', timeout: PLAYWRIGHT_TIMEOUTS.uiMenu }))
  // Ensure the MUI modal backdrop is also gone so clicks are not intercepted.
  await waitForMenuOverlayGone(page)
}

const moveChipToBottom = async (page: Page, chip: Locator): Promise<void> => {
  // Open the chip context menu so we can access Move to Bottom.
  const menu = await openContextMenu(page, chip)
  // Wait for the menu item to be stable before clicking.
  const item = page.getByRole('menuitem', { name: 'Move to Bottom' })
  await expect(item).toBeVisible()
  await item.click()
  // Dismiss the MUI Popover backdrop that Chromium leaves behind after click.
  await page.keyboard.press('Escape')
  // Wait for the menu overlay to fully teardown before continuing.
  await menu.waitFor({ state: 'hidden', timeout: PLAYWRIGHT_TIMEOUTS.uiMenu })
    .catch(() => menu.waitFor({ state: 'detached', timeout: PLAYWRIGHT_TIMEOUTS.uiMenu }))
  // Ensure the MUI modal backdrop is also gone so clicks are not intercepted.
  await waitForMenuOverlayGone(page)
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
  // Accept the restore prompt so the autosave recipes load into the builder.
  await acceptRecipeAutosaveRestore(page)

  // Close any note/restore dialogs if they auto-open.
  await dismissBlockingDialogs(page)

  // Chips render from restored state synchronously after dialog close.
  await expect(page.locator('[data-recipe-chip="true"]').first()).toBeVisible({ timeout: PLAYWRIGHT_TIMEOUTS.expectDefault })

  // Click the chip to select recipe #2.
  await ensureChipSelected(getRecipeChipByName(page, MARIUS_RECIPE_NAME))
  // Confirm the builder is showing the Marius recipe.
  await expect(getRecipeNameInput(page)).toHaveValue(MARIUS_RECIPE_NAME)

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
  // Extend timeouts for all hooks/tests so autosave restore has headroom after warmup.
  test.describe.configure({ timeout: PLAYWRIGHT_TIMEOUTS.testHeavy })

  test.beforeAll(async ({ browser }) => {
    // Allow extra time so the cold Vite compile can finish during warmup.
    test.setTimeout(PLAYWRIGHT_TIMEOUTS.testHeavy)
    // Preload the shell once so the first test does not pay the compile cost.
    await warmupAppShell(browser)
  })

  test.beforeEach(async ({ page }) => {
    // Allow extra time for autosave restore + scenario setup on slower hosts.
    test.setTimeout(PLAYWRIGHT_TIMEOUTS.testHeavy)
    // Reset the app state before each move test to keep scenarios isolated.
    await setupAutoApplyScenario(page)
  })

  test('auto apply stays on the moved recipe for move up/down', async ({ page }) => {
  // Move Up using the chip button while the builder is dirty.
  await moveChipUp(getRecipeChipByName(page, MARIUS_RECIPE_NAME))
  // Auto-apply should persist the dirty builder state before assertions.
  // Confirm the Marius chip is now at index 0.
  await expect(getRecipeChipByName(page, MARIUS_RECIPE_NAME)).toHaveAttribute('data-recipe-chip-index', '0')
  // Re-select the moved recipe and confirm edits persisted.
  await ensureChipSelected(getRecipeChipByName(page, MARIUS_RECIPE_NAME))
  await expect(getRecipeNameInput(page)).toHaveValue(MARIUS_RECIPE_NAME)
  await expectBuilderStats(page, { main: MAIN_STAT_LABEL, substat: SUBSTAT_LABEL, selected: true })
  // Select the recipe that swapped into index 1 (Basics) and ensure it stayed clean.
  await ensureChipSelected(getRecipeChipByIndex(page, 1))
  await expect(getRecipeNameInput(page)).toHaveValue(BASICS_RECIPE_NAME)
  await expectBuilderStats(page, { main: MAIN_STAT_LABEL, substat: SUBSTAT_LABEL, selected: false })

  // Move Down back to index 1 using the chip button.
  await ensureChipSelected(getRecipeChipByName(page, MARIUS_RECIPE_NAME))
  await moveChipDown(getRecipeChipByName(page, MARIUS_RECIPE_NAME))
  // Auto-apply should persist the dirty builder state before assertions.
  // Confirm the Marius chip is now at index 1.
  await expect(getRecipeChipByName(page, MARIUS_RECIPE_NAME)).toHaveAttribute('data-recipe-chip-index', '1')
  // Re-select the moved recipe and confirm edits persisted.
  await ensureChipSelected(getRecipeChipByName(page, MARIUS_RECIPE_NAME))
  await expect(getRecipeNameInput(page)).toHaveValue(MARIUS_RECIPE_NAME)
  await expectBuilderStats(page, { main: MAIN_STAT_LABEL, substat: SUBSTAT_LABEL, selected: true })
  // Ensure Basics still has no edits after swapping back.
  await ensureChipSelected(getRecipeChipByIndex(page, 0))
  await expect(getRecipeNameInput(page)).toHaveValue(BASICS_RECIPE_NAME)
  await expectBuilderStats(page, { main: MAIN_STAT_LABEL, substat: SUBSTAT_LABEL, selected: false })
  })

  test('auto apply stays on the moved recipe for move to top', async ({ page }) => {
  // Move to Top via the context menu entry.
  await ensureChipSelected(getRecipeChipByName(page, MARIUS_RECIPE_NAME))
  await moveChipToTop(page, getRecipeChipByName(page, MARIUS_RECIPE_NAME))
  // Auto-apply should persist the dirty builder state before assertions.
  // Confirm the Marius chip is now at index 0.
  await expect(getRecipeChipByName(page, MARIUS_RECIPE_NAME)).toHaveAttribute('data-recipe-chip-index', '0')
  // Re-select the moved recipe and confirm edits persisted.
  await ensureChipSelected(getRecipeChipByName(page, MARIUS_RECIPE_NAME))
  await expect(getRecipeNameInput(page)).toHaveValue(MARIUS_RECIPE_NAME)
  await expectBuilderStats(page, { main: MAIN_STAT_LABEL, substat: SUBSTAT_LABEL, selected: true })
  // Ensure Basics remained unchanged after moving to top.
  await ensureChipSelected(getRecipeChipByIndex(page, 1))
  await expect(getRecipeNameInput(page)).toHaveValue(BASICS_RECIPE_NAME)
  await expectBuilderStats(page, { main: MAIN_STAT_LABEL, substat: SUBSTAT_LABEL, selected: false })
  })

  test('auto apply stays on the moved recipe for move to bottom', async ({ page }) => {
  // Move to Bottom via the context menu entry.
  await ensureChipSelected(getRecipeChipByName(page, MARIUS_RECIPE_NAME))
  await moveChipToBottom(page, getRecipeChipByName(page, MARIUS_RECIPE_NAME))
  // Auto-apply should persist the dirty builder state before assertions.
  // Compute the last index so we can confirm the chip moved to the end.
  const chipCount = await page.locator('[data-recipe-chip="true"]').count()
  const lastIndex = Math.max(0, chipCount - 1)
  // Confirm the Marius chip is now at the last index.
  await expect(getRecipeChipByName(page, MARIUS_RECIPE_NAME)).toHaveAttribute('data-recipe-chip-index', String(lastIndex))
  // Re-select the moved recipe and confirm edits persisted.
  await ensureChipSelected(getRecipeChipByName(page, MARIUS_RECIPE_NAME))
  await expect(getRecipeNameInput(page)).toHaveValue(MARIUS_RECIPE_NAME)
  await expectBuilderStats(page, { main: MAIN_STAT_LABEL, substat: SUBSTAT_LABEL, selected: true })
  // Ensure the recipe now at index 1 did not inherit the edits.
  await ensureChipSelected(getRecipeChipByIndex(page, 1))
  await expect(getRecipeNameInput(page)).toHaveValue(SELL_LOW_VALUE_RECIPE_NAME)
  await expectBuilderStats(page, { main: MAIN_STAT_LABEL, substat: SUBSTAT_LABEL, selected: false })
  })
})
