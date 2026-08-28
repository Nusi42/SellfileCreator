/**
 * simple-mode-custom-tab.spec.ts
 *
 * The express note dialog's "Custom" sell-rules button: when it exists, what it restores,
 * how it warns about unsaved rules, and what its right-click menu does.
 *
 * The button restores the user's own (non-preset) document, so it must exist exactly
 * when such a document exists — never for a preset that merely has override answers,
 * and never during the boot window where the live document is empty only because the
 * startup load has not landed yet. It wears the dirty dot while that document is unsaved
 * (the simple view has no other unsaved-work warning), survives the user trying a preset
 * and reloading, and is forgotten only by an explicit decision: the Go Expert
 * confirmation or the menu's Discard.
 *
 * Two cases drive the expert round trip for real (edit a preset recipe, come back), since
 * that is how a document becomes custom in session. Every other case seeds an unsaved
 * custom autosave entry before boot instead: the app then restores it as its own startup
 * path does, which is the same product behaviour at a fraction of the wall-clock — the
 * round trip costs two attention pulses and a demo slide, all real UI waits.
 */
import { test, expect, type Page } from './fixtures'
import type { Locator } from '@playwright/test'
import { APP_GOTO_OPTIONS, prepareApp } from './app-init'
import { PLAYWRIGHT_TIMEOUTS } from './timeouts'
import { warmupAppShell } from './app-warmup'
import { dismissBlockingDialogs } from './dialog-helpers'
import { settleWorkload } from './workload-indicator'
import { NOTE_TOGGLE_SELECTOR, SFC_DIRTY_DOT_SELECTOR, SIMPLE_CUSTOM_DIRTY_DOT_SELECTOR } from './ui-selectors'
import { ENDGAME_ANSWER_LABEL, expressOverrideRow, selectExpressOverride } from './note-overrides-helpers'
import { PRESET_LATEGAME_SFC_PATH } from './fixture-paths'
import { AUTOSAVE_KEY } from '../../src/lib/constants'
import { computeCrc32 } from '../../src/lib/autosave'
import { readFileSync } from 'node:fs'

test.beforeAll(async ({ browser }) => {
  test.setTimeout(PLAYWRIGHT_TIMEOUTS.testLong)
  await warmupAppShell(browser)
})

// A plain first note line that makes the seeded document custom AND visible in the dialog.
const CUSTOM_MARK = 'CUSTOM MARK for the custom-tab spec'
// How long ago the seeded custom setup went unsaved — any positive age restores as dirty.
const SEED_UNSAVED_AGE_MS = 60_000
// sessionStorage marker that keeps the seed to one planting per tab (see seedUnsavedCustomSetup).
const SEED_MARKER = 'custom-tab-spec.seeded'

/** The express toggle group and its three possible buttons. */
const sellRulesGroup = (page: Page) => page.getByRole('group', { name: 'Gear Sell Rules' })
const customButton = (page: Page) => sellRulesGroup(page).getByRole('button', { name: 'Custom', exact: true })
const midgameButton = (page: Page) => sellRulesGroup(page).getByRole('button', { name: 'Midgame / Lategame / Endgame' })

/** The dirty dot on the Custom button — present iff the custom setup reads unsaved. */
const customDirtyDot = (page: Page) => page.locator(SIMPLE_CUSTOM_DIRTY_DOT_SELECTOR)

/** The header's own dirty dot (expert mode) — the ground truth the Custom dot mirrors. */
const headerDirtyDot = (page: Page) => page.locator(SFC_DIRTY_DOT_SELECTOR)

/**
 * The seeded custom body, built once for the whole spec: the lategame preset with a plain
 * marker line prepended to its note (so it matches no bundled preset and the marker is
 * visible in the dialog). A LIGHT body: the note (its override questions are what the
 * flows exercise) over a handful of recipes and no safeguards. The full preset's rule
 * pipeline costs seconds per load, and these flows load two or three times — that, not
 * the behaviour under test, was what pushed them past their budget under parallel workers.
 */
