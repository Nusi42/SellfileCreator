/**
 * simple-mode-custom-tab.spec.ts
 *
 * When does the express note dialog offer the "Custom" sell-rules button?
 *
 * The button restores the user's own (non-preset) document, so it must exist exactly
 * when such a document exists — never for a preset that merely has override answers,
 * and never during the boot window where the live document is empty only because the
 * startup load has not landed yet. The reported bug: after a preset session, a reload
 * showed Custom even though nothing custom existed, because the "is the empty document
 * the user's own?" check trusted the presence of ANY stored autosave entry — including
 * the previous session's preset and the app's own first empty write.
 */
import { test, expect, type Page } from './fixtures'
import { APP_GOTO_OPTIONS, prepareApp } from './app-init'
import { PLAYWRIGHT_TIMEOUTS } from './timeouts'
import { warmupAppShell } from './app-warmup'
import { dismissBlockingDialogs } from './dialog-helpers'
import { settleWorkload } from './workload-indicator'
import { NOTE_TOGGLE_SELECTOR } from './ui-selectors'

test.beforeAll(async ({ browser }) => {
  test.setTimeout(PLAYWRIGHT_TIMEOUTS.testLong)
  await warmupAppShell(browser)
})

// Distinctive fragment of the lategame preset's Endgame account-mode answer.
const ENDGAME_LABEL = 'I can finish all Hard game modes'

/** The express toggle group and its three possible buttons. */
const sellRulesGroup = (page: Page) => page.getByRole('group', { name: 'Gear Sell Rules' })
const customButton = (page: Page) => sellRulesGroup(page).getByRole('button', { name: 'Custom', exact: true })
const midgameButton = (page: Page) => sellRulesGroup(page).getByRole('button', { name: 'Midgame / Lategame / Endgame' })

/** The dirty dot on the Custom button — present iff the custom setup reads unsaved. */
const customDirtyDot = (page: Page) => page.getByTestId('simple-custom-dirty-badge').getByTestId('dirty-dot')

/**
 * Close the note (a floating panel in expert mode that overlays the builder column — the
 * situation the go-expert demo slide exists for), the way a user does.
 */
const closeNotePanel = async (page: Page): Promise<void> => {
  const notePanel = page.getByRole('dialog', { name: /Note & Dynamic Overrides/ })
  await notePanel.getByRole('button', { name: 'Close', exact: true }).click()
  await expect(notePanel).toBeHidden({ timeout: PLAYWRIGHT_TIMEOUTS.expectDefault })
}

/** Reopen the note from the header toggle and switch back to the simple view. */
const returnToSimple = async (page: Page): Promise<void> => {
  await page.locator(NOTE_TOGGLE_SELECTOR).first().click()
  await page.locator('[data-attention-id="note.goSimple"]').click()
}

/**
 * From the simple view with a preset loaded: go expert, edit a preset recipe (the
 * builder holds the preset's selected recipe, so Apply is disabled until the draft
 * changes — flip a behaviour flag, then apply it back; a preset recipe edited this way
 * matches no bundled preset any more), and come back. Leaves the document custom and
 * UNSAVED.
 */
const makeDocumentCustom = async (page: Page): Promise<void> => {
  await page.getByRole('button', { name: 'Go Expert', exact: true }).click()
  await closeNotePanel(page)
  await page.getByRole('button', { name: 'Not counted by safeguards', exact: true }).first().click()
  const applyRecipe = page.getByRole('button', { name: /Apply as Recipe/ }).first()
  await expect(applyRecipe).toBeEnabled({ timeout: PLAYWRIGHT_TIMEOUTS.expectDefault })
  await applyRecipe.click()
  await settleWorkload(page)
  await returnToSimple(page)
}

/** Click one override answer in the express note dialog and let the preview settle. */
const selectOverride = async (page: Page, labelFragment: string): Promise<void> => {
  const row = page.locator('[role="dialog"] input[type="checkbox"]')
    .locator('xpath=ancestor::label')
    .filter({ hasText: labelFragment })
    .first()
  await expect(row).toBeVisible({ timeout: PLAYWRIGHT_TIMEOUTS.expectLong })
  await row.click()
  await settleWorkload(page)
}

