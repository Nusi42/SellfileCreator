/* eslint import/no-unused-modules: off */
import fs from 'node:fs'
import type { WebSocketRoute } from '@playwright/test'
import { test, expect } from './fixtures'
import { APP_GOTO_OPTIONS, prepareApp } from './app-init'
import { SFC_LOAD_INPUT_SELECTOR } from './ui-selectors'
import { dismissBlockingDialogs } from './dialog-helpers'
import { settleWorkload } from './workload-indicator'
import { PLAYWRIGHT_TIMEOUTS } from './timeouts'
import { BINARY_MEMORY_ROUNDS } from './iteration-counts'
import { PRESET_LATEGAME_SFC_PATH, LARGE_ACCOUNT_DB_PATH } from './fixture-paths'

// RSL Helper default WebSocket endpoint.
const ENDPOINT_URL = 'ws://localhost:8080/'
// Rapid burst: send this many binary DB pushes before waiting for settle.
// Mimics the crash scenario: several pushes arrive while the WASM worker is still running.
const RAPID_BURST_COUNT = 4
// Total rounds of rapid bursts; each round = RAPID_BURST_COUNT binary pushes.
// Comes from the shared dev/release split (E2E_FULL): short in dev, full for release.
const TOTAL_ROUNDS = BINARY_MEMORY_ROUNDS
// Max allowed heap growth (MB) over all rounds before the test fails.
// Set to 4 × db-file-size so normal peak usage is tolerated but sustained
// accumulation (each round adding another full copy) causes a failure.
const MAX_GROWTH_MB_PER_DB_SIZE_FACTOR = 4
// Floor for the growth budget: now that the fixture ships in RSL Helper's slimmed
// format (no ChampOverviewImage blobs, ~1.4 MB), 4 × file-size would be an
// unrealistically tight ~6 MB — below the WASM pipeline's fixed per-burst overhead,
// which is dominated by the rule engine / sql.js working set, not the file size.
// 16 MB keeps the leak detector meaningful while tolerating that fixed cost.
const MIN_GROWTH_FLOOR_MB = 16

/**
 * Returns the V8 heap used (MB) as reported by performance.memory.
 * Includes ArrayBuffer-backed memory (WASM linear pages, sql.js, etc.).
 * Returns -1 when performance.memory is unavailable (non-Chromium builds).
 */
async function measureHeapMB(page: Parameters<typeof expect>[0] & { evaluate: (fn: () => number) => Promise<number> }): Promise<number> {
  try {
    // performance.memory is Chromium-specific; absence is not an error.
    return await (page as { evaluate: (fn: () => number) => Promise<number> }).evaluate(() => {
      const mem = (performance as { memory?: { usedJSHeapSize: number } }).memory
      return mem ? Math.round(mem.usedJSHeapSize / 1024 / 1024) : -1
    })
  } catch {
    return -1
  }
}

