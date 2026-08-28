/**
 * simple-mode-file-url.spec.ts
 *
 * Regression cover for the file:// override loss: change the account mode in express
 * simple mode, wait for the pipeline to settle, reload — and come back on the changed
 * answer, not the preset default.
 *
 * This spec runs the BUILT app from a file:// URL, the way the shipped product is
 * actually launched, because the bug only manifests there: the heavier file:// boot
 * (15MB single-file page) delays the loaded note's commit past the restore sequencing
 * that http-served runs finish in time. Concretely, the express boot used to
 * fire-and-forget the preset load, so its wait-for-note frame cap expired with the note
 * still empty, the saved override answers were pruned against that empty note (an empty
 * note has no questions, so pruning dropped every answer), and the next autosave write
 * persisted the destruction. The http specs in simple-mode-overrides-reload.spec.ts
 * pass on both sides of that bug; this one is the honest reproduction.
 */
import { test, expect, type Page } from './fixtures'
import { prepareApp } from './app-init'
import { PLAYWRIGHT_TIMEOUTS } from './timeouts'
import { settleWorkload } from './workload-indicator'
import { ENDGAME_ANSWER_LABEL, expressOverrideRow } from './note-overrides-helpers'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

// The built single-file app, launched exactly as shipped (query param included: the
// reporter's launcher passes simple=1, and the app strips it after stashing a session
// marker — the reload must survive on that marker alone).
const APP_FILE_URL = `${pathToFileURL(path.resolve(process.cwd(), 'dist.app/index.html')).href}?simple=1`

// The Endgame answer row inside the express note dialog.
const endgameRow = (page: Page) => expressOverrideRow(page, ENDGAME_ANSWER_LABEL)

test('an override change survives a file:// reload in simple mode', async ({ page }) => {
  // Two file:// boots of the 15MB single-file page + restore flows: the testHeavy
  // class (autosave restores and similar heavy setup).
  test.setTimeout(PLAYWRIGHT_TIMEOUTS.testHeavy)
  await prepareApp(page)
  await page.goto(APP_FILE_URL)

  // Switch the account mode from the preset's Lategame default to Endgame, then let
  // the preview pipeline settle — mirroring the reported flow (wait for the pipelines to
  // finish), so the debounced autosave write has landed before the reload.
  const row = endgameRow(page)
  await expect(row).toBeVisible({ timeout: PLAYWRIGHT_TIMEOUTS.expectLong })
  await row.click()
  await expect(row.locator('input[type="checkbox"]')).toBeChecked({ timeout: PLAYWRIGHT_TIMEOUTS.expectDefault })
  await settleWorkload(page)

  // Reload. The boot re-resolves the preset source, re-loads the bundled preset, and
  // must re-apply the saved answers on top — the sequence the bug destroyed.
  await page.reload()
  const rowAfter = endgameRow(page)
  await expect(rowAfter).toBeVisible({ timeout: PLAYWRIGHT_TIMEOUTS.expectLong })
  await expect(
    rowAfter.locator('input[type="checkbox"]'),
    'the saved Endgame answer was lost across the file:// reload',
  ).toBeChecked({ timeout: PLAYWRIGHT_TIMEOUTS.expectLong })
})
