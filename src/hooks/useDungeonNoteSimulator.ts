import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import DungeonSimulatorWorker from '../workers/dungeonSimulatorWorker?worker&inline'
import {
  type DungeonBoostableId,
  type DungeonId,
  type DungeonSimSpotlightResults,
  type DungeonStageSelection,
  type DungeonBoostSelection,
} from '../lib/dungeonSimulator'
import { ArtifactSet } from '../lib/artifactSets'
import type { HsfRuleWithRecipe } from '../lib/merge'
import type { SubstatTargetTable } from '../lib/hsfBuilder/types'
import type { ArtifactSetId } from '../lib/types'
import type {
  DungeonSimulatorWorkerRequest,
  DungeonSimulatorWorkerResponse,
} from '../workers/dungeonSimulatorWorkerTypes'
import { PROGRESS_THROTTLE_MS } from '../types/progress'
import { registerDsimCallbacks, clearDsimCallbacks } from '../lib/wasmWorkerSlot'

// ─── Note-sim constants ───────────────────────────────────────────────────────

// Run count per config. Higher than the old 2000 for tighter percentages; the
// round-robin scheduler keeps the UI responsive despite the larger total because
// all configs advance in lockstep slices rather than one config running to the end.
export const NOTE_SIM_RUNS = 2500 as const

// Runs advanced per config per round-robin round. Each round, every config runs this
// many runs and then ALL 18 columns update together, so the table refines simultaneously
// rather than block-by-block. 500 → ~5 update rounds across the full 2500-run budget
// (leanest: fewest snapshots/merges, coarser stepping, fastest to final numbers).
export const NOTE_SIM_SLICE_RUNS = 500 as const

// Delay before a user-driven (re)start actually sends to the worker. Set just above the
// pipeline debounce (PIPELINE_DEBOUNCE_MS = 200 in App.tsx) so a user override edit — which
// also triggers the rule-cache pipeline — coalesces into a single post-pipeline start instead
// of starting a run that the pipeline immediately pauses and discards. Mid-run re-enables
// (already past the pipeline) bypass this and start immediately.
export const NOTE_SIM_START_DEBOUNCE_MS = 300 as const

// Dragon + Fire Knight sub-set for boost configs (Ice Golem / Spider excluded there).
const NOTE_SIM_DUNGEONS_FK_DRAGON: readonly DungeonId[] = ['dragon', 'fireKnight'] as const
// Full set including Ice Golem + Spider for the no-boost configs.
const NOTE_SIM_DUNGEONS_ALL: readonly DungeonId[] = ['dragon', 'fireKnight', 'iceGolem', 'spider'] as const

// ─── Config type ─────────────────────────────────────────────────────────────

// A single simulation configuration: one dungeon stage+boost combination.
// The hook runs all NOTE_SIM_CONFIGS sequentially through a single worker.
export type DungeonNoteConfig = {
  // Stable key used to look up results in the result map.
  id: string
  // Per-dungeon stage selections; dragon, fireKnight, and optionally iceGolem.
  selections: Partial<Record<DungeonId, DungeonStageSelection>>
  // Per-dungeon boost selections; empty object means no boost.
  boosts: Partial<Record<DungeonBoostableId, DungeonBoostSelection>>
  // Dungeons to simulate for this config; varies so Ice Golem is only run for off configs.
  simulateDungeons: readonly DungeonId[]
  // For dragon columns with boost: show only this set's keep chance.
  // null = aggregate across all dragon sets.
  dragonFocusSetId: ArtifactSetId | null
  // For fire knight columns with boost: show only this set's keep chance.
  // null = aggregate across all fire knight sets.
  fireKnightFocusSetId: ArtifactSetId | null
  // Ice Golem is always aggregate (no focus set, no boost columns).
  iceGolemFocusSetId: null
}

// Results map keyed by config id.
export type DungeonNoteSimResults = Map<string, DungeonSimSpotlightResults>

// ─── Hardcoded 6 configs ─────────────────────────────────────────────────────

