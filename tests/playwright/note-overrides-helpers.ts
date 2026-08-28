/**
 * note-overrides-helpers.ts
 *
 * Shared helpers for driving lategame.sfc's recipe-override questionnaire from
 * Playwright specs. The note dialog ("Note & Dynamic Overrides") renders the
 * override questions as checkboxes/radio buttons; toggling them rewrites which
 * recipes are active and re-configures the WASM rule engine with a materially
 * different rule set (and thus different allocation sizes).
 *
 * Extracted from midgame-progression.spec.ts so the fragmentation stress spec
 * and the progression spec share one definition of "flip an override + settle".
 */
import { expect, type Page } from '@playwright/test'
import { NOTE_DIALOG_TITLES, NOTE_DIALOG_CLOSE_LABEL } from './dialog-helpers'
import { PLAYWRIGHT_TIMEOUTS } from './timeouts'
import { settleWorkload } from './workload-indicator'
import { NOTE_TOGGLE_SELECTOR } from './ui-selectors'

// How many times a helper re-opens the note dialog after the app auto-closed it
// (see setNoteOverrideCheckbox). Two: one legitimate auto-close per toggle is
// expected, a second in a row means something else is wrong and should fail loudly.
const NOTE_DIALOG_REOPEN_ATTEMPTS = 2

// Distinctive fragments of the lategame preset's account-mode answers, shared by every
// spec that flips them so a wording change in the preset is a one-line fix.
export const ENDGAME_ANSWER_LABEL = 'I can finish all Hard game modes'
export const ENDGAME_PLUS_ANSWER_LABEL = 'If you really want to get rid of more'

/**
 * An override answer row inside the EXPRESS (simple-mode) note dialog, by label fragment.
 * FormControlLabel renders <label>…<input>…</label>, so the row is the checkbox's label.
 *
 * Express mode cannot use setNoteOverrideCheckbox: its retry path re-opens the dialog via
 * the header toggle, which express mode does not render at all.
 */
export const expressOverrideRow = (page: Page, labelFragment: string) => page
  .locator('[role="dialog"] input[type="checkbox"]')
  .locator('xpath=ancestor::label')
  .filter({ hasText: labelFragment })
  .first()

/** Click one override answer in the express note dialog and let the preview settle. */
export const selectExpressOverride = async (page: Page, labelFragment: string): Promise<void> => {
  const row = expressOverrideRow(page, labelFragment)
  await expect(row).toBeVisible({ timeout: PLAYWRIGHT_TIMEOUTS.expectLong })
  await row.click()
  await settleWorkload(page)
}

/**
 * Open the Note & Dynamic Overrides dialog via the header toggle and wait for it
 * to render its override checkboxes. Used when the dialog is not already open
 * (e.g. to re-open it between iterations after a previous close).
 */
export const openNoteDialog = async (page: Page): Promise<void> => {
  await page.locator(NOTE_TOGGLE_SELECTOR).first().click()
  const noteDialog = page.getByRole('dialog', { name: NOTE_DIALOG_TITLES[0] })
    .or(page.getByRole('dialog', { name: NOTE_DIALOG_TITLES[1] }))
  await expect(noteDialog).toBeVisible({ timeout: PLAYWRIGHT_TIMEOUTS.expectLong })
}

/**
 * Wait for the preview workload indicator to settle (appear then vanish, or
 * never appear on a cache-hit fast path). Catching both waits is intentional:
 * a fast pipeline may finish before the spinner ever renders.
 */
export const waitForWorkloadIdle = async (page: Page): Promise<void> => {
  // Thin alias over the canonical settle routine (visible=expectDefault,
  // hidden=workloadIdle). Kept as a named export for the override specs that
  // already reference it; the actual logic has exactly one home in settleWorkload.
  await settleWorkload(page)
}

/**
 * Find a recipe-override checkbox in the open note dialog by visible label text
 * and set it to the desired checked state. Returns once the checkbox matches the
 * requested state (or throws on timeout if no such checkbox exists).
 *
 * Scanning raw DOM inside [role="dialog"] (rather than a Playwright locator)
 * avoids locator re-resolution timeouts while the 194-recipe SFC is still
 * churning the DOM — each poll is a fresh synchronous scan immune to that churn.
 *
 * Re-opens the dialog and retries when the checkbox never appears. A preceding toggle
 * can dismiss it: unchecking the last active account mode leaves no mode selected, the
 * note resolves to an empty document, and App's `closeNoteAfterLoad` closes the dialog.
 * The next call in a multi-toggle sequence (uncheck old mode → check new one) then
 * scanned a page with no dialog and burned its full budget. Re-opening is safe and
 * idempotent — the header action is a pure open, never a toggle.
 */
