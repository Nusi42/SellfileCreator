/**
 * midgame-progression.spec.ts
 *
 * Verifies that sell decisions follow the monotonic progression:
 *   Midgame ⊆ Lategame ⊆ Endgame ⊆ Endgame+
 *
 * Any item sold in an earlier tier must also be sold in every later tier.
 * Equivalently: later tiers may only add to the sell set, never remove from it.
 *
 * Run against all three example databases so coverage spans different account
 * inventories. Expects the EXAMPLE_NUSI_SFR_PATH fixture to include the Midgame
 * option added in example.sfr.
 */
import path from 'node:path'
import { test, expect } from './fixtures'
import { APP_GOTO_OPTIONS, prepareApp } from './app-init'
import { dismissBlockingDialogs, NOTE_DIALOG_TITLES, NOTE_DIALOG_CLOSE_LABEL } from './dialog-helpers'
import { PLAYWRIGHT_TIMEOUTS } from './timeouts'
import { getWorkloadIndicator } from './workload-indicator'
import { warmupAppShell } from './app-warmup'
import { EXAMPLE_NUSI_SFR_PATH } from './fixture-paths'
import { SFR_LOAD_INPUT_SELECTOR } from './ui-selectors'
import { PREVIEW_MODE_STORAGE_KEY } from '../../src/lib/constants'

// Example databases bundled in the repo for smoke coverage.
const EXAMPLES_DIR = path.resolve(process.cwd(), 'examples')
const SAMPLE_DBS = [
  { name: 'account-c', path: path.join(EXAMPLES_DIR, 'um53210834_RSLHelper.db') },
  { name: 'account-b', path: path.join(EXAMPLES_DIR, 'um85268209_RSLHelper.db') },
  { name: 'account-d', path: path.join(EXAMPLES_DIR, 'um109288203_RSLHelper.db') },
]

// Account levels ordered from most permissive (midgame) to most strict (endgame+).
// Each item sold in an earlier tier must also be sold in every subsequent tier.
const ORDERED_MODES = ['Midgame', 'Lategame', 'Endgame', 'Endgame+'] as const
type Mode = (typeof ORDERED_MODES)[number]

type GearOutcomeRow = { id: number; outcome: string }
type ModeOutcomes = Record<Mode, GearOutcomeRow[]>

// ── Helpers ───────────────────────────────────────────────────────────────────

// Large example DBs can take 30–60 s to fully evaluate under WASM.
const LARGE_DB_TIMEOUT_MS = 90_000

/** Wait until at least one gear inspector card reports a keep/sell outcome. */
const waitForGearInspectorResults = async (page: Parameters<typeof test>[0]['page']): Promise<void> => {
  await page.waitForFunction(
    () => Array.from(document.querySelectorAll('[data-gear-inspector-grid-card="true"]'))
      .some((card) => {
        const outcome = card.getAttribute('data-match-outcome')
        return outcome === 'keep' || outcome === 'sell'
      }),
    undefined,
    { timeout: LARGE_DB_TIMEOUT_MS },
  )
}

/** Wait for the workload indicator to settle (appear then vanish, or never appear). */
const waitForWorkloadIdle = async (page: Parameters<typeof test>[0]['page']): Promise<void> => {
  const workload = getWorkloadIndicator(page)
  await workload.waitFor({ state: 'visible', timeout: PLAYWRIGHT_TIMEOUTS.expectDefault }).catch(() => undefined)
  await workload.waitFor({ state: 'hidden', timeout: LARGE_DB_TIMEOUT_MS }).catch(() => undefined)
}

/** Snapshot all gear inspector card outcomes in current DOM order. */
const readGearInspectorSnapshot = async (page: Parameters<typeof test>[0]['page']): Promise<GearOutcomeRow[]> => (
  page.evaluate(() => (
    Array.from(document.querySelectorAll('[data-gear-inspector-grid-card="true"]')).map((card) => ({
      id: Number(card.getAttribute('data-row-id')),
      outcome: card.getAttribute('data-match-outcome') ?? 'unknown',
    }))
  ))
)

/**
 * Open the Note dialog in view mode, select the given mode option, then close
 * and wait for the rule build + gear inspector evaluation to settle.
 */
