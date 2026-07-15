/* eslint import/no-unused-modules: off */
/**
 * override-churn-memory — reproduce the OOM the user hits WITHOUT any endpoint:
 * with real gear loaded (examples/um109288203_RSLHelper.db + presets/lategame.sfc),
 * rapidly flipping dynamic-override answers in the note dialog occasionally kills
 * the tab. Every flip changes the pipeline-cache key (it embeds the override
 * answers), so each one is a MISS that launches a full worker pipeline AND mints a
 * new heavy PipelineCacheEntry (processed rows + merged rules) — the suspected
 * accumulation path shared with the endpoint farm-run OOM.
 *
 * The spec cycles account modes + the keep-limited toggle with NO settle between
 * flips (matching "quickly changing"), sampling the precise main-isolate heap per
 * round via CDP so growth is visible even where performance.memory quantizes.
 */
import { test, expect } from './fixtures'
import { APP_GOTO_OPTIONS, prepareApp } from './app-init'
import { SFC_LOAD_INPUT_SELECTOR } from './ui-selectors'
import { dismissBlockingDialogs } from './dialog-helpers'
import { settleWorkload } from './workload-indicator'
import { openNoteDialog, setNoteOverrideCheckbox } from './note-overrides-helpers'
import { PLAYWRIGHT_TIMEOUTS } from './timeouts'
import { PRESET_LATEGAME_SFC_PATH, LARGE_ACCOUNT_DB_PATH } from './fixture-paths'
import { attachHeapMetrics, measureRetainedHeapMB, readPipelineStats } from './heap-metrics'

// Account-level modes exposed by lategame.sfc's questionnaire (see the fragmentation
// spec) — cycling them rewrites the active recipe set, i.e. a maximal pipeline change.
const ACCOUNT_MODES = ['Midgame', 'Lategame', 'Endgame', 'Endgame+'] as const
// Secondary boolean question so consecutive rounds never resolve to the same answers.
const KEEP_LIMITED_LABEL = 'Keep 5★ limited'
// Rounds of rapid churn; each round = 2 flips (mode + keep-limited) with no settle
// in between. 12 rounds ≈ 24 distinct pipeline launches — far past the 10-entry
// pipeline cache, so sustained growth beyond ~10 generations indicates a leak
// while plateau-at-cap indicates "cache retention is the ceiling".
const CHURN_ROUNDS = 12
// Retained-heap growth ceiling (MB above baseline, after forced GC — heap-metrics.ts).
// Override churn mints a DISTINCT generation per flip (elision cannot fire), so the
// 600 MiB pipeline-cache budget plus the live generation bound retention: the observed
// post-mitigation plateau is ~680 MB growth, flat from round 4 on. Pre-mitigation the
// unbounded 10-entry cache pushed peaks past +1.8 GB; 1200 MB (~1.8× the plateau)
// separates the regimes with CI-variance headroom.
const MAX_RETAINED_GROWTH_MB = 1200

