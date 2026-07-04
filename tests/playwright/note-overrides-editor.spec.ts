/**
 * note-overrides-editor.spec.ts
 *
 * End-to-end coverage for the visual override-block editor: creating a new
 * `<!-- recipe-overrides -->` question from the note toolbar, re-editing it via
 * the card pencil (which also guards the delegated-reveal `closest('button')`
 * fix), and building an effect body through the structured rows.
 */
import type { Page } from '@playwright/test'
import { test, expect } from './fixtures'
import { APP_GOTO_OPTIONS, prepareApp } from './app-init'
import { PLAYWRIGHT_TIMEOUTS } from './timeouts'
import { warmupAppShell } from './app-warmup'
import { dismissBlockingDialogs } from './dialog-helpers'

const NOTE_TOGGLE_SELECTOR = '[data-tour-id="note.toggle"]'

// Open the note dialog (edit mode hosts the MDEditor split pane).
const openNoteEditor = async (page: Page): Promise<void> => {
  await page.locator(NOTE_TOGGLE_SELECTOR).click()
  const dialog = page.getByRole('dialog').first()
  await expect(dialog).toBeVisible({ timeout: PLAYWRIGHT_TIMEOUTS.expectLong })
  await expect(page.locator('.w-md-editor-text-input').first()).toBeVisible({ timeout: PLAYWRIGHT_TIMEOUTS.expectLong })
}

// Create one question ("Which tier?" / option "Casual") via the visual editor.
const createQuestionViaEditor = async (page: Page): Promise<void> => {
  await page.getByTestId('overrides-editor-create').click()
  await expect(page.getByTestId('overrides-editor-dialog')).toBeVisible({ timeout: PLAYWRIGHT_TIMEOUTS.expectDefault })
  await page.getByTestId('overrides-editor-prompt-base').fill('Which tier?')
  // Create mode auto-expands the single starter option.
  await page.getByTestId('overrides-editor-option-0-label-base').fill('Casual')
  await page.getByTestId('overrides-editor-apply').click()
  await expect(page.getByTestId('overrides-editor-dialog')).toBeHidden({ timeout: PLAYWRIGHT_TIMEOUTS.expectDefault })
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
  await openNoteEditor(page)
})

test('create flow inserts a recipe-overrides block and renders its card', async ({ page }) => {
  await createQuestionViaEditor(page)
  // Source pane gained the canonical DSL block.
  const source = await page.locator('.w-md-editor-text-input').first().inputValue()
  expect(source).toContain('<!-- recipe-overrides')
  expect(source).toContain('q "Which tier?"')
  expect(source).toContain('rb "Casual" * {}')
  // The edit-mode preview renders the question card with the new prompt.
  await expect(page.locator('.w-md-editor-preview [data-question-index]').first()).toContainText('Which tier?', { timeout: PLAYWRIGHT_TIMEOUTS.expectLong })
})

test('pencil reopens the editor (reveal guard) and label edits round-trip', async ({ page }) => {
  await createQuestionViaEditor(page)
  const card = page.locator('.w-md-editor-preview [data-question-index]').first()
  await expect(card).toBeVisible({ timeout: PLAYWRIGHT_TIMEOUTS.expectLong })
  // The pencil is a real <button>; the delegated reveal listeners must skip it
  // (closest('button') guard) so this click opens the editor instead of jumping.
  await card.getByTestId('overrides-editor-open').click()
  await expect(page.getByTestId('overrides-editor-dialog')).toBeVisible({ timeout: PLAYWRIGHT_TIMEOUTS.expectDefault })
  // The draft is populated from the source block.
  await expect(page.getByTestId('overrides-editor-prompt-base')).toHaveValue('Which tier?')
  // Expand the option accordion and rename the option.
  await page.getByTestId('overrides-editor-option-0').click()
  const label = page.getByTestId('overrides-editor-option-0-label-base')
  await expect(label).toBeVisible({ timeout: PLAYWRIGHT_TIMEOUTS.expectDefault })
  await label.fill('Hardcore')
  await page.getByTestId('overrides-editor-apply').click()
  await expect(page.getByTestId('overrides-editor-dialog')).toBeHidden({ timeout: PLAYWRIGHT_TIMEOUTS.expectDefault })
  const source = await page.locator('.w-md-editor-text-input').first().inputValue()
  expect(source).toContain('rb "Hardcore"')
  expect(source).not.toContain('rb "Casual"')
})

test('structured body builder adds an @all export=disabled effect', async ({ page }) => {
  await createQuestionViaEditor(page)
  const card = page.locator('.w-md-editor-preview [data-question-index]').first()
  await card.getByTestId('overrides-editor-open').click()
  await expect(page.getByTestId('overrides-editor-dialog')).toBeVisible({ timeout: PLAYWRIGHT_TIMEOUTS.expectDefault })
  await page.getByTestId('overrides-editor-option-0').click()
  // Add a rule block in the "while selected" section; the visual condition row
  // defaults to the "All rules" kind (selector `all`).
  await page.getByTestId('overrides-editor-add-block-blocks').click()
  await expect(page.getByTestId('overrides-editor-term-kind')).toBeVisible({ timeout: PLAYWRIGHT_TIMEOUTS.expectDefault })
  // Pick field `export` and value `disabled` — the dropdowns show the same
  // localized labels as the rest of the UI, while the DSL keeps its tokens.
  await page.getByTestId('overrides-editor-op-field').click()
  await page.getByRole('option', { name: 'Export', exact: true }).click()
  await page.getByTestId('overrides-editor-op-value-select').click()
  await page.getByRole('option', { name: 'Disabled', exact: true }).click()
  await page.getByTestId('overrides-editor-op-add').click()
  await page.getByTestId('overrides-editor-apply').click()
  await expect(page.getByTestId('overrides-editor-dialog')).toBeHidden({ timeout: PLAYWRIGHT_TIMEOUTS.expectDefault })
  const source = await page.locator('.w-md-editor-text-input').first().inputValue()
  expect(source).toContain('{ @all { export=disabled } }')
})
