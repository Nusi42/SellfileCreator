/**
 * midgame-progression.spec.ts
 *
 * Verifies that sell decisions follow the monotonic progression:
 *   Midgame ⊆ Lategame ⊆ Endgame
 *
 * Any item sold in an earlier tier must also be sold in every later tier.
 * Equivalently: later tiers may only add to the sell set, never remove from it.
 *
 * Run against all three example databases so coverage spans different account
 * inventories. Expects the EXAMPLE_NUSI_SFR_PATH fixture to include the Midgame,
 * Lategame, and Endgame recipe override checkboxes in example.sfr.
 */
import path from 'node:path'
import { type Browser, type Page } from '@playwright/test'
import { test, expect } from './fixtures'
import { APP_GOTO_OPTIONS, prepareApp } from './app-init'
import { NOTE_DIALOG_TITLES, NOTE_DIALOG_CLOSE_LABEL } from './dialog-helpers'
import { PLAYWRIGHT_TIMEOUTS } from './timeouts'
import { getWorkloadIndicator } from './workload-indicator'
import { EXAMPLE_NUSI_SFR_PATH } from './fixture-paths'
import { PREVIEW_PAPER_SELECTOR, SFR_LOAD_INPUT_SELECTOR } from './ui-selectors'
import { PREVIEW_MODE_STORAGE_KEY } from '../../src/lib/constants'

// Example database bundled in the repo for smoke coverage.
// account-d (68 MB) excluded: WASM eval takes 25–50 s under CI load, exceeding the
//   effective 30 s step budget (workloadIdle 15 s + waitForGearInspectorResults 15 s).
// account-c (34 MB) excluded for the same reason: 34 MB WASM takes 30–50 s under load,
//   which pushed the sequential 3× beforeAll past testXL in stress runs.
// account-b (26 MB) is the fastest DB and completes WASM reliably in < 25 s.
const EXAMPLES_DIR = path.resolve(process.cwd(), 'examples')
const SAMPLE_DBS = [
  { name: 'account-b', path: path.join(EXAMPLES_DIR, 'um85268209_RSLHelper.db') },
]

// Account levels ordered from most permissive (midgame) to most strict (endgame).
// Each item sold in an earlier tier must also be sold in every subsequent tier.
const ORDERED_MODES = ['Midgame', 'Lategame', 'Endgame'] as const
type Mode = (typeof ORDERED_MODES)[number]

type GearOutcomeRow = { id: number; outcome: string }
type ModeOutcomes = Record<Mode, GearOutcomeRow[]>

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Wait until at least one gear inspector card reports a keep/sell outcome. */
const waitForGearInspectorResults = async (page: Page): Promise<void> => {
  await page.waitForFunction(
    () => Array.from(document.querySelectorAll('[data-gear-inspector-grid-card="true"]'))
      .some((card) => {
        const outcome = card.getAttribute('data-match-outcome')
        return outcome === 'keep' || outcome === 'sell'
      }),
    undefined,
    { timeout: PLAYWRIGHT_TIMEOUTS.expectLong },
  )
}

/** Wait for the workload indicator to settle (appear then vanish, or never appear). */
const waitForWorkloadIdle = async (page: Page): Promise<void> => {
  const workload = getWorkloadIndicator(page)
  // Catching is intentional: the indicator may never appear on a cache-hit fast path.
  await workload.waitFor({ state: 'visible', timeout: PLAYWRIGHT_TIMEOUTS.expectDefault }).catch(() => undefined)
  await workload.waitFor({ state: 'hidden', timeout: PLAYWRIGHT_TIMEOUTS.workloadIdle }).catch(() => undefined)
}

/**
 * Wait until the gear-results-version advances past `versionBefore`.
 * This ensures the startTransition that commits new Gear Inspector rows has
 * been flushed to the DOM before the test reads match outcomes.
 */
const waitForResultsVersionChange = async (page: Page, versionBefore: string): Promise<void> => {
  await page.waitForFunction(
    ({ selector, before }: { selector: string; before: string }) => {
      const el = document.querySelector(selector)
      const current = el?.getAttribute('data-gear-results-version') ?? '0'
      return current !== before
    },
    { selector: PREVIEW_PAPER_SELECTOR, before: versionBefore },
    { timeout: PLAYWRIGHT_TIMEOUTS.expectLong },
  )
}

/** Snapshot all gear inspector card outcomes in current DOM order. */
const readGearInspectorSnapshot = async (page: Page): Promise<GearOutcomeRow[]> => (
  page.evaluate(() => (
    Array.from(document.querySelectorAll('[data-gear-inspector-grid-card="true"]')).map((card) => ({
      id: Number(card.getAttribute('data-row-id')),
      outcome: card.getAttribute('data-match-outcome') ?? 'unknown',
    }))
  ))
)

