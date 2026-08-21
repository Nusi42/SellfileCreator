/**
 * gold-skin-previews.spec.ts — screenshot generator, NOT a regression test.
 *
 * Captures every major UI surface (main screens, dialogs, tabs, context menus, flyouts,
 * tooltips) in all three color schemes (dark / light / RSLH) for visual review of the gold
 * skin. Gated behind CAPTURE_PREVIEWS=1 so ordinary suite runs skip it entirely.
 *
 *   PowerShell:  $env:CAPTURE_PREVIEWS='1'; npx playwright test --project=chromium-fhd gold-skin-previews
 *
 * The chromium-fhd project supplies the 1920×1080 client resolution. Output lands in
 * previews/gold-skin/<scheme>/NN-surface.png (untracked). Optional surfaces are captured
 * best-effort: a missing trigger logs a skip instead of failing the run.
 */
import fs from 'node:fs'
import path from 'node:path'
// Plain @playwright/test (not ./fixtures): the fixture only adds console mirroring, which
// would flood a capture run's output without adding value to screenshots.
import { test, expect } from '@playwright/test'
import { APP_GOTO_OPTIONS, prepareApp } from './app-init'
import { PLAYWRIGHT_TIMEOUTS } from './timeouts'
import { dismissBlockingDialogs } from './dialog-helpers'
import { openContextMenu, closeContextMenu } from './context-menu'
import { settleWorkload } from './workload-indicator'
import { ensureGearInspectorMode } from './gear-inspector-mode'
import { SFC_LOAD_INPUT_SELECTOR, SUBSTAT_TARGETS_BUTTON_SELECTOR, NOTE_TOGGLE_SELECTOR } from './ui-selectors'
import { SAMPLE_SMALL_SFC_PATH, SAMPLE_SMALL_DB_PATH } from './fixture-paths'
import { RSLH_ENABLED_KEY, THEME_MODE_KEY } from '../../src/lib/constants'

const CAPTURE_ENABLED = process.env.CAPTURE_PREVIEWS === '1'
// The three UI-level schemes. RSLH = MUI dark + the RSLH preset flag (see themeModePreference).
const SCHEMES = ['dark', 'light', 'rslh'] as const

const OUTPUT_ROOT = path.resolve(process.cwd(), 'previews', 'gold-skin')

// Tooltip captures must outlast MarkdownTooltip's hover-intent delay (500 ms informational /
// 1000 ms click targets) — two menu budgets cover the slowest one with headroom.
const TOOLTIP_DWELL_MS = PLAYWRIGHT_TIMEOUTS.uiMenu * 2

