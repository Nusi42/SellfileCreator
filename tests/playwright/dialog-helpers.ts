import { expect, type Locator, type Page } from '@playwright/test'
import { PLAYWRIGHT_TIMEOUTS } from './timeouts'

// Shared dialog titles so test selectors stay consistent.
export const NOTE_DIALOG_TITLES = ['Note & Recipe Overrides', 'Note'] as const
// Restore prompts use a flexible title across app versions.
export const RESTORE_DIALOG_TITLE = /restore/i
// Standard close labels used across dialogs in the UI.
export const NOTE_DIALOG_CLOSE_LABEL = 'Close'
// Restore prompts rely on a Dismiss call to action.
export const RESTORE_DIALOG_DISMISS_LABEL = /Dismiss/i

type CloseDialogOptions = {
  closeLabel?: string | RegExp
  appearTimeout?: number
}

export async function closeDialogIfVisible(
  dialog: Locator,
  options: CloseDialogOptions = {},
): Promise<boolean> {
  // Prefer the standard Close label when callers do not override it.
  const { closeLabel = NOTE_DIALOG_CLOSE_LABEL, appearTimeout = 0 } = options
  // Optionally wait for the dialog to appear before checking visibility.
  if (appearTimeout > 0) {
    await dialog.waitFor({ state: 'visible', timeout: appearTimeout }).catch(() => undefined)
  }
  // Skip work when the dialog is already gone.
  const isVisible = await dialog.isVisible().catch(() => false)
  if (!isVisible) return false
  // Target the close button inside the dialog so we avoid global matches.
  const closeButton = dialog.getByRole('button', { name: closeLabel }).first()
  try {
    // Use a normal click to follow the same focus path as a user.
    await closeButton.click({ timeout: PLAYWRIGHT_TIMEOUTS.expectDefault })
  } catch {
    // Fall back to a forced click when overlays intercept pointer events.
    await closeButton.click({ timeout: PLAYWRIGHT_TIMEOUTS.expectDefault, force: true }).catch(() => undefined)
  }
  // Wait for the dialog to fully dismiss before continuing.
  await expect(dialog).toBeHidden({ timeout: PLAYWRIGHT_TIMEOUTS.expectDefault }).catch(() => undefined)
  return true
}

export async function dismissBlockingDialogs(page: Page): Promise<void> {
  // Close note dialogs that can appear after config imports.
  for (const title of NOTE_DIALOG_TITLES) {
    await closeDialogIfVisible(page.getByRole('dialog', { name: title }), {
      closeLabel: NOTE_DIALOG_CLOSE_LABEL,
      appearTimeout: PLAYWRIGHT_TIMEOUTS.uiPopover,
    })
  }
  // Dismiss restore prompts so they do not steal focus.
  await closeDialogIfVisible(page.getByRole('dialog', { name: RESTORE_DIALOG_TITLE }), {
    closeLabel: RESTORE_DIALOG_DISMISS_LABEL,
    appearTimeout: PLAYWRIGHT_TIMEOUTS.uiPopover,
  })
  // Send Escape as a final sweep for lingering popovers.
  await page.keyboard.press('Escape').catch(() => undefined)
}