/**
 * Load the app in a fresh browser context, select the target mode in the
 * note dialog that auto-opens after SFR import, then load the DB and collect
 * gear inspector outcomes after the single WASM pass completes.
 *
 * Contexts run sequentially (not in parallel) so each WASM pass has full CPU
 * and stays within the 15 s per-step timeout. Running in parallel would cause
 * CPU contention that pushes WASM evaluation and SFR rendering past the budget.
 */
const collectOutcomesForMode = async (
  browser: Browser,
  mode: Mode,
  dbPath: string,
): Promise<GearOutcomeRow[]> => {
  const context = await browser.newContext()
  const page = await context.newPage()
  try {
    // Seed gear inspector preview mode before the app boots.
    await page.addInitScript(
      ({ previewKey, previewMode }: { previewKey: string; previewMode: string }) => {
        try { window.localStorage.setItem(previewKey, previewMode) } catch { /* ignore */ }
      },
      { previewKey: PREVIEW_MODE_STORAGE_KEY, previewMode: 'gearInspector' },
    )

    // Clear autosave and README/tutorial flags so the shell starts clean.
    await prepareApp(page)
    await page.goto('/', APP_GOTO_OPTIONS)

    // Load example.sfr — the note dialog auto-opens after import.
    const sfrInput = page.locator(SFR_LOAD_INPUT_SELECTOR).first()
    await sfrInput.waitFor({ state: 'attached', timeout: PLAYWRIGHT_TIMEOUTS.appGoto })
    await expect(sfrInput).toBeEnabled({ timeout: PLAYWRIGHT_TIMEOUTS.expectDefault })
    await sfrInput.setInputFiles(EXAMPLE_NUSI_SFR_PATH)

    // Use page.waitForFunction to find and click the mode checkbox in the note dialog.
    // Scanning inputs directly inside [role="dialog"] avoids Playwright locator
    // re-resolution, which times out when the DOM is in flux from 194-recipe SFR
    // processing. The function polls the raw DOM every ~100 ms; each retry is a fresh
    // synchronous scan that is immune to React element churn during active rendering.
    await page.waitForFunction(
      ({ modeLabel }: { modeLabel: string }) => {
        // Scan all open dialogs for a mode checkbox by label text.
        // Only the note dialog contains recipe-override checkboxes, so the first
        // matching input is always the intended target.
        const inputs = Array.from(
          document.querySelectorAll<HTMLInputElement>('[role="dialog"] input[type="checkbox"]'),
        )
        const target = inputs.find((input) => {
          // FormControlLabel renders as <label>...<input>...</label>; textContent
          // of the closest label or parent element includes the visible option text.
          const labelEl = input.closest('label') ?? input.parentElement
          return (labelEl?.textContent ?? '').toLowerCase().includes(modeLabel.toLowerCase())
        })
        if (!target) return false
        // Click if unchecked; returning true stops polling.
        if (!target.checked) target.click()
        return true
      },
      { modeLabel: mode },
      { timeout: PLAYWRIGHT_TIMEOUTS.expectLong },
    )

    // Close the dialog — checkbox click is done; SFR processing is settled so locators are stable.
    const noteDialog = page.getByRole('dialog', { name: NOTE_DIALOG_TITLES[0] })
      .or(page.getByRole('dialog', { name: NOTE_DIALOG_TITLES[1] }))
    const closeButton = noteDialog.getByRole('button', { name: NOTE_DIALOG_CLOSE_LABEL })
    await expect(closeButton).toBeVisible({ timeout: PLAYWRIGHT_TIMEOUTS.expectDefault })
    await closeButton.evaluate(
      (el: HTMLElement) => el.click(),
      undefined,
      { timeout: PLAYWRIGHT_TIMEOUTS.expectDefault },
    )
    // Firefox animates the dialog close; the animation itself can take several seconds.
    await noteDialog.waitFor({ state: 'hidden', timeout: PLAYWRIGHT_TIMEOUTS.expectLong })

    // Load the sample database now that the target mode is already set.
    const dbInput = page.locator('input[type="file"][accept*=".db"]').first()
    await dbInput.waitFor({ state: 'attached', timeout: PLAYWRIGHT_TIMEOUTS.appGoto })
    await expect(dbInput).toBeEnabled({ timeout: PLAYWRIGHT_TIMEOUTS.expectDefault })
    await dbInput.setInputFiles(dbPath)
    // DB load does not trigger any dialogs; no dismiss needed here.

    // Wait for the one-and-only WASM pass to finish.
    await waitForWorkloadIdle(page)
    await waitForGearInspectorResults(page)
    // Ensure the startTransition that commits new Gear Inspector rows has flushed to the DOM.
    // Without this, snapshots taken in Firefox may still reflect the pre-pipeline state
    // because the workload indicator hides synchronously before startTransition commits.
    await waitForResultsVersionChange(page, '0')

    // Await the snapshot explicitly so the finally block doesn't close the context
    // before the page.evaluate CDP response returns.
    const snapshot = await readGearInspectorSnapshot(page)
    return snapshot
  } finally {
    // Always close the context to free browser resources, even on error.
    // Catch in case the beforeAll timeout already disposed the context.
    await context.close().catch(() => undefined)
  }
}

