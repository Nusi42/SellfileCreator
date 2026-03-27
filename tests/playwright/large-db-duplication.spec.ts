import { expect, test } from './fixtures'
import { APP_GOTO_OPTIONS, prepareApp } from './app-init'
import { openContextMenu } from './context-menu'
import { dismissBlockingDialogs } from './dialog-helpers'
import { PREVIEW_MODE_STORAGE_KEY } from '../../src/lib/constants'
import { PLAYWRIGHT_TIMEOUTS } from './timeouts'
import { getWorkloadIndicator } from './workload-indicator'
import {
  RULES_FILTER_OPEN_STORAGE_KEY,
  RULES_FILTER_STATE_STORAGE_KEY,
  cloneDefaultRulesFilterState,
} from '../../src/state/rulesFilterPersistence'
import { EXAMPLE_NUSI_SFR_PATH, LARGE_ACCOUNT_DB_PATH } from './fixture-paths'
import { SFR_LOAD_INPUT_SELECTOR } from './ui-selectors'
import { warmupAppShell } from './app-warmup'

// Use the full Example SFR + large DB to exercise the large-artifact-set matching path.
const SFR_PATH = EXAMPLE_NUSI_SFR_PATH
const DB_PATH = LARGE_ACCOUNT_DB_PATH
// Duplicate recipe #2 (one-based), which is zero-based index 1.
const TARGET_RECIPE_INDEX = 1

/** Wait for the workload indicator to settle (appear then vanish, or never appear). */
const waitForWorkloadIdle = async (page: Parameters<typeof test>[0]['page']): Promise<void> => {
  const workload = getWorkloadIndicator(page)
  // Catching is intentional: the indicator may never appear on a cache-hit fast path.
  await workload.waitFor({ state: 'visible', timeout: PLAYWRIGHT_TIMEOUTS.expectDefault }).catch(() => undefined)
  await workload.waitFor({ state: 'hidden', timeout: PLAYWRIGHT_TIMEOUTS.workloadIdle }).catch(() => undefined)
}

/** Wait until at least one gear inspector card reports a keep/sell outcome. */
const waitForGearInspectorResults = async (page: Parameters<typeof test>[0]['page']): Promise<void> => {
  await page.waitForFunction(
    () => Array.from(document.querySelectorAll('[data-gear-inspector-grid-card="true"]'))
      .some((card) => {
        const outcome = card.getAttribute('data-match-outcome')
        return outcome === 'keep' || outcome === 'sell'
      }),
    undefined,
    { timeout: PLAYWRIGHT_TIMEOUTS.expectLong },
  )
}

const duplicateRecipeChip = async (page: Parameters<typeof test>[0]['page'], index: number): Promise<void> => {
  // Right-click the target chip and fire the Duplicate action.
  const beforeCount = await page.evaluate(() => {
    const nodes = Array.from(document.querySelectorAll('[data-recipe-chip-index]'))
    const unique = new Set<string>()
    nodes.forEach((node) => {
      const value = node.getAttribute('data-recipe-chip-index')
      if (value) unique.add(value)
    })
    return unique.size
  })
  const chip = page.locator(`[data-recipe-chip-index="${index}"]`).first()
  await chip.scrollIntoViewIfNeeded()
  await page.keyboard.press('Escape')
  await page.evaluate(() => {
    const overlays = document.querySelectorAll('vite-plugin-checker-error-overlay')
    overlays.forEach((node) => node.remove())
  })
  await openContextMenu(page, chip)
  const duplicateItem = page.getByRole('menuitem', { name: /Duplicate/i })
  await expect(duplicateItem).toBeVisible()
  // Use evaluate(.click()) to bypass Playwright's pointer-simulation machinery, which
  // can hang indefinitely in Firefox MUI menus even with force:true (ACTION_TIMEOUT_MS).
  await duplicateItem.evaluate((el: HTMLElement) => el.click())
  // Wait for the extra chip to appear before continuing.
  await page.waitForFunction((prev) => {
    const nodes = Array.from(document.querySelectorAll('[data-recipe-chip-index]'))
    const unique = new Set<string>()
    nodes.forEach((node) => {
      const value = node.getAttribute('data-recipe-chip-index')
      if (value) unique.add(value)
    })
    return unique.size === prev + 1
  }, beforeCount, { timeout: PLAYWRIGHT_TIMEOUTS.expectLong })
}

