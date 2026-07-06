import type { BuilderRecipe, SellfileExportMode, SubstatTargetTable } from '../lib/hsfBuilder'
import type { Metaset } from '../lib/metasets'
import type { HsfRuleWithRecipe } from '../lib/merge'
import type { HsfFile } from '../lib/hsfTypes'
import type { FinalSellRemainderConfig } from '../lib/logicHub'
import type {
  SafeguardCandidateOut,
  SafeguardDetectionArtifact,
  SafeguardDetectionSnapshot,
  SafeguardRuleCountMode,
  SafeguardsMergeInput,
} from '../lib/safeguards'
import type { NormalizedGearArtifact } from '../lib/importers/gearDbNormalizer'
import type { GearInspectorMatchWorkerItemResult } from './gearInspectorMatchWorkerTypes'
import type { ProgressSnapshot } from '../types/progress'
import type { ImprovementChanceWasmEntry } from '../lib/wasm/wasmRuleEngine'

export type RuleCacheBuilderCountRequest = {
  id: number
  kind: 'builderCount'
  payload: {
    recipes: BuilderRecipe[]
    substatTargets: SubstatTargetTable
  }
}

export type RuleCacheBuilderCountResponse = {
  id: number
  kind: 'builderCount:done'
  payload: {
    counts: number[]
  }
}

export type RuleCachePipelineRequest = {
  id: number
  kind: 'pipeline'
  payload: {
    generation: number
    recipes: BuilderRecipe[]
    metasets: Metaset[]
    substatTargets: SubstatTargetTable
    hsf: HsfFile | null
    finalSellRemainder?: FinalSellRemainderConfig
    safeguards: SafeguardsMergeInput
    // Apply app-wide export-mode transforms before safeguard evaluation/injection.
    omitDisabledBeforeSafeguards: boolean
    dedupeBeforeSafeguards: boolean
    recipeModes: SellfileExportMode[]
    artifacts: NormalizedGearArtifact[]
    emitProgressEvents?: boolean
    // When true, compute improvement-chance percentages for non-maxed artifacts.
    computeImprovementChance: boolean
  }
}

export type RuleCachePipelineResponse = {
  id: number
  kind: 'pipeline:done'
  payload: {
    // Null when rules are unchanged (artifact-only burst) or when the compact index
    // path is used instead. The receiver falls back to its lastRulesRef when both this
    // and rulesByRecipeIndices are null (artifact-only burst).
    rulesByRecipeEntries: Array<[number, HsfRuleWithRecipe[]]> | null
    // Compact alternative to rulesByRecipeEntries: per-recipe integer indices into
    // mergedRules instead of full rule copies. Non-null only when dedupeBeforeSafeguards
    // and omitDisabledBeforeSafeguards are both false — in that case the same rule objects
    // appear in both mergedRules and the per-recipe groups, so structured clone produces
    // one shared copy instead of two independent copies (halves per-pipeline V8 allocation).
    rulesByRecipeIndices: Array<[number, number[]]> | null
    countsByRecipeEntries: Array<[number, number]>
    keys: string[] | null
    substatTargetsKey: string
    mergedRules: HsfRuleWithRecipe[] | null
    // crc32 of the EXACT bytes an HSF export would produce from mergedRules (via the shared
    // computeExportedHsfFingerprint). Sent EVERY pipeline (even when mergedRules is null on
    // the unchanged-rules fast path) so the main thread always has the current export
    // identity for its "export/push needed" dirty check. Compared against the fingerprint
    // captured at the last export — dirty ⟺ the exported file would actually differ.
    mergedRulesHash: string
    truncatedRecipeIndices: number[]
    totalLimitHit: boolean
    excludedByTotalLimitIndices: number[]
    matches: GearInspectorMatchWorkerItemResult[]
    safeguardDetection: SafeguardDetectionSnapshot | null
    // Flat array of improvement-chance entries; null when computeImprovementChance was false.
    // Receiver reconstructs Map<artifactId, entry> to avoid structured-clone Map issues.
    improvementChanceEntries: ImprovementChanceWasmEntry[] | null
    // WASM linear memory size at the end of this pipeline run, in bytes.
    // Logged in DEV mode to spot unexpected WASM heap growth across pipelines.
    wasmLinearBytes: number
  }
}

export type RuleCachePipelineProgressResponse = {
  id: number
  kind: 'pipeline:progress'
  payload: ProgressSnapshot
}

// Safeguard candidate scoring is routed through this worker (instead of a dedicated
// scoring worker) so the rule-engine WASM module is inlined into the bundle only
// once per worker, not once per consumer. Reuses the warmed WASM instance already
// loaded for pipeline work.
export type RuleCacheScoreCandidatesRequest = {
  id: number
  kind: 'scoreCandidates'
  payload: {
    artifacts: SafeguardDetectionArtifact[]
    // StatVariant ids active in the editing rule.
    substats: number[]
    // Per-variant weight multipliers (variant id → weight).
    weights: Record<number, number>
    // Editing rule's "Weight by Rank" toggle so the preview ranking matches detection.
    weightMainStatByRank: boolean
    // Editing rule's tunable main-stat rank factor so the preview scaling matches detection.
    mainStatRankWeightFactor: number
    requiredCount: number
    // Editing rule's count-mode flags. Threaded through so the live preview's
    // isWithinQuota partition matches detection's (perSet/perFaction/perMain/
    // perSlot bucketing with tie extension). Omitting it lets the WASM side
    // resolve the canonical default count mode.
    countMode?: SafeguardRuleCountMode
  }
}

export type RuleCacheScoreCandidatesResponse = {
  id: number
  kind: 'scoreCandidates:done'
  payload: {
    candidates: SafeguardCandidateOut[]
  }
}

export type RuleCacheErrorResponse = {
  id: number
  kind: 'error'
  error: string
}

export type RuleCacheWorkerResponse =
  | RuleCacheBuilderCountResponse
  | RuleCachePipelineResponse
  | RuleCachePipelineProgressResponse
  | RuleCacheScoreCandidatesResponse
  | RuleCacheErrorResponse

// One-time initialization message sent from the main thread immediately after spawning
// the worker. The worker awaits this before processing any pipeline message so the WASM
// bytes only live in the main bundle — not duplicated in the worker IIFE.
export type RuleCacheWorkerInitWasmRequest = {
  kind: 'init-wasm'
  wasmModule: WebAssembly.Module
  // Dev-only: the active packet-capture session id (null when capture is off). When set,
  // the worker tees its console output into <session>/console.log so worker diagnostics
  // (e.g. [detect-io]/[detect-keys]) land in the same capture folder as the frames.
  captureSessionId?: string | null
}

export type RuleCacheWorkerRequest =
  | RuleCacheWorkerInitWasmRequest
  | RuleCacheBuilderCountRequest
  | RuleCachePipelineRequest
  | RuleCacheScoreCandidatesRequest
