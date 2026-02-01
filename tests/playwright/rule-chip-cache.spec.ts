import { test, expect } from '@playwright/test'
import fs from 'node:fs'
import path from 'node:path'
import { APP_GOTO_OPTIONS } from './app-init'
import { dismissBlockingDialogs } from './dialog-helpers'
import { PLAYWRIGHT_TIMEOUTS } from './timeouts'
import { getWorkloadIndicator } from './workload-indicator'
import { SAMPLE_SMALL_HSFC_PATH } from './fixture-paths'
import { HSFC_LOAD_INPUT_SELECTOR } from './ui-selectors'

// Resolve package.json from repo root so the suite can relocate.
const packageJsonPath = path.resolve(process.cwd(), 'package.json')
const packageJsonRaw = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'))
const appVersionValue = packageJsonRaw && typeof packageJsonRaw === 'object' && 'version' in packageJsonRaw ? packageJsonRaw.version : null
const APP_VERSION = typeof appVersionValue === 'string' ? appVersionValue : '0.0.0'

test.describe('builder rule count chip', () => {
  test('does not revert to Counting when switching configs', async ({ page }) => {
    // Allow the long timeout for rule rebuilds after config switches.
    test.setTimeout(PLAYWRIGHT_TIMEOUTS.testLong)
    await page.addInitScript(({ readmeKey, tutorialKey, autosaveKey, version }) => {
      try { window.localStorage.setItem(readmeKey, version) } catch {
        /* localStorage unavailable */
      }
      try { window.localStorage.setItem(tutorialKey, version) } catch {
        /* localStorage unavailable */
      }
      try { window.localStorage.removeItem(autosaveKey) } catch {
        /* localStorage unavailable */
      }
    }, {
      readmeKey: 'sellfileCreator.readme.seen.version',
      tutorialKey: 'sellfileCreator.tutorial.seen.version',
      autosaveKey: 'sellfileCreator.autosave.hsfc.v1',
      version: APP_VERSION,
    })

    // Load the shell without waiting on full resource load.
    await page.goto('/', APP_GOTO_OPTIONS)

    // Use the slim HSFC fixture so loads stay quick in all browsers.
    const hsfcPath = SAMPLE_SMALL_HSFC_PATH
    // Target the hidden input via the shared selector for stability.
    const hsfcInput = page.locator(HSFC_LOAD_INPUT_SELECTOR).first()
    await hsfcInput.setInputFiles(hsfcPath)

    // Clear any dialogs that would block chip interactions.
    await dismissBlockingDialogs(page)

    const chips = page.locator('[data-config-chip="true"]')
    // Wait for at least two chips so the config list is hydrated before we switch.
    // Wait for the chip list to populate before asserting visibility.
    await page.waitForFunction(
      () => document.querySelectorAll('[data-config-chip="true"]').length >= 2,
      undefined,
      { timeout: PLAYWRIGHT_TIMEOUTS.expectLong },
    )
    await expect(chips.first()).toBeVisible({ timeout: PLAYWRIGHT_TIMEOUTS.expectLong })
    await expect(chips.nth(1)).toBeVisible({ timeout: PLAYWRIGHT_TIMEOUTS.expectLong })
    try {
      await page.keyboard.press('Escape')
    } catch {
      /* dialog already closed */
    }

    const ruleChipLabel = page.locator('[data-testid="builder-rule-count-chip"] .MuiChip-label')
    await expect(ruleChipLabel).toBeVisible()

    await page.evaluate(() => {
      const chip = document.querySelector('[data-testid="builder-rule-count-chip"] .MuiChip-label')
      const states = chip ? [chip.textContent ?? ''] : []
      if (chip) {
        const observer = new MutationObserver(() => {
          states.push(chip.textContent ?? '')
        })
        observer.observe(chip, { characterData: true, childList: true, subtree: true })
        // @ts-expect-error test instrumentation
        window.__builderRuleChipObserver = observer
      }
      // @ts-expect-error test instrumentation
      window.__builderRuleChipStates = states
    })

    const baselineLength = await page.evaluate(() => {
      // @ts-expect-error test instrumentation
      return Array.isArray(window.__builderRuleChipStates) ? window.__builderRuleChipStates.length : 0
    })

    await chips.nth(1).click()
    // Wait for the rebuild indicator to clear before capturing final states.
    await getWorkloadIndicator(page).waitFor({ state: 'hidden', timeout: PLAYWRIGHT_TIMEOUTS.expectLong })

    const states = await page.evaluate(() => {
      // @ts-expect-error test instrumentation
      const observer = window.__builderRuleChipObserver
      observer?.disconnect()
      // @ts-expect-error test instrumentation
      const recorded = window.__builderRuleChipStates
      return Array.isArray(recorded) ? recorded.slice() : []
    })

    const postStates = states.slice(baselineLength)
    const hitCounting = postStates.some((state) => typeof state === 'string' && state.includes('Counting'))
    expect(hitCounting, `Observed chip states: ${JSON.stringify(postStates)}`).toBe(false)
  })
})
