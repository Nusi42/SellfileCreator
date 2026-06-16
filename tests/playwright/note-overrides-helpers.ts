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
 */
export const setNoteOverrideCheckbox = async (
  page: Page,
  labelSubstring: string,
  checked: boolean,
): Promise<void> => {
  await page.waitForFunction(
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
  )
}

/**
 * Close the note dialog and wait for it to fully dismiss. Firefox animates the
 * close, so the dialog can linger for a couple of seconds after the click.
 */
export const closeNoteDialog = async (page: Page): Promise<void> => {
  const noteDialog = page.getByRole('dialog', { name: NOTE_DIALOG_TITLES[0] })
    .or(page.getByRole('dialog', { name: NOTE_DIALOG_TITLES[1] }))
  const closeButton = noteDialog.getByRole('button', { name: NOTE_DIALOG_CLOSE_LABEL })
  await expect(closeButton).toBeVisible({ timeout: PLAYWRIGHT_TIMEOUTS.expectDefault })
  // Use a direct DOM click — SFC processing is settled so the element is stable.
  await closeButton.evaluate((el: HTMLElement) => el.click(), undefined, { timeout: PLAYWRIGHT_TIMEOUTS.expectDefault })
  await noteDialog.waitFor({ state: 'hidden', timeout: PLAYWRIGHT_TIMEOUTS.expectLong })
}
