import { test, expect } from './fixtures'
import path from 'node:path'
import { prepareApp } from './app-init'

const NUSI_HSFC_PATH = path.resolve(process.cwd(), 'examples', 'example.hsfc')

// Config chips are 0-based internally while the UI labels are 1-based.
// Why: the scroll bug reports refer to the label (e.g. "184"), but the DOM ids use the 0-based index.
// Use a config that is guaranteed to emit preview rules in `examples/example.hsfc`.
// Why: some configs are "Separator" visibility-only entries and may not produce any preview rows to scroll to.
const TARGET_CFG_LABEL = 185
const TARGET_CFG_IDX = TARGET_CFG_LABEL - 1
const PRESELECT_CFG_LABEL = 2
const PRESELECT_CFG_IDX = PRESELECT_CFG_LABEL - 1

test.describe('preview chip scroll', () => {
  test('clicking config chip scrolls preview so config rows are visible (wrap mode)', async ({ page }) => {
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

    await page.goto('/')

    // Dismiss any first-run / restore overlays that would block clicks.
    // Why: these dialogs are environment-dependent (autosave, note dialogs, etc.).
    try { await page.getByRole('button', { name: 'Dismiss' }).first().click({ timeout: 1_000 }) } catch {}
    try { await page.getByRole('button', { name: 'Close' }).first().click({ timeout: 1_000 }) } catch {}

    // Load the large HSFC sample file.
    // Why: it contains many configs (including 184) and enough rows to reproduce the scroll drift.
    const loadConfigsButton = page.getByRole('button', { name: /Load Configs/i })
    await loadConfigsButton.locator('input[type="file"]').setInputFiles(NUSI_HSFC_PATH)

    // Close the "Note" dialog that appears after loading configs.
    // Why: it blocks interaction with the chips/table underneath.
    try { await page.getByRole('dialog', { name: 'Note' }).getByRole('button', { name: 'Close' }).click({ timeout: 30_000 }) } catch {}
    try { await page.keyboard.press('Escape') } catch {}

    const previewPaper = page.locator('[data-tour-id="preview.paper"]').first()
    await previewPaper.waitFor({ state: 'visible', timeout: 30_000 })

    const tableContainer = previewPaper.locator('.MuiTableContainer-root').first()
    await tableContainer.waitFor({ state: 'visible', timeout: 30_000 })

    // Wait for at least one virtualized row to mount so the preview is ready.
    // Why: chip scrolling must happen after TanStack has a scroll container + initial measurements.
    await tableContainer.locator('tbody tr[data-row-index]').first().waitFor({ timeout: 120_000 })

    // Step 1 (per repro): select config #2 and wait for it to scroll into view.
    // First assert it is not currently visible so we know the click must trigger a scroll.
    // Why: the flaky bug only reproduces when we perform a real jump, not when the config is already on screen.
    await expect.poll(async () => {
      return page.evaluate(({ cfgIdx }) => {
        const row = document.querySelector(`tbody tr[data-cfg-idx="${cfgIdx}"]`) as HTMLElement | null
        if (!row) return false
        const scroller = row.closest('.MuiTableContainer-root') as HTMLElement | null
        if (!scroller) return false
        const thead = scroller.querySelector('thead') as HTMLElement | null
        const headerH = thead ? Math.round(thead.getBoundingClientRect().height) : 0
        const scrollerRect = scroller.getBoundingClientRect()
        const rowRect = row.getBoundingClientRect()
        const viewportTop = scrollerRect.top + headerH
        const viewportBottom = scrollerRect.bottom
        return rowRect.bottom > viewportTop && rowRect.top < viewportBottom
      }, { cfgIdx: PRESELECT_CFG_IDX })
    }, { timeout: 10_000, intervals: [100, 250, 500] }).toBe(false)

    const beforePreselectScrollTop = await tableContainer.evaluate((el) => (el as HTMLElement).scrollTop)
    const preselectChip = page.locator(`#cfg-chip-${PRESELECT_CFG_IDX}`).first()
    await preselectChip.waitFor({ state: 'attached', timeout: 30_000 })
    await preselectChip.scrollIntoViewIfNeeded()
    await expect(preselectChip).toBeVisible()
    await preselectChip.click()
    await expect(preselectChip).toHaveAttribute('data-tour-id', 'chip.selected')
    await expect.poll(async () => {
      return page.evaluate(({ cfgIdx }) => {
        const row = document.querySelector(`tbody tr[data-cfg-idx="${cfgIdx}"]`) as HTMLElement | null
        if (!row) return false
        const scroller = row.closest('.MuiTableContainer-root') as HTMLElement | null
        if (!scroller) return false
        const thead = scroller.querySelector('thead') as HTMLElement | null
        const headerH = thead ? Math.round(thead.getBoundingClientRect().height) : 0
        const scrollerRect = scroller.getBoundingClientRect()
        const rowRect = row.getBoundingClientRect()
        const viewportTop = scrollerRect.top + headerH
        const viewportBottom = scrollerRect.bottom
        return rowRect.bottom > viewportTop && rowRect.top < viewportBottom
      }, { cfgIdx: PRESELECT_CFG_IDX })
    }, { timeout: 10_000, intervals: [100, 250, 500] }).toBe(true)

    // Confirm we actually scrolled, not just toggled selection.
    // Why: we need to start the next step (config #185) from a scrolled position to reproduce the large jump.
    await expect.poll(async () => {
      const top = await tableContainer.evaluate((el) => (el as HTMLElement).scrollTop)
      return Math.abs(top - beforePreselectScrollTop)
    }, { timeout: 10_000, intervals: [100, 250, 500] }).toBeGreaterThan(500)

    // Step 2 (per repro): select config #185 and verify at least one row becomes visible.
    // Why: the chip list can be long and horizontally/vertically scrollable.
    // Also ensure config #185 is not visible before the click so the click must trigger a scroll.
    await expect.poll(async () => {
      return page.evaluate(({ cfgIdx }) => {
        const row = document.querySelector(`tbody tr[data-cfg-idx="${cfgIdx}"]`) as HTMLElement | null
        if (!row) return false
        const scroller = row.closest('.MuiTableContainer-root') as HTMLElement | null
        if (!scroller) return false
        const thead = scroller.querySelector('thead') as HTMLElement | null
        const headerH = thead ? Math.round(thead.getBoundingClientRect().height) : 0
        const scrollerRect = scroller.getBoundingClientRect()
        const rowRect = row.getBoundingClientRect()
        const viewportTop = scrollerRect.top + headerH
        const viewportBottom = scrollerRect.bottom
        return rowRect.bottom > viewportTop && rowRect.top < viewportBottom
      }, { cfgIdx: TARGET_CFG_IDX })
    }, { timeout: 10_000, intervals: [100, 250, 500] }).toBe(false)

    const chip = page.locator(`#cfg-chip-${TARGET_CFG_IDX}`).first()
    await chip.waitFor({ state: 'attached', timeout: 30_000 })
    await chip.scrollIntoViewIfNeeded()
    await expect(chip).toBeVisible()
    await chip.click()
    await expect(chip).toHaveAttribute('data-tour-id', 'chip.selected')

    // Expect at least one row for cfgIdx=184 to be visible within the preview scroller viewport.
    // Why: users consider the scroll successful once *any* row in the selected config block is readable.
    await expect.poll(async () => {
      return page.evaluate(({ cfgIdx }) => {
        const row = document.querySelector(`tbody tr[data-cfg-idx="${cfgIdx}"]`) as HTMLElement | null
        if (!row) return false
        const scroller = row.closest('.MuiTableContainer-root') as HTMLElement | null
        if (!scroller) return false
        const thead = scroller.querySelector('thead') as HTMLElement | null
        const headerH = thead ? Math.round(thead.getBoundingClientRect().height) : 0
        const scrollerRect = scroller.getBoundingClientRect()
        const rowRect = row.getBoundingClientRect()
        const viewportTop = scrollerRect.top + headerH
        const viewportBottom = scrollerRect.bottom
        return rowRect.bottom > viewportTop && rowRect.top < viewportBottom
      }, { cfgIdx: TARGET_CFG_IDX })
    }, { timeout: 10_000, intervals: [100, 250, 500] }).toBe(true)
  })
})
