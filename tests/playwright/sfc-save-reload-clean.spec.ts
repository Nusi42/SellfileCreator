/**
 * sfc-save-reload-clean.spec.ts
 *
 * Regression cover for: after modify, save, reload, the app still reported unsaved work.
 *
 * The autosave entry records the document's clean/dirty state at write time (the
 * Anchored marker vs the DivergedAt stamp). A save flips the document clean without
 * changing any content, so the writer must re-run on that edge; and the restore must
 * read the marker back and present a whole-body restore of a clean entry as saved —
 * no dirty dot, no "you still have unsaved work" arrows. Only the real app can prove
 * the chain end to end: edit → save (download) → re-write → reload → restore → clean.
 */
import { test, expect, type Page } from './fixtures'
import { APP_GOTO_OPTIONS, prepareApp } from './app-init'
import { PLAYWRIGHT_TIMEOUTS } from './timeouts'
import { warmupAppShell } from './app-warmup'
import {
  closeDialogIfVisible,
  dismissBlockingDialogs,
  HELP_DIALOG_ARIA_LABEL,
  RESTORE_DIALOG_TITLE,
} from './dialog-helpers'
import { settleWorkload } from './workload-indicator'
import { SFC_DIRTY_DOT_SELECTOR } from './ui-selectors'
import { readStoredAutosavePayload } from './autosave-storage'
import { readAutosaveAnchored } from '../../src/lib/sfcProvenance'

test.beforeAll(async ({ browser }) => {
  test.setTimeout(PLAYWRIGHT_TIMEOUTS.testLong)
  await warmupAppShell(browser)
})

/** The SFC dirty dot on the Save button — present iff the document reads dirty. */
const sfcDirtyDot = (page: Page) => page.locator(SFC_DIRTY_DOT_SELECTOR)

/** Whether the stored autosave entry carries the clean-at-write marker (the app's own reader). */
const storedEntryIsAnchored = async (page: Page): Promise<boolean> =>
  readAutosaveAnchored(await readStoredAutosavePayload(page))

/** The first recipe's chip — proof that the document holds the added recipe. */
const firstRecipeChip = (page: Page) => page.getByText(/^1\.\s*Keep/).first()

test('a saved document restores clean after a reload', async ({ page }) => {
  // Two boots, a download and a restore flow: the testHeavy class (autosave restores
  // and similar heavy setup), not testLong's single-workload budget.
  test.setTimeout(PLAYWRIGHT_TIMEOUTS.testHeavy)
  await prepareApp(page)
  await page.goto('/', APP_GOTO_OPTIONS)
  await dismissBlockingDialogs(page)

  // A real edit: committing the builder draft as a new recipe is a history entry and
  // therefore dirties the document. (Override answers would not — they are tuning state
  // layered on top, deliberately outside the history signature.)
  await page.getByRole('button', { name: /Add as New Recipe|Apply as Recipe/ }).first().click()
  await expect(firstRecipeChip(page)).toBeVisible({ timeout: PLAYWRIGHT_TIMEOUTS.expectDefault })
  await settleWorkload(page)
  await expect(sfcDirtyDot(page), 'the edit must dirty the document first').toHaveCount(1)

  // Save: the header action downloads the .sfc and marks the document saved.
  const download = page.waitForEvent('download')
  await page.locator('[data-tour-id="sfc.save"]').click()
  await download
  await expect(sfcDirtyDot(page)).toHaveCount(0)

  // The save changed no content, so this is the edge the writer must still re-run on:
  // the stored entry has to pick up the clean marker before the reload.
  await expect(async () => {
    expect(await storedEntryIsAnchored(page), 'autosave never recorded the save').toBe(true)
  }).toPass({ timeout: PLAYWRIGHT_TIMEOUTS.expectLong })

  // Reload and RESTORE (dismissBlockingDialogs would dismiss the prompt instead).
  await page.reload(APP_GOTO_OPTIONS)
  await closeDialogIfVisible(page.getByRole('dialog', { name: HELP_DIALOG_ARIA_LABEL }))
  const restoreDialog = page.getByRole('dialog', { name: RESTORE_DIALOG_TITLE })
  await expect(restoreDialog).toBeVisible({ timeout: PLAYWRIGHT_TIMEOUTS.expectLong })
  await restoreDialog.getByRole('button', { name: 'Restore Selected' }).click()
  await expect(restoreDialog).toBeHidden({ timeout: PLAYWRIGHT_TIMEOUTS.expectLong })
  await settleWorkload(page)

  // The restored body is exactly the .sfc that was just saved, so it must read clean:
  // no dot, and therefore no startup arrows pointing at Save.
  await expect(
    sfcDirtyDot(page),
    'a whole-body restore of a saved document came back dirty',
  ).toHaveCount(0, { timeout: PLAYWRIGHT_TIMEOUTS.expectLong })

  // Sanity that the restore actually brought the content back (an empty document is
  // clean too, which would make the assertion above pass for the wrong reason).
  await expect(firstRecipeChip(page)).toBeVisible({ timeout: PLAYWRIGHT_TIMEOUTS.expectLong })
})