const SEEDED_CUSTOM_BODY = (() => {
  const preset = JSON.parse(readFileSync(PRESET_LATEGAME_SFC_PATH, 'utf-8')) as { Note?: string[]; Recipes?: unknown[] } & Record<string, unknown>
  return {
    ...preset,
    Recipes: (preset.Recipes ?? []).slice(0, 6),
    Safeguards: [],
    SafeguardsEnabled: false,
    // Its own paragraph: markdown would otherwise fold it into the note's first line.
    Note: [CUSTOM_MARK, '', ...(preset.Note ?? [])],
  }
})()

/**
 * Seed an UNSAVED custom autosave entry before boot: the seeded body plus a divergence
 * stamp (so it restores unsaved). Written the way the app writes autosave — a
 * [crc, payload] tuple — so the loader accepts it. Must run after prepareApp (whose init
 * script clears the key) and before the first navigation.
 */
const seedUnsavedCustomSetup = async (page: Page, divergedAgoMs: number): Promise<void> => {
  const payload = { ...SEEDED_CUSTOM_BODY, DivergedAt: Date.now() - divergedAgoMs }
  const entry = JSON.stringify([computeCrc32(JSON.stringify(payload)), payload])
  // Init scripts run on EVERY navigation, reloads included. Seed once per tab (a
  // sessionStorage marker survives reloads), or a reload would plant the seed over
  // whatever the app had correctly written since — and test the seed, not the app.
  await page.addInitScript(([key, value, marker]) => {
    try {
      if (window.sessionStorage.getItem(marker)) return
      window.sessionStorage.setItem(marker, '1')
      window.localStorage.setItem(key, value)
    } catch { /* storage unavailable */ }
  }, [AUTOSAVE_KEY, entry, SEED_MARKER] as const)
}

/** Boot the simple view on the seeded custom setup and wait for Custom to be selected. */
const bootOnSeededCustom = async (page: Page): Promise<void> => {
  await prepareApp(page)
  await seedUnsavedCustomSetup(page, SEED_UNSAVED_AGE_MS)
  await page.goto('/?simple', APP_GOTO_OPTIONS)
  await dismissBlockingDialogs(page)
  await expect(customButton(page)).toHaveAttribute('aria-pressed', 'true', { timeout: PLAYWRIGHT_TIMEOUTS.expectLong })
  await settleWorkload(page)
}

/** Boot the simple view on the bundled preset (a fresh launch). */
const bootOnPreset = async (page: Page): Promise<void> => {
  await prepareApp(page)
  await page.goto('/?simple', APP_GOTO_OPTIONS)
  await dismissBlockingDialogs(page)
  await expect(midgameButton(page)).toHaveAttribute('aria-pressed', 'true', { timeout: PLAYWRIGHT_TIMEOUTS.expectLong })
}

/** Switch to the Midgame+ preset and let the load and preview settle. */
const switchToMidgame = async (page: Page): Promise<void> => {
  await midgameButton(page).click()
  await expect(midgameButton(page)).toHaveAttribute('aria-pressed', 'true', { timeout: PLAYWRIGHT_TIMEOUTS.expectLong })
  await settleWorkload(page)
}

/**
 * Click through the DOM instead of Playwright's pointer action. Going expert (or back to
 * the express view) mounts the whole builder over the live document — over the full preset
 * that blocks the main thread for seconds — and Playwright's click follows its pointer
 * events with a "scheduled navigations" barrier that needs that thread: under parallel
 * workers the barrier overran the action budget with the click long delivered, failing a
 * step the app had completed. Same reason closeNoteDialog dispatches through the DOM. The
 * target is asserted visible first; callers assert the postcondition they actually need.
 */
const dispatchClick = async (target: Locator): Promise<void> => {
  await expect(target).toBeVisible({ timeout: PLAYWRIGHT_TIMEOUTS.expectDefault })
  await target.evaluate((el: HTMLElement) => el.click())
}

/** Press the express dialog's Go Expert button (opens the confirm, or mounts the expert UI). */
const goExpert = async (page: Page): Promise<void> => {
  await dispatchClick(page.getByRole('button', { name: 'Go Expert', exact: true }))
}

/**
 * Close the note (a floating panel in expert mode that overlays the builder column — the
 * situation the go-expert demo slide exists for), the way a user does.
 */
