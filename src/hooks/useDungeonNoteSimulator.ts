import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import DungeonSimulatorWorker from '../workers/dungeonSimulatorWorker?worker&inline'
import {
  DUNGEON_SIM_BATCH_SIZE,
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

// Reduced run count tuned for the compact summary table: fast updates at the
// cost of slightly noisier percentages, which 1-decimal display absorbs well.
export const NOTE_SIM_RUNS = 2000 as const

// Dragon + Fire Knight sub-set for boost configs (Ice Golem excluded there).
const NOTE_SIM_DUNGEONS_FK_DRAGON: readonly DungeonId[] = ['dragon', 'fireKnight'] as const
// Full set including Ice Golem for the no-boost configs.
const NOTE_SIM_DUNGEONS_ALL: readonly DungeonId[] = ['dragon', 'fireKnight', 'iceGolem'] as const

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
    // Dragon Normal 20 + FK Normal 20 + Ice Golem Normal 20, no boost
    id: 'n20-off',
    selections: {
      dragon: { mode: 'normal', stage: 20 } as DungeonStageSelection,
      fireKnight: { mode: 'normal', stage: 20 } as DungeonStageSelection,
      iceGolem: { mode: 'normal', stage: 20 } as DungeonStageSelection,
    },
    boosts: {},
    simulateDungeons: NOTE_SIM_DUNGEONS_ALL,
    dragonFocusSetId: null,
    fireKnightFocusSetId: null,
    iceGolemFocusSetId: null,
  },
  {
    // Dragon Normal 25 + FK Normal 25 + Ice Golem Normal 25, no boost
    id: 'n25-off',
    selections: {
      dragon: { mode: 'normal', stage: 25 } as DungeonStageSelection,
      fireKnight: { mode: 'normal', stage: 25 } as DungeonStageSelection,
      iceGolem: { mode: 'normal', stage: 25 } as DungeonStageSelection,
    },
    boosts: {},
    simulateDungeons: NOTE_SIM_DUNGEONS_ALL,
    dragonFocusSetId: null,
    fireKnightFocusSetId: null,
    iceGolemFocusSetId: null,
  },
  {
    // Dragon Hard 10 + FK Hard 10 + Ice Golem Hard 10, no boost
    id: 'h10-off',
    selections: {
      dragon: { mode: 'hard', stage: 10 } as DungeonStageSelection,
      fireKnight: { mode: 'hard', stage: 10 } as DungeonStageSelection,
      iceGolem: { mode: 'hard', stage: 10 } as DungeonStageSelection,
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
  // When false, any running simulation is cancelled and new runs are blocked.
  // Flip to true once the rule cache pipeline finishes so simulation sees stable rules.
  enabled: boolean
  runs?: number
  batchSize?: number
  throttleMs?: number
}

export type UseDungeonNoteSimulatorResult = {
  // Final/latest results per config id.
  resultsByConfig: DungeonNoteSimResults
  // 0-based index of the config currently being simulated (equals NOTE_SIM_CONFIGS.length when done).
  configIndex: number
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
    enabled,
    runs = NOTE_SIM_RUNS,
    batchSize = DUNGEON_SIM_BATCH_SIZE,
    throttleMs = PROGRESS_THROTTLE_MS,
  } = params

  // ─── React state for renders ────────────────────────────────────────────────
  const [resultsByConfig, setResultsByConfig] = useState<DungeonNoteSimResults>(() => new Map())
  const [configIndex, setConfigIndex] = useState(0)
  const [running, setRunning] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // ─── Setter refs so async callbacks never capture stale closures ─────────────
  const setResultsByConfigRef = useRef(setResultsByConfig)
  const setConfigIndexRef = useRef(setConfigIndex)
  const setRunningRef = useRef(setRunning)
  const setErrorRef = useRef(setError)

  // ─── Operational refs ────────────────────────────────────────────────────────
  // Worker instance for the lifetime of this hook.
  const workerRef = useRef<Worker | null>(null)
  // Monotonically increasing request id for stale-message rejection.
  const activeRequestRef = useRef(0)
  // Which config index the worker is currently running (mirrors state in closure-safe form).
  const configIndexRef = useRef(0)
  // Latest accumulated results (mirrors state without triggering re-renders).
  const resultsByConfigRef = useRef<DungeonNoteSimResults>(new Map())
  // Stable snapshot of the current rules/substatTargets for the message sender.
  const rulesRef = useRef(rules)
  const substatTargetsRef = useRef(substatTargets)
  const runsRef = useRef(runs)
  const batchSizeRef = useRef(batchSize)
  const throttleMsRef = useRef(throttleMs)
  // Track previous inputs to detect changes.
  const prevInputsRef = useRef<{
    rules: HsfRuleWithRecipe[]
    substatTargets: SubstatTargetTable
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
    batchSizeRef.current = batchSize
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
    setResultsByConfigRef.current(new Map())
    setConfigIndexRef.current(0)
    setRunningRef.current(false)

    // Send the next config in the sequence to the worker.
    const sendConfig = (id: number, idx: number) => {
      const cfg = NOTE_SIM_CONFIGS[idx]
      if (!cfg || !workerRef.current) return
      const hasBoosts = Object.keys(cfg.boosts).length > 0
      const payload: DungeonSimulatorWorkerRequest = {
        id,
        kind: 'simulate',
        payload: {
          rules: rulesRef.current,
          substatTargets: substatTargetsRef.current,
          // No dirtyDungeons → worker creates a fresh session for this config.
          runs: runsRef.current,
          batchSize: Math.max(1, Math.floor(batchSizeRef.current)),
          throttleMs: throttleMsRef.current,
          mode: 'levelUp',
          selections: cfg.selections,
          // Only include boosts key when the config actually has boosts set.
          ...(hasBoosts ? { boosts: cfg.boosts } : {}),
          // Use per-config dungeon list (off configs include Ice Golem; boost configs do not).
          simulateDungeons: cfg.simulateDungeons,
        },
      }
      workerRef.current.postMessage(payload)
    }

    const handleMessage = (event: MessageEvent<DungeonSimulatorWorkerResponse>) => {
      const data = event.data
      if (!data) return
      // Only handle detail queries that match any pending request.
      // (detail queries are not used in this hook, so only simulate responses matter.)
      if (data.id !== activeRequestRef.current) return

      if (data.kind === 'simulate:progress') {
        // Update intermediate results for the currently running config.
        const cfgId = NOTE_SIM_CONFIGS[configIndexRef.current]?.id
        if (cfgId) {
          const next = new Map(resultsByConfigRef.current)
          next.set(cfgId, data.payload.resultsBySpotlight)
          resultsByConfigRef.current = next
          setResultsByConfigRef.current(new Map(next))
        }
        return
      }

      if (data.kind === 'simulate:done') {
        // Store final results for the completed config.
        const cfgId = NOTE_SIM_CONFIGS[configIndexRef.current]?.id
        if (cfgId) {
          const next = new Map(resultsByConfigRef.current)
          next.set(cfgId, data.payload.resultsBySpotlight)
          resultsByConfigRef.current = next
          setResultsByConfigRef.current(new Map(next))
        }
        // Advance to the next config.
        const nextIdx = configIndexRef.current + 1
        configIndexRef.current = nextIdx
        setConfigIndexRef.current(nextIdx)
        if (nextIdx < NOTE_SIM_CONFIGS.length) {
          // Queue the next config using the same request id.
          sendConfig(data.id, nextIdx)
        } else {
          // All configs done.
          setRunningRef.current(false)
        }
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
    // Restart is handled by the enabled=!pipelineRunning prop: when pipelineRunning
    // becomes false, the control effect re-enables the sim and restarts from config 0.
    const pauseNoteSim = () => {
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

    // Detect whether inputs or the enabled flag changed in ways that require a restart.
    const rulesChanged = !prevInputs || prevInputs.rules !== rules
    const substatChanged = !prevInputs || prevInputs.substatTargets !== substatTargets
    const runsChanged = !prevInputs || prevInputs.runs !== runs
    const wasEnabled = prevInputs?.enabled ?? false

    // Persist inputs for the next comparison.
    prevInputsRef.current = { rules, substatTargets, runs, enabled }

    if (!enabled) {
      // Cancel any in-flight worker run.
      if (workerRef.current) {
        workerRef.current.postMessage({ id, kind: 'cancel' } satisfies DungeonSimulatorWorkerRequest)
      }
      // Always clear running state when disabled, even if nothing was running.
      setRunningRef.current(false)
      return
    }

    // Skip no-op: enabled was already true and nothing changed.
    const reenabled = !wasEnabled && enabled
    if (!reenabled && !rulesChanged && !substatChanged && !runsChanged) return

    // ─── Start / restart ─────────────────────────────────────────────────────
    // Reset all accumulated results and start from config 0.
    configIndexRef.current = 0
    resultsByConfigRef.current = new Map()
    setConfigIndexRef.current(0)
    setResultsByConfigRef.current(new Map())
    setErrorRef.current(null)
    setRunningRef.current(true)

    const worker = workerRef.current

    if (!supportsWorkerEnv || !worker) {
      // Worker unavailable: show not-running rather than hanging.
      setRunningRef.current(false)
      return
    }

    // Worker path: send first config; subsequent configs are queued in the message handler.
    const firstCfg = NOTE_SIM_CONFIGS[0]
    if (!firstCfg) return
    const firstHasBoosts = Object.keys(firstCfg.boosts).length > 0
    const payload: DungeonSimulatorWorkerRequest = {
      id,
      kind: 'simulate',
      payload: {
        rules,
        substatTargets,
        runs,
        batchSize: Math.max(1, Math.floor(batchSize)),
        throttleMs,
        mode: 'levelUp',
        selections: firstCfg.selections,
        ...(firstHasBoosts ? { boosts: firstCfg.boosts } : {}),
        // Use per-config dungeon list (off configs include Ice Golem; boost configs do not).
        simulateDungeons: firstCfg.simulateDungeons,
      },
    }
    worker.postMessage(payload)
  }, [rules, substatTargets, enabled, runs, batchSize, throttleMs])

  return {
    resultsByConfig,
    configIndex,
    totalConfigs: NOTE_SIM_CONFIGS.length,
    running,
    error,
  }
}
