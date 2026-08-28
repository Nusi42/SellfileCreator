/**
 * note-overrides-preset-file.spec.ts
 *
 * End-to-end cover for the Dynamic Overrides menu's file backup: exporting every
 * saved override set to a JSON document and importing that document back. The unit
 * tests own the file format and merge rules; this spec owns the parts only the real
 * UI can prove — that the menu entries exist in BOTH the normal (view) menu and the
 * express simple-mode menu, that Export actually produces a download, that
 * re-importing that download changes nothing, and that a set which shares a name but
 * differs in content still imports beside the original.
 */
import { test, expect, type Page } from './fixtures'
import { APP_GOTO_OPTIONS, prepareApp } from './app-init'
import { PLAYWRIGHT_TIMEOUTS } from './timeouts'
import { warmupAppShell } from './app-warmup'
import { dismissBlockingDialogs } from './dialog-helpers'
import { SFC_LOAD_INPUT_SELECTOR } from './ui-selectors'
import { PRESET_LATEGAME_SFC_PATH } from './fixture-paths'
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'

// Menu labels come from the English catalog — the specs run against en-US.
const MENU_BUTTON = 'Dynamic Overrides'
const SAVE_AS_ENTRY = 'Save Current Selection...'
const EXPORT_ENTRY = 'Export All to File...'
const IMPORT_ENTRY = 'Import from File...'

test.beforeAll(async ({ browser }) => {
  test.setTimeout(PLAYWRIGHT_TIMEOUTS.testLong)
  await warmupAppShell(browser)
})

/**
 * Load the shipped lategame preset so the note carries override questions — the
 * menu button only renders when the note actually has override markers.
 */
const loadLategameNote = async (page: Page): Promise<void> => {
  const sfcInput = page.locator(SFC_LOAD_INPUT_SELECTOR).first()
  await sfcInput.waitFor({ state: 'attached', timeout: PLAYWRIGHT_TIMEOUTS.appGoto })
  await expect(sfcInput).toBeEnabled({ timeout: PLAYWRIGHT_TIMEOUTS.expectDefault })
  await sfcInput.setInputFiles(PRESET_LATEGAME_SFC_PATH)
}

/**
 * The note dialog itself. Scoping every lookup to it matters: the app header
 * carries its own "Dynamic Overrides" toggle button, so an unscoped locator
 * resolves to the header control hidden behind the dialog.
 */
const noteDialog = (page: Page) => page.getByRole('dialog').filter({ has: page.locator('#note-dialog-title') }).first()

/** Open the Dynamic Overrides menu from whichever dialog surface is showing. */
const openOverridesMenu = async (page: Page) => {
  await noteDialog(page).getByRole('button', { name: MENU_BUTTON, exact: true }).first().click()
  const menu = page.getByRole('menu').first()
  await expect(menu).toBeVisible({ timeout: PLAYWRIGHT_TIMEOUTS.expectDefault })
  return menu
}

/** Save the current selection under a name, so there is something to export. */
const saveOverrideSet = async (page: Page, name: string): Promise<void> => {
  const menu = await openOverridesMenu(page)
  await menu.getByRole('menuitem', { name: SAVE_AS_ENTRY }).click()
  const nameField = page.getByLabel('Set name')
  await expect(nameField).toBeVisible({ timeout: PLAYWRIGHT_TIMEOUTS.expectDefault })
  await nameField.fill(name)
  await page.getByRole('button', { name: 'Save', exact: true }).click()
  await expect(nameField).toBeHidden({ timeout: PLAYWRIGHT_TIMEOUTS.expectDefault })
}

