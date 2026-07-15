/**
 * heap-metrics — shared heap measurement for the memory-regression specs
 * (capture-replay-memory, override-churn-memory). SSOT for how those specs read
 * the renderer heap; do not hand-roll CDP metric reads in individual specs.
 *
 * Why CDP + forced GC:
 *  - `performance.memory.usedJSHeapSize` is QUANTIZED in Chromium (it can flat-line
 *    for minutes) — useless for growth tracking.
 *  - The un-GC'd precise metric counts garbage that V8 simply hasn't collected yet,
 *    which balloons with allocation rate and makes assertions flaky. Forcing a
 *    collection first measures RETAINED memory — the number that actually decides
 *    whether a long session OOMs — and is stable run-to-run.
 */
import type { CDPSession, Page } from '@playwright/test'

/** Open a CDP session with the Performance + HeapProfiler domains enabled. */
export const attachHeapMetrics = async (page: Page): Promise<CDPSession> => {
  const cdp = await page.context().newCDPSession(page)
  await cdp.send('Performance.enable')
  // HeapProfiler powers the forced GC in measureRetainedHeapMB.
  await cdp.send('HeapProfiler.enable')
  return cdp
}

/** Force a full GC, then return the retained main-isolate heap in MB (-1 if unavailable). */
export const measureRetainedHeapMB = async (cdp: CDPSession): Promise<number> => {
  await cdp.send('HeapProfiler.collectGarbage')
  const { metrics } = await cdp.send('Performance.getMetrics')
  const used = metrics.find((m) => m.name === 'JSHeapUsedSize')?.value ?? -1
  return used >= 0 ? Math.round(used / 1024 / 1024) : -1
}

/**
 * Worker WASM linear-memory size (MB) mirrored to window.__wasmHeapMB by
 * VITE_TEST_HOOKS builds under `?logWasmHeap` — the only cross-isolate heap signal.
 * -1 until the first pipeline completes (or outside test-hook builds).
 */
export const readWorkerWasmHeapMB = (page: Page): Promise<number> =>
  page.evaluate(() => (window as unknown as { __wasmHeapMB?: number }).__wasmHeapMB ?? -1)
    .catch(() => -1)

/** Pipeline-launch tally from VITE_TEST_HOOKS builds (App.tsx __pipelineCacheStats). */
export const readPipelineStats = (page: Page): Promise<{ hits: number; misses: number } | null> =>
  page.evaluate(() => (window as unknown as { __pipelineCacheStats?: { hits: number; misses: number } }).__pipelineCacheStats ?? null)
    .catch(() => null)