for (const scheme of SCHEMES) {
  test(`capture gold-skin previews — ${scheme}`, async ({ page }) => {
    test.skip(!CAPTURE_ENABLED, 'Preview capture runs only with CAPTURE_PREVIEWS=1')
    // One scheme walks ~19 surfaces incl. two WASM pipeline loads (SFC + gear DB).
    test.setTimeout(PLAYWRIGHT_TIMEOUTS.testXL)

    const dir = path.join(OUTPUT_ROOT, scheme)
    fs.mkdirSync(dir, { recursive: true })
    const captured: string[] = []
    const skipped: string[] = []

    const shot = async (name: string): Promise<void> => {
      await page.screenshot({ path: path.join(dir, `${name}.png`) })
      captured.push(name)
    }
    // Optional-surface wrapper: a missing trigger is a logged skip, not a failure — the run
    // should always deliver the surfaces it CAN reach.
    const tryStep = async (name: string, fn: () => Promise<void>): Promise<void> => {
      try {
        await fn()
      } catch (error) {
        skipped.push(`${name}: ${error instanceof Error ? error.message.split('\n').slice(0, 6).join(' | ') : String(error)}`)
        // A failed step can leave a menu/dialog open — sweep before the next surface.
        await page.keyboard.press('Escape').catch(() => undefined)
      }
    }

    await prepareApp(page)
    // Scheme selection before first paint: MUI reads the mode key synchronously; RSLH is the
    // separate boolean flag layered on the dark base.
    await page.addInitScript(
      ({ modeKey, rslhKey, mode, rslh }) => {
        try {
          window.localStorage.setItem(modeKey, mode)
          window.localStorage.setItem(rslhKey, rslh)
        } catch { /* localStorage unavailable */ }
      },
      {
        modeKey: THEME_MODE_KEY,
        rslhKey: RSLH_ENABLED_KEY,
        mode: scheme === 'light' ? 'light' : 'dark',
        rslh: scheme === 'rslh' ? 'true' : 'false',
      },
    )
    await page.goto('/', APP_GOTO_OPTIONS)
    await expect(page.getByRole('button', { name: 'Recipe Builder' })).toBeVisible({ timeout: PLAYWRIGHT_TIMEOUTS.expectLong })
    await dismissBlockingDialogs(page)

    // ── Populate: sample SFC (recipes + rules table) then sample gear DB (inspector data). ──
    await page.locator(SFC_LOAD_INPUT_SELECTOR).setInputFiles(SAMPLE_SMALL_SFC_PATH)
    await settleWorkload(page)
    await dismissBlockingDialogs(page)
    const dbInput = page.locator('input[type="file"][accept*=".db"]').first()
    await dbInput.waitFor({ state: 'attached', timeout: PLAYWRIGHT_TIMEOUTS.appGoto })
    await dbInput.setInputFiles(SAMPLE_SMALL_DB_PATH)
    await settleWorkload(page)
    await dismissBlockingDialogs(page)

    // Builder-mode switcher: several surfaces (recipe chips, Tools button) only exist in
    // Recipe Builder mode, and the mode buttons' accessible names can match more than one
    // element mid-flow — pin to the pressed-state toggle and verify the switch landed.
    const switchBuilderMode = async (label: 'Recipe Builder' | 'Safeguard Builder'): Promise<void> => {
      // No `exact`: the toggles' accessible names include their rule-count badges.
      const toggle = page.getByRole('button', { name: new RegExp(`^${label}`) }).first()
      if ((await toggle.getAttribute('aria-pressed')) !== 'true') await toggle.click()
      await expect(toggle).toHaveAttribute('aria-pressed', 'true', { timeout: PLAYWRIGHT_TIMEOUTS.expectDefault })
    }

    // ── Main screens ──
    await shot('01-main-recipe-builder')

    await tryStep('02-tooltip', async () => {
      await page.locator(SUBSTAT_TARGETS_BUTTON_SELECTOR).hover()
      await page.waitForTimeout(TOOLTIP_DWELL_MS)
      await expect(page.getByRole('tooltip').first()).toBeVisible({ timeout: PLAYWRIGHT_TIMEOUTS.uiPopover })
      await shot('02-tooltip')
      await page.mouse.move(0, 0)
    })

    // ── Recipe chip context menu + a confirm dialog reached from it (needs recipe mode). ──
    await tryStep('04-recipe-context-menu', async () => {
      const chip = page.locator('[data-recipe-chip-index]').first()
      const menu = await openContextMenu(page, chip)
      await shot('04-recipe-context-menu')
      await tryStep('05-confirm-delete-recipe', async () => {
        await menu.getByRole('menuitem', { name: /delete/i }).first().click()
        const confirm = page.getByRole('dialog')
        await expect(confirm).toBeVisible({ timeout: PLAYWRIGHT_TIMEOUTS.uiPopover })
        await shot('05-confirm-delete-recipe')
        await confirm.getByRole('button', { name: /cancel/i }).first().click()
      })
      await closeContextMenu(page)
    })

    await tryStep('03-safeguard-builder', async () => {
      await switchBuilderMode('Safeguard Builder')
      await shot('03-safeguard-builder')
    })
    // Back to recipe mode unconditionally — everything below assumes the recipe surfaces.
    await tryStep('mode-restore', async () => { await switchBuilderMode('Recipe Builder') })

    await tryStep('06-filter-panel', async () => {
      const filterButton = page.getByRole('button', { name: 'Filter' }).first()
      await filterButton.click()
      await shot('06-filter-panel')
      await filterButton.click()
    })

    // ── Gear Inspector grid + sort popout, then back to the rules table header menu. ──
    await tryStep('07-gear-inspector-grid', async () => {
      await ensureGearInspectorMode(page)
      await settleWorkload(page)
      await shot('07-gear-inspector-grid')
      await tryStep('08-sort-popout', async () => {
        await page.getByRole('button', { name: /sort/i }).first().click()
        await page.waitForTimeout(PLAYWRIGHT_TIMEOUTS.uiQuick)
        await shot('08-sort-popout')
        await page.keyboard.press('Escape')
      })
      await page.getByRole('button', { name: 'Sellfile Preview' }).click()
      await settleWorkload(page)
    })

    await tryStep('09-rules-header-menu', async () => {
      const headerCell = page.locator('[data-tour-id="preview.paper"] th').first()
      const menu = await openContextMenu(page, headerCell)
      await shot('09-rules-header-menu')
      await closeContextMenu(page, { menu })
    })

    // ── Tools (LogicHub) dialog — all five tabs. ──
    await tryStep('tools-tabs', async () => {
      // dispatchEvent, not a pointer click: the Tools button can carry a WAAPI attention
      // pulse (immune to the CSS animation kill), so Playwright's stability check never
      // passes and a forced coordinate click can land on the moving frame's old position.
      await page.locator(SUBSTAT_TARGETS_BUTTON_SELECTOR).dispatchEvent('click')
      const dialog = page.getByRole('dialog', { name: 'Tools' })
      await expect(dialog).toBeVisible({ timeout: PLAYWRIGHT_TIMEOUTS.expectLong })
      const tabs: Array<[string, string]> = [
        ['10-tools-final-sell', 'Final Sell'],
        ['11-tools-substat-targets', 'Substat Targets'],
        ['12-tools-custom-gear', 'Custom Gear'],
        ['13-tools-dungeon-sim', 'Dungeon Drops Simulator'],
        ['14-tools-gear-analytics', 'Gear Analytics'],
      ]
      for (const [name, tabLabel] of tabs) {
        await tryStep(name, async () => {
          await dialog.getByRole('tab', { name: tabLabel }).click()
          // Charts and grids mount after the tab switch; give the surface one settle pass.
          await settleWorkload(page)
          await shot(name)
        })
      }
      await page.keyboard.press('Escape')
      await expect(dialog).toBeHidden({ timeout: PLAYWRIGHT_TIMEOUTS.expectDefault })
    })

    // ── Help dialog, theme editor flyout, Manage Colors dialog. ──
    await tryStep('15-help-dialog', async () => {
      await page.getByRole('button', { name: 'Help / README' }).click()
      // The dialog itself carries no stable accessible name — match the first open dialog.
      const help = page.getByRole('dialog').first()
      await expect(help).toBeVisible({ timeout: PLAYWRIGHT_TIMEOUTS.expectLong })
      await shot('15-help-dialog')
      await tryStep('16-theme-editor', async () => {
        await help.getByRole('button', { name: 'Sellfile Creator & Theme Settings' }).click()
        await expect(page.getByRole('menu').first()).toBeVisible({ timeout: PLAYWRIGHT_TIMEOUTS.uiMenu })
        await shot('16-theme-editor')
        await tryStep('17-manage-colors', async () => {
          await page.getByRole('button', { name: 'Manage Colors' }).first().click()
          await page.waitForTimeout(PLAYWRIGHT_TIMEOUTS.uiQuick)
          await shot('17-manage-colors')
          await page.keyboard.press('Escape')
        })
        await page.keyboard.press('Escape')
      })
      await page.keyboard.press('Escape')
      await expect(help).toBeHidden({ timeout: PLAYWRIGHT_TIMEOUTS.expectDefault })
    })

    // ── Metasets dialog (trigger lives in the builder's Sets area). ──
    await tryStep('18-metasets-dialog', async () => {
      await page.getByRole('button', { name: /Manage Metasets/ }).first().click()
      await expect(page.getByRole('dialog', { name: /Metasets/ })).toBeVisible({ timeout: PLAYWRIGHT_TIMEOUTS.uiPopover })
      await shot('18-metasets-dialog')
      await page.keyboard.press('Escape')
    })

    // ── Note dialog. ──
    await tryStep('19-note-dialog', async () => {
      await page.locator(NOTE_TOGGLE_SELECTOR).click()
      await expect(page.getByRole('dialog').first()).toBeVisible({ timeout: PLAYWRIGHT_TIMEOUTS.expectLong })
      await shot('19-note-dialog')
      await page.keyboard.press('Escape')
    })

    // Summary for the console — the run is useful even with skips, but they must be visible.
    console.log(`[gold-skin-previews:${scheme}] captured ${captured.length}: ${captured.join(', ')}`)
    if (skipped.length > 0) console.log(`[gold-skin-previews:${scheme}] skipped ${skipped.length}:\n  - ${skipped.join('\n  - ')}`)
    // Hard floor: the always-reachable core surfaces must have landed.
    expect(captured.length).toBeGreaterThanOrEqual(10)
  })
}