const closeNotePanel = async (page: Page): Promise<void> => {
  const notePanel = page.getByRole('dialog', { name: /Note & Dynamic Overrides/ })
  await expect(notePanel).toBeVisible({ timeout: PLAYWRIGHT_TIMEOUTS.expectDefault })
  // Right after Go Expert the fresh panel plays its demo slide (a transform animation), and
  // a moving Close button is never "stable" for a click. Wait for the panel's animations to
  // finish — a real condition — rather than letting the click burn its budget retrying.
  await notePanel.evaluate((el) => Promise.all(el.getAnimations({ subtree: true }).map((a) => a.finished)))
  await notePanel.getByRole('button', { name: 'Close', exact: true }).click()
  await expect(notePanel).toBeHidden({ timeout: PLAYWRIGHT_TIMEOUTS.expectDefault })
}

/** Reopen the note from the header toggle and switch back to the simple view. */
const returnToSimple = async (page: Page): Promise<void> => {
  const toggle = page.locator(NOTE_TOGGLE_SELECTOR).first()
  // Closing the note in simple+expert mode pulses this toggle for a few seconds (the way
  // back into the dialog). A pulsing element is never "stable" for a click, so wait for
  // its animations to finish — a real condition, not a guessed delay.
  await toggle.evaluate((el) => Promise.all(el.getAnimations({ subtree: true }).map((a) => a.finished)))
  await toggle.click()
  // The Simple Mode toggle pulses when it newly becomes visible (a beat after the dialog's
  // fade-in, so waiting for "current" animations raced it), and switching back mounts the
  // express view: dispatch through the DOM, which neither the pulse nor the mount can time out.
  await dispatchClick(page.locator('[data-attention-id="note.goSimple"]'))
}

/**
 * From the simple view with a preset loaded: go expert, edit a preset recipe (the
 * builder holds the preset's selected recipe, so Apply is disabled until the draft
 * changes — flip a behaviour flag, then apply it back; a preset recipe edited this way
 * matches no bundled preset any more), and come back. Leaves the document custom and
 * UNSAVED.
 */
const makeDocumentCustom = async (page: Page): Promise<void> => {
  await goExpert(page)
  await closeNotePanel(page)
  await page.getByRole('button', { name: 'Not counted by safeguards', exact: true }).first().click()
  const applyRecipe = page.getByRole('button', { name: /Apply as Recipe/ }).first()
  await expect(applyRecipe).toBeEnabled({ timeout: PLAYWRIGHT_TIMEOUTS.expectDefault })
  await applyRecipe.click()
  await settleWorkload(page)
  await returnToSimple(page)
}

/** Confirm the Go Expert discard dialog (Custom exists, a preset is selected). */
const confirmGoExpertDiscard = async (page: Page): Promise<void> => {
  await goExpert(page)
  const confirm = page.getByRole('dialog', { name: 'Switch to Expert mode?' })
  await expect(confirm).toBeVisible({ timeout: PLAYWRIGHT_TIMEOUTS.expectDefault })
  // Proceeding discards AND mounts the expert UI in one handler — the heaviest click here.
  await dispatchClick(confirm.getByRole('button', { name: 'Go Expert', exact: true }))
  await expect(confirm).toBeHidden({ timeout: PLAYWRIGHT_TIMEOUTS.expectDefault })
}

// ---------------------------------------------------------------------------
// When Custom exists.
// ---------------------------------------------------------------------------

test('a fresh simple launch offers no Custom button', async ({ page }) => {
  test.setTimeout(PLAYWRIGHT_TIMEOUTS.testLong)
  await bootOnPreset(page)
  // The preset lands and is selected; nothing custom exists, so no third button.
  await settleWorkload(page)
  await expect(customButton(page)).toHaveCount(0)
})

