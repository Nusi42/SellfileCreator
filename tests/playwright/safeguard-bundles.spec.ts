import { test, expect, type Page } from './fixtures'
import { APP_GOTO_OPTIONS, prepareApp } from './app-init'
import { PLAYWRIGHT_TIMEOUTS } from './timeouts'
import { warmupAppShell } from './app-warmup'
import { dismissBlockingDialogs } from './dialog-helpers'
import { openContextMenu } from './context-menu'

/**
 * Safeguard bundles — the outline UI end to end.
 *
 * A bundle OWNS a shared promise: its members evaluate unchanged and each one's required count
 * sizes the gear it feeds the bundle, which then merges those feeds into buckets keyed by its own
 * chips and keeps its own required count out of each.
 * The behaviours pinned here are the ones that only exist once the whole stack is wired up:
 * grouping through the context menu, the indentation the outline produces, the collapse chevron
 * hiding a subtree, drag-and-drop moving a bundle WITH its members, and ungrouping restoring the
 * flat list. Quota semantics themselves are covered far more cheaply by the Rust detection tests
 * in `wasm/rule_engine_core/src/safeguards/bundle_tests.rs`.
 */

// Chips carry their outline level and kind as data attributes, which is also what the drag layer
// measures — so asserting on them checks the same source the interaction uses.
const chip = (page: Page, index: number) => page.locator(`[data-safeguard-chip-index="${index}"]`)
const chipCount = (page: Page) => page.locator('[data-safeguard-chip="true"]')

// Adds `count` safeguards from the builder's insert button, which appends after the selection.
const addSafeguards = async (page: Page, count: number): Promise<void> => {
  for (let i = 0; i < count; i += 1) {
    await page.getByRole('button', { name: /Add Safeguard|Insert as safeguard/i }).first().click()
    await expect(chipCount(page)).toHaveCount(i + 1, { timeout: PLAYWRIGHT_TIMEOUTS.expectDefault })
  }
}

test.beforeAll(async ({ browser }) => {
  test.setTimeout(PLAYWRIGHT_TIMEOUTS.testLong)
  await warmupAppShell(browser)
})

test.beforeEach(async ({ page }) => {
  test.setTimeout(PLAYWRIGHT_TIMEOUTS.testLong)
  await prepareApp(page)
  await page.goto('/', APP_GOTO_OPTIONS)
  await expect(page.getByRole('button', { name: 'Recipe Builder' })).toBeVisible({ timeout: PLAYWRIGHT_TIMEOUTS.expectLong })
  await dismissBlockingDialogs(page)
  // Every assertion below lives in Safeguard Builder mode.
  await page.getByRole('button', { name: 'Safeguard Builder' }).click()
  await expect(page.getByRole('button', { name: 'Safeguard Builder' })).toHaveAttribute('aria-pressed', 'true', { timeout: PLAYWRIGHT_TIMEOUTS.expectDefault })
})

test('grouping a selection wraps it in a bundle and indents the members', async ({ page }) => {
  await addSafeguards(page, 2)
  // Select both chips (click, then ctrl-click) so the group action covers the pair.
  await chip(page, 0).click()
  await chip(page, 1).click({ modifiers: ['Control'] })
  const menu = await openContextMenu(page, chip(page, 1))
  await menu.getByRole('menuitem', { name: 'Group into bundle' }).click()
  // A header is inserted above the pair, so the list grows by exactly one entry.
  await expect(chipCount(page)).toHaveCount(3, { timeout: PLAYWRIGHT_TIMEOUTS.expectDefault })
  await expect(chip(page, 0)).toHaveAttribute('data-safeguard-chip-kind', 'bundle')
  await expect(chip(page, 0)).toHaveAttribute('data-safeguard-chip-depth', '0')
  // Both members dropped exactly one level — the outline invariant, visible in the DOM.
  await expect(chip(page, 1)).toHaveAttribute('data-safeguard-chip-depth', '1')
  await expect(chip(page, 2)).toHaveAttribute('data-safeguard-chip-depth', '1')
  await expect(chip(page, 1)).toHaveAttribute('data-safeguard-chip-kind', 'rule')
})

