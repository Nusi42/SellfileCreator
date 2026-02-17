import { expect, test, type Locator, type Page } from '@playwright/test'
import { computeCrc32 } from '../../src/lib/autosave'
import { AUTOSAVE_KEY } from '../../src/lib/constants'
import { APP_GOTO_OPTIONS, APP_VERSION, prepareApp } from './app-init'
import { RESTORE_DIALOG_TITLE } from './dialog-helpers'
import { PLAYWRIGHT_TIMEOUTS } from './timeouts'
import { warmupAppShell } from './app-warmup'

const RULE_CHIP_SELECTOR = '[data-testid="builder-rule-count-chip"] .MuiChip-label'

// Minimal autosave payload to seed two recipes without HSFC imports.
const AUTOSAVE_RECIPES = [
  {
    name: 'Perf Recipe A',
    keep: true,
    SellfileVisibility: 'Active',
    Rank: 'Any',
    Rarity: 'Any',
    Faction: 'Any',
    mainStats: [],
    minLevel: 0,
    maxLevel: 16,
    substats: [{ stat: 'SPD', rollBounds: { any: true } }],
    minCount: 0,
    autoMinCount: true,
    minRequiredRolls: 0,
    autoMinRequiredRolls: true,
    artifactTypeNames: ['Weapon'],
    artifactSetNames: [],
    artifactMetaSetIds: [],
  },
  {
    name: 'Perf Recipe B',
    keep: true,
    SellfileVisibility: 'Active',
    Rank: 'Any',
    Rarity: 'Any',
    Faction: 'Any',
    mainStats: [],
    minLevel: 0,
    maxLevel: 16,
    substats: [{ stat: 'SPD', rollBounds: { any: true } }],
    minCount: 0,
    autoMinCount: true,
    minRequiredRolls: 0,
    autoMinRequiredRolls: true,
    artifactTypeNames: ['Weapon'],
    artifactSetNames: [],
    artifactMetaSetIds: [],
  },
] as const

// Keep the recipe names aligned with the autosave payload for metric labels.
const AUTOSAVE_RECIPE_NAMES = AUTOSAVE_RECIPES.map((recipe) => recipe.name ?? '')

const RECIPE_AUTOSAVE_ENTRY = (() => {
  const payload = {
    Version: APP_VERSION,
    AutosaveSavedAt: '2025-01-01T00:00:00.000Z',
    Metasets: [],
    Recipes: AUTOSAVE_RECIPES,
    FinalSellRemainder: {
      artifacts: true,
      accessories: true,
      levels: [0, 4, 8, 12, 16],
      setsMode: 'any',
    },
    // Keep the legacy HSFC/autosave key for compatibility with persisted payloads.
    SelectedConfigIndex: 0,
    Note: 'Perf autosave payload',
  }
  const serialized = JSON.stringify(payload)
  const crc = computeCrc32(serialized)
  return JSON.stringify([crc, payload])
})()

type Measurement = {
  fromIdx: number
  toIdx: number
  fromName: string
  toName: string
  ruleChipSettledMs: number
  longTasks: { duration: number; scriptUrl: string | null; name: string }[]
}