test('a preset with override answers stays a preset across a reload', async ({ page }) => {
  // Two boots + restore flows: the testHeavy class (autosave restores and similar heavy
  // setup), not testLong's single-workload budget.
  test.setTimeout(PLAYWRIGHT_TIMEOUTS.testHeavy)
  await bootOnPreset(page)

  // Override answers are tuning on top of the preset, not a custom document.
  await selectExpressOverride(page, ENDGAME_ANSWER_LABEL)
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
  await bootOnPreset(page)
  // The in-session way a document becomes custom: an expert edit.
  await makeDocumentCustom(page)
  await expect(customButton(page)).toBeVisible({ timeout: PLAYWRIGHT_TIMEOUTS.expectLong })
  await expect(customButton(page)).toHaveAttribute('aria-pressed', 'true', { timeout: PLAYWRIGHT_TIMEOUTS.expectLong })

  // And the custom document survives a reload as the selected Custom setup.
  await page.reload(APP_GOTO_OPTIONS)
  await dismissBlockingDialogs(page)
  await expect(customButton(page)).toBeVisible({ timeout: PLAYWRIGHT_TIMEOUTS.expectLong })
  await expect(customButton(page)).toHaveAttribute('aria-pressed', 'true', { timeout: PLAYWRIGHT_TIMEOUTS.expectLong })
})

// ---------------------------------------------------------------------------
// The Go Expert warning.
// ---------------------------------------------------------------------------

test('Go Expert warns when a preset is selected over an existing custom setup', async ({ page }) => {
  test.setTimeout(PLAYWRIGHT_TIMEOUTS.testHeavy)
  await bootOnPreset(page)
  await makeDocumentCustom(page)
  await expect(customButton(page)).toHaveAttribute('aria-pressed', 'true', { timeout: PLAYWRIGHT_TIMEOUTS.expectLong })

  // Trying a preset leaves the custom setup only in the snapshot, which Go Expert would
  // discard — so it must ask first. (The pressed state is a visual hold; the confirmation
  // reads the COMMITTED preset match, hence the settle.)
  await switchToMidgame(page)
  await goExpert(page)
  const confirm = page.getByRole('dialog', { name: 'Switch to Expert mode?' })
  await expect(confirm, 'no warning before discarding the custom setup').toBeVisible({ timeout: PLAYWRIGHT_TIMEOUTS.expectDefault })
  await confirm.getByRole('button', { name: 'Cancel', exact: true }).click()
  await expect(confirm).toBeHidden({ timeout: PLAYWRIGHT_TIMEOUTS.expectDefault })
  // Cancelling keeps the simple view and the custom setup on offer.
  await expect(customButton(page)).toBeVisible()
})

// ---------------------------------------------------------------------------
// The dirty dot.
// ---------------------------------------------------------------------------

test('the Custom button wears the dirty dot while the custom setup is unsaved', async ({ page }) => {
  test.setTimeout(PLAYWRIGHT_TIMEOUTS.testHeavy)
  // Boot restores the seeded unsaved setup with the provenance the entry recorded — still
  // unsaved — instead of presenting it as a freshly opened file.
  await bootOnSeededCustom(page)
  await expect(customDirtyDot(page), 'the restore lost the unsaved state').toHaveCount(1, { timeout: PLAYWRIGHT_TIMEOUTS.expectLong })

  // Trying a preset keeps the dot on Custom: the live document is now the clean preset,
  // but the custom setup in the snapshot is still unsaved.
  await switchToMidgame(page)
  await expect(customDirtyDot(page)).toHaveCount(1)
})

test('re-selecting Custom lands unsaved in expert mode', async ({ page }) => {
  test.setTimeout(PLAYWRIGHT_TIMEOUTS.testHeavy)
  await bootOnSeededCustom(page)
  await switchToMidgame(page)

  // Back to Custom: the snapshot re-load must land with its own unsaved state — the
  // header's dot in expert mode is the ground truth the Custom dot mirrors.
  await customButton(page).click()
  await expect(customButton(page)).toHaveAttribute('aria-pressed', 'true', { timeout: PLAYWRIGHT_TIMEOUTS.expectLong })
  await settleWorkload(page)
  await goExpert(page)
  await closeNotePanel(page)
  await expect(headerDirtyDot(page), 'the Custom re-load laundered the unsaved state').toHaveCount(1, { timeout: PLAYWRIGHT_TIMEOUTS.expectLong })
})

