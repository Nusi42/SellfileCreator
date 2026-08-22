import { test, expect } from './fixtures'
import { APP_GOTO_OPTIONS, prepareApp } from './app-init'
import { PLAYWRIGHT_TIMEOUTS } from './timeouts'
import { SAMPLE_SFC_PATH } from './fixture-paths'
import { SFC_LOAD_INPUT_SELECTOR } from './ui-selectors'
import { RULES_TABLE_COLUMNS_STORAGE_KEY } from '../../src/state/rulesTableColumnsPreference'

/**
 * Regression guard: the preview table must scroll far enough right to fully reveal its last
 * column.
 *
 * The table container previously reserved an inline scrollbar gutter (`scrollbar-gutter:
 * stable both-edges`). That gutter is padding INSIDE the scroll port, so the table — sized to
 * 100% of the padded content box — stayed narrower than the port while the scroll range was
 * still measured against the full width. Scrolling fully right therefore left the rightmost
 * column clipped by roughly the gutter width.
 */
test('preview table scrolls far enough right to fully reveal the last column', async ({ page }) => {
  test.setTimeout(PLAYWRIGHT_TIMEOUTS.testHeavy)
  await prepareApp(page)
  // Seed an over-wide column BEFORE the app boots, so the table definitely overflows
  // horizontally on first render rather than depending on the viewport size.
  await page.addInitScript(({ key }) => {
    window.localStorage.setItem(key, JSON.stringify([
      { key: 'Idx', width: 76, visible: true },
      { key: 'RecipeIdx', width: 59, visible: true },
      { key: 'ArtifactSetNames', width: 140, visible: true },
      { key: 'ArtifactTypeNames', width: 90, visible: true },
      { key: 'RankRarity', width: 160, visible: true },
      { key: 'MainStatName', width: 76, visible: true },
      { key: 'LevelLabel', width: 78, visible: true },
      { key: 'SubstatsSummary', width: 1400, visible: true },
    ]))
  }, { key: RULES_TABLE_COLUMNS_STORAGE_KEY })
  await page.goto('/', APP_GOTO_OPTIONS)
  // First-run/restore overlays are environment-dependent; dismiss them if present.
  try { await page.getByRole('button', { name: 'Dismiss' }).first().click({ timeout: PLAYWRIGHT_TIMEOUTS.uiQuick }) } catch {}
  try { await page.getByRole('button', { name: 'Close' }).first().click({ timeout: PLAYWRIGHT_TIMEOUTS.uiQuick }) } catch {}

  const sfcInput = page.locator(SFC_LOAD_INPUT_SELECTOR).first()
  await sfcInput.setInputFiles(SAMPLE_SFC_PATH, { timeout: PLAYWRIGHT_TIMEOUTS.expectLong })
  // The note dialog auto-opens after import and would sit over the table.
  try { await page.getByRole('button', { name: 'Close' }).first().click({ timeout: PLAYWRIGHT_TIMEOUTS.uiPopover }) } catch {}
  await expect(page.locator('tbody tr').first()).toBeVisible({ timeout: PLAYWRIGHT_TIMEOUTS.expectLong })

  const geometry = await page.evaluate(() => {
    const el = document.querySelector('.MuiTableContainer-root') as HTMLElement | null
    if (!el) return null
    // Drive the scroller to its far right, the position the bug made insufficient.
    el.scrollLeft = el.scrollWidth
    const headers = Array.from(el.querySelectorAll('thead th')) as HTMLElement[]
    const last = headers[headers.length - 1]
    if (!last) return null
    const portRect = el.getBoundingClientRect()
    const lastRect = last.getBoundingClientRect()
    return {
      overflows: el.scrollWidth > el.clientWidth,
      // Positive means the last column's right edge is still beyond the visible port.
      overhangPx: Math.round(lastRect.right - portRect.right),
    }
  })

  // Guard the premise: without overflow the assertion below would pass vacuously.
  expect(geometry?.overflows).toBe(true)
  // Sub-pixel rounding is tolerable; the bug produced a gutter-sized overhang (~10-16px).
  expect(geometry?.overhangPx).toBeLessThanOrEqual(1)
})
