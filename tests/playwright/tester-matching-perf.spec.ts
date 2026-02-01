import { expect, test, type Page } from '@playwright/test'
import { APP_GOTO_OPTIONS, prepareApp } from './app-init'
import { dismissBlockingDialogs } from './dialog-helpers'
import { PERF_EVENTS, PERF_TIMELINE_GLOBAL_KEY, type PerfTimelineEntry } from '../../src/lib/perfTimeline'
import { PLAYWRIGHT_TIMEOUTS } from './timeouts'
import { getWorkloadIndicator } from './workload-indicator'
import { PREVIEW_MODE_STORAGE_KEY } from '../../src/lib/constants'
import { SAMPLE_SMALL_HSFC_PATH } from './fixture-paths'
import { warmupAppShell } from './app-warmup'
import { HSFC_LOAD_INPUT_SELECTOR } from './ui-selectors'

// Use the slim HSFC fixture so rebuilds stay within the 15s budget.
const HSFC_PATH = SAMPLE_SMALL_HSFC_PATH
// Builder name input is the most direct config-change hook for matching.
const BUILDER_NAME_SELECTOR = 'input[data-tour-id="builder.name"]'
// The preview chip gets an aria-label only while the workload is busy.
const WORKLOAD_INDICATOR = getWorkloadIndicator
// Keep the suffix short so it stays visible in the builder input.
const PERF_SUFFIX = ' [perf]'
// Keep rebuild waits short; slim fixtures should settle quickly.
const WORKLOAD_IDLE_TIMEOUT_MS = PLAYWRIGHT_TIMEOUTS.expectDefault
// Give the perf suite the long timeout reserved for rebuilds.
const PERF_TEST_TIMEOUT_MS = PLAYWRIGHT_TIMEOUTS.testLong

type LongTaskEntry = {
  // Performance entry name (often "self" for longtask).
  name: string
  // Entry start time relative to performance.now().
  startTime: number
  // Duration of the long task.
  duration: number
  // Optional script URL attributed to the task.
  scriptUrl: string | null
}

type MatchTiming = {
  // Human label describing the change that triggered the rebuild.
  label: string
  // Start time captured before the action.
  startTime: number
  // End time captured after the spinner settles.
  endTime: number
  // End-to-end elapsed time for the change.
  totalMs: number
  // Spinner start time when detected.
  busyStart: number | null
  // Spinner duration when detected.
  busyMs: number | null
  // Whether the spinner appeared at all.
  busySeen: boolean
  // Long tasks captured during the window.
  longTasks: LongTaskEntry[]
  // Perf timeline entries captured during the run.
  timelineEntries: PerfTimelineEntry[]
  // Human-readable deltas for perf timeline events.
  timelineDeltas: string[]
}

test.beforeAll(async ({ browser }) => {
  // Allow the long timeout so the cold Vite compile can finish during warmup.
  test.setTimeout(PERF_TEST_TIMEOUT_MS)
  // Preload the shell once so perf measurements avoid cold-start delays.
  await warmupAppShell(browser)
})

