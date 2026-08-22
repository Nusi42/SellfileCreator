import { test, expect } from './fixtures'
import { APP_GOTO_OPTIONS, prepareApp } from './app-init'
import { dismissBlockingDialogs } from './dialog-helpers'
import { PLAYWRIGHT_TIMEOUTS } from './timeouts'
import { warmupAppShell } from './app-warmup'
import { TAG_FLYOUT_WIDTH_PX } from '../../src/components/BuilderTagChips'

// Boot the shell once so each test only pays for navigation, not a cold compile.
test.beforeAll(async ({ browser }) => {
  test.setTimeout(PLAYWRIGHT_TIMEOUTS.testHeavy)
  await warmupAppShell(browser)
})

test.beforeEach(async ({ page }) => {
  test.setTimeout(PLAYWRIGHT_TIMEOUTS.testHeavy)
  await prepareApp(page)
  await page.goto('/', APP_GOTO_OPTIONS)
  await expect(page.getByRole('button', { name: 'Recipe Builder' })).toBeVisible({ timeout: PLAYWRIGHT_TIMEOUTS.expectLong })
  await dismissBlockingDialogs(page)
})

// Open the recipe builder's tags flyout and wait for the picker section.
const openTagsFlyout = async (page: import('@playwright/test').Page): Promise<void> => {
  await page.getByRole('button', { name: 'Tags', exact: true }).first().click()
  await expect(page.getByText('Unused tags', { exact: true }))
    .toBeVisible({ timeout: PLAYWRIGHT_TIMEOUTS.expectDefault })
}

// The tags flyout renders as a menu; scope every query to it so the builder's own inline
// tag strip (identical chip markup, outside the popover) cannot satisfy these assertions.
const tagsFlyout = (page: import('@playwright/test').Page) => page.getByRole('menu').last()

// Resolve the picker chip for a tag. The picker lists unapplied tags only, so within the
// flyout a chip without a delete icon is a picker chip rather than an applied one.
const pickerChip = (page: import('@playwright/test').Page, tag: string) =>
  tagsFlyout(page).locator('.MuiChip-root')
    .filter({ hasText: new RegExp(`^${tag}$`) })
    .filter({ hasNot: page.locator('.MuiChip-deleteIcon') })

// Tag used to seed the document's vocabulary. Nothing is seeded by default any more —
// tags are purely the user's own labels — so each test that needs a picker entry types
// one first, which is also how a real user reaches this state.
const SEED_TAG = 'my_label'

// Type a tag into the open flyout's draft field so it joins the document vocabulary.
const applyTagViaDraft = async (page: import('@playwright/test').Page, tag: string): Promise<void> => {
  await tagsFlyout(page).getByRole('textbox').first().fill(tag)
  await page.keyboard.press('Enter')
  // The tag becomes an applied chip (applied chips carry a delete icon).
  await expect(
    tagsFlyout(page).locator('.MuiChip-root', { hasText: tag })
      .filter({ has: page.locator('.MuiChip-deleteIcon') })
      .first(),
  ).toBeVisible({ timeout: PLAYWRIGHT_TIMEOUTS.expectDefault })
}

// A fresh document has no tags at all, so the picker offers nothing. This pins the
// replacement for the old "every app-known tag is offered" contract: the vocabulary is now
// exactly what the user has typed, with nothing seeded behind their back.
test('the tags picker offers nothing on a fresh document', async ({ page }) => {
  await openTagsFlyout(page)
  await expect(tagsFlyout(page).getByText('No other tags used in this document', { exact: true }))
    .toBeVisible({ timeout: PLAYWRIGHT_TIMEOUTS.expectDefault })
})

// The flyout must stay a predictable size regardless of how many tags exist: both the
// applied chip list and the picker are bounded and scroll instead of growing the popover.
test('the tags flyout stays bounded in both axes', async ({ page }) => {
  await openTagsFlyout(page)
  // Seed a tag so there is at least one chip to measure a bounded container against.
  await applyTagViaDraft(page, SEED_TAG)

  // Find the scrollable list container for each chip by walking UP from the chip: every
  // chip sits inside an ellipsis-tooltip wrapper, so the chip's direct parent is not the
  // list. Read COMPUTED styles rather than bounding boxes — the menu's open animation
  // applies a transform, so measured geometry is smaller than the real layout width.
  const boxes = await page.evaluate(() => {
    const menus = Array.from(document.querySelectorAll('[role="menu"]'))
    const menu = menus[menus.length - 1]
    if (!menu) return null
    const containers = new Set<HTMLElement>()
    for (const chip of Array.from(menu.querySelectorAll('.MuiChip-root'))) {
      let node = chip.parentElement
      // Climb to the nearest scrollable ancestor — that is the bounded list.
      while (node && getComputedStyle(node).overflowY !== 'auto') node = node.parentElement
      if (node instanceof HTMLElement) containers.add(node)
    }
    return Array.from(containers).map((container) => {
      const style = getComputedStyle(container)
      return {
        maxWidth: style.maxWidth,
        maxHeight: style.maxHeight,
        overflowY: style.overflowY,
        overflowX: style.overflowX,
      }
    })
  })

  expect(boxes).not.toBeNull()
  // Every chip must live in a bounded list; a chip with no scrollable ancestor would mean
  // an unbounded list slipped in.
  expect(boxes!.length).toBeGreaterThan(0)
  for (const box of boxes!) {
    // A concrete max-height plus vertical scrolling means a long list cannot grow the menu.
    expect(box.maxHeight).not.toBe('none')
    expect(box.overflowY).toBe('auto')
    // Width is capped and never produces a horizontal scrollbar; chips wrap instead.
    expect(box.overflowX).toBe('hidden')
    expect(box.maxWidth).not.toBe('none')
    expect(parseFloat(box.maxWidth)).toBeLessThanOrEqual(TAG_FLYOUT_WIDTH_PX)
  }
})

// Clicking a picker tag applies it — and because the picker lists only unapplied tags, the
// chip must move out of the picker and into the applied list.
test('picking a tag applies it and removes it from the picker', async ({ page }) => {
  await openTagsFlyout(page)

  // The vocabulary is purely usage-derived now, so a tag only stays offerable while some
  // OTHER entry still carries it. Commit a recipe holding the tag, then clear it from the
  // draft: the committed recipe keeps it in the vocabulary, and the draft no longer has it,
  // which is exactly the "offered but unapplied" state this test needs.
  const target = SEED_TAG
  await applyTagViaDraft(page, target)
  await page.keyboard.press('Escape')
  await page.getByRole('button', { name: /Add as New Recipe|Apply as Recipe/ }).first().click()
  await openTagsFlyout(page)
  await tagsFlyout(page).locator('.MuiChip-root', { hasText: target })
    .filter({ has: page.locator('.MuiChip-deleteIcon') })
    .first().locator('.MuiChip-deleteIcon').click()
  await expect(pickerChip(page, target).first())
    .toBeVisible({ timeout: PLAYWRIGHT_TIMEOUTS.expectDefault })

  await pickerChip(page, target).first().click()

  // It now renders as an applied chip (applied chips carry a delete icon).
  const appliedChip = tagsFlyout(page).locator('.MuiChip-root', { hasText: target })
    .filter({ has: page.locator('.MuiChip-deleteIcon') })
  await expect(appliedChip.first()).toBeVisible({ timeout: PLAYWRIGHT_TIMEOUTS.expectDefault })

  // ...and it is gone from the picker, since only unused tags are offered.
  await expect(pickerChip(page, target)).toHaveCount(0, { timeout: PLAYWRIGHT_TIMEOUTS.expectDefault })
})