// Each entry covers dragon, fire knight, and (for no-boost configs) Ice Golem.
// Configs 0–2: no boost → aggregate keep chance for all three dungeons.
// Configs 3–5: 3× boost → dragon shows Speed set only; FK shows Savage set only;
//              Ice Golem omitted (no boost applies and re-running is redundant).
// ArtifactSet.Speed = 4, ArtifactSet.Savage = 19 (see artifactSets.ts).
export const NOTE_SIM_CONFIGS: readonly DungeonNoteConfig[] = [
  {
    // Dragon Normal 20 + FK Normal 20 + Ice Golem Normal 20 + Spider Normal 20, no boost
    id: 'n20-off',
    selections: {
      dragon: { mode: 'normal', stage: 20 } as DungeonStageSelection,
      fireKnight: { mode: 'normal', stage: 20 } as DungeonStageSelection,
      iceGolem: { mode: 'normal', stage: 20 } as DungeonStageSelection,
      spider: { mode: 'normal', stage: 20 } as DungeonStageSelection,
    },
    boosts: {},
    simulateDungeons: NOTE_SIM_DUNGEONS_ALL,
    dragonFocusSetId: null,
    fireKnightFocusSetId: null,
    iceGolemFocusSetId: null,
  },
  {
    // Dragon Normal 25 + FK Normal 25 + Ice Golem Normal 25 + Spider Normal 25, no boost
    id: 'n25-off',
    selections: {
      dragon: { mode: 'normal', stage: 25 } as DungeonStageSelection,
      fireKnight: { mode: 'normal', stage: 25 } as DungeonStageSelection,
      iceGolem: { mode: 'normal', stage: 25 } as DungeonStageSelection,
      spider: { mode: 'normal', stage: 25 } as DungeonStageSelection,
    },
    boosts: {},
    simulateDungeons: NOTE_SIM_DUNGEONS_ALL,
    dragonFocusSetId: null,
    fireKnightFocusSetId: null,
    iceGolemFocusSetId: null,
  },
  {
    // Dragon Hard 10 + FK Hard 10 + Ice Golem Hard 10 + Spider Hard 10, no boost
    id: 'h10-off',
    selections: {
      dragon: { mode: 'hard', stage: 10 } as DungeonStageSelection,
      fireKnight: { mode: 'hard', stage: 10 } as DungeonStageSelection,
      iceGolem: { mode: 'hard', stage: 10 } as DungeonStageSelection,
      spider: { mode: 'hard', stage: 10 } as DungeonStageSelection,
    },
    boosts: {},
    simulateDungeons: NOTE_SIM_DUNGEONS_ALL,
    dragonFocusSetId: null,
    fireKnightFocusSetId: null,
    iceGolemFocusSetId: null,
  },
  {
    // Dragon Normal 20 (3× Speed) + FK Normal 20 (3× Savage) — no Ice Golem
    id: 'n20-3x',
    selections: {
      dragon: { mode: 'normal', stage: 20 } as DungeonStageSelection,
      fireKnight: { mode: 'normal', stage: 20 } as DungeonStageSelection,
    },
    boosts: {
      dragon: { mode: '3x', setId: ArtifactSet.Speed as ArtifactSetId },
      fireKnight: { mode: '3x', setId: ArtifactSet.Savage as ArtifactSetId },
    },
    simulateDungeons: NOTE_SIM_DUNGEONS_FK_DRAGON,
    dragonFocusSetId: ArtifactSet.Speed as ArtifactSetId,
    fireKnightFocusSetId: ArtifactSet.Savage as ArtifactSetId,
    iceGolemFocusSetId: null,
  },
  {
    // Dragon Normal 25 (3× Speed) + FK Normal 25 (3× Savage) — no Ice Golem
    id: 'n25-3x',
    selections: {
      dragon: { mode: 'normal', stage: 25 } as DungeonStageSelection,
      fireKnight: { mode: 'normal', stage: 25 } as DungeonStageSelection,
    },
    boosts: {
      dragon: { mode: '3x', setId: ArtifactSet.Speed as ArtifactSetId },
      fireKnight: { mode: '3x', setId: ArtifactSet.Savage as ArtifactSetId },
    },
    simulateDungeons: NOTE_SIM_DUNGEONS_FK_DRAGON,
    dragonFocusSetId: ArtifactSet.Speed as ArtifactSetId,
    fireKnightFocusSetId: ArtifactSet.Savage as ArtifactSetId,
    iceGolemFocusSetId: null,
  },
  {
    // Dragon Hard 10 (3× Speed) + FK Hard 10 (3× Savage) — no Ice Golem
    id: 'h10-3x',
    selections: {
      dragon: { mode: 'hard', stage: 10 } as DungeonStageSelection,
      fireKnight: { mode: 'hard', stage: 10 } as DungeonStageSelection,
    },
    boosts: {
      dragon: { mode: '3x', setId: ArtifactSet.Speed as ArtifactSetId },
      fireKnight: { mode: '3x', setId: ArtifactSet.Savage as ArtifactSetId },
    },
    simulateDungeons: NOTE_SIM_DUNGEONS_FK_DRAGON,
    dragonFocusSetId: ArtifactSet.Speed as ArtifactSetId,
    fireKnightFocusSetId: ArtifactSet.Savage as ArtifactSetId,
    iceGolemFocusSetId: null,
  },
] as const

