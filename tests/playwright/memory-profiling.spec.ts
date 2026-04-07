/* eslint import/no-unused-modules: off */
/**
 * Memory profiling spec — measures JS + WASM heap pressure during crash scenarios:
 *   A. Rapid recipe-enable/disable toggles while a large DB is loaded.
 *   B. Rapid endpoint message bursts (15 rounds) — tracks per-burst WASM linear memory growth.
 *   C. 10 identical endpoint bursts — proves the storeArtifactRows fingerprint skip works.
 *
 * Uses Chrome DevTools Protocol (CDP) Performance.getMetrics to sample heap size.
 * Uses HeapProfiler.takeHeapSnapshot to identify largest retained object categories.
 * Uses HeapProfiler.startSampling / getSamplingProfile for call-stack allocation attribution.
 * All three scenarios are Chromium-only because CDP is not available on Firefox/WebKit.
 * NOT a pass/fail gate — prints diagnostic tables to stdout.
 *
 * Diagnostic log lines produced by the worker (store-rows events) are accumulated on
 * window.__sfcDiag by the main-thread diagnostic relay (useRuleCacheWorker.ts) and
 * read via page.evaluate. This bypasses the Terser drop_console production build
 * setting, which strips console.log calls before Playwright can capture them.
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
  let buffer = ''
  const sizeByType: Record<string, number> = {}
  let nodeTypes: string[] | null = null
  let fieldCount = 0
  let typeIdx = 0
  let selfSizeIdx = 0
  let inNodesArray = false

  const chunkListener = (params: { chunk: string }) => {
    buffer += params.chunk

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

    if (!inNodesArray) {
      const nodesStart = buffer.indexOf('"nodes":[')
      if (nodesStart !== -1) {
        buffer = buffer.slice(nodesStart + '"nodes":['.length)
        inNodesArray = true
      } else {
        if (buffer.length > 2048) buffer = buffer.slice(-2048)
        return
      }
    }

    if (!nodeTypes || fieldCount === 0) return

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

/**
 * Stop CDP allocation sampling and print the top call frames by total allocated bytes.
 * Directly answers "which code path is responsible for most retained allocations?"
 */