test.describe('config rebuild performance', () => {
  // Run across Chromium, Firefox, and WebKit to keep perf baselines consistent.
  test('measures matcher rebuild latency from config name changes', async ({ page }, testInfo) => {
    // Allow the long timeout for successive matcher rebuilds.
    test.setTimeout(PERF_TEST_TIMEOUT_MS)

    // Ensure consistent locale + clean storage before loading the app.
    await prepareApp(page)
    // Boot directly into rules preview so rebuilds stay lightweight.
    await page.addInitScript((key) => {
      try {
        window.localStorage.setItem(key, 'rules')
      } catch {
        /* ignore storage failures */
      }
    }, PREVIEW_MODE_STORAGE_KEY)
    // Capture long tasks for additional perf context.
    await attachLongTaskObserver(page)

    // Load the shell without waiting on a full load event.
    await page.goto('/', APP_GOTO_OPTIONS)
    // Ensure the preview panel is ready before importing files.
    await page.locator('[data-tour-id="preview.paper"]').waitFor({ timeout: PLAYWRIGHT_TIMEOUTS.expectDefault })

    // Load the HSFC config snapshot used in the repro.
    await loadHsfcFile(page, HSFC_PATH)
    // Close any note/restore dialogs that appear after import.
    await dismissBlockingDialogs(page)
    // Wait for the config chips to render.
    await waitForConfigChips(page)
    // Sweep again in case the note dialog appears after chips render.
    await dismissBlockingDialogs(page)

    // Capture the current config name so we can restore it.
    const nameInput = page.locator(BUILDER_NAME_SELECTOR)
    // Wait for the builder name input to mount.
    await nameInput.waitFor({ timeout: PLAYWRIGHT_TIMEOUTS.expectDefault })
    // Read the existing name to build a deterministic toggle.
    const baseName = await nameInput.inputValue()
    // Derive a safe alternate label for the perf cycle.
    const perfName = derivePerfName(baseName)

    // Track long task entries with a cursor so we avoid duplicates.
    let longTaskCursor = 0
    // Collect timing samples for each scenario.
    const measurements: MatchTiming[] = []

    // Measure rebuilds when the config name changes.
    const nameChangeForward = await measureWorkload(page, `config-name ${formatName(baseName)} → ${formatName(perfName)}`, async () => {
      // Set the builder input to the perf name.
      await setBuilderName(page, perfName)
    })
    // Pull long tasks that occurred during the change window.
    const forwardTasks = await collectLongTasks(page, longTaskCursor, nameChangeForward.startTime, nameChangeForward.endTime)
    // Advance the cursor so we do not re-log tasks.
    longTaskCursor = forwardTasks.nextCursor
    // Record the timing + long tasks together.
    measurements.push({ ...nameChangeForward, longTasks: forwardTasks.entries })

    // Emit perf summaries for CI logs and annotation output.
    for (const entry of measurements) {
      // Render the busy duration only when we saw the spinner.
      const busyLabel = entry.busySeen && entry.busyMs != null
        ? `${entry.busyMs.toFixed(1)} ms`
        : 'not-seen'
      // Compose a single-line summary for easy scan.
      const summary = `${entry.label} | total=${entry.totalMs.toFixed(1)} ms | busy=${busyLabel}`
      // Attach results to the Playwright report.
      testInfo.annotations.push({ type: 'perf', description: summary })
      // Print to stdout for quick CLI access.
      console.log(`[rebuild-perf] ${summary}`)
      // Print perf timeline deltas when available.
      if (entry.timelineDeltas.length > 0) {
        console.log(`  ↳ timeline ${entry.timelineDeltas.join(' | ')}`)
      }
      // Surface any long tasks so we can correlate stalls.
      if (entry.longTasks.length > 0) {
        for (const task of entry.longTasks) {
          const location = task.scriptUrl ? task.scriptUrl : task.name
          console.log(`  ↳ long task ${task.duration.toFixed(1)} ms @ ${location}`)
        }
      }
    }
  })
})

async function attachLongTaskObserver(page: Page): Promise<void> {
  // Wire the observer before any page content executes.
  await page.addInitScript(() => {
    // Store long task entries for later retrieval.
    const scope = window as unknown as { __testerMatchLongTasks?: LongTaskEntry[] }
    // Initialize the shared array once per page load.
    scope.__testerMatchLongTasks = []
    // Guard the observer to avoid crashes in unsupported browsers.
    if (typeof PerformanceObserver !== 'function') return
    try {
      // Observe long tasks so we can correlate stalls with rebuild windows.
      const observer = new PerformanceObserver((list) => {
        // Append each entry so tests can filter by timing window.
        const target = scope.__testerMatchLongTasks!
        for (const entry of list.getEntries()) {
          // Pull the attribution data when available (Chrome only).
          const attribution = (entry as PerformanceEntry & { attribution?: PerformanceEntry[] }).attribution
          // Use the first attribution if provided by the browser.
          const scriptUrl = attribution && attribution.length > 0
            ? ((attribution[0] as unknown as { scriptUrl?: string | null }).scriptUrl ?? null)
            : null
          // Store a trimmed payload for reporting.
          target.push({
            name: entry.name,
            startTime: entry.startTime,
            duration: entry.duration,
            scriptUrl,
          })
        }
      })
      // Listen for longtask entries in supported browsers.
      observer.observe({ entryTypes: ['longtask'] })
    } catch {
      /* ignore observer failures */
    }
  })
}