// ─── Worker env guard ─────────────────────────────────────────────────────────

// Prevent SSR and legacy browsers from attempting worker construction.
const supportsWorkerEnv = typeof window !== 'undefined' && typeof Worker !== 'undefined'

// ─── Hook ─────────────────────────────────────────────────────────────────────

type UseDungeonNoteSimulatorParams = {
  rules: HsfRuleWithRecipe[]
  substatTargets: SubstatTargetTable
  // Monotonic counter advanced ONLY by user-driven override edits. This — not the
  // identity of `rules`/`substatTargets` — is the restart trigger. Background endpoint
  // pushes regenerate `rules` (possibly with new sim-relevant content) without bumping
  // the epoch, so they never restart the sim; the latest rules are still picked up by
  // the *next* user-triggered restart because they are read live at send time.
  userOverrideEpoch: number
  // When false, any running simulation is cancelled and new runs are blocked.
  // Flip to true once the rule cache pipeline finishes so simulation sees stable rules.
  enabled: boolean
  runs?: number
  throttleMs?: number
}

export type UseDungeonNoteSimulatorResult = {
  // Final/latest results per config id. With round-robin, all configs are populated together.
  resultsByConfig: DungeonNoteSimResults
  // Always NOTE_SIM_CONFIGS.length (6) — exposed so components can compute progress.
  totalConfigs: number
  running: boolean
  error: string | null
}