test.describe('binary-endpoint-memory', () => {
  /**
   * Sends the RSLHelper.db binary file repeatedly via the secondary
   * `gearDbFileBinary` WebSocket path, in rapid bursts.  Measures JS heap
   * (including WASM / ArrayBuffer memory) before and after each burst to confirm
   * that each import cycle does not leave a permanent residue.
   *
   * NOTE: this is NOT how RSL Helper pushes updates — it streams JSON-RPC parts
   * (artifacts / champions / inboxArtifacts / lastUsed, see docs/orig/sampleLog/),
   * never a complete binary DB.  The binary path is a separate direct-load ingest
   * that still needs leak coverage; it drives the same downstream WASM pipeline.
   *
   * If Chrome crashes or heap grows without bound, the leak is confirmed.
   */
  test('binary db push does not leak memory across repeated bursts', async ({ page }) => {
    // TOTAL_ROUNDS × RAPID_BURST_COUNT pushes, settled per round; shared burst token.
    test.setTimeout(PLAYWRIGHT_TIMEOUTS.testEndpointBurst)

    // The fixture already ships in RSL Helper's slimmed format (~1.4 MB, no
    // ChampOverviewImage blobs), so the base64-encoded WebSocket frame stays well
    // under Chrome's ~120 MB CDP message threshold without any in-memory trimming.
    const dbBuffer = fs.readFileSync(LARGE_ACCOUNT_DB_PATH)
    const dbSizeMB = Math.ceil(dbBuffer.length / 1024 / 1024)

    // Accumulate diagnostics so they appear together in the test report.
    const pageErrors: string[] = []
    let crashed = false
    page.on('crash', () => { crashed = true })
    page.on('pageerror', (err) => { pageErrors.push(err.message) })

    // Mirror [mem-diag] console output from the browser into the test runner log.
    page.on('console', (msg) => {
      const text = msg.text()
      if (
        text.includes('[mem-diag]')
        || text.includes('[endpoint-queue]')
        || text.includes('[rule-cache-worker]')
        || text.includes('[ws-binary]')
      ) {
        console.log(`[browser] ${msg.type()}: ${text}`)
      }
    })

    // Intercept the endpoint WebSocket; discard outbound messages (e.g. uploadSellfile).
    let serverWs: WebSocketRoute | null = null
    await page.routeWebSocket(ENDPOINT_URL, (ws) => {
      serverWs = ws
      ws.onMessage(() => { /* no-op — we don't simulate RSL Helper responses */ })
    })

    await prepareApp(page)
    // Boot with the endpoint param so the app immediately opens the WebSocket.
    await page.goto(`/?endpoint=${ENDPOINT_URL}`, APP_GOTO_OPTIONS)

    // Load lategame.sfc so safeguard rules activate — required for the full WASM pipeline
    // (storeArtifactRows + evaluateAndCollectSafeguardProtection) to run on each push.
    const sfcInput = page.locator(SFC_LOAD_INPUT_SELECTOR).first()
    await sfcInput.waitFor({ state: 'attached', timeout: PLAYWRIGHT_TIMEOUTS.appGoto })
    await sfcInput.setInputFiles(PRESET_LATEGAME_SFC_PATH)
    await dismissBlockingDialogs(page)

    // Wait for the SFC-triggered rule-build pipeline to finish before we start pushing.
    await settleWorkload(page, PLAYWRIGHT_TIMEOUTS.testXL)

    // Poll until the app opens the WebSocket to our interceptor.
    for (let i = 0; i < 50 && !serverWs; i++) {
      await page.waitForTimeout(100)
    }
    if (!serverWs) throw new Error('App did not open the WebSocket endpoint connection.')

    // Capture the baseline heap after the SFC load has settled.
    const baselineHeapMB = await measureHeapMB(page as Parameters<typeof measureHeapMB>[0])
    console.log(`[memory-test] baseline heap=${baselineHeapMB}MB db-size=${dbSizeMB}MB`)

    const roundHeaps: number[] = [baselineHeapMB]

    for (let round = 1; round <= TOTAL_ROUNDS; round++) {
      expect(crashed, `page crashed before round ${round}`).toBe(false)
      expect(pageErrors, `uncaught errors before round ${round}`).toHaveLength(0)

      const ws = serverWs!

      // Send RAPID_BURST_COUNT binary DB pushes back-to-back without waiting for
      // each to settle.  This is the crash scenario: each push arrives while the
      // WASM pipeline is still processing the previous one.
      for (let burst = 0; burst < RAPID_BURST_COUNT; burst++) {
        // Step 1: JSON-RPC notification that the next frame is a binary DB file.
        ws.send(JSON.stringify({
          jsonrpc: '2.0',
          method: 'gearDbFileBinary',
          params: { name: 'RSLHelper.db', contentType: 'application/x-sqlite3' },
        }))
        // Step 2: Binary SQLite file contents.  The app receives this as a Blob,
        // calls arrayBuffer(), wraps it in Uint8Array, then passes it to the handler.
        ws.send(dbBuffer)
      }

      // Wait for the pipeline to settle (visible wait short, hidden wait gets the work budget).
      await settleWorkload(page, PLAYWRIGHT_TIMEOUTS.testXL)

      // Extra rAF so React can commit any trailing state updates.
      await page.waitForTimeout(500)

      const heapMB = await measureHeapMB(page as Parameters<typeof measureHeapMB>[0])
      roundHeaps.push(heapMB)
      console.log(
        `[memory-test] round=${round}/${TOTAL_ROUNDS} heap=${heapMB}MB`
        + ` growth=${heapMB - baselineHeapMB}MB (vs baseline)`,
      )
    }

    // Effective budget: N × file-size, floored so the slim fixture doesn't drive
    // the threshold below the pipeline's fixed per-burst overhead.
    const growthLimitMB = Math.max(dbSizeMB * MAX_GROWTH_MB_PER_DB_SIZE_FACTOR, MIN_GROWTH_FLOOR_MB)

    // Final summary.
    console.log(`[memory-test] heap series (MB): ${roundHeaps.join(' → ')}`)
    const peakGrowthMB = Math.max(...roundHeaps.filter((v) => v >= 0)) - baselineHeapMB
    console.log(
      `[memory-test] peak growth=${peakGrowthMB}MB db=${dbSizeMB}MB`
      + ` limit=${growthLimitMB}MB`,
    )

    expect(crashed, 'page crashed during binary replay').toBe(false)
    expect(pageErrors, 'uncaught page errors').toHaveLength(0)

    // Fail if heap grew by more than the budget — that implies each round is
    // leaving a full copy in memory instead of releasing it.
    if (baselineHeapMB > 0) {
      expect(
        peakGrowthMB,
        `heap grew by ${peakGrowthMB}MB over ${TOTAL_ROUNDS} rounds × ${RAPID_BURST_COUNT} bursts`
        + ` (db=${dbSizeMB}MB, limit=${growthLimitMB}MB)`
        + ` — each round should release its allocations`,
      ).toBeLessThanOrEqual(growthLimitMB)
    }
  })
})
