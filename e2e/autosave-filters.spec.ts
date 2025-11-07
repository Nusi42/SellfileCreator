import { test, expect } from '@playwright/test'
import { computeCrc32 } from '../src/lib/autosave'
import { DEFAULT_RULES_FILTER_STATE, type RulesFilterState } from '../src/lib/rulesFilter'
import { prepareApp, APP_VERSION } from './app-init'
import { PREVIEW_MODE_STORAGE_KEY } from '../src/lib/constants'

const AUTOSAVE_KEY = 'sellfileCreator.autosave.hsfc.v1'
const FILTER_OPEN_KEY = 'sellfileCreator.rulesFilter.open.v1'
const FILTER_STATE_KEY = 'sellfileCreator.rulesFilter.state.v1'
const FILTER_COLLAPSED_KEY = 'sellfileCreator.rulesFilter.collapse.v1'

const DEFAULT_COLLAPSED_SECTIONS: Record<string, boolean> = {
  rule: false,
  sets: false,
  main: false,
  sub: false,
  level: false,
  slots: false,
  rank: false,
  rarity: false,
  faction: false,
}

const basePayload = {
  Version: APP_VERSION,
  Metasets: [],
  Configs: [
    {
      __cfgIdx_ignoredWhenRead: 1,
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

const savedFilterState: RulesFilterState = (() => {
  const clone = JSON.parse(JSON.stringify(DEFAULT_RULES_FILTER_STATE)) as RulesFilterState
  clone.rule = { keep: 'yes', use: 'any' }
  clone.slots.selected = [1, 2]
  clone.sets.selected = [2, 6, 8]
  clone.rank.selected = [5]
  clone.configName = { query: 'Nuker' }
  return clone
})()

const savedCollapsedState: Record<string, boolean> = {
  ...DEFAULT_COLLAPSED_SECTIONS,
  sets: true,
  main: true,
  rarity: true,
}
const defaultFilterState = JSON.parse(JSON.stringify(DEFAULT_RULES_FILTER_STATE)) as RulesFilterState
const defaultCollapsedState = { ...DEFAULT_COLLAPSED_SECTIONS }

const savedAutosaveEntry = (() => {
  const payload = {
    ...basePayload,
    AutosaveSavedAt: '2024-12-12T00:00:00.000Z',
    Version: APP_VERSION,
    Filters: {
      open: true,
      state: savedFilterState,
      collapsed: savedCollapsedState,
      testerConfigFilterMode: 'first',
    },
  }
  const serialized = JSON.stringify(payload)
  const crc = computeCrc32(serialized)
  return JSON.stringify([crc, payload])
})()

test.describe('autosave filter restore', () => {
  test('applies saved filters when restoring autosave', async ({ page }) => {
    await prepareApp(page)
    await page.addInitScript(
      ({ autosaveKey, entry, filterStateKey, filterOpenKey, filterCollapsedKey, previewModeKey, defaultState, defaultCollapsed }) => {
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
          window.localStorage.setItem(filterOpenKey, 'false')
        } catch {}
        try {
          window.localStorage.setItem(previewModeKey, 'tester')
        } catch {}
      },
      {
        autosaveKey: AUTOSAVE_KEY,
        entry: savedAutosaveEntry,
        filterStateKey: FILTER_STATE_KEY,
        filterOpenKey: FILTER_OPEN_KEY,
        filterCollapsedKey: FILTER_COLLAPSED_KEY,
        previewModeKey: PREVIEW_MODE_STORAGE_KEY,
        defaultState: DEFAULT_RULES_FILTER_STATE,
        defaultCollapsed: DEFAULT_COLLAPSED_SECTIONS,
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
      { key: FILTER_STATE_KEY, expected: defaultFilterState },
    )
    const preState = await page.evaluate((key) => {
      const raw = window.localStorage.getItem(key)
      return raw ? JSON.parse(raw) : null
    }, FILTER_STATE_KEY)
    expect(preState).toEqual(defaultFilterState)

    const preCollapsed = await page.evaluate((key) => {
      const raw = window.localStorage.getItem(key)
      return raw ? JSON.parse(raw) : null
    }, FILTER_COLLAPSED_KEY)
    expect(preCollapsed).toEqual(defaultCollapsedState)

    const preOpen = await page.evaluate((key) => window.localStorage.getItem(key), FILTER_OPEN_KEY)
    expect(preOpen).toBe('false')

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
      { key: FILTER_STATE_KEY, expected: savedFilterState },
    )

    const storedState = await page.evaluate((key) => {
      const raw = window.localStorage.getItem(key)
      return raw ? JSON.parse(raw) : null
    }, FILTER_STATE_KEY)
    expect(storedState).toEqual(savedFilterState)

    const storedCollapsed = await page.evaluate((key) => {
      const raw = window.localStorage.getItem(key)
      return raw ? JSON.parse(raw) : null
    }, FILTER_COLLAPSED_KEY)
    expect(storedCollapsed).toEqual(savedCollapsedState)

    const storedOpen = await page.evaluate((key) => window.localStorage.getItem(key), FILTER_OPEN_KEY)
    expect(storedOpen).toBe('true')

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
