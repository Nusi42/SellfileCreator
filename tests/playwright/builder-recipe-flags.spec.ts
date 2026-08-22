import { test, expect } from './fixtures'
import { APP_GOTO_OPTIONS, prepareApp } from './app-init'
import { dismissBlockingDialogs } from './dialog-helpers'
import { PLAYWRIGHT_TIMEOUTS } from './timeouts'
import { warmupAppShell } from './app-warmup'

// The two recipe behaviour flags used to be "magic" tags the app searched for inside the
// user's tag list. They are explicit fields now, surfaced as a glyph-chip group beside the
// Tags button. These tests pin the UI contract: the chips exist, they toggle, and the two
// rework chips stay mutually exclusive (they read one tri-state field, so selecting one
// must clear the other — there is no state in which both read as on).

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

// Each chip is glyph-only, so its accessible name is the full label from the catalog.
const flagChip = (page: import('@playwright/test').Page, label: string) =>
  page.getByRole('button', { name: label, exact: true }).first()

const IGNORED = 'Not counted by safeguards'
const REWORKED = 'Only reworked gear'
const NOT_REWORKED = 'Only not-reworked gear'

test('the recipe builder shows the behaviour-flag chips', async ({ page }) => {
  // All three chips render, under their own caption, next to the Tags button.
  await expect(page.getByText('Flags:', { exact: true }).first())
    .toBeVisible({ timeout: PLAYWRIGHT_TIMEOUTS.expectDefault })
  for (const label of [IGNORED, REWORKED, NOT_REWORKED]) {
    await expect(flagChip(page, label)).toBeVisible({ timeout: PLAYWRIGHT_TIMEOUTS.expectDefault })
  }
  // A fresh recipe has neither flag set, so every chip starts off.
  for (const label of [IGNORED, REWORKED, NOT_REWORKED]) {
    await expect(flagChip(page, label)).toHaveAttribute('aria-pressed', 'false')
  }
})

test('the safeguard-ignore flag toggles on and back off', async ({ page }) => {
  const chip = flagChip(page, IGNORED)
  await chip.click()
  await expect(chip).toHaveAttribute('aria-pressed', 'true')
  // Clicking again clears it, so the flag is omitted from the saved recipe.
  await chip.click()
  await expect(chip).toHaveAttribute('aria-pressed', 'false')
})

test('the two rework chips are mutually exclusive', async ({ page }) => {
  const reworked = flagChip(page, REWORKED)
  const notReworked = flagChip(page, NOT_REWORKED)

  await reworked.click()
  await expect(reworked).toHaveAttribute('aria-pressed', 'true')
  await expect(notReworked).toHaveAttribute('aria-pressed', 'false')

  // Selecting the opposite state must clear the first — the field is tri-state, so
  // "both on" is unrepresentable rather than merely discouraged.
  await notReworked.click()
  await expect(notReworked).toHaveAttribute('aria-pressed', 'true')
  await expect(reworked).toHaveAttribute('aria-pressed', 'false')

  // Clicking the active chip clears the gate entirely (back to "any rework state").
  await notReworked.click()
  await expect(notReworked).toHaveAttribute('aria-pressed', 'false')
  await expect(reworked).toHaveAttribute('aria-pressed', 'false')
})

test('the recipe chip shows a glyph per active flag', async ({ page }) => {
  // The chips list visualizes the flags the same way the safeguard chips visualize their
  // ignore flags: glyphs appended to the Keep/Sell badge. Builder edits stay a draft until
  // applied, so each recipe below is committed with its flags already set.
  const addRecipe = () => page.getByRole('button', { name: /Add as New Recipe|Apply as Recipe/ }).first().click()

  // A recipe with no flags keeps the badge exactly as it was before the flags existed.
  await addRecipe()
  const firstChip = page.getByText(/^1\.\s*Keep/).first()
  await expect(firstChip).toBeVisible({ timeout: PLAYWRIGHT_TIMEOUTS.expectDefault })
  await expect(firstChip).toHaveText(/^1\.\s*Keep\s*\|/)

  // Both flags set on one recipe render both glyphs, in chip order, inside the badge.
  await flagChip(page, IGNORED).click()
  await flagChip(page, NOT_REWORKED).click()
  await addRecipe()
  await expect(firstChip).toContainText('⊘', { timeout: PLAYWRIGHT_TIMEOUTS.expectDefault })
  await expect(firstChip).toContainText('⊙', { timeout: PLAYWRIGHT_TIMEOUTS.expectDefault })

  // Switching the gate swaps the glyph rather than adding a second one — the two rework
  // states share one tri-state field, so only ever one rework glyph can show.
  await flagChip(page, REWORKED).click()
  await addRecipe()
  await expect(firstChip).toContainText('⟳', { timeout: PLAYWRIGHT_TIMEOUTS.expectDefault })
  await expect(firstChip).not.toContainText('⊙')

  // Clearing every flag returns the badge to its unflagged form.
  await flagChip(page, IGNORED).click()
  await flagChip(page, REWORKED).click()
  await addRecipe()
  await expect(firstChip).toHaveText(/^1\.\s*Keep\s*\|/, { timeout: PLAYWRIGHT_TIMEOUTS.expectDefault })
})

test('the rework flag is independent of the safeguard-ignore flag', async ({ page }) => {
  // The two flags are orthogonal: one changes which gear a recipe matches, the other
  // changes whether safeguards count that match.
  await flagChip(page, IGNORED).click()
  await flagChip(page, REWORKED).click()
  await expect(flagChip(page, IGNORED)).toHaveAttribute('aria-pressed', 'true')
  await expect(flagChip(page, REWORKED)).toHaveAttribute('aria-pressed', 'true')
})
