import { test, expect } from '@playwright/test'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const packageJsonPath = path.resolve(__dirname, '../package.json')
const packageJsonRaw = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'))
const appVersionValue = packageJsonRaw && typeof packageJsonRaw === 'object' && 'version' in packageJsonRaw ? packageJsonRaw.version : null
const APP_VERSION = typeof appVersionValue === 'string' ? appVersionValue : '0.0.0'

test.describe('builder rule count chip', () => {
  test('does not revert to Counting when switching configs', async ({ page }) => {
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

    await page.goto('/')

    const hsfcPath = path.resolve(__dirname, '../examples/Nusi_20251026_2036.hsfc')
    const loadConfigsButton = page.getByRole('button', { name: /Load Configs/i })
    await loadConfigsButton.locator('input[type="file"]').setInputFiles(hsfcPath)

    const chips = page.locator('[data-config-chip="true"]')
    await expect(chips.first()).toBeVisible()
    await expect(chips.nth(1)).toBeVisible()
    try {
      await page.keyboard.press('Escape')
    } catch {
      /* dialog already closed */
    }
    await page.waitForTimeout(100)

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
    // Allow the UI to settle and capture any transient states.
    await page.waitForTimeout(600)

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
