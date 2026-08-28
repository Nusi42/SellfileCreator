/**
 * simple-mode-overrides-reload.spec.ts
 *
 * Reproduction cover for "reloading the app in simple mode doesn't save the
 * dynamic overrides".
 *
 * Express (simple) mode boots by DISMISSING the autosave restore prompt unarmed
 * and then loading the preset itself, so the programmatic load cannot be mistaken
 * for a user edit and overwrite the stored document. Autosave stays off until the
 * boot re-arms divergence detection against the post-load state. If that re-arm
 * never lands, every later override change is silently dropped: the session looks
 * fine until the next launch brings back the old answers.
 *
 * Only the real app can prove the sequencing, because the failure lives in the
 * ordering of a transition commit, a deferred re-arm and a debounced write.
 */
import { test, expect, type Page } from './fixtures'
import { APP_GOTO_OPTIONS, prepareApp } from './app-init'
import { PLAYWRIGHT_TIMEOUTS } from './timeouts'
import { warmupAppShell } from './app-warmup'
import { dismissBlockingDialogs } from './dialog-helpers'
import { settleWorkload } from './workload-indicator'
import {
  NOTE_RECIPE_OVERRIDES_ANSWERS_KEY,
} from '../../src/lib/noteRecipeOverrides'

// Tail of the account-scoped autosave key the app writes at runtime.
const AUTOSAVE_KEY_SUFFIX = 'autosave.sfc.v1'

// Distinctive fragments of the lategame preset's account-mode questions.
const ENDGAME_LABEL = 'I can finish all Hard game modes'
const ENDGAME_PLUS_LABEL = 'If you really want to get rid of more'

/**
 * Click one override answer in the express note dialog and let the preview settle.
 *
 * The shared setNoteOverrideCheckbox helper cannot be reused: its retry path re-opens
 * the dialog via the header toggle, which express mode does not render at all.
 */
const selectOverride = async (page: Page, labelFragment: string): Promise<void> => {
  const row = page.locator('[role="dialog"] input[type="checkbox"]')
    .locator('xpath=ancestor::label')
    .filter({ hasText: labelFragment })
    .first()
  await expect(row).toBeVisible({ timeout: PLAYWRIGHT_TIMEOUTS.expectLong })
  await row.click()
  await settleWorkload(page)
}

test.beforeAll(async ({ browser }) => {
  test.setTimeout(PLAYWRIGHT_TIMEOUTS.testLong)
  await warmupAppShell(browser)
})

/**
 * The recipe-override answers currently in the autosave entry, or null when the
 * entry is missing entirely. Read straight from storage rather than the UI: the
 * question is whether the answers were PERSISTED, which the UI cannot show.
 */
const readStoredRecipeAnswers = async (page: Page): Promise<Record<string, unknown> | null> => {
  return page.evaluate(([keySuffix, answersKey]) => {
    // The autosave key is ACCOUNT-SCOPED at runtime (sellfileCreator.acc.<id>.…), so the
    // exported constant does not name the key the page actually writes. Find it live.
    const key = Object.keys(window.localStorage).find((k) => k.endsWith(keySuffix))
    if (!key) return null
    const raw = window.localStorage.getItem(key)
    if (!raw) return null
    try {
      // saveAutosave stores a [crc, payload] TUPLE, not an object with a payload field.
      const entry = JSON.parse(raw) as [unknown, Record<string, unknown>]
      const payload = Array.isArray(entry) ? entry[1] : null
      if (!payload || typeof payload !== 'object') return null
      const answers = payload[answersKey]
      return (answers && typeof answers === 'object' ? answers : {}) as Record<string, unknown>
    } catch {
      return null
    }
  }, [AUTOSAVE_KEY_SUFFIX, NOTE_RECIPE_OVERRIDES_ANSWERS_KEY] as const)
}

/**
 * The express boot writes on a debounce, so poll until the stored answers stop
 * being empty rather than guessing a single delay. Returns the answers it settled
 * on (possibly still empty, which is the failure this spec is looking for).
 */
const waitForStoredAnswers = async (page: Page): Promise<Record<string, unknown> | null> => {
  let last: Record<string, unknown> | null = null
  await expect(async () => {
    last = await readStoredRecipeAnswers(page)
    expect(last && Object.keys(last).length > 0).toBe(true)
  }).toPass({ timeout: PLAYWRIGHT_TIMEOUTS.expectLong })
  return last
}

