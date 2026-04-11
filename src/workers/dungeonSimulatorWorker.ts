/* eslint-disable import/no-unused-modules */
/// <reference lib="webworker" />

import {
  DUNGEON_IDS,
  EVENT_SPOTLIGHT_DEFAULT,
  EVENT_SPOTLIGHT_OPTIONS,
  createDungeonSimSpotlightSession,
} from '../lib/dungeonSimulator'
import {
  warmupDsimWasmRuleEngine,
  configureDsimRuleEngineWithLoadedWasm,
  evaluateDsimRuleEngineItemsWithLoadedWasm,
} from '../lib/wasm/wasmDsimRuleEngine'
import { setRuleEvalWasmBindings } from '../lib/ruleEval'
import type { DungeonId } from '../lib/dungeonSimulator'
import type {
  DungeonSimulatorWorkerRequest,
  DungeonSimulatorWorkerResponse,
} from './dungeonSimulatorWorkerTypes'
import { createProgressThrottler, PROGRESS_THROTTLE_MS } from '../types/progress'
import { ts } from '../lib/logTimestamp'

declare const self: DedicatedWorkerGlobalScope

// Compile-time flag — same pattern as ruleCacheWorker.ts; dead-code eliminated in prod.
const IS_DEV = import.meta.env.DEV

// Track the active run so newer requests can preempt older ones.
let activeRunId = 0
// Keep the latest session around for detail queries.
let cachedSession: ReturnType<typeof createDungeonSimSpotlightSession> | null = null
// Cache the warmup promise so repeated runs do not reinitialize WASM.
let wasmWarmupPromise: Promise<void> | null = null

// Ensure sync rule evaluation can run inside dungeon simulation batches.
// On failure the cached promise is cleared so the next sim request can retry.
const ensureWasmWorkerReady = async (): Promise<void> => {
  if (!wasmWarmupPromise) {
    wasmWarmupPromise = warmupDsimWasmRuleEngine().then(() => {
      // Redirect ruleEval.ts helpers to use the lean dsim binary for this worker.
      // This override is scoped to this worker's JS module — does not affect the pipeline worker.
      setRuleEvalWasmBindings({
        configure: configureDsimRuleEngineWithLoadedWasm,
        evaluate: evaluateDsimRuleEngineItemsWithLoadedWasm,
      })
    })
  }
  try {
    await wasmWarmupPromise
  } catch (error) {
    wasmWarmupPromise = null
    throw error
  }
}

// Determine whether any non-dirty dungeon still has remaining runs.
const hasIncompleteOutsideDirty = (
  session: ReturnType<typeof createDungeonSimSpotlightSession>,
  dirtyDungeons: DungeonId[],
  runsPerDungeon: number,
): boolean => {
  const dirtySet = new Set(dirtyDungeons)
  const progressBySpotlight = session.getProgressBySpotlight()
  for (const spotlight of EVENT_SPOTLIGHT_OPTIONS) {
    const progress = progressBySpotlight[spotlight]
    if (!progress) continue
    for (const dungeonId of DUNGEON_IDS) {
      if (dirtySet.has(dungeonId)) continue
      const completed = progress.completedByDungeon?.[dungeonId] ?? 0
      if (completed < runsPerDungeon) return true
    }
  }
  return false
}

// Yield back to the event loop so cancel/next-run messages can land.
// Uses MessageChannel instead of setTimeout: Chrome throttles setTimeout in
// background tabs (intensive throttling → up to 1-minute intervals), which
// would freeze the batch loop when the tab is hidden. MessageChannel messages
// are not subject to background timer throttling.
const yieldToEventLoop = (): Promise<void> => new Promise<void>((resolve) => {
  const { port1, port2 } = new MessageChannel()
  port1.onmessage = () => { port1.close(); port2.close(); resolve() }
  port2.postMessage(null)
})