async function printAllocationSamplingProfile(cdp: CDPSession, topN = 15): Promise<void> {
  const result = await cdp.send('HeapProfiler.stopSampling')
  type SamplingNode = {
    callFrame: { functionName: string; url: string; lineNumber: number }
    selfSize: number
    children: SamplingNode[]
  }
  const profile = result.profile as { head: SamplingNode }
  const byFrame: Record<string, number> = {}
  const walk = (node: SamplingNode): void => {
    if (node.selfSize > 0) {
      const name = node.callFrame.functionName || '(anonymous)'
      const loc = node.callFrame.url
        ? ` @ ${node.callFrame.url.replace(/.*\//, '')}:${node.callFrame.lineNumber}`
        : ''
      const key = `${name}${loc}`
      byFrame[key] = (byFrame[key] ?? 0) + node.selfSize
    }
    for (const child of node.children) walk(child)
  }
  walk(profile.head)
  const sorted = Object.entries(byFrame)
    .sort(([, a], [, b]) => b - a)
    .slice(0, topN)
  const totalBytes = Object.values(byFrame).reduce((a, b) => a + b, 0)
  const totalMiB = isFinite(totalBytes) ? (totalBytes / 1024 / 1024).toFixed(1) : '?'
  console.log(`[alloc] ── Top ${topN} allocation call frames (total sampled: ${totalMiB} MiB) ──`)
  for (const [frame, bytes] of sorted) {
    console.log(`[alloc]   ${(bytes / 1024 / 1024).toFixed(2).padStart(8)} MiB  ${frame}`)
  }
  console.log(`[alloc] ──────────────────────────────────────────────────────────`)
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

/**
 * Read all [sfc-diag] entries accumulated on window.__sfcDiag and clear the array.
 * The main-thread diagnostic relay (useRuleCacheWorker 'diagnostic' case) writes there
 * because console.log is stripped by the Terser drop_console production-build setting.
 */
async function drainDiagLogs(page: import('@playwright/test').Page): Promise<string[]> {
  return page.evaluate(() => {
    const w = window as Window & { __sfcDiag?: string[] }
    const logs = w.__sfcDiag ?? []
    w.__sfcDiag = []
    return logs
  })
}

/** Parse the last wasm-linear-mem=X.XXMiB value from a set of diag log lines. */
function parseWasmMemMiB(diagLogs: string[]): number {
  for (let i = diagLogs.length - 1; i >= 0; i--) {
    const m = diagLogs[i]!.match(/wasm-linear-mem=([\d.]+)MiB/)
    if (m) return parseFloat(m[1]!)
  }
  return -1
}

/** Count how many store-rows log lines match a keyword ('stored' or 'skipped-unchanged'). */
function countStoreRows(diagLogs: string[], keyword: string): number {
  return diagLogs.filter((l) => l.includes('store-rows') && l.includes(keyword)).length
}

/** Load the sample endpoint log and patch the missing commas (same fix as endpoint-replay). */
function loadSampleMessages(): unknown[] {
  let rawJson = fs.readFileSync(SAMPLE_LOG_PATH, 'utf-8')
  rawJson = rawJson.replace(/ {4}\}\{\n {8}"jsonrpc"/g, '    },\n    {\n        "jsonrpc"')
  return JSON.parse(rawJson) as unknown[]
}

/**
 * Build one synthetic artifact entry in RSL Helper wire format.
 * Fields chosen to produce realistic storeArtifactRows work:
 *   kindId 1-6 = weapon/helmet/shield/gauntlet/chestplate/boots (6 slots, cycling)
 *   setKindId 1-30 = cycling through 30 set types
 *   4 substats at levels 3/2/1/1 — typical 4-slot 5★ artifact
 *   statValue is the RSL Helper fixed-point encoding (×2^32 for percentage stats).
 */
function makeSyntheticArtifact(id: number): unknown {
  const kindId = (id % 6) + 1
  return {
    id,
    kindId,
    rankId: 5,
    rarityId: 5,
    level: 16,
    setKindId: (id % 30) + 1,
    requiredFraction: 0,
    // Slot 1 (weapon) uses ATK as primary; other slots use HP% (id=2, isAbsolute=0).
    primary: kindId === 1
      ? { id: 1, level: 0, isAbsolute: 1, statValue: 214748364800, glyphValue: 0, mValue: 0 }
      : { id: 2, level: 0, isAbsolute: 0, statValue: 42949672960, glyphValue: 0, mValue: 0 },
    secondary: [
      // ATK flat, speed, crit rate%, crit dmg% — common competitive build
      { id: 1, level: 3, isAbsolute: 1, statValue: 214748364800, glyphValue: 0, mValue: 0 },
      { id: 6, level: 2, isAbsolute: 1, statValue: 42949672960, glyphValue: 0, mValue: 0 },
      { id: 5, level: 1, isAbsolute: 0, statValue: 42949672960, glyphValue: 0, mValue: 0 },
      { id: 7, level: 1, isAbsolute: 0, statValue: 42949672960, glyphValue: 0, mValue: 0 },
    ],
  }
}

/**
 * Build a JSON-RPC 2.0 `artifacts` push message with `count` synthetic items.
 * This is the same format RSL Helper sends over the WebSocket endpoint.
 */
function makeLargeArtifactMessage(count: number): unknown {
  const artifacts = Array.from({ length: count }, (_, i) => makeSyntheticArtifact(i + 1))
  return { jsonrpc: '2.0', method: 'artifacts', params: { artifacts } }
}

// ── Scenario A: rapid recipe enable/disable toggles ─────────────────────────

test.describe('memory-profiling', () => {
  // All three scenarios use the Chrome DevTools Protocol (CDP) which is Chromium-only.
  test.skip(({ browserName }) => browserName !== 'chromium', 'CDP (HeapProfiler / Performance) is Chromium-only')

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

  // ── Scenario B: rapid endpoint bursts (15 rounds) with per-burst wasm-mem tracking ──

  test('Scenario B: rapid endpoint replay bursts with large DB loaded', async ({ page, context }) => {
    test.setTimeout(360_000)

    const messages = loadSampleMessages()

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
    // Capture into const immediately — TypeScript narrows const reliably but not let.
    const ws = serverWs
    if (!ws) throw new Error('WebSocket never established')

    // Print all available CDP metrics once so we can see if any WASM-related counters exist.
    const allMetrics = await cdp.send('Performance.getMetrics')
    console.log('[mem] Available CDP metrics:', allMetrics.metrics.map((m: { name: string }) => m.name).join(', '))

    // Start allocation sampling before first burst to capture call-stack attribution.
    // samplingInterval=512 bytes gives reasonable resolution without excessive overhead.
    await cdp.send('HeapProfiler.startSampling', { samplingInterval: 512 })

    // Drain any diag logs accumulated during load.
    await drainDiagLogs(page)

    const BURST_COUNT = 15
    for (let burst = 0; burst < BURST_COUNT; burst++) {
      for (const msg of messages) ws.send(JSON.stringify(msg))
      await waitForIdle(page)
      const burstLogs = await drainDiagLogs(page)
      const wasmMiB = parseWasmMemMiB(burstLogs)
      const storedCount = countStoreRows(burstLogs, '(stored)')
      const skippedCount = countStoreRows(burstLogs, '(skipped-unchanged)')
      console.log(
        `[mem] ── Burst ${String(burst + 1).padStart(2)}/${BURST_COUNT}`
        + ` stored=${storedCount} skipped=${skippedCount}`
        + (wasmMiB >= 0 ? ` wasm-linear-mem=${wasmMiB.toFixed(2)}MiB` : ''),
      )
      for (const line of burstLogs) console.log(`[mem]   ${line}`)
      await snap(`after burst ${burst + 1}/${BURST_COUNT} settled`)
    }

    console.log('[mem] Allocation sampling profile (call frames retaining most memory):')
    await printAllocationSamplingProfile(cdp)

    console.log('[mem] Heap snapshot after all endpoint bursts:')
    await snapshotTopObjects(cdp, 20)

    const baseline = samples[1]?.jsHeapUsedMiB ?? 0
    const last = samples.at(-1)?.jsHeapUsedMiB ?? 0
    const peak = samples.reduce((a, b) => a.jsHeapUsedMiB > b.jsHeapUsedMiB ? a : b)

    console.log(`\n[mem] ── Scenario B: ArrayBufferContents per burst ──────────────`)
    for (const s of samples.slice(2)) {
      console.log(`[mem]   ${s.label.padEnd(45)} arraybuf=${s.arrayBuffersMiB.toFixed(2).padStart(7)} MiB`)
    }
    console.log(`\n[mem] ── Scenario B summary ──────────────────────────────────`)
    console.log(`[mem] Baseline after load: ${baseline.toFixed(1)} MiB`)
    console.log(`[mem] After ${BURST_COUNT} bursts:    ${last.toFixed(1)} MiB`)
    console.log(`[mem] Peak:                ${peak.jsHeapUsedMiB.toFixed(1)} MiB at "${peak.label}"`)
    console.log(`[mem] Retained growth:     ${(last - baseline).toFixed(1)} MiB`)
    console.log(`[mem] ──────────────────────────────────────────────────────────\n`)
  })

  // ── Scenario C: 10 identical bursts — proves storeArtifactRows fingerprint skip ──
  //
  // Same 9 messages replayed 10 times. The first burst must call storeArtifactRows
  // (fingerprint is null). Bursts 2-10 should show "(skipped-unchanged)" because the
  // artifact set is identical. WASM ArrayBufferContents should be flat after burst 1.

  test('Scenario C: 10 identical endpoint bursts — verify storeArtifactRows skip', async ({ page, context }) => {
    test.setTimeout(300_000)

    const messages = loadSampleMessages()

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
    const ws = serverWs
    if (!ws) throw new Error('WebSocket never established')

    await cdp.send('HeapProfiler.startSampling', { samplingInterval: 512 })

    // Drain any diag logs accumulated during load.
    await drainDiagLogs(page)

    const BURST_COUNT = 10
    const allDiagLogs: string[] = []
    const wasmMemPerBurst: number[] = []

    for (let burst = 0; burst < BURST_COUNT; burst++) {
      for (const msg of messages) ws.send(JSON.stringify(msg))
      await waitForIdle(page)
      const burstLogs = await drainDiagLogs(page)
      allDiagLogs.push(...burstLogs)
      const wasmMiB = parseWasmMemMiB(burstLogs)
      wasmMemPerBurst.push(wasmMiB)
      const storedCount = countStoreRows(burstLogs, '(stored)')
      const skippedCount = countStoreRows(burstLogs, '(skipped-unchanged)')
      console.log(
        `[mem] Burst ${String(burst + 1).padStart(2)}/${BURST_COUNT}`
        + ` — stored=${storedCount} skipped=${skippedCount}`
        + (wasmMiB >= 0 ? ` wasm-linear-mem=${wasmMiB.toFixed(2)}MiB` : ''),
      )
      await snap(`after burst ${burst + 1}/${BURST_COUNT}`)
    }

    console.log('[mem] Allocation sampling profile:')
    await printAllocationSamplingProfile(cdp)

    const totalStored = countStoreRows(allDiagLogs, '(stored)')
    const totalSkipped = countStoreRows(allDiagLogs, '(skipped-unchanged)')
    const arraybufGrowth = (samples.at(-1)?.arrayBuffersMiB ?? 0) - (samples[1]?.arrayBuffersMiB ?? 0)
    const wasmFirst = wasmMemPerBurst.find((v) => v >= 0) ?? -1
    const wasmLast = [...wasmMemPerBurst].reverse().find((v) => v >= 0) ?? -1

    console.log(`\n[mem] ── Scenario C summary ──────────────────────────────────`)
    console.log(`[mem] storeArtifactRows (stored):          ${totalStored}  (expected: 1)`)
    console.log(`[mem] storeArtifactRows (skipped-unchanged): ${totalSkipped}  (expected: ${BURST_COUNT - 1})`)
    console.log(`[mem] WASM linear mem after burst 1:       ${wasmFirst >= 0 ? `${wasmFirst.toFixed(2)} MiB` : 'n/a'}`)
    console.log(`[mem] WASM linear mem after burst ${BURST_COUNT}:     ${wasmLast >= 0 ? `${wasmLast.toFixed(2)} MiB` : 'n/a'}`)
    console.log(`[mem] ArrayBufferContents growth (load→end): ${arraybufGrowth.toFixed(2)} MiB  (expected: ~0 after burst 1)`)
    console.log(`[mem] ──────────────────────────────────────────────────────────\n`)
  })

  // ── Scenario D: 10,000 synthetic artifacts × 10 identical bursts ─────────────────
  //
  // Uses generated data instead of the 4-artifact sample log so there is enough heap
  // pressure to make the before/after Vec-reuse difference measurable:
  //   10,000 artifacts × ~200 bytes/row ≈ 2 MiB per storeArtifactRows call.
  //
  // Expected (with fix):
  //   Burst 1 → storeArtifactRows called (fingerprint was null), WASM mem rises.
  //   Bursts 2-10 → fingerprint matches → skipped-unchanged, WASM mem flat.
  //   ArrayBufferContents growth after burst 1 ≈ 0 on subsequent bursts.
  //
  // To baseline without the fix: temporarily revert the Rust clear()+extend() and the
  // JS fingerprint guard, then re-run. You should see `stored` on every burst and
  // monotonic WASM linear memory growth of ~2 MiB per burst.

  test('Scenario D: 10,000 synthetic artifacts × 10 identical bursts — large-data memory proof', async ({ page, context }) => {
    test.setTimeout(600_000)

    const ARTIFACT_COUNT = 10_000
    const artifactMsg = makeLargeArtifactMessage(ARTIFACT_COUNT)

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
    const ws = serverWs
    if (!ws) throw new Error('WebSocket never established')

    await cdp.send('HeapProfiler.startSampling', { samplingInterval: 512 })

    // Drain logs accumulated during load.
    await drainDiagLogs(page)

    const BURST_COUNT = 10
    const allDiagLogs: string[] = []
    const wasmMemPerBurst: number[] = []

    console.log(`[mem] Scenario D: sending ${ARTIFACT_COUNT} synthetic artifacts x ${BURST_COUNT} identical bursts`)

    for (let burst = 0; burst < BURST_COUNT; burst++) {
      // Single WebSocket message — same shape as a real RSL Helper artifacts push.
      ws.send(JSON.stringify(artifactMsg))
      await waitForIdle(page)
      const burstLogs = await drainDiagLogs(page)
      allDiagLogs.push(...burstLogs)
      const wasmMiB = parseWasmMemMiB(burstLogs)
      wasmMemPerBurst.push(wasmMiB)
      const storedCount = countStoreRows(burstLogs, '(stored)')
      const skippedCount = countStoreRows(burstLogs, '(skipped-unchanged)')
      const wasmStr = wasmMiB >= 0 ? ` wasm-linear-mem=${wasmMiB.toFixed(2)}MiB` : ''
      console.log(
        `[mem] -- Burst ${String(burst + 1).padStart(2)}/${BURST_COUNT}`
        + ` stored=${storedCount} skipped=${skippedCount}${wasmStr}`,
      )
      for (const line of burstLogs) console.log(`[mem]   ${line}`)
      await snap(`after burst ${burst + 1}/${BURST_COUNT}`)
    }

    console.log('[mem] Scenario D allocation sampling profile:')
    await printAllocationSamplingProfile(cdp)

    const totalStored = countStoreRows(allDiagLogs, '(stored)')
    const totalSkipped = countStoreRows(allDiagLogs, '(skipped-unchanged)')
    // Burst 1 is samples[2] (index 0=baseline, 1=after load, 2=after burst 1).
    const arraybufAfterBurst1 = samples[2]?.arrayBuffersMiB ?? 0
    const arraybufAfterLast = samples.at(-1)?.arrayBuffersMiB ?? 0
    const arraybufDrift = arraybufAfterLast - arraybufAfterBurst1
    const wasmFirst = wasmMemPerBurst.find((v) => v >= 0) ?? -1
    const wasmLast = [...wasmMemPerBurst].reverse().find((v) => v >= 0) ?? -1

    console.log(`\n[mem] -- Scenario D: ArrayBufferContents per burst --`)
    for (const s of samples.slice(2)) {
      console.log(`[mem]   ${s.label.padEnd(45)} arraybuf=${s.arrayBuffersMiB.toFixed(2).padStart(7)} MiB`)
    }
    console.log(`\n[mem] -- Scenario D summary (${ARTIFACT_COUNT} synthetic artifacts) --`)
    console.log(`[mem] storeArtifactRows (stored):            ${totalStored}  (expected: 1)`)
    console.log(`[mem] storeArtifactRows (skipped-unchanged): ${totalSkipped}  (expected: ${BURST_COUNT - 1})`)
    const wasmFirstStr = wasmFirst >= 0 ? `${wasmFirst.toFixed(2)} MiB` : 'n/a'
    const wasmLastStr = wasmLast >= 0 ? `${wasmLast.toFixed(2)} MiB` : 'n/a'
    console.log(`[mem] WASM linear mem after burst 1:         ${wasmFirstStr}`)
    console.log(`[mem] WASM linear mem after burst ${BURST_COUNT}:       ${wasmLastStr}`)
    console.log(`[mem] ArrayBufferContents burst1->last drift: ${arraybufDrift.toFixed(2)} MiB  (expected: ~0)`)
    console.log(`[mem] ----------------------------------------------------------\n`)
  })
})