test("a bundle's own count is editable and survives a round trip", async ({ page }) => {
  await addSafeguards(page, 2)
  await chip(page, 0).click()
  await chip(page, 1).click({ modifiers: ['Control'] })
  const menu = await openContextMenu(page, chip(page, 1))
  await menu.getByRole('menuitem', { name: 'Group into bundle' }).click()
  await expect(chipCount(page)).toHaveCount(3, { timeout: PLAYWRIGHT_TIMEOUTS.expectDefault })
  // The header carries an ordinary Required Count field — no pin, no read-only state.
  await chip(page, 0).click()
  const count = page.getByLabel('Required Count').first()
  await expect(count).toBeEnabled({ timeout: PLAYWRIGHT_TIMEOUTS.expectDefault })
  await count.fill('4')
  // The form edits a detached draft, so commit it the same way every other field is committed.
  await page.getByRole('button', { name: /Apply (Safeguard|as Safeguard)/i }).first().click()
  // The chip shows what the ENGINE resolved, so this also proves the number reached the outline
  // resolver rather than only the draft.
  await expect(chip(page, 0)).toContainText('4', { timeout: PLAYWRIGHT_TIMEOUTS.expectLong })
  // Select away and back: the edit must have reached the stored rule. This is the assertion that
  // caught the mutation funnel dropping outline-only edits.
  await chip(page, 1).click()
  await chip(page, 0).click()
  await expect(page.getByLabel('Required Count').first())
    .toHaveValue('4', { timeout: PLAYWRIGHT_TIMEOUTS.expectLong })
})

test('the collapse chevron hides the subtree and the ancestors stay visible', async ({ page }) => {
  await addSafeguards(page, 2)
  await chip(page, 0).click()
  await chip(page, 1).click({ modifiers: ['Control'] })
  const menu = await openContextMenu(page, chip(page, 1))
  await menu.getByRole('menuitem', { name: 'Group into bundle' }).click()
  await expect(chipCount(page)).toHaveCount(3, { timeout: PLAYWRIGHT_TIMEOUTS.expectDefault })
  // Collapse: the two members drop out of the list, the header remains.
  await chip(page, 0).getByRole('button', { name: 'Collapse bundle' }).click()
  await expect(chipCount(page)).toHaveCount(1, { timeout: PLAYWRIGHT_TIMEOUTS.expectDefault })
  await expect(chip(page, 0)).toBeVisible()
  // Expanding restores exactly what was hidden.
  await chip(page, 0).getByRole('button', { name: 'Expand bundle' }).click()
  await expect(chipCount(page)).toHaveCount(3, { timeout: PLAYWRIGHT_TIMEOUTS.expectDefault })
})

test('moving a bundle relocates its whole subtree as one block', async ({ page }) => {
  await addSafeguards(page, 3)
  // Group the first two, leaving the third loose at the bottom.
  await chip(page, 0).click()
  await chip(page, 1).click({ modifiers: ['Control'] })
  const menu = await openContextMenu(page, chip(page, 1))
  await menu.getByRole('menuitem', { name: 'Group into bundle' }).click()
  await expect(chipCount(page)).toHaveCount(4, { timeout: PLAYWRIGHT_TIMEOUTS.expectDefault })
  // Layout: [bundle, member, member, loose]. Send the header down past the loose rule; this
  // drives the same subtree-move resolver that drag-and-drop uses, through real UI.
  await chip(page, 0).click()
  const moveMenu = await openContextMenu(page, chip(page, 0))
  await moveMenu.getByRole('menuitem', { name: 'Move Down' }).click()
  // The loose rule is now first and the bundle kept both members contiguous behind it —
  // a plain element swap would have left the members stranded above their header.
  await expect(chip(page, 0)).toHaveAttribute('data-safeguard-chip-kind', 'rule', { timeout: PLAYWRIGHT_TIMEOUTS.expectDefault })
  await expect(chip(page, 1)).toHaveAttribute('data-safeguard-chip-kind', 'bundle')
  await expect(chip(page, 2)).toHaveAttribute('data-safeguard-chip-depth', '1')
  await expect(chip(page, 3)).toHaveAttribute('data-safeguard-chip-depth', '1')
})

test('ungrouping restores the flat list', async ({ page }) => {
  await addSafeguards(page, 2)
  await chip(page, 0).click()
  await chip(page, 1).click({ modifiers: ['Control'] })
  const groupMenu = await openContextMenu(page, chip(page, 1))
  await groupMenu.getByRole('menuitem', { name: 'Group into bundle' }).click()
  await expect(chipCount(page)).toHaveCount(3, { timeout: PLAYWRIGHT_TIMEOUTS.expectDefault })
  // Dissolve the header; its members are promoted back to the top level.
  const ungroupMenu = await openContextMenu(page, chip(page, 0))
  await ungroupMenu.getByRole('menuitem', { name: 'Ungroup bundle' }).click()
  await expect(chipCount(page)).toHaveCount(2, { timeout: PLAYWRIGHT_TIMEOUTS.expectDefault })
  await expect(chip(page, 0)).toHaveAttribute('data-safeguard-chip-depth', '0')
  await expect(chip(page, 1)).toHaveAttribute('data-safeguard-chip-depth', '0')
  await expect(chip(page, 0)).toHaveAttribute('data-safeguard-chip-kind', 'rule')
})
