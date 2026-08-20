import { test, expect } from './fixtures'
import { APP_GOTO_OPTIONS, prepareApp } from './app-init'
import { dismissBlockingDialogs } from './dialog-helpers'
import { PLAYWRIGHT_TIMEOUTS } from './timeouts'
import { warmupAppShell } from './app-warmup'
import { APP_KNOWN_TAGS } from '../../src/lib/tagHelpers'
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

// The app-known tags must always be offered on an empty document — that is the whole point
// of seeding them into the vocabulary rather than only listing what the user already typed.
test('the tags picker offers every app-known tag on a fresh document', async ({ page }) => {
  await openTagsFlyout(page)
  for (const tag of APP_KNOWN_TAGS) {
    await expect(pickerChip(page, tag).first())
      .toBeVisible({ timeout: PLAYWRIGHT_TIMEOUTS.expectDefault })
  }
})

// The flyout must stay a predictable size regardless of how many tags exist: both the
// applied chip list and the picker are bounded and scroll instead of growing the popover.
test('the tags flyout stays bounded in both axes', async ({ page }) => {
  await openTagsFlyout(page)

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

  const target = APP_KNOWN_TAGS[0]!
  await pickerChip(page, target).first().click()

  // It now renders as an applied chip (applied chips carry a delete icon).
  const appliedChip = tagsFlyout(page).locator('.MuiChip-root', { hasText: target })
    .filter({ has: page.locator('.MuiChip-deleteIcon') })
  await expect(appliedChip.first()).toBeVisible({ timeout: PLAYWRIGHT_TIMEOUTS.expectDefault })

  // ...and it is gone from the picker, since only unused tags are offered.
  await expect(pickerChip(page, target)).toHaveCount(0, { timeout: PLAYWRIGHT_TIMEOUTS.expectDefault })
})
