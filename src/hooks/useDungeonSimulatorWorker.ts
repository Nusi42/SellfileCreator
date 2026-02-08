import { useEffect, useRef, useState } from 'react'
import DungeonSimulatorWorker from '../workers/dungeonSimulatorWorker?worker&inline'
import type { HsfRuleWithCfg } from '../lib/merge'
import type { SubstatTargetTable } from '../lib/hsfBuilder/types'
import {
  DUNGEON_IDS,
  DUNGEON_SIM_BATCH_SIZE,
  DUNGEON_SIM_FALLBACK_RUNS_PER_DUNGEON,
  DUNGEON_SIM_RUNS_PER_DUNGEON,
  EVENT_SPOTLIGHT_OPTIONS,
  EVENT_SPOTLIGHT_DEFAULT,
  createDungeonSimSpotlightSession,
  type DungeonId,
  type DungeonSimProgress,
  type DungeonSimResults,
  type DungeonSimSpotlightProgress,
  type DungeonSimSpotlightResults,
  type DungeonStageSelection,
  type EventSpotlightSelection,
} from '../lib/dungeonSimulator'
import type {
  DungeonSimulatorWorkerRequest,
  DungeonSimulatorWorkerResponse,
} from '../workers/dungeonSimulatorWorkerTypes'
import { createProgressThrottler, PROGRESS_THROTTLE_MS } from '../types/progress'

type UseDungeonSimulatorWorkerParams = {
  rules: HsfRuleWithCfg[]
  substatTargets: SubstatTargetTable
  selections?: Partial<Record<DungeonId, DungeonStageSelection>>
  spotlight?: EventSpotlightSelection
  runs?: number
  batchSize?: number
  throttleMs?: number
}

type UseDungeonSimulatorWorkerResult = {
  results: DungeonSimResults | null
  progress: DungeonSimProgress | null
  running: boolean
  error: string | null
}

// Feature detection prevents SSR and older browsers from attempting worker creation.
const supportsWorkerEnv = typeof window !== 'undefined' && typeof Worker !== 'undefined'

// Build a zeroed progress snapshot for a new simulation run.
const buildEmptyProgress = (runsPerDungeon: number): DungeonSimProgress => {
  // Pre-fill a stable dungeon map so UI tables can render while streaming.
  const completedByDungeon = {} as Record<DungeonId, number>
  for (const dungeonId of DUNGEON_IDS) {
    completedByDungeon[dungeonId] = 0
  }
  return {
    completed: 0,
    total: runsPerDungeon * DUNGEON_IDS.length,
    completedByDungeon,
    runsPerDungeon,
  }
}

const buildEmptyProgressBySpotlight = (runsPerDungeon: number): DungeonSimSpotlightProgress => {
  // Each spotlight gets an independent progress snapshot.
  const out = {} as DungeonSimSpotlightProgress
  for (const spotlight of EVENT_SPOTLIGHT_OPTIONS) {
    out[spotlight] = buildEmptyProgress(runsPerDungeon)
  }
  return out
}