test.describe('builder recipe switching performance', () => {
  test.beforeAll(async ({ browser }) => {
    // Allow the long timeout so the cold Vite compile can finish during warmup.
    test.setTimeout(PLAYWRIGHT_TIMEOUTS.testLong)
    // Preload the shell so the perf test skips the first-compile cost.
    await warmupAppShell(browser)
  })

  // Measure switch latency across all engines to detect browser-specific slowdowns.
  test('measures recipe switch latency for fixture datasets', async ({ page }, testInfo) => {
    // Allow the long timeout for rebuilds triggered by recipe switches.
    test.setTimeout(PLAYWRIGHT_TIMEOUTS.testLong)
    await prepareApp(page)
    await seedRecipeAutosave(page)
    await page.addInitScript(() => {
      // Force English labels so role selectors remain stable across locales.
      try {
        window.localStorage.setItem('sellfileCreator.lang.v1', 'en-US')
      } catch {
        /* ignore storage failures */
      }
      // Track long tasks for perf annotations.
      const globalScope = window as unknown as { __builderLongTasks?: Array<{ name: string; startTime: number; duration: number; scriptUrl: string | null }> }
      // Initialize the shared collection for long-task entries.
      globalScope.__builderLongTasks = []
      if (typeof PerformanceObserver === 'function') {
        try {
          const observer = new PerformanceObserver((list) => {
            const target = globalScope.__builderLongTasks!
            for (const entry of list.getEntries()) {
              const attribution = (entry as PerformanceEntry & { attribution?: PerformanceEntry[] }).attribution
              const scriptUrl = attribution && attribution.length > 0
                ? ((attribution[0] as unknown as { scriptUrl?: string | null }).scriptUrl ?? null)
                : null
              target.push({
                name: entry.name,
                startTime: entry.startTime,
                duration: entry.duration,
                scriptUrl,
              })
            }
          })
          observer.observe({ entryTypes: ['longtask'] })
        } catch {
          /* ignore observer failures */
        }
      }
    })

    const recipeNames = AUTOSAVE_RECIPE_NAMES

    // Load the shell without waiting for the full load event.
    await page.goto('/', APP_GOTO_OPTIONS)
    await acceptRecipeRestoreDialog(page)
    // Skip additional HSF/DB imports so the perf check stays within the fast-fail budget.

    const chips = page.locator('[data-recipe-chip="true"]')
    await expect(chips.first()).toBeVisible({ timeout: PLAYWRIGHT_TIMEOUTS.appGoto })

    // Limit to a single switch so perf capture stays under the 15s cap.
    const measurementPairs = deriveMeasurementPairs(recipeNames, 2).slice(0, 1)
    if (measurementPairs.length < 1) {
      test.skip(true, 'Not enough named recipes to measure switching latency.')
    }

    let longTaskCursor = 0
    const measurements: Measurement[] = []
    for (const pair of measurementPairs) {
      const result = await measureRecipeSwitch(page, chips, pair.toIdx)
      const taskDelta = await collectLongTasks(page, longTaskCursor, result.startTime, result.endTime)
      longTaskCursor = taskDelta.nextCursor
      measurements.push({
        fromIdx: pair.fromIdx,
        toIdx: pair.toIdx,
        fromName: pair.fromName,
        toName: pair.toName,
        ruleChipSettledMs: result.ruleChipSettledMs,
        longTasks: taskDelta.entries,
      })
    }

    for (const entry of measurements) {
      const label = `${formatRecipeLabel(entry.fromIdx, entry.fromName)} → ${formatRecipeLabel(entry.toIdx, entry.toName)}`
      const summary = `${label} | rule chip settled=${entry.ruleChipSettledMs.toFixed(1)} ms`
      testInfo.annotations.push({ type: 'perf', description: summary })
      console.log(`[builder-recipe-switch] ${summary}`)
      if (entry.longTasks.length > 0) {
        for (const task of entry.longTasks) {
          const location = task.scriptUrl ? task.scriptUrl : task.name
          console.log(`  ↳ long task ${task.duration.toFixed(1)} ms @ ${location}`)
        }
      }
    }
  })
})

async function seedRecipeAutosave(page: Page): Promise<void> {
  // Seed the HSFC autosave entry so recipe chips are available without imports.
  await page.addInitScript(
    ({ autosaveKey, autosaveValue }) => {
      try {
        window.localStorage.setItem(autosaveKey, autosaveValue)
      } catch {
        /* ignore storage failures so the test can continue */
      }
    },
    {
      autosaveKey: AUTOSAVE_KEY,
      autosaveValue: RECIPE_AUTOSAVE_ENTRY,
    },
  )
}