test.describe('override-churn-memory', () => {
  test('rapid note-override churn does not grow the heap unboundedly', async ({ page }) => {
    // Dozens of flip+settle iterations over a 68 MB gear DB — sweep-class budget.
    test.setTimeout(PLAYWRIGHT_TIMEOUTS.testEndpointSweep)

    const pageErrors: string[] = []
    let crashed = false
    page.on('crash', () => { crashed = true })
    page.on('pageerror', (err) => { pageErrors.push(err.message) })
    // Mirror the app's own memory/pipeline diagnostics into the runner log.
    page.on('console', (msg) => {
      const text = msg.text()
      if (text.includes('[rule-cache-worker]') || text.includes('[pipeline-cache]') || text.includes('[mem-diag]')) {
        console.log(`[browser] ${text}`)
      }
    })

    await prepareApp(page)
    await page.goto('/', APP_GOTO_OPTIONS)
    // Retained-heap metrics (forced-GC CDP reads) — see heap-metrics.ts for why.
    const cdp = await attachHeapMetrics(page)

    // Load the lategame preset, dismiss the auto-opened note dialog, then the real gear DB.
    const sfcInput = page.locator(SFC_LOAD_INPUT_SELECTOR).first()
    await sfcInput.waitFor({ state: 'attached', timeout: PLAYWRIGHT_TIMEOUTS.appGoto })
    await sfcInput.setInputFiles(PRESET_LATEGAME_SFC_PATH)
    await dismissBlockingDialogs(page)
    await settleWorkload(page, PLAYWRIGHT_TIMEOUTS.testXL)

    const dbInput = page.locator('input[type="file"][accept*=".db"]').first()
    await dbInput.waitFor({ state: 'attached', timeout: PLAYWRIGHT_TIMEOUTS.appGoto })
    await dbInput.setInputFiles(LARGE_ACCOUNT_DB_PATH)
    await settleWorkload(page, PLAYWRIGHT_TIMEOUTS.testXL)

    // All churn happens inside the note dialog — open it once and keep it open,
    // exactly like the live repro (the user flips answers back-to-back).
    await openNoteDialog(page)

    const baselineMB = await measureRetainedHeapMB(cdp)
    console.log(`[override-churn] baseline retained heap=${baselineMB}MB`)
    const heapSeries: number[] = [baselineMB]

    for (let round = 1; round <= CHURN_ROUNDS; round++) {
      expect(crashed, `page crashed before round ${round}`).toBe(false)
      // Two back-to-back flips with NO settle between them — the "quickly changing"
      // part of the live repro: the second flip lands while the first pipeline runs.
      const mode = ACCOUNT_MODES[round % ACCOUNT_MODES.length]!
      await setNoteOverrideCheckbox(page, mode, true)
      await setNoteOverrideCheckbox(page, KEEP_LIMITED_LABEL, round % 2 === 0)
      // Settle only at the round boundary so the heap sample is comparable. Per-step
      // durations (settle vs CDP measure) stay in the log so a slow round names its
      // slow step — mirrors capture-replay-memory's diagnostics.
      const settleStart = Date.now()
      await settleWorkload(page, PLAYWRIGHT_TIMEOUTS.testXL)
      const settleMs = Date.now() - settleStart
      const measureStart = Date.now()
      const heapMB = await measureRetainedHeapMB(cdp)
      const measureMs = Date.now() - measureStart
      heapSeries.push(heapMB)
      const stats = await readPipelineStats(page)
      console.log(`[override-churn] round=${round}/${CHURN_ROUNDS} mode=${mode} retained=${heapMB}MB`
        + ` growth=${heapMB - baselineMB}MB pipeline=${stats ? `${stats.hits}h/${stats.misses}m` : 'n/a'}`
        + ` settleMs=${settleMs} measureMs=${measureMs}`)
      if (crashed) break
    }

    console.log(`[override-churn] retained series (MB): ${heapSeries.join(' → ')}`)
    expect(crashed, 'page crashed during override churn').toBe(false)
    expect(pageErrors, 'uncaught page errors during override churn').toHaveLength(0)

    // Regression gate: bounded retained growth (see pipeline-memory.md). Guarded on a
    // valid baseline so a metrics hiccup cannot flake the suite.
    const peakGrowthMB = Math.max(...heapSeries.filter((v) => v >= 0)) - baselineMB
    console.log(`[override-churn] peak retained growth=${peakGrowthMB}MB (limit ${MAX_RETAINED_GROWTH_MB}MB)`)
    if (baselineMB >= 0) {
      expect(
        peakGrowthMB,
        `retained heap grew ${peakGrowthMB}MB over ${CHURN_ROUNDS} churn rounds (limit ${MAX_RETAINED_GROWTH_MB}MB)`
        + ` — pipeline result retention is regressing (see pipeline-memory.md)`,
      ).toBeLessThanOrEqual(MAX_RETAINED_GROWTH_MB)
    }
  })
})