test('saving the custom setup in expert mode clears the dot on Custom', async ({ page }) => {
  test.setTimeout(PLAYWRIGHT_TIMEOUTS.testHeavy)
  await bootOnSeededCustom(page)
  await expect(customDirtyDot(page)).toHaveCount(1, { timeout: PLAYWRIGHT_TIMEOUTS.expectLong })

  // Save it in expert mode, and the dot is gone — in the header now, and on Custom back
  // in the simple view.
  await goExpert(page)
  await closeNotePanel(page)
  const download = page.waitForEvent('download')
  await page.locator('[data-tour-id="sfc.save"]').click()
  await download
  await expect(headerDirtyDot(page), 'the save did not clean the document').toHaveCount(0)
  await returnToSimple(page)
  await expect(customButton(page)).toHaveAttribute('aria-pressed', 'true', { timeout: PLAYWRIGHT_TIMEOUTS.expectLong })
  // The button above already landed; the dot is plain UI state, so the default budget applies.
  await expect(customDirtyDot(page), 'the dot stayed on after the save').toHaveCount(0, { timeout: PLAYWRIGHT_TIMEOUTS.expectDefault })
})

// ---------------------------------------------------------------------------
// Surviving a reload, and the one sanctioned discard.
// ---------------------------------------------------------------------------

test('a custom setup survives trying a preset and reloading', async ({ page }) => {
  test.setTimeout(PLAYWRIGHT_TIMEOUTS.testHeavy)
  await bootOnSeededCustom(page)
  // Try a preset: autosave now holds the preset, and the custom setup lives in the snapshot.
  await switchToMidgame(page)

  // A reload used to forget the custom setup here (the snapshot was in memory only): the
  // preset boots as selected, but the user's own rules must still be on offer — and still
  // flagged unsaved.
  await page.reload(APP_GOTO_OPTIONS)
  await dismissBlockingDialogs(page)
  await expect(midgameButton(page)).toHaveAttribute('aria-pressed', 'true', { timeout: PLAYWRIGHT_TIMEOUTS.expectLong })
  await expect(customButton(page), 'the reload forgot the custom setup').toBeVisible({ timeout: PLAYWRIGHT_TIMEOUTS.expectLong })
  await expect(customDirtyDot(page)).toHaveCount(1)

  // Selecting Custom restores it — the marker line proves it is the seeded body — still unsaved.
  await customButton(page).click()
  await expect(customButton(page)).toHaveAttribute('aria-pressed', 'true', { timeout: PLAYWRIGHT_TIMEOUTS.expectLong })
  await settleWorkload(page)
  await expect(page.getByRole('dialog').getByText(CUSTOM_MARK).first(), 'the restored body is not the custom one').toBeVisible({ timeout: PLAYWRIGHT_TIMEOUTS.expectLong })
  await expect(customDirtyDot(page)).toHaveCount(1)
})
test('confirming Go Expert over a preset forgets the custom setup', async ({ page }) => {
  test.setTimeout(PLAYWRIGHT_TIMEOUTS.testHeavy)
  await bootOnSeededCustom(page)
  await switchToMidgame(page)

  // Confirm the discard, then come back: Custom is gone — the user decided.
  await confirmGoExpertDiscard(page)
  await closeNotePanel(page)
  await returnToSimple(page)
  await expect(midgameButton(page)).toHaveAttribute('aria-pressed', 'true', { timeout: PLAYWRIGHT_TIMEOUTS.expectLong })
  await expect(customButton(page), 'the discard did not forget the custom setup').toHaveCount(0)
})

test('a discarded custom setup stays forgotten across a reload', async ({ page }) => {
  test.setTimeout(PLAYWRIGHT_TIMEOUTS.testHeavy)
  await bootOnSeededCustom(page)
  await switchToMidgame(page)
  await confirmGoExpertDiscard(page)
  // Back to the simple view first: Go Expert persists expert mode, and a reload would
  // otherwise boot into the full UI, where the toggle does not exist at all.
  await closeNotePanel(page)
  await returnToSimple(page)
  await expect(midgameButton(page)).toHaveAttribute('aria-pressed', 'true', { timeout: PLAYWRIGHT_TIMEOUTS.expectLong })

  // The durable snapshot was deleted with the discard, so a reload cannot bring it back.
  await page.reload(APP_GOTO_OPTIONS)
  await dismissBlockingDialogs(page)
  await expect(midgameButton(page)).toHaveAttribute('aria-pressed', 'true', { timeout: PLAYWRIGHT_TIMEOUTS.expectLong })
  await settleWorkload(page)
  await expect(customButton(page), 'the discarded custom setup came back after a reload').toHaveCount(0)
})

