import { test, expect } from '@playwright/test'
import fs from 'node:fs'
import { APP_GOTO_OPTIONS, APP_VERSION, prepareApp } from './app-init'
import { dismissBlockingDialogs } from './dialog-helpers'
import { PLAYWRIGHT_TIMEOUTS } from './timeouts'
import { getWorkloadIndicator } from './workload-indicator'
import { SAMPLE_SMALL_HSFC_PATH } from './fixture-paths'
import { AUTOSAVE_KEY } from '../../src/lib/constants'
import { computeCrc32 } from '../../src/lib/autosave'

const AUTO_APPLY_AUTOSAVE_ENTRY = (() => {
  // Read the HSFC fixture so we can seed autosave without file uploads.
  const raw = fs.readFileSync(SAMPLE_SMALL_HSFC_PATH, 'utf-8')
  // Parse the HSFC JSON into a payload we can attach autosave metadata to.
  const payload = JSON.parse(raw) as Record<string, unknown>
  // Ensure the payload uses the current app version for restore dialogs.
  const autosavePayload = {
    ...payload,
    Version: APP_VERSION,
    AutosaveSavedAt: '2024-12-12T00:00:00.000Z',
  }
  // Serialize once so we can compute the CRC in the same format as the app.
  const serialized = JSON.stringify(autosavePayload)
  // Compute the autosave CRC so the restore prompt accepts the payload.
  const crc = computeCrc32(serialized)
  return JSON.stringify([crc, autosavePayload])
})()

const acceptConfigAutosaveRestore = async (page: Parameters<typeof test>[0]['page']): Promise<void> => {
  // Locate the restore dialog that appears when autosave data exists.
  const dialog = page.getByRole('dialog', { name: /restore/i })
  // Allow app boot time so the dialog has a chance to render.
  await dialog.waitFor({ state: 'visible', timeout: PLAYWRIGHT_TIMEOUTS.appGoto }).catch(() => undefined)
  // Skip when no restore prompt is displayed.
  const isVisible = await dialog.isVisible().catch(() => false)
  if (!isVisible) return
  // Ensure recipes are selected so the builder list is restored.
  const configsCheckbox = dialog.getByRole('checkbox', { name: /Recipes/i })
  if (await configsCheckbox.isVisible().catch(() => false)) {
    if (!(await configsCheckbox.isChecked().catch(() => false))) {
      await configsCheckbox.click()
    }
  }
  // Restore the autosave so the recipes become available for testing.
  const restoreButton = dialog.getByRole('button', { name: /Restore selected/i })
  await expect(restoreButton).toBeEnabled({ timeout: PLAYWRIGHT_TIMEOUTS.expectDefault })
  // Allow the click to wait for async restore work on slower hosts.
  await restoreButton.click({ timeout: PLAYWRIGHT_TIMEOUTS.expectLong })
  // Wait for the dialog to dismiss before continuing.
  await expect(dialog).toBeHidden({ timeout: PLAYWRIGHT_TIMEOUTS.expectLong })
}

test.describe('builder rule count chip', () => {
  test('does not revert to Counting when switching recipes', async ({ page }) => {
    // Allow the heavy timeout for autosave restore plus rule rebuilds.
    test.setTimeout(PLAYWRIGHT_TIMEOUTS.testHeavy)
    // Seed storage so the README dialog does not block the shell.
    await prepareApp(page)
    // Seed the autosave payload so we can restore without file uploads.
    await page.addInitScript(
      ({ autosaveKey, autosaveValue }) => {
        try {
          window.localStorage.setItem(autosaveKey, autosaveValue)
        } catch {
          /* localStorage unavailable */
        }
      },
      {
        autosaveKey: AUTOSAVE_KEY,
        autosaveValue: AUTO_APPLY_AUTOSAVE_ENTRY,
      },
    )

    // Load the shell without waiting on full resource load.
    await page.goto('/', APP_GOTO_OPTIONS)
    // Accept the restore prompt so the autosave recipes load into the builder.
    await acceptConfigAutosaveRestore(page)

    // Clear any dialogs that would block chip interactions.
    await dismissBlockingDialogs(page)

    const chips = page.locator('[data-recipe-chip="true"]')
    // Wait for at least two chips so the config list is hydrated before we switch.
    // Wait for the chip list to populate before asserting visibility.
    await page.waitForFunction(
      () => document.querySelectorAll('[data-recipe-chip="true"]').length >= 2,
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
