// Dev-only perf timeline helper for local profiling and Playwright harvesting.
// Why: keep timing markers out of production while still enabling repeatable traces.

// Minimal payload allowed on perf timeline entries (strings + primitives only).
export type PerfTimelineEntryData = Record<string, string | number | boolean | null>

// Single entry snapshot: label + timestamp + optional data for post-processing.
export type PerfTimelineEntry = {
  label: string
  at: number
  data?: PerfTimelineEntryData
}

// Snapshot shape returned to Playwright for offline analysis.
export type PerfTimelineSnapshot = {
  startedAt: number | null
  active: boolean
  entries: PerfTimelineEntry[]
}

// Shared event labels so call sites do not drift.
export const PERF_EVENTS = {
  // Orchestrator lifecycle markers.
  testerMatchBuildStart: 'tester-match:build:start',
  testerMatchBuildNoop: 'tester-match:build:noop',
  testerMatchBuildNoRules: 'tester-match:build:no-rules',
  testerMatchBuildCommit: 'tester-match:build:commit',
  testerMatchBuildCancelled: 'tester-match:build:cancelled',
  testerMatchEvalStart: 'tester-match:eval:start',
  testerMatchEvalDone: 'tester-match:eval:done',
  testerMatchEvalFallbackStart: 'tester-match:eval:fallback:start',
  testerMatchEvalFallbackDone: 'tester-match:eval:fallback:done',
  // Worker-facing markers for tester matching.
  testerMatchWorkerConfigureSend: 'tester-match-worker:configure:send',
  testerMatchWorkerConfigureDone: 'tester-match-worker:configure:done',
  testerMatchWorkerEvaluateSend: 'tester-match-worker:evaluate:send',
  testerMatchWorkerEvaluateDone: 'tester-match-worker:evaluate:done',
  testerMatchWorkerEvaluateFallback: 'tester-match-worker:evaluate:fallback',
  // Rule-cache pipeline markers to correlate warm + match stages.
  ruleCacheWarmStart: 'rule-cache:warm:start',
  ruleCacheWarmDone: 'rule-cache:warm:done',
  ruleCachePipelineStart: 'rule-cache:pipeline:start',
  ruleCachePipelineDone: 'rule-cache:pipeline:done',
  ruleCachePipelineFallback: 'rule-cache:pipeline:fallback',
  // Rule-cache phase markers for deeper pipeline profiling.
  ruleCacheBaselineStart: 'rule-cache:baseline:start',
  ruleCacheBaselineDone: 'rule-cache:baseline:done',
  ruleCacheDetectionStart: 'rule-cache:detection:start',
  ruleCacheDetectionDone: 'rule-cache:detection:done',
  ruleCacheFinalMatchStart: 'rule-cache:final:start',
  ruleCacheFinalMatchDone: 'rule-cache:final:done',
} as const

// String key used to attach the helper to window for Playwright access.
export const PERF_TIMELINE_GLOBAL_KEY = '__sellfilePerfTimeline'

// Internal state kept in-memory (window-scoped when available).
type PerfTimelineState = {
  startedAt: number | null
  active: boolean
  entries: PerfTimelineEntry[]
}

// Public API exposed on window for manual usage and Playwright reads.
type PerfTimelineGlobal = {
  state: PerfTimelineState
  start: (label?: string, data?: PerfTimelineEntryData) => void
  mark: (label: string, data?: PerfTimelineEntryData) => void
  stop: (label?: string, data?: PerfTimelineEntryData) => void
  snapshot: () => PerfTimelineSnapshot
  clear: () => void
}

// Module-scoped fallback state for non-browser contexts.
const fallbackState: PerfTimelineState = {
  startedAt: null,
  active: false,
  entries: [],
}

// Resolve a state object tied to window when possible, else fall back to module state.
const resolvePerfTimelineState = (): PerfTimelineState => {
  // Avoid touching window when rendering or testing in Node.
  if (typeof window === 'undefined') {
    return fallbackState
  }
  // Use a dedicated global so Playwright can fetch entries.
  const globalScope = window as unknown as Record<string, PerfTimelineGlobal | undefined>
  const existing = globalScope[PERF_TIMELINE_GLOBAL_KEY]
  if (existing?.state) {
    return existing.state
  }
  // Create a fresh state for new sessions.
  const state: PerfTimelineState = {
    startedAt: null,
    active: false,
    entries: [],
  }
  // Bind the public API so Playwright can read entries without imports.
  const api: PerfTimelineGlobal = {
    state,
    start: (label?: string, data?: PerfTimelineEntryData) => {
      startPerfTimeline(label, data)
    },
    mark: (label: string, data?: PerfTimelineEntryData) => {
      markPerfEvent(label, data)
    },
    stop: (label?: string, data?: PerfTimelineEntryData) => {
      stopPerfTimeline(label, data)
    },
    snapshot: () => getPerfTimelineSnapshot(),
    clear: () => clearPerfTimeline(),
  }
  globalScope[PERF_TIMELINE_GLOBAL_KEY] = api
  return state
}

// Compile-time dev flag so release builds can tree-shake perf logic.
const PERF_TIMELINE_ENABLED = typeof import.meta !== 'undefined' && Boolean(import.meta.env?.DEV)
// Shared empty snapshot for non-dev callers.
const EMPTY_SNAPSHOT: PerfTimelineSnapshot = { startedAt: null, active: false, entries: [] }

// Clear timeline state so the next run starts clean.
export const clearPerfTimeline = (): void => {
  // Skip if dev-only instrumentation is disabled.
  if (!PERF_TIMELINE_ENABLED) return
  const state = resolvePerfTimelineState()
  state.startedAt = null
  state.active = false
  state.entries = []
}

// Start or restart the timeline, capturing a baseline entry if provided.
export const startPerfTimeline = (label?: string, data?: PerfTimelineEntryData): void => {
  // Only record when running in a dev build.
  if (!PERF_TIMELINE_ENABLED) return
  const state = resolvePerfTimelineState()
  const now = performance.now()
  state.startedAt = now
  state.active = true
  state.entries = []
  if (label) {
    state.entries.push({ label, at: now, ...(data ? { data } : {}) })
  }
}

// Record a new perf event while the timeline is active.
export const markPerfEvent = (label: string, data?: PerfTimelineEntryData): void => {
  // Guard for non-dev runtimes and inactive timelines.
  if (!PERF_TIMELINE_ENABLED) return
  const state = resolvePerfTimelineState()
  if (!state.active) return
  const now = performance.now()
  state.entries.push({ label, at: now, ...(data ? { data } : {}) })
}

// Stop the timeline and optionally add a terminal entry.
export const stopPerfTimeline = (label?: string, data?: PerfTimelineEntryData): void => {
  // Exit if dev-only timeline is disabled.
  if (!PERF_TIMELINE_ENABLED) return
  const state = resolvePerfTimelineState()
  if (!state.active) return
  const now = performance.now()
  if (label) {
    state.entries.push({ label, at: now, ...(data ? { data } : {}) })
  }
  state.active = false
}

// Return an immutable snapshot of the current timeline.
export const getPerfTimelineSnapshot = (): PerfTimelineSnapshot => {
  // Provide an empty snapshot when not in dev mode.
  if (!PERF_TIMELINE_ENABLED) return EMPTY_SNAPSHOT
  const state = resolvePerfTimelineState()
  return {
    startedAt: state.startedAt,
    active: state.active,
    entries: state.entries.slice(),
  }
}

// Ensure the global API is ready in dev so Playwright can start a timeline early.
if (typeof window !== 'undefined' && PERF_TIMELINE_ENABLED) {
  resolvePerfTimelineState()
}