const activateMode = async (page: Parameters<typeof test>[0]['page'], mode: Mode): Promise<void> => {
  // Wait for any workload to idle so the note button is not covered by a progress overlay.
  await waitForWorkloadIdle(page)
  // Open the Note dialog in view mode (the note.toggle button).
  // Use force:true because a matcher overlay can intercept pointer events while WASM is running.
  await page.locator('[data-tour-id="note.toggle"]').click({ force: true, timeout: LARGE_DB_TIMEOUT_MS })

  // Accept either dialog title variant ("Note & Recipe Overrides" or just "Note").
  const noteDialog = page.getByRole('dialog', { name: NOTE_DIALOG_TITLES[0] })
    .or(page.getByRole('dialog', { name: NOTE_DIALOG_TITLES[1] }))
  await noteDialog.waitFor({ state: 'visible', timeout: PLAYWRIGHT_TIMEOUTS.expectLong })

  // Escape "Endgame+" for use in a regex without misinterpreting "+".
  const modePattern = new RegExp(mode.replace('+', '\\+'), 'i')
  // In view mode recipeOverridesEditable=true so checkboxes are interactive.
  const checkbox = noteDialog.getByRole('checkbox', { name: modePattern }).first()
  await expect(checkbox).toBeVisible({ timeout: PLAYWRIGHT_TIMEOUTS.expectDefault })
  // Use force:true so a WASM progress overlay does not block the click.
  await checkbox.check({ force: true, timeout: LARGE_DB_TIMEOUT_MS })

  // Close the dialog to unblock rule building.
  await noteDialog.getByRole('button', { name: NOTE_DIALOG_CLOSE_LABEL }).click({ timeout: LARGE_DB_TIMEOUT_MS })
  await noteDialog.waitFor({ state: 'hidden', timeout: PLAYWRIGHT_TIMEOUTS.expectDefault })

  // Wait for the rule build workload to finish before reading outcomes.
  await waitForWorkloadIdle(page)
  // Wait for gear inspector results to reflect the new mode.
  await waitForGearInspectorResults(page)
}

/** Return the set of item IDs that were sold in the given snapshot. */
const soldSet = (rows: GearOutcomeRow[]): Set<number> => (
  new Set(rows.filter((r) => r.outcome === 'sell').map((r) => r.id))
)

// ── Tests ─────────────────────────────────────────────────────────────────────

for (const { name: dbName, path: dbPath } of SAMPLE_DBS) {
  test.describe(`account-level sell progression — ${dbName}`, () => {
    test.beforeAll(async ({ browser }) => {
      // Allow warmup to compile Vite before DB-heavy tests run.
      test.setTimeout(PLAYWRIGHT_TIMEOUTS.testHeavy)
      await warmupAppShell(browser)
    })

    test('midgame ⊆ lategame ⊆ endgame ⊆ endgame+ sell sets', async ({ page }) => {
      // Large DBs + 4 matcher runs per test need a generous budget.
      test.setTimeout(180_000)

      // Pre-seed gear inspector preview mode before the app boots.
      await page.addInitScript(
        ({ previewKey, previewMode }: { previewKey: string; previewMode: string }) => {
          try { window.localStorage.setItem(previewKey, previewMode) } catch { /* ignore */ }
        },
        { previewKey: PREVIEW_MODE_STORAGE_KEY, previewMode: 'gearInspector' },
      )

      // Clear autosave and README/tutorial flags so the shell starts clean.
      await prepareApp(page)
      await page.goto('/', APP_GOTO_OPTIONS)
      await dismissBlockingDialogs(page)

      // ── Load example.sfr ────────────────────────────────────────────────────
      const sfrInput = page.locator(SFR_LOAD_INPUT_SELECTOR).first()
      await sfrInput.waitFor({ state: 'attached', timeout: PLAYWRIGHT_TIMEOUTS.appGoto })
      await expect(sfrInput).toBeEnabled({ timeout: PLAYWRIGHT_TIMEOUTS.expectDefault })
      await sfrInput.setInputFiles(EXAMPLE_NUSI_SFR_PATH)
      // Auto-opened Note dialog and restore prompts may appear after import.
      await dismissBlockingDialogs(page)

      // ── Load sample database ─────────────────────────────────────────────
      const dbInput = page.locator('input[type="file"][accept*=".db"]').first()
      await dbInput.waitFor({ state: 'attached', timeout: PLAYWRIGHT_TIMEOUTS.appGoto })
      await expect(dbInput).toBeEnabled({ timeout: PLAYWRIGHT_TIMEOUTS.expectDefault })
      await dbInput.setInputFiles(dbPath)
      await dismissBlockingDialogs(page)

      // Wait for the initial rule build to finish and gear inspector to evaluate (Lategame default).
      await waitForWorkloadIdle(page)
      await waitForGearInspectorResults(page)

      // ── Collect outcomes per mode ────────────────────────────────────────
      const outcomesByMode = {} as ModeOutcomes
      for (const mode of ORDERED_MODES) {
        await activateMode(page, mode)
        outcomesByMode[mode] = await readGearInspectorSnapshot(page)
      }

      // ── Verify monotonic sell progression ────────────────────────────────
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