test.beforeAll(async ({ browser }) => {
  test.setTimeout(PLAYWRIGHT_TIMEOUTS.testHeavy)
  await warmupAppShell(browser)
})

test.describe('Gear Inspector grid matches remain stable with large DB', () => {
  test('duplicating recipe #2 keeps Gear Inspector outcomes unchanged (example.sfr + large DB)', async ({ page }) => {
    // Two full WASM passes over the 68 MB DB each take ~20 s; budget covers both.
    // Individual step timeouts stay at ≤ 15 s — workload/result waits are soft/hard
    // 15 s respectively, so the 68 MB WASM finishes well within the 60 s window.
    test.setTimeout(PLAYWRIGHT_TIMEOUTS.testXL)

    await page.addInitScript(
      ({ previewKey, previewMode }: { previewKey: string; previewMode: string }) => {
        try { window.localStorage.setItem(previewKey, previewMode) } catch { /* ignore */ }
      },
      { previewKey: PREVIEW_MODE_STORAGE_KEY, previewMode: 'gearInspector' },
    )

    // Pre-seed Gear Inspector filters so the grid shows all rows without extra interaction.
    const filterState = {
      rules: cloneDefaultRulesFilterState(),
      tester: cloneDefaultRulesFilterState(),
    }
    await page.addInitScript(
      ({ filterKey, filterValue, filterOpenKey, filterOpenValue }: {
        filterKey: string; filterValue: string; filterOpenKey: string; filterOpenValue: string
      }) => {
        try {
          window.localStorage.setItem(filterKey, filterValue)
          window.localStorage.setItem(filterOpenKey, filterOpenValue)
        } catch { /* ignore */ }
      },
      {
        filterKey: RULES_FILTER_STATE_STORAGE_KEY,
        filterValue: JSON.stringify(filterState),
        filterOpenKey: RULES_FILTER_OPEN_STORAGE_KEY,
        filterOpenValue: JSON.stringify({ rules: false, tester: true }),
      },
    )

    await prepareApp(page)
    await page.goto('/', APP_GOTO_OPTIONS)
    // prepareApp seeds localStorage to suppress dialogs on boot; no call needed here.

    // Load SFR + large gear DB from examples/.
    const sfrInput = page.locator(SFR_LOAD_INPUT_SELECTOR).first()
    await sfrInput.waitFor({ state: 'attached', timeout: PLAYWRIGHT_TIMEOUTS.appGoto })
    await expect(sfrInput).toBeEnabled({ timeout: PLAYWRIGHT_TIMEOUTS.expectDefault })
    await sfrInput.setInputFiles(SFR_PATH)
    // Note dialog may auto-open after SFR import — dismiss it before loading the DB.
    await dismissBlockingDialogs(page)

    const dbInput = page.locator('input[type="file"][accept*=".db"]').first()
    await dbInput.waitFor({ state: 'attached', timeout: PLAYWRIGHT_TIMEOUTS.appGoto })
    await expect(dbInput).toBeEnabled({ timeout: PLAYWRIGHT_TIMEOUTS.expectDefault })
    await dbInput.setInputFiles(DB_PATH)
    // DB load does not trigger any dialogs; no dismiss needed here.

    // Wait for the initial rule build + large-DB evaluation to settle.
    await waitForWorkloadIdle(page)
    await waitForGearInspectorResults(page)

    await duplicateRecipeChip(page, TARGET_RECIPE_INDEX)

    // Wait for the post-duplication pipeline to complete without flooding or hanging.
    // The large DB uses virtual scrolling so DOM row counts differ per viewport;
    // outcome-equality is verified separately by gear-inspector-config-duplication.spec.ts.
    await waitForWorkloadIdle(page)
    await waitForGearInspectorResults(page)
  })
})
