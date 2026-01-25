import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { test, expect } from './fixtures'
import { APP_GOTO_OPTIONS, prepareApp } from './app-init'

// Resolve file paths relative to this spec so fixtures match the user repro.
const __filename = fileURLToPath(import.meta.url)
// Use the spec directory as a stable base for sample paths.
const __dirname = path.dirname(__filename)
// Point at the copied HSFC file for the scenario.
const HSFC_PATH = path.resolve(__dirname, '..', 'data', 'sample.hsfc')
// Point at the copied DB file for the scenario.
const DB_PATH = path.resolve(__dirname, '..', 'data', 'sample2.db')

const getTesterCountLabel = async (page: Parameters<typeof test.use>[0]['page']) => {
  // Scope to the preview paper so we don't catch other aria labels.
  const summaryLabel = page.locator('[data-tour-id="preview.paper"] [aria-label*="Total:"]')
  // Scan the summary chip labels to find the first visible one.
  for (let idx = 0; idx < await summaryLabel.count(); idx += 1) {
    const candidate = summaryLabel.nth(idx)
    if (!(await candidate.isVisible())) continue
    const label = await candidate.getAttribute('aria-label')
    if (label) return label
  }
  // Return a placeholder if no label is visible yet.
  return 'Total: 0 / 0'
}

const parseTesterCounts = (label: string) => {
  // Expect either "Total: X" or "Total: X / Y".
  const match = label.match(/Total:\s*([0-9,]+)(?:\s*\/\s*([0-9,]+))?/i)
  // Strip thousands separators before numeric conversion.
  const parseCount = (value?: string) => (value ? Number(value.replace(/,/g, '')) : null)
  // Return both counts so we can compare filtered vs total.
  return {
    filtered: match ? parseCount(match[1]) : null,
    total: match ? parseCount(match[2]) : null,
    raw: label,
  }
}

