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

  // Make the document genuinely custom: go expert, edit a preset recipe, come back.
  // The builder holds the preset's selected recipe, so Apply is disabled until the draft
  // changes: flip a behaviour flag, then apply it back. A preset recipe edited this way
  // matches no bundled preset any more.
  await page.getByRole('button', { name: 'Go Expert', exact: true }).click()
  // In expert mode the note becomes a floating panel that overlays the builder column
  // (the situation the go-expert demo slide exists for). Do what a user does: close it,
  // edit, then reopen it from the header note toggle to get back to simple mode.
  const notePanel = page.getByRole('dialog', { name: /Note & Dynamic Overrides/ })
  await notePanel.getByRole('button', { name: 'Close', exact: true }).click()
  await expect(notePanel).toBeHidden({ timeout: PLAYWRIGHT_TIMEOUTS.expectDefault })
  await page.getByRole('button', { name: 'Not counted by safeguards', exact: true }).first().click()
  const applyRecipe = page.getByRole('button', { name: /Apply as Recipe/ }).first()
  await expect(applyRecipe).toBeEnabled({ timeout: PLAYWRIGHT_TIMEOUTS.expectDefault })
  await applyRecipe.click()
  await settleWorkload(page)
  await page.locator(NOTE_TOGGLE_SELECTOR).first().click()
  await page.locator('[data-attention-id="note.goSimple"]').click()

  // Now Custom exists and is the selected rules button.
  await expect(customButton(page)).toBeVisible({ timeout: PLAYWRIGHT_TIMEOUTS.expectLong })
  await expect(customButton(page)).toHaveAttribute('aria-pressed', 'true', { timeout: PLAYWRIGHT_TIMEOUTS.expectLong })

  // And the custom document survives a reload as the selected Custom setup.
  await page.reload(APP_GOTO_OPTIONS)
  await dismissBlockingDialogs(page)
  await expect(customButton(page)).toBeVisible({ timeout: PLAYWRIGHT_TIMEOUTS.expectLong })
  await expect(customButton(page)).toHaveAttribute('aria-pressed', 'true', { timeout: PLAYWRIGHT_TIMEOUTS.expectLong })
})
