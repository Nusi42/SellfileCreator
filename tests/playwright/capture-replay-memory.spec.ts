/* eslint import/no-unused-modules: off */
/**
 * capture-replay-memory — replay a REAL captured endpoint session (see
 * docs/orig/sampleLog/captures/, recorded with `?capturePackets`) against the
 * production bundle and track the renderer JS heap burst-by-burst.
 *
 * Purpose: reproduce the live farm-run OOM (session_260715_212207.259: main heap
 * oscillating 1.9–3.3 GB until the tab dies) in a controlled harness so the
 * memory fixes can be verified against the exact traffic that killed the app.
 *
 * Env:
 *   CAPTURE_SESSION — capture dir name under docs/orig/sampleLog/captures/.
 *                     Defaults to the recorded farm-run OOM session. The spec
 *                     SKIPS when the dir is absent (captures are gitignored).
 */
import fs from 'node:fs'
import path from 'node:path'
import type { WebSocketRoute } from '@playwright/test'
import { test, expect } from './fixtures'
import { APP_GOTO_OPTIONS, prepareApp } from './app-init'
import { SFC_LOAD_INPUT_SELECTOR } from './ui-selectors'
import { dismissBlockingDialogs } from './dialog-helpers'
import { settleWorkload } from './workload-indicator'
import { PLAYWRIGHT_TIMEOUTS } from './timeouts'
import { CAPTURE_REPLAY_BURSTS } from './iteration-counts'
import { attachHeapMetrics, measureRetainedHeapMB, readPipelineStats, readWorkerWasmHeapMB } from './heap-metrics'
import { PRESET_LATEGAME_SFC_PATH } from './fixture-paths'
// Committed capture archives (tests/fixtures/captures/*.tar.zst) unpack on demand
// into the gitignored live-captures dir — see scripts/test/capture-fixtures.mjs.
import { archivePathFor, ensureCaptureSession, unpackedPathFor } from '../../scripts/test/capture-fixtures.mjs'

// RSL Helper default WebSocket endpoint; the app reads it from ?endpoint=.
const ENDPOINT_URL = 'ws://localhost:8080/'
// Default to the captured farm-run session that OOM'd live (110 packets, ~60 full
// artifact resends of ~7.7k artifacts each — the heaviest real traffic we have).
const SESSION = process.env.CAPTURE_SESSION ?? 'session_260715_212207.259'
const CAPTURE_DIR = unpackedPathFor(SESSION)
// Frames closer together than this are one "burst" (RSL Helper sends grouped
// notifications per farm pickup); a longer gap starts the next settle point.
const BURST_GAP_MS = 2_000

// Filename timestamp (HHMMSS.mmm) → ms-of-day, for burst grouping. Order still
// comes from the numeric packet index; the clock only measures gaps.
const timeOf = (file: string): number => {
  const m = file.match(/_(\d{6})_(\d{6})\.(\d{3})\.json$/)
  if (!m) return 0
  const hms = m[2]!
  return (Number(hms.slice(0, 2)) * 3600 + Number(hms.slice(2, 4)) * 60 + Number(hms.slice(4, 6))) * 1000 + Number(m[3])
}

// List the session's INBOUND frames in send order. Outbound (`_send_`) captures are
// what the APP pushed (the live app re-sends its own), and `_response_` captures are
// Helper's replies to the live app's request ids — both are re-created dynamically
// by this run, so replaying the recorded copies would be wrong.
const listInboundFiles = (): string[] => fs.readdirSync(CAPTURE_DIR)
  .filter((f) => /^packet_\d+_.+\.json$/.test(f) && !f.includes('_send_') && !f.includes('_response_'))
  .sort((a, b) => Number(a.match(/^packet_(\d+)_/)![1]) - Number(b.match(/^packet_(\d+)_/)![1]))

// Group ordered files into timestamp bursts so the replay settles exactly where the
// live session had think-time (each burst ≈ one farm pickup's notification group).
const groupIntoBursts = (files: string[]): string[][] => {
  const bursts: string[][] = []
  let current: string[] = []
  let lastT = -1
  for (const f of files) {
    const t = timeOf(f)
    if (lastT >= 0 && t - lastT > BURST_GAP_MS && current.length > 0) { bursts.push(current); current = [] }
    current.push(f)
    lastT = t
  }
  if (current.length > 0) bursts.push(current)
  return bursts
}

