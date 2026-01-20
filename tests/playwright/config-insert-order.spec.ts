import { test, expect } from './fixtures'
import path from 'node:path'
import { prepareApp } from './app-init'

async function getFirstRulePositions(page: import('@playwright/test').Page): Promise<number[]> {
  return page.evaluate(() => {
    const rows = Array.from(document.querySelectorAll('[data-cfg-idx]'))
    const firstPositions = new Map<number, number>()
    rows.forEach((row, idx) => {
      const raw = row.getAttribute('data-cfg-idx')
      if (raw == null) return
      const cfgIdx = Number(raw)
      if (!Number.isFinite(cfgIdx)) return
      if (!firstPositions.has(cfgIdx)) {
        firstPositions.set(cfgIdx, idx)
      }
    })
    return Array.from(firstPositions.entries())
      .sort((a, b) => a[0] - b[0])
      .map(([, pos]) => pos)
  })
}

function positionsAreOrdered(positions: readonly number[]): boolean {
  for (let i = 1; i < positions.length; i += 1) {
    if (positions[i] < positions[i - 1]!) return false
  }
  return true
}

async function openChipMenu(
  page: import('@playwright/test').Page,
  chip: import('@playwright/test').Locator,
): Promise<void> {
  // Use a coordinate-based right-click so the context menu has an anchor.
  await chip.scrollIntoViewIfNeeded()
  const menu = page.getByRole('menu').first()
  // Compute a stable anchor inside the chip bounds.
  const box = await chip.boundingBox()
  const anchorX = box ? Math.round(box.x + box.width / 2) : 2
  const anchorY = box ? Math.round(box.y + box.height / 2) : 2
  // Attempt a physical right-click first to drive the same event path as a user.
  await page.mouse.click(anchorX, anchorY, { button: 'right' })
  if (await menu.isVisible().catch(() => false)) return
  // Fall back to dispatching the event directly if the pointer path is blocked.
  await chip.dispatchEvent('contextmenu', { clientX: anchorX, clientY: anchorY })
  if (await menu.isVisible().catch(() => false)) return
  await chip.click({ button: 'right', force: true })
  await menu.waitFor({ state: 'visible', timeout: 5_000 })
}

test.describe('config insert ordering', () => {
  test('HSF preview rows stay aligned with config order after paste after', async ({ page, browserName }) => {
    // Skip Firefox while context-menu popovers intermittently intercept clicks.
    test.skip(browserName === 'firefox', 'Firefox context menu popover blocks chip clicks in this flow.')
    // Allow extra time for large HSFC parsing and preview rebuilds.
    test.setTimeout(120_000)
    await prepareApp(page, { stubClipboard: true })

    await page.goto('/')

    try {
      await page.getByRole('button', { name: 'Close' }).first().click({ timeout: 1_000 })
    } catch {
      /* overlay already dismissed */
    }

    const hsfcPath = path.resolve(process.cwd(), 'tests', 'data', 'sample.hsfc')
    const loadConfigsButton = page.getByRole('button', { name: /Load Configs/i })
    await loadConfigsButton.locator('input[type="file"]').setInputFiles(hsfcPath)

    // Close the note dialog if it auto-opens on load.
    const noteDialog = page.getByRole('dialog', { name: 'Note & Config Options' })
    // Only click when the dialog is actually visible.
    if (await noteDialog.isVisible().catch(() => false)) {
      await noteDialog.getByRole('button', { name: 'Close' }).click()
    }
    // Dismiss restore prompts so they do not block chip interactions.
    const restoreDialog = page.getByRole('dialog', { name: /restore/i })
    // Only interact with the dialog when it is present.
    if (await restoreDialog.isVisible().catch(() => false)) {
      await restoreDialog.getByRole('button', { name: /Dismiss/i }).click()
    }

    try {
      await page.keyboard.press('Escape')
    } catch {
      /* dialog already closed */
    }
    try {
      await page.getByRole('button', { name: 'Close' }).first().click({ timeout: 1_000 })
    } catch {
      /* note already dismissed */
    }

    const previewRow = page.locator('[data-cfg-idx]')
    await previewRow.first().waitFor({ timeout: 30_000 })

    const buildingLabel = page.getByLabel('Building…', { exact: true })
    try {
      await buildingLabel.waitFor({ state: 'hidden', timeout: 10_000 })
    } catch {
      /* already settled */
    }

    const baselinePositions = await getFirstRulePositions(page)
    expect(positionsAreOrdered(baselinePositions)).toBe(true)

    const sourceChip = page.locator('#cfg-chip-5').first()
    await sourceChip.waitFor({ timeout: 5_000 })
    await openChipMenu(page, sourceChip)

    const copyItem = page.getByRole('menuitem', { name: 'Copy to Clipboard' })
    await expect(copyItem).toBeVisible()
    await copyItem.click()
    // Dismiss the context menu so it does not block the next chip.
    await page.keyboard.press('Escape')
    // Click a neutral area to force any lingering popovers to close.
    await page.mouse.click(1, 1)
    try {
      await page.locator('[role="menu"]').first().waitFor({ state: 'hidden', timeout: 5_000 })
    } catch {
      /* menu already closed */
    }

    const targetChip = page.locator('#cfg-chip-1').first()
    await targetChip.waitFor({ timeout: 5_000 })
    // Ensure no lingering menus intercept the next context menu.
    await page.keyboard.press('Escape')
    await page.mouse.click(1, 1)
    await openChipMenu(page, targetChip)

    const pasteAfterItem = page.getByRole('menuitem', { name: 'Paste after' })
    await expect(pasteAfterItem).toBeVisible()
    await pasteAfterItem.click()
    // Close any remaining menus so the preview can update.
    await page.keyboard.press('Escape')
    try {
      await page.locator('[role="menu"]').first().waitFor({ state: 'hidden', timeout: 5_000 })
    } catch {
      /* menu already closed */
    }

    try {
      await buildingLabel.waitFor({ state: 'visible', timeout: 2_000 })
    } catch {
      /* warm may reuse cache */
    }
    try {
      await buildingLabel.waitFor({ state: 'hidden', timeout: 10_000 })
    } catch {
      /* settle even if label never appeared */
    }

    // Wait for preview rows to re-appear after the paste action rebuilds the list.
    await page.waitForFunction(
      () => document.querySelectorAll('[data-cfg-idx]').length > 0,
      { timeout: 10_000 },
    )

    const postInsertPositions = await getFirstRulePositions(page)
    expect(positionsAreOrdered(postInsertPositions)).toBe(true)
  })
})