async function acceptRecipeRestoreDialog(page: Page): Promise<void> {
  // Locate the restore dialog that appears when autosave data exists.
  const dialog = page.getByRole('dialog', { name: RESTORE_DIALOG_TITLE })
  // Allow the app boot budget so the dialog can render.
  await dialog.waitFor({ state: 'visible', timeout: PLAYWRIGHT_TIMEOUTS.appGoto }).catch(() => undefined)
  // Skip when no restore prompt is displayed.
  const isVisible = await dialog.isVisible().catch(() => false)
  if (!isVisible) return
  // Ensure recipes are selected so the restore loads chips.
  const recipesCheckbox = dialog.getByRole('checkbox', { name: /Recipes/i })
  if (await recipesCheckbox.isVisible().catch(() => false)) {
    if (!(await recipesCheckbox.isChecked().catch(() => false))) {
      await recipesCheckbox.click()
    }
  }
  const restoreButton = dialog.getByRole('button', { name: /Restore Selected/i })
  await expect(restoreButton).toBeEnabled({ timeout: PLAYWRIGHT_TIMEOUTS.expectDefault })
  await restoreButton.click()
  // Wait for the dialog to dismiss before continuing.
  await expect(dialog).toBeHidden({ timeout: PLAYWRIGHT_TIMEOUTS.expectDefault })
}

function deriveMeasurementPairs(recipeNames: string[], desired: number): Array<{ fromIdx: number; toIdx: number; fromName: string; toName: string }> {
  const named = recipeNames
    .map((name, idx) => ({ name: (name ?? '').trim(), idx }))
    .filter((entry) => entry.name.length > 0)
  const usable = named.slice(0, desired)
  const pairs: Array<{ fromIdx: number; toIdx: number; fromName: string; toName: string }> = []
  for (let i = 0; i < usable.length - 1; i += 1) {
    const current = usable[i]!
    const next = usable[i + 1]!
    pairs.push({ fromIdx: current.idx, toIdx: next.idx, fromName: current.name, toName: next.name })
  }
  if (usable.length >= 2) {
    const last = usable[usable.length - 1]!
    const first = usable[0]!
    pairs.push({ fromIdx: last.idx, toIdx: first.idx, fromName: last.name, toName: first.name })
  }
  return pairs
}

async function measureRecipeSwitch(page: Page, chips: Locator, toIdx: number): Promise<{ ruleChipSettledMs: number; startTime: number; endTime: number }> {
  const target = chips.nth(toIdx)
  await expect(target).toBeVisible({ timeout: PLAYWRIGHT_TIMEOUTS.expectDefault })
  const start = await page.evaluate(() => performance.now())
  await target.click()
  await waitForRuleChipStable(page)
  const ruleChipReady = await page.evaluate(() => performance.now())
  return {
    ruleChipSettledMs: ruleChipReady - start,
    startTime: start,
    endTime: ruleChipReady,
  }
}

async function collectLongTasks(page: Page, cursor: number, windowStart: number, windowEnd: number): Promise<{ entries: { duration: number; scriptUrl: string | null; name: string }[]; nextCursor: number }> {
  const result = await page.evaluate(({ cursorIndex }) => {
    const scope = window as unknown as { __builderLongTasks?: Array<{ name: string; startTime: number; duration: number; scriptUrl: string | null }> }
    const entries = scope.__builderLongTasks ?? []
    return { slice: entries.slice(cursorIndex), total: entries.length }
  }, { cursorIndex: cursor })
  const entries = result.slice
    .filter((entry) => entry.startTime >= windowStart && entry.startTime <= windowEnd + 5)
    .map((entry) => ({
      duration: entry.duration,
      scriptUrl: entry.scriptUrl,
      name: entry.name,
    }))
  return { entries, nextCursor: result.total }
}

async function waitForRuleChipStable(page: Page): Promise<void> {
  await page.waitForFunction(
    ({ selector }) => {
      const chip = document.querySelector(selector)
      if (!chip) return false
      const text = chip.textContent ?? ''
      if (!text.trim()) return false
      return !text.includes('Counting')
    },
    { selector: RULE_CHIP_SELECTOR },
    { timeout: PLAYWRIGHT_TIMEOUTS.expectLong },
  )
}

function formatRecipeLabel(index: number, name: string): string {
  const trimmed = name.trim()
  return trimmed ? `#${index + 1} – "${trimmed}"` : `#${index + 1}`
}