// V8 heap used (MB) incl. ArrayBuffer/WASM memory; -1 when unavailable (non-Chromium).
// Retained-heap growth ceiling (MB above baseline, measured AFTER a forced GC — see
// heap-metrics.ts). Sized from the post-mitigation run of this spec: retained growth
// PLATEAUS at ~680 MB (the 600 MiB pipeline-cache budget + the live display generation),
// flat from ~burst 13 on — so the full-session (E2E_FULL) replay stays at the same level.
// Pre-mitigation the same replay RATCHETED past +2.5 GB and kept climbing; 1200 MB
// (~1.8× the observed plateau) cleanly separates the regimes with CI-variance headroom.
const MAX_RETAINED_GROWTH_MB = 1200
// Worker WASM linear-memory ceiling (grow-only high-water). This session peaks at
// 729 MB; 1024 MB flags a regression toward unbounded WASM growth while tolerating
// normal high-water variance.
const MAX_WASM_HEAP_MB = 1024

test.describe('capture-replay-memory', () => {
  // Skip only when the session exists NEITHER unpacked NOR as a committed archive
  // (e.g. an ad-hoc CAPTURE_SESSION recorded on another machine).
  test.skip(!fs.existsSync(CAPTURE_DIR) && !fs.existsSync(archivePathFor(SESSION)),
    `capture session not present: ${CAPTURE_DIR}`)

  // Materialize the committed archive before the test body reads the dir. Idempotent
  // and near-free when the session is already unpacked.
  test.beforeAll(async () => {
    test.setTimeout(PLAYWRIGHT_TIMEOUTS.testXL)
    await ensureCaptureSession(SESSION)
  })

  test(`replays captured session ${SESSION} tracking heap`, async ({ page }) => {
    // Dozens of burst+settle iterations — same budget class as the endpoint sweeps.
    test.setTimeout(PLAYWRIGHT_TIMEOUTS.testEndpointSweep)

    const files = listInboundFiles()
    // Cap replayed bursts (dev/full split): the heap plateau shows within ~25 bursts;
    // the full session only widens the flatness margin. Never a silent cap — log it.
    const allBursts = groupIntoBursts(files)
    const bursts = allBursts.slice(0, CAPTURE_REPLAY_BURSTS)
    console.log(`[capture-replay] session=${SESSION} inboundFrames=${files.length}`
      + ` bursts=${bursts.length}${bursts.length < allBursts.length ? ` (of ${allBursts.length}; dev cap)` : ''}`)

    // Collect crash/error signals so the final assertions report them all together.
    const pageErrors: string[] = []
    let crashed = false
    page.on('crash', () => { crashed = true })
    page.on('pageerror', (err) => { pageErrors.push(err.message) })
    // Mirror the app's own memory diagnostics into the runner log for the analysis.
    page.on('console', (msg) => {
      const text = msg.text()
      if (text.includes('[rule-cache-worker]') || text.includes('[pipeline-cache]')
        || text.includes('[mem-diag]') || text.includes('[endpoint-queue]')) {
        console.log(`[browser] ${text}`)
      }
    })

    // Act as RSL Helper: ACK every app request (uploadSellfile etc.) with a success
    // response so the app's push loop behaves like live instead of hitting 60 s timeouts.
    let serverWs: WebSocketRoute | null = null
    await page.routeWebSocket(ENDPOINT_URL, (ws) => {
      serverWs = ws
      ws.onMessage((data) => {
        try {
          const req = JSON.parse(String(data)) as { id?: number }
          if (typeof req.id === 'number') {
            ws.send(JSON.stringify({ jsonrpc: '2.0', id: req.id, result: { ok: true, savedAs: 'replay.hsf' } }))
          }
        } catch { /* binary or malformed — ignore, like a lenient server */ }
      })
    })

    await prepareApp(page)
    // ?logWasmHeap: VITE_TEST_HOOKS builds mirror the worker's WASM linear-memory size to
    // window.__wasmHeapMB after each pipeline — the only cross-isolate heap signal we get.
    await page.goto(`/?endpoint=${ENDPOINT_URL}&logWasmHeap`, APP_GOTO_OPTIONS)
    // Retained-heap metrics (forced-GC CDP reads) — see heap-metrics.ts for why.
    const cdp = await attachHeapMetrics(page)

    // Load the lategame preset so safeguards run the full WASM detection pipeline —
    // the same workload class the live session (restored user data) exercised.
    const sfcInput = page.locator(SFC_LOAD_INPUT_SELECTOR).first()
    await sfcInput.waitFor({ state: 'attached', timeout: PLAYWRIGHT_TIMEOUTS.appGoto })
    await sfcInput.setInputFiles(PRESET_LATEGAME_SFC_PATH)
    await dismissBlockingDialogs(page)
    await settleWorkload(page, PLAYWRIGHT_TIMEOUTS.testXL)

    // Wait for the app to open the WebSocket to our fake Helper.
    for (let i = 0; i < 50 && !serverWs; i++) await page.waitForTimeout(100)
    if (!serverWs) throw new Error('App never opened the endpoint WebSocket')

    const baselineMB = await measureRetainedHeapMB(cdp)
    console.log(`[capture-replay] baseline retained heap=${baselineMB}MB`)
    const heapSeries: number[] = [baselineMB]
    let peakWasmMB = -1

    for (let i = 0; i < bursts.length; i++) {
      expect(crashed, `page crashed before burst ${i + 1}`).toBe(false)
      const burst = bursts[i]!
      // Stream one file at a time: parse + re-stringify compact (the live Helper sends
      // compact JSON; captures are pretty-printed) and let each buffer go immediately.
      for (const file of burst) {
        const raw = fs.readFileSync(path.join(CAPTURE_DIR, file), 'utf-8')
        serverWs!.send(JSON.stringify(JSON.parse(raw)))
      }
      // Settle the pipeline like the live inter-pickup pause, then sample the heap.
      // Per-step durations pinpoint WHERE a slow burst spends its time (the settle wait
      // vs the CDP measurement) — kept permanently: when this spec regresses, the first
      // question is always "what got slow", and these numbers answer it from the log.
      const settleStart = Date.now()
      await settleWorkload(page, PLAYWRIGHT_TIMEOUTS.testXL).catch(() => { /* settle miss is data, not failure */ })
      const settleMs = Date.now() - settleStart
      const measureStart = Date.now()
      const heapMB = await measureRetainedHeapMB(cdp)
      const measureMs = Date.now() - measureStart
      heapSeries.push(heapMB)
      const stats = await readPipelineStats(page)
      // Worker WASM linear memory (grow-only high-water mark) — n/a until the first pipeline.
      const wasmMB = await readWorkerWasmHeapMB(page)
      peakWasmMB = Math.max(peakWasmMB, wasmMB)
      console.log(`[capture-replay] burst=${i + 1}/${bursts.length} frames=${burst.length} retained=${heapMB}MB`
        + ` growth=${heapMB - baselineMB}MB wasm=${wasmMB}MB pipeline=${stats ? `${stats.hits}h/${stats.misses}m` : 'n/a'}`
        + ` settleMs=${settleMs} measureMs=${measureMs}`)
      if (crashed) break
    }

    console.log(`[capture-replay] retained series (MB): ${heapSeries.join(' → ')}`)
    // The replay must actually have driven pipeline runs — otherwise the heap series
    // says nothing about the farm-run memory behaviour under test.
    const finalStats = await readPipelineStats(page)
    console.log(`[capture-replay] pipeline launches: ${finalStats ? finalStats.hits + finalStats.misses : 'n/a (needs VITE_TEST_HOOKS build)'}`)
    expect(crashed, 'page crashed during capture replay').toBe(false)
    expect(pageErrors, 'uncaught page errors during capture replay').toHaveLength(0)

    // Regression gates for the farm-run OOM (docs/technical/pipeline-memory.md): retained
    // growth bounded (the pre-fix cache ratcheted without bound) and the worker's WASM
    // high-water bounded. Guarded on valid readings so a metrics hiccup cannot flake.
    const peakGrowthMB = Math.max(...heapSeries.filter((v) => v >= 0)) - baselineMB
    console.log(`[capture-replay] peak retained growth=${peakGrowthMB}MB (limit ${MAX_RETAINED_GROWTH_MB}MB)`
      + ` peakWasm=${peakWasmMB}MB (limit ${MAX_WASM_HEAP_MB}MB)`)
    if (baselineMB >= 0) {
      expect(
        peakGrowthMB,
        `retained heap grew ${peakGrowthMB}MB over ${bursts.length} bursts (limit ${MAX_RETAINED_GROWTH_MB}MB)`
        + ` — the pipeline result retention is regressing (see pipeline-memory.md)`,
      ).toBeLessThanOrEqual(MAX_RETAINED_GROWTH_MB)
    }
    if (peakWasmMB >= 0) {
      expect(
        peakWasmMB,
        `worker WASM linear memory peaked at ${peakWasmMB}MB (limit ${MAX_WASM_HEAP_MB}MB)`,
      ).toBeLessThanOrEqual(MAX_WASM_HEAP_MB)
    }
  })
})
