import type { HsfRuleWithRecipe } from '../lib/merge'
import type { SubstatTargetTable } from '../lib/hsfBuilder/types'
import type {
  DungeonBoostableId,
  DungeonBoostSelection,
  DungeonId,
  DungeonSimGenericQuery,
  DungeonSimGenericStats,
  DungeonSimDetailQuery,
  DungeonSimDetailStats,
  DungeonSimMode,
  DungeonSimSpotlightProgress,
  DungeonSimSpotlightResults,
  DungeonStageSelection,
} from '../lib/dungeonSimulator'

// Run payload includes everything needed to build a fresh simulator session.
export type DungeonSimulatorWorkerRunPayload = {
  // Fully merged rules from the Logic Hub.
  rules: HsfRuleWithRecipe[]
  // Substat thresholds for roll simulation.
  substatTargets: SubstatTargetTable
  // Optional per-dungeon stage selections.
  selections?: Partial<Record<DungeonId, DungeonStageSelection>>
  // Optional per-dungeon boosted set selections.
  boosts?: Partial<Record<DungeonBoostableId, DungeonBoostSelection>>
  // Optional list of dungeons to resimulate (others reuse cached results).
  dirtyDungeons?: DungeonId[]
  // Simulation mode (snapshot vs level-up).
  mode?: DungeonSimMode
  // Optional list of dungeons to simulate; omitted = all 5 (default behavior).
  simulateDungeons?: readonly DungeonId[]
  // Total runs per dungeon for this session.
  runs: number
  // Batch size for streaming updates.
  batchSize: number
  // Throttle duration for progress messages.
  throttleMs: number
}

// Progress messages ship a snapshot of results plus progress metadata.
export type DungeonSimulatorWorkerProgressPayload = {
  // Results keyed by spotlight set.
  resultsBySpotlight: DungeonSimSpotlightResults
  // Progress keyed by spotlight set.
  progressBySpotlight: DungeonSimSpotlightProgress
}

// ─── Multi-config (note-sim round-robin) ─────────────────────────────────────

// One config in a multi-config run: a stable id plus its stage/boost/dungeon selection.
// Mirrors the per-config descriptor the note-sim hook owns (DungeonNoteConfig), minus the
// UI-only focus-set fields the worker does not need.
export type DungeonSimulatorWorkerConfig = {
  // Stable key used to look results up in the per-config map.
  id: string
  // Per-dungeon stage selections for this config.
  selections: Partial<Record<DungeonId, DungeonStageSelection>>
  // Per-dungeon boost selections (empty object = no boost).
  boosts: Partial<Record<DungeonBoostableId, DungeonBoostSelection>>
  // Dungeons to simulate for this config.
  simulateDungeons: readonly DungeonId[]
}

// Multi-config run payload: shared inputs once, then the list of configs. The worker builds
// one session per config, round-robins `sliceRuns` runs through each, and emits a single
// snapshot covering ALL configs per round so the whole table refines together.
export type DungeonSimulatorWorkerMultiRunPayload = {
  // Fully merged rules (shared across all configs).
  rules: HsfRuleWithRecipe[]
  // Substat thresholds (shared across all configs).
  substatTargets: SubstatTargetTable
  // Simulation mode (shared; note-sim always uses level-up).
  mode?: DungeonSimMode
  // Total runs per dungeon, per config.
  runs: number
  // Runs advanced per config per round-robin round (the slice size).
  sliceRuns: number
  // Throttle duration for progress messages.
  throttleMs: number
  // The configs to simulate, in display order.
  configs: readonly DungeonSimulatorWorkerConfig[]
}

// Multi-config snapshot: results for every config, keyed by config id. Streamed each round
// (progress) and once at the end (done) so the hook can overwrite all 18 columns in place.
export type DungeonSimulatorWorkerMultiProgressPayload = {
  // Per-config spotlight results, keyed by config id.
  resultsByConfig: Record<string, DungeonSimSpotlightResults>
}

// Requests can start a simulation or cancel the active run.
export type DungeonSimulatorWorkerRequest =
  // Start a new simulation run.
  | { id: number; kind: 'simulate'; payload: DungeonSimulatorWorkerRunPayload }
  // Start a multi-config round-robin run (note-sim): all configs advance in lockstep slices.
  | { id: number; kind: 'simulate:multi'; payload: DungeonSimulatorWorkerMultiRunPayload }
  // Cancel the matching run id; preserves cachedSession for a later resume.
  | { id: number; kind: 'cancel' }
  // Resume the most-recently paused session from where it stopped.
  // Only valid when cachedSession is non-null and not yet complete in the worker.
  | { id: number; kind: 'resume'; payload: { batchSize: number; throttleMs?: number } }
  // Query cached detail stats for a slot/main/substat selection.
  | { id: number; kind: 'detail:query'; payload: DungeonSimDetailQuery }
  // Query cached generic substat stats for a slot/main selection.
  | { id: number; kind: 'detail:generic'; payload: DungeonSimGenericQuery }

// Responses stream progress updates or finalize the run.
export type DungeonSimulatorWorkerResponse =
  // Streaming update while the worker is still running.
  | { id: number; kind: 'simulate:progress'; payload: DungeonSimulatorWorkerProgressPayload }
  // Final snapshot once all batches finish.
  | { id: number; kind: 'simulate:done'; payload: DungeonSimulatorWorkerProgressPayload }
  // Multi-config streaming update: all configs' results, refreshed each round-robin round.
  | { id: number; kind: 'simulate:multi:progress'; payload: DungeonSimulatorWorkerMultiProgressPayload }
  // Multi-config final snapshot once every config completes.
  | { id: number; kind: 'simulate:multi:done'; payload: DungeonSimulatorWorkerMultiProgressPayload }
  // Terminal error message if the worker fails.
  | { id: number; kind: 'error'; error: string }
  // Detail query success response.
  | { id: number; kind: 'detail:result'; payload: DungeonSimDetailStats | null }
  // Detail query error response.
  | { id: number; kind: 'detail:error'; error: string }
  // Generic-detail query success response.
  | { id: number; kind: 'detail:generic:result'; payload: DungeonSimGenericStats | null }
  // Generic-detail query error response.
  | { id: number; kind: 'detail:generic:error'; error: string }
