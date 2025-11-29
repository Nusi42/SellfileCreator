import { test, expect } from '@playwright/test'
import { computeCrc32 } from '../src/lib/autosave'
import { DEFAULT_RULES_FILTER_STATE, type RulesFilterState } from '../src/lib/rulesFilter'
import { prepareApp, APP_VERSION } from './app-init'
import { PREVIEW_MODE_STORAGE_KEY } from '../src/lib/constants'
import {
  RULES_FILTER_OPEN_STORAGE_KEY,
  RULES_FILTER_STATE_STORAGE_KEY,
  RULES_FILTER_COLLAPSED_STORAGE_KEY,
  RULES_FILTER_OPEN_DEFAULT,
  cloneDefaultRulesFilterCollapsed,
  cloneDefaultRulesFilterState,
  type RulesFilterPreviewMode,
  type CollapsedSections,
} from '../src/state/rulesFilterPersistence'

const AUTOSAVE_KEY = 'sellfileCreator.autosave.hsfc.v1'

const basePayload = {
  Version: APP_VERSION,
  Metasets: [],
  Configs: [
    {
      name: 'Saved Config',
      keep: true,
      SellfileVisibility: 'Active',
      Rank: 'Any',
      Rarity: 'Any',
      Faction: 'Any',
      mainStats: [],
      minLevel: 0,
      maxLevel: 16,
      substats: ['SPD'],
      fixedSubstats: [],
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
  SelectedConfigIndex: 0,
  Note: 'Example autosave payload',
}

const buildModeMap = <T>(factory: (mode: RulesFilterPreviewMode) => T): Record<RulesFilterPreviewMode, T> => ({
  rules: factory('rules'),
  tester: factory('tester'),
})

const defaultFilterState = cloneDefaultRulesFilterState()
const defaultCollapsedState = cloneDefaultRulesFilterCollapsed()

const savedFilterState: RulesFilterState = (() => {
  const clone = JSON.parse(JSON.stringify(DEFAULT_RULES_FILTER_STATE)) as RulesFilterState
  clone.rule = { keep: 'yes', use: 'any' }
  clone.slots.selected = [1, 2]
  clone.sets.selected = [2, 6, 8]
  clone.rank.selected = [5]
  clone.configName = { query: 'Nuker' }
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
      activeMode: 'tester' as RulesFilterPreviewMode,
      views: {
        rules: {
          open: false,
          state: JSON.parse(JSON.stringify(defaultFilterState)) as RulesFilterState,
          collapsed: { ...defaultCollapsedState },
        },
        tester: {
          open: true,
          state: savedFilterState,
          collapsed: savedCollapsedState,
        },
      },
      testerConfigFilterMode: 'first',
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
  tester: savedFilterState,
}
const restoredCollapsedMap = {
  rules: { ...defaultCollapsedMap.rules },
  tester: savedCollapsedState,
}
const restoredOpenMap = {
  rules: RULES_FILTER_OPEN_DEFAULT,
  tester: true,
}

test.describe('autosave filter restore', () => {
  test('applies saved filters when restoring autosave', async ({ page }) => {
    await prepareApp(page)
    await page.addInitScript(
      ({
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
          window.localStorage.setItem(previewModeKey, 'tester')
        } catch {}
      },
      {
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

    await page.goto('/')

    await page.waitForFunction(
      ({ key, expected }) => {
        const raw = window.localStorage.getItem(key)
        if (!raw) return false
        try {
          return JSON.stringify(JSON.parse(raw)) === JSON.stringify(expected)
        } catch {
          return false
        }
      },
      { key: RULES_FILTER_STATE_STORAGE_KEY, expected: defaultStateMap },
    )
    const preState = await page.evaluate((key) => {
      const raw = window.localStorage.getItem(key)
      return raw ? JSON.parse(raw) : null
    }, RULES_FILTER_STATE_STORAGE_KEY)
    expect(preState).toEqual(defaultStateMap)

    const preCollapsed = await page.evaluate((key) => {
      const raw = window.localStorage.getItem(key)
      return raw ? JSON.parse(raw) : null
    }, RULES_FILTER_COLLAPSED_STORAGE_KEY)
    expect(preCollapsed).toEqual(defaultCollapsedMap)

    const preOpen = await page.evaluate((key) => window.localStorage.getItem(key), RULES_FILTER_OPEN_STORAGE_KEY)
    expect(preOpen).toBe(JSON.stringify(defaultOpenMap))

    const dialog = page.getByRole('dialog', { name: /restore/i })
    await expect(dialog).toBeVisible()

    const filterCheckbox = page.getByRole('checkbox', { name: /Filter panel/i })
    await expect(filterCheckbox).toBeVisible()

    const restoreButton = page.getByRole('button', { name: /Restore selected/i })
    await restoreButton.click()

    await expect(dialog).toBeHidden()

    await page.waitForFunction(
      ({ key, expected }) => {
        try {
          const raw = window.localStorage.getItem(key)
          if (!raw) return false
          const parsed = JSON.parse(raw)
          return JSON.stringify(parsed) === JSON.stringify(expected)
        } catch {
          return false
        }
      },
      { key: RULES_FILTER_STATE_STORAGE_KEY, expected: restoredStateMap },
    )

    const storedState = await page.evaluate((key) => {
      const raw = window.localStorage.getItem(key)
      return raw ? JSON.parse(raw) : null
    }, RULES_FILTER_STATE_STORAGE_KEY)
    expect(storedState).toEqual(restoredStateMap)

    const storedCollapsed = await page.evaluate((key) => {
      const raw = window.localStorage.getItem(key)
      return raw ? JSON.parse(raw) : null
    }, RULES_FILTER_COLLAPSED_STORAGE_KEY)
    expect(storedCollapsed).toEqual(restoredCollapsedMap)

    const storedOpen = await page.evaluate((key) => window.localStorage.getItem(key), RULES_FILTER_OPEN_STORAGE_KEY)
    expect(storedOpen).toBe(JSON.stringify(restoredOpenMap))

    const testerToggle = page.getByRole('button', { name: /Rule Tester/i })
    await expect(testerToggle).toHaveAttribute('aria-pressed', 'true')

    const filterButton = page.getByRole('button', { name: /Filters On/i })
    await expect(filterButton).toBeVisible()
    await expect(filterButton).toHaveText(/Filters On/i)

    const configFilterButton = page.getByRole('button', { name: /^Configs$/i })
    await expect(configFilterButton).toBeVisible()
    await expect(configFilterButton).toContainText('First')
    await expect(configFilterButton).toHaveAttribute('aria-pressed', 'true')
  })
})
