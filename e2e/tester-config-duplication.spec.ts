import path from 'node:path'
import { expect, test } from './fixtures'
import { prepareApp } from './app-init'
import { ArtifactSet, ArtifactType } from '../src/lib/types'
import { PREVIEW_MODE_STORAGE_KEY } from '../src/lib/constants'
import {
  RULES_FILTER_OPEN_STORAGE_KEY,
  RULES_FILTER_STATE_STORAGE_KEY,
  cloneDefaultRulesFilterState,
} from '../src/state/rulesFilterPersistence'

const HSFC_PATH = path.resolve(process.cwd(), 'examples', 'example.hsfc')
const DB_PATH = path.resolve(process.cwd(), 'examples', '251129_181328.db')
const TARGET_CONFIG_INDEX = 2 // zero-based: config #3

type GridSnapshot = Array<{ id: number; outcome: string }>

const seedTesterFilters = async (page: Parameters<typeof test>[0]['page']) => {
  // Preload tester mode plus a narrow Stun/Boots filter so the grid locks onto the reported scenario.
  const rulesFilters = cloneDefaultRulesFilterState()
  const testerFilters = cloneDefaultRulesFilterState()
  testerFilters.sets.selected = [ArtifactSet.Stun]
  testerFilters.slots.selected = [ArtifactType.Boots]
  const filterState = { rules: rulesFilters, tester: testerFilters }
  const filterOpen = { rules: false, tester: true }
  await page.addInitScript(
    ({ previewKey, previewMode, filterKey, filterValue, filterOpenKey, filterOpenValue }) => {
      try {
        window.localStorage.setItem(previewKey, previewMode)
        window.localStorage.setItem(filterKey, filterValue)
        window.localStorage.setItem(filterOpenKey, filterOpenValue)
      } catch {
        /* ignore storage failures so the test can still proceed */
      }
    },
    {
      previewKey: PREVIEW_MODE_STORAGE_KEY,
      previewMode: 'tester',
      filterKey: RULES_FILTER_STATE_STORAGE_KEY,
      filterValue: JSON.stringify(filterState),
      filterOpenKey: RULES_FILTER_OPEN_STORAGE_KEY,
      filterOpenValue: JSON.stringify(filterOpen),
    },
  )
}

const waitForTesterGrid = async (page: Parameters<typeof test>[0]['page']) => {
  // Cards expose stable data-match-* attrs; wait until the filtered set is populated and annotated.
  await page.waitForFunction(
    () => document.querySelectorAll('[data-tester-grid-card="true"]').length > 0,
    { timeout: 120_000 },
  )
}

const readGridSnapshot = async (page: Parameters<typeof test>[0]['page']): Promise<GridSnapshot> => {
  // Snapshot the rendered grid state so we can diff outcomes across config mutations.
  const rows = await page.evaluate(() => (
    Array.from(document.querySelectorAll('[data-tester-grid-card="true"]')).map((card) => ({
      id: Number(card.getAttribute('data-row-id')),
      outcome: card.getAttribute('data-match-outcome') ?? 'unknown',
    }))
  ))
  rows.sort((a, b) => a.id - b.id)
  return rows
}

const duplicateConfigChip = async (page: Parameters<typeof test>[0]['page'], index: number) => {
  // Right-click the target chip and fire the Duplicate action so config indices shift just like the bug report.
  const beforeCount = await page.evaluate(() => {
    const nodes = Array.from(document.querySelectorAll('[data-config-chip-index]'))
    const unique = new Set<string>()
    nodes.forEach((node) => {
      const value = node.getAttribute('data-config-chip-index')
      if (value) unique.add(value)
    })
    return unique.size
  })
  const chip = page.locator(`[data-config-chip-index="${index}"]`).first()
  await chip.scrollIntoViewIfNeeded()
  await page.keyboard.press('Escape')
  await page.evaluate(() => {
    const overlays = document.querySelectorAll('vite-plugin-checker-error-overlay')
    overlays.forEach((node) => node.remove())
  })
  await chip.click({ button: 'right' })
  await page.getByRole('menuitem', { name: /Duplicate/i }).click()
  await page.waitForFunction((prev) => {
    const nodes = Array.from(document.querySelectorAll('[data-config-chip-index]'))
    const unique = new Set<string>()
    nodes.forEach((node) => {
      const value = node.getAttribute('data-config-chip-index')
      if (value) unique.add(value)
    })
    return unique.size === prev + 1
  }, beforeCount, { timeout: 120_000 })
}

test.describe('tester grid matches remain stable', () => {
  test('duplicating config #3 keeps Stun boots outcomes unchanged', async ({ page }) => {
    test.setTimeout(180_000)
    await prepareApp(page)
    await seedTesterFilters(page)
    await page.goto('/')

    // Load the HSFC + gear DB pair from the regression report.
    const hsfcInput = page.locator('input[type="file"][accept*=".hsfc"]').first()
    await hsfcInput.setInputFiles(HSFC_PATH)
    const dbInput = page.locator('input[type="file"][accept*=".db"]').first()
    await dbInput.setInputFiles(DB_PATH)

    // Wait for the tester grid shell to mount before sampling cards.
    const gridContainer = page.locator('[data-tester-grid-container="true"]').first()
    await gridContainer.waitFor({ timeout: 120_000 })
    await gridContainer.scrollIntoViewIfNeeded()
    await gridContainer.evaluate((node) => { node.scrollTo(0, 0) })

    await waitForTesterGrid(page)
    const initialRows = await readGridSnapshot(page)
    expect(initialRows.length).toBe(17)

    await duplicateConfigChip(page, TARGET_CONFIG_INDEX)
    await waitForTesterGrid(page)
    const postDuplicateRows = await readGridSnapshot(page)
    expect(postDuplicateRows.length).toBe(initialRows.length)

    // Config duplication may shift cfgIdx, but keep/sell calls for each artifact must stay consistent.
    expect(postDuplicateRows).toEqual(initialRows)
  })
})
