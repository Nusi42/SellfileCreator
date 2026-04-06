/* eslint import/no-unused-modules: off */
/**
 * Memory profiling spec — measures JS + WASM heap pressure during two crash scenarios:
 *   1. Rapid recipe-enable/disable toggles while a large DB is loaded (recipe-override path).
 *   2. Rapid endpoint message bursts (WebSocket push path).
 *
 * Uses Chrome DevTools Protocol (CDP) Performance.getMetrics to sample heap size.
 * Also uses HeapProfiler.takeHeapSnapshot to identify the largest retained object categories.
 * NOT a pass/fail gate — prints tables of peak usage and top retained types.
 */
import fs from 'node:fs'
import path from 'node:path'
import { test } from './fixtures'
import { APP_GOTO_OPTIONS, prepareApp } from './app-init'
import { SFC_LOAD_INPUT_SELECTOR } from './ui-selectors'
import { dismissBlockingDialogs } from './dialog-helpers'
import { getWorkloadIndicator } from './workload-indicator'
import { PLAYWRIGHT_TIMEOUTS } from './timeouts'
import { EXAMPLE_NUSI_SFC_PATH, LARGE_ACCOUNT_DB_PATH } from './fixture-paths'

// RSL Helper endpoint URL; app connects when ?endpoint= param is present.
const ENDPOINT_URL = 'ws://localhost:8080/'
const SAMPLE_LOG_PATH = path.resolve(process.cwd(), 'docs/orig/sampleLog/helperRcvData.json')

type CDPSession = Awaited<ReturnType<import('@playwright/test').BrowserContext['newCDPSession']>>

type MemSample = {
  label: string
  jsHeapUsedMiB: number
  jsHeapTotalMiB: number
  // ArrayBufferContents captures WASM linear memories (each WebAssembly.Memory is an ArrayBuffer).
  arrayBuffersMiB: number
}

/** Force a full V8 GC via CDP, then sample heap metrics. */
async function gcAndSample(cdp: CDPSession, label: string): Promise<MemSample> {
  // HeapProfiler.collectGarbage triggers a synchronous V8 major GC so the next
  // getMetrics call reflects truly retained objects, not pending garbage.
  await cdp.send('HeapProfiler.collectGarbage')
  const metrics = await cdp.send('Performance.getMetrics')
  const m = Object.fromEntries(
    metrics.metrics.map((e: { name: string; value: number }) => [e.name, e.value]),
  )
  const jsHeapUsedMiB = (m['JSHeapUsedSize'] ?? 0) / 1024 / 1024
  const jsHeapTotalMiB = (m['JSHeapTotalSize'] ?? 0) / 1024 / 1024
  // ArrayBufferContents = total bytes in all ArrayBuffers, INCLUDING WASM memories.
  // This is the best proxy for "WASM heap used" without parsing a full heap snapshot.
  const arrayBuffersMiB = (m['ArrayBufferContents'] ?? 0) / 1024 / 1024
  const totalEstMiB = jsHeapUsedMiB + arrayBuffersMiB
  console.log(
    `[mem] ${label.padEnd(55)} jsUsed=${jsHeapUsedMiB.toFixed(1).padStart(6)} MiB`
    + ` arraybuf=${arrayBuffersMiB.toFixed(1).padStart(7)} MiB`
    + ` ~totalEst=${totalEstMiB.toFixed(1).padStart(7)} MiB`,
  )
  return { label, jsHeapUsedMiB, jsHeapTotalMiB, arrayBuffersMiB }
}

/**
 * Collect a V8 heap snapshot via CDP and stream-aggregate object sizes by type.
 * The snapshot JSON is too large to hold in a single string, so we process it
 * line-by-line using a simple regex scan rather than full JSON.parse.
 */