// Execute a full simulation run, streaming progress as batches complete.
const runSimulation = async (message: Extract<DungeonSimulatorWorkerRequest, { kind: 'simulate' }>) => {
  const { id, payload } = message
  // Mark the newest run as active so earlier runs can self-abort.
  activeRunId = id
  if (IS_DEV) console.log(`${ts()} [sfc-dsim] sim start id=${id} rules=${payload.rules.length} runs=${payload.runs}`)
  // Warm up WASM before any sync matcher calls happen in the simulation loop.
  await ensureWasmWorkerReady()
  if (IS_DEV) console.log(`${ts()} [sfc-dsim] wasm ready id=${id}`)
  // Guard against invalid batch sizes that would stall the loop.
  const batchSize = Number.isFinite(payload.batchSize)
    ? Math.max(1, Math.floor(payload.batchSize))
    : 1
  // Reuse the cached session when only specific dungeons need to rerun.
  const dirtyDungeons = payload.dirtyDungeons?.filter((dungeonId) => dungeonId) ?? []
  const canReuse = dirtyDungeons.length > 0 && cachedSession
  const session = canReuse
    ? cachedSession!
    : createDungeonSimSpotlightSession({
      rules: payload.rules,
      substatTargets: payload.substatTargets,
      runs: payload.runs,
      ...(payload.mode ? { mode: payload.mode } : {}),
      ...(payload.boosts ? { boosts: payload.boosts } : {}),
      ...(payload.selections ? { selections: payload.selections } : {}),
      ...(payload.simulateDungeons ? { simulateDungeons: payload.simulateDungeons } : {}),
    })
  // Apply partial resets before streaming new batches.
  if (canReuse) {
    session.resetDungeons({
      dungeonIds: dirtyDungeons,
      ...(payload.mode ? { mode: payload.mode } : {}),
      ...(payload.selections ? { selections: payload.selections } : {}),
      ...(payload.boosts ? { boosts: payload.boosts } : {}),
    })
  }
  // Keep running all dungeons if any non-dirty entry was still incomplete.
  const shouldRunDirtyOnly = canReuse
    && dirtyDungeons.length > 0
    && !hasIncompleteOutsideDirty(session, dirtyDungeons, payload.runs)
  // Target only dirty dungeons when all other tables are already complete.
  const runTargets = shouldRunDirtyOnly ? dirtyDungeons : undefined
  // Cache the session for detail queries (even while streaming).
  cachedSession = session
  // Throttle progress messages to once per second by default.
  const throttleMs = payload.throttleMs ?? PROGRESS_THROTTLE_MS
  await runSessionToCompletion(id, session, batchSize, throttleMs, runTargets)
}

// Shared batch loop used by both runSimulation (fresh session) and the resume handler
// (existing cachedSession).  Streams progress until the session completes or is preempted.
const runSessionToCompletion = async (
  id: number,
  session: ReturnType<typeof createDungeonSimSpotlightSession>,
  batchSize: number,
  throttleMs: number,
  runTargets?: string[],
): Promise<void> => {
  // Progress throttler coalesces batches into a single UI update.
  const forwardProgress = createProgressThrottler((_snapshot) => {
    if (activeRunId !== id) return
    // Ship the latest snapshot so the UI can update incrementally.
    const response: DungeonSimulatorWorkerResponse = {
      id,
      kind: 'simulate:progress',
      payload: {
        resultsBySpotlight: session.getResultsBySpotlight(),
        progressBySpotlight: session.getProgressBySpotlight(),
      },
    }
    self.postMessage(response)
  }, { throttleMs })
  while (activeRunId === id && !session.isComplete()) {
    // Run the next batch and emit throttled progress.
    session.runBatch(batchSize, runTargets as import('../lib/dungeonSimulator').DungeonId[] | undefined)
    // Sample progress from any spotlight to drive the throttler clock.
    const progressBySpotlight = session.getProgressBySpotlight()
    const sampleSpotlight = EVENT_SPOTLIGHT_OPTIONS[0] ?? EVENT_SPOTLIGHT_DEFAULT
    const sampleProgress = progressBySpotlight[sampleSpotlight]
    // Throttle progress to avoid spamming the UI thread.
    if (sampleProgress) {
      forwardProgress({ completed: sampleProgress.completed, total: sampleProgress.total })
    }
    // Yield so the worker can process newer messages between batches.
    await yieldToEventLoop()
  }
  // Abort if another request superseded this one.
  if (activeRunId !== id) return
  if (IS_DEV) console.log(`${ts()} [sfc-dsim] sim done id=${id}`)
  // Emit a final "done" snapshot.
  const doneResponse: DungeonSimulatorWorkerResponse = {
    id,
    kind: 'simulate:done',
    payload: {
      resultsBySpotlight: session.getResultsBySpotlight(),
      progressBySpotlight: session.getProgressBySpotlight(),
    },
  }
  self.postMessage(doneResponse)
}

