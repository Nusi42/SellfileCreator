/* eslint import/no-unused-modules: off */
// Repro for the safeguard rank chip right-click menu: selecting a rule the piece is NOT
// top-ranked in (e.g. "Protect: Best SPD", ruleIdx 4, rank #2286 for artifact 128768) must
// undim the chip — the chip currently stays dimmed even though that rule DOES list the item.
//
// Ground-truth (from the headless gearInspectorProbe against the same fixtures):
//   artifact 128768, lategame.sfc defaults (Lategame difficulty), um109288203_RSLHelper.db
//   → "Protect: Best SPD" is safeguardRules[4] (ordinal 5), candidate rank 2286.
import { test, expect, type Page } from './fixtures'
import { APP_GOTO_OPTIONS, prepareApp } from './app-init'
import { dismissBlockingDialogs } from './dialog-helpers'
import { ensureGearInspectorMode } from './gear-inspector-mode'
import { PLAYWRIGHT_TIMEOUTS } from './timeouts'
import { LARGE_ACCOUNT_DB_PATH, PRESET_LATEGAME_SFC_PATH } from './fixture-paths'
import { SFC_LOAD_INPUT_SELECTOR } from './ui-selectors'
import { GEAR_INSPECTOR_GRID_SAFEGUARD_RANK_MODE_KEY } from '../../src/lib/constants'

const TARGET_ARTIFACT_ID = 128768
// "Protect: Best SPD" resolves to safeguardRules[4] under lategame.sfc (verified via probe).
const BEST_SPD_RULE_IDX = 4
// In groupRank mode the chip/menu show the count-group rank (#46), not the global rank (#2286).
const EXPECTED_GROUP_RANK = '46'

// Scroll the target card into the virtualized grid by sorting so it is near the top, then
// polling the DOM. The grid virtualizes, so we jump straight to the card via the sort control
// is overkill — instead we rely on the safeguard-rank sort to surface ranked items, then search.
const findTargetChip = async (page: Page) => {
  const chip = page.getByTestId(`safeguard-rank-chip-${TARGET_ARTIFACT_ID}`)
  // The card may be below the fold in the virtualized list; scroll the grid until it mounts.
  await expect(async () => {
    if (await chip.count() === 0) {
      await page.mouse.wheel(0, 4000)
      throw new Error('chip not yet mounted')
    }
    await expect(chip).toBeVisible()
  }).toPass({ timeout: PLAYWRIGHT_TIMEOUTS.expectLong })
  return chip
}

test('right-click rank menu jumps to the exact rule index and undims the chip', async ({ page }) => {
  // Loading the ~1.4 MB DB + running the full safeguard pipeline needs the heavy budget.
  test.setTimeout(PLAYWRIGHT_TIMEOUTS.testHeavy)
  // Seed the rank overlay ON (group-rank mode) before the app boots.
  await page.addInitScript(([key]) => {
    window.localStorage.setItem(key as string, 'groupRank')
  }, [GEAR_INSPECTOR_GRID_SAFEGUARD_RANK_MODE_KEY])

  await prepareApp(page)
  await page.goto('/', APP_GOTO_OPTIONS)
  await dismissBlockingDialogs(page)

  // Load the lategame preset (brings safeguards + Lategame default overrides).
  const sfcInput = page.locator(SFC_LOAD_INPUT_SELECTOR).first()
  await sfcInput.waitFor({ state: 'attached', timeout: PLAYWRIGHT_TIMEOUTS.appGoto })
  await sfcInput.setInputFiles(PRESET_LATEGAME_SFC_PATH)
  await dismissBlockingDialogs(page)

  // Load the real DB with artifact 128768.
  const dbInput = page.locator('input[type="file"][accept*=".db"]').first()
  await dbInput.waitFor({ state: 'attached', timeout: PLAYWRIGHT_TIMEOUTS.appGoto })
  await dbInput.setInputFiles(LARGE_ACCOUNT_DB_PATH)
  await dismissBlockingDialogs(page)

  await ensureGearInspectorMode(page)

  const chip = await findTargetChip(page)

  // Baseline: with no rule selected, the chip shows its best rank from another rule (dimmed=false
  // in "none selected" mode because inSelection is treated true when hasSelection is false).
  // Right-click to open the pick-a-rule menu.
  await chip.click({ button: 'right' })

  const menuItem = page.getByTestId(`safeguard-rank-menu-item-${BEST_SPD_RULE_IDX}`)
  await expect(menuItem).toBeVisible({ timeout: PLAYWRIGHT_TIMEOUTS.expectDefault })
  // Sanity: this row is the Best SPD rule at group rank #46 (guards against rule-order drift).
  await expect(menuItem).toContainText('Protect: Best SPD')
  await expect(menuItem).toContainText(EXPECTED_GROUP_RANK)

  await menuItem.click()

  // After selecting the rule the piece IS a candidate in, the chip must NOT be dimmed.
  await expect(chip).toHaveAttribute('data-chip-dimmed', 'false', {
    timeout: PLAYWRIGHT_TIMEOUTS.expectDefault,
  })
  // And it should now display the selected rule's group rank (#46).
  await expect(chip).toContainText(EXPECTED_GROUP_RANK)
})