// ---------------------------------------------------------------------------
// Override answers, and the right-click menu.
// ---------------------------------------------------------------------------

test('override answers survive switching to a preset and back to Custom', async ({ page }) => {
  test.setTimeout(PLAYWRIGHT_TIMEOUTS.testHeavy)
  await bootOnSeededCustom(page)

  // Tune an answer on the custom setup, then switch to a preset and back.
  await selectExpressOverride(page, ENDGAME_ANSWER_LABEL)
  await switchToMidgame(page)
  await customButton(page).click()
  await expect(customButton(page)).toHaveAttribute('aria-pressed', 'true', { timeout: PLAYWRIGHT_TIMEOUTS.expectLong })
  await settleWorkload(page)

  // The custom setup must come back WITH its answers. It used to come back without them:
  // the preset load cleared the answers one commit before it replaced the content, and the
  // latch snapshotted the custom body in that answer-less state.
  const endgame = expressOverrideRow(page, ENDGAME_ANSWER_LABEL)
  await expect(endgame.locator('input[type="checkbox"]'), 'the override answers were lost on the way back to Custom')
    .toBeChecked({ timeout: PLAYWRIGHT_TIMEOUTS.expectLong })
})

test('the Custom menu saves the custom rules to a file and clears the dot', async ({ page }) => {
  test.setTimeout(PLAYWRIGHT_TIMEOUTS.testHeavy)
  await bootOnSeededCustom(page)
  await expect(customDirtyDot(page)).toHaveCount(1, { timeout: PLAYWRIGHT_TIMEOUTS.expectLong })

  // Right-click Custom -> Save: a download, and the rules read saved from then on.
  await customButton(page).click({ button: 'right' })
  const download = page.waitForEvent('download')
  await page.getByRole('menuitem', { name: 'Save custom SFC file…' }).click()
  await download
  // A synchronous click handler clears the stamp — plain UI state, default budget.
  await expect(customDirtyDot(page), 'the save did not clear the dot').toHaveCount(0, { timeout: PLAYWRIGHT_TIMEOUTS.expectDefault })

  // Still saved after a reload.
  await page.reload(APP_GOTO_OPTIONS)
  await dismissBlockingDialogs(page)
  await expect(customButton(page)).toHaveAttribute('aria-pressed', 'true', { timeout: PLAYWRIGHT_TIMEOUTS.expectLong })
  await settleWorkload(page)
  await expect(customDirtyDot(page)).toHaveCount(0)
})

test('the Custom menu discards unsaved custom rules after confirming', async ({ page }) => {
  test.setTimeout(PLAYWRIGHT_TIMEOUTS.testHeavy)
  await bootOnSeededCustom(page)
  await switchToMidgame(page)

  // With a preset selected the menu offers Discard; unsaved rules ask first.
  await customButton(page).click({ button: 'right' })
  await page.getByRole('menuitem', { name: 'Discard custom rules' }).click()
  const confirm = page.getByRole('dialog', { name: 'Discard custom rules?' })
  await expect(confirm, 'no confirmation before discarding unsaved rules').toBeVisible({ timeout: PLAYWRIGHT_TIMEOUTS.expectDefault })
  await confirm.getByRole('button', { name: 'Discard', exact: true }).click()
  await expect(confirm).toBeHidden({ timeout: PLAYWRIGHT_TIMEOUTS.expectDefault })
  await expect(customButton(page), 'the discard did not forget the custom setup').toHaveCount(0)

  // And it stays forgotten across a reload.
  await page.reload(APP_GOTO_OPTIONS)
  await dismissBlockingDialogs(page)
  await expect(midgameButton(page)).toHaveAttribute('aria-pressed', 'true', { timeout: PLAYWRIGHT_TIMEOUTS.expectLong })
  await settleWorkload(page)
  await expect(customButton(page)).toHaveCount(0)
})
