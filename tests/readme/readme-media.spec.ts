/* eslint import/no-unused-modules: off */
/**
 * readme-media — records the images on the repository's front page (`npm run readme:media`).
 *
 * Runs under playwright.readme.config.ts, which builds with the asset pack (the game's icons, as
 * players see the app; README_PLACEHOLDERS=1 records placeholders). Input is the shipped lategame preset and
 * the `sample` gear-DB fixture (game data only, no player identity). Outputs:
 *   docs/readme/overview-dark.png, docs/readme/overview-light.png   stills (both colour schemes)
 *   docs/readme/note-dark.png, docs/readme/note-light.png           the preset's note dialog
 *   tmp/readme-media/frames/*.png + frames.json                      animation frames, encoded into
 *                                                                    docs/readme/demo.gif by
 *                                                                    scripts/readme/encode-gif.mjs
 * Re-run after UI changes; the recording is deterministic apart from timing.
 */
import fs from 'node:fs'
import path from 'node:path'
import { test, type Page } from '@playwright/test'
import { APP_GOTO_OPTIONS, prepareApp } from '../playwright/app-init'
import { SFC_LOAD_INPUT_SELECTOR } from '../playwright/ui-selectors'
import { dismissBlockingDialogs } from '../playwright/dialog-helpers'
import { settleWorkload } from '../playwright/workload-indicator'
import { PLAYWRIGHT_TIMEOUTS } from '../playwright/timeouts'
import { PRESET_LATEGAME_SFC_PATH, SAMPLE_DB_PATH } from '../playwright/fixture-paths'
import { ensureGearInspectorMode } from '../playwright/gear-inspector-mode'
import { THEME_MODE_KEY } from '../../src/lib/constants'

const README_DIR = path.resolve('docs/readme')
const FRAMES_DIR = path.resolve('tmp/readme-media/frames')

// A small drawn pointer that follows the real mouse, so recordings show where the action is.
// Pure DOM overlay: pointer-events none, above everything, never part of the app.
const POINTER_SCRIPT = `
  window.addEventListener('DOMContentLoaded', () => {
    const el = document.createElement('div')
    el.id = '__readme_pointer'
    el.style.cssText = 'position:fixed;left:0;top:0;width:22px;height:22px;z-index:2147483647;pointer-events:none;transform:translate(-100px,-100px);transition:none'
    el.innerHTML = '<svg width="22" height="22" viewBox="0 0 22 22"><path d="M2 1 L2 18 L6.5 13.5 L9.5 20.5 L12.5 19.2 L9.6 12.3 L16 12.3 Z" fill="#ffffff" stroke="#111111" stroke-width="1.4" stroke-linejoin="round"/></svg>'
    document.body.appendChild(el)
    window.addEventListener('mousemove', (e) => { el.style.transform = 'translate(' + e.clientX + 'px,' + e.clientY + 'px)' }, true)
  })
`

// Boot the app in `scheme` with the preset and the sample gear loaded, ready for capture.
async function loadSample(page: Page, scheme: 'dark' | 'light'): Promise<void> {
  await prepareApp(page)
  // The app keeps its own theme choice (it does not follow the OS scheme): seed it.
  await page.addInitScript(([key, value]) => { window.localStorage.setItem(key, value) }, [THEME_MODE_KEY, scheme] as const)
  await page.addInitScript(POINTER_SCRIPT)
  await page.goto('/', APP_GOTO_OPTIONS)
  const sfcInput = page.locator(SFC_LOAD_INPUT_SELECTOR).first()
  await sfcInput.waitFor({ state: 'attached', timeout: PLAYWRIGHT_TIMEOUTS.appGoto })
  await sfcInput.setInputFiles(PRESET_LATEGAME_SFC_PATH)
  await dismissBlockingDialogs(page)
  await settleWorkload(page)
  await page.locator('input[type="file"][accept*=".db"]').first().setInputFiles(SAMPLE_DB_PATH)
  await dismissBlockingDialogs(page)
  await settleWorkload(page)
  // Park the pointer off the content for stills.
  await page.mouse.move(1400, 840)
}

