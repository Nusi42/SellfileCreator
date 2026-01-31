import type { Page, Locator } from '@playwright/test'

// Shared label for the preview workload progress indicator.
export const WORKLOAD_ARIA_LABEL = 'Building…'

export const getWorkloadIndicator = (page: Page): Locator => {
  // Scope to the preview chip so dialogs using the same label do not match.
  return page
    .locator(`[data-tour-id="preview.paper"] [role="status"][aria-label="${WORKLOAD_ARIA_LABEL}"]`)
    .first()
}
