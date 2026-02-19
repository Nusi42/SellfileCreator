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

// Requests can start a simulation or cancel the active run.
export type DungeonSimulatorWorkerRequest =
  // Start a new simulation run.
  | { id: number; kind: 'simulate'; payload: DungeonSimulatorWorkerRunPayload }
  // Cancel the matching run id.
  | { id: number; kind: 'cancel' }
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