test('an override changed in simple mode survives a reload', async ({ page }) => {
  // Two boots + restore flows per run: the testHeavy class (autosave restores and
  // similar heavy setup), not testLong's single-workload budget.
  test.setTimeout(PLAYWRIGHT_TIMEOUTS.testHeavy)
  await prepareApp(page)
  // ?simple is the express single-dialog view the report is about.
  await page.goto('/?simple', APP_GOTO_OPTIONS)
  await dismissBlockingDialogs(page)

  // Express boot loads the bundled preset by itself and auto-opens the note dialog, so
  // the override questions are on screen without any file being picked. The shared
  // setNoteOverrideCheckbox helper cannot be reused here: its retry path re-opens the
  // dialog via the header toggle, which express mode does not render at all.
  //
  // The preset ships with Lategame selected, so switching to Endgame is a real change.
  await selectOverride(page, ENDGAME_LABEL)

  // The change must reach the stored autosave entry — this is the write half.
  const stored = await waitForStoredAnswers(page)
  expect(stored, 'the override change never reached autosave').not.toBeNull()

  // Now the read half: a reload must bring the answers back, not the preset defaults.
  await page.reload(APP_GOTO_OPTIONS)
  await dismissBlockingDialogs(page)

  // What the user actually sees: the Endgame answer must still be selected. Asserting on
  // the restored UI (not just storage) is the point — a boot that reads the answers and
  // then lets the preset load overwrite them would still leave storage looking correct
  // at this instant, and only lose them on the write after the next edit.
  const endgameAfter = page.locator('[role="dialog"] input[type="checkbox"]')
    .locator('xpath=ancestor::label')
    .filter({ hasText: 'I can finish all Hard game modes' })
    .first()
  await expect(endgameAfter).toBeVisible({ timeout: PLAYWRIGHT_TIMEOUTS.expectLong })
  await expect(
    endgameAfter.locator('input[type="checkbox"]'),
    'the reloaded session came back on the preset default instead of the saved answer',
  ).toBeChecked({ timeout: PLAYWRIGHT_TIMEOUTS.expectLong })

  // And the answers must still be in storage after the boot has settled, so the NEXT
  // edit writes on top of them rather than on top of the preset defaults.
  const afterReload = await waitForStoredAnswers(page)
  expect(
    Object.keys(afterReload ?? {}).length,
    'the boot overwrote the saved answers with the preset defaults',
  ).toBeGreaterThan(0)
})

/**
 * The second edit is the one the re-arm protects. The boot dismisses the restore prompt
 * UNARMED so its own preset load cannot be mistaken for a user edit, and only re-arms
 * divergence once that load has committed. If the re-arm never lands, autosave stays off
 * for the rest of the session: the first launch appears to work (its answers were written
 * before the reload), while every change made AFTER a reload is silently dropped.
 */
test('an override changed after a reload is saved too', async ({ page }) => {
  // Two boots + restore flows per run: the testHeavy class (autosave restores and
  // similar heavy setup), not testLong's single-workload budget.
  test.setTimeout(PLAYWRIGHT_TIMEOUTS.testHeavy)
  await prepareApp(page)
  await page.goto('/?simple', APP_GOTO_OPTIONS)
  await dismissBlockingDialogs(page)

  // First session: pick Endgame and let it persist.
  await selectOverride(page, ENDGAME_LABEL)
  await waitForStoredAnswers(page)

  // Reload into the express boot path, then make a SECOND change.
  await page.reload(APP_GOTO_OPTIONS)
  await dismissBlockingDialogs(page)
  await selectOverride(page, ENDGAME_PLUS_LABEL)

  // That change must reach storage — this is what an unarmed session would drop.
  await expect(async () => {
    const answers = await readStoredRecipeAnswers(page)
    const serialized = JSON.stringify(answers ?? {})
    // The answer is recorded against the account-mode question by its visible token.
    expect(serialized.includes('endgame+'), serialized).toBe(true)
  }).toPass({ timeout: PLAYWRIGHT_TIMEOUTS.expectLong })
})

/**
 * The realistic human flow: toggle the answer and reload RIGHT AWAY, inside the
 * autosave debounce. The two tests above wait for the debounced write to land before
 * reloading, which quietly sidesteps the unload path. This one exercises it: the
 * change only survives if the beforeunload flush persists the PENDING state rather
 * than a stale cached payload.
 */
test('an override changed immediately before a reload is not lost', async ({ page }) => {
  // Two boots + restore flows per run: the testHeavy class (autosave restores and
  // similar heavy setup), not testLong's single-workload budget.
  test.setTimeout(PLAYWRIGHT_TIMEOUTS.testHeavy)
  await prepareApp(page)
  await page.goto('/?simple', APP_GOTO_OPTIONS)
  await dismissBlockingDialogs(page)

  // Switch the account mode and reload with NO settling wait — the click's state
  // commit is confirmed by the checkbox flipping, nothing more.
  const endgame = page.locator('[role="dialog"] input[type="checkbox"]')
    .locator('xpath=ancestor::label')
    .filter({ hasText: ENDGAME_LABEL })
    .first()
  await expect(endgame).toBeVisible({ timeout: PLAYWRIGHT_TIMEOUTS.expectLong })
  await endgame.click()
  await expect(endgame.locator('input[type="checkbox"]')).toBeChecked({ timeout: PLAYWRIGHT_TIMEOUTS.expectDefault })
  await page.reload(APP_GOTO_OPTIONS)
  await dismissBlockingDialogs(page)

  // The reloaded session must come back on Endgame, not the preset's Lategame default.
  const endgameAfter = page.locator('[role="dialog"] input[type="checkbox"]')
    .locator('xpath=ancestor::label')
    .filter({ hasText: ENDGAME_LABEL })
    .first()
  await expect(endgameAfter).toBeVisible({ timeout: PLAYWRIGHT_TIMEOUTS.expectLong })
  await expect(
    endgameAfter.locator('input[type="checkbox"]'),
    'the change made just before the reload was dropped',
  ).toBeChecked({ timeout: PLAYWRIGHT_TIMEOUTS.expectLong })
})
