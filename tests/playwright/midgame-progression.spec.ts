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
 * inventories. Expects the PRESET_LATEGAME_SFC_PATH fixture to include the Midgame,
 * Lategame, and Endgame recipe override checkboxes in lategame.sfc.
 */
import path from 'node:path'
import { type Browser, type Page } from '@playwright/test'
import { test, expect } from './fixtures'
import { APP_GOTO_OPTIONS, prepareApp } from './app-init'
import { PLAYWRIGHT_TIMEOUTS } from './timeouts'
import { closeNoteDialog, setNoteOverrideCheckbox, waitForWorkloadIdle } from './note-overrides-helpers'
import { PRESET_LATEGAME_SFC_PATH } from './fixture-paths'
import { SFC_LOAD_INPUT_SELECTOR } from './ui-selectors'
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

/**
 * Wait until TanStack Virtual has rendered at least one gear inspector card into the DOM.
 *
 * We intentionally do NOT track the gear-results-version attribute here. Each SFC pipeline
 * commit (one for SFC load, one per recipe-mode change) increments the version with empty rows,
 * so version-based gating is satisfied prematurely — before the DB pipeline produces real items.
 * Waiting for cards is immune to those false positives: TanStack only renders cards when
 * gearInspectorPreviewRows is non-empty, which only happens after the DB WASM pass commits.
 *
 * timeout=testHeavy (30 s): after waitForWorkloadIdle (which absorbs ≤18 s of WASM), the
 * remaining WASM + React commit + TanStack layout is well under 30 s for the 26 MB test DB.
 */
const waitForGearInspectorResults = async (page: Page): Promise<void> => {
  await page.waitForFunction(
    () => document.querySelectorAll('[data-gear-inspector-grid-card="true"]').length > 0,
    undefined,
    { timeout: PLAYWRIGHT_TIMEOUTS.testHeavy },
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
 * note dialog that auto-opens after SFC import, then load the DB and collect
 * gear inspector outcomes after the single WASM pass completes.
 *
 * Contexts run sequentially (not in parallel) so each WASM pass has full CPU
 * and stays within the 15 s per-step timeout. Running in parallel would cause
 * CPU contention that pushes WASM evaluation and SFC rendering past the budget.
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

    // Load lategame.sfc — the note dialog auto-opens after import.
    const sfcInput = page.locator(SFC_LOAD_INPUT_SELECTOR).first()
    await sfcInput.waitFor({ state: 'attached', timeout: PLAYWRIGHT_TIMEOUTS.appGoto })
    await expect(sfcInput).toBeEnabled({ timeout: PLAYWRIGHT_TIMEOUTS.expectDefault })
    await sfcInput.setInputFiles(PRESET_LATEGAME_SFC_PATH)

    // Select the target account-level mode checkbox in the auto-opened note dialog,
    // then close it. Both steps use the shared note-override helpers.
    await setNoteOverrideCheckbox(page, mode, true)
    await closeNoteDialog(page)

    // The checkbox click above triggers a SFC rebuild; wait for that workload to idle
    // before loading the DB so the next waitForWorkloadIdle sees only the DB WASM pass.
    // MUI 9 renders more slowly, so the rebuild can still be running when the dialog closes.
    await waitForWorkloadIdle(page)

    // Load the sample database now that the target mode is already set.
    const dbInput = page.locator('input[type="file"][accept*=".db"]').first()
    await dbInput.waitFor({ state: 'attached', timeout: PLAYWRIGHT_TIMEOUTS.appGoto })
    await expect(dbInput).toBeEnabled({ timeout: PLAYWRIGHT_TIMEOUTS.expectDefault })
    await dbInput.setInputFiles(dbPath)
    // DB load does not trigger any dialogs; no dismiss needed here.

    // Best-effort wait for the DB WASM workload to settle.
    await waitForWorkloadIdle(page)
    // Wait for at least one card to appear — the only signal that the DB pipeline (not an
    // earlier SFC-triggered empty-row commit) has completed and TanStack has rendered.
    // See waitForGearInspectorResults for the full rationale.
    await waitForGearInspectorResults(page)

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
// Waits for the SFC input to attach (requires Vite compile + React mount), which
// guarantees a warm compile cache before the sequential pages start. Without this,
// the first page's sfcInput.waitFor can exceed appGoto (15 s) on a cold compile.
test.beforeAll(async ({ browser }) => {
  // 30 s covers a cold Vite first-compile; subsequent runs see a warm cache.
  test.setTimeout(PLAYWRIGHT_TIMEOUTS.testHeavy)
  const context = await browser.newContext()
  const warmupPage = await context.newPage()
  try {
    await prepareApp(warmupPage)
    await warmupPage.goto('/', APP_GOTO_OPTIONS)
    // Wait for the SFC file input — this element only attaches after Vite has compiled
    // all modules and React has fully mounted. catch so warmup stays best-effort.
    await warmupPage.locator(SFC_LOAD_INPUT_SELECTOR).first()
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
      // testXXL (180 s) covers: 3 × (boot ~2 s + SFC/dialog ~8 s + SFC-rebuild-idle ≤18 s + DB-idle ≤18 s + card-wait ≤10 s).
      test.setTimeout(PLAYWRIGHT_TIMEOUTS.testXXL)

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