export function useDungeonSimulatorWorker(params: UseDungeonSimulatorWorkerParams): UseDungeonSimulatorWorkerResult {
  // Destructure inputs once so dependency arrays stay simple.
  const {
    rules,
    substatTargets,
    selections,
    spotlight,
    runs = DUNGEON_SIM_RUNS_PER_DUNGEON,
    batchSize = DUNGEON_SIM_BATCH_SIZE,
    throttleMs = PROGRESS_THROTTLE_MS,
  } = params
  // Clamp batch size so loops never spin on a zero or NaN batch.
  // Using an integer protects the batch math inside the worker.
  const safeBatchSize = Number.isFinite(batchSize)
    ? Math.max(1, Math.floor(batchSize))
    : DUNGEON_SIM_BATCH_SIZE
  // Default to the current spotlight if no preference is supplied.
  const selectedSpotlight = spotlight ?? EVENT_SPOTLIGHT_DEFAULT
  // Results + progress snapshots drive the UI table updates.
  const [resultsBySpotlight, setResultsBySpotlight] = useState<DungeonSimSpotlightResults | null>(null)
  const [progressBySpotlight, setProgressBySpotlight] = useState<DungeonSimSpotlightProgress | null>(null)
  // Running + error state lets the caller show fallback UI if desired.
  const [running, setRunning] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // Worker ref ensures we reuse a single instance across renders.
  const workerRef = useRef<Worker | null>(null)
  // Track the most recent request so stale responses can be ignored.
  const activeRequestRef = useRef(0)
  // Local fallback loop needs a cancel hook when dependencies change.
  const fallbackCancelRef = useRef<(() => void) | null>(null)

  useEffect(() => {
    if (!supportsWorkerEnv) return
    // Build the worker once; later effects only post messages to it.
    let worker: Worker | null = null
    try {
      worker = new DungeonSimulatorWorker()
      workerRef.current = worker
    } catch (_error) {
      workerRef.current = null
      return
    }
    const handleMessage = (event: MessageEvent<DungeonSimulatorWorkerResponse>) => {
      // Ignore messages that do not match the active request id.
      const data = event.data
      if (!data) return
      if (data.id !== activeRequestRef.current) return
      if (data.kind === 'simulate:progress') {
        // Progress updates stream intermediate results into the table.
        setResultsBySpotlight(data.payload.resultsBySpotlight)
        setProgressBySpotlight(data.payload.progressBySpotlight)
        return
      }
      if (data.kind === 'simulate:done') {
        // Completion updates finalize both results and progress.
        setResultsBySpotlight(data.payload.resultsBySpotlight)
        setProgressBySpotlight(data.payload.progressBySpotlight)
        setRunning(false)
        return
      }
      if (data.kind === 'error') {
        // Worker errors fall back to a surfaced message.
        setError(data.error)
        setRunning(false)
      }
    }
    const handleError = (event: ErrorEvent | MessageEvent) => {
      // Normalize worker errors into a stable UI string.
      const payload = event instanceof ErrorEvent ? event.error : event.data
      const reason = payload instanceof Error ? payload.message : 'Dungeon simulator worker error'
      setError(reason)
      setRunning(false)
    }
    // Attach worker listeners once; cleanup handles termination.
    worker.addEventListener('message', handleMessage)
    worker.addEventListener('error', handleError)
    worker.addEventListener('messageerror', handleError)
    return () => {
      worker.removeEventListener('message', handleMessage)
      worker.removeEventListener('error', handleError)
      worker.removeEventListener('messageerror', handleError)
      worker.terminate()
      workerRef.current = null
    }
  }, [])

  useEffect(() => {
    // Every new dependency change resets the in-flight run.
    const id = ++activeRequestRef.current
    // Use a reduced run count if workers cannot be used.
    const worker = workerRef.current
    const canUseWorker = supportsWorkerEnv && Boolean(worker)
    const effectiveRuns = canUseWorker ? runs : DUNGEON_SIM_FALLBACK_RUNS_PER_DUNGEON
    // Reset run state whenever any dependency changes.
    setError(null)
    setRunning(true)
    setResultsBySpotlight(null)
    setProgressBySpotlight(buildEmptyProgressBySpotlight(effectiveRuns))
    // Cancel any in-flight local fallback loop.
    if (fallbackCancelRef.current) {
      fallbackCancelRef.current()
      fallbackCancelRef.current = null
    }
    const runFallback = (fallbackRuns = DUNGEON_SIM_FALLBACK_RUNS_PER_DUNGEON) => {
      // Local fallback path mirrors the worker API for consistency.
      let cancelled = false
      // Reset progress so the UI reflects the fallback run count.
      setProgressBySpotlight(buildEmptyProgressBySpotlight(fallbackRuns))
      // Local fallback uses the same streaming session as the worker.
      const session = createDungeonSimSpotlightSession({
        rules,
        substatTargets,
        runs: fallbackRuns,
        ...(selections ? { selections } : {}),
      })
      // Throttle local updates so React isn't overwhelmed.
      const forwardProgress = createProgressThrottler((_snapshot) => {
        if (cancelled || activeRequestRef.current !== id) return
        setResultsBySpotlight(session.getResultsBySpotlight())
        setProgressBySpotlight(session.getProgressBySpotlight())
      }, { throttleMs })
      // Tick batches with time-slicing so the UI can still paint.
      const tick = () => {
        if (cancelled || activeRequestRef.current !== id) return
        if (session.isComplete()) {
          setResultsBySpotlight(session.getResultsBySpotlight())
          setProgressBySpotlight(session.getProgressBySpotlight())
          setRunning(false)
          return
        }
        // Execute one batch, then emit progress.
        session.runBatch(safeBatchSize)
        const progressBySpotlight = session.getProgressBySpotlight()
        const sampleSpotlight = EVENT_SPOTLIGHT_OPTIONS[0] ?? EVENT_SPOTLIGHT_DEFAULT
        const sampleProgress = progressBySpotlight[sampleSpotlight]
        if (sampleProgress) {
          // Forward the sample progress to drive the throttler clock.
          forwardProgress({ completed: sampleProgress.completed, total: sampleProgress.total })
        }
        if (session.isComplete()) {
          setResultsBySpotlight(session.getResultsBySpotlight())
          setProgressBySpotlight(session.getProgressBySpotlight())
          setRunning(false)
          return
        }
        // Yield before the next batch to keep the main thread responsive.
        setTimeout(tick, 0)
      }
      tick()
      return () => {
        cancelled = true
      }
    }
    if (!supportsWorkerEnv || !worker) {
      // Worker unavailable: fall back to the local streaming loop.
      fallbackCancelRef.current = runFallback()
      return () => {
        if (fallbackCancelRef.current) fallbackCancelRef.current()
      }
    }
    const activeWorker = worker
    // Dispatch a new worker request for the current inputs.
    // The worker will respond with progress and done messages.
    const request: DungeonSimulatorWorkerRequest = {
      id,
      kind: 'simulate',
      payload: {
        rules,
        substatTargets,
        runs: effectiveRuns,
        batchSize: safeBatchSize,
        throttleMs,
        ...(selections ? { selections } : {}),
      },
    }
    try {
      // Try the worker path first; errors fall back to local.
      activeWorker.postMessage(request)
    } catch (_error) {
      // If the worker cannot accept the message, run locally.
      fallbackCancelRef.current = runFallback()
      return () => {
        if (fallbackCancelRef.current) fallbackCancelRef.current()
      }
    }
    return () => {
      // Cancel the active worker run when dependencies change.
      const cancel: DungeonSimulatorWorkerRequest = { id, kind: 'cancel' }
      activeWorker.postMessage(cancel)
    }
  }, [rules, substatTargets, selections, runs, safeBatchSize, throttleMs])

  // Return only the spotlight-selected slice to keep the UI lean.
  const results = resultsBySpotlight?.[selectedSpotlight] ?? null
  const progress = progressBySpotlight?.[selectedSpotlight] ?? null

  return { results, progress, running, error }
}
