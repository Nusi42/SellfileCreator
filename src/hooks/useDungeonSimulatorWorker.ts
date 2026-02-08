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
  isBoostableDungeon,
  type DungeonBoostSelection,
  type DungeonBoostableId,
  type DungeonId,
  type DungeonSimGenericQuery,
  type DungeonSimGenericStats,
  type DungeonSimDetailQuery,
  type DungeonSimDetailStats,
  type DungeonSimMode,
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
  boosts?: Partial<Record<DungeonBoostableId, DungeonBoostSelection>>
  spotlight?: EventSpotlightSelection
  mode?: DungeonSimMode
  runs?: number
  batchSize?: number
  throttleMs?: number
}

type UseDungeonSimulatorWorkerResult = {
  results: DungeonSimResults | null
  progress: DungeonSimProgress | null
  running: boolean
  error: string | null
  requestDetailStats: (query: DungeonSimDetailQuery) => Promise<DungeonSimDetailStats | null>
  requestGenericStats: (query: DungeonSimGenericQuery) => Promise<DungeonSimGenericStats | null>
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

const hasSameSelection = (left?: DungeonStageSelection, right?: DungeonStageSelection): boolean => (
  left?.mode === right?.mode && left?.stage === right?.stage
)

const hasSameBoost = (left?: DungeonBoostSelection, right?: DungeonBoostSelection): boolean => (
  left?.mode === right?.mode && left?.setId === right?.setId
)

const resolveDirtyDungeons = (params: {
  prevSelections?: Partial<Record<DungeonId, DungeonStageSelection>>
  nextSelections?: Partial<Record<DungeonId, DungeonStageSelection>>
  prevBoosts?: Partial<Record<DungeonBoostableId, DungeonBoostSelection>>
  nextBoosts?: Partial<Record<DungeonBoostableId, DungeonBoostSelection>>
}): DungeonId[] => {
  const dirty = new Set<DungeonId>()
  for (const dungeonId of DUNGEON_IDS) {
    // Stage selection updates should only rerun the affected dungeon.
    const prevSelection = params.prevSelections?.[dungeonId]
    const nextSelection = params.nextSelections?.[dungeonId]
    if (!hasSameSelection(prevSelection, nextSelection)) {
      dirty.add(dungeonId)
    }
    if (!isBoostableDungeon(dungeonId)) continue
    // Boost edits only apply to the three artifact dungeons.
    const prevBoost = params.prevBoosts?.[dungeonId]
    const nextBoost = params.nextBoosts?.[dungeonId]
    if (!hasSameBoost(prevBoost, nextBoost)) {
      dirty.add(dungeonId)
    }
  }
  return Array.from(dirty)
}

const resetProgressForDungeons = (
  previous: DungeonSimSpotlightProgress | null,
  dirtyDungeons: DungeonId[],
  runsPerDungeon: number,
): DungeonSimSpotlightProgress => {
  // Use a fresh template when no prior progress is available.
  const base = previous ?? buildEmptyProgressBySpotlight(runsPerDungeon)
  // Reset only the changed dungeons so other tables stay at full progress.
  const next = {} as DungeonSimSpotlightProgress
  for (const spotlight of EVENT_SPOTLIGHT_OPTIONS) {
    const prevProgress = base[spotlight] ?? buildEmptyProgress(runsPerDungeon)
    const completedByDungeon = { ...prevProgress.completedByDungeon }
    let completed = 0
    for (const dungeonId of DUNGEON_IDS) {
      const value = dirtyDungeons.includes(dungeonId) ? 0 : (completedByDungeon[dungeonId] ?? 0)
      completedByDungeon[dungeonId] = value
      completed += value
    }
    next[spotlight] = {
      completed,
      total: runsPerDungeon * DUNGEON_IDS.length,
      completedByDungeon,
      runsPerDungeon,
    }
  }
  return next
}

export function useDungeonSimulatorWorker(params: UseDungeonSimulatorWorkerParams): UseDungeonSimulatorWorkerResult {
  // Destructure inputs once so dependency arrays stay simple.
  const {
    rules,
    substatTargets,
    selections,
    boosts,
    spotlight,
    mode,
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
  // Preserve the last rendered snapshot to avoid flicker between runs.
  const lastSnapshotRef = useRef<{
    results: DungeonSimSpotlightResults | null
    progress: DungeonSimSpotlightProgress | null
  }>({ results: null, progress: null })
  // Running + error state lets the caller show fallback UI if desired.
  const [running, setRunning] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // Worker ref ensures we reuse a single instance across renders.
  const workerRef = useRef<Worker | null>(null)
  // Preserve the most recent local session for fallback detail queries.
  const fallbackSessionRef = useRef<ReturnType<typeof createDungeonSimSpotlightSession> | null>(null)
  // Track the most recent request so stale responses can be ignored.
  const activeRequestRef = useRef(0)
  // Track detail requests separately from simulation runs.
  const detailRequestRef = useRef(0)
  const detailResolversRef = useRef(new Map<number, (value: DungeonSimDetailStats | null) => void>())
  const genericResolversRef = useRef(new Map<number, (value: DungeonSimGenericStats | null) => void>())
  // Local fallback loop needs a cancel hook when dependencies change.
  const fallbackCancelRef = useRef<(() => void) | null>(null)
  // Track previous inputs so we can resimulate only changed dungeons.
  const prevInputsRef = useRef<{
    rules: HsfRuleWithCfg[]
    substatTargets: SubstatTargetTable
    selections?: Partial<Record<DungeonId, DungeonStageSelection>>
    boosts?: Partial<Record<DungeonBoostableId, DungeonBoostSelection>>
    mode?: DungeonSimMode
    runs: number
  } | null>(null)

  useEffect(() => {
    // Cache the most recent snapshots so new runs can keep the old view.
    lastSnapshotRef.current = { results: resultsBySpotlight, progress: progressBySpotlight }
  }, [progressBySpotlight, resultsBySpotlight])

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
      if (data.kind === 'detail:result') {
        // Resolve the matching detail request.
        const resolver = detailResolversRef.current.get(data.id)
        if (resolver) {
          resolver(data.payload)
          detailResolversRef.current.delete(data.id)
        }
        return
      }
      if (data.kind === 'detail:error') {
        // Errors resolve to null so callers can show a fallback state.
        const resolver = detailResolversRef.current.get(data.id)
        if (resolver) {
          resolver(null)
          detailResolversRef.current.delete(data.id)
        }
        return
      }
      if (data.kind === 'detail:generic:result') {
        // Resolve the matching generic-detail request.
        const resolver = genericResolversRef.current.get(data.id)
        if (resolver) {
          resolver(data.payload)
          genericResolversRef.current.delete(data.id)
        }
        return
      }
      if (data.kind === 'detail:generic:error') {
        // Errors resolve to null so callers can show a fallback state.
        const resolver = genericResolversRef.current.get(data.id)
        if (resolver) {
          resolver(null)
          genericResolversRef.current.delete(data.id)
        }
        return
      }
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
    const prevInputs = prevInputsRef.current
    // Ensure the first visible open kicks off a full run (even under strict-mode replays).
    const hasSnapshot = Boolean(lastSnapshotRef.current.results) || Boolean(lastSnapshotRef.current.progress)
    const fullReset = !prevInputs
      || prevInputs.rules !== rules
      || prevInputs.substatTargets !== substatTargets
      || prevInputs.runs !== runs
      // Mode changes must resimulate every dungeon.
      || prevInputs.mode !== mode
    const shouldRunAll = fullReset || !hasSnapshot
    const dirtyDungeons = shouldRunAll
      ? []
      : resolveDirtyDungeons({
        ...(prevInputs?.selections ? { prevSelections: prevInputs.selections } : {}),
        ...(selections ? { nextSelections: selections } : {}),
        ...(prevInputs?.boosts ? { prevBoosts: prevInputs.boosts } : {}),
        ...(boosts ? { nextBoosts: boosts } : {}),
      })
    // Persist the latest inputs so future comparisons stay correct.
    prevInputsRef.current = {
      rules,
      substatTargets,
      runs,
      // Persist mode so we can detect global resimulations.
      ...(mode ? { mode } : {}),
      ...(selections ? { selections } : {}),
      ...(boosts ? { boosts } : {}),
    }
    // No-op when only object references changed without actual edits.
    if (!shouldRunAll && dirtyDungeons.length === 0) return undefined
    // Use a reduced run count if workers cannot be used.
    const worker = workerRef.current
    const canUseWorker = supportsWorkerEnv && Boolean(worker)
    const effectiveRuns = canUseWorker ? runs : DUNGEON_SIM_FALLBACK_RUNS_PER_DUNGEON
    // Reset run state whenever any dependency changes.
    setError(null)
    setRunning(true)
    // Keep the previous results/progress until the first new batch arrives.
    if (!lastSnapshotRef.current.results) {
      setResultsBySpotlight(null)
    }
    if (!lastSnapshotRef.current.progress) {
      setProgressBySpotlight(buildEmptyProgressBySpotlight(effectiveRuns))
    }
    if (!shouldRunAll && dirtyDungeons.length > 0) {
      // Reset only the changed dungeons so other tables keep their progress.
      setProgressBySpotlight((prev) => resetProgressForDungeons(prev, dirtyDungeons, effectiveRuns))
    }
    // Clear cached fallback sessions when inputs change.
    if (shouldRunAll) fallbackSessionRef.current = null
    // Cancel any in-flight local fallback loop.
    if (fallbackCancelRef.current) {
      fallbackCancelRef.current()
      fallbackCancelRef.current = null
    }
    const runFallback = (
      fallbackRuns: number = DUNGEON_SIM_FALLBACK_RUNS_PER_DUNGEON,
      dirtyIds: DungeonId[] = [],
    ) => {
      // Local fallback path mirrors the worker API for consistency.
      let cancelled = false
      // Reset progress so the UI reflects the fallback run count.
      setProgressBySpotlight((prev) => prev ?? buildEmptyProgressBySpotlight(fallbackRuns))
      // Reuse the previous session when only a subset of dungeons changed.
      const canReuse = !shouldRunAll && dirtyIds.length > 0 && fallbackSessionRef.current
      const session = canReuse && fallbackSessionRef.current
        ? fallbackSessionRef.current
        : createDungeonSimSpotlightSession({
          rules,
          substatTargets,
          runs: fallbackRuns,
          ...(mode ? { mode } : {}),
          ...(boosts ? { boosts } : {}),
          ...(selections ? { selections } : {}),
        })
      if (canReuse) {
        session.resetDungeons({
          dungeonIds: dirtyIds,
          ...(mode ? { mode } : {}),
          ...(boosts ? { boosts } : {}),
          ...(selections ? { selections } : {}),
        })
      }
      // Cache the session so detail queries can reuse the same run data.
      fallbackSessionRef.current = session
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
      fallbackCancelRef.current = runFallback(effectiveRuns, dirtyDungeons)
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
        ...(mode ? { mode } : {}),
        ...(dirtyDungeons.length > 0 ? { dirtyDungeons } : {}),
        ...(boosts ? { boosts } : {}),
        ...(selections ? { selections } : {}),
      },
    }
    try {
      // Try the worker path first; errors fall back to local.
      activeWorker.postMessage(request)
    } catch (_error) {
      // If the worker cannot accept the message, run locally.
      fallbackCancelRef.current = runFallback(effectiveRuns, dirtyDungeons)
      return () => {
        if (fallbackCancelRef.current) fallbackCancelRef.current()
      }
    }
    return () => {
      // Cancel the active worker run when dependencies change.
      const cancel: DungeonSimulatorWorkerRequest = { id, kind: 'cancel' }
      activeWorker.postMessage(cancel)
    }
  }, [rules, substatTargets, selections, boosts, mode, runs, safeBatchSize, throttleMs])

  // Return only the spotlight-selected slice to keep the UI lean.
  const results = resultsBySpotlight?.[selectedSpotlight] ?? null
  const progress = progressBySpotlight?.[selectedSpotlight] ?? null

  const requestDetailStats = (query: DungeonSimDetailQuery): Promise<DungeonSimDetailStats | null> => {
    // Prefer the worker cache when available.
    const worker = workerRef.current
    if (supportsWorkerEnv && worker) {
      const id = ++detailRequestRef.current
      const request: DungeonSimulatorWorkerRequest = {
        id,
        kind: 'detail:query',
        payload: query,
      }
      return new Promise((resolve) => {
        detailResolversRef.current.set(id, resolve)
        worker.postMessage(request)
      })
    }
    // Fall back to the local session when workers are unavailable.
    const session = fallbackSessionRef.current
    if (!session) return Promise.resolve(null)
    return Promise.resolve(session.queryDetailStats(query))
  }

  const requestGenericStats = (query: DungeonSimGenericQuery): Promise<DungeonSimGenericStats | null> => {
    // Prefer the worker cache when available.
    const worker = workerRef.current
    if (supportsWorkerEnv && worker) {
      const id = ++detailRequestRef.current
      const request: DungeonSimulatorWorkerRequest = {
        id,
        kind: 'detail:generic',
        payload: query,
      }
      return new Promise((resolve) => {
        genericResolversRef.current.set(id, resolve)
        worker.postMessage(request)
      })
    }
    // Fall back to the local session when workers are unavailable.
    const session = fallbackSessionRef.current
    if (!session) return Promise.resolve(null)
    return Promise.resolve(session.queryGenericStats(query))
  }

  return { results, progress, running, error, requestDetailStats, requestGenericStats }
}