async function loadHsfcFile(page: Page, filePath: string): Promise<void> {
  // Target the HSFC loader so we follow the real import path.
  // Use the shared HSFC selector so we do not depend on visible labels.
  const input = page.locator(HSFC_LOAD_INPUT_SELECTOR).first()
  // Ensure the input exists before attempting to set files.
  await input.waitFor({ state: 'attached', timeout: PLAYWRIGHT_TIMEOUTS.expectDefault })
  // Use the file input to trigger the load.
  await input.setInputFiles(filePath)
}

async function waitForConfigChips(page: Page): Promise<void> {
  // Config chips confirm the HSFC import finished.
  const chips = page.locator('[data-config-chip="true"]')
  // Wait for at least one chip to attach and become visible.
  await expect(chips.first()).toBeVisible({ timeout: PLAYWRIGHT_TIMEOUTS.expectLong })
}

async function startPerfTimeline(page: Page, label: string): Promise<void> {
  // Reset the timeline so marks stay scoped to a single measurement.
  await page.evaluate(({ key, name }) => {
    const scope = window as unknown as Record<string, { start?: (label?: string) => void }>
    const timeline = scope[key]
    if (timeline?.start) {
      timeline.start(name)
    }
  }, { key: PERF_TIMELINE_GLOBAL_KEY, name: label })
}

async function readPerfTimelineEntries(page: Page): Promise<PerfTimelineEntry[]> {
  // Pull the snapshot so we can compute deltas in Node.
  return page.evaluate((key) => {
    const scope = window as unknown as Record<string, { snapshot?: () => { entries?: PerfTimelineEntry[] } }>
    const timeline = scope[key]
    const snapshot = timeline?.snapshot?.()
    return Array.isArray(snapshot?.entries) ? snapshot!.entries : []
  }, PERF_TIMELINE_GLOBAL_KEY)
}

function buildTimelineDeltas(entries: PerfTimelineEntry[]): string[] {
  // Map the first occurrence of each label for delta calculations.
  const byLabel = new Map<string, number>()
  for (const entry of entries) {
    if (!byLabel.has(entry.label)) {
      byLabel.set(entry.label, entry.at)
    }
  }
  // Helper to build a delta string when both endpoints exist.
  const delta = (label: string, start: string, end: string): string | null => {
    const startAt = byLabel.get(start)
    const endAt = byLabel.get(end)
    if (startAt == null || endAt == null) return null
    return `${label}=${(endAt - startAt).toFixed(1)}ms`
  }
  // Assemble the deltas in a consistent order.
  const deltas = [
    delta('build', PERF_EVENTS.testerMatchBuildStart, PERF_EVENTS.testerMatchBuildCommit),
    delta('eval', PERF_EVENTS.testerMatchEvalStart, PERF_EVENTS.testerMatchEvalDone),
    delta('eval-fallback', PERF_EVENTS.testerMatchEvalFallbackStart, PERF_EVENTS.testerMatchEvalFallbackDone),
    delta('worker-eval', PERF_EVENTS.testerMatchWorkerEvaluateSend, PERF_EVENTS.testerMatchWorkerEvaluateDone),
    delta('rule-cache', PERF_EVENTS.ruleCachePipelineStart, PERF_EVENTS.ruleCachePipelineDone),
    // Rule-cache phase: baseline pass.
    delta('baseline', PERF_EVENTS.ruleCacheBaselineStart, PERF_EVENTS.ruleCacheBaselineDone),
    // Rule-cache phase: keep-unique detection snapshot.
    delta('detection', PERF_EVENTS.ruleCacheDetectionStart, PERF_EVENTS.ruleCacheDetectionDone),
    // Rule-cache phase: final match pass.
    delta('final', PERF_EVENTS.ruleCacheFinalMatchStart, PERF_EVENTS.ruleCacheFinalMatchDone),
    delta('warm', PERF_EVENTS.ruleCacheWarmStart, PERF_EVENTS.ruleCacheWarmDone),
  ].filter((entry): entry is string => Boolean(entry))
  // Track no-op builds so we can flag redundant rebuilds.
  if (byLabel.has(PERF_EVENTS.testerMatchBuildNoop)) {
    deltas.push('noop=1')
  }
  // Check for fast-path usage via the final match start payload.
  const finalStartEntry = entries.find((entry) => entry.label === PERF_EVENTS.ruleCacheFinalMatchStart)
  // Only emit when the worker explicitly tagged the fast path.
  if (finalStartEntry?.data?.fastPath) {
    deltas.push('fast-path=1')
  }
  return deltas
}

