import { test, expect } from '@playwright/test'
import fs from 'node:fs'
import path from 'node:path'
import { APP_GOTO_OPTIONS } from './app-init'

// Resolve package.json from repo root so the suite can relocate.
const packageJsonPath = path.resolve(process.cwd(), 'package.json')
const packageJsonRaw = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'))
const appVersionValue = packageJsonRaw && typeof packageJsonRaw === 'object' && 'version' in packageJsonRaw ? packageJsonRaw.version : null
const APP_VERSION = typeof appVersionValue === 'string' ? appVersionValue : '0.0.0'

test.describe('builder rule count chip', () => {
  test('does not revert to Counting when switching configs', async ({ page }) => {
    // Allow extra time for config load and rule chip updates on slower browsers.
    test.setTimeout(120_000)
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

    const hsfcPath = path.resolve(process.cwd(), 'examples', 'example.hsfc')
    const loadConfigsButton = page.getByRole('button', { name: /Load Configs/i })
    await loadConfigsButton.locator('input[type="file"]').setInputFiles(hsfcPath)

    // Close the note dialog if it auto-opens so chips remain clickable.
    const noteDialog = page.getByRole('dialog', { name: 'Note & Config Options' })
    // Only click when the dialog is actually visible.
    if (await noteDialog.isVisible().catch(() => false)) {
      await noteDialog.getByRole('button', { name: 'Close' }).click()
    }
    // Dismiss autosave prompts so they do not block the builder panel.
    const restoreDialog = page.getByRole('dialog', { name: /restore/i })
    // Only interact when the prompt is present.
    if (await restoreDialog.isVisible().catch(() => false)) {
      await restoreDialog.getByRole('button', { name: /Dismiss/i }).click()
    }

    const chips = page.locator('[data-config-chip="true"]')
    // Wait for at least two chips so the config list is hydrated before we switch.
    // Wait for the chip list to populate before asserting visibility.
    await page.waitForFunction(
      () => document.querySelectorAll('[data-config-chip="true"]').length >= 2,
      { timeout: 60_000 },
    )
    await expect(chips.first()).toBeVisible({ timeout: 60_000 })
    await expect(chips.nth(1)).toBeVisible({ timeout: 60_000 })
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