/** Return the set of item IDs that were sold in the given snapshot. */
const soldSet = (rows: GearOutcomeRow[]): Set<number> => (
  new Set(rows.filter((r) => r.outcome === 'sell').map((r) => r.id))
)

// ── Tests ─────────────────────────────────────────────────────────────────────

// File-level warmup — runs once before any describe block in this file.
// Waits for the SFR input to attach (requires Vite compile + React mount), which
// guarantees a warm compile cache before the sequential pages start. Without this,
// the first page's sfrInput.waitFor can exceed appGoto (15 s) on a cold compile.
test.beforeAll(async ({ browser }) => {
  // 30 s covers a cold Vite first-compile; subsequent runs see a warm cache.
  test.setTimeout(PLAYWRIGHT_TIMEOUTS.testHeavy)
  const context = await browser.newContext()
  const warmupPage = await context.newPage()
  try {
    await prepareApp(warmupPage)
    await warmupPage.goto('/', APP_GOTO_OPTIONS)
    // Wait for the SFR file input — this element only attaches after Vite has compiled
    // all modules and React has fully mounted. catch so warmup stays best-effort.
    await warmupPage.locator(SFR_LOAD_INPUT_SELECTOR).first()
      .waitFor({ state: 'attached', timeout: PLAYWRIGHT_TIMEOUTS.expectLong })
      .catch(() => undefined)
  } finally {
    await context.close()
  }
})

for (const { name: dbName, path: dbPath } of SAMPLE_DBS) {
  // Shared store filled by beforeAll; one entry per mode.
  // Declared outside describe so it survives across the hook/test boundary.
  let outcomesByMode: ModeOutcomes

  test.describe(`account-level sell progression — ${dbName}`, () => {
    test.beforeAll(async ({ browser }) => {
      // Allow time for three sequential WASM passes, each in its own fresh context.
      // Contexts run one at a time so no CPU contention inflates step durations.
      // testXL (90 s) covers: 3 × (page boot ~2 s + SFR+dialog ~5 s + WASM ~10 s) with 2× CI load.
      test.setTimeout(PLAYWRIGHT_TIMEOUTS.testXL)

      // Collect outcomes for each mode in sequence — one fresh context per mode.
      // Sequential execution keeps each WASM pass within the 15 s step budget.
      const results: GearOutcomeRow[][] = []
      for (const mode of ORDERED_MODES) {
        results.push(await collectOutcomesForMode(browser, mode, dbPath))
      }
      outcomesByMode = Object.fromEntries(
        ORDERED_MODES.map((mode, i) => [mode, results[i]!]),
      ) as ModeOutcomes
    })

    test('midgame ⊆ lategame ⊆ endgame sell sets', () => {
      // All WASM work is done in beforeAll; this body is a pure in-memory comparison.
      for (let i = 0; i < ORDERED_MODES.length - 1; i += 1) {
        const earlier = ORDERED_MODES[i]!
        const later = ORDERED_MODES[i + 1]!
        const earlierSold = soldSet(outcomesByMode[earlier])
        const laterSold = soldSet(outcomesByMode[later])

        // Every item sold in the earlier (more permissive) tier must also be
        // sold in the later (stricter) tier. If an item is sold even when the
        // recipe is generous, it certainly cannot be kept when criteria tighten.
        const violations = [...earlierSold].filter((id) => !laterSold.has(id))
        if (violations.length > 0) {
          // Surface a representative sample to make failures actionable.
          const sample = violations.slice(0, 10).map((id) => {
            const eRow = outcomesByMode[earlier].find((r) => r.id === id)
            const lRow = outcomesByMode[later].find((r) => r.id === id)
            return `id=${id}: ${earlier}=${eRow?.outcome ?? '?'}, ${later}=${lRow?.outcome ?? '?'}`
          })
          throw new Error(
            `[${dbName}] ${violations.length} item(s) sold in ${earlier} but KEPT in ${later}.\n`
            + `First violations: ${sample.join(' | ')}`,
          )
        }
      }
    })
  })
}