// Frame recorder: screenshots with their real spacing, so the GIF plays at natural speed.
function recorder(page: Page) {
  fs.rmSync(FRAMES_DIR, { recursive: true, force: true })
  fs.mkdirSync(FRAMES_DIR, { recursive: true })
  const frames: Array<{ file: string; at: number }> = []
  const start = Date.now()
  const snap = async (): Promise<void> => {
    const file = `f${String(frames.length).padStart(4, '0')}.png`
    await page.screenshot({ path: path.join(FRAMES_DIR, file) })
    frames.push({ file, at: Date.now() - start })
  }
  return {
    snap,
    // Hold the current picture for `ms` (one frame; the encoder turns the gap into a delay).
    async hold(ms: number) { await snap(); await page.waitForTimeout(ms) },
    // Glide the pointer to (x, y), recording along the way.
    async glide(x: number, y: number, steps = 8) {
      const from = await page.evaluate(() => {
        const t = document.getElementById('__readme_pointer')?.style.transform.match(/-?[\d.]+/g)?.map(Number) ?? [0, 0]
        return { x: t[0] ?? 0, y: t[1] ?? 0 }
      })
      for (let i = 1; i <= steps; i++) {
        await page.mouse.move(from.x + ((x - from.x) * i) / steps, from.y + ((y - from.y) * i) / steps)
        if (i % 2 === 0 || i === steps) await snap()
      }
    },
    finish() { fs.writeFileSync(path.join(FRAMES_DIR, 'frames.json'), JSON.stringify({ frames, end: Date.now() - start })) },
  }
}

// Centre of a locator's box (for pointer glides).
async function centre(page: Page, selector: ReturnType<Page['locator']>): Promise<{ x: number; y: number }> {
  const box = await selector.boundingBox()
  if (!box) throw new Error('element has no box')
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 }
}

for (const scheme of ['dark', 'light'] as const) {
  test(`overview still (${scheme})`, async ({ browser }) => {
    test.setTimeout(PLAYWRIGHT_TIMEOUTS.testXL)
    const context = await browser.newContext({ colorScheme: scheme, viewport: { width: 1440, height: 860 } })
    const page = await context.newPage()
    await loadSample(page, scheme)
    await ensureGearInspectorMode(page)
    await settleWorkload(page)
    // Stills show no pointer.
    await page.evaluate(() => { document.getElementById("__readme_pointer")?.remove() })
    fs.mkdirSync(README_DIR, { recursive: true })
    await page.screenshot({ path: path.join(README_DIR, `overview-${scheme}.png`) })
    await context.close()
  })
}

for (const scheme of ['dark', 'light'] as const) {
  test(`note dialog still (${scheme})`, async ({ browser }) => {
    test.setTimeout(PLAYWRIGHT_TIMEOUTS.testXL)
    const context = await browser.newContext({ colorScheme: scheme, viewport: { width: 1440, height: 860 } })
    const page = await context.newPage()
    await loadSample(page, scheme)
    // The preset's note: its guide text plus the dynamic overrides that tailor the rules.
    await page.getByRole('button', { name: /Note & Dynamic Overrides/i }).click()
    await page.getByRole('dialog').first().waitFor({ state: 'visible' })
    await settleWorkload(page)
    await page.evaluate(() => { document.getElementById('__readme_pointer')?.remove() })
    await page.screenshot({ path: path.join(README_DIR, `note-${scheme}.png`) })
    await context.close()
  })
}

test('demo animation frames', async ({ browser }) => {
  test.setTimeout(PLAYWRIGHT_TIMEOUTS.testXL)
  const context = await browser.newContext({ colorScheme: 'dark', viewport: { width: 1280, height: 760 } })
  const page = await context.newPage()
  await loadSample(page, 'dark')
  // Loading gear opens the Gear Inspector; start the story from the rule preview instead.
  await page.getByRole('button', { name: /Sellfile Preview/i }).click()
  await settleWorkload(page)
  const rec = recorder(page)
  await page.mouse.move(980, 420)
  await rec.hold(900)
  // 1. The preview lists every rule the recipes compile to.
  const previewRows = page.locator('[data-testid="hsf-rules-table"], table').first()
  await previewRows.waitFor({ state: 'visible' }).catch(() => undefined)
  await page.mouse.wheel(0, 500)
  await rec.hold(500)
  await rec.hold(700)
  // 2. Switch to the Gear Inspector: every piece of the inventory, judged keep or sell.
  const inspectorTab = page.getByRole('button', { name: /Gear Inspector/i })
  const tab = await centre(page, inspectorTab)
  await rec.glide(tab.x, tab.y)
  await inspectorTab.click()
  await settleWorkload(page)
  await rec.hold(900)
  await rec.hold(800)
  // 3. Browse the cards.
  await rec.glide(1000, 360)
  for (let i = 0; i < 4; i++) { await page.mouse.wheel(0, 220); await page.waitForTimeout(150); await rec.snap() }
  await rec.hold(900)
  // 4. Back in the builder: pick a recipe from the list; the builder loads it for editing.
  const recipe = page.getByText(/Low Rank\/Rarity/).first()
  const r = await centre(page, recipe)
  await rec.glide(r.x, r.y)
  await recipe.click()
  await settleWorkload(page)
  await rec.hold(1000)
  await rec.hold(1200)
  rec.finish()
  await context.close()
})
