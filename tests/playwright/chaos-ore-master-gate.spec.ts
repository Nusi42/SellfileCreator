/**
 * Regression guard for the Chaos Ore "sell them all" master toggle in lategame.sfc.
 * Its Keep radio is gated (needs=) on the per-rarity keep checkboxes that live in OTHER
 * questions, so it exercises cross-question `needs` resolution in the radio render path.
 * When at least one rarity is kept the Keep radio is enabled; when none are kept it
 * disables and the group shows Sell (matching gear that falls through to Final Sell).
 */
import { test, expect } from './fixtures'
import { APP_GOTO_OPTIONS, prepareApp } from './app-init'
import { PLAYWRIGHT_TIMEOUTS } from './timeouts'
import { waitForWorkloadIdle } from './note-overrides-helpers'
import { PRESET_LATEGAME_SFC_PATH } from './fixture-paths'
import { SFC_LOAD_INPUT_SELECTOR } from './ui-selectors'

// Read the master Chaos Ore radio's disabled state + the group's shown selection.
const readMaster = async (page: import('@playwright/test').Page) =>
  page.evaluate(() => {
    const labels = Array.from(document.querySelectorAll<HTMLElement>('[role="dialog"] label'))
    const find = (txt: string) => labels.find((l) => (l.textContent ?? '').toLowerCase().includes(txt))
    const keepLabel = find('no, keep them')
    const sellLabel = find('yes, sell them all')
    const radioOf = (l?: HTMLElement) => l?.querySelector<HTMLInputElement>('input[type="radio"]') ?? null
    const keep = radioOf(keepLabel)
    const sell = radioOf(sellLabel)
    return {
      found: Boolean(keep && sell),
      keepDisabled: keep?.disabled ?? null,
      keepChecked: keep?.checked ?? null,
      sellChecked: sell?.checked ?? null,
    }
  })

test('Chaos Ore master Keep radio gates on the per-rarity keeps (cross-question)', async ({ page }) => {
  // Budget: appGoto(15) + sfcInput.waitFor(15) + expectEnabled(3) + dialog.waitFor(15)
  //         + workloadIdle(15) + expect.poll(15) ≈ 78 s minimum; testXL(90) gives headroom.
  // testHeavy(30) was always too tight — it equals only two 15 s waits with zero overhead margin.
  test.setTimeout(PLAYWRIGHT_TIMEOUTS.testXL)
  await prepareApp(page)
  await page.goto('/', APP_GOTO_OPTIONS)
  const sfcInput = page.locator(SFC_LOAD_INPUT_SELECTOR).first()
  await sfcInput.waitFor({ state: 'attached', timeout: PLAYWRIGHT_TIMEOUTS.appGoto })
  await expect(sfcInput).toBeEnabled({ timeout: PLAYWRIGHT_TIMEOUTS.expectDefault })
  await sfcInput.setInputFiles(PRESET_LATEGAME_SFC_PATH)
  // The note dialog auto-opens on import; wait for it before scanning.
  await expect(page.getByRole('dialog').first()).toBeVisible({ timeout: PLAYWRIGHT_TIMEOUTS.expectLong })
  await waitForWorkloadIdle(page)

  // The default Lategame mode keeps several rarities, so the gate is met → Keep enabled.
  await expect.poll(async () => (await readMaster(page)).found, { timeout: PLAYWRIGHT_TIMEOUTS.expectLong }).toBe(true)
  const withKeeps = await readMaster(page)
  expect(withKeeps.keepDisabled).toBe(false)

  // Turn OFF every per-rarity keep so NOTHING is kept → gate unmet → Keep disabled, Sell shown.
  for (const label of [
    'keep **epic** pieces', 'keep **legendary** pieces', 'keep **mythical** pieces',
  ]) {
    // Uncheck across all three Chaos Ore questions (label repeats; uncheck all matches).
    await page.evaluate((lbl) => {
      const inputs = Array.from(document.querySelectorAll<HTMLInputElement>('[role="dialog"] input[type="checkbox"]'))
      for (const input of inputs) {
        const l = input.closest('label') ?? input.parentElement
        if ((l?.textContent ?? '').toLowerCase().includes(lbl) && input.checked) input.click()
      }
    }, label.replace(/\*\*/g, ''))
  }
  await waitForWorkloadIdle(page)
  await expect.poll(async () => (await readMaster(page)).keepDisabled, { timeout: PLAYWRIGHT_TIMEOUTS.expectLong }).toBe(true)
  const noKeeps = await readMaster(page)
  expect(noKeeps.sellChecked).toBe(true)
})