async function measureWorkload(page: Page, label: string, action: () => Promise<void>): Promise<MatchTiming> {
  // Ensure we start from a settled state when the indicator is already visible.
  const indicator = WORKLOAD_INDICATOR(page)
  const alreadyBusy = await indicator.isVisible().catch(() => false)
  if (alreadyBusy) {
    await indicator.waitFor({ state: 'hidden', timeout: WORKLOAD_IDLE_TIMEOUT_MS })
  }
  // Reset the perf timeline so only this action is captured.
  await startPerfTimeline(page, label)
  // Capture the timestamp before triggering the change.
  const startTime = await page.evaluate(() => performance.now())
  // Execute the action that should trigger matching.
  await action()
  // Wait briefly to see if the indicator appears.
  const busySeen = await indicator.waitFor({ state: 'visible', timeout: PLAYWRIGHT_TIMEOUTS.expectDefault })
    .then(() => true)
    .catch(() => false)
  // Record when the indicator appeared, if it did.
  const busyStart = busySeen ? await page.evaluate(() => performance.now()) : null
  // Capture the end timestamp without waiting for full idle to keep the test fast.
  const endTime = await page.evaluate(() => performance.now())
  // Pull perf timeline entries once the build is settled.
  const timelineEntries = await readPerfTimelineEntries(page)
  // Derive the key deltas from the perf timeline entries.
  const timelineDeltas = buildTimelineDeltas(timelineEntries)
  // Derive the full duration from action to idle.
  const totalMs = endTime - startTime
  // Derive the busy duration when we saw the indicator.
  const busyMs = busyStart != null ? endTime - busyStart : null
  // Return the timing payload for reporting.
  return {
    label,
    startTime,
    endTime,
    totalMs,
    busyStart,
    busyMs,
    busySeen,
    longTasks: [],
    timelineEntries,
    timelineDeltas,
  }
}

async function collectLongTasks(
  page: Page,
  cursor: number,
  startTime: number,
  endTime: number,
): Promise<{ entries: LongTaskEntry[]; nextCursor: number }> {
  // Pull the recorded entries from the page context.
  const snapshot = await page.evaluate(() => {
    const scope = window as unknown as { __testerMatchLongTasks?: LongTaskEntry[] }
    return Array.isArray(scope.__testerMatchLongTasks) ? scope.__testerMatchLongTasks : []
  })
  // Slice from the cursor to avoid reprocessing old entries.
  const fresh = snapshot.slice(cursor)
  // Filter to entries within the timing window.
  const entries = fresh.filter((entry) => entry.startTime >= startTime && entry.startTime <= endTime)
  // Advance the cursor to the end of the snapshot.
  const nextCursor = snapshot.length
  // Return the filtered entries and updated cursor.
  return { entries, nextCursor }
}

function derivePerfName(baseName: string): string {
  // Trim whitespace so we do not append to a blank.
  const trimmed = baseName.trim()
  // Avoid duplicate suffixes when rerunning the test.
  if (trimmed.endsWith(PERF_SUFFIX)) {
    return `${trimmed}-2`
  }
  // Use a fallback label when the base name is empty.
  const safeBase = trimmed.length > 0 ? trimmed : 'Perf Config'
  // Return the perf name used for the toggle.
  return `${safeBase}${PERF_SUFFIX}`
}

function formatName(name: string): string {
  // Show "(empty)" when the config name is blank.
  const trimmed = name.trim()
  // Keep the label short for log readability.
  return trimmed.length > 0 ? `"${trimmed}"` : '"(empty)"'
}

async function setBuilderName(page: Page, nextName: string): Promise<void> {
  // Target the builder name input via its tour id.
  const input = page.locator(BUILDER_NAME_SELECTOR)
  // Focus and replace the value in one step.
  await input.fill(nextName)
  // Press Enter to trigger the blur commit path.
  await input.press('Enter')
  // Wait for the input value to reflect the committed name.
  await expect(input).toHaveValue(nextName, { timeout: PLAYWRIGHT_TIMEOUTS.expectDefault })
}
