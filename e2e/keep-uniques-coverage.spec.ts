import path from 'node:path'
import { test, expect } from './fixtures'
import { prepareApp } from './app-init'
import { ArtifactSet, ArtifactType } from '../src/lib/types'
import { PREVIEW_MODE_STORAGE_KEY } from '../src/lib/constants'
import {
  RULES_FILTER_OPEN_STORAGE_KEY,
  RULES_FILTER_STATE_STORAGE_KEY,
  cloneDefaultRulesFilterState,
} from '../src/state/rulesFilterPersistence'

// Regression fixtures mirror the user report so UI + pipeline stay aligned.
const HSFC_PATH = path.resolve(process.cwd(), 'examples', 'ForKeeptest.hsfc')
const DB_PATH = path.resolve(process.cwd(), 'examples', '251129_181328.db')

const seedTesterFilters = async (page: Parameters<typeof test>[0]['page']) => {
  // Start from the default filters so only the set/slot knobs diverge.
  const rulesFilters = cloneDefaultRulesFilterState()
  const testerFilters = cloneDefaultRulesFilterState()
  // Narrow the tester grid to Stun Boots so the Keep Unique chips are easy to audit.
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
  // Wait until the filtered card set renders to avoid sampling an empty grid.
  await page.waitForFunction(
    () => document.querySelectorAll('[data-tester-grid-card="true"]').length > 0,
    { timeout: 120_000 },
  )
}

test.describe('Keep Unique coverage aligns between HSF and tester', () => {
  test('ATK% Stun boots flagged by Keep Uniques in tester grid', async ({ page }) => {
    test.setTimeout(240_000)
    await prepareApp(page)
    await seedTesterFilters(page)
    await page.goto('/')

    const hsfcInput = page.locator('input[type="file"][accept*=".hsfc"]').first()
    await hsfcInput.setInputFiles(HSFC_PATH)
    const dbInput = page.locator('input[type="file"][accept*=".db"]').first()
    await dbInput.setInputFiles(DB_PATH)

    const gridContainer = page.locator('[data-tester-grid-container="true"]').first()
    await gridContainer.waitFor({ timeout: 120_000 })
    await waitForTesterGrid(page)

    // Sample rendered cards to see which ATK% boots surface Keep Unique chips.
    const stunBoots = await page.evaluate(() => (
      Array.from(document.querySelectorAll('[data-tester-grid-card="true"]')).map((card) => {
        const text = (card.textContent ?? '').toLowerCase()
        const chips = Array.from(card.querySelectorAll('.MuiChip-label')).map((node) => node.textContent ?? '')
        const keepUniqueChip = card.querySelector('[data-match-source="keep-unique"]')
        return {
          id: Number(card.getAttribute('data-row-id')),
          text,
          chipLabels: chips,
          hasKeepUnique: Boolean(keepUniqueChip) || chips.some((label) => /keep uniques/i.test(label)),
          hasAtkMain: /atk%/.test(text),
        }
      }).filter((entry) => entry.hasAtkMain)
    ))

    expect(stunBoots.length).toBeGreaterThanOrEqual(2)
  })
})