test.describe('normal mode', () => {
  test.beforeEach(async ({ page }) => {
    test.setTimeout(PLAYWRIGHT_TIMEOUTS.testLong)
    await prepareApp(page)
    await page.goto('/', APP_GOTO_OPTIONS)
    await expect(page.getByRole('button', { name: 'Recipe Builder' })).toBeVisible({ timeout: PLAYWRIGHT_TIMEOUTS.expectLong })
    await dismissBlockingDialogs(page)
    await loadLategameNote(page)
    // Loading the preset auto-opens the note dialog with the note already in it. Waiting
    // on the overrides button (rather than clicking the header toggle) is what keeps this
    // off the empty-editor race: the button only renders once the note carries markers.
    await expect(noteDialog(page).getByRole('button', { name: MENU_BUTTON, exact: true }).first())
      .toBeVisible({ timeout: PLAYWRIGHT_TIMEOUTS.expectLong })
  })

  test('the menu offers both file-backup entries', async ({ page }) => {
    const menu = await openOverridesMenu(page)
    await expect(menu.getByRole('menuitem', { name: EXPORT_ENTRY })).toBeVisible()
    await expect(menu.getByRole('menuitem', { name: IMPORT_ENTRY })).toBeVisible()
  })

  test('Export is disabled until a set exists, then enabled', async ({ page }) => {
    // Nothing saved yet: exporting an empty list would produce a useless file.
    let menu = await openOverridesMenu(page)
    await expect(menu.getByRole('menuitem', { name: EXPORT_ENTRY })).toHaveAttribute('aria-disabled', 'true')
    await page.keyboard.press('Escape')

    await saveOverrideSet(page, 'Backup Me')
    menu = await openOverridesMenu(page)
    await expect(menu.getByRole('menuitem', { name: EXPORT_ENTRY })).not.toHaveAttribute('aria-disabled', 'true')
  })

  test('a saved set exports to a file, and re-importing it is a no-op', async ({ page }) => {
    await saveOverrideSet(page, 'Backup Me')

    // Export: the menu entry must trigger a real download with the expected filename shape.
    const menu = await openOverridesMenu(page)
    const downloadPromise = page.waitForEvent('download', { timeout: PLAYWRIGHT_TIMEOUTS.expectLong })
    await menu.getByRole('menuitem', { name: EXPORT_ENTRY }).click()
    const download = await downloadPromise
    expect(download.suggestedFilename()).toMatch(/^SellfileCreatorOverrideSets_\d{8}_\d{4}\.json$/)
    const exported = await download.path()
    expect(exported).toBeTruthy()

    // Import the very file we just wrote. Its only set is an exact duplicate of what
    // is already saved, so nothing should be added — no "(2)" copy.
    const importMenu = await openOverridesMenu(page)
    await importMenu.getByRole('menuitem', { name: IMPORT_ENTRY }).click()
    await page.locator('input[type="file"][accept*="json"]').first().setInputFiles(exported!)

    await expect(page.getByText('Override Sets Imported')).toBeVisible({ timeout: PLAYWRIGHT_TIMEOUTS.expectLong })
    await expect(page.getByText('Nothing new to add', { exact: false })).toBeVisible()
    await page.getByRole('button', { name: 'Close' }).last().click()

    // Exactly one row remains — the original, un-suffixed.
    const afterMenu = await openOverridesMenu(page)
    await expect(afterMenu.getByText('Backup Me', { exact: true })).toHaveCount(1)
    await expect(afterMenu.getByText('Backup Me (2)', { exact: true })).toHaveCount(0)
  })

  test('a file whose set differs in content imports beside the original', async ({ page }) => {
    await saveOverrideSet(page, 'Backup Me')

    const menu = await openOverridesMenu(page)
    const downloadPromise = page.waitForEvent('download', { timeout: PLAYWRIGHT_TIMEOUTS.expectLong })
    await menu.getByRole('menuitem', { name: EXPORT_ENTRY }).click()
    const exported = await (await downloadPromise).path()

    // Rewrite the exported document so the set keeps its name but carries a different
    // answer. That makes it a genuinely different set, which must NOT be de-duplicated.
    const doc = JSON.parse(readFileSync(exported!, 'utf8')) as { presets: Array<{ recipeAnswers: Record<string, string[]> }> }
    doc.presets[0]!.recipeAnswers = { __spec_only_question: ['spec-only-answer'] }
    const altered = join(dirname(exported!), 'altered-override-sets.json')
    writeFileSync(altered, JSON.stringify(doc), 'utf8')

    const importMenu = await openOverridesMenu(page)
    await importMenu.getByRole('menuitem', { name: IMPORT_ENTRY }).click()
    await page.locator('input[type="file"][accept*="json"]').first().setInputFiles(altered)

    await expect(page.getByText('Added 1 override set(s).')).toBeVisible({ timeout: PLAYWRIGHT_TIMEOUTS.expectLong })
    await page.getByRole('button', { name: 'Close' }).last().click()

    // Both rows are present: the original and the renamed import.
    const afterMenu = await openOverridesMenu(page)
    await expect(afterMenu.getByText('Backup Me', { exact: true })).toHaveCount(1)
    await expect(afterMenu.getByText('Backup Me (2)', { exact: true })).toHaveCount(1)
  })

  test('importing a file that is not an override-set document is refused', async ({ page }) => {
    const menu = await openOverridesMenu(page)
    await menu.getByRole('menuitem', { name: IMPORT_ENTRY }).click()
    // Feed it the SFC preset: valid JSON, but not an override-set document.
    await page.locator('input[type="file"][accept*="json"]').first().setInputFiles(PRESET_LATEGAME_SFC_PATH)
    await expect(page.getByText('Import Failed')).toBeVisible({ timeout: PLAYWRIGHT_TIMEOUTS.expectLong })
  })
})

test.describe('simple mode', () => {
  test('the express-mode menu offers the same file-backup entries', async ({ page }) => {
    test.setTimeout(PLAYWRIGHT_TIMEOUTS.testLong)
    await prepareApp(page)
    // ?simple is what puts the app into the express single-dialog view.
    await page.goto('/?simple', APP_GOTO_OPTIONS)
    await dismissBlockingDialogs(page)
    await loadLategameNote(page)
    await expect(noteDialog(page).getByRole('button', { name: MENU_BUTTON, exact: true }).first())
      .toBeVisible({ timeout: PLAYWRIGHT_TIMEOUTS.expectLong })

    const menu = await openOverridesMenu(page)
    await expect(menu.getByRole('menuitem', { name: EXPORT_ENTRY })).toBeVisible()
    await expect(menu.getByRole('menuitem', { name: IMPORT_ENTRY })).toBeVisible()
  })
})