// Resume a previously paused cachedSession from where it stopped.
// Only runs if the session is still alive and has remaining work.
const runResumedSimulation = async (message: Extract<DungeonSimulatorWorkerRequest, { kind: 'resume' }>) => {
  const { id, payload } = message
  const session = cachedSession
  if (!session || session.isComplete()) {
    // Nothing to resume; hook treats a missing simulate:done as still-paused.
    return
  }
  // Mark as the active run so the batch loop guard stays consistent.
  activeRunId = id
  if (IS_DEV) console.log(`${ts()} [sfc-dsim] resume id=${id}`)
  const batchSize = Number.isFinite(payload.batchSize) ? Math.max(1, Math.floor(payload.batchSize)) : 1
  const throttleMs = payload.throttleMs ?? PROGRESS_THROTTLE_MS
  // Continue the existing session — no new session is created.
  await runSessionToCompletion(id, session, batchSize, throttleMs)
}

self.onmessage = (event: MessageEvent<DungeonSimulatorWorkerRequest>) => {
  const message = event.data
  if (!message) return
  if (message.kind === 'cancel') {
    // Cancel only the active run; newer runs can continue.
    if (activeRunId === message.id) {
      activeRunId = 0
    }
    return
  }
  if (message.kind === 'simulate') {
    // Run the simulation async so the worker can yield between batches.
    runSimulation(message).catch((error) => {
      if (activeRunId !== message.id) return
      const response: DungeonSimulatorWorkerResponse = {
        id: message.id,
        kind: 'error',
        error: error instanceof Error ? error.message : String(error),
      }
      self.postMessage(response)
    })
  }
  if (message.kind === 'resume') {
    // Resume the paused session; reuses cachedSession without creating a new one.
    runResumedSimulation(message).catch((error) => {
      if (activeRunId !== message.id) return
      const response: DungeonSimulatorWorkerResponse = {
        id: message.id,
        kind: 'error',
        error: error instanceof Error ? error.message : String(error),
      }
      self.postMessage(response)
    })
  }
  if (message.kind === 'detail:query') {
    // Detail requests read from the cached session state.
    if (!cachedSession) {
      const response: DungeonSimulatorWorkerResponse = {
        id: message.id,
        kind: 'detail:error',
        error: 'Dungeon simulator detail data is not ready yet.',
      }
      self.postMessage(response)
      return
    }
    try {
      // Query is pure; no extra simulation runs are triggered here.
      const payload = cachedSession.queryDetailStats(message.payload)
      const response: DungeonSimulatorWorkerResponse = {
        id: message.id,
        kind: 'detail:result',
        payload,
      }
      self.postMessage(response)
    } catch (error) {
      const response: DungeonSimulatorWorkerResponse = {
        id: message.id,
        kind: 'detail:error',
        error: error instanceof Error ? error.message : String(error),
      }
      self.postMessage(response)
    }
  }
  if (message.kind === 'detail:generic') {
    // Generic detail requests read from the cached session state.
    if (!cachedSession) {
      const response: DungeonSimulatorWorkerResponse = {
        id: message.id,
        kind: 'detail:generic:error',
        error: 'Dungeon simulator detail data is not ready yet.',
      }
      self.postMessage(response)
      return
    }
    try {
      // Query is pure; no extra simulation runs are triggered here.
      const payload = cachedSession.queryGenericStats(message.payload)
      const response: DungeonSimulatorWorkerResponse = {
        id: message.id,
        kind: 'detail:generic:result',
        payload,
      }
      self.postMessage(response)
    } catch (error) {
      const response: DungeonSimulatorWorkerResponse = {
        id: message.id,
        kind: 'detail:generic:error',
        error: error instanceof Error ? error.message : String(error),
      }
      self.postMessage(response)
    }
  }
}

export {}
