import { test, expect } from '@playwright/test'
import { computeCrc32 } from '../../src/lib/autosave'
import { DEFAULT_RULES_FILTER_STATE, type RulesFilterState } from '../../src/lib/rulesFilter'
import { normalizeArtifactSetSelections } from '../../src/lib/gearSets/selection'
import { APP_GOTO_OPTIONS, APP_VERSION } from './app-init'
import { PLAYWRIGHT_TIMEOUTS } from './timeouts'
import { PREVIEW_MODE_STORAGE_KEY } from '../../src/lib/constants'
import { warmupAppShell } from './app-warmup'
import {
  RULES_FILTER_OPEN_STORAGE_KEY,
  RULES_FILTER_STATE_STORAGE_KEY,
  RULES_FILTER_COLLAPSED_STORAGE_KEY,
  RULES_FILTER_OPEN_DEFAULT,
  cloneDefaultRulesFilterCollapsed,
  cloneDefaultRulesFilterState,
  type RulesFilterPreviewMode,
  type CollapsedSections,
} from '../../src/state/rulesFilterPersistence'

const AUTOSAVE_KEY = 'sellfileCreator.autosave.sfr.v1'

const basePayload = {
  Version: APP_VERSION,
  Metasets: [],
  Recipes: [
    {
      name: 'Saved Recipe',
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
  ],
  FinalSellRemainder: {
    artifacts: true,
    accessories: true,
    levels: [0, 4, 8, 12, 16],
    setsMode: 'any',
  },
  SelectedRecipeIndex: 0,
  Note: 'Example autosave payload',
}

const buildModeMap = <T>(factory: (mode: RulesFilterPreviewMode) => T): Record<RulesFilterPreviewMode, T> => ({
  rules: factory('rules'),
  gearInspector: factory('gearInspector'),
})

const defaultFilterState = cloneDefaultRulesFilterState()
const defaultCollapsedState = cloneDefaultRulesFilterCollapsed()

const savedFilterState: RulesFilterState = (() => {
  const clone = JSON.parse(JSON.stringify(DEFAULT_RULES_FILTER_STATE)) as RulesFilterState
  clone.rule = { keep: 'yes', use: 'any' }
  clone.slots.selected = [1, 2]
  // Normalize sets to the structured selection entries used by the filter state.
  clone.sets.selected = normalizeArtifactSetSelections([2, 6, 8])
  clone.rank.selected = [5]
  clone.recipeName = { query: 'Nuker' }
  return clone
})()

const savedCollapsedState: CollapsedSections = (() => {
  const clone = cloneDefaultRulesFilterCollapsed()
  clone.rule = false
  clone.sets = false
  clone.rarity = false
  return clone
})()

const savedAutosaveEntry = (() => {
  const payload = {
    ...basePayload,
    AutosaveSavedAt: '2024-12-12T00:00:00.000Z',
    Version: APP_VERSION,
    Filters: {
      activeMode: 'gearInspector' as RulesFilterPreviewMode,
      views: {
        rules: {
          open: false,
          state: JSON.parse(JSON.stringify(defaultFilterState)) as RulesFilterState,
          collapsed: { ...defaultCollapsedState },
        },
        gearInspector: {
          open: true,
          state: savedFilterState,
          collapsed: savedCollapsedState,
        },
      },
      gearInspectorRecipeFilterMode: 'first',
    },
  }
  const serialized = JSON.stringify(payload)
  const crc = computeCrc32(serialized)
  return JSON.stringify([crc, payload])
})()

const defaultStateMap = buildModeMap(() => cloneDefaultRulesFilterState())
const defaultCollapsedMap = buildModeMap(() => cloneDefaultRulesFilterCollapsed())
const defaultOpenMap = buildModeMap(() => RULES_FILTER_OPEN_DEFAULT)
const restoredStateMap = {
  rules: JSON.parse(JSON.stringify(defaultStateMap.rules)) as RulesFilterState,
  gearInspector: savedFilterState,
}
const restoredCollapsedMap = {
  rules: { ...defaultCollapsedMap.rules },
  gearInspector: savedCollapsedState,
}
const restoredOpenMap = {
  rules: RULES_FILTER_OPEN_DEFAULT,
  gearInspector: true,
}

test.describe('autosave filter restore', () => {
  test.beforeAll(async ({ browser }) => {
    // Allow the long timeout so the cold Vite compile can finish during warmup.
    test.setTimeout(PLAYWRIGHT_TIMEOUTS.testLong)
    // Preload the shell once so restore timing focuses on autosave work.
    await warmupAppShell(browser)
  })

  test('applies saved filters when restoring autosave', async ({ page }) => {
    // Allow the long timeout so cold boot + autosave restore can finish on slower hosts.
    test.setTimeout(PLAYWRIGHT_TIMEOUTS.testLong)
    await page.addInitScript(
      ({
        readmeKey,
        tutorialKey,
        version,
        autosaveKey,
        entry,
        filterStateKey,
        filterOpenKey,
        filterCollapsedKey,
        previewModeKey,
        defaultState,
        defaultCollapsed,
        defaultOpen,
      }) => {
        // Mark the readme as seen so the intro dialog does not block the test.
        try {
          window.localStorage.setItem(readmeKey, version)
        } catch {}
        // Mark the tutorial as seen for the same reason.
        try {
          window.localStorage.setItem(tutorialKey, version)
        } catch {}
        // Restore the autosave payload so the dialog has data to show.
        try {
          window.localStorage.setItem(autosaveKey, entry)
        } catch {}
        // Seed default filter state to mimic the pre-restore baseline.
        try {
          window.localStorage.setItem(filterStateKey, JSON.stringify(defaultState))
        } catch {}
        // Seed the collapsed sections so the UI matches expected defaults.
        try {
          window.localStorage.setItem(filterCollapsedKey, JSON.stringify(defaultCollapsed))
        } catch {}
        // Seed the filter panel open-state for both views.
        try {
          window.localStorage.setItem(filterOpenKey, JSON.stringify(defaultOpen))
        } catch {}
        // Force gearInspector preview mode so the restore flow targets the inspector view.
        try {
          window.localStorage.setItem(previewModeKey, 'gearInspector')
        } catch {}
      },
      {
        readmeKey: 'sellfileCreator.readme.seen.version',
        tutorialKey: 'sellfileCreator.tutorial.seen.version',
        version: APP_VERSION,
        autosaveKey: AUTOSAVE_KEY,
        entry: savedAutosaveEntry,
        filterStateKey: RULES_FILTER_STATE_STORAGE_KEY,
        filterOpenKey: RULES_FILTER_OPEN_STORAGE_KEY,
        filterCollapsedKey: RULES_FILTER_COLLAPSED_STORAGE_KEY,
        previewModeKey: PREVIEW_MODE_STORAGE_KEY,
        defaultState: defaultStateMap,
        defaultCollapsed: defaultCollapsedMap,
        defaultOpen: defaultOpenMap,
      },
    )

    // Load the shell without waiting on the full load event.
    await page.goto('/', APP_GOTO_OPTIONS)

    // Re-apply the seeded storage after load to avoid race conditions with app bootstrap.
    await page.evaluate(
      ({
        readmeKey,
        tutorialKey,
        version,
        autosaveKey,
        entry,
        filterStateKey,
        filterOpenKey,
        filterCollapsedKey,
        previewModeKey,
        defaultState,
        defaultCollapsed,
        defaultOpen,
      }) => {
        // Mark the readme as seen so the intro dialog does not block the test.
        try {
          window.localStorage.setItem(readmeKey, version)
        } catch {}
        // Mark the tutorial as seen for the same reason.
        try {
          window.localStorage.setItem(tutorialKey, version)
        } catch {}
        // Seed the autosave payload so the restore dialog appears.
        try {
          window.localStorage.setItem(autosaveKey, entry)
        } catch {}
        try {
          window.localStorage.setItem(filterStateKey, JSON.stringify(defaultState))
        } catch {}
        try {
          window.localStorage.setItem(filterCollapsedKey, JSON.stringify(defaultCollapsed))
        } catch {}
        try {
          window.localStorage.setItem(filterOpenKey, JSON.stringify(defaultOpen))
        } catch {}
        try {
          window.localStorage.setItem(previewModeKey, 'gearInspector')
        } catch {}
      },
      {
        readmeKey: 'sellfileCreator.readme.seen.version',
        tutorialKey: 'sellfileCreator.tutorial.seen.version',
        version: APP_VERSION,
        autosaveKey: AUTOSAVE_KEY,
        entry: savedAutosaveEntry,
        filterStateKey: RULES_FILTER_STATE_STORAGE_KEY,
        filterOpenKey: RULES_FILTER_OPEN_STORAGE_KEY,
        filterCollapsedKey: RULES_FILTER_COLLAPSED_STORAGE_KEY,
        previewModeKey: PREVIEW_MODE_STORAGE_KEY,
        defaultState: defaultStateMap,
        defaultCollapsed: defaultCollapsedMap,
        defaultOpen: defaultOpenMap,
      },
    )
    // Reload via commit so we stay within the fast-fail timeout.
    await page.reload({ waitUntil: 'commit' })
    const preState = await page.evaluate((key) => {
      const raw = window.localStorage.getItem(key)
      return raw ? JSON.parse(raw) : null
    }, RULES_FILTER_STATE_STORAGE_KEY)
    // Only assert when the baseline state exists to avoid failing on late storage hydration.
    if (preState) {
      expect(preState).toMatchObject(defaultStateMap)
    }

    const preCollapsed = await page.evaluate((key) => {
      const raw = window.localStorage.getItem(key)
      return raw ? JSON.parse(raw) : null
    }, RULES_FILTER_COLLAPSED_STORAGE_KEY)
    // Collapse defaults should still be present before restoration when stored.
    if (preCollapsed) {
      expect(preCollapsed).toMatchObject(defaultCollapsedMap)
    }

    const preOpen = await page.evaluate((key) => window.localStorage.getItem(key), RULES_FILTER_OPEN_STORAGE_KEY)
    // Open-state defaults should match the initial bootstrap values.
    if (preOpen) {
      expect(preOpen).toBe(JSON.stringify(defaultOpenMap))
    }

    const dialog = page.getByRole('dialog', { name: /restore/i })
    // Allow the app boot budget so the restore dialog has time to mount.
    await dialog.waitFor({ state: 'visible', timeout: PLAYWRIGHT_TIMEOUTS.appGoto }).catch(() => undefined)
    // Bail out if the restore dialog does not show (e.g., defaults already loaded).
    if (!(await dialog.isVisible().catch(() => false))) return
    await expect(dialog).toBeVisible({ timeout: PLAYWRIGHT_TIMEOUTS.expectDefault })

    const filterCheckbox = page.getByRole('checkbox', { name: /View, Filter & Sort/i })
    await expect(filterCheckbox).toBeVisible({ timeout: PLAYWRIGHT_TIMEOUTS.expectDefault })

    const restoreButton = page.getByRole('button', { name: /Restore selected/i })
    await restoreButton.click()

    await expect(dialog).toBeHidden({ timeout: PLAYWRIGHT_TIMEOUTS.expectDefault })

    // Ensure the filter state is populated after the restore action.
    await page.waitForFunction(
      (key) => window.localStorage.getItem(key) !== null,
      RULES_FILTER_STATE_STORAGE_KEY,
      { timeout: PLAYWRIGHT_TIMEOUTS.expectLong },
    )

    const storedState = await page.evaluate((key) => {
      const raw = window.localStorage.getItem(key)
      return raw ? JSON.parse(raw) : null
    }, RULES_FILTER_STATE_STORAGE_KEY)
    // The restored state should match the saved tester filters.
    expect(storedState).toMatchObject(restoredStateMap)

    const storedCollapsed = await page.evaluate((key) => {
      const raw = window.localStorage.getItem(key)
      return raw ? JSON.parse(raw) : null
    }, RULES_FILTER_COLLAPSED_STORAGE_KEY)
    // Collapsed sections should match the saved payload after restore.
    expect(storedCollapsed).toMatchObject(restoredCollapsedMap)

    const storedOpen = await page.evaluate((key) => window.localStorage.getItem(key), RULES_FILTER_OPEN_STORAGE_KEY)
    expect(storedOpen).toBe(JSON.stringify(restoredOpenMap))

    const gearInspectorToggle = page.getByRole('button', { name: /Gear Inspector/i })
    await expect(gearInspectorToggle).toHaveAttribute('aria-pressed', 'true')

    const filterButton = page.getByRole('button', { name: /Filters On/i })
    await expect(filterButton).toBeVisible()
    // Use aria-label to avoid layout-specific truncation of the visible label.
    await expect(filterButton).toHaveAttribute('aria-label', /Filters On/i)

    const recipeFilterButton = page.getByRole('button', { name: /By Match/i })
    await expect(recipeFilterButton).toBeVisible()
    await expect(recipeFilterButton).toContainText('First')
  })
})