test('a fresh simple launch offers no Custom button', async ({ page }) => {
  test.setTimeout(PLAYWRIGHT_TIMEOUTS.testLong)
  await prepareApp(page)
  await page.goto('/?simple', APP_GOTO_OPTIONS)
  await dismissBlockingDialogs(page)

  // The preset lands and is selected; nothing custom exists, so no third button.
  await expect(midgameButton(page)).toHaveAttribute('aria-pressed', 'true', { timeout: PLAYWRIGHT_TIMEOUTS.expectLong })
  await settleWorkload(page)
  await expect(customButton(page)).toHaveCount(0)
})

test('a preset with override answers stays a preset across a reload', async ({ page }) => {
  // Two boots + restore flows: the testHeavy class (autosave restores and similar heavy
  // setup), not testLong's single-workload budget.
  test.setTimeout(PLAYWRIGHT_TIMEOUTS.testHeavy)
  await prepareApp(page)
  await page.goto('/?simple', APP_GOTO_OPTIONS)
  await dismissBlockingDialogs(page)

  // Override answers are tuning on top of the preset, not a custom document.
  await selectOverride(page, ENDGAME_LABEL)
  await expect(customButton(page)).toHaveCount(0)

  // The reported flow: reload. The boot must resolve the entry as the preset it is and
  // must not latch Custom during the window where the live document is still empty.
  await page.reload(APP_GOTO_OPTIONS)
  await dismissBlockingDialogs(page)
  await expect(midgameButton(page)).toHaveAttribute('aria-pressed', 'true', { timeout: PLAYWRIGHT_TIMEOUTS.expectLong })
  await settleWorkload(page)
  await expect(customButton(page), 'Custom appeared for a preset session').toHaveCount(0)
})

test('a real custom document offers Custom, selected, and keeps it across a reload', async ({ page }) => {
  test.setTimeout(PLAYWRIGHT_TIMEOUTS.testHeavy)
  await prepareApp(page)
  await page.goto('/?simple', APP_GOTO_OPTIONS)
  await dismissBlockingDialogs(page)
  await expect(midgameButton(page)).toHaveAttribute('aria-pressed', 'true', { timeout: PLAYWRIGHT_TIMEOUTS.expectLong })

  // Make the document genuinely custom (and unsaved) in expert mode, then come back.
  await makeDocumentCustom(page)

  // Now Custom exists and is the selected rules button.
  await expect(customButton(page)).toBeVisible({ timeout: PLAYWRIGHT_TIMEOUTS.expectLong })
  await expect(customButton(page)).toHaveAttribute('aria-pressed', 'true', { timeout: PLAYWRIGHT_TIMEOUTS.expectLong })

  // And the custom document survives a reload as the selected Custom setup.
  await page.reload(APP_GOTO_OPTIONS)
  await dismissBlockingDialogs(page)
  await expect(customButton(page)).toBeVisible({ timeout: PLAYWRIGHT_TIMEOUTS.expectLong })
  await expect(customButton(page)).toHaveAttribute('aria-pressed', 'true', { timeout: PLAYWRIGHT_TIMEOUTS.expectLong })
})

test('Go Expert warns when a preset is selected over an existing custom setup', async ({ page }) => {
  test.setTimeout(PLAYWRIGHT_TIMEOUTS.testHeavy)
  await prepareApp(page)
  await page.goto('/?simple', APP_GOTO_OPTIONS)
  await dismissBlockingDialogs(page)
  await expect(midgameButton(page)).toHaveAttribute('aria-pressed', 'true', { timeout: PLAYWRIGHT_TIMEOUTS.expectLong })
  await makeDocumentCustom(page)
  await expect(customButton(page)).toHaveAttribute('aria-pressed', 'true', { timeout: PLAYWRIGHT_TIMEOUTS.expectLong })

  // Trying a preset leaves the custom setup only in the in-session snapshot, which
  // Go Expert would discard — so it must ask first.
  await midgameButton(page).click()
  await expect(midgameButton(page)).toHaveAttribute('aria-pressed', 'true', { timeout: PLAYWRIGHT_TIMEOUTS.expectLong })
  // The pressed state is a visual hold; the confirmation reads the COMMITTED preset match.
  await settleWorkload(page)
  await page.getByRole('button', { name: 'Go Expert', exact: true }).click()
  const confirm = page.getByRole('dialog', { name: 'Switch to Expert mode?' })
  await expect(confirm, 'no warning before discarding the custom setup').toBeVisible({ timeout: PLAYWRIGHT_TIMEOUTS.expectDefault })
  await confirm.getByRole('button', { name: 'Cancel', exact: true }).click()
  await expect(confirm).toBeHidden({ timeout: PLAYWRIGHT_TIMEOUTS.expectDefault })
  // Cancelling keeps the simple view and the custom setup on offer.
  await expect(customButton(page)).toBeVisible()
})

