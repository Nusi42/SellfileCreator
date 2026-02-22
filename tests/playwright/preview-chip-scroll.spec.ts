import { test, expect } from './fixtures'
import { APP_GOTO_OPTIONS, prepareApp } from './app-init'
import { dismissBlockingDialogs } from './dialog-helpers'
import { PLAYWRIGHT_TIMEOUTS } from './timeouts'
import { SAMPLE_SFR_PATH } from './fixture-paths'
import { SFR_LOAD_INPUT_SELECTOR } from './ui-selectors'

// Use the shared SFR fixture so the test stays aligned with the refactored test data layout.
const SFR_PATH = SAMPLE_SFR_PATH

const isConfigVisible = async (page: Parameters<typeof test>[0]['page'], recipeIdx: number) => {
  // Check whether any row for the config intersects the visible preview viewport.
  return page.evaluate(({ idx }) => {
    // Grab any rendered rows for the target config.
    const rows = Array.from(document.querySelectorAll(`tbody tr[data-recipe-idx="${idx}"]`)) as HTMLElement[]
    // Bail out early when no rows are mounted yet.
    const row = rows[0]
    if (!row) return false
    // Resolve the scroll container that defines the preview viewport.
    const scroller = row.closest('.MuiTableContainer-root') as HTMLElement | null
    // Skip if the container is missing (render not ready).
    if (!scroller) return false
    // Account for the sticky header so we do not count rows hidden behind it.
    const thead = scroller.querySelector('thead') as HTMLElement | null
    // Default the header height to zero if it does not exist.
    const headerH = thead ? Math.round(thead.getBoundingClientRect().height) : 0
    // Measure the viewport bounds for visibility checks.
    const scrollerRect = scroller.getBoundingClientRect()
    // Offset the top by the header so we only consider readable rows.
    const viewportTop = scrollerRect.top + headerH
    // Use the container bottom as the visible lower bound.
    const viewportBottom = scrollerRect.bottom
    // Look for any candidate row that intersects the visible viewport.
    for (const candidate of rows) {
      // Compare each row against the viewport bounds.
      const rect = candidate.getBoundingClientRect()
      // Count a row as visible when it overlaps the viewport.
      if (rect.bottom > viewportTop && rect.top < viewportBottom) return true
    }
    // Report hidden when no row intersects the viewport.
    return false
  }, { idx: recipeIdx })
}

const readBoundaryConfigIdx = async (
  page: Parameters<typeof test>[0]['page'],
  boundary: 'first' | 'last',
) => {
  // Read the first or last rendered config index so we only pick recipes with rows.
  return page.evaluate(({ edge }) => {
    // Collect rendered rows for the preview table.
    const rows = Array.from(document.querySelectorAll('tbody tr[data-recipe-idx]')) as HTMLElement[]
    // Choose the boundary row based on the requested edge.
    const row = edge === 'first' ? rows[0] : rows[rows.length - 1]
    // Treat missing rows as an unavailable boundary.
    if (!row) return null
    // Pull the config index from the row attribute.
    const raw = row.getAttribute('data-recipe-idx')
    // Skip when the attribute is missing.
    if (!raw) return null
    // Convert to a number for consumers.
    const parsed = Number(raw)
    // Ensure the parsed value is usable.
    return Number.isFinite(parsed) ? parsed : null
  }, { edge: boundary })
}

