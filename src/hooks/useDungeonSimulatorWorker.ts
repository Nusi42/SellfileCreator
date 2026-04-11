import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import DungeonSimulatorWorker from '../workers/dungeonSimulatorWorker?worker&inline'
import type { HsfRuleWithRecipe } from '../lib/merge'
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
import { warmupWasmRuleEngine } from '../lib/wasm/wasmRuleEngine'
import { createProgressThrottler, PROGRESS_THROTTLE_MS } from '../types/progress'
import { registerDsimCallbacks, clearDsimCallbacks } from '../lib/wasmWorkerSlot'

type UseDungeonSimulatorWorkerParams = {
  rules: HsfRuleWithRecipe[]
  substatTargets: SubstatTargetTable
  selections?: Partial<Record<DungeonId, DungeonStageSelection>>
  boosts?: Partial<Record<DungeonBoostableId, DungeonBoostSelection>>
  spotlight?: EventSpotlightSelection
  mode?: DungeonSimMode
  // Bump this token to force a full resimulation without changing inputs.
  refreshToken?: number
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

// Idle period before the dungeon-sim worker is terminated to release WASM linear memory.
// Resets on each simulate:done or served detail/generic response. Worker is recreated on
// the next simulation request so the rule-cache worker never competes with a live dsim WASM
// instance during heavy pipeline runs.
const DSIM_WORKER_IDLE_MS = 30_000

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

const hasIncompleteOutsideDirty = (
  progressBySpotlight: DungeonSimSpotlightProgress | null,
  dirtyDungeons: DungeonId[],
  runsPerDungeon: number,
): boolean => {
  // Missing progress implies we should refresh all dungeons.
  if (!progressBySpotlight) return true
  const dirtySet = new Set(dirtyDungeons)
  for (const spotlight of EVENT_SPOTLIGHT_OPTIONS) {
    const progress = progressBySpotlight[spotlight]
    if (!progress) continue
    const expectedRuns = progress.runsPerDungeon ?? runsPerDungeon
    for (const dungeonId of DUNGEON_IDS) {
      if (dirtySet.has(dungeonId)) continue
      const completed = progress.completedByDungeon?.[dungeonId] ?? 0
      if (completed < expectedRuns) return true
    }
  }
  return false
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
    refreshToken = 0,
    runs = DUNGEON_SIM_RUNS_PER_DUNGEON,
    batchSize = DUNGEON_SIM_BATCH_SIZE,
    throttleMs = PROGRESS_THROTTLE_MS,
  } = params
  // Clamp batch size so loops never spin on a zero or NaN batch.
  // Using an integer protects the batch math inside the worker.
  const safeBatchSize = Number.isFinite(batchSize)
    ? Math.max(1, Math.floor(batchSize))
    : DUNGEON_SIM_BATCH_SIZE
  // Mutable refs so the [] mount-effect closure can read the latest values when
  // the onPipelineDone callback fires (which may be many renders after mount).
  const safeBatchSizeRef = useRef(safeBatchSize)
  const throttleMsRef = useRef(throttleMs)
  // useLayoutEffect (no deps) keeps the refs current on every render without
  // mutating them directly during the render phase (which the lint rule forbids).
  useLayoutEffect(() => {
    safeBatchSizeRef.current = safeBatchSize
    throttleMsRef.current = throttleMs
  })
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
  // Incremented by the rule-cache pipeline slot (wasmWorkerSlot.ts) after the pipeline
  // queue drains and the dsim was evicted.  Forces the sim effect to re-run even when
  // the rules reference is unchanged (e.g. artifact-only pipeline).
  const [evictToken, setEvictToken] = useState(0)
  // Ref-based setters so async worker/fallback callbacks avoid the set-state-in-effect lint rule.
  const setResultsBySpotlightRef = useRef(setResultsBySpotlight)
  const setProgressBySpotlightRef = useRef(setProgressBySpotlight)
  const setRunningRef = useRef(setRunning)
  const setErrorRef = useRef(setError)
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
  // Cache local warmup so fallback runs do not reinitialize WASM each time.
  const localWasmWarmupPromiseRef = useRef<Promise<void> | null>(null)
  // Local fallback loop needs a cancel hook when dependencies change.
  const fallbackCancelRef = useRef<(() => void) | null>(null)
  // Idle-termination timer: fires DSIM_WORKER_IDLE_MS after each completed sim or detail response.
  const idleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  // Stable handler refs so the same functions can be attached to recreated workers.
  const messageHandlerRef = useRef<((e: MessageEvent<DungeonSimulatorWorkerResponse>) => void) | null>(null)
  const errorHandlerRef = useRef<((e: ErrorEvent | MessageEvent) => void) | null>(null)
  // Factory ref: creates a fresh worker and wires up handlers. Set in mount effect.
  const createWorkerRef = useRef<(() => Worker | null) | null>(null)
  // Track previous inputs so we can resimulate only changed dungeons.
  const prevInputsRef = useRef<{
    rules: HsfRuleWithRecipe[]
    substatTargets: SubstatTargetTable
    selections?: Partial<Record<DungeonId, DungeonStageSelection>>
    boosts?: Partial<Record<DungeonBoostableId, DungeonBoostSelection>>
    mode?: DungeonSimMode
    refreshToken?: number
    runs: number
    evictToken: number
  } | null>(null)

  useEffect(() => {
    // Cache the most recent snapshots so new runs can keep the old view.
    lastSnapshotRef.current = { results: resultsBySpotlight, progress: progressBySpotlight }
  }, [progressBySpotlight, resultsBySpotlight])

  useEffect(() => {
    if (!supportsWorkerEnv) return
    // Terminate the current worker and resolve all pending requests to null.
    // Called by the idle timer and on unmount; safe to call when no worker exists.
    // Register this instance's terminator so the rule-cache pipeline can evict the
    // dsim worker before its own WASM peak allocations — prevents both heaps coexisting.
    const terminateWorkerNow = () => {
      if (idleTimerRef.current !== null) {
        clearTimeout(idleTimerRef.current)
        idleTimerRef.current = null
      }
      const w = workerRef.current
      if (!w) return
      if (messageHandlerRef.current) w.removeEventListener('message', messageHandlerRef.current)
      if (errorHandlerRef.current) {
        w.removeEventListener('error', errorHandlerRef.current)
        w.removeEventListener('messageerror', errorHandlerRef.current)
      }
      w.terminate()
      workerRef.current = null
      // Resolve all in-flight detail/generic requests to null so callers do not hang.
      for (const resolve of detailResolversRef.current.values()) resolve(null)
      detailResolversRef.current.clear()
      for (const resolve of genericResolversRef.current.values()) resolve(null)
      genericResolversRef.current.clear()
    }
    // Soft-pause: send 'cancel' to the live worker, preserving cachedSession for resume.
    // Called by the rule-cache pipeline before its own WASM peak allocations.
    const pauseWorker = () => {
      const w = workerRef.current
      if (!w) return
      // Use the current request id so the worker's cancel guard matches.
      const id = activeRequestRef.current
      w.postMessage({ id, kind: 'cancel' } satisfies DungeonSimulatorWorkerRequest)
      setRunningRef.current(false)
    }
    // Called once the pipeline queue fully drains.
    const onPipelineDone = (rulesChanged: boolean) => {
      const w = workerRef.current
      if (!w) {
        // Worker was idle-terminated before the pipeline finished.
        // Always bump evictToken so the sim effect creates a fresh worker:
        // — rules-unchanged: evictToken is the only trigger (rules prop won't change)
        // — rules-changed:   redundant but harmless; sim also restarts via fullReset
        //                    when the new rules prop arrives, but evictToken ensures
        //                    restart even if the dialog is open before the prop update
        void rulesChanged  // used for symmetry; both paths need the bump
        setEvictToken((n) => n + 1)
        return
      }
      if (rulesChanged) {
        // Paused session is stale; terminate so the sim effect restarts cleanly
        // when the new rules prop arrives.
        terminateWorkerNow()
        return
      }
      // Rules unchanged: resume from where the session stopped.
      const id = activeRequestRef.current
      w.postMessage({
        id,
        kind: 'resume',
        payload: { batchSize: safeBatchSizeRef.current, throttleMs: throttleMsRef.current },
      } satisfies DungeonSimulatorWorkerRequest)
      setRunningRef.current(true)
    }
    // Register so the rule-cache pipeline can coordinate with this hook instance.
    // setEvictToken is a stable React setter — safe to capture in the [] mount effect.
    registerDsimCallbacks(pauseWorker, onPipelineDone)
    // Schedule idle-termination after inactivity; resets on each completed sim or detail response.
    // Keeping the window at DSIM_WORKER_IDLE_MS lets the user view detail stats before WASM is freed.
    const scheduleIdle = () => {
      if (idleTimerRef.current !== null) clearTimeout(idleTimerRef.current)
      idleTimerRef.current = setTimeout(terminateWorkerNow, DSIM_WORKER_IDLE_MS)
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
          // Reset idle timer: user is actively viewing detail stats.
          scheduleIdle()
        }
        return
      }
      if (data.kind === 'detail:error') {
        // Errors resolve to null so callers can show a fallback state.
        const resolver = detailResolversRef.current.get(data.id)
        if (resolver) {
          resolver(null)
          detailResolversRef.current.delete(data.id)
          scheduleIdle()
        }
        return
      }
      if (data.kind === 'detail:generic:result') {
        // Resolve the matching generic-detail request.
        const resolver = genericResolversRef.current.get(data.id)
        if (resolver) {
          resolver(data.payload)
          genericResolversRef.current.delete(data.id)
          scheduleIdle()
        }
        return
      }
      if (data.kind === 'detail:generic:error') {
        // Errors resolve to null so callers can show a fallback state.
        const resolver = genericResolversRef.current.get(data.id)
        if (resolver) {
          resolver(null)
          genericResolversRef.current.delete(data.id)
          scheduleIdle()
        }
        return
      }
      if (data.id !== activeRequestRef.current) return
      if (data.kind === 'simulate:progress') {
        // Progress updates stream intermediate results into the table.
        setResultsBySpotlightRef.current(data.payload.resultsBySpotlight)
        setProgressBySpotlightRef.current(data.payload.progressBySpotlight)
        return
      }
      if (data.kind === 'simulate:done') {
        // Completion updates finalize both results and progress.
        setResultsBySpotlightRef.current(data.payload.resultsBySpotlight)
        setProgressBySpotlightRef.current(data.payload.progressBySpotlight)
        setRunningRef.current(false)
        // Start idle countdown — worker will self-terminate if unused for DSIM_WORKER_IDLE_MS.
        scheduleIdle()
        return
      }
      if (data.kind === 'error') {
        // Worker errors fall back to a surfaced message.
        setErrorRef.current(data.error)
        setRunningRef.current(false)
        scheduleIdle()
      }
    }
    const handleError = (event: ErrorEvent | MessageEvent) => {
      // Normalize worker errors into a stable UI string.
      const payload = event instanceof ErrorEvent ? event.error : event.data
      const reason = payload instanceof Error ? payload.message : 'Dungeon simulator worker error'
      setErrorRef.current(reason)
      setRunningRef.current(false)
      scheduleIdle()
    }
    messageHandlerRef.current = handleMessage
    errorHandlerRef.current = handleError
    // Store the factory so the sim effect can create a fresh worker after idle termination.
    // Workers are created lazily on the first simulation request, not at mount.
    createWorkerRef.current = () => {
      let w: Worker | null = null
      try {
        w = new DungeonSimulatorWorker()
      } catch {
        return null
      }
      // Handlers are removed by terminateWorkerNow (via messageHandlerRef / errorHandlerRef).
      // The lint rule cannot trace through that closure, so suppress the false-positive here.
      // eslint-disable-next-line @eslint-react/web-api/no-leaked-event-listener
      w.addEventListener('message', handleMessage)
      // eslint-disable-next-line @eslint-react/web-api/no-leaked-event-listener
      w.addEventListener('error', handleError)
      // eslint-disable-next-line @eslint-react/web-api/no-leaked-event-listener
      w.addEventListener('messageerror', handleError)
      workerRef.current = w
      return w
    }
    return () => {
      // Unmount: deregister this hook's callbacks first, then terminate and release WASM memory.
      clearDsimCallbacks(pauseWorker)
      terminateWorkerNow()
    }
  }, [])

  useEffect(() => {
    // Every new dependency change resets the in-flight run.
    const id = ++activeRequestRef.current
    const prevInputs = prevInputsRef.current
    // Ensure the first visible open kicks off a full run (even under strict-mode replays).
    const hasSnapshot = Boolean(lastSnapshotRef.current.results) || Boolean(lastSnapshotRef.current.progress)
    // A refresh bump forces a full resimulation even when inputs match.
    const refreshBump = prevInputs?.refreshToken !== refreshToken
    // An evict bump fires when the rule-cache pipeline evicted the worker and the
    // queue has now drained — restart even if all other inputs are unchanged.
    const evictBump = prevInputs ? prevInputs.evictToken !== evictToken : false
    const fullReset = !prevInputs
      || prevInputs.rules !== rules
      || prevInputs.substatTargets !== substatTargets
      || prevInputs.runs !== runs
      // Mode changes must resimulate every dungeon.
      || prevInputs.mode !== mode
    const shouldRunAll = fullReset || refreshBump || evictBump || !hasSnapshot
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
      // Track refresh bumps so future comparisons can detect them.
      refreshToken,
      // Track evict bumps so pipeline-driven restarts only trigger once per signal.
      evictToken,
      ...(selections ? { selections } : {}),
      ...(boosts ? { boosts } : {}),
    }
    // No-op when only object references changed without actual edits.
    if (!shouldRunAll && dirtyDungeons.length === 0) return undefined
    // Cancel any idle-termination timer — we are about to start a new simulation.
    if (idleTimerRef.current !== null) {
      clearTimeout(idleTimerRef.current)
      idleTimerRef.current = null
    }
    // If the worker was idle-terminated, create a fresh instance before simulating.
    // The new worker shares the same stable handlers wired up in the mount effect.
    if (supportsWorkerEnv && !workerRef.current && createWorkerRef.current) {
      createWorkerRef.current()
    }
    // Use a reduced run count if workers cannot be used.
    const worker = workerRef.current
    const canUseWorker = supportsWorkerEnv && Boolean(worker)
    const effectiveRuns = canUseWorker ? runs : DUNGEON_SIM_FALLBACK_RUNS_PER_DUNGEON
    // Reset run state whenever any dependency changes.
    setErrorRef.current(null)
    setRunningRef.current(true)
    // Keep the previous results/progress until the first new batch arrives.
    if (!lastSnapshotRef.current.results) {
      setResultsBySpotlightRef.current(null)
    }
    if (!lastSnapshotRef.current.progress) {
      setProgressBySpotlightRef.current(buildEmptyProgressBySpotlight(effectiveRuns))
    }
    if (!shouldRunAll && dirtyDungeons.length > 0) {
      // Reset only the changed dungeons so other tables keep their progress.
      setProgressBySpotlightRef.current((prev) => resetProgressForDungeons(prev, dirtyDungeons, effectiveRuns))
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
      // Warmup helper ensures sync matcher calls can run in fallback mode.
      const ensureLocalWasmReady = async (): Promise<void> => {
        if (!localWasmWarmupPromiseRef.current) {
          localWasmWarmupPromiseRef.current = warmupWasmRuleEngine()
        }
        await localWasmWarmupPromiseRef.current
      }
      // Reset progress so the UI reflects the fallback run count.
      setProgressBySpotlightRef.current((prev) => prev ?? buildEmptyProgressBySpotlight(fallbackRuns))
      // Track the recursive tick timer so cleanup can cancel the pending yield.
      let tickTimer: ReturnType<typeof setTimeout> | null = null
      void ensureLocalWasmReady()
        .then(() => {
          // Bail out if a newer request replaced this fallback run.
          if (cancelled || activeRequestRef.current !== id) return
          // Reuse the previous session when only a subset of dungeons changed.
          const canReuse = !shouldRunAll && dirtyIds.length > 0 && fallbackSessionRef.current
          // Keep running all dungeons if any non-dirty entry was still incomplete.
          const shouldRunDirtyOnly = canReuse
            && !hasIncompleteOutsideDirty(fallbackSessionRef.current?.getProgressBySpotlight() ?? null, dirtyIds, fallbackRuns)
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
          // Run only the changed dungeons when every other table already completed.
          const runTargets = shouldRunDirtyOnly ? dirtyIds : undefined
          // Cache the session so detail queries can reuse the same run data.
          fallbackSessionRef.current = session
          // Throttle local updates so React isn't overwhelmed.
          const forwardProgress = createProgressThrottler((_snapshot) => {
            if (cancelled || activeRequestRef.current !== id) return
            setResultsBySpotlightRef.current(session.getResultsBySpotlight())
            setProgressBySpotlightRef.current(session.getProgressBySpotlight())
          }, { throttleMs })
          // Tick batches with time-slicing so the UI can still paint.
          const tick = () => {
            tickTimer = null
            if (cancelled || activeRequestRef.current !== id) return
            if (session.isComplete()) {
              setResultsBySpotlightRef.current(session.getResultsBySpotlight())
              setProgressBySpotlightRef.current(session.getProgressBySpotlight())
              setRunningRef.current(false)
              return
            }
            // Execute one batch, then emit progress.
            session.runBatch(safeBatchSize, runTargets)
            const progressBySpotlight = session.getProgressBySpotlight()
            const sampleSpotlight = EVENT_SPOTLIGHT_OPTIONS[0] ?? EVENT_SPOTLIGHT_DEFAULT
            const sampleProgress = progressBySpotlight[sampleSpotlight]
            if (sampleProgress) {
              // Forward the sample progress to drive the throttler clock.
              forwardProgress({ completed: sampleProgress.completed, total: sampleProgress.total })
            }
            if (session.isComplete()) {
              setResultsBySpotlightRef.current(session.getResultsBySpotlight())
              setProgressBySpotlightRef.current(session.getProgressBySpotlight())
              setRunningRef.current(false)
              return
            }
            // Yield before the next batch to keep the main thread responsive.
            tickTimer = setTimeout(tick, 0)
          }
          tick()
        })
        .catch((error) => {
          // Bubble warmup failures to the simulator error state.
          if (cancelled || activeRequestRef.current !== id) return
          setErrorRef.current(error instanceof Error ? error.message : String(error))
          setRunningRef.current(false)
        })
      return () => {
        cancelled = true
        // Cancel the pending yield timeout so tick does not fire after cleanup.
        if (tickTimer !== null) clearTimeout(tickTimer)
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
      // Guard against the worker having been idle-terminated between renders.
      if (workerRef.current === activeWorker) {
        try {
          const cancel: DungeonSimulatorWorkerRequest = { id, kind: 'cancel' }
          activeWorker.postMessage(cancel)
        } catch {
          // Worker already terminated — nothing to cancel.
        }
      }
    }
  }, [rules, substatTargets, selections, boosts, mode, refreshToken, runs, safeBatchSize, throttleMs, evictToken])

  // Return only the spotlight-selected slice to keep the UI lean.
  const results = resultsBySpotlight?.[selectedSpotlight] ?? null
  const progress = progressBySpotlight?.[selectedSpotlight] ?? null

  const requestDetailStats = (query: DungeonSimDetailQuery): Promise<DungeonSimDetailStats | null> => {
    // Prefer the worker cache when available.
    const worker = workerRef.current
    if (supportsWorkerEnv && worker) {
      // Pause the idle countdown while the query is in-flight.
      // scheduleIdle() is called again in handleMessage when the response arrives.
      if (idleTimerRef.current !== null) {
        clearTimeout(idleTimerRef.current)
        idleTimerRef.current = null
      }
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
      // Pause the idle countdown while the query is in-flight.
      if (idleTimerRef.current !== null) {
        clearTimeout(idleTimerRef.current)
        idleTimerRef.current = null
      }
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
