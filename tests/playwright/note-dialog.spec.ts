import { test, expect } from './fixtures'
import { APP_GOTO_OPTIONS, prepareApp } from './app-init'
import { PLAYWRIGHT_TIMEOUTS } from './timeouts'
import { warmupAppShell } from './app-warmup'
import { dismissBlockingDialogs, NOTE_DIALOG_TITLES } from './dialog-helpers'
import { SFC_LOAD_INPUT_SELECTOR } from './ui-selectors'
import { PRESET_LATEGAME_SFC_PATH } from './fixture-paths'

const NOTE_TOGGLE_SELECTOR = '[data-tour-id="note.toggle"]'

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
})

test('NoteDialog opens with one of the expected titles', async ({ page }) => {
  await page.locator(NOTE_TOGGLE_SELECTOR).click()
  // The dialog title varies based on whether overrides are enabled.
  const dialog = page.getByRole('dialog').first()
  await expect(dialog).toBeVisible({ timeout: PLAYWRIGHT_TIMEOUTS.expectLong })
  const titleText = await dialog.locator('h2, [class*="DialogTitle"]').first().innerText()
  const titles = NOTE_DIALOG_TITLES as readonly string[]
  expect(titles.some((t) => titleText.includes(t))).toBe(true)
})

test('NoteDialog hosts the @uiw markdown editor', async ({ page }) => {
  await page.locator(NOTE_TOGGLE_SELECTOR).click()
  const dialog = page.getByRole('dialog').first()
  await expect(dialog).toBeVisible({ timeout: PLAYWRIGHT_TIMEOUTS.expectLong })
  // @uiw/react-md-editor renders a container with className containing "w-md-editor".
  await expect(dialog.locator('[class*="w-md-editor"]').first()).toBeVisible({ timeout: PLAYWRIGHT_TIMEOUTS.expectLong })
})

test('{set:Name} tokens render as icons in the note prose, not as raw braces', async ({ page }) => {
  // Regression: the prose renderer emits a `note-set-icon` custom element, but react-markdown's
  // allowElement gate only permits alphanumeric tag names plus an explicit whitelist. The hyphen
  // in the tag meant every prose icon was silently dropped while the two override cards (which
  // render through the prompt/label tokenizer, not markdown) still worked — so spot-checking the
  // cards alone would not have caught it.
  test.setTimeout(PLAYWRIGHT_TIMEOUTS.testLong)

  // The shipped lategame note is what carries {set:…} in its prose; the default empty note
  // has none. Loading it auto-opens the note dialog.
  const sfcInput = page.locator(SFC_LOAD_INPUT_SELECTOR).first()
  await sfcInput.waitFor({ state: 'attached', timeout: PLAYWRIGHT_TIMEOUTS.appGoto })
  await expect(sfcInput).toBeEnabled({ timeout: PLAYWRIGHT_TIMEOUTS.expectDefault })
  await sfcInput.setInputFiles(PRESET_LATEGAME_SFC_PATH)

  const dialog = page.getByRole('dialog').first()
  await expect(dialog).toBeVisible({ timeout: PLAYWRIGHT_TIMEOUTS.expectLong })

  // react-markdown swaps the custom tag for the component's OUTPUT, so the DOM carries the
  // rendered icon (an <img> alt-labelled with the set name), never a <note-set-icon> element.
  // A gear set named in the prose must therefore show up as such an image.
  const icon = dialog.getByRole('img', { name: 'Stoneskin' }).first()
  await expect(icon).toBeVisible({ timeout: PLAYWRIGHT_TIMEOUTS.expectLong })

  // No unexpanded token may survive anywhere in the dialog.
  await expect(dialog).not.toContainText('{set:')
})

test('{set:Name} runs sit on the surrounding text baseline', async ({ page }) => {
  // Regression: the icon+name run was wrapped in an inline-flex box using
  // `alignItems: center` + `verticalAlign: middle`, which centres the box on the line
  // instead of seating it on the baseline. Every set name rendered a fraction of a pixel
  // to two pixels off the text around it — subtle per word, obvious across a paragraph.
  test.setTimeout(PLAYWRIGHT_TIMEOUTS.testLong)

  const sfcInput = page.locator(SFC_LOAD_INPUT_SELECTOR).first()
  await sfcInput.waitFor({ state: 'attached', timeout: PLAYWRIGHT_TIMEOUTS.appGoto })
  await expect(sfcInput).toBeEnabled({ timeout: PLAYWRIGHT_TIMEOUTS.expectDefault })
  await sfcInput.setInputFiles(PRESET_LATEGAME_SFC_PATH)

  const dialog = page.getByRole('dialog').first()
  await expect(dialog.getByRole('img', { name: 'Stoneskin' }).first()).toBeVisible({ timeout: PLAYWRIGHT_TIMEOUTS.expectLong })

  // Compare the bottom edge (= baseline for a single-line run) of each set name against the
  // plain text immediately preceding it. Only pairs sharing a line box are comparable — a
  // run that wrapped sits a full line-height below its predecessor, which is not a defect.
  const measured = await dialog.evaluate((root) => {
    const range = document.createRange()
    const deltas: number[] = []
    for (const img of [...root.querySelectorAll('img[alt]')]) {
      const run = img.parentElement
      const prev = run?.previousSibling
      if (!run || !prev || prev.nodeType !== Node.TEXT_NODE || !(prev.textContent ?? '').trim()) continue
      range.selectNodeContents(prev)
      const plain = range.getBoundingClientRect()
      const nameNode = [...run.childNodes].reverse()
        .find((n) => n.nodeType === Node.TEXT_NODE && (n.textContent ?? '').trim())
      if (!nameNode) continue
      range.selectNodeContents(nameNode)
      const name = range.getBoundingClientRect()
      if (Math.abs(name.top - plain.top) > 6) continue
      deltas.push(Math.abs(name.bottom - plain.bottom))
    }
    return { count: deltas.length, worst: Math.max(0, ...deltas) }
  })

  // The shipped note names sets in prose often enough that a few pairs always qualify.
  expect(measured.count).toBeGreaterThan(4)
  // Sub-pixel tolerance: identical baselines measure exactly 0, and the pre-fix code
  // measured 0.09–2.03px off, so this cleanly separates correct from regressed.
  expect(measured.worst).toBeLessThan(0.05)
})