export function useDungeonNoteSimulator(
  params: UseDungeonNoteSimulatorParams,
): UseDungeonNoteSimulatorResult {
  const {
    rules,
    substatTargets,
    userOverrideEpoch,
    enabled,
    runs = NOTE_SIM_RUNS,
    throttleMs = PROGRESS_THROTTLE_MS,
  } = params

  // ─── React state for renders ────────────────────────────────────────────────
  const [resultsByConfig, setResultsByConfig] = useState<DungeonNoteSimResults>(() => new Map())
  const [running, setRunning] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // ─── Setter refs so async callbacks never capture stale closures ─────────────
  const setResultsByConfigRef = useRef(setResultsByConfig)
  const setRunningRef = useRef(setRunning)
  const setErrorRef = useRef(setError)

  // ─── Operational refs ────────────────────────────────────────────────────────
  // Worker instance for the lifetime of this hook.
  const workerRef = useRef<Worker | null>(null)
  // Monotonically increasing request id for stale-message rejection.
  const activeRequestRef = useRef(0)
  // Pending debounced-start timer handle (null when no start is queued).
  const startTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  // Latest accumulated results (mirrors state without triggering re-renders).
  const resultsByConfigRef = useRef<DungeonNoteSimResults>(new Map())
  // True once all configs have finished. Distinguishes a completed run (which a
  // background push-pause must NOT restart) from a mid-run pause (which restarts fresh
  // so the resumed run stays internally consistent). Reset to false on every fresh start.
  const completedRef = useRef(false)
  // A user-driven (re)start is owed but not yet started. Set when a user override edit (epoch)
  // or runs change is observed; cleared only when a run ACTUALLY starts. Crucially it survives
  // a pause: the same edit that bumps the epoch also triggers the rule-cache pipeline, which
  // pauses the sim before the debounced start fires — without this latch the owed start would be
  // lost (the epoch comparison already advanced), so the table would never refresh after the edit.
  const pendingRestartRef = useRef(false)
  // Stable snapshot of the current rules/substatTargets for the message sender.
  const rulesRef = useRef(rules)
  const substatTargetsRef = useRef(substatTargets)
  const runsRef = useRef(runs)
  const throttleMsRef = useRef(throttleMs)
  // Track previous restart-relevant inputs. Deliberately excludes rules/substatTargets:
  // those are read live (via refs) at send time but never compared here, so background
  // pushes that only churn their reference/content cannot trigger a restart.
  const prevInputsRef = useRef<{
    epoch: number
    runs: number
    enabled: boolean
  } | null>(null)

  // ─── Keep param refs fresh ───────────────────────────────────────────────────
  // useLayoutEffect fires synchronously after DOM paint but before useEffect,
  // so message handlers that read these refs in async worker callbacks see current values.
  useLayoutEffect(() => {
    rulesRef.current = rules
    substatTargetsRef.current = substatTargets
    runsRef.current = runs
    throttleMsRef.current = throttleMs
  })

  // ─── Worker setup (mount/unmount) ────────────────────────────────────────────
  useEffect(() => {
    if (!supportsWorkerEnv) return

    let worker: Worker | null = null
    try {
      worker = new DungeonSimulatorWorker()
      workerRef.current = worker
    } catch {
      workerRef.current = null
      return
    }

    // Reset simulation state so the control effect below treats this as a fresh mount.
    // React StrictMode invokes effects twice (mount → cleanup → remount) in development;
    // resetting here ensures the second invocation's control effect doesn't skip startup
    // because prevInputsRef still holds values from the first (cleaned-up) invocation.
    prevInputsRef.current = null
    // A fresh mount has no completed run to protect; clear so the first control-effect
    // pass treats startup as a normal (re)start rather than a completed run to leave alone.
    completedRef.current = false
    // No owed restart carries across a remount.
    pendingRestartRef.current = false
    setResultsByConfigRef.current(new Map())
    setRunningRef.current(false)

    // Merge a multi-config snapshot (every config's results) into hook state in one shot,
    // so all 18 columns update together. Overwrite-in-place: prior numbers stay visible and
    // are replaced cell-by-cell as the worker streams refined values — no blank flash.
    const applyMultiSnapshot = (resultsByConfig: Record<string, DungeonSimSpotlightResults>) => {
      const next: DungeonNoteSimResults = new Map(resultsByConfigRef.current)
      for (const [cfgId, results] of Object.entries(resultsByConfig)) next.set(cfgId, results)
      resultsByConfigRef.current = next
      setResultsByConfigRef.current(new Map(next))
    }

    const handleMessage = (event: MessageEvent<DungeonSimulatorWorkerResponse>) => {
      const data = event.data
      if (!data) return
      // Ignore messages from superseded runs.
      if (data.id !== activeRequestRef.current) return

      if (data.kind === 'simulate:multi:progress') {
        // One round completed — refresh all configs' columns at once.
        applyMultiSnapshot(data.payload.resultsByConfig)
        return
      }

      if (data.kind === 'simulate:multi:done') {
        // Final round — apply the completed results and mark the run complete so a later
        // push-pause re-enable does not restart a finished sim.
        applyMultiSnapshot(data.payload.resultsByConfig)
        completedRef.current = true
        setRunningRef.current(false)
        return
      }

      if (data.kind === 'error') {
        setErrorRef.current(data.error)
        setRunningRef.current(false)
      }
    }

    const handleError = (event: ErrorEvent | MessageEvent) => {
      const payload = event instanceof ErrorEvent ? event.error : event.data
      const msg = payload instanceof Error ? payload.message : 'Dungeon note simulator worker error'
      setErrorRef.current(msg)
      setRunningRef.current(false)
    }

    worker.addEventListener('message', handleMessage)
    worker.addEventListener('error', handleError)
    worker.addEventListener('messageerror', handleError)

    // Soft-pause: send cancel to the worker immediately.
    // This fires synchronously in pauseAllDsimWorkers() — before React has propagated
    // pipelineRunning=true — so the worker stops before the pipeline's WASM peak.
    // Re-enable is handled by the enabled=!pipelineRunning prop: when pipelineRunning
    // becomes false, the control effect restarts ONLY if the run was still mid-flight
    // (or a user override edit landed during the pause). A run that had already completed
    // is left untouched — background pushes never restart a completed sim.
    const pauseNoteSim = () => {
      // Drop a start that was waiting out the debounce so the pause is not undone by a
      // timer that fires mid-pipeline.
      if (startTimerRef.current !== null) {
        clearTimeout(startTimerRef.current)
        startTimerRef.current = null
      }
      const w = workerRef.current
      if (!w) return
      const id = activeRequestRef.current
      w.postMessage({ id, kind: 'cancel' } satisfies DungeonSimulatorWorkerRequest)
      setRunningRef.current(false)
    }

    // No-op: the enabled=!pipelineRunning prop already handles restart after the pipeline.
    // Implementing resume here would conflict with the reenabled path in the control effect.
    const onPipelineDone = (_rulesChanged: boolean) => {}

    // Register with the mutual-exclusion slot so the rule-cache pipeline can
    // pause this sim before its own WASM peak allocations.
    registerDsimCallbacks(pauseNoteSim, onPipelineDone)

    return () => {
      clearDsimCallbacks(pauseNoteSim)
      // Cancel any pending debounced start so it cannot fire after unmount.
      if (startTimerRef.current !== null) {
        clearTimeout(startTimerRef.current)
        startTimerRef.current = null
      }
      worker.removeEventListener('message', handleMessage)
      worker.removeEventListener('error', handleError)
      worker.removeEventListener('messageerror', handleError)
      worker.terminate()
      workerRef.current = null
    }
  }, [])

  // ─── Simulation control (start / cancel) ─────────────────────────────────────
  useEffect(() => {
    // Bump request id so stale messages are ignored regardless of path.
    const id = ++activeRequestRef.current
    const prevInputs = prevInputsRef.current

    // Detect whether a restart is warranted. The override epoch — not the identity of
    // rules/substatTargets — is the content trigger: it advances only on user override
    // edits, so background endpoint pushes (which regenerate `rules`) never restart here.
    const epochChanged = !prevInputs || prevInputs.epoch !== userOverrideEpoch
    const runsChanged = !prevInputs || prevInputs.runs !== runs
    const wasEnabled = prevInputs?.enabled ?? false
    // Record the latest inputs for the next comparison (always — even while disabled — so the
    // same epoch is not re-detected as a change on every later render during a pause).
    prevInputsRef.current = { epoch: userOverrideEpoch, runs, enabled }

    // A user override edit (epoch) or a runs change owes a fresh run. Latch it so the owed
    // start survives a pause and a re-render: it is only cleared when a run actually starts.
    if (epochChanged || runsChanged) {
      pendingRestartRef.current = true
      // Invalidate the table IMMEDIATELY so the stale numbers do not linger while the pipeline
      // recomputes — clearing the results map makes every column render its skeleton. The run
      // itself is deferred until the pipeline finishes (enabled flips back true), below.
      completedRef.current = false
      resultsByConfigRef.current = new Map()
      setResultsByConfigRef.current(new Map())
      setErrorRef.current(null)
    }

    // Helper: cancel a queued debounced start (used by both pause and supersede paths).
    const clearStartTimer = () => {
      if (startTimerRef.current !== null) {
        clearTimeout(startTimerRef.current)
        startTimerRef.current = null
      }
    }

    if (!enabled) {
      // Paused (e.g. rule-cache pipeline running). Cancel the in-flight run and any queued
      // start, but KEEP pendingRestartRef: an owed user restart must still fire once the
      // pipeline finishes and the sim re-enables.
      clearStartTimer()
      if (workerRef.current) {
        workerRef.current.postMessage({ id, kind: 'cancel' } satisfies DungeonSimulatorWorkerRequest)
      }
      setRunningRef.current(false)
      return
    }

    // Re-enable after a pause (e.g. the rule-cache pipeline finished). This fires on every
    // background push that ran the pipeline, so it must NOT blanket-restart: a run that had
    // already completed before the pause is left untouched (pushes never restart a completed
    // run); only a run interrupted mid-flight is restarted so the resumed run stays internally
    // consistent (a push may have changed rules, and configs are read live at send time).
    const reenabled = !wasEnabled && enabled
    const reenabledMidRun = reenabled && !completedRef.current && !pendingRestartRef.current

    // Skip no-op: no owed user restart, and not resuming an interrupted run.
    if (!pendingRestartRef.current && !reenabledMidRun) return

    // A new decision supersedes a start that was waiting out the debounce.
    clearStartTimer()

    // Send a single multi-config round-robin run to the worker. Reads rules/substatTargets
    // live at call time so the freshest pipeline output is used. Clears the owed-restart latch
    // and resets accumulators; the table already shows skeletons from the invalidate above.
    const startRun = () => {
      if (activeRequestRef.current !== id) return
      const worker = workerRef.current
      pendingRestartRef.current = false
      completedRef.current = false
      resultsByConfigRef.current = new Map()
      setResultsByConfigRef.current(new Map())
      setErrorRef.current(null)
      setRunningRef.current(true)
      if (!supportsWorkerEnv || !worker) {
        // Worker unavailable: show not-running rather than hanging.
        setRunningRef.current(false)
        return
      }
      // One message carries every config; the worker round-robins them and streams a
      // snapshot covering all 18 columns per round.
      const payload: DungeonSimulatorWorkerRequest = {
        id,
        kind: 'simulate:multi',
        payload: {
          rules: rulesRef.current,
          substatTargets: substatTargetsRef.current,
          mode: 'levelUp',
          runs: runsRef.current,
          sliceRuns: NOTE_SIM_SLICE_RUNS,
          throttleMs: throttleMsRef.current,
          configs: NOTE_SIM_CONFIGS.map((cfg) => ({
            id: cfg.id,
            selections: cfg.selections,
            boosts: cfg.boosts,
            simulateDungeons: cfg.simulateDungeons,
          })),
        },
      }
      worker.postMessage(payload)
    }

    // A user override edit also triggers the rule-cache pipeline (debounced ~200ms), which
    // would pause+cancel a sim started right now and then restart it post-pipeline — the
    // initial run is pure waste and flickers. Debounce the user-driven start past the pipeline
    // debounce so the edit coalesces into ONE start after the pipeline settles. A mid-run
    // re-enable (already past the pipeline, nothing owed) starts immediately.
    if (reenabledMidRun) {
      startRun()
    } else {
      startTimerRef.current = setTimeout(() => {
        startTimerRef.current = null
        startRun()
      }, NOTE_SIM_START_DEBOUNCE_MS)
    }
    // rules/substatTargets/throttleMs are intentionally NOT deps: they are read live via refs
    // at send time (see useLayoutEffect above). Restarts are driven solely by user override
    // edits (userOverrideEpoch), the runs count, and the enabled gate — so a background push
    // that only updates `rules` re-renders without re-entering this effect.
  }, [userOverrideEpoch, enabled, runs])

  return {
    resultsByConfig,
    totalConfigs: NOTE_SIM_CONFIGS.length,
    running,
    error,
  }
}