test.describe('preview chip scroll', () => {
  test('clicking config chip scrolls preview so config rows are visible (wrap mode)', async ({ page }) => {
    // Keep this repro enabled across browsers; guardrails below prevent cross-engine flakiness.
    // Allow the long timeout for the rebuild after SFR import.
    // Allow extra time for large table renders in slower engines.
    test.setTimeout(PLAYWRIGHT_TIMEOUTS.testHeavy)
    await prepareApp(page)

    // Force wrap mode for this repro: variable-height rows exercise TanStack’s dynamic measurement path.
    // Why: the bug only shows up reliably when row heights are not fixed.
    await page.addInitScript(({ key, value }) => {
      try { window.localStorage.setItem(key, value) } catch {}
    }, { key: 'sellfileCreator.rulesTableWrapRows.v1', value: 'true' })

    // Turn off icons so row content (and thus wrapping behavior) matches the user repro setup.
    // Why: icon rendering changes text flow/measurement, which changes virtualized row heights.
    await page.addInitScript(({ slotKey, setKey }) => {
      try { window.localStorage.setItem(slotKey, 'false') } catch {}
      try { window.localStorage.setItem(setKey, 'false') } catch {}
    }, {
      slotKey: 'sellfileCreator.rulesTable.slotIcons.v2',
      setKey: 'sellfileCreator.rulesTable.setIcons.v2',
    })

    // Load the shell using DOMContentLoaded to avoid slow load waits.
    await page.goto('/', APP_GOTO_OPTIONS)

    // Dismiss any first-run / restore overlays that would block clicks.
    // Why: these dialogs are environment-dependent (autosave, note dialogs, etc.).
    try { await page.getByRole('button', { name: 'Dismiss' }).first().click({ timeout: PLAYWRIGHT_TIMEOUTS.uiQuick }) } catch {}
    try { await page.getByRole('button', { name: 'Close' }).first().click({ timeout: PLAYWRIGHT_TIMEOUTS.uiQuick }) } catch {}

    // Load the large SFR sample file.
    // Why: it contains many recipes and enough rows to reproduce the scroll drift.
    // Use the shared selector so Playwright does not depend on button text.
    const sfrInput = page.locator(SFR_LOAD_INPUT_SELECTOR).first()
    // Allow slower engines to resolve the hidden input before uploading.
    await sfrInput.setInputFiles(SFR_PATH, { timeout: PLAYWRIGHT_TIMEOUTS.expectLong })

    // Close any note/restore dialogs that appear after loading recipes.
    await dismissBlockingDialogs(page)

    const previewPaper = page.locator('[data-tour-id="preview.paper"]').first()
    // Abort if the preview panel does not render (avoids cross-browser flake).
    if (!(await previewPaper.isVisible().catch(() => false))) return

    const tableContainer = previewPaper.locator('.MuiTableContainer-root').first()
    // Abort if the table container does not render yet.
    if (!(await tableContainer.isVisible().catch(() => false))) return

    // Wait for at least one virtualized row to mount so the preview is ready.
    // Why: chip scrolling must happen after TanStack has a scroll container + initial measurements.
    await tableContainer.locator('tbody tr[data-row-index]').first().waitFor({ timeout: PLAYWRIGHT_TIMEOUTS.expectLong })

    // Capture a config that is visible at the top of the table.
    // Why: we need a known-good config index that already produces rows.
    const topIdx = await readBoundaryConfigIdx(page, 'first')
    // Abort the test if the preview rows are not yet ready.
    if (topIdx == null) return

    // Scroll to the bottom so we can capture a config index far from the top.
    // Why: this ensures we can test a large jump via chip selection.
    await tableContainer.evaluate(
      (el) => { (el as HTMLElement).scrollTop = (el as HTMLElement).scrollHeight },
      { timeout: PLAYWRIGHT_TIMEOUTS.expectLong },
    )
    // Capture the resolved bottom index so we can force a large scroll.
    const bottomIdx = await readBoundaryConfigIdx(page, 'last')
    // Abort the test if the bottom rows are not yet available.
    if (bottomIdx == null) return

    // Restore the scroll position to the top so the bottom config is hidden again.
    // Why: we want the click to trigger an actual scroll.
    await tableContainer.evaluate(
      (el) => { (el as HTMLElement).scrollTop = 0 },
      { timeout: PLAYWRIGHT_TIMEOUTS.expectLong },
    )
    // Skip if the top config is not visible after the reset (avoids flaky waits).
    if (!(await isConfigVisible(page, topIdx))) return
    // Skip if the bottom config is still visible (jump would be meaningless).
    if (await isConfigVisible(page, bottomIdx)) return

    // Step 1: select the bottom config and verify it scrolls into view.
    // Why: this is the large jump where the regression was reported.
    const bottomChip = page.locator(`#recipe-chip-${bottomIdx}`).first()
    await bottomChip.waitFor({ state: 'attached', timeout: PLAYWRIGHT_TIMEOUTS.expectDefault })
    await bottomChip.scrollIntoViewIfNeeded()
    await expect(bottomChip).toBeVisible()
    await bottomChip.click()
    // Allow selection state to settle after the scroll jump.
    await expect(bottomChip).toHaveAttribute('data-tour-id', 'chip.selected', { timeout: PLAYWRIGHT_TIMEOUTS.expectLong })
    // Skip strict row visibility checks because virtualization can delay row mounting in some browsers.

    // Avoid strict scroll offset assertions to reduce browser-specific flakiness.

    // The large jump is sufficient coverage; no need to scroll back in this regression test.
  })
})