export const setNoteOverrideCheckbox = async (
  page: Page,
  labelSubstring: string,
  checked: boolean,
): Promise<void> => {
  // The auto-close can also land WHILE we poll, so a pre-check would not be enough. Bound
  // the reopen attempts instead: each pass waits for the checkbox on its own budget, and a
  // pass that never finds one re-opens and tries again.
  //
  // Never pre-open: callers may be waiting on a dialog that opens ITSELF (an SFC import
  // auto-opens the note viewer), and clicking the header action before the import lands
  // opens the note EDITOR instead — which carries no override checkboxes at all. Only the
  // in-page wait below decides that the dialog is genuinely absent, and only after it has
  // had time to appear on its own.
  for (let attempt = 0; attempt < NOTE_DIALOG_REOPEN_ATTEMPTS; attempt++) {
    // Re-open only on a RETRY, once the first pass proved the checkbox never showed up.
    // By then any auto-open has long since landed, so the note is present and the header
    // action opens the viewer (with checkboxes) rather than the editor.
    if (attempt > 0) await openNoteDialog(page)
    const settled = await page.waitForFunction(
      ({ label, want }: { label: string; want: boolean }) => {
        // Only the note dialog carries recipe-override checkboxes, so the first
        // label match is always the intended target.
        const inputs = Array.from(
          document.querySelectorAll<HTMLInputElement>('[role="dialog"] input[type="checkbox"]'),
        )
        const target = inputs.find((input) => {
          // FormControlLabel renders <label>…<input>…</label>; the label text is in
          // the closest <label> (or the input's parent as a fallback).
          const labelEl = input.closest('label') ?? input.parentElement
          return (labelEl?.textContent ?? '').toLowerCase().includes(label.toLowerCase())
        })
        if (!target) return false
        // Click only when the current state differs from what we want.
        if (target.checked !== want) target.click()
        return true
      },
      { label: labelSubstring, want: checked },
      { timeout: PLAYWRIGHT_TIMEOUTS.expectLong },
    ).then(() => true).catch(() => false)
    if (settled) return
    // The checkbox never appeared. The usual cause is the app closing the dialog under us
    // (a prior toggle emptied the note — App's `closeNoteAfterLoad`), so loop and re-open.
    // The final attempt falls through to the throw below rather than passing silently.
  }
  throw new Error(
    `setNoteOverrideCheckbox("${labelSubstring}"): checkbox never became available across `
    + `${NOTE_DIALOG_REOPEN_ATTEMPTS} attempts (note dialog repeatedly absent or auto-closed)`,
  )
}

/**
 * Close the note dialog and wait for it to fully dismiss. Firefox animates the
 * close, so the dialog can linger for a couple of seconds after the click.
 *
 * The dialog may already be gone by the time this runs, and that is CORRECT app
 * behavior rather than a lost race: toggling an account-mode override rewrites the
 * note's active recipe set, and a reload that resolves to a document with no note
 * closes the dialog itself (App's `closeNoteAfterLoad`). Asserting the Close button
 * unconditionally then failed with "element(s) not found" on exactly those
 * transitions. Treat "already closed" as success — the postcondition this helper
 * owes its callers is *the dialog is closed*, not *we were the ones who closed it*.
 */
export const closeNoteDialog = async (page: Page): Promise<void> => {
  const noteDialog = page.getByRole('dialog', { name: NOTE_DIALOG_TITLES[0] })
    .or(page.getByRole('dialog', { name: NOTE_DIALOG_TITLES[1] }))
  // ONE race-free wait covering both legal outcomes, evaluated inside the page on every
  // animation frame. A check-then-assert pair cannot work here: the auto-close can land
  // between the check and the assert, which is exactly how the unconditional version failed.
  // Resolves to 'gone' (the app closed it for us) or 'ready' (the Close button is present
  // and the rebuild's progress bar has cleared, so the click lands on an idle page — a click
  // dispatched mid-rebuild can be swallowed while the main thread is busy).
  const outcome = await page.waitForFunction(
    ({ titles, closeLabel }: { titles: readonly string[]; closeLabel: string }) => {
      // Match the dialog by the same accessible name the Playwright locator uses.
      const dialog = Array.from(document.querySelectorAll<HTMLElement>('[role="dialog"]'))
        .find((el) => {
          const id = el.getAttribute('aria-labelledby')
          const text = (id ? document.getElementById(id)?.textContent : el.getAttribute('aria-label')) ?? ''
          return titles.some((title) => text.includes(title))
        })
      // The app closed it itself — the postcondition already holds.
      if (!dialog) return 'gone'
      // Still rebuilding: the in-dialog LinearProgress is up, so keep polling.
      if (dialog.querySelector('.MuiLinearProgress-root')) return false
      // Ready only once the Close button actually exists to be clicked.
      const button = Array.from(dialog.querySelectorAll('button'))
        .find((el) => (el.textContent ?? '').trim() === closeLabel)
      return button ? 'ready' : false
    },
    { titles: NOTE_DIALOG_TITLES, closeLabel: NOTE_DIALOG_CLOSE_LABEL },
    { timeout: PLAYWRIGHT_TIMEOUTS.expectLong },
  ).then((handle) => handle.jsonValue())
  // Nothing left to do when the app already dismissed it.
  if (outcome === 'gone') return
  // Click via the DOM: the dialog is settled, and this skips actionability re-resolution
  // that could itself race a late auto-close.
  const closeButton = noteDialog.getByRole('button', { name: NOTE_DIALOG_CLOSE_LABEL })
  await closeButton.evaluate((el: HTMLElement) => el.click(), undefined, { timeout: PLAYWRIGHT_TIMEOUTS.expectDefault })
    // A close that raced us between the wait and the click leaves the dialog gone, which is
    // the outcome we wanted anyway; the hidden-wait below is the real postcondition check.
    .catch(() => undefined)
  await noteDialog.waitFor({ state: 'hidden', timeout: PLAYWRIGHT_TIMEOUTS.expectLong })
}
