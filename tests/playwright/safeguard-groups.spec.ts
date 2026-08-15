import { test, expect, type Page } from './fixtures'
import { APP_GOTO_OPTIONS, prepareApp } from './app-init'
import { PLAYWRIGHT_TIMEOUTS } from './timeouts'
import { warmupAppShell } from './app-warmup'
import { dismissBlockingDialogs } from './dialog-helpers'
import { openContextMenu } from './context-menu'

/**
 * Safeguard groups — the group UI end to end.
 *
 * A group is a contiguous run of members sharing one id and one promise: each member evaluates
 * unchanged and its own required count sizes the gear it feeds the group, which merges those
 * feeds into buckets keyed by its own chips and keeps its own required count out of each. The
 * behaviours pinned here are the ones that only exist once the whole stack is wired up: grouping
 * through the context menu, the coloured edge every member carries, the group strip beside the
 * required count editing the whole run, a directional move keeping the run together, and
 * ungrouping restoring the flat list. Quota semantics themselves are covered far more cheaply by
 * the Rust detection tests in `wasm/rule_engine_core/src/safeguards/group_tests.rs`.
 */

// Chips carry their group id and kind as data attributes, which is also what the drag layer
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

// Selects chips `from`..`to` (click, then ctrl-clicks) and groups them through the context menu.
const groupChips = async (page: Page, from: number, to: number): Promise<void> => {
  await chip(page, from).click()
  for (let i = from + 1; i <= to; i += 1) await chip(page, i).click({ modifiers: ['Control'] })
  const menu = await openContextMenu(page, chip(page, to))
  await menu.getByRole('menuitem', { name: 'Group selected safeguards' }).click()
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

test('grouping a selection makes it one run: no extra entry, same id, coloured edge', async ({ page }) => {
  await addSafeguards(page, 3)
  await groupChips(page, 0, 1)
  // No header entry: the list keeps its three chips.
  await expect(chipCount(page)).toHaveCount(3, { timeout: PLAYWRIGHT_TIMEOUTS.expectDefault })
  const id = await chip(page, 0).getAttribute('data-safeguard-chip-group')
  expect(id).toBeTruthy()
  await expect(chip(page, 1)).toHaveAttribute('data-safeguard-chip-group', id as string)
  // The third rule stays outside the group.
  await expect(chip(page, 2)).not.toHaveAttribute('data-safeguard-chip-group', /.+/)
  // Every member carries the group badge with the seeded (neutral: 1 + 1) count.
  await expect(chip(page, 0).locator('[data-safeguard-group-badge]')).toContainText('2')
  await expect(chip(page, 1).locator('[data-safeguard-group-badge]')).toContainText('2')
})

test('the group strip edits the group for every member and survives a round trip', async ({ page }) => {
  await addSafeguards(page, 2)
  await groupChips(page, 0, 1)
  await expect(chip(page, 0)).toHaveAttribute('data-safeguard-chip-group', /.+/, { timeout: PLAYWRIGHT_TIMEOUTS.expectDefault })
  // The strip sits beside the rule's own Required Count and is an ordinary number field.
  await chip(page, 0).click()
  const strip = page.locator('[data-tour-id="safeguards.builder.group-strip"]')
  await expect(strip).toBeVisible({ timeout: PLAYWRIGHT_TIMEOUTS.expectDefault })
  const groupCount = strip.getByRole('spinbutton')
  await groupCount.fill('4')
  // The form edits a detached draft, so commit it the same way every other field is committed.
  await page.getByRole('button', { name: /Apply (Safeguard|as Safeguard)/i }).first().click()
  // The badge on BOTH members shows the new number: the funnel's normalizer fanned the edit out
  // across the run — this is the assertion that catches a group edit landing on one member only.
  await expect(chip(page, 0).locator('[data-safeguard-group-badge]')).toContainText('4', { timeout: PLAYWRIGHT_TIMEOUTS.expectLong })
  await expect(chip(page, 1).locator('[data-safeguard-group-badge]')).toContainText('4', { timeout: PLAYWRIGHT_TIMEOUTS.expectLong })
  // Select the other member: its strip reads the same group value.
  await chip(page, 1).click()
  await expect(strip.getByRole('spinbutton')).toHaveValue('4', { timeout: PLAYWRIGHT_TIMEOUTS.expectLong })
  // The member's own count is untouched by the group edit.
  await expect(page.getByLabel('Required Count').first()).toHaveValue('1')
})

test('a group scope toggle in the strip reaches the badge tooltip scope', async ({ page }) => {
  await addSafeguards(page, 2)
  await groupChips(page, 0, 1)
  await chip(page, 0).click()
  const strip = page.locator('[data-tour-id="safeguards.builder.group-strip"]')
  await expect(strip).toBeVisible({ timeout: PLAYWRIGHT_TIMEOUTS.expectDefault })
  // The four scope toggles are one visual unit inside the strip; "slot" is the first.
  await strip.getByRole('button', { name: /^slot$/i }).click()
  await page.getByRole('button', { name: /Apply (Safeguard|as Safeguard)/i }).first().click()
  // The rule's OWN chips are separate controls and stay unchanged: the summary shows no scope.
  await expect(chip(page, 0)).not.toContainText('Per Slot')
  // Selecting the other member shows the strip's toggle pressed — the run shares the chips.
  await chip(page, 1).click()
  await expect(strip.getByRole('button', { name: /^slot$/i })).toHaveAttribute('aria-pressed', 'true', { timeout: PLAYWRIGHT_TIMEOUTS.expectLong })
})

test('a directional move keeps the run together and hops an outsider over it', async ({ page }) => {
  await addSafeguards(page, 3)
  // Group the first two, leaving the third loose at the bottom.
  await groupChips(page, 0, 1)
  await expect(chip(page, 1)).toHaveAttribute('data-safeguard-chip-group', /.+/, { timeout: PLAYWRIGHT_TIMEOUTS.expectDefault })
  const id = await chip(page, 0).getAttribute('data-safeguard-chip-group')
  // Layout: [member, member, loose]. Send the loose rule up: it must hop the whole run rather than
  // land inside it — a plain element swap would have split the group.
  await chip(page, 2).click()
  const moveMenu = await openContextMenu(page, chip(page, 2))
  await moveMenu.getByRole('menuitem', { name: 'Move Up' }).click()
  await expect(chip(page, 0)).not.toHaveAttribute('data-safeguard-chip-group', /.+/, { timeout: PLAYWRIGHT_TIMEOUTS.expectDefault })
  await expect(chip(page, 1)).toHaveAttribute('data-safeguard-chip-group', id as string)
  await expect(chip(page, 2)).toHaveAttribute('data-safeguard-chip-group', id as string)
})

test('ungrouping restores the flat list; removing one member dissolves a pair', async ({ page }) => {
  await addSafeguards(page, 3)
  await groupChips(page, 0, 2)
  await expect(chip(page, 2)).toHaveAttribute('data-safeguard-chip-group', /.+/, { timeout: PLAYWRIGHT_TIMEOUTS.expectDefault })
  // Remove one member: the other two stay a group.
  const leaveMenu = await openContextMenu(page, chip(page, 2))
  await leaveMenu.getByRole('menuitem', { name: 'Remove from group' }).click()
  await expect(chip(page, 2)).not.toHaveAttribute('data-safeguard-chip-group', /.+/, { timeout: PLAYWRIGHT_TIMEOUTS.expectDefault })
  await expect(chip(page, 1)).toHaveAttribute('data-safeguard-chip-group', /.+/)
  // Ungroup the rest: no chip carries an id, and the list is untouched otherwise.
  const ungroupMenu = await openContextMenu(page, chip(page, 0))
  await ungroupMenu.getByRole('menuitem', { name: 'Ungroup' }).click()
  await expect(chipCount(page)).toHaveCount(3, { timeout: PLAYWRIGHT_TIMEOUTS.expectDefault })
  for (const index of [0, 1, 2]) {
    await expect(chip(page, index)).not.toHaveAttribute('data-safeguard-chip-group', /.+/)
  }
})