test('the Custom button wears the dirty dot while the custom setup is unsaved', async ({ page }) => {
  test.setTimeout(PLAYWRIGHT_TIMEOUTS.testHeavy)
  await prepareApp(page)
  await page.goto('/?simple', APP_GOTO_OPTIONS)
  await dismissBlockingDialogs(page)
  await expect(midgameButton(page)).toHaveAttribute('aria-pressed', 'true', { timeout: PLAYWRIGHT_TIMEOUTS.expectLong })
  await makeDocumentCustom(page)

  // Unsaved custom setup: the dot is on. The simple view has no other unsaved warning.
  await expect(customButton(page)).toHaveAttribute('aria-pressed', 'true', { timeout: PLAYWRIGHT_TIMEOUTS.expectLong })
  await expect(customDirtyDot(page)).toHaveCount(1, { timeout: PLAYWRIGHT_TIMEOUTS.expectLong })

  // A reload restores the custom body with the provenance the entry recorded — still
  // unsaved — instead of presenting it as a freshly opened file.
  await page.reload(APP_GOTO_OPTIONS)
  await dismissBlockingDialogs(page)
  await expect(customButton(page)).toHaveAttribute('aria-pressed', 'true', { timeout: PLAYWRIGHT_TIMEOUTS.expectLong })
  await expect(customDirtyDot(page), 'the reload lost the unsaved state').toHaveCount(1, { timeout: PLAYWRIGHT_TIMEOUTS.expectLong })

  // Trying a preset keeps the dot on Custom: the live document is now the clean preset,
  // but the custom setup in the snapshot is still unsaved.
  await midgameButton(page).click()
  await expect(midgameButton(page)).toHaveAttribute('aria-pressed', 'true', { timeout: PLAYWRIGHT_TIMEOUTS.expectLong })
  await expect(customDirtyDot(page)).toHaveCount(1)

  // Back to Custom, save it in expert mode, and the dot goes away.
  await customButton(page).click()
  await expect(customButton(page)).toHaveAttribute('aria-pressed', 'true', { timeout: PLAYWRIGHT_TIMEOUTS.expectLong })
  await settleWorkload(page)
  await page.getByRole('button', { name: 'Go Expert', exact: true }).click()
  await closeNotePanel(page)
  // Coming back to the unsaved custom setup must land it unsaved in expert mode too — the
  // header's own dot is the ground truth the Custom dot mirrors.
  await expect(page.getByTestId('sfc-dirty-badge').getByTestId('dirty-dot'), 'the Custom re-load laundered the unsaved state').toHaveCount(1, { timeout: PLAYWRIGHT_TIMEOUTS.expectLong })
  const download = page.waitForEvent('download')
  await page.locator('[data-tour-id="sfc.save"]').click()
  await download
  await expect(page.getByTestId('sfc-dirty-badge').getByTestId('dirty-dot'), 'the save did not clean the document').toHaveCount(0)
  await returnToSimple(page)
  await expect(customButton(page)).toHaveAttribute('aria-pressed', 'true', { timeout: PLAYWRIGHT_TIMEOUTS.expectLong })
  await expect(customDirtyDot(page), 'the dot stayed on after the save').toHaveCount(0, { timeout: PLAYWRIGHT_TIMEOUTS.expectLong })
})