test('disable config options then duplicate disabled config changes sell counts', async ({ page }) => {
  // Allow extra time for the rule cache worker to finish on large datasets.
  test.setTimeout(240000)
  // Start with clean localStorage so the filters are predictable.
  await prepareApp(page)
  // Force English labels so role/name selectors are stable.
  await page.addInitScript(() => {
    window.localStorage.setItem('sellfileCreator.lang.v1', 'en-US')
  })
  // Load the app shell so file inputs are ready.
  // Avoid waiting on the full load event during dev-server startup.
  await page.goto('/', APP_GOTO_OPTIONS)

  // Import the HSFC snapshot that defines the configs and options.
  const hsfcInput = page.getByRole('button', { name: 'Load Configs (.hsfc)' }).locator('input[type="file"]')
  // Use the file input so we hit the normal import path.
  await hsfcInput.setInputFiles(HSFC_PATH)
  // Close the auto-opened note dialog so the main chip list is unblocked.
  const noteDialog = page.getByRole('dialog', { name: 'Note & Config Options' })
  if (await noteDialog.isVisible().catch(() => false)) {
    await noteDialog.getByRole('button', { name: 'Close' }).click()
  }
  // Wait for any config chip so we know the load applied.
  await expect(page.locator('[data-config-chip="true"]').first()).toBeVisible({ timeout: 30_000 })
  // Confirm the Marius config chip is present before opening the note.
  const mariusChip = page.locator('[data-config-chip-index="1"]').first()
  // Wait for the chip node to attach, even if rendering is still settling.
  await mariusChip.waitFor({ state: 'attached', timeout: 60_000 })
  // Ensure the chip is rendered before proceeding.
  await expect(mariusChip).toBeVisible({ timeout: 60_000 })
  // Verify the chip label so the fixture matches expectations.
  await expect(mariusChip).toContainText('Optional: Marius Sets')

  // Open the Note dialog so we can disable config options.
  const noteButton = page.getByRole('button', { name: 'Note & Config Options…' })
  // Trigger the dialog even if it already opened automatically.
  if (await noteButton.isVisible().catch(() => false)) {
    await noteButton.click()
  }

  // Open the Config Options menu in the note dialog.
  const noteDialogContent = page.getByRole('dialog', { name: 'Note & Config Options' })
  // Scope to the dialog so we avoid matching the toolbar button.
  const configOptionsButton = noteDialogContent.getByRole('button', { name: 'Config Options', exact: true })
  // Ensure the button is visible before opening the menu.
  await expect(configOptionsButton).toBeVisible({ timeout: 10000 })
  // Click to open the options menu.
  await configOptionsButton.click()

  // Choose the disable path to turn off config options.
  await page.getByRole('menuitem', { name: 'Disable Config Options...' }).click()
  // Confirm by applying the current answers and disabling the options.
  await page.getByRole('button', { name: 'Apply to Configs and Disable' }).click()

  // Close the note dialog so the preview controls are accessible.
  await page.getByRole('button', { name: 'Close' }).click()

  // Load the gear database so the tester queue is populated.
  const dbInput = page.locator('input[type="file"][accept*=".db"]').first()
  // Upload the DB through the preview header file picker.
  await dbInput.setInputFiles(DB_PATH)

  // Switch the preview into Rule Tester mode.
  await page.getByRole('button', { name: 'Rule Tester' }).click()
  // Wait for the tester count chip to render.
  await expect(page.locator('[data-tour-id="preview.paper"] [aria-label*="Total:"]').first()).toBeVisible()
  // Wait until the DB import populates the total count.
  await expect.poll(async () => {
    const label = await getTesterCountLabel(page)
    const counts = parseTesterCounts(label)
    return counts.total ?? counts.filtered ?? 0
  }, { timeout: 20000 }).toBeGreaterThan(0)

  // Open the filter panel so we can set Result=Sell.
  await page.getByRole('button', { name: /Filters (On|Off)/ }).click()

  // Ensure the filter panel is open by checking the config-name input.
  const filterField = page.getByPlaceholder('Enter Config Name or Tag (regex)')
  // Wait until the input is visible.
  await expect(filterField).toBeVisible()

  // Expand the first Result section so its toggles are visible.
  await page.getByRole('button', { name: 'Expand' }).first().click()
  // Wait for the filter Sell toggle to appear alongside the builder Sell button.
  await expect.poll(async () => page.getByRole('button', { name: 'Sell' }).count(), { timeout: 10000 }).toBeGreaterThan(1)
  // Click the last Sell button, which should belong to the filter panel.
  await page.getByRole('button', { name: 'Sell' }).last().click()
  // Log the label right after applying the sell filter for debugging.
  console.log(`[pw:tester-count] sellFilter=${await getTesterCountLabel(page)}`)

  // Wait for the filter to yield at least one matching item.
  await expect.poll(async () => {
    const label = await getTesterCountLabel(page)
    const counts = parseTesterCounts(label)
    return counts.filtered ?? 0
  }, { timeout: 60000 }).toBeGreaterThan(0)

  // Record the sell count before duplication.
  const beforeLabel = await getTesterCountLabel(page)
  // Parse the label so we can compare filtered values.
  const beforeCounts = parseTesterCounts(beforeLabel)
  // Log the snapshot for CLI inspection.
  console.log(`[pw:tester-count] before=${JSON.stringify(beforeCounts)}`)

  // Duplicate the disabled config via the chip context menu.
  const targetChip = page.locator('#cfg-chip-1')
  // Ensure the chip is visible before opening its menu.
  await expect(targetChip).toBeVisible()
  // Use right-click to open the context menu.
  await targetChip.click({ button: 'right' })
  // Click Duplicate in the context menu.
  await page.getByRole('menuitem', { name: 'Duplicate' }).click()

  // Wait longer for the rule cache to fully settle after duplication.
  await page.waitForTimeout(60000)

  // Capture the updated sell count after waiting for recalculation.
  const afterLabel = await getTesterCountLabel(page)
  // Parse the label so we can diff the filtered count.
  const afterCounts = parseTesterCounts(afterLabel)
  // Log the after snapshot for CLI inspection.
  console.log(`[pw:tester-count] after=${JSON.stringify(afterCounts)}`)
  // The disabled-config duplicate should not alter the filtered sell count.
  expect(afterCounts.filtered).toBe(beforeCounts.filtered)
  // The total inventory count should remain stable as well.
  expect(afterCounts.total).toBe(beforeCounts.total)
})