async function snapshotTopObjects(cdp: CDPSession, topN = 15): Promise<void> {
  // Buffer chunks and track current parse position.
  let buffer = ''
  // Fast maps for accumulation — populated once we've seen the metadata header.
  const sizeByType: Record<string, number> = {}
  let nodeTypes: string[] | null = null
  let fieldCount = 0
  let typeIdx = 0
  let selfSizeIdx = 0
  let inNodesArray = false

  const chunkListener = (params: { chunk: string }) => {
    buffer += params.chunk

    // Lazily extract node_types from the metadata preamble the first time.
    if (!nodeTypes) {
      const typesMatch = buffer.match(/"node_types":\s*\[\s*\[([^\]]+)\]/)
      if (typesMatch) {
        nodeTypes = typesMatch[1]!.split(',').map((s) => s.trim().replace(/"/g, ''))
      }
      const fieldsMatch = buffer.match(/"node_fields":\s*\[([^\]]+)\]/)
      if (fieldsMatch) {
        const fields = fieldsMatch[1]!.split(',').map((s) => s.trim().replace(/"/g, ''))
        fieldCount = fields.length
        typeIdx = fields.indexOf('type')
        selfSizeIdx = fields.indexOf('self_size')
      }
    }

    // Once we hit the "nodes" key, switch to scanning mode.
    if (!inNodesArray) {
      const nodesStart = buffer.indexOf('"nodes":[')
      if (nodesStart !== -1) {
        buffer = buffer.slice(nodesStart + '"nodes":['.length)
        inNodesArray = true
      } else {
        // Keep only the last 2 KB of the preamble in the buffer.
        if (buffer.length > 2048) buffer = buffer.slice(-2048)
        return
      }
    }

    if (!nodeTypes || fieldCount === 0) return

    // Scan complete comma-separated number sequences (groups of fieldCount numbers).
    // Each group represents one node: [type, name, id, self_size, edge_count, ...]
    const re = /(\d+(?:,\d+){${fieldCount - 1}})/g
    re.lastIndex = 0
    // Build the dynamic regex once per chunk.
    const dynRe = new RegExp(`(\\d+(?:,\\d+){${fieldCount - 1}})`, 'g')
    let m: RegExpExecArray | null
    let lastMatchEnd = 0
    while ((m = dynRe.exec(buffer)) !== null) {
      lastMatchEnd = m.index + m[0].length
      const vals = m[1]!.split(',')
      const typeId = Number(vals[typeIdx])
      const selfSize = Number(vals[selfSizeIdx])
      if (selfSize > 0) {
        const typeName = nodeTypes[typeId] ?? `t${typeId}`
        sizeByType[typeName] = (sizeByType[typeName] ?? 0) + selfSize
      }
    }
    // Retain only the unparsed tail so the next chunk can complete partial groups.
    buffer = buffer.slice(lastMatchEnd)
  }

  cdp.on('HeapProfiler.addHeapSnapshotChunk', chunkListener)
  try {
    await cdp.send('HeapProfiler.takeHeapSnapshot', {
      reportProgress: false,
      treatGlobalObjectsAsRoots: false,
      captureNumericValue: false,
    })
  } finally {
    cdp.off('HeapProfiler.addHeapSnapshotChunk', chunkListener)
  }

  const sorted = Object.entries(sizeByType)
    .sort(([, a], [, b]) => b - a)
    .slice(0, topN)
  const total = Object.values(sizeByType).reduce((a, b) => a + b, 0)

  console.log(`[heap] ── Top ${topN} retained object categories (total sampled: ${(total / 1024 / 1024).toFixed(0)} MiB) ──`)
  for (const [type, size] of sorted) {
    console.log(`[heap]   ${(size / 1024 / 1024).toFixed(2).padStart(8)} MiB  ${type}`)
  }
  console.log(`[heap] ──────────────────────────────────────────────────────────`)
}

async function waitForIdle(page: import('@playwright/test').Page): Promise<void> {
  const workload = getWorkloadIndicator(page)
  await workload.waitFor({ state: 'visible', timeout: PLAYWRIGHT_TIMEOUTS.expectDefault }).catch(() => undefined)
  await workload.waitFor({ state: 'hidden', timeout: PLAYWRIGHT_TIMEOUTS.testXL }).catch(() => undefined)
}

async function loadSfcAndDb(page: import('@playwright/test').Page): Promise<void> {
  const sfcInput = page.locator(SFC_LOAD_INPUT_SELECTOR).first()
  await sfcInput.waitFor({ state: 'attached', timeout: PLAYWRIGHT_TIMEOUTS.appGoto })
  await sfcInput.setInputFiles(EXAMPLE_NUSI_SFC_PATH)
  await dismissBlockingDialogs(page)
  const dbInput = page.locator('input[type="file"][accept*=".db"]').first()
  await dbInput.waitFor({ state: 'attached', timeout: PLAYWRIGHT_TIMEOUTS.appGoto })
  await dbInput.setInputFiles(LARGE_ACCOUNT_DB_PATH)
  await waitForIdle(page)
}

// ── Scenario A: rapid recipe enable/disable toggles ─────────────────────────

test.describe('memory-profiling', () => {
  test('Scenario A: rapid recipe enable/disable toggle with large DB loaded', async ({ page, context }) => {
    test.setTimeout(180_000)

    await prepareApp(page)
    await page.goto('/', APP_GOTO_OPTIONS)

    const cdp = await context.newCDPSession(page)
    await cdp.send('Performance.enable')
    await cdp.send('HeapProfiler.enable')

    const samples: MemSample[] = []
    const snap = (label: string) => gcAndSample(cdp, label).then((s) => { samples.push(s); return s })

    await snap('baseline (page loaded, no SFC/DB)')

    await loadSfcAndDb(page)
    await snap('after SFC + DB loaded + pipeline settled')

    // The recipes-enabled toggle button controls whether custom recipes fire into the rule
    // pipeline; toggling it rapidly changes ruleRecipes → triggers WASM on the main thread
    // via evaluateRecipeAgainstFilters + also fires the pipeline debounce to the worker.
    const toggleButton = page.locator('[aria-pressed]').first()

    // 20 rapid toggles at ~50 ms intervals.
    console.log('[mem] Starting 20 rapid recipe toggles (50 ms apart)...')
    for (let i = 0; i < 20; i++) {
      await toggleButton.click()
      await page.waitForTimeout(50)
    }
    await waitForIdle(page)
    await snap('after rapid toggles settled')
    console.log('[mem] Heap snapshot after rapid toggles:')
    await snapshotTopObjects(cdp)

    const peak = samples.reduce((a, b) => a.jsHeapUsedMiB > b.jsHeapUsedMiB ? a : b)
    console.log(`\n[mem] Scenario A peak: ${peak.jsHeapUsedMiB.toFixed(1)} MiB at "${peak.label}"`)
    const growth = (samples.at(-1)?.jsHeapUsedMiB ?? 0) - (samples[1]?.jsHeapUsedMiB ?? 0)
    console.log(`[mem] Growth over loaded baseline: ${growth.toFixed(1)} MiB\n`)
  })

  // ── Scenario B: rapid endpoint bursts ──────────────────────────────────────

  test('Scenario B: rapid endpoint replay bursts with large DB loaded', async ({ page, context }) => {
    test.setTimeout(300_000)

    let rawJson = fs.readFileSync(SAMPLE_LOG_PATH, 'utf-8')
    rawJson = rawJson.replace(/ {4}\}\{\n {8}"jsonrpc"/g, '    },\n    {\n        "jsonrpc"')
    const messages: unknown[] = JSON.parse(rawJson)

    let serverWs: import('@playwright/test').WebSocketRoute | null = null
    await page.routeWebSocket(ENDPOINT_URL, (ws) => {
      serverWs = ws
      ws.onMessage(() => { /* discard outbound */ })
    })

    await prepareApp(page)
    await page.goto(`/?endpoint=${ENDPOINT_URL}`, APP_GOTO_OPTIONS)

    const cdp = await context.newCDPSession(page)
    await cdp.send('Performance.enable')
    await cdp.send('HeapProfiler.enable')

    const samples: MemSample[] = []
    const snap = (label: string) => gcAndSample(cdp, label).then((s) => { samples.push(s); return s })

    await snap('baseline (page loaded, no SFC/DB)')

    await loadSfcAndDb(page)
    await snap('after SFC + DB loaded + pipeline settled')

    for (let i = 0; i < 50 && !serverWs; i++) await page.waitForTimeout(100)
    if (!serverWs) throw new Error('WebSocket never established')

    // Print all available CDP metrics once so we can see if any WASM-related counters exist.
    const allMetrics = await cdp.send('Performance.getMetrics')
    console.log('[mem] Available CDP metrics:', allMetrics.metrics.map((m: { name: string }) => m.name).join(', '))

    // Collect [sfc-diag] console messages from the app so we can see which code paths fire.
    const diagLogs: string[] = []
    page.on('console', (msg) => {
      if (msg.text().startsWith('[sfc-diag]')) diagLogs.push(msg.text())
    })

    // 5 sequential bursts: send all 9 messages, wait for pipeline to settle, measure.
    // Each burst is fully settled before the next, so the drain loop coalesces each into
    // one pipeline run and the diag logs reflect exactly one round of processing.
    const ws = serverWs
    for (let burst = 0; burst < 5; burst++) {
      diagLogs.length = 0
      for (const msg of messages) ws.send(JSON.stringify(msg))
      // Wait for this burst's pipeline to fully settle before measuring and sending the next.
      await waitForIdle(page)
      // Print diag logs for this burst so we can see what actually executed.
      console.log(`[mem] ── Burst ${burst + 1} diag logs ──`)
      for (const line of diagLogs) console.log(`[mem]   ${line}`)
      await snap(`after burst ${burst + 1}/5 settled`)
    }

    console.log('[mem] Heap snapshot after all endpoint bursts:')
    await snapshotTopObjects(cdp, 20)

    const baseline = samples[1]?.jsHeapUsedMiB ?? 0
    const last = samples.at(-1)?.jsHeapUsedMiB ?? 0
    const peak = samples.reduce((a, b) => a.jsHeapUsedMiB > b.jsHeapUsedMiB ? a : b)

    console.log(`\n[mem] ── Scenario B summary ──────────────────────────────────`)
    console.log(`[mem] Baseline after load: ${baseline.toFixed(1)} MiB`)
    console.log(`[mem] After 5 bursts:      ${last.toFixed(1)} MiB`)
    console.log(`[mem] Peak:                ${peak.jsHeapUsedMiB.toFixed(1)} MiB at "${peak.label}"`)
    console.log(`[mem] Retained growth:     ${(last - baseline).toFixed(1)} MiB`)
    console.log(`[mem] ──────────────────────────────────────────────────────────\n`)
  })
})
