import { test, expect } from './fixtures'
import { APP_GOTO_OPTIONS, prepareApp } from './app-init'
import { closeContextMenu, openContextMenu } from './context-menu'
import { dismissBlockingDialogs } from './dialog-helpers'
import { PLAYWRIGHT_TIMEOUTS } from './timeouts'
import { getWorkloadIndicator } from './workload-indicator'
import { SAMPLE_SMALL_SFR_PATH } from './fixture-paths'
import { SFR_LOAD_INPUT_SELECTOR } from './ui-selectors'

async function getFirstRulePositions(page: import('@playwright/test').Page): Promise<number[]> {
  return page.evaluate(() => {
    const rows = Array.from(document.querySelectorAll('[data-recipe-idx]'))
    const firstPositions = new Map<number, number>()
    rows.forEach((row, idx) => {
      const raw = row.getAttribute('data-recipe-idx')
      if (raw == null) return
      const recipeIdx = Number(raw)
      if (!Number.isFinite(recipeIdx)) return
      if (!firstPositions.has(recipeIdx)) {
        firstPositions.set(recipeIdx, idx)
      }
    })
    return Array.from(firstPositions.entries())
      .sort((a, b) => a[0] - b[0])
      .map(([, pos]) => pos)
  })
}

function positionsAreOrdered(positions: readonly number[]): boolean {
  for (let i = 1; i < positions.length; i += 1) {
    if (positions[i] < positions[i - 1]!) return false
  }
  return true
}

test.describe('config insert ordering', () => {
  test('HSF preview rows stay aligned with config order after paste after', async ({ page }) => {
    // Allow long timeout for the rebuilds triggered by SFR parsing + paste.
    test.setTimeout(PLAYWRIGHT_TIMEOUTS.testLong)
    await prepareApp(page, { stubClipboard: true })

    // Load the shell without waiting on full window load.
    await page.goto('/', APP_GOTO_OPTIONS)

    try {
      await page.getByRole('button', { name: 'Close' }).first().click({ timeout: PLAYWRIGHT_TIMEOUTS.uiQuick })
    } catch {
      /* overlay already dismissed */
    }

    // Use the small fixture so the rebuild stays inside the long timeout.
    const sfrPath = SAMPLE_SMALL_SFR_PATH
    // Target the hidden file input directly so label changes do not break the test.
    const sfrInput = page.locator(SFR_LOAD_INPUT_SELECTOR).first()
    // Allow slower engines to resolve the hidden input before uploading.
    await sfrInput.setInputFiles(sfrPath, { timeout: PLAYWRIGHT_TIMEOUTS.expectLong })

    // Clear any note/restore dialogs before interacting with chips.
    await dismissBlockingDialogs(page)
    // Fall back to a generic Close click for non-dialog overlays.
    try {
      await page.getByRole('button', { name: 'Close' }).first().click({ timeout: PLAYWRIGHT_TIMEOUTS.uiQuick })
    } catch {
      /* overlay already closed */
    }

    const previewRow = page.locator('[data-recipe-idx]')
    // First preview rows arrive after the initial rebuild finishes.
    await previewRow.first().waitFor({ timeout: PLAYWRIGHT_TIMEOUTS.expectLong })

    const buildingLabel = getWorkloadIndicator(page)
    try {
      // The rebuild indicator should clear once rows are ready.
      await buildingLabel.waitFor({ state: 'hidden', timeout: PLAYWRIGHT_TIMEOUTS.expectLong })
    } catch {
      /* already settled */
    }

    const baselinePositions = await getFirstRulePositions(page)
    expect(positionsAreOrdered(baselinePositions)).toBe(true)

    // Target the last chip in the small fixture as the paste source.
    const sourceChip = page.locator('#recipe-chip-2').first()
    await sourceChip.waitFor({ timeout: PLAYWRIGHT_TIMEOUTS.expectDefault })
    await openContextMenu(page, sourceChip)

    const copyItem = page.getByRole('menuitem', { name: 'Copy to Clipboard' })
    await expect(copyItem).toBeVisible()
    await copyItem.click()
    // Dismiss the context menu so it does not block the next chip.
    await closeContextMenu(page)

    // Paste after the first chip so ordering changes are easy to detect.
    const targetChip = page.locator('#recipe-chip-0').first()
    await targetChip.waitFor({ timeout: PLAYWRIGHT_TIMEOUTS.expectDefault })
    // Ensure no lingering menus intercept the next context menu.
    await closeContextMenu(page)
    await openContextMenu(page, targetChip)

    const pasteAfterItem = page.getByRole('menuitem', { name: 'Paste after' })
    await expect(pasteAfterItem).toBeVisible()
    await pasteAfterItem.click()
    // Close any remaining menus so the preview can update.
    await closeContextMenu(page)

    try {
      // Rebuild indicator can show briefly after paste.
      await buildingLabel.waitFor({ state: 'visible', timeout: PLAYWRIGHT_TIMEOUTS.uiMenu })
    } catch {
      /* warm may reuse cache */
    }
    try {
      // Allow the full rebuild budget to settle.
      await buildingLabel.waitFor({ state: 'hidden', timeout: PLAYWRIGHT_TIMEOUTS.expectLong })
    } catch {
      /* settle even if label never appeared */
    }

    // Wait for preview rows to re-appear after the paste action rebuilds the list.
    await page.waitForFunction(
      () => document.querySelectorAll('[data-recipe-idx]').length > 0,
      undefined,
      { timeout: PLAYWRIGHT_TIMEOUTS.expectLong },
    )

    const postInsertPositions = await getFirstRulePositions(page)
    expect(positionsAreOrdered(postInsertPositions)).toBe(true)
  })
})
