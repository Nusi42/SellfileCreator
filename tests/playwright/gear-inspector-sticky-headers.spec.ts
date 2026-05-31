import { expect, test } from './fixtures'
import { APP_GOTO_OPTIONS, prepareApp } from './app-init'
import { dismissBlockingDialogs } from './dialog-helpers'
import { PREVIEW_MODE_STORAGE_KEY } from '../../src/lib/constants'
import { PLAYWRIGHT_TIMEOUTS } from './timeouts'
import { ensureGearInspectorMode } from './gear-inspector-mode'
import {
  RULES_FILTER_OPEN_STORAGE_KEY,
  RULES_FILTER_STATE_STORAGE_KEY,
  cloneDefaultRulesFilterState,
} from '../../src/state/rulesFilterPersistence'
import { SAMPLE_SMALL_SFC_PATH, SAMPLE_SMALL_DB_PATH } from './fixture-paths'
import { SFC_LOAD_INPUT_SELECTOR } from './ui-selectors'
import { warmupAppShell } from './app-warmup'

// Seed Gear Inspector mode + default filters so the grid boots populated and deterministic.
const seedGearInspector = async (page: Parameters<typeof test>[0]['page']) => {
  const filterState = { rules: cloneDefaultRulesFilterState(), tester: cloneDefaultRulesFilterState() }
  // Open the Gear Inspector filter view so the grid renders its full group tree right away.
  const filterOpen = { rules: false, tester: true }
  await page.addInitScript(
    ({ previewKey, previewMode, filterKey, filterValue, filterOpenKey, filterOpenValue }) => {
      try {
        window.localStorage.setItem(previewKey, previewMode)
        window.localStorage.setItem(filterKey, filterValue)
        window.localStorage.setItem(filterOpenKey, filterOpenValue)
      } catch { /* ignore storage failures so the test can still proceed */ }
    },
    {
      previewKey: PREVIEW_MODE_STORAGE_KEY, previewMode: 'gearInspector',
      filterKey: RULES_FILTER_STATE_STORAGE_KEY, filterValue: JSON.stringify(filterState),
      filterOpenKey: RULES_FILTER_OPEN_STORAGE_KEY, filterOpenValue: JSON.stringify(filterOpen),
    },
  )
}

// Load the SFC + gear DB fixtures and wait for the Gear Inspector grid to populate.
const bootGearInspectorGrid = async (page: Parameters<typeof test>[0]['page']) => {
  await prepareApp(page)
  await seedGearInspector(page)
  await page.goto('/', APP_GOTO_OPTIONS)
  await dismissBlockingDialogs(page)
  const sfcInput = page.locator(SFC_LOAD_INPUT_SELECTOR).first()
  await sfcInput.waitFor({ state: 'attached', timeout: PLAYWRIGHT_TIMEOUTS.appGoto })
  await expect(sfcInput).toBeEnabled({ timeout: PLAYWRIGHT_TIMEOUTS.expectDefault })
  await sfcInput.setInputFiles(SAMPLE_SMALL_SFC_PATH)
  const dbInput = page.locator('input[type="file"][accept*=".db"]').first()
  await dbInput.waitFor({ state: 'attached', timeout: PLAYWRIGHT_TIMEOUTS.appGoto })
  await expect(dbInput).toBeEnabled({ timeout: PLAYWRIGHT_TIMEOUTS.expectDefault })
  await dbInput.setInputFiles(SAMPLE_SMALL_DB_PATH)
  await dismissBlockingDialogs(page)
  await ensureGearInspectorMode(page)
  await page.waitForFunction(
    () => document.querySelectorAll('[data-gear-inspector-grid-card="true"]').length > 0,
    undefined, { timeout: PLAYWRIGHT_TIMEOUTS.expectLong },
  )
}

test.beforeAll(async ({ browser }) => {
  // Allow the long timeout so the cold Vite compile can finish during warmup.
  test.setTimeout(PLAYWRIGHT_TIMEOUTS.testHeavy)
  await warmupAppShell(browser)
})

test.describe('Gear Inspector sticky headers', () => {
  test('pinned headers align with real headers and never overlap the scrollbar gutter', async ({ page }) => {
    test.setTimeout(PLAYWRIGHT_TIMEOUTS.testHeavy)
    await bootGearInspectorGrid(page)

    // Scroll partway down so earlier group headers pin into the overlay while later ones stay in flow.
    await page.evaluate(() => {
      const c = document.querySelector('[data-gear-inspector-grid-container="true"]') as HTMLElement | null
      if (c) c.scrollTop = Math.round((c.scrollHeight - c.clientHeight) * 0.6)
    })
    // Wait until both a pinned clone and an in-flow header are present so the comparison is meaningful.
    await page.waitForFunction(() => {
      const headers = Array.from(document.querySelectorAll('[data-gear-inspector-grid-header="true"]'))
      let pinned = 0
      let real = 0
      headers.forEach((h) => {
        let inOverlay = false
        let p: HTMLElement | null = h as HTMLElement
        while (p) { if (p.getAttribute('aria-hidden') === 'true') { inOverlay = true; break } p = p.parentElement }
        if (inOverlay) pinned += 1; else real += 1
      })
      return pinned > 0 && real > 0
    }, undefined, { timeout: PLAYWRIGHT_TIMEOUTS.expectLong })

    // Classify each header as a pinned sticky clone (inside the aria-hidden overlay) or a real in-flow
    // header, and capture the container's content-edge geometry. Inlined so the DOM reads stay in the
    // browser context (and clear of the React purity lint rule applied to module-level functions).
    const m = await page.evaluate(() => {
      const container = document.querySelector('[data-gear-inspector-grid-container="true"]') as HTMLElement | null
      if (!container) return null
      const headers = Array.from(document.querySelectorAll('[data-gear-inspector-grid-header="true"]')) as HTMLElement[]
      const all = headers.map((h) => {
        let inOverlay = false
        let p: HTMLElement | null = h
        while (p) { if (p.getAttribute('aria-hidden') === 'true') { inOverlay = true; break } p = p.parentElement }
        const r = h.getBoundingClientRect()
        return { left: Math.round(r.left), right: Math.round(r.right), width: Math.round(r.width), inOverlay }
      })
      const rect = container.getBoundingClientRect()
      return {
        containerRight: Math.round(rect.right),
        contentRight: Math.round(rect.left + container.clientWidth),
        gutter: container.offsetWidth - container.clientWidth,
        overlay: all.filter((h) => h.inOverlay),
        real: all.filter((h) => !h.inOverlay),
      }
    })
    expect(m).not.toBeNull()
    if (!m) return

    // Sanity: the overlay activated and at least one real header is still laid out for comparison.
    expect(m.overlay.length).toBeGreaterThan(0)
    expect(m.real.length).toBeGreaterThan(0)

    const realRight = m.real[0]!.right
    const realLeft = m.real[0]!.left
    for (const clone of m.overlay) {
      // Pinned clones must occupy the exact same horizontal band as the real headers.
      expect(Math.abs(clone.right - realRight)).toBeLessThanOrEqual(1)
      expect(Math.abs(clone.left - realLeft)).toBeLessThanOrEqual(1)
      // Regression guard: a pinned clone must stop at the content edge, never reaching into the
      // reserved scrollbar gutter (the original bug rendered clones across the full border box).
      expect(clone.right).toBeLessThanOrEqual(m.contentRight + 1)
      if (m.gutter > 0) {
        expect(m.containerRight - clone.right).toBeGreaterThanOrEqual(m.gutter)
      }
    }
  })
})
